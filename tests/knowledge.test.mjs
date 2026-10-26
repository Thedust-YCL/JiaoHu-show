/**
 * tests/knowledge.test.mjs
 * ------------------------------------------------------------------
 * M1.1 知识架构层的自动测试（纯逻辑，无浏览器）：
 *   A02 六章完整 / A03 概念索引 / A04 M0 ID 兼容 / A05 归属有效
 *   A06 双语搜索 / A07 内容状态 / A08 分层模板 / A09 误区模板
 *   A10 实验链接 / A11 语义关系 / A12 关系方向 / A13 旧关系保留 / A14 来源诚实
 * ------------------------------------------------------------------
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHAPTERS,
  CHAPTER_ORDER,
  CONCEPTS,
  CONCEPT_ORDER,
  CONTENT_STATUS,
  CONTENT_STATUS_ORDER,
  EXPERIMENTS,
  EXPERIMENT_OPEN_MODES,
  EXPERIMENT_STATUS,
  GRAPH_ORDER,
  RELATIONSHIPS,
  RELATION_TYPES,
  SOURCES,
  canRunExperiment,
  chapterIdByNo,
  chapterReadiness,
  conceptAvailability,
  conceptsByChapter,
  experimentOfConcept,
  experimentByLabKind,
  experimentsByChapter,
  getChapter,
  getConcept,
  getConceptByAlias,
  getConceptsByChapter,
  getExperiment,
  hasBody,
  knowledgeStats,
  neighborConcepts,
  positionInChapter,
  searchConcepts,
  validateKnowledge,
  validateSources,
} from '../src/knowledge/index.js';
import { defineConcept } from '../src/knowledge/concepts/helpers.js';

/* ==================================================================== *
 * A01 数据自洽：统一校验器必须零问题
 * ==================================================================== */
test('A01 知识层：validateKnowledge() 返回零问题（章节 / 概念 / 关系 / 来源 / 实验全部自洽）', () => {
  assert.deepEqual(validateKnowledge(), []);
});

/* ==================================================================== *
 * A02 六章注册表
 * ==================================================================== */
test('A02 六章：恰好 6 个稳定 chapterId，顺序与编号固定', () => {
  assert.equal(CHAPTERS.length, 6);
  assert.deepEqual([...CHAPTER_ORDER], ['intelligence', 'context', 'connection', 'knowledge', 'runtime', 'reliability']);
  CHAPTERS.forEach((chapter, index) => {
    assert.equal(chapter.order, index + 1);
    assert.equal(chapter.no, String(index + 1).padStart(2, '0'));
    assert.ok(chapter.title.zh.length >= 2, chapter.id);
    assert.ok(/^[A-Z]{4,}$/.test(chapter.title.en), chapter.id);
    assert.ok(chapter.question.length >= 10, `${chapter.id} 核心问题`);
    assert.ok(chapter.intro.length >= 40, `${chapter.id} 简介`);
    assert.equal(getChapter(chapter.id), chapter);
    assert.equal(chapterIdByNo(chapter.no), chapter.id);
  });
  assert.equal(getChapter('nope'), null);
});

test('A02 六章：标题与 PRD 精简路线一致（中文名 / 英文名）', () => {
  const expected = [
    ['intelligence', '智能诞生', 'INTELLIGENCE'],
    ['context', '指令与上下文', 'CONTEXT'],
    ['connection', '外部能力', 'CONNECTION'],
    ['knowledge', '信息与方法', 'KNOWLEDGE'],
    ['runtime', '执行系统', 'RUNTIME'],
    ['reliability', '可靠性与边界', 'RELIABILITY'],
  ];
  for (const [id, zh, en] of expected) {
    const chapter = getChapter(id);
    assert.equal(chapter.title.zh, zh, id);
    assert.equal(chapter.title.en, en, id);
  }
});

/* ==================================================================== *
 * A03 概念索引
 * ==================================================================== */
