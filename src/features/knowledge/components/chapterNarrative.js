/**
 * src/features/knowledge/components/chapterNarrative.js
 * ------------------------------------------------------------------
 * STORY 章节叙事页（M1.2 D02 / §3）：一个模板渲染 Chapter 01–03。
 *
 * 每章必须包含（缺一不可，由 src/content/chapters/index.js 的校验器保证）：
 *   · 章节开场目标与研究任务；
 *   · 至少一次可观察的问题 / 局限（beats 里的 limit 或 observation）；
 *   · 清楚的实验入口（真实可操作的 Lab）；
 *   · 结果解读（把观察翻译成判断）；
 *   · 上一章 / 下一章导航；
 *   · 随时退出到 Atlas。
 *
 * 叙事数据本身在 src/content/chapters/，本文件只负责渲染与路由回调，
 * 不新增第二份文案，避免「页面说的」和「数据说的」不一致。
 * ------------------------------------------------------------------
 */
import { h, esc } from '../../constructor/components/dom.js';
import { getChapter, getConcept, conceptAvailability } from '../../../knowledge/index.js';
import { CHAPTER_STORIES, STORY_ORDER, getChapterStory, neighborStories } from '../../../content/chapters/index.js';

export function createChapterNarrative({
  chapterId = 'intelligence',
  learning,
  onOpenConcept,
  onOpenLab,
  onOpenLabExperiment,
  onOpenChapter,
  onOpenAtlas,
  onOpenStory,
  onBackToHub,
  onLog,
} = {}) {
  const el = h('div', { class: 'workspace workspace--chapter', 'data-open': 'true' });
  let currentId = getChapterStory(chapterId) ? chapterId : STORY_ORDER[0];

  const head = h('header', { class: 'ws-head' });
  const headMeta = h('div', { class: 'ws-head__meta', 'data-el': 'context' });
  head.append(
    h('div', { class: 'ws-head__id' }, `
      <span class="ws-head__tag">A/0</span>
      <span class="ws-head__title" data-el="title">STORY</span>
      <span class="ws-head__meta" data-el="subtitle"></span>`),
    h('div', { class: 'ws-head__actions' }, '<span class="tag tag--attention">SIMULATED · 本地教学模拟</span>')
  );
  const titleEl = head.querySelector('[data-el="title"]');
  const subtitleEl = head.querySelector('[data-el="subtitle"]');
  const actions = head.querySelector('.ws-head__actions');

  const backBtn = h('button', { class: 'btn btn--primary', type: 'button', 'data-act': 'back-story' }, '← 返回章节目录');
  backBtn.addEventListener('click', () => onOpenStory?.({ chapterId: currentId }));
  const atlasBtn = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'atlas' }, 'ATLAS · 知识星图');
  atlasBtn.addEventListener('click', () => onOpenAtlas?.());
  const hubBtn = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'hub' }, 'Back to Hub');
  hubBtn.addEventListener('click', () => onBackToHub?.('hub'));
  actions.append(backBtn, atlasBtn, hubBtn);

  const rail = h('nav', { class: 'ch-rail', 'aria-label': '章节导航' });
  const main = h('section', { class: 'ch-main', 'aria-live': 'polite' });
  const aside = h('aside', { class: 'ch-aside surface', 'aria-label': '本章概念与状态' });
  const asideBody = h('div', { class: 'ch-aside__scroll' });
  aside.append(h('div', { class: 'panel-head' }, '<span class="panel-head__title">本章状态</span>'), asideBody);

  el.append(head, h('div', { class: 'ch-body' }, rail, main, aside));

  /* ----------------------------- 左栏：三章目录 ----------------------------- */
  function renderRail() {
    rail.replaceChildren();
    rail.append(h('div', { class: 'section__label' }, `<span>章节</span><span>${STORY_ORDER.length} 章已开放叙事</span>`));
    for (const id of STORY_ORDER) {
      const story = CHAPTER_STORIES[id];
      const chapter = getChapter(id);
      const done = story.concepts.every((c) => (learning?.labelOf(c) || 'unexplored') !== 'unexplored');
      const b = h('button', {
        class: 'ch-rail__item',
        type: 'button',
        'data-chapter': id,
        'aria-current': id === currentId ? 'true' : 'false',
      }, `
        <span class="ch-rail__no">${chapter.no}</span>
        <span class="ch-rail__name">${esc(chapter.title.zh)}<em>${esc(chapter.title.en)}</em></span>
        <span class="ch-rail__state">${done ? '已浏览' : '未浏览'}</span>`);
      b.addEventListener('click', () => openChapter(id));
      rail.append(b);
    }
    rail.append(
      h('div', { class: 'note', style: 'margin-top:10px' }, `
        <span class="note__key">后续阶段</span>
        <span>第 04–06 章的叙事属于 M1.3：目录里可浏览元数据，但当前没有正文与实验入口。</span>`)
    );
  }

  /* ----------------------------- 主区 ----------------------------- */
  function renderMain() {
    const story = getChapterStory(currentId);
    const chapter = getChapter(currentId);
    const nav = neighborStories(currentId);
    main.replaceChildren();

    titleEl.textContent = `STORY · ${chapter.title.en}`;
    subtitleEl.textContent = `${chapter.no} ${chapter.title.zh} · ${story.subtitle}`;
    headMeta.textContent = `第 ${chapter.no} 章 · ${story.beats.length} 个叙事节拍 · 实验 ${story.lab.experimentId}`;

    /* 开场 */
    main.append(
      h('section', { class: 'ch-opening' }, `
        <div class="lab-hero__idx">CHAPTER ${chapter.no} / ${esc(chapter.title.en)}</div>
        <h2 class="lab-hero__title">${esc(story.subtitle)}</h2>
        <blockquote class="ch-question">${esc(chapter.question)}</blockquote>
        <div class="ch-opening__grid">
          <div class="ch-opening__cell"><span class="ch-k">本章目标</span><p>${esc(story.opening.goal)}</p></div>
          <div class="ch-opening__cell"><span class="ch-k">研究任务</span><p>${esc(story.opening.task)}</p></div>
          <div class="ch-opening__cell"><span class="ch-k">阅读须知</span><p>${esc(story.opening.prompt)}</p></div>
          <div class="ch-opening__cell ch-opening__cell--expect"><span class="ch-k">读完应该能回答</span><p>${esc(story.opening.expectation)}</p></div>
        </div>`)
    );

    /* 叙事节拍 */
    const beats = h('section', { class: 'ch-beats', 'aria-label': '叙事节拍' });
    for (const beat of story.beats) {
      const card = h('article', { class: 'ch-beat', 'data-beat': beat.id, 'data-kind': beat.kind });
      card.append(
        h('div', { class: 'ch-beat__head' }, `
          <span class="ch-beat__idx">${beat.idx}</span>
          <span class="ch-beat__title">${esc(beat.title)}</span>
          <span class="tag tag--${beat.kind === 'limit' ? 'attention' : beat.kind === 'experiment' ? 'signal' : 'muted'}">${
            beat.kind === 'limit' ? '可观察的局限' : beat.kind === 'experiment' ? '实验入口' : beat.kind === 'opening' ? '开场' : '理解'
          }</span>`),
        h('p', { class: 'ch-beat__text' }, esc(beat.text))
      );
      if (beat.sample) {
        card.append(
          h('div', { class: 'kn-sample', 'data-simulated': 'true' }, `
            <div class="kn-sample__label">${esc(beat.sample.label)}（本地示意，非真实服务输出）</div>
            <div class="kn-sample__body">${esc(beat.sample.body)}</div>`)
        );
      }
      if (beat.observation) {
        card.append(h('div', { class: 'ch-beat__observe' }, `<span class="note__key">观察</span>${esc(beat.observation)}`));
      }
      if (beat.takeaway) card.append(h('p', { class: 'ch-beat__takeaway' }, esc(beat.takeaway)));
      if (beat.kind === 'experiment') {
        const enter = h('button', { class: 'btn btn--primary btn--sm', type: 'button', 'data-act': 'enter-lab' }, `EXPERIMENT · 打开「${story.lab.title.split(' · ')[0]}」`);
        enter.addEventListener('click', () => openLabEntry(story));
        card.append(enter);
      }
      beats.append(card);
    }
    main.append(beats);

    /* 局限 */
    main.append(
      h('section', { class: 'ch-limit', 'data-act': 'limitation' }, `
        <div class="section__label"><span>${esc(story.limitation.title)}</span><span>本章必须说清楚的一件事</span></div>
        <p class="ch-limit__text">${esc(story.limitation.text)}</p>
        <p class="ch-limit__detail">${esc(story.limitation.detail)}</p>`)
    );

    /* 实验入口 */
    const labBox = h('section', { class: 'ch-lab', 'data-act': 'lab-entry', 'data-experiment': story.lab.experimentId });
    labBox.append(
      h('div', { class: 'section__label' }, `<span>实验入口</span><span>${esc(story.lab.title)}</span>`),
      h('p', { class: 'ch-lab__prompt' }, esc(story.lab.prompt))
    );
    const stepList = h('ol', { class: 'ch-lab__steps' });
    for (const step of story.lab.steps) stepList.append(h('li', {}, esc(step)));
    const observeList = h('ul', { class: 'lab-reading' });
    for (const item of story.lab.observe) observeList.append(h('li', {}, esc(item)));
    labBox.append(
      h('div', { class: 'ch-lab__cols' },
        h('div', {}, h('div', { class: 'ch-k' }, '动手步骤'), stepList),
        h('div', {}, h('div', { class: 'ch-k' }, '要观察什么'), observeList))
    );
    const runBtn = h('button', { class: 'btn btn--primary', type: 'button', 'data-act': 'run-experiment' }, `RUN · 打开 ${story.lab.title}`);
    runBtn.addEventListener('click', () => openLabEntry(story));
    labBox.append(runBtn);
    main.append(labBox);

    /* 结果解读 */
    const reading = h('section', { class: 'ch-reading', 'data-act': 'reading' });
    reading.append(h('div', { class: 'section__label' }, `<span>${esc(story.reading.title)}</span><span>${story.reading.items.length} 条</span>`));
    for (const item of story.reading.items) {
      reading.append(h('div', { class: 'ch-reading__item' }, `
        <div class="ch-reading__q">${esc(item.q)}</div>
        <div class="ch-reading__a">${esc(item.a)}</div>`));
    }
    main.append(reading);

    /* 章节过渡 + 上下章导航 */
    const transition = h('section', { class: 'ch-transition', 'data-act': 'transition' });
    transition.append(
      h('div', { class: 'section__label' }, '<span>章节过渡</span><span>接着往下</span>'),
      h('p', { class: 'ch-transition__text' }, esc(story.transition.text))
    );
    const navRow = h('div', { class: 'ch-nav' });
    if (nav.prev) {
      const b = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'prev-chapter' }, `← 第 ${nav.prev.no} 章 ${nav.prev.title.zh}`);
      b.addEventListener('click', () => openChapter(nav.prev.chapterId));
      navRow.append(b);
    }
    if (nav.next) {
      const b = h('button', { class: 'btn btn--primary', type: 'button', 'data-act': 'next-chapter' }, `第 ${nav.next.no} 章 ${nav.next.title.zh} →`);
      b.addEventListener('click', () => openChapter(nav.next.chapterId));
      navRow.append(b);
    } else {
      navRow.append(
        h('div', { class: 'note', 'data-act': 'next-planned' }, `
          <span class="note__key">后续章节</span>
          <span>第 04–06 章（信息与方法 / 执行系统 / 可靠性与边界）的叙事与实验属于 M1.3，当前不提供入口。</span>`)
      );
    }
    const atlasOut = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'exit-atlas' }, '退出到 ATLAS');
    atlasOut.addEventListener('click', () => onOpenAtlas?.());
    navRow.append(atlasOut);
    transition.append(navRow);
    main.append(transition);

    renderAside();
  }

  /* ----------------------------- 右栏：本章概念与状态 ----------------------------- */
  function renderAside() {
    const story = getChapterStory(currentId);
    const chapter = getChapter(currentId);
    asideBody.replaceChildren();

    asideBody.append(
      h('div', { class: 'section' }, `
        <div class="section__label"><span>本章概念</span><span>${story.concepts.length} 个 · 可点开</span></div>
        <div class="ch-concepts" data-act="chapter-concepts"></div>`)
    );
    const list = asideBody.querySelector('.ch-concepts');
    for (const id of story.concepts) {
      const concept = getConcept(id);
      if (!concept) continue;
      const availability = conceptAvailability(id);
      const label = learning?.labelOf(id) || 'unexplored';
      const b = h('button', { class: 'ch-concept', type: 'button', 'data-concept': id, 'data-status': concept.contentStatus }, `
        <span class="ch-concept__idx">${concept.idx}</span>
        <span class="ch-concept__name">${esc(concept.cn)}<em>${esc(concept.name)}</em></span>
        <span class="tag tag--${availability.statusMeta.tone}">${esc(availability.statusMeta.tone === 'muted' ? '索引' : label === 'unexplored' ? '可读' : label === 'experiment_completed' ? '已完成实验' : '已查看')}</span>`);
      b.addEventListener('click', () => onOpenConcept?.(id, { from: 'story', chapterId: currentId }));
      list.append(b);
    }

    asideBody.append(
      h('div', { class: 'section' }, `
        <div class="section__label"><span>本章实验</span><span>真实可操作</span></div>
        <div class="note note--info"><span class="note__key">${esc(story.lab.experimentId)}</span><span>${esc(story.lab.title)}：全部在本地运行，不联网、不调用模型；实验完成状态只在真实操作后记录。</span></div>`)
    );

    const lbl = chapter.title.zh;
    asideBody.append(
      h('div', { class: 'section' }, `
        <div class="section__label"><span>边界</span><span>不要误读</span></div>
        <div class="kv">
          <dt>模拟输出</dt><dd>章节里的回答片段一律标注「模拟 / 不是真实模型输出」</dd>
          <dt>虚构资料</dt><dd>研究材料来自 M0.4 的虚构语料，与真实技术资料分开</dd>
          <dt>进度</dt><dd>浏览章节不算完成实验；只有真的改参数并看到结果才记录</dd>
          <dt>本章</dt><dd>第 ${getChapter(currentId).no} 章 · ${esc(lbl)}</dd>
        </div>`)
    );
  }

  /* ----------------------------- 交互 ----------------------------- */
  function openChapter(id) {
    if (!getChapterStory(id)) {
      onLog?.('叙事', `第 ${getChapter(id)?.no || id} 章的叙事尚未开放（M1.3）`, 'attention');
      return;
    }
    currentId = id;
    renderRail();
    renderMain();
    onLog?.('叙事', `Story 切到第 ${getChapter(id).no} 章 ${getChapter(id).title.zh}`, 'signal');
    onOpenChapter?.(id);
  }

  function openLabEntry(story) {
    onLog?.('叙事', `第 ${getChapter(currentId).no} 章实验入口 → ${story.lab.title}（本地模拟）`, 'signal');
    onOpenLabExperiment?.(story.lab.experimentId, story.lab.entryConceptId);
  }

  renderRail();
  renderMain();
  const unsubscribe = learning?.subscribe?.(() => renderRail());

  return {
    el,
    activate() {},
    currentChapter: () => currentId,
    openChapter,
    chapters: () => STORY_ORDER.slice(),
    story: () => getChapterStory(currentId),
    dispose() {
      unsubscribe?.();
    },
  };
}
