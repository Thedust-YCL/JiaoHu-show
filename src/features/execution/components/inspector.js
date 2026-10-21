/**
 * src/features/execution/components/inspector.js
 * ------------------------------------------------------------------
 * EVENT INSPECTOR：当前事件的完整说明。
 *
 * 至少显示（M0.3_TASK §8.3）：序号、事件类型、可读短说明、状态、参与者、
 * 输入 / 输出（可折叠）、工具 ID、资料引用、触发分支与规则说明。
 * 所有数据层文本用 textContent 写入，绝不做 HTML 注入。
 * ------------------------------------------------------------------
 */
import { h, esc } from '../../constructor/components/dom.js';
import { BRANCHES } from '../../../simulation/rules/branches.js';
import { outcomeMeta } from '../../../simulation/events/schema.js';
import { eventMetaTable, outcomeBar, payloadBlock, statusChip } from './eventView.js';

export function createEventInspector({ onOpenKnowledge, onLocateModule } = {}) {
  const el = h('aside', { class: 'ex-inspector surface', 'aria-label': '事件检视面板' });
  const head = h('div', { class: 'panel-head' }, `
    <span class="panel-head__title">EVENT INSPECTOR</span>
    <span class="tag tag--muted" data-el="pos">—</span>`);
  const body = h('div', { class: 'ex-inspector__scroll' });
  el.append(head, body);

  function render(run, index) {
    body.replaceChildren();
    body.scrollTop = 0;
    if (!run || !run.events.length) {
      body.append(
        h('div', { class: 'note' }, `
          <span class="note__key">无轨迹</span>
          <span>还没有运行记录：点击 New Run 会用装配台当前配置生成一条新的事件轨迹。历史轨迹不会被重算或猜测。</span>`)
      );
      head.querySelector('[data-el="pos"]').textContent = '—';
      return;
    }
    const event = run.events[Math.max(0, Math.min(run.events.length - 1, index))];
    head.querySelector('[data-el="pos"]').textContent = `#${String(event.sequence).padStart(2, '0')} / ${run.events.length}`;

    const branch = BRANCHES[event.branchId] || null;
    body.append(
      h('div', { class: 'ev-detail__hero', 'data-event': event.id, 'data-status': event.status }, `
        <div class="inspector__eyebrow">
          <span>EVENT</span><span aria-hidden="true">/</span><span>${esc(event.id)}</span>
        </div>
        <h2 class="inspector__title">#${String(event.sequence).padStart(2, '0')} · ${esc(event.type)}</h2>
        <div class="inspector__sub">${esc(event.message)}</div>
        <div class="chips">${statusChip(event.status).outerHTML}<span class="tag tag--muted">${esc(event.phase)}</span></div>`),
      eventMetaTable(event, run)
    );

    if (branch) {
      body.append(
        h('div', { class: 'section' }, `
          <div class="section__label"><span>为什么走到这一步</span><span>分支规则</span></div>
          <div class="kv">
            <dt>分支</dt><dd>${esc(branch.cn)}</dd>
            <dt>触发条件</dt><dd>${esc(branch.condition)}</dd>
            <dt>预期结果</dt><dd>${esc(branch.expect)}</dd>
            <dt>规则标识</dt><dd class="mono">${esc(event.ruleId || '—')}</dd>
          </div>`)
      );
    }

    const inPayload = event.inputRef ? run.artifacts.payloads[event.inputRef] : null;
    const outPayload = event.outputRef ? run.artifacts.payloads[event.outputRef] : null;
    if (inPayload) body.append(payloadBlock('输入载荷', event.inputRef, inPayload));
    if (outPayload) body.append(payloadBlock('输出载荷', event.outputRef, outPayload, { open: true }));
    if (!inPayload && !outPayload) {
      body.append(h('div', { class: 'note' }, `<span class="note__key">无载荷</span><span>这一步只记录状态与原因，没有工具输入输出。</span>`));
    }

    if (event.toolId) {
      const actions = h('div', { class: 'chips', style: 'margin-top:8px' });
      const learn = h('button', { class: 'btn btn--sm', type: 'button', 'data-act': 'open-knowledge' }, 'Tool Calling 知识节点');
      learn.addEventListener('click', () => onOpenKnowledge?.('tool_calling', { from: 'execution', eventSequence: event.sequence }));
      const locate = h('button', { class: 'btn btn--sm btn--ghost', type: 'button', 'data-act': 'locate-module' }, '在装配台中定位该工具');
      locate.addEventListener('click', () => onLocateModule?.(event.toolId));
      actions.append(learn, locate);
      body.append(actions);
    }

    body.append(outcomeBar(run));
    body.append(
      h('div', { class: 'section' }, `
        <div class="section__label"><span>本次运行产出</span><span>不是报告</span></div>
        <div class="kv">
          <dt>任务</dt><dd>${esc(run.missionId)}@${run.missionVersion} · 语料 ${esc(run.corpusVersion || '—')}</dd>
          <dt>样本资料</dt><dd>${run.artifacts.evidence.level ? `${esc(run.artifacts.evidence.levelCn || run.artifacts.evidence.level)} · ${esc((run.artifacts.evidence.sourceIds || []).join('、') || '—')}` : '未取得样本资料'}</dd>
          <dt>报告</dt><dd>${esc(run.artifacts.report.note)}</dd>
          <dt>结局</dt><dd>${esc(outcomeMeta(run.outcome).cn)}（${esc(run.outcome)}）</dd>
        </div>`)
    );
    const notes = h('div', { class: 'section' });
    notes.append(h('div', { class: 'section__label' }, '<span>声明</span>'));
    for (const note of run.notes || []) {
      notes.append(h('div', { class: 'note', style: 'margin-bottom:6px' }, `<span class="note__key">说明</span><span>${esc(note)}</span>`));
    }
    body.append(notes);
  }

  return { el, render };
}
