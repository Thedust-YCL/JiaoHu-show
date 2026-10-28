// @ts-check
import { h, esc } from '../../constructor/components/dom.js';
import { createRuntime, restoreRuntime, isRuntimeTerminal } from '../../../simulation/engine/runtime.js';
import { RUNTIME_SCENARIOS, RUNTIME_STATUS } from '../../../simulation/engine/runtimeScenarios.js';
import { readRuntimeHistory, saveRuntimeRun, deleteRuntimeRun } from '../state/runtimeHistory.js';
import { createExecutionCore } from './executionCore.js';
import { getNotice } from '../../../research-packs/mission-001/notices.js';
import { getModule } from '../../constructor/model/modules.js';
import { downloadLocalFile } from '../../../components/ui/download.js';
const actionLabels={TASK_INTAKE:'接收任务',PLAN:'确定执行计划',RETRIEVE:'检索本地片段',SEARCH:'搜索公告',ADDITIONAL_RESEARCH:'补充研究',READ:'读取资料',EVIDENCE_CHECK:'检查证据',INJECTION:'检查不可信指令',HANDOFF_VERIFY:'交接核验角色',HANDOFF_SYNTHESIZE:'交接综合角色',SYNTHESIZE:'整理有限结论',FINALIZE:'结束运行',RECHECK:'继续复核'};
const stepLabels={running:'执行中',completed:'已完成',waiting_approval:'等待审批',failed:'失败',denied:'被拒绝',skipped:'已跳过',cancelled:'已取消'};
const evidenceLabels={sufficient:'证据充分（限教学规则）',conflicting:'存在未决冲突',insufficient:'证据不足'};

/** Timers only request the next engine action. No precomputed run is played as live work.
  * @param {import('../../../simulation/engine/runtimeTypes.js').RuntimeWorkspaceOptions & {session?: Record<string, any>, onPresentation?: (presentation: any)=>void}} options */
