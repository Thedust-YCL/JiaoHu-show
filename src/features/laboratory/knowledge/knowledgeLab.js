/**
 * src/features/laboratory/knowledge/knowledgeLab.js
 * ------------------------------------------------------------------
 * LAB 04 · KNOWLEDGE LAB 的界面层（M1.3 D04 / §5）。
 *
 * 结构沿用 Lab 01 / Lab 02 的三栏：参数区 / 主工作区 / Inspector。
 * 所有结果都直接来自 ../knowledge/pipeline.js 的纯函数，界面不做
 * 「为了好看」的加工；每个数字都能在片段列表、候选表或事件里对上。
 *
 * 不能做的事（界面层同样守住）：
 *   · 不把关键词检索显示成「语义检索」；
 *   · 不伪造向量分数（没有预计算坐标就显示不可用）；
 *   · 不在无证据时生成引用；
 *   · 不把检索结果自动写进记忆；
 *   · 不因为启用 Skill 就改变工具/权限列表。
 * ------------------------------------------------------------------
 */
import { h, esc, md } from '../../constructor/components/dom.js';
import {
  DEMO_DOC_COORDS,
  DEMO_VECTOR_NOTE,
  LAB_DOCS,
  LAB_QUESTIONS,
  LAB_SCOPES,
  corpusSize,
  docsInScope,
  getLabQuestion,
} from './corpus.js';
import { CHUNK_PRESETS, CHUNK_SIZES, chunkPreset } from './chunking.js';
import { RETRIEVAL_MODES, TOP_K_OPTIONS } from './retrieval.js';
import { CONTEXT_CHAR_BUDGET, DEFAULT_LAB_CONFIG, diffRuns, runKnowledgeLab } from './pipeline.js';
import { MEMORY_KINDS, createMemoryStore } from './memory.js';
import { SKILL_CARDS, methodPlan } from './skills.js';

const CONCEPT_LINKS = Object.freeze(['chunking', 'retrieval', 'embedding', 'rag', 'memory', 'skills']);
const STATUS_TONE = Object.freeze({
  supported: 'success',
  resolved: 'success',
  unresolved: 'attention',
  unverified: 'attention',
  insufficient: 'muted',
});

