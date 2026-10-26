import { MODULES, getModule } from './modules.js';
import { validateModuleConfig } from './validation.js';
import { LOCAL_DOCS, LOCAL_SKILLS, MEMORY_ENTRIES, MCP_CAPABILITIES } from './catalog.js';
import { chunkDocuments } from '../../laboratory/knowledge/chunking.js';
import { retrieve } from '../../laboratory/knowledge/retrieval.js';

export const CONNECTION_TYPES=Object.freeze({'provides-context':{source:['model','context','retrieval','memory'],target:['context','model']},'tool-access':{source:['model','mcp'],target:['tools']},'applies-policy':{source:['guardrails','instructions','skills'],target:['model','runtime','tools']}});
const active=(c,id)=>(Array.isArray(c?.modules)?c.modules:[]).find(m=>m?.moduleId===id&&m.enabled===true);
export function derivedConnections(c) {
  const edges=[];
  for(const m of Array.isArray(c?.modules)?c.modules:[]) {
    if(!m?.enabled)continue;
    if(getModule(m.moduleId)?.systemRelation==='tool-access') {
      const model=active(c,'model');
      edges.push({id:`tool-access:${m.instanceId}`,sourceInstanceId:model?.instanceId||null,targetInstanceId:m.instanceId,sourceModuleId:'model',targetModuleId:m.moduleId,type:'tool-access',derived:true,valid:!!model,enabled:!!model});
    }
    for(const id of getModule(m.moduleId)?.dependencies||[]) {
      const dep=active(c,id);
      edges.push({id:`dependency:${m.instanceId}:${id}`,sourceInstanceId:dep?.instanceId||null,targetInstanceId:m.instanceId,sourceModuleId:id,targetModuleId:m.moduleId,type:'dependency',derived:true,valid:!!dep,enabled:!!dep});
    }
  }
  return edges;
}
export function preflight(c,{dirty=false}={}) {
  const issues=[]; const modules=Array.isArray(c?.modules)?c.modules:[];
  const add=(code,level,moduleId,field,description,suggestion='打开对应模块检查并修复')=>issues.push({id:`${code}:${moduleId||'configuration'}:${field||''}`,code,level,moduleId:moduleId||null,field:field||null,title:description,description,suggestion});
  for(const key of ['modules','connections'])if(!Array.isArray(c?.[key]))add('INVALID_CONTAINER','error',null,key,`${key} 必须是数组`);
  if(!c?.settings||typeof c.settings!=='object'||Array.isArray(c.settings))add('INVALID_CONTAINER','error',null,'settings','settings 必须是对象');
  if(!c||c.schemaVersion!==2)add('SCHEMA_VERSION','error',null,'schemaVersion','配置版本不是当前 v2','使用兼容迁移或保留原始数据');
  for(const key of ['configId','name','createdAt','updatedAt'])if(typeof c?.[key]!=='string'||!c[key].trim()||c[key].length>(key==='name'?80:160))add('INVALID_VALUE','error',null,key,`${key} 缺失或超出限制`);
  for(const key of ['createdAt','updatedAt'])if(typeof c?.[key]==='string'&&(!Number.isFinite(Date.parse(c[key]))||new Date(c[key]).toISOString()!==c[key]))add('INVALID_VALUE','error',null,key,`${key} 必须是 UTC ISO 时间`);
  if(c?.description!==undefined&&(typeof c.description!=='string'||c.description.length>2000))add('INVALID_VALUE','error',null,'description','说明必须为 2000 字符以内文本');
  const knownRoot=['schemaVersion','configId','name','description','createdAt','updatedAt','modules','connections','settings','compatibility'];
  for(const key of Object.keys(c||{}))if(!knownRoot.includes(key))add('UNKNOWN_FIELD','warning',null,key,`保留的未知字段：${key}`,'保留原始配置或在兼容版本打开');
  if(c?.compatibility?.migratedFrom!==undefined)add('MIGRATED_SCHEMA','info',null,'schemaVersion',`已从 v${c.compatibility.migratedFrom} 非破坏性迁移；旧存储仍保留`,'检查后另行保存 v2 配置');
  if(modules.length>32)add('MODULE_LIMIT','error',null,'modules','模块数量超过 32 个上限');
  const seen=new Set(),instanceIds=new Set();
  const runtime=c?.settings||{};
  for(const m of modules) {
    if(!m||typeof m!=='object'){add('INVALID_MODULE','error',null,'modules','模块记录不是对象');continue;}
    const mod=getModule(m.moduleId);
    if(typeof m.instanceId!=='string'||!m.instanceId||instanceIds.has(m.instanceId))add('DUPLICATE_ID','error',m.moduleId,'instanceId','实例 ID 缺失或重复');
    instanceIds.add(m.instanceId);
    if(!mod){add('UNKNOWN_MODULE',m.enabled?'error':'warning',m.moduleId,'moduleId',`未知模块 ${String(m.moduleId)} 已保留`,'禁用后保留数据，或在支持此模块的版本打开');continue;}
    if(seen.has(m.moduleId))add('DUPLICATE_MODULE','error',m.moduleId,'moduleId',`${mod.cn} 不允许重复安装`);
    seen.add(m.moduleId);
    if(m.moduleType!==mod.moduleType||m.portId!==mod.portId||typeof m.enabled!=='boolean'||!Number.isInteger(m.order)||m.order<0)add('INVALID_MODULE','error',m.moduleId,'moduleId','模块类型、端口、顺序或启用状态无效');
    const settings=m.moduleId==='runtime'?runtime:m.settings;
    for(const e of validateModuleConfig(m.moduleId,settings,m.permissions).errors) {
      if(!m.enabled&&e.code==='PERMISSION_REQUIRED')continue;
      add(e.code,'error',m.moduleId,e.field,e.message,e.fix);
    }
    for(const key of Object.keys(m))if(!['instanceId','moduleId','moduleType','portId','enabled','order','settings','permissions'].includes(key))add('UNKNOWN_FIELD','warning',m.moduleId,key,`保留的未知实例字段：${key}`);
    for(const key of Object.keys(m.settings||{}))if(!mod.fields.some(f=>f.key===key))add('UNKNOWN_FIELD','warning',m.moduleId,key,`保留的未知配置字段：${key}`);
    if(!m.enabled){add('MODULE_DISABLED','info',m.moduleId,'enabled',`${mod.cn} 已禁用，不参与依赖与运行`,'重新启用后再次预检');continue;}
    for(const dep of mod.dependencies||[])if(!active(c,dep))add('MISSING_DEPENDENCY','error',m.moduleId,dep,`${mod.cn} 缺少已启用的 ${MODULES[dep].cn}` ,`安装并启用 ${MODULES[dep].cn}`);
    if(m.moduleType==='tools') {
      const guard=active(c,'guardrails');
      if(guard?.settings?.[m.settings?.resourceScope==='private'?'allowPrivateRecords':'allowPublicRead']===false)add('PERMISSION_DENIED','error',m.moduleId,'resourceScope','工具访问被 Guardrails 权限策略拒绝','调整访问范围或权限策略');
      if(m.settings?.resourceScope==='private'&&runtime.requireApprovalForRestrictedActions!==true)add('APPROVAL_REQUIRED','error',m.moduleId,'resourceScope','私有记录操作必须配置审批','在 Runtime 开启受限操作审批');
      if(m.settings?.connectionMode==='mcp') {
        const mcp=active(c,'mcp');
        if(!mcp)add('MCP_DISABLED','error',m.moduleId,'connectionMode','MCP 路径需要已启用的 MCP 模拟模块','启用 MCP，或改为直连');
        else if(!Array.isArray(mcp.settings?.capabilityIds)||!mcp.settings.capabilityIds.includes(m.moduleId))add('MCP_CAPABILITY_MISSING','error',m.moduleId,'connectionMode','所选 MCP 目录未声明该工具','在 MCP 目录选择对应能力');
      }
    }
  }
  for(const f of MODULES.runtime.fields)for(const e of validateModuleConfig('runtime',runtime,{}).errors.filter(e=>e.field===f.key))add(e.code,'error','runtime',e.field,e.message,e.fix);
  for(const key of Object.keys(runtime))if(!MODULES.runtime.fields.some(f=>f.key===key))add('UNKNOWN_FIELD','warning',null,key,`保留的未知运行设置：${key}`);
  for(const id of ['model','instructions','runtime'])if(!active(c,id))add('REQUIRED_MODULE','error',id,'enabled',`最低运行条件缺少 ${MODULES[id].cn}`,`安装并启用 ${MODULES[id].cn}`);
  const refs=[['context','sourceIds',LOCAL_DOCS.map(d=>d.docId)],['retrieval','sourceIds',LOCAL_DOCS.map(d=>d.docId)],['skills','skillIds',LOCAL_SKILLS.map(s=>s.id)],['memory','entryIds',MEMORY_ENTRIES.map(e=>e.id)],['mcp','capabilityIds',MCP_CAPABILITIES.map(c=>c.id)]];
  for(const [id,key,ids] of refs) {
    const m=active(c,id);if(!m)continue;
    for(const value of Array.isArray(m.settings?.[key])?m.settings[key]:[])if(!ids.includes(value))add('UNKNOWN_REFERENCE','error',id,key,`不存在的本地引用：${String(value)}`,'取消不存在的引用，重新选择本地目录');
  }
  const retrieval=active(c,'retrieval'),ctx=active(c,'context'),guard=active(c,'guardrails'),memory=active(c,'memory');
  if(retrieval&&(!Array.isArray(retrieval.settings?.sourceIds)||!retrieval.settings.sourceIds.some(id=>LOCAL_DOCS.some(d=>d.docId===id))))add('NO_SOURCES','error','retrieval','sourceIds','检索没有可用的本地资料源','至少选择一份本地公告');
  if(ctx?.settings?.includeRetrieval&&!retrieval)add('MISSING_DEPENDENCY','error','context','includeRetrieval','上下文要求检索证据，但 Retrieval 未启用','安装并启用 Retrieval 或关闭此选项');
  if(ctx?.settings?.mode==='task-only'&&ctx.settings.includeRetrieval)add('CONTEXT_CONFLICT','error','context','mode','仅任务模式与包含检索证据冲突','改为任务与证据模式，或关闭检索证据');
  if(ctx&&active(c,'model')&&ctx.settings?.budget>active(c,'model').settings?.contextBudget)add('BUDGET_CONFLICT','error','context','budget','上下文预算超过 Model 教学预算','减小 Context 预算或增大 Model 预算');
  if(guard?.settings?.allowPrivateRecords&&runtime.requireApprovalForRestrictedActions!==true)add('APPROVAL_REQUIRED','error','guardrails','requireApprovalForRestrictedActions','允许私有记录访问时必须启用受限操作审批','开启受限操作审批');
  if(guard?.settings?.blockUntrustedOverrides===false)add('UNTRUSTED_OVERRIDE','warning','guardrails','blockUntrustedOverrides','未启用不可信指令覆盖阻止','建议启用；这不是完整安全认证');
  if(guard?.settings?.requireEvidence===false)add('EVIDENCE_OPTIONAL','warning','guardrails','requireEvidence','未要求结论必须附证据','建议启用证据要求');
  if(!guard)add('NO_GUARDRAILS','warning','guardrails','enabled','未启用 Guardrails；旧版工具实验仍依显式只读授权','建议安装 Guardrails 以配置更细的约束');
  if(memory?.settings?.mode==='disabled'&&memory.settings.entryIds?.length)add('MEMORY_DISABLED','warning','memory','mode','记忆模式关闭，所选条目不会复用','切换到 session 或清空选择');
  const seenEdges=new Set();const explicitConnections=[];
  for(const e of Array.isArray(c?.connections)?c.connections:[]) {
    if(!e||typeof e!=='object'){add('INVALID_CONNECTION','error',null,'connections','显式连接不是有效对象','移除损坏的连接');continue;}
    const source=modules.find(m=>m?.instanceId===e.sourceInstanceId),target=modules.find(m=>m?.instanceId===e.targetInstanceId),type=Object.hasOwn(CONNECTION_TYPES,e.type)?CONNECTION_TYPES[e.type]:null;
    let valid=false;
    if(!e.id||seenEdges.has(e.id)||!source||!target||!type||!type.source.includes(source.moduleType)||!type.target.includes(target.moduleType)||source===target||typeof e.enabled!=='boolean')add('INVALID_CONNECTION','error',target?.moduleId,'connections',`显式连接 ${String(e.id)} 引用或语义无效`,'删除无效连线，使用已声明的关系');
    else if(e.enabled&&(!source.enabled||!target.enabled))add('DISABLED_CONNECTION','error',target.moduleId,'connections','显式连接仍引用已禁用模块','停用连接或重新启用模块');
    else valid=e.enabled;
    explicitConnections.push({...e,valid,derived:false});
    seenEdges.add(e.id);
  }
  if(dirty)add('UNSAVED_CHANGES','warning',null,'name','当前草稿有未保存修改','保存为本地配置');
  add('SIMULATION_ONLY','info',null,null,'SIMULATION / 本地模拟，不连接真实 AI','高级执行将在 M2.2 启用');
  const unique=[...new Map(issues.map(i=>[i.id,i])).values()].sort((a,b)=>({error:0,warning:1,info:2}[a.level]-{error:0,warning:1,info:2}[b.level]||a.id.localeCompare(b.id,'en')));
  const counts={error:unique.filter(i=>i.level==='error').length,warning:unique.filter(i=>i.level==='warning').length,info:unique.filter(i=>i.level==='info').length};
  return {ready:counts.error===0,counts,issues:unique,summary:{name:c?.name,schemaVersion:c?.schemaVersion,moduleCount:modules.length,enabledCount:modules.filter(m=>m?.enabled===true).length,settings:{...runtime},modules:modules.map(m=>({moduleId:m?.moduleId,enabled:m?.enabled,settings:m?.moduleId==='runtime'?{...runtime}:m?.settings,permissions:m?.permissions}))},connections:derivedConnections(c),explicitConnections};
}

/** Retrieval preview reuses the exact Knowledge Lab functions; no second algorithm. */
export function previewRetrieval(c) {
  const m=active(c,'retrieval');if(!m)return null;
  const s=m.settings;if(!s||!Array.isArray(s.sourceIds)||!validateModuleConfig('retrieval',s,{}).ok)return null;
  const chunking=chunkDocuments({preset:s.chunkPreset,size:s.chunkSize,scopeDocs:LOCAL_DOCS.filter(d=>s.sourceIds.includes(d.docId))});
  return {chunking,retrieval:retrieve({chunks:chunking.chunks,questionId:s.questionId,mode:s.mode,topK:s.topK})};
}
