/**
 * src/features/atlas/knowledge/toolCalling.js
 * ------------------------------------------------------------------
 * Tool Calling 的知识页：本轮**唯一**拥有完整四步体验与两个深度层的节点
 * （M0.3_TASK §5）。
 *
 * 关键约束：
 *   · 四步路径 DISCOVER → UNDERSTAND → EXPERIMENT → CONNECT；
 *   · UNDERSTAND / INSPECT 是同一内容的两个深度层，不是两套互相矛盾的说法；
 *   · 内嵌实验用**全站共享的**工具定义与数据类型（simulation/tools）跑
 *     一条固定演示轨迹，并且**绝不读写构建器配置**（A11）；
 *   · 明确区分 Tool Calling / API / MCP / Skills / Agent，并破除常见误解。
 * ------------------------------------------------------------------
 */
import { h, esc, md } from '../../constructor/components/dom.js';
import { getConcept, CONCEPTS, RELATIONSHIPS, relationMeta } from '../data/index.js';
import { SIMULATION_TOOLS, paramText } from '../../../simulation/tools/registry.js';
import { runSimulation } from '../../../simulation/engine/runSimulation.js';
import { MISSION_001_MINI } from '../../../research-packs/mission-001-mini/index.js';
import { eventMetaTable, eventRow, payloadBlock, statusChip } from '../../execution/components/eventView.js';
import {
  CAPABILITY_TYPES,
  MCP_ROLES,
  buildProtocolTrace,
  comparePaths,
  protocolStepStats,
} from '../../laboratory/tool-calling/mcpPath.js';

/** 一句话定义（UNDERSTAND 层的核心表述） */
export const ONE_LINER =
  'Tool Calling 让模型可以请求调用外部工具，实际执行通常由外部应用或运行环境完成，再把结果交回模型处理。';

/** 三段职责：模型 / 运行环境 / 本地模拟工具 —— 全页共用同一份说法 */
const STAGES = Object.freeze([
  {
    id: 'request',
    idx: '01',
    en: 'REQUEST',
    cn: '模型提出调用请求',
    actor: 'model_core',
    claim: '模型根据上下文判断需要外部能力，产出一段结构化请求：要调用哪个工具、参数是什么。',
    detail: '请求本身<strong>不是执行结果</strong>。模型能输出合法的工具 JSON，只说明格式正确，不说明工具已经执行成功。',
    observe: ['请求里必须写明工具名与参数', '参数是模型生成的，可能不合法或多余', '此时外部世界里还没有发生任何动作'],
  },
  {
    id: 'execute',
    idx: '02',
    en: 'EXECUTE',
    cn: '运行环境检查并调用本地模拟工具',
    actor: 'system',
    claim: '外部应用接收请求，检查工具是否已提供、是否启用、参数是否合法、权限是否满足，然后才执行。',
    detail: '权限与工具注册都在这一侧控制。<strong>工具不存在、被禁用或未授权时，请求只会被阻断</strong>，不会有结果返回。',
    observe: ['工具未装配 → 阻断，不会假装成功', '权限不足 → 阻断，不会越权执行', '参数非法 → 拒绝执行并给出原因'],
  },
  {
    id: 'return',
    idx: '03',
    en: 'RETURN',
    cn: '模拟结果返回任务上下文',
    actor: 'system',
    claim: '执行产生的结果被写回模型上下文，作为新的一轮输入，模型据此继续作答或提出下一步。',
    detail: '返回的是<strong>本地教学模拟的固定响应</strong>：它来自随页面打包的虚构语料，不是真实网络检索结果。',
    observe: ['结果里可能是摘要，也可能是全文，取决于读取方式', '关闭元数据时不会悄悄补回来源与日期', '取得样本 ≠ 资料真实性已经核验'],
  },
]);

/** 术语边界速查（与 PRD 的必守边界一致，措辞与节点数据同源） */
const DISTINCTIONS = Object.freeze([
  ['Tool Calling', '机制：模型提出结构化请求，外部执行', '这是一种协作方式，不是某个具体产品。'],
  ['Tools', '能力入口：可被请求执行的具体功能', '工具可以写在应用里直接注册，不必经协议接入。'],
  ['API', '接口约定：软件之间怎么互相调用', '部分工具内部会封装 API，但 API 本身不会被模型直接调用。'],
  ['MCP', '连接协议：把外部能力以统一方式接入', '工具不必通过 MCP 提供；MCP 服务端也能暴露资源与提示模板。'],
  ['Skills', '按需加载的任务说明与资源', '加载说明只提供做法，不授予工具、文件或网络权限。'],
  ['Agent', '执行系统：模型 + 工具 + 上下文 + 控制', '模型只是其中的判断与生成部件，不等于 Agent。'],
]);

/** 内嵌实验的运行条件：都是本地演示设置，不写入装配台 */
const CONDITIONS = Object.freeze([
  { id: 'ready', cn: '两种工具都就绪', note: 'Search 与 Reader 均为 Ready，可以走完整的检索与读取。' },
  { id: 'no_search', cn: 'Search 未装配', note: '检索工具不存在：运行会在校验阶段被阻断。' },
  { id: 'no_reader', cn: 'Reader 未装配', note: '检索成功，但没有读取工具，只能拿到检索摘要。' },
  { id: 'reader_unauthorized', cn: 'Reader 未授权', note: 'Reader 已装配但缺少只读模拟权限，同样不能读取。' },
  { id: 'search_timeout', cn: '检索超时（失败预设）', note: '注入一次确定性超时：不会出现成功响应，也不会补出任何资料。' },
]);

/**
 * 构造本次演示的 run：条件为「检索超时」时注入确定性故障模式，
 * 其余条件只改装配快照。两种方式都走同一个模拟引擎，不旁路它。
 */
function buildRun(state) {
  const options = state.condition === 'search_timeout' ? { faultMode: 'search_timeout' } : {};
  return runSimulation(buildDemoSnapshot(state), MISSION_001_MINI, options);
}

/**
 * 构造实验用的**固定演示快照**。
 * 它不是构建器配置：只是知识页自己的一份演示输入，页面上任何操作都不会写回 store。
 */
