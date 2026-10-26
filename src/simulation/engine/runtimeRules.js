// @ts-check
/** M2.2 pure rule adapters. Reuse the existing configuration, tools and evidence. */
import { MEMORY_ENTRIES } from '../../features/constructor/model/catalog.js';
import { methodPlan } from '../../features/laboratory/knowledge/skills.js';
import { checkInput, checkOutput } from '../../features/laboratory/reliability/guardrails.js';
import { INJECTION_SAMPLE } from '../../features/laboratory/reliability/samples.js';
import { evaluateEvidence, REVISION_STATUS } from '../rules/evidence/index.js';
import { MISSION_001 } from '../../research-packs/mission-001/index.js';
import { RUNTIME_ROLES } from './runtimeScenarios.js';

/** @param {import('../../features/constructor/model/types.js').AgentConfiguration} c @param {string} id */
export const activeModule=(c,id)=>c.modules.find(m=>m.moduleId===id&&m.enabled===true)||null;
/** Registry fields are validated by preflight. @returns {any} */
export const settingsOf=(c,id)=>activeModule(c,id)?.settings||{};

export function runtimePermission(c,toolId,{role='researcher',collaboration='single',scenarioId='',approved=false}={}) {
  const m=activeModule(c,toolId),guard=settingsOf(c,'guardrails');
  if(!m)return {decision:'deny',reason:'工具未安装或已禁用',code:'TOOL_UNAVAILABLE'};
  if(collaboration==='sequential'&&!RUNTIME_ROLES.find(r=>r.id===role)?.modules.includes(toolId))return {decision:'deny',reason:'角色职责不允许使用该模块',code:'ROLE_FORBIDDEN'};
  if(m.moduleType!=='tools'&&toolId!=='retrieval')return {decision:'deny',reason:'此模块没有本地数据读取职责',code:'UNKNOWN_PERMISSION'};
  if(m.moduleType==='tools'&&m.permissions?.read!==true)return {decision:'deny',reason:'没有显式只读模拟权限',code:'READ_DENIED'};
  const scope=m.settings.resourceScope??'public';
  if(typeof scope!=='string'||!['public','private'].includes(scope))return {decision:'deny',reason:'未知资源权限，默认拒绝',code:'UNKNOWN_PERMISSION'};
  if(scope==='private'&&guard.allowPrivateRecords!==true)return {decision:'deny',reason:'私有记录未被明确允许，默认拒绝',code:'PRIVATE_DENIED'};
  if(scope==='public'&&guard.allowPublicRead!==true)return {decision:'deny',reason:'没有公开读取规则，默认拒绝',code:'PUBLIC_DENIED'};
  const connection=m.settings.connectionMode??'direct';
  if(connection==='mcp') {
    const mcp=activeModule(c,'mcp');
    if(!mcp||mcp.settings.profileId!=='campus-announcements'||!Array.isArray(mcp.settings.capabilityIds)||!mcp.settings.capabilityIds.includes(toolId))return {decision:'deny',reason:'静态 MCP 能力未启用或不在目录中',code:'MCP_CAPABILITY_MISSING'};
  } else if(connection!=='direct')return {decision:'deny',reason:'未知工具路径，默认拒绝',code:'UNKNOWN_CONNECTION'};
  if(scenarioId==='PERMISSION_DENIED'&&toolId==='announcement_search')return {decision:'deny',reason:'本地场景明确拒绝此次搜索',code:'SCENARIO_DENIED'};
  const restricted=scope==='private'||(scenarioId==='PERMISSION_REQUIRED'&&toolId==='announcement_search');
  if(restricted&&!approved) {
    if(!c.settings.requireApprovalForRestrictedActions)return {decision:'deny',reason:'受限动作需要审批，但配置未启用审批',code:'APPROVAL_DISABLED'};
    return {decision:'ask',reason:'受限动作等待本次运行的单次模拟批准',code:'APPROVAL_REQUIRED'};
  }
  return {decision:'allow',reason:`${scope} / read 已获配置授权${approved?'及单次模拟批准':''}；${connection} 本地路径`,code:'READ_ALLOWED'};
}

