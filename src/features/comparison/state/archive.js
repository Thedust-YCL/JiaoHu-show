// @ts-check
/** Owns embedded immutable Runs. Never writes constructor, Journal, or Runtime history. */
import {serializeAgentConfiguration} from '../../constructor/model/configuration.js';
import {canonicalize,deepClone,deepFreeze} from '../../../simulation/events/serializer.js';
import {restoreRuntime} from '../../../simulation/engine/runtime.js';
import {COMPARISON_VERSION,reproducibility} from '../model/experiment.js';
import {compareRuns} from '../model/metrics.js';
import {alignEvents} from '../model/trace.js';
import {runtimeReport} from '../model/report.js';

export const ARCHIVE_DB='agent-zero:experiments:v1';
export const ARCHIVE_LIMITS={rows:12,bytes:20*1024*1024,rowBytes:3*1024*1024};
const byteLength=v=>new TextEncoder().encode(JSON.stringify(v)).length;

function indexedBackend(indexedDB){
  let opened=null;
  const open=()=>opened||(opened=new Promise((resolve,reject)=>{
    if(!indexedDB){reject(Error('IndexedDB 不可用；实验仍在本次会话，可导出 Markdown'));return;}
    const req=indexedDB.open(ARCHIVE_DB,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('experiments'))req.result.createObjectStore('experiments',{keyPath:'experimentId'});};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('实验数据库被旧窗口占用，请关闭旧窗口后重试'));
  }));
  return {
    async list(){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('experiments','readonly'),req=tx.objectStore('experiments').getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});},
    async transact(fn){const db=await open();return new Promise((resolve,reject)=>{
      const tx=db.transaction('experiments','readwrite'),store=tx.objectStore('experiments'),req=store.getAll();let result;
      req.onsuccess=()=>{try{const change=fn(req.result);if(change.put)store.put(change.put);if(change.delete)store.delete(change.delete);result=change.result;}catch(error){reject(error);tx.abort();}};
      tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('存档事务取消'));
    })}
  };
}
export function validateExperiment(e){
  if(e?.schemaVersion!==1||typeof e.experimentId!=='string'||!e.experimentId||typeof e.title!=='string'||e.title.length>80||!e.controls||!e.A||!e.B)throw Error('实验版本或必要字段损坏，原记录保留');
  for(const key of ['createdAt','updatedAt'])if(typeof e[key]!=='string'||!Number.isFinite(Date.parse(e[key])))throw Error('实验时间字段损坏');
  if(!e.comparison||!Array.isArray(e.comparison.metrics)||!Array.isArray(e.comparison.warnings)||!Array.isArray(e.alignment))throw Error('比较结果或对齐记录缺失');
  if(!['approve-all','reject-all'].includes(e.controls.approvalPolicyId)||e.comparison.approvalPolicyId!==e.controls.approvalPolicyId)throw Error('审批策略未记录或与比较记录不一致');
  if(byteLength(e)>ARCHIVE_LIMITS.rowBytes)throw Error('单条实验超过 3 MiB，请导出或减少事件');
  for(const side of ['A','B']){
    const s=e[side];serializeAgentConfiguration(s.configSnapshot);
    if(!s.preflight||!Array.isArray(s.approvalInputs))throw Error(`${side} 预检或审批输入缺失`);
    if(!s.run)continue;
    for(const [control,field] of [['taskId','missionId'],['datasetVersion','corpusVersion'],['missionVersion','missionVersion'],['scenarioId','scenarioId'],['seed','seed']])if(s.run[field]!==e.controls[control])throw Error(`${side} ${control} 与运行控制条件不一致`);
    if(s.run.options?.collaboration!==e.controls.collaboration)throw Error('角色协作条件与运行不一致');
    if(s.run.engineVersion!==e.controls.engineVersion)throw Error('引擎版本与配对条件不一致');
    if(canonicalize(s.configSnapshot)!==canonicalize(s.run.configSnapshot))throw Error(`${side} 配置快照与 Run 不一致`);
    if(!Array.isArray(s.run.events)||s.run.events.length>1000||!Array.isArray(s.run.steps)||s.run.events.some((x,i)=>x.sequence!==i||typeof x.eventId!=='string'||x.runId!==s.run.runId))throw Error(`${side} 运行事件结构损坏`);
    if(!s.report||!Array.isArray(s.report.claims)||!Array.isArray(s.report.citations))throw Error(`${side} 已保存报告缺失`);
    const requests=s.run.events.filter(x=>x.type==='permission.requested');
    if(requests.length!==s.approvalInputs.length||s.approvalInputs.some((input,i)=>input.requestEventId!==requests[i].eventId||input.policyId!==e.controls.approvalPolicyId||input.decision!==(e.controls.approvalPolicyId==='approve-all'?'approve':'reject')))throw Error(`${side} 审批输入与脚本或请求事件不一致`);
    // Missing dataset versions remain browsable; never replay against a substituted corpus.
    if(reproducibility(e).exact&&e.comparisonAlgorithmVersion===COMPARISON_VERSION){restoreRuntime(s.run,{pauseRunning:false});if(canonicalize(s.report)!==canonicalize(runtimeReport(s.run).report))throw Error('已保存报告与运行证据不一致');}
  }
  if(reproducibility(e).exact&&(canonicalize(e.comparison)!==canonicalize(compareRuns(e.A.run,e.B.run,{approvalPolicyId:e.controls.approvalPolicyId}))||canonicalize(e.alignment)!==canonicalize(alignEvents(e.A.run,e.B.run))))throw Error('比较指标或事件对齐缓存不一致');
  return e;
}
export function createArchive({backend=null,indexedDB=globalThis.indexedDB,maxRows=ARCHIVE_LIMITS.rows,maxBytes=ARCHIVE_LIMITS.bytes}={}){
  const db=backend||indexedBackend(indexedDB);
  async function list(){
    try{
      const rows=await db.list(),experiments=[],corrupt=[];
      for(const row of rows)try{validateExperiment(row);experiments.push(deepFreeze(deepClone(row)));}catch(error){corrupt.push({experimentId:row?.experimentId,reason:error.message});}
      return {experiments:experiments.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),corrupt,available:true,notice:corrupt.length?'损坏或未知版本条目已保留，可单独删除；其余实验仍可查看。':null};
    }catch(error){return {experiments:[],corrupt:[],available:false,notice:`无法读取本地实验：${error.message}`};}
  }
  async function save(e){
    try{
      validateExperiment(e);
      return await db.transact(rows=>{
        const rest=rows.filter(r=>r.experimentId!==e.experimentId);
        if(rest.length>=maxRows||rest.reduce((n,r)=>n+byteLength(r),0)+byteLength(e)>maxBytes)throw Error(`实验容量已满（最多 ${maxRows} 条 / 20 MiB）；请明确删除不需要的实验后重试，不会自动淘汰`);
        return {put:deepClone(e),result:{ok:true,notice:'已保存到当前浏览器的独立实验档案'}};
      });
    }catch(error){return {ok:false,notice:`未保存：${error.message}。原始档案不变，可导出当前对比。`};}
  }
  return {list,save,
    async rename(id,title){const read=await list(),e=read.experiments.find(x=>x.experimentId===id);if(!e)return {ok:false,notice:'找不到可重命名的实验'};const name=String(title).trim();if(!name||name.length>80)return {ok:false,notice:'名称必须为 1–80 字符'};return save({...e,title:name,updatedAt:new Date().toISOString()});},
    async remove(id){try{if(typeof id!=='string'||!id)throw Error('没有明确选中的记录');return await db.transact(()=>({delete:id,result:{ok:true,notice:'已删除这一条实验；配置、学习记录与独立运行历史保留'}}));}catch(error){return {ok:false,notice:`未删除：${error.message}`};}},
  };
}
