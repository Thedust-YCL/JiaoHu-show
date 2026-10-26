import { h, esc } from './dom.js';
import { configSummary, describeStatus } from '../model/validation.js';
import { getModule } from '../model/modules.js';
import { prepareSimulationInput } from '../model/configuration.js';

export function PreflightPanel({store,onFocusIssue,onSave,onRun}) {
  const c=store.getConfiguration(),result=store.preflight();
  const el=h('section',{class:'configuration-preflight','aria-label':'Configuration Preflight','data-ready':result.ready});
  el.append(h('div',{class:'section__label'},'<span>配置预检</span><span>CONFIGURATION PREFLIGHT</span>'),h('h2',{},esc(c.name)),h('p',{class:'explain'},`v${c.schemaVersion} · ${c.modules.length} 个模块 / ${result.summary.enabledCount} 已启用`),h('p',{class:`tag tag--${result.ready?'success':'error'}`,'data-preflight-result':'true'},result.ready?(result.counts.warning?'可供后续模拟使用 · 有警告':'满足后续模拟的最低条件'):`暂不能运行 · ${result.counts.error} 项错误`));
  el.append(h('p',{class:'note note--info'},'SIMULATION / 本地模拟，不连接真实 AI。进入执行检查器后选择场景并逐步观察。'),h('dl',{class:'kv'},`<dt>执行模式</dt><dd>${esc(c.settings.executionMode)}</dd><dt>最大步数 / 重试</dt><dd>${esc(c.settings.maxSteps)} / ${esc(c.settings.maxRetries)}</dd><dt>受限操作审批</dt><dd>${c.settings.requireApprovalForRestrictedActions?'需要':'未启用'}</dd><dt>证据不足时</dt><dd>${c.settings.stopWhenInsufficient?'停止':'保留限制并继续'}</dd>`));
  const summary=h('details',{});summary.append(h('summary',{},'模块与关键参数'));
  for(const m of c.modules)summary.append(h('div',{class:'preflight-module','data-preflight-module':m.moduleId},`<b>${esc(getModule(m.moduleId)?.name||m.moduleId)}</b> · ${esc(describeStatus(store.statusOf(m.moduleId)).cn)}<dl class="kv">${configSummary(m,c).map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`));
  el.append(summary,h('p',{class:'preflight-counts'},`错误 ${result.counts.error} · 警告 ${result.counts.warning} · 提示 ${result.counts.info}`));
  for(const issue of result.issues) {
    const row=h('button',{class:`preflight-issue preflight-issue--${issue.level}`,type:'button','data-issue-id':issue.id,'data-issue-module':issue.moduleId,'data-issue-field':issue.field},`<b>${issue.level.toUpperCase()} · ${esc(issue.title)}</b><span>${esc(issue.suggestion)}</span>`);
    row.onclick=()=>onFocusIssue?.(issue);el.append(row);
  }
  const save=h('button',{class:'btn btn--primary',type:'button','data-preflight-save':'true'},'保存配置');save.onclick=onSave;el.append(save);
  const run=h('button',{class:'btn btn--primary',type:'button','data-preflight-run':'true',disabled:!result.ready},'进入 Runtime 检查器');run.onclick=()=>onRun?.();el.append(run);
  const data=h('details',{});data.append(h('summary',{},'M2.2 配置接口快照（只读）'),h('pre',{},esc(JSON.stringify(prepareSimulationInput(c),null,2))));el.append(data);
  return el;
}
