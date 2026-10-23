/**
 * src/features/knowledge/components/storyWorkspace.js
 * ------------------------------------------------------------------
 * STORY / 六章知识主线目录（M1.1_TASK D01 / D07 / A15）。
 *
 * 本阶段只交付**目录结构与章节定位**：
 *   · 六章可浏览：编号、双语标题、核心问题、简介、章内概念清单；
 *   · 每章与每个概念都显示真实开放状态（可用 / 建设中 / 计划阶段）；
 *   · 目录里能点开的入口都真的能打开（概念知识页、Atlas、Lab）；
 *   · 不做电影级滚动叙事——那属于 M1.4，这里不假装已经做完。
 * ------------------------------------------------------------------
 */
import { h, esc } from '../../constructor/components/dom.js';
import {
  CHAPTERS,
  EXPERIMENTS,
  chapterReadiness,
  conceptAvailability,
  experimentStats,
  getChapter,
  getConcept,
  getConceptsByChapter,
  knowledgeStats,
} from '../../../knowledge/index.js';
import { getChapterStory } from '../../../content/chapters/index.js';

/** 章节整体状态：由「章内是否有可用正文」派生，不手工标注 */
function chapterStatus(chapter) {
  const stats = chapterReadiness(chapter.id);
  if (stats.ready === 0) return { cn: '目录已建立 · 正文待开放', tone: 'muted', code: 'index-only' };
  if (stats.ready < stats.total) return { cn: '部分概念可用', tone: 'attention', code: 'partial' };
  return { cn: '全部概念可用', tone: 'success', code: 'ready' };
}

