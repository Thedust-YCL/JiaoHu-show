/**
 * src/simulation/rules/evidence/index.js
 * ------------------------------------------------------------------
 * 证据评估器入口：**纯逻辑**，输入是本次 Run 真正拿到的工具响应，
 * 输出是可检查的声明 / 冲突 / 核验结论 / 指标 / 局限。
 *
 * 它不读 DOM、不读 3D 状态、不读当前配置，也不读研究包里的正文 ——
 * 正文只能来自本次 `document_reader` 的返回（见 claims.js 的纪律）。
 * ------------------------------------------------------------------
 */
import { claimValue, extractVisibleClaims, PREDICATES } from './claims.js';
import { groupConflicts } from './conflicts.js';
import { evaluateConflict, MISSING_CODES, REVISION_STATUS } from './revision.js';

export { PREDICATES, PREDICATE_LABEL, extractVisibleClaims } from './claims.js';
export { groupConflicts } from './conflicts.js';
export { evaluateConflict, REVISION_STATUS, REVISION_RULE_IDS, MISSING_CODES } from './revision.js';

/** 核验必要条件的固定清单：UI 用它逐条说明「过 / 未过」 */
export const REQUIREMENT_DEFS = Object.freeze([
  { code: 'VISIBLE_BOTH', cn: '两份相互影响的公告都在本次可见证据集中', en: 'visibility' },
  { code: 'SAME_SUBJECT', cn: '同一事项、同一字段出现不同取值', en: 'same_subject' },
  { code: 'SUPERSESSION_RELATION', cn: '存在可核实的 supersedes 更正关系', en: 'supersession' },
  { code: 'BODY_EXPLICIT', cn: '正文明确说明更正并指向被更正的公告', en: 'body' },
  { code: 'METADATA', cn: '发布主体与发布时间由模拟工具返回', en: 'metadata' },
  { code: 'AUTHORITY', cn: '更正方与被更正方为同一授权机构', en: 'authority' },
  { code: 'TIME_ORDER', cn: '更正公告发布时间晚于被更正公告', en: 'time_order' },
  { code: 'POLICY_VERIFY', cn: '本次运行策略为 VERIFY_REVISIONS', en: 'policy' },
]);

const FAIL_MAP = Object.freeze({
  [MISSING_CODES.POLICY]: ['POLICY_VERIFY'],
  [MISSING_CODES.PUBLISHED_AT]: ['METADATA'],
  [MISSING_CODES.PUBLISHER]: ['METADATA'],
  [MISSING_CODES.SUPERSEDES]: ['SUPERSESSION_RELATION'],
  [MISSING_CODES.SUPERSEDES_TARGET]: ['SUPERSESSION_RELATION'],
  [MISSING_CODES.TARGET]: ['SUPERSESSION_RELATION', 'BODY_EXPLICIT'],
  [MISSING_CODES.BODY]: ['BODY_EXPLICIT'],
  [MISSING_CODES.EXPLICIT]: ['BODY_EXPLICIT'],
  [MISSING_CODES.AUTHORITY]: ['AUTHORITY'],
  [MISSING_CODES.ORDER]: ['TIME_ORDER'],
  [MISSING_CODES.INVALID]: ['SUPERSESSION_RELATION'],
  [MISSING_CODES.VISIBILITY]: ['VISIBLE_BOTH'],
});

/** 把判定结果翻译成「必要条件逐条通过 / 未通过」表 */
function requirementTable(resolution) {
  const failed = new Set();
  for (const item of resolution.missing || []) for (const code of FAIL_MAP[item.code] || []) failed.add(code);
  return REQUIREMENT_DEFS.map((def) => ({
    ...def,
    pass: !failed.has(def.code),
    reason: failed.has(def.code) ? (resolution.missing.find((m) => (FAIL_MAP[m.code] || []).includes(def.code))?.message || '') : '',
  }));
}

