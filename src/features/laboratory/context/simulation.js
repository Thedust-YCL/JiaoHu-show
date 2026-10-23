/**
 * src/features/laboratory/context/simulation.js
 * ------------------------------------------------------------------
 * Lab 02 · INSTRUCTIONS / CONTEXT（M1.2 D04 / §5）的**纯逻辑**。
 *
 * 它模拟的是「同一件事在不同指令与上下文配置下，研究产出会怎样变化」，
 * 而不是「同一个问题问两次模型」。因此这里是**确定性规则表 + 纯函数**：
 *   · 没有任何随机数、没有 Date、没有网络、没有模型调用；
 *   · 同样的配置永远得到同样的报告、同样的遗漏、同样的理由；
 *   · 报告里的每一句事实性内容都必须能落回一张背景卡片，
 *     落不回去就写「未验证」，绝不因为勾了「要求标注来源」就编造引文。
 *
 * 关键规则（与 §5「模拟逻辑」逐条对应）：
 *   R1 研究目标：宽泛 → 泛泛而谈的两段；明确 → 四个可回答的研究子问题。
 *   R2 输出方式：自由陈述 → 段落；结构化提纲 → 编号要点。
 *   R3 证据要求：无要求 → 不标注引用；要求标注 → 每条事实后带来源，
 *      没有资料时明确写「无法引用」，而不是伪造引用。
 *   R4 背景资料：不添加 → 全部事实处于「未验证」；添加 → 只有
 *      真正进入上下文的卡片才能支撑事实。
 *   R5 上下文预算：充足 → 3 张卡片全进；受限 → 按与主任务的关联度顺序
 *      放入，放不下的**整张舍弃**，并逐张说明原因；被舍弃卡片支撑的事实
 *      自动回到「未验证」——这就是预算影响结论的因果链。
 *
 * 预算数字复用 Lab 01 的真实 token 统计（同一份离线预计算表），
 * 所以「受限」不是随便写的阈值，而是按真实 token 数算出来的。
 * ------------------------------------------------------------------
 */
import { countTokens } from '../token/budget.js';

/** 四个可配置维度：界面按钮与测试共用这一份定义 */
export const GOALS = Object.freeze([
  Object.freeze({ id: 'broad', label: '宽泛任务', note: '「帮我看看这些校园活动能不能整合」' }),
  Object.freeze({ id: 'specific', label: '明确研究问题', note: '把任务拆成时间、场地、报名容量、资料缺口四个子问题' }),
]);

export const FORMATS = Object.freeze([
  Object.freeze({ id: 'prose', label: '自由陈述', note: '连续段落，读者要自己找结构' }),
  Object.freeze({ id: 'outline', label: '结构化研究提纲', note: '按子问题分条，缺口单独列出' }),
]);

export const EVIDENCE = Object.freeze([
  Object.freeze({ id: 'none', label: '无明确要求', note: '不要求标注来源' }),
  Object.freeze({ id: 'cite', label: '标注来源及不确定性', note: '每条事实都要写出处；没有出处就写「未验证」' }),
]);

export const BACKGROUND = Object.freeze([
  Object.freeze({ id: 'none', label: '不添加背景', note: '上下文里没有任何公告资料' }),
  Object.freeze({ id: 'cards', label: '添加虚构背景卡片', note: '把 3 条虚构校园公告放进上下文（确实进入多少由预算决定）' }),
]);

export const BUDGETS = Object.freeze([
  Object.freeze({ id: 'ample', label: '充足', note: '背景资料预算 1024 token（教学示意）' }),
  Object.freeze({ id: 'limited', label: '受限', note: '背景资料预算 200 token（教学示意）' }),
]);

/** 维度 → 取值表的统一查询（界面与测试共用，避免各处硬编码字符串） */
export const DIMENSIONS = Object.freeze({
  goal: GOALS,
  format: FORMATS,
  evidence: EVIDENCE,
  background: BACKGROUND,
  budget: BUDGETS,
});

export const DIMENSION_ORDER = Object.freeze(['goal', 'format', 'evidence', 'background', 'budget']);

export const DEFAULT_CONTEXT_STATE = Object.freeze({
  goal: 'broad',
  format: 'prose',
  evidence: 'none',
  background: 'none',
  budget: 'ample',
});

/** 背景资料预算（教学示意；两档都要能让「3 张全进 / 只进一部分」都出现） */
const CARD_BUDGET = Object.freeze({ ample: 1024, limited: 200 });

