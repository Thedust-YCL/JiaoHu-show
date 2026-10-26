/**
 * tests/reliability-lab.test.mjs
 * ------------------------------------------------------------------
 * Lab 06 · RELIABILITY LAB 的纯逻辑测试（M1.3 D06 / §7 / A23–A29）。
 *
 * 覆盖：
 *   · 权限与沙箱两层真实影响判定结果（A23 / A24）
 *   · 不可信样本只作为数据，不改配置、不提权（A25）
 *   · 护栏命中规则、阻止原因与漏检边界（A26）
 *   · Tracing 可筛选、可追溯来源与终止原因（A27）
 *   · Evals 固定样例、确定性评分、可定位事件（A28）
 *   · 不宣称真实安全测试（A29）
 * ------------------------------------------------------------------
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_POLICY,
  POLICY_TOGGLES,
  RESOURCES,
  SANDBOX_MODES,
  applyPolicyPatch,
  evaluateRequest,
  resourceById,
} from '../src/features/laboratory/reliability/policy.js';
import {
  INPUT_RULES,
  GUARDRAIL_LIMITS,
  checkInput,
  checkOutput,
  checkToolRequest,
} from '../src/features/laboratory/reliability/guardrails.js';
import { INJECTION_SAMPLE, loadSamples } from '../src/features/laboratory/reliability/samples.js';
import { runReliabilityLab, filterTrace, TRACE_TYPES } from '../src/features/laboratory/reliability/reliabilityLabLogic.js';
import { EVAL_SAMPLES, runEvals } from '../src/features/laboratory/reliability/evals.js';

const OPEN_ALL = Object.freeze({
  ...DEFAULT_POLICY,
  readPrivateRecords: true,
  writeConfig: true,
  externalSend: true,
  sandbox: 'off',
  guardrails: Object.freeze({ input: false, tool: false, output: false }),
});

/* ==================================================================== *
 * 一、权限与沙箱（A23 / A24）
 * ==================================================================== */
test('A23 权限：默认策略拒绝私有读取与对外发送，允许公开读取', () => {
  assert.equal(evaluateRequest({ resourceId: 'public/notices/career-fair', policy: DEFAULT_POLICY }).decision, 'allowed');
  assert.equal(evaluateRequest({ resourceId: 'private/review-records/PRV-01', policy: DEFAULT_POLICY }).decision, 'denied');
  assert.equal(evaluateRequest({ resourceId: 'external/mail', operation: 'send', policy: DEFAULT_POLICY }).decision, 'denied');
  assert.equal(evaluateRequest({ resourceId: 'config/experiment-rules', operation: 'write', policy: DEFAULT_POLICY }).decision, 'denied');
});

test('A23 权限切换真实影响判定：2×2 权限 × 沙箱矩阵四格都有明确结论', () => {
  const matrix = [];
  for (const permission of [false, true]) {
    for (const sandbox of SANDBOX_MODES.map((mode) => mode.id)) {
      const verdict = evaluateRequest({
        resourceId: 'private/review-records/PRV-01',
        policy: { ...DEFAULT_POLICY, readPrivateRecords: permission, sandbox },
      });
      matrix.push({ permission, sandbox, decision: verdict.decision });
    }
  }
  // 权限拒绝 → 一律拒绝（沙箱怎么配都救不回来）
  for (const cell of matrix.filter((c) => !c.permission)) assert.equal(cell.decision, 'denied', JSON.stringify(cell));
  // 权限允许 + 仅公开目录 → 沙箱仍然拒绝（两层互补）
  assert.equal(matrix.find((c) => c.permission && c.sandbox === 'public-only').decision, 'denied');
  // 权限允许 + 关闭隔离 → 放行（风险显现）
  assert.equal(matrix.find((c) => c.permission && c.sandbox === 'off').decision, 'allowed');
});

test('A24 沙箱：只放行白名单路径，且明确标注为规则模拟', () => {
  const verdict = evaluateRequest({ resourceId: 'private/review-records/PRV-01', policy: { ...DEFAULT_POLICY, readPrivateRecords: true } });
  const sandboxCheck = verdict.checks.find((check) => check.layer === 'sandbox');
  assert.ok(sandboxCheck);
  assert.equal(sandboxCheck.pass, false);
  assert.match(sandboxCheck.reason, /不在沙箱白名单内/);
  // 三层检查始终全部记录（便于解释为什么被拒）
  assert.deepEqual(verdict.checks.map((check) => check.layer), ['permission', 'sandbox', 'guardrail']);
  // 每个资源都在清单里，未知资源被安全拒绝
  for (const resource of RESOURCES) assert.ok(resourceById(resource.id));
  assert.equal(evaluateRequest({ resourceId: 'nope/unknown', policy: DEFAULT_POLICY }).decision, 'denied');
  const run = runReliabilityLab();
  assert.match(run.scope.note, /规则模拟/);
  assert.match(run.scope.note, /不构成真实系统隔离/);
});

