/**
 * src/features/execution/components/inspector.js
 * ------------------------------------------------------------------
 * EVENT INSPECTOR：当前事件的完整说明。
 *
 * 至少显示：序号、事件类型、可读短说明、状态、参与者、输入 / 输出
 * （可折叠）、工具 ID、资料引用、触发分支与规则说明。
 *
 * M0.4 增量：
 *   · 证据 / 决策类事件额外显示「参与本次判断的可见声明」与
 *     「必要条件逐条通过 / 未通过」，让核验结论可检查（D05 / D06）；
 *   · 运行产出区显示报告状态，并提供「打开报告」入口。
 *
 * 所有数据层文本用 textContent 写入，绝不做 HTML 注入。
 * ------------------------------------------------------------------
 */
import { h, esc } from '../../constructor/components/dom.js';
import { BRANCHES, EVIDENCE_BRANCHES } from '../../../simulation/rules/branches.js';
import { outcomeMeta } from '../../../simulation/events/schema.js';
import { PREDICATE_LABEL } from '../../../simulation/rules/evidence/claims.js';
import { eventMetaTable, outcomeBar, payloadBlock, statusChip } from './eventView.js';

export function createEventInspector({ onOpenKnowledge, onLocateModule, onOpenReport } = {}) {
  const el = h('aside', { class: 'ex-inspector surface', 'aria-label': '事件检视面板' });
  const head = h('div', { class: 'panel-head' }, `
    <span class="panel-head__title">EVENT INSPECTOR</span>
    <span class="tag tag--muted" data-el="pos">—</span>`);
  const body = h('div', { class: 'ex-inspector__scroll' });
  el.append(head, body);

  /** 参与本次判断的可见声明：只读本次 Run 的证据产物 */
  function claimsSection(run, claimIds) {
    const claims = (run.artifacts?.evidence?.claims || []).filter((c) => claimIds.includes(c.claimId));
    if (claims.length === 0) return null;
    const wrap = h('div', { class: 'section', 'data-el': 'claims' });
    wrap.append(h('div', { class: 'section__label' }, [h('span', { text: '参与本次判断的可见声明' }), h('span', { text: `${claims.length} 条` })]));
    const list = h('ul', { class: 'ex-claims' });
    for (const claim of claims) {
      const li = h('li', { class: 'ex-claim', 'data-claim': claim.claimId });
      li.append(
        h('div', { class: 'ex-claim__head' }, [
          h('span', { class: 'tag tag--muted', text: PREDICATE_LABEL[claim.predicate] || claim.predicate }),
          h('span', { class: 'mono', text: claim.value }),
        ])
      );
      li.append(h('div', { class: 'ex-claim__meta mono' }, `${claim.sourceId} · ${claim.chunkId} · ${claim.eventId}${claim.fromMetadata ? ' · 来自元数据' : claim.textScope === 'full_text' ? ' · 来自正文' : claim.textScope === 'search_excerpt' ? ' · 来自搜索摘要' : ' · 来自摘要'}`));
      if (claim.excerpt) li.append(h('p', { class: 'ex-claim__text' }, claim.excerpt));
      list.append(li);
    }
    wrap.append(list);
    return wrap;
  }

  /** 必要条件表：核验类事件的「为什么成立 / 为什么不能确认」 */
  function requirementsSection(payload) {
    if (!payload || !Array.isArray(payload.requirements) || payload.requirements.length === 0) return null;
    const wrap = h('div', { class: 'section', 'data-el': 'requirements' });
    wrap.append(h('div', { class: 'section__label' }, [h('span', { text: '核验必要条件' }), h('span', { text: '规则逐条检查' })]));
    const list = h('ul', { class: 'ex-req' });
    for (const req of payload.requirements) {
      const li = h('li', { class: 'ex-req__item', 'data-pass': req.pass ? 'true' : 'false' });
      li.append(h('span', { class: 'ex-req__mark', 'aria-hidden': 'true' }, req.pass ? '✓' : '✕'));
      li.append(h('span', { class: 'ex-req__text', text: `${req.cn}${req.pass ? '' : '（未满足）'}` }));
      if (!req.pass && req.reason) li.append(h('span', { class: 'ex-req__why', text: req.reason }));
      list.append(li);
    }
    wrap.append(list);
    if (payload.decision) wrap.append(h('div', { class: 'note' }, [h('span', { class: 'note__key', text: '判定' }), h('span', { text: payload.decision })]));
    return wrap;
  }

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
    const evidenceBranch = EVIDENCE_BRANCHES[event.branchId] || null;
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

    if (branch || evidenceBranch) {
      const meta = branch || evidenceBranch;
      body.append(
        h('div', { class: 'section' }, `
          <div class="section__label"><span>为什么走到这一步</span><span>${branch ? '执行分支' : '证据分支'}</span></div>
          <div class="kv">
            <dt>分支</dt><dd>${esc(meta.cn)}</dd>
            <dt>触发条件</dt><dd>${esc(meta.condition)}</dd>
            <dt>预期结果</dt><dd>${esc(meta.expect)}</dd>
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

    const req = requirementsSection(outPayload);
    if (req) body.append(req);

    if (event.claimIds && event.claimIds.length) {
      const section = claimsSection(run, event.claimIds);
      if (section) body.append(section);
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

    const reportMeta = run.artifacts.report || {};
    const hasReport = Array.isArray(reportMeta.claims) && reportMeta.claims.length > 0;
    body.append(
      h('div', { class: 'section', 'data-el': 'run-output' }, `
        <div class="section__label"><span>本次运行产出</span><span>可与报告互相反查</span></div>
        <div class="kv">
          <dt>任务</dt><dd>${esc(run.missionId)}@${run.missionVersion} · 语料 ${esc(run.corpusVersion || '—')}</dd>
          <dt>研究策略</dt><dd>${esc(run.options.evidencePolicy || '—')} · faultMode ${esc(run.options.faultMode)}</dd>
          <dt>可见证据</dt><dd>${run.artifacts.evidence.level ? `${esc(run.artifacts.evidence.levelCn || run.artifacts.evidence.level)} · ${esc((run.artifacts.evidence.sourceIds || []).join('、') || '—')}` : '未取得样本资料'}</dd>
          <dt>冲突 / 核验</dt><dd>${run.artifacts.evidence.counts ? `发现 ${run.artifacts.evidence.counts.conflictCount} · 成立 ${run.artifacts.evidence.counts.confirmedCount} · 未决 ${run.artifacts.evidence.counts.unresolvedCount + run.artifacts.evidence.counts.insufficientCount + run.artifacts.evidence.counts.metadataMissingCount} · 跳过 ${run.artifacts.evidence.counts.skippedCount}` : '本任务包不做冲突核验'}</dd>
          <dt>报告</dt><dd>${hasReport ? `${esc(reportMeta.status)} · ${reportMeta.claims.length} 条陈述 · ${(reportMeta.citations || []).length} 条引用` : esc(reportMeta.note || '本次运行没有结构化报告')}</dd>
          <dt>结局</dt><dd>${esc(outcomeMeta(run.outcome).cn)}（${esc(run.outcome)}）</dd>
        </div>`)
    );
    if (hasReport && onOpenReport) {
      const openBtn = h('button', { class: 'btn btn--sm btn--primary', type: 'button', 'data-act': 'open-report' }, '打开研究报告 →');
      openBtn.addEventListener('click', () => onOpenReport());
      body.append(h('div', { class: 'chips', style: 'margin-top:8px' }, openBtn));
    }

    const notes = h('div', { class: 'section' });
    notes.append(h('div', { class: 'section__label' }, '<span>声明</span>'));
    for (const note of run.notes || []) {
      notes.append(h('div', { class: 'note', style: 'margin-bottom:6px' }, `<span class="note__key">说明</span><span>${esc(note)}</span>`));
    }
    body.append(notes);
  }

  return { el, render };
}
