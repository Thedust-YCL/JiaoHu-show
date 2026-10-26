// @ts-check
import {serializeAgentConfiguration,cloneConfiguration,newId} from '../../constructor/model/configuration.js';
import {preflight} from '../../constructor/model/preflight.js';
import {createRuntime,isRuntimeTerminal,RUNTIME_ENGINE_VERSION,SUPPORTED_RUNTIME_ENGINES} from '../../../simulation/engine/runtime.js';
import {runtimeScenario} from '../../../simulation/engine/runtimeScenarios.js';
import {canonicalize,deepClone,deepFreeze} from '../../../simulation/events/serializer.js';
import {runtimeReport,currentDataset} from './report.js';
import {compareRuns} from './metrics.js';
import {alignEvents} from './trace.js';

export const COMPARISON_VERSION='m23.1';
export const APPROVAL_POLICIES=Object.freeze({'approve-all':'每侧每次请求均明确批准（仅模拟）','reject-all':'每侧每次请求均明确拒绝（仅模拟）'});
/** @param {{A?:import('../../constructor/model/types.js').AgentConfiguration;B?:import('../../constructor/model/types.js').AgentConfiguration;controls?:Partial<import('./types.js').PairControls>;title?:string}} input */
export function createExperiment({A,B,controls={},title='公告研究 A/B 实验'}={}){
  const conditions={...currentDataset(),engineVersion:RUNTIME_ENGINE_VERSION,scenarioId:'NORMAL_PATH',seed:'0',approvalPolicyId:'approve-all',collaboration:'single',...controls};
  runtimeScenario(conditions.scenarioId);
  if(!Object.hasOwn(APPROVAL_POLICIES,conditions.approvalPolicyId))throw Error('必须选择可复现的审批脚本');
  if(!['single','sequential'].includes(conditions.collaboration))throw Error('角色条件无效');
  if(!['string','number'].includes(typeof conditions.seed)||String(conditions.seed).length>80)throw Error('种子必须为 80 字符以内文本');
  conditions.seed=String(conditions.seed);
  const side=c=>({configSnapshot:serializeAgentConfiguration(c),preflight:preflight(c),run:null,report:null,approvalInputs:[]});
  return deepFreeze({schemaVersion:1,comparisonAlgorithmVersion:COMPARISON_VERSION,experimentId:newId('experiment'),title:String(title).trim().slice(0,80)||'未命名实验',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),simulationOnly:true,controls:conditions,A:side(A),B:side(B),comparison:null,alignment:[]});
}
export function reproducibility(experiment){
  const current=currentDataset(),reasons=[];
  for(const key of Object.keys(current))if(experiment.controls[key]!==current[key])reasons.push(`${key} 版本不可用`);
  if(experiment.comparisonAlgorithmVersion!==COMPARISON_VERSION)reasons.push('比较算法版本不可用');
  if(!SUPPORTED_RUNTIME_ENGINES.includes(experiment.controls.engineVersion))reasons.push('引擎版本不可用');
  for(const side of ['A','B'])if(experiment[side].run&&!SUPPORTED_RUNTIME_ENGINES.includes(experiment[side].run.engineVersion))reasons.push(`${side} 引擎版本不可用`);
  return {exact:reasons.length===0,reasons};
}
export function runExperiment(draft){
  if(!reproducibility(draft).exact)throw Error('资料或算法版本不可用，不能按原条件精确复现');
  const e=deepClone(draft);
  for(const side of ['A','B']){
    const snapshot=e[side].configSnapshot,check=preflight(snapshot);
    e[side].preflight=check;
    if(!check.ready)continue;
    const rt=createRuntime(snapshot,{scenarioId:e.controls.scenarioId,seed:e.controls.seed,collaboration:e.controls.collaboration,engineVersion:e.controls.engineVersion});
    const inputs=[];
    for(let n=0;n<200;n++){
      const run=rt.getRun();if(isRuntimeTerminal(run.status))break;
      if(run.status==='waiting_approval'){
        const decision=e.controls.approvalPolicyId==='approve-all'?'approve':'reject';
        inputs.push({requestEventId:run.events.at(-1).eventId,stepId:run.pendingApproval.stepId,toolId:run.pendingApproval.toolId,decision,policyId:e.controls.approvalPolicyId});rt[decision]();
      }else if(!rt.step())throw Error('Runtime 无法继续；未伪造终态');
    }
    const run=rt.getRun();if(!isRuntimeTerminal(run.status))throw Error('Runtime 未在有界步数中终止');
    e[side]={...e[side],run,report:runtimeReport(run).report,approvalInputs:inputs};
  }
  e.comparison=compareRuns(e.A.run,e.B.run,{approvalPolicyId:e.controls.approvalPolicyId});e.alignment=alignEvents(e.A.run,e.B.run);e.updatedAt=new Date().toISOString();
  return deepFreeze(e);
}
export function copyExperiment(input){const e=deepClone(input);e.experimentId=newId('experiment');e.parentExperimentId=input.experimentId;e.title=`${e.title} · 副本`.slice(0,80);e.createdAt=e.updatedAt=new Date().toISOString();return deepFreeze(e);}
export function rerunExperiment(input){if(!reproducibility(input).exact)throw Error('版本不可用，无法精确复现');const e=createExperiment({A:input.A.configSnapshot,B:input.B.configSnapshot,controls:input.controls,title:`${input.title} · 重跑`});return runExperiment({...e,parentExperimentId:input.experimentId});}
export const copyVariant=A=>cloneConfiguration(A);
/** Semantic differences omit identities/dates/names, but include all actual settings. */
export function configurationDiff(A,B){
  function flatten(c){
    const rows={},walk=(v,p)=>{if(v&&typeof v==='object'&&!Array.isArray(v))for(const key of Object.keys(v).sort())walk(v[key],p?`${p}.${key}`:key);else rows[p]=v;};
    walk(c.settings,'settings');
    for(const m of c.modules){walk({moduleType:m.moduleType,enabled:m.enabled,order:m.order,settings:m.moduleId==='runtime'?c.settings:m.settings,permissions:m.permissions},`modules.${m.moduleId}`);}
    rows.connections=(c.connections||[]).map(x=>({type:x.type,enabled:x.enabled,source:c.modules.find(m=>m.instanceId===x.sourceInstanceId)?.moduleId,target:c.modules.find(m=>m.instanceId===x.targetInstanceId)?.moduleId}));return rows;
  }
  const a=flatten(A),b=flatten(B);
  return [...new Set([...Object.keys(a),...Object.keys(b)])].sort().map(field=>({field,A:a[field]??null,B:b[field]??null,equal:canonicalize(a[field])===canonicalize(b[field])}));
}