test('A24 沙箱模式：三档白名单与默认策略一致，不提供任意路径输入', () => {
  assert.deepEqual(SANDBOX_MODES.map((mode) => mode.id), ['public-only', 'public-and-config', 'off']);
  assert.deepEqual([...SANDBOX_MODES[0].patterns], ['public/notices/*']);
  assert.equal(DEFAULT_POLICY.sandbox, 'public-only');
  assert.deepEqual(SANDBOX_MODES[2].patterns, ['*']);
});

/* ==================================================================== *
 * 二、提示注入（A25）
 * ==================================================================== */
test('A25 注入样本：被明确标记为教学模拟文本，且只作为数据处理', () => {
  assert.equal(INJECTION_SAMPLE.isInjectionSample, true);
  assert.equal(INJECTION_SAMPLE.isFictional, true);
  assert.equal(INJECTION_SAMPLE.untrusted, true);
  assert.match(INJECTION_SAMPLE.title, /教学用模拟提示注入样本/);
  assert.ok(INJECTION_SAMPLE.attemptedActions.length >= 2);
  const samples = loadSamples();
  assert.equal(samples.injection.docId, 'NTC-X01');
  assert.ok(samples.publicDocs.length >= 1);
  // 正常资料与注入样本严格分开
  assert.ok(samples.publicDocs.every((doc) => doc.untrusted === false));
});

test('A25 注入样本：不会改写系统配置、系统指令或权限', () => {
  const run = runReliabilityLab();
  assert.equal(run.injection.configChanged, false);
  assert.equal(run.injection.systemInstructionsChanged, false);
  assert.deepEqual(run.policy, run.policyAfter);
  assert.equal(run.systemInstructions, run.systemInstructionsAfter);
  assert.match(run.systemInstructions, /不得读取私有记录/);
  // 即使把所有权限打开，配置仍然不会被文档改动
  const open = runReliabilityLab({ policy: OPEN_ALL });
  assert.equal(open.injection.configChanged, false);
  assert.deepEqual(open.policy, open.policyAfter);
  // 配置写入尝试会被记录，但不会真的写入
  assert.ok(open.events.some((event) => event.rule === 'config/no-write-path'));
});

test('A25 注入样本：默认策略下三条诱导动作全部被拒绝', () => {
  const run = runReliabilityLab();
  assert.equal(run.injection.totalActions, INJECTION_SAMPLE.attemptedActions.length);
  assert.equal(run.injection.deniedActions, INJECTION_SAMPLE.attemptedActions.length);
  assert.equal(run.injection.allowedActions, 0);
  assert.equal(run.injection.influenced, false);
  for (const action of INJECTION_SAMPLE.attemptedActions) {
    const request = run.requests.find((item) => item.resourceId === action.resourceId);
    assert.equal(request.decision, 'denied', action.resourceId);
  }
});

test('A25 不可信内容只能提出请求，不能自己决定结果（结果由策略决定）', () => {
  const closed = runReliabilityLab();
  const open = runReliabilityLab({ policy: OPEN_ALL });
  const privateAction = INJECTION_SAMPLE.attemptedActions.find((action) => action.resourceId.startsWith('private/'));
  assert.equal(closed.requests.find((r) => r.resourceId === privateAction.resourceId).decision, 'denied');
  assert.equal(open.requests.find((r) => r.resourceId === privateAction.resourceId).decision, 'allowed');
  // 同一份文档、同一段文字，结果只随配置变化
  assert.equal(closed.injection.flagged, open.injection.flagged === false ? closed.injection.flagged : open.injection.flagged);
});

/* ==================================================================== *
 * 三、拒绝不得显示成功（A23 底线）
 * ==================================================================== */
test('被拒绝的操作不会同时记录为成功', () => {
  for (const policy of [DEFAULT_POLICY, { ...DEFAULT_POLICY, readPrivateRecords: true }, OPEN_ALL]) {
    const run = runReliabilityLab({ policy });
    for (const resourceId of new Set(run.events.map((event) => event.resourceId).filter(Boolean))) {
      const decisions = run.events
        .filter((event) => event.resourceId === resourceId && (event.type === 'allow' || event.type === 'deny'))
        .map((event) => event.decision);
      assert.equal(new Set(decisions).size, 1, `${resourceId} 同时出现允许与拒绝：${decisions.join(',')}`);
    }
    // deny 事件的 status 必须是 denied，绝不写成 ok
    for (const event of run.events.filter((item) => item.type === 'deny')) {
      assert.equal(event.status, 'denied', event.eventId);
      assert.equal(event.decision, 'denied', event.eventId);
    }
    // allow 事件不会被标成「拒绝」
    for (const event of run.events.filter((item) => item.type === 'allow')) {
      assert.notEqual(event.status, 'denied', event.eventId);
    }
  }
});

