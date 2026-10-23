/**
 * tests/report.test.mjs
 * ------------------------------------------------------------------
 * M0.4 结构化报告与导出（纯逻辑）：
 *   · A53 / A54 六部分报告与条件性方案比较
 *   · A55 更正报告同时引用旧/新公告
 *   · A57 / A58 引用可解析且文本范围就是本次拿到的片段
 *   · A62 指标来自真实运行
 *   · A63 Markdown 串行化：标题、模拟声明、引用、未决、转义
 *   · 引用编号稳定、报告只由证据装配（没有无出处断言）
 * ------------------------------------------------------------------
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { MODULES, defaultSettings } from '../src/features/constructor/model/modules.js';
import { runSimulation } from '../src/simulation/engine/runSimulation.js';
import { MISSION_001 } from '../src/research-packs/mission-001/index.js';
import { REPORT_STATUS, REPORT_SCHEMA_VERSION, formatDate } from '../src/simulation/reports/generateReport.js';
import { reportToMarkdown, markdownFilename, mdEscape } from '../src/features/reports/export/markdown.js';
import { reportMetrics, reportOf, isLegacyRun, legacyNotice, indexOfEvent, claimsForEvent, citationsForSource } from '../src/features/reports/state/reportState.js';

/* ------------------------------ 夹具 ------------------------------ */
function installed(moduleId, { enabled = true, read = true, settings = {} } = {}) {
  const mod = MODULES[moduleId];
  return { moduleId, portId: mod.portId, enabled, permissions: { read }, settings: { ...defaultSettings(moduleId), ...settings } };
}
const snapshot = (modules) => ({ schemaVersion: 1, modules });
const goldenConfig = (maxResults = 5) =>
  snapshot([
    installed('announcement_search', { settings: { searchScope: 'all_notices', maxResults } }),
    installed('document_reader', { settings: { readMode: 'full_text', includeMetadata: true } }),
  ]);

const runGolden = (maxResults = 5, options = {}) => runSimulation(goldenConfig(maxResults), MISSION_001, { evidencePolicy: 'VERIFY_REVISIONS', faultMode: 'normal', ...options });
const RUN = runGolden();
const report = RUN.artifacts.report;

/* ==================================================================== *
 * A53 六部分
 * ==================================================================== */
test('A53 报告含 R1–R6 六部分，且不出现「真实模型撰写」的暗示', () => {
  assert.equal(report.schemaVersion, REPORT_SCHEMA_VERSION);
  assert.deepEqual(report.sections.map((s) => s.id), ['R1', 'R2', 'R3', 'R4', 'R5', 'R6']);
  assert.deepEqual(report.sections.map((s) => s.title), ['研究任务与范围', '核心发现', '方案比较（概念性）', '证据引用', '局限与风险', '研究建议与待验证']);
  assert.equal(report.generatedFrom, 'local-template');
  assert.match(report.generatedNote, /未调用任何真实语言模型/);

  for (const section of report.sections) {
    if (['R4', 'R5', 'R6'].includes(section.id)) continue;
    assert.ok(section.claimIds.length > 0, `${section.id} 不应是空壳`);
    for (const id of section.claimIds) assert.ok(report.claims.some((c) => c.id === id), `${section.id} 引用了不存在的陈述 ${id}`);
  }
  assert.ok(report.limitations.length >= 3);
  assert.ok(report.limitations.some((l) => /虚构教学样本/.test(l)));
  assert.ok(report.limitations.some((l) => /没有\*\*调用真实语言模型|没有.*真实语言模型/.test(l) || /未调用真实语言模型/.test(l)));
  assert.ok(report.recommendations.length >= 2);
});

test('A53 陈述状态只由证据计算：supported 的事实必须有引用', () => {
  for (const claim of report.claims) {
    assert.ok(['supported', 'unresolved', 'insufficient'].includes(claim.status));
    if (claim.kind === 'finding' && claim.status === 'supported') {
      assert.ok(claim.citationIds.length > 0, `陈述 ${claim.id} 标记为已支持却没有引用`);
    }
    if (claim.status !== 'supported') {
      assert.ok(['unresolved', 'insufficient'].includes(claim.status));
    }
  }
  assert.ok(report.claims.some((c) => c.status === 'supported'));
  assert.ok(report.claims.some((c) => c.status === 'unresolved'), '跨渠道未决冲突必须出现在报告里');
});

