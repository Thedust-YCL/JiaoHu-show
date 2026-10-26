/** One writable configuration (state minus ui), plus independent named snapshots. */
import { CONSTRUCTOR_STORAGE_KEY, SCHEMA_VERSION, createInitialUi, reduce } from './reducer.js';
import { readRepository, writeRepository, backupRepository, serializeConfig } from './persistence.js';
import { deriveStatus, portOccupant } from '../model/validation.js';
import { getModule, getPort } from '../model/modules.js';
import { cloneConfiguration, createExample, configurationFingerprint, serializeAgentConfiguration } from '../model/configuration.js';
import { preflight } from '../model/preflight.js';
export { CONSTRUCTOR_STORAGE_KEY, SCHEMA_VERSION };

export function createConstructorStore({storage=null,key=CONSTRUCTOR_STORAGE_KEY,onLog=null}={}) {
  let repository=readRepository(storage,key);
  let state={...repository.draft,ui:{...createInitialUi(),notice:repository.notice}};
  const listeners=new Set();let writeFailed=false;
  let validationCache=null;
  const configurationValidation=()=>validationCache||(validationCache=preflight(getConfiguration()));
  const getState=()=>state;
  const getConfiguration=()=>serializeConfig(state);
  const subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
  const emit=(action,prev)=>{for(const fn of [...listeners])fn(state,{action,prev});};
  function feedback(ok,code,message,level=ok?'success':'error') {
    const prev=state;state={...state,ui:{...state.ui,notice:{level,code,message},revision:state.ui.revision+1}};
    emit({type:`configuration/${code}`},prev);return {ok,notice:state.ui.notice};
  }
  function persist(candidate=repository) {
    if(repository.blocked)return false;
    const ok=writeRepository(storage,key,{...candidate,draft:getConfiguration()});writeFailed=!ok;
    if(!ok)onLog?.('配置','本地写入失败，草稿仍在本次会话，请释放空间后重试','attention');
    return ok;
  }
  function isDirty() {
    const saved=repository.configurations.find(c=>c.configId===state.configId);
    return !saved||configurationFingerprint(saved)!==configurationFingerprint(getConfiguration());
  }
  function dispatch(action) {
    const prev=state;let next;
    try {next=reduce(state,action);}catch(error){return feedback(false,'ACTION_ERROR',`操作失败：${error.message}`);}
    if(next===prev)return {ok:false,rejected:true,notice:state.ui.notice};
    const changed=next.modules!==prev.modules||next.settings!==prev.settings||next.name!==prev.name||next.configId!==prev.configId;
    if(changed)next={...next,updatedAt:new Date().toISOString()};
    state=next;
    if(changed)validationCache=null;
    if(changed&&!persist()&&!repository.blocked)state={...state,ui:{...state.ui,notice:{level:'attention',code:'STORAGE_WRITE_FAILED',message:'修改已保留在会话；本地写入失败，刷新可能丢失，请重试保存'}}};
    emit(action,prev);
    return {ok:state.ui.notice?.level!=='error',notice:state.ui.notice};
  }
  const getInstalled=id=>state.modules.find(m=>m?.moduleId===id)||null;
  function statusOf(id) {
    const m=getInstalled(id);if(!m)return state.ui.preview?.moduleId===id?'Preview':'Available';
    const base=deriveStatus(m,state);if(base==='Disabled'||base==='Invalid')return base;
    const problems=configurationValidation().issues.filter(i=>i.moduleId===id&&i.level==='error');
    if(problems.length)return problems.every(i=>['PERMISSION_REQUIRED','MISSING'].includes(i.code))?'Unconfigured':'Invalid';
    return base;
  }
  const occupantOf=id=>portOccupant(state.modules,id);
  function hydrate(configuration,confirmed=false) {
    if(isDirty()&&!confirmed)return feedback(false,'UNSAVED_CONFIRM','当前草稿有未保存修改，请先保存或确认切换');
    return dispatch({type:'config/hydrate',configuration:serializeAgentConfiguration(configuration),notice:{level:'success',code:'CONFIG_LOADED',message:'配置已加载；草稿自动恢复与具名保存相互独立'}});
  }
  const actions={
    editSnapshot:(configuration,confirmed=false)=>hydrate(cloneConfiguration(configuration),confirmed),
    preview:moduleId=>dispatch({type:'assembly/preview',moduleId}),cancel:()=>dispatch({type:'assembly/cancel'}),
    commit:(moduleId,portId)=>dispatch({type:'assembly/commit',moduleId,portId}),
    configure:(moduleId,patch)=>dispatch({type:'module/configure',moduleId,patch}),
    setEnabled:(moduleId,enabled)=>dispatch({type:'module/toggle',moduleId,enabled}),
    remove:moduleId=>dispatch({type:'module/remove',moduleId}),select:moduleId=>dispatch({type:'select',moduleId}),
    dragStart:moduleId=>dispatch({type:'drag/start',moduleId}),dragTarget:(portId,valid,message)=>dispatch({type:'drag/target',portId,valid,message}),
    dragEnd:(commit,portId)=>dispatch({type:'drag/end',commit,portId}),clearNotice:()=>dispatch({type:'notice/clear'}),
    reset:()=>dispatch({type:'module/reset'}),
    useExample:(kind,confirmed=false)=>hydrate(createExample(kind),confirmed),
    rename:name=>dispatch({type:'config/rename',name}),
    load:(id,confirmed=false)=>{
      const c=repository.configurations.find(c=>c.configId===id);
      return c?hydrate(c,confirmed):feedback(false,'NOT_FOUND','找不到此本地配置');
    },
    save:(confirmed=false)=>{
      if(repository.blocked)return feedback(false,'STORAGE_LOCKED','原始存储已锁定，请先备份并恢复存储');
      const c=getConfiguration();const result=preflight(c);
      if(!result.ready)return feedback(false,'PREFLIGHT_FAILED',`配置有 ${result.counts.error} 项错误，请先打开预检修复；草稿仍保留`);
      const existing=repository.configurations.find(x=>x.configId===c.configId);
      if(existing&&isDirty()&&!confirmed)return feedback(false,'OVERWRITE_CONFIRM','将覆盖同名配置快照，请确认保存');
      const configurations=repository.configurations.filter(x=>x.configId!==c.configId);
      if(configurations.length>=20)return feedback(false,'CONFIG_LIMIT','最多保存 20 套配置，请先删除不需要的配置');
      const candidate={...repository,configurations:[...configurations,c]};
      if(!persist(candidate))return feedback(false,'STORAGE_WRITE_FAILED','保存失败，原快照未改变；草稿仍在会话中');
      repository=candidate;return feedback(true,'SAVED','配置已保存到当前浏览器');
    },
    copy:()=>{const c=cloneConfiguration(getConfiguration());return hydrate(c,true);},
    delete:(id,confirmed=false)=>{
      if(!confirmed)return feedback(false,'DELETE_CONFIRM','删除配置需要二次确认；历史研究记录不受影响');
      if(!repository.configurations.some(c=>c.configId===id))return feedback(false,'NOT_FOUND','找不到此本地配置');
      const candidate={...repository,configurations:repository.configurations.filter(c=>c.configId!==id)};
      if(!persist(candidate))return feedback(false,'STORAGE_WRITE_FAILED','删除未保存，原配置仍保留');
      repository=candidate;return feedback(true,'DELETED','本地快照已删除，当前草稿和历史研究记录保留');
    },
    recoverStorage:(confirmed=false)=>{
      if(!confirmed)return feedback(false,'RECOVERY_CONFIRM','恢复前需要确认，原数据将备份到独立恢复键');
      if(!backupRepository(storage,key,repository.raw||JSON.stringify(repository.quarantined)))return feedback(false,'BACKUP_FAILED','备份失败，原存储继续锁定，请先下载原数据');
      const candidate={...repository,blocked:false,raw:null};
      if(!writeRepository(storage,key,{...candidate,draft:getConfiguration()}))return feedback(false,'STORAGE_WRITE_FAILED','恢复写入失败，原数据继续保留并锁定');
      repository=candidate;writeFailed=false;return feedback(true,'STORAGE_RECOVERED','已备份原数据并恢复构建器存储；隔离条目仍保留');
    },
  };
  if(repository.migrationSource&&!repository.blocked&&!persist())state={...state,ui:{...state.ui,notice:{level:'attention',code:'STORAGE_WRITE_FAILED',message:'旧配置已在会话中迁移，但 v2 草稿写入失败，请重试保存；旧键完整保留'}}};
  return {getState,getConfiguration,subscribe,dispatch,actions,getInstalled,statusOf,occupantOf,isPortFree:id=>!occupantOf(id),isDirty,
    preflight:()=>preflight(getConfiguration(),{dirty:isDirty()}),
    listConfigurations:()=>repository.configurations.map(c=>({configId:c.configId,name:c.name,updatedAt:c.updatedAt,moduleCount:c.modules.length})),
    getSavedConfiguration:id=>{const c=repository.configurations.find(c=>c.configId===id);return c?serializeAgentConfiguration(c):null;},
    storageStatus:()=>({blocked:repository.blocked,writeFailed,quarantined:repository.quarantined.length,raw:repository.raw||JSON.stringify(repository.quarantined)}),
    describe:id=>{const module=getModule(id);if(!module)return null;return {module,port:getPort(module.portId),installed:getInstalled(id),status:statusOf(id),preview:state.ui.preview?.moduleId===id?state.ui.preview:null,occupiedBy:occupantOf(module.portId)?.moduleId||null};},
    readPersisted:()=>({...readRepository(storage,key).draft}),
  };
}
