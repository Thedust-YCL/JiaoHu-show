/**
 * tests/atlas.test.mjs
 * ------------------------------------------------------------------
 * M0.3 知识图谱层的自动测试（纯逻辑，不需要浏览器）：
 *   · 10 个首期节点、唯一 ID、固定顺序与固定布局
 *   · 关系端点必须存在、类型合法、方向标记与类型一致、无悬空关系
 *   · 中英文别名 / 大小写 / 部分匹配检索，空结果与清除搜索
 *   · 学习进度独立持久化、损坏降级，且不触碰构建器命名空间
 * ------------------------------------------------------------------
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONCEPTS,
  CONCEPT_ORDER,
  NODE_LAYOUT,
  RELATIONSHIPS,
  RELATION_TYPES,
  edgesOf,
  getConcept,
  graphStats,
  isEdgeResolvable,
  normalizeQuery,
  relatedOf,
  searchConcepts,
  systemTargetOf,
  validateGraph,
} from '../src/features/atlas/data/index.js';
import {
  LEARNING_STORAGE_KEY,
  createLearningStore,
  deriveLearningLabel,
  parseLearning,
} from '../src/features/atlas/state/learning.js';
import { memoryStorage } from './helpers.mjs';

/* ==================================================================== *
 * A01 / A02 节点与关系
 * ==================================================================== */
test('A01 节点：恰好 10 个首期概念，ID 唯一且顺序固定', () => {
  const ids = Object.keys(CONCEPTS);
  assert.equal(ids.length, 10);
  assert.deepEqual(CONCEPT_ORDER, ['llm', 'agent', 'tool_calling', 'tools', 'api', 'mcp', 'skills', 'rag', 'workflow', 'harness']);
  assert.deepEqual([...ids].sort(), [...CONCEPT_ORDER].sort());
  assert.equal(new Set(ids).size, 10);
});

test('A01 节点：每个概念都有定义、解释、误解、相关概念与后续提示', () => {
  for (const id of CONCEPT_ORDER) {
    const c = CONCEPTS[id];
    assert.equal(c.id, id);
    assert.ok(c.name && c.cn, id);
    assert.ok(c.tagline.length > 8 && c.tagline.length <= 40, `${id} tagline 长度 ${c.tagline.length}`);
    assert.ok(c.understand.length >= 2, `${id} 解释段落`);
    assert.ok(c.misconceptions.length >= 1, `${id} 常见误解`);
    assert.ok(c.related.length >= 1, `${id} 相关概念`);
    assert.ok(c.nextSteps.length > 10, `${id} 后续提示`);
    assert.ok(['core', 'tools', 'none'].includes(c.systemTarget), id);
  }
  // 只有 tool_calling 是本轮唯一拥有完整分层知识页的节点，但节点数据本身都完整
  assert.equal(CONCEPTS.tool_calling.understand.length, 3);
});

test('A01 节点：固定布局覆盖全部节点且坐标唯一（刷新不会重排）', () => {
  const points = new Set();
  for (const id of CONCEPT_ORDER) {
    const p = NODE_LAYOUT[id];
    assert.ok(p && Number.isFinite(p.x) && Number.isFinite(p.y), id);
    points.add(`${p.x},${p.y}`);
  }
  assert.equal(points.size, CONCEPT_ORDER.length);
});

test('A02 关系：图是自洽的（端点存在、类型合法、无悬空、无自环）', () => {
  assert.deepEqual(validateGraph(), []);
  assert.equal(RELATIONSHIPS.length, 10);
  for (const edge of RELATIONSHIPS) {
    assert.ok(isEdgeResolvable(edge), edge.id);
    assert.ok(edge.description.length >= 20, edge.id);
  }
});

test('A02 关系：类型与方向标记一致，且没有为填满样式而编造 PART_OF', () => {
  const stats = graphStats();
  assert.deepEqual(stats.byType, { USES: 3, RELATED: 6, CONTRASTS: 1 });
  assert.equal(stats.byType.PART_OF, undefined);
  assert.equal(RELATION_TYPES.PART_OF.directed, true);
  for (const edge of RELATIONSHIPS) {
    assert.equal(edge.directed, RELATION_TYPES[edge.type].directed, edge.id);
    if (edge.type === 'RELATED' || edge.type === 'CONTRASTS') {
      assert.equal(edge.directed, false, `${edge.id} 不应被画成严格单向因果`);
    }
  }
});