export function buildDemoSnapshot(state) {
  const modules = [
    {
      moduleId: 'announcement_search',
      portId: 'SEARCH_PORT',
      enabled: true,
      permissions: { read: state.condition !== 'no_search' },
      settings: { searchScope: state.searchScope, maxResults: state.maxResults },
    },
  ];
  if (state.condition !== 'no_search' && state.condition !== 'no_reader') {
    modules.push({
      moduleId: 'document_reader',
      portId: 'READER_PORT',
      enabled: true,
      permissions: { read: state.condition !== 'reader_unauthorized' },
      settings: { readMode: state.readMode, includeMetadata: state.includeMetadata },
    });
  }
  return { schemaVersion: 1, modules };
}

export function createToolCallingKnowledge({
  learning,
  onBackToHub,
  onOpenAtlas,
  onOpenConcept,
  onViewInConstructor,
  onReturn,
  onStepChange,
  onLog,
  reducedMotion = false,
} = {}) {
  const concept = getConcept('tool_calling');
  const el = h('div', { class: 'workspace workspace--knowledge', 'data-open': 'true' });

  let step = 'discover';
  let layer = 'understand'; // understand | inspect
  let stageIndex = 0;
  let stageTimer = 0;

  const experiment = {
    condition: 'ready',
    searchScope: 'all_notices',
    maxResults: 3,
    readMode: 'full_text',
    includeMetadata: true,
    stepIndex: 0,
    playing: false,
    run: null,
    /** 路径模式：direct = 应用直连调用；mcp = 经协议路径（教学仿真） */
    pathMode: 'direct',
  };
  let experimentTimer = 0;

  /* ----------------------------- 头部 ----------------------------- */
  const head = h('header', { class: 'ws-head' });
  const headMeta = h('div', { class: 'ws-head__meta', 'data-el': 'context' });
  head.append(
    h('div', { class: 'ws-head__id' }, `
      <span class="ws-head__tag">A/0</span>
      <span class="ws-head__title">KNOWLEDGE · TOOL CALLING</span>
      <span class="ws-head__meta">工具调用 · 第 03 章 外部能力 · 唯一完整分层知识页</span>`),
    h('div', { class: 'ws-head__actions' }, `<span class="tag tag--attention">SIMULATED · 本地教学模拟</span>`)
  );
  const actions = head.querySelector('.ws-head__actions');
  const backBtn = h('button', { class: 'btn btn--primary', type: 'button', 'data-act': 'return' }, '← 返回上一处');
  backBtn.addEventListener('click', () => onReturn?.());
  const atlasBtn = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'atlas' }, 'ATLAS · 知识星图');
  atlasBtn.addEventListener('click', () => onOpenAtlas?.('tool_calling'));
  const hubBtn = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'hub' }, 'Back to Hub');
  hubBtn.addEventListener('click', () => onBackToHub?.('hub'));
  actions.append(backBtn, atlasBtn, hubBtn);

  /* ----------------------------- 步骤导航 ----------------------------- */
  const steps = [
    { id: 'discover', idx: '01', en: 'DISCOVER', cn: '发现问题' },
    { id: 'understand', idx: '02', en: 'UNDERSTAND', cn: '理解机制' },
    { id: 'experiment', idx: '03', en: 'EXPERIMENT', cn: '动手实验' },
    { id: 'connect', idx: '04', en: 'CONNECT', cn: '连回系统' },
  ];
  const stepNav = h('nav', { class: 'kn-steps', 'aria-label': '学习路径：四个步骤' });
  const stepButtons = new Map();
  for (const s of steps) {
    const b = h(
      'button',
      { class: 'kn-step', type: 'button', 'data-step': s.id, 'aria-current': 'false' },
      `<span class="kn-step__idx">${s.idx}</span>
       <span class="kn-step__body"><span class="kn-step__en">${s.en}</span><span class="kn-step__cn">${s.cn}</span></span>`
    );
    b.addEventListener('click', () => setStep(s.id));
    stepButtons.set(s.id, b);
    stepNav.append(b);
  }

  /* ----------------------------- 主区 ----------------------------- */
  const main = h('section', { class: 'kn-main', 'aria-live': 'polite' });

  /* ----------------------------- 侧栏 ----------------------------- */
  const aside = h('aside', { class: 'kn-aside surface', 'aria-label': '边界速查与实验隔离说明' });
  const asideBody = h('div', { class: 'kn-aside__scroll' });
  aside.append(h('div', { class: 'panel-head' }, '<span class="panel-head__title">边界速查</span>'), asideBody);

  el.append(head, h('div', { class: 'kn-body' }, stepNav, main, aside));

  function renderAside() {
    asideBody.replaceChildren();
    const dist = h('div', { class: 'section' });
    dist.append(h('div', { class: 'section__label' }, '<span>别把这几个当成一回事</span><span>术语边界</span>'));
    for (const [term, what, note] of DISTINCTIONS) {
      dist.append(
        h('div', { class: 'kn-dist' }, `
          <div class="kn-dist__term">${esc(term)}</div>
          <div class="kn-dist__what">${esc(what)}</div>
          <div class="kn-dist__note">${esc(note)}</div>`)
      );
    }
    asideBody.append(dist);

    const misc = h('div', { class: 'section' });
    misc.append(h('div', { class: 'section__label' }, `<span>常见误解</span><span>${concept.misconceptions.length} 条</span>`));
    for (const item of concept.misconceptions) {
      misc.append(
        h('div', { class: 'misconception' }, `
          <div class="misconception__claim"><span class="misconception__mark">误解</span>${esc(item.claim)}</div>
          <div class="misconception__fix"><span class="misconception__mark misconception__mark--fix">纠正</span>${esc(item.correction)}</div>`)
      );
    }
    asideBody.append(misc);

    asideBody.append(
      h('div', { class: 'section' }, `
        <div class="section__label"><span>实验隔离</span></div>
        <div class="note note--info" data-act="isolation-note">
          <span class="note__key">只读示范</span>
          <span>本页的实验使用一份<strong>固定演示配置</strong>在全站共享的本地语料上运行，<b>不会修改当前构建器配置、不会授予权限、不会写入运行记录</b>。它展示的是知识示范，不是你在装配台里的系统状态。</span>
        </div>`)
    );

    const progress = learning?.labelOf('tool_calling') || 'unexplored';
    asideBody.append(
      h('div', { class: 'section' }, `
        <div class="section__label"><span>学习进度</span><span>不是成绩</span></div>
        <div class="mono kn-progress" data-el="progress">
          ${progress === 'experiment_completed' ? '已完成本节点的内嵌实验（记录在本地学习进度中）' : '完成内嵌实验后会在本地学习进度中标记一次，没有分数与排名。'}
        </div>`)
    );
  }

  /* ==================================================================== *
   * 步骤 01 — DISCOVER
   * ==================================================================== */
  function renderDiscover() {
    const frag = document.createDocumentFragment();
    frag.append(
      h('div', { class: 'kn-hero' }, `
        <div class="kn-hero__idx">01 / DISCOVER</div>
        <h2 class="kn-hero__title">为什么模型不能直接知道一条虚构的校园公告？</h2>
        <p class="kn-hero__lead">模型本体只在已有参数上续写文本。本地语料里确实有 NTC-1001 这条公告，但那份资料从来没有进入模型的参数——所以它只能给出「看起来合理」的说法，无法给出可核对的时间。</p>`)
    );

    const grid = h('div', { class: 'kn-compare' });
    const left = h('div', { class: 'kn-compare__col', 'data-side': 'no-tool' });
    left.append(
      h('div', { class: 'kn-compare__head' }, '<span class="kn-compare__tag">只有模型</span><span class="tag tag--attention">无外部资料</span>'),
      h('p', { class: 'explain' }, '上下文里没有任何本地公告，模型只能生成一段<strong>读起来通顺的内容</strong>：它可能给出一个日期，但那个日期没有依据，也无法核对。'),
      h('div', { class: 'kn-sample' }, `
        <div class="kn-sample__label">示意片段 · 不是真实模型输出</div>
        <div class="kn-sample__body">「报名一般会提前一周左右截止，建议你尽快联系主办方确认。」</div>
        <div class="kn-sample__note">注意：这句话没有错误信息，但它也没有任何可核对的来源——这正是问题所在。</div>`)
    );

    const right = h('div', { class: 'kn-compare__col', 'data-side': 'with-tool' });
    const reveal = h('div', { class: 'kn-reveal' });
    const revealBtn = h('button', { class: 'btn btn--primary', type: 'button', 'data-act': 'reveal-source' }, '从本地语料取回 NTC-1001 的摘要');
    revealBtn.addEventListener('click', () => {
      const notice = MISSION_001_MINI.getNotice('NTC-1001');
      reveal.replaceChildren(
        h('div', { class: 'kn-sample kn-sample--real' }, `
          <div class="kn-sample__label">本地教学语料 · ${esc(notice.sourceId)} · 虚构数据（isFictional: true）</div>
          <div class="kn-sample__body">${esc(notice.summary)}</div>
          <div class="kn-sample__note">发布日期 ${esc(notice.publishedAt)} · 来源 ${esc(notice.publisher)}</div>`),
        h('div', { class: 'mono kn-reveal__note' }, '这条内容来自随页面打包的本地文件，不是网络检索，也不是模型「想」出来的。')
      );
      onLog?.('知识', 'Tool Calling 知识页：从本地教学语料读取 NTC-1001（虚构数据）作为对照，未发起任何网络请求', 'signal');
    });
    right.append(
      h('div', { class: 'kn-compare__head' }, '<span class="kn-compare__tag">模型 + 工具</span><span class="tag tag--signal">外部资料进入上下文</span>'),
      h('p', { class: 'explain' }, '工具调用让外部资料有办法进入上下文：模型请求检索，运行环境在本地语料里找到条目，再把结果放回上下文——于是回答才有可核对的内容。'),
      revealBtn,
      reveal
    );
    grid.append(left, right);
    frag.append(grid);

    frag.append(
      h('div', { class: 'note' }, `
        <span class="note__key">边界</span>
        <span>「资料进入上下文」不等于「事实已被验证」：这里只是把本地虚构语料取了出来。真实的资料冲突核验、引用溯源属于后续阶段。</span>`)
    );

    const next = h('button', { class: 'btn btn--primary kn-next', type: 'button' }, '下一步：UNDERSTAND · 理解机制 →');
    next.addEventListener('click', () => setStep('understand'));
    frag.append(next);
    return frag;
  }

  /* ==================================================================== *
   * 步骤 02 — UNDERSTAND / INSPECT
   * ==================================================================== */
  function renderStageFlow() {
    const wrap = h('div', { class: 'kn-flow', 'data-layer': layer });
    const rail = h('div', { class: 'kn-flow__rail' });
    STAGES.forEach((s, i) => {
      const card = h('div', { class: 'kn-stage', 'data-stage': s.id, 'data-active': i === stageIndex ? 'true' : 'false' },
        `<div class="kn-stage__head">
           <span class="kn-stage__idx">${s.idx}</span>
           <span class="kn-stage__title">${esc(s.cn)}</span>
           <span class="kn-stage__en mono">${esc(s.en)}</span>
         </div>
         <p class="kn-stage__claim">${md(s.claim)}</p>
         <p class="kn-stage__detail">${md(s.detail)}</p>
         <ul class="kn-stage__list">${s.observe.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>`);
      rail.append(card);
      if (i < STAGES.length - 1) rail.append(h('div', { class: 'kn-flow__link', 'aria-hidden': 'true' }, '<i></i>'));
    });

    const controls = h('div', { class: 'kn-flow__controls' });
    const mk = (label, aria, fn, cls = 'btn btn--sm') => {
      const b = h('button', { class: cls, type: 'button', 'aria-label': aria }, label);
      b.addEventListener('click', fn);
      return b;
    };
    controls.append(
      mk('上一步', '回到上一段职责', () => setStage(stageIndex - 1)),
      mk(stageIndex >= STAGES.length - 1 ? '重新播放' : '播放', '按顺序依次高亮三段职责', () => playStages(), 'btn btn--sm btn--primary'),
      mk('下一步', '进入下一段职责', () => setStage(stageIndex + 1)),
      mk('复位', '回到第一段职责', () => setStage(0), 'btn btn--sm btn--ghost'),
      h('span', { class: 'mono kn-flow__state', 'data-el': 'stage-state' }, `第 ${stageIndex + 1} / ${STAGES.length} 段 · ${STAGES[stageIndex].cn}`)
    );

    let insp = null;
    if (layer === 'inspect') {
      const stage = STAGES[stageIndex];
      insp = h('div', { class: 'kn-inspect', 'data-inspect-stage': stage.id });
      insp.append(
        h('div', { class: 'kn-inspect__head' }, `
          <span class="kn-inspect__idx">${stage.idx}</span>
          <span class="kn-inspect__title">${esc(stage.cn)} · 深入说明</span>
          <span class="tag tag--signal">INSPECT</span>`)
      );
      if (stage.id === 'request') {
        insp.append(
          h('div', { class: 'section__label' }, '<span>简化示意格式</span><span>不是逐字协议规范</span>'),
          h('pre', { class: 'code-block' }, `{\n  "tool": "announcement_search",\n  "arguments": {\n    "scope": "campus_events",\n    "maxResults": 3\n  }\n}`),
          h('p', { class: 'explain' }, '不同模型的字段名与调用形式并不相同，这里使用的是<strong>简化示意格式</strong>，用来表达「工具名 + 参数」这一固定结构。'),
          h('div', { class: 'note note--info' }, `
            <span class="note__key">注意</span>
            <span>能输出这段 JSON 只说明请求格式正确；工具是否已提供、是否被允许，要由下一步的执行环境判断。</span>`)
        );
      } else if (stage.id === 'execute') {
        insp.append(
          h('div', { class: 'section__label' }, '<span>运行环境在这一步检查什么</span><span>全部来自本地配置</span>'),
          h('div', { class: 'kv' }, `
            <dt>工具是否已提供</dt><dd>对应模块是否已装配到它的接口</dd>
            <dt>是否启用</dt><dd>Disabled 的模块不会被执行</dd>
            <dt>参数是否合法</dt><dd>范围与结果上限必须在允许取值内</dd>
            <dt>权限是否满足</dt><dd>缺少只读模拟权限时直接阻断</dd>
            <dt>执行环境</dt><dd>浏览器内的本地模拟函数，不联网</dd>`),
          h('div', { class: 'note' }, `
            <span class="note__key">被阻断时</span>
            <span>工具从未执行，因此不存在「已读到的内容」——事件里只有阻断原因，没有成功响应。</span>`)
        );
      } else {
        insp.append(
          h('div', { class: 'section__label' }, '<span>返回后发生了什么</span><span>事件记录</span>'),
          h('p', { class: 'explain' }, '结果被写回上下文，同时运行环境会为这一步留下一条事件记录：谁提出的请求、谁执行的、返回了什么、依据哪条规则。这正是 EXPERIMENT 与执行台里能看到的东西。'),
          h('div', { class: 'kv' }, `
            <dt>事件类型</dt><dd>tool.call / tool.result / tool.error</dd>
            <dt>稳定 ID</dt><dd>runId#e序号，不依赖时间或随机数</dd>
            <dt>分支依据</dt><dd>branchId + ruleId，可回溯到具体规则</dd>
            <dt>资料引用</dt><dd>sourceId / chunkId，供后续阶段做引用溯源</dd>`)
        );
      }
    }

    // INSPECT 层：左侧三段职责、右侧当前段的深入说明（避免深入内容被挤到折叠线以下）
    const body = h('div', { class: 'kn-flow__body' });
    body.append(rail);
    if (insp) body.append(insp);
    wrap.append(body, controls);
    return wrap;
  }

  function renderUnderstand() {
    const frag = document.createDocumentFragment();
    frag.append(
      h('div', { class: 'kn-hero' }, `
        <div class="kn-hero__idx">02 / UNDERSTAND ${layer === 'inspect' ? '· INSPECT 深入层' : '· 入门层'}</div>
        <h2 class="kn-hero__title">${esc(ONE_LINER)}</h2>
        <p class="kn-hero__lead">三方分工是这一节的骨架：模型只提出请求，运行环境负责检查与执行，工具返回的结果再进入上下文。下面的三段可以逐步高亮，看清每一步谁在做事、谁不在做事。</p>`)
    );

    const layerSwitch = h('div', { class: 'kn-layers', role: 'group', 'aria-label': '知识深度切换' });
    for (const [id, label, note] of [
      ['understand', 'UNDERSTAND · 入门', '用日常语言说明三方职责'],
      ['inspect', 'INSPECT · 深入', '展示简化请求格式、权限检查与事件记录'],
    ]) {
      const b = h('button', { type: 'button', 'data-layer': id, 'aria-pressed': layer === id ? 'true' : 'false', title: note }, label);
      b.addEventListener('click', () => setLayer(id));
      layerSwitch.append(b);
    }
    frag.append(layerSwitch, renderStageFlow());

    frag.append(
      h('div', { class: 'section' }, `
        <div class="section__label"><span>不要这样说</span><span>避免误导</span></div>
        <div class="note"><span class="note__key">禁止表述</span><span>不得宣称「每个模型都支持 Tool Calling」，也不得把模型的内部推理过程当成可观察的真实轨迹：本页展示的是<strong>协作结构与事件记录</strong>，不是模型的思考过程。</span></div>`)
    );

    const next = h('button', { class: 'btn btn--primary kn-next', type: 'button' }, '下一步：EXPERIMENT · 动手实验 →');
    next.addEventListener('click', () => setStep('experiment'));
    frag.append(next);
    return frag;
  }

  /* ==================================================================== *
   * 步骤 03 — EXPERIMENT
   * ==================================================================== */
  function experimentControls() {
    const box = h('div', { class: 'kn-exp__controls' });

    const conditionSel = h('select', { class: 'field__control', 'aria-label': '内嵌实验的运行条件（只影响本次知识示范）' });
    for (const c of CONDITIONS) conditionSel.append(h('option', { value: c.id, selected: experiment.condition === c.id ? 'true' : undefined }, c.cn));
    conditionSel.addEventListener('change', () => {
      experiment.condition = conditionSel.value;
      rebuildExperiment();
    });

    const searchTool = SIMULATION_TOOLS.announcement_search;
    const readerTool = SIMULATION_TOOLS.document_reader;

    const scopeSel = h('select', { class: 'field__control', 'aria-label': '搜索范围' });
    for (const f of searchTool.params.find((p) => p.key === 'searchScope').options) scopeSel.append(h('option', { value: f.value }, f.label));
    scopeSel.value = experiment.searchScope;
    scopeSel.addEventListener('change', () => {
      experiment.searchScope = scopeSel.value;
      rebuildExperiment();
    });

    const maxSel = h('select', { class: 'field__control', 'aria-label': '结果数量上限' });
    for (const f of searchTool.params.find((p) => p.key === 'maxResults').options) maxSel.append(h('option', { value: f.value }, f.label));
    maxSel.value = String(experiment.maxResults);
    maxSel.addEventListener('change', () => {
      experiment.maxResults = Number(maxSel.value);
      rebuildExperiment();
    });

    const modeSel = h('select', { class: 'field__control', 'aria-label': '读取方式' });
    for (const f of readerTool.params.find((p) => p.key === 'readMode').options) modeSel.append(h('option', { value: f.value }, f.label));
    modeSel.value = experiment.readMode;
    modeSel.addEventListener('change', () => {
      experiment.readMode = modeSel.value;
      rebuildExperiment();
    });

    const metaBox = h('input', { type: 'checkbox', id: 'kn-meta', 'aria-label': '包含元数据（来源与日期）' });
    metaBox.checked = experiment.includeMetadata;
    metaBox.addEventListener('change', () => {
      experiment.includeMetadata = metaBox.checked;
      rebuildExperiment();
    });

    const field = (label, control, hint) =>
      h('label', { class: 'kn-field' }, `<span class="kn-field__label">${esc(label)}</span>`, control, hint ? h('span', { class: 'kn-field__hint' }, hint) : null);

    box.append(
      field('运行条件', conditionSel, CONDITIONS.find((c) => c.id === experiment.condition)?.note),
      field('搜索范围', scopeSel, '改变候选集合：全部公告 5 条，校园活动 3 条'),
      field('结果数量', maxSel, '改变返回上限，事件里会如实显示候选数与是否截断'),
      field('读取方式', modeSel, '摘要只返回预先定义的摘要，全文才返回正文'),
      h('label', { class: 'kn-field kn-field--check' }, `<span class="kn-field__label">包含元数据</span>`, metaBox, h('span', { class: 'kn-field__hint' }, '关闭后用户可见的工具响应里不含来源与日期'))
    );
    return box;
  }

  function rebuildExperiment() {
    experiment.run = buildRun(experiment);
    experiment.stepIndex = 0;
    experiment.playing = false;
    clearInterval(experimentTimer);
    onLog?.(
      '知识',
      `Tool Calling 内嵌实验已重跑：${CONDITIONS.find((c) => c.id === experiment.condition)?.cn} · 范围 ${
        experiment.searchScope === 'campus_events' ? '校园活动' : '全部公告'
      } · 上限 ${experiment.maxResults} · ${experiment.readMode === 'full_text' ? '全文' : '摘要'} · 元数据${experiment.includeMetadata ? '开启' : '关闭'} → 结局 ${experiment.run.outcome}`,
      'signal'
    );
    renderMain();
  }

  function advanceExperiment() {
    const total = experiment.run.events.length;
    if (experiment.stepIndex >= total - 1) {
      experiment.playing = false;
      clearInterval(experimentTimer);
      learning?.markExperimentCompleted('tool_calling');
      renderAside();
      return false;
    }
    experiment.stepIndex += 1;
    if (experiment.stepIndex >= total - 1) {
      experiment.playing = false;
      clearInterval(experimentTimer);
      learning?.markExperimentCompleted('tool_calling');
      renderAside();
    }
    renderMain();
    return true;
  }

  /* ==================================================================== *
   * 步骤 03 的路径切换：直连 / MCP（M1.2 扩展，M0.3 引擎不变）
   * ==================================================================== */
  const PATH_MODES = [
    { id: 'direct', label: '直连示意', note: '应用自己校验参数并调用本地工具：最少的环节。' },
    { id: 'mcp', label: 'MCP 适配示意', note: '同一份能力经 Host / Client / Server 转发：多几个环节，数据不变。' },
  ];

  function pathModeControls() {
    const wrap = h('div', { class: 'tc-pathbar', 'data-act': 'path-mode' });
    wrap.append(h('div', { class: 'section__label' }, '<span>调用路径</span><span>同一份能力 · 两种接入方式</span>'));
    const row = h('div', { class: 'kn-layers', role: 'group', 'aria-label': '调用路径模式' });
    for (const mode of PATH_MODES) {
      const b = h('button', { type: 'button', 'data-path-mode': mode.id, 'aria-pressed': experiment.pathMode === mode.id ? 'true' : 'false', title: mode.note }, mode.label);
      b.addEventListener('click', () => {
        if (experiment.pathMode === mode.id) return;
        experiment.pathMode = mode.id;
        onLog?.(
          '知识',
          `Tool Calling 实验切换调用路径 → ${mode.label}（同一份引擎轨迹，只改变角色归属的展示方式）`,
          'info'
        );
        renderMain();
      });
      row.append(b);
    }
    wrap.append(row, h('div', { class: 'tk-field__hint' }, PATH_MODES.find((m) => m.id === experiment.pathMode).note));
    return wrap;
  }

  function renderPathPanel(run) {
    const trace = buildProtocolTrace({ run, mode: experiment.pathMode });
    const stats = protocolStepStats(trace);
    const compare = comparePaths(run, { mode: experiment.pathMode });
    const wrap = h('div', { class: 'tc-path', 'data-act': 'protocol-path', 'data-mode': experiment.pathMode });

    wrap.append(
      h('div', { class: 'section__label' }, `
        <span>${experiment.pathMode === 'mcp' ? 'MCP 协议路径' : '直连路径'}</span>
        <span>${stats.total} 步 · 其中协议包装 ${stats.envelope} 步 · 事件 ${stats.events} 条</span>`)
    );

    /* ---- 能力发现：只有 MCP 路径有「协商」这一步 ---- */
    const discovery = h('div', { class: 'tc-discover' });
    discovery.append(h('div', { class: 'tc-discover__title mono' }, experiment.pathMode === 'mcp' ? '能力发现（本地声明，不代表真实协商）' : '能力清单（应用自己注册）'));
    if (trace.discovery.steps.length) {
      for (const step of trace.discovery.steps) {
        discovery.append(h('div', { class: 'tc-envelope', 'data-role': step.role }, `
          <span class="tc-role-chip" data-role="${esc(step.role)}">${esc(roleLabel(step.role))}</span>
          <span class="tc-envelope__label">${esc(step.label)}</span>
          <span class="tc-envelope__detail">${esc(step.detail)}</span>`));
      }
    }
    discovery.append(h('div', { class: 'tk-field__hint' }, trace.discovery.note));

    /* ---- 三类能力：Tools / Resources / Prompts 用途不同 ---- */
    const caps = h('div', { class: 'tc-caps' });
    for (const type of CAPABILITY_TYPES) {
      const list = trace.discovery.capabilities.filter((c) => c.type === type.id);
      const card = h('div', { class: 'tc-cap', 'data-type': type.id });
      card.append(
        h('div', { class: 'tc-cap__head' }, `<span class="tc-cap__name">${esc(type.cn)}</span><span class="tag tag--muted">${list.length} 项</span>`),
        h('div', { class: 'tc-cap__note' }, esc(type.note))
      );
      for (const cap of list) {
        card.append(h('div', { class: 'tc-cap__item' }, `<span class="mono">${esc(cap.id)}</span> · ${esc(cap.cn)}`));
      }
      caps.append(card);
    }
    wrap.append(discovery, caps);

    /* ---- 角色时间轴：信封步骤可点回对应事件 ---- */
    const lane = h('div', { class: 'tc-lane' });
    lane.append(h('div', { class: 'tc-lane__title mono' }, '路径时间轴（点击任一步回到对应事件）'));
    for (const step of trace.steps) {
      const isEnvelope = step.kind === 'envelope';
      const row = h('button', {
        class: 'tc-step',
        type: 'button',
        'data-kind': step.kind,
        'data-role': step.role,
        'data-event': step.eventId,
        'aria-label': `第 ${step.eventId} 事件 · ${isEnvelope ? step.label : step.type}`,
      }, `
        <span class="tc-role-chip" data-role="${esc(step.role)}">${esc(roleLabel(step.role))}</span>
        <span class="tc-step__body">
          <span class="tc-step__label">${esc(isEnvelope ? step.label : step.type)}</span>
          <span class="tc-step__msg">${esc(step.message || (isEnvelope ? step.detail : ''))}</span>
        </span>
        <span class="tc-step__id mono">${esc(step.eventId)}</span>`);
      row.addEventListener('click', () => {
        const index = run.events.findIndex((event) => event.id === step.eventId);
        if (index >= 0) {
          experiment.stepIndex = index;
          experiment.playing = false;
          clearInterval(experimentTimer);
          renderMain();
        }
      });
      lane.append(row);
    }
    wrap.append(lane);

    /* ---- 对照结论：协议不改变事实 ---- */
    const table = h('div', { class: 'tk-table tk-table--path' });
    table.append(h('div', { class: 'tk-table__head' }, '<span>对照项</span><span>直连</span><span>MCP 路径</span><span>是否一致</span>'));
    for (const check of compare.checks) {
      table.append(h('div', { class: 'tk-table__row', 'data-check': check.key, 'data-same': check.same ? 'true' : 'false' }, `
        <span>${esc(check.label)}</span>
        <span class="mono">${esc(String(check.direct))}</span>
        <span class="mono">${esc(String(check.protocol))}</span>
        <span>${check.same ? '一致' : '不一致（实现缺陷）'}</span>`));
    }
    wrap.append(
      h('div', { class: 'note' + (compare.same ? ' note--info' : ' note--attention'), 'data-act': 'path-compare' }, `
        <span class="note__key">${compare.same ? '同一事实' : '差异告警'}</span>
        <span>${esc(compare.note)}</span>`),
      table,
      h('div', { class: 'note', style: 'margin-top:8px' }, `
        <span class="note__key">边界</span>
        <span>这里的 Host / Client / Server 是把角色叠在<b>同一份既有事件轨迹</b>上的教学可视化：不发起网络请求、不实现 JSON-RPC 握手、不声称已接入任何真实 MCP 服务端。</span>`)
    );
    return wrap;
  }

  function roleLabel(roleId) {
    return (MCP_ROLES.find((r) => r.id === roleId) || { cn: roleId }).cn.split(' · ')[0];
  }

  function renderExperiment() {
    const frag = document.createDocumentFragment();
    if (!experiment.run) experiment.run = buildRun(experiment);
    const run = experiment.run;

    frag.append(
      h('div', { class: 'kn-hero' }, `
        <div class="kn-hero__idx">03 / EXPERIMENT</div>
        <h2 class="kn-hero__title">用本地示例运行一次 Tool Calling</h2>
        <p class="kn-hero__lead">下面这份轨迹由与装配台<strong>完全相同的</strong>工具定义、参数 Schema 与模拟引擎生成，但它跑在一份固定演示配置上：改动这里的任何参数都不会影响你在装配台里的配置。</p>`)
    );

    frag.append(
      h('div', { class: 'note note--isolation', 'data-act': 'experiment-isolation' }, `
        <span class="note__key">知识示范</span>
        <span>这是知识示范，不会修改当前构建器配置；它也不会写入「最近一次运行」记录。要运行你自己的系统，请到装配台确认配置后点击 RUN SIMULATION。</span>`)
    );

    frag.append(pathModeControls());
    frag.append(experimentControls());

    const controls = h('div', { class: 'kn-exp__transport' });
    const mk = (label, aria, fn, cls = 'btn btn--sm') => {
      const b = h('button', { class: cls, type: 'button', 'aria-label': aria }, label);
      b.addEventListener('click', fn);
      return b;
    };
    controls.append(
      mk('上一步', '回到上一个事件', () => {
        experiment.stepIndex = Math.max(0, experiment.stepIndex - 1);
        renderMain();
      }),
      mk(experiment.playing ? '暂停' : '播放', '播放或暂停这条知识示范轨迹', () => {
        experiment.playing = !experiment.playing;
        clearInterval(experimentTimer);
        if (experiment.playing) {
          experimentTimer = setInterval(() => {
            if (!advanceExperiment()) clearInterval(experimentTimer);
          }, reducedMotion ? 420 : 900);
        }
        renderMain();
      }, 'btn btn--sm btn--primary'),
      mk('下一步', '进入下一个事件', () => advanceExperiment()),
      mk('复位', '回到第一个事件（不重新运行引擎）', () => {
        experiment.stepIndex = 0;
        experiment.playing = false;
        clearInterval(experimentTimer);
        renderMain();
      }, 'btn btn--sm btn--ghost'),
      h('span', { class: 'mono kn-exp__state', 'data-el': 'exp-state' }, `事件 ${experiment.stepIndex + 1} / ${run.events.length} · 当前结局 ${run.outcome}`)
    );
    frag.append(controls);
    frag.append(renderPathPanel(run));

    const current = run.events[experiment.stepIndex];
    const cols = h('div', { class: 'kn-exp__cols' });

    const listCol = h('div', { class: 'kn-exp__list' });
    listCol.append(h('div', { class: 'section__label' }, `<span>事件轨迹</span><span>${run.events.length} 条 · 只读</span>`));
    run.events.forEach((ev, i) => {
      listCol.append(eventRow(ev, { current: i === experiment.stepIndex, onSelect: (seq) => {
        experiment.stepIndex = seq;
        experiment.playing = false;
        clearInterval(experimentTimer);
        renderMain();
      } }));
    });

    const detailCol = h('div', { class: 'kn-exp__detail' });
    detailCol.append(
      h('div', { class: 'section__label' }, `<span>事件详情</span><span>${esc(current.id)}</span>`),
      h('div', { class: 'ev-detail__head' }, `<span class="ev-detail__type">${esc(current.type)}</span>`),
      statusChip(current.status),
      h('p', { class: 'explain' }, esc(current.message)),
      eventMetaTable(current, run)
    );
    const inPayload = current.inputRef ? run.artifacts.payloads[current.inputRef] : null;
    const outPayload = current.outputRef ? run.artifacts.payloads[current.outputRef] : null;
    if (inPayload) detailCol.append(payloadBlock('输入载荷', current.inputRef, inPayload));
    if (outPayload) detailCol.append(payloadBlock('输出载荷', current.outputRef, outPayload, { open: true }));
    if (!inPayload && !outPayload) {
      detailCol.append(h('div', { class: 'note' }, `<span class="note__key">无载荷</span><span>这一步只记录状态与原因，没有工具输入输出。</span>`));
    }

    cols.append(listCol, detailCol);
    frag.append(cols);

    const evidence = run.artifacts.evidence;
    frag.append(
      h('div', { class: 'section' }, `
        <div class="section__label"><span>本次示范拿到了什么</span><span>不是报告</span></div>
        <div class="kv">
          <dt>结局</dt><dd>${esc(run.outcome)} · 分支 ${esc(run.branchId)}</dd>
          <dt>样本资料</dt><dd>${evidence.level ? `${esc(evidence.levelCn || evidence.level)}（${evidence.sourceIds.join('、')}）` : '未取得样本资料'}</dd>
          <dt>报告</dt><dd>${esc(run.artifacts.report.note)}</dd>
          <dt>数据</dt><dd>${esc(MISSION_001_MINI.dataNote)}</dd>
        </div>`)
    );

    const next = h('button', { class: 'btn btn--primary kn-next', type: 'button' }, '下一步：CONNECT · 连回系统 →');
    next.addEventListener('click', () => setStep('connect'));
    frag.append(next);
    return frag;
  }

  /* ==================================================================== *
   * 步骤 04 — CONNECT
   * ==================================================================== */
  function renderConnect() {
    const frag = document.createDocumentFragment();
    frag.append(
      h('div', { class: 'kn-hero' }, `
        <div class="kn-hero__idx">04 / CONNECT</div>
        <h2 class="kn-hero__title">把 Tool Calling 放回整套系统里看</h2>
        <p class="kn-hero__lead">Tool Calling 只是一段机制：它上方有 Agent 决定「要不要用工具」，下方有 Tools 提供具体能力，旁边还有 API、MCP、Skills 这些容易被混为一谈的概念。</p>`)
    );

    const rel = h('div', { class: 'kn-relations' });
    for (const edge of RELATIONSHIPS.filter((e) => e.sourceId === 'tool_calling' || e.targetId === 'tool_calling')) {
      const other = edge.sourceId === 'tool_calling' ? edge.targetId : edge.sourceId;
      const meta = relationMeta(edge.type);
      const row = h('button', { class: 'kn-relation', type: 'button', 'data-concept': other },
        `<span class="kn-relation__head"><span class="tag tag--muted">${esc(edge.type)} · ${esc(meta.cn)}</span><span class="kn-relation__name">${esc(CONCEPTS[other].cn)} · ${esc(CONCEPTS[other].name)}</span></span>
         <span class="kn-relation__desc">${esc(edge.description)}</span>`);
      row.addEventListener('click', () => onOpenAtlas?.(other));
      rel.append(row);
    }
    frag.append(rel);

    const others = h('div', { class: 'section' });
    others.append(h('div', { class: 'section__label' }, '<span>跳到关联概念</span><span>知识页 / 星图</span>'));
    const chips = h('div', { class: 'chips' });
    for (const id of ['llm', 'tools', 'api', 'mcp', 'mcp_server', 'function_calling']) {
      const c = CONCEPTS[id];
      const b = h('button', { class: 'btn btn--sm', type: 'button', 'data-concept': id }, `${c.cn} · ${c.name}`);
      b.addEventListener('click', () => (onOpenConcept ? onOpenConcept(id) : onOpenAtlas?.(id)));
      chips.append(b);
    }
    others.append(chips);
    frag.append(others);

    const live = h('div', { class: 'section' });
    live.append(h('div', { class: 'section__label' }, '<span>回到真实系统</span><span>装配台定位</span>'));
    const view = h('button', { class: 'btn btn--primary', type: 'button', 'data-act': 'view-constructor' }, 'VIEW IN CONSTRUCTOR · 在系统中查看 Search / Reader');
    view.addEventListener('click', () => onViewInConstructor?.(CONCEPTS.tool_calling));
    live.append(
      view,
      h('div', { class: 'note', style: 'margin-top:8px' }, `
        <span class="note__key">只定位</span>
        <span>「在系统中查看」只会定位到对应的工具模块或能力架：<strong>不会</strong>替你装配模块、开启权限或修改任何参数。尚未装配时会明确显示「尚未装配」。</span>`)
    );
    frag.append(live);

    const finish = h('div', { class: 'kn-finish' });
    const backAtlas = h('button', { class: 'btn btn--ghost', type: 'button' }, '返回 ATLAS 查看完整关系图');
    backAtlas.addEventListener('click', () => onOpenAtlas?.('tool_calling'));
    const backHub = h('button', { class: 'btn btn--ghost', type: 'button' }, 'Back to Hub · 返回中央核心');
    backHub.addEventListener('click', () => onBackToHub?.('hub'));
    finish.append(backAtlas, backHub);
    frag.append(finish);
    return frag;
  }

  /* ==================================================================== *
   * 渲染与状态切换
   * ==================================================================== */
  function renderMain() {
    main.replaceChildren();
    if (step === 'discover') main.append(renderDiscover());
    else if (step === 'understand') main.append(renderUnderstand());
    else if (step === 'experiment') main.append(renderExperiment());
    else main.append(renderConnect());

    for (const [id, b] of stepButtons) b.setAttribute('aria-current', id === step ? 'true' : 'false');
    headMeta.textContent = `当前步骤 ${steps.find((s) => s.id === step).idx} / 04 · ${steps.find((s) => s.id === step).en} · ${
      layer === 'inspect' ? 'INSPECT 深入层' : 'UNDERSTAND 入门层'
    }`;
  }

  function setStage(index) {
    stageIndex = Math.max(0, Math.min(STAGES.length - 1, index));
    clearInterval(stageTimer);
    renderMain();
  }

  function playStages() {
    clearInterval(stageTimer);
    stageIndex = 0;
    renderMain();
    stageTimer = setInterval(() => {
      if (stageIndex >= STAGES.length - 1) {
        clearInterval(stageTimer);
        return;
      }
      stageIndex += 1;
      renderMain();
    }, reducedMotion ? 500 : 1100);
  }

  function setLayer(next) {
    layer = next === 'inspect' ? 'inspect' : 'understand';
    if (layer === 'inspect') learning?.markInspected?.('tool_calling');
    onLog?.('知识', `Tool Calling 知识页深度层切换为 ${layer === 'inspect' ? 'INSPECT（深入）' : 'UNDERSTAND（入门）'}`, 'info');
    renderMain();
  }

  function setStep(next) {
    step = steps.some((s) => s.id === next) ? next : 'discover';
    onStepChange?.(step);
    if (step === 'experiment') learning?.markLabStarted?.('exp-tool-calling-demo');
    clearInterval(experimentTimer);
    experiment.playing = false;
    clearInterval(stageTimer);
    if (step === 'experiment' && !experiment.run) experiment.run = buildRun(experiment);
    renderMain();
    onLog?.('知识', `Tool Calling 学习路径：进入 ${steps.find((s) => s.id === step).en} · ${steps.find((s) => s.id === step).cn}`, 'info');
  }

  renderAside();
  renderMain();

  let activated = false;
  return {
    el,
    setStep,
    setLayer,
    currentStep: () => step,
    currentLayer: () => layer,
    /** 实验事件轨迹（自检脚本用于断言「参数确实改变了事件」） */
    experimentSnapshot: () => ({
      condition: experiment.condition,
      searchScope: experiment.searchScope,
      maxResults: experiment.maxResults,
      readMode: experiment.readMode,
      includeMetadata: experiment.includeMetadata,
      stepIndex: experiment.stepIndex,
      pathMode: experiment.pathMode,
      outcome: experiment.run?.outcome || null,
      branchId: experiment.run?.branchId || null,
      events: experiment.run ? experiment.run.events.map((e) => ({ id: e.id, type: e.type, status: e.status, message: e.message })) : [],
      payloads: experiment.run ? experiment.run.artifacts.payloads : {},
      evidence: experiment.run?.artifacts?.evidence || null,
      /** 协议路径对照（直连 vs MCP）：用于断言「协议不改变事实」 */
      protocol: experiment.run
        ? (() => {
            const compare = comparePaths(experiment.run, { mode: experiment.pathMode });
            return { same: compare.same, checks: compare.checks.map((c) => ({ key: c.key, same: c.same })), note: compare.note };
          })()
        : null,
    }),
    rerunExperiment: (patch = {}) => {
      Object.assign(experiment, patch);
      rebuildExperiment();
    },
    /** 自检脚本用：切换路径模式（走与点击相同的渲染路径） */
    setPathMode(mode) {
      experiment.pathMode = mode === 'mcp' ? 'mcp' : 'direct';
      renderMain();
      return experiment.pathMode;
    },
    currentPathMode: () => experiment.pathMode,
    /** 把事件指针推到末条，用于自检脚本标记实验完成 */
    completeExperiment() {
      if (!experiment.run) experiment.run = buildRun(experiment);
      experiment.stepIndex = experiment.run.events.length - 1;
      learning?.markExperimentCompleted('tool_calling');
      renderAside();
      renderMain();
    },
    activate() {
      if (activated) return;
      activated = true;
      learning?.markExplored('tool_calling');
      renderAside();
      renderMain();
    },
    dispose() {
      clearInterval(stageTimer);
      clearInterval(experimentTimer);
      experiment.playing = false;
    },
  };
}

export { STAGES, CONDITIONS, DISTINCTIONS };