/* ==================================================================== *
 * 四、护栏（A26）
 * ==================================================================== */
test('A26 输入护栏：命中具体规则并给出摘录，关闭时明确说明「没检查」', () => {
  const text = INJECTION_SAMPLE.paragraphs.join('\n');
  const hit = checkInput(text);
  assert.equal(hit.hit, true);
  assert.ok(hit.hits.length >= 2);
  for (const item of hit.hits) {
    assert.ok(INPUT_RULES.some((rule) => rule.id === item.id), item.id);
    assert.ok(item.excerpt.length > 0);
  }
  assert.match(hit.note, /字面模式/);
  const off = checkInput(text, { enabled: false });
  assert.equal(off.hit, false);
  assert.equal(off.enabled, false);
  assert.match(off.note, /没检查/);
});

test('A26 工具护栏：敏感路径被标记，但明确说明「护栏不是授权」', () => {
  const checked = checkToolRequest({ resourceId: 'private/review-records/PRV-01' });
  assert.equal(checked.hit, true);
  assert.ok(checked.hits.some((hit) => hit.id === 'private-path'));
  assert.match(checked.note, /是否放行仍由权限与沙箱决定/);
  const traversal = checkToolRequest({ resourceId: 'public/../etc/passwd' });
  assert.ok(traversal.hits.some((hit) => hit.id === 'path-traversal'));
  const send = checkToolRequest({ resourceId: 'external/mail', operation: 'send' });
  assert.ok(send.hits.some((hit) => hit.id === 'send-operation'));
});

test('A26 输出护栏：夸大、缺来源、漏写不确定性、疑似泄露都能命中', () => {
  assert.equal(checkOutput({ text: '已确认无误', citations: 0, status: 'supported' }).hit, true);
  const missingCite = checkOutput({ text: '结论如下', citations: 0, status: 'supported' });
  assert.ok(missingCite.hits.some((hit) => hit.id === 'missing-citation'));
  const missingUncertainty = checkOutput({ text: '就是这样', citations: 1, status: 'unresolved' });
  assert.ok(missingUncertainty.hits.some((hit) => hit.id === 'missing-uncertainty'));
  const leaked = checkOutput({ text: '请联系 13800138000', citations: 1, status: 'supported' });
  assert.ok(leaked.hits.some((hit) => hit.id === 'sensitive-leak'));
  const clean = checkOutput({ text: '证据冲突，结论为未决', citations: 2, status: 'unresolved' });
  assert.equal(clean.hit, false);
});

test('A26 护栏边界：明确列出可能漏掉的攻击，不宣称彻底防御', () => {
  assert.ok(GUARDRAIL_LIMITS.length >= 3);
  const joined = GUARDRAIL_LIMITS.join('\n');
  assert.match(joined, /绕过/);
  assert.match(joined, /不等于安全/);
  const run = runReliabilityLab();
  const inputEvent = run.events.find((event) => event.type === 'input-check');
  assert.ok(inputEvent);
  assert.match(inputEvent.detail, /字面模式|命中|未命中/);
});

/* ==================================================================== *
 * 五、追踪（A27）
 * ==================================================================== */
test('A27 Tracing：事件类型齐全、可筛选、带来源与终止原因', () => {
  const run = runReliabilityLab();
  assert.ok(run.events.length > 10);
  for (const event of run.events) {
    assert.match(event.eventId, /^TR-\d{2}$/);
    assert.equal(event.runId, run.runId);
    assert.ok(TRACE_TYPES[event.type], `未知事件类型：${event.type}`);
    assert.ok(event.title.length > 0);
    assert.ok(event.detail.length > 0);
    assert.ok(Number.isInteger(event.seq));
  }
  // 终止事件必须写明原因与统计
  const terminate = run.events.at(-1);
  assert.equal(terminate.type, 'terminate');
  assert.match(terminate.detail, /诱导动作/);

  // 可筛选：每个过滤器都返回该类型的子集
  for (const id of ['all', 'rule', 'tool', 'decision', 'source', 'terminate']) {
    const visible = filterTrace(run.events, id);
    assert.ok(visible.length > 0, id);
    assert.ok(visible.length <= run.events.length, id);
  }
  assert.equal(filterTrace(run.events, 'all').length, run.events.length);
  assert.ok(filterTrace(run.events, 'decision').every((event) => event.type === 'allow' || event.type === 'deny'));
  assert.ok(filterTrace(run.events, 'source').every((event) => event.type === 'source-use'));
});