/**
 * 背景卡片：直接取自 M0.4 的虚构语料（isFictional: true）。
 * `facts` 列出这张卡片**真的能支撑**的事实 ID —— 这是人工映射，
 * 不是模型判断；映射错了会被测试抓住（见 tests/context-lab.test.mjs）。
 */
export const BACKGROUND_CARDS = Object.freeze([
  Object.freeze({
    id: 'card-ntc-1001',
    sourceId: 'NTC-1001',
    fragmentId: 'NTC-1001#summary',
    title: '校园创客分享会 · 报名开启',
    publisher: '学生创新中心',
    publishedAt: '2026-10-06',
    facts: Object.freeze(['fact-meetup-time', 'fact-meetup-venue', 'fact-meetup-deadline']),
  }),
  Object.freeze({
    id: 'card-ntc-1002',
    sourceId: 'NTC-1002',
    fragmentId: 'NTC-1002#summary',
    title: '社团招新咨询周 · 场地与时间',
    publisher: '社团联合会',
    publishedAt: '2026-10-02',
    facts: Object.freeze(['fact-clubweek-time', 'fact-clubweek-venue']),
  }),
  Object.freeze({
    id: 'card-ntc-1003',
    sourceId: 'NTC-1003',
    fragmentId: 'NTC-1003#summary',
    title: '实验室安全培训 · 第三期',
    publisher: '实验室管理处',
    publishedAt: '2026-09-30',
    facts: Object.freeze(['fact-safety-time', 'fact-safety-quota']),
  }),
]);

/**
 * 事实表：一条事实 = 一句可被核对的陈述 + 唯一来源 + 它回答哪个子问题。
 * 「未验证」不是失败状态，而是这套模拟里必须被如实暴露的结果。
 */
export const FACTS = Object.freeze([
  Object.freeze({
    id: 'fact-meetup-time',
    questionId: 'q-time',
    topic: '分享会的时间段',
    statement: '创客分享会定在 10 月 20 日 19:00–21:00',
    sourceId: 'NTC-1001',
  }),
  Object.freeze({
    id: 'fact-meetup-venue',
    questionId: 'q-venue',
    topic: '分享会的地点',
    statement: '分享会地点是学生活动中心 B201',
    sourceId: 'NTC-1001',
  }),
  Object.freeze({
    id: 'fact-meetup-deadline',
    questionId: 'q-signup',
    topic: '分享会的报名截止与座位安排',
    statement: '报名截止 10 月 18 日 17:00，座位按报名先后安排',
    sourceId: 'NTC-1001',
  }),
  Object.freeze({
    id: 'fact-clubweek-time',
    questionId: 'q-time',
    topic: '咨询周的日期与开放时段',
    statement: '招新咨询周是 10 月 12–18 日，每日 11:30–13:30 与 16:30–18:00',
    sourceId: 'NTC-1002',
  }),
  Object.freeze({
    id: 'fact-clubweek-venue',
    questionId: 'q-venue',
    topic: '咨询台的位置',
    statement: '咨询台设在综合楼一层中庭',
    sourceId: 'NTC-1002',
  }),
  Object.freeze({
    id: 'fact-safety-time',
    questionId: 'q-time',
    topic: '安全培训的时间',
    statement: '实验室安全培训第三期是 10 月 9 日 14:00–16:00',
    sourceId: 'NTC-1003',
  }),
  Object.freeze({
    id: 'fact-safety-quota',
    questionId: 'q-signup',
    topic: '安全培训的名额与前置要求',
    statement: '安全培训共 60 个名额，报名前需完成线上自测',
    sourceId: 'NTC-1003',
  }),
]);

/** 明确研究问题（goal=specific）拆出的四个子问题 */
export const RESEARCH_QUESTIONS = Object.freeze([
  Object.freeze({ id: 'q-time', label: '时间是否冲突', scope: '公告给出的日期与时段' }),
  Object.freeze({ id: 'q-venue', label: '场地是否冲突', scope: '公告给出的地点' }),
  Object.freeze({ id: 'q-signup', label: '报名与容量是否可控', scope: '公告给出的报名方式与名额' }),
  Object.freeze({ id: 'q-gap', label: '资料缺口在哪里', scope: '公告没有覆盖的信息' }),
]);

