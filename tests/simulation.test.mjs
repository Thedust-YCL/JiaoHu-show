/**
 * tests/simulation.test.mjs
 * ------------------------------------------------------------------
 * M0.3 模拟层的自动测试（纯逻辑，不需要浏览器 / WebGL）：
 *   · 配置 → 工具可用性推导
 *   · 四条必需分支 B01–B04 与 B05 空结果
 *   · searchScope / maxResults / readMode / includeMetadata 的真实效果
 *   · 确定性：同一输入 → 同一条事件轨迹与同一 outcome
 *   · 配置快照不可变：运行后修改配置不会污染历史
 *   · 历史记录持久化的损坏降级
 * ------------------------------------------------------------------
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { MODULES, defaultSettings } from '../src/features/constructor/model/modules.js';
import { describeTool, deriveToolAvailability, BLOCK_CODES } from '../src/simulation/rules/availability.js';
import { runSimulation, summarizeRun } from '../src/simulation/engine/runSimulation.js';
import { canonicalize, parseHistory, serializeHistory, stableHash, isRunShapeValid } from '../src/simulation/events/serializer.js';
import { EVENT_TYPES } from '../src/simulation/events/schema.js';
import { runAnnouncementSearch } from '../src/simulation/tools/announcementSearch.js';
import { runDocumentReader } from '../src/simulation/tools/documentReader.js';
import { MISSION_001_MINI } from '../src/research-packs/mission-001-mini/index.js';
import { memoryStorage } from './helpers.mjs';

/* ==================================================================== *
 * 测试夹具：直接构造 M0.2 形状的配置快照（与落盘结构一致）
 * ==================================================================== */

/** 构造一个已装配模块条目 */
function installed(moduleId, { enabled = true, read = true, settings = {} } = {}) {
  const mod = MODULES[moduleId];
  return {
    moduleId,
    portId: mod.portId,
    enabled,
    permissions: { read },
    settings: { ...defaultSettings(moduleId), ...settings },
  };
}

function snapshot(modules) {
  return { schemaVersion: 1, modules };
}

const READY_BOTH = () =>
  snapshot([
    installed('announcement_search', { settings: { searchScope: 'all_notices', maxResults: 3 } }),
    installed('document_reader', { settings: { readMode: 'full_text', includeMetadata: true } }),
  ]);

function eventTypes(run) {
  return run.events.map((e) => e.type);
}

/* ==================================================================== *
 * A14 配置 → 工具可用性推导
 * ==================================================================== */
test('工具可用性：未装配 → NOT_INSTALLED，且绝不当作 Ready', () => {
  const availability = deriveToolAvailability(snapshot([]));
  assert.equal(availability.tools.announcement_search.installed, false);
  assert.equal(availability.tools.announcement_search.ready, false);
  assert.equal(availability.tools.announcement_search.blockCode, BLOCK_CODES.NOT_INSTALLED);
  assert.equal(availability.anyReady, false);
});

test('工具可用性：缺少只读模拟权限 → PERMISSION_MISSING（不是 Invalid）', () => {
  const snap = snapshot([installed('announcement_search', { read: false })]);
  const tool = describeTool('announcement_search', snap);
  assert.equal(tool.ready, false);
  assert.equal(tool.blockCode, BLOCK_CODES.PERMISSION_MISSING);
  assert.equal(tool.status, 'Unconfigured');
});

test('工具可用性：禁用 → DISABLED；字段非法 → INVALID', () => {
  const disabled = describeTool('announcement_search', snapshot([installed('announcement_search', { enabled: false })]));
  assert.equal(disabled.blockCode, BLOCK_CODES.DISABLED);

  const invalid = describeTool('announcement_search', snapshot([installed('announcement_search', { settings: { maxResults: 999 } })]));
  assert.equal(invalid.blockCode, BLOCK_CODES.INVALID);
  assert.equal(invalid.status, 'Invalid');
});

test('工具可用性：损坏的快照形状不会被当作可用', () => {
  const availability = deriveToolAvailability({ nope: true });
  assert.equal(availability.anyReady, false);
  assert.deepEqual(availability.snapshotProblems, ['MISSING_MODULES']);
});

/* ==================================================================== *
 * A14 正常分支 B01
 * ==================================================================== */