test('A54 方案比较是条件性概念比较，不把 Agent 定为唯一正确方案', () => {
  assert.equal(report.comparison.length, 3);
  const ruleCard = report.comparison.find((c) => c.cardId === 'card-rule-automation');
  assert.ok(ruleCard.fitsWhen.length > 0 && ruleCard.limits.length > 0);
  const noteSection = report.sections.find((s) => s.id === 'R3');
  assert.match(noteSection.note, /不是本次模拟跑过三种系统后的性能对比/);
  assert.ok(report.recommendations.some((r) => /规则自动化/.test(r.text)));
  assert.ok(!report.recommendations.some((r) => /Agent 一定|只有 Agent|唯一正确/.test(r.text)));
  assert.ok(report.recommendations.some((r) => /条件性/.test(r.text)));
});

/* ==================================================================== *
 * A55 更正报告
 * ==================================================================== */
test('A55 有充分来源时同时保留 10/18 旧事实与 10/20 更正结论的引用', () => {
  const citesOf = (sourceId) => report.citations.filter((c) => c.sourceId === sourceId).map((c) => c.id);
  const oldCites = citesOf('NTC-1006');
  const newCites = citesOf('NTC-1007');
  assert.ok(oldCites.length > 0);
  assert.ok(newCites.length > 0);

  const oldFact = report.claims.find((c) => /2026 年 10 月 18 日/.test(c.text) && c.citationIds.some((id) => oldCites.includes(id)));
  const correction = report.claims.find((c) => /更正/.test(c.text) && /2026 年 10 月 20 日/.test(c.text) && c.citationIds.some((id) => newCites.includes(id)));
  const traceable = report.claims.find((c) => /已被更正/.test(c.text) && c.citationIds.length >= 2);
  assert.ok(oldFact, '旧事实缺失');
  assert.ok(correction, '更正结论缺失');
  assert.ok(traceable, '旧信息的可追溯状态缺失');
  assert.match(oldFact.text, /2026 年 10 月 18 日/);
  assert.ok(report.claims.every((c) => !/学校官方已经确认最新日期/.test(c.text)));
});

test('未找到新公告时只能说「本次资料中发现」，不能声称是最新有效日期', () => {
  const campusRun = runSimulation(
    snapshot([
      installed('announcement_search', { settings: { searchScope: 'campus_events', maxResults: 5 } }),
      installed('document_reader', { settings: { readMode: 'full_text', includeMetadata: true } }),
    ]),
    MISSION_001,
    {}
  );
  const campusReport = campusRun.artifacts.report;
  const openCampusClaims = campusReport.claims.filter((c) => /开放日/.test(c.text));
  assert.ok(openCampusClaims.length > 0);
  assert.ok(openCampusClaims.every((c) => !/10 月 20 日/.test(c.text)));
  assert.ok(openCampusClaims.some((c) => /这不等于该日期已被核验/.test(c.text)));
  assert.equal(campusReport.metrics.conflictsResolved, 0);
});

/* ==================================================================== *
 * A57 / A58 引用
 * ==================================================================== */
test('A57 每条引用都能解析到本次 Run 的 sourceId / chunkId / eventId', () => {
  const eventIds = new Set(RUN.events.map((e) => e.id));
  const sourceIds = new Set(MISSION_001.notices.map((n) => n.sourceId));
  const chunkIds = new Set(MISSION_001.notices.flatMap((n) => n.chunks.map((c) => c.chunkId)));
  assert.ok(report.citations.length > 0);
  for (const citation of report.citations) {
    assert.ok(eventIds.has(citation.eventId), `引用 ${citation.id} 的事件 ${citation.eventId} 不在本次运行中`);
    assert.ok(sourceIds.has(citation.sourceId));
    assert.ok(chunkIds.has(citation.chunkId));
    assert.match(citation.id, /^S\d+$/);
  }
  // 每条陈述引用的编号都存在
  for (const claim of report.claims) {
    for (const id of claim.citationIds) assert.ok(report.citations.some((c) => c.id === id), `陈述 ${claim.id} 引用了不存在的 ${id}`);
  }
  // R4 段列出全部引用
  const r4 = report.sections.find((s) => s.id === 'R4');
  assert.deepEqual([...r4.citationIds].sort(), report.citations.map((c) => c.id).sort());
});