/** 宽泛任务（goal=broad）只问两个笼统的问题 */
export const BROAD_QUESTIONS = Object.freeze([
  Object.freeze({ id: 'q-overview', label: '活动大致有哪些', scope: '整体印象' }),
  Object.freeze({ id: 'q-feasible', label: '整合是否可行', scope: '初步感觉' }),
]);

const factById = Object.freeze(Object.fromEntries(FACTS.map((f) => [f.id, f])));
const cardById = Object.freeze(Object.fromEntries(BACKGROUND_CARDS.map((c) => [c.id, c])));

function pick(table, id, fallback) {
  return table.some((item) => item.id === id) ? id : fallback;
}

/**
 * 计算「哪些背景卡片真的进入了上下文」。
 * 规则：按与主任务的关联度顺序（BACKGROUND_CARDS 顺序）整张放入，放不下整张舍弃。
 */
export function planCards(config) {
  const budgetId = pick(BUDGETS, config.budget, DEFAULT_CONTEXT_STATE.budget);
  if (pick(BACKGROUND, config.background, 'none') === 'none') {
    return { budgetId, windowTokens: 0, usedTokens: 0, cards: [], dropped: [], note: '未添加背景资料：上下文中没有任何公告内容。' };
  }
  const windowTokens = CARD_BUDGET[budgetId];
  const cards = [];
  const dropped = [];
  let used = 0;
  for (const card of BACKGROUND_CARDS) {
    const tokens = countTokens(card.fragmentId, 'cl100k_base');
    if (used + tokens <= windowTokens) {
      cards.push({ ...card, tokens, included: true, dropReason: null });
      used += tokens;
    } else {
      const reason = `背景预算剩 ${windowTokens - used} token，放不下这张卡片（需要 ${tokens}），整张舍弃`;
      cards.push({ ...card, tokens, included: false, dropReason: reason });
      dropped.push({ id: card.id, sourceId: card.sourceId, tokens, reason });
    }
  }
  return {
    budgetId,
    windowTokens,
    usedTokens: used,
    cards,
    dropped,
    note: dropped.length
      ? `${cards.length} 张卡片中只有 ${cards.filter((c) => c.included).length} 张进入上下文，其余 ${dropped.length} 张整张舍弃。`
      : `${cards.length} 张背景卡片全部进入上下文（${used} / ${windowTokens} token）。`,
  };
}

/** 每条事实在这一轮里的状态：supported / unverified（附原因） */
export function evaluateFacts(config) {
  const plan = planCards(config);
  const includedCardIds = new Set(plan.cards.filter((c) => c.included).map((c) => c.id));
  const cardOfSource = new Map(BACKGROUND_CARDS.map((c) => [c.sourceId, c]));

  return FACTS.map((fact) => {
    const card = cardOfSource.get(fact.sourceId);
    if (!card) return { ...fact, status: 'unsupported-source', reason: '本实验没有登记这条事实的来源' };
    if (!plan.cards.length) {
      return { ...fact, status: 'unverified', reason: '本轮没有添加任何背景资料：没有可核对的来源', cardId: card.id };
    }
    if (!includedCardIds.has(card.id)) {
      return { ...fact, status: 'unverified', reason: `支撑它的卡片 ${card.sourceId} 因预算不足未进入上下文`, cardId: card.id };
    }
    return { ...fact, status: 'supported', reason: `由 ${fact.sourceId} 的摘要支持`, cardId: card.id };
  });
}

function citationOf(fact) {
  return {
    factId: fact.id,
    sourceId: fact.sourceId,
    label: `${fact.sourceId} · 摘要`,
    quote: fact.statement,
  };
}

/**
 * 主函数：配置 → 上下文快照 + 报告 + 事实状态 + 变化原因。
 * 纯函数：相同 config 永远得到深度相等的结果。
 */
