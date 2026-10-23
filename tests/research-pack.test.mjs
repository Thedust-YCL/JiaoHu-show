/**
 * tests/research-pack.test.mjs
 * ------------------------------------------------------------------
 * M0.4 研究包与数据完整性（纯逻辑，不需要浏览器）：
 *   · A31 版本、稳定 ID、虚构标识、claim anchor 有效性
 *   · A32 更正对、A33 不可消解冲突
 *   · A34 保留 M0.3 的 sourceId / chunkId 与原文
 *   · A38 重复 ID / 非法日期 / 悬空 supersedes / 循环 / 跨事项 / 时间倒置
 *   · prepareCorpus 的剔除规则：坏资料不崩溃、也不被采信
 * ------------------------------------------------------------------
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { MISSION_001, CORPUS_VERSION, MAX_READS_PER_RUN } from '../src/research-packs/mission-001/index.js';
import { NOTICES, PUBLISHERS, SEARCH_SCOPES, noticesForScope, sortNotices } from '../src/research-packs/mission-001/notices.js';
import { validateMissionPack, prepareCorpus, findSupersedesCycles, isIsoDate } from '../src/research-packs/mission-001/validate.js';
import { COMPARISON_CARDS, COMPARISON_NOTE } from '../src/research-packs/mission-001/comparison.js';
import { MISSION_001_MINI } from '../src/research-packs/mission-001-mini/index.js';
import { loadMission, missionSupportsResearch, MISSION_IDS } from '../src/research-packs/index.js';

const byId = (id) => NOTICES.find((n) => n.sourceId === id);

/* ==================================================================== *
 * A31 数据包版本与稳定 ID
 * ==================================================================== */
test('A31 MISSION 001 研究包自洽：ID 唯一、片段唯一、虚构标识完整、校验零问题', () => {
  const result = validateMissionPack(NOTICES);
  assert.deepEqual(result.problems, []);
  assert.equal(result.ok, true);

  assert.equal(MISSION_001.missionId, 'mission-001');
  assert.equal(MISSION_001.missionVersion, 2);
  assert.equal(MISSION_001.corpusVersion, CORPUS_VERSION);
  assert.equal(CORPUS_VERSION, 'mission-001@2');

  const ids = NOTICES.map((n) => n.sourceId);
  assert.equal(new Set(ids).size, ids.length);
  const chunkIds = NOTICES.flatMap((n) => n.chunks.map((c) => c.chunkId));
  assert.equal(new Set(chunkIds).size, chunkIds.length);

  assert.ok(NOTICES.every((n) => n.isFictional === true));
  assert.ok(NOTICES.every((n) => n.claims.length >= 1));
  assert.ok(NOTICES.every((n) => n.chunks.length >= 2));
  assert.ok(NOTICES.every((n) => PUBLISHERS[n.publisherId]));
  assert.ok(NOTICES.length >= 6 && NOTICES.length <= 12, `研究包规模应为垂直样本，实际 ${NOTICES.length}`);
});

test('A31 每条 claim 的 anchor 都真实出现在它允许的片段中（否则永远抽不到）', () => {
  for (const notice of NOTICES) {
    for (const spec of notice.claims) {
      const allowed = notice.chunks.filter((c) => (spec.scope === 'body' ? c.kind === 'body' : true));
      assert.ok(
        allowed.some((c) => c.text.includes(spec.anchor)),
        `${notice.sourceId} 的 ${spec.predicate} anchor「${spec.anchor}」不存在于允许的片段中`
      );
    }
  }
});

test('研究包只做垂直样本：读取上限被封顶，方案卡为教学说明', () => {
  assert.ok(Number.isInteger(MAX_READS_PER_RUN) && MAX_READS_PER_RUN >= 5 && MAX_READS_PER_RUN <= 12);
  assert.equal(COMPARISON_CARDS.length, 3);
  assert.deepEqual(COMPARISON_CARDS.map((c) => c.cardId), ['card-rule-automation', 'card-fixed-workflow', 'card-agent-loop']);
  assert.ok(COMPARISON_CARDS.every((c) => c.fitsWhen.length > 0 && c.limits.length > 0));
  assert.match(COMPARISON_NOTE, /不是本次模拟跑过三种系统后的性能对比/);
});

