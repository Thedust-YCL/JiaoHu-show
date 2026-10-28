import test from 'node:test';
import assert from 'node:assert/strict';
import * as scene from '../src/scenes/scene.js';

test('diagnostic frame rate uses elapsed wall time even when animation steps are capped', () => {
  assert.equal(typeof scene.createFrameMeter, 'function');
  const meter = scene.createFrameMeter();
  for (let i = 0; i < 5; i++) meter.recordFrame(0.1);
  assert.ok(Math.abs(meter.getFps() - 10) < 0.001);
  for (let i = 0; i < 10; i++) meter.recordFrame(0.05);
  assert.ok(Math.abs(meter.getFps() - 20) < 0.001);
});