export function simulateContext(config = {}) {
  const cfg = Object.freeze({
    goal: pick(GOALS, config.goal, DEFAULT_CONTEXT_STATE.goal),
    format: pick(FORMATS, config.format, DEFAULT_CONTEXT_STATE.format),
    evidence: pick(EVIDENCE, config.evidence, DEFAULT_CONTEXT_STATE.evidence),
    background: pick(BACKGROUND, config.background, DEFAULT_CONTEXT_STATE.background),
    budget: pick(BUDGETS, config.budget, DEFAULT_CONTEXT_STATE.budget),
  });

  const plan = planCards(cfg);
  const facts = evaluateFacts(cfg);
  const supported = facts.filter((f) => f.status === 'supported');
  const unverified = facts.filter((f) => f.status !== 'supported');
  const wantsCitations = cfg.evidence === 'cite';
  const citations = wantsCitations ? supported.map(citationOf) : [];

  /* ---------------- 上下文快照：这一轮到底把什么放了进去 ---------------- */
  const context = {
    instructions: [
      '你是研究助手，只依据本轮上下文作答。',
      cfg.goal === 'specific' ? '研究目标：把「校园活动整合是否可行」拆成时间、场地、报名容量、资料缺口四个可回答的子问题。' : '研究目标：判断整合分散的校园活动公告是否可行。',
      cfg.evidence === 'cite' ? '证据要求：每条事实后标注来源；没有来源时写「未验证」，不得推测。' : '证据要求：（本轮未提出要求）',
      cfg.format === 'outline' ? '输出要求：结构化研究提纲，按子问题分条。' : '输出要求：自由陈述。',
    ],
    cards: plan.cards,
    budget: { windowTokens: plan.windowTokens, usedTokens: plan.usedTokens, note: plan.note },
    dropped: plan.dropped,
    factStatus: facts.map((f) => ({ id: f.id, status: f.status, reason: f.reason, sourceId: f.sourceId })),
  };

  /* ---------------- 报告结构：目标 → 章节；格式 → 呈现 ---------------- */
  const questions = cfg.goal === 'specific' ? RESEARCH_QUESTIONS : BROAD_QUESTIONS;
  const blocks = [];

  for (const question of questions) {
    // 「资料缺口」在明确目标下由专门的收尾小节生成，循环里跳过，避免重复一节
    if (cfg.goal === 'specific' && question.id === 'q-gap') continue;
    const relatedFacts = cfg.goal === 'specific' ? facts.filter((f) => f.questionId === question.id) : [];
    const lines = [];

    if (cfg.goal === 'broad') {
      if (question.id === 'q-overview') {
        lines.push(
          plan.cards.length
            ? `上下文里有 ${plan.cards.length} 条校园公告，内容涉及分享会、社团咨询与安全培训。`
            : '没有取得任何公告资料，无法说明具体有哪些活动。'
        );
      } else {
        lines.push(
          plan.cards.length
            ? '从现有公告看，整合分散活动信息似乎可行，但还缺少场地容量与合并宣传规则。'
            : '在没有资料的情况下，只能给出一个笼统判断：是否可行无法确认。'
        );
      }
      blocks.push({ id: question.id, heading: question.label, kind: cfg.format, lines, status: plan.cards.length ? 'partial' : 'unverified' });
      continue;
    }

    /* ---- 明确研究问题：每个子问题严格由事实状态决定 ---- */
    if (!relatedFacts.length) {
      lines.push('这类信息不在任何公告里：属于资料缺口，需要向主办方确认。');
      blocks.push({ id: question.id, heading: question.label, kind: cfg.format, lines, status: 'gap' });
      continue;
    }

    for (const fact of relatedFacts) {
      if (fact.status === 'supported') {
        lines.push(wantsCitations ? `${fact.statement}（来源：${fact.sourceId} · 摘要）` : fact.statement);
      } else if (wantsCitations) {
        // 关键：没有来源时**不重复具体数值**，只说明「哪一项未验证、为什么」
        // ——否则报告会顺手把没有依据的日期/地点写出来，等于制造事实。
        lines.push(`未验证 · ${fact.topic}：${fact.reason}。本轮不给具体数值，也不作推测。`);
      } else {
        lines.push(`未验证 · ${fact.topic}：没有可核对的来源（${fact.reason}）。`);
      }
    }
    const status = relatedFacts.every((f) => f.status === 'supported') ? 'supported' : 'partial';
    blocks.push({ id: question.id, heading: question.label, kind: cfg.format, lines, status });
  }

  if (cfg.goal === 'specific') {
    const gapLines = [];
    gapLines.push('公告没有给出场地容量上限，也没有说明不同活动之间能否合并宣传。');
    if (unverified.length) gapLines.push(`本轮有 ${unverified.length} 条事实处于「未验证」状态：${unverified.map((f) => f.topic).join('、')}。`);
    if (plan.dropped.length) gapLines.push(`另有 ${plan.dropped.length} 张背景卡片因预算未进入上下文，可能包含相关线索。`);
    blocks.push({ id: 'q-gap', heading: '资料缺口清单', kind: cfg.format, lines: gapLines, status: 'gap' });
  }

  /* ---------------- 报告的元信息与免责说明 ---------------- */
  const report = {
    title: cfg.goal === 'specific' ? '校园活动整合可行性 · 结构化研究提纲' : '关于整合校园活动公告的初步回答',
    goal: cfg.goal,
    format: cfg.format,
    evidence: cfg.evidence,
    blocks,
    citations,
    citationStatus: wantsCitations
      ? citations.length
        ? `已标注 ${citations.length} 条引用；其余事实写作「未验证」。`
        : '已要求标注来源，但本轮上下文里没有可引用的资料：报告不生成任何引文。'
      : '本轮未要求标注来源：报告中的事实性内容都没有引用，不能当作研究证据。',
    simulated: true,
    footer: '本报告由本地确定性规则生成，不是模型推理，也不代表任何真实研究结论。',
  };

  /* ---------------- 变化原因：把「为什么不一样」写出来 ---------------- */
  const reasons = [];
  reasons.push(
    cfg.goal === 'specific'
      ? '研究目标改成明确问题：报告从「两段泛泛而谈」变成四个子问题，每个子问题都能落到具体事实。'
      : '研究目标保持宽泛：报告只有整体印象，无法指出哪一项冲突、哪一项缺口。'
  );
  reasons.push(
    cfg.format === 'outline'
      ? '输出方式为结构化提纲：内容按子问题分条，缺口单独成一节。'
      : '输出方式为自由陈述：内容写成连续段落，结构需要读者自己找。'
  );
  reasons.push(
    wantsCitations
      ? `证据要求为「标注来源」：${citations.length} 条事实带上了出处；没有出处的写「未验证」，不生成虚构引文。`
      : '证据要求为「无要求」：即使手上有资料，报告也不标注出处，读者无法回溯。'
  );
  reasons.push(
    cfg.background === 'cards'
      ? `添加了背景卡片：其中 ${plan.cards.filter((c) => c.included).length} 张进入上下文，支撑了 ${supported.length} 条事实。`
      : '没有添加背景资料：所有关于日期、地点与名额的说法都只能是「未验证」。'
  );
  if (plan.dropped.length) {
    reasons.push(`上下文预算为「${BUDGETS.find((b) => b.id === cfg.budget).label}」：${plan.dropped.length} 张卡片被整张舍弃，它们支撑的事实回到「未验证」。`);
  }

  return {
    config: cfg,
    context,
    report,
    facts,
    supported,
    unverified,
    citations,
    dropped: plan.dropped,
    reasons,
    /** 可观察的量化指标：界面与测试都读这几个数 */
    metrics: {
      blocks: blocks.length,
      supportedFacts: supported.length,
      unverifiedFacts: unverified.length,
      citations: citations.length,
      cardsIncluded: plan.cards.filter((c) => c.included).length,
      cardsDropped: plan.dropped.length,
      contextTokens: plan.usedTokens,
    },
  };
}

