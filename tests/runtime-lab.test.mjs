/**
 * tests/runtime-lab.test.mjs
 * ------------------------------------------------------------------
 * Lab 05 · RUNTIME LAB 的纯逻辑测试（M1.3 D05 / §6 / A17–A22）。
 *
 * 覆盖：
 *   · 两种控制方式共用同一份任务、资料、工具与权限（A17）
 *   · 事件结构完整：eventId / runId / stepType / status / 输入输出 / 来源 / 分支原因
 *   · 循环必然终止：成功、失败、重试、步数上限（A18）
 *   · Harness 职责映射：不是「另一个模型」（A19）
 *   · 编排与多角色交接、单角色失败路径（A20 / A21）
 *   · 指标全部来自事件（A22）
 * ------------------------------------------------------------------
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AGENT_ROLES,
  HARNESS_ROLES,
  MODE_LABELS,
  RETRY_LIMIT_OPTIONS,
  STATUS_LABELS,
  STEP_LIMIT_OPTIONS,
  STEP_TYPES,
  WORKFLOW_STEPS,
  harnessViewOf,
  simulateAgentLoop,
  simulateMultiAgent,
  simulateWorkflow,
} from '../src/features/laboratory/runtime/engine.js';
import { RUNTIME_TASK, eventDateOf, searchDocs } from '../src/features/laboratory/runtime/task.js';

const MODES = ['workflow', 'agent-loop', 'multi-agent'];

function allEvents(runs) {
  return runs.flatMap((run) => run.events);
}

/* ==================================================================== *
 * 一、共享条件（A17）
 * ==================================================================== */
test('A17 两种控制方式共用同一份资料、工具与权限', () => {
  const workflow = simulateWorkflow({ queryId: 'career-fair' });
  const loop = simulateAgentLoop({ queryId: 'career-fair' });
  // 同一任务查询 → 同样的证据与结论（循环多做的「找更正」不改变事实）
  assert.deepEqual(workflow.dates, loop.dates);
  assert.equal(workflow.conclusion.status, loop.conclusion.status);
  assert.equal(workflow.conclusion.summary, loop.conclusion.summary);
  // Agent Loop 可能因为多检索一次而触达更多公告，但工作流用到的来源必须是它的子集
  for (const docId of workflow.sources) assert.ok(loop.sources.includes(docId), `${docId} 应出现在两种模式的搜索范围内`);
  // 工具与权限只有一份定义
  assert.deepEqual(RUNTIME_TASK.tools.map((t) => t.id), ['announcement_search', 'document_reader']);
  assert.equal(RUNTIME_TASK.permissions.readPrivateRecords, false);
  // 两种模式的 runId 前缀不同，但事件字段结构一致
  assert.match(workflow.runId, /^RUN-workflow-/);
  assert.match(loop.runId, /^RUN-agent-loop-/);
  // 任务对象是冻结的：任何模式都不能在运行期私改资料或权限
  assert.equal(Object.isFrozen(RUNTIME_TASK), true);
  assert.equal(Object.isFrozen(RUNTIME_TASK.permissions), true);
  assert.equal(Object.isFrozen(RUNTIME_TASK.docs), true);
});

test('任务：检索规则是字面包含，稳定排序，且不会返回不存在的文档', () => {
  assert.deepEqual(searchDocs('招聘会'), ['NTC-1009', 'NTC-1008']);
  assert.deepEqual(searchDocs('毕业典礼'), []);
  assert.deepEqual(searchDocs(''), []);
  for (const docId of searchDocs('公告')) {
    assert.ok(RUNTIME_TASK.getDoc(docId), `${docId} 必须真实存在`);
  }
  // 事件日期抽取需要锚点 + 线索词
  assert.equal(eventDateOf('NTC-1008', '招聘会')?.value, '10 月 24 日');
  assert.equal(eventDateOf('NTC-1009', '招聘会')?.value, '10 月 26 日');
  assert.equal(eventDateOf('NTC-1008', '毕业典礼'), null);
});

/* ==================================================================== *
 * 二、事件结构
 * ==================================================================== */
