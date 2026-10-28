import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeCorePresentation } from '../src/features/execution/components/executionCore.js';
import { executionToneColor } from '../src/scenes/core/modules3d.js';
import { appRouteHash, parseAppRoute } from '../src/app.js';

test('M3.1 Runtime v2 events use their real id, reason and status in the shared core caption', () => {
  const event = {
    eventId: 'runtime-1#e03',
    sequence: 3,
    phase: 'SEARCH',
    type: 'tool.error',
    status: 'error',
    toolId: 'announcement_search',
    reason: '本地教学工具超时',
  };

  assert.deepEqual(normalizeCorePresentation({ status: 'running' }, event), {
    id: 'runtime-1#e03',
    sequence: 3,
    phase: 'SEARCH',
    type: 'tool.error',
    typeLabel: '工具执行失败',
    status: 'error',
    statusLabel: '出错',
    tone: 'error',
    toolId: 'announcement_search',
    message: '本地教学工具超时',
  });
});

test('M3.1 a completed A/B run without a selected event reports its actual terminal state', () => {
  const presentation = normalizeCorePresentation({
    status: 'completed',
    result: { terminationReason: 'report_generated' },
  }, null);

  assert.equal(presentation.typeLabel, '运行状态');
  assert.equal(presentation.statusLabel, '已完成');
  assert.equal(presentation.tone, 'success');
  assert.match(presentation.message, /report_generated/);
});

test('M3.1 Runtime paused, waiting, failed and cancelled states keep distinct text and tone', () => {
  const expected = {
    paused: ['已暂停', 'attention'],
    waiting_approval: ['等待模拟审批', 'attention'],
    failed: ['失败', 'error'],
    cancelled: ['已取消', 'muted'],
  };

  for (const [status, [label, tone]] of Object.entries(expected)) {
    const presentation = normalizeCorePresentation({ status }, null);
    assert.equal(presentation.statusLabel, label, status);
    assert.equal(presentation.tone, tone, status);
  }
});

test('M3.1 the main 3D bay maps real event statuses to semantic focus colours', () => {
  assert.equal(executionToneColor('started'), 0x77d8ec);
  assert.equal(executionToneColor('success'), 0x80d9b4);
  assert.equal(executionToneColor('error'), 0xff8585);
  assert.equal(executionToneColor('blocked'), 0xf0bd78);
  assert.equal(executionToneColor('muted'), 0xaabee0);
});

test('M3.1 execution and report are real routes and browser state carries return context', () => {
  assert.equal(appRouteHash('execution'), '#/execution');
  assert.equal(appRouteHash('report'), '#/report');
  assert.deepEqual(parseAppRoute('#/knowledge/tool_calling', {
    azRoute: { context: { from: 'runtime', runId: 'run-7', eventSequence: 9 } },
  }), {
    kind: 'knowledge',
    id: 'tool_calling',
    context: { from: 'runtime', runId: 'run-7', eventSequence: 9 },
  });
});
