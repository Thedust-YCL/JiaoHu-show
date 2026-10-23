/**
 * src/features/laboratory/token/tokenLab.js
 * ------------------------------------------------------------------
 * Lab 01 · TOKEN / CONTEXT BUDGET（M1.2 D03 / §4）。
 *
 * 界面只做三件事：
 *   1. 把预计算好的真实 token 序列画出来（原文 / 片段 / 边界 / 序号 / 数量）；
 *   2. 让用户改预算与资料选择，并把「谁被舍弃、为什么」讲清楚；
 *   3. 在用户真的改过参数并看到了结果之后，才记一次「已完成实验」。
 *
 * 不做的事：不联网、不调用任何模型、不对任意输入伪称真实 token 数、
 * 不把本地示意预算说成某个真实模型的容量承诺。
 * ------------------------------------------------------------------
 */
import { h, esc } from '../../constructor/components/dom.js';
import {
  BUDGET_SECTIONS,
  buildTokenView,
  computeBudget,
  listDocs,
  listSamples,
} from './budget.js';
import { DEFAULT_LAB_STATE, OUTPUT_RESERVE_OPTIONS, WINDOW_OPTIONS } from './fragments.js';
import { ENCODING_DEFS } from './encodings.js';
import { TOKEN_TABLE } from './tokenTable.js';

const CONCEPT_LINKS = Object.freeze(['token', 'context_window', 'inference']);

