/**
 * tests/execution.test.mjs
 * ------------------------------------------------------------------
 * M0.3 回放与运行记录的自动测试（纯逻辑，不需要浏览器）：
 *   · 回放指针边界（首尾不越界）、Seek、调速、复位不重新调用引擎
 *   · 播放推进与自动停在末尾；速度不改变事件数组
 *   · 最近一次运行记录的写入 / 恢复 / 损坏降级，且不覆盖构建器存储
 * ------------------------------------------------------------------
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { BASE_INTERVAL_MS, SPEEDS, createReplay } from '../src/features/execution/state/replay.js';
import {
  EXECUTION_STORAGE_KEY,
  clearExecution,
  readExecution,
  writeExecution,
} from '../src/features/execution/state/persistence.js';
import { runSimulation } from '../src/simulation/engine/runSimulation.js';
import { MODULES, defaultSettings } from '../src/features/constructor/model/modules.js';
import { MISSION_001_MINI } from '../src/research-packs/mission-001-mini/index.js';
import { memoryStorage } from './helpers.mjs';

function installed(moduleId, { settings = {} } = {}) {
  return {
    moduleId,
    portId: MODULES[moduleId].portId,
    enabled: true,
    permissions: { read: true },
    settings: { ...defaultSettings(moduleId), ...settings },
  };
}

const READY_RUN = () =>
  runSimulation(
    { schemaVersion: 1, modules: [installed('announcement_search', { settings: { maxResults: 3 } }), installed('document_reader')] },
    MISSION_001_MINI,
    {}
  );

/** 以真实帧长（≤250ms）累计推进时间，验证播放推进与末尾自动暂停 */
function advance(replay, totalMs, stepMs = 250) {
  let left = totalMs;
  while (left > 0) {
    const dt = Math.min(stepMs, left) / 1000;
    replay.tick(dt);
    left -= Math.min(stepMs, left);
  }
}

/* ==================================================================== *
 * A25 / A26 回放控制
 * ==================================================================== */
test('A25 回放初始状态：停在第一个事件，未播放', () => {
  const replay = createReplay(READY_RUN());
  const s = replay.getState();
  assert.equal(s.index, 0);
  assert.equal(s.total, 9);
  assert.equal(s.playing, false);
  assert.equal(s.atStart, true);
  assert.equal(s.atEnd, false);
  assert.equal(s.event.sequence, 0);
});

test('A26 单步：首尾不越界', () => {
  const replay = createReplay(READY_RUN());
  assert.equal(replay.prev(), 0);
  assert.equal(replay.getState().index, 0);
  for (let i = 0; i < 12; i++) replay.next();
  assert.equal(replay.getState().index, 8);
  assert.equal(replay.getState().atEnd, true);
  assert.equal(replay.next(), 8);
  assert.equal(replay.getState().event.type, 'run.completed');
});

test('A26 Seek：任意序号可跳转，越界被夹紧且不发生非法下标', () => {
  const replay = createReplay(READY_RUN());
  assert.equal(replay.seekTo(5), 5);
  assert.equal(replay.getState().event.sequence, 5);
  assert.equal(replay.seekTo(-3), 0);
  assert.equal(replay.seekTo(999), 8);
  assert.equal(replay.events.length, 9);
});

test('A26 速度：只接受 0.5/1/2/4，且不改变事件数组与指针', () => {
  const run = READY_RUN();
  const replay = createReplay(run);
  replay.seekTo(3);
  for (const s of SPEEDS) {
    assert.equal(replay.setSpeed(s), s);
    assert.equal(replay.getState().speed, s);
    assert.equal(replay.getState().index, 3);
    assert.equal(replay.getState().intervalMs, BASE_INTERVAL_MS / s);
  }
  assert.equal(replay.setSpeed(3), 4);
  assert.deepEqual(replay.events.map((e) => e.id), run.events.map((e) => e.id));
});

test('A25 播放：推进指针并在末尾自动暂停', () => {
  const replay = createReplay(READY_RUN(), { baseIntervalMs: 1000 });
  replay.play();
  assert.equal(replay.getState().playing, true);
  // 1× 时每个事件 1000ms：累计推进 3.5 个事件
  advance(replay, 3500);
  assert.equal(replay.getState().index, 3);
  assert.equal(replay.getState().playing, true);
  advance(replay, 10000);
  assert.equal(replay.getState().index, 8);
  assert.equal(replay.getState().playing, false);
  assert.equal(replay.getState().atEnd, true);
});

test('A25 暂停：暂停后继续推进时间不再移动指针', () => {
  const replay = createReplay(READY_RUN(), { baseIntervalMs: 1000 });
  replay.play();
  advance(replay, 2000);
  const paused = replay.getState().index;
  replay.pause();
  advance(replay, 5000);
  assert.equal(replay.getState().index, paused);
  assert.equal(replay.getState().playing, false);
});

test('A25 播放到底后再次播放不会跳回起点（不产生假动作）', () => {
  const replay = createReplay(READY_RUN(), { baseIntervalMs: 100 });
  replay.play();
  advance(replay, 10000);
  replay.play();
  assert.equal(replay.getState().index, 8);
  assert.equal(replay.getState().playing, false);
});

