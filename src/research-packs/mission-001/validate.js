/**
 * src/research-packs/mission-001/validate.js
 * ------------------------------------------------------------------
 * 研究包的数据完整性校验（纯函数，可脱离浏览器单测）。
 *
 * 目的（M0.4_TASK §4.3 / A31 / A38）：
 *   · 文档与片段 ID 唯一且稳定；
 *   · supersedes 只能指向存在、同事项、更早发布且不构成循环的资料；
 *   · 日期必须是可比较的 ISO 日期；
 *   · 每条事实声明（claim spec）的 anchor 必须真实出现在它允许的片段里，
 *     否则这条声明永远不会被抽取 —— 必须在校验阶段就发现，而不是静默失效；
 *   · 任何资料问题都不能让引擎崩溃，也不能让无效资料被采信。
 * ------------------------------------------------------------------
 */
import { PUBLISHERS } from './notices.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(time)) return false;
  // 反向验证：拒绝 2026-02-31 这类「格式对但不存在」的日期
  return new Date(time).toISOString().slice(0, 10) === value;
}

/**
 * 校验一个研究包（notice 数组）。
 * @returns {{ok:boolean, problems:Array<{code:string,sourceId:string|null,message:string}>}}
 */
export function validateMissionPack(notices = []) {
  const problems = [];
  const add = (code, sourceId, message) => problems.push({ code, sourceId, message });

  /* ---------------- 单条资料的形状 ---------------- */
  const byId = new Map();
  const chunkOwners = new Map();
  /* 先收集全部 ID：允许 supersedes 指向数组中位置靠后的资料 */
  const allIds = new Set(notices.map((n) => n?.sourceId).filter((id) => typeof id === 'string' && id));

  for (const n of notices) {
    const id = n?.sourceId;
    if (typeof id !== 'string' || !id) {
      add('INVALID_SOURCE_ID', null, `资料缺少稳定 sourceId：${JSON.stringify(n?.title ?? null)}`);
      continue;
    }
    if (byId.has(id)) {
      add('DUPLICATE_SOURCE_ID', id, `资料 ID「${id}」重复出现，后一条不会被采信`);
      continue;
    }
    byId.set(id, n);

    if (n.isFictional !== true) add('NOT_MARKED_FICTIONAL', id, `资料「${id}」没有标记为虚构教学资料`);
    if (typeof n.title !== 'string' || !n.title) add('MISSING_TITLE', id, `资料「${id}」缺少标题`);
    if (typeof n.summary !== 'string' || !n.summary) add('MISSING_SUMMARY', id, `资料「${id}」缺少摘要片段`);
    if (!Array.isArray(n.body) || n.body.length === 0) add('MISSING_BODY', id, `资料「${id}」缺少正文片段`);
    if (!PUBLISHERS[n.publisherId]) add('UNKNOWN_PUBLISHER', id, `资料「${id}」的发布主体 publisherId「${String(n.publisherId)}」未登记`);
    if (!isIsoDate(n.publishedAt)) add('INVALID_DATE', id, `资料「${id}」的发布日期「${String(n.publishedAt)}」不是合法 ISO 日期`);
    if (n.eventDate !== null && n.eventDate !== undefined && !isIsoDate(n.eventDate)) {
      add('INVALID_DATE', id, `资料「${id}」的活动日期「${String(n.eventDate)}」不是合法 ISO 日期`);
    }
    if (!Array.isArray(n.chunks) || n.chunks.length < 2) {
      add('MISSING_CHUNKS', id, `资料「${id}」缺少可引用片段`);
      continue;
    }
    for (const chunk of n.chunks) {
      if (!chunk?.chunkId || !chunk?.text) {
        add('INVALID_CHUNK', id, `资料「${id}」存在空片段`);
        continue;
      }
      const owner = chunkOwners.get(chunk.chunkId);
      if (owner && owner !== id) {
        add('DUPLICATE_CHUNK_ID', id, `片段 ID「${chunk.chunkId}」同时出现在「${owner}」与「${id}」`);
      } else {
        chunkOwners.set(chunk.chunkId, id);
      }
      if (!chunk.chunkId.startsWith(`${id}#`)) {
        add('CHUNK_ID_MISMATCH', id, `片段「${chunk.chunkId}」不属于资料「${id}」的命名空间`);
      }
    }

    /* ---------------- 事实声明映射 ---------------- */
    const claims = Array.isArray(n.claims) ? n.claims : [];
    if (claims.length === 0) add('NO_CLAIMS', id, `资料「${id}」没有可检查的事实声明`);
    const predicates = new Set();
    for (const spec of claims) {
      if (!spec?.predicate || !spec?.value) {
        add('INVALID_CLAIM', id, `资料「${id}」存在不完整的 claim 定义`);
        continue;
      }
      if (predicates.has(spec.predicate)) {
        add('DUPLICATE_CLAIM', id, `资料「${id}」的「${spec.predicate}」声明重复，后一条不会被采信`);
      }
      predicates.add(spec.predicate);
      const allowed = (n.chunks || []).filter((c) => (spec.scope === 'any' || !spec.scope ? true : c.kind === spec.scope));
      const matched = allowed.filter((c) => c.text.includes(spec.anchor));
      if (matched.length === 0) {
        add(
          'CLAIM_ANCHOR_MISSING',
          id,
          `资料「${id}」的「${spec.predicate}」声明 anchor「${String(spec.anchor)}」在${spec.scope === 'body' ? '正文' : '允许的'}片段中不存在，该声明永远不会被抽取`
        );
      }
    }

    /* ---------------- 更正关系 ---------------- */
    if (n.supersedes !== undefined && n.supersedes !== null && !Array.isArray(n.supersedes)) {
      add('INVALID_SUPERSEDES', id, `资料「${id}」的 supersedes 必须是数组`);
    }
    for (const target of n.supersedes || []) {
      if (target === id) add('SUPERSEDES_SELF', id, `资料「${id}」不能更正自己`);
      if (!allIds.has(target)) {
        add('SUPERSEDES_UNKNOWN', id, `资料「${id}」的 supersedes 指向不存在的资料「${String(target)}」`);
      }
    }
  }

  /* ---------------- 关系层：同事项 / 时间顺序 / 无循环 ---------------- */
  for (const [id, n] of byId) {
    for (const target of n.supersedes || []) {
      const old = byId.get(target);
      if (!old) continue;
      if (old.eventKey !== n.eventKey) {
        add('SUPERSEDES_CROSS_SUBJECT', id, `资料「${id}」更正了不同事项的资料「${target}」（eventKey 不一致）`);
      }
      if (old.publishedAt >= n.publishedAt) {
        add('SUPERSEDES_TIME_ORDER', id, `资料「${id}」的发布时间不晚于它声称更正的「${target}」`);
      }
    }
  }

  for (const cycle of findSupersedesCycles(byId)) {
    add('SUPERSEDES_CYCLE', cycle[0], `更正链构成循环：${cycle.join(' → ')}`);
  }

  return { ok: problems.length === 0, problems };
}