test('A03 概念：30–40 个稳定概念，ID 唯一，建议规模 36', () => {
  assert.equal(CONCEPT_ORDER.length, 36);
  assert.ok(CONCEPT_ORDER.length >= 30 && CONCEPT_ORDER.length <= 40);
  assert.equal(new Set(CONCEPT_ORDER).size, CONCEPT_ORDER.length);
  assert.equal(Object.keys(CONCEPTS).length, CONCEPT_ORDER.length);
  for (const id of CONCEPT_ORDER) {
    const concept = CONCEPTS[id];
    assert.equal(concept.id, id);
    assert.ok(concept.title.zh && concept.title.en, id);
    assert.ok(concept.aliases.length >= 1, `${id} 别名`);
    assert.ok(CONTENT_STATUS[concept.contentStatus], `${id} 内容状态`);
    assert.ok(Number.isInteger(concept.order) && concept.order >= 1, `${id} order`);
    assert.match(concept.idx, /^\d{2}$/, id);
  }
});

test('A04 概念：M0.3 的 10 个稳定 ID 全部保留，且仍能按 ID 定位', () => {
  const legacy = ['llm', 'agent', 'tool_calling', 'tools', 'api', 'mcp', 'skills', 'rag', 'workflow', 'harness'];
  for (const id of legacy) {
    const concept = getConcept(id);
    assert.ok(concept, `缺少既有概念 ${id}`);
    assert.equal(concept.id, id);
    // 既有正文（M0.3 已审校）必须仍在
    assert.ok(concept.understand.length >= 2, `${id} 保留既有解释`);
    assert.ok(concept.misconceptions.length >= 1, `${id} 保留既有误解`);
    assert.ok(concept.graph, `${id} 保留星图坐标`);
  }
});

test('A05 归属：所有 concept.chapterId 指向合法章节，章内 order 唯一', () => {
  const seen = new Map();
  for (const id of CONCEPT_ORDER) {
    const concept = CONCEPTS[id];
    assert.ok(getChapter(concept.chapterId), `${id} → ${concept.chapterId}`);
    const list = seen.get(concept.chapterId) || [];
    assert.ok(!list.includes(concept.order), `${id} 章内 order 重复`);
    seen.set(concept.chapterId, [...list, concept.order]);
  }
  // 每章恰好 6 个概念，顺序从 1 开始连续
  for (const chapter of CHAPTERS) {
    const list = getConceptsByChapter(chapter.id);
    assert.equal(list.length, 6, chapter.id);
    assert.deepEqual(list.map((c) => c.order), [1, 2, 3, 4, 5, 6], chapter.id);
    const readiness = chapterReadiness(chapter.id);
    assert.equal(readiness.total, 6);
    assert.equal(readiness.ready + readiness.outline, 6);
  }
  // 全量 36 个概念按章节顺序排列，且 idx 连续
  assert.equal(CONCEPT_ORDER.length, conceptsByChapter().reduce((n, g) => n + g.concepts.length, 0));
  CONCEPT_ORDER.forEach((id, index) => {
    assert.equal(CONCEPTS[id].idx, String(index + 1).padStart(2, '0'));
  });
});

test('A05 归属：章内位置与相邻概念查询可用（含首尾边界）', () => {
  assert.deepEqual(positionInChapter('llm'), { index: 3, total: 6, siblingIds: ['ai', 'ml', 'llm', 'transformer', 'token', 'inference'] });
  assert.equal(positionInChapter('nope'), null);
  assert.equal(neighborConcepts('ai').prev, null);
  assert.equal(neighborConcepts('ai').next.id, 'ml');
  assert.equal(neighborConcepts('inference').next, null);
  assert.equal(neighborConcepts('llm').prev.id, 'ml');
});

/* ==================================================================== *
 * A06 双语与别名搜索
 * ==================================================================== */
