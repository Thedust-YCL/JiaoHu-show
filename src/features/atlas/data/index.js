/**
 * src/features/atlas/data/index.js
 * ------------------------------------------------------------------
 * Atlas 知识数据的唯一读取入口：概念、关系、别名检索与图完整性校验。
 *
 * 纯数据 + 纯函数：不依赖 DOM / Three.js / localStorage，
 * 因此图谱关系、别名检索与悬空关系检查都能在 Node 单元测试里直接跑
 * （M0.3_TASK §13「自动测试最低要求」第 1、2 条）。
 * ------------------------------------------------------------------
 */
import { CONCEPTS, CONCEPT_ORDER, getConcept } from './concepts.js';
import { GRAPH_VIEW, NODE_LAYOUT, RELATIONSHIPS, RELATION_TYPES } from './relationships.js';

export { CONCEPTS, CONCEPT_ORDER, GRAPH_VIEW, NODE_LAYOUT, RELATIONSHIPS, RELATION_TYPES, getConcept };

/** 关系类型元数据；未知类型返回 RELATED（不抛错，界面仍可读） */
export function relationMeta(type) {
  return RELATION_TYPES[type] || RELATION_TYPES.RELATED;
}

/** 某条边的两个端点都在节点表内 */
export function isEdgeResolvable(edge) {
  return !!getConcept(edge.sourceId) && !!getConcept(edge.targetId) && edge.sourceId !== edge.targetId;
}

/** 与某个概念直接相连的所有边（无向看待，方向由 edge.directed 表达） */
export function edgesOf(conceptId) {
  return RELATIONSHIPS.filter((e) => e.sourceId === conceptId || e.targetId === conceptId);
}

/**
 * 相关概念列表：**由边数据派生**，不另写一份可能对不上的清单。
 * 排序优先使用概念里人工写好的 related 提示，再由边数据补齐，保证
 * 「相关概念」入口一定能在图上找到对应的连线。
 */
export function relatedOf(conceptId) {
  const concept = getConcept(conceptId);
  if (!concept) return [];
  const neighbors = new Set();
  for (const edge of edgesOf(conceptId)) {
    const other = edge.sourceId === conceptId ? edge.targetId : edge.sourceId;
    if (getConcept(other)) neighbors.add(other);
  }
  const ordered = [];
  for (const hint of concept.related) if (neighbors.has(hint)) ordered.push(hint);
  for (const id of CONCEPT_ORDER) if (neighbors.has(id) && !ordered.includes(id)) ordered.push(id);
  return ordered.map((id) => ({ concept: getConcept(id), edges: edgesOf(conceptId).filter((e) => e.sourceId === id || e.targetId === id) }));
}

/** 搜索用的规范化：小写、去首尾空白、去掉空格与常见分隔符 */
export function normalizeQuery(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[\s\u3000._-]+/g, '');
}

/** 单个概念的检索字段（越靠前权重越高） */
function searchTokens(concept) {
  return [
    { weight: 4, text: concept.id },
    { weight: 4, text: concept.name },
    { weight: 4, text: concept.cn },
    { weight: 3, text: concept.toolId || '' },
    ...concept.aliases.map((a) => ({ weight: 3, text: a })),
    { weight: 1, text: concept.chapterCn },
    { weight: 1, text: concept.tagline },
  ].filter((t) => t.text);
}

/**
 * 关键词检索：支持中英文别名、大小写不敏感与部分匹配。
 * 空查询表示「清除搜索、恢复全图」，由调用方按 cleared 处理。
 */
