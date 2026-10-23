/**
 * src/simulation/rules/evidence/revision.js
 * ------------------------------------------------------------------
 * 更正关系核验：**纯规则**，逐条检查 M0.4_TASK §5.2 的必要条件。
 *
 * 必须同时满足才会给出 `revision_confirmed`：
 *   1. 两份相互影响的公告都在本次 Run 的可见证据集中；
 *   2. 同一事项（eventKey）+ 同一字段（如 event_date）出现不同取值；
 *   3. 较新公告**正文**明确说明更正，并指向/可证实它更正的是哪份旧公告；
 *      ——只有 supersedes 元数据、没有读到正文时不足以宣称已核实；
 *   4. 发布主体 / 发布时间等必需元数据由模拟工具真实返回，且发布方为
 *      同一授权机构；
 *   5. 新公告发布时间晚于被更正公告，且资料没有被撤回或标记无效；
 *   6. 本次运行策略为 VERIFY_REVISIONS。
 *
 * 任一条不满足 → UNRESOLVED / INSUFFICIENT_EVIDENCE，并附**具体缺失原因**。
 * 严禁仅凭「日期更晚」或「发布时间更晚」判定更正成立。
 * ------------------------------------------------------------------
 */
import { claimValue, findClaim, PREDICATES } from './claims.js';

export const REVISION_STATUS = Object.freeze({
  CONFIRMED: 'revision_confirmed',
  SKIPPED: 'verification_skipped',
  UNRESOLVED: 'unresolved',
  INSUFFICIENT: 'insufficient_detail',
  METADATA_MISSING: 'metadata_missing',
});

export const REVISION_RULE_IDS = Object.freeze({
  confirmed: 'rule.evidence.revision.confirmed',
  policySkipped: 'rule.evidence.revision.policyCollectOnly',
  noRelation: 'rule.evidence.revision.noSupersession',
  relationMismatch: 'rule.evidence.revision.supersessionMismatch',
  bodyNotRead: 'rule.evidence.revision.bodyNotRead',
  targetMismatch: 'rule.evidence.revision.targetMismatch',
  metadataMissing: 'rule.evidence.revision.metadataRequired',
  publisherUnknown: 'rule.evidence.revision.publisherUnknown',
  publisherNotAuthorized: 'rule.evidence.revision.publisherNotAuthorized',
  timeOrder: 'rule.evidence.revision.timeOrder',
  sourceInvalid: 'rule.evidence.revision.sourceInvalid',
});

export const MISSING_CODES = Object.freeze({
  POLICY: 'POLICY_COLLECT_ONLY',
  PUBLISHED_AT: 'MISSING_PUBLISHED_AT',
  SUPERSEDES: 'MISSING_SUPERSEDES',
  SUPERSEDES_TARGET: 'SUPERSEDES_NOT_TARGETING',
  BODY: 'BODY_NOT_READ',
  EXPLICIT: 'NO_EXPLICIT_REVISION',
  TARGET: 'REVISION_TARGET_MISMATCH',
  PUBLISHER: 'MISSING_PUBLISHER',
  AUTHORITY: 'PUBLISHER_NOT_AUTHORIZED',
  ORDER: 'TIME_ORDER_VIOLATION',
  INVALID: 'SOURCE_MARKED_INVALID',
  VISIBILITY: 'SOURCE_NOT_VISIBLE',
});

function missing(code, message) {
  return { code, message };
}

/**
 * 核验一个冲突组。
 *
 * @param {object} conflict `groupConflicts()` 产出的冲突组
 * @param {object} ctx `{ policy, claims, validityBySource, titleBySource, visibleSourceIds }`
 * @returns {object} 判定结果（含 ruleId、缺失原因、使用的 claim）
 */
