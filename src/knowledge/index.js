/**
 * src/knowledge/index.js
 * ------------------------------------------------------------------
 * 统一内容访问接口（M1.1_TASK D05 / §4）：
 *   Story / Atlas / Knowledge Node / Lab 四个入口都只通过本模块读取知识数据，
 *   不允许在组件里再写第二份过滤、别名或关系逻辑。
 *
 * 提供的查询面（纯函数、无 DOM、无 localStorage，可直接在 Node 测试）：
 *   getConcept / getChapter / getConceptsByChapter / searchConcepts /
 *   getRelations / relatedOf / conceptAvailability / graphModel /
 *   experimentOfConcept / validateKnowledge / knowledgeStats
 *
 * 数据权威性（M1.1_TASK §2.4）：本模块只描述**知识**；
 * 系统配置（装配台）与执行轨迹（运行记录）都不在这里，也不被这里改写。
 * ------------------------------------------------------------------
 */
import { CHAPTERS, CHAPTER_ORDER, getChapter, chapterIdByNo } from './chapters.js';
import {
  CONCEPTS,
  CONCEPT_ORDER,
  conceptsByChapter,
  getConcept,
  getConceptsByChapter,
  neighborConcepts,
  positionInChapter,
} from './concepts/index.js';
import { CONTENT_STATUS, CONTENT_STATUS_ORDER, canRunExperiment, hasBody } from './concepts/helpers.js';
import {
  BY_CONCEPT,
  RELATIONSHIPS,
  RELATION_TYPES,
  RELATION_TYPE_ORDER,
  edgesOf,
  getRelationship,
  relationMeta,
} from './relations.js';
import { GRAPH_ORDER, GRAPH_VIEW, NODE_LAYOUT } from './layout.js';
import { SOURCES, SOURCE_TYPES, getSource, sourceStats, isSourceReviewed, validateSources } from './sources.js';
import {
  EXPERIMENTS,
  EXPERIMENT_OPEN_MODES,
  EXPERIMENT_STATUS,
  experimentByLabKind,
  experimentOfConcept,
  experimentStats,
  experimentsByChapter,
  getExperiment,
  isExperimentAvailable,
} from './experiments.js';

export {
  /* 章节 */
  CHAPTERS,
  CHAPTER_ORDER,
  getChapter,
  chapterIdByNo,
  /* 概念 */
  CONCEPTS,
  CONCEPT_ORDER,
  conceptsByChapter,
  getConcept,
  getConceptsByChapter,
  neighborConcepts,
  positionInChapter,
  /* 内容状态 */
  CONTENT_STATUS,
  CONTENT_STATUS_ORDER,
  canRunExperiment,
  hasBody,
  /* 关系 */
  RELATIONSHIPS,
  RELATION_TYPES,
  RELATION_TYPE_ORDER,
  edgesOf,
  getRelationship,
  relationMeta,
  /* 图布局 */
  GRAPH_ORDER,
  GRAPH_VIEW,
  NODE_LAYOUT,
  /* 来源 */
  SOURCES,
  SOURCE_TYPES,
  getSource,
  sourceStats,
  isSourceReviewed,
  validateSources,
  /* 实验 */
  EXPERIMENTS,
  EXPERIMENT_OPEN_MODES,
  EXPERIMENT_STATUS,
  experimentByLabKind,
  experimentOfConcept,
  experimentStats,
  experimentsByChapter,
  getExperiment,
  isExperimentAvailable,
};

/* ==================================================================== *
 * 一、别名与检索
 * ==================================================================== */

/** 检索规范化：小写、去首尾空白、去掉空格与常见分隔符 */
export function normalizeQuery(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[\s\u3000._-]+/g, '');
}

/** 概念的全部检索字段（越靠前权重越高），供搜索与别名查询共用 */
function searchTokens(concept) {
  return [
    { weight: 4, text: concept.id },
    { weight: 4, text: concept.name },
    { weight: 4, text: concept.cn },
    { weight: 3, text: concept.title?.zh },
    { weight: 3, text: concept.title?.en },
    ...concept.aliases.map((alias) => ({ weight: 3, text: alias })),
    { weight: 2, text: concept.chapterNo },
    { weight: 1, text: concept.chapterCn },
    { weight: 1, text: concept.chapterEn },
    { weight: 1, text: concept.tagline },
    { weight: 1, text: concept.oneLiner },
  ].filter((token) => token.text);
}