test('事件结构：每个事件都带 id / runId / 类型 / 状态 / 输入输出 / 来源 / 分支原因', () => {
  const runs = MODES.map((mode) => (mode === 'workflow' ? simulateWorkflow() : mode === 'agent-loop' ? simulateAgentLoop() : simulateMultiAgent()));
  const events = allEvents(runs);
  assert.ok(events.length > 20);
  const ids = new Set();
  for (const event of events) {
    assert.match(event.eventId, /^EV-\d{2}$/);
    assert.ok(!ids.has(`${event.runId}:${event.eventId}`), '同一 run 内事件 ID 不重复');
    ids.add(`${event.runId}:${event.eventId}`);
    assert.ok(event.runId.startsWith('RUN-'));
    assert.ok(STEP_TYPES[event.stepType], `未知 stepType：${event.stepType}`);
    assert.ok(STATUS_LABELS[event.status], `未知状态：${event.status}`);
    assert.ok(event.title.length > 0);
    assert.ok(typeof event.input === 'string' && event.input.length > 0, `${event.eventId} 必须有输入摘要`);
    assert.ok(typeof event.output === 'string' && event.output.length > 0, `${event.eventId} 必须有输出摘要`);
    assert.ok(Array.isArray(event.sourceIds), event.eventId);
    assert.ok(typeof event.branchReason === 'string' && event.branchReason.length > 0, `${event.eventId} 必须有分支原因`);
    assert.ok(Number.isInteger(event.seq) && event.seq >= 1);
    assert.ok(event.harness.length > 0);
  }
});

test('事件：来源 ID 只能指向真实存在的本地资料', () => {
  const events = allEvents([simulateWorkflow(), simulateAgentLoop(), simulateMultiAgent()]);
  for (const event of events) {
    for (const docId of event.sourceIds) {
      assert.ok(RUNTIME_TASK.getDoc(docId), `${event.eventId} 引用了不存在的来源 ${docId}`);
    }
  }
});

/* ==================================================================== *
 * 三、执行与终止（A18）
 * ==================================================================== */
test('Workflow：固定五步执行完毕，结论为未决（冲突无更正关系）', () => {
  const run = simulateWorkflow({ queryId: 'career-fair' });
  assert.equal(run.extra.planLength, WORKFLOW_STEPS.length);
  assert.equal(run.metrics.steps, WORKFLOW_STEPS.length);
  assert.equal(run.metrics.terminator, 'plan-complete');
  assert.equal(run.conclusion.status, 'unresolved');
  assert.equal(run.metrics.toolCalls, 2);
  assert.equal(run.events.at(-1).stepType, 'terminate');
});

test('Workflow：查不到资料时按固定规则跳过读取，不重试', () => {
  const run = simulateWorkflow({ queryId: 'no-such-event' });
  assert.equal(run.conclusion.status, 'insufficient');
  assert.equal(run.metrics.retries, 0);
  assert.ok(run.events.some((event) => event.status === 'skipped'));
  assert.equal(run.metrics.terminator, 'plan-complete');
});

test('Agent Loop：冲突已确认且无新动作时以 no-more-actions 终止', () => {
  const run = simulateAgentLoop({ queryId: 'career-fair' });
  assert.equal(run.metrics.terminator, 'no-more-actions');
  assert.equal(run.conclusion.status, 'unresolved');
  assert.ok(run.metrics.steps <= STEP_LIMIT_OPTIONS.at(-1));
  assert.equal(run.metrics.retries, 0);
});

test('Agent Loop：步数上限生效，超过即终止（不会无限循环）', () => {
  for (const maxSteps of STEP_LIMIT_OPTIONS) {
    const run = simulateAgentLoop({ queryId: 'career-fair', maxSteps });
    assert.ok(run.metrics.steps <= maxSteps, `步数 ${run.metrics.steps} 超过上限 ${maxSteps}`);
    assert.equal(run.metrics.maxSteps, maxSteps);
    const last = run.events.at(-1);
    assert.equal(last.stepType, 'terminate');
    if (maxSteps === STEP_LIMIT_OPTIONS[0]) assert.equal(run.metrics.terminator, 'max-steps');
  }
});

test('Agent Loop：重试上限生效，空结果不会一直重试', () => {
  for (const maxRetries of RETRY_LIMIT_OPTIONS) {
    const run = simulateAgentLoop({ queryId: 'no-such-event', maxRetries });
    assert.equal(run.metrics.retries, maxRetries);
    assert.equal(run.metrics.maxRetries, maxRetries);
    assert.equal(run.metrics.terminator, 'retry-limit');
    assert.equal(run.conclusion.status, 'insufficient');
    const searches = run.events.filter((event) => event.toolId === 'announcement_search');
    assert.equal(searches.length, maxRetries + 1);
  }
});