test('A58 引用文本范围：就是本次读取响应里的片段，摘要模式不会变成全文', () => {
  const run = runGolden();
  const reads = Object.values(run.artifacts.payloads).filter((p) => p && p.kind === 'read.response');
  for (const citation of run.artifacts.report.citations) {
    const read = reads.find((p) => p.sourceId === citation.sourceId);
    assert.ok(read, `引用 ${citation.id} 没有对应的本次读取响应`);
    const chunk = read.chunks.find((c) => c.chunkId === citation.chunkId);
    assert.ok(chunk, `引用 ${citation.id} 的片段不在本次读取响应中`);
    const excerpt = citation.excerpt.replace(/…$/, '');
    assert.ok(chunk.text.startsWith(excerpt.slice(0, 40)), '引用文本必须来自本次拿到的片段');
    assert.equal(read.textScope, citation.textScope);
  }

  const summaryRun = runSimulation(
    snapshot([
      installed('announcement_search', { settings: { searchScope: 'all_notices', maxResults: 5 } }),
      installed('document_reader', { settings: { readMode: 'summary', includeMetadata: true } }),
    ]),
    MISSION_001,
    {}
  );
  const summaryReport = summaryRun.artifacts.report;
  assert.ok(summaryReport.citations.length > 0);
  assert.ok(summaryReport.citations.every((c) => c.textScope === 'summary'));
  assert.ok(summaryReport.citations.every((c) => c.chunkId.includes('#summary')));
});

test('引用编号稳定：同一输入必然同一编号，且按 sourceId + chunkId 排序', () => {
  const again = runGolden();
  assert.deepEqual(
    again.artifacts.report.citations.map((c) => `${c.id}:${c.sourceId}:${c.chunkId}`),
    report.citations.map((c) => `${c.id}:${c.sourceId}:${c.chunkId}`)
  );
  const keys = report.citations.map((c) => `${c.sourceId}::${c.chunkId}`);
  const sorted = [...keys].sort();
  assert.deepEqual(keys, sorted, '引用必须按 sourceId + chunkId 稳定排序');
  // 同一 source/chunk 只出现一次
  assert.equal(new Set(keys).size, keys.length);
});

/* ==================================================================== *
 * A62 指标
 * ==================================================================== */
test('A62 指标全部来自真实运行，分母为零时不输出百分比', () => {
  const run = runGolden();
  const r = run.artifacts.report;
  const reads = run.events.filter((e) => e.type === 'tool.result' && e.toolId === 'document_reader').length;
  assert.equal(r.metrics.sourcesRead, reads);
  assert.equal(r.metrics.fullTextReads, reads);
  assert.equal(r.metrics.summaryReads, 0);
  assert.equal(r.metrics.conflictsDetected, run.artifacts.evidence.conflicts.length);
  assert.equal(r.metrics.citations, undefined, '报告不复制引用字段以外的第二套计数');
  assert.equal(r.metrics.citationCount, r.citations.length);
  assert.ok(r.metrics.factClaimsSupported <= r.metrics.factClaimsNeeded);

  const merged = reportMetrics(run);
  assert.equal(merged.toolCalls, run.stats.toolCalls);
  assert.equal(merged.toolErrors, run.stats.toolErrors);
  assert.equal(merged.eventCount, run.events.length);

  const blocked = runSimulation(snapshot([]), MISSION_001, {});
  const blockedMetrics = reportMetrics(blocked);
  assert.equal(blocked.artifacts.report.metrics.evidenceCoverage, null, '没有可评估事实时必须是 null');
  assert.equal(blockedMetrics.toolCalls, 0);
  assert.equal(blockedMetrics.eventCount, blocked.events.length);
});

test('报告状态：仅有成立结论时为 complete，含未决时为 partial，阻断时为 blocked', () => {
  const narrow = runGolden(3);
  assert.equal(narrow.artifacts.report.metrics.conflictsUnresolved, 0);
  assert.equal(narrow.artifacts.report.status, REPORT_STATUS.COMPLETE);

  assert.equal(report.status, REPORT_STATUS.PARTIAL);

  const blocked = runSimulation(snapshot([]), MISSION_001, {});
  assert.equal(blocked.artifacts.report.status, REPORT_STATUS.BLOCKED);
  assert.ok(blocked.artifacts.report.claims.every((c) => c.citationIds.length === 0));
});

/* ==================================================================== *
 * A63 Markdown
 * ==================================================================== */
