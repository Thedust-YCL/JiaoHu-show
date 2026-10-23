/**
 * src/features/laboratory/context/contextLab.js
 * ------------------------------------------------------------------
 * Lab 02 · INSTRUCTIONS / CONTEXT（M1.2 D04 / §5）的界面层。
 *
 * 结构与 Lab 01 保持一致（参数区 / 主画布 / 结果解释），并且：
 *   · 所有结果都来自 ../context/simulation.js 的纯函数，界面不做任何
 *     「为了好看」的加工：报告段落、未验证项、被舍弃的卡片都直接来自规则；
 *   · 每次改参数都会保留上一组结果，右侧自动显示「上一组 → 本次」的变化
 *     与原因（轻量前后对照，不是 M2 的完整 A/B 实验室）；
 *   · 只有用户真的改过参数、并且看到了新结果，才记一次完成。
 * ------------------------------------------------------------------
 */
import { h, esc } from '../../constructor/components/dom.js';
import {
  BACKGROUND,
  BACKGROUND_CARDS,
  BUDGETS,
  DEFAULT_CONTEXT_STATE,
  DIMENSIONS,
  DIMENSION_ORDER,
  EVIDENCE,
  FORMATS,
  GOALS,
  RESEARCH_QUESTIONS,
  diffRuns,
  simulateContext,
} from './simulation.js';

const DIMENSION_LABELS = Object.freeze({
  goal: '研究目标',
  format: '输出方式',
  evidence: '证据要求',
  background: '背景资料',
  budget: '上下文预算',
});

const CONCEPT_LINKS = Object.freeze(['prompt', 'instructions', 'context_engineering']);