export function createKnowledgeLab({
  learning,
  entryConceptId = 'chunking',
  onBackToHub,
  onOpenLab,
  onOpenConcept,
  onLog,
  storage = null,
} = {}) {
  const el = h('div', { class: 'workspace workspace--lab-lab', 'data-open': 'true', 'data-lab': 'knowledge' });

  const state = { ...DEFAULT_LAB_CONFIG, touched: false, completed: false };
  const memory = createMemoryStore({ storage });
  let previousRun = null;
  let run = runKnowledgeLab(state);

  /* ----------------------------- 头部 ----------------------------- */
  const head = h('header', { class: 'ws-head' });
  const headMeta = h('div', { class: 'ws-head__meta', 'data-el': 'context' });
  head.append(
    h('div', { class: 'ws-head__id' }, `
      <span class="ws-head__tag">A/0</span>
      <span class="ws-head__title">LAB 04 · KNOWLEDGE LAB</span>
      <span class="ws-head__meta" data-el="subtitle">切分 · 检索 · Embedding 示意 · RAG · Memory · Skills</span>`),
    h('div', { class: 'ws-head__actions' }, '<span class="tag tag--attention">SIMULATION · 本地规则</span>')
  );
  const actions = head.querySelector('.ws-head__actions');
  const backLab = h('button', { class: 'btn btn--primary', type: 'button', 'data-act': 'back-lab' }, '← 返回实验空间');
  backLab.addEventListener('click', () => onOpenLab?.());
  const hub = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'hub' }, 'Back to Hub');
  hub.addEventListener('click', () => onBackToHub?.('hub'));
  const reset = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'reset' }, 'RESET · 复位参数');
  reset.addEventListener('click', () => {
    Object.assign(state, DEFAULT_LAB_CONFIG, { touched: false, completed: state.completed });
    previousRun = null;
    run = runKnowledgeLab(state);
    render();
    onLog?.('实验', 'Lab 04 参数已复位（记忆与学习进度不受影响）', 'info');
  });
  actions.append(backLab, hub, reset);

  /* ----------------------------- 三栏 ----------------------------- */
  const params = h('aside', { class: 'lab-params surface', 'aria-label': '实验参数' });
  const paramsBody = h('div', { class: 'lab-params__scroll' });
  params.append(h('div', { class: 'panel-head' }, '<span class="panel-head__title">实验参数</span>'), paramsBody);

  const main = h('section', { class: 'lab-canvas', 'aria-live': 'polite', 'aria-label': '文档、检索与模拟回答' });
  const aside = h('aside', { class: 'lab-inspector surface', 'aria-label': '变化原因与核验' });
  const asideBody = h('div', { class: 'lab-inspector__scroll' });
  aside.append(h('div', { class: 'panel-head' }, '<span class="panel-head__title">为什么是这样</span>'), asideBody);

  el.append(head, h('div', { class: 'lab-body' }, params, main, aside));

  /* ================================================================== *
   * 参数区
   * ================================================================== */
  function segmented(label, options, activeId, onSelect, { disabled = false, hint = '' } = {}) {
    const group = h('div', { class: 'section' });
    group.append(h('div', { class: 'section__label' }, `<span>${esc(label)}</span><span>${esc(hint)}</span>`));
    const row = h('div', { class: 'tk-seg tk-seg--wrap', role: 'group', 'aria-label': label });
    for (const option of options) {
      const b = h(
        'button',
        {
          type: 'button',
          'data-option': option.id,
          'data-group': label,
          'aria-pressed': String(activeId === option.id),
          title: option.note || '',
          disabled: disabled || undefined,
        },
        esc(option.cn)
      );
      b.addEventListener('click', () => {
        if (disabled) return;
        if (activeId === option.id) return;
        onSelect(option);
      });
      row.append(b);
    }
    group.append(row);
    const active = options.find((o) => o.id === activeId);
    if (active?.note) group.append(h('div', { class: 'tk-field__hint' }, esc(active.note)));
    return group;
  }

  function renderParams() {
    paramsBody.replaceChildren();

    paramsBody.append(
      segmented(
        '切分方式',
        CHUNK_PRESETS.map((p) => ({ id: p.id, cn: p.cn, note: p.note })),
        state.preset,
        (option) => change({ preset: option.id }, `切分方式改为「${option.cn}」`)
      )
    );
    paramsBody.append(
      segmented(
        '片段长度',
        CHUNK_SIZES.map((size) => ({ id: String(size), cn: `${size} 字符`, note: '' })),
        String(state.size),
        (option) => change({ size: Number(option.id) }, `片段长度改为 ${option.id} 字符`),
        {
          disabled: state.preset === 'paragraph',
          hint: state.preset === 'paragraph' ? '按段落切分时不生效' : '字符，非 token',
        }
      )
    );
    paramsBody.append(
      segmented(
        '检索范围',
        LAB_SCOPES.map((s) => ({ id: s.id, cn: s.cn, note: s.id === 'campus_events' ? '栏目是发布标签，不等于内容主题：更正公告发在「事务通知」栏目时会搜不到。' : '全部 9 份本地公告。' })),
        state.scopeId,
        (option) => change({ scopeId: option.id }, `检索范围改为「${option.cn}」`)
      )
    );
    paramsBody.append(
      segmented(
        '研究问题',
        LAB_QUESTIONS.map((q) => ({ id: q.id, cn: q.text, note: q.note })),
        state.questionId,
        (option) => change({ questionId: option.id }, `研究问题改为「${option.cn}」`),
        { hint: '每个问题都写明了它的「正确形态」' }
      )
    );
    paramsBody.append(
      segmented(
        '检索模式',
        RETRIEVAL_MODES.map((m) => ({ id: m.id, cn: m.cn, note: m.note })),
        state.mode,
        (option) => change({ mode: option.id }, `检索模式改为「${option.cn}」`)
      )
    );
    paramsBody.append(
      segmented(
        '候选上限',
        TOP_K_OPTIONS.map((k) => ({ id: String(k), cn: `前 ${k} 个`, note: '' })),
        String(state.topK),
        (option) => change({ topK: Number(option.id) }, `候选上限改为前 ${option.id} 个`)
      )
    );

    /* Skill 开关：明确写出「不改变权限」 */
    const skill = h('div', { class: 'section', 'data-act': 'skill-toggle' });
    skill.append(h('div', { class: 'section__label' }, '<span>Skills</span><span>方法，不是权限</span>'));
    const card = SKILL_CARDS[0];
    const btn = h(
      'button',
      { class: 'btn btn--sm', type: 'button', 'data-act': 'toggle-skill', 'aria-pressed': String(state.skillEnabled) },
      state.skillEnabled ? `停用「${card.cn}」` : `启用「${card.cn}」`
    );
    btn.addEventListener('click', () =>
      change({ skillEnabled: !state.skillEnabled }, `${state.skillEnabled ? '停用' : '启用'}「${card.cn}」Skill`)
    );
    skill.append(btn, h('div', { class: 'tk-field__hint' }, card.grants.note));
    paramsBody.append(skill);

    const size = corpusSize();
    paramsBody.append(
      h('div', { class: 'note note--info', style: 'margin-top:10px' }, `
        <span class="note__key">语料</span>
        <span>${size.docs} 份虚构公告 · ${size.paragraphs} 段 · ${size.chars} 字符（沿用 M0.4 mission-001，标记 isFictional）。不含任何真实学校信息。</span>`)
    );
  }

  /* ================================================================== *
   * 主区
   * ================================================================== */
  function renderMain() {
    main.replaceChildren();
    main.append(
      h('div', { class: 'lab-hero' }, `
        <div class="lab-hero__idx">LAB 04 / 第 04 章 信息与方法</div>
        <h2 class="lab-hero__title">同一批公告，切法与检索方式不同，能拿到的证据就不同</h2>
        <p class="lab-hero__lead">下面所有分数都由本地确定性规则算出：关键词通道只做字面匹配，向量通道只用<b>人工设定的二维坐标</b>。没有任何 Embedding 模型、语言模型或网络请求参与。</p>`)
    );
    main.append(renderDocsBlock());
    main.append(renderCandidatesBlock());
    main.append(renderAnswerBlock());
    main.append(renderMemoryBlock());
    main.append(renderSkillsBlock());
  }

  function renderDocsBlock() {
    const wrap = h('div', { class: 'section', 'data-act': 'chunks' });
    const stats = run.chunking.stats;
    wrap.append(
      h('div', { class: 'section__label' }, `<span>文档与片段</span><span>${stats.chunkCount} 个片段 · 平均 ${stats.avgChars} 字符</span>`)
    );
    wrap.append(
      h('div', { class: 'note note--isolation' }, `
        <span class="note__key">切分</span>
        <span>${esc(chunkPreset(run.config.preset).cn)}${run.config.preset === 'paragraph' ? '' : `（每 ${run.config.size} 字符）`}：跨段片段 ${stats.crossBoundary} 个、被截断的片段 ${stats.truncated} 个。${esc(stats.note)}</span>`)
    );

    const grid = h('div', { class: 'knl-docs' });
    const scopeDocs = new Set(docsInScope(run.config.scopeId).map((d) => d.docId));
    for (const doc of LAB_DOCS) {
      const chunks = run.chunking.chunks.filter((c) => c.docId === doc.docId);
      const inScope = scopeDocs.has(doc.docId);
      const card = h('div', { class: 'knl-doc', 'data-doc': doc.docId, 'data-in-scope': inScope ? 'true' : 'false' });
      card.append(
        h('div', { class: 'knl-doc__head' }, `
          <span class="knl-doc__id mono">${esc(doc.docId)}</span>
          <span class="knl-doc__title">${esc(doc.title)}</span>
          <span class="tag tag--${inScope ? 'signal' : 'muted'}">${inScope ? '在检索范围' : '不在范围'}</span>`),
        h('div', { class: 'knl-doc__meta mono' }, `${esc(doc.publisher)} · ${esc(doc.publishedAt)} · 栏目 ${esc(doc.scope)} · 有效性 ${esc(doc.validity)} · 虚构数据`)
      );
      if (!inScope) {
        card.append(h('div', { class: 'tk-field__hint' }, '当前检索范围不包含该栏目：它不会进入候选，也不会进入上下文。'));
        grid.append(card);
        continue;
      }
      const list = h('div', { class: 'knl-chunks' });
      for (const chunk of chunks) {
        list.append(
          h('div', { class: 'knl-chunk', 'data-chunk': chunk.chunkId }, `
            <div class="knl-chunk__head">
              <span class="knl-chunk__id mono">${esc(chunk.chunkId)}</span>
              <span class="knl-chunk__loc">${esc(chunk.locator)} · ${chunk.chars} 字符</span>
              ${chunk.crossesParagraph ? '<span class="tag tag--attention">跨段</span>' : ''}
              ${chunk.truncated ? '<span class="tag tag--muted">句子被切断</span>' : ''}
            </div>
            <div class="knl-chunk__text">${esc(chunk.text)}</div>`)
        );
      }
      card.append(list);
      grid.append(card);
    }
    wrap.append(grid);
    return wrap;
  }

  function renderCandidatesBlock() {
    const wrap = h('div', { class: 'section', 'data-act': 'retrieval' });
    const retrieval = run.retrieval;
    wrap.append(
      h('div', { class: 'section__label' }, `<span>检索候选</span><span>${retrieval.modeCn} · ${retrieval.candidates.length} 个</span>`)
    );
    wrap.append(h('div', { class: 'note note--info' }, `<span class="note__key">规则</span><span>${esc(retrieval.note)}</span>`));
    if (retrieval.formula) wrap.append(h('div', { class: 'tk-field__hint mono' }, esc(retrieval.formula)));

    if (!retrieval.available || !retrieval.candidates.length) {
      wrap.append(
        h('div', { class: 'note', 'data-act': 'no-candidates' }, `
          <span class="note__key">没有候选</span>
          <span>${esc(retrieval.available ? '本次查询在这个范围里没有命中任何片段。' : retrieval.note)}</span>`)
      );
      return wrap;
    }

    const table = h('div', { class: 'tk-table tk-table--path' });
    table.append(h('div', { class: 'tk-table__head' }, '<span>#</span><span>片段</span><span>分数</span><span>相关性检查 / 匹配理由</span>'));
    retrieval.candidates.forEach((candidate, index) => {
      const verdict = run.relevance.find((r) => r.chunkId === candidate.chunkId);
      const coord = DEMO_DOC_COORDS[candidate.docId];
      table.append(
        h('div', { class: 'tk-table__row', 'data-candidate': candidate.chunkId, 'data-relevant': verdict?.relevant ? 'true' : 'false' }, `
          <span class="mono">${index + 1}</span>
          <span><b class="mono">${esc(candidate.docId)}</b> · ${esc(candidate.locator)}<br /><span class="knl-dim">${esc(candidate.excerpt)}</span></span>
          <span class="mono">${candidate.score}${coord ? `<br /><span class="knl-dim">坐标 (${coord[0]}, ${coord[1]})</span>` : ''}</span>
          <span>${esc(verdict?.reason || '')}<br /><span class="knl-dim">${esc(candidate.reason)}</span></span>`)
      );
    });
    wrap.append(table);
    return wrap;
  }

  function renderAnswerBlock() {
    const wrap = h('div', { class: 'section', 'data-act': 'rag' });
    const answer = run.answer;
    wrap.append(
      h('div', { class: 'section__label' }, `<span>RAG 流程与模拟结论</span><span>${esc(answer.statusCn)}</span>`)
    );

    /* 流程条 */
    const flow = h('div', { class: 'knl-flow' });
    const steps = [
      { id: 'chunk', cn: '切分', meta: `${run.chunking.stats.chunkCount} 片段` },
      { id: 'retrieve', cn: '检索', meta: `${run.retrieval.candidates.length} 候选` },
      { id: 'relevant', cn: '相关性检查', meta: `${run.relevance.filter((r) => r.relevant).length} 通过` },
      { id: 'context', cn: '进入上下文', meta: `${run.context.segments.length} 片段 / ${run.context.usedChars} 字符` },
      { id: 'answer', cn: '规则作答', meta: `${answer.citations.length} 条引用` },
    ];
    for (const step of steps) flow.append(h('div', { class: 'knl-flow__step', 'data-step': step.id }, `
      <span class="knl-flow__cn">${esc(step.cn)}</span><span class="knl-flow__meta mono">${esc(step.meta)}</span>`));
    wrap.append(flow);

    /* 上下文内容 */
    const ctx = h('div', { class: 'knl-context' });
    ctx.append(h('div', { class: 'section__label' }, `<span>这一轮的上下文</span><span>预算 ${CONTEXT_CHAR_BUDGET} 字符 · 已用 ${run.context.usedChars}</span>`));
    if (!run.context.segments.length) {
      ctx.append(h('div', { class: 'note', 'data-act': 'empty-context' }, `
        <span class="note__key">上下文为空</span>
        <span>没有任何片段进入上下文：因此不会有引用，也不会有结论。这正是「资料不足」的来源。</span>`));
    }
    for (const segment of run.context.segments) {
      ctx.append(
        h('div', { class: 'ctx-card', 'data-context-chunk': segment.chunkId }, `
          <div class="ctx-card__head">
            <span class="ctx-card__title">${esc(segment.docId)} · ${esc(segment.locator)}</span>
            <span class="tag tag--success">已进入上下文</span>
          </div>
          <div class="ctx-card__meta mono">${esc(segment.title)} · ${segment.chars} 字符 · 虚构数据</div>
          <div class="ctx-card__note">${esc(segment.text)}</div>`)
      );
    }
    for (const item of run.context.dropped) {
      ctx.append(
        h('div', { class: 'ctx-card', 'data-dropped-chunk': item.chunkId, 'data-included': 'false' }, `
          <div class="ctx-card__head">
            <span class="ctx-card__title mono">${esc(item.chunkId)}</span>
            <span class="tag tag--attention">未进入上下文</span>
          </div>
          <div class="ctx-card__note">${esc(item.reason)}</div>`)
      );
    }
    wrap.append(ctx);

    /* 结论 */
    const box = h('div', { class: 'knl-answer', 'data-status': answer.status });
    box.append(
      h('div', { class: 'knl-answer__head' }, `
        <span class="tag tag--${STATUS_TONE[answer.status] || 'muted'}">${esc(answer.statusCn)}</span>
        <span class="knl-answer__label">${esc(answer.label)}</span>`),
      h('div', { class: 'knl-answer__q' }, `问题：${esc(answer.question)}`)
    );
    for (const line of answer.lines) box.append(h('p', { class: 'knl-answer__line' }, md(line)));
    if (answer.citations.length) {
      const cites = h('div', { class: 'ctx-citations' });
      for (const cite of answer.citations) {
        cites.append(
          h('div', { class: 'ctx-citation mono', 'data-citation': cite.chunkId }, `[${esc(cite.docId)}] ${esc(cite.locator)} → ${esc(cite.value)}`)
        );
      }
      box.append(cites);
    } else {
      box.append(h('div', { class: 'ctx-citation-status', 'data-act': 'no-citation' }, '本次没有任何引用：无证据时不生成来源。'));
    }
    box.append(h('div', { class: 'tk-field__hint' }, esc(answer.footnote)));
    wrap.append(box);
    return wrap;
  }

  function renderMemoryBlock() {
    const wrap = h('div', { class: 'section', 'data-act': 'memory' });
    wrap.append(h('div', { class: 'section__label' }, '<span>Memory 对照</span><span>三件不同的事</span>'));
    wrap.append(h('div', { class: 'note note--isolation' }, `<span class="note__key">注意</span><span>${esc(run.memoryView.note)}</span>`));

    const cols = h('div', { class: 'knl-mem' });
    /* 1. 当前任务上下文 */
    cols.append(
      h('div', { class: 'knl-mem__col', 'data-col': 'context' }, `
        <div class="knl-mem__head">当前任务上下文<span class="mono">${run.memoryView.context.length} 片段</span></div>
        <div class="knl-mem__body">${run.memoryView.context.map((c) => `<span class="mono">${esc(c.chunkId)}</span> · ${c.chars} 字符`).join('<br />') || '（空）'}</div>`)
    );
    /* 2. 检索结果 */
    cols.append(
      h('div', { class: 'knl-mem__col', 'data-col': 'retrieved' }, `
        <div class="knl-mem__head">检索结果<span class="mono">${run.memoryView.retrieved.length} 候选</span></div>
        <div class="knl-mem__body">${run.memoryView.retrieved.map((c) => `<span class="mono">${esc(c.docId)}</span> · ${c.score}`).join('<br />') || '（空）'}</div>`)
    );

    /* 3. 本地记忆 */
    const entries = memory.list();
    const memBody = h('div', { class: 'knl-mem__body', 'data-col': 'memory' });
    if (!entries.length) {
      memBody.append(h('div', { class: 'tk-field__hint' }, '本地记忆为空。这里只会出现你**手动保存**的条目，检索结果不会自动写入。'));
    } else {
      for (const entry of entries) {
        const row = h('div', { class: 'knl-mem__row', 'data-memory': entry.id });
        row.append(h('span', {}, `<b>${esc(entry.kindCn)}</b>：${esc(entry.value)}`));
        const del = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'data-act': 'delete-memory' }, '删除');
        del.addEventListener('click', () => {
          memory.remove(entry.id);
          onLog?.('实验', `Lab 04 删除了一条本地记忆（${entry.kindCn}），学习进度不受影响`, 'info');
          render();
        });
        row.append(del);
        memBody.append(row);
      }
    }
    const memCol = h('div', { class: 'knl-mem__col', 'data-col': 'memory' });
    memCol.append(h('div', { class: 'knl-mem__head' }, `本地记忆<span class="mono">${entries.length}/${6}</span>`), memBody);

    /* 保存表单 */
    const form = h('div', { class: 'knl-mem__form' });
    const kindRow = h('div', { class: 'tk-seg tk-seg--wrap' });
    let selectedKind = MEMORY_KINDS[0].id;
    for (const kind of MEMORY_KINDS) {
      const b = h('button', { type: 'button', 'data-kind': kind.id, 'aria-pressed': String(kind.id === selectedKind) }, kind.cn);
      b.addEventListener('click', () => {
        selectedKind = kind.id;
        for (const other of kindRow.querySelectorAll('button')) other.setAttribute('aria-pressed', String(other.getAttribute('data-kind') === kind.id));
        input.value = suggestionFor(kind.id);
      });
      kindRow.append(b);
    }
    const input = h('input', {
      class: 'knl-mem__input',
      type: 'text',
      maxlength: '120',
      value: suggestionFor(selectedKind),
      'aria-label': '记忆内容',
      'data-el': 'memory-input',
    });
    const save = h('button', { class: 'btn btn--sm btn--primary', type: 'button', 'data-act': 'save-memory' }, '保存到本地记忆');
    const feedback = h('div', { class: 'tk-field__hint', 'data-el': 'memory-feedback' }, '保存后刷新页面仍会保留；清除后立即消失。');
    save.addEventListener('click', () => {
      const result = memory.save({ kind: selectedKind, value: input.value });
      feedback.textContent = result.ok
        ? `已保存：${result.entry.kindCn} · ${result.entry.value}（只写本地，不影响上下文与检索结果）`
        : `未保存：${result.message}`;
      onLog?.('实验', `Lab 04 记忆写入：${result.ok ? `成功（${result.entry.kindCn}）` : `失败（${result.reason}）`}`, result.ok ? 'signal' : 'attention');
      render();
    });
    const clear = h('button', { class: 'btn btn--sm', type: 'button', 'data-act': 'clear-memory' }, '清除全部记忆');
    clear.addEventListener('click', () => {
      const removed = memory.clearAll();
      onLog?.('实验', `Lab 04 清除了 ${removed} 条本地记忆（不影响学习进度与实验参数）`, 'info');
      render();
    });
    form.append(kindRow, input, h('div', { class: 'chips' }, save, clear), feedback);
    memCol.append(form);

    cols.append(memCol);
    wrap.append(cols);
    return wrap;
  }

  function renderSkillsBlock() {
    const wrap = h('div', { class: 'section', 'data-act': 'skills' });
    const card = SKILL_CARDS[0];
    wrap.append(h('div', { class: 'section__label' }, `<span>Skills · ${esc(card.cn)}</span><span>${state.skillEnabled ? '已启用' : '未启用'}</span>`));
    wrap.append(
      h('div', { class: 'note note--info' }, `
        <span class="note__key">${esc(card.version)}</span>
        <span>${esc(card.summary)} 启用只改变<b>方法步骤</b>；工具清单与权限集合始终是 announcement_search / document_reader，不增不减。</span>`)
    );

    const cols = h('div', { class: 'knl-skill' });
    /* 方法步骤 */
    const plan = methodPlan({ skillEnabled: state.skillEnabled });
    const steps = h('div', { class: 'knl-skill__col', 'data-act': 'method-steps' });
    steps.append(h('div', { class: 'knl-skill__head' }, `方法步骤（${plan.steps.length} 步）`));
    for (const [index, step] of plan.steps.entries()) {
      steps.append(
        h('div', { class: 'knl-step', 'data-step': step.id }, `
          <span class="knl-step__no mono">${String(index + 1).padStart(2, '0')}</span>
          <span><b>${esc(step.cn)}</b><br /><span class="knl-dim">${esc(step.detail)}</span></span>`)
      );
    }
    cols.append(steps);

    /* 检查结果 */
    const checks = h('div', { class: 'knl-skill__col', 'data-act': 'checks' });
    checks.append(h('div', { class: 'knl-skill__head' }, '核验结果'));
    if (!run.checks.enabled) {
      checks.append(h('div', { class: 'tk-field__hint' }, '未启用 Skill：本次没有执行核验检查。启用后流程会多出 4 项检查，结论可能从「有支撑」降级为「需谨慎」。'));
    } else {
      for (const check of run.checks.checks) {
        const tone = check.status === 'pass' ? 'success' : check.status === 'fail' ? 'attention' : 'muted';
        checks.append(
          h('div', { class: 'knl-check', 'data-check': check.id, 'data-status': check.status }, `
            <div class="knl-check__head"><span class="tag tag--${tone}">${check.status === 'pass' ? '通过' : check.status === 'fail' ? '未通过' : '不适用'}</span><b>${esc(check.cn)}</b></div>
            <div class="knl-dim">${esc(check.reason)}</div>`)
        );
      }
    }

    /* 工具与权限（永远不变） */
    checks.append(
      h('div', { class: 'knl-tools', 'data-act': 'tools' }, `
        <div class="knl-tools__head">工具与权限（与 Skill 无关）</div>
        <div class="mono">${card.grants.tools.map((t) => esc(t)).join(' · ')}</div>
        <div class="knl-dim">读：公开公告 ✓ / 私有记录 ✗ / 写操作 ✗ —— 这一行在启用 Skill 前后完全一致，由权限规则单独决定（见 RELIABILITY LAB）。</div>`)
    );
    cols.append(checks);
    wrap.append(cols);
    return wrap;
  }

  /* ================================================================== *
   * Inspector
   * ================================================================== */
  function renderAside() {
    asideBody.replaceChildren();

    /* 变化对照 */
    const diff = diffRuns(previousRun, run);
    const changeBox = h('div', { class: 'section', 'data-act': 'diff' });
    changeBox.append(h('div', { class: 'section__label' }, '<span>与上一组的对照</span><span>改了什么 → 变了什么</span>'));
    if (!diff || !diff.changed.length) {
      changeBox.append(h('div', { class: 'note' }, '<span class="note__key">还没有对照</span><span>改动任意一项参数后，这里会显示两次运行的差异与结果变化。</span>'));
    } else {
      const ul = h('ul', { class: 'lab-reading' });
      for (const change of diff.changed) ul.append(h('li', {}, `${esc(change.label)}：${esc(change.from)} → <b>${esc(change.to)}</b>`));
      changeBox.append(ul);
      const table = h('div', { class: 'tk-table tk-table--diff' });
      table.append(h('div', { class: 'tk-table__head' }, '<span>指标</span><span>上一组</span><span>本次</span><span>变化</span>'));
      for (const delta of diff.deltas) {
        const sign = delta.to > delta.from ? '+' : '';
        table.append(
          h('div', { class: 'tk-table__row' }, `
            <span>${esc(delta.label)}</span><span class="mono">${delta.from}</span><span class="mono">${delta.to}</span><span class="mono">${sign}${delta.to - delta.from}</span>`)
        );
      }
      changeBox.append(table);
      changeBox.append(
        h('div', { class: 'tk-field__hint' }, `结论状态：${diff.statusFrom} → ${diff.statusTo}`)
      );
    }
    asideBody.append(changeBox);

    /* 原因 */
    const reasons = h('div', { class: 'section', 'data-act': 'reasons' });
    reasons.append(h('div', { class: 'section__label' }, '<span>本次结果为什么是这样</span><span>逐项说明</span>'));
    const ul = h('ul', { class: 'lab-reading' });
    for (const reason of run.reasons) ul.append(h('li', {}, esc(reason)));
    reasons.append(ul);
    asideBody.append(reasons);

    /* 完成状态 */
    const done = learning?.isExperimentCompleted?.(entryConceptId) || state.completed;
    const check = h('div', { class: 'section', 'data-act': 'completion' });
    check.append(h('div', { class: 'section__label' }, '<span>实验记录</span><span>只记录真实操作</span>'));
    check.append(
      h('div', { class: 'note' }, `
        <span class="note__key">${done ? '已记录' : '未记录'}</span>
        <span>${done ? '你已改动参数并看到新结果，本地学习进度记了一次「已完成实验」。' : '改动任意一项参数并看到新结果，即记为完成一次观察；只浏览页面不记录。'}</span>`)
    );
    asideBody.append(check);

    /* 相关概念 */
    const concept = h('div', { class: 'section' });
    concept.append(h('div', { class: 'section__label' }, '<span>相关概念</span><span>回到知识页</span>'));
    const chips = h('div', { class: 'chips' });
    for (const id of CONCEPT_LINKS) {
      const b = h('button', { class: 'btn btn--sm', type: 'button', 'data-concept': id }, id);
      b.addEventListener('click', () => onOpenConcept?.(id, { from: 'lab', experimentId: 'exp-retrieval-lab' }));
      chips.append(b);
    }
    concept.append(chips);
    asideBody.append(concept);

    /* 边界 */
    asideBody.append(
      h('div', { class: 'section' }, `
        <div class="section__label"><span>必守边界</span><span>不夸大</span></div>
        <div class="kv">
          <dt>不是真实检索</dt><dd>关键词分数由本地规则算出；没有倒排索引、没有向量库、没有重排模型</dd>
          <dt>不是真实向量</dt><dd>${esc(DEMO_VECTOR_NOTE)}</dd>
          <dt>不是真实生成</dt><dd>结论由「抽取规则 + 检查规则」拼出，不是语言模型写的</dd>
          <dt>切分单位</dt><dd>以字符计，不与 token 混用（token 见 Lab 01）</dd>
          <dt>记忆隔离</dt><dd>记忆写入 agent-zero:lab-knowledge:v1，与学习进度、装配配置、研究运行记录互不影响</dd>
        </div>`)
    );
  }

  /* ================================================================== *
   * 交互
   * ================================================================== */
  function suggestionFor(kindId) {
    if (kindId === 'focus') return `关注点：${run.question.text}`;
    if (kindId === 'preference') return '输出偏好：先给结论状态，再列证据来源';
    return `历史摘要：本次${run.retrieval.candidates.length} 个候选、${run.context.segments.length} 个片段进入上下文、结论为 ${run.answer.statusCn}`;
  }

  function change(patch, reason) {
    Object.assign(state, patch, { touched: true });
    previousRun = run;
    run = runKnowledgeLab(state);
    if (!state.completed) {
      state.completed = true;
      const ok = learning?.markExperimentCompleted?.(entryConceptId);
      onLog?.(
        '实验',
        `Lab 04 参数变化：${reason} → 候选 ${run.retrieval.candidates.length} · 上下文 ${run.context.segments.length} 段 · 结论 ${run.answer.statusCn}${ok ? ' · 已记录一次实验完成' : ''}`,
        'signal'
      );
    } else {
      onLog?.('实验', `Lab 04 参数变化：${reason} → 结论 ${run.answer.statusCn}`, 'info');
    }
    render();
  }

  function render() {
    renderParams();
    renderMain();
    renderAside();
    headMeta.textContent = `${getLabQuestion(state.questionId).text} · ${state.mode === 'keyword' ? '关键词检索' : '向量示意'} · Skill ${state.skillEnabled ? '启用' : '未启用'}`;
  }

  render();

  return {
    el,
    activate() {},
    dispose() {},
    /* ---------------- 自检脚本接口（不改变 UI 语义） ---------------- */
    snapshot() {
      return {
        config: { ...run.config },
        chunkCount: run.chunking.stats.chunkCount,
        chunkIds: run.chunking.chunks.map((c) => c.chunkId),
        candidates: run.retrieval.candidates.map((c) => ({ chunkId: c.chunkId, docId: c.docId, score: c.score })),
        relevant: run.relevance.filter((r) => r.relevant).map((r) => r.chunkId),
        context: run.context.segments.map((s) => ({ chunkId: s.chunkId, docId: s.docId })),
        dropped: run.context.dropped.map((d) => ({ chunkId: d.chunkId, reason: d.reason })),
        answer: {
          status: run.answer.status,
          statusCn: run.answer.statusCn,
          citations: run.answer.citations.map((c) => ({ docId: c.docId, chunkId: c.chunkId, value: c.value })),
          lines: run.answer.lines.slice(),
        },
        checks: run.checks.checks.map((c) => ({ id: c.id, status: c.status })),
        planSteps: run.plan.steps.map((s) => s.id),
        memory: memory.list(),
        mode: run.retrieval.mode,
        vectorAvailable: run.retrieval.available,
      };
    },
    configure(patch = {}) {
      const keys = Object.keys(patch).filter((k) => k in DEFAULT_LAB_CONFIG);
      if (!keys.length) return;
      change(patch, `外部配置：${keys.map((k) => `${k}=${patch[k]}`).join('、')}`);
    },
    resetState() {
      Object.assign(state, DEFAULT_LAB_CONFIG, { touched: false, completed: state.completed });
      previousRun = null;
      run = runKnowledgeLab(state);
      render();
    },
    currentRun: () => run,
    chunkIds: () => run.chunking.chunks.map((c) => c.chunkId),
    candidateIds: () => run.retrieval.candidates.map((c) => c.chunkId),
    answerStatus: () => run.answer.status,
    citationCount: () => run.answer.citations.length,
    skillEnabled: () => state.skillEnabled,
    toolList: () => [...SKILL_CARDS[0].grants.tools],
    memoryEntries: () => memory.list(),
    saveMemory: (values) => memory.save(values),
    clearMemory: () => memory.clearAll(),
    memoryStorageKey: () => memory.storageKey,
    memoryPersisted: () => memory.readPersisted(),
    questions: () => LAB_QUESTIONS.map((q) => q.id),
  };
}
