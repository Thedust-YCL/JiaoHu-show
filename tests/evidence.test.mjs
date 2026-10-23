/**
 * tests/evidence.test.mjs
 * ------------------------------------------------------------------
 * M0.4 证据层与运行级证据链（纯逻辑）：
 *   · 可见性：只能从本次真实返回的文本 / 元数据抽 claim（A36 / A37 / A39）
 *   · 冲突与核验：VERIFY 成立、未决、证据不足、按策略跳过（A40–A43 / A47）
 *   · 更正成立的六条必要条件逐条失败场景（A42 / D06）
 *   · 工具不可用与故障分支的报告受限（A44–A46）
 *   · 确定性与策略进入 runId（A49 / A48）
 * ------------------------------------------------------------------
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { MODULES, defaultSettings } from '../src/features/constructor/model/modules.js';
import { runSimulation } from '../src/simulation/engine/runSimulation.js';
import { MISSION_001 } from '../src/research-packs/mission-001/index.js';
import { extractVisibleClaims, PREDICATES } from '../src/simulation/rules/evidence/claims.js';
import { groupConflicts } from '../src/simulation/rules/evidence/conflicts.js';
import { evaluateConflict, REVISION_STATUS, MISSING_CODES } from '../src/simulation/rules/evidence/revision.js';
import { evaluateEvidence } from '../src/simulation/rules/evidence/index.js';
import { EVENT_TYPES, SIMULATION_SCHEMA_VERSION } from '../src/simulation/events/schema.js';
import { canonicalize, isRunShapeValid } from '../src/simulation/events/serializer.js';
import { selectEvidenceBranch, evidenceBranchesFor } from '../src/simulation/rules/branches.js';

/* ==================================================================== *
 * 夹具
 * ==================================================================== */
function installed(moduleId, { enabled = true, read = true, settings = {} } = {}) {
  const mod = MODULES[moduleId];
  return { moduleId, portId: mod.portId, enabled, permissions: { read }, settings: { ...defaultSettings(moduleId), ...settings } };
}
const snapshot = (modules) => ({ schemaVersion: 1, modules });

const CONFIGS = Object.freeze({
  golden: () =>
    snapshot([
      installed('announcement_search', { settings: { searchScope: 'all_notices', maxResults: 5 } }),
      installed('document_reader', { settings: { readMode: 'full_text', includeMetadata: true } }),
    ]),
  summary: () =>
    snapshot([
      installed('announcement_search', { settings: { searchScope: 'all_notices', maxResults: 5 } }),
      installed('document_reader', { settings: { readMode: 'summary', includeMetadata: true } }),
    ]),
  noMetadata: () =>
    snapshot([
      installed('announcement_search', { settings: { searchScope: 'all_notices', maxResults: 5 } }),
      installed('document_reader', { settings: { readMode: 'full_text', includeMetadata: false } }),
    ]),
  campusOnly: () =>
    snapshot([
      installed('announcement_search', { settings: { searchScope: 'campus_events', maxResults: 5 } }),
      installed('document_reader', { settings: { readMode: 'full_text', includeMetadata: true } }),
    ]),
  noReader: () => snapshot([installed('announcement_search', { settings: { searchScope: 'all_notices', maxResults: 5 } })]),
  noSearch: () => snapshot([installed('document_reader', { settings: { readMode: 'full_text', includeMetadata: true } })]),
});

const runWith = (config, options = {}) => runSimulation(config, MISSION_001, { evidencePolicy: 'VERIFY_REVISIONS', faultMode: 'normal', ...options });
const resolutionsOf = (run) => run.artifacts.evidence.resolutions || [];
const findResolution = (run, subjectKeyword) => resolutionsOf(run).find((r) => r.subject.includes(subjectKeyword));

/* ==================================================================== *
 * A41 黄金路径：更正成立
 * ==================================================================== */
