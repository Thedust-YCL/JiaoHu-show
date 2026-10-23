/**
 * tests/context-lab.test.mjs
 * ------------------------------------------------------------------
 * Lab 02（A17–A19 / M1.2 §5）的纯逻辑测试。
 *
 * 这里逐条验证「确定性规则表」的行为，重点是把三件容易含糊的事钉死：
 *   1. 没有任何随机成分：同一配置永远得到深度相等的结果；
 *   2. 没有资料时**不会**生成引用，也不会顺手写出具体日期；
 *   3. 预算不足时被舍弃的是整张卡片，且对应事实自动回到「未验证」。
 * ------------------------------------------------------------------
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BACKGROUND,
  BACKGROUND_CARDS,
  BUDGETS,
  DEFAULT_CONTEXT_STATE,
  DIMENSIONS,
  DIMENSION_ORDER,
  EVIDENCE,
  FACTS,
  FORMATS,
  GOALS,
  RESEARCH_QUESTIONS,
  diffRuns,
  evaluateFacts,
  planCards,
  simulateContext,
} from '../src/features/laboratory/context/simulation.js';

const full = { goal: 'specific', format: 'outline', evidence: 'cite', background: 'cards', budget: 'ample' };

test('维度定义：五个可配置维度齐全，取值表两两不重复', () => {
  assert.deepEqual(DIMENSION_ORDER, ['goal', 'format', 'evidence', 'background', 'budget']);
  for (const key of DIMENSION_ORDER) {
    const ids = DIMENSIONS[key].map((d) => d.id);
    assert.equal(new Set(ids).size, ids.length, `${key} 取值重复`);
    assert.ok(ids.every((id) => typeof id === 'string' && id.length > 0));
  }
  assert.deepEqual(GOALS.map((g) => g.id), ['broad', 'specific']);
  assert.deepEqual(FORMATS.map((f) => f.id), ['prose', 'outline']);
  assert.deepEqual(EVIDENCE.map((e) => e.id), ['none', 'cite']);
  assert.deepEqual(BACKGROUND.map((b) => b.id), ['none', 'cards']);
  assert.deepEqual(BUDGETS.map((b) => b.id), ['ample', 'limited']);
});

test('确定性：同一配置两次调用得到深度相等的结果（无随机、无时间依赖）', () => {
  const a = simulateContext(full);
  const b = simulateContext(full);
  assert.deepEqual(a.report, b.report);
  assert.deepEqual(a.metrics, b.metrics);
  assert.deepEqual(a.facts, b.facts);
  assert.deepEqual(a.context, b.context);
});

test('默认配置：宽泛任务 + 无背景 → 两节泛泛而谈、零来源、零引用', () => {
  const run = simulateContext(DEFAULT_CONTEXT_STATE);
  assert.equal(run.metrics.blocks, 2);
  assert.equal(run.metrics.supportedFacts, 0);
  assert.equal(run.metrics.citations, 0);
  assert.equal(run.metrics.cardsIncluded, 0);
  assert.match(run.report.citationStatus, /未要求标注来源/);
});

test('A17 目标维度：明确研究问题把两节拆成四个可回答的子问题', () => {
  const broad = simulateContext({ ...full, goal: 'broad' });
  const specific = simulateContext({ ...full, goal: 'specific' });
  assert.equal(broad.metrics.blocks, 2);
  assert.equal(specific.metrics.blocks, RESEARCH_QUESTIONS.length);
  assert.deepEqual(
    specific.report.blocks.map((b) => b.id),
    ['q-time', 'q-venue', 'q-signup', 'q-gap']
  );
  assert.ok(specific.reasons.some((r) => /研究目标/.test(r)));
});

test('A17 格式维度：自由陈述与结构化提纲改变呈现方式而不改变事实数', () => {
  const prose = simulateContext({ ...full, format: 'prose' });
  const outline = simulateContext({ ...full, format: 'outline' });
  assert.equal(prose.metrics.supportedFacts, outline.metrics.supportedFacts);
  assert.equal(prose.report.blocks[0].kind, 'prose');
  assert.equal(outline.report.blocks[0].kind, 'outline');
  assert.ok(outline.reasons.some((r) => /结构化提纲/.test(r)));
});

test('A17 证据维度：勾选「标注来源」后每条被支持的事实都带出处', () => {
  const none = simulateContext({ ...full, evidence: 'none' });
  const cite = simulateContext({ ...full, evidence: 'cite' });
  assert.equal(none.metrics.citations, 0);
  assert.ok(cite.metrics.citations >= 1);
  assert.equal(cite.citations.length, cite.metrics.supportedFacts);
  const supportedLines = cite.report.blocks.flatMap((b) => b.lines).filter((l) => /（来源：/.test(l));
  assert.equal(supportedLines.length, cite.metrics.citations);
  assert.ok(none.report.blocks.flatMap((b) => b.lines).every((l) => !/（来源：/.test(l)));
});

test('A19 无来源：要求标注来源但没有任何资料 → 不生成引文，也不写出具体日期', () => {
  const run = simulateContext({ ...full, background: 'none' });
  assert.equal(run.metrics.citations, 0);
  assert.equal(run.metrics.supportedFacts, 0);
  assert.match(run.report.citationStatus, /没有可引用的资料/);
  const text = run.report.blocks.flatMap((b) => b.lines).join('\n');
  assert.match(text, /未验证/);
  // 任何具体数值都不应出现在「未验证」的报告里
  assert.doesNotMatch(text, /10 月 20 日/);
  assert.doesNotMatch(text, /B201/);
  assert.doesNotMatch(text, /10 月 18 日/);
  assert.doesNotMatch(text, /60 个名额/);
});

test('A19 无来源：即使勾选「无证据要求」，也不会把未验证事实写成结论', () => {
  const run = simulateContext({ ...full, evidence: 'none', background: 'none' });
  const text = run.report.blocks.flatMap((b) => b.lines).join('\n');
  assert.match(text, /未验证/);
  assert.doesNotMatch(text, /10 月 20 日/);
  assert.match(run.report.citationStatus, /没有引用/);
});

test('A18 预算维度：受限预算整张舍弃卡片，其支撑的事实回到「未验证」', () => {
  const ample = simulateContext({ ...full, budget: 'ample' });
  const limited = simulateContext({ ...full, budget: 'limited' });
  assert.equal(ample.metrics.cardsIncluded, 3);
  assert.equal(limited.metrics.cardsIncluded, 2);
  assert.equal(limited.metrics.cardsDropped, 1);
  assert.equal(limited.dropped[0].sourceId, 'NTC-1003');
  assert.match(limited.dropped[0].reason, /放不下/);
  assert.match(limited.dropped[0].reason, /整张舍弃/);
  assert.ok(limited.metrics.supportedFacts < ample.metrics.supportedFacts);
  assert.ok(limited.metrics.citations < ample.metrics.citations);
  // 被舍弃卡片支撑的事实必须变成未验证，并说明原因
  const safetyFacts = limited.facts.filter((f) => f.sourceId === 'NTC-1003');
  assert.ok(safetyFacts.length >= 1);
  assert.ok(safetyFacts.every((f) => f.status === 'unverified'));
  assert.ok(safetyFacts.every((f) => /未进入上下文/.test(f.reason)));
});

test('A18 因果链：每次只改一维，结果指标都会随之变化且原因可读', () => {
  const base = simulateContext(DEFAULT_CONTEXT_STATE);
  const withCards = simulateContext({ ...DEFAULT_CONTEXT_STATE, background: 'cards' });
  const withGoal = simulateContext({ ...DEFAULT_CONTEXT_STATE, background: 'cards', goal: 'specific' });
  assert.notDeepEqual(base.metrics, withCards.metrics, '加背景应改变结果');
  assert.notDeepEqual(withCards.metrics, withGoal.metrics, '改目标应改变结果');
  assert.ok(withGoal.reasons.length >= 4, '五个维度都应给出解释');
  const keys = new Set(DIMENSION_ORDER);
  assert.ok(withGoal.reasons.every((r) => typeof r === 'string' && r.length > 8));
  assert.equal(keys.size, 5);
});

test('卡片预算：按真实 token 数计算，160 档只能放下 2 张', () => {
  const plan = planCards({ background: 'cards', budget: 'limited' });
  assert.equal(plan.windowTokens, 200);
  assert.equal(plan.cards.filter((c) => c.included).length, 2);
  assert.equal(plan.usedTokens, 78 + 90);
  assert.ok(plan.dropped.length === 1);
  const none = planCards({ background: 'none', budget: 'ample' });
  assert.equal(none.cards.length, 0);
  assert.equal(none.windowTokens, 0);
  assert.match(none.note, /没有任何公告内容/);
});

test('卡片与事实映射：每张卡片声明的事实都必须存在于 FACTS 且来源一致', () => {
  const factIds = new Set(FACTS.map((f) => f.id));
  for (const card of BACKGROUND_CARDS) {
    assert.ok(card.facts.length >= 1, `${card.id} 必须支撑至少一条事实`);
    for (const factId of card.facts) {
      assert.ok(factIds.has(factId), `${card.id} 声明了未知事实 ${factId}`);
      const fact = FACTS.find((f) => f.id === factId);
      assert.equal(fact.sourceId, card.sourceId, `${factId} 的来源与卡片不一致`);
    }
  }
  // 每条事实都必须至少被一张卡片支撑（否则永远无法验证）
  for (const fact of FACTS) {
    assert.ok(
      BACKGROUND_CARDS.some((c) => c.facts.includes(fact.id)),
      `${fact.id} 没有任何卡片可以支撑`
    );
  }
});

test('事实评估：不添加背景时全部未验证，且每条都给出原因', () => {
  const facts = evaluateFacts({ background: 'none', budget: 'ample' });
  assert.equal(facts.length, FACTS.length);
  assert.ok(facts.every((f) => f.status === 'unverified'));
  assert.ok(facts.every((f) => typeof f.reason === 'string' && f.reason.length > 6));
});

test('对比两次配置：diffRuns 只报告真正变化的维度与指标', () => {
  const a = simulateContext(full);
  const b = simulateContext({ ...full, budget: 'limited' });
  const diff = diffRuns(a, b);
  assert.equal(diff.changed.length, 1);
  assert.equal(diff.changed[0].key, 'budget');
  assert.equal(diff.changed[0].from, BUDGETS[0].label);
  assert.equal(diff.changed[0].to, BUDGETS[1].label);
  assert.ok(diff.deltas.some((d) => d.key === 'cardsIncluded' && d.to < d.from));
  assert.equal(diffRuns(null, b), null);
  const same = diffRuns(a, simulateContext(full));
  assert.deepEqual([...same.changed], []);
  assert.deepEqual([...same.deltas], []);
});

test('报告元信息：始终标明这是本地模拟，不冒充真实研究结论', () => {
  const run = simulateContext(full);
  assert.equal(run.report.simulated, true);
  assert.match(run.report.footer, /不是模型推理/);
  assert.match(run.report.footer, /不代表任何真实研究结论/);
  // 上下文里放的是虚构卡片
  assert.ok(run.context.cards.every((c) => c.sourceId.startsWith('NTC-')));
});
