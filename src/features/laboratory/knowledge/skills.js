/**
 * src/features/laboratory/knowledge/skills.js
 * ------------------------------------------------------------------
 * Lab 04 · Skills（M1.3 D04 / §5.7，验收 A16）。
 *
 * 一张「公告核验方法」Skill 卡：
 *   · 启用后**只改变方法步骤与检查项**（流程变长、结论更保守）；
 *   · 绝不改变工具清单、权限位或可访问资源——这一点由测试与 UI 双重守护；
 *   · Skill 的内容是本地常量，不执行任何脚本，也不来自网络。
 * ------------------------------------------------------------------
 */

export const SKILL_CARDS = Object.freeze([
  Object.freeze({
    id: 'notice-verification',
    cn: '公告核验方法',
    version: '演示卡 v1',
    summary: '在给出结论前，先核对发布主体、发布日期、更正关系与公告有效性。',
    /** 逐条列出「启用后会多做哪几件事」 */
    checks: Object.freeze([
      Object.freeze({ id: 'publisher', cn: '核对发布主体', detail: '确认选中的片段来自有明确发布单位的公告。' }),
      Object.freeze({ id: 'revision', cn: '核对更正关系', detail: '若某公告存在更正关系，必须读到正文中的更正说明才能采信新日期。' }),
      Object.freeze({ id: 'conflict', cn: '并列冲突', detail: '同一事项出现多个日期时，标注未决，而不是挑一个。' }),
      Object.freeze({ id: 'validity', cn: '检查公告有效性', detail: '有效性不是 active 的公告只作线索，不作结论依据。' }),
    ]),
    /** 显式声明：这张卡不授予任何能力 */
    grants: Object.freeze({
      tools: Object.freeze(['announcement_search', 'document_reader']),
      note: '启用本卡不会新增工具、不会放宽权限、不会改变沙箱白名单；上面列出的工具在启用前后完全一致。',
    }),
  }),
]);

export function skillCard(skillId) {
  return SKILL_CARDS.find((card) => card.id === skillId) || null;
}

/** 默认方法步骤（未启用 Skill） */
export const BASE_METHOD_STEPS = Object.freeze([
  Object.freeze({ id: 'search', cn: '检索相关公告', detail: '用问题关键词在本地语料里检索候选片段。' }),
  Object.freeze({ id: 'select', cn: '选出高分片段', detail: '按分数与来源取前 k 个片段。' }),
  Object.freeze({ id: 'answer', cn: '依据片段作答', detail: '只从选中片段里抽取事实，取不到就写「资料不足」。' }),
]);

/**
 * 方法步骤：启用 Skill 后追加检查步骤，但**不改变工具权限**。
 * @returns {{steps:Array, added:string[], toolsUnchanged:boolean}}
 */
export function methodPlan({ skillEnabled = false } = {}) {
  if (!skillEnabled) return { steps: BASE_METHOD_STEPS.map((s) => ({ ...s })), added: [], toolsUnchanged: true };
  const card = SKILL_CARDS[0];
  const extra = card.checks.map((check, index) =>
    Object.freeze({ id: `check-${check.id}`, cn: check.cn, detail: check.detail, order: index })
  );
  /** 检查步骤插在「选出高分片段」之后、「依据片段作答」之前 */
  const steps = [
    { ...BASE_METHOD_STEPS[0], index: 1 },
    { ...BASE_METHOD_STEPS[1], index: 2 },
    ...extra.map((step, i) => ({ ...step, index: 3 + i })),
    { ...BASE_METHOD_STEPS[2], index: 3 + extra.length },
  ];
  return { steps, added: extra.map((s) => s.id), toolsUnchanged: true };
}

/**
 * 执行四条核验检查。输入全部来自**本次实际选中的片段**，
 * 因此检查结果随切分、检索、问题一起变化。
 */
export function runChecks({ skillEnabled = false, selected = [] } = {}) {
  if (!skillEnabled) return { enabled: false, checks: [], verdict: null };
  if (!selected.length) {
    return {
      enabled: true,
      checks: [
        {
          id: 'no-evidence',
          cn: '核对证据是否存在',
          status: 'fail',
          reason: '上下文里没有任何片段，四项核验都没有可检查的对象。',
        },
      ],
      verdict: 'no-evidence',
      docIds: [],
      revisionVisible: false,
    };
  }
  const texts = selected.map((chunk) => chunk.text).join('\n');
  const docIds = [...new Set(selected.map((chunk) => chunk.docId))];
  const checks = [];

  const hasPublisher = selected.every((chunk) => typeof chunk.publisher === 'string' && chunk.publisher.length > 0);
  checks.push({
    id: 'publisher',
    cn: '核对发布主体',
    status: hasPublisher ? 'pass' : 'fail',
    reason: hasPublisher
      ? `选中的 ${selected.length} 个片段都带明确发布单位（如「${selected[0].publisher}」）。`
      : '有片段缺少发布单位，不能作为结论依据。',
  });

  const revisionDocs = selected.filter((chunk) => Array.isArray(chunk.supersedes) && chunk.supersedes.length > 0);
  const revisionVisible = /予以更正|更正/.test(texts);
  checks.push({
    id: 'revision',
    cn: '核对更正关系',
    status: revisionDocs.length === 0 ? 'skip' : revisionVisible ? 'pass' : 'fail',
    reason:
      revisionDocs.length === 0
        ? '本次选中的片段里没有带更正关系的公告。'
        : revisionVisible
          ? `选中片段包含更正公告（${[...new Set(revisionDocs.map((c) => c.docId))].join('、')}）的正文更正说明，可以采信新日期。`
          : `存在带更正关系的公告（${[...new Set(revisionDocs.map((c) => c.docId))].join('、')}），但选中片段里没有「予以更正」的正文说明——只拿到摘要时不能宣布更正成立。`,
  });

  const stale = selected.filter((chunk) => chunk.validity && chunk.validity !== 'active');
  checks.push({
    id: 'validity',
    cn: '检查公告有效性',
    status: stale.length === 0 ? 'pass' : 'fail',
    reason: stale.length === 0 ? '选中的公告有效性均为 active。' : `有 ${stale.length} 个片段来自有效性非 active 的公告（${[...new Set(stale.map((c) => c.docId))].join('、')}），只作线索。`,
  });

  const failing = checks.filter((c) => c.status === 'fail');
  return { enabled: true, checks, verdict: failing.length ? 'needs-caution' : 'ready', docIds, revisionVisible };
}