test('A41 VERIFY + 全文 + 元数据：更正关系成立，旧/新资料都留在可见证据里', () => {
  const run = runWith(CONFIGS.golden());
  assert.equal(run.schemaVersion, SIMULATION_SCHEMA_VERSION);
  assert.equal(isRunShapeValid(run), true);
  assert.equal(run.evidenceBranchId, 'E01_REVISION_CONFIRMED');
  assert.deepEqual([...run.evidenceBranchIds], ['E01_REVISION_CONFIRMED', 'E02_CONFLICT_UNRESOLVED']);

  const resolution = findResolution(run, 'evt-open-campus');
  assert.equal(resolution.status, REVISION_STATUS.CONFIRMED);
  assert.equal(resolution.oldSourceId, 'NTC-1006');
  assert.equal(resolution.newSourceId, 'NTC-1007');
  assert.equal(resolution.oldValue, '2026-10-18');
  assert.equal(resolution.newValue, '2026-10-20');
  assert.deepEqual(resolution.missing, []);
  assert.ok(resolution.requirements.every((r) => r.pass), '成立时必须六条必要条件全部通过');
  assert.ok(resolution.usedClaimIds.length >= 4);

  const evidence = run.artifacts.evidence;
  assert.ok(evidence.sourceIds.includes('NTC-1006'), '被更正的旧资料必须仍可追踪');
  assert.ok(evidence.sourceIds.includes('NTC-1007'));
  assert.equal(evidence.verified, true);

  const confirmedEvents = run.events.filter((e) => e.type === EVENT_TYPES.EVIDENCE_REVISION_CONFIRMED);
  assert.equal(confirmedEvents.length, 1);
  assert.equal(confirmedEvents[0].ruleId, 'rule.evidence.revision.confirmed');
  assert.deepEqual([...confirmedEvents[0].claimIds].sort(), [...resolution.usedClaimIds].sort());
  assert.equal(evidenceBranchFrom(resolution), 'E01_REVISION_CONFIRMED');
});

function evidenceBranchFrom(resolution) {
  return selectEvidenceBranch([resolution]).branchId;
}

test('A40 冲突被识别为独立事件，且两条证据路径都指向真实可见资料', () => {
  const run = runWith(CONFIGS.golden());
  const conflicts = run.events.filter((e) => e.type === EVENT_TYPES.EVIDENCE_CONFLICT);
  assert.equal(conflicts.length, 2);
  for (const event of conflicts) {
    assert.equal(event.branchId, run.evidenceBranchId);
    assert.equal(event.sourceIds.length, 2);
    assert.ok(event.claimIds.length >= 2);
    assert.ok(event.sourceIds.every((id) => run.artifacts.evidence.sourceIds.includes(id)));
  }
  const career = conflicts.find((e) => e.sourceIds.includes('NTC-1008'));
  assert.deepEqual([...career.sourceIds].sort(), ['NTC-1008', 'NTC-1009']);
});

test('A39 声明全部来自本次可见证据：每条都有 sourceId / chunkId / 真实事件', () => {
  const run = runWith(CONFIGS.golden());
  const events = new Map(run.events.map((e) => [e.id, e]));
  const claims = run.artifacts.evidence.claims;
  assert.ok(claims.length > 0);
  for (const claim of claims) {
    assert.ok(claim.sourceId && claim.chunkId && claim.eventId);
    const event = events.get(claim.eventId);
    assert.ok(event, `claim ${claim.claimId} 的 eventId 不在本次事件里`);
    assert.ok(event.sourceIds.includes(claim.sourceId));
  }
  // 声明不重复：同一资料同一谓词只有一条
  const keys = claims.map((c) => `${c.sourceId}~${c.predicate}`);
  assert.equal(new Set(keys).size, keys.length);
});

/* ==================================================================== *
 * A36 / A37 可见性边界
 * ==================================================================== */
test('A36 只读摘要：拿不到正文级声明，更正只能停在「证据不足」', () => {
  const run = runWith(CONFIGS.summary());
  const claims = run.artifacts.evidence.claims;
  assert.ok(claims.every((c) => c.chunkId.includes('#summary') || c.fromMetadata));
  assert.equal(claims.filter((c) => c.predicate === PREDICATES.REVISION_NOTICE).length, 0, '正文更正说明不可能从摘要抽到');

  const resolution = findResolution(run, 'evt-open-campus');
  assert.equal(resolution.status, REVISION_STATUS.INSUFFICIENT);
  assert.ok(resolution.missing.some((m) => m.code === MISSING_CODES.BODY));
  assert.equal(run.evidenceBranchId, 'E02_CONFLICT_UNRESOLVED', '未决的跨渠道冲突优先级高于证据不足');
  assert.ok(evidenceBranchesFor(resolutionsOf(run)).includes('E04_INSUFFICIENT_DETAIL'));

  const insufficientEvents = run.events.filter((e) => e.type === EVENT_TYPES.EVIDENCE_INSUFFICIENT);
  assert.equal(insufficientEvents.length, 1);
  assert.ok(run.artifacts.evidence.limitations.some((l) => /摘要/.test(l)));
});

