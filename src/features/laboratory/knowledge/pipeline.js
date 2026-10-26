/**
 * src/features/laboratory/knowledge/pipeline.js
 * ------------------------------------------------------------------
 * Lab 04 的编排层（M1.3 D04 / §5）：把切分 → 检索 → 相关性检查 → 上下文
 * → 模拟回答 → Skills 检查 → Memory 对照串成一次**确定性**运行。
 *
 * 全部为纯函数：
 *   · 不读时间、不用随机数、不发请求；
 *   · 同一组配置永远得到同一份结果（测试据此断言可复现）；
 *   · 「资料不足」是算出来的：取不到可引用片段、或片段不含问题锚点，
 *     就明确写出来，绝不从隐藏数据里拿结论冒充检索结果。
 * ------------------------------------------------------------------
 */
import { getLabQuestion, LAB_QUESTIONS, docsInScope, scopeById } from './corpus.js';
import { DEFAULT_CHUNK_CONFIG, chunkDocuments, chunkPreset } from './chunking.js';
import { DEFAULT_TOP_K, retrievalMode, retrieve } from './retrieval.js';
import { methodPlan, runChecks, SKILL_CARDS } from './skills.js';

/** 上下文演示预算（字符）：刻意设小，让「选中的片段装不下」这件事可见 */
export const CONTEXT_CHAR_BUDGET = 360;

export const DEFAULT_LAB_CONFIG = Object.freeze({
  preset: DEFAULT_CHUNK_CONFIG.preset,
  size: DEFAULT_CHUNK_CONFIG.size,
  scopeId: 'all_notices',
  questionId: LAB_QUESTIONS[0].id,
  mode: 'keyword',
  topK: DEFAULT_TOP_K,
  skillEnabled: false,
  memoryEnabled: true,
});

const DATE_PATTERN = /(\d{1,2})\s*月\s*(\d{1,2})\s*日/g;

/** 从片段文本里抽取日期（只做字面抽取，不理解语义） */
export function extractDates(text) {
  const out = [];
  const source = String(text || '');
  DATE_PATTERN.lastIndex = 0;
  let match = DATE_PATTERN.exec(source);
  while (match) {
    out.push({ raw: `${match[1]} 月 ${match[2]} 日`, month: Number(match[1]), day: Number(match[2]), index: match.index });
    match = DATE_PATTERN.exec(source);
  }
  return out;
}