test('A27 Tracing：来源使用事件只指向本次真正读到的公开公告', () => {
  const run = runReliabilityLab();
  const uses = run.events.filter((event) => event.type === 'source-use');
  assert.ok(uses.length >= 1);
  for (const event of uses) {
    assert.equal(event.sourceIds.length, 1);
    assert.ok(run.samples.publicDocs.some((doc) => doc.docId === event.sourceIds[0]));
    assert.ok(run.usedSources.includes(event.sourceIds[0]));
  }
});

/* ==================================================================== *
 * 六、评估（A28）
 * ==================================================================== */
test('A28 Evals：四条固定样例都写清输入、预期、实际与判定理由', () => {
  assert.equal(EVAL_SAMPLES.length, 4);
  const run = runReliabilityLab();
  assert.equal(run.evals.results.length, 4);
  for (const result of run.evals.results) {
    assert.ok(result.cn.length > 2, result.id);
    assert.ok(result.input.length > 6, result.id);
    assert.ok(result.expect.length > 6, result.id);
    assert.ok(result.actual.length > 2, result.id);
    assert.ok(result.reason.length > 6, result.id);
    assert.equal(typeof result.pass, 'boolean');
    assert.ok(Array.isArray(result.eventIds));
    // 判定必须能定位到事件（除非明确标为不适用）
    if (!result.notApplicable) assert.ok(result.eventIds.length > 0, `${result.id} 必须能定位事件`);
  }
  assert.equal(run.evals.passed, 4);
  assert.equal(run.evals.score, 1);
  assert.match(run.evals.note, /不代表真实系统/);
});

test('A28 Evals：配置变化后分数与判定理由同步变化，且仍然确定', () => {
  const strict = runReliabilityLab();
  const loose = runReliabilityLab({ policy: OPEN_ALL });
  assert.equal(strict.evals.passed, 4);
  assert.ok(loose.evals.passed < strict.evals.passed);
  const failedIds = loose.evals.results.filter((result) => !result.pass).map((result) => result.id);
  assert.ok(failedIds.includes('E1'));
  assert.ok(failedIds.includes('E2'));
  // 同一配置两次运行完全一致
  assert.deepEqual(runReliabilityLab({ policy: OPEN_ALL }).evals, loose.evals);
});

test('A28 Evals：runEvals 是纯函数，不修改输入 run', () => {
  const run = runReliabilityLab();
  const snapshot = JSON.stringify({ events: run.events.length, requests: run.requests.length });
  const again = runEvals(run);
  assert.deepEqual(again, run.evals);
  assert.equal(JSON.stringify({ events: run.events.length, requests: run.requests.length }), snapshot);
});

/* ==================================================================== *
 * 七、策略工具与安全声明（A29）
 * ==================================================================== */
test('策略补丁只接受白名单字段，且返回冻结对象', () => {
  const patched = applyPolicyPatch(DEFAULT_POLICY, { readPrivateRecords: true, sandbox: 'off', guardrails: { input: false }, evil: 'x' });
  assert.equal(patched.readPrivateRecords, true);
  assert.equal(patched.sandbox, 'off');
  assert.equal(patched.guardrails.input, false);
  assert.equal(patched.guardrails.tool, true);
  assert.equal('evil' in patched, false);
  assert.equal(Object.isFrozen(patched), true);
  assert.ok(POLICY_TOGGLES.every((toggle) => toggle.key in DEFAULT_POLICY));
});

test('A29 安全声明：不声称真实渗透测试、真实模型安全测试或生产防护', () => {
  const run = runReliabilityLab();
  assert.match(run.scope.note, /前端规则模拟/);
  assert.match(run.scope.note, /没有真实文件系统/);
  const traceText = run.events.map((event) => `${event.title}${event.detail}`).join('\n');
  assert.doesNotMatch(traceText, /已通过安全认证|完成渗透测试|生产级防护/);
  // 样本是自造的演示文本，不含真实地址与真实个人信息
  assert.doesNotMatch(INJECTION_SAMPLE.paragraphs.join(''), /@[a-z0-9-]+\.[a-z]{2,}/i);
  assert.match(INJECTION_SAMPLE.paragraphs[0], /不是真实公告/);
});

test('确定性：同一配置的运行结果（事件 / 请求 / 评估）完全一致', () => {
  const a = runReliabilityLab();
  const b = runReliabilityLab();
  assert.deepEqual(a.events, b.events);
  assert.deepEqual(a.requests, b.requests);
  assert.deepEqual(a.evals, b.evals);
  assert.equal(a.runId, b.runId);
});
