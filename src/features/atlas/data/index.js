/**
 * src/features/atlas/data/index.js
 * ------------------------------------------------------------------
 * **兼容转发层**（M1.1）。
 *
 * M0.3 时期这里曾是 Atlas 的知识数据源，内含 10 个概念与 10 条关系。
 * M1.1 起统一知识层迁到 `src/knowledge/`，本文件只做导出转发，
 * 不再持有任何知识数据，避免出现「第二套知识系统」。
 *
 * 新代码请直接 import from '../../../knowledge/index.js'。
 * ------------------------------------------------------------------
 */
export {
  /* 章节 */
  CHAPTERS,
  CHAPTER_ORDER,
  getChapter,
  /* 概念（全量 36 个） */
  CONCEPTS,
  CONCEPT_ORDER,
  getConcept,
  getConceptsByChapter,
  conceptsByChapter,
  positionInChapter,
  neighborConcepts,
  /* 内容状态 */
  CONTENT_STATUS,
  CONTENT_STATUS_ORDER,
  hasBody,
  canRunExperiment,
  conceptAvailability,
  /* 关系（全量 47 条） */
  RELATIONSHIPS,
  RELATION_TYPES,
  RELATION_TYPE_ORDER,
  relationMeta,
  edgesOf,
  getRelationship,
  getRelations,
  isEdgeResolvable,
  relatedOf,
  systemTargetOf,
  /* 检索 */
  normalizeQuery,
  searchConcepts,
  getConceptByAlias,
  /* 星图（只画已开放节点） */
  GRAPH_ORDER,
  GRAPH_VIEW,
  NODE_LAYOUT,
  graphModel,
  graphStats,
  /* 实验登记 */
  EXPERIMENTS,
  EXPERIMENT_STATUS,
  experimentOfConcept,
  experimentStats,
  experimentsByChapter,
  getExperiment,
  isExperimentAvailable,
  /* 来源登记 */
  SOURCES,
  SOURCE_TYPES,
  getSource,
  validateSources,
  /* 汇总与校验 */
  chapterReadiness,
  knowledgeStats,
  validateKnowledge,
} from '../../../knowledge/index.js';

/**
 * @deprecated M0.3 的图校验名；请使用 validateKnowledge()。
 * 保留导出只为让旧调用点与旧测试能平滑迁移，等价于完整知识层校验。
 */
export { validateKnowledge as validateGraph } from '../../../knowledge/index.js';