/** 取包含锚点的句子（用于「原文摘录」型回答，不做语义理解） */
function sentenceWith(text, anchor) {
  if (!anchor) return null;
  const sentences = String(text || '')
    .split(/(?<=[。！？；])/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.find((s) => s.includes(anchor)) || null;
}

/** 日期句的判定线索：句子要同时含问题锚点与这些线索词，才被当作「事件日期句」 */
const DATE_CUES = Object.freeze(['定于', '举行', '举办', '调整至', '截止', '开始']);

/**
 * 抽取某片段里「与问题相关的事件日期」：
 * 只在**同时包含问题锚点与线索词**的句子里取第一个日期。
 * 这条规则会漏（例如「上午九点开始」不含数字日期），但不会凭空造日期；
 * 规则原文会显示在 UI 上，便于读者判断它为什么可能漏。
 */
function eventDateIn(text, anchorTerm) {
  const sentences = String(text || '')
    .split(/(?<=[。！？；])/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const sentence of sentences) {
    if (!sentence.includes(anchorTerm)) continue;
    if (!DATE_CUES.some((cue) => sentence.includes(cue))) continue;
    const dates = extractDates(sentence);
    if (dates.length) return { value: dates[0].raw, sentence };
  }
  return null;
}

/* ==================================================================== *
 * 主运行
 * ==================================================================== */

/**
 * @param {object} config 见 DEFAULT_LAB_CONFIG
 * @returns {object} 一次完整、可复现的实验结果
 */
export function runKnowledgeLab(config = {}) {
  const cfg = { ...DEFAULT_LAB_CONFIG, ...config };
  const question = getLabQuestion(cfg.questionId);
  const scope = scopeById(cfg.scopeId);
  const scopeDocs = docsInScope(scope.id);

  /* ---------- 1. 切分 ---------- */
  const chunking = chunkDocuments({ preset: cfg.preset, size: cfg.size, scopeDocs });

  /* ---------- 2. 检索 ---------- */
  const retrieval = retrieve({
    chunks: chunking.chunks,
    questionId: question.id,
    mode: cfg.mode,
    topK: cfg.topK,
  });

  /* ---------- 3. 相关性检查：片段必须含问题锚点才允许进入上下文 ---------- */
  const byChunkId = new Map(chunking.chunks.map((chunk) => [chunk.chunkId, chunk]));
  const relevance = [];
  for (const candidate of retrieval.candidates) {
    const chunk = byChunkId.get(candidate.chunkId);
    const hitAnchor = chunk ? question.anchors.find((anchor) => chunk.text.includes(anchor)) || null : null;
    relevance.push({
      chunkId: candidate.chunkId,
      docId: candidate.docId,
      relevant: Boolean(hitAnchor),
      anchor: hitAnchor,
      reason: hitAnchor
        ? `片段包含问题锚点「${hitAnchor}」`
        : `片段不含任何问题锚点（${question.anchors.join('、')}）：相似/字面命中不等于能回答`,
    });
  }

  /* ---------- 4. 上下文装配（字符预算） ---------- */
  const segments = [];
  const dropped = [];
  let usedChars = 0;
  for (const candidate of retrieval.candidates) {
    const verdict = relevance.find((r) => r.chunkId === candidate.chunkId);
    const chunk = byChunkId.get(candidate.chunkId);
    if (!chunk) continue;
    if (!verdict || !verdict.relevant) {
      dropped.push({ chunkId: chunk.chunkId, docId: chunk.docId, chars: chunk.chars, reason: '未通过锚点相关性检查' });
      continue;
    }
    if (usedChars + chunk.chars > CONTEXT_CHAR_BUDGET) {
      dropped.push({
        chunkId: chunk.chunkId,
        docId: chunk.docId,
        chars: chunk.chars,
        reason: `剩余预算 ${CONTEXT_CHAR_BUDGET - usedChars} 字符，放不下 ${chunk.chars} 字符的片段`,
      });
      continue;
    }
    usedChars += chunk.chars;
    segments.push({
      chunkId: chunk.chunkId,
      docId: chunk.docId,
      title: chunk.title,
      locator: chunk.locator,
      chars: chunk.chars,
      text: chunk.text,
      supersedes: chunk.supersedes,
      validity: chunk.validity,
      publisher: chunk.publisher,
    });
  }

  /* ---------- 5. Skills 检查（只改变方法，不改变权限） ---------- */
  const plan = methodPlan({ skillEnabled: cfg.skillEnabled });
  const checks = runChecks({ skillEnabled: cfg.skillEnabled, selected: segments });

  /* ---------- 6. 模拟回答 ---------- */
  const answer = buildAnswer({ question, retrieval, relevance, segments, dropped, checks, cfg });

  /* ---------- 7. Memory 三栏对照 ---------- */
  const memoryView = {
    context: segments.map((s) => ({ chunkId: s.chunkId, docId: s.docId, chars: s.chars })),
    retrieved: retrieval.candidates.map((c) => ({ docId: c.docId, chunkId: c.chunkId, score: c.score })),
    /** 记忆条目由 UI 从独立 store 读取后回填；这里只说明「不会自动写入」 */
    persisted: null,
    note:
      '三件事必须分开看：当前任务上下文（这一轮真正进了上下文的内容）、检索结果（按查询取回的候选）、本地记忆（用户显式保存的偏好/摘要）。本实验**不会**把检索结果自动写进记忆。',
  };

  /* ---------- 8. 解释 ---------- */
  const relevantCount = relevance.filter((r) => r.relevant).length;
  const reasons = [
    `切分：${chunkPreset(cfg.preset).cn}${cfg.preset === 'paragraph' ? '' : `（每 ${cfg.size} 字符）`} → ${chunking.stats.chunkCount} 个片段，平均 ${chunking.stats.avgChars} 字符，跨段 ${chunking.stats.crossBoundary} 个。`,
    `检索范围：「${scope.cn}」共 ${scopeDocs.length} 份文档；模式：${retrievalMode(cfg.mode).cn}${retrieval.available ? '' : '（不可用）'}。`,
    retrieval.available
      ? `候选：前 ${cfg.topK} 个片段里有 ${relevantCount} 个通过锚点相关性检查，${segments.length} 个装进上下文预算（${CONTEXT_CHAR_BUDGET} 字符），${dropped.length} 个被舍弃。`
      : `候选：0 个——${retrieval.note}`,
    cfg.skillEnabled
      ? `Skill「${SKILL_CARDS[0].cn}」已启用：方法多出 ${plan.added.length} 项检查，流程变长、结论更保守；工具与权限集合保持不变。`
      : 'Skill 未启用：流程为「检索 → 选片段 → 作答」三步，不做额外核验。',
  ];

  return {
    config: cfg,
    question,
    scope: { id: scope.id, cn: scope.cn, docs: scopeDocs.length },
    chunking: { config: chunking.config, stats: chunking.stats, chunks: chunking.chunks },
    retrieval,
    relevance,
    context: { budgetChars: CONTEXT_CHAR_BUDGET, usedChars, segments, dropped },
    plan,
    checks,
    answer,
    memoryView,
    reasons,
  };
}

/* ==================================================================== *
 * 模拟回答（规则驱动，不是模型生成）
 * ==================================================================== */

function baseAnswer(question) {
  return {
    label: 'SIMULATED · 本地规则生成的模拟结论',
    question: question.text,
    citations: [],
    lines: [],
    status: 'insufficient',
    statusCn: '资料不足 / 未验证',
    evidenceNote: question.note,
    footnote: '',
  };
}

function buildAnswer({ question, retrieval, relevance, segments, dropped, checks, cfg }) {
  const base = baseAnswer(question);

  if (!retrieval.available) {
    return {
      ...base,
      lines: [`向量通道不可用：${retrieval.note}`, '本次没有产生任何结论，也没有生成引用。'],
      footnote: '无证据时不编造来源：这是 RAG 的底线，而不是「模型今天心情不好」。',
    };
  }

  if (!retrieval.candidates.length) {
    return {
      ...base,
      lines: ['检索没有任何命中：本地语料里没有与问题相关的片段。', '因此结论只能是「资料不足」，不生成引用，也不从其它文档凑答案。'],
      footnote: '检索为空是最干净的一种「没查到」：不需要也不允许编造。',
    };
  }

  if (!relevance.some((r) => r.relevant)) {
    return {
      ...base,
      lines: [
        `检索确实命中了 ${retrieval.candidates.length} 个片段，但没有一个包含问题锚点（${question.anchors.join('、')}）。`,
        '说明「字面/距离相似」不等于「能回答问题」——这些片段被锚点检查拦在上下文之外。',
        '结论仍为「资料不足」，不生成引用。',
      ],
      footnote: '这一步是刻意加在检索与作答之间的规则：它把「命中」与「相关」拆开给你看。',
    };
  }

  if (!segments.length) {
    return {
      ...base,
      lines: [
        '通过了锚点检查，但片段总长超出本次上下文预算（' + CONTEXT_CHAR_BUDGET + ' 字符），上下文里没有可用证据。',
        '因此结论只能是「资料不足」，不生成引用。',
      ],
      footnote: dropped.length ? `被舍弃的片段：${dropped.map((d) => d.docId).join('、')}。` : '没有候选片段。',
    };
  }

  return question.factKind === 'date'
    ? answerDate({ base, question, segments, checks, cfg })
    : answerQuote({ base, question, segments, checks });
}

/** 日期型问题：按文档抽「事件日期」，不同文档取值不一致才叫冲突 */
function answerDate({ base, question, segments, checks, cfg }) {
  const perDoc = new Map();
  for (const segment of segments) {
    if (!perDoc.has(segment.docId)) perDoc.set(segment.docId, { title: segment.title, value: null, chunks: [] });
    const bag = perDoc.get(segment.docId);
    bag.chunks.push({ chunkId: segment.chunkId, locator: segment.locator });
    if (bag.value) continue;
    const hit = eventDateIn(segment.text, question.anchorTerm);
    if (hit) bag.value = hit.value;
  }
  const docsWithDates = [...perDoc.entries()].filter(([, bag]) => bag.value);

  if (!docsWithDates.length) {
    return {
      ...base,
      lines: [
        `上下文里有 ${segments.length} 个片段（${[...perDoc.keys()].join('、')}），但没有一句同时包含「${question.anchorTerm}」与事件线索词（${DATE_CUES.join(' / ')}）。`,
        '抽取规则取不到事件日期 → 资料不足，不生成引用。',
      ],
      footnote: '抽取规则只有「锚点 + 线索词 + 正则」三条，取不到就是取不到，不会「推测一个合理日期」。',
    };
  }

  const allDates = [...new Set(docsWithDates.map(([, bag]) => bag.value))];
  const citations = docsWithDates.map(([docId, bag]) => ({
    docId,
    chunkId: bag.chunks[0].chunkId,
    locator: bag.chunks.map((c) => c.locator).join(' / '),
    value: bag.value,
    title: bag.title,
  }));

  /* ---------- 多个取值：同一事项的日期冲突 ---------- */
  if (allDates.length > 1) {
    const lines = [
      `进入上下文的片段里，不同公告给出了不同的事件日期：${allDates.join(' / ')}。`,
      ...citations.map((c) => `${c.docId}「${c.title}」：${c.value}`),
    ];

    /* Skill 启用 + 更正检查通过 → 允许按更正关系采信 */
    const revisionCheck = checks.checks.find((c) => c.id === 'revision');
    const revisionDocs = segments.filter((s) => Array.isArray(s.supersedes) && s.supersedes.length > 0);
    if (cfg.skillEnabled && revisionCheck?.status === 'pass' && revisionDocs.length) {
      const revisedIds = new Set(revisionDocs.map((s) => s.docId));
      const superseded = new Set(revisionDocs.flatMap((s) => s.supersedes));
      const effective = docsWithDates.filter(([docId]) => revisedIds.has(docId));
      const effectiveDates = [...new Set(effective.map(([, bag]) => bag.value))];
      const contradicted = docsWithDates.filter(([docId]) => superseded.has(docId));
      if (effectiveDates.length === 1 && contradicted.length) {
        return {
          ...base,
          status: 'resolved',
          statusCn: '按更正关系采信',
          citations,
          lines: [
            ...lines,
            `${[...revisedIds].join('、')} 是明确更正公告：正文写明「予以更正」，且 supersedes 指向 ${[...superseded].join('、')}。`,
            `因此采信更正后的日期：${effectiveDates[0]}；被更正的旧日期（${contradicted.map(([, bag]) => bag.value).join('、')}）不再作为结论依据。`,
            '注意：这条判定来自 Skill 的检查步骤，而不是检索本身——关掉 Skill 再跑一次，结论会回到「未决」。',
          ],
          footnote: '更正关系必须同时可见：来源 ID + supersedes 元数据 + 正文「予以更正」说明，三者缺一就不能宣称更正成立。',
        };
      }
    }

    lines.push(
      cfg.skillEnabled
        ? '同一事项的日期不一致，且本次上下文不足以确认更正关系，因此结论标为未决。'
        : '同一事项的日期不一致，而当前方法没有「核对更正关系」这一步，因此结论标为未决，而不是挑一个看起来最合理的。'
    );
    if (!cfg.skillEnabled) lines.push('提示：启用「公告核验方法」Skill 后再跑同一问题，可以看到方法如何改变结论。');
    return {
      ...base,
      status: 'unresolved',
      statusCn: '证据冲突 · 未决',
      citations,
      lines,
      footnote: '冲突不会被检索自动消解：要么找到更正关系，要么标明未决。',
    };
  }

  /* ---------- 单一取值：直接支撑 ---------- */
  const failed = checks.checks.filter((c) => c.status === 'fail');
  return {
    ...base,
    status: failed.length ? 'unverified' : 'supported',
    statusCn: failed.length ? '需谨慎 · 核验未通过' : '有片段支撑',
    citations,
    lines: [
      `与「${question.anchorTerm}」相关的**事件日期**在上下文中只有一个取值：${allDates[0]}。`,
      ...citations.map((c) => `来源：${c.docId}「${c.title}」${c.locator}。`),
      ...(failed.length
        ? [`但「${SKILL_CARDS[0].cn}」检查未全部通过：${failed.map((c) => `${c.cn}（${c.reason}）`).join('；')}，因此只作线索。`]
        : ['核验检查全部通过（发布主体、有效性、是否涉及未确认的更正关系）。']),
    ],
    footnote: '引用只指向本次进入上下文的片段，可回到原文逐字核对。',
  };
}

/** 摘录型问题：只摘包含锚点的原文句子，明确写「未做语义归纳」 */
function answerQuote({ base, question, segments, checks }) {
  const quotes = [];
  for (const segment of segments) {
    const sentence = sentenceWith(segment.text, question.quoteAnchor || question.anchors[0]);
    if (!sentence) continue;
    if (quotes.some((q) => q.value === sentence)) continue;
    quotes.push({ docId: segment.docId, chunkId: segment.chunkId, locator: segment.locator, value: sentence, title: segment.title });
  }
  if (!quotes.length) {
    return {
      ...base,
      lines: [
        `上下文里有 ${segments.length} 个片段，但没有包含「${question.quoteAnchor || question.anchors[0]}」的完整句子。`,
        '片段可能是被切分截断的，也可能只是话题接近。结论：资料不足。',
      ],
      footnote: '切分把句子切断时，检索能命中片段、却取不到可用句子——这正是切分粒度影响结果的直接体现。',
    };
  }
  const failed = checks.checks.filter((c) => c.status === 'fail');
  return {
    ...base,
    status: failed.length ? 'unverified' : 'supported',
    statusCn: failed.length ? '需谨慎 · 核验未通过' : '原文摘录（未做语义归纳）',
    citations: quotes.slice(0, 3),
    lines: [
      '本条回答只做**原文摘录**，没有做语义归纳或推理：',
      ...quotes.slice(0, 3).map((q) => `${q.docId}「${q.title}」${q.locator}：${q.value}`),
      failed.length ? `核验检查未全部通过：${failed.map((c) => c.cn).join('、')}。` : '核验检查全部通过。',
    ],
    footnote: '摘录不等于结论：真正的归纳需要理解上下文，而这里只演示「证据从哪来」。',
  };
}

/**
 * 两次运行的差异（UI 用来解释「改了什么 → 结果怎么变」）。
 * 只比较对结果有影响的字段，输出稳定顺序。
 */
export function diffRuns(previous, next) {
  if (!previous || !next) return null;
  const dims = [
    { key: 'preset', label: '切分方式' },
    { key: 'size', label: '片段长度' },
    { key: 'scopeId', label: '检索范围' },
    { key: 'questionId', label: '研究问题' },
    { key: 'mode', label: '检索模式' },
    { key: 'topK', label: '候选上限' },
    { key: 'skillEnabled', label: 'Skill' },
  ];
  const changed = [];
  for (const dim of dims) {
    const before = previous.config[dim.key];
    const after = next.config[dim.key];
    if (before === after) continue;
    changed.push({ key: dim.key, label: dim.label, from: String(before), to: String(after) });
  }
  const metric = (run) => ({
    chunks: run.chunking.stats.chunkCount,
    candidates: run.retrieval.candidates.length,
    relevant: run.relevance.filter((r) => r.relevant).length,
    inContext: run.context.segments.length,
    citations: run.answer.citations.length,
    dropped: run.context.dropped.length,
  });
  const before = metric(previous);
  const after = metric(next);
  const deltas = Object.keys(before).map((key) => ({
    key,
    label: {
      chunks: '片段数',
      candidates: '候选片段',
      relevant: '通过锚点检查',
      inContext: '进入上下文',
      citations: '引用条数',
      dropped: '被舍弃',
    }[key],
    from: before[key],
    to: after[key],
  }));
  return { changed, deltas, statusFrom: previous.answer.status, statusTo: next.answer.status };
}
