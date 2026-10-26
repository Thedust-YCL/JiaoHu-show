/**
 * tests/m13-content.test.mjs
 * ------------------------------------------------------------------
 * M1.3 内容层与跨页面联动的静态测试（A02–A08 / A30）。
 *
 * 重点不是「有没有字段」，而是任务书 §3 的 18 条技术准确性红线：
 * 逐条检查第 04–06 章的正文与示例里是否出现被禁止的说法
 * （例如把关键词匹配说成语义检索、把界面演示说成真实安全边界）。
 * ------------------------------------------------------------------
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHAPTERS,
  CONCEPTS,
  EXPERIMENTS,
  SOURCES,
  conceptAvailability,
  getChapter,
  getConcept,
  getConceptsByChapter,
  getConceptByAlias,
  getExperiment,
  relatedOf,
  validateKnowledge,
  validateSources,
} from '../src/knowledge/index.js';
import { CHAPTER_STORIES, getChapterStory } from '../src/content/chapters/index.js';

const M13_CONCEPTS = Object.freeze({
  knowledge: ['chunking', 'retrieval', 'embedding', 'rag', 'memory', 'skills'],
  runtime: ['agent', 'agent_loop', 'workflow', 'harness', 'orchestration', 'multi_agent'],
  reliability: ['permissions', 'sandbox', 'prompt_injection', 'guardrails', 'tracing', 'evals'],
});

const M13_EXPERIMENTS = Object.freeze({
  knowledge: 'exp-retrieval-lab',
  runtime: 'exp-agent-loop-lab',
  reliability: 'exp-boundary-lab',
});

const fullTextOf = (concept) =>
  [concept.oneLiner, ...concept.understand, ...concept.inspect, concept.example?.body || '', ...concept.misconceptions.map((m) => m.correction)].join('\n');

/* ==================================================================== *
 * 一、覆盖与归属（A02 / A03 / A04）
 * ==================================================================== */
test('A02 章节：第 04–06 章正确注册，编号与标题稳定', () => {
  const expected = [
    ['knowledge', '04', '信息与方法', 'KNOWLEDGE'],
    ['runtime', '05', '执行系统', 'RUNTIME'],
    ['reliability', '06', '可靠性与边界', 'RELIABILITY'],
  ];
  for (const [id, no, zh, en] of expected) {
    const chapter = getChapter(id);
    assert.ok(chapter, id);
    assert.equal(chapter.no, no);
    assert.equal(chapter.title.zh, zh);
    assert.equal(chapter.title.en, en);
    assert.equal(chapter.contentMilestone, 'M1.3');
  }
  assert.equal(CHAPTERS.length, 6);
});

test('A03 概念覆盖：18 个稳定 ID 全部存在、归属正确、顺序固定', () => {
  let total = 0;
  for (const [chapterId, ids] of Object.entries(M13_CONCEPTS)) {
    const actual = getConceptsByChapter(chapterId).map((c) => c.id);
    assert.deepEqual(actual, ids, `${chapterId} 概念清单或顺序变化`);
    total += ids.length;
    for (const id of ids) {
      const concept = getConcept(id);
      assert.ok(concept, id);
      assert.equal(concept.chapterId, chapterId);
    }
  }
  assert.equal(total, 18);
});

test('A04 ID 兼容：M0 / M1.1 / M1.2 的持久化 ID 与别名仍可解析', () => {
  // M0.3 的十个稳定 ID
  for (const id of ['llm', 'agent', 'tool_calling', 'tools', 'api', 'mcp', 'skills', 'rag', 'workflow', 'harness']) {
    assert.ok(getConcept(id), `${id} 不得被重命名或删除`);
  }
  // 第 04–06 章沿用 M1.1 的 ID（不做破坏性重命名）
  for (const ids of Object.values(M13_CONCEPTS)) for (const id of ids) assert.ok(CONCEPTS[id], id);
  // 别名仍能定位（深链与搜索依赖它）
  assert.equal(getConceptByAlias('检索')?.id, 'retrieval');
  assert.equal(getConceptByAlias('提示注入')?.id, 'prompt_injection');
  assert.equal(getConceptByAlias('沙箱')?.id, 'sandbox');
  assert.equal(getConceptByAlias('执行循环')?.id, 'agent_loop');
});

/* ==================================================================== *
 * 二、分层内容与来源（A05 / A06）
 * ==================================================================== */
