/**
 * src/features/atlas/components/atlasWorkspace.js
 * ------------------------------------------------------------------
 * ATLAS / 知识星图工作区：左侧概念清单与搜索、中央星图、右侧节点详情。
 *
 * 职责边界（M0.3_TASK §4 / §8.3）：
 *   · 只读知识数据与学习进度，**不触发模拟运行**，也不清空运行轨迹；
 *   · 只有 tool_calling 提供完整分层知识页入口；其余 9 个概念明确显示
 *     「完整知识页与实验在后续阶段开放」，不制造点了没反应的假按钮；
 *   · 「在系统中查看」只做定位与说明，不私自装配模块或授予权限。
 * ------------------------------------------------------------------
 */
import { h, esc, md } from '../../constructor/components/dom.js';
import {
  CONCEPTS,
  CONCEPT_ORDER,
  RELATIONSHIPS,
  edgesOf,
  getConcept,
  graphStats,
  relationMeta,
  relatedOf,
  searchConcepts,
} from '../data/index.js';
import { createAtlasGraph } from '../graph/atlasGraph.js';
import { learningLabelMeta } from '../state/learning.js';

const TARGET_NOTE = {
  core: '装配台中的落点：中央核心（Model Core）本身。',
  tools: '装配台中的落点：能力架里的 Announcement Search 与 Document Reader 工具模块。',
  none: '装配台暂未提供对应模块：这是解释性知识节点，不会伪装成已装配的工具。',
};