export function createTokenLab({ learning, onBackToHub, onOpenLab, onOpenConcept, onLog } = {}) {
  const el = h('div', { class: 'workspace workspace--lab-lab', 'data-open': 'true', 'data-lab': 'token' });

  const state = {
    sampleId: DEFAULT_LAB_STATE.sampleId,
    encodingId: DEFAULT_LAB_STATE.encodingId,
    windowTokens: DEFAULT_LAB_STATE.windowTokens,
    outputReserveTokens: DEFAULT_LAB_STATE.outputReserveTokens,
    docIds: [...DEFAULT_LAB_STATE.docIds],
    /** 用户是否真的动过参数（只有动过才允许记「已完成实验」） */
    touched: false,
    completed: false,
  };

  /* ----------------------------- 头部 ----------------------------- */
  const head = h('header', { class: 'ws-head' });
  const headMeta = h('div', { class: 'ws-head__meta', 'data-el': 'context' });
  head.append(
    h('div', { class: 'ws-head__id' }, `
      <span class="ws-head__tag">A/0</span>
      <span class="ws-head__title">LAB 01 · TOKEN / CONTEXT BUDGET</span>
      <span class="ws-head__meta" data-el="subtitle">文本切分 · 上下文预算 · 舍弃解释</span>`),
    h('div', { class: 'ws-head__actions' }, '<span class="tag tag--attention">LOCAL · 离线预计算</span>')
  );
  const actions = head.querySelector('.ws-head__actions');
  const backLab = h('button', { class: 'btn btn--primary', type: 'button', 'data-act': 'back-lab' }, '← 返回实验空间');
  backLab.addEventListener('click', () => onOpenLab?.());
  const hub = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'hub' }, 'Back to Hub');
  hub.addEventListener('click', () => onBackToHub?.('hub'));
  const reset = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'reset' }, 'RESET · 复位参数');
  reset.addEventListener('click', () => {
    Object.assign(state, {
      sampleId: DEFAULT_LAB_STATE.sampleId,
      encodingId: DEFAULT_LAB_STATE.encodingId,
      windowTokens: DEFAULT_LAB_STATE.windowTokens,
      outputReserveTokens: DEFAULT_LAB_STATE.outputReserveTokens,
      docIds: [...DEFAULT_LAB_STATE.docIds],
    });
    render();
    onLog?.('实验', 'Lab 01 参数已复位到默认组合（未清除学习进度与运行记录）', 'info');
  });
  actions.append(backLab, hub, reset);

  /* ----------------------------- 三栏 ----------------------------- */
  const controls = h('aside', { class: 'lab-params surface', 'aria-label': '实验参数' });
  const controlsBody = h('div', { class: 'lab-params__scroll' });
  controls.append(h('div', { class: 'panel-head' }, '<span class="panel-head__title">参数区</span>'), controlsBody);

  const main = h('section', { class: 'lab-canvas', 'aria-live': 'polite', 'aria-label': '分词与预算结果' });
  const aside = h('aside', { class: 'lab-inspector surface', 'aria-label': '结果解释与概念入口' });
  const asideBody = h('div', { class: 'lab-inspector__scroll' });
  aside.append(h('div', { class: 'panel-head' }, '<span class="panel-head__title">结果解释</span>'), asideBody);

  el.append(head, h('div', { class: 'lab-body' }, controls, main, aside));

  /* ================================================================== *
   * 参数区
   * ================================================================== */
  function renderControls() {
    controlsBody.replaceChildren();
    const samples = listSamples();
    const docs = listDocs();
    const plan = computeBudget(state);

    /* 样例切换 */
    const sampleGroup = h('div', { class: 'section', 'data-group': 'sample' });
    sampleGroup.append(h('div', { class: 'section__label' }, '<span>原文样例</span><span>真实分词 · 可切换</span>'));
    for (const sample of samples) {
      const b = h('button', {
        class: 'tk-opt',
        type: 'button',
        'data-sample': sample.id,
        'aria-pressed': String(state.sampleId === sample.id),
      }, `
        <span class="tk-opt__label">${esc(sample.label)}</span>
        <span class="tk-opt__meta mono">${ENCODING_DEFS.map((e) => `${e.short} ${sample.tokensByEncoding[e.id]}`).join(' · ')} token</span>`);
      b.addEventListener('click', () => {
        state.sampleId = sample.id;
        state.touched = true;
        onChange(`切换原文样例：${sample.label}`);
      });
      sampleGroup.append(b);
    }
    controlsBody.append(sampleGroup);

    /* 编码 */
    const encGroup = h('div', { class: 'section', 'data-group': 'encoding' });
    encGroup.append(h('div', { class: 'section__label' }, '<span>分词编码</span><span>同一文本 · 不同结果</span>'));
    const encRow = h('div', { class: 'tk-seg', role: 'group', 'aria-label': '分词编码' });
    for (const enc of ENCODING_DEFS) {
      const b = h('button', { type: 'button', 'data-encoding': enc.id, 'aria-pressed': String(state.encodingId === enc.id) }, enc.label);
      b.addEventListener('click', () => {
        state.encodingId = enc.id;
        state.touched = true;
        onChange(`切换分词编码：${enc.label}`);
      });
      encRow.append(b);
    }
    encGroup.append(encRow);
    controlsBody.append(encGroup);

    /* 窗口上限 */
    const winGroup = h('div', { class: 'section', 'data-group': 'window' });
    winGroup.append(h('div', { class: 'section__label' }, '<span>上下文窗口上限</span><span>教学示意值</span>'));
    const winRow = h('div', { class: 'tk-seg', role: 'group', 'aria-label': '上下文窗口上限' });
    for (const value of WINDOW_OPTIONS) {
      const b = h('button', { type: 'button', 'data-window': String(value), 'aria-pressed': String(state.windowTokens === value) }, String(value));
      b.addEventListener('click', () => {
        state.windowTokens = value;
        state.touched = true;
        onChange(`窗口上限改为 ${value} token`);
      });
      winRow.append(b);
    }
    winGroup.append(winRow);
    controlsBody.append(winGroup);

    /* 输出预留 */
    const outGroup = h('div', { class: 'section', 'data-group': 'output' });
    outGroup.append(h('div', { class: 'section__label' }, '<span>保留给输出</span><span>先预留再分配</span>'));
    const outRow = h('div', { class: 'tk-seg', role: 'group', 'aria-label': '保留给输出的 token 数' });
    for (const value of OUTPUT_RESERVE_OPTIONS) {
      const b = h('button', { type: 'button', 'data-output': String(value), 'aria-pressed': String(state.outputReserveTokens === value) }, String(value));
      b.addEventListener('click', () => {
        state.outputReserveTokens = value;
        state.touched = true;
        onChange(`输出预留改为 ${value} token`);
      });
      outRow.append(b);
    }
    outGroup.append(outRow);
    controlsBody.append(outGroup);

    /* 资料选择 */
    const docGroup = h('div', { class: 'section', 'data-group': 'docs' });
    docGroup.append(h('div', { class: 'section__label' }, `<span>资料片段</span><span>${plan.docs.filter((d) => d.included).length}/${docs.length} 已进入上下文</span>`));
    for (const doc of docs) {
      const checked = state.docIds.includes(doc.id);
      const planDoc = plan.docs.find((d) => d.id === doc.id);
      const row = h('label', { class: 'tk-doc', 'data-doc': doc.id, 'data-state': !checked ? 'off' : planDoc?.included ? 'in' : 'dropped' });
      const input = h('input', { type: 'checkbox', 'data-doc-input': doc.id });
      input.checked = checked;
      input.addEventListener('change', () => {
        if (input.checked) {
          if (!state.docIds.includes(doc.id)) state.docIds.push(doc.id);
        } else {
          state.docIds = state.docIds.filter((id) => id !== doc.id);
        }
        state.touched = true;
        onChange(`${input.checked ? '加入' : '移除'}资料片段 ${doc.id}`);
      });
      row.append(
        input,
        h('span', { class: 'tk-doc__main' }, `
          <span class="tk-doc__label">${esc(doc.label)}</span>
          <span class="tk-doc__meta mono">${doc.tokensByEncoding[state.encodingId]} token · ${doc.chars} 字符 · ${esc(doc.sourceId)}（虚构数据）</span>
          <span class="tk-doc__state">${
            !checked ? '未选择' : planDoc?.included ? '已进入上下文' : '预算不足 · 整条舍弃'
          }</span>`)
      );
      docGroup.append(row);
    }
    controlsBody.append(docGroup);

    controlsBody.append(
      h('div', { class: 'note note--info', style: 'margin-top:10px' }, `
        <span class="note__key">数据来源</span>
        <span>原文由 <b>gpt-tokenizer@${esc(TOKEN_TABLE.generator.packageVersion)}</b> 在构建期离线切分，逐条通过 decode(encode(text)) = text 校验；页面本身不含分词器本体，也不对任意输入计数。</span>`)
    );
  }

  /* ================================================================== *
   * 主画布：原文 → token → 预算
   * ================================================================== */
  function renderMain() {
    const view = buildTokenView(state.sampleId, state.encodingId);
    const plan = computeBudget(state);
    main.replaceChildren();

    main.append(
      h('div', { class: 'lab-hero' }, `
        <div class="lab-hero__idx">LAB 01 / 第 01 章 智能诞生</div>
        <h2 class="lab-hero__title">模型看到的不是「句子」，而是一串 token</h2>
        <p class="lab-hero__lead">左边可以换原文、换编码、改预算。下面的 token 片段<b>全部来自真实分词器的离线预计算结果</b>，不是按字数估的：同一句话在
        <b>cl100k_base</b> 与 <b>o200k_base</b> 下的 token 数确实不同。</p>`)
    );

    /* 原文 */
    const src = h('div', { class: 'section', 'data-act': 'source-text' });
    src.append(
      h('div', { class: 'section__label' }, `<span>原文</span><span>${esc(view.label)}${view.isFictional ? ' · 虚构教学数据' : ''}</span>`),
      h('div', { class: 'tk-source' }, esc(view.text))
    );
    main.append(src);

    /* token 流 */
    const stream = h('div', { class: 'section', 'data-act': 'tokens' });
    stream.append(
      h('div', { class: 'section__label' }, `<span>token 片段（含边界与序号）</span><span>${view.total} 个 token · ${view.encoding.label}</span>`)
    );
    const chips = h('div', { class: 'tk-stream', role: 'list', 'aria-label': `${view.total} 个 token 片段` });
    for (const token of view.tokens) {
      chips.append(
        h('span', {
          class: 'tk-tok',
          role: 'listitem',
          'data-i': String(token.index),
          'data-id': String(token.id),
          'data-cont': token.isContinuation ? 'true' : 'false',
          title: `第 ${token.index} 个 token · id ${token.id}`,
        }, `<i class="tk-tok__idx">${token.index}</i><b class="tk-tok__text">${token.isContinuation ? '续字节' : esc(token.text)}</b>`)
      );
    }
    stream.append(chips);
    stream.append(
      h('div', { class: 'tk-metrics' }, `
        <div class="tk-metric"><span class="tk-metric__k">字符数</span><b class="tk-metric__v">${view.chars}</b></div>
        <div class="tk-metric"><span class="tk-metric__k">UTF‑8 字节</span><b class="tk-metric__v">${view.bytes}</b></div>
        <div class="tk-metric"><span class="tk-metric__k">token 数</span><b class="tk-metric__v">${view.total}</b></div>
        <div class="tk-metric"><span class="tk-metric__k">字符 / token</span><b class="tk-metric__v">${view.charsPerToken.toFixed(2)}</b></div>
        <div class="tk-metric"><span class="tk-metric__k">字节 / token</span><b class="tk-metric__v">${view.bytesPerToken.toFixed(2)}</b></div>`)
    );
    stream.append(
      h('div', { class: 'tk-compare' }, `
        <span class="tk-compare__title mono">同一原文 · 换编码的实测差异</span>
        ${view.comparison
          .map((other) => `<span class="tag tag--muted">${esc(other.label)}：${other.tokens} token（${(view.chars / other.tokens).toFixed(2)} 字符/token）</span>`)
          .join('')}
        <span class="tk-compare__note">所以「0.75 token / 字」这类固定折算一定不准：token 的切分取决于词表，而词表会换。</span>`)
    );
    main.append(stream);

    /* 预算 */
    main.append(renderBudget(plan));

    /* 结果解读 */
    main.append(renderReading(view, plan));
  }

  function renderBudget(plan) {
    const wrap = h('div', { class: 'section', 'data-act': 'budget', 'data-fits': plan.fits ? 'true' : 'false' });
    wrap.append(
      h('div', { class: 'section__label' }, `<span>上下文预算占用</span><span>${plan.usedTokens} / ${plan.windowTokens} token · ${plan.encoding.label}</span>`)
    );

    const bar = h('div', { class: 'tk-bar', role: 'img', 'aria-label': `预算占用：已用 ${plan.usedTokens} / ${plan.windowTokens} token` });
    for (const section of plan.sections) {
      const ratio = plan.ratio[section.id] ?? 0;
      bar.append(
        h('span', { class: 'tk-bar__seg', 'data-seg': section.id, 'data-empty': section.tokens ? 'false' : 'true', style: `flex-grow:${Math.max(ratio, 0)}` },
          `<i class="tk-bar__fill"></i><b class="tk-bar__label">${esc(section.label)} ${section.tokens}</b>`)
      );
    }
    if (plan.ratio.free > 0.001) {
      bar.append(h('span', { class: 'tk-bar__seg tk-bar__seg--free', 'data-seg': 'free', style: `flex-grow:${plan.ratio.free}` }, `<b class="tk-bar__label">空闲 ${plan.remainingTokens}</b>`));
    }
    wrap.append(bar);

    const table = h('div', { class: 'tk-table' });
    table.append(h('div', { class: 'tk-table__head' }, `
      <span>分区</span><span>token</span><span>占比</span><span>状态</span>`));
    for (const section of plan.sections) {
      const ratio = ((section.tokens / plan.windowTokens) * 100).toFixed(1);
      const status = !section.included
        ? plan.overflow
          ? '未放入（已超限）'
          : section.id === 'docs'
            ? '无资料进入'
            : '未放入'
        : section.id === 'docs' && section.dropped.length
          ? `部分资料被舍弃（${section.dropped.length} 条）`
          : '已放入';
      table.append(h('div', { class: 'tk-table__row', 'data-seg': section.id }, `
        <span>${esc(section.label)}</span><span class="mono">${section.tokens}</span><span class="mono">${ratio}%</span><span>${esc(status)}</span>`));
    }
    table.append(h('div', { class: 'tk-table__row tk-table__row--total' }, `
      <span>合计</span><span class="mono">${plan.usedTokens}</span><span class="mono">${((plan.usedTokens / plan.windowTokens) * 100).toFixed(1)}%</span><span>${plan.fits ? '在窗口内' : '超出窗口'}</span>`));
    wrap.append(table);

    if (plan.overflow) {
      wrap.append(
        h('div', { class: 'note note--attention', 'data-act': 'overflow' }, `
          <span class="note__key">超出预算</span>
          <span>窗口 ${plan.overflow.window} token，但系统指令 + 用户任务 + 输出预留已经需要 <b>${plan.overflow.need}</b> token，缺口 <b>${plan.overflow.gap}</b>。按规则不会偷偷截断系统指令，也不会假装能跑。</span>`)
      );
    } else if (plan.dropped.length) {
      const list = h('div', { class: 'tk-dropped' });
      for (const item of plan.dropped) {
        list.append(h('div', { class: 'tk-dropped__row', 'data-dropped': item.id }, `
          <span class="tk-dropped__id mono">${esc(item.id)}</span>
          <span class="tk-dropped__reason">${esc(item.reason)}</span>`));
      }
      wrap.append(list);
    }
    return wrap;
  }

  function renderReading(view, plan) {
    const wrap = h('div', { class: 'section', 'data-act': 'reading' });
    wrap.append(h('div', { class: 'section__label' }, '<span>结果解读</span><span>为什么是这样</span>'));
    const ul = h('ul', { class: 'lab-reading' });
    ul.append(h('li', {}, `这段${view.isFictional ? '资料片段' : '原文'}有 <b>${view.chars}</b> 个字符、<b>${view.bytes}</b> 字节，在 <b>${esc(view.encoding.label)}</b> 下是 <b>${view.total}</b> 个 token，平均 ${view.charsPerToken.toFixed(2)} 字符 / token。`));
    ul.append(h('li', {}, `换一种编码会得到不同的数量（${view.comparison.map((o) => `${o.label} ${o.tokens}`).join(' · ')}）：token 是<b>词表切分的产物</b>，不是自然语言里的「字」或「词」。`));
    ul.append(h('li', {}, `这一轮实际进入上下文的是：系统指令 ${plan.sections[0].tokens} + 用户任务 ${plan.sections[1].tokens} + 资料 ${plan.sections[2].tokens} + 输出预留 ${plan.sections[3].tokens} = ${plan.usedTokens} token。`));
    if (plan.dropped.length) {
      ul.append(h('li', {}, `被舍弃的是 <b>${plan.dropped.map((d) => esc(d.id)).join('、')}</b>：规则是「整条放入或整条舍弃」，所以模型这一轮看不到它们，而不是看到一半。`));
    } else if (plan.sections[2].tokens === 0) {
      ul.append(h('li', {}, '本轮没有任何资料进入上下文：模型只有指令和问题，没有可核对的事实来源——这正是第 01 章要说明的局限。'));
    }
    ul.append(h('li', {}, `注意：这里的窗口上限与预留都是<b>教学示意</b>。真实接口还会额外计入消息包装、工具定义等隐式 token，本实验不对任何具体模型做出容量承诺。`));
    wrap.append(ul);
    return wrap;
  }

  /* ================================================================== *
   * 右侧解释区
   * ================================================================== */
  function renderAside() {
    asideBody.replaceChildren();
    const plan = computeBudget(state);

    asideBody.append(
      h('div', { class: 'section' }, `
        <div class="section__label"><span>这一轮在讲什么</span><span>第 01 章</span></div>
        <div class="note note--info"><span class="note__key">token</span><span>模型读写文本的切分单位。上下文容量、截断与计费都按 token 计，而不是按字数。</span></div>
        <div class="note note--info" style="margin-top:8px"><span class="note__key">context window</span><span>一次请求能容纳的总量上限。放不下时的处理方式（舍弃、截断、摘要）由具体实现决定，本实验演示的是「整条舍弃」这一种。</span></div>`)
    );

    asideBody.append(
      h('div', { class: 'section' }, `
        <div class="section__label"><span>建议观察</span><span>自己动手</span></div>
        <div class="mono kn-progress">
          <div>1. 把窗口降到 ${WINDOW_OPTIONS[0]}：哪些资料被舍弃？</div>
          <div>2. 同一原文明细切换 o200k_base：token 数变了吗？</div>
          <div>3. 取消全部资料：上下文里还剩什么？</div>
        </div>`)
    );

    const check = h('div', { class: 'section', 'data-act': 'completion' });
    check.append(h('div', { class: 'section__label' }, '<span>实验记录</span><span>只记录真实操作</span>'));
    const done = learning?.isExperimentCompleted?.('token') || state.completed;
    check.append(
      h('div', { class: 'note' + (done ? ' note--info' : '') }, `
        <span class="note__key">${done ? '已记录' : '未记录'}</span>
        <span>${
          done
            ? '本次会话里你已改过参数并看到结果，学习进度中记了一次「已完成内嵌实验」；刷新后仍会恢复，不含分数。'
            : '改任意参数（窗口、编码、资料）后即视为完成一次实验观察。只浏览页面不会记录为完成。'
        }</span>`)
    );
    asideBody.append(check);

    const concept = h('div', { class: 'section' });
    concept.append(h('div', { class: 'section__label' }, '<span>相关概念</span><span>回到知识页</span>'));
    const chips = h('div', { class: 'chips' });
    for (const id of CONCEPT_LINKS) {
      const b = h('button', { class: 'btn btn--sm', type: 'button', 'data-concept': id }, id);
      b.addEventListener('click', () => onOpenConcept?.(id, { from: 'lab', labId: 'exp-token-lab' }));
      chips.append(b);
    }
    concept.append(chips);
    asideBody.append(concept);

    asideBody.append(
      h('div', { class: 'section' }, `
        <div class="section__label"><span>边界</span><span>不要这样理解</span></div>
        <div class="kv">
          <dt>不是「字」</dt><dd>1 个汉字可能是 1 个 token，也可能是 2–3 个，还可能和相邻字一起合并</dd>
          <dt>不是实时 AI</dt><dd>本页不调用任何模型；token 数来自离线预计算表</dd>
          <dt>不是容量承诺</dt><dd>${plan.windowTokens} 是教学示意值，不代表任何真实模型的窗口大小</dd>
        </div>`)
    );
  }

  /* ================================================================== *
   * 状态与生命周期
   * ================================================================== */
  function onChange(reason) {
    if (!state.completed && state.touched) {
      state.completed = true;
      const ok = learning?.markExperimentCompleted?.('token');
      onLog?.('实验', `Lab 01 参数变化：${reason} → 上下文预算 ${computeBudget(state).usedTokens}/${state.windowTokens} token${ok ? ' · 已记录完成一次实验观察' : ''}`, 'signal');
    } else {
      onLog?.('实验', `Lab 01 参数变化：${reason}`, 'info');
    }
    render();
  }

  function render() {
    renderControls();
    renderMain();
    renderAside();
    const plan = computeBudget(state);
    headMeta.textContent = `样例 ${state.sampleId} · ${state.encodingId} · 窗口 ${plan.windowTokens} · 已用 ${plan.usedTokens} · ${
      plan.fits ? '在窗口内' : '超出预算'
    }`;
  }

  render();

  return {
    el,
    activate() {},
    dispose() {},
    /** 自检脚本用：当前参数与结果快照（纯数据，不含 DOM） */
    snapshot() {
      const plan = computeBudget(state);
      const view = buildTokenView(state.sampleId, state.encodingId);
      return {
        state: { ...state },
        tick: view.total,
        chars: view.chars,
        bytes: view.bytes,
        charsPerToken: view.charsPerToken,
        comparison: view.comparison,
        plan: {
          windowTokens: plan.windowTokens,
          usedTokens: plan.usedTokens,
          inputTokens: plan.inputTokens,
          fits: plan.fits,
          overflow: plan.overflow,
          dropped: plan.dropped,
          sections: plan.sections.map((s) => ({ id: s.id, tokens: s.tokens, included: s.included })),
        },
      };
    },
    /** 自检脚本用：改参数（走与点击完全相同的路径） */
    configure(patch = {}) {
      Object.assign(state, patch);
      state.touched = true;
      onChange('自检脚本改参数');
    },
    setSample(sampleId) {
      this.configure({ sampleId });
    },
    setEncoding(encodingId) {
      this.configure({ encodingId });
    },
    setWindow(windowTokens) {
      this.configure({ windowTokens });
    },
    setOutputReserve(outputReserveTokens) {
      this.configure({ outputReserveTokens });
    },
    setDocs(docIds) {
      this.configure({ docIds: [...docIds] });
    },
    budgetSections: () => BUDGET_SECTIONS.map((s) => s.id),
  };
}