test('A05 分层内容：18 个概念都有 UNDERSTAND / INSPECT / 例子 / 误解 / 关系', () => {
  for (const ids of Object.values(M13_CONCEPTS)) {
    for (const id of ids) {
      const concept = getConcept(id);
      assert.equal(concept.contentStatus, 'published', `${id} 必须已发布`);
      assert.ok(concept.oneLiner.length >= 20, `${id} 一句话定义`);
      assert.ok(concept.understand.length >= 2, `${id} UNDERSTAND 至少两段`);
      assert.ok(concept.understand.join('').length >= 120, `${id} UNDERSTAND 不能是敷衍的一句`);
      assert.ok(concept.inspect.length >= 4, `${id} INSPECT 至少四条`);
      assert.ok(concept.inspect.join('').length >= 200, `${id} INSPECT 不能是敷衍的几条`);
      assert.ok(concept.misconceptions.length >= 1, `${id} 至少一条常见误解`);
      for (const item of concept.misconceptions) {
        assert.ok(item.claim.length >= 8, `${id} 误解描述`);
        assert.ok(item.correction.length >= 40, `${id} 纠正必须讲清原因`);
      }
      assert.ok(concept.example, `${id} 必须有与虚构研究相关的例子`);
      assert.equal(concept.example.isSimulated, true, `${id} 例子必须标记为模拟`);
      assert.ok(concept.example.body.length >= 20, `${id} 例子正文`);
      assert.ok(concept.reviewedAt, `${id} 必须有审校日期`);
      assert.ok(concept.reviewNote, `${id} 必须写明审校范围`);
      // 与「虚构校园活动研究」直接相关
      const exampleText = `${concept.example.label}${concept.example.body}${concept.understand.join('')}`;
      assert.match(exampleText, /虚构|模拟/, `${id} 例子必须说明模拟性质`);
    }
  }
});