/* ==================================================================== *
 * A32 更正对 / A33 未决冲突
 * ==================================================================== */
test('A32 notice-001/002 等价物：同一事项、10/18 → 10/20、更正关系可检查', () => {
  const older = byId('NTC-1006');
  const newer = byId('NTC-1007');
  assert.ok(older && newer);
  assert.equal(older.eventKey, 'evt-open-campus');
  assert.equal(newer.eventKey, older.eventKey);
  assert.equal(older.eventDate, '2026-10-18');
  assert.equal(newer.eventDate, '2026-10-20');
  assert.deepEqual([...newer.supersedes], ['NTC-1006']);
  assert.ok(newer.publishedAt > older.publishedAt);
  assert.equal(newer.publisherId, older.publisherId);
  // 正文必须明确说明更正并指向原公告；摘要则刻意只给一条有限线索
  assert.match(newer.chunks.find((c) => c.kind === 'body').text, /予以更正/);
  assert.match(newer.summary, /10 月 20 日/);
  assert.doesNotMatch(newer.summary, /予以更正|《秋季校园开放日安排通知》/);
});

test('A33 存在一组缺乏可信更正链的矛盾（不得自动裁决）', () => {
  const a = byId('NTC-1008');
  const b = byId('NTC-1009');
  assert.equal(a.eventKey, b.eventKey);
  assert.notEqual(a.eventDate, b.eventDate);
  assert.equal((a.supersedes || []).length, 0);
  assert.equal((b.supersedes || []).length, 0);
  assert.notEqual(a.publisherId, b.publisherId);
});

test('范围标签按发布栏目过滤：更正公告不在 campus_events 栏目内（A47 的数据前提）', () => {
  const campus = noticesForScope('campus_events');
  const all = noticesForScope('all_notices');
  assert.ok(all.length > campus.length);
  assert.ok(all.some((n) => n.sourceId === 'NTC-1007'));
  assert.ok(!campus.some((n) => n.sourceId === 'NTC-1007'));
  assert.ok(campus.every((n) => n.scope === 'campus_events'));
  assert.equal(SEARCH_SCOPES.all_notices.matches(byId('NTC-1007')), true);
});

test('排序稳定：发布日期新的在前，同日期按 sourceId 升序', () => {
  const sorted = sortNotices(NOTICES);
  assert.equal(sorted[0].sourceId, 'NTC-1007');
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const ok = prev.publishedAt > cur.publishedAt || (prev.publishedAt === cur.publishedAt && prev.sourceId < cur.sourceId);
    assert.ok(ok, `排序不符合规则：${prev.sourceId} 在 ${cur.sourceId} 之前`);
  }
});

/* ==================================================================== *
 * A34 保留 M0.3 的稳定 ID 与原文
 * ==================================================================== */
test('A34 保留 M0.3 的 sourceId / chunkId 与原文，一个都不改名', () => {
  for (const mini of MISSION_001_MINI.notices) {
    const extended = byId(mini.sourceId);
    assert.ok(extended, `M0.3 资料 ${mini.sourceId} 在新研究包中丢失`);
    assert.equal(extended.summary, mini.summary);
    assert.deepEqual([...extended.body], [...mini.body]);
    const chunkSet = new Set(extended.chunks.map((c) => c.chunkId));
    for (const chunkId of mini.chunkIds) assert.ok(chunkSet.has(chunkId), `M0.3 片段 ${chunkId} 丢失`);
  }
  // 旧资料包本身仍然可用（Tool Calling 知识页与 M0.3 回归依赖它）
  assert.equal(MISSION_001_MINI.missionId, 'mission-001-mini');
  assert.equal(MISSION_001_MINI.reportsAvailable, false);
  assert.equal(MISSION_001_MINI.notices.length, 5);
});