test('A37 关闭元数据：发布主体 / 时间 / 更正关系都不可见，核验降级为缺元数据', () => {
  const run = runWith(CONFIGS.noMetadata());
  const claims = run.artifacts.evidence.claims;
  assert.ok(claims.length > 0);
  assert.equal(claims.filter((c) => c.fromMetadata).length, 0);
  for (const predicate of [PREDICATES.PUBLISHED_AT, PREDICATES.PUBLISHER_ID, PREDICATES.SUPERSEDES, PREDICATES.EVENT_KEY]) {
    assert.equal(claims.filter((c) => c.predicate === predicate).length, 0, `${predicate} 不应出现`);
  }
  for (const resolution of resolutionsOf(run)) {
    assert.equal(resolution.status, REVISION_STATUS.METADATA_MISSING);
    assert.ok(resolution.missing.some((m) => m.code === MISSING_CODES.PUBLISHED_AT));
  }
  assert.equal(run.events.filter((e) => e.type === EVENT_TYPES.EVIDENCE_METADATA_MISSING).length, 2);
  // 用户可见的工具响应里也不能夹带被关闭的字段
  const reads = Object.values(run.artifacts.payloads).filter((p) => p && p.kind === 'read.response');
  assert.ok(reads.every((p) => p.metadata === null));
});

/* ==================================================================== *
 * A43 / A47 / A42
 * ==================================================================== */
test('A43 COLLECT_ONLY：只收集不核验，报告保留未决状态', () => {
  const run = runWith(CONFIGS.golden(), { evidencePolicy: 'COLLECT_ONLY' });
  assert.equal(run.options.evidencePolicy, 'COLLECT_ONLY');
  assert.equal(run.events.filter((e) => e.type === EVENT_TYPES.EVIDENCE_VERIFICATION_SKIPPED).length, 2);
  assert.equal(run.events.filter((e) => e.type === EVENT_TYPES.EVIDENCE_REVISION_CONFIRMED).length, 0);
  for (const resolution of resolutionsOf(run)) {
    assert.equal(resolution.status, REVISION_STATUS.SKIPPED);
    assert.deepEqual(resolution.missing.map((m) => m.code), [MISSING_CODES.POLICY]);
  }
  assert.equal(run.evidenceBranchId, 'E03_VERIFICATION_SKIPPED');
  const report = run.artifacts.report;
  assert.equal(report.status, 'partial');
  assert.ok(report.claims.some((c) => c.status === 'unresolved' && /尚未进行更正关系核验/.test(c.text)));
  assert.equal(report.metrics.conflictsResolved, 0);
});

test('A47 范围只含旧公告：不利用隐藏的更正公告宣布成立', () => {
  const run = runWith(CONFIGS.campusOnly());
  const evidence = run.artifacts.evidence;
  assert.ok(!evidence.sourceIds.includes('NTC-1007'), '本次根本没有检索到更正公告');
  const openCampusClaims = evidence.claims.filter((c) => c.subject === 'evt-open-campus' && c.predicate === PREDICATES.EVENT_DATE);
  assert.deepEqual(openCampusClaims.map((c) => c.value), ['2026-10-18']);
  assert.equal(evidence.resolutions.filter((r) => r.subject.includes('evt-open-campus')).length, 0);
  assert.equal(run.events.filter((e) => e.type === EVENT_TYPES.EVIDENCE_REVISION_CONFIRMED).length, 0);
  const report = run.artifacts.report;
  assert.ok(report.claims.some((c) => /10 月 18 日/.test(c.text) && /这不等于该日期已被核验/.test(c.text)));
  // 10 月 20 日 在本次结果里只可能属于另一件事（创客分享会），不能出现在开放日的陈述里
  assert.ok(!report.claims.some((c) => /开放日/.test(c.text) && /10 月 20 日/.test(c.text)));
});