test('Agent Loop 成功路径：单一取值 → 结论有支撑，并以「目标达成」终止', () => {
  // 创客分享会只有一份公告（NTC-1001），日期唯一 → 成功路径
  const loop = simulateAgentLoop({ queryId: 'maker-share' });
  assert.equal(loop.conclusion.status, 'supported');
  assert.equal(loop.metrics.terminator, 'target-reached');
  assert.equal(loop.metrics.retries, 0);
  assert.deepEqual(loop.dates, { 'NTC-1001': '10 月 20 日' });
  assert.deepEqual(loop.sources, ['NTC-1001']);
  // 成功也不该多跑：搜索 → 读取 → 比对 三步即结束
  assert.equal(loop.metrics.steps, 3);
  assert.equal(loop.events.filter((event) => event.stepType === 'terminate').length, 1);

  // Workflow 走同一条查询同样成功（同一份证据、不同控制方式）
  const workflow = simulateWorkflow({ queryId: 'maker-share' });
  assert.equal(workflow.conclusion.status, 'supported');
  assert.deepEqual(workflow.dates, loop.dates);

  // 多角色一致
  const multi = simulateMultiAgent({ queryId: 'maker-share' });
  assert.equal(multi.conclusion.status, 'supported');
});

test('A18 三类结局都可达：成功 / 未决 / 无证据，且终止原因各不相同', () => {
  const cases = [
    { queryId: 'maker-share', status: 'supported' },
    { queryId: 'career-fair', status: 'unresolved' },
    { queryId: 'no-such-event', status: 'insufficient' },
  ];
  const terminators = new Set();
  for (const item of cases) {
    const workflow = simulateWorkflow({ queryId: item.queryId });
    const loop = simulateAgentLoop({ queryId: item.queryId });
    assert.equal(workflow.conclusion.status, item.status, `workflow/${item.queryId}`);
    assert.equal(loop.conclusion.status, item.status, `agent-loop/${item.queryId}`);
    terminators.add(workflow.metrics.terminator);
    terminators.add(loop.metrics.terminator);
  }
  assert.ok(terminators.has('target-reached'), '成功路径应有「目标达成」终止');
  assert.ok(terminators.has('no-more-actions'), '未决应以「无可用动作」终止');
  assert.ok(terminators.has('retry-limit'), '无证据应以「重试上限」终止');
  // 终止原因只可能来自固定集合，不会出现未知值
  const allowed = ['plan-complete', 'roles-complete', 'target-reached', 'no-more-actions', 'retry-limit', 'max-steps', 'no-date'];
  for (const terminator of terminators) assert.ok(allowed.includes(terminator), `未知终止原因：${terminator}`);
});

test('确定性：同一配置两次运行得到的 runId、事件与结论完全一致', () => {
  for (const build of [() => simulateWorkflow(), () => simulateAgentLoop(), () => simulateMultiAgent()]) {
    const a = build();
    const b = build();
    assert.equal(a.runId, b.runId);
    assert.deepEqual(a.events, b.events);
    assert.deepEqual(a.metrics, b.metrics);
    assert.deepEqual(a.conclusion, b.conclusion);
  }
});

/* ==================================================================== *
 * 四、Harness 与指标（A19 / A22）
 * ==================================================================== */
test('A19 Harness：五项职责齐全，且只按事件类型映射（不是另一个模型）', () => {
  assert.deepEqual(HARNESS_ROLES.map((role) => role.id), ['context', 'dispatch', 'loop', 'policy', 'log']);
  const toolEvent = simulateAgentLoop().events.find((event) => event.toolId);
  const view = harnessViewOf(toolEvent);
  assert.equal(view.length, HARNESS_ROLES.length);
  assert.equal(view.find((role) => role.id === 'dispatch').active, true);
  assert.equal(view.find((role) => role.id === 'policy').active, true);
  // terminate 只触发 loop / log
  const terminate = simulateAgentLoop().events.at(-1);
  assert.deepEqual([...terminate.harness].sort(), ['log', 'loop']);
  // 没有任何事件把 Harness 标成「模型」
  for (const role of HARNESS_ROLES) assert.ok(!/模型/.test(role.cn), role.cn);
  assert.match(MODE_LABELS['agent-loop'].note, /上限/);
});

