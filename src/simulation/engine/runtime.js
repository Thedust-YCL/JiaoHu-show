// @ts-check
/** Incremental v3 capability of simulation/engine. No DOM, timers, storage or network. */
import { prepareSimulationInput, newId } from '../../features/constructor/model/configuration.js';
import { previewRetrieval } from '../../features/constructor/model/preflight.js';
import { createEvent } from '../events/schema.js';
import { deepClone, deepFreeze, canonicalize } from '../events/serializer.js';
import { runAnnouncementSearch } from '../tools/announcementSearch.js';
import { runDocumentReader } from '../tools/documentReader.js';
import { MISSION_001 } from '../../research-packs/mission-001/index.js';
import { runtimeScenario } from './runtimeScenarios.js';
import { activeModule, settingsOf, runtimePermission, taskContext, planFor, checkRuntimeEvidence, injectionDecision, synthesizeRuntime } from './runtimeRules.js';

export const RUNTIME_VERSION=3;
export const RUNTIME_ENGINE_VERSION='m22.2';
export const SUPPORTED_RUNTIME_ENGINES=Object.freeze(['m22.1',RUNTIME_ENGINE_VERSION]);
export const isRuntimeTerminal=status=>['completed','failed','cancelled'].includes(status);
const phases={TASK_INTAKE:'VALIDATION',PLAN:'PLAN',RETRIEVE:'SEARCH',SEARCH:'SEARCH',ADDITIONAL_RESEARCH:'SEARCH',READ:'READ',EVIDENCE_CHECK:'EVIDENCE',INJECTION:'EVIDENCE',HANDOFF_VERIFY:'EVIDENCE',HANDOFF_SYNTHESIZE:'REPORT',SYNTHESIZE:'REPORT',FINALIZE:'END',RECHECK:'EVIDENCE'};
const modules={TASK_INTAKE:'instructions',PLAN:'runtime',RETRIEVE:'retrieval',SEARCH:'announcement_search',ADDITIONAL_RESEARCH:'announcement_search',READ:'document_reader',EVIDENCE_CHECK:'guardrails',INJECTION:'guardrails',SYNTHESIZE:'model'};
const concepts={TASK_INTAKE:'instructions',PLAN:'harness',RETRIEVE:'retrieval',SEARCH:'tool_calling',ADDITIONAL_RESEARCH:'agent_loop',READ:'tools',EVIDENCE_CHECK:'guardrails',INJECTION:'prompt_injection',HANDOFF_VERIFY:'multi_agent',HANDOFF_SYNTHESIZE:'orchestration',SYNTHESIZE:'hallucination',FINALIZE:'tracing',RECHECK:'agent_loop'};

/** Counts and result status are reduced from events; there is no separate mutable counter. */
export function summarizeRuntime(events) {
  const count=type=>events.filter(e=>e.type===type).length;
  const last=[...events].reverse().find(e=>e.type==='evidence.claims_extracted');
  const end=[...events].reverse().find(e=>['run.completed','run.failed','run.cancelled'].includes(e.type));
  return {steps:count('step.started'),toolCalls:count('tool.call'),toolErrors:count('tool.error'),retries:count('tool.retry'),permissionChecks:count('permission.check'),requests:count('permission.requested'),approvals:count('permission.approved'),denials:count('permission.denied'),branches:[...new Set(events.filter(e=>e.type==='runtime.decision').map(e=>e.branchId).filter(Boolean))],evidenceCount:last?.output?.claims?.length||0,conflictCount:last?.output?.conflicts?.length||0,evidenceStatus:last?.output?.evidenceStatus||'insufficient',status:end?.output?.status||null,terminationReason:end?.output?.terminationReason||null};
}

/** Ignore identity/wall clock/control events, retain all actual decisions and evidence. */
export function semanticTrace(run) {
  const semantic=run.events.filter(e=>e.type!=='runtime.control');
  const clean=value=>{
    let raw=JSON.stringify(value);
    for(const [i,event] of semantic.entries())raw=raw.replaceAll(event.eventId,`$EVENT${i}`);
    return JSON.parse(raw.replaceAll(run.runId,'$RUN'));
  };
  return clean({events:semantic.map(({id,eventId,runId,sequence,timestamp,inputSummary,outputSummary,...e})=>e),result:run.result});
}