test('A42 缺少可核实更正关系时保留未决并给出具体缺失原因', () => {
  const run = runWith(CONFIGS.golden());
  const resolution = findResolution(run, 'evt-career-fair');
  assert.equal(resolution.status, REVISION_STATUS.UNRESOLVED);
  assert.deepEqual(resolution.missing.map((m) => m.code), [MISSING_CODES.SUPERSEDES]);
  assert.match(resolution.decision, /不裁决/);
  const event = run.events.find((e) => e.type === EVENT_TYPES.EVIDENCE_CONFLICT_UNRESOLVED);
  assert.equal(event.ruleId, 'rule.evidence.revision.noSupersession');
  assert.ok(event.message.includes(MISSING_CODES.SUPERSEDES));
});

/* ==================================================================== *
 * A44 / A45 / A46 工具与故障
 * ==================================================================== */
test('A44 Search 不可用：没有任何证据声明，报告为阻断且没有假引用', () => {
  const run = runWith(CONFIGS.noSearch());
  assert.equal(run.branchId, 'B02_NO_SEARCH');
  assert.equal(run.outcome, 'blocked');
  assert.equal(run.artifacts.evidence.claims, undefined);
  const report = run.artifacts.report;
  assert.equal(report.status, 'blocked');
  assert.equal(report.citations.length, 0);
  assert.ok(report.claims.every((c) => c.citationIds.length === 0));
  assert.ok(report.limitations.some((l) => /取得证据前结束/.test(l)));
  assert.ok(report.claims.some((c) => c.status === 'insufficient' && /没有取得可用资料/.test(c.text)));
});

test('A45 Reader 不可用：只有检索摘要级线索，绝不出现正文或核验成立', () => {
  const run = runWith(CONFIGS.noReader());
  assert.equal(run.branchId, 'B03_NO_READER');
  const claims = run.artifacts.evidence.claims;
  assert.ok(claims.length > 0, '检索摘要仍然是可见线索');
  assert.ok(claims.every((c) => c.textScope === 'search_excerpt'));
  assert.equal(run.events.filter((e) => e.type === EVENT_TYPES.EVIDENCE_REVISION_CONFIRMED).length, 0);
  const report = run.artifacts.report;
  assert.ok(report.citations.length > 0);
  assert.ok(report.citations.every((c) => c.textScope === 'search_excerpt'));
  assert.ok(report.claims.every((c) => c.kind !== 'finding' || c.basisRuleId !== 'rule.evidence.revision.confirmed'));
  assert.ok(report.claims.some((c) => c.kind === 'finding' && c.status !== 'supported'));
  assert.ok(report.claims.filter((c) => c.kind === 'finding' && c.status === 'supported').every((c) => /这不等于该日期已被核验/.test(c.text)));
});

test('A46 search_timeout：确定性错误、无假成功、报告只说明受限', () => {
  const run = runWith(CONFIGS.golden(), { faultMode: 'search_timeout' });
  assert.equal(run.branchId, 'B04_SEARCH_TIMEOUT');
  assert.equal(run.outcome, 'error');
  assert.equal(run.events.filter((e) => e.type === EVENT_TYPES.TOOL_RESULT).length, 0);
  const report = run.artifacts.report;
  assert.equal(report.status, 'blocked');
  assert.equal(report.citations.length, 0);
  assert.match(run.artifacts.payloads['p:search-error'].code, /SEARCH_TIMEOUT/);
});

/* ==================================================================== *
 * 单独抽取的可见性（不经过引擎）
 * ==================================================================== */
test('extractVisibleClaims：正文级声明只能来自真正返回的正文片段', () => {
  const corpus = new Map(MISSION_001.notices.map((n) => [n.sourceId, n]));
  const summaryOnly = extractVisibleClaims({
    corpus,
    reads: [
      {
        sourceId: 'NTC-1007',
        eventId: 'e7',
        textScope: 'summary',
        chunks: [{ chunkId: 'NTC-1007#summary', kind: 'summary', text: MISSION_001.getNotice('NTC-1007').summary }],
        metadata: null,
      },
    ],
  });
  assert.deepEqual(summaryOnly.map((c) => c.predicate), [PREDICATES.EVENT_DATE]);
  assert.equal(summaryOnly[0].value, '2026-10-20');
  assert.equal(summaryOnly[0].textScope, 'summary');

  const withBody = extractVisibleClaims({
    corpus,
    reads: [
      {
        sourceId: 'NTC-1007',
        eventId: 'e8',
        textScope: 'full_text',
        chunks: MISSION_001.getNotice('NTC-1007').chunks.filter((c) => c.kind === 'body').map((c) => ({ ...c })),
        metadata: null,
      },
    ],
  });
  const predicates = withBody.map((c) => c.predicate).sort();
  assert.deepEqual(predicates, [PREDICATES.EVENT_DATE, PREDICATES.REVISION_NOTICE, PREDICATES.REVISION_TARGET].sort());
  assert.ok(withBody.every((c) => c.textScope === 'full_text'));
  assert.equal(withBody.find((c) => c.predicate === PREDICATES.EVENT_DATE).chunkId, 'NTC-1007#body-1');
});

