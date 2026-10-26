// @ts-check
import {runtimeReport,resolveCitation} from './report.js';
import {canonicalize} from '../../../simulation/events/serializer.js';
import {REVISION_STATUS} from '../../../simulation/rules/evidence/index.js';

export function compareRuns(A,B,{approvalPolicyId='recorded-per-side'}={}){
  const warnings=[];
  if(!approvalPolicyId)warnings.push('审批策略未记录，不能认定公平比较');
  if(!A||!B)warnings.push('一侧未运行，指标为 N/A');
  for(const key of ['missionId','missionVersion','corpusVersion','scenarioId','seed','engineVersion'])if(A&&B&&A[key]!==B[key])warnings.push(`${key} 不一致：非严格对比`);
  if(A&&B&&A.options.collaboration!==B.options.collaboration)warnings.push('角色协作条件不一致');
  const strict=warnings.length===0;
  const project=run=>run?runtimeReport(run):null,ra=project(A),rb=project(B);
  /** @type {Array<[string,string,string,((r:import('./types.js').RunRecord,p:ReturnType<typeof runtimeReport>)=>unknown)|null,string[]]>} */
  const defs=[
    ['status','运行终态','RunRecord.status 与终止事件',r=>r.status,[]],
    ['termination','终止原因','最后终止事件 output.terminationReason',r=>r.result?.terminationReason||null,['run.completed','run.failed','run.cancelled']],
    ['steps','实际步骤','计数 step.started；包括失败/审批动作，不含回放',null,['step.started']],
    ['toolCalls','工具调用','计数 tool.call；重试的实际派发另计',null,['tool.call']],
    ['toolTypes','各工具调用','按 tool.call.toolId 分组计数',r=>Object.fromEntries([...new Set(r.events.filter(e=>e.type==='tool.call').map(e=>e.toolId))].sort().map(id=>[id,r.events.filter(e=>e.type==='tool.call'&&e.toolId===id).length])),['tool.call']],
    ['failures','工具失败','计数 tool.error；不把审批拒绝算作工具错误',null,['tool.error']],
    ['retries','重试','计数 tool.retry；重试上限见配置',null,['tool.retry']],
    ['requests','审批请求','计数 permission.requested',null,['permission.requested']],
    ['approvals','批准','计数 permission.approved',null,['permission.approved']],
    ['denials','拒绝','计数 permission.denied（含配置/场景拒绝）',null,['permission.denied']],
    ['branches','实际分支','runtime.decision 中不同 branchId 的数量',r=>new Set(r.events.filter(e=>e.type==='runtime.decision').map(e=>e.branchId)).size,['runtime.decision']],
    ['modules','启用模块','冻结配置中 enabled=true 的模块数',r=>r.configSnapshot.modules.filter(m=>m.enabled).length,[]],
    ['coverage','证据支持','有支持状态且所有引用可解析的发现 / 全部需要证据的发现（包括无引用项）',(r,p)=>{
      const facts=p.report.claims.filter(c=>c.kind==='finding');
      if(!r.events.some(e=>e.type==='evidence.claims_extracted'))return null;
      return `${facts.filter(c=>c.status==='supported'&&c.citationIds.length&&c.citationIds.every(id=>resolveCitation(r,p.report,id).valid)).length} / ${facts.length}`;
    },['evidence.claims_extracted']],
    ['citations','有效引用','可定位本次工具片段的引用 / 全部报告引用',(r,p)=>`${p.report.citations.filter(c=>resolveCitation(r,p.report,c.id).valid).length} / ${p.report.citations.length}`,['tool.result']],
    ['conflicts','资料冲突','最后 evidence.claims_extracted 的冲突组数',(r,p)=>p.evidence?p.evidence.conflicts.length:null,['evidence.claims_extracted']],
    ['resolved','已核验更正','最后证据检查中 resolution.status=revision_confirmed 的数量；未决不裁决',(r,p)=>p.evidence?p.evidence.resolutions.filter(x=>x.status===REVISION_STATUS.CONFIRMED).length:null,['evidence.claims_extracted']],
    ['conclusion','最终研究结论','对应 RunResult 的有限结论；失败/取消只显示已观察结果',r=>r.result?.conclusion||null,['report.generated','run.completed','run.failed','run.cancelled']],
  ];
  const metrics=defs.map(([metricId,definition,algorithm,fn,types])=>{
    const side=(r,p)=>({value:!r?null:fn?fn(r,p):r.events.filter(e=>types.includes(e.type)).length,eventIds:!r?[]:r.events.filter(e=>types.includes(e.type)).map(e=>e.eventId),runId:r?.runId||null,reportClaimIds:metricId==='coverage'?p?.report.claims.filter(c=>c.kind==='finding').map(c=>c.id)||[]:[]});
    const a=side(A,ra),b=side(B,rb),equal=canonicalize(a.value)===canonicalize(b.value);
    return {metricId,definition,algorithm,A:a,B:b,status:a.value===null||b.value===null?'unavailable':!strict?'not-comparable':equal?'equal':'different',delta:strict&&typeof a.value==='number'&&typeof b.value==='number'?b.value-a.value:null,explanation:'观察值没有优劣排名；额外步骤可能用于核验，少步骤不等于更好。'};
  });
  return {algorithmVersion:'m23.1',approvalPolicyId,strict,warnings,metrics};
}
