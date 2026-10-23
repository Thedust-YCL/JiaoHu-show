/**
 * tests/research-persistence.test.mjs
 * ------------------------------------------------------------------
 * M0.4 运行历史持久化（纯逻辑）：
 *   · 新命名空间保存最近两次运行，超出按容量策略丢弃更早的一条
 *   · 刷新后可恢复完整的 Run（事件 + 证据 + 报告 + 引用）
 *   · M0.3 旧命名空间只读兼容，绝不被覆盖或删除
 *   · 损坏 / 错版本 / 单条坏记录 / 配额不足都能安全降级（A64 / A65 / A66）
 * ------------------------------------------------------------------
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { MODULES, defaultSettings } from '../src/features/constructor/model/modules.js';
import { runSimulation } from '../src/simulation/engine/runSimulation.js';
import { MISSION_001 } from '../src/research-packs/mission-001/index.js';
import {
  appendResearchRun,
  readResearchHistory,
  clearResearchHistory,
  readExecution,
  writeExecution,
  RESEARCH_STORAGE_KEY,
  EXECUTION_STORAGE_KEY,
  MAX_LOCAL_RUNS,
} from '../src/features/execution/state/persistence.js';
import { memoryStorage } from './helpers.mjs';

/* ------------------------------ 夹具 ------------------------------ */
function installed(moduleId, settings = {}) {
  const mod = MODULES[moduleId];
  return { moduleId, portId: mod.portId, enabled: true, permissions: { read: true }, settings: { ...defaultSettings(moduleId), ...settings } };
}
const config = (maxResults = 5) => ({
  schemaVersion: 1,
  modules: [
    installed('announcement_search', { searchScope: 'all_notices', maxResults }),
    installed('document_reader', { readMode: 'full_text', includeMetadata: true }),
  ],
});
const runA = () => runSimulation(config(5), MISSION_001, { evidencePolicy: 'VERIFY_REVISIONS' });
const runB = () => runSimulation(config(3), MISSION_001, { evidencePolicy: 'COLLECT_ONLY' });

const legacyRecord = (overrides = {}) => ({
  schemaVersion: 1,
  savedAt: '2026-10-01T00:00:00.000Z',
  run: {
    schemaVersion: 1,
    runId: 'run-legacy0001',
    missionId: 'mission-001-mini',
    missionVersion: 1,
    corpusVersion: 'mission-001-mini@1',
    configSnapshot: { schemaVersion: 1, modules: [] },
    options: { faultMode: 'normal' },
    outcome: 'blocked',
    branchId: 'B02_NO_SEARCH',
    events: [
      { id: 'run-legacy0001#e00', sequence: 0, phase: 'VALIDATION', type: 'run.started', status: 'info', actorId: 'system', toolId: null, message: '旧版运行开始', sourceIds: [], chunkIds: [], branchId: null, ruleId: null },
      { id: 'run-legacy0001#e01', sequence: 1, phase: 'END', type: 'run.completed', status: 'blocked', actorId: 'system', toolId: null, message: '旧版运行结束', sourceIds: [], chunkIds: [], branchId: 'B02_NO_SEARCH', ruleId: null },
    ],
    artifacts: { payloads: {}, internal: {}, evidence: { level: null, sourceIds: [], chunkIds: [], note: '旧版无证据' }, report: { status: 'not_generated', note: 'M0.3 不生成报告' }, plan: [] },
    stats: { eventCount: 2, toolsInvoked: [], searches: 0, reads: 0 },
    notes: ['旧版记录'],
    ...overrides,
  },
});

/* ==================================================================== *
 * 基本写入 / 读取
 * ==================================================================== */
test('A65 运行历史：写入后可按顺序恢复，最新的在前', () => {
  const store = memoryStorage();
  const a = runA();
  const b = runB();

  const first = appendResearchRun(store, a, '2026-10-20T10:00:00.000Z');
  assert.equal(first.ok, true);
  assert.equal(first.runs.length, 1);
  assert.equal(first.evicted, 0);

  const second = appendResearchRun(store, b, '2026-10-20T11:00:00.000Z');
  assert.equal(second.ok, true);
  assert.equal(second.runs.length, 2);
  assert.equal(second.runs[0].run.runId, b.runId);
  assert.equal(second.runs[1].run.runId, a.runId);

  const restored = readResearchHistory(store);
  assert.equal(restored.notice, null);
  assert.equal(restored.legacy, null);
  assert.deepEqual(restored.runs.map((r) => r.run.runId), [b.runId, a.runId]);
  assert.equal(restored.runs[0].savedAt, '2026-10-20T11:00:00.000Z');
});

