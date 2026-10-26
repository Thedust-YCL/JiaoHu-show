/**
 * tests/atlas.test.mjs
 * ------------------------------------------------------------------
 * Atlas（知识星图）+ 学习进度的自动测试（纯逻辑，不需要浏览器）。
 *
 * M1.1 起知识数据统一到 src/knowledge/，本文件只保留「星图视图 + 学习进度」
 * 这一层的断言；章节 / 概念索引 / 关系 / 校验的完整断言在
 * tests/knowledge.test.mjs（A02–A14），学习迁移与隔离在
 * tests/learning-v2.test.mjs（A18–A20）。
 * ------------------------------------------------------------------
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONCEPTS,
  CONCEPT_ORDER,
  GRAPH_ORDER,
  NODE_LAYOUT,
  RELATIONSHIPS,
  RELATION_TYPES,
  edgesOf,
  getConcept,
  graphModel,
  graphStats,
  isEdgeResolvable,
  normalizeQuery,
  relatedOf,
  searchConcepts,
  systemTargetOf,
  validateKnowledge,
} from '../src/features/atlas/data/index.js';
import {
  LEARNING_STORAGE_KEY,
  LEGACY_LEARNING_KEYS,
  createLearningStore,
  deriveLearningLabel,
  parseLearning,
} from '../src/features/atlas/state/learning.js';
import { memoryStorage } from './helpers.mjs';

/* ==================================================================== *
 * 星图：只画已开放节点（M0.3 的 10 个节点原样保留）
 * ==================================================================== */
test('A16 星图：M1.4画布完整绘制36节点，保留旧节点且坐标固定唯一', () => {
  const model = graphModel();
  assert.deepEqual(model.nodes.map((n) => n.id), [...GRAPH_ORDER]);
  assert.equal(model.nodes.length, 36);
  assert.deepEqual(NODE_LAYOUT.llm, {x:240,y:88});
  assert.deepEqual(NODE_LAYOUT.mcp, {x:748,y:470});
  const points = new Set();
  for (const node of model.nodes) {
    const p = NODE_LAYOUT[node.id];
    assert.ok(p && Number.isFinite(p.x) && Number.isFinite(p.y), node.id);
    points.add(`${p.x},${p.y}`);
    // 画布节点必须真的有正文：不允许把未审校节点画成已完成
    assert.notEqual(node.contentStatus, 'outline', `${node.id} 不应画在星图上`);
  }
  assert.equal(points.size, model.nodes.length);
});

test('A16 星图：全量目录包含 36 个概念，但画布只取其中有坐标的 10 个', () => {
  assert.equal(CONCEPT_ORDER.length, 36);
  assert.equal(Object.keys(CONCEPTS).length, 36);
  for (const id of CONCEPT_ORDER) {
    const hasCoords = !!NODE_LAYOUT[id];
    assert.equal(hasCoords, GRAPH_ORDER.includes(id), `${id} 的坐标与画布顺序必须一致`);
  }
});

test('A16 星图：画布边只连接两个已开放节点，图是自洽的', () => {
  const model = graphModel();
  const drawable = new Set(model.nodes.map((n) => n.id));
  for (const edge of model.edges) {
    assert.ok(drawable.has(edge.sourceId), edge.id);
    assert.ok(drawable.has(edge.targetId), edge.id);
    assert.ok(isEdgeResolvable(edge), edge.id);
  }
  const stats = graphStats();
  assert.equal(stats.concepts, 36);
  assert.equal(stats.edges, model.edges.length);
  assert.equal(stats.totalConcepts, 36);
  assert.equal(stats.totalEdges, RELATIONSHIPS.length);
});

/* ==================================================================== *
 * 关系：端点、类型、方向
 * ==================================================================== */
test('A11 关系：全量关系自洽（端点存在、类型合法、说明充分、无自环无重复）', () => {
  assert.deepEqual(validateKnowledge(), []);
  for (const edge of RELATIONSHIPS) {
    assert.ok(isEdgeResolvable(edge), edge.id);
    assert.ok(edge.description.length >= 20, edge.id);
    assert.ok(RELATION_TYPES[edge.type], edge.id);
  }
});