test('B01 正常：检索 → 读取 → 记录样本 → 结束，且明确不生成报告', () => {
  const run = runSimulation(READY_BOTH(), MISSION_001_MINI, { faultMode: 'normal' });
  assert.equal(run.outcome, 'sample_acquired');
  assert.equal(run.branchId, 'B01_NORMAL');
  assert.deepEqual(eventTypes(run), [
    'run.started',
    'config.validated',
    'task.plan_created',
    'tool.call',
    'tool.result',
    'tool.call',
    'tool.result',
    'evidence.sample_collected',
    'run.completed',
  ]);
  assert.deepEqual(
    run.events.map((e) => e.sequence),
    [0, 1, 2, 3, 4, 5, 6, 7, 8]
  );
  assert.deepEqual(run.stats.toolsInvoked, ['announcement_search', 'document_reader']);
  assert.equal(run.artifacts.report.status, 'not_generated');
  assert.equal(run.artifacts.evidence.level, 'full_text');
  assert.equal(run.artifacts.evidence.verified, undefined);
  // 事件 ID 稳定且可复现
  assert.equal(run.events[4].id, `${run.runId}#e04`);
});

/* ==================================================================== *
 * A15 / A16 缺 Search 与未授权 Search（B02）
 * ==================================================================== */
test('B02 缺 Search：只产生阻断事件，没有任何成功的检索或读取', () => {
  const run = runSimulation(snapshot([installed('document_reader')]), MISSION_001_MINI, { faultMode: 'normal' });
  assert.equal(run.branchId, 'B02_NO_SEARCH');
  assert.equal(run.outcome, 'blocked');
  assert.deepEqual(eventTypes(run), ['run.started', 'config.validated', 'validation.blocked', 'run.completed']);
  assert.equal(run.events.filter((e) => e.type === EVENT_TYPES.TOOL_RESULT).length, 0);
  assert.equal(run.events.filter((e) => e.type === EVENT_TYPES.TOOL_CALL).length, 0);
  assert.match(run.events[2].message, /检索工具不可用/);
  assert.equal(run.artifacts.evidence.level, null);
});

test('B02 Search 未授权 / Disabled / Invalid：都不会被当作 Ready', () => {
  const cases = [
    installed('announcement_search', { read: false }),
    installed('announcement_search', { enabled: false }),
    installed('announcement_search', { settings: { maxResults: 999 } }),
  ];
  for (const mod of cases) {
    const run = runSimulation(snapshot([mod, installed('document_reader')]), MISSION_001_MINI, {});
    assert.equal(run.branchId, 'B02_NO_SEARCH', `${mod.settings.maxResults} / read=${mod.permissions.read} / enabled=${mod.enabled}`);
    assert.equal(run.outcome, 'blocked');
  }
});

/* ==================================================================== *
 * A17 / A18 缺 Reader 与读取范围（B03）
 * ==================================================================== */
test('B03 缺 Reader：检索真实成功，读取被阻断，没有已读全文事件', () => {
  const run = runSimulation(
    snapshot([installed('announcement_search', { settings: { maxResults: 5 } })]),
    MISSION_001_MINI,
    {}
  );
  assert.equal(run.branchId, 'B03_NO_READER');
  assert.equal(run.outcome, 'partial');
  const types = eventTypes(run);
  assert.deepEqual(types, [
    'run.started',
    'config.validated',
    'task.plan_created',
    'tool.call',
    'tool.result',
    'tool.call',
    'evidence.sample_collected',
    'run.completed',
  ]);
  const blockedCall = run.events[5];
  assert.equal(blockedCall.toolId, 'document_reader');
  assert.equal(blockedCall.status, 'blocked');
  assert.equal(blockedCall.outputRef, 'p:read-blocked');
  assert.equal(run.artifacts.payloads['p:read-blocked'].executed, false);
  assert.equal(run.artifacts.evidence.level, 'search_excerpt');
  // 不存在任何 document_reader 的成功返回
  assert.equal(run.events.filter((e) => e.type === EVENT_TYPES.TOOL_RESULT && e.toolId === 'document_reader').length, 0);
});

test('A18 summary 模式：返回预先定义的摘要，而不是正文', () => {
  const run = runSimulation(
    snapshot([
      installed('announcement_search'),
      installed('document_reader', { settings: { readMode: 'summary', includeMetadata: true } }),
    ]),
    MISSION_001_MINI,
    {}
  );
  const payload = run.artifacts.payloads['p:read-response'];
  assert.equal(payload.textScope, 'summary');
  assert.equal(payload.content, null);
  assert.equal(typeof payload.summary, 'string');
  assert.equal(payload.chunkIds.length, 1);
  assert.equal(run.artifacts.evidence.level, 'summary_chunk');
  const notice = MISSION_001_MINI.getNotice(payload.sourceId);
  assert.notEqual(payload.summary, notice.body.join('\n\n'));
});