export function evaluateConflict(conflict, { policy = 'VERIFY_REVISIONS', claims = [], validityBySource = new Map(), titleBySource = new Map(), visibleSourceIds = new Set() } = {}) {
  const title = (sourceId) => titleBySource.get(sourceId) || sourceId;
  const base = {
    conflictId: conflict.conflictId,
    subject: conflict.subject,
    predicate: conflict.predicate,
    predicateLabel: conflict.predicateLabel,
    claimIds: conflict.claimIds,
  };

  /* ---------------- 0. 可见性：双方必须都在本次可见证据集中 ---------------- */
  const invisible = conflict.sourceIds.filter((id) => !visibleSourceIds.has(id));
  if (invisible.length > 0) {
    return {
      ...base,
      status: REVISION_STATUS.UNRESOLVED,
      ruleId: REVISION_RULE_IDS.metadataMissing,
      missing: [missing(MISSING_CODES.VISIBILITY, `有 ${invisible.length} 条取值来自本次不可见的资料，不能参与核验`)],
      usedClaimIds: conflict.claimIds,
      decision: '本次可见证据不完整，保持未决。',
    };
  }

  /* ---------------- 1. 策略：只收集证据时不裁决 ---------------- */
  if (policy !== 'VERIFY_REVISIONS') {
    return {
      ...base,
      status: REVISION_STATUS.SKIPPED,
      ruleId: REVISION_RULE_IDS.policySkipped,
      missing: [missing(MISSING_CODES.POLICY, '本次运行策略为 COLLECT_ONLY：只收集并呈现冲突，不进行更正关系核验')],
      usedClaimIds: conflict.claimIds,
      decision: '按本次策略保留冲突，不宣布更正成立。',
    };
  }

  /* ---------------- 2. 取值排序需要真实的发布时间 ---------------- */
  const ordered = [...conflict.values].sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
  const withTime = ordered.filter((v) => v.publishedAtKnown);
  if (withTime.length < 2) {
    return {
      ...base,
      status: REVISION_STATUS.METADATA_MISSING,
      ruleId: REVISION_RULE_IDS.metadataRequired,
      missing: [missing(MISSING_CODES.PUBLISHED_AT, '本次工具响应没有返回发布时间（includeMetadata 关闭或未配置），无法核对发布先后')],
      usedClaimIds: conflict.claimIds,
      decision: '缺少发布关系元数据，不能确认更正成立。',
    };
  }

  const byTime = [...withTime].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0));
  const newest = byTime[0];
  const oldest = byTime[byTime.length - 1];
  const newSourceId = newest.sourceIds[0];
  const oldSourceId = oldest.sourceIds[0];

  /* ---------------- 3. 资料状态：不能拿被撤回的资料做结论 ---------------- */
  for (const id of [newSourceId, oldSourceId]) {
    const validity = validityBySource.get(id) || 'active';
    if (validity === 'retracted' || validity === 'invalid') {
      return {
        ...base,
        status: REVISION_STATUS.UNRESOLVED,
        ruleId: REVISION_RULE_IDS.sourceInvalid,
        missing: [missing(MISSING_CODES.INVALID, `资料 ${id} 在元数据中被标记为 ${validity}，不能作为更正依据`)],
        usedClaimIds: conflict.claimIds,
        decision: '资料状态异常，保持未决。',
      };
    }
  }

  /* ---------------- 4. 更正关系元数据 ---------------- */
  const supersedes = claimValue(claims, newSourceId, PREDICATES.SUPERSEDES);
  if (!supersedes || supersedes === 'none') {
    return {
      ...base,
      status: REVISION_STATUS.UNRESOLVED,
      ruleId: REVISION_RULE_IDS.noRelation,
      missing: [missing(MISSING_CODES.SUPERSEDES, `较新的资料 ${newSourceId} 没有可核实的 supersedes 更正关系：不能仅凭日期或发布时间更晚就判为更正`)],
      usedClaimIds: conflict.claimIds,
      decision: '存在分歧但没有可靠更正链，本次不裁决哪一方有效。',
    };
  }
  const targets = String(supersedes).split(',').map((s) => s.trim()).filter(Boolean);
  if (!targets.includes(oldSourceId)) {
    return {
      ...base,
      status: REVISION_STATUS.UNRESOLVED,
      ruleId: REVISION_RULE_IDS.relationMismatch,
      missing: [missing(MISSING_CODES.SUPERSEDES_TARGET, `${newSourceId} 的 supersedes 指向 ${targets.join('、')}，与本次冲突的另一方 ${oldSourceId} 不一致`)],
      usedClaimIds: conflict.claimIds,
      decision: '更正关系与冲突双方不匹配，保持未决。',
    };
  }

  /* ---------------- 5. 正文必须明确说明更正 ---------------- */
  const revisionNotice = findClaim(claims, newSourceId, PREDICATES.REVISION_NOTICE);
  if (!revisionNotice) {
    return {
      ...base,
      status: REVISION_STATUS.INSUFFICIENT,
      ruleId: REVISION_RULE_IDS.bodyNotRead,
      missing: [missing(MISSING_CODES.BODY, `没有读到 ${newSourceId} 的正文：仅凭摘要与元数据不能确认「正文明确说明更正」`)],
      usedClaimIds: [...conflict.claimIds, ...(claimValue(claims, newSourceId, PREDICATES.SUPERSEDES) ? [] : [])],
      decision: '只获得摘要级线索，证据不足，不能宣布更正成立。',
      newSourceId,
      oldSourceId,
    };
  }
  if (revisionNotice.value !== 'explicit') {
    return {
      ...base,
      status: REVISION_STATUS.INSUFFICIENT,
      ruleId: REVISION_RULE_IDS.bodyNotRead,
      missing: [missing(MISSING_CODES.EXPLICIT, `${newSourceId} 的正文没有明确的更正说明`)],
      usedClaimIds: conflict.claimIds,
      decision: '正文缺少明确的更正表述，保持未决。',
    };
  }
  const revisionTarget = findClaim(claims, newSourceId, PREDICATES.REVISION_TARGET);
  if (!revisionTarget || revisionTarget.value !== oldSourceId) {
    return {
      ...base,
      status: REVISION_STATUS.UNRESOLVED,
      ruleId: REVISION_RULE_IDS.targetMismatch,
      missing: [missing(MISSING_CODES.TARGET, `${newSourceId} 的正文没有指向 ${oldSourceId}（${title(oldSourceId)}）：无法证实它更正的就是这份公告`)],
      usedClaimIds: conflict.claimIds,
      decision: '更正的指向无法证实，保持未决。',
    };
  }

  /* ---------------- 6. 发布先后 ---------------- */
  if (!(newest.publishedAt > oldest.publishedAt)) {
    return {
      ...base,
      status: REVISION_STATUS.UNRESOLVED,
      ruleId: REVISION_RULE_IDS.timeOrder,
      missing: [missing(MISSING_CODES.ORDER, `较新资料 ${newSourceId} 的发布时间（${newest.publishedAt}）不晚于 ${oldSourceId}（${oldest.publishedAt}）`)],
      usedClaimIds: conflict.claimIds,
      decision: '发布先后不成立，不能确认为更正。',
    };
  }

  /* ---------------- 7. 发布主体 ---------------- */
  const pubNew = claimValue(claims, newSourceId, PREDICATES.PUBLISHER_ID);
  const pubOld = claimValue(claims, oldSourceId, PREDICATES.PUBLISHER_ID);
  if (!pubNew || !pubOld) {
    return {
      ...base,
      status: REVISION_STATUS.METADATA_MISSING,
      ruleId: REVISION_RULE_IDS.publisherUnknown,
      missing: [missing(MISSING_CODES.PUBLISHER, '发布主体未由工具返回，无法核对是否有权更正')],
      usedClaimIds: conflict.claimIds,
      decision: '缺少发布主体，不能确认更正成立。',
    };
  }
  if (pubNew !== pubOld) {
    return {
      ...base,
      status: REVISION_STATUS.UNRESOLVED,
      ruleId: REVISION_RULE_IDS.publisherNotAuthorized,
      missing: [missing(MISSING_CODES.AUTHORITY, `更正公告的发布主体（${pubNew}）与被更正公告（${pubOld}）不是同一授权机构`)],
      usedClaimIds: conflict.claimIds,
      decision: '更正方不具备该事项的更正权，保持未决。',
    };
  }

  /* ---------------- 8. 全部通过 ---------------- */
  return {
    ...base,
    status: REVISION_STATUS.CONFIRMED,
    ruleId: REVISION_RULE_IDS.confirmed,
    missing: [],
    usedClaimIds: [...new Set([...conflict.claimIds, revisionNotice.claimId, revisionTarget.claimId, `${newSourceId}~${PREDICATES.SUPERSEDES}`, `${oldSourceId}~${PREDICATES.EVENT_DATE}`])].sort(),
    oldSourceId,
    newSourceId,
    oldValue: oldest.value,
    newValue: newest.value,
    oldPublishedAt: oldest.publishedAt,
    newPublishedAt: newest.publishedAt,
    decision: `在本次模拟公告链中，${title(newSourceId)}（${newest.publishedAt} 发布）明确更正了 ${title(oldSourceId)}（${oldest.publishedAt} 发布）中的${conflict.predicateLabel}：${oldest.value} → ${newest.value}。旧资料保留为「已被更正」的历史记录。`,
    requirements: [
      { code: 'VISIBLE_BOTH', pass: true, text: '两份公告都在本次可见证据集中' },
      { code: 'SAME_SUBJECT', pass: true, text: `同一事项 ${conflict.subject} 的同一字段 ${conflict.predicate}` },
      { code: 'BODY_EXPLICIT', pass: true, text: `正文明确说明更正并指向 ${oldSourceId}` },
      { code: 'METADATA', pass: true, text: `发布主体与发布时间由工具返回（${pubNew}）` },
      { code: 'TIME_ORDER', pass: true, text: `${newest.publishedAt} 晚于 ${oldest.publishedAt}` },
      { code: 'POLICY_VERIFY', pass: true, text: '本次策略为 VERIFY_REVISIONS' },
    ],
    failedRequirements: [],
  };
}