export function createStoryWorkspace({
  learning,
  onBackToHub,
  onOpenConcept,
  onOpenAtlas,
  onOpenLab,
  onOpenChapter,
  onLog,
} = {}) {
  const el = h('div', { class: 'workspace workspace--story', 'data-open': 'true' });
  const stats = knowledgeStats();

  /** 章节进度 = 内容就绪度（知识层） + 个人已查看数（学习层，独立命名空间） */
  function chapterProgress(chapterId) {
    const readiness = chapterReadiness(chapterId);
    const concepts = getConceptsByChapter(chapterId);
    const explored = concepts.filter((c) => (learning?.labelOf(c.id) || 'unexplored') !== 'unexplored').length;
    return { ...readiness, explored };
  }

  /* ----------------------------- 头部 ----------------------------- */
  const head = h('header', { class: 'ws-head' });
  head.append(
    h('div', { class: 'ws-head__id' }, `
      <span class="ws-head__tag">A/0</span>
      <span class="ws-head__title">STORY · 六章知识主线</span>
      <span class="ws-head__meta">${stats.chapters} 章 · ${stats.concepts} 个概念（${stats.byStatus.reviewed + stats.byStatus.published} 个已审校可用 / ${stats.byStatus.outline} 个建设中）· 目录优先，正文按阶段开放</span>`),
    h('div', { class: 'ws-head__actions' }, '<span class="tag tag--attention">SIMULATED · 本地教学模拟</span>')
  );
  const actions = head.querySelector('.ws-head__actions');
  const backBtn = h('button', { class: 'btn btn--primary', type: 'button', 'data-act': 'back-hub' }, '← 返回 Hub');
  backBtn.addEventListener('click', () => onBackToHub?.('hub'));
  const atlasBtn = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'atlas' }, 'ATLAS · 知识星图');
  atlasBtn.addEventListener('click', () => onOpenAtlas?.());
  const labBtn = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'lab' }, 'LAB · 实验空间');
  labBtn.addEventListener('click', () => onOpenLab?.());
  actions.append(backBtn, atlasBtn, labBtn);

  /* ----------------------------- 左栏：章节跳转 ----------------------------- */
  const side = h('aside', { class: 'story-side surface', 'aria-label': '六章跳转与进度' });
  const sideList = h('div', { class: 'story-side__list' });
  side.append(h('div', { class: 'panel-head' }, '<span class="panel-head__title">章节导航</span>'), sideList);

  /* ----------------------------- 主区：六章目录 ----------------------------- */
  const main = h('section', { class: 'story-main', 'aria-label': '六章目录' });
  const intro = h('div', { class: 'story-intro' }, `
    <div class="story-intro__tag">M1.2 · 前三章叙事已开放</div>
    <h2 class="story-intro__title">六章主线：从语言能力到可靠执行</h2>
    <p class="story-intro__lead">第 01–03 章现在有<b>完整叙事与实验</b>：模型「会说话」→指令与上下文→外部工具，三章构成一条连续的研究故事，每章都能进入对应的实验。第 04–06 章的正文与实验属于 M1.3——目录里可浏览元数据，但不会假装已经做完。</p>
    <div class="story-intro__stats">
      <span><b>${stats.chapters}</b> 章</span>
      <span><b>${stats.concepts}</b> 概念索引</span>
      <span><b>${stats.byStatus.reviewed + stats.byStatus.published}</b> 个已审校可用</span>
      <span><b>${stats.byStatus.outline}</b> 个建设中</span>
    </div>`);
  main.append(intro);

  const chapterSections = new Map();

  for (const chapter of CHAPTERS) {
    const concepts = getConceptsByChapter(chapter.id);
    const progress = chapterProgress(chapter.id);
    const status = chapterStatus(chapter);
    const section = h('section', {
      class: 'story-chapter',
      'data-chapter': chapter.id,
      'data-status': status.code,
      id: `chapter-${chapter.id}`,
    });
    section.append(
      h('div', { class: 'story-chapter__head' }, `
        <span class="story-chapter__no">${chapter.no}</span>
        <span class="story-chapter__titles">
          <span class="story-chapter__zh">${esc(chapter.title.zh)}</span>
          <span class="story-chapter__en">${esc(chapter.title.en)}</span>
        </span>
        <span class="tag tag--${status.tone}">${esc(status.cn)}</span>
        <span class="story-chapter__count">${progress.ready}/${progress.total} 可用 · ${progress.explored} 已查看</span>`),
      h('blockquote', { class: 'story-chapter__question' }, esc(chapter.question)),
      h('p', { class: 'story-chapter__intro' }, esc(chapter.intro)),
      h('div', { class: 'story-chapter__hook' }, `<span class="note__key">一句话</span>${esc(chapter.hook)}`)
    );

    const list = h('ul', { class: 'story-concepts' });
    for (const concept of concepts) {
      const availability = conceptAvailability(concept.id);
      const label = learning?.labelOf(concept.id) || 'unexplored';
      const li = h('li');
      const btn = h('button', {
        class: 'story-concept',
        type: 'button',
        'data-concept': concept.id,
        'data-status': concept.contentStatus,
        'aria-label': `${chapter.no} 章 ${concept.cn}（${concept.name}）· ${availability.statusMeta.cn}`,
      },
        `<span class="story-concept__idx">${concept.idx}</span>
         <span class="story-concept__body">
           <span class="story-concept__name">${esc(concept.cn)}<em>${esc(concept.name)}</em></span>
           <span class="story-concept__line">${esc(concept.oneLiner || concept.tagline)}</span>
         </span>
         <span class="story-concept__tags">
           <span class="tag tag--${availability.statusMeta.tone}">${esc(availability.statusMeta.cn)}</span>
           ${label === 'unexplored' ? '' : `<span class="tag tag--muted">${esc(label === 'experiment_completed' ? '已完成实验' : label === 'related_discovered' ? '发现关联' : '正在了解')}</span>`}
         </span>`);
      btn.addEventListener('click', () => onOpenConcept?.(concept.id, { from: 'story', chapterId: chapter.id }));
      li.append(btn);
      list.append(li);
    }
    section.append(list);

    const chapters_experiments = EXPERIMENTS.filter((e) => e.chapterId === chapter.id);
    section.append(
      h('div', { class: 'story-chapter__lab' }, `
        <span class="note__key">本章实验</span>
        <span>${chapters_experiments
          .map((e) => `${esc(e.title.split(' · ')[0])} · ${esc(e.status === 'available' ? '可操作' : `后续阶段（${e.milestone}）`)}`)
          .join('；') || '尚未登记'}</span>`)
    );

    // 叙事入口：只有真的写完叙事的章节才有按钮（第 04–06 章不出现假入口）
    const story = getChapterStory(chapter.id);
    if (story) {
      const storyRow = h('div', { class: 'story-chapter__story' });
      const openBtn = h('button', { class: 'btn btn--primary btn--sm', type: 'button', 'data-act': 'open-chapter-story' },
        `进入第 ${chapter.no} 章叙事 · ${story.subtitle.split(' · ')[0]}`);
      openBtn.addEventListener('click', () => {
        onLog?.('叙事', `打开第 ${chapter.no} 章叙事 ${story.subtitle}`, 'signal');
        onOpenChapter?.(chapter.id);
      });
      storyRow.append(openBtn, h('span', { class: 'tar' }, `开场目标 · ${story.beats.length} 个节拍 · 局限 · 实验 · 结果解读`));
      section.append(storyRow);
    } else {
      section.append(
        h('div', { class: 'story-chapter__story' },
          h('span', { class: 'tag tag--muted' }, '章节叙事 · 后续阶段（M1.3）'))
      );
    }

    chapterSections.set(chapter.id, section);
    main.append(section);
  }

  /* ----------------------------- 右栏：状态与阶段说明 ----------------------------- */
  const aside = h('aside', { class: 'story-aside surface', 'aria-label': '状态说明与阶段归属' });
  const asideBody = h('div', { class: 'story-aside__scroll' });
  aside.append(h('div', { class: 'panel-head' }, '<span class="panel-head__title">状态与阶段</span>'), asideBody);

  asideBody.append(
    h('div', { class: 'section' }, `
      <div class="section__label"><span>四种内容状态</span><span>决定可用性</span></div>
      <div class="kv">
        <dt>内容建设中</dt><dd>只有索引元数据：可出现在目录与搜索里，但没有正文，不算学完</dd>
        <dt>草稿 · 未审校</dt><dd>有正文但未核对，界面必须显示草稿标记</dd>
        <dt>已审校</dt><dd>正文按 PRD 技术边界核对过，可完整学习</dd>
        <dt>已发布 · 含实验</dt><dd>正文与可操作实验同时可用（本轮 7 个概念，对应 3 个实验）</dd>
      </div>`),
    h('div', { class: 'section' }, `
      <div class="section__label"><span>阶段归属</span><span>不虚构进度</span></div>
      <div class="kv">
        <dt>第 01–03 章</dt><dd>正文、叙事与实验 → M1.2（已开放）</dd>
        <dt>第 04–06 章</dt><dd>正文与实验 → M1.3</dd>
        <dt>整章叙事 / 星图联动</dt><dd>M1.4</dd>
        <dt>本轮交付</dt><dd>六章目录 + 36 概念索引 + 23 个已审校正文 + 3 章叙事 + 3 个可操作实验</dd>
      </div>`),
    h('div', { class: 'section' }, `
      <div class="section__label"><span>实验登记</span><span>${experimentStats().available}/${experimentStats().total} 可操作</span></div>
      <div class="mono kn-progress">只有登记为「可操作」的实验才会出现运行入口；其余显示「后续阶段开放」。Lab 页可查看完整登记表。</div>`)
  );

  el.append(head, h('div', { class: 'story-body' }, side, main, aside));

  /* ---------------- 章节跳转 ---------------- */
  function renderSide() {
    sideList.replaceChildren();
    for (const chapter of CHAPTERS) {
      const progress = chapterProgress(chapter.id);
      const b = h('button', { class: 'story-side__item', type: 'button', 'data-chapter': chapter.id },
        `<span class="story-side__no">${chapter.no}</span>
         <span class="story-side__name">${esc(chapter.title.zh)}<em>${esc(chapter.title.en)}</em></span>
         <span class="story-side__count">${progress.ready}/${progress.total}</span>`);
      b.addEventListener('click', () => {
        chapterSections.get(chapter.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        onLog?.('叙事', `六章目录：定位到第 ${chapter.no} 章 ${chapter.title.zh}`, 'info');
      });
      sideList.append(b);
    }
  }

  renderSide();
  const unsubscribeLearning = learning?.subscribe?.(() => renderSide());

  return {
    el,
    activate() {},
    /** 自检与外部入口使用：按 chapterId 定位（返回是否找到） */
    focusChapter(chapterId) {
      const section = chapterSections.get(chapterId);
      if (!section) return false;
      section.scrollIntoView({ behavior: 'auto', block: 'start' });
      return true;
    },
    chapters: () => CHAPTERS.map((c) => c.id),
    conceptOf: (id) => (getConcept(id) ? getChapter(getConcept(id).chapterId) : null),
    dispose() {
      unsubscribeLearning?.();
    },
  };
}
