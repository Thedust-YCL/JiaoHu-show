/**
 * src/features/reports/components/reportView.js
 * ------------------------------------------------------------------
 * REPORT / SOURCE INSPECTOR 阅读器（M0.4_TASK §8 / §9.3）。
 *
 * 三栏科研档案阅读模式：
 *   左：可折叠报告目录 + 真实指标 + 导出入口
 *   中：正文（带 [S1] 引用标记）
 *   右：SOURCE INSPECTOR（来源、可见元数据、片段高亮、跳转到执行事件）
 *
 * 阅读纪律：
 *   · 正文只来自 ResearchReport 的结构化块，不做「看起来像 AI」的拼接；
 *   · 引用编号只在报告生成时派生一次，界面不重新编号；
 *   · 所有数据文本用 textContent 写入，绝不 innerHTML 拼接（§7.2 末条）；
 *   · 阅读位置 / 选中段落 / 筛选状态在往返执行台后保留（§3.9 / A61）。
 * ------------------------------------------------------------------
 */
import { h, esc } from '../../constructor/components/dom.js';
import { SIMULATED_CONSTANT } from '../../../data/content.js';
import { PREDICATE_LABEL, PREDICATES } from '../../../simulation/rules/evidence/claims.js';
import { markdownFilename, reportToMarkdown, downloadMarkdown } from '../export/markdown.js';

const STATUS_META = {
  supported: { cn: '有引用支持', tone: 'success' },
  unresolved: { cn: '未核实 / 未决', tone: 'attention' },
  insufficient: { cn: '证据不足', tone: 'attention' },
};

const REPORT_STATUS_META = {
  complete: { cn: '完整（本教学规则内）', tone: 'success' },
  partial: { cn: '部分完成 · 仍有未决', tone: 'attention' },
  blocked: { cn: '受限 · 无充分证据', tone: 'error' },
};

const FILTERS = [
  { id: 'all', cn: '全部陈述' },
  { id: 'supported', cn: '仅已支持' },
  { id: 'open', cn: '仅未决 / 证据不足' },
];

/** 在片段里高亮 anchor：只用文本节点 + <mark>，不做 HTML 注入 */
function highlightText(text, anchor) {
  const frag = document.createDocumentFragment();
  const source = String(text ?? '');
  const needle = String(anchor ?? '');
  if (!needle || !source.includes(needle)) {
    frag.append(document.createTextNode(source));
    return frag;
  }
  let from = 0;
  let at = source.indexOf(needle, from);
  while (at !== -1) {
    if (at > from) frag.append(document.createTextNode(source.slice(from, at)));
    const mark = document.createElement('mark');
    mark.className = 'rp-hit';
    mark.textContent = needle;
    frag.append(mark);
    from = at + needle.length;
    at = source.indexOf(needle, from);
  }
  if (from < source.length) frag.append(document.createTextNode(source.slice(from)));
  return frag;
}

function metaChip(text, tone = 'muted') {
  return h('span', { class: `tag tag--${tone}`, text });
}

