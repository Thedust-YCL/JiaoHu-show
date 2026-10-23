/**
 * src/simulation/rules/evidence/conflicts.js
 * ------------------------------------------------------------------
 * 冲突分组：把「同一事项 + 同一字段 + 不同取值」的可见声明归到一组。
 *
 * 严格按 M0.4_TASK §5.1.4：
 *   · 只有具备**可见事项身份**（eventKey，来自元数据）的声明才参与分组；
 *   · 没有事项身份的资料只能作为独立发现，不会被强行认定为同一活动；
 *   · 分组结果与顺序完全由声明内容决定，不含时间、随机或视觉状态。
 * ------------------------------------------------------------------
 */
import { CONFLICT_PREDICATES, PREDICATE_LABEL, PREDICATES } from './claims.js';

/**
 * @param {Array} claims 可见声明
 * @returns {Array} 冲突组列表（只在出现 ≥2 个不同取值时产生）
 */
export function groupConflicts(claims = []) {
  const buckets = new Map();

  for (const claim of claims) {
    if (!claim || !claim.subject) continue;
    if (!CONFLICT_PREDICATES.includes(claim.predicate)) continue;
    const key = `${claim.subject}::${claim.predicate}`;
    if (!buckets.has(key)) {
      buckets.set(key, { subject: claim.subject, predicate: claim.predicate, claims: [] });
    }
    buckets.get(key).claims.push(claim);
  }

  const conflicts = [];
  for (const [key, bucket] of [...buckets.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    const values = new Map();
    for (const claim of bucket.claims) {
      if (!values.has(claim.value)) {
        values.set(claim.value, { value: claim.value, claimIds: [], sourceIds: [], publishedAt: null, eventId: claim.eventId, publishedAtKnown: false });
      }
      const entry = values.get(claim.value);
      if (!entry.claimIds.includes(claim.claimId)) entry.claimIds.push(claim.claimId);
      if (!entry.sourceIds.includes(claim.sourceId)) entry.sourceIds.push(claim.sourceId);
      if (claim.publishedAt) {
        entry.publishedAt = claim.publishedAt;
        entry.publishedAtKnown = true;
        entry.eventId = claim.eventId;
      }
    }
    if (values.size < 2) continue;

    const valueList = [...values.values()]
      .map((v) => ({ ...v, claimIds: [...v.claimIds].sort(), sourceIds: [...v.sourceIds].sort() }))
      .sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));

    conflicts.push({
      conflictId: `cf:${bucket.subject}:${bucket.predicate}`,
      subject: bucket.subject,
      predicate: bucket.predicate,
      predicateLabel: PREDICATE_LABEL[bucket.predicate] || bucket.predicate,
      values: valueList,
      claimIds: valueList.flatMap((v) => v.claimIds).sort(),
      sourceIds: [...new Set(valueList.flatMap((v) => v.sourceIds))].sort(),
      /** 是否所有取值都能追溯到「本次真实可见」的资料（恒为 true，作为可检查断言） */
      allClaimsVisible: bucket.claims.every((c) => !!c.eventId && !!c.sourceId),
    });
  }

  return conflicts;
}

/** 某个资料的日期取值（找不到返回 null；用于报告里区分「唯一取值」与「冲突取值」） */
export function dateValueOf(claims, sourceId) {
  return claims.find((c) => c.sourceId === sourceId && c.predicate === PREDICATES.EVENT_DATE)?.value ?? null;
}

export { PREDICATES };
