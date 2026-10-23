/**
 * src/simulation/rules/evidence/claims.js
 * ------------------------------------------------------------------
 * 可见事实声明的抽取（纯逻辑，不依赖 DOM / Three.js / 真实模型）。
 *
 * 核心纪律（M0.4_TASK §4.3 / §4.4 / §5.1）：
 *   · 只从**本次模拟工具真正返回的文本**里抽取：
 *       - 摘要片段只能产出摘要里出现的声明；
 *       - 正文片段才能产出正文级声明（例如「正文明确说明更正」）；
 *       - 关闭元数据时，发布主体 / 发布时间 / supersedes 一律拿不到，
 *         绝不用内部索引补回。
 *   · 抽取映射（predicate + anchor + value）是研究包里预先写好的、可检查的
 *     固定规则，不是模型推理；anchor 必须在返回的文本里实际出现才算成立。
 *   · claimId 只由「资料 ID + 谓词」派生，稳定、去重、可跨 Run 比较。
 * ------------------------------------------------------------------
 */

/** 证据声明谓词：集中定义，UI 与报告只按常量分派 */
export const PREDICATES = Object.freeze({
  EVENT_DATE: 'event_date',
  KEY_FACT: 'key_fact',
  REVISION_NOTICE: 'revision_notice',
  REVISION_TARGET: 'revision_target',
  PUBLISHED_AT: 'published_at',
  PUBLISHER_ID: 'publisher_id',
  EVENT_KEY: 'event_key',
  SUPERSEDES: 'supersedes',
  VALIDITY: 'validity',
});

/** 允许参与冲突分组的谓词（只有「同一事项的同名字段」才可能冲突） */
export const CONFLICT_PREDICATES = Object.freeze([PREDICATES.EVENT_DATE]);

/** 由元数据派生的谓词：includeMetadata=false 时一条都不会出现 */
export const METADATA_PREDICATES = Object.freeze([
  PREDICATES.PUBLISHED_AT,
  PREDICATES.PUBLISHER_ID,
  PREDICATES.EVENT_KEY,
  PREDICATES.SUPERSEDES,
  PREDICATES.VALIDITY,
]);

export const PREDICATE_LABEL = Object.freeze({
  [PREDICATES.EVENT_DATE]: '活动日期',
  [PREDICATES.KEY_FACT]: '关键事实',
  [PREDICATES.REVISION_NOTICE]: '正文更正说明',
  [PREDICATES.REVISION_TARGET]: '更正的原始公告',
  [PREDICATES.PUBLISHED_AT]: '发布时间（元数据）',
  [PREDICATES.PUBLISHER_ID]: '发布主体（元数据）',
  [PREDICATES.EVENT_KEY]: '事项身份（元数据）',
  [PREDICATES.SUPERSEDES]: '更正关系（元数据）',
  [PREDICATES.VALIDITY]: '资料状态（元数据）',
});

/** 引用片段最多保留多少字符：异常长文本安全降级 */
const MAX_EXCERPT_CHARS = 400;

export function clampExcerpt(text, limit = MAX_EXCERPT_CHARS) {
  const s = String(text ?? '').trim();
  return s.length <= limit ? s : `${s.slice(0, limit)}…`;
}

/** 稳定 claimId：同一资料的同一条声明在任何 Run 中都同名 */
export function makeClaimId(sourceId, predicate) {
  return `${sourceId}~${predicate}`;
}

/**
 * 从本次可见的读取结果中抽取事实声明。
 *
 * @param {object} params
 * @param {Array} params.reads 每组为 `{ sourceId, eventId, textScope, chunks, metadata, title }`
 * @param {Map<string,object>|object} params.corpus 资料索引（只用于取**预设的抽取映射**，不用于取正文）
 * @returns {Array} claim 列表
 */