test('A06 关系：relatedOf 只返回图上真实存在连线的概念（无悬空入口）', () => {
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
 * A03 搜索
 * ==================================================================== */
test('A03 搜索：英文、大小写、去掉空格、中文别名都能定位', () => {
  const cases = [
    ['LLM', 'llm'],
    ['llm', 'llm'],
    ['Tool Calling', 'tool_calling'],
    ['TOOLCALLING', 'tool_calling'],
    ['tool call', 'tool_calling'],
    ['工具调用', 'tool_calling'],
    ['函数调用', 'tool_calling'],
    ['模型上下文协议', 'mcp'],
    ['检索增强生成', 'rag'],
    ['工作流', 'workflow'],
  ];
  for (const [query, expected] of cases) {
    const result = searchConcepts(query);
    assert.equal(result.empty, false, query);
    assert.equal(result.matches[0].concept.id, expected, `${query} → ${result.matches.map((m) => m.concept.id).join(',')}`);
  }
});

test('A03 搜索：部分匹配可用，空查询表示清除搜索并恢复全图', () => {
  const partial = searchConcepts('harness');
  assert.equal(partial.matches[0].concept.id, 'harness');
  const cleared = searchConcepts('   ');
  assert.equal(cleared.cleared, true);
  assert.deepEqual(cleared.matches, []);
  assert.equal(normalizeQuery(' Tool Calling '), 'toolcalling');
});

test('A03 搜索：无匹配时明确返回空结果，由界面显示「没有找到相关概念」', () => {
  const result = searchConcepts('量子纠缠');
  assert.equal(result.empty, true);
  assert.equal(result.cleared, false);
  assert.deepEqual(result.matches, []);
});

/* ==================================================================== *
 * A09 学习进度独立持久化
 * ==================================================================== */
test('学习进度：多个标志组合，不压成单一枚举', () => {
  const storage = memoryStorage();
  const store = createLearningStore({ storage });
  assert.equal(store.labelOf('tool_calling'), 'unexplored');

  store.markExplored('tool_calling');
  assert.equal(store.labelOf('tool_calling'), 'exploring');

  store.markRelatedDiscovered('tool_calling');
  assert.equal(store.labelOf('tool_calling'), 'related_discovered');
  assert.equal(store.flagsOf('tool_calling').explored, true);

  store.markExperimentCompleted('tool_calling');
  assert.equal(store.labelOf('tool_calling'), 'experiment_completed');
  assert.deepEqual(
    { ...store.flagsOf('tool_calling') },
    { explored: true, relatedDiscovered: true, experimentCompleted: true, visits: 2 }
  );

  const summary = store.summary();
  assert.equal(summary.total, 10);
  assert.equal(summary.explored, 1);
  assert.equal(summary.experiments, 1);
});

test('学习进度：写入 agent-zero:learning:v1，且不影响构建器命名空间', () => {
  const storage = memoryStorage({ 'agent-zero:constructor:v1': '{"schemaVersion":1,"modules":[]}' });
  const store = createLearningStore({ storage });
  store.markExplored('rag');
  assert.equal(storage.getItem('agent-zero:constructor:v1'), '{"schemaVersion":1,"modules":[]}');
  const raw = JSON.parse(storage.getItem(LEARNING_STORAGE_KEY));
  assert.equal(raw.schemaVersion, 1);
  assert.equal(raw.concepts.rag.explored, true);
  assert.equal(storage.keys().length, 2);
});

test('学习进度：未知 conceptId 不会被写入，且给出可读提示', () => {
  const storage = memoryStorage();
  const logs = [];
  const store = createLearningStore({ storage, onLog: (kind, message, level) => logs.push([kind, message, level]) });
  assert.equal(store.markExplored('not_a_concept'), false);
  assert.equal(storage.getItem(LEARNING_STORAGE_KEY), null);
  assert.equal(logs.length, 1);
});

test('学习进度：损坏数据安全降级为从零开始，并提示', () => {
  const storage = memoryStorage();
  storage.setItem(LEARNING_STORAGE_KEY, '{ broken');
  const store = createLearningStore({ storage });
  assert.equal(store.notice.code, 'LEARNING_STORAGE_CORRUPT');
  assert.deepEqual(store.getState().concepts, {});
  store.markExplored('llm');
  assert.equal(store.labelOf('llm'), 'exploring');
});

test('学习进度：只接受已知概念，丢弃未知键与错误形状', () => {
  const parsed = parseLearning(
    JSON.stringify({ schemaVersion: 1, concepts: { llm: { explored: true }, ghost: { explored: true }, rag: 'nope' } })
  );
  assert.deepEqual(Object.keys(parsed.concepts), ['llm']);
  assert.equal(parsed.notice.code, 'LEARNING_STORAGE_PARTIAL');
});

test('学习进度：重置只清除自己的命名空间', () => {
  const storage = memoryStorage({ 'agent-zero:constructor:v1': 'keep-me' });
  const store = createLearningStore({ storage });
  store.markExplored('mcp');
  store.reset();
  assert.equal(storage.getItem(LEARNING_STORAGE_KEY), null);
  assert.equal(storage.getItem('agent-zero:constructor:v1'), 'keep-me');
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