test('A12 关系：方向标记与类型一致，RELATED / CONTRASTS 不被当成强依赖', () => {
  assert.equal(RELATION_TYPES.USES.directed, true);
  assert.equal(RELATION_TYPES.PART_OF.directed, true);
  assert.equal(RELATION_TYPES.RELATED.directed, false);
  assert.equal(RELATION_TYPES.CONTRASTS.directed, false);
  for (const edge of RELATIONSHIPS) {
    assert.equal(edge.directed, RELATION_TYPES[edge.type].directed, edge.id);
    if (edge.type === 'RELATED' || edge.type === 'CONTRASTS') {
      assert.equal(edge.directed, false, `${edge.id} 不应被画成严格单向因果`);
    }
  }
  // PART_OF 语义必须是「左侧是右侧的组成部分」，不能反向解释
  for (const edge of RELATIONSHIPS.filter((e) => e.type === 'PART_OF')) {
    assert.equal(edge.directed, true, edge.id);
    assert.ok(RELATION_TYPES.PART_OF.desc.includes('左侧'), 'PART_OF 类型说明必须写清方向');
  }
});

test('A13 关系：M0.3 的 10 条边原样保留（id / 端点 / 类型 / 方向不变）', () => {
  const legacy = [
    ['rel-agent-llm', 'agent', 'llm', 'USES'],
    ['rel-agent-tools', 'agent', 'tools', 'USES'],
    ['rel-llm-toolcalling', 'llm', 'tool_calling', 'RELATED'],
    ['rel-toolcalling-tools', 'tool_calling', 'tools', 'USES'],
    ['rel-tools-api', 'tools', 'api', 'RELATED'],
    ['rel-mcp-tools', 'mcp', 'tools', 'RELATED'],
    ['rel-agent-skills', 'agent', 'skills', 'RELATED'],
    ['rel-agent-rag', 'agent', 'rag', 'RELATED'],
    ['rel-workflow-agent', 'workflow', 'agent', 'CONTRASTS'],
    ['rel-harness-agent', 'harness', 'agent', 'RELATED'],
  ];
  for (const [id, sourceId, targetId, type] of legacy) {
    const edge = RELATIONSHIPS.find((e) => e.id === id);
    assert.ok(edge, `缺少 M0.3 关系 ${id}`);
    assert.equal(edge.sourceId, sourceId, id);
    assert.equal(edge.targetId, targetId, id);
    assert.equal(edge.type, type, id);
    assert.equal(edge.directed, RELATION_TYPES[type].directed, id);
    assert.equal(edge.origin, 'M0.3', id);
  }
});

test('A06 关系：relatedOf 只返回真实存在连线的概念（无悬空入口）', () => {
  const related = relatedOf('agent');
  assert.ok(related.length >= 4);
  for (const item of related) {
    assert.ok(item.concept, 'relatedOf 返回的概念必须存在');
    assert.ok(item.edges.length >= 1, `${item.concept.id} 必须至少有一条真实连线`);
  }
  const ids = related.map((r) => r.concept.id);
  assert.ok(ids.includes('llm'));
  assert.ok(ids.includes('skills'));
  assert.deepEqual(relatedOf('nope'), []);
});

test('A06 关系：每条边都能双向查询到，方向信息不丢失', () => {
  const incoming = edgesOf('agent');
  assert.ok(incoming.some((e) => e.sourceId === 'workflow' && e.type === 'CONTRASTS'));
  assert.ok(incoming.some((e) => e.sourceId === 'harness'));
  assert.ok(incoming.some((e) => e.targetId === 'llm' && e.type === 'USES'));
  assert.equal(systemTargetOf('unknown_concept'), 'none');
});

/* ==================================================================== *
 * 搜索
 * ==================================================================== */
test('A06 搜索：英文、大小写、去掉空格、中文别名都能定位', () => {
  const cases = [
    ['LLM', 'llm'],
    ['llm', 'llm'],
    ['Tool Calling', 'tool_calling'],
    ['TOOLCALLING', 'tool_calling'],
    ['tool call', 'tool_calling'],
    ['工具调用', 'tool_calling'],
    ['模型上下文协议', 'mcp'],
    ['检索增强生成', 'rag'],
    ['工作流', 'workflow'],
    // M1.1：'函数调用' 现在由独立概念 function_calling 承接（不再是 Tool Calling 的别名）
    ['函数调用', 'function_calling'],
    ['幻觉', 'hallucination'],
    ['沙箱', 'sandbox'],
    ['提示注入', 'prompt_injection'],
  ];
  for (const [query, expected] of cases) {
    const result = searchConcepts(query);
    assert.equal(result.empty, false, query);
    assert.equal(
      result.matches[0].concept.id,
      expected,
      `${query} → ${result.matches.map((m) => m.concept.id).join(',')}`
    );
  }
});