test('extractVisibleClaims：未知资料 / 空片段不会产生任何声明', () => {
  const corpus = new Map(MISSION_001.notices.map((n) => [n.sourceId, n]));
  assert.deepEqual(extractVisibleClaims({ corpus, reads: [{ sourceId: 'NTC-9999', eventId: 'e', chunks: [{ chunkId: 'x', kind: 'summary', text: '10 月 18 日' }] }] }), []);
  assert.deepEqual(extractVisibleClaims({ corpus, reads: [{ sourceId: 'NTC-1006', eventId: 'e', chunks: [] }] }), []);
  assert.deepEqual(extractVisibleClaims(), []);
});

test('冲突分组：没有事项身份的声明不会与别人「强行算同一活动」', () => {
  const claims = [
    { claimId: 'a', predicate: PREDICATES.EVENT_DATE, subject: null, value: '2026-10-01', sourceId: 'S1', chunkId: 'c1', eventId: 'e1' },
    { claimId: 'b', predicate: PREDICATES.EVENT_DATE, subject: null, value: '2026-10-02', sourceId: 'S2', chunkId: 'c2', eventId: 'e2' },
    { claimId: 'c', predicate: PREDICATES.KEY_FACT, subject: 'evt-x', value: 'v1', sourceId: 'S3', chunkId: 'c3', eventId: 'e3' },
    { claimId: 'd', predicate: PREDICATES.KEY_FACT, subject: 'evt-x', value: 'v2', sourceId: 'S4', chunkId: 'c4', eventId: 'e4' },
  ];
  assert.deepEqual(groupConflicts(claims), [], '没有 eventKey 或非冲突字段都不应产生冲突组');
});

/* ==================================================================== *
 * D06 六条必要条件逐条失败
 * ==================================================================== */
function syntheticConflict() {
  return {
    conflictId: 'cf:evt-x:event_date',
    subject: 'evt-x',
    predicate: PREDICATES.EVENT_DATE,
    predicateLabel: '活动日期',
    values: [
      { value: '2026-10-18', claimIds: ['A~event_date'], sourceIds: ['SRC-A'], publishedAt: '2026-10-12', publishedAtKnown: true },
      { value: '2026-10-20', claimIds: ['B~event_date'], sourceIds: ['SRC-B'], publishedAt: '2026-10-13', publishedAtKnown: true },
    ],
    claimIds: ['A~event_date', 'B~event_date'],
    sourceIds: ['SRC-A', 'SRC-B'],
  };
}
const claim = (sourceId, predicate, value, extra = {}) => ({
  claimId: `${sourceId}~${predicate}`,
  predicate,
  value,
  subject: 'evt-x',
  sourceId,
  chunkId: `${sourceId}#body-1`,
  eventId: `ev-${sourceId}`,
  publishedAt: sourceId === 'SRC-B' ? '2026-10-13' : '2026-10-12',
  publisherId: 'pub-x',
  ...extra,
});
const baseClaims = () => [
  claim('SRC-A', PREDICATES.EVENT_DATE, '2026-10-18'),
  claim('SRC-A', PREDICATES.PUBLISHER_ID, 'pub-x'),
  claim('SRC-B', PREDICATES.EVENT_DATE, '2026-10-20'),
  claim('SRC-B', PREDICATES.PUBLISHER_ID, 'pub-x'),
];
const ctx = (claims, extra = {}) => ({
  policy: 'VERIFY_REVISIONS',
  claims,
  validityBySource: new Map(extra.validity || [['SRC-A', 'active'], ['SRC-B', 'active']]),
  titleBySource: new Map([['SRC-A', '原始公告'], ['SRC-B', '更正公告']]),
  visibleSourceIds: new Set(extra.visible || ['SRC-A', 'SRC-B']),
});