/**
 * 关键词检索：支持中英文名称、别名、大小写不敏感与部分匹配。
 * 空查询表示「清除搜索」，由调用方按 cleared 处理；零结果返回 empty=true。
 * 未完成正文的 outline 概念同样可被检索：它们出现在索引里，但不因此算已学完。
 */
export function searchConcepts(query, { includeOutline = true, chapterId = null } = {}) {
  const q = normalizeQuery(query);
  if (!q) return { query: '', cleared: true, empty: false, matches: [] };

  const matches = [];
  for (const id of CONCEPT_ORDER) {
    const concept = CONCEPTS[id];
    if (!includeOutline && concept.contentStatus === 'outline') continue;
    if (chapterId && concept.chapterId !== chapterId) continue;
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

  matches.sort(
    (a, b) => b.score - a.score || CONCEPT_ORDER.indexOf(a.concept.id) - CONCEPT_ORDER.indexOf(b.concept.id)
  );
  return { query: String(query), cleared: false, empty: matches.length === 0, matches };
}

/** 精确别名查询：返回概念或 null（章节页、术语链接用它，不做模糊匹配） */
export function getConceptByAlias(alias) {
  const q = normalizeQuery(alias);
  if (!q) return null;
  for (const id of CONCEPT_ORDER) {
    const concept = CONCEPTS[id];
    if (normalizeQuery(concept.id) === q || normalizeQuery(concept.cn) === q) return concept;
    if (concept.aliases.some((a) => normalizeQuery(a) === q)) return concept;
  }
  return null;
}

/* ==================================================================== *
 * 二、关系查询
 * ==================================================================== */

/** 某条边的两个端点都存在且不是自环 */
export function isEdgeResolvable(edge) {
  return !!getConcept(edge.sourceId) && !!getConcept(edge.targetId) && edge.sourceId !== edge.targetId;
}

/** 与某个概念直接相连的全部边（方向信息保留在 edge.directed 上） */
export function getRelations(conceptId) {
  return edgesOf(conceptId);
}

/**
 * 相关概念列表：**由边数据派生**，不另写一份可能对不上的清单。
 * 先按概念里人工写好的 related 提示排序，再由边数据补齐，
 * 保证「相关概念」入口一定能在图上或关系列表中对应到真实连线。
 */
export function relatedOf(conceptId) {
  const concept = getConcept(conceptId);
  if (!concept) return [];
  const edges = edgesOf(conceptId);
  const neighbors = new Set();
  for (const edge of edges) {
    const other = edge.sourceId === conceptId ? edge.targetId : edge.sourceId;
    if (getConcept(other)) neighbors.add(other);
  }
  const ordered = [];
  for (const hint of concept.related) if (neighbors.has(hint)) ordered.push(hint);
  for (const id of CONCEPT_ORDER) if (neighbors.has(id) && !ordered.includes(id)) ordered.push(id);
  return ordered.map((id) => ({
    concept: getConcept(id),
    edges: edges.filter((edge) => edge.sourceId === id || edge.targetId === id),
  }));
}

/** 「在系统中查看」的落点：core / tools / none（沿用 M0.3 语义） */
export function systemTargetOf(conceptId) {
  const concept = getConcept(conceptId);
  return concept ? concept.systemTarget : 'none';
}

/* ==================================================================== *
 * 三、可用性（内容状态 → 界面行为）
 * ==================================================================== */

/**
 * 概念的可用性快照：界面据此决定「能不能读正文 / 能不能开实验 / 显示什么提示」。
 * outline 概念依然**可访问**（有索引页），但没有正文、没有实验入口。
 */
export function conceptAvailability(conceptId) {
  const concept = getConcept(conceptId);
  if (!concept) return null;
  const statusMeta = CONTENT_STATUS[concept.contentStatus] || CONTENT_STATUS.outline;
  // 概念显式挂的实验优先；否则回退到「登记表里覆盖该概念的计划实验」
  const planned = concept.experimentId ? getExperiment(concept.experimentId) : experimentOfConcept(conceptId);
  const experiment = planned;
  const experimentReady = !!experiment && experiment.status === 'available' && canRunExperiment(concept.contentStatus);
  return {
    id: concept.id,
    status: concept.contentStatus,
    statusMeta,
    /** 索引页永远可访问：这是「不能出现假入口」与「不能只有空壳」之间的平衡 */
    indexed: true,
    hasBody: hasBody(concept.contentStatus),
    hasLayeredBody: hasBody(concept.contentStatus) && concept.understand.length > 0 && concept.inspect.length > 0,
    canRunExperiment: experimentReady,
    experiment: experimentReady ? experiment : null,
    plannedExperiment: experiment && !experimentReady ? experiment : null,
    plannedMilestone: concept.plannedMilestone || (experiment ? experiment.milestone : null),
  };
}

/* ==================================================================== *
 * 四、星图模型（只画已开放节点，避免把未审校节点画成已完成）
 * ==================================================================== */

/** 星图画布可绘制的节点与边：两端都必须有固定坐标 */
export function graphModel() {
  const nodes = GRAPH_ORDER.map((id) => getConcept(id)).filter(Boolean);
  const drawable = new Set(nodes.map((n) => n.id));
  const edges = RELATIONSHIPS.filter((edge) => drawable.has(edge.sourceId) && drawable.has(edge.targetId));
  return { nodes, edges, layout: NODE_LAYOUT, view: GRAPH_VIEW };
}

/** 图谱统计：画布节点数、画布边数、全量边数与按类型计数 */
export function graphStats() {
  const model = graphModel();
  const byType = {};
  for (const edge of RELATIONSHIPS) byType[edge.type] = (byType[edge.type] || 0) + 1;
  const canvasByType = {};
  for (const edge of model.edges) canvasByType[edge.type] = (canvasByType[edge.type] || 0) + 1;
  return {
    concepts: model.nodes.length,
    edges: model.edges.length,
    byType,
    canvasByType,
    totalConcepts: CONCEPT_ORDER.length,
    totalEdges: RELATIONSHIPS.length,
  };
}

/* ==================================================================== *
 * 五、统计与校验
 * ==================================================================== */

/** 章节就绪度：由章内概念的内容状态派生（与学习者个人进度无关） */
export function chapterReadiness(chapterId) {
  const list = getConceptsByChapter(chapterId);
  return {
    total: list.length,
    ready: list.filter((c) => hasBody(c.contentStatus)).length,
    outline: list.filter((c) => !hasBody(c.contentStatus)).length,
    published: list.filter((c) => c.contentStatus === 'published').length,
  };
}

export function knowledgeStats() {
  const byStatus = { outline: 0, draft: 0, reviewed: 0, published: 0 };
  for (const id of CONCEPT_ORDER) byStatus[CONCEPTS[id].contentStatus] += 1;
  const byType = {};
  for (const edge of RELATIONSHIPS) byType[edge.type] = (byType[edge.type] || 0) + 1;
  const chapters = CHAPTERS.map((chapter) => {
    const list = getConceptsByChapter(chapter.id);
    return {
      id: chapter.id,
      no: chapter.no,
      total: list.length,
      ready: list.filter((c) => hasBody(c.contentStatus)).length,
      outline: list.filter((c) => !hasBody(c.contentStatus)).length,
      experiments: experimentsByChapter(chapter.id).length,
    };
  });
  return {
    chapters: chapters.length,
    concepts: CONCEPT_ORDER.length,
    edges: RELATIONSHIPS.length,
    byStatus,
    byType,
    canvas: { nodes: graphModel().nodes.length, edges: graphModel().edges.length },
    chapterStats: chapters,
    experiments: experimentStats(),
    sources: Object.keys(SOURCES).length,
  };
}

const REQUIRED_CONCEPT_COUNT = { min: 30, max: 40 };
/** M1.2 交付范围：这三章的正文与来源必须达到「已审校」标准 */
const M12_CHAPTER_IDS = Object.freeze(['intelligence', 'context', 'connection']);
const LEGACY_CONCEPT_IDS = Object.freeze([
  'llm',
  'agent',
  'tool_calling',
  'tools',
  'api',
  'mcp',
  'skills',
  'rag',
  'workflow',
  'harness',
]);

/**
 * 知识层完整性校验（测试、开发期断言与自检脚本共用）。
 * 返回空数组表示数据自洽；任何一条 issue 都会让 A02–A14 验收失败。
 */
export function validateKnowledge() {
  const issues = [];
  const push = (code, extra = {}) => issues.push({ code, ...extra });

  /* ---------- 章节 ---------- */
  if (CHAPTERS.length !== 6) push('CHAPTER_COUNT', { value: CHAPTERS.length });
  if (new Set(CHAPTER_ORDER).size !== CHAPTER_ORDER.length) push('DUPLICATE_CHAPTER_ID');
  CHAPTERS.forEach((chapter, index) => {
    if (chapter.order !== index + 1) push('CHAPTER_ORDER_GAP', { id: chapter.id, value: chapter.order });
    if (chapter.no !== String(index + 1).padStart(2, '0')) push('CHAPTER_NO_MISMATCH', { id: chapter.id, value: chapter.no });
    if (!chapter.title?.zh || !chapter.title?.en) push('CHAPTER_TITLE_MISSING', { id: chapter.id });
    if (!chapter.question || chapter.question.length < 8) push('CHAPTER_QUESTION_WEAK', { id: chapter.id });
    if (!chapter.intro || chapter.intro.length < 24) push('CHAPTER_INTRO_THIN', { id: chapter.id });
    if (getChapter(chapter.id) !== chapter) push('CHAPTER_INDEX_BROKEN', { id: chapter.id });
    if (chapterIdByNo(chapter.no) !== chapter.id) push('CHAPTER_NO_LOOKUP_BROKEN', { id: chapter.id });
  });

  /* ---------- 概念数量与身份 ---------- */
  if (CONCEPT_ORDER.length < REQUIRED_CONCEPT_COUNT.min || CONCEPT_ORDER.length > REQUIRED_CONCEPT_COUNT.max) {
    push('CONCEPT_COUNT_OUT_OF_RANGE', { value: CONCEPT_ORDER.length });
  }
  if (new Set(CONCEPT_ORDER).size !== CONCEPT_ORDER.length) push('DUPLICATE_CONCEPT_ORDER');
  for (const legacyId of LEGACY_CONCEPT_IDS) {
    if (!CONCEPTS[legacyId]) push('LEGACY_CONCEPT_MISSING', { id: legacyId });
  }

  const chapterOrders = new Map();
  const aliasOwner = new Map();

  for (const id of CONCEPT_ORDER) {
    const concept = CONCEPTS[id];
    if (concept.id !== id) push('CONCEPT_ID_MISMATCH', { id });
    if (!getChapter(concept.chapterId)) push('CONCEPT_CHAPTER_INVALID', { id, value: concept.chapterId });
    if (!Number.isInteger(concept.order) || concept.order < 1) push('CONCEPT_ORDER_INVALID', { id, value: concept.order });
    if (!concept.title?.zh || !concept.title?.en) push('CONCEPT_TITLE_MISSING', { id });
    if (!concept.cn || !concept.name) push('CONCEPT_NAME_MISSING', { id });
    if (!concept.tagline || concept.tagline.length < 8) push('CONCEPT_TAGLINE_THIN', { id });
    if (!CONTENT_STATUS[concept.contentStatus]) push('CONCEPT_STATUS_INVALID', { id, value: concept.contentStatus });
    if (!Array.isArray(concept.aliases) || concept.aliases.length === 0) push('CONCEPT_ALIASES_MISSING', { id });

    const list = chapterOrders.get(concept.chapterId) || [];
    if (list.includes(concept.order)) push('CONCEPT_ORDER_DUPLICATE', { id, value: concept.order });
    chapterOrders.set(concept.chapterId, [...list, concept.order]);

    for (const alias of concept.aliases) {
      if (!alias || typeof alias !== 'string') {
        push('CONCEPT_ALIAS_INVALID', { id });
        continue;
      }
      const key = normalizeQuery(alias);
      if (!key) push('CONCEPT_ALIAS_EMPTY', { id });
      if (key === normalizeQuery(id)) continue; // 与自身 ID 相同不算冲突
      const owner = aliasOwner.get(key);
      if (owner && owner !== id) push('CONCEPT_ALIAS_CONFLICT', { value: `${owner} / ${id} » ${alias}` });
      else aliasOwner.set(key, id);
    }

    /* ---------- 状态与正文的一致性 ---------- */
    if (hasBody(concept.contentStatus)) {
      if (!concept.oneLiner || concept.oneLiner.length < 8) push('ONE_LINER_MISSING', { id });
      if (concept.understand.length === 0) push('UNDERSTAND_MISSING', { id });
      if (concept.inspect.length === 0) push('INSPECT_MISSING', { id });
      if (concept.misconceptions.length === 0) push('MISCONCEPTION_MISSING', { id });
      for (const item of concept.misconceptions) {
        if (!item.claim || !item.correction) push('MISCONCEPTION_INCOMPLETE', { id });
      }
      if (concept.example && (!concept.example.label || !concept.example.body)) push('EXAMPLE_INCOMPLETE', { id });
      if (concept.example && concept.example.isSimulated !== true) push('EXAMPLE_NOT_MARKED_SIMULATED', { id });
      if (!concept.sources.length) push('SOURCES_MISSING', { id });
      const reviewedSources = concept.sources.filter((ref) => getSource(ref)?.reviewed === true);
      if (reviewedSources.length === 0) push('SOURCES_UNREVIEWED', { id });
      /**
       * 本阶段（第 01–03 章）额外要求的来源与审校证据：
       *   · 必须至少有一条**已核验的外部来源**（A07：真实可核验，不接受只有仓库内文档）；
       *   · 必须写明审校日期（reviewedAt），便于交付文档逐条核对。
       * 第 04–06 章正文仍属 M1.3，不受这条约束影响。
       */
      if (M12_CHAPTER_IDS.includes(concept.chapterId)) {
        const externalReviewed = concept.sources.filter((ref) => {
          const source = getSource(ref);
          return source?.type === 'external' && source.reviewed === true;
        });
        if (externalReviewed.length === 0) push('EXTERNAL_SOURCE_MISSING', { id });
        if (!concept.reviewedAt) push('REVIEWED_AT_MISSING', { id });
      }
    } else {
      if (concept.understand.length || concept.inspect.length) push('OUTLINE_HAS_BODY', { id });
      if (!concept.plannedMilestone) push('OUTLINE_WITHOUT_MILESTONE', { id });
      if (concept.experimentId) push('OUTLINE_WITH_EXPERIMENT', { id });
    }

    for (const issue of validateSources(concept.sources)) push(issue.code, { ...issue, id });

    /* ---------- 实验入口 ---------- */
    if (concept.experimentId) {
      const experiment = getExperiment(concept.experimentId);
      if (!experiment) push('CONCEPT_EXPERIMENT_UNKNOWN', { id, value: concept.experimentId });
      else {
        if (experiment.status !== 'available') push('CONCEPT_EXPERIMENT_NOT_AVAILABLE', { id, value: concept.experimentId });
        if (!experiment.conceptIds.includes(concept.id)) push('CONCEPT_EXPERIMENT_NOT_LINKED', { id, value: concept.experimentId });
      }
      if (concept.contentStatus !== 'published') push('EXPERIMENT_ON_UNPUBLISHED_CONCEPT', { id });
    }

    /* ---------- 星图坐标 ---------- */
    if (concept.graph) {
      if (!GRAPH_ORDER.includes(concept.id)) push('GRAPH_NODE_NOT_IN_ORDER', { id });
      if (!hasBody(concept.contentStatus)) push('GRAPH_NODE_WITHOUT_BODY', { id });
      if (NODE_LAYOUT[concept.id]?.x !== concept.graph.x || NODE_LAYOUT[concept.id]?.y !== concept.graph.y) {
        push('GRAPH_LAYOUT_MISMATCH', { id });
      }
    } else if (GRAPH_ORDER.includes(concept.id)) {
      push('GRAPH_ORDER_NODE_WITHOUT_COORDS', { id });
    }
  }

  for (const id of GRAPH_ORDER) {
    if (!CONCEPTS[id]) push('GRAPH_ORDER_UNKNOWN_ID', { id });
  }

  /* ---------- 关系 ---------- */
  const edgeIds = new Set();
  const pairs = new Set();
  for (const edge of RELATIONSHIPS) {
    if (!edge.id) push('EDGE_ID_MISSING');
    else if (edgeIds.has(edge.id)) push('EDGE_ID_DUPLICATE', { value: edge.id });
    else edgeIds.add(edge.id);
    if (!getConcept(edge.sourceId)) push('EDGE_UNKNOWN_SOURCE', { id: edge.id, value: edge.sourceId });
    if (!getConcept(edge.targetId)) push('EDGE_UNKNOWN_TARGET', { id: edge.id, value: edge.targetId });
    if (edge.sourceId === edge.targetId) push('EDGE_SELF_LOOP', { id: edge.id });
    if (!RELATION_TYPES[edge.type]) push('EDGE_TYPE_INVALID', { id: edge.id, value: edge.type });
    if (!edge.description || edge.description.length < 20) push('EDGE_DESCRIPTION_THIN', { id: edge.id });
    if (typeof edge.directed !== 'boolean') push('EDGE_DIRECTION_MISSING', { id: edge.id });
    if (RELATION_TYPES[edge.type] && RELATION_TYPES[edge.type].directed !== edge.directed) {
      push('EDGE_DIRECTION_MISMATCH', { id: edge.id, value: edge.type });
    }
    const pairKey = [edge.sourceId, edge.targetId, edge.type].sort().join('|');
    if (pairs.has(pairKey)) push('EDGE_DUPLICATE_PAIR', { id: edge.id });
    else pairs.add(pairKey);
  }

  /* ---------- 相关提示与关系必须一致 ---------- */
  for (const id of CONCEPT_ORDER) {
    const concept = CONCEPTS[id];
    const neighbors = new Set();
    for (const edge of edgesOf(id)) neighbors.add(edge.sourceId === id ? edge.targetId : edge.sourceId);
    if (neighbors.size === 0) push('CONCEPT_WITHOUT_RELATION', { id });
    for (const hint of concept.related) {
      if (hint === id) push('CONCEPT_RELATED_SELF', { id });
      else if (!CONCEPTS[hint]) push('CONCEPT_RELATED_UNKNOWN', { value: `${id} → ${hint}` });
      else if (!neighbors.has(hint)) push('CONCEPT_RELATED_NOT_NEIGHBOR', { value: `${id} → ${hint}` });
    }
    if (!neighborConcepts(id)) push('NEIGHBOR_LOOKUP_FAILED', { id });
    if (!positionInChapter(id)) push('POSITION_LOOKUP_FAILED', { id });
    if (BY_CONCEPT.get(id)?.length !== edgesOf(id).length) push('EDGE_INDEX_MISMATCH', { id });
  }

  /* ---------- 来源表 ---------- */
  for (const issue of validateSources(Object.values(SOURCES).map((s) => s.id))) push(issue.code, issue);

  /* ---------- 实验登记表 ---------- */
  for (const experiment of EXPERIMENTS) {
    if (!getChapter(experiment.chapterId)) push('EXPERIMENT_CHAPTER_INVALID', { id: experiment.id, value: experiment.chapterId });
    if (experiment.status === 'available') {
      if (!EXPERIMENT_OPEN_MODES[experiment.openMode]) push('EXPERIMENT_OPEN_MODE_INVALID', { id: experiment.id, value: experiment.openMode });
      if (!getConcept(experiment.entryConceptId)) push('EXPERIMENT_ENTRY_UNKNOWN', { id: experiment.id, value: experiment.entryConceptId });
      else if (!experiment.conceptIds.includes(experiment.entryConceptId)) {
        push('EXPERIMENT_ENTRY_NOT_LINKED', { id: experiment.id, value: experiment.entryConceptId });
      }
      if (experiment.openMode === 'lab-workspace') {
        if (!experiment.labKind) push('EXPERIMENT_LAB_KIND_MISSING', { id: experiment.id });
        else if (experimentByLabKind(experiment.labKind)?.id !== experiment.id) push('EXPERIMENT_LAB_KIND_CONFLICT', { id: experiment.id, value: experiment.labKind });
      }
      for (const conceptId of experiment.conceptIds) {
        if (!getConcept(conceptId)) push('EXPERIMENT_CONCEPT_UNKNOWN', { id: experiment.id, value: conceptId });
      }
      /**
       * 「可操作」必须有真正的入口：独立工作区或知识页步骤。
       * 反过来，只有登记为可操作且概念已发布的实验，知识页才会显示运行按钮（见 conceptAvailability）。
       */
      if (!experiment.dataNote) push('EXPERIMENT_DATA_NOTE_MISSING', { id: experiment.id });
    } else if (experiment.openMode) {
      push('PLANNED_EXPERIMENT_WITH_OPEN_MODE', { id: experiment.id, value: experiment.openMode });
    }
  }
  for (const id of CONCEPT_ORDER) {
    const concept = CONCEPTS[id];
    if (concept.contentStatus !== 'published') continue;
    const experiment = concept.experimentId ? getExperiment(concept.experimentId) : experimentOfConcept(id);
    if (!experiment) push('PUBLISHED_CONCEPT_WITHOUT_EXPERIMENT', { id });
  }

  return issues;
}