/** 找出 supersedes 图中的循环（返回每个循环的节点序列） */
export function findSupersedesCycles(byId) {
  const state = new Map(); // 0=未访问 1=在栈上 2=已完成
  const stack = [];
  const cycles = [];
  const seen = new Set();

  function visit(id) {
    const s = state.get(id) || 0;
    if (s === 2) return;
    if (s === 1) {
      const at = stack.indexOf(id);
      const cycle = stack.slice(at);
      const key = [...cycle].sort().join('|');
      if (!seen.has(key)) {
        seen.add(key);
        cycles.push([...cycle, id]);
      }
      return;
    }
    state.set(id, 1);
    stack.push(id);
    for (const next of byId.get(id)?.supersedes || []) if (byId.has(next)) visit(next);
    stack.pop();
    state.set(id, 2);
  }

  for (const id of byId.keys()) visit(id);
  return cycles;
}

/**
 * 运行期使用的安全语料：把**有致命问题**的资料剔除，并如实报告。
 * 引擎只会在剔除后的语料上检索与读取，因此损坏资料既不会崩溃，也
 * 不会被采信（A38）。
 *
 * @returns {{notices:Array, dropped:Array<{sourceId:string,code:string,message:string}>}}
 */
export function prepareCorpus(notices = []) {
  const dropped = [];
  const seenIds = new Set();
  const kept = [];
  for (const n of notices) {
    const id = n?.sourceId;
    if (typeof id !== 'string' || !id) {
      dropped.push({ sourceId: String(id ?? 'unknown'), code: 'INVALID_SOURCE_ID', message: '资料缺少稳定 sourceId，已从本次语料中剔除' });
      continue;
    }
    if (seenIds.has(id)) {
      dropped.push({ sourceId: id, code: 'DUPLICATE_SOURCE_ID', message: `资料 ID「${id}」重复，后一条已从本次语料中剔除` });
      continue;
    }
    if (typeof n.summary !== 'string' || !n.summary) {
      dropped.push({ sourceId: id, code: 'MISSING_SUMMARY', message: `资料「${id}」缺少可读摘要，已从本次语料中剔除` });
      continue;
    }
    /* 允许只有 body/chunkIds 的旧资料包（mission-001-mini）：片段可由正文派生 */
    const hasChunks = Array.isArray(n.chunks) && n.chunks.length > 0;
    const hasBody = Array.isArray(n.body) && n.body.length > 0;
    if (!hasChunks && !hasBody) {
      dropped.push({ sourceId: id, code: 'MISSING_CHUNKS', message: `资料「${id}」缺少可读片段，已从本次语料中剔除` });
      continue;
    }
    if (!isIsoDate(n.publishedAt)) {
      dropped.push({ sourceId: id, code: 'INVALID_DATE', message: `资料「${id}」的发布日期不合法，已从本次语料中剔除` });
      continue;
    }
    seenIds.add(id);
    kept.push(n);
  }
  return { notices: kept, dropped };
}

export { isIsoDate };
