/**
 * src/features/knowledge/components/labWorkspace.js
 * ------------------------------------------------------------------
 * LAB / 实验空间（M1.1 §6 Lab，M1.2 D03–D05 扩展）。
 *
 * 本阶段的真实状态：
 *   · 三个实验**真的能跑**：Lab 01（Token 预算，独立工作区）、
 *     Lab 02（上下文模拟，独立工作区）、Lab 03（Tool Calling / MCP，
 *     复用 M0.3 知识页的 EXPERIMENT 步骤）；
 *   · 其余三个只登记计划，界面显示「后续阶段开放」，**不渲染可点击的假按钮**；
 *   · 本页只做登记与路由：点击后打开对应实验，不在本页跑任何引擎。
 * ------------------------------------------------------------------
 */
import { h, esc } from '../../constructor/components/dom.js';
import {
  CHAPTERS,
  EXPERIMENTS,
  EXPERIMENT_OPEN_MODES,
  EXPERIMENT_STATUS,
  conceptAvailability,
  experimentStats,
  getChapter,
  getConcept,
  getExperiment,
} from '../../../knowledge/index.js';
import { getChapterStory } from '../../../content/chapters/index.js';

export function createLabWorkspace({
  learning,
  onBackToHub,
  onOpenConcept,
  onOpenExperiment,
  onOpenStory,
  onOpenChapterStory,
  onLog,
} = {}) {
  const el = h('div', { class: 'workspace workspace--lab', 'data-open': 'true' });
  const stats = experimentStats();

  /* ----------------------------- 头部 ----------------------------- */
  const head = h('header', { class: 'ws-head' });
  head.append(
    h('div', { class: 'ws-head__id' }, `
      <span class="ws-head__tag">A/0</span>
      <span class="ws-head__title">LAB · 实验空间</span>
      <span class="ws-head__meta">${stats.total} 个实验登记 · ${stats.available} 个本轮可操作 · ${stats.planned} 个后续阶段开放</span>`),
    h('div', { class: 'ws-head__actions' }, '<span class="tag tag--attention">SIMULATED · 本地教学模拟</span>')
  );
  const actions = head.querySelector('.ws-head__actions');
  const backBtn = h('button', { class: 'btn btn--primary', type: 'button', 'data-act': 'back-hub' }, '← 返回 Hub');
  backBtn.addEventListener('click', () => onBackToHub?.('hub'));
  const storyBtn = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'story' }, 'STORY · 六章目录');
  storyBtn.addEventListener('click', () => onOpenStory?.());
  actions.append(backBtn, storyBtn);

  /* ----------------------------- 主区 ----------------------------- */
  const main = h('section', { class: 'lab-main', 'aria-label': '实验登记表' });
  main.append(
    h('div', { class: 'lab-intro' }, `
      <div class="story-intro__tag">M1.3 · 六个实验，一条研究叙事</div>
      <h2 class="story-intro__title">六个实验，一条研究叙事</h2>
      <p class="story-intro__lead">Lab 01–03（M1.2）拆开「模型读到什么、指令怎么改变产出、资料怎么被拿回来」；Lab 04–06（M1.3）拆开「拿回来之后怎么找、谁决定下一步、怎么限制与验证」。
      六个实验都跑在同一条虚构研究任务上：<b>整合分散的校园活动公告是否可行</b>。全部在本地运行，不联网、不调用任何模型；实验完成状态只在真实操作并看到结果后才记录。</p>`)
  );

  const available = EXPERIMENTS.filter((e) => e.status === 'available');
  const featured = h('div', { class: 'lab-grid lab-grid--featured' });
  for (const experiment of available) {
    const chapter = getChapter(experiment.chapterId);
    const concept = getConcept(experiment.entryConceptId);
    const story = getChapterStory(experiment.chapterId);
    const mode = EXPERIMENT_OPEN_MODES[experiment.openMode];
    const card = h('section', { class: 'lab-card lab-card--ready', 'data-chapter': experiment.chapterId, 'data-experiment': experiment.id });
    card.append(
      h('div', { class: 'lab-card__head' }, `
        <span class="lab-card__no">${chapter.no}</span>
        <span class="lab-card__title">${esc(experiment.title)}<em>${esc(chapter.title.zh)} · ${esc(mode.cn)}</em></span>`),
      h('div', { class: 'lab-item__note' }, esc(experiment.dataNote))
    );

    const relatedConcepts = experiment.conceptIds.map((id) => getConcept(id)?.cn || id).join('、');
    card.append(h('div', { class: 'lab-item__concepts' }, `关联概念：${esc(relatedConcepts)} · 阶段 ${esc(experiment.milestone)}`));

    const rowActions = h('div', { class: 'lab-item__actions' });
    const run = h('button', { class: 'btn btn--primary btn--sm', type: 'button', 'data-act': 'run-experiment' }, mode.cta);
    run.addEventListener('click', () => {
      onLog?.('实验', `打开实验 ${experiment.id}（${experiment.title}）→ ${mode.cn}`, 'signal');
      onOpenExperiment?.(experiment, concept?.id || experiment.entryConceptId);
    });
    const learn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'data-act': 'open-knowledge' }, `先看 ${concept?.cn || '知识页'}`);
    learn.addEventListener('click', () => onOpenConcept?.(concept?.id || experiment.entryConceptId, { from: 'lab', experimentId: experiment.id }));
    rowActions.append(run, learn);
    if (story) {
      const chapterBtn = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', 'data-act': 'open-chapter-story' }, `第 ${chapter.no} 章叙事`);
      chapterBtn.addEventListener('click', () => onOpenChapterStory?.(experiment.chapterId));
      rowActions.append(chapterBtn);
    }
    card.append(rowActions);

    const done = learning?.isLabCompleted?.(experiment.id);
    if (done) card.append(h('div', { class: 'lab-item__done' }, '<span class="tag tag--success">已完成（本地记录）</span>'));
    featured.append(card);
  }
  main.append(featured);

  /* 计划中的实验：只写状态，不渲染按钮 */
  const plannedList = EXPERIMENTS.filter((e) => e.status !== 'available');
  const planned = h('div', { class: 'lab-grid', 'data-act': 'planned-grid' });
  for (const experiment of plannedList) {
    const chapter = getChapter(experiment.chapterId);
    const meta = EXPERIMENT_STATUS[experiment.status] || EXPERIMENT_STATUS.planned;
    const card = h('section', { class: 'lab-card', 'data-chapter': experiment.chapterId, 'data-experiment': experiment.id });
    card.append(
      h('div', { class: 'lab-card__head' }, `
        <span class="lab-card__no">${chapter.no}</span>
        <span class="lab-card__title">${esc(experiment.title)}<em>${esc(chapter.title.zh)}</em></span>`),
      h('div', { class: 'lab-item', 'data-status': experiment.status }, `
        <div class="lab-item__head">
          <span class="lab-item__title">${esc(experiment.dataNote)}</span>
          <span class="tag tag--${meta.tone}">${esc(meta.cn)}</span>
        </div>
        <div class="lab-item__concepts">关联概念：${experiment.conceptIds.map((id) => esc(getConcept(id)?.cn || id)).join('、')} · 计划阶段 ${esc(experiment.milestone)}</div>
        <div class="lab-item__locked" data-act="experiment-planned">后续阶段开放（${esc(experiment.milestone)}）：本轮没有可点击的运行入口</div>`)
    );
    planned.append(card);
  }
  if (plannedList.length) main.append(planned);

  /* ----------------------------- 侧栏 ----------------------------- */
  const aside = h('aside', { class: 'lab-aside surface', 'aria-label': '实验边界说明' });
  const asideBody = h('div', { class: 'lab-aside__scroll' });
  aside.append(h('div', { class: 'panel-head' }, '<span class="panel-head__title">实验边界</span>'), asideBody);
  asideBody.append(
    h('div', { class: 'section' }, `
      <div class="section__label"><span>本轮六个实验</span></div>
      <div class="note note--info"><span class="note__key">Lab 01</span><span>真实分词 · 离线预计算：token 数来自 gpt-tokenizer 在构建期切分并逐条回译校验的结果，运行期不含分词器本体。</span></div>
      <div class="note note--info" style="margin-top:6px"><span class="note__key">Lab 02</span><span>确定性规则：同一配置永远得到同一份报告；没有资料时写「未验证」，不编造引文。</span></div>
      <div class="note note--info" style="margin-top:6px"><span class="note__key">Lab 03</span><span>复用 M0.3 引擎：直连与 MCP 路径共用同一份事件轨迹，协议不改变事实。</span></div>
      <div class="note note--info" style="margin-top:6px"><span class="note__key">Lab 04</span><span>切分 / 检索 / RAG 全是本地规则；二维向量是人工设定的示意坐标，浏览器里没有 Embedding 模型。</span></div>
      <div class="note note--info" style="margin-top:6px"><span class="note__key">Lab 05</span><span>Workflow 与 Agent Loop 共用同一份语料、工具与权限；事件由确定性状态机生成，播放只揭示事件。</span></div>
      <div class="note note--info" style="margin-top:6px"><span class="note__key">Lab 06</span><span>权限与沙箱是前端判定规则（非真实隔离）；注入样本为明确标记的教学模拟文本。</span></div>`),
    h('div', { class: 'section' }, `
      <div class="section__label"><span>不会做的事</span><span>红线</span></div>
      <div class="kv">
        <dt>联网</dt><dd>不发起任何网络请求，语料随页面打包</dd>
        <dt>真实模型</dt><dd>不调用任何在线模型或推理服务</dd>
        <dt>真实向量</dt><dd>不声称浏览器在做语义向量检索或调用 Embedding 服务</dd>
        <dt>假按钮</dt><dd>未开放实验只显示文字说明，不渲染运行按钮</dd>
        <dt>假进度</dt><dd>没有虚构的完成度或评分</dd>
        <dt>假协议</dt><dd>MCP 只做路径可视化，不声称实现真实握手或 SDK</dd>
        <dt>假安全</dt><dd>权限 / 沙箱 / 护栏均为前端模拟，不构成真实隔离或安全认证</dd>
      </div>`),
    h('div', { class: 'section' }, `
      <div class="section__label"><span>阶段归属</span></div>
      <div class="mono kn-progress">
        <div>第 01–03 章实验 → M1.2（已开放）</div>
        <div>第 04–06 章实验 → M1.3（已开放）</div>
        <div>Agent Constructor 扩展与高级编排 → M2</div>
      </div>`)
  );

  el.append(head, h('div', { class: 'story-body lab-body' }, main, aside));

  return {
    el,
    activate() {},
    experiments: () => EXPERIMENTS.map((e) => ({ id: e.id, status: e.status, chapterId: e.chapterId, openMode: e.openMode })),
    experimentOf: (id) => getExperiment(id),
    chapterOf: (id) => getChapter(getExperiment(id)?.chapterId || ''),
    available: () => EXPERIMENTS.filter((e) => e.status === 'available').map((e) => e.id),
    planned: () => EXPERIMENTS.filter((e) => e.status !== 'available').map((e) => e.id),
    /** 自检脚本用：确认未开放实验没有任何可点击入口 */
    plannedHasRunButton: () =>
      [...el.querySelectorAll('[data-experiment]')].some((node) => {
        const experiment = getExperiment(node.getAttribute('data-experiment'));
        return experiment?.status !== 'available' && node.querySelector('[data-act="run-experiment"]');
      }),
    chapterBadgeOf: (chapterId) => CHAPTERS.find((c) => c.id === chapterId)?.no || null,
    conceptsOf: (id) => (getExperiment(id)?.conceptIds || []).map((cid) => conceptAvailability(cid)),
    dispose() {},
  };
}