test('A06 搜索：部分匹配可用，空查询表示清除搜索并恢复全图', () => {
  const partial = searchConcepts('harness');
  assert.equal(partial.matches[0].concept.id, 'harness');
  const cleared = searchConcepts('   ');
  assert.equal(cleared.cleared, true);
  assert.deepEqual(cleared.matches, []);
  assert.equal(normalizeQuery(' Tool Calling '), 'toolcalling');
});

test('A06 搜索：无匹配时明确返回空结果，由界面显示「没有找到相关概念」', () => {
  const result = searchConcepts('量子纠缠');
  assert.equal(result.empty, true);
  assert.equal(result.cleared, false);
  assert.deepEqual(result.matches, []);
});

/* ==================================================================== *
 * 学习进度（v2）：多标志、独立持久化
 * ==================================================================== */
test('A18 学习进度：多个标志组合，不压成单一枚举', () => {
  const storage = memoryStorage();
  let tick = 1_700_000_000_000;
  const store = createLearningStore({ storage, now: () => (tick += 1000) });
  assert.equal(store.labelOf('tool_calling'), 'unexplored');

  store.markExplored('tool_calling');
  assert.equal(store.labelOf('tool_calling'), 'exploring');

  store.markRelatedDiscovered('tool_calling', 'tools');
  assert.equal(store.labelOf('tool_calling'), 'related_discovered');
  const flags = store.flagsOf('tool_calling');
  assert.equal(flags.explored, true);
  assert.deepEqual([...flags.relatedDiscoveredIds], ['tools']);

  store.markExperimentCompleted('tool_calling');
  assert.equal(store.labelOf('tool_calling'), 'experiment_completed');
  const after = store.flagsOf('tool_calling');
  assert.equal(after.explored, true);
  assert.equal(after.relatedDiscovered, true);
  assert.equal(after.experimentCompleted, true);
  assert.ok(after.visits >= 2);
  assert.ok(after.visitedAt > 0 && after.lastViewedAt > 0 && after.experimentCompletedAt > 0);
  assert.deepEqual([...after.experimentIds], ['exp-tool-calling-demo']);

  const summary = store.summary();
  assert.equal(summary.total, 36);
  assert.equal(summary.explored, 1);
  assert.equal(summary.experiments, 1);
  assert.equal(summary.related, 1);
});

test('A18 学习进度：写入 agent-zero:learning:v2，且不影响构建器命名空间', () => {
  const storage = memoryStorage({ 'agent-zero:constructor:v1': '{"schemaVersion":1,"modules":[]}' });
  const store = createLearningStore({ storage });
  store.markExplored('rag');
  assert.equal(storage.getItem('agent-zero:constructor:v1'), '{"schemaVersion":1,"modules":[]}');
  const raw = JSON.parse(storage.getItem(LEARNING_STORAGE_KEY));
  assert.equal(LEARNING_STORAGE_KEY, 'agent-zero:learning:v2');
  assert.equal(raw.schemaVersion, 2);
  assert.equal(raw.concepts.rag.explored, true);
  assert.equal(storage.keys().length, 2);
});

test('A18 学习进度：只有真实存在的实验才能被记为「已完成实验」', () => {
  const storage = memoryStorage();
  const logs = [];
  const store = createLearningStore({ storage, onLog: (kind, message, level) => logs.push([kind, message, level]) });
  // llm 已审校但没有实验：必须拒绝，且不写入实验标志
  assert.equal(store.markExperimentCompleted('llm'), false);
  assert.equal(store.flagsOf('llm').experimentCompleted, false);
  assert.equal(logs.length, 1);
  // M1.3 起 36 个概念都有正文，但只有挂了可操作实验的 25 个能记录：
  // 没有任何实验的 reviewed 概念（如 llm / transformer）必须一律拒绝
  assert.equal(store.markExperimentCompleted('transformer'), false);
  // 有可用实验的 Tool Calling 可以记录
  assert.equal(store.markExperimentCompleted('tool_calling'), true);
  // M1.2 新增的 Lab 01 / Lab 02 入口概念也可以记录（它们登记了真实实验）
  assert.equal(store.markExperimentCompleted('token'), true);
  assert.equal(store.markExperimentCompleted('context_engineering'), true);
  // M1.3 三个实验的入口概念同样可以记录
  assert.equal(store.markExperimentCompleted('chunking'), true);
  assert.equal(store.markExperimentCompleted('agent_loop'), true);
  assert.equal(store.markExperimentCompleted('permissions'), true);
  assert.equal(logs.length, 2, '只有被拒绝的调用才写日志');
});

