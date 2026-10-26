// @ts-check
import {h,esc} from '../../constructor/components/dom.js';
import {createExperiment,runExperiment,rerunExperiment,copyExperiment,copyVariant,configurationDiff,reproducibility,APPROVAL_POLICIES} from '../model/experiment.js';
import {runtimeReport,resolveCitation,currentDataset} from '../model/report.js';
import {snapshotProjection} from '../model/projection.js';
import {SystemGraph} from '../../constructor/views/systemView.js';
import {getModule} from '../../constructor/model/modules.js';
import {createExecutionCore} from '../../execution/components/executionCore.js';
import {createReportView} from '../../reports/components/reportView.js';
import {RUNTIME_SCENARIOS,RUNTIME_STATUS} from '../../../simulation/engine/runtimeScenarios.js';
import {createArchive,ARCHIVE_LIMITS} from '../state/archive.js';
import {downloadExperiment,valueText} from '../export/markdown.js';
const labels={equal:'相同',changed:'不同',different:'不同',added:'B 新增',missing:'B 未执行',unavailable:'N/A', 'not-comparable':'不可直接比较'};
const txt=(tag,text,attrs={})=>h(tag,{...attrs,text:valueText(text)});

/** Session outlives the workspace when visiting knowledge or editing the existing Constructor.
 * @param {import('../model/types.js').ComparisonWorkspaceOptions} options */