/**
 * 评估一次运行的证据。
 *
 * @param {object} params
 * @param {Array}  params.reads   本次读取结果（含真实返回的片段与元数据）
 * @param {object} params.search  本次检索结果摘要 `{ returned, items }`
 * @param {string} params.policy  'VERIFY_REVISIONS' | 'COLLECT_ONLY'
 * @param {object} params.mission 研究包（只用于取预设抽取映射与资料标题）
 * @returns {object} 证据结果
 */
export function evaluateEvidence({ reads = [], search = null, policy = 'VERIFY_REVISIONS', mission } = {}) {
  const notices = mission?.notices || [];
  const corpus = new Map(notices.map((n) => [n.sourceId, n]));
  const titleBySource = new Map(notices.map((n) => [n.sourceId, n.title]));
  const validityBySource = new Map(notices.map((n) => [n.sourceId, n.validity || 'active']));
  const visibleSourceIds = new Set(reads.map((r) => r.sourceId));

  const claims = extractVisibleClaims({ reads, corpus });
  const conflicts = groupConflicts(claims);

  const resolutions = conflicts.map((conflict) => {
    const resolution = evaluateConflict(conflict, { policy, claims, validityBySource, titleBySource, visibleSourceIds });
    return { ...resolution, requirements: requirementTable(resolution), failedRequirements: requirementTable(resolution).filter((r) => !r.pass) };
  });

  const fullTextReads = reads.filter((r) => r.textScope === 'full_text').length;
  const summaryReads = reads.filter((r) => r.textScope === 'summary').length;
  const metadataVisible = claims.some((c) => c.predicate === PREDICATES.PUBLISHED_AT);

  const counts = {
    searchReturned: search?.returned ?? 0,
    searchTotal: search?.total ?? 0,
    sourcesRead: reads.length,
    fullTextReads,
    summaryReads,
    metadataVisible: metadataVisible ? reads.length : 0,
    claimCount: claims.length,
    factClaimCount: claims.filter((c) => !c.fromMetadata).length,
    conflictCount: conflicts.length,
    confirmedCount: resolutions.filter((r) => r.status === REVISION_STATUS.CONFIRMED).length,
    unresolvedCount: resolutions.filter((r) => r.status === REVISION_STATUS.UNRESOLVED).length,
    insufficientCount: resolutions.filter((r) => r.status === REVISION_STATUS.INSUFFICIENT).length,
    metadataMissingCount: resolutions.filter((r) => r.status === REVISION_STATUS.METADATA_MISSING).length,
    skippedCount: resolutions.filter((r) => r.status === REVISION_STATUS.SKIPPED).length,
  };

  const limitations = [];
  if (summaryReads > 0) {
    limitations.push(`本次有 ${summaryReads} 份资料只读到了预定义摘要，没有读取正文；正文级事实（如更正说明）不能据此确认。`);
  }
  if (reads.length > 0 && !metadataVisible) {
    limitations.push('本次运行关闭了元数据返回：发布主体、发布时间与更正关系对研究判定层不可见，涉及发布关系的核验只能保持未决。');
  }
  if (counts.unresolvedCount > 0) {
    limitations.push(`有 ${counts.unresolvedCount} 组冲突未解决：本报告保留双方取值，不裁决哪一方有效。`);
  }
  if (counts.insufficientCount + counts.metadataMissingCount > 0) {
    limitations.push(`有 ${counts.insufficientCount + counts.metadataMissingCount} 组冲突证据不足：缺失的具体原因已记录在对应事件中。`);
  }
  if (counts.skippedCount > 0) {
    limitations.push(`本次策略为 COLLECT_ONLY：${counts.skippedCount} 组冲突只收集、不核验，因此没有「更正成立」的结论。`);
  }

  return {
    policy,
    claims,
    conflicts,
    resolutions,
    counts,
    limitations,
    visibleSourceIds: [...visibleSourceIds].sort(),
    /** 供报告与 Inspector 使用：资料标题 */
    titles: Object.fromEntries(titleBySource),
  };
}

/** 取某一资料的可见声明（报告逐条列出时使用） */
export function claimsOfSource(claims, sourceId) {
  return claims.filter((c) => c.sourceId === sourceId && !c.fromMetadata);
}

export { claimValue };