test('研究能力声明：只有 mission-001 具备证据与报告能力', () => {
  assert.equal(missionSupportsResearch(MISSION_001), true);
  assert.equal(missionSupportsResearch(MISSION_001_MINI), false);
  assert.equal(missionSupportsResearch(null), false);
  assert.deepEqual([...MISSION_IDS], ['mission-001', 'mission-001-mini']);
  assert.equal(loadMission('mission-001').missionVersion, 2);
  assert.equal(loadMission('mission-001', 1), null, '版本不匹配必须返回 null 而不是降级到别的版本');
  assert.equal(loadMission('mission-001-mini').missionId, 'mission-001-mini');
  assert.equal(loadMission('nope'), null);
});

/* ==================================================================== *
 * A38 数据缺陷：校验能发现，语料安全降级
 * ==================================================================== */
test('A38 重复 sourceId / 片段 ID 冲突被拒绝', () => {
  const duplicated = validateMissionPack([...NOTICES, NOTICES[0]]);
  assert.equal(duplicated.ok, false);
  assert.ok(duplicated.problems.some((p) => p.code === 'DUPLICATE_SOURCE_ID'));

  const movedChunk = NOTICES.map((n, i) => (i === 1 ? { ...n, chunks: [{ chunkId: 'NTC-1001#summary', kind: 'summary', text: n.summary }, ...n.chunks.slice(1)] } : n));
  const chunkConflict = validateMissionPack(movedChunk);
  assert.ok(chunkConflict.problems.some((p) => p.code === 'DUPLICATE_CHUNK_ID' || p.code === 'CHUNK_ID_MISMATCH'));
});

test('A38 非法日期（格式对但不存在）被拒绝', () => {
  assert.equal(isIsoDate('2026-10-18'), true);
  assert.equal(isIsoDate('2026-02-31'), false);
  assert.equal(isIsoDate('2026-13-01'), false);
  assert.equal(isIsoDate('2026/10/18'), false);
  const bad = validateMissionPack(NOTICES.map((n, i) => (i === 0 ? { ...n, publishedAt: '2026-02-31' } : n)));
  assert.ok(bad.problems.some((p) => p.code === 'INVALID_DATE'));
});

test('A38 悬空 / 自指 / 跨事项 / 时间倒置的 supersedes 都被发现', () => {
  const unknown = validateMissionPack(NOTICES.map((n) => (n.sourceId === 'NTC-1007' ? { ...n, supersedes: ['NTC-9999'] } : n)));
  assert.ok(unknown.problems.some((p) => p.code === 'SUPERSEDES_UNKNOWN'));

  const self = validateMissionPack(NOTICES.map((n) => (n.sourceId === 'NTC-1007' ? { ...n, supersedes: ['NTC-1007'] } : n)));
  assert.ok(self.problems.some((p) => p.code === 'SUPERSEDES_SELF'));

  const crossSubject = validateMissionPack(NOTICES.map((n) => (n.sourceId === 'NTC-1007' ? { ...n, supersedes: ['NTC-1008'] } : n)));
  assert.ok(crossSubject.problems.some((p) => p.code === 'SUPERSEDES_CROSS_SUBJECT'));

  const reversed = validateMissionPack(NOTICES.map((n) => (n.sourceId === 'NTC-1007' ? { ...n, publishedAt: '2026-10-10' } : n)));
  assert.ok(reversed.problems.some((p) => p.code === 'SUPERSEDES_TIME_ORDER'));
});