export function createComparisonWorkspace({store,session={},onBack,onEdit,onKnowledge,onConfirm,onMountCanvas,onReleaseCanvas,onSnapshot,onFocus,has3D=false,reducedMotion=false}={}){
  const archive=createArchive();
  session.drafts??={A:store.getConfiguration(),B:copyVariant(store.getConfiguration())};
  session.side??='A';session.tab??='config';session.events??={A:null,B:null};session.scrolls??={};
  if(session.editingSide){session.drafts[session.editingSide]=store.getConfiguration();session.side=session.editingSide;delete session.editingSide;session.tab='config';}
  const el=h('div',{class:'workspace comparison-workspace','data-open':'true'});
  const head=h('header',{class:'ws-head'},'<div class="ws-head__id"><span class="ws-head__tag">A/0</span><span class="ws-head__title">A/B · 架构对比</span><span class="ws-head__meta">SIMULATION / 本地模拟</span></div>');
  const headOps=h('div',{class:'ws-head__actions'});head.append(headOps);
  const toolbar=h('div',{class:'ab-toolbar'}),tabs=h('div',{class:'ab-tabs',role:'tablist','aria-label':'对比工作区'}),notice=txt('p','',{class:'ab-notice',role:'status','aria-live':'polite'});
  const body=h('div',{class:'ab-body'}),main=h('main',{class:'ab-main'}),inspector=h('aside',{class:'ab-inspector','aria-label':'选中侧执行检查器'});
  const inspection=h('div',{class:'ab-inspection'}),core=createExecutionCore();core.setView(has3D?'3d':'2d',{has3D});
  const snapshotView=h('div',{class:'ab-system'}),coreHead=h('div',{class:'ab-core-ops'});
  inspector.append(coreHead,core.el,snapshotView,inspection);body.append(main,inspector);el.append(head,toolbar,tabs,notice,body);
  let active=true,timer=null,busy=false,fullReport=null;
  const button=(parent,label,id,fn)=>{const b=txt('button',label,{type:'button',class:'btn btn--sm btn--ghost','data-ab-act':id});b.onclick=()=>{if(!busy)fn();};parent.append(b);return b;};
  const message=text=>{notice.textContent=text;};
  const current=()=>session.experiment||null;
  const snapshot=side=>current()?.[side].configSnapshot||session.drafts[side];
  const run=side=>current()?.[side].run||null;
  const selected=side=>run(side)?.events.find(e=>e.eventId===session.events[side])||null;
  const stop=()=>{if(timer!==null)clearInterval(timer);timer=null;};
  function preserveScroll(){for(const s of ['A','B']){const node=main.querySelector(`[data-ab-trace="${s}"]`);if(node)session.scrolls[s]=node.scrollTop;}session.scrolls.main=main.scrollTop;}
  function setTab(tab){preserveScroll();stop();session.tab=tab;fullReport=null;render();}
  button(headOps,'装配台','constructor',()=>onBack?.());
  button(headOps,'新建实验','new',()=>{stop();session.experiment=null;session.drafts={A:store.getConfiguration(),B:copyVariant(store.getConfiguration())};session.events={A:null,B:null};session.tab='config';render();});
  button(headOps,'保存实验','save',async()=>{if(!current()){message('先运行配对实验，再保存配置快照与轨迹。');return;}message((await archive.save(current())).notice);});
  button(headOps,'下载 Markdown','export',()=>{if(!current())return message('先运行配对实验以生成对比报告。');message(downloadExperiment(current()).message);});
  button(headOps,'按原条件重跑','rerun',()=>{if(!current())return message('尚无可重跑实验。');try{session.experiment=rerunExperiment(current());session.events={A:null,B:null};session.tab='trace';render();message('已创建新实验与独立 Run；原档案未被覆盖。');}catch(error){message(error.message);}});
  for(const [id,label] of [['config','01 配置'],['trace','02 指标与轨迹'],['report','03 研究报告'],['archive','04 实验档案']])button(tabs,label,`tab-${id}`,()=>setTab(id));
  tabs.querySelectorAll('button').forEach(b=>b.setAttribute('role','tab'));
  tabs.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...tabs.querySelectorAll('button')];const index=buttons.indexOf(document.activeElement);const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next].click();buttons[next].focus();};
  const title=txt('input','',{'aria-label':'实验名称',maxlength:80,value:session.title||'公告研究 A/B 实验'});
  title.onchange=()=>{session.title=title.value;};
  const controls=session.controls??={...currentDataset(),scenarioId:'NORMAL_PATH',seed:'0',approvalPolicyId:'approve-all',collaboration:'single'};
  function choice(label,key,options){const input=h('select',{'aria-label':label});for(const [value,name] of options)input.append(txt('option',name,{value}));input.value=controls[key];input.onchange=()=>{controls[key]=input.value;};const wrap=txt('label',label);wrap.append(input);toolbar.append(wrap);return input;}
  const nameWrap=txt('label','实验名称');nameWrap.append(title);toolbar.append(nameWrap);
  choice('共同场景','scenarioId',RUNTIME_SCENARIOS.map(s=>[s.id,s.label]));
  const seed=txt('input','',{'aria-label':'共同种子',value:controls.seed,maxlength:80});seed.onchange=()=>{controls.seed=seed.value;};const seedWrap=txt('label','共同种子');seedWrap.append(seed);toolbar.append(seedWrap);
  choice('共同审批脚本','approvalPolicyId',Object.entries(APPROVAL_POLICIES));
  choice('共同角色模式','collaboration',[['single','单流程'],['sequential','三角色交接']]);
  const runButton=button(toolbar,'RUN A + B · 配对运行','run',async()=>{
    stop();busy=true;runButton.disabled=true;message('正在按两份快照运行同一 Runtime…');
    try{await new Promise(resolve=>setTimeout(resolve,0));const e=createExperiment({A:session.drafts.A,B:session.drafts.B,controls:{...controls,seed:seed.value},title:title.value});session.experiment=runExperiment(e);session.events={A:null,B:null};session.tab='trace';fullReport=null;render();message(session.experiment.comparison.strict?'已生成两次独立模拟；指标来自真实事件，未作优劣排名。':'一侧未生成运行；已保留独立预检问题及 N/A。');}catch(error){message(`未能运行：${error.message}`);}finally{busy=false;runButton.disabled=false;}
  });runButton.classList.add('btn--primary');
  for(const side of ['A','B'])button(coreHead,`观察 ${side}`,`side-${side}`,()=>selectSide(side));
  button(coreHead,'3D','3d',()=>{core.setView('3d',{has3D});if(has3D)onMountCanvas?.(core.stage);});
  button(coreHead,'2D','2d',()=>{core.setView('2d',{has3D});onReleaseCanvas?.();});

  function selectSide(side){session.side=side;renderInspector();renderSelection();}
  function selectEvent(side,id,{linked=session.linked}={}){
    session.side=side;session.events[side]=id;
    if(linked){const row=current()?.alignment.find(x=>x[side]===id),other=side==='A'?'B':'A';session.events[other]=row?.[other]||null;}
    renderInspector();renderSelection();
  }
  function renderSelection(){
    el.dataset.side=session.side;
    for(const s of ['A','B']){el.querySelector(`[data-ab-act="side-${s}"]`)?.setAttribute('aria-pressed',String(session.side===s));for(const b of main.querySelectorAll(`[data-ab-event-side="${s}"]`))b.setAttribute('aria-pressed',String(b.dataset.abEvent===session.events[s]));}
  }
  function disclosure(label,value,parent=inspection){const d=h('details');d.append(txt('summary',label),txt('pre',JSON.stringify(value,null,2)));parent.append(d);return d;}
  function renderInspector(){
    const side=session.side,c=snapshot(side),r=run(side),event=selected(side),step=r?.steps.find(s=>s.stepId===event?.stepId);
    inspection.replaceChildren(txt('h3',`${side} / ${c.name}`),txt('p',`配置快照 ${c.configId} · ${r?.runId||'尚未运行'}`,{class:'ab-hint'}));
    const projection=snapshotProjection(c,id=>{session.moduleId=id;session.events[side]=null;renderInspector();renderSelection();requestAnimationFrame(()=>[...snapshotView.querySelectorAll('[data-node]')].find(node=>node.dataset.node===id)?.focus({preventScroll:true}));});
    const graph=SystemGraph({store:projection,readOnly:true});snapshotView.replaceChildren(graph.el);graph.render();graph.setSelection(step?.moduleId||session.moduleId);
    const moduleId=event?.toolId||step?.moduleId||session.moduleId||null;
    onSnapshot?.(c,projection,side);core.render(r,event);onFocus?.({moduleId,tone:event?.status||'info',paused:timer===null||reducedMotion});
    if(moduleId){const m=c.modules.find(m=>m.moduleId===moduleId);inspection.append(txt('h4',getModule(moduleId)?.cn||moduleId),txt('p',`模块状态：${projection.statusOf(moduleId)}`));disclosure('当时模块配置',m);const concept=getModule(moduleId)?.conceptIds?.[0]||step?.conceptId||'tool_calling';button(inspection,'查看相关知识','module-knowledge',()=>onKnowledge?.(concept));}
    if(!event)inspection.append(txt('p','选择任一侧的真实事件查看输入、输出和规则。联动选择时，对侧缺少事件会显示“未执行该步骤”。'));
    else{
      inspection.append(txt('h4',`${event.sequence} · ${event.type}`),txt('p',event.reason),txt('p',`状态 ${event.status} · 角色 ${event.roleId||'单流程'} · ${event.eventId}`,{class:'ab-hint'}));
      disclosure('输入',event.input);disclosure('输出',event.output);disclosure('分支与未执行的备用路径',step?{chosen:step.branchId,reason:step.reason,alternatives:step.alternatives}:null);
      for(const id of event.sourceIds||[])inspection.append(txt('p',`资料 ${id}`,{class:'ab-hint'}));
      const row=current()?.alignment.find(x=>x[side]===event.eventId),other=side==='A'?'B':'A';
      inspection.append(txt('p',row?.[other]?`${other} 存在可比较事件`:`${other} 未执行该步骤`));
      if(row?.[other])button(inspection,`定位 ${other} 对应事件`,'counterpart',()=>selectEvent(other,row[other],{linked:false}));
      button(inspection,'了解这一步的概念','event-knowledge',()=>onKnowledge?.(step?.conceptId||'tracing'));
    }
    if(r){inspection.append(txt('p',`终态：${RUNTIME_STATUS[r.status]} · ${r.result?.terminationReason}`));disclosure('每侧实际审批输入',current()[side].approvalInputs);}
  }

  function configurationPanel(){
    main.append(txt('p','BUILD → RUN → INSPECT → COMPARE → REBUILD',{class:'ab-eyebrow'}));
    main.append(txt('h2','先改变一个条件，再观察执行为何改变。'));
    const columns=h('div',{class:'ab-columns'});
    for(const side of /** @type {const} */ (['A','B'])){
      const c=session.drafts[side],panel=h('section',{class:'ab-column','data-ab-config':side});panel.append(txt('h3',`${side} / ${side==='A'?'BASELINE':'VARIANT'}`),txt('p',c.name));
      const select=h('select',{'aria-label':`${side} 选择已有配置`});select.append(txt('option','选择本地已保存配置…',{value:''}));for(const config of store.listConfigurations())select.append(txt('option',config.name,{value:config.configId}));
      select.onchange=()=>{const config=store.getSavedConfiguration(select.value);if(config){session.drafts[side]=config;render();}};panel.append(select);
      button(panel,'使用当前装配配置',`capture-${side}`,()=>{session.drafts[side]=store.getConfiguration();render();});
      button(panel,'复制并到装配台编辑',`edit-${side}`,()=>onEdit?.(c,()=>{session.editingSide=side;}));
      if(side==='B')button(panel,'复制 A 为 B','copy-A',()=>{session.drafts.B=copyVariant(session.drafts.A);render();});
      const preflight=snapshotProjection(c).preflight();panel.append(txt('p',`${preflight.ready?'预检通过':'预检阻断'} · ${preflight.counts.error} 错误 / ${preflight.counts.warning} 警告`));
      for(const issue of preflight.issues.filter(i=>i.level!=='info'))panel.append(txt('p',issue.description,{class:'ab-warning'}));
      disclosure('启用模块与 Runtime 策略',{modules:c.modules.map(m=>({module:m.moduleId,enabled:m.enabled})),runtime:c.settings},panel);columns.append(panel);
    }
    main.append(columns);
    const differences=configurationDiff(session.drafts.A,session.drafts.B),changed=differences.filter(x=>!x.equal);
    main.append(txt('h3',`配置差异 · ${changed.length} 项不同 / ${differences.length-changed.length} 项相同`));
    const all=h('details');all.append(txt('summary','展开相同字段'));const table=h('table',{class:'ab-table'},'<thead><tr><th>字段</th><th>A</th><th>B</th></tr></thead>');const tbody=h('tbody');table.append(tbody);main.append(table);
    for(const d of differences){const row=h('tr');for(const value of [d.field,valueText(d.A),valueText(d.B)])row.append(txt('td',value));if(d.equal)all.append(row);else tbody.append(row);}
    if(!changed.length)main.append(txt('p','两套配置没有语义差异；允许产生相同的轨迹与结果。'));
    // Same fields use a separate semantic table inside the disclosure.
    const equalTable=h('table',{class:'ab-table'});const equalRows=[...all.querySelectorAll('tr')];equalTable.append(...equalRows);all.append(equalTable);main.append(all);
    main.append(txt('p',`共同任务 ${controls.taskId} · 资料 ${controls.datasetId}@${controls.datasetVersion} · 审批：${APPROVAL_POLICIES[controls.approvalPolicyId]}`,{class:'ab-hint'}));
    if(current())main.append(txt('p','下方 Inspector 当前展示上次运行的不可变快照。新编辑只在下一次配对运行生效。',{class:'ab-warning'}));
  }
  function eventButton(parent,side,event){
    const b=button(parent,`#${event.sequence} ${event.type} · ${event.status}`,`event-${side}-${event.sequence}`,()=>selectEvent(side,event.eventId));
    b.className='ab-event';b.dataset.abEvent=event.eventId;b.dataset.abEventSide=side;
    b.append(txt('small',event.reason||event.message));return b;
  }
  function tracePanel(){
    const e=current();if(!e){main.append(txt('h2','尚未运行'),txt('p','先选择 A/B 配置与共同条件，再运行配对实验。'));return;}
    main.append(txt('h2',e.title),txt('p',`${e.comparison.strict?'相同控制条件':'非严格对比'} · ${e.controls.scenarioId} · seed ${e.controls.seed} · ${e.controls.datasetVersion}`,{class:'ab-hint'}));
    for(const w of e.comparison.warnings)main.append(txt('p',w,{class:'ab-warning'}));
    const mt=h('table',{class:'ab-table ab-metrics'},'<thead><tr><th>指标 / 口径</th><th>A</th><th>B</th><th>B − A</th></tr></thead>');const mb=h('tbody');mt.append(mb);
    for(const metric of e.comparison.metrics){const row=h('tr');const name=txt('th',metric.definition,{scope:'row'});name.append(txt('small',metric.algorithm));row.append(name);
      for(const side of ['A','B']){const cell=h('td');const b=button(cell,valueText(metric[side].value),`metric-${metric.metricId}-${side}`,()=>{const id=metric[side].eventIds.at(-1);if(id)selectEvent(side,id,{linked:false});else selectSide(side);if(metric.metricId==='coverage'||metric.metricId==='citations')setTab('report');message(`${metric.algorithm}；${metric.explanation}`);});b.title=metric.algorithm;row.append(cell);}row.append(txt('td',metric.delta===null?labels[metric.status]:`${metric.delta>0?'+':''}${metric.delta}`));mb.append(row);}
    const readout=h('div',{class:'ab-readout'});
    for(const id of ['steps','toolCalls','coverage']){const m=e.comparison.metrics.find(m=>m.metricId===id),cell=h('div');cell.append(txt('small',m.definition),txt('p',`A ${valueText(m.A.value)} / B ${valueText(m.B.value)}`));readout.append(cell);}main.append(readout);
    const metricDetails=h('details',{'data-ab-metrics':true,open:session.metricsOpen});metricDetails.append(txt('summary',`展开 ${e.comparison.metrics.length} 项指标、口径与事件定位`),mt,txt('p','每项指标均可点击定位来源事件。额外核验可能增加调用，不代表某一侧必然更好。',{class:'ab-hint'}));metricDetails.ontoggle=()=>{session.metricsOpen=metricDetails.open;};main.append(metricDetails);
    const ops=h('div',{class:'ab-controls'});button(ops,'Side-by-side · 双栏','view-side',()=>{session.difference=false;render();});button(ops,'Difference View · 差异','view-diff',()=>{session.difference=true;render();});
    const linked=h('input',{type:'checkbox','aria-label':'联动定位对应事件',checked:session.linked});linked.onchange=()=>{session.linked=linked.checked;};const ll=txt('label','联动定位');ll.prepend(linked);ops.append(ll);
    const replay=button(ops,'播放已保存轨迹','play',()=>{if(timer!==null){stop();replay.textContent='播放已保存轨迹';onFocus?.({moduleId:selected(session.side)?.toolId,paused:true});return;}replay.textContent='暂停回放';timer=setInterval(()=>seek(1,true),800/(session.speed||1));});
    button(ops,'上一事件','previous',()=>seek(-1));button(ops,'下一事件','next',()=>seek(1));
    const speed=h('select',{'aria-label':'回放速度'});for(const v of [0.5,1,2,4])speed.append(txt('option',`${v}×`,{value:v}));speed.value=session.speed||1;speed.onchange=()=>{session.speed=Number(speed.value);stop();replay.textContent='播放已保存轨迹';};ops.append(speed);main.append(ops);
    if(session.difference){const diff=h('div',{class:'ab-difference'});for(const row of e.alignment){if(row.status==='equal'&&!session.showEqual)continue;const wrap=h('div',{class:'ab-diff-row','data-diff-status':row.status});wrap.append(txt('p',`${labels[row.status]} · ${row.reason}`));for(const side of ['A','B']){const ev=run(side)?.events.find(x=>x.eventId===row[side]);if(ev)eventButton(wrap,side,ev);else wrap.append(txt('p',`${side} 未执行该步骤`));}diff.append(wrap);}if(!diff.childNodes.length)diff.append(txt('p','没有不同事件。相同配置的语义结果可以相同。'));main.append(diff);button(main,session.showEqual?'隐藏相同事件':'同时查看相同事件','show-equal',()=>{session.showEqual=!session.showEqual;render();});}
    else{const cols=h('div',{class:'ab-columns'});for(const side of ['A','B']){const panel=h('section',{class:'ab-column'});panel.append(txt('h3',`${side} / ${snapshot(side).name}`),txt('p',run(side)?`${RUNTIME_STATUS[run(side).status]} · ${run(side).result?.terminationReason}`:'未运行 · 预检未通过'));
      const list=h('div',{class:'ab-trace','data-ab-trace':side,tabindex:0,'aria-label':`${side} 执行轨迹`});for(const ev of run(side)?.events||[])eventButton(list,side,ev);panel.append(list);cols.append(panel);requestAnimationFrame(()=>{list.scrollTop=session.scrolls[side]||0;});}main.append(cols);}
  }
  function seek(delta,playing=false){const side=session.side,events=run(side)?.events||[],index=events.findIndex(e=>e.eventId===session.events[side]);const next=Math.max(0,Math.min(events.length-1,index+delta));if(events[next])selectEvent(side,events[next].eventId);if(playing&&next===events.length-1){stop();renderInspector();main.querySelector('[data-ab-act="play"]').textContent='播放已保存轨迹';}}
  function reportPanel(){
    if(!current())return main.append(txt('p','尚无研究报告。先运行配对实验。'));
    if(fullReport){renderFullReport(fullReport);return;}
    const cols=h('div',{class:'ab-columns'});
    for(const side of ['A','B']){const panel=h('section',{class:'ab-column','data-ab-report':side}),s=current()[side];panel.append(txt('h3',`${side} / 研究报告`),txt('p',`${s.report?.status||'未生成'} · ${s.run?.result?.terminationReason||'未运行'}`),txt('p',s.run?.result?.conclusion||'预检未通过，没有完整研究结论。'));
      if(s.report){for(const claim of s.report.claims.filter(c=>c.kind==='finding')){const block=h('div',{class:'ab-finding'});block.append(txt('p',claim.text),txt('small',`${claim.status} · ${claim.id}`));for(const id of claim.citationIds)button(block,`[${id}]`,`cite-${side}-${id}`,()=>showCitation(side,id));panel.append(block);}panel.append(txt('h4','局限与未解决项'));for(const text of s.report.limitations)panel.append(txt('p',text,{class:'ab-hint'}));button(panel,'打开完整 Research Report',`full-report-${side}`,()=>{fullReport=side;render();});}cols.append(panel);}
    main.append(cols);
  }
  function showCitation(side,id){
    selectSide(side);const s=current()[side],resolved=resolveCitation(s.run,s.report,id);inspection.replaceChildren(txt('h3',`${side} / 引用 ${id}`),txt('p',resolved.reason));
    if(!resolved.valid)return;
    const c=resolved.citation;inspection.append(txt('p',`虚构教学资料 · ${c.sourceId} → ${c.chunkId} → ${c.eventId}`,{class:'ab-hint'}),txt('blockquote',resolved.chunk.text),txt('p',`引用位置：${c.excerpt}`));
    disclosure('本次实际可见元数据',resolved.event.output.metadata);
    button(inspection,'定位本次读取事件','citation-event',()=>{selectEvent(side,c.eventId,{linked:false});setTab('trace');});
    button(inspection,'返回报告','back-report',()=>setTab('report'));
  }
  function renderFullReport(side){
    const s=current()[side],p=runtimeReport(s.run),viewRun={...s.run,artifacts:{evidence:p.evidence,reads:p.reads,report:s.report},stats:s.run.summary};
    const view=createReportView({getRun:()=>viewRun,mission:{title:s.run.result.objective,getNotice:id=>p.reads.find(r=>r.sourceId===id)},onViewEvent:id=>{selectEvent(side,id,{linked:false});setTab('trace');},onSwitchMode:()=>setTab('report')});
    button(main,'返回双栏报告','back-report',()=>{fullReport=null;render();});view.render({run:viewRun,report:s.report,metrics:{...s.report.metrics,...s.run.summary,eventCount:s.run.events.length},context:{}});main.append(view.el);
  }
  async function archivePanel(){
    main.append(txt('h2','本地实验档案'),txt('p',`仅当前浏览器 · 最多 ${ARCHIVE_LIMITS.rows} 条 / 20 MiB · 不自动淘汰。删除只影响选中的实验档案。`,{class:'ab-hint'}));
    const list=h('div',{class:'ab-archive-list'});main.append(list);list.append(txt('p','正在读取本地档案…'));const data=await archive.list();if(!active||session.tab!=='archive')return;
    list.replaceChildren();if(data.notice)list.append(txt('p',data.notice,{class:'ab-warning'}));if(!data.experiments.length)list.append(txt('p','暂无实验档案。运行后点击“保存实验”，即可在此重新打开。'));
    for(const e of data.experiments){const row=h('section',{class:'ab-archive-row','data-ab-archive':e.experimentId}),exact=reproducibility(e);row.append(txt('h3',e.title),txt('p',`${e.createdAt} · ${e.controls.scenarioId} · ${exact.exact?'可精确复现':'不可精确复现'}`,{class:'ab-hint'}),txt('p',`A ${e.A.configSnapshot.name} / ${e.A.run?.status||'未运行'} · B ${e.B.configSnapshot.name} / ${e.B.run?.status||'未运行'}`));
      const name=h('input',{'aria-label':`重命名 ${e.title}`,value:e.title,maxlength:80});row.append(name);
      button(row,'打开','archive-open',()=>{session.experiment=e;session.events={A:null,B:null};session.drafts={A:e.A.configSnapshot,B:e.B.configSnapshot};Object.assign(controls,e.controls);title.value=session.title=e.title;seed.value=String(controls.seed);for(const [key,label] of [['scenarioId','共同场景'],['approvalPolicyId','共同审批脚本'],['collaboration','共同角色模式']])toolbar.querySelector(`[aria-label="${label}"]`).value=controls[key];session.tab='trace';render();message(exact.exact?'已打开不可变实验快照；配置页可复制这些历史快照到装配台编辑。':`旧版本摘要可浏览；${exact.reasons.join('；')}`);});
      button(row,'重命名','archive-rename',async()=>{message((await archive.rename(e.experimentId,name.value)).notice);render();});
      button(row,'复制','archive-copy',async()=>{message((await archive.save(copyExperiment(e))).notice);render();});
      button(row,'重跑','archive-rerun',()=>{try{session.experiment=rerunExperiment(e);session.tab='trace';session.events={A:null,B:null};render();}catch(error){message(error.message);}}).disabled=!exact.exact;
      button(row,'删除','archive-delete',()=>confirmRemoval(e.experimentId,e.title));list.append(row);
    }
    for(const broken of data.corrupt){const row=h('section',{class:'ab-archive-row'});row.append(txt('p',broken.reason));button(row,'删除此损坏条目','archive-corrupt-delete',()=>confirmRemoval(broken.experimentId,'损坏条目'));list.append(row);}
  }
  function confirmRemoval(id,name){const fn=async()=>{message((await archive.remove(id)).notice);render();};if(onConfirm)onConfirm('删除实验档案',`仅删除“${name}”及档案内的 A/B 快照与运行副本。不会删除构建器配置、Journal、学习进度或独立 Runtime 历史。`,fn);}
  function render(){stop();preserveScroll();main.replaceChildren();for(const b of tabs.querySelectorAll('button')){const selected=b.dataset.abAct===`tab-${session.tab}`;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;}
    if(session.tab==='config')configurationPanel();else if(session.tab==='trace')tracePanel();else if(session.tab==='report')reportPanel();else archivePanel();
    renderInspector();renderSelection();main.scrollTop=session.scrolls.main||0;
  }
  return {el,currentExperiment:current,session,archive,selectEvent,selectSide,showCitation,render,
    activate(){active=true;render();if(has3D&&core.getView()==='3d')onMountCanvas?.(core.stage);},
    deactivate(){preserveScroll();stop();active=false;onReleaseCanvas?.();onSnapshot?.(null);onFocus?.(null);},
    dispose(){stop();active=false;},
  };
}