test('A06 来源：每个概念都有已核验外部来源，且来源元数据完整可核对', () => {
  for (const ids of Object.values(M13_CONCEPTS)) {
    for (const id of ids) {
      const concept = getConcept(id);
      assert.ok(concept.sources.length >= 1, id);
      assert.deepEqual(validateSources(concept.sources), [], id);
      const external = concept.sources.filter((ref) => SOURCES[ref]?.type === 'external');
      assert.ok(external.length >= 1, `${id} 必须有至少一条外部来源`);
      for (const ref of external) {
        const source = SOURCES[ref];
        assert.equal(source.reviewed, true, `${ref} 必须已核验`);
        assert.match(source.url, /^https:\/\//, ref);
        assert.ok(source.org, `${ref} 必须写明组织/作者`);
        assert.ok(source.versionOrDate, `${ref} 必须写明版本或日期`);
        assert.ok(source.checkedAt, `${ref} 必须写明核验时间`);
        assert.ok(source.claim.length >= 20, `${ref} 必须写清支持哪一句断言`);
      }
    }
  }
});

test('A06 来源：核验日期不晚于本次交付日期，且不存在「待核验却标记已审校」', () => {
  for (const source of Object.values(SOURCES)) {
    if (source.type !== 'external') continue;
    assert.equal(source.reviewed, true, `${source.id} 外部来源必须已核验`);
    assert.match(source.checkedAt, /^\d{4}-\d{2}-\d{2}$/, source.id);
    assert.ok(source.checkedAt <= '2026-10-25', `${source.id} 核验日期不应晚于本轮M1.4交付日`);
  }
  // 内部草稿来源不得出现在已发布概念里
  for (const id of Object.values(M13_CONCEPTS).flat()) {
    assert.ok(!getConcept(id).sources.includes('src-index-draft'), `${id} 不得再引用未审校草稿`);
  }
});

/* ==================================================================== *
 * 三、技术准确性红线（A07）
 * ==================================================================== */
test('A07 Retrieval：明确区分关键词与向量检索，不把字符串匹配说成语义检索', () => {
  const text = fullTextOf(getConcept('retrieval'));
  assert.match(text, /关键词检索/);
  assert.match(text, /向量检索/);
  assert.match(text, /不是同一件事|不同方法|不同/);
  assert.match(text, /字符串匹配只是关键词检索一种实现/);
});

test('A07 Chunking：说明切分影响上下文完整性与检索结果，且不假称 token', () => {
  const concept = getConcept('chunking');
  const text = fullTextOf(concept);
  assert.match(text, /片段/);
  assert.match(text, /语义边界|边界/);
  assert.match(text, /不声称等于任何模型的分词结果|不以 token|字符/);
});

test('A07 Embedding：明确标注为预计算 / 二维示意，不声称浏览器调用了模型', () => {
  const concept = getConcept('embedding');
  const text = fullTextOf(concept);
  assert.match(text, /预计算的二维示例向量|人工设定的演示坐标/);
  assert.match(text, /浏览器里没有任何 Embedding 模型|浏览器内没有任何/);
  assert.match(concept.example.body, /人工设定|不是任何模型/);
});

test('A07 RAG：不把 RAG 等同于向量数据库，且检索命中不等于答案正确', () => {
  const text = fullTextOf(getConcept('rag'));
  assert.match(text, /不等于向量数据库|向量数据库只是/);
  assert.match(text, /检索命中|引用只能证明/);
  assert.match(text, /资料不足/);
});

test('A07 Memory：与当前上下文、RAG 检索结果明确区分', () => {
  const text = fullTextOf(getConcept('memory'));
  assert.match(text, /不等于当前上下文/);
  assert.match(text, /RAG/);
  assert.match(text, /靠外部存储|参数不会/);
});

test('A07 Skills：不授予工具权限，也不必然可执行', () => {
  const text = fullTextOf(getConcept('skills'));
  assert.match(text, /不授予工具权限|不自动授予/);
  assert.match(text, /资源被读取不等于被允许执行/);
});

test('A07 Agent / Workflow：控制权归属是区分标准，且不宣称谁更好', () => {
  const agent = fullTextOf(getConcept('agent'));
  const workflow = fullTextOf(getConcept('workflow'));
  assert.match(agent, /控制权/);
  assert.match(agent, /不代表 Agent 更强|不是优劣排序|这不意味着 Agent 更强/);
  assert.match(workflow, /预先编排|预先写定/);
  assert.match(workflow, /不是优劣排序|不是较低级|不是 Agent 的低配版/);
  // Workflow 不绝对化：明确允许存在分支
  assert.match(workflow, /条件分支|分支/);
});

test('A07 Agent Loop：写清终止条件，避免无限循环', () => {
  const text = fullTextOf(getConcept('agent_loop'));
  assert.match(text, /终止条件/);
  assert.match(text, /最大步数|步数上限/);
  assert.match(text, /重试上限/);
  assert.match(text, /循环必须能停下来|没有终止条件的循环/);
});

test('A07 Harness：明确不是另一个模型，也没有唯一实现', () => {
  const text = fullTextOf(getConcept('harness'));
  assert.match(text, /不是第二个模型|不产生语言判断/);
  assert.match(text, /上下文组装/);
  assert.match(text, /工具分派/);
});

test('A07 Orchestration / Multi-Agent：不把「多」说成「强」，也不伪装并发', () => {
  const orchestration = fullTextOf(getConcept('orchestration'));
  const multi = fullTextOf(getConcept('multi_agent'));
  assert.match(orchestration, /与单次工具调用|协调/);
  assert.match(orchestration, /不等于多智能体|参与者是谁/);
  assert.match(multi, /不保证|代价/);
  assert.match(multi, /并行|并发/);
  assert.match(multi, /按顺序交接|串行/);
});

test('A07 Permissions / Sandbox：授权规则与环境隔离互补，不宣称前端等于真实隔离', () => {
  const permissions = fullTextOf(getConcept('permissions'));
  const sandbox = fullTextOf(getConcept('sandbox'));
  assert.match(permissions, /执行侧强制|由执行环境/);
  assert.match(permissions, /默认拒绝|最小权限/);
  assert.match(sandbox, /不构成真实隔离|只做\*\*规则模拟\*\*|规则模拟/);
  assert.match(sandbox, /文件系统隔离|网络隔离/);
});

test('A07 Prompt Injection / Guardrails：不宣称关键词过滤或护栏能彻底防御', () => {
  const injection = fullTextOf(getConcept('prompt_injection'));
  const guardrails = fullTextOf(getConcept('guardrails'));
  assert.match(injection, /无法覆盖无限种表达|不能彻底|无法.*彻底/);
  assert.match(injection, /幻觉不是一回事|和幻觉不是/);
  assert.match(guardrails, /不应被描述成绝对安全保证|漏报|不是唯一防线/);
  // 全站正文不得出现「彻底防御」「100% 安全」这类**肯定式**断言；
  // 句中带否定词（不 / 无法 / 非 / 没有）的说明性句子不算
  const NEGATION = /不|无法|非|没有|避免|而非/;
  for (const ids of Object.values(M13_CONCEPTS)) {
    for (const id of ids) {
      const text = fullTextOf(getConcept(id))
        .split(/[。\n；]/)
        .filter((sentence) => sentence.trim() && !NEGATION.test(sentence));
      for (const sentence of text) {
        assert.doesNotMatch(sentence, /彻底防御|100%\s*安全|绝对安全/, `${id} 出现了绝对化断言：${sentence}`);
      }
    }
  }
});

test('A07 Tracing / Evals：区分模拟日志与真实遥测、单样例与全面评测', () => {
  const tracing = fullTextOf(getConcept('tracing'));
  const evals = fullTextOf(getConcept('evals'));
  assert.match(tracing, /不是真实模型遥测|本地模拟/);
  assert.match(tracing, /摘要/);
  assert.match(evals, /单个样例|不等于有统计意义|不能说明/);
  assert.match(evals, /可复现|确定性/);
});

/* ==================================================================== *
 * 四、关系与实验联动（A08 / A30）
 * ==================================================================== */
test('A08 关系：第 04–06 章的 related 提示都能对应真实连线（方向与语义明确）', () => {
  for (const ids of Object.values(M13_CONCEPTS)) {
    for (const id of ids) {
      const concept = getConcept(id);
      const related = relatedOf(id).map((item) => item.concept.id);
      assert.ok(related.length >= 1, `${id} 必须有语义关系`);
      for (const hint of concept.related) {
        assert.ok(related.includes(hint), `${id} → ${hint} 没有对应连线`);
      }
    }
  }
  // 关键语义对照关系必须存在
  const pairs = [
    ['rag', 'retrieval'],
    ['rag', 'embedding'],
    ['rag', 'chunking'],
    ['agent_loop', 'workflow'],
    ['permissions', 'sandbox'],
    ['permissions', 'guardrails'],
    ['tracing', 'evals'],
  ];
  for (const [a, b] of pairs) {
    assert.ok(relatedOf(a).some((item) => item.concept.id === b), `${a} 与 ${b} 必须相关`);
  }
});

test('A30 跨页面联动：18 个概念都指向真实可用的实验，且实验入口一致', () => {
  for (const [chapterId, ids] of Object.entries(M13_CONCEPTS)) {
    const experiment = getExperiment(M13_EXPERIMENTS[chapterId]);
    assert.ok(experiment, chapterId);
    assert.equal(experiment.status, 'available');
    assert.equal(experiment.chapterId, chapterId);
    for (const id of ids) {
      const concept = getConcept(id);
      assert.equal(concept.experimentId, experiment.id, `${id} 应挂到 ${experiment.id}`);
      assert.ok(experiment.conceptIds.includes(id), `${experiment.id} 缺少 ${id}`);
      const availability = conceptAvailability(id);
      assert.equal(availability.canRunExperiment, true, id);
      assert.equal(availability.experiment.id, experiment.id, id);
    }
  }
});

test('A30 跨页面联动：章节叙事引用的概念与实验和知识层一致', () => {
  for (const [chapterId, experimentId] of Object.entries(M13_EXPERIMENTS)) {
    const story = getChapterStory(chapterId);
    assert.ok(story, chapterId);
    assert.equal(story.lab.experimentId, experimentId);
    assert.deepEqual([...story.concepts].sort(), [...M13_CONCEPTS[chapterId]].sort());
    assert.equal(Object.keys(CHAPTER_STORIES).length, 6);
  }
});

test('知识层整体自洽：validateKnowledge 零问题（含新增来源与实验）', () => {
  assert.deepEqual(validateKnowledge(), []);
  const m13Sources = Object.values(M13_CONCEPTS)
    .flat()
    .flatMap((id) => getConcept(id).sources);
  assert.ok(new Set(m13Sources).size >= 10, '第 04–06 章应引用足量来源');
  const experimentIds = EXPERIMENTS.map((experiment) => experiment.id);
  assert.equal(new Set(experimentIds).size, experimentIds.length);
});
