/**
 * src/features/knowledge/components/knowledgePage.js
 * ------------------------------------------------------------------
 * 统一知识详情模板（M1.1_TASK D03 / D07 / §6）。
 *
 * 一个模板覆盖两类概念：
 *   · 已审校 / 已发布：呈现 UNDERSTAND 与 INSPECT 两个深度层、常见误解、
 *     示例、语义关系、来源状态与实验入口；
 *   · 仅有索引（outline）：呈现索引说明、建设阶段与可用的关系导航，
 *     **不假装有正文**，也不提供任何点了没反应的运行按钮。
 *
 * Tool Calling 例外：它保留 M0.3 的四步学习路径（toolCalling.js），由应用层
 * 路由过去；本模板不复制那份实验，避免出现两套引擎。
 * ------------------------------------------------------------------
 */
import { h, esc, md } from '../../constructor/components/dom.js';
import { BOUNDARIES } from '../../../data/content.js';
import {
  conceptAvailability,
  edgesOf,
  getChapter,
  getConcept,
  getSource,
  neighborConcepts,
  positionInChapter,
  relationMeta,
  relatedOf,
  getExperiment,
  experimentOfConcept,
} from '../../../knowledge/index.js';

const LAYERS = [
  { id: 'understand', en: 'UNDERSTAND', cn: '入门层', note: '用日常语言说明它是什么、不做什么' },
  { id: 'inspect', en: 'INSPECT', cn: '深入层', note: '机制、边界与可在本原型里核对的事实' },
];