export function taskContext(c) {
  const ctx=settingsOf(c,'context'),model=settingsOf(c,'model'),ins=settingsOf(c,'instructions'),mem=settingsOf(c,'memory');
  const budget=Math.min(ctx.budget??model.contextBudget,model.contextBudget);
  let remaining=budget;
  const selected=[],omitted=[];
  const memory=mem.mode==='session'?MEMORY_ENTRIES.filter(e=>mem.entryIds.includes(e.id)):[];
  const pieces=[['objective',ins.objective],['instructions',ins.systemInstructions],['constraints',ins.constraints],['background',ctx.background],['taskBrief',ctx.includeTaskBrief?'研究虚构校园公告，形成有证据边界的本地摘要。':''],...memory.map(e=>[e.id,e.value])];
  for(const [id,text] of pieces) {
    if(!text)continue;
    if(text.length<=remaining){selected.push({id,text});remaining-=text.length;}else omitted.push({id,reason:'超出教学字符预算，未放入上下文'});
  }
  return {budget,remaining,unit:'教学字符单位，非真实 Token',selected,omitted,memory:memory.map(e=>e.id),backgroundSourceIds:ctx.sourceIds||[],mode:ctx.mode||'task-and-evidence'};
}
export function planFor(c) {
  const skillEnabled=(settingsOf(c,'skills').skillIds||[]).includes('notice-verification');
  return {mode:c.settings.executionMode,preset:settingsOf(c,'model').preset,determinism:{requested:settingsOf(c,'model').deterministic,effective:true,note:'M2.2 始终确定性；此开关的随机行为 not_consumed_yet'},method:methodPlan({skillEnabled}),policy:skillEnabled||settingsOf(c,'model').preset==='careful'?'VERIFY_REVISIONS':'COLLECT_ONLY',note:'所有计划来自固定本地规则，不是模型思维链。'};
}
export function checkRuntimeEvidence(reads,plan,{legacyConfirmation=false}={}) {
  const evidence=evaluateEvidence({reads,search:null,policy:plan.policy,mission:MISSION_001});
  const facts=evidence.claims.filter(c=>!c.fromMetadata);
  const unresolved=evidence.resolutions.filter(r=>r.status!==(legacyConfirmation?'confirmed':REVISION_STATUS.CONFIRMED));
  const full=reads.length>0&&reads.every(r=>r.textScope==='full_text'&&r.metadata?.publisherId&&r.metadata?.publishedAt);
  const evidenceStatus=unresolved.length?'conflicting':facts.length&&full?'sufficient':'insufficient';
  return {evidenceStatus,sourceIds:evidence.visibleSourceIds,claims:facts,conflicts:evidence.conflicts,resolutions:evidence.resolutions,limitations:evidence.limitations,counts:evidence.counts,reason:unresolved.length?'存在无充分更正依据的冲突，保留所有取值':full&&facts.length?'本次可见正文及来源元数据支持有限摘录':'缺少正文、元数据或可引用事实，不能给出确定结论'};
}
export function injectionDecision(c) {
  const enabled=settingsOf(c,'guardrails').blockUntrustedOverrides!==false;
  const check=checkInput(INJECTION_SAMPLE.paragraphs.join('\n'),{enabled});
  return {sample:INJECTION_SAMPLE,check,attemptedActions:INJECTION_SAMPLE.attemptedActions,reason:enabled?'资料尝试覆盖规则；输入护栏检查后仍只作不可信数据':'输入字面检查关闭；数据与指令隔离仍禁止提权和执行资料内容',executed:false,securityNote:'本地教学规则，不是生产级安全保证。'};
}
export function synthesizeRuntime(c,evidence,context) {
  const e=evidence||{evidenceStatus:'insufficient',sourceIds:[],claims:[],conflicts:[],limitations:[],reason:'未完成证据检查'};
  const model=settingsOf(c,'model'),ins=settingsOf(c,'instructions'),guard=settingsOf(c,'guardrails');
  const sufficient=e.evidenceStatus==='sufficient';
  const baseText=sufficient?'本次虚构资料的可见正文与元数据支持以下有限摘录。':e.evidenceStatus==='conflicting'?'本地资料存在未决冲突，无法确定唯一结论。':'证据不足，无法得出结论。';
  const text=model.answerStyle==='explanatory'?`${baseText} ${e.reason}。`:baseText;
  const citations=e.claims.map(cl=>({sourceId:cl.sourceId,chunkId:cl.chunkId,eventId:cl.eventId||cl.readEventId||null,text:cl.value}));
  const outputCheck=checkOutput({text,citations:citations.length,status:sufficient?'supported':'insufficient'},{enabled:guard.requireEvidence!==false});
  const findings=(model.preset==='concise'||model.answerStyle==='brief'?e.claims.slice(0,1):e.claims).map(cl=>({text:String(cl.value),sourceId:cl.sourceId,chunkId:cl.chunkId}));
  const sections=context?.memory?.includes('output-evidence-first')?['evidence','conclusion','limitations']:['conclusion','evidence','limitations'];
  const presentation=ins.outputFormat==='evidence-table'?{kind:'evidence-table',columns:['摘录','本地来源','片段'],rows:findings.map(f=>[f.text,f.sourceId,f.chunkId])}:ins.outputFormat==='outline'?{kind:'outline',sections,points:[text,...findings.map(f=>`${f.text} [${f.sourceId}]`),e.reason]}:{kind:'brief',text};
  return {simulationOnly:true,isFictional:true,objective:ins.objective,format:ins.outputFormat,style:model.answerStyle,presentation,evidenceStatus:e.evidenceStatus,conclusion:text,findings,citations,sourceIds:e.sourceIds,conflicts:e.conflicts,limitations:[...e.limitations,e.reason,'结论只来自本地教学规则，不代表真实研究或安全认证。',...(context?.omitted||[]).map(i=>`${i.id} 未纳入上下文`)],outputCheck,terminationReason:null};
}