/** @param {import('../../features/constructor/model/types.js').AgentConfiguration} configuration
 * @param {import('./runtimeTypes.js').RuntimeOptions} options */
export function createRuntime(configuration,{scenarioId='NORMAL_PATH',seed='0',collaboration='single',runId=newId('runtime'),startedAt=0,engineVersion=RUNTIME_ENGINE_VERSION}={}) {
  if(!SUPPORTED_RUNTIME_ENGINES.includes(engineVersion))throw Error('运行引擎版本不可用');
  if(typeof seed!=='string'&&typeof seed!=='number')throw Error('种子必须为字符串或数字');
  seed=String(seed);if(seed.length>80)throw Error('种子过长');
  if(!['single','sequential'].includes(collaboration))throw Error('未知角色模式');
  const scenario=runtimeScenario(scenarioId),prepared=prepareSimulationInput(configuration);
  const c=deepFreeze(prepared.configuration);
  const r={schemaVersion:RUNTIME_VERSION,configSchemaVersion:c.schemaVersion,simulationOnly:true,engineVersion,missionId:MISSION_001.missionId,missionVersion:MISSION_001.missionVersion,corpusVersion:MISSION_001.corpusVersion,runId,configId:c.configId,configSnapshot:c,scenarioId,seed,options:{collaboration},status:prepared.ready?'ready':'idle',startedAt,finishedAt:null,events:[],steps:[],commands:[],preflight:prepared.preflight,pendingApproval:null,roleArtifacts:{},result:null};
  const s={intake:false,planned:false,retrieved:false,searched:false,additional:false,candidates:[],readIndex:0,reads:[],checked:false,injectionChecked:false,synthesized:false,role:'researcher',retry:0,retryPending:false,searchCalls:0,context:null,plan:null,evidence:null,retrieval:null,toolFailed:false};
  let currentStep=null;
  const outputSummary=value=>(typeof value==='string'?value:JSON.stringify(value)).replaceAll(runId,'RUN').slice(0,280);
  /** @param {string} type @param {import('./runtimeTypes.js').RuntimeEventDetail} detail */
  function emit(type,{reason='',input=null,output=null,status='info',toolId=null,branchId=null,errorCode=null,...extra}={}) {
    const sequence=r.events.length;
    const runtime={eventId:`${runId}#e${String(sequence).padStart(2,'0')}`,runId,timestamp:sequence,stepId:currentStep?.stepId||null,moduleInstanceId:activeModule(c,toolId||modules[currentStep?.action])?.instanceId||null,roleId:collaboration==='sequential'?s.role:null,inputSummary:outputSummary(input),outputSummary:outputSummary(output),reason,errorCode,input:deepClone(input),output:deepClone(output),...deepClone(extra)};
    const e=createEvent({runId,sequence,phase:phases[currentStep?.action]||'VALIDATION',type,status,toolId,branchId,ruleId:branchId?`runtime.${branchId}`:'runtime.control',message:reason,runtime,sourceIds:extra.sourceIds||[]});
    r.events.push(e);return e;
  }
  function control(reason){emit('runtime.control',{reason});}
  function terminate(status,reason) {
    if(isRuntimeTerminal(r.status))return;
    r.status=status;r.pendingApproval=null;
    r.result=synthesizeRuntime(c,s.evidence,s.context);r.result.terminationReason=reason;
    emit(status==='completed'?'run.completed':status==='cancelled'?'run.cancelled':'run.failed',{reason,output:{status,terminationReason:reason},status:status==='failed'?'error':'info'});
    r.finishedAt=r.events.length-1;
  }
  function decision() {
    if(!s.intake)return ['TASK_INTAKE','尚未接收目标和可信约束，先建立受预算约束的上下文'];
    if(!s.planned)return ['PLAN',`${c.settings.executionMode} 读取预设与方法，明确可用动作和终止条件`];
    if(!s.retrieved&&activeModule(c,'retrieval'))return ['RETRIEVE','配置启用 Retrieval，复用 Knowledge Lab 的切分与确定性检索'];
    if(!s.searched||s.retryPending)return ['SEARCH',s.retryPending?'可恢复工具错误，尚有重试预算':'没有检索记录，先尝试配置允许的本地搜索'];
    if(s.readIndex<s.candidates.length)return ['READ','已有来源候选尚未读取；必须通过工具权限及上下文预算检查'];
    if(scenarioId==='UNTRUSTED_INSTRUCTION'&&!s.injectionChecked&&s.reads.length)return ['INJECTION','读取完成后出现教学用不可信文本，检查其越权企图'];
    if(collaboration==='sequential'&&s.role==='researcher')return ['HANDOFF_VERIFY','Researcher 将可见资料交给 Verifier，不能交接未读取正文'];
    if(!s.checked)return ['EVIDENCE_CHECK','固定流程和动态循环都必须检查可见证据，工具成功不等于证据可信'];
    if(scenarioId==='STEP_LIMIT_REACHED')return ['RECHECK','场景要求继续复核尚未确认项；每次复核都消耗同一 maxSteps'];
    const adaptive=collaboration==='single'&&c.settings.executionMode==='agent-loop'&&s.evidence.evidenceStatus!=='sufficient'&&!s.additional&&!s.toolFailed;
    if(adaptive)return ['ADDITIONAL_RESEARCH',`当前证据 ${s.evidence.evidenceStatus}；仍有可搜索资料和步数，主动补充一次研究`];
    if(collaboration==='sequential'&&s.role!=='synthesizer')return ['HANDOFF_SYNTHESIZE','Verifier 将核验状态、缺失项和冲突交给 Synthesizer'];
    if(c.settings.stopWhenInsufficient&&s.evidence.evidenceStatus!=='sufficient')return ['FINALIZE','证据不足且配置要求停止；已无允许的恢复动作，不执行综合步骤'];
    if(!s.synthesized)return ['SYNTHESIZE','没有更多可用研究动作，整理有限结论并保留不确定性'];
    return ['FINALIZE','已检查证据并整理结果，按终止规则结束'];
  }
  function finishStep(status,output,next=null) {
    if(next===null)next=currentStep.action==='FINALIZE'?'terminate':summarizeRuntime(r.events).steps>=c.settings.maxSteps?'terminate:max_steps':decision()[0];
    currentStep.status=status;currentStep.output=deepClone(output);currentStep.outputSummary=outputSummary(output);currentStep.next=next;currentStep.retryCount=s.retry;
    emit('step.finished',{status:status==='failed'?'error':status==='denied'?'blocked':['skipped','cancelled'].includes(status)?'skipped':'success',reason:currentStep.reason,output});
    currentStep=null;
  }
  function deny(toolId,permission) {
    emit('permission.denied',{toolId,status:'blocked',reason:permission.reason,errorCode:permission.code});
    finishStep('denied',{executed:false,reason:permission.reason},'terminate:permission_denied');terminate('failed','permission_denied');
  }
  function executeTool(action,approved=false) {
    const toolId=action==='READ'?'document_reader':'announcement_search';
    const permission=runtimePermission(c,toolId,{role:s.role,collaboration,scenarioId,approved});
    emit('permission.check',{toolId,reason:permission.reason,output:permission,status:permission.decision==='deny'?'blocked':'info'});
    if(permission.decision==='deny') {deny(toolId,permission);return;}
    if(permission.decision==='ask') {
      r.pendingApproval={stepId:currentStep.stepId,action,toolId,requiredPermission:`${settingsOf(c,toolId).resourceScope||'public'}:read`,scope:'仅本次模拟工具动作；不授予浏览器或系统权限',reason:permission.reason};
      currentStep.status='waiting_approval';r.status='waiting_approval';
      emit('permission.requested',{toolId,reason:permission.reason,output:r.pendingApproval});return;
    }
    if(action!=='READ'&&s.retryPending) {emit('tool.retry',{toolId,reason:`重试 ${s.retry+1}/${c.settings.maxRetries}`,output:{attempt:s.retry+1}});s.retry++;s.retryPending=false;}
    const input=action==='READ'?{sourceId:s.candidates[s.readIndex],...settingsOf(c,toolId)}:{...settingsOf(c,toolId),additional:action==='ADDITIONAL_RESEARCH'};
    emit('tool.call',{toolId,status:'started',reason:'权限已检查，执行本地静态数据工具',input});
    let result;
    if(action==='READ') result=runDocumentReader({settings:settingsOf(c,toolId),sourceId:input.sourceId});
    else {
      s.searchCalls++;
      const fail=scenarioId==='TOOL_FAILURE_EXHAUSTED'||scenarioId==='TOOL_FAILURE_ONCE'&&s.searchCalls===1;
      const missing=scenarioId==='MISSING_EVIDENCE'&&action!=='ADDITIONAL_RESEARCH';
      let corpus=MISSION_001.notices.filter(n=>scenario.sourceIds.includes(n.sourceId)&&!missing);
      if(s.retrieval&&settingsOf(c,'context').includeRetrieval)corpus=corpus.filter(n=>s.retrieval.retrieval.candidates.some(k=>k.sourceId===n.sourceId));
      result=runAnnouncementSearch({settings:settingsOf(c,toolId),corpus,faultMode:fail?'search_timeout':'normal'});
    }
    if(result.ok===false) {
      const recoverable=result.error.code==='SEARCH_TIMEOUT';
      emit('tool.error',{toolId,status:'error',reason:result.error.message,errorCode:result.error.code,output:{recoverable,attempt:s.retry}});
      if(recoverable&&s.retry<c.settings.maxRetries) {s.retryPending=true;s.searched=false;finishStep('failed',{errorCode:result.error.code,recoverable:true},'SEARCH');}
      else {s.toolFailed=true;finishStep('failed',{errorCode:result.error.code,recoverable:false},'terminate:tool_error');terminate('failed',recoverable?'retry_exhausted':'invalid_tool_input');}
      return;
    }
    if(action==='READ') {
      const p=deepClone(result.payload);const accepted=[];const dropped=[];
      for(const chunk of p.chunks) {
        if(s.context.mode!=='task-only'&&chunk.text.length<=s.context.remaining){accepted.push(chunk);s.context.remaining-=chunk.text.length;}else dropped.push(chunk.chunkId);
      }
      p.chunks=accepted;p.chunkIds=accepted.map(k=>k.chunkId);p.content=null;p.summary=null;p.droppedChunkIds=dropped;
      const e=emit('tool.result',{toolId,status:'success',reason:`工具返回 ${accepted.length} 个可纳入上下文的片段；${dropped.length} 个因预算/模式排除`,sourceIds:[p.sourceId],output:p});
      if(accepted.length)s.reads.push({sourceId:p.sourceId,title:p.title,textScope:p.textScope,chunks:p.chunks,metadata:p.metadata,eventId:e.eventId});
      s.readIndex++;s.checked=false;
      finishStep('completed',p);
    } else {
      s.searched=true;
      if(action==='ADDITIONAL_RESEARCH')s.additional=true;
      const ids=result.payload.items.map(i=>i.sourceId);
      s.candidates=[...new Set([...s.candidates,...ids,...(s.context.backgroundSourceIds||[])])];
      emit('tool.result',{toolId,status:'success',reason:`本地搜索实际返回 ${ids.length} 条；没有补入未检索资料`,sourceIds:ids,output:result.payload});
      finishStep('completed',result.payload);
    }
  }
  function perform(action) {
    if(['SEARCH','ADDITIONAL_RESEARCH','READ'].includes(action)){executeTool(action);return;}
    let output={};
    if(action==='TASK_INTAKE'){s.context=taskContext(c);s.intake=true;output=s.context;}
    if(action==='PLAN'){s.plan=planFor(c);s.planned=true;output=s.plan;}
    if(action==='RETRIEVE') {
      const permission=runtimePermission(c,'retrieval',{role:s.role,collaboration});
      emit('permission.check',{toolId:'retrieval',reason:permission.reason,output:permission,status:permission.decision==='allow'?'info':'blocked'});
      if(permission.decision!=='allow'){deny('retrieval',permission);return;}
      const preview=previewRetrieval(c),config=settingsOf(c,'retrieval');
      const candidates=preview.retrieval.candidates.map(k=>({sourceId:k.sourceId,chunkId:k.chunkId,title:k.title,score:k.score,reason:k.reason}));
      s.retrieved=true;s.retrieval={retrieval:{candidates}};
      const contextFragments=[],omittedChunks=[];
      for(const candidate of candidates) {
        const chunk=preview.chunking.chunks.find(k=>k.chunkId===candidate.chunkId);
        if(settingsOf(c,'context').includeRetrieval&&s.context.mode!=='task-only'&&chunk.text.length<=s.context.remaining) {
          contextFragments.push({sourceId:chunk.sourceId,chunkId:chunk.chunkId,text:chunk.text,...(config.includeMetadata?{metadata:{publisher:chunk.publisher,publishedAt:chunk.publishedAt}}:{})});s.context.remaining-=chunk.text.length;
        } else omittedChunks.push({chunkId:chunk.chunkId,reason:'未选择注入检索证据，或超过教学上下文预算'});
      }
      output={chunking:{preset:config.chunkPreset,size:config.chunkSize,chunkCount:preview.chunking.chunks.length},retrieval:{mode:preview.retrieval.mode,note:preview.retrieval.note,candidates},contextFragments,omittedChunks};
    }
    if(action==='INJECTION'){s.injectionChecked=true;output=injectionDecision(c);emit('guardrail.decision',{reason:output.reason,sourceIds:['NTC-X01'],output});}
    if(action==='EVIDENCE_CHECK') {
      s.checked=true;s.evidence=checkRuntimeEvidence(s.reads,s.plan,{legacyConfirmation:engineVersion==='m22.1'});output=s.evidence;
      emit('evidence.claims_extracted',{reason:output.reason,sourceIds:output.sourceIds,output});
      if(collaboration==='sequential')r.roleArtifacts.verifier={type:'verification',...deepClone(output)};
    }
    if(action==='HANDOFF_VERIFY'||action==='HANDOFF_SYNTHESIZE') {
      const to=action==='HANDOFF_VERIFY'?'verifier':'synthesizer',from=s.role;
      if(from==='researcher')r.roleArtifacts.researcher={type:'collected-evidence',reads:deepClone(s.reads),sourceIds:s.reads.map(r=>r.sourceId),degraded:!activeModule(c,'document_reader')};
      s.role=to;output={fromRole:from,toRole:to,artifactRefs:[`roleArtifacts.${from}`]};
      emit('role.handoff',{reason:currentStep.reason,fromRole:from,artifactRefs:output.artifactRefs,output});
    }
    if(action==='SYNTHESIZE') {
      s.synthesized=true;output=synthesizeRuntime(c,s.evidence,s.context);
      if(collaboration==='sequential')r.roleArtifacts.synthesizer=deepClone(output);
      emit('report.generated',{reason:'按实际核验结果装配本地模板，未调用模型',sourceIds:output.sourceIds,output});
    }
    finishStep('completed',output);
    if(action==='FINALIZE') {
      if(collaboration==='sequential'&&!r.roleArtifacts.synthesizer)r.roleArtifacts.synthesizer={type:'insufficient-receipt',evidenceStatus:s.evidence.evidenceStatus,conclusion:'证据不足或存在未决冲突，按配置停止综合。',sourceIds:s.evidence.sourceIds};
      terminate('completed',s.evidence?.evidenceStatus==='sufficient'?'target_reached':c.settings.stopWhenInsufficient?'insufficient_evidence':'partial_result');
    }
  }
  function start() {if(r.status!=='ready')return false;r.status='running';control('启动运行');return true;}
  function step() {
    if(!['ready','running','paused'].includes(r.status))return false;
    const manual=r.status!=='running';r.status='running';
    if(summarizeRuntime(r.events).steps>=c.settings.maxSteps){terminate('failed','max_steps');return true;}
    const [action,reason]=decision();
    const alternativeReasons={SEARCH:s.searched?'已有检索记录；重复研究只由 Agent Loop 的证据状态触发':'必须先完成任务接收、计划和已配置的检索准备',READ:s.readIndex<s.candidates.length?'已有候选，但当前优先控制动作尚未完成':'没有尚待读取的候选来源',EVIDENCE_CHECK:s.checked?'当前可见证据已检查':'必须先完成本次允许的数据获取及角色交接',SYNTHESIZE:!s.checked?'未经证据检查不能直接综合':c.settings.stopWhenInsufficient&&s.evidence.evidenceStatus!=='sufficient'?'配置要求证据不足时停止':'当前优先执行补充研究或角色交接',FINALIZE:!s.checked?'所需的证据检查尚未完成':'仍有已配置且允许执行的动作'};
    const alternatives=['SEARCH','READ','EVIDENCE_CHECK','SYNTHESIZE','FINALIZE'].filter(a=>a!==action).map(a=>({action:a,executed:false,reason:alternativeReasons[a]}));
    currentStep={stepId:`s${r.steps.length+1}`,sequence:r.steps.length+1,action,conceptId:concepts[action],moduleId:modules[action]||null,roleId:collaboration==='sequential'?s.role:null,status:'running',reason,input:{sources:s.candidates,read:s.reads.length,remainingSteps:c.settings.maxSteps-r.steps.length},output:null,outputSummary:'',retryCount:s.retry,branchId:action==='ADDITIONAL_RESEARCH'?'additional-research':`${c.settings.executionMode}/${action.toLowerCase()}`,alternatives,next:null};
    r.steps.push(currentStep);
    emit('step.started',{reason,status:'started',input:currentStep.input});
    emit('runtime.decision',{reason,branchId:currentStep.branchId,output:{action,alternatives}});
    perform(action);
    if(manual&&r.status==='running')r.status='paused';
    return true;
  }
  function pause(){if(r.status!=='running')return false;r.status='paused';control('用户在步骤边界暂停');return true;}
  function resume(){if(r.status!=='paused')return false;r.status='running';control('保留轨迹与预算继续');return true;}
  function cancel(reason='用户取消本地模拟'){if(typeof reason!=='string'||reason.length>240||!['ready','running','paused','waiting_approval'].includes(r.status))return false;if(currentStep)finishStep('cancelled',{reason},'terminate:cancelled');terminate('cancelled',reason);return true;}
  function approval(allow) {
    if(r.status!=='waiting_approval'||!r.pendingApproval||!currentStep)return false;
    const pending=r.pendingApproval;r.pendingApproval=null;
    if(!allow){deny(pending.toolId,{reason:'用户拒绝本次模拟动作',code:'USER_REJECTED'});return true;}
    emit('permission.approved',{reason:'仅批准当前单次模拟工具动作',toolId:pending.toolId});
    r.status='paused';executeTool(pending.action,true);return true;
  }
  const api={getRun:()=>deepFreeze(deepClone({...r,summary:summarizeRuntime(r.events)})),restart:()=>createRuntime(c,{scenarioId,seed,collaboration,engineVersion}),start,step,pause,resume,cancel,approve:()=>approval(true),reject:()=>approval(false)};
  // Successful public commands are a deterministic resume recipe; rejected controls never enter history.
  for(const key of ['start','step','pause','resume','cancel','approve','reject']) {
    const fn=api[key];api[key]=(...args)=>{const used=key==='cancel'&&args[0]!==undefined?[args[0]]:[];const ok=fn(...used);if(ok)r.commands.push({action:key,args:used});return ok;};
  }
  return api;
}

/** Validate by re-executing only recorded local commands against the exact versioned snapshot. */
export function restoreRuntime(record,{pauseRunning=true}={}) {
  if(record?.schemaVersion!==RUNTIME_VERSION||!SUPPORTED_RUNTIME_ENGINES.includes(record.engineVersion)||record.missionVersion!==MISSION_001.missionVersion||record.corpusVersion!==MISSION_001.corpusVersion||!Array.isArray(record.commands)||record.commands.length>1000)throw Error('运行版本或恢复指令不兼容');
  const rt=createRuntime(record.configSnapshot,{scenarioId:record.scenarioId,seed:record.seed,collaboration:record.options?.collaboration,runId:record.runId,startedAt:record.startedAt,engineVersion:record.engineVersion});
  for(const command of record.commands) {
    if(!['start','step','pause','resume','cancel','approve','reject'].includes(command.action)||!Array.isArray(command.args)||!rt[command.action](...command.args))throw Error('运行控制轨迹损坏');
  }
  if(canonicalize(rt.getRun())!==canonicalize(record))throw Error('运行快照、事件与摘要不一致');
  if(pauseRunning&&rt.getRun().status==='running')rt.pause();
  return rt;
}