export function extractVisibleClaims({ reads = [], corpus = new Map() } = {}) {
  const index = corpus instanceof Map ? corpus : new Map(Object.entries(corpus || {}));
  const claims = [];
  const seen = new Set();

  for (const read of reads) {
    const notice = index.get(read.sourceId);
    if (!notice) continue;
    const chunks = Array.isArray(read.chunks) ? read.chunks.filter((c) => c && typeof c.text === 'string') : [];
    if (chunks.length === 0) continue;

    /* ---------------- 文本级声明：只认实际返回的片段 ---------------- */
    for (const spec of notice.claims || []) {
      if (!spec || !spec.predicate) continue;
      const allowed = spec.scope === 'body' ? chunks.filter((c) => c.kind === 'body') : chunks;
      // 正文优先：同一句事实既出现在摘要又出现在正文时，引用正文
      const ordered = [...allowed].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'body' ? -1 : 1));
      const hit = ordered.find((c) => c.text.includes(spec.anchor));
      if (!hit) continue;
      const claimId = makeClaimId(read.sourceId, spec.predicate);
      if (seen.has(claimId)) continue;
      seen.add(claimId);
      claims.push({
        claimId,
        predicate: spec.predicate,
        value: spec.value,
        anchor: spec.anchor,
        subject: notice.eventKey || null,
        sourceId: read.sourceId,
        chunkId: hit.chunkId,
        eventId: read.eventId,
        readEventId: read.eventId,
        textScope: read.textScope === 'full_text' ? 'full_text' : read.textScope === 'search_excerpt' ? 'search_excerpt' : 'summary',
        chunkKind: hit.kind,
        excerpt: clampExcerpt(hit.text),
        /* 只有元数据可见时才会有值，见下方 metadata 分支 */
        publishedAt: null,
        publisherId: null,
        fromMetadata: false,
      });
    }

    /* ---------------- 元数据级声明：只在真实返回了元数据时存在 ---------------- */
    const meta = read.metadata;
    if (!meta) continue;
    const addMeta = (predicate, value) => {
      const claimId = makeClaimId(read.sourceId, predicate);
      if (seen.has(claimId)) return;
      seen.add(claimId);
      const chunk = chunks[0];
      claims.push({
        claimId,
        predicate,
        value,
        anchor: null,
        subject: meta.eventKey || notice.eventKey || null,
        sourceId: read.sourceId,
        chunkId: chunk ? chunk.chunkId : notice.chunkId,
        eventId: read.eventId,
        readEventId: read.eventId,
        textScope: read.textScope === 'full_text' ? 'full_text' : 'summary',
        chunkKind: 'metadata',
        excerpt: '',
        publishedAt: meta.publishedAt || null,
        publisherId: meta.publisherId || meta.publisher || null,
        fromMetadata: true,
      });
    };
    if (meta.publishedAt) addMeta(PREDICATES.PUBLISHED_AT, meta.publishedAt);
    if (meta.publisherId || meta.publisher) addMeta(PREDICATES.PUBLISHER_ID, meta.publisherId || meta.publisher);
    addMeta(PREDICATES.EVENT_KEY, meta.eventKey || 'none');
    addMeta(PREDICATES.SUPERSEDES, Array.isArray(meta.supersedes) && meta.supersedes.length ? [...meta.supersedes].sort().join(',') : 'none');
    addMeta(PREDICATES.VALIDITY, meta.validity || 'unknown');
  }

  /* ---------------- 把元数据里的发布时间挂到该资料的每一条声明上 ---------------- */
  const timeBySource = new Map();
  const pubBySource = new Map();
  for (const c of claims) {
    if (c.predicate === PREDICATES.PUBLISHED_AT) timeBySource.set(c.sourceId, c.value);
    if (c.predicate === PREDICATES.PUBLISHER_ID) pubBySource.set(c.sourceId, c.value);
  }
  for (const c of claims) {
    if (!c.publishedAt) c.publishedAt = timeBySource.get(c.sourceId) || null;
    if (!c.publisherId) c.publisherId = pubBySource.get(c.sourceId) || null;
  }

  return claims;
}

/** 便捷查询：取某条声明（找不到返回 null） */
export function findClaim(claims, sourceId, predicate) {
  return claims.find((c) => c.sourceId === sourceId && c.predicate === predicate) || null;
}

/** 便捷查询：某资料的某个声明值（找不到返回 null） */
export function claimValue(claims, sourceId, predicate) {
  return findClaim(claims, sourceId, predicate)?.value ?? null;
}

