/**
 * tests/lab-tool-calling-mcp.test.mjs
 * ------------------------------------------------------------------
 * Lab 03（M1.2 D05 / A20–A24）的纯逻辑测试：
 *   · 协议路径**不产生**第二套执行记录，只引用既有事件；
 *   · 同一份 run 下，直连与 MCP 路径的数据、结局、分支、成功/阻断计数完全一致；
 *   · 工具缺失 / 未授权 / 超时等失败场景在两条路径上同样失败，不伪造成功；
 *   · 能力类型（Tools / Resources / Prompts）与角色（Host / Client / Server）划分正确。
 * ------------------------------------------------------------------
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CAPABILITY_TYPES,
  DEMO_CAPABILITIES,
  MCP_ROLES,
  buildProtocolTrace,
  capabilityDiscovery,
  comparePaths,
  isToolEvent,
  protocolStepStats,
} from '../src/features/laboratory/tool-calling/mcpPath.js';
import { runSimulation } from '../src/simulation/engine/runSimulation.js';
import { MISSION_001_MINI } from '../src/research-packs/mission-001-mini/index.js';

/** 与知识页 buildDemoSnapshot 一致的演示快照（只用于测试） */
function snapshot({ condition = 'ready' } = {}) {
  const modules = [
    {
      moduleId: 'announcement_search',
      portId: 'SEARCH_PORT',
      enabled: true,
      permissions: { read: condition !== 'no_search' },
      settings: { searchScope: 'all_notices', maxResults: 3 },
    },
  ];
  if (condition !== 'no_search' && condition !== 'no_reader') {
    modules.push({
      moduleId: 'document_reader',
      portId: 'READER_PORT',
      enabled: true,
      permissions: { read: condition !== 'reader_unauthorized' },
      settings: { readMode: 'full_text', includeMetadata: true },
    });
  }
  return { schemaVersion: 1, modules };
}

function run(config = {}, options = {}) {
  return runSimulation(snapshot(config), MISSION_001_MINI, options);
}

test('MCP 角色与能力类型：三角色 + 三类能力齐全，且语义不混用', () => {
  assert.deepEqual(MCP_ROLES.map((r) => r.id), ['host', 'client', 'server', 'app']);
  assert.deepEqual(CAPABILITY_TYPES.map((c) => c.id), ['tools', 'resources', 'prompts']);
  const types = new Set(DEMO_CAPABILITIES.map((c) => c.type));
  assert.deepEqual([...types].sort(), ['prompts', 'resources', 'tools']);
  // 能力描述必须说明它是哪一类，不允许把资源写成工具
  const resource = DEMO_CAPABILITIES.find((c) => c.type === 'resources');
  assert.match(resource.note, /只读/);
  const prompt = DEMO_CAPABILITIES.find((c) => c.type === 'prompts');
  assert.match(prompt.note, /模板|模版/);
});

test('能力发现：直连路径没有协议协商步骤，MCP 路径有 Host/Client/Server 三步', () => {
  const direct = capabilityDiscovery({ mode: 'direct' });
  assert.equal(direct.steps.length, 0);
  assert.match(direct.note, /不需要协议发现/);
  const mcp = capabilityDiscovery({ mode: 'mcp' });
  assert.deepEqual(mcp.steps.map((s) => s.role), ['host', 'client', 'server']);
  assert.match(mcp.note, /不声称与任何真实服务端协商/);
});

test('协议路径：只包装既有事件，不生成新事件（事件条数与 ID 完全一致）', () => {
  const result = run();
  const direct = buildProtocolTrace({ run: result, mode: 'direct' });
  const mcp = buildProtocolTrace({ run: result, mode: 'mcp' });

  const eventStepsOf = (trace) => trace.steps.filter((s) => s.kind === 'event').map((s) => s.eventId);
  assert.deepEqual(eventStepsOf(direct), result.events.map((e) => e.id));
  assert.deepEqual(eventStepsOf(mcp), result.events.map((e) => e.id));
  // MCP 路径多出来的一定是 envelope（角色包装），而不是新的工具事件
  const envelopes = mcp.steps.filter((s) => s.kind === 'envelope');
  assert.ok(envelopes.length > 0, 'MCP 路径应当有角色包装步骤');
  assert.ok(envelopes.every((s) => result.events.some((e) => e.id === s.eventId)));
  const stats = protocolStepStats(mcp);
  assert.equal(stats.events, result.events.length);
  assert.equal(stats.total, stats.events + stats.envelope);
});