test('A20 学习进度：未知 conceptId 不会被写入，且给出可读提示', () => {
  const storage = memoryStorage();
  const logs = [];
  const store = createLearningStore({ storage, onLog: (kind, message, level) => logs.push([kind, message, level]) });
  assert.equal(store.markExplored('not_a_concept'), false);
  assert.equal(storage.getItem(LEARNING_STORAGE_KEY), null);
  assert.equal(logs.length, 1);
});

test('A20 学习进度：损坏数据安全降级为从零开始，并提示', () => {
  const storage = memoryStorage();
  storage.setItem(LEARNING_STORAGE_KEY, '{ broken');
  const store = createLearningStore({ storage });
  assert.equal(store.notice.code, 'LEARNING_STORAGE_CORRUPT');
  assert.deepEqual(store.getState().concepts, {});
  store.markExplored('llm');
  assert.equal(store.labelOf('llm'), 'exploring');
});

test('A20 学习进度：只接受已知概念，丢弃未知键与错误形状（不清空其它记录）', () => {
  const parsed = parseLearning(
    JSON.stringify({ schemaVersion: 2, concepts: { llm: { explored: true }, ghost: { explored: true }, rag: 'nope' } })
  );
  assert.deepEqual(Object.keys(parsed.concepts), ['llm']);
  assert.equal(parsed.notice.code, 'LEARNING_STORAGE_PARTIAL');
});

test('A18 学习进度：重置只清除自己的命名空间', () => {
  const storage = memoryStorage({ 'agent-zero:constructor:v1': 'keep-me' });
  const store = createLearningStore({ storage });
  store.markExplored('mcp');
  store.reset();
  assert.deepEqual(JSON.parse(storage.getItem(LEARNING_STORAGE_KEY)).concepts, {});
  assert.equal(createLearningStore({storage}).summary().explored,0);
  assert.equal(storage.getItem('agent-zero:constructor:v1'), 'keep-me');
});

test('A19 学习进度：旧键名保持可迁移（v1 → v2），旧数据不被删除', () => {
  assert.deepEqual([...LEGACY_LEARNING_KEYS], ['agent-zero:learning:v1']);
  const legacyPayload = JSON.stringify({ schemaVersion: 1, concepts: { tool_calling: { explored: true, visits: 3 } } });
  const storage = memoryStorage({ 'agent-zero:learning:v1': legacyPayload });
  const store = createLearningStore({ storage });
  assert.equal(store.migratedFrom, 'agent-zero:learning:v1');
  assert.equal(store.labelOf('tool_calling'), 'exploring');
  assert.equal(storage.getItem('agent-zero:learning:v1'), legacyPayload, '旧键必须原样保留');
  assert.ok(storage.getItem(LEARNING_STORAGE_KEY), '新键应写入迁移结果');
});

test('deriveLearningLabel：标志优先级稳定', () => {
  assert.equal(deriveLearningLabel(null), 'unexplored');
  assert.equal(deriveLearningLabel({ explored: false }), 'unexplored');
  assert.equal(deriveLearningLabel({ explored: true }), 'exploring');
  assert.equal(deriveLearningLabel({ explored: true, relatedDiscovered: true }), 'related_discovered');
  assert.equal(deriveLearningLabel({ explored: true, relatedDiscovered: true, experimentCompleted: true }), 'experiment_completed');
});

test('getConcept：未知标识返回 null，不抛异常', () => {
  assert.equal(getConcept('nope'), null);
  assert.equal(getConcept('__proto__'), null);
  assert.equal(getConcept('llm').name, 'LLM');
});