test('A18 full_text 模式：返回完整正文与多个片段', () => {
  const run = runSimulation(
    snapshot([
      installed('announcement_search'),
      installed('document_reader', { settings: { readMode: 'full_text', includeMetadata: true } }),
    ]),
    MISSION_001_MINI,
    {}
  );
  const payload = run.artifacts.payloads['p:read-response'];
  assert.equal(payload.textScope, 'full_text');
  assert.equal(payload.summary, null);
  const notice = MISSION_001_MINI.getNotice(payload.sourceId);
  assert.equal(payload.content, notice.body.join('\n\n'));
  assert.ok(payload.chunkIds.length >= 2);
  assert.equal(run.artifacts.evidence.level, 'full_text');
});

/* ==================================================================== *
 * A19 includeMetadata
 * ==================================================================== */
test('A19 includeMetadata：关闭时用户可见的工具响应不含来源与日期', () => {
  const off = runSimulation(
    snapshot([
      installed('announcement_search'),
      installed('document_reader', { settings: { readMode: 'full_text', includeMetadata: false } }),
    ]),
    MISSION_001_MINI,
    {}
  );
  const payload = off.artifacts.payloads['p:read-response'];
  assert.equal(payload.metadata, null);
  assert.equal(payload.metadataIncluded, false);
  assert.doesNotMatch(JSON.stringify(payload), /publishedAt|publisher|2026-10-/);
  // 引擎内部仍保留追踪用的 sourceId（内部元数据与用户可见响应分开存放）
  assert.ok(off.artifacts.internal['i:read'].publishedAt);

  const on = runSimulation(
    snapshot([
      installed('announcement_search'),
      installed('document_reader', { settings: { readMode: 'full_text', includeMetadata: true } }),
    ]),
    MISSION_001_MINI,
    {}
  );
  assert.equal(on.artifacts.payloads['p:read-response'].metadataIncluded, true);
  assert.match(on.artifacts.payloads['p:read-response'].metadata.publishedAt, /^\d{4}-\d{2}-\d{2}$/);
});

/* ==================================================================== *
 * A20 searchScope / maxResults 的真实效果
 * ==================================================================== */
test('A20 searchScope：范围改变候选集合', () => {
  const all = runAnnouncementSearch({ settings: { searchScope: 'all_notices', maxResults: 10 }, corpus: MISSION_001_MINI.notices });
  const events = runAnnouncementSearch({ settings: { searchScope: 'campus_events', maxResults: 10 }, corpus: MISSION_001_MINI.notices });
  assert.equal(all.meta.candidates, 5);
  assert.equal(events.meta.candidates, 3);
  assert.equal(all.meta.returned, 5);
  assert.equal(events.meta.returned, 3);
  assert.ok(events.payload.items.every((i) => i.matchedScope === 'campus_events'));
});

test('A20 maxResults：截断并如实报告 total / returned / truncated', () => {
  const limited = runAnnouncementSearch({ settings: { searchScope: 'all_notices', maxResults: 3 }, corpus: MISSION_001_MINI.notices });
  assert.equal(limited.meta.candidates, 5);
  assert.equal(limited.meta.returned, 3);
  assert.equal(limited.payload.truncated, true);

  // 本地数据少于上限：报告真实的较小数量，而不是编造返回数
  const under = runAnnouncementSearch({ settings: { searchScope: 'campus_events', maxResults: 10 }, corpus: MISSION_001_MINI.notices });
  assert.equal(under.meta.returned, 3);
  assert.equal(under.payload.truncated, false);
});

test('A20 maxResults 会真正影响事件消息中的数量，而不是只改配置', () => {
  const run3 = runSimulation(
    snapshot([
      installed('announcement_search', { settings: { maxResults: 3 } }),
      installed('document_reader'),
    ]),
    MISSION_001_MINI,
    {}
  );
  const run5 = runSimulation(
    snapshot([
      installed('announcement_search', { settings: { maxResults: 5 } }),
      installed('document_reader'),
    ]),
    MISSION_001_MINI,
    {}
  );
  const result3 = run3.events.find((e) => e.type === EVENT_TYPES.TOOL_RESULT && e.toolId === 'announcement_search');
  const result5 = run5.events.find((e) => e.type === EVENT_TYPES.TOOL_RESULT && e.toolId === 'announcement_search');
  assert.match(result3.message, /返回 3 条（已截断）/);
  assert.match(result5.message, /全部返回 5 条/);
  assert.equal(result3.sourceIds.length, 3);
  assert.equal(result5.sourceIds.length, 5);
});