test('A06 搜索：中文 / 英文 / 别名 / 大小写 / 部分匹配全部有效', () => {
  const cases = [
    ['LLM', 'llm'],
    ['大语言模型', 'llm'],
    ['LARGE LANGUAGE MODEL', 'llm'],
    ['机器学习', 'ml'],
    ['注意力机制', 'transformer'],
    ['上下文窗口', 'context_window'],
    ['系统提示', 'system_prompt'],
    ['提示注入', 'prompt_injection'],
    ['函数调用', 'function_calling'],
    ['协议服务端', 'mcp_server'],
    ['向量表示', 'embedding'],
    ['资料切分', 'chunking'],
    ['多智能体', 'multi_agent'],
    ['护栏', 'guardrails'],
    ['评估', 'evals'],
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

test('A06 搜索：部分匹配、空查询与零结果状态清晰', () => {
  const partial = searchConcepts('context');
  assert.ok(partial.matches.length >= 3, 'context 相关概念应能部分匹配');
  assert.equal(partial.cleared, false);
  assert.equal(partial.empty, false);

  const cleared = searchConcepts('  ');
  assert.equal(cleared.cleared, true);
  assert.deepEqual(cleared.matches, []);

  const none = searchConcepts('zzzz-not-a-concept');
  assert.equal(none.empty, true);
  assert.equal(none.cleared, false);
});

test('A06 搜索：可按章节限定范围，includeOutline 参数仍生效（M1.3 已无索引态概念）', () => {
  const onlyConnection = searchConcepts('工具', { chapterId: 'connection' });
  for (const match of onlyConnection.matches) assert.equal(match.concept.chapterId, 'connection');

  // M1.3 起六章 36 个概念全部有正文，因此「排除索引态」不会再筛掉任何结果；
  // 这里同时验证参数本身没有退化为「关掉搜索」。
  const outlineIds = CONCEPT_ORDER.filter((id) => CONCEPTS[id].contentStatus === 'outline');
  assert.deepEqual(outlineIds, [], 'M1.3 交付后不应再有只有索引的概念');
  const withOutline = searchConcepts('检索');
  const withoutOutline = searchConcepts('检索', { includeOutline: false });
  assert.ok(withOutline.matches.length > 0);
  assert.equal(withoutOutline.matches.length, withOutline.matches.length);
  assert.ok(withoutOutline.matches.every((m) => m.concept.contentStatus !== 'outline'));
});

test('A06 别名：精确别名查询返回概念，未知别名返回 null', () => {
  assert.equal(getConceptByAlias('工具调用')?.id, 'tool_calling');
  assert.equal(getConceptByAlias('TOOLCALL')?.id, 'tool_calling');
  assert.equal(getConceptByAlias('大模型')?.id, 'llm');
  assert.equal(getConceptByAlias('不存在的别名'), null);
  assert.equal(getConceptByAlias(''), null);
});

/* ==================================================================== *
 * A07 / A08 内容状态与分层模板
 * ==================================================================== */
test('A07 内容状态：四种状态齐全，且决定可用性', () => {
  assert.deepEqual([...CONTENT_STATUS_ORDER], ['outline', 'draft', 'reviewed', 'published']);
  assert.equal(hasBody('outline'), false);
  assert.equal(hasBody('draft'), true);
  assert.equal(hasBody('reviewed'), true);
  assert.equal(hasBody('published'), true);
  assert.equal(canRunExperiment('published'), true);
  assert.equal(canRunExperiment('reviewed'), false);

  const stats = knowledgeStats();
  assert.equal(stats.byStatus.draft, 0, '本轮没有未审校的草稿正文');
  // M1.3：六章 36 个概念全部有正文；其中 25 个挂了可操作实验（published），11 个仅正文（reviewed）
  assert.equal(stats.byStatus.published, 25, '六个实验覆盖的 25 个概念均为已发布');
  assert.equal(stats.byStatus.outline, 0, 'M1.3 交付后不再有只有索引的概念');
  assert.equal(stats.byStatus.reviewed, 11);
  assert.equal(stats.byStatus.published + stats.byStatus.reviewed + stats.byStatus.outline, 36);
});

test('A07 内容状态：reviewed 概念有正文但没有实验入口（不出现假按钮）', () => {
  const reviewed = CONCEPT_ORDER.map((id) => CONCEPTS[id]).filter((c) => c.contentStatus === 'reviewed');
  assert.equal(reviewed.length, 11);
  for (const concept of reviewed) {
    assert.ok(concept.understand.length > 0, concept.id);
    assert.ok(concept.inspect.length > 0, concept.id);
    assert.equal(concept.experimentId, null, `${concept.id} 不应声明实验入口`);
    const availability = conceptAvailability(concept.id);
    assert.equal(availability.hasBody, true, concept.id);
    assert.equal(availability.canRunExperiment, false, `${concept.id} 未发布就不能运行实验`);
    assert.equal(availability.indexed, true, '知识页仍然可访问');
    assert.equal(availability.statusMeta.id, 'reviewed');
  }
  // 反过来：published 概念必须能打开真实实验
  for (const concept of CONCEPT_ORDER.map((id) => CONCEPTS[id]).filter((c) => c.contentStatus === 'published')) {
    assert.equal(conceptAvailability(concept.id).canRunExperiment, true, concept.id);
  }
});

test('A08 分层模板：全部 36 个概念都有 UNDERSTAND 与 INSPECT 数据', () => {
  const bodyConcepts = CONCEPT_ORDER.map((id) => CONCEPTS[id]).filter((c) => hasBody(c.contentStatus));
  assert.equal(bodyConcepts.length, 36, 'M1.3 之后 36 个概念全部有正文');
  for (const concept of bodyConcepts) {
    assert.ok(concept.oneLiner.length >= 8, `${concept.id} 一句话解释`);
    assert.ok(concept.understand.length >= 1, `${concept.id} UNDERSTAND`);
    assert.ok(concept.inspect.length >= 3, `${concept.id} INSPECT 至少 3 条`);
    assert.ok(concept.sources.length >= 1, `${concept.id} 来源`);
    const availability = conceptAvailability(concept.id);
    assert.equal(availability.hasLayeredBody, true, concept.id);
  }
  assert.equal(CONCEPTS.tool_calling.contentStatus, 'published');
  assert.equal(conceptAvailability('tool_calling').canRunExperiment, true);
});

test('A09 误区模板：正文概念都有「误解 + 纠正」配对，缺字段不会造成模板崩溃', () => {
  for (const id of CONCEPT_ORDER) {
    const concept = CONCEPTS[id];
    for (const item of concept.misconceptions) {
      assert.ok(item.claim.length > 4, `${id} 误解`);
      assert.ok(item.correction.length > 8, `${id} 纠正`);
    }
  }
  const toolCalling = CONCEPTS.tool_calling;
  assert.ok(toolCalling.misconceptions.length >= 2);
  // 每个有正文的概念都必须至少一条「误解 + 纠正」
  for (const id of CONCEPT_ORDER) {
    const concept = CONCEPTS[id];
    if (hasBody(concept.contentStatus)) assert.ok(concept.misconceptions.length >= 1, `${id} 必须有常见误解`);
    if (concept.example) assert.equal(concept.example.isSimulated, true, `${id} 示例必须标注为本地示意`);
  }
  // 模板对「没有误解/示例」的条目仍然安全：用最小合法定义验证默认值
  const minimal = defineConcept({ id: 'unit-test-placeholder', chapterId: 'knowledge', order: 99, name: 'X', cn: '占位', contentStatus: 'reviewed' });
  assert.deepEqual([...minimal.misconceptions], []);
  assert.equal(minimal.example, null);
  assert.ok(CONCEPTS.llm.example && CONCEPTS.llm.example.isSimulated === true);
});

/* ==================================================================== *
 * A10 实验链接
 * ==================================================================== */
test('A10 实验：只有登记且状态为 available 的实验才算真实入口', () => {
  const stats = knowledgeStats().experiments;
  assert.equal(stats.total, 6);
  assert.equal(stats.available, 6, 'M1.3 起六个实验全部可操作');
  assert.equal(stats.planned, 0, '不再有「登记了但不能点」的实验');

  const available = EXPERIMENTS.filter((e) => e.status === 'available');
  assert.deepEqual(available.map((e) => e.id), [
    'exp-token-lab',
    'exp-context-lab',
    'exp-tool-calling-demo',
    'exp-retrieval-lab',
    'exp-agent-loop-lab',
    'exp-boundary-lab',
  ]);
  for (const experiment of available) {
    assert.ok(EXPERIMENT_OPEN_MODES[experiment.openMode], `${experiment.id} 必须声明真实打开方式`);
    assert.ok(experiment.entryConceptId, `${experiment.id} 必须有入口概念`);
    assert.ok(experiment.conceptIds.includes(experiment.entryConceptId), `${experiment.id} 入口概念必须在关联列表里`);
    assert.ok(experiment.dataNote, `${experiment.id} 必须写明数据来源`);
    assert.ok(experiment.milestone, `${experiment.id} 必须写明阶段`);
  }
  // 独立工作区实验必须声明 labKind（路由据此选择工厂），且一一对应
  const workspaceLabs = available.filter((e) => e.openMode === 'lab-workspace');
  assert.deepEqual(workspaceLabs.map((e) => e.labKind).sort(), ['context', 'knowledge', 'reliability', 'runtime', 'token']);
  for (const experiment of workspaceLabs) {
    assert.equal(experimentByLabKind(experiment.labKind)?.id, experiment.id, `${experiment.labKind} 必须唯一对应一个实验`);
  }
});

test('A10 实验：概念只能挂在真实可用的实验上，且入口与章节一致', () => {
  for (const id of CONCEPT_ORDER) {
    const concept = CONCEPTS[id];
    if (concept.experimentId) {
      const experiment = getExperiment(concept.experimentId);
      assert.ok(experiment, `${id} 指向未知实验`);
      assert.equal(experiment.status, 'available', `${id} 的实验室必须可用`);
      assert.equal(concept.contentStatus, 'published', `${id} 只有已发布概念才能挂实验`);
      assert.ok(experiment.conceptIds.includes(id), `${id} 必须在该实验的关联概念里`);
    }
  }
  assert.equal(experimentOfConcept('tool_calling')?.id, 'exp-tool-calling-demo');
  assert.equal(experimentOfConcept('llm'), null, '没有实验的概念必须返回 null');
  assert.equal(experimentOfConcept('token')?.id, 'exp-token-lab');
  assert.equal(experimentOfConcept('mcp')?.id, 'exp-tool-calling-demo');
  // M1.3：第 04–06 章的概念各自挂到对应实验
  assert.equal(experimentOfConcept('chunking')?.id, 'exp-retrieval-lab');
  assert.equal(experimentOfConcept('agent_loop')?.id, 'exp-agent-loop-lab');
  assert.equal(experimentOfConcept('permissions')?.id, 'exp-boundary-lab');
  assert.equal(conceptAvailability('retrieval').canRunExperiment, true);
  assert.equal(conceptAvailability('retrieval').experiment?.id, 'exp-retrieval-lab');
  // 每章各有实验登记，Lab 目录不会出现空章节
  for (const chapter of CHAPTERS) assert.ok(experimentsByChapter(chapter.id).length >= 1, chapter.id);
  // 每个实验的关联概念都必须真实存在；M1.3 三个新实验还要求同章归属
  const sameChapterRequired = new Set(['exp-retrieval-lab', 'exp-agent-loop-lab', 'exp-boundary-lab']);
  for (const experiment of EXPERIMENTS) {
    for (const conceptId of experiment.conceptIds) {
      const concept = getConcept(conceptId);
      assert.ok(concept, `${experiment.id} 关联了不存在的概念 ${conceptId}`);
      if (sameChapterRequired.has(experiment.id)) {
        assert.equal(concept.chapterId, experiment.chapterId, `${experiment.id} 跨章关联了 ${conceptId}`);
      }
    }
  }
});

/* ==================================================================== *
 * A11 / A12 关系语义
 * ==================================================================== */
test('A11 关系：端点存在、类型合法、说明有解释、无自环重复', () => {
  const ids = new Set();
  for (const edge of RELATIONSHIPS) {
    assert.ok(edge.id && !ids.has(edge.id), `关系 ID 重复：${edge.id}`);
    ids.add(edge.id);
    assert.ok(getConcept(edge.sourceId), `${edge.id} source 不存在`);
    assert.ok(getConcept(edge.targetId), `${edge.id} target 不存在`);
    assert.notEqual(edge.sourceId, edge.targetId, `${edge.id} 自环`);
    assert.ok(RELATION_TYPES[edge.type], `${edge.id} 类型非法`);
    assert.ok(edge.description.length >= 20, `${edge.id} 说明过短`);
    assert.equal(typeof edge.directed, 'boolean', edge.id);
  }
});

test('A12 关系：PART_OF 只有经得起推敲的三条，且方向是「部分 → 整体」', () => {
  const partOf = RELATIONSHIPS.filter((e) => e.type === 'PART_OF');
  assert.equal(partOf.length, 3);
  const pairs = partOf.map((e) => `${e.sourceId}>${e.targetId}`).sort();
  assert.deepEqual(pairs, ['mcp_server>mcp', 'ml>ai', 'system_prompt>instructions']);
  for (const edge of partOf) assert.equal(edge.directed, true, edge.id);
});

test('A12 关系：每个概念至少有一条关系，related 提示必须是真的邻居', () => {
  for (const id of CONCEPT_ORDER) {
    const neighbors = new Set();
    for (const edge of RELATIONSHIPS) {
      if (edge.sourceId === id) neighbors.add(edge.targetId);
      if (edge.targetId === id) neighbors.add(edge.sourceId);
    }
    assert.ok(neighbors.size >= 1, `${id} 是孤立概念`);
    for (const hint of CONCEPTS[id].related) assert.ok(neighbors.has(hint), `${id} 的 related 提示 ${hint} 不是邻居`);
  }
});

/* ==================================================================== *
 * A13 旧关系保留
 * ==================================================================== */
test('A13 关系：M0.3 的 10 条关系与语义标记完整迁移到统一数据源', () => {
  const legacyIds = [
    'rel-agent-llm',
    'rel-agent-tools',
    'rel-llm-toolcalling',
    'rel-toolcalling-tools',
    'rel-tools-api',
    'rel-mcp-tools',
    'rel-agent-skills',
    'rel-agent-rag',
    'rel-workflow-agent',
    'rel-harness-agent',
  ];
  for (const id of legacyIds) {
    const edge = RELATIONSHIPS.find((e) => e.id === id);
    assert.ok(edge, `缺少 ${id}`);
    assert.equal(edge.origin, 'M0.3', id);
    assert.ok(edge.description.includes('；') || edge.description.includes('，'), `${id} 说明被改写`);
  }
  assert.equal(RELATIONSHIPS.filter((e) => e.origin === 'M0.3').length, 10);
  // M1.1 新增 37 条 + M1.2 新增 1 条（tool_calling ↔ mcp）+ M1.3 新增 1 条（agent_loop ↔ workflow 对照）
  assert.equal(RELATIONSHIPS.length, 49);
  assert.equal(RELATIONSHIPS.filter((e) => e.origin === 'M1.3').length, 1);
});

/* ==================================================================== *
 * A14 来源诚实
 * ==================================================================== */
test('A14 来源：没有伪造的外部链接，未审校来源被明确标记', () => {
  for (const [id, source] of Object.entries(SOURCES)) {
    assert.ok(source.title && source.title.length >= 4, id);
    if (source.type === 'external') {
      assert.match(String(source.url), /^https?:\/\//, `${id} 外部来源必须有可核验 URL`);
      assert.equal(source.reviewed, true, `${id} 外部来源必须已核验`);
    } else {
      assert.equal(source.url, null, `${id} 内部来源不应带 URL`);
      assert.ok(source.where, `${id} 内部来源必须写明仓库内位置`);
    }
  }
  // 索引草稿来源必须是 reviewed=false：未审校内容不能被当成正式引用
  assert.equal(SOURCES['src-index-draft'].reviewed, false);
  for (const id of CONCEPT_ORDER) {
    const concept = CONCEPTS[id];
    if (concept.contentStatus === 'outline') {
      assert.deepEqual([...concept.sources], ['src-index-draft'], `${id} 只能引用索引草稿`);
    } else {
      assert.ok(
        concept.sources.some((ref) => SOURCES[ref]?.reviewed === true),
        `${id} 已审校正文必须有已核验来源`
      );
    }
    assert.deepEqual(validateSources(concept.sources), [], id);
  }
  // 伪造来源 ID 必须被校验器挡住
  assert.deepEqual(validateSources(['fake-official-doc']).map((i) => i.code), ['UNKNOWN_SOURCE']);
});

/* ==================================================================== *
 * 星图节点集合的稳定性
 * ==================================================================== */
test('星图：GRAPH_ORDER 与知识层一致，且未把 outline 概念画进画布', () => {
  assert.equal(GRAPH_ORDER.length, 36);
  for (const id of GRAPH_ORDER) {
    const concept = getConcept(id);
    assert.ok(concept, id);
    assert.notEqual(concept.contentStatus, 'outline', id);
    assert.ok(concept.graph, id);
  }
  for (const id of CONCEPT_ORDER) {
    if (GRAPH_ORDER.includes(id)) continue;
    assert.equal(CONCEPTS[id].graph, null, `${id} 不应有画布坐标`);
  }
});