export function searchConcepts(query) {
  const q = normalizeQuery(query);
  if (!q) return { query: '', cleared: true, empty: false, matches: [] };

  const matches = [];
  for (const id of CONCEPT_ORDER) {
    const concept = CONCEPTS[id];
    let best = 0;
    let field = null;
    for (const token of searchTokens(concept)) {
      const text = normalizeQuery(token.text);
      if (!text) continue;
      let score = 0;
      if (text === q) score = token.weight * 3;
      else if (text.startsWith(q)) score = token.weight * 2;
      else if (text.includes(q)) score = token.weight;
      if (score > best) {
        best = score;
        field = token.text;
      }
    }
    if (best > 0) matches.push({ concept, score: best, matchedText: field });
  }

  matches.sort((a, b) => (b.score - a.score) || (CONCEPT_ORDER.indexOf(a.concept.id) - CONCEPT_ORDER.indexOf(b.concept.id)));
  return { query: String(query), cleared: false, empty: matches.length === 0, matches };
}

/**
 * 图完整性校验：唯一 ID、端点存在、无自环、无重复边、类型合法、坐标齐全。
 * 单元测试与开发期断言共用；返回空数组表示图是自洽的。
 */
export function validateGraph() {
  const issues = [];
  const seen = new Set();
  for (const edge of RELATIONSHIPS) {
    if (!edge.id) issues.push({ code: 'MISSING_EDGE_ID', edge });
    else if (seen.has(edge.id)) issues.push({ code: 'DUPLICATE_EDGE_ID', id: edge.id });
    else seen.add(edge.id);
    if (!getConcept(edge.sourceId)) issues.push({ code: 'UNKNOWN_SOURCE', id: edge.id, value: edge.sourceId });
    if (!getConcept(edge.targetId)) issues.push({ code: 'UNKNOWN_TARGET', id: edge.id, value: edge.targetId });
    if (edge.sourceId === edge.targetId) issues.push({ code: 'SELF_LOOP', id: edge.id });
    if (!RELATION_TYPES[edge.type]) issues.push({ code: 'UNKNOWN_TYPE', id: edge.id, value: edge.type });
    if (!edge.description || edge.description.length < 10) issues.push({ code: 'WEAK_DESCRIPTION', id: edge.id });
    if (typeof edge.directed !== 'boolean') issues.push({ code: 'MISSING_DIRECTION_FLAG', id: edge.id });
    // 有向标记必须与关系类型一致：RELATED / CONTRASTS 不默认为严格单向因果
    if (RELATION_TYPES[edge.type] && RELATION_TYPES[edge.type].directed !== edge.directed) {
      issues.push({ code: 'DIRECTION_MISMATCH', id: edge.id, value: edge.type });
    }
  }
  const conceptIds = Object.keys(CONCEPTS);
  if (conceptIds.length !== 10) issues.push({ code: 'CONCEPT_COUNT', value: conceptIds.length });
  for (const id of CONCEPT_ORDER) {
    if (!CONCEPTS[id]) issues.push({ code: 'ORDER_UNKNOWN_ID', value: id });
    if (!NODE_LAYOUT[id]) issues.push({ code: 'MISSING_LAYOUT', value: id });
    const concept = CONCEPTS[id];
    if (!concept) continue;
    for (const rid of concept.related) {
      if (rid === id) issues.push({ code: 'SELF_RELATED', value: id });
      if (!CONCEPTS[rid]) issues.push({ code: 'UNKNOWN_RELATED', value: `${id} → ${rid}` });
    }
    if (!concept.understand?.length) issues.push({ code: 'MISSING_UNDERSTAND', value: id });
    if (!concept.misconceptions?.length) issues.push({ code: 'MISSING_MISCONCEPTION', value: id });
  }
  if (CONCEPT_ORDER.length !== conceptIds.length) issues.push({ code: 'ORDER_LENGTH', value: CONCEPT_ORDER.length });
  return issues;
}

/** 图谱统计：节点数、边数、按类型计数（供页脚与测试断言） */
export function graphStats() {
  const byType = {};
  for (const edge of RELATIONSHIPS) byType[edge.type] = (byType[edge.type] || 0) + 1;
  return { concepts: CONCEPT_ORDER.length, edges: RELATIONSHIPS.length, byType };
}

/** 「在系统中查看」的目标：只有 core / tools 两类概念有真实落点 */
export function systemTargetOf(conceptId) {
  const concept = getConcept(conceptId);
  return concept ? concept.systemTarget : 'none';
}