/* ==================================================================== *
 * A21 固定超时分支 B04
 * ==================================================================== */
test('B04 search_timeout：确定性错误轨迹，不伪造成功响应', () => {
  const run = runSimulation(READY_BOTH(), MISSION_001_MINI, { faultMode: 'search_timeout' });
  assert.equal(run.branchId, 'B04_SEARCH_TIMEOUT');
  assert.equal(run.outcome, 'error');
  assert.deepEqual(eventTypes(run), ['run.started', 'config.validated', 'task.plan_created', 'tool.call', 'tool.error', 'run.completed']);
  assert.equal(run.events.filter((e) => e.type === EVENT_TYPES.TOOL_RESULT).length, 0);
  assert.equal(run.artifacts.payloads['p:search-error'].code, 'SEARCH_TIMEOUT');
  assert.match(run.events[4].message, /超时/);
  // 故障只属于本次运行：没有把模块写成永久 Invalid
  assert.equal(run.artifacts.payloads['p:availability'].tools[0].status, 'Ready');
});

test('B04 故障注入不会随机触发：没有显式选项时永远是正常分支', () => {
  for (let i = 0; i < 5; i++) {
    const run = runSimulation(READY_BOTH(), MISSION_001_MINI, {});
    assert.equal(run.branchId, 'B01_NORMAL');
  }
});

/* ==================================================================== *
 * B05 空结果
 * ==================================================================== */
test('B05 空结果：检索成功但候选为 0 → 不调用 Reader，部分完成', () => {
  const emptyMission = { ...MISSION_001_MINI, notices: [] };
  const run = runSimulation(READY_BOTH(), emptyMission, {});
  assert.equal(run.branchId, 'B05_NO_RESULTS');
  assert.equal(run.outcome, 'partial');
  assert.ok(eventTypes(run).includes('search.empty'));
  assert.equal(run.events.filter((e) => e.toolId === 'document_reader').length, 0);
  assert.equal(run.artifacts.evidence.level, null);
});

/* ==================================================================== *
 * A22 确定性
 * ==================================================================== */
test('A22 确定性：同一配置 + 任务版本 + 故障选项 → 完全相同的事件轨迹', () => {
  const a = runSimulation(READY_BOTH(), MISSION_001_MINI, { faultMode: 'normal' });
  const b = runSimulation(READY_BOTH(), MISSION_001_MINI, { faultMode: 'normal' });
  assert.equal(a.runId, b.runId);
  assert.equal(canonicalize(a), canonicalize(b));
  assert.deepEqual(a.events, b.events);
});

test('A22 键顺序不影响 runId（规范化序列化）', () => {
  const settingsA = { searchScope: 'all_notices', maxResults: 3 };
  const settingsB = { maxResults: 3, searchScope: 'all_notices' };
  const snapA = snapshot([installed('announcement_search', { settings: settingsA }), installed('document_reader')]);
  const snapB = snapshot([installed('announcement_search', { settings: settingsB }), installed('document_reader')]);
  assert.equal(runSimulation(snapA, MISSION_001_MINI, {}).runId, runSimulation(snapB, MISSION_001_MINI, {}).runId);
});

test('未知故障选项按 normal 处理并在 notes 中如实说明', () => {
  const run = runSimulation(READY_BOTH(), MISSION_001_MINI, { faultMode: 'explode' });
  assert.equal(run.options.faultMode, 'normal');
  assert.equal(run.branchId, 'B01_NORMAL');
  assert.ok(run.notes.some((n) => /未知故障选项/.test(n)));
});

/* ==================================================================== *
 * A23 配置快照不可变
 * ==================================================================== */
test('A23 配置快照隔离：运行后修改装配台配置，历史运行不被重算', () => {
  const live = READY_BOTH();
  const run = runSimulation(live, MISSION_001_MINI, {});
  const before = canonicalize(run);

  // 模拟用户在装配台里改参数并移除模块
  live.modules[0].settings.maxResults = 10;
  live.modules.pop();

  assert.equal(canonicalize(run), before);
  assert.equal(run.configSnapshot.modules.length, 2);
  assert.equal(run.configSnapshot.modules[0].settings.maxResults, 3);
  assert.equal(Object.isFrozen(run.configSnapshot), true);
  assert.equal(Object.isFrozen(run.events), true);
  assert.throws(() => {
    run.configSnapshot.modules[0].settings.maxResults = 99;
  }, TypeError);
});

