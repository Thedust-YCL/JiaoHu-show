/**
 * src/features/atlas/components/atlasWorkspace.js
 * ------------------------------------------------------------------
 * ATLAS / 知识星图工作区（M1.1 升级版）：
 *   左栏 = 36 个概念的**章节分组目录**与搜索（含建设中概念）
 *   中央 = 全量36节点星图；固定布局、章节/关系筛选与邻居高亮
 *   右栏 = 节点详情 / 关系说明 / 学习状态 / 知识页入口
 *
 * 职责边界：
 *   · 只读知识数据与学习进度，**不触发模拟运行**，也不清空运行轨迹；
 *   · 所有概念都能打开统一知识页（索引页永远可访问），但未撰写正文的
 *     概念明确显示「内容建设中 / 预计阶段」，不会被算作已学完；
 *   · 「在系统中查看」只做定位与说明，不私自装配模块或授予权限。
 * ------------------------------------------------------------------
 */
import { h, esc, md } from '../../constructor/components/dom.js';
import {
  CONCEPTS,
  CONCEPT_ORDER,
  conceptsByChapter,
  conceptAvailability,
  edgesOf,
  experimentOfConcept,
  getConcept,
  getConceptsByChapter,
  graphStats,
  knowledgeStats,
  neighborConcepts,
  positionInChapter,
  relationMeta,
  relatedOf,
  searchConcepts,
  GRAPH_ORDER,
  CHAPTERS, EXPERIMENTS, RELATION_TYPE_ORDER, queryAtlas,
} from '../data/index.js';
import { createAtlasGraph } from '../graph/atlasGraph.js';
import { learningLabelMeta } from '../state/learning.js';

const TARGET_NOTE = {
  core: '装配台中的落点：中央核心（Model Core）本身。',
  tools: '装配台中的落点：能力架里的 Announcement Search 与 Document Reader 工具模块。',
  none: '装配台暂未提供对应模块：这是解释性知识节点，不会伪装成已装配的工具。',
};

/** 概念状态标签（内容状态是知识层的唯一真相） */
function statusTag(concept) {
  const meta = conceptAvailability(concept.id).statusMeta;
  return h('span', { class: `tag tag--${meta.tone}`, 'data-status': concept.contentStatus }, esc(meta.cn));
}