test('D06 必要条件逐条失败：策略 / 更正关系 / 正文 / 指向 / 发布主体 / 可见性 / 资料状态', () => {
  // 1. 策略：只收集证据时不裁决
  assert.equal(evaluateConflict(syntheticConflict(), { ...ctx(baseClaims()), policy: 'COLLECT_ONLY' }).status, REVISION_STATUS.SKIPPED);
  const skipped = evaluateConflict(syntheticConflict(), { ...ctx(baseClaims()), policy: 'COLLECT_ONLY' });
  assert.deepEqual(skipped.missing.map((m) => m.code), [MISSING_CODES.POLICY]);

  // 2. 缺发布时间
  const noTime = baseClaims().map((c) => ({ ...c, publishedAt: null }));
  const noTimeConflict = syntheticConflict();
  noTimeConflict.values.forEach((v) => (v.publishedAtKnown = false));
  assert.equal(evaluateConflict(noTimeConflict, ctx(noTime)).status, REVISION_STATUS.METADATA_MISSING);

  // 3. 没有 supersedes
  const noRelation = evaluateConflict(syntheticConflict(), ctx(baseClaims()));
  assert.equal(noRelation.status, REVISION_STATUS.UNRESOLVED);
  assert.deepEqual(noRelation.missing.map((m) => m.code), [MISSING_CODES.SUPERSEDES]);

  // 4. supersedes 指错资料
  const wrongTarget = ctx([...baseClaims(), claim('SRC-B', PREDICATES.SUPERSEDES, 'SRC-C')]);
  const wrongTargetRes = evaluateConflict(syntheticConflict(), wrongTarget);
  assert.equal(wrongTargetRes.status, REVISION_STATUS.UNRESOLVED);
  assert.deepEqual(wrongTargetRes.missing.map((m) => m.code), [MISSING_CODES.SUPERSEDES_TARGET]);

  // 5. 只有元数据更正关系、正文没读
  const metaOnly = ctx([...baseClaims(), claim('SRC-B', PREDICATES.SUPERSEDES, 'SRC-A')]);
  const bodyNotRead = evaluateConflict(syntheticConflict(), metaOnly);
  assert.equal(bodyNotRead.status, REVISION_STATUS.INSUFFICIENT);
  assert.deepEqual(bodyNotRead.missing.map((m) => m.code), [MISSING_CODES.BODY]);

  // 6. 正文没有指向原公告
  const wrongBodyTarget = ctx([
    ...baseClaims(),
    claim('SRC-B', PREDICATES.SUPERSEDES, 'SRC-A'),
    claim('SRC-B', PREDICATES.REVISION_NOTICE, 'explicit'),
    claim('SRC-B', PREDICATES.REVISION_TARGET, 'SRC-C'),
  ]);
  const targetMismatch = evaluateConflict(syntheticConflict(), wrongBodyTarget);
  assert.equal(targetMismatch.status, REVISION_STATUS.UNRESOLVED);
  assert.deepEqual(targetMismatch.missing.map((m) => m.code), [MISSING_CODES.TARGET]);

  // 7. 发布主体不同（没有更正权）
  const otherPublisher = ctx([
    ...baseClaims().map((c) => (c.sourceId === 'SRC-B' && c.predicate === PREDICATES.PUBLISHER_ID ? { ...c, value: 'pub-y' } : c)),
    claim('SRC-B', PREDICATES.SUPERSEDES, 'SRC-A'),
    claim('SRC-B', PREDICATES.REVISION_NOTICE, 'explicit'),
    claim('SRC-B', PREDICATES.REVISION_TARGET, 'SRC-A'),
  ]);
  const authority = evaluateConflict(syntheticConflict(), otherPublisher);
  assert.equal(authority.status, REVISION_STATUS.UNRESOLVED);
  assert.deepEqual(authority.missing.map((m) => m.code), [MISSING_CODES.AUTHORITY]);

  // 8. 资料被撤回
  const retracted = evaluateConflict(
    syntheticConflict(),
    ctx([...baseClaims(), claim('SRC-B', PREDICATES.SUPERSEDES, 'SRC-A')], { validity: [['SRC-A', 'active'], ['SRC-B', 'retracted']] })
  );
  assert.equal(retracted.status, REVISION_STATUS.UNRESOLVED);
  assert.deepEqual(retracted.missing.map((m) => m.code), [MISSING_CODES.INVALID]);

  // 9. 另一方不在本次可见证据中
  const invisible = evaluateConflict(syntheticConflict(), ctx(baseClaims(), { visible: ['SRC-B'] }));
  assert.equal(invisible.status, REVISION_STATUS.UNRESOLVED);
  assert.deepEqual(invisible.missing.map((m) => m.code), [MISSING_CODES.VISIBILITY]);
});