/* ==================================================================== *
 * 安全降级：未知资料 ID / 异常长文本 / 未知工具
 * ==================================================================== */
test('读取工具：未知或异常形状的 sourceId 一律拒绝，不猜测内容', () => {
  const settings = { readMode: 'full_text', includeMetadata: true };
  assert.equal(runDocumentReader({ settings, sourceId: 'NTC-9999' }).error.code, 'UNKNOWN_SOURCE');
  assert.equal(runDocumentReader({ settings, sourceId: '<script>alert(1)</script>' }).error.code, 'INVALID_SOURCE_ID');
  assert.equal(runDocumentReader({ settings, sourceId: '../../etc/passwd' }).error.code, 'INVALID_SOURCE_ID');
  assert.equal(runDocumentReader({ settings, sourceId: null }).error.code, 'INVALID_SOURCE_ID');
});

test('参数非法时的检索请求不会被当作成功', () => {
  const bad = runAnnouncementSearch({ settings: { searchScope: 'nope', maxResults: 3 }, corpus: MISSION_001_MINI.notices });
  assert.equal(bad.ok, false);
  assert.equal(bad.error.code, 'INVALID_ARGUMENTS');
});

/* ==================================================================== *
 * A28 历史记录序列化与损坏降级
 * ==================================================================== */
test('A28 历史记录：序列化 → 解析往返保持同一份事件轨迹', () => {
  const run = runSimulation(READY_BOTH(), MISSION_001_MINI, {});
  const raw = serializeHistory({ run, savedAt: '2026-10-15T00:00:00.000Z' });
  const parsed = parseHistory(raw);
  assert.equal(parsed.notice, null);
  assert.equal(parsed.savedAt, '2026-10-15T00:00:00.000Z');
  assert.deepEqual(parsed.run.events, run.events);
  assert.equal(canonicalize(parsed.run), canonicalize(run));
});

test('A28 历史记录损坏：坏 JSON / 错版本 / 事件缺失都安全降级', () => {
  const corrupt = parseHistory('{ broken json ');
  assert.equal(corrupt.run, null);
  assert.equal(corrupt.notice.code, 'EXECUTION_STORAGE_CORRUPT');

  const wrongVersion = parseHistory(JSON.stringify({ schemaVersion: 99, run: null }));
  assert.equal(wrongVersion.run, null);
  assert.equal(wrongVersion.notice.code, 'EXECUTION_STORAGE_VERSION');

  const missingEvents = parseHistory(
    JSON.stringify({ schemaVersion: 1, run: { ...runSimulation(READY_BOTH(), MISSION_001_MINI, {}), events: [] } })
  );
  assert.equal(missingEvents.run, null);
  assert.equal(missingEvents.notice.code, 'EXECUTION_STORAGE_INVALID');

  assert.deepEqual(parseHistory(null), { run: null, savedAt: null, notice: null });
  assert.equal(parseHistory('[]').run, null);
});

test('A28 形状校验：合法运行通过，篡改事件类型会被拒绝', () => {
  const run = runSimulation(READY_BOTH(), MISSION_001_MINI, {});
  assert.equal(isRunShapeValid(run), true);
  const tampered = JSON.parse(JSON.stringify(run));
  tampered.events[3].type = 'ai.thinking.deep';
  assert.equal(isRunShapeValid(tampered), false);
});

/* ==================================================================== *
 * 运行摘要
 * ==================================================================== */
test('summarizeRun：结局、分支与样本等级来自事件与 outcome 本身', () => {
  const run = runSimulation(READY_BOTH(), MISSION_001_MINI, {});
  const summary = summarizeRun(run);
  assert.equal(summary.outcomeEn, 'sample_acquired');
  assert.equal(summary.branchId, 'B01_NORMAL');
  assert.equal(summary.eventCount, 9);
  assert.equal(summary.report.status, 'not_generated');
  assert.deepEqual(summary.toolsInvoked, ['announcement_search', 'document_reader']);
});

test('stableHash：同一输入稳定，不同输入不同', () => {
  assert.equal(stableHash('abc'), stableHash('abc'));
  assert.notEqual(stableHash('abc'), stableHash('abd'));
  assert.match(stableHash('abc'), /^[0-9a-f]{8}$/);
});

test('memoryStorage 未参与真实 localStorage（守卫：测试用内存实现）', () => {
  const store = memoryStorage();
  store.setItem('k', 'v');
  assert.equal(store.getItem('k'), 'v');
});