export function createRuntimeWorkspace({getConfiguration,storage=null,session={},onBackToConstructor,onBackToHub,onLegacyExecution,onOpenKnowledge,onConfirm,onMountCanvas,onReleaseCanvas,onFocusScene,onPresentation,has3D=false,reducedMotion=false}={}) {
  if(!storage)try{storage=globalThis.localStorage;}catch{}
  session=session&&typeof session==='object'?session:{};
  const el=h('div',{class:'workspace runtime-workspace','data-open':'true'});
  const head=h('header',{class:'ws-head'},'<div class="ws-head__id"><span class="ws-head__tag">A/0</span><span class="ws-head__title">RUNTIME / 执行检查器</span><span class="ws-head__meta">SIMULATION / 本地模拟 · 虚构校园资料</span></div>');
  const toolbar=h('div',{class:'rt-toolbar'}),controls=h('div',{class:'rt-controls',role:'group','aria-label':'运行控制'});
  const scenario=h('select',{'aria-label':'本地模拟场景'});
  for(const s of RUNTIME_SCENARIOS)scenario.append(h('option',{value:s.id},esc(s.label)));
  const seed=h('input',{'aria-label':'复现种子',maxlength:80,value:'0'});
  const role=h('select',{'aria-label':'角色协作模式'},'<option value="single">单流程</option><option value="sequential">三角色顺序交接</option>');
  const choices=h('div',{class:'rt-choices'});
  for(const [label,input] of [['场景',scenario],['种子',seed],['参与角色',role]])choices.append(h('label',{},esc(label),input));
  toolbar.append(choices,controls);
  const status=h('div',{class:'rt-status',role:'status','aria-live':'polite'});
  const notice=h('p',{class:'rt-notice',role:'alert'});
  const body=h('div',{class:'rt-body'}),timeline=h('section',{class:'rt-timeline','aria-label':'步骤时间线'}),detail=h('section',{class:'rt-detail','aria-label':'步骤检查器'}),side=h('aside',{class:'rt-side'});
  const core=createExecutionCore();core.setView(has3D?'3d':'2d',{has3D});
  const coreControls=h('div',{class:'rt-controls'});
  const history=h('section',{class:'rt-history','aria-label':'本地运行历史'});
  side.append(coreControls,core.el,history);body.append(timeline,detail,side);el.append(head,toolbar,status,notice,body);
  let rt=null,active=false,timer=null,selectedStep=session.stepId||null,selectedEvent=session.eventSequence??null,viewedHistory=!!session.viewedHistory;
  const buttons={};
  function persistSelection(){session.runId=rt?.getRun().runId||null;session.stepId=selectedStep;session.eventSequence=selectedEvent;session.viewedHistory=viewedHistory;}
  function displayedEvent(run,step){
    if(!run||!step)return null;
    const events=run.events.filter(event=>event.stepId===step.stepId);
    return events.find(event=>event.sequence===selectedEvent)||events.find(event=>event.type==='tool.error')||events.at(-1)||null;
  }
  function publishPresentation(run,event){
    if(!run){onPresentation?.(null);return;}
    onPresentation?.({configuration:run.configSnapshot,run,event:event||null,paused:reducedMotion||viewedHistory||run.status!=='running'});
  }
  function button(label,id,fn,parent=controls) {
    const b=h('button',{type:'button',class:`btn btn--sm ${id==='step'?'btn--primary':'btn--ghost'}`,'data-rt-act':id},label);
    b.addEventListener('click',fn);parent.append(b);buttons[id]=b;return b;
  }
  const headActions=h('div',{class:'ws-head__actions'});head.append(headActions);
  button('装配台','constructor',()=>onBackToConstructor?.(),headActions);
  button('M0 研究与旧记录','legacy',()=>onLegacyExecution?.(),headActions);
  button('中央核心','hub',()=>onBackToHub?.(),headActions);
  function stopTimer(){if(timer!==null)clearInterval(timer);timer=null;}
  function save(){if(!rt)return;const result=saveRuntimeRun(storage,rt.getRun());notice.textContent=result.notice||'';}
  function tick(){if(!active||!rt||rt.getRun().status!=='running'){stopTimer();return;}rt.step();selectedStep=null;selectedEvent=null;save();render();if(rt.getRun().status!=='running')stopTimer();}
  function schedule(){stopTimer();if(active&&rt?.getRun().status==='running')timer=setInterval(tick,reducedMotion?600:800);}
  function action(name){if(!rt)newRun();if(!rt)return;const ok=rt[name]();if(ok){viewedHistory=false;selectedStep=null;selectedEvent=null;persistSelection();save();render();schedule();if(['approve','reject'].includes(name))(isRuntimeTerminal(rt.getRun().status)?buttons.new:buttons.step).focus();}}
  function newRun(from=null) {
    stopTimer();
    if(rt&&!isRuntimeTerminal(rt.getRun().status)&&rt.getRun().status!=='idle'&&rt.getRun().events.length){rt.cancel('建立新运行，当前运行已取消并保留');save();}
    try{rt=from?createRuntime(from.configSnapshot,{scenarioId:from.scenarioId,seed:from.seed,collaboration:from.options.collaboration}):createRuntime(getConfiguration(),{scenarioId:scenario.value,seed:seed.value,collaboration:role.value});}
    catch(error){notice.textContent=`无法建立运行：${error.message}`;return false;}
    viewedHistory=false;selectedStep=null;selectedEvent=null;persistSelection();save();render();return true;
  }
  button('新运行','new',()=>newRun());
  button('逐步执行','step',()=>action('step'));
  button('连续运行','run',()=>action('start'));
  button('暂停','pause',()=>action('pause'));
  button('继续','resume',()=>action('resume'));
  button('取消','cancel',()=>action('cancel'));
  const moreControls=h('details',{class:'rt-more'});moreControls.append(h('summary',{},'更多控制'));const utilities=h('div',{class:'rt-controls'});moreControls.append(utilities);controls.append(moreControls);
  button('相同快照重跑','restart',()=>{if(rt)newRun(rt.getRun());},utilities);
  button('复位视图','reset',()=>{selectedStep=null;selectedEvent=null;render();},utilities);
  button('导出运行 JSON','export',()=>{
    if(!rt)return;
    const r=rt.getRun();
    const result=downloadLocalFile({content:JSON.stringify(r,null,2),filename:`AGENT-ZERO_SIMULATION_${r.runId}.json`,type:'application/json;charset=utf-8'});
    notice.textContent=result.message;
    notice.dataset.tone=result.ok?'success':'error';
  },utilities);
  for(const view of ['3d','2d'])button(view.toUpperCase(),view,()=>{core.setView(view,{has3D});if(view==='3d'&&has3D)onMountCanvas?.(core.stage);else onReleaseCanvas?.();},coreControls);
  function confirmDelete(key) {
    const fn=()=>{const result=deleteRuntimeRun(storage,key);notice.textContent=result.notice||'已移除这一条运行记录。配置与学习记录保留。';renderHistory();};
    if(onConfirm)onConfirm('移除本地运行记录','仅移除选中的运行条目；不影响 Agent 配置、学习进度、Journal 或旧研究记录。',fn);else fn();
  }
  function renderHistory() {
    const data=readRuntimeHistory(storage);history.replaceChildren(h('h3',{},'最近运行'),h('p',{class:'rt-hint'},'当前浏览器最多保存 5 条。旧研究记录仍在 M0 执行台。'));
    if(data.notice)history.append(h('p',{class:'rt-notice'},esc(data.notice)));
    if(!data.runs.length&&!data.corrupt.length)history.append(h('p',{},'暂无运行记录。选择场景后逐步执行。'));
    for(const run of data.runs) {
      const row=h('div',{class:'rt-history-row'});
      const b=h('button',{class:'rt-history-item',type:'button','data-rt-history':run.runId},`${esc(RUNTIME_SCENARIOS.find(s=>s.id===run.scenarioId)?.label)} · ${esc(RUNTIME_STATUS[run.status])}<small>${esc(run.configSnapshot.name)} · ${run.summary.steps} 步 · 种子 ${esc(run.seed)}</small>`);
      b.onclick=()=>{
        stopTimer();if(rt?.getRun().status==='running'){rt.pause();save();}
        try {rt=restoreRuntime(run);scenario.value=run.scenarioId;seed.value=run.seed;role.value=run.options.collaboration;viewedHistory=true;selectedStep=null;selectedEvent=null;persistSelection();render();history.querySelector(`[data-rt-history="${CSS.escape(run.runId)}"]`)?.focus({preventScroll:true});}
        catch(error){notice.textContent=`无法恢复：${error.message}`;}
      };
      const remove=h('button',{class:'btn btn--sm btn--ghost',type:'button','aria-label':`删除运行 ${run.runId}`,'data-rt-delete':run.runId},'移除');remove.onclick=()=>confirmDelete(run.runId);row.append(b,remove);history.append(row);
    }
    for(const broken of data.corrupt){const row=h('div',{class:'rt-history-row'});row.append(h('p',{},esc(broken.reason)));const b=h('button',{class:'btn btn--sm',type:'button','data-rt-corrupt':broken.key},'移除损坏条目');b.onclick=()=>confirmDelete(broken.key);row.append(b);history.append(row);}
  }
  function jsonDetails(label,value,open=false){const d=h('details',open?{open:true}:{});d.append(h('summary',{},esc(label)),h('pre',{},esc(JSON.stringify(value,null,2))));return d;}
  function renderDetail(run,step) {
    detail.replaceChildren();
    if(!run){detail.append(h('h2',{},'观察规则如何变成行动'),h('p',{},'从构建器读取统一配置。选择本地场景，逐步查看工具、权限、证据检查和终止原因。'));return;}
    if(run.pendingApproval) {
      const p=run.pendingApproval,box=h('section',{class:'rt-approval',role:'region','aria-label':'模拟权限审批'},`<span class="tag tag--attention">等待模拟审批</span><h2>${esc(getModule(p.toolId)?.cn||p.toolId)}</h2><p>${esc(p.reason)}</p><dl class="kv"><dt>权限</dt><dd>${esc(p.requiredPermission)}</dd><dt>影响范围</dt><dd>${esc(p.scope)}</dd></dl>`);
      const ops=h('div',{class:'rt-controls'});
      button('批准本次模拟动作','approve',()=>action('approve'),ops);
      button('拒绝','reject',()=>action('reject'),ops);
      box.append(ops);detail.append(box);
    }
    if(!run.preflight.ready){detail.append(h('h2',{},'配置预检未通过'),h('p',{},'先回装配台修复错误，再建立新运行。'),jsonDetails('预检问题',run.preflight.issues,true));}
    if(step) {
      detail.append(h('div',{class:'section__label'},`<span>步骤 ${step.sequence} / ${run.configSnapshot.settings.maxSteps}</span><span>${esc(step.roleId||'单流程')}</span>`),h('h2',{},esc(actionLabels[step.action]||step.action)),h('p',{class:'rt-reason'},esc(step.reason)),h('p',{},`${esc(stepLabels[step.status]||step.status)} · ${esc(getModule(step.moduleId)?.cn||'运行控制')} · 重试 ${step.retryCount}`),h('p',{class:'rt-hint'},`下一动作 / 终止：${esc(actionLabels[step.next]||step.next||'等待审批回复')}`));
      const learn=h('button',{class:'btn btn--sm btn--ghost',type:'button','data-rt-concept':step.conceptId},'了解这一步的概念');learn.onclick=()=>{persistSelection();onOpenKnowledge?.(step.conceptId,/** @type {any} */({from:'runtime',runId:run.runId,stepId:step.stepId,eventSequence:selectedEvent}));};detail.append(learn);
      detail.append(jsonDetails('输入',step.input),jsonDetails('输出',step.output,true));
      const branch=h('section',{class:'rt-branches'},`<h3>分支轨迹</h3><p>已选择：${esc(step.branchId)} · ${esc(step.reason)}</p>`);
      for(const alternative of step.alternatives)branch.append(h('p',{class:'rt-hint'},`未执行：${esc(alternative.action)} — ${esc(alternative.reason)}`));detail.append(branch);
      const events=run.events.filter(e=>e.stepId===step.stepId);
      const eventList=h('div',{class:'rt-events','aria-label':'步骤事件'});
      for(const e of events) {const b=h('button',{type:'button',class:'rt-event','data-rt-event':e.sequence,'aria-pressed':selectedEvent===e.sequence},`#${e.sequence} ${esc(e.type)} · ${esc(e.status)}`);b.onclick=()=>{selectedEvent=e.sequence;persistSelection();render();el.querySelector(`[data-rt-event="${e.sequence}"]`)?.focus({preventScroll:true});};eventList.append(b);}
      detail.append(eventList);
      const e=events.find(e=>e.sequence===selectedEvent)||events.find(e=>e.type==='tool.error')||events.at(-1);
      if(e) {
        detail.append(jsonDetails('事件详情 / 输入输出 / 错误原因',e,true));
        for(const id of e.sourceIds){const source=getNotice(id);if(source)detail.append(h('p',{class:'rt-hint'},`虚构来源 ${esc(id)} · ${esc(source.title)}。发布机构和日期只在本次返回的 metadata 中可见。`));}
        core.render(run,e);onFocusScene?.(e.toolId?{moduleId:e.toolId,tone:e.status}:null);
      }
    } else detail.append(h('h2',{},'就绪：从接收任务开始'),h('p',{},'逐步执行每次只调度一个动作。连续运行也调用同一个调度器。'));
    const summary=h('section',{class:'rt-summary','aria-label':'运行摘要'});
    const sm=run.summary;
    summary.append(h('h3',{},'运行摘要'),h('dl',{class:'kv'},`<dt>状态</dt><dd>${esc(RUNTIME_STATUS[run.status])}</dd><dt>步骤 / 工具调用 / 重试</dt><dd>${sm.steps} / ${sm.toolCalls} / ${sm.retries}</dd><dt>审批请求 / 批准 / 拒绝</dt><dd>${sm.requests} / ${sm.approvals} / ${sm.denials}</dd><dt>证据声明 / 冲突</dt><dd>${sm.evidenceCount} / ${sm.conflictCount}</dd><dt>证据状态</dt><dd>${esc(evidenceLabels[sm.evidenceStatus])}</dd>`));
    if(run.result)summary.append(h('p',{class:'rt-conclusion'},esc(run.result.conclusion)),h('p',{},`终止原因：${esc(run.result.terminationReason)}`),jsonDetails('结果、引用与限制',run.result));
    summary.append(jsonDetails('实际经过的分支',sm.branches),jsonDetails('不可变配置快照 / 场景 / 种子',{configSnapshot:run.configSnapshot,scenarioId:run.scenarioId,seed:run.seed,runId:run.runId,engineVersion:run.engineVersion}),jsonDetails('角色交接产物',run.roleArtifacts));detail.append(summary);
  }
  function render() {
    const run=rt?.getRun(),state=run?.status||'ready';
    status.textContent=`${RUNTIME_STATUS[state]} · ${run?.configSnapshot.settings.executionMode||'读取当前配置'} · ${run?.summary.steps||0} 步${viewedHistory?' · 已恢复本地快照，未自动运行':''}`;
    const selectedScenario=RUNTIME_SCENARIOS.find(s=>s.id===(run?.scenarioId||scenario.value));status.title=selectedScenario.condition;
    el.dataset.status=state;
    for(const id of ['step','run','pause','resume','cancel','restart','export']) {
      buttons[id].disabled=!run||(id==='step'?!['ready','paused','running'].includes(state):id==='run'?state!=='ready':id==='pause'?state!=='running':id==='resume'?state!=='paused':id==='cancel'?!['ready','paused','running','waiting_approval'].includes(state):false);
    }
    timeline.replaceChildren(h('h3',{},'步骤时间线'),h('p',{class:'rt-hint'},esc(selectedScenario.condition)));
    for(const step of run?.steps||[]) {
      const b=h('button',{type:'button',class:'rt-step','data-rt-step':step.stepId,'aria-pressed':selectedStep===step.stepId||!selectedStep&&step===run.steps.at(-1)},`<small>${String(step.sequence).padStart(2,'0')} · ${esc(stepLabels[step.status]||step.status)}</small><b>${esc(actionLabels[step.action]||step.action)}</b><span>${esc(step.action)} · ${esc(step.roleId||getModule(step.moduleId)?.name||'运行控制')}</span>`);
      b.onclick=()=>{selectedStep=step.stepId;selectedEvent=null;persistSelection();render();el.querySelector(`[data-rt-step="${step.stepId}"]`)?.focus({preventScroll:true});};timeline.append(b);
    }
    const activeStep=run?.steps.find(s=>s.stepId===selectedStep)||run?.steps.at(-1);
    core.render(run||null,displayedEvent(run,activeStep));
    renderDetail(run,activeStep);renderHistory();persistSelection();publishPresentation(run,displayedEvent(run,activeStep));
  }
  return {el,coreStage:()=>core.stage,currentRun:()=>rt?.getRun()||null,controller:()=>rt,newRun,selection:()=>({runId:rt?.getRun().runId||null,stepId:selectedStep,eventSequence:selectedEvent,viewedHistory}),selectStep:id=>{selectedStep=id;selectedEvent=null;persistSelection();render();},
    onWebGLLost(){has3D=false;core.setView('2d',{has3D});onReleaseCanvas?.();},
    activate(){active=true;const saved=readRuntimeHistory(storage);notice.textContent=saved.notice||'';if(saved.runs.length){const stored=saved.runs.find(run=>run.runId===session.runId)||saved.runs[0],sameRun=session.runId===stored.runId;try{rt=restoreRuntime(stored);scenario.value=stored.scenarioId;seed.value=stored.seed;role.value=stored.options.collaboration;viewedHistory=sameRun?!!session.viewedHistory:true;if(!sameRun){selectedStep=null;selectedEvent=null;}}catch(error){notice.textContent=error.message;}}if(!rt)try{rt=createRuntime(getConfiguration());}catch(error){notice.textContent=error.message;}render();if(has3D)onMountCanvas?.(core.stage);},
    deactivate(){active=false;stopTimer();if(rt?.getRun().status==='running'){rt.pause();save();}persistSelection();onPresentation?.(null);onFocusScene?.(null);onReleaseCanvas?.();},
    dispose(){active=false;stopTimer();persistSelection();onPresentation?.(null);onReleaseCanvas?.();},
  };
}