test('A26 复位：指针归零并停止，不重新调用引擎', () => {
  const run = READY_RUN();
  const replay = createReplay(run);
  replay.seekTo(7);
  replay.play();
  assert.equal(replay.restart(), 0);
  assert.equal(replay.getState().index, 0);
  assert.equal(replay.getState().playing, false);
  // 事件数组是同一份对象引用：复位不重算、不重放引擎
  assert.equal(replay.events, run.events);
  assert.equal(replay.getState().event.id, run.events[0].id);
});

test('A22 速度与播放不影响运行结果：事件数组始终保持不变', () => {
  const run = READY_RUN();
  const replay = createReplay(run);
  const before = replay.events.map((e) => `${e.id}:${e.type}:${e.status}`);
  replay.play();
  replay.setSpeed(4);
  replay.tick(5);
  replay.setSpeed(0.5);
  replay.tick(1);
  replay.seekTo(2);
  replay.restart();
  assert.deepEqual(replay.events.map((e) => `${e.id}:${e.type}:${e.status}`), before);
  assert.equal(run.outcome, 'sample_acquired');
});

test('空事件数组：不产生非法下标，控制动作安全退化', () => {
  const replay = createReplay({ events: [] });
  assert.equal(replay.getState().index, -1);
  assert.equal(replay.getState().event, null);
  assert.equal(replay.next(), -1);
  assert.equal(replay.prev(), -1);
  replay.play();
  assert.equal(replay.getState().playing, false);
  replay.tick(5);
  assert.equal(replay.getState().index, -1);
});

test('dispose：清理订阅并停止推进', () => {
  const replay = createReplay(READY_RUN(), { baseIntervalMs: 100 });
  let updates = 0;
  replay.subscribe(() => (updates += 1));
  replay.play();
  replay.tick(1);
  const index = replay.getState().index;
  replay.dispose();
  replay.tick(10);
  assert.equal(replay.getState().index, index);
  replay.play();
  assert.equal(replay.getState().playing, false);
  assert.equal(updates > 0, true);
  assert.equal(replay.getState().playing, false);
});

/* ==================================================================== *
 * A28 运行记录持久化
 * ==================================================================== */
test('A28 运行记录：写入后可恢复同一份事件轨迹', () => {
  const storage = memoryStorage();
  const run = READY_RUN();
  assert.equal(writeExecution(storage, EXECUTION_STORAGE_KEY, run, '2026-10-15T10:00:00.000Z'), true);
  const restored = readExecution(storage, EXECUTION_STORAGE_KEY);
  assert.equal(restored.notice, null);
  assert.equal(restored.savedAt, '2026-10-15T10:00:00.000Z');
  assert.equal(restored.run.runId, run.runId);
  assert.deepEqual(restored.run.events.map((e) => e.id), run.events.map((e) => e.id));
  assert.equal(restored.run.outcome, 'sample_acquired');
});

test('A28 运行记录：损坏 / 错版本 / 空数据都安全降级，不抛异常', () => {
  const storage = memoryStorage();
  storage.setItem(EXECUTION_STORAGE_KEY, '{ not json');
  const corrupt = readExecution(storage, EXECUTION_STORAGE_KEY);
  assert.equal(corrupt.run, null);
  assert.equal(corrupt.notice.code, 'EXECUTION_STORAGE_CORRUPT');

  storage.setItem(EXECUTION_STORAGE_KEY, JSON.stringify({ schemaVersion: 42 }));
  assert.equal(readExecution(storage, EXECUTION_STORAGE_KEY).notice.code, 'EXECUTION_STORAGE_VERSION');

  const empty = readExecution(memoryStorage(), EXECUTION_STORAGE_KEY);
  // M0.4：返回值新增 legacy 标记（旧版轨迹没有结构化报告）
  assert.deepEqual(empty, { run: null, savedAt: null, legacy: false, notice: null });
});

test('A28 运行记录：不与构建器命名空间互相覆盖', () => {
  const constructorRaw = '{"schemaVersion":1,"modules":[{"moduleId":"announcement_search"}]}';
  const storage = memoryStorage({ 'agent-zero:constructor:v1': constructorRaw });
  writeExecution(storage, EXECUTION_STORAGE_KEY, READY_RUN());
  assert.equal(storage.getItem('agent-zero:constructor:v1'), constructorRaw);
  clearExecution(storage, EXECUTION_STORAGE_KEY);
  assert.equal(storage.getItem(EXECUTION_STORAGE_KEY), null);
  assert.equal(storage.getItem('agent-zero:constructor:v1'), constructorRaw);
});

test('A28 运行记录：存储被拒绝时静默降级（不抛错）', () => {
  const blocked = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('denied');
    },
    removeItem: () => {
      throw new Error('denied');
    },
  };
  assert.equal(writeExecution(blocked, EXECUTION_STORAGE_KEY, READY_RUN()), false);
  assert.equal(readExecution(blocked, EXECUTION_STORAGE_KEY).run, null);
  assert.equal(readExecution(blocked, EXECUTION_STORAGE_KEY).notice.code, 'EXECUTION_STORAGE_BLOCKED');
  assert.equal(clearExecution(blocked, EXECUTION_STORAGE_KEY), false);
});