test('A38 循环更正链被检测为数据缺陷（不能用「最新胜出」悄悄消解）', () => {
  const base = NOTICES[0];
  const cyclic = [
    { ...base, sourceId: 'CYC-001', eventKey: 'evt-cyc', publishedAt: '2026-10-01', supersedes: ['CYC-002'] },
    { ...base, sourceId: 'CYC-002', eventKey: 'evt-cyc', publishedAt: '2026-10-05', supersedes: ['CYC-001'] },
  ];
  const result = validateMissionPack([...NOTICES, ...cyclic]);
  assert.ok(result.problems.some((p) => p.code === 'SUPERSEDES_CYCLE'));

  const map = new Map(cyclic.map((n) => [n.sourceId, n]));
  const cycles = findSupersedesCycles(map);
  assert.equal(cycles.length, 1);
  assert.ok(cycles[0].includes('CYC-001') && cycles[0].includes('CYC-002'));
});

test('A38 无效 claim（anchor 不存在 / 谓词重复）被拒绝，而不是静默失效', () => {
  const brokenAnchor = validateMissionPack(
    NOTICES.map((n) => (n.sourceId === 'NTC-1006' ? { ...n, claims: [{ predicate: 'event_date', value: '2026-10-18', anchor: '完全不存在的一句话', scope: 'any' }] } : n))
  );
  assert.ok(brokenAnchor.problems.some((p) => p.code === 'CLAIM_ANCHOR_MISSING'));

  const bodyScoped = validateMissionPack(
    NOTICES.map((n) => (n.sourceId === 'NTC-1006' ? { ...n, claims: [{ predicate: 'event_date', value: '2026-10-18', anchor: '10 月 18 日', scope: 'body' }] } : n))
  );
  assert.equal(bodyScoped.ok, true, '正文里存在时，正文级 claim 应合法');

  const duplicated = validateMissionPack(
    NOTICES.map((n) =>
      n.sourceId === 'NTC-1006'
        ? {
            ...n,
            claims: [
              { predicate: 'event_date', value: '2026-10-18', anchor: '10 月 18 日', scope: 'any' },
              { predicate: 'event_date', value: '2026-10-18', anchor: '10 月 18 日', scope: 'any' },
            ],
          }
        : n
    )
  );
  assert.ok(duplicated.problems.some((p) => p.code === 'DUPLICATE_CLAIM'));
});

test('A38 prepareCorpus：坏资料被剔除并如实报告，其余资料照常可用', () => {
  const withBad = [
    ...NOTICES,
    { sourceId: 'NTC-1006', summary: '重复 ID', body: ['x'], publishedAt: '2026-10-12' },
    { sourceId: 'BAD-0001', summary: '有摘要', body: ['x'], publishedAt: 'not-a-date' },
    { sourceId: 'BAD-0002', summary: '', body: ['x'], publishedAt: '2026-10-12' },
    { sourceId: null, summary: '缺 ID', body: ['x'], publishedAt: '2026-10-12' },
  ];
  const prepared = prepareCorpus(withBad);
  assert.equal(prepared.notices.length, NOTICES.length);
  assert.equal(prepared.dropped.length, 4);
  assert.ok(prepared.dropped.every((d) => typeof d.message === 'string' && d.message.length > 0));
  assert.deepEqual(
    prepared.dropped.map((d) => d.code).sort(),
    ['DUPLICATE_SOURCE_ID', 'INVALID_DATE', 'INVALID_SOURCE_ID', 'MISSING_SUMMARY']
  );
});

test('prepareCorpus 兼容只有 body 的旧资料包（mission-001-mini）', () => {
  const prepared = prepareCorpus(MISSION_001_MINI.notices);
  assert.equal(prepared.notices.length, 5);
  assert.equal(prepared.dropped.length, 0);
});

/* ==================================================================== *
 * 检索范围与 stable 派生
 * ==================================================================== */
test('每个范围都能返回稳定结果，且不含未知标签的资料', () => {
  for (const scopeId of Object.keys(SEARCH_SCOPES)) {
    const list = noticesForScope(scopeId);
    assert.ok(Array.isArray(list));
    const again = noticesForScope(scopeId);
    assert.deepEqual(again.map((n) => n.sourceId), list.map((n) => n.sourceId));
  }
  assert.deepEqual(noticesForScope('unknown_scope'), []);
});