export function createReportView({ onLog, onViewEvent, onSwitchMode, getRun, mission } = {}) {
  const el = h('div', { class: 'rp', 'data-view': 'report' });

  /* ------------------------------ 左：目录 ------------------------------ */
  const tocToggle = h('button', { class: 'rp-toc__toggle', type: 'button', 'aria-label': '折叠或展开报告目录', 'aria-expanded': 'true' }, '目录');
  const tocNav = h('nav', { class: 'rp-toc__nav', 'aria-label': '报告目录' });
  const tocMeta = h('div', { class: 'rp-toc__meta' });
  const exportBtn = h('button', { class: 'btn btn--sm btn--primary', type: 'button', 'data-act': 'download' }, '↓ 下载 Markdown');
  const copyBtn = h('button', { class: 'btn btn--sm btn--ghost', type: 'button', 'data-act': 'copy' }, '复制 Markdown');
  const backExec = h('button', { class: 'btn btn--sm btn--ghost', type: 'button', 'data-act': 'back-execution' }, '← 返回执行台');
  const toc = h('aside', { class: 'rp-toc surface' });
  toc.append(
    h('div', { class: 'panel-head' }, `<span class="panel-head__title">REPORT INDEX</span>`),
    tocToggle,
    tocNav,
    tocMeta,
    h('div', { class: 'rp-toc__actions' }, exportBtn, copyBtn, backExec)
  );

  /* ------------------------------ 中：正文 ------------------------------ */
  const docHead = h('header', { class: 'rp-doc__head' });
  const filterBar = h('div', { class: 'rp-filters', role: 'group', 'aria-label': '陈述筛选' });
  const docBody = h('article', { class: 'rp-doc__body' });
  const doc = h('div', { class: 'rp-doc' });
  const scroller = h('div', { class: 'rp-doc__scroll', tabindex: '0', 'aria-label': '报告正文（可用方向键滚动）' });
  scroller.append(docHead, filterBar, docBody);
  doc.append(scroller);

  /* ------------------------------ 右：来源检视 ------------------------------ */
  const sourceHead = h('div', { class: 'panel-head' }, `
    <span class="panel-head__title">SOURCE INSPECTOR</span>
    <span class="tag tag--muted" data-el="source-pos">—</span>`);
  const sourceBody = h('div', { class: 'rp-source__body' });
  const sourceAside = h('aside', { class: 'rp-source surface', 'aria-label': '来源检视面板' });
  sourceAside.append(sourceHead, sourceBody);

  el.append(toc, doc, sourceAside);

  /* ------------------------------ 状态 ------------------------------ */
  let run = null;
  let report = null;
  let metrics = null;
  let filter = 'all';
  let activeCitationId = null;
  let activeClaimId = null;
  let savedScroll = 0;
  let filterButtons = [];
  let tocInitialized = false;

  /* ------------------------------ 目录 ------------------------------ */
  tocToggle.addEventListener('click', () => {
    const collapsed = el.dataset.toc === 'collapsed';
    el.dataset.toc = collapsed ? 'open' : 'collapsed';
    tocToggle.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
    tocToggle.textContent = collapsed ? '目录' : '展开目录';
  });

  function renderToc() {
    tocNav.replaceChildren();
    if (!report) return;
    const items = [
      ...(report.sections || []).map((s) => ({ id: s.id, label: `${s.id} · ${s.title}` })),
      { id: 'METRICS', label: '可量化指标' },
      { id: 'UNRESOLVED', label: '未解决问题' },
    ];
    for (const item of items) {
      const b = h('button', { class: 'rp-toc__item', type: 'button', 'data-target': item.id }, item.label);
      b.addEventListener('click', () => {
        const target = docBody.querySelector(`[data-section="${item.id}"]`);
        if (target) {
          scroller.scrollTo({ top: Math.max(0, target.offsetTop - 12), behavior: 'smooth' });
          target.classList.add('is-flash');
          setTimeout(() => target.classList.remove('is-flash'), 900);
        }
      });
      tocNav.append(b);
    }
  }

  function renderTocMeta() {
    tocMeta.replaceChildren();
    if (!report) return;
    const statusMeta = REPORT_STATUS_META[report.status] || REPORT_STATUS_META.partial;
    const chips = h('div', { class: 'chips' });
    chips.append(metaChip(`报告 ${report.status}`, statusMeta.tone));
    if (run) chips.append(metaChip(`${run.events.length} 个事件`));
    chips.append(metaChip(report.options?.evidencePolicy || '—'));
    tocMeta.append(chips);
    if (metrics) {
      const list = h('dl', { class: 'rp-metrics rp-metrics--compact' });
      const rows = [
        ['已读取资料', `${metrics.sourcesRead} 份（全文 ${metrics.fullTextReads}）`],
        ['有引用支持的发现', `${metrics.factClaimsSupported} / ${metrics.factClaimsNeeded}`],
        ['冲突 发现 / 处理 / 未决', `${metrics.conflictsDetected} / ${metrics.conflictsResolved} / ${metrics.conflictsUnresolved}`],
        ['引用条目', String(metrics.citationCount)],
      ];
      for (const [k, v] of rows) {
        list.append(h('dt', {}, k), h('dd', {}, v));
      }
      tocMeta.append(list);
    }
  }

  /* ------------------------------ 页头 ------------------------------ */
  /** 把本次 Run 的配置摘要压成一行 chip，避免报告页头丢失运行上下文 */
  function configChipText() {
    const c = configSummary();
    return `检索 ${c.searchScope || '—'} / ${c.maxResults ?? '—'} · 读取 ${c.readMode || '—'} · 元数据 ${c.includeMetadata ? '开启' : '关闭'}`;
  }

  function renderHead() {
    docHead.replaceChildren();
    if (!report) {
      docHead.append(
        h('h1', { class: 'rp-doc__title' }, '尚无结构化报告'),
        h('p', { class: 'rp-doc__sub' }, '当前 Run 没有报告产物：请确认使用的是 MISSION 001 研究包，并点击 RUN SIMULATION。')
      );
      return;
    }
    const statusMeta = REPORT_STATUS_META[report.status] || REPORT_STATUS_META.partial;
    docHead.append(
      h('div', { class: 'rp-doc__eyebrow' }, `A/0 · SIMULATED RESEARCH REPORT · ${report.missionId}@${report.missionVersion} · 数据包 ${report.corpusVersion || '—'}`),
      h('h1', { class: 'rp-doc__title' }, mission?.title || '校园活动信息整合可行性研究'),
      h('p', { class: 'rp-doc__sub' }, mission?.subtitle || '在虚构校园公告中查找活动信息、识别冲突、核验更正关系'),
      h('div', { class: 'chips rp-doc__chips' }, [
        metaChip(SIMULATED_CONSTANT, 'attention'),
        metaChip(statusMeta.cn, statusMeta.tone),
        metaChip(`策略 ${report.options?.evidencePolicy || '—'}`),
        metaChip(`故障 ${report.options?.faultMode || 'normal'}`),
        metaChip(`runId ${run ? run.runId : report.runId}`),
        metaChip(configChipText()),
      ]),
      h('div', { class: 'note note--attention rp-banner' }, [
        h('span', { class: 'note__key', text: '模拟声明' }),
        h('span', { text: report.generatedNote }),
      ])
    );
  }

  /* ------------------------------ 筛选 ------------------------------ */
  function renderFilters() {
    filterBar.replaceChildren();
    filterButtons = FILTERS.map((f) => {
      const b = h('button', { class: 'rp-filter', type: 'button', 'data-filter': f.id, 'aria-pressed': f.id === filter ? 'true' : 'false' }, f.cn);
      b.addEventListener('click', () => {
        filter = f.id;
        renderFilters();
        applyFilter();
      });
      filterBar.append(b);
      return b;
    });
    filterBar.append(h('span', { class: 'rp-filters__hint', text: '筛选只影响阅读视图，不改变报告内容与引用编号。' }));
  }

  function applyFilter() {
    for (const node of docBody.querySelectorAll('[data-claim]')) {
      const status = node.getAttribute('data-status');
      const show = filter === 'all' || (filter === 'supported' ? status === 'supported' : status !== 'supported');
      node.hidden = !show;
    }
  }

  /* ------------------------------ 正文渲染 ------------------------------ */
  function claimNode(claim) {
    const statusMeta = STATUS_META[claim.status] || STATUS_META.unresolved;
    const wrap = h('div', {
      class: 'rp-claim',
      'data-claim': claim.id,
      'data-status': claim.status,
      'data-kind': claim.kind || 'finding',
    });
    const text = h('p', { class: 'rp-claim__text' });
    text.append(document.createTextNode(claim.text));
    for (const id of claim.citationIds || []) {
      const b = h('button', { class: 'rp-cite', type: 'button', 'data-cite': id, 'aria-label': `查看引用 ${id} 的来源片段` }, id);
      b.addEventListener('click', () => openCitation(id, claim.id));
      text.append(b);
    }
    wrap.append(text);

    const foot = h('div', { class: 'rp-claim__foot' });
    if (claim.status !== 'supported') foot.append(h('span', { class: `tag tag--${statusMeta.tone}`, text: statusMeta.cn }));
    if (claim.basisRuleId) foot.append(h('span', { class: 'mono rp-claim__rule', text: claim.basisRuleId }));
    if ((claim.relatedEventIds || []).length && onViewEvent) {
      const jump = h('button', { class: 'btn btn--sm btn--ghost', type: 'button', 'data-act': 'view-event' }, '在执行轨迹中查看');
      jump.addEventListener('click', () => onViewEvent(claim.relatedEventIds[0], claim.id));
      foot.append(jump);
    }
    if (foot.childNodes.length) wrap.append(foot);

    wrap.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      activeClaimId = claim.id;
      for (const node of docBody.querySelectorAll('.rp-claim.is-active')) node.classList.remove('is-active');
      wrap.classList.add('is-active');
    });
    return wrap;
  }

  function sectionNode(section) {
    const node = h('section', { class: 'rp-section', 'data-section': section.id, id: `rp-${section.id}` });
    node.append(
      h('div', { class: 'rp-section__head' }, [
        h('span', { class: 'rp-section__id mono', text: section.id }),
        h('h2', { class: 'rp-section__title', text: section.title }),
      ])
    );
    if (section.note) {
      node.append(
        h('div', { class: 'note note--info rp-note' }, [h('span', { class: 'note__key', text: '说明' }), h('span', { text: section.note })])
      );
    }

    if (section.id === 'R4') {
      node.append(citationTable(section.citationIds || []));
      return node;
    }

    if (Array.isArray(section.itemList) && section.itemList.length) {
      const ol = h('ul', { class: 'rp-list' });
      for (const item of section.itemList) ol.append(h('li', {}, item.text || String(item)));
      node.append(ol);
      return node;
    }

    if (Array.isArray(section.items) && section.items.length) {
      const ol = h('ul', { class: 'rp-list' });
      for (const item of section.items) ol.append(h('li', {}, String(item)));
      node.append(ol);
      return node;
    }

    const byId = new Map((report.claims || []).map((c) => [c.id, c]));
    for (const claimId of section.claimIds || []) {
      const claim = byId.get(claimId);
      if (claim) node.append(claimNode(claim));
    }
    return node;
  }

  function citationTable(ids) {
    const citations = (report.citations || []).filter((c) => ids.includes(c.id));
    if (citations.length === 0) {
      return h('div', { class: 'note' }, [h('span', { class: 'note__key', text: '无引用' }), h('span', { text: '本次运行没有可引用的片段：没有证据就不会出现假引用。' })]);
    }
    const table = h('table', { class: 'rp-table' });
    table.append(
      h('thead', {}, [
        h('tr', {}, [h('th', {}, '引用'), h('th', {}, '资料 / 片段'), h('th', {}, '进入本次研究的事件'), h('th', {}, '可见文本（本次真正拿到的）')]),
      ])
    );
    const tbody = h('tbody');
    for (const c of citations) {
      const row = h('tr', { 'data-cite-row': c.id });
      const linkCell = h('td');
      const b = h('button', { class: 'rp-cite rp-cite--inline', type: 'button', 'data-cite': c.id }, c.id);
      b.addEventListener('click', () => openCitation(c.id, null));
      linkCell.append(b);
      const srcCell = h('td', { class: 'mono' }, `${c.sourceId} · ${c.chunkId}${c.textScope === 'summary' ? '（摘要片段）' : ''}`);
      const evCell = h('td', { class: 'mono rp-table__event' }, c.eventId);
      const textCell = h('td', { class: 'rp-table__excerpt' });
      textCell.append(highlightText(c.excerpt || '（该片段只有元数据，没有正文）', c.anchor));
      row.append(linkCell, srcCell, evCell, textCell);
      tbody.append(row);
    }
    table.append(tbody);
    return table;
  }

  function metricsNode() {
    if (!metrics) return h('div', { class: 'note' }, [h('span', { class: 'note__key', text: '指标' }), h('span', { text: '没有可用的运行指标。' })]);
    const node = h('section', { class: 'rp-section', 'data-section': 'METRICS', id: 'rp-METRICS' });
    node.append(h('div', { class: 'rp-section__head' }, [h('span', { class: 'rp-section__id mono', text: 'M' }), h('h2', { class: 'rp-section__title', text: '可量化指标（来自本次模拟计算）' })]));
    const list = h('dl', { class: 'rp-metrics' });
    const rows = [
      ['已检索到的资料', `${metrics.sourcesFound} 条`],
      ['已读取资料（区分全文 / 摘要）', `${metrics.sourcesRead} 份 · 全文 ${metrics.fullTextReads} / 摘要 ${metrics.summaryReads}`],
      ['有引用支持的研究发现 / 需要证据的发现', `${metrics.factClaimsSupported} / ${metrics.factClaimsNeeded}`],
      ['发现的冲突 / 处理完成 / 未解决 / 按策略跳过', `${metrics.conflictsDetected} / ${metrics.conflictsResolved} / ${metrics.conflictsUnresolved} / ${metrics.conflictsSkipped || 0}`],
      ['工具调用 / 错误', `${metrics.toolCalls} / ${metrics.toolErrors}`],
      ['回放事件数量', String(metrics.eventCount)],
      ['证据覆盖率', metrics.evidenceCoverage === null ? '无可评估事实（分母为 0，不输出百分比）' : `${metrics.evidenceCoverage}%（本教学规则内的可追溯比例）`],
    ];
    for (const [k, v] of rows) list.append(h('dt', {}, k), h('dd', {}, v));
    node.append(list);
    node.append(h('div', { class: 'note' }, [h('span', { class: 'note__key', text: '口径' }), h('span', { text: '以上数字全部来自当前 Run 的事件与证据产物，不是现实世界的准确率、事实正确率或模型智能评分。' })]));
    return node;
  }

  function unresolvedNode() {
    const node = h('section', { class: 'rp-section', 'data-section': 'UNRESOLVED', id: 'rp-UNRESOLVED' });
    node.append(h('div', { class: 'rp-section__head' }, [h('span', { class: 'rp-section__id mono', text: '!' }), h('h2', { class: 'rp-section__title', text: '未解决问题' })]));
    const open = (report.claims || []).filter((c) => c.status !== 'supported');
    if (open.length === 0) {
      node.append(h('div', { class: 'note' }, [h('span', { class: 'note__key', text: '无未决项' }), h('span', { text: '本次运行没有未决冲突；这不等于现实世界中的事实已被核实。' })]));
      return node;
    }
    for (const claim of open) node.append(claimNode(claim));
    return node;
  }

  function renderDoc() {
    docBody.replaceChildren();
    if (!report) {
      docBody.append(
        h('div', { class: 'note' }, [
          h('span', { class: 'note__key', text: '无报告' }),
          h('span', { text: '当前 Run 没有结构化报告产物。' }),
        ])
      );
      return;
    }
    for (const section of report.sections || []) docBody.append(sectionNode(section));
    docBody.append(metricsNode(), unresolvedNode());
    applyFilter();
  }

  /* ------------------------------ 来源检视 ------------------------------ */
  function metadataOf(sourceId) {
    const claims = run?.artifacts?.evidence?.claims || [];
    const pick = (predicate) => claims.find((c) => c.sourceId === sourceId && c.predicate === predicate)?.value ?? null;
    return {
      publishedAt: pick(PREDICATES.PUBLISHED_AT),
      publisherId: pick(PREDICATES.PUBLISHER_ID),
      eventKey: pick(PREDICATES.EVENT_KEY),
      supersedes: pick(PREDICATES.SUPERSEDES),
      validity: pick(PREDICATES.VALIDITY),
    };
  }

  function openCitation(citationId, fromClaimId) {
    if (!report) return;
    const citation = (report.citations || []).find((c) => c.id === citationId);
    if (!citation) {
      /* 引用已损坏 / 指向不存在的资料：显示兼容性提示，绝不静默定位到另一份同名文档 */
      renderSourceError(citationId);
      return;
    }
    activeCitationId = citationId;
    if (fromClaimId) activeClaimId = fromClaimId;
    for (const node of docBody.querySelectorAll('.rp-claim.is-active')) node.classList.remove('is-active');
    const claimNodeEl = fromClaimId ? docBody.querySelector(`[data-claim="${fromClaimId}"]`) : null;
    if (claimNodeEl) claimNodeEl.classList.add('is-active');

    const notice = mission?.getNotice?.(citation.sourceId);
    const meta = metadataOf(citation.sourceId);
    const pos = sourceHead.querySelector('[data-el="source-pos"]');
    pos.textContent = citation.id;

    sourceBody.replaceChildren();
    sourceBody.append(
      h('div', { class: 'rp-source__hero' }, [
        h('div', { class: 'inspector__eyebrow' }, [h('span', { text: 'CITATION' }), h('span', { text: '/' }), h('span', { text: citation.id })]),
        h('h3', { class: 'rp-source__title', text: notice?.title || citation.sourceId }),
        h('div', { class: 'chips' }, [
          metaChip('虚构教学资料', 'attention'),
          metaChip(citation.textScope === 'full_text' ? '正文片段' : citation.textScope === 'summary' ? '摘要片段' : '仅搜索摘要线索', citation.textScope === 'full_text' ? 'signal' : 'attention'),
        ]),
      ])
    );

    const kv = h('dl', { class: 'kv' });
    kv.append(h('dt', {}, 'SOURCE ID'), h('dd', { class: 'mono' }, citation.sourceId));
    kv.append(h('dt', {}, 'CHUNK ID'), h('dd', { class: 'mono' }, citation.chunkId));
    kv.append(h('dt', {}, '进入本次研究的事件'), h('dd', { class: 'mono' }, citation.eventId));
    if (meta.publishedAt) kv.append(h('dt', {}, '发布时间'), h('dd', {}, meta.publishedAt));
    if (meta.publisherId) kv.append(h('dt', {}, '发布主体'), h('dd', {}, meta.publisherId));
    if (meta.eventKey && meta.eventKey !== 'none') kv.append(h('dt', {}, '事项身份'), h('dd', { class: 'mono' }, meta.eventKey));
    if (meta.supersedes && meta.supersedes !== 'none') kv.append(h('dt', {}, '更正关系'), h('dd', { class: 'mono' }, `supersedes → ${meta.supersedes}`));
    if (!meta.publishedAt && !meta.publisherId) {
      kv.append(h('dt', {}, '可见元数据'), h('dd', {}, '本次工具响应没有返回发布主体与发布时间（includeMetadata 关闭），因此不展示'));
    }
    sourceBody.append(h('div', { class: 'section' }, [h('div', { class: 'section__label' }, [h('span', { text: '来源与可见元数据' })]), kv]));

    const excerptWrap = h('div', { class: 'section' });
    excerptWrap.append(h('div', { class: 'section__label' }, [h('span', { text: '本次实际拿到的片段' }), h('span', { text: '高亮为引用位置' })]));
    const pre = h('p', { class: 'rp-excerpt' });
    pre.append(highlightText(citation.excerpt || '（该片段只有元数据，没有正文）', citation.anchor));
    excerptWrap.append(pre);
    if (citation.textScope === 'summary') {
      excerptWrap.append(h('div', { class: 'note note--attention' }, [h('span', { class: 'note__key', text: '边界' }), h('span', { text: '本次只读取了摘要模式：这里显示的就是本次真正拿到的内容，不是原文全文。' })]));
    }
    sourceBody.append(excerptWrap);

    const actions = h('div', { class: 'chips rp-source__actions' });
    const viewExec = h('button', { class: 'btn btn--sm btn--primary', type: 'button', 'data-act': 'view-in-execution' }, 'VIEW IN EXECUTION · 查看该事件');
    viewExec.addEventListener('click', () => {
      if (!onViewEvent) return;
      savedScroll = scroller.scrollTop;
      onViewEvent(citation.eventId, activeClaimId);
      onLog?.('报告', `已从引用 ${citation.id} 跳转到本次运行中真正读取该片段的事件 ${citation.eventId}（不改变任何配置与判断）`, 'signal');
    });
    actions.append(viewExec);
    if (notice?.sourceId) {
      const learn = h('button', { class: 'btn btn--sm btn--ghost', type: 'button', 'data-act': 'source-note' }, '资料说明');
      learn.addEventListener('click', () => onLog?.('报告', `资料 ${citation.sourceId}《${notice.title}》为虚构教学资料（isFictional: true）；发布时间 ${meta.publishedAt || '本次不可见'}`, 'info'));
      actions.append(learn);
    }
    sourceBody.append(actions);
    el.dataset.source = citation.id;
  }

  function renderSourceError(citationId) {
    sourceBody.replaceChildren();
    sourceHead.querySelector('[data-el="source-pos"]').textContent = citationId || '—';
    sourceBody.append(
      h('div', { class: 'note note--error' }, [
        h('span', { class: 'note__key', text: '无法解析' }),
        h('span', { text: `引用 ${citationId} 指向的资料或片段在本 Run 中不可解析：历史记录引用不可解析，已阻断「已验证」展示，也不会静默定位到另一份同名文档。` }),
      ])
    );
    el.dataset.source = 'unresolved';
  }

  function renderSourceEmpty() {
    sourceBody.replaceChildren();
    sourceHead.querySelector('[data-el="source-pos"]').textContent = '—';
    sourceBody.append(
      h('div', { class: 'note' }, [
        h('span', { class: 'note__key', text: '未选择' }),
        h('span', { text: '点击正文中的 [S1] 引用标记，可查看该片段的来源、可见元数据与进入本次研究的事件。' }),
      ])
    );
    delete el.dataset.source;
  }

  /* ------------------------------ 导出 ------------------------------ */
  function buildMarkdown() {
    if (!report) return '';
    return reportToMarkdown(report, { run, mission, configSummary: configSummary() });
  }

  function configSummary() {
    const modules = run?.configSnapshot?.modules || [];
    const search = modules.find((m) => m.moduleId === 'announcement_search');
    const reader = modules.find((m) => m.moduleId === 'document_reader');
    return {
      tools: modules.map((m) => `${m.moduleId}${m.enabled === false ? '(Disabled)' : ''}`).join(' + ') || '未装配任何模块',
      searchScope: search?.settings?.searchScope ?? null,
      maxResults: search?.settings?.maxResults ?? null,
      readMode: reader?.settings?.readMode ?? null,
      includeMetadata: reader ? reader.settings?.includeMetadata === true : null,
    };
  }

  exportBtn.addEventListener('click', () => {
    const text = buildMarkdown();
    if (!text) {
      onLog?.('导出', '当前 Run 没有可导出的报告内容（旧版轨迹或阻断运行）', 'attention');
      showExportNote('当前 Run 没有可导出的报告内容。', 'attention');
      return;
    }
    const result = downloadMarkdown(markdownFilename(report), text);
    onLog?.('导出', result.message, result.ok ? 'success' : 'error');
    showExportNote(result.message, result.ok ? 'success' : 'attention');
  });

  copyBtn.addEventListener('click', async () => {
    const text = buildMarkdown();
    if (!text) {
      showExportNote('当前 Run 没有可导出的报告内容。', 'attention');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      onLog?.('导出', '报告 Markdown 已复制到剪贴板（与下载内容完全一致）', 'success');
      showExportNote('已复制 Markdown 到剪贴板。', 'success');
    } catch {
      onLog?.('导出', '浏览器拒绝了剪贴板写入：可改用下载按钮，或选中后手动复制', 'attention');
      showExportNote('浏览器拒绝了剪贴板写入：请改用下载按钮。', 'attention');
    }
  });

  backExec.addEventListener('click', () => onSwitchMode?.('execution'));

  function showExportNote(message, tone) {
    const note = h('div', { class: `note note--${tone === 'success' ? 'success' : tone === 'attention' ? 'attention' : 'info'} rp-export-note` }, [
      h('span', { class: 'note__key', text: '导出' }),
      h('span', { text: message }),
    ]);
    toc.append(note);
    setTimeout(() => note.remove(), 6000);
  }

  /* ------------------------------ 对外 API ------------------------------ */
  return {
    el,
    /**
     * 渲染一份报告。
     * @param {object} params
     * @param {object} params.run    当前 Run（含 artifacts.evidence 与 artifacts.report）
     * @param {object} params.report 结构化报告（可与 run.artifacts.report 相同）
     * @param {object} params.metrics 由 run 实时计算的指标
     * @param {object} params.context `{ preservedScroll }`
     */
    render({ run: nextRun, report: nextReport, metrics: nextMetrics } = {}) {
      const previousScroll = savedScroll || scroller.scrollTop;
      run = nextRun;
      report = nextReport;
      metrics = nextMetrics;
      const hasReport = !!(report && Array.isArray(report.claims) && report.claims.length > 0);

      // 窄屏默认折叠目录：手机上一屏放不下「目录 + 正文」，正文优先
      if (!tocInitialized) {
        tocInitialized = true;
        if (window.innerWidth <= 960) {
          el.dataset.toc = 'collapsed';
          tocToggle.textContent = '展开目录';
          tocToggle.setAttribute('aria-expanded', 'false');
        }
      }
      renderHead();
      renderFilters();
      renderToc();
      renderTocMeta();
      renderDoc();

      if (!hasReport) {
        renderSourceEmpty();
      } else if (activeCitationId) {
        openCitation(activeCitationId, activeClaimId);
      } else {
        renderSourceEmpty();
      }

      // 恢复阅读位置与选中段落（A61）
      requestAnimationFrame(() => {
        scroller.scrollTop = previousScroll;
        if (activeClaimId) {
          const node = docBody.querySelector(`[data-claim="${activeClaimId}"]`);
          if (node) {
            node.classList.add('is-active');
            node.classList.add('is-flash');
            setTimeout(() => node.classList.remove('is-flash'), 1200);
          }
        }
      });
      return { hasReport, status: report?.status || null };
    },
    /** 从执行台返回报告时定位到某个 claim（A61） */
    resume({ claimId = null, scrollTop = null } = {}) {
      if (typeof scrollTop === 'number') savedScroll = scrollTop;
      if (claimId) activeClaimId = claimId;
      if (claimId) {
        const node = docBody.querySelector(`[data-claim="${claimId}"]`);
        if (node) {
          node.classList.add('is-active', 'is-flash');
          setTimeout(() => node.classList.remove('is-flash'), 1200);
        }
      }
      scroller.scrollTop = savedScroll;
    },
    currentScroll: () => scroller.scrollTop,
    activeClaim: () => activeClaimId,
    activeCitation: () => activeCitationId,
    scrollTop: () => scroller.scrollTop,
    setScrollTop: (v) => {
      scroller.scrollTop = v;
      savedScroll = v;
    },
    downloadMarkdown: () => {
      const text = buildMarkdown();
      if (!text) return { ok: false, message: '当前 Run 没有可导出的报告内容' };
      const result = downloadMarkdown(markdownFilename(report), text);
      onLog?.('导出', result.message, result.ok ? 'success' : 'error');
      return result;
    },
    markdown: () => buildMarkdown(),
    filename: () => (report ? markdownFilename(report) : null),
    hasReport: () => !!(report && Array.isArray(report.claims) && report.claims.length > 0),
    openCitation,
  };
}