export function createAtlasWorkspace({
  learning,
  onBackToHub,
  onOpenKnowledge,
  onViewInConstructor,
  reducedMotion = false,
  onLog,
} = {}) {
  const el = h('div', { class: 'workspace workspace--atlas', 'data-open': 'true' });

  /* ----------------------------- 头部 ----------------------------- */
  const head = h('header', { class: 'ws-head' });
  const stats = graphStats();
  head.append(
    h('div', { class: 'ws-head__id' }, `
      <span class="ws-head__tag">A/0</span>
      <span class="ws-head__title">ATLAS · 知识星图</span>
      <span class="ws-head__meta">${stats.concepts} 个概念 · ${stats.edges} 条语义关系 · 固定坐标不随机重排</span>`),
    h('div', { class: 'ws-head__actions' }, `
      <span class="tag tag--attention">SIMULATED · 本地教学模拟</span>`)
  );
  const backBtn = h('button', { class: 'btn btn--primary', type: 'button', 'aria-label': '返回中央核心（Hub）视图' }, '← 返回 Hub');
  backBtn.addEventListener('click', () => onBackToHub?.('hub'));
  head.querySelector('.ws-head__actions').append(backBtn);

  /* ----------------------------- 左栏：搜索 + 清单 ----------------------------- */
  const side = h('aside', { class: 'atlas-side surface', 'aria-label': '概念清单与搜索' });
  const searchInput = h('input', {
    class: 'atlas-search__input',
    type: 'search',
    placeholder: '搜索概念（中英文别名均可，如 LLM / 工具调用）',
    'aria-label': '搜索知识概念：支持中英文别名、大小写与部分匹配',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const searchClear = h('button', { class: 'btn btn--sm btn--ghost', type: 'button', 'aria-label': '清除搜索并恢复全图' }, '清除');
  const searchNote = h('div', { class: 'atlas-search__note', role: 'status', 'aria-live': 'polite' });
  const listEl = h('ul', { class: 'atlas-list', 'aria-label': '概念清单：键盘与触屏用户可在这里直接选择节点' });
  const footEl = h('div', { class: 'atlas-side__foot' });
  side.append(
    h('div', { class: 'panel-head' }, '<span class="panel-head__title">搜索与概念清单</span>'),
    h('div', { class: 'atlas-search' }, searchInput, searchClear),
    searchNote,
    listEl,
    footEl
  );

  /* ----------------------------- 中央：画布 ----------------------------- */
  const center = h('section', { class: 'atlas-stage', 'aria-label': '知识星图画布' });
  const graph = createAtlasGraph({
    reducedMotion,
    onSelectConcept: (concept) => selectConcept(concept.id, { focus: false, source: 'canvas' }),
    onSelectEdge: (edge) => selectEdge(edge),
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
    <span class="atlas-legend__item"><i class="sg-line" data-type="RELATED"></i>RELATED · 相关（无向）</span>
    <span class="atlas-legend__item"><i class="sg-line" data-type="CONTRASTS"></i>CONTRASTS · 对照（无向）</span>
    <span class="atlas-legend__item"><i class="atlas-legend__mark"></i>带标记的节点可在装配台中查看</span>`);
  const hint = h('div', { class: 'atlas-hint' }, '拖动平移 · 滚轮 / ＋－ 缩放 · 双击节点聚焦 · Tab 可依次聚焦节点与关系');
  center.append(graph.el, toolbar, legend, hint);

  /* ----------------------------- 右栏：详情 ----------------------------- */
  const detail = h('aside', { class: 'atlas-detail surface', 'aria-label': '概念详情与关系说明' });
  const detailBody = h('div', { class: 'atlas-detail__scroll' });
  detail.append(h('div', { class: 'panel-head' }, '<span class="panel-head__title">节点详情 / 关系说明</span>'), detailBody);

  el.append(head, h('div', { class: 'atlas-grid' }, side, center, detail));

  /* ----------------------------- 状态 ----------------------------- */
  let selectedId = null;
  let query = '';

  function renderList() {
    const result = query ? searchConcepts(query) : null;
    const matched = result && !result.cleared ? new Set(result.matches.map((m) => m.concept.id)) : null;

    listEl.replaceChildren();
    for (const id of CONCEPT_ORDER) {
      const concept = CONCEPTS[id];
      const label = learningLabelMeta(learning.labelOf(id));
      const li = h('li');
      const btn = h(
        'button',
        {
          class: 'atlas-list__item',
          type: 'button',
          'data-concept': id,
          'data-match': matched ? (matched.has(id) ? 'true' : 'false') : 'auto',
          'aria-current': selectedId === id ? 'true' : 'false',
          'aria-label': `${concept.cn}（${concept.name}）· 学习状态 ${label.cn}`,
        },
        `<span class="atlas-list__idx">${concept.idx}</span>
         <span class="atlas-list__body">
           <span class="atlas-list__name">${esc(concept.cn)}<em>${esc(concept.name)}</em></span>
           <span class="atlas-list__tag">${esc(concept.tagline)}</span>
         </span>
         <span class="tag tag--${label.tone} atlas-list__state">${esc(label.cn)}</span>`
      );
      btn.addEventListener('click', () => selectConcept(id, { focus: true, source: 'list' }));
      li.append(btn);
      listEl.append(li);
    }

    if (!result) {
      searchNote.textContent = `共 ${CONCEPT_ORDER.length} 个首期概念：点击任一节点查看定义、常见误解与相关概念。`;
      graph.clearMatches();
      return;
    }
    if (result.cleared) {
      searchNote.textContent = '搜索已清除，画布恢复显示全部节点。';
      graph.clearMatches();
      return;
    }
    if (result.empty) {
      searchNote.textContent = `没有找到相关概念「${query}」。可以试试 LLM、Agent、Tool Calling，或直接清空搜索恢复全图。`;
      graph.setMatches([]);
      return;
    }
    const top = result.matches[0].concept;
    searchNote.textContent = `找到 ${result.matches.length} 个匹配：${result.matches
      .slice(0, 3)
      .map((m) => m.concept.cn)
      .join('、')}${result.matches.length > 3 ? ' 等' : ''} · 已定位到 ${top.cn}`;
    graph.setMatches(result.matches.map((m) => m.concept.id));
  }

  function renderFoot() {
    const summary = learning.summary();
    footEl.replaceChildren(
      h('div', { class: 'section__label', style: 'margin:8px 0 6px' }, `<span>学习进度</span><span>不是测验成绩</span>`),
      h('div', { class: 'atlas-progress' }, `
        <div><b>${summary.explored}</b> / ${summary.total} 个概念已查看</div>
        <div><b>${summary.experiments}</b> / ${summary.total} 个概念已完成内嵌实验</div>`),
      h('div', { class: 'note note--info', style: 'margin-top:8px' }, `
        <span class="note__key">说明</span>
        <span>进度只保存在本机独立命名空间，不写入装配配置，也不影响模拟分支；它记录的是「看没看过」，不是分数。</span>`)
    );
  }

  function relationSection(concept) {
    const wrap = h('div', { class: 'section' });
    wrap.append(h('div', { class: 'section__label' }, `<span>语义关系</span><span>${edgesOf(concept.id).length} 条</span>`));
    for (const edge of edgesOf(concept.id)) {
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

  function renderDetail() {
    detailBody.replaceChildren();
    detailBody.scrollTop = 0;

    if (!selectedId) {
      detailBody.append(
        h('div', { class: 'atlas-detail__hero' }, `
          <div class="inspector__eyebrow"><span>ATLAS</span><span aria-hidden="true">/</span><span>未选中节点</span></div>
          <h2 class="inspector__title">选择一个概念开始</h2>
          <div class="inspector__sub">共 ${CONCEPT_ORDER.length} 个首期节点，全部为人工审校的中文解释</div>`),
        h('div', { class: 'section' }, `
          <div class="section__label"><span>怎么读这张图</span></div>
          <p class="explain">节点是概念，连线是**人工逐条配置**的语义关系。USES 表示「会用到」，方向明确所以画箭头；RELATED 与 CONTRASTS 只说明两者容易一起出现或容易混淆，**不表示必需依赖**，所以不画箭头。</p>`),
        h('div', { class: 'section' }, `
          <div class="section__label"><span>边界</span></div>
          <div class="note"><span class="note__key">诚实声明</span><span>知识星图只表达概念关系：它不因为模拟运行失败而改变连线，也不代表任何真实模型、真实 MCP 连接或真实检索已经发生。</span></div>`)
      );
      return;
    }

    const concept = getConcept(selectedId);
    const label = learningLabelMeta(learning.labelOf(selectedId));
    const hasKnowledgePage = selectedId === 'tool_calling';

    const hero = h('div', { class: 'atlas-detail__hero', 'data-concept': concept.id }, `
      <div class="inspector__eyebrow">
        <span>${concept.idx}</span><span aria-hidden="true">/</span><span>第 ${concept.chapter} 章 · ${esc(concept.chapterCn)}</span>
      </div>
      <h2 class="inspector__title">${esc(concept.cn)}</h2>
      <div class="inspector__sub">${esc(concept.name)} · ${esc(concept.tagline)}</div>
      <div class="chips">
        <span class="tag tag--${label.tone}">${esc(label.cn)}</span>
        <span class="tag tag--muted">${esc(concept.id)}</span>
        ${concept.systemTarget === 'none' ? '' : `<span class="tag tag--signal">可在装配台中查看</span>`}
      </div>`);
    detailBody.append(hero);

    const understand = h('div', { class: 'section' });
    understand.append(h('div', { class: 'section__label' }, '<span>简明解释</span><span>已审校</span>'));
    for (const para of concept.understand) understand.append(h('p', { class: 'explain' }, md(para)));
    detailBody.append(understand);

    const misc = h('div', { class: 'section' });
    misc.append(h('div', { class: 'section__label' }, '<span>常见误解</span><span>先破除再往下看</span>'));
    for (const item of concept.misconceptions) {
      misc.append(
        h('div', { class: 'misconception' }, `
          <div class="misconception__claim"><span class="misconception__mark">误解</span>${esc(item.claim)}</div>
          <div class="misconception__fix"><span class="misconception__mark misconception__mark--fix">纠正</span>${esc(item.correction)}</div>`)
      );
    }
    detailBody.append(misc);

    detailBody.append(relationSection(concept));

    const related = h('div', { class: 'section' });
    related.append(h('div', { class: 'section__label' }, '<span>相关概念入口</span><span>图上均有连线</span>'));
    const chips = h('div', { class: 'chips' });
    for (const item of relatedOf(concept.id)) {
      const b = h('button', { class: 'btn btn--sm', type: 'button', 'data-related': item.concept.id }, `${item.concept.cn} · ${item.concept.name}`);
      b.addEventListener('click', () => selectConcept(item.concept.id, { focus: true, source: 'related' }));
      chips.append(b);
    }
    related.append(chips);
    detailBody.append(related);

    detailBody.append(h('div', { class: 'section' }, `
      <div class="section__label"><span>后续学习提示</span></div>
      <p class="explain">${md(concept.nextSteps)}</p>`));

    /* ---------------- 操作区 ---------------- */
    const actions = h('div', { class: 'section atlas-actions' });
    actions.append(h('div', { class: 'section__label' }, '<span>下一步</span><span>不含假按钮</span>'));

    if (hasKnowledgePage) {
      const learn = h('button', { class: 'btn btn--primary', type: 'button', 'data-act': 'learn' }, 'LEARN · 打开完整知识页');
      learn.addEventListener('click', () => onOpenKnowledge?.(concept.id));
      actions.append(learn);
    } else {
      actions.append(
        h('div', { class: 'note', 'data-act': 'learn-locked' }, `
          <span class="note__key">Coming in later phase</span>
          <span>本节点当前只开放已审校的简介、常见误解与关系说明；完整分层知识页与可操作实验在后续阶段开放。本轮只有 <b>Tool Calling</b> 提供完整的分层知识页。</span>`)
      );
    }

    if (concept.systemTarget === 'none') {
      actions.append(
        h('div', { class: 'note', 'data-act': 'constructor-none' }, `
          <span class="note__key">能力架</span>
          <span>${esc(TARGET_NOTE.none)}</span>`)
      );
    } else {
      const view = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'view-constructor' }, 'VIEW IN CONSTRUCTOR · 在系统中查看');
      view.addEventListener('click', () => onViewInConstructor?.(concept));
      actions.append(view, h('div', { class: 'mono atlas-actions__note' }, esc(TARGET_NOTE[concept.systemTarget])));
    }

    const back = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'back-hub' }, '← Back to Hub · 返回中央核心');
    back.addEventListener('click', () => onBackToHub?.('hub'));
    actions.append(back);
    detailBody.append(actions);
  }

  /* ---------------- 选中逻辑：唯一选中状态驱动画布与详情 ---------------- */
  function selectConcept(conceptId, { focus = false, source = 'api' } = {}) {
    const concept = getConcept(conceptId);
    if (!concept) return;
    selectedId = conceptId;
    graph.setSelectedEdge(null);
    graph.setSelection(conceptId);
    if (focus) graph.focusConcept(conceptId);
    if (source === 'relation' || source === 'related') learning.markRelatedDiscovered(conceptId);
    else learning.markExplored(conceptId);
    renderDetail();
    renderList();
    onLog?.('星图', `选中概念 ${concept.cn}（${concept.name}）· 第 ${concept.chapter} 章 · 图中 ${edgesOf(conceptId).length} 条关系已突出`, 'signal');
  }

  function selectEdge(edge) {
    if (!edge) return;
    const meta = relationMeta(edge.type);
    selectedId = null;
    graph.setSelection(null);
    graph.setSelectedEdge(edge.id);
    detailBody.replaceChildren();
    detailBody.scrollTop = 0;
    detailBody.append(
      h('div', { class: 'atlas-detail__hero', 'data-edge': edge.id }, `
        <div class="inspector__eyebrow"><span>关系</span><span aria-hidden="true">/</span><span>${esc(edge.id)}</span></div>
        <h2 class="inspector__title">${esc(CONCEPTS[edge.sourceId].cn)} ${edge.directed ? '→' : '—'} ${esc(CONCEPTS[edge.targetId].cn)}</h2>
        <div class="inspector__sub">${esc(edge.type)} · ${esc(meta.cn)} · ${edge.directed ? '有向关系' : '无向关系'}</div>
        <div class="chips">
          <span class="tag tag--muted">${esc(edge.sourceId)}</span>
          <span class="tag tag--signal">${esc(edge.type)}</span>
          <span class="tag tag--muted">${esc(edge.targetId)}</span>
        </div>`),
      h('div', { class: 'section' }, `
        <div class="section__label"><span>这条关系在说什么</span><span>人工配置</span></div>
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
    const result = searchConcepts(query);
    renderList();
    if (!result.cleared && !result.empty) {
      // §3 短闭环：搜索命中后画布自动定位到该节点并打开摘要
      selectConcept(result.matches[0].concept.id, { focus: true, source: 'search' });
      onLog?.('星图', `搜索「${query}」命中 ${result.matches.length} 个概念 · 已定位到 ${result.matches[0].concept.cn} 并突出其直接关联线`, 'signal');
    } else {
      renderDetail();
    }
  }

  let searchTimer = 0;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const value = searchInput.value;
    searchTimer = setTimeout(() => applySearch(value), 140);
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
    clearTimeout(searchTimer);
    applySearch('');
  });

  /* ---------------- 对外接口 ---------------- */
  renderList();
  renderFoot();
  renderDetail();
  const unsubscribeLearning = learning.subscribe(() => {
    renderList();
    renderFoot();
  });

  return {
    el,
    /** 打开时恢复上次选中的概念（不触发模拟运行） */
    activate(conceptId = null) {
      if (conceptId && getConcept(conceptId)) selectConcept(conceptId, { focus: true, source: 'open' });
      else {
        graph.resetView();
        graph.setSelection(selectedId);
        renderList();
        renderFoot();
        renderDetail();
      }
    },
    selectConcept,
    currentSelection: () => selectedId,
    /** Esc：先清除选中，不清空搜索、也不离开工作区（Back to Hub 始终可达） */
    clearSelection() {
      selectedId = null;
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
    graph,
    dispose() {
      clearTimeout(searchTimer);
      unsubscribeLearning?.();
      graph.destroy();
    },
  };
}

export { RELATIONSHIPS };