/**
 * 两次配置的轻量前后对照（**不是** M2 的完整 A/B Agent 实验室）：
 * 只比较「改了哪一维」以及「结果里哪几个指标随之变化」。
 */
export function diffRuns(previous, next) {
  if (!previous || !next) return null;
  const changed = DIMENSION_ORDER.filter((key) => previous.config[key] !== next.config[key]).map((key) => ({
    key,
    label: { goal: '研究目标', format: '输出方式', evidence: '证据要求', background: '背景资料', budget: '上下文预算' }[key],
    from: (DIMENSIONS[key].find((d) => d.id === previous.config[key]) || {}).label,
    to: (DIMENSIONS[key].find((d) => d.id === next.config[key]) || {}).label,
  }));
  const metrics = ['blocks', 'supportedFacts', 'citations', 'cardsIncluded', 'contextTokens'];
  const deltas = metrics
    .filter((key) => previous.metrics[key] !== next.metrics[key])
    .map((key) => ({ key, label: METRIC_LABELS[key], from: previous.metrics[key], to: next.metrics[key] }));
  return { changed, deltas };
}

export const METRIC_LABELS = Object.freeze({
  blocks: '报告段落数',
  supportedFacts: '有来源支撑的事实',
  unverifiedFacts: '未验证事实',
  citations: '引用条数',
  cardsIncluded: '进入上下文的卡片',
  cardsDropped: '被舍弃的卡片',
  contextTokens: '资料占用 token',
});

export { factById, cardById };