export function createAtlasWorkspace({
  learning,
  onBackToHub,
  onOpenKnowledge,
  onOpenStory,
  onOpenLab,
  onViewInConstructor,
  session = {},
  reducedMotion = false,
  onLog,
} = {}) {
  session = session && typeof session === 'object' ? session : {};
  const initialViewState = session.view && typeof session.view === 'object' ? { ...session.view } : null;
  const initialScrollState = session.scrolls && typeof session.scrolls === 'object' ? { ...session.scrolls } : {};
  const el = h('div', { class: 'workspace workspace--atlas', 'data-open': 'true' });

  const stats = graphStats();
  const knowledge = knowledgeStats();

  /* ----------------------------- 头部 ----------------------------- */
  const head = h('header', { class: 'ws-head' });
  head.append(
    h('div', { class: 'ws-head__id' }, `
      <span class="ws-head__tag">A/0</span>
      <span class="ws-head__title">ATLAS · 知识星图</span>
      <span class="ws-head__meta">画布 ${stats.concepts} 个已开放节点 · 目录 ${knowledge.concepts} 个概念 · ${knowledge.edges} 条语义关系 · 固定坐标不随机重排</span>`),
    h('div', { class: 'ws-head__actions' }, '<span class="tag tag--attention">SIMULATED · 本地教学模拟</span>')
  );
  const actions = head.querySelector('.ws-head__actions');
  const backBtn = h('button', { class: 'btn btn--primary', type: 'button', 'aria-label': '返回中央核心（Hub）视图' }, '← 返回 Hub');
  backBtn.addEventListener('click', () => onBackToHub?.('hub'));
  const storyBtn = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'story', 'aria-label': '打开六章目录（Story）' }, 'STORY · 六章目录');
  storyBtn.addEventListener('click', () => onOpenStory?.());
  actions.append(backBtn, storyBtn);

  /* ----------------------------- 左栏：搜索 + 章节分组清单 ----------------------------- */
  const side = h('aside', { class: 'atlas-side surface', 'aria-label': '概念目录与搜索' });
  const searchInput = h('input', {
    class: 'atlas-search__input',
    type: 'search',
    placeholder: '搜索概念（中英文别名均可，如 LLM / 工具调用 / 幻觉）',
    'aria-label': '搜索知识概念：支持中英文名称、别名、大小写与部分匹配',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const searchClear = h('button', { class: 'btn btn--sm btn--ghost', type: 'button', 'aria-label': '清除搜索并恢复全图' }, '清除');
  const searchNote = h('div', { class: 'atlas-search__note', role: 'status', 'aria-live': 'polite' });
  const listEl = h('div', { class: 'atlas-list', 'aria-label': '概念目录：按章节分组，键盘与触屏用户可在这里直接选择节点' });
  const footEl = h('div', { class: 'atlas-side__foot' });
  const filters = h('div', { class: 'learning-filters' });
  const chapterFilter = h('select', { 'aria-label': '按章节筛选', 'data-filter': 'chapter' }, '<option value="">全部章节</option>');
  for (const c of CHAPTERS) chapterFilter.append(h('option', { value: c.id }, `${c.no} · ${c.title.zh}`));
  const relationFilter = h('select', { 'aria-label': '按关系类型筛选', 'data-filter': 'relation' }, '<option value="">全部关系</option>');
  for (const type of RELATION_TYPE_ORDER) relationFilter.append(h('option', { value: type }, `${relationMeta(type).cn} · ${type}`));
  filters.append(chapterFilter, relationFilter);
  side.append(
    h('div', { class: 'panel-head' }, '<span class="panel-head__title">搜索与概念目录</span>'),
    h('div', { class: 'atlas-search' }, searchInput, searchClear),
    searchNote,
    filters,
    listEl,
    footEl
  );

  /* ----------------------------- 中央：画布 ----------------------------- */
  const center = h('section', { class: 'atlas-stage', 'aria-label': '知识星图画布' });
  const graph = createAtlasGraph({
    reducedMotion,
    onViewChange: (view) => { session.view = view; },
    onSelectConcept: (concept) => selectConcept(concept.id, { focus: false, source: 'canvas' }),
    onSelectEdge: (edge) => selectEdge(edge),
    onOpenConcept: (id) => onOpenKnowledge?.(id, { from: 'atlas' }),
  });
  const toolbar = h('div', { class: 'atlas-toolbar' });
  const mkTool = (label, aria, fn) => {
    const b = h('button', { class: 'btn btn--sm', type: 'button', 'aria-label': aria }, label);
    b.addEventListener('click', fn);
    return b;
  };
  toolbar.append(
    mkTool('＋', '放大知识星图', () => graph.zoomBy(1.2)),
    mkTool('－', '缩小知识星图', () => graph.zoomBy(1 / 1.2)),
    mkTool('适配视窗', '自动缩放到刚好容纳全部节点', () => graph.fitView()),
    mkTool('Reset View · 复位', '复位视角到标准缩放且不再平移', () => {
      graph.resetView();
      graph.clearMatches();
      onLog?.('星图', '视角已复位到标准缩放（节点坐标固定，不会重排）', 'info');
    })
  );
  const legend = h('div', { class: 'atlas-legend' }, `
    <span class="atlas-legend__item"><i class="sg-line" data-type="USES"></i>USES · 使用（有向）</span>
    <span class="atlas-legend__item"><i class="sg-line" data-type="PART_OF"></i>PART_OF · 组成部分（有向）</span>
    <span class="atlas-legend__item"><i class="sg-line" data-type="RELATED"></i>RELATED · 相关（无向）</span>
    <span class="atlas-legend__item"><i class="sg-line" data-type="CONTRASTS"></i>CONTRASTS · 对照（无向）</span>`);
  const hint = h('div', { class: 'atlas-hint' },
    `36 个概念 · 拖动空白处平移 · 滚轮缩放 · 单击查看 · 双击进入详情 · 目录可用键盘探索`);
  center.append(graph.el, toolbar, legend, hint);

  /* ----------------------------- 右栏：详情 ----------------------------- */
  const detail = h('aside', { class: 'atlas-detail surface', 'aria-label': '概念详情与关系说明' });
  const detailBody = h('div', { class: 'atlas-detail__scroll' });
  detail.append(h('div', { class: 'panel-head' }, '<span class="panel-head__title">节点详情 / 关系说明</span>'), detailBody);

  const grid = h('div', { class: 'atlas-grid' }, side, center, detail);
  el.append(head, grid);

  /* ----------------------------- 状态 ----------------------------- */
  let selectedId = getConcept(session.selectedId) ? session.selectedId : null;
  let query = typeof session.query === 'string' ? session.query : '';

  searchInput.value = query;
  if ([...chapterFilter.options].some((option) => option.value === session.chapterFilter)) chapterFilter.value = session.chapterFilter;
  if ([...relationFilter.options].some((option) => option.value === session.relationFilter)) relationFilter.value = session.relationFilter;

  function persistContext() {
    session.selectedId = selectedId;
    session.query = query;
    session.chapterFilter = chapterFilter.value;
    session.relationFilter = relationFilter.value;
    session.view = graph.getViewState();
    session.scrolls = {
      list: listEl.scrollTop,
      detail: detailBody.scrollTop,
      grid: grid.scrollTop,
    };
  }

  function restoreScroll(scrolls = session.scrolls || {}) {
    requestAnimationFrame(() => {
      listEl.scrollTop = Number(scrolls.list) || 0;
      detailBody.scrollTop = Number(scrolls.detail) || 0;
      grid.scrollTop = Number(scrolls.grid) || 0;
    });
  }

  const graphNodeIds = new Set(GRAPH_ORDER);

  function renderList() {
    const focusedId = listEl.contains(document.activeElement) ? document.activeElement.dataset.concept : null;
    const model = queryAtlas({ query, chapterId: chapterFilter.value || null, relationType: relationFilter.value || null });
    const visible = new Set(model.nodes.map(c => c.id));
    graph.setFilter(model.nodes, model.edges);
    const result = query ? searchConcepts(query, { chapterId: chapterFilter.value || null }) : null;
    const matched = result && !result.cleared ? new Set(result.matches.map((m) => m.concept.id)) : null;

    listEl.replaceChildren();
    for (const { chapter, concepts } of conceptsByChapter()) {
      if (!concepts.some(c => visible.has(c.id))) continue;
      const readyCount = concepts.filter((c) => conceptAvailability(c.id).hasBody).length;
      const group = h('section', { class: 'atlas-group', 'data-chapter': chapter.id });
      group.append(
        h('div', { class: 'atlas-group__head' },
          `<span class="atlas-group__no">${chapter.no}</span>
           <span class="atlas-group__title">${esc(chapter.title.zh)}<em>${esc(chapter.title.en)}</em></span>
           <span class="atlas-group__count">${readyCount}/${concepts.length}</span>`)
      );
      const ul = h('ul', { class: 'atlas-group__list' });
      for (const concept of concepts) {
        if (!visible.has(concept.id)) continue;
        const availability = conceptAvailability(concept.id);
        const label = learningLabelMeta(learning.labelOf(concept.id));
        const li = h('li');
        const btn = h(
          'button',
          {
            class: 'atlas-list__item',
            type: 'button',
            'data-concept': concept.id,
            'data-status': concept.contentStatus,
            'data-oncanvas': graphNodeIds.has(concept.id) ? 'true' : 'false',
            'data-match': matched ? (matched.has(concept.id) ? 'true' : 'false') : 'auto',
            'aria-current': selectedId === concept.id ? 'true' : 'false',
            'aria-label': `${concept.cn}（${concept.name}）· ${availability.statusMeta.cn} · 学习状态 ${label.cn}`,
          },
          `<span class="atlas-list__idx">${concept.idx}</span>
           <span class="atlas-list__body">
             <span class="atlas-list__name">${esc(concept.cn)}<em>${esc(concept.name)}</em></span>
             <span class="atlas-list__tag">${esc(concept.tagline)}</span>
           </span>
           <span class="tag tag--${availability.statusMeta.tone} atlas-list__state">${esc(availability.statusMeta.cn)}</span>`
        );
        btn.addEventListener('click', () => selectConcept(concept.id, { focus: true, source: 'list' }));
        li.append(btn);
        ul.append(li);
      }
      group.append(ul);
      listEl.append(group);
    }
    if (focusedId) listEl.querySelector(`[data-concept="${focusedId}"]`)?.focus({preventScroll:true});

    if (!result) {
      searchNote.textContent = `显示 ${model.nodes.length}/${CONCEPT_ORDER.length} 个概念 · ${model.edges.length} 条关系`;
      graph.clearMatches();
      return;
    }
    if (result.cleared) {
      searchNote.textContent = '搜索已清除，画布恢复显示全部已开放节点。';
      graph.clearMatches();
      return;
    }
    if (result.empty) {
      searchNote.textContent = `没有找到相关概念「${query}」。可以试试 LLM、工具调用、幻觉，或直接清空搜索恢复全图。`;
      graph.setMatches([]);
      return;
    }
    const top = result.matches[0].concept;
    searchNote.textContent = `找到 ${result.matches.length} 个匹配：${result.matches
      .slice(0, 3)
      .map((m) => m.concept.cn)
      .join('、')}${result.matches.length > 3 ? ' 等' : ''} · 已定位到 ${top.cn}`;
    // 画布只高亮画得出来的节点：命中未开放概念时，详情面板仍然会打开
    graph.setMatches(result.matches.map((m) => m.concept.id).filter((id) => graphNodeIds.has(id)));
  }

  /** 底部进度块保持紧凑：左侧概念目录才是主区域，不能被进度说明挤成一条缝 */
  function renderFoot() {
    const summary = learning.summary();
    footEl.replaceChildren(
      h('div', { class: 'atlas-progress', 'data-el': 'progress' }, `
        <div><b>${summary.explored}</b>/${summary.total} 已探索 · <b>${summary.completedLabs}</b>/6 完成实验 · <b>${summary.related}</b> 发现关联</div>
        <div class="atlas-progress__note">仅本机记录，不计分数；看索引页 ≠ 学完正文，章内可用数量见各章标题。</div>`)
    );
  }

  function relationSection(concept) {
    const wrap = h('div', { class: 'section' });
    const edges = edgesOf(concept.id);
    wrap.append(h('div', { class: 'section__label' }, `<span>语义关系</span><span>${edges.length} 条 · 全部人工配置</span>`));
    for (const edge of edges) {
      const meta = relationMeta(edge.type);
      const otherId = edge.sourceId === concept.id ? edge.targetId : edge.sourceId;
      const other = getConcept(otherId);
      const row = h('button', { class: 'atlas-rel', type: 'button', 'data-edge': edge.id, 'data-type': edge.type },
        `<span class="atlas-rel__head">
           <span class="tag tag--muted">${esc(edge.type)} · ${esc(meta.cn)}</span>
           <span class="atlas-rel__dir">${edge.directed ? `${esc(CONCEPTS[edge.sourceId].cn)} → ${esc(CONCEPTS[edge.targetId].cn)}` : '无向 · 不表示必需依赖'}</span>
         </span>
         <span class="atlas-rel__desc">${esc(edge.description)}</span>
         <span class="atlas-rel__other">相关节点：${esc(other.cn)} · ${esc(other.name)}</span>`);
      row.addEventListener('click', () => selectConcept(otherId, { focus: true, source: 'relation' }));
      wrap.append(row);
    }
    return wrap;
  }

  function renderDetail({ resetScroll = true } = {}) {
    detailBody.replaceChildren();
    if (resetScroll) detailBody.scrollTop = 0;

    if (!selectedId) {
      detailBody.append(
        h('div', { class: 'atlas-detail__hero' }, `
          <div class="inspector__eyebrow"><span>ATLAS</span><span aria-hidden="true">/</span><span>未选中节点</span></div>
          <h2 class="inspector__title">选择一个概念开始</h2>
          <div class="inspector__sub">目录 ${knowledge.concepts} 个概念 · 其中 ${knowledge.byStatus.outline} 个仍在建设中</div>`),
        h('div', { class: 'section' }, `
          <div class="section__label"><span>怎么读这张图</span></div>
          <p class="explain">节点是概念，连线是<b>人工逐条配置</b>的语义关系。USES 表示「会用到」、PART_OF 表示「是它的组成部分」，两者方向明确所以画箭头；RELATED 与 CONTRASTS 只说明容易一起出现或容易混淆，<b>不表示必需依赖</b>。</p>`),
        h('div', { class: 'section' }, `
          <div class="section__label"><span>从任意一处开始</span></div>
          <div class="note"><span class="note__key">自由探索</span><span>六章 36 个概念均可访问。可按章节收拢图谱，或搜索中文、英文与别名。选中节点只查看摘要；进入知识页后才记录阅读。</span></div>`)
      );
      return;
    }

    const concept = getConcept(selectedId);
    const availability = conceptAvailability(selectedId);
    const label = learningLabelMeta(learning.labelOf(selectedId));
    const pos = positionInChapter(selectedId);
    const experiment = experimentOfConcept(selectedId) || EXPERIMENTS.find(e => e.chapterId === concept.chapterId);

    const hero = h('div', { class: 'atlas-detail__hero', 'data-concept': concept.id }, `
      <div class="inspector__eyebrow">
        <span>${concept.idx}</span><span aria-hidden="true">/</span><span>第 ${concept.chapterNo} 章 · ${esc(concept.chapterCn)}</span><span aria-hidden="true">/</span><span>第 ${pos.index}/${pos.total} 个</span>
      </div>
      <h2 class="inspector__title">${esc(concept.cn)}</h2>
      <div class="inspector__sub">${esc(concept.name)} · ${esc(concept.tagline)}</div>
      <div class="chips">
        <span class="tag tag--${availability.statusMeta.tone}">${esc(availability.statusMeta.cn)}</span>
        <span class="tag tag--${label.tone}">${esc(label.cn)}</span>
        <span class="tag tag--muted">${esc(concept.id)}</span>
        ${concept.systemTarget === 'none' ? '' : '<span class="tag tag--signal">可在装配台中查看</span>'}
      </div>`);
    detailBody.append(hero);

    const learn = h('button', { class: 'btn btn--primary atlas-detail__learn', type: 'button', 'data-act': 'learn' },
      availability.hasBody ? '打开知识页' : '打开索引页（建设中）');
    learn.addEventListener('click', () => onOpenKnowledge?.(concept.id, { from: 'atlas' }));
    detailBody.append(learn);

    if (!availability.hasBody) {
      detailBody.append(
        h('div', { class: 'section' }, `
          <div class="section__label"><span>索引说明</span><span>草稿 · 未审校</span></div>
          <p class="explain">${md(concept.oneLiner)}</p>
          <div class="note" data-act="outline-note">
            <span class="note__key">内容建设中</span>
            <span>本概念目前只有索引级元数据：正文（UNDERSTAND / INSPECT）、常见误解与实验将在 <b>${esc(concept.plannedMilestone || '后续阶段')}</b> 开放。浏览它不会让学习进度变成「已学完」。</span>
          </div>`)
      );
    } else {
      const understand = h('details', { class: 'section atlas-detail__more' });
      understand.append(h('summary', {}, '展开简明解释'));
      for (const para of concept.understand.slice(0, 2)) understand.append(h('p', { class: 'explain' }, md(para)));
      detailBody.append(understand);
    }

    detailBody.append(relationSection(concept));

    const related = h('div', { class: 'section' });
    related.append(h('div', { class: 'section__label' }, '<span>相关概念入口</span><span>均有真实关系</span>'));
    const chips = h('div', { class: 'chips' });
    for (const item of relatedOf(concept.id)) {
      const b = h('button', { class: 'btn btn--sm', type: 'button', 'data-related': item.concept.id }, `${item.concept.cn} · ${item.concept.name}`);
      b.addEventListener('click', () => selectConcept(item.concept.id, { focus: true, source: 'related' }));
      chips.append(b);
    }
    related.append(chips);
    detailBody.append(related);

    /* ---------------- 操作区 ---------------- */
    const acts = h('div', { class: 'section atlas-actions' });
    acts.append(h('div', { class: 'section__label' }, '<span>继续探索</span>'));

    if (experiment) {
      const lab = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'open-lab' }, `进入本章实验 · ${experiment.title}`);
      lab.addEventListener('click', () => onOpenLab?.(experiment.id, experiment.entryConceptId));
      if (experiment.status === 'available') acts.append(lab);
      acts.append(
        h('div', { class: `note ${experiment.status === 'available' ? 'note--info' : ''}`, 'data-act': 'experiment-entry' }, `
          <span class="note__key">实验</span>
          <span>${esc(experiment.title)} · ${esc(experiment.status === 'available' ? '可操作（知识页 EXPERIMENT 步骤）' : `后续阶段开放（${experiment.milestone}）`)}</span>`)
      );
    }

    if (concept.systemTarget === 'none') {
      acts.append(
        h('div', { class: 'note', 'data-act': 'constructor-none' }, `
          <span class="note__key">能力架</span>
          <span>${esc(TARGET_NOTE.none)}</span>`)
      );
    } else {
      const view = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'view-constructor' }, 'VIEW IN CONSTRUCTOR · 在系统中查看');
      view.addEventListener('click', () => onViewInConstructor?.(concept));
      acts.append(view, h('div', { class: 'mono atlas-actions__note' }, esc(TARGET_NOTE[concept.systemTarget])));
    }

    const nav = neighborConcepts(concept.id);
    const siblingRow = h('div', { class: 'chips', 'data-act': 'sibling-nav' });
    if (nav.prev) {
      const b = h('button', { class: 'btn btn--sm btn--ghost', type: 'button' }, `← ${nav.prev.cn}`);
      b.addEventListener('click', () => selectConcept(nav.prev.id, { focus: true, source: 'sibling' }));
      siblingRow.append(b);
    }
    if (nav.next) {
      const b = h('button', { class: 'btn btn--sm btn--ghost', type: 'button' }, `${nav.next.cn} →`);
      b.addEventListener('click', () => selectConcept(nav.next.id, { focus: true, source: 'sibling' }));
      siblingRow.append(b);
    }
    if (siblingRow.childElementCount) acts.append(siblingRow);

    const back = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'back-hub' }, '← Back to Hub · 返回中央核心');
    back.addEventListener('click', () => onBackToHub?.('hub'));
    acts.append(back);
    detailBody.append(acts);
  }

  /* ---------------- 选中逻辑：唯一选中状态驱动画布与详情 ---------------- */
  function selectConcept(conceptId, { focus = false, source = 'api' } = {}) {
    const concept = getConcept(conceptId);
    if (!concept) return;
    if (source !== 'search') {
      const visible = queryAtlas({ query, chapterId: chapterFilter.value || null, relationType: relationFilter.value || null }).nodes.some(c => c.id === conceptId);
      if (!visible) {
        query = '';
        searchInput.value = '';
        chapterFilter.value = '';
        relationFilter.value = '';
      }
    }
    selectedId = conceptId;
    persistContext();
    graph.setSelectedEdge(null);
    graph.setSelection(graphNodeIds.has(conceptId) ? conceptId : null);
    if (focus && graphNodeIds.has(conceptId)) graph.focusConcept(conceptId);
    // 搜索、程序聚焦、选中摘要不构成阅读；由知识页记录真实查看事件。
    renderDetail();
    renderList();
    const availability = conceptAvailability(conceptId);
    onLog?.(
      '星图',
      `选中概念 ${concept.cn}（${concept.name}）· 第 ${concept.chapterNo} 章 · ${availability.statusMeta.cn} · 关系中 ${edgesOf(conceptId).length} 条已突出`,
      'signal'
    );
  }

  function selectEdge(edge) {
    if (!edge) return;
    const meta = relationMeta(edge.type);
    selectedId = null;
    persistContext();
    graph.setSelection(null);
    graph.setSelectedEdge(edge.id);
    detailBody.replaceChildren();
    detailBody.scrollTop = 0;
    detailBody.append(
      h('div', { class: 'atlas-detail__hero', 'data-edge': edge.id }, `
        <div class="inspector__eyebrow"><span>关系</span><span aria-hidden="true">/</span><span>${esc(edge.id)}</span></div>
        <h2 class="inspector__title">${esc(CONCEPTS[edge.sourceId].cn)} ${edge.directed ? '→' : '—'} ${esc(CONCEPTS[edge.targetId].cn)}</h2>
        <div class="inspector__sub">${esc(edge.type)} · ${esc(meta.cn)} · ${edge.directed ? '有向关系（source → target）' : '无向关系'}</div>
        <div class="chips">
          <span class="tag tag--muted">${esc(edge.sourceId)}</span>
          <span class="tag tag--signal">${esc(edge.type)}</span>
          <span class="tag tag--muted">${esc(edge.targetId)}</span>
        </div>`),
      h('div', { class: 'section' }, `
        <div class="section__label"><span>这条关系在说什么</span><span>人工配置 · ${esc(edge.origin || 'M0.3')}</span></div>
        <p class="explain">${esc(edge.description)}</p>`),
      h('div', { class: 'section' }, `
        <div class="section__label"><span>关系类型含义</span></div>
        <div class="note note--info"><span class="note__key">${esc(edge.type)}</span><span>${esc(meta.desc)}</span></div>`)
    );
    const jumps = h('div', { class: 'chips', style: 'margin-top:10px' });
    for (const id of [edge.sourceId, edge.targetId]) {
      const b = h('button', { class: 'btn btn--sm', type: 'button' }, `查看 ${CONCEPTS[id].cn}`);
      b.addEventListener('click', () => selectConcept(id, { focus: true, source: 'relation' }));
      jumps.append(b);
    }
    detailBody.append(jumps);
    onLog?.('星图', `查看关系 ${edge.sourceId} → ${edge.targetId}（${edge.type}）：${meta.cn}`, 'info');
  }

  /* ---------------- 搜索 ---------------- */
  function applySearch(value) {
    query = String(value || '');
    session.query = query;
    const result = searchConcepts(query, { chapterId: chapterFilter.value || null });
    if (!result.cleared && !result.empty) {
      // selectConcept updates both the detail and filtered list once.
      selectConcept(result.matches[0].concept.id, { focus: true, source: 'search' });
      onLog?.(
        '星图',
        `搜索「${query}」命中 ${result.matches.length} 个概念 · 已定位到 ${result.matches[0].concept.cn}（${result.matches[0].concept.chapterNo} 章）`,
        'signal'
      );
    } else {
      renderList();
      renderDetail();
    }
  }

  let searchTimer = 0;
  searchInput.addEventListener('input', () => {
    if (composing) return;
    clearTimeout(searchTimer);
    const value = searchInput.value;
    searchTimer = setTimeout(() => applySearch(value), 140);
  });
  let composing = false;
  searchInput.addEventListener('compositionstart', () => { composing = true; clearTimeout(searchTimer); });
  searchInput.addEventListener('compositionend', () => { composing = false; applySearch(searchInput.value); });
  for (const filter of [chapterFilter, relationFilter]) filter.addEventListener('change', () => {
    selectedId = null; graph.setSelection(null); graph.setSelectedEdge(null);
    persistContext();
    renderList(); renderDetail(); graph.fitView();
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      searchInput.value = '';
      clearTimeout(searchTimer);
      applySearch('');
    }
  });
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    chapterFilter.value = ''; relationFilter.value = '';
    selectedId = null; graph.setSelection(null); graph.setSelectedEdge(null);
    clearTimeout(searchTimer);
    applySearch('');
    graph.resetView();
    persistContext();
  });

  for (const node of [listEl, detailBody, grid]) node.addEventListener('scroll', persistContext, { passive: true });

  /* ---------------- 对外接口 ---------------- */
  if (initialViewState) graph.restoreViewState(initialViewState);
  restoreScroll(initialScrollState);
  const unsubscribeLearning = learning.subscribe(() => {
    renderList();
    renderFoot();
  });

  return {
    el,
    /** 打开时恢复上次选中的概念（不触发模拟运行） */
    activate(conceptId = null) {
      if (conceptId && getConcept(conceptId) && conceptId !== selectedId) {
        selectConcept(conceptId, { focus: true, source: 'open' });
        renderFoot();
      }
      else {
        const savedScrolls = { ...(session.scrolls || {}) };
        graph.setSelection(selectedId);
        renderList();
        renderFoot();
        renderDetail({ resetScroll: false });
        if (session.view) graph.restoreViewState(session.view);
        restoreScroll(savedScrolls);
      }
    },
    selectConcept,
    currentSelection: () => selectedId,
    /** Esc：先清除选中，不清空搜索、也不离开工作区（Back to Hub 始终可达） */
    clearSelection() {
      selectedId = null;
      persistContext();
      graph.setSelection(null);
      graph.setSelectedEdge(null);
      renderDetail();
      renderList();
      return true;
    },
    search(value) {
      searchInput.value = value;
      applySearch(value);
    },
    /** 章节内概念列表（Story / 自检脚本共用同一份查询） */
    conceptsOfChapter: (chapterId) => getConceptsByChapter(chapterId),
    graph,
    dispose() {
      persistContext();
      clearTimeout(searchTimer);
      unsubscribeLearning?.();
      graph.destroy();
    },
  };
}