test('A65 恢复的 Run 保留完整产物：事件、证据声明、报告与引用', () => {
  const store = memoryStorage();
  const run = runA();
  appendResearchRun(store, run, '2026-10-20T10:00:00.000Z');
  const restored = readResearchHistory(store).runs[0].run;

  assert.equal(restored.events.length, run.events.length);
  assert.deepEqual(restored.events.map((e) => e.id), run.events.map((e) => e.id));
  assert.equal(restored.artifacts.evidence.claims.length, run.artifacts.evidence.claims.length);
  assert.equal(restored.artifacts.report.status, run.artifacts.report.status);
  assert.deepEqual(
    restored.artifacts.report.citations.map((c) => `${c.id}:${c.sourceId}:${c.chunkId}:${c.eventId}`),
    run.artifacts.report.citations.map((c) => `${c.id}:${c.sourceId}:${c.chunkId}:${c.eventId}`)
  );
  // 引用仍能指向恢复后的事件
  const ids = new Set(restored.events.map((e) => e.id));
  assert.ok(restored.artifacts.report.citations.every((c) => ids.has(c.eventId)));
});

test(`容量策略：最多保留 ${MAX_LOCAL_RUNS} 次运行，超出时丢弃更早的记录并如实报告`, () => {
  const store = memoryStorage();
  const a = runA();
  const b = runB();
  const c = runSimulation(config(10), MISSION_001, {});
  appendResearchRun(store, a);
  appendResearchRun(store, b);
  const third = appendResearchRun(store, c);
  assert.equal(third.ok, true);
  assert.equal(third.runs.length, MAX_LOCAL_RUNS);
  assert.equal(third.evicted, 1);
  assert.deepEqual(third.runs.map((r) => r.run.runId), [c.runId, b.runId]);
  // 被丢弃的不是「正在查看」的本次运行
  assert.ok(!third.runs.some((r) => r.run.runId === a.runId));
});

test('clearResearchHistory 只清理研究命名空间', () => {
  const store = memoryStorage({ 'agent-zero:constructor:v1': '{"modules":[]}' });
  appendResearchRun(store, runA());
  assert.equal(clearResearchHistory(store), true);
  assert.equal(store.getItem(RESEARCH_STORAGE_KEY), null);
  assert.equal(store.getItem('agent-zero:constructor:v1'), '{"modules":[]}');
});

/* ==================================================================== *
 * A64 旧命名空间只读兼容
 * ==================================================================== */
test('A64 没有新记录时回退读取 M0.3 旧记录，并标记为 legacy（不补造报告）', () => {
  const store = memoryStorage({ [EXECUTION_STORAGE_KEY]: JSON.stringify(legacyRecord()) });
  const restored = readResearchHistory(store);
  assert.equal(restored.runs.length, 0);
  assert.ok(restored.legacy);
  assert.equal(restored.legacy.run.schemaVersion, 1);
  assert.equal(restored.legacy.run.artifacts.report.status, 'not_generated');
  assert.equal(restored.notice.code, 'EXECUTION_STORAGE_LEGACY');
  assert.match(restored.notice.message, /只有执行轨迹，没有结构化报告/);
});

test('A64 有新记录时优先使用新记录，旧记录保持原样不被改写', () => {
  const legacyRaw = JSON.stringify(legacyRecord());
  const store = memoryStorage({ [EXECUTION_STORAGE_KEY]: legacyRaw });
  appendResearchRun(store, runA());
  const restored = readResearchHistory(store);
  assert.equal(restored.runs.length, 1);
  assert.equal(restored.legacy, null);
  assert.equal(store.getItem(EXECUTION_STORAGE_KEY), legacyRaw, '旧命名空间必须一字不改');
});