export function createKnowledgePage({
  conceptId = 'llm',
  learning,
  onBack,
  onBackToHub,
  onOpenAtlas,
  onOpenStory,
  onViewInConstructor,
  onOpenExperiment,
  onSelectConcept, // 应用层用于在需要时切换路由（例如 Tool Calling 走四步页）
  onLog,
} = {}) {
  const el = h('div', { class: 'workspace workspace--knowledge workspace--kpage', 'data-open': 'true' });

  let currentId = getConcept(conceptId) ? conceptId : 'llm';
  let layer = 'understand';

  /* ----------------------------- 头部 ----------------------------- */
  const head = h('header', { class: 'ws-head' });
  const headMeta = h('div', { class: 'ws-head__meta', 'data-el': 'context' });
  head.append(
    h('div', { class: 'ws-head__id' }, `
      <span class="ws-head__tag">A/0</span>
      <span class="ws-head__title" data-el="title">KNOWLEDGE</span>
      <span class="ws-head__meta" data-el="subtitle"></span>`),
    h('div', { class: 'ws-head__actions' }, '<span class="tag tag--attention">SIMULATED · 本地教学模拟</span>')
  );
  const headId = head.querySelector('.ws-head__id');
  const titleEl = head.querySelector('[data-el="title"]');
  const subtitleEl = head.querySelector('[data-el="subtitle"]');
  const actions = head.querySelector('.ws-head__actions');

  const backBtn = h('button', { class: 'btn btn--primary', type: 'button', 'data-act': 'return' }, '← 返回上一处');
  backBtn.addEventListener('click', () => onBack?.());
  const atlasBtn = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'atlas' }, 'ATLAS · 知识星图');
  atlasBtn.addEventListener('click', () => onOpenAtlas?.(currentId));
  const storyBtn = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'story' }, 'STORY · 六章目录');
  storyBtn.addEventListener('click', () => onOpenStory?.({ conceptId: currentId }));
  const hubBtn = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'hub' }, 'Back to Hub');
  hubBtn.addEventListener('click', () => onBackToHub?.('hub'));
  actions.append(backBtn, atlasBtn, storyBtn, hubBtn);

  /* ----------------------------- 左栏：章内目录 ----------------------------- */
  const rail = h('nav', { class: 'kn-rail', 'aria-label': '本章概念目录' });
  const railHead = h('div', { class: 'kn-rail__head' });
  const railList = h('div', { class: 'kn-rail__list' });
  rail.append(railHead, railList);

  /* ----------------------------- 主区 ----------------------------- */
  const main = h('section', { class: 'kn-main', 'aria-live': 'polite' });

  /* ----------------------------- 侧栏 ----------------------------- */
  const aside = h('aside', { class: 'kn-aside surface', 'aria-label': '来源状态、学习进度与术语边界' });
  const asideBody = h('div', { class: 'kn-aside__scroll' });
  aside.append(h('div', { class: 'panel-head' }, '<span class="panel-head__title">来源与边界</span>'), asideBody);

  el.append(head, h('div', { class: 'kn-body kn-body--page' }, rail, main, aside));

  /* ================================================================== *
   * 渲染
   * ================================================================== */

  function renderRail() {
    const concept = getConcept(currentId);
    const chapter = getChapter(concept.chapterId);
    const pos = positionInChapter(currentId);
    railHead.replaceChildren(
      h('div', { class: 'kn-rail__chapter' }, `
        <span class="kn-rail__no">${chapter.no}</span>
        <span class="kn-rail__title">${esc(chapter.title.zh)}<em>${esc(chapter.title.en)}</em></span>
        <span class="kn-rail__pos">${pos.index}/${pos.total}</span>`),
      h('p', { class: 'kn-rail__question' }, esc(chapter.question))
    );
    railList.replaceChildren();
    for (const id of pos.siblingIds) {
      const sibling = getConcept(id);
      const availability = conceptAvailability(id);
      const b = h(
        'button',
        {
          class: 'kn-rail__item',
          type: 'button',
          'data-concept': id,
          'data-status': sibling.contentStatus,
          'aria-current': id === currentId ? 'true' : 'false',
        },
        `<span class="kn-rail__idx">${sibling.idx}</span>
         <span class="kn-rail__name">${esc(sibling.cn)}<em>${esc(sibling.name)}</em></span>
         <span class="tag tag--${availability.statusMeta.tone}">${esc(availability.statusMeta.cn)}</span>`
      );
      b.addEventListener('click', () => openConcept(id, { reason: '章内目录' }));
      railList.append(b);
    }
  }

  function layerSwitch() {
    const wrap = h('div', { class: 'kn-layers', role: 'group', 'aria-label': '知识深度切换' });
    for (const item of LAYERS) {
      const b = h('button', { type: 'button', 'data-layer': item.id, 'aria-pressed': layer === item.id ? 'true' : 'false', title: item.note },
        `${item.en} · ${item.cn}`);
      b.addEventListener('click', () => setLayer(item.id));
      wrap.append(b);
    }
    return wrap;
  }

  function statusBanner(concept, availability) {
    const meta = availability.statusMeta;
    if (availability.hasBody) return null;
    return h('div', { class: 'note note--isolation', 'data-act': 'outline-banner' }, `
      <span class="note__key">内容建设中</span>
      <span>本概念目前只有 <b>索引级元数据</b>：正文（UNDERSTAND / INSPECT）、常见误解与实验计划在 <b>${esc(
        concept.plannedMilestone || '后续阶段'
      )}</b> 开放。它出现在目录与搜索里，是为了让六章结构完整，不代表已经可以学习正文。</span>`);
  }

  function relationsSection(concept) {
    const edges = edgesOf(concept.id);
    const wrap = h('div', { class: 'section', 'data-act': 'relations' });
    wrap.append(h('div', { class: 'section__label' }, `<span>关联概念</span><span>${edges.length} 条 · 人工配置</span>`));
    if (!edges.length) {
      wrap.append(h('div', { class: 'note' }, '<span class="note__key">无关系</span><span>该概念暂未登记语义关系。</span>'));
      return wrap;
    }
    const list = h('div', { class: 'kn-relations' });
    for (const edge of edges) {
      const otherId = edge.sourceId === concept.id ? edge.targetId : edge.sourceId;
      const other = getConcept(otherId);
      const meta = relationMeta(edge.type);
      const row = h('button', { class: 'kn-relation', type: 'button', 'data-edge': edge.id, 'data-type': edge.type },
        `<span class="kn-relation__head">
           <span class="tag tag--muted">${esc(edge.type)} · ${esc(meta.cn)}</span>
           <span class="kn-relation__name">${esc(other.cn)} · ${esc(other.name)}</span>
           <span class="atlas-rel__dir">${edge.directed ? (edge.sourceId === concept.id ? '本概念 → 对方' : '对方 → 本概念') : '无向 · 不表示必需依赖'}</span>
         </span>
         <span class="kn-relation__desc">${esc(edge.description)}</span>`);
      row.addEventListener('click', () => openConcept(otherId, { reason: '关联概念' }));
      list.append(row);
    }
    wrap.append(list);
    return wrap;
  }

  function experimentSection(concept, availability) {
    const wrap = h('div', { class: 'section', 'data-act': 'experiment' });
    wrap.append(h('div', { class: 'section__label' }, '<span>对应实验</span><span>只有真实存在才可点</span>'));
    const experiment = experimentOfConcept(concept.id);
    if (availability.canRunExperiment && experiment) {
      const btn = h('button', { class: 'btn btn--primary', type: 'button', 'data-act': 'run-experiment' },
        `EXPERIMENT · 打开「${experiment.title.split(' · ')[0]}」`);
      btn.addEventListener('click', () => onOpenExperiment?.(concept.id, experiment));
      wrap.append(
        btn,
        h('div', { class: 'note note--info', style: 'margin-top:8px' }, `
          <span class="note__key">可操作</span>
          <span>${esc(experiment.title)}（${esc(experiment.milestone)}）· ${esc(experiment.dataNote)}</span>`)
      );
      return wrap;
    }
    const planned = availability.plannedExperiment || experiment;
    if (planned) {
      wrap.append(
        h('div', { class: 'note', 'data-act': 'experiment-planned' }, `
          <span class="note__key">后续阶段开放</span>
          <span>${esc(planned.title)} 计划在 <b>${esc(planned.milestone)}</b> 开放：当前只登记计划，不提供可点击的运行入口，也不会显示假进度。</span>`)
      );
      return wrap;
    }
    wrap.append(
      h('div', { class: 'note', 'data-act': 'experiment-none' }, `
        <span class="note__key">暂无实验</span>
        <span>本概念的实验尚未登记；登记后会在此处出现真实入口。</span>`)
    );
    return wrap;
  }

  function sourcesSection(concept) {
    const wrap = h('div', { class: 'section', 'data-act': 'sources' });
    wrap.append(h('div', { class: 'section__label' }, '<span>来源与审校</span><span>外部链接均已核验</span>'));
    if (!concept.sources.length) {
      wrap.append(h('div', { class: 'note' }, '<span class="note__key">未登记</span><span>本概念暂无可核对来源。</span>'));
      return wrap;
    }
    for (const ref of concept.sources) {
      const source = getSource(ref);
      if (!source) {
        wrap.append(h('div', { class: 'note' }, `<span class="note__key">未知来源</span><span>${esc(String(ref))}</span>`));
        continue;
      }
      const kind = source.type === 'external' ? '外部资料' : '仓库内文档';
      wrap.append(
        h('div', { class: 'kv kn-source', 'data-source': source.id, 'data-type': source.type }, `
          <dt>${source.reviewed ? '已核验' : '待核验'}</dt>
          <dd>${esc(source.title)}${
            source.org ? `<br /><span class="mono">${esc(source.org)}</span>` : ''
          }<br /><span class="mono">${esc(source.where || '仓库内文件')}</span>${
            source.url ? ` · <a href="${esc(source.url)}" rel="noreferrer noopener" target="_blank">外部链接</a>` : ' · 无外部链接'
          }<br /><span class="kn-source__meta">${esc(kind)}${source.versionOrDate ? ` · ${esc(source.versionOrDate)}` : ''}${
            source.checkedAt ? ` · 核验于 ${esc(source.checkedAt)}` : ''
          }</span>${source.claim ? `<br /><span class="kn-source__claim">支持：${esc(source.claim)}</span>` : ''}</dd>`)
      );
    }
    wrap.append(
      h('div', { class: 'note note--info', style: 'margin-top:8px' }, `
        <span class="note__key">说明</span>
        <span>外部来源都经过实际抓取核验，并记录版本/日期与核验时间；核验不通过的链接一律不登记，也不会出现在这里。仓库内文档可直接逐字核对。</span>`)
    );
    return wrap;
  }

  function renderMain() {
    main.replaceChildren();
    const concept = getConcept(currentId);
    const availability = conceptAvailability(currentId);
    const chapter = getChapter(concept.chapterId);
    const pos = positionInChapter(currentId);
    const nav = neighborConcepts(currentId);

    titleEl.textContent = `KNOWLEDGE · ${concept.name.toUpperCase()}`;
    subtitleEl.textContent = `${concept.cn} · 第 ${chapter.no} 章 ${chapter.title.zh} · ${availability.statusMeta.cn}`;
    headMeta.textContent = `当前概念 ${concept.idx} · ${concept.cn} · 本层 ${layer === 'inspect' ? 'INSPECT 深入' : 'UNDERSTAND 入门'}`;

    const frag = document.createDocumentFragment();
    frag.append(
      h('div', { class: 'kn-hero', 'data-concept': concept.id }, `
        <div class="kn-hero__idx">${concept.idx} / 第 ${chapter.no} 章 · ${esc(chapter.title.zh)} ${esc(chapter.title.en)} · 第 ${pos.index} 个</div>
        <h2 class="kn-hero__title">${esc(concept.cn)}<span class="kn-hero__en"> ${esc(concept.name)}</span></h2>
        <p class="kn-hero__lead">${md(concept.oneLiner || concept.tagline)}</p>
        <div class="chips">
          <span class="tag tag--${availability.statusMeta.tone}">${esc(availability.statusMeta.cn)}</span>
          <span class="tag tag--muted">${esc(concept.id)}</span>
          <span class="tag tag--muted">章内 ${pos.index}/${pos.total}</span>
        </div>`)
    );

    const banner = statusBanner(concept, availability);
    if (banner) frag.append(banner);

    if (availability.hasBody) {
      frag.append(layerSwitch());
      if (layer === 'understand') {
        const sec = h('div', { class: 'section', 'data-layer': 'understand' });
        sec.append(h('div', { class: 'section__label' }, '<span>UNDERSTAND</span><span>对新人解释</span>'));
        for (const para of concept.understand) sec.append(h('p', { class: 'explain' }, md(para)));
        frag.append(sec);
      } else {
        const sec = h('div', { class: 'section', 'data-layer': 'inspect' });
        sec.append(h('div', { class: 'section__label' }, '<span>INSPECT</span><span>机制与边界</span>'));
        const ul = h('ul', { class: 'kn-inspect__list' });
        for (const item of concept.inspect) ul.append(h('li', {}, md(item)));
        sec.append(ul);
        if (concept.example) {
          sec.append(
            h('div', { class: 'kn-sample kn-sample--real', 'data-simulated': concept.example.isSimulated ? 'true' : 'false' }, `
              <div class="kn-sample__label">示例 · ${esc(concept.example.label)}${
                concept.example.isSimulated ? '（本地示意，非真实服务输出）' : ''
              }</div>
              <div class="kn-sample__body">${esc(concept.example.body)}</div>`)
          );
        }
        frag.append(sec);
      }

      if (concept.misconceptions.length) {
        const misc = h('div', { class: 'section', 'data-act': 'misconceptions' });
        misc.append(h('div', { class: 'section__label' }, `<span>常见误解</span><span>${concept.misconceptions.length} 条</span>`));
        for (const item of concept.misconceptions) {
          misc.append(
            h('div', { class: 'misconception' }, `
              <div class="misconception__claim"><span class="misconception__mark">误解</span>${esc(item.claim)}</div>
              <div class="misconception__fix"><span class="misconception__mark misconception__mark--fix">纠正</span>${esc(item.correction)}</div>`)
          );
        }
        frag.append(misc);
      }
    } else {
      frag.append(
        h('div', { class: 'section', 'data-layer': 'outline' }, `
          <div class="section__label"><span>索引信息</span><span>可核对</span></div>
          <div class="kv">
            <dt>概念 ID</dt><dd>${esc(concept.id)}（永久稳定，供关系与学习记录引用）</dd>
            <dt>所属章节</dt><dd>第 ${chapter.no} 章 · ${esc(chapter.title.zh)}（${esc(chapter.title.en)}）</dd>
            <dt>章内位置</dt><dd>第 ${pos.index} / ${pos.total} 个概念</dd>
            <dt>内容状态</dt><dd>${esc(availability.statusMeta.cn)} · 计划阶段 ${esc(concept.plannedMilestone || '待定')}</dd>
            <dt>别名</dt><dd>${concept.aliases.map((a) => esc(a)).join('、')}</dd>
          </div>`)
      );
    }

    frag.append(relationsSection(concept));
    frag.append(experimentSection(concept, availability));
    frag.append(sourcesSection(concept));

    if (concept.nextSteps) {
      frag.append(
        h('div', { class: 'section' }, `
          <div class="section__label"><span>继续学习</span></div>
          <p class="explain">${md(concept.nextSteps)}</p>`)
      );
    }

    /* ---------------- 章内导航与返回 ---------------- */
    const finish = h('div', { class: 'kn-finish', 'data-act': 'page-nav' });
    if (nav.prev) {
      const b = h('button', { class: 'btn btn--ghost', type: 'button' }, `← ${nav.prev.cn}`);
      b.addEventListener('click', () => openConcept(nav.prev.id, { reason: '章内上一概念' }));
      finish.append(b);
    }
    if (nav.next) {
      const b = h('button', { class: 'btn btn--ghost', type: 'button' }, `${nav.next.cn} →`);
      b.addEventListener('click', () => openConcept(nav.next.id, { reason: '章内下一概念' }));
      finish.append(b);
    }
    if (concept.systemTarget !== 'none') {
      const view = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'view-constructor' }, 'VIEW IN CONSTRUCTOR · 在系统中查看');
      view.addEventListener('click', () => onViewInConstructor?.(concept));
      finish.append(view);
    }
    const backHub = h('button', { class: 'btn btn--ghost', type: 'button' }, 'Back to Hub · 返回中央核心');
    backHub.addEventListener('click', () => onBackToHub?.('hub'));
    finish.append(backHub);
    frag.append(finish);

    main.append(frag);
    renderAside();
  }

  function renderAside() {
    const concept = getConcept(currentId);
    const availability = conceptAvailability(currentId);
    const label = learning?.labelOf(currentId) || 'unexplored';
    const flags = learning?.flagsOf(currentId);
    asideBody.replaceChildren();

    /* 内容状态 */
    asideBody.append(
      h('div', { class: 'section' }, `
        <div class="section__label"><span>内容状态</span><span>决定可用性</span></div>
        <div class="note note--info"><span class="note__key">${esc(availability.statusMeta.cn)}</span><span>${esc(
          availability.statusMeta.note
        )}</span></div>`)
    );

    /* 学习进度 */
    const relatedCount = flags?.relatedDiscoveredIds?.length || 0;
    asideBody.append(
      h('div', { class: 'section' }, `
        <div class="section__label"><span>学习进度</span><span>不是成绩</span></div>
        <div class="mono kn-progress" data-el="progress">
          <div>状态：${esc(label === 'unexplored' ? '尚未查看' : label === 'exploring' ? '正在了解' : label === 'related_discovered' ? '已发现相关概念' : '已完成内嵌实验')}</div>
          <div>访问次数：${Number(flags?.visits || 0)}</div>
          <div>发现关联：${relatedCount} 个</div>
          <div>完成实验：${flags?.experimentCompleted ? '是（记录在本地）' : '否'}</div>
        </div>
        <div class="note note--info" style="margin-top:8px"><span class="note__key">说明</span><span>打开本页只记录「正在了解」，不代表学完；只有真实完成实验才记录实验项，没有分数与排名。</span></div>`)
    );

    /* 相关概念 */
    const rel = h('div', { class: 'section' });
    rel.append(h('div', { class: 'section__label' }, '<span>相关概念</span><span>可点击跳转</span>'));
    const chips = h('div', { class: 'chips' });
    for (const item of relatedOf(currentId)) {
      const b = h('button', { class: 'btn btn--sm', type: 'button', 'data-related': item.concept.id }, `${item.concept.cn}`);
      b.addEventListener('click', () => openConcept(item.concept.id, { reason: '相关概念' }));
      chips.append(b);
    }
    rel.append(chips);
    asideBody.append(rel);

    /* 术语边界 */
    const bound = h('div', { class: 'section' });
    bound.append(h('div', { class: 'section__label' }, '<span>术语边界</span><span>必守红线</span>'));
    for (const [term, note] of BOUNDARIES) {
      bound.append(h('div', { class: 'kn-dist' }, `
        <div class="kn-dist__term">${esc(term)}</div>
        <div class="kn-dist__note">${esc(note)}</div>`));
    }
    asideBody.append(bound);

    /* 计划阶段 */
    const experiment = concept.experimentId ? getExperiment(concept.experimentId) : null;
    if (!availability.hasBody || experiment) {
      asideBody.append(
        h('div', { class: 'section' }, `
          <div class="section__label"><span>阶段归属</span></div>
          <div class="mono kn-progress">
            <div>正文：${availability.hasBody ? '本轮可用' : `${esc(concept.plannedMilestone || '后续阶段')}`}</div>
            <div>实验：${experiment ? esc(experiment.status === 'available' ? '本轮可操作' : `后续阶段（${experiment.milestone}）`) : availability.hasBody ? '未登记' : '随正文开放'}</div>
          </div>`)
      );
    }
  }

  /* ---------------- 切换概念 / 层 ---------------- */
  function openConcept(id, { reason = '' } = {}) {
    const next = getConcept(id);
    if (!next) {
      onLog?.('知识', `未知概念标识「${String(id)}」，已忽略跳转`, 'attention');
      return;
    }
    if (learning) {
      if (reason === '关联概念' || reason === '相关概念') learning.markRelatedDiscovered(currentId, id);
      else learning.markExplored(currentId);
    }
    currentId = id;
    layer = 'understand';
    renderRail();
    renderMain();
    onLog?.('知识', `知识页切换到 ${next.cn}（${next.name}）· ${reason || '入口'} · 第 ${next.chapterNo} 章`, 'signal');
    // 应用层需要为 Tool Calling 这种「有专属学习路径」的概念接管路由
    onSelectConcept?.(id);
  }

  function setLayer(next) {
    const value = next === 'inspect' ? 'inspect' : 'understand';
    if (value === layer) return;
    layer = value;
    renderMain();
    onLog?.('知识', `知识页深度层切换为 ${layer === 'inspect' ? 'INSPECT（深入）' : 'UNDERSTAND（入门）'}`, 'info');
  }

  renderRail();
  renderMain();

  const unsubscribeLearning = learning?.subscribe?.(() => renderAside());

  return {
    el,
    /** 打开时记录「正在了解」，并把层复位到入门层 */
    activate() {
      learning?.markExplored(currentId);
      renderRail();
      renderMain();
    },
    currentConcept: () => currentId,
    currentLayer: () => layer,
    setLayer,
    openConcept,
    /** Esc：回到调用它的上下文（不做任何数据写入） */
    escape: () => onBack?.(),
    dispose() {
      unsubscribeLearning?.();
    },
  };
}