test('D06 六条必要条件全部满足才给出 revision_confirmed', () => {
  const full = ctx([
    ...baseClaims(),
    claim('SRC-B', PREDICATES.SUPERSEDES, 'SRC-A'),
    claim('SRC-B', PREDICATES.REVISION_NOTICE, 'explicit'),
    claim('SRC-B', PREDICATES.REVISION_TARGET, 'SRC-A'),
  ]);
  const result = evaluateConflict(syntheticConflict(), full);
  assert.equal(result.status, REVISION_STATUS.CONFIRMED);
  assert.equal(result.ruleId, 'rule.evidence.revision.confirmed');
  assert.deepEqual(result.missing, []);
  assert.ok(result.requirements.length >= 6);
  assert.ok(result.requirements.every((r) => r.pass));
  assert.match(result.decision, /10 月 18 日|2026-10-18/);
});

/* ==================================================================== *
 * A49 / A48 确定性与策略隔离
 * ==================================================================== */
test('A49 同一配置 + 策略 + 失败条件 → 完全相同的 runId、事件与报告', () => {
  const a = runWith(CONFIGS.golden());
  const b = runWith(CONFIGS.golden());
  assert.equal(a.runId, b.runId);
  assert.deepEqual(a.events, b.events);
  assert.equal(canonicalize(a), canonicalize(b));
  assert.equal(canonicalize(a.artifacts.report), canonicalize(b.artifacts.report));
});

test('A48 研究策略进入 runId，但不是第三个可装配工具', () => {
  const verify = runWith(CONFIGS.golden(), { evidencePolicy: 'VERIFY_REVISIONS' });
  const collect = runWith(CONFIGS.golden(), { evidencePolicy: 'COLLECT_ONLY' });
  assert.notEqual(verify.runId, collect.runId, '策略不同必须得到不同 runId');
  assert.equal(verify.configSnapshot.modules.length, 2);
  assert.deepEqual(verify.configSnapshot.modules.map((m) => m.moduleId), ['announcement_search', 'document_reader']);
  assert.deepEqual(Object.keys(verify.options).sort(), ['evidencePolicy', 'faultMode']);
  // 未知策略按默认值处理并如实说明，不崩溃
  const unknown = runWith(CONFIGS.golden(), { evidencePolicy: 'MAGIC' });
  assert.equal(unknown.options.evidencePolicy, 'VERIFY_REVISIONS');
  assert.ok(unknown.notes.some((n) => /未知研究策略/.test(n)));
});

test('旧任务包（mini）不进入证据阶段，事件数量与 M0.3 一致', () => {
  const run = runSimulation(CONFIGS.golden(), 'mission-001-mini', {});
  assert.deepEqual(
    run.events.map((e) => e.type),
    ['run.started', 'config.validated', 'task.plan_created', 'tool.call', 'tool.result', 'tool.call', 'tool.result', 'evidence.sample_collected', 'run.completed']
  );
  assert.equal(run.artifacts.report.status, 'not_generated');
  assert.equal(run.evidenceBranchId, null);
});

test('evaluateEvidence 对空输入安全退化', () => {
  const empty = evaluateEvidence({ reads: [], search: null, policy: 'VERIFY_REVISIONS', mission: MISSION_001 });
  assert.deepEqual(empty.claims, []);
  assert.deepEqual(empty.conflicts, []);
  assert.deepEqual(empty.resolutions, []);
  assert.equal(empty.counts.sourcesRead, 0);
  assert.equal(selectEvidenceBranch([]).branchId, 'E00_NO_CONFLICT');
  assert.deepEqual(evidenceBranchesFor([]), ['E00_NO_CONFLICT']);
});