test('readExecution 仍可独立读取旧记录（M0.3 回归依赖）', () => {
  const store = memoryStorage({ [EXECUTION_STORAGE_KEY]: JSON.stringify(legacyRecord()) });
  const result = readExecution(store);
  assert.equal(result.run.runId, 'run-legacy0001');
  assert.equal(result.legacy, true);
  assert.equal(writeExecution(store, EXECUTION_STORAGE_KEY, legacyRecord().run, '2026-10-02T00:00:00.000Z'), true);
});

/* ==================================================================== *
 * A66 损坏数据安全降级
 * ==================================================================== */
test('A66 坏 JSON / 错结构 / 空值都降级为「无历史记录 + 可读提示」', () => {
  const corrupt = readResearchHistory(memoryStorage({ [RESEARCH_STORAGE_KEY]: '{ broken json' }));
  assert.deepEqual(corrupt.runs, []);
  assert.equal(corrupt.notice.code, 'RESEARCH_STORAGE_CORRUPT');
  assert.ok(corrupt.notice.message.length > 0);

  const wrongShape = readResearchHistory(memoryStorage({ [RESEARCH_STORAGE_KEY]: JSON.stringify({ schemaVersion: 2 }) }));
  assert.deepEqual(wrongShape.runs, []);
  assert.equal(wrongShape.notice.code, 'RESEARCH_STORAGE_SHAPE');

  const empty = readResearchHistory(memoryStorage());
  assert.deepEqual(empty, { runs: [], legacy: null, notice: null });
});

test('A66 单条坏记录不连累其余记录', () => {
  const good = runA();
  const raw = JSON.stringify({
    schemaVersion: 2,
    savedAt: 'x',
    runs: [
      { run: { schemaVersion: 2, runId: 'broken' }, savedAt: 'x' },
      { run: good, savedAt: '2026-10-20T10:00:00.000Z' },
    ],
  });
  const restored = readResearchHistory(memoryStorage({ [RESEARCH_STORAGE_KEY]: raw }));
  assert.equal(restored.runs.length, 1);
  assert.equal(restored.runs[0].run.runId, good.runId);
});

test('A66 全部记录都坏时给出可读提示，而不是静默空状态', () => {
  const raw = JSON.stringify({ schemaVersion: 2, savedAt: 'x', runs: [{ run: { schemaVersion: 99 } }, { run: null }] });
  const restored = readResearchHistory(memoryStorage({ [RESEARCH_STORAGE_KEY]: raw }));
  assert.deepEqual(restored.runs, []);
  assert.ok(restored.notice);
  assert.match(restored.notice.message, /字段不合法|版本/);
});

/* ==================================================================== *
 * 容量 / 隐私模式
 * ==================================================================== */
test('写入失败（配额 / 隐私模式）时明确降级，不抛错也不清空历史', () => {
  const failing = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => true,
  };
  const result = appendResearchRun(failing, runA());
  assert.equal(result.ok, false);
  assert.deepEqual(result.runs, []);
  assert.equal(result.notice.code, 'RESEARCH_STORAGE_FULL');
  assert.match(result.notice.message, /刷新后不会恢复/);
});

test('只放得下本次运行时降级为「仅保留本次」并提示更早记录未写入', () => {
  const a = runA();
  let stored = null;
  const store = {
    getItem: () => stored,
    setItem: (key, value) => {
      const parsed = JSON.parse(value);
      if (parsed.runs.length > 1) throw new Error('QuotaExceededError');
      stored = value;
    },
    removeItem: () => {
      stored = null;
    },
  };
  appendResearchRun(store, a); // 第一条：只剩 1 条 → 成功
  const second = appendResearchRun(store, runB());
  assert.equal(second.ok, true);
  assert.equal(second.runs.length, 1);
  assert.ok(second.evicted >= 1);
  assert.equal(second.notice.code, 'RESEARCH_STORAGE_PARTIAL');
});

test('环境没有可用存储时不抛错，返回可用提示', () => {
  const result = appendResearchRun(null && undefined ? null : { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => false }, runA());
  assert.equal(result.ok, false);
  assert.ok(result.notice);
  assert.equal(readResearchHistory({ getItem: () => { throw new Error('denied'); }, setItem: () => {}, removeItem: () => false }).notice.code, 'RESEARCH_STORAGE_BLOCKED');
});