export function createContextLab({ learning, entryConceptId = 'context_engineering', onBackToHub, onOpenLab, onOpenConcept, onLog } = {}) {
  const el = h('div', { class: 'workspace workspace--lab-lab', 'data-open': 'true', 'data-lab': 'context' });

  const state = { ...DEFAULT_CONTEXT_STATE, touched: false, completed: false };
  let previousRun = null;
  let run = simulateContext(state);

  /* ----------------------------- 头部 ----------------------------- */
  const head = h('header', { class: 'ws-head' });
  const headMeta = h('div', { class: 'ws-head__meta', 'data-el': 'context' });
  head.append(
    h('div', { class: 'ws-head__id' }, `
      <span class="ws-head__tag">A/0</span>
      <span class="ws-head__title">LAB 02 · INSTRUCTIONS / CONTEXT</span>
      <span class="ws-head__meta" data-el="subtitle">指令 · 背景 · 预算如何改变研究产出</span>`),
    h('div', { class: 'ws-head__actions' }, '<span class="tag tag--attention">SIMULATED · 确定性规则</span>')
  );
  const actions = head.querySelector('.ws-head__actions');
  const backLab = h('button', { class: 'btn btn--primary', type: 'button', 'data-act': 'back-lab' }, '← 返回实验空间');
  backLab.addEventListener('click', () => onOpenLab?.());
  const hub = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'hub' }, 'Back to Hub');
  hub.addEventListener('click', () => onBackToHub?.('hub'));
  const reset = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'reset' }, 'RESET · 复位配置');
  reset.addEventListener('click', () => {
    Object.assign(state, DEFAULT_CONTEXT_STATE);
    previousRun = null;
    run = simulateContext(state);
    render();
    onLog?.('实验', 'Lab 02 配置已复位到默认组合（未清除学习进度与运行记录）', 'info');
  });
  actions.append(backLab, hub, reset);

  /* ----------------------------- 三栏 ----------------------------- */
  const params = h('aside', { class: 'lab-params surface', 'aria-label': '研究配置' });
  const paramsBody = h('div', { class: 'lab-params__scroll' });
  params.append(h('div', { class: 'panel-head' }, '<span class="panel-head__title">研究配置</span>'), paramsBody);

  const main = h('section', { class: 'lab-canvas', 'aria-live': 'polite', 'aria-label': '上下文、报告与事实状态' });
  const aside = h('aside', { class: 'lab-inspector surface', 'aria-label': '变化原因与概念入口' });
  const asideBody = h('div', { class: 'lab-inspector__scroll' });
  aside.append(h('div', { class: 'panel-head' }, '<span class="panel-head__title">为什么变了</span>'), asideBody);

  el.append(head, h('div', { class: 'lab-body' }, params, main, aside));

  /* ================================================================== *
   * 参数区
   * ================================================================== */
  function renderParams() {
    paramsBody.replaceChildren();
    for (const key of DIMENSION_ORDER) {
      const group = h('div', { class: 'section', 'data-dim': key });
      const options = DIMENSIONS[key];
      group.append(
        h('div', { class: 'section__label' }, `<span>${DIMENSION_LABELS[key]}</span><span>${esc((options.find((o) => o.id === state[key]) || {}).label || '')}</span>`)
      );
      const row = h('div', { class: 'tk-seg tk-seg--wrap', role: 'group', 'aria-label': DIMENSION_LABELS[key] });
      for (const option of options) {
        const b = h('button', {
          type: 'button',
          'data-dim-option': option.id,
          'data-dim': key,
          'aria-pressed': String(state[key] === option.id),
          title: option.note,
        }, option.label);
        b.addEventListener('click', () => {
          if (state[key] === option.id) return;
          state[key] = option.id;
          state.touched = true;
          rerun(`${DIMENSION_LABELS[key]}改为「${option.label}」`);
        });
        row.append(b);
      }
      group.append(row);

      const active = options.find((o) => o.id === state[key]);
      if (active) group.append(h('div', { class: 'tk-field__hint' }, active.note));
      paramsBody.append(group);
    }

    paramsBody.append(
      h('div', { class: 'note note--info', style: 'margin-top:10px' }, `
        <span class="note__key">数据来源</span>
        <span>背景卡片是 M0.4 的<b>虚构</b>校园公告（isFictional: true）；「充足 / 受限」两档预算按 Lab 01 的真实 token 数计算（1024 / 200 token）。</span>`)
    );
  }

  /* ================================================================== *
   * 主画布
   * ================================================================== */
  function renderMain() {
    main.replaceChildren();
    main.append(
      h('div', { class: 'lab-hero' }, `
        <div class="lab-hero__idx">LAB 02 / 第 02 章 指令与上下文</div>
        <h2 class="lab-hero__title">同一个任务，指令与上下文不同，产出就不同</h2>
        <p class="lab-hero__lead">下面的报告由<b>确定性规则表</b>生成：没有任何随机成分，也没有调用模型。改变的每一处都能在「为什么变了」里找到原因——
        包括勾了「要求标注来源」却<b>没有资料可引用</b>时，报告会写「未验证」而不是编一条引文。</p>`)
    );

    main.append(renderContextBlock());
    main.append(renderReportBlock());
    main.append(renderFactsBlock());
  }

  function renderContextBlock() {
    const wrap = h('div', { class: 'section', 'data-act': 'context' });
    wrap.append(h('div', { class: 'section__label' }, '<span>这一轮的上下文</span><span>实际放进去的内容</span>'));

    const instr = h('div', { class: 'ctx-instructions' });
    for (const line of run.context.instructions) instr.append(h('div', { class: 'ctx-instructions__line' }, esc(line)));
    wrap.append(instr);

    const cards = h('div', { class: 'ctx-cards' });
    if (!run.context.cards.length) {
      cards.append(h('div', { class: 'note', 'data-act': 'no-cards' }, `
        <span class="note__key">没有资料</span>
        <span>本轮上下文里没有任何公告卡片：模型只能凭指令与问题作答，所有具体事实都无法核验。</span>`));
    } else {
      for (const card of run.context.cards) {
        cards.append(
          h('div', { class: 'ctx-card', 'data-card': card.id, 'data-included': card.included ? 'true' : 'false' }, `
            <div class="ctx-card__head">
              <span class="ctx-card__title">${esc(card.title)}</span>
              <span class="tag tag--${card.included ? 'success' : 'attention'}">${card.included ? '已进入上下文' : '整张舍弃'}</span>
            </div>
            <div class="ctx-card__meta mono">${esc(card.sourceId)} · ${esc(card.publisher)} · ${esc(card.publishedAt)} · ${card.tokens} token · 虚构数据</div>
            <div class="ctx-card__note">${esc(card.included ? '这张卡片的内容可以作为引用来源。' : card.dropReason)}</div>`)
        );
      }
    }
    wrap.append(cards);

    if (run.context.budget.windowTokens) {
      wrap.append(
        h('div', { class: 'tk-metrics' }, `
          <div class="tk-metric"><span class="tk-metric__k">资料预算</span><b class="tk-metric__v">${run.context.budget.windowTokens}</b></div>
          <div class="tk-metric"><span class="tk-metric__k">实际占用</span><b class="tk-metric__v">${run.context.budget.usedTokens}</b></div>
          <div class="tk-metric"><span class="tk-metric__k">进入卡片</span><b class="tk-metric__v">${run.metrics.cardsIncluded}</b></div>
          <div class="tk-metric"><span class="tk-metric__k">舍弃卡片</span><b class="tk-metric__v">${run.metrics.cardsDropped}</b></div>`)
      );
    }
    wrap.append(h('div', { class: 'tk-field__hint' }, run.context.budget.note));
    return wrap;
  }

  function renderReportBlock() {
    const wrap = h('div', { class: 'section', 'data-act': 'report' });
    wrap.append(
      h('div', { class: 'section__label' }, `<span>模拟研究产出</span><span>${esc(run.report.title)}</span>`)
    );
    wrap.append(
      h('div', { class: 'note note--isolation' }, `
        <span class="note__key">SIMULATED</span>
        <span>本地确定性规则生成，不是模型推理，也不是真实研究报告。修改配置会改变结构与遗漏，但不会「越改越聪明」。</span>`)
    );

    const body = h('div', { class: 'ctx-report', 'data-format': run.report.format });
    for (const block of run.report.blocks) {
      const statusTag = { supported: 'success', partial: 'attention', unverified: 'attention', gap: 'muted' }[block.status] || 'muted';
      const statusText = { supported: '有来源支撑', partial: '部分未验证', unverified: '未验证', gap: '资料缺口' }[block.status] || block.status;
      const section = h('div', { class: 'ctx-report__block', 'data-block': block.id, 'data-status': block.status });
      section.append(
        h('div', { class: 'ctx-report__head' }, `
          <span class="ctx-report__heading">${esc(block.heading)}</span>
          <span class="tag tag--${statusTag}">${esc(statusText)}</span>`)
      );
      if (block.kind === 'outline') {
        const ol = h('ol', { class: 'ctx-report__list' });
        for (const line of block.lines) ol.append(h('li', {}, esc(line)));
        section.append(ol);
      } else {
        for (const line of block.lines) section.append(h('p', { class: 'ctx-report__p' }, esc(line)));
      }
      body.append(section);
    }
    wrap.append(body);

    if (run.citations.length) {
      const cites = h('div', { class: 'ctx-citations' });
      cites.append(h('div', { class: 'section__label' }, `<span>引用</span><span>${run.citations.length} 条 · 全部指向本地卡片</span>`));
      for (const cite of run.citations) {
        cites.append(h('div', { class: 'ctx-citation mono', 'data-citation': cite.factId }, `[${esc(cite.sourceId)}] ${esc(cite.label)}`));
      }
      wrap.append(cites);
    }
    wrap.append(h('div', { class: 'ctx-citation-status', 'data-act': 'citation-status' }, esc(run.report.citationStatus)));
    wrap.append(h('div', { class: 'tk-field__hint' }, esc(run.report.footer)));
    return wrap;
  }

  function renderFactsBlock() {
    const wrap = h('div', { class: 'section', 'data-act': 'facts' });
    wrap.append(
      h('div', { class: 'section__label' }, `<span>事实状态</span><span>${run.metrics.supportedFacts} 有来源 · ${run.metrics.unverifiedFacts} 未验证</span>`)
    );
    const table = h('div', { class: 'tk-table tk-table--facts' });
    table.append(h('div', { class: 'tk-table__head' }, '<span>事实</span><span>来源</span><span>状态</span><span>原因</span>'));
    for (const fact of run.facts) {
      table.append(
        h('div', { class: 'tk-table__row', 'data-fact': fact.id, 'data-status': fact.status }, `
          <span>${esc(fact.statement)}</span>
          <span class="mono">${esc(fact.sourceId)}</span>
          <span>${fact.status === 'supported' ? '有来源' : '未验证'}</span>
          <span>${esc(fact.reason)}</span>`)
      );
    }
    wrap.append(table);
    return wrap;
  }

  /* ================================================================== *
   * 结果解释（右侧）
   * ================================================================== */
  function renderAside() {
    asideBody.replaceChildren();

    const diff = diffRuns(previousRun, run);
    const changeBox = h('div', { class: 'section', 'data-act': 'diff' });
    changeBox.append(h('div', { class: 'section__label' }, '<span>与上一组配置的对照</span><span>轻量前后对照</span>'));
    if (!diff || (!diff.changed.length && !diff.deltas.length)) {
      changeBox.append(
        h('div', { class: 'note' }, '<span class="note__key">还没有对照</span><span>改动任意一维配置后，这里会显示上一组与本次的差异，以及差异带来的结果变化。</span>')
      );
    } else {
      if (diff.changed.length) {
        const ul = h('ul', { class: 'lab-reading' });
        for (const change of diff.changed) ul.append(h('li', {}, `${esc(change.label)}：${esc(change.from)} → <b>${esc(change.to)}</b>`));
        changeBox.append(ul);
      }
      if (diff.deltas.length) {
        const t = h('div', { class: 'tk-table tk-table--diff' });
        t.append(h('div', { class: 'tk-table__head' }, '<span>指标</span><span>上一组</span><span>本次</span><span>变化</span>'));
        for (const delta of diff.deltas) {
          const sign = delta.to > delta.from ? '+' : '';
          t.append(h('div', { class: 'tk-table__row' }, `
            <span>${esc(delta.label)}</span><span class="mono">${delta.from}</span><span class="mono">${delta.to}</span><span class="mono">${sign}${delta.to - delta.from}</span>`));
        }
        changeBox.append(t);
      }
    }
    asideBody.append(changeBox);

    const reasons = h('div', { class: 'section', 'data-act': 'reasons' });
    reasons.append(h('div', { class: 'section__label' }, '<span>本次结果为什么是这样</span><span>逐维说明</span>'));
    const ul = h('ul', { class: 'lab-reading' });
    for (const reason of run.reasons) ul.append(h('li', {}, esc(reason)));
    reasons.append(ul);
    if (run.dropped.length) {
      const drops = h('div', { class: 'tk-dropped' });
      for (const item of run.dropped) {
        drops.append(h('div', { class: 'tk-dropped__row', 'data-dropped': item.id }, `
          <span class="tk-dropped__id mono">${esc(item.sourceId)}</span>
          <span class="tk-dropped__reason">${esc(item.reason)}</span>`));
      }
      reasons.append(drops);
    }
    asideBody.append(reasons);

    const check = h('div', { class: 'section', 'data-act': 'completion' });
    check.append(h('div', { class: 'section__label' }, '<span>实验记录</span><span>只记录真实操作</span>'));
    const done = learning?.isExperimentCompleted?.(entryConceptId) || state.completed;
    check.append(
      h('div', { class: 'note' }, `
        <span class="note__key">${done ? '已记录' : '未记录'}</span>
        <span>${done ? '你已改过配置并看到结果，本地学习进度记了一次「已完成内嵌实验」。' : '改动任意一维配置后即视为完成一次观察；只浏览不记录。'}</span>`)
    );
    asideBody.append(check);

    const concept = h('div', { class: 'section' });
    concept.append(h('div', { class: 'section__label' }, '<span>相关概念</span><span>回到知识页</span>'));
    const chips = h('div', { class: 'chips' });
    for (const id of CONCEPT_LINKS) {
      const b = h('button', { class: 'btn btn--sm', type: 'button', 'data-concept': id }, id);
      b.addEventListener('click', () => onOpenConcept?.(id, { from: 'lab', labId: 'exp-context-lab' }));
      chips.append(b);
    }
    concept.append(chips);
    asideBody.append(concept);

    asideBody.append(
      h('div', { class: 'section' }, `
        <div class="section__label"><span>必守边界</span><span>不夸大</span></div>
        <div class="kv">
          <dt>幻觉</dt><dd>没有资料时报告写「未验证」，不生成虚构引文：这正是幻觉与「没查」的区别</dd>
          <dt>指令优先级</dt><dd>本实验不声称系统指令是绝对安全边界，也不模拟提示注入</dd>
          <dt>不是 A/B 实验室</dt><dd>这里只做两次配置的轻量对照，不做多轮 Agent 对比</dd>
        </div>`)
    );
  }

  /* ================================================================== *
   * 状态
   * ================================================================== */
  function rerun(reason) {
    previousRun = run;
    run = simulateContext(state);
    if (!state.completed && state.touched) {
      state.completed = true;
      const ok = learning?.markExperimentCompleted?.(entryConceptId);
      onLog?.('实验', `Lab 02 配置变化：${reason} → 报告 ${run.metrics.blocks} 节 · 有来源 ${run.metrics.supportedFacts} 条 · 未验证 ${run.metrics.unverifiedFacts} 条${ok ? ' · 已记录完成一次观察' : ''}`, 'signal');
    } else {
      onLog?.('实验', `Lab 02 配置变化：${reason}`, 'info');
    }
    render();
  }

  function render() {
    renderParams();
    renderMain();
    renderAside();
    headMeta.textContent = `${GOALS.find((g) => g.id === state.goal).label} · ${FORMATS.find((f) => f.id === state.format).label} · ${
      EVIDENCE.find((e) => e.id === state.evidence).label
    } · ${BACKGROUND.find((b) => b.id === state.background).label} · 预算${BUDGETS.find((b) => b.id === state.budget).label}`;
  }

  render();

  return {
    el,
    activate() {},
    dispose() {},
    snapshot() {
      return {
        state: { ...state },
        config: run.config,
        metrics: run.metrics,
        reportTitle: run.report.title,
        blocks: run.report.blocks.map((b) => ({ id: b.id, heading: b.heading, status: b.status, lines: b.lines.length })),
        facts: run.facts.map((f) => ({ id: f.id, status: f.status, reason: f.reason })),
        citations: run.citations.map((c) => ({ factId: c.factId, sourceId: c.sourceId })),
        citationStatus: run.report.citationStatus,
        dropped: run.dropped.map((d) => ({ id: d.id, reason: d.reason })),
        diff: diffRuns(previousRun, run),
      };
    },
    configure(patch = {}) {
      const keys = Object.keys(patch).filter((k) => k in DEFAULT_CONTEXT_STATE);
      if (!keys.length) return;
      for (const key of keys) state[key] = patch[key];
      state.touched = true;
      rerun(`配置改为 ${keys.map((k) => `${DIMENSION_LABELS[k]}=${patch[k]}`).join('、')}`);
    },
    /** 自检脚本用：明确设置对照基线，便于断言两次差异 */
    rerunWith(config) {
      previousRun = run;
      Object.assign(state, config);
      run = simulateContext(state);
      render();
      return run;
    },
    dimensions: () => DIMENSION_ORDER.slice(),
    cards: () => BACKGROUND_CARDS.map((c) => c.id),
    questions: () => RESEARCH_QUESTIONS.map((q) => q.id),
    currentRun: () => run,
  };
}