test('A22 指标：步骤数 / 工具调用 / 重试 / 来源覆盖全部可由事件复算', () => {
  for (const build of [() => simulateWorkflow(), () => simulateAgentLoop(), () => simulateMultiAgent()]) {
    const run = build();
    const toolCalls = run.events.filter((event) => event.toolId).length;
    assert.equal(run.metrics.toolCalls, toolCalls);
    const sourceIds = new Set(run.events.flatMap((event) => event.sourceIds));
    assert.equal(run.metrics.sourceCount, sourceIds.size);
    const denied = run.events.filter((event) => event.status === 'denied').length;
    assert.equal(run.metrics.denied, denied);
    assert.equal(run.metrics.eventCount, run.events.length);
    assert.ok(run.metrics.steps <= run.metrics.maxSteps);
  }
});

/* ==================================================================== *
 * 五、编排与多角色（A20 / A21）
 * ==================================================================== */
test('A20 Orchestration：分派事件写清任务、角色顺序，并标明顺序执行', () => {
  const run = simulateMultiAgent();
  const assign = run.events.find((event) => event.stepType === 'assign');
  assert.ok(assign);
  assert.match(assign.output, /Researcher/);
  assert.match(assign.output, /Verifier/);
  assert.match(assign.output, /Reporter/);
  assert.match(assign.output, /不并发/);
  assert.equal(assign.branchReason, 'orchestration/sequential-handoff');
});

test('A21 Multi-Agent：三个角色都有职责与输出，交接事件成对出现', () => {
  const run = simulateMultiAgent();
  assert.deepEqual(run.extra.roles, ['researcher', 'verifier', 'reporter']);
  for (const role of AGENT_ROLES) {
    assert.ok(role.duty.length > 4, role.id);
    assert.ok(role.outputs.length > 4, role.id);
  }
  const handoffs = run.events.filter((event) => event.stepType === 'handoff');
  assert.equal(handoffs.length, 2);
  assert.deepEqual(handoffs.map((event) => event.branchReason), ['handoff/researcher-to-verifier', 'handoff/verifier-to-reporter']);
  for (const handoff of handoffs) {
    assert.ok(handoff.sourceIds.length > 0, '交接必须带上来源');
    assert.ok(handoff.output.includes('交接内容') || handoff.output.includes('回执'));
  }
  // 角色出现顺序：researcher → verifier → reporter
  const roles = run.events.map((event) => event.role).filter(Boolean);
  assert.ok(roles.indexOf('researcher') < roles.indexOf('verifier'));
  assert.ok(roles.indexOf('verifier') < roles.indexOf('reporter'));
});

test('A21 单角色失败路径：Verifier 失败 → 结论降级为「核验未完成」，不被静默忽略', () => {
  const run = simulateMultiAgent({ failRole: 'verifier' });
  assert.equal(run.conclusion.status, 'unverified');
  assert.equal(run.conclusion.statusCn, '核验未完成');
  const failed = run.events.find((event) => event.branchReason === 'verifier/failed');
  assert.ok(failed);
  assert.equal(failed.status, 'error');
  // 下游交接被标记为降级
  assert.ok(run.events.some((event) => event.branchReason === 'handoff/degraded'));
  // 失败不会被写成成功
  assert.ok(!run.events.some((event) => event.stepType === 'compare' && event.status === 'ok'));
});

test('多角色：查不到资料时，仍然走完角色并如实报告无证据', () => {
  const run = simulateMultiAgent({ queryId: 'no-such-event' });
  assert.equal(run.conclusion.status, 'insufficient');
  assert.equal(run.sources.length, 0);
  assert.ok(run.events.some((event) => event.status === 'skipped'));
});

test('播放语义：事件序列本身即完整运行，播放/暂停不参与逻辑', () => {
  const run = simulateAgentLoop({ queryId: 'career-fair' });
  const full = JSON.stringify(run.events);
  // 重新模拟一次（相当于「重置后重播」）结果必须一致
  const replay = simulateAgentLoop({ queryId: 'career-fair' });
  assert.equal(JSON.stringify(replay.events), full);
  assert.equal(replay.conclusion.status, run.conclusion.status);
});