test('A24 协议中立：同一 run 下两条路径的结局、分支、数据引用与文档内容完全一致', () => {
  const result = run();
  for (const mode of ['direct', 'mcp']) {
    const compare = comparePaths(result, { mode });
    assert.equal(compare.same, true, `${mode} 路径出现事实差异：${compare.note}`);
    assert.equal(compare.checks.length, 6);
    assert.ok(compare.checks.every((c) => c.same));
  }
  // 同一份 run 的两条路径 facts 深度相等
  const a = buildProtocolTrace({ run: result, mode: 'direct' }).facts;
  const b = buildProtocolTrace({ run: result, mode: 'mcp' }).facts;
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('A21 工具约束：Search 缺失时两条路径都不产生成功结果', () => {
  const result = run({ condition: 'no_search' });
  const direct = buildProtocolTrace({ run: result, mode: 'direct' });
  const mcp = buildProtocolTrace({ run: result, mode: 'mcp' });
  assert.equal(direct.facts.dataRefs.length, 0);
  assert.equal(mcp.facts.dataRefs.length, 0);
  assert.equal(comparePaths(result, { mode: 'mcp' }).same, true);
  // Search 未装配时不会走到 Reader
  assert.ok(!result.events.some((e) => e.type === 'tool.call' && /document_reader/.test(JSON.stringify(e))));
});

test('A21 权限：Reader 未授权时不能显示读取成功（两条路径一致）', () => {
  const result = run({ condition: 'reader_unauthorized' });
  const mcp = buildProtocolTrace({ run: result, mode: 'mcp' });
  assert.equal(mcp.facts.readResults, 0, 'Reader 未授权时不能有成功的读取结果');
  assert.equal(mcp.facts.documentTexts.length, 0);
  assert.ok(mcp.facts.blockedEvents >= 1, '未授权应当留下阻断事件');
  assert.equal(comparePaths(result, { mode: 'mcp' }).same, true);
});

test('A22 失败场景：注入 search_timeout 时两条路径都给出异常事件且不伪造内容', () => {
  const result = run({}, { faultMode: 'search_timeout' });
  const direct = buildProtocolTrace({ run: result, mode: 'direct' });
  const mcp = buildProtocolTrace({ run: result, mode: 'mcp' });
  assert.equal(direct.facts.searchResults, 0, '超时不能产生成功的检索结果');
  assert.ok(direct.facts.blockedEvents >= 1, '超时应当产生失败事件');
  assert.equal(direct.facts.documentTexts.length, 0);
  assert.equal(mcp.facts.documentTexts.length, 0);
  assert.equal(comparePaths(result, { mode: 'mcp' }).same, true);
  // 结局不能被写成「成功读取」
  assert.notEqual(mcp.facts.outcome, 'sample_acquired');
});

test('正常路径：成功后 readResults 与 documentTexts 一致且非空', () => {
  const result = run();
  const direct = buildProtocolTrace({ run: result, mode: 'direct' });
  assert.ok(direct.facts.searchResults >= 1, '正常路径应当有检索结果');
  assert.ok(direct.facts.readResults >= 1, '正常路径应当有读取结果');
  assert.equal(direct.facts.documentTexts.length, direct.facts.readResults);
  assert.ok(direct.facts.documentTexts.every((text) => text.length > 10));
});

test('协议路径不改变 run 本身（引擎产物保持只读）', () => {
  const result = run();
  const before = JSON.stringify({
    events: result.events,
    payloads: result.artifacts.payloads,
    outcome: result.outcome,
    branchId: result.branchId,
  });
  buildProtocolTrace({ run: result, mode: 'mcp' });
  comparePaths(result, { mode: 'mcp' });
  buildProtocolTrace({ run: result, mode: 'direct' });
  const after = JSON.stringify({
    events: result.events,
    payloads: result.artifacts.payloads,
    outcome: result.outcome,
    branchId: result.branchId,
  });
  assert.equal(before, after);
});

test('isToolEvent：只有工具类事件会被归到执行路径', () => {
  assert.equal(isToolEvent({ type: 'tool.call' }), true);
  assert.equal(isToolEvent({ type: 'tool.result' }), true);
  assert.equal(isToolEvent({ type: 'plan.created' }), false);
  assert.equal(isToolEvent({ type: 'run.completed' }), false);
});