test('A63 Markdown：标题、模拟声明、元信息、六部分、引用表与未决事项', () => {
  const md = reportToMarkdown(report, { run: runGolden(), mission: MISSION_001, configSummary: { tools: 'announcement_search + document_reader', searchScope: 'all_notices', maxResults: 5, readMode: 'full_text', includeMetadata: true } });
  assert.match(md, /^# AGENT \/ ZERO · SIMULATED RESEARCH REPORT \/ 虚构教学研究报告/);
  assert.match(md, /SIMULATED · 本地教学模拟/);
  assert.match(md, /## R1 · 研究任务与范围/);
  assert.match(md, /## R6 · 研究建议与待验证/);
  assert.match(md, /## 可量化指标/);
  assert.match(md, /## 未解决问题/);
  assert.ok(md.includes(report.runId));
  assert.ok(md.includes('VERIFY_REVISIONS'));
  assert.ok(md.includes('announcement_search + document_reader'));
  for (const citation of report.citations) {
    assert.ok(md.includes(`[${citation.id}]`), `Markdown 缺少引用 ${citation.id}`);
    assert.ok(md.includes(citation.sourceId) && md.includes(citation.chunkId), `Markdown 缺少 ${citation.id} 的来源标识`);
  }
  assert.match(md, /没有服务端、账号系统、真实检索或真实语言模型参与/);
});

test('A63 文件名稳定且不含用户可控的路径字符', () => {
  const run = runGolden();
  const name = markdownFilename(run.artifacts.report);
  assert.match(name, /^AGENT-ZERO_MISSION-001_run-[0-9a-f]{8}\.md$/);
  assert.equal(markdownFilename({ ...run.artifacts.report, runId: '../../etc/passwd' }), 'AGENT-ZERO_MISSION-001_etcpasswd.md');
  assert.equal(markdownFilename(null), 'AGENT-ZERO_MISSION-001_run-unknown.md');
});

test('A63 Markdown 转义：数据文本不会变成可执行链接或伪造结构', () => {
  assert.equal(mdEscape('[点我](javascript:alert(1))'), '\\[点我\\](javascript:alert(1))');
  assert.equal(mdEscape('a|b'), 'a\\|b');
  assert.equal(mdEscape('<script>'), '&lt;script&gt;');
  assert.equal(mdEscape('**加粗**'), '\\*\\*加粗\\*\\*');

  const hostile = JSON.parse(JSON.stringify(report));
  hostile.claims[0].text = '[伪装链接](https://evil.example) <img src=x onerror=alert(1)>';
  hostile.citations[0] = { ...hostile.citations[0], excerpt: '| 注入 | 表格 | [x](y)' };
  const md = reportToMarkdown(hostile, { mission: MISSION_001 });
  assert.ok(!md.includes('[伪装链接](https://evil.example)'));
  assert.ok(md.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(md.includes('\\[伪装链接\\]'));
  assert.ok(md.includes('\\| 注入 \\| 表格 \\|'));
});

test('Markdown：空报告不产出任何内容', () => {
  assert.equal(reportToMarkdown(null), '');
  assert.equal(reportToMarkdown({}), '');
  assert.equal(reportToMarkdown({ claims: [] }), '');
});

/* ==================================================================== *
 * 报告状态工具
 * ==================================================================== */
test('报告状态工具：legacy 判定、事件反查与来源反查', () => {
  const run = runGolden();
  assert.ok(reportOf(run));
  assert.equal(isLegacyRun(run), false);
  assert.equal(isLegacyRun({ schemaVersion: 1 }), true);
  assert.equal(isLegacyRun(runSimulation(snapshot([]), 'mission-001-mini', {})), true);
  assert.match(legacyNotice({ schemaVersion: 1 }), /只有执行轨迹，尚无结构化报告/);
  assert.match(legacyNotice(runSimulation({ schemaVersion: 1, modules: [] }, MISSION_001, {})), /取得证据前结束/);

  const confirmEvent = run.events.find((e) => e.type === 'evidence.revision_confirmed');
  assert.equal(indexOfEvent(run, confirmEvent.id), confirmEvent.sequence);
  assert.equal(indexOfEvent(run, 'run-nope#e99'), -1);
  assert.equal(indexOfEvent(null, 'x'), -1);

  const related = claimsForEvent(run.artifacts.report, confirmEvent.id);
  assert.ok(related.length >= 1);
  assert.ok(related.every((c) => c.relatedEventIds.includes(confirmEvent.id)));
  assert.deepEqual(claimsForEvent(null, 'x'), []);

  const citation = run.artifacts.report.citations[0];
  const sameSource = citationsForSource(run.artifacts.report, citation.sourceId);
  assert.ok(sameSource.length >= 1);
  assert.deepEqual(citationsForSource(null, 'x'), []);
});

test('formatDate：ISO 日期转中文展示，非法输入原样返回', () => {
  assert.equal(formatDate('2026-10-18'), '2026 年 10 月 18 日');
  assert.equal(formatDate('2026-01-05'), '2026 年 1 月 5 日');
  assert.equal(formatDate('not-a-date'), 'not-a-date');
  assert.equal(formatDate(null), '—');
});



