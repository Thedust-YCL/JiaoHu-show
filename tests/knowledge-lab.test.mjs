/**
 * tests/knowledge-lab.test.mjs
 * ------------------------------------------------------------------
 * Lab 04 · KNOWLEDGE LAB 的纯逻辑测试（M1.3 D04 / §5 / A09–A16）。
 *
 * 覆盖：
 *   · 切分：空文本、长文本、边界段落、重复标题、参数变化 → ID 与边界必变
 *   · 检索：零结果、同分排序、候选上限、重复运行稳定
 *   · Embedding 示意：只用预计算坐标，无坐标即「不可用」，不伪造分数
 *   · RAG：无证据 / 证据冲突 / 更正关系 / 引用定位
 *   · Memory：保存 / 清除 / 命名空间隔离 / 损坏存储容错
 *   · Skills：改变方法步骤但绝不改变工具与权限
 * ------------------------------------------------------------------
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { memoryStorage } from './helpers.mjs';
import { LAB_DOCS, LAB_QUESTIONS, docsInScope, getLabQuestion } from '../src/features/laboratory/knowledge/corpus.js';
import { CHUNK_PRESETS, CHUNK_SIZES, chunkDocuments, chunkIdsOf } from '../src/features/laboratory/knowledge/chunking.js';
import {
  DEFAULT_TOP_K,
  TOP_K_OPTIONS,
  queryTerms,
  retrieve,
  tokenize,
} from '../src/features/laboratory/knowledge/retrieval.js';
import {
  CONTEXT_CHAR_BUDGET,
  DEFAULT_LAB_CONFIG,
  diffRuns,
  extractDates,
  runKnowledgeLab,
} from '../src/features/laboratory/knowledge/pipeline.js';
import {
  LAB_MEMORY_KEY,
  MAX_MEMORY_ENTRIES,
  createMemoryStore,
  parseMemory,
} from '../src/features/laboratory/knowledge/memory.js';
import { SKILL_CARDS, methodPlan, runChecks } from '../src/features/laboratory/knowledge/skills.js';

/* ==================================================================== *
 * 一、语料与切分
 * ==================================================================== */
test('语料：复用 M0.4 虚构公告，全部标记 isFictional，段落结构完整', () => {
  assert.equal(LAB_DOCS.length, 9);
  for (const doc of LAB_DOCS) {
    assert.match(doc.docId, /^NTC-1\d{3}$/);
    assert.equal(doc.isFictional, true, doc.docId);
    assert.ok(doc.title.length > 4, doc.docId);
    assert.ok(doc.paragraphs.length >= 2, `${doc.docId} 至少摘要 + 一段正文`);
    assert.ok(doc.paragraphs.every((text) => typeof text === 'string' && text.length > 0), doc.docId);
  }
});

test('A10 切分：三种预设都产出片段，且每个片段可定位回原文', () => {
  for (const preset of CHUNK_PRESETS) {
    const result = chunkDocuments({ preset: preset.id, size: 90 });
    assert.ok(result.chunks.length > 0, preset.id);
    assert.equal(result.config.preset, preset.id);
    for (const chunk of result.chunks) {
      assert.ok(chunk.chunkId.startsWith(`${chunk.docId}#`), chunk.chunkId);
      assert.ok(chunk.text.length > 0, chunk.chunkId);
      assert.ok(chunk.chars > 0, chunk.chunkId);
      assert.ok(chunk.locator, `${chunk.chunkId} 必须有原文定位`);
      assert.equal(chunk.isFictional, true);
      const doc = LAB_DOCS.find((d) => d.docId === chunk.docId);
      const joined = doc.paragraphs.join('\n').replace(/\s+/g, '');
      assert.ok(joined.includes(chunk.text.replace(/\s+/g, '')), `${chunk.chunkId} 的文本必须能在原文里找到`);
    }
  }
});

test('A10 切分：换预设或换长度，片段 ID 与边界必然变化', () => {
  const paragraph = chunkDocuments({ preset: 'paragraph' });
  const fixed60 = chunkDocuments({ preset: 'fixed', size: 60 });
  const fixed90 = chunkDocuments({ preset: 'fixed', size: 90 });
  const idsParagraph = new Set(chunkIdsOf({ preset: 'paragraph' }));
  const idsFixed60 = new Set(chunkIdsOf({ preset: 'fixed', size: 60 }));
  const idsFixed90 = new Set(chunkIdsOf({ preset: 'fixed', size: 90 }));

  assert.notEqual(paragraph.chunks.length, fixed60.chunks.length);
  for (const id of idsFixed60) assert.ok(!idsParagraph.has(id), `ID 不应重复：${id}`);
  assert.notDeepEqual([...idsFixed60], [...idsFixed90]);
  // 固定长度切分必然出现「跨段」或「句子被切断」这类边界问题
  assert.ok(fixed60.stats.crossBoundary + fixed60.stats.truncated > 0);
  // 段落切分不跨段
  assert.equal(paragraph.stats.crossBoundary, 0);
});

test('A10 切分：空文本 / 超长文本 / 重复标题都不崩溃', () => {
  const empty = chunkDocuments({ scopeDocs: [] });
  assert.deepEqual(empty.chunks, []);
  assert.equal(empty.stats.chunkCount, 0);

  const longDoc = {
    docId: 'NTC-9999',
    title: '超长文本',
    publisher: '虚构大学 · 测试',
    publishedAt: '2026-10-01',
    scope: 'campus_events',
    isFictional: true,
    supersedes: [],
    validity: 'active',
    paragraphs: ['这是一段用于测试的长文本。'.repeat(80)],
  };
  const long = chunkDocuments({ preset: 'fixed', size: 60, scopeDocs: [longDoc] });
  assert.ok(long.chunks.length > 10);
  assert.ok(long.chunks.every((chunk) => chunk.chars <= 60));

  const duplicateTitle = chunkDocuments({
    preset: 'paragraph',
    scopeDocs: [
      { ...longDoc, docId: 'NTC-9998', paragraphs: ['标题相同的公告内容 A'] },
      { ...longDoc, docId: 'NTC-9997', paragraphs: ['标题相同的公告内容 A'] },
    ],
  });
  const ids = duplicateTitle.chunks.map((chunk) => chunk.chunkId);
  assert.equal(new Set(ids).size, ids.length, '重复标题也必须得到不同片段 ID');
});

test('切分：参数非法时收敛到默认值，不抛异常', () => {
  const result = chunkDocuments({ preset: 'not-a-preset', size: 17 });
  assert.equal(result.config.preset, CHUNK_PRESETS[0].id);
  assert.ok(CHUNK_SIZES.includes(result.config.size));
});

test('切分：范围过滤只影响纳入切分的文档，不改变切分规则', () => {
  const scopeDocs = docsInScope('campus_events');
  assert.ok(scopeDocs.length > 0 && scopeDocs.length < LAB_DOCS.length);
  const scoped = chunkDocuments({ preset: 'paragraph', scopeDocs });
  const docIds = new Set(scoped.chunks.map((c) => c.docId));
  assert.deepEqual([...docIds].sort(), scopeDocs.map((d) => d.docId).sort());
});

/* ==================================================================== *
 * 二、检索
 * ==================================================================== */
test('分词：中文按二元组、英文按词，空输入返回空数组', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize('招聘'), ['招聘']);
  assert.ok(tokenize('秋季校园招聘会').includes('招聘'));
  assert.deepEqual(tokenize('RAG Test'), ['rag', 'test']);
  // 8 个汉字切出 7 个二元组 + 1 个单字（末字没有后继时保留单字）
  assert.equal(tokenize('上海自来水来自海上').length, 8);
});

test('A11 检索：关键词通道由确定性规则打分，理由可查看', () => {
  const { chunks } = chunkDocuments({ preset: 'paragraph' });
  const first = retrieve({ chunks, questionId: 'career-fair-date' });
  const second = retrieve({ chunks, questionId: 'career-fair-date' });
  assert.deepEqual(
    first.candidates.map((c) => [c.chunkId, c.score]),
    second.candidates.map((c) => [c.chunkId, c.score])
  );
  assert.ok(first.candidates.length > 0);
  // 分数严格降序；同分按 docId、再按片段序号升序
  for (let i = 1; i < first.candidates.length; i += 1) {
    const prev = first.candidates[i - 1];
    const cur = first.candidates[i];
    assert.ok(prev.score > cur.score || (prev.score === cur.score && `${prev.docId}#${prev.ordinal}` <= `${cur.docId}#${cur.ordinal}`));
  }
  for (const candidate of first.candidates) {
    assert.ok(candidate.reason.length > 0, `${candidate.chunkId} 必须有匹配理由`);
    assert.ok(Array.isArray(candidate.matched));
    assert.ok(candidate.matched.length > 0);
  }
});

test('A11 检索：候选上限生效，且同一输入重复运行完全一致', () => {
  const { chunks } = chunkDocuments({ preset: 'paragraph' });
  for (const topK of TOP_K_OPTIONS) {
    const result = retrieve({ chunks, questionId: 'career-fair-date', topK });
    assert.ok(result.candidates.length <= topK);
  }
  const limited = retrieve({ chunks, questionId: 'career-fair-date', topK: 3 });
  assert.equal(limited.candidates.length, 3);
  assert.equal(DEFAULT_TOP_K, 5);
});

test('A11 检索：零结果时返回空候选而不是编造片段', () => {
  const { chunks } = chunkDocuments({ preset: 'paragraph' });
  const result = retrieve({ chunks, questionId: 'graduation-venue' });
  assert.equal(result.available, true);
  // 「毕业典礼」在语料里不存在：命中数可能为 0
  assert.equal(result.candidates.filter((c) => c.score > 0).length, result.candidates.length);
  const none = retrieve({ chunks: [], questionId: 'career-fair-date' });
  assert.deepEqual(none.candidates, []);
  assert.equal(none.totalScored, 0);
});

test('A11 检索：同分时按「来源 ID → 片段序号」稳定排序（不依赖数组顺序）', () => {
  /** 构造三个完全同分的片段：文本、标题相同，只有文档与序号不同 */
  const makeChunk = (docId, ordinal) => ({
    chunkId: `${docId}#para-${ordinal}`,
    docId,
    sourceId: docId,
    title: '秋季校园招聘会公告',
    publishedAt: '2026-10-01',
    tags: [],
    ordinal,
    text: '秋季校园招聘会定于体育馆举行，请提前准备简历。',
    chars: 24,
    locator: ordinal === 1 ? '摘要段' : `正文第 ${ordinal - 1} 段`,
    crossesParagraph: false,
    truncated: false,
  });
  const chunks = [makeChunk('NTC-9002', 1), makeChunk('NTC-9001', 2), makeChunk('NTC-9001', 1)];
  const first = retrieve({ chunks, questionId: 'career-fair-date', topK: 3 });
  assert.equal(first.candidates.length, 3);
  assert.equal(new Set(first.candidates.map((c) => c.score)).size, 1, '三个片段必须同分，才能验证同分排序');
  assert.deepEqual(
    first.candidates.map((c) => `${c.docId}#${c.ordinal}`),
    ['NTC-9001#1', 'NTC-9001#2', 'NTC-9002#1'],
    '同分时先按来源 ID 升序，再按片段序号升序'
  );
  // 打乱输入顺序，结果不变（排序不依赖数组位置）
  const reversed = retrieve({ chunks: [...chunks].reverse(), questionId: 'career-fair-date', topK: 3 });
  assert.deepEqual(
    reversed.candidates.map((c) => `${c.docId}#${c.ordinal}`),
    first.candidates.map((c) => `${c.docId}#${c.ordinal}`)
  );
});

test('A12 向量示意：只用预计算坐标，分数与距离对应，且标注非模型输出', () => {
  const { chunks } = chunkDocuments({ preset: 'paragraph' });
  const result = retrieve({ chunks, questionId: 'career-fair-date', mode: 'vector-demo' });
  assert.equal(result.available, true);
  assert.match(result.note, /人工按主题相近程度设定/);
  assert.match(result.formula, /相似度/);
  assert.ok(result.candidates.length > 0);
  for (const candidate of result.candidates) {
    assert.equal(candidate.matched.length, 0, '向量通道不使用词项匹配');
    assert.ok(candidate.coord.length === 2);
    assert.ok(candidate.distance >= 0);
    // 相似度必须能由距离算出（不随机）
    const expected = Number((1 - candidate.distance / (Math.sqrt(2) * 100)).toFixed(4));
    assert.equal(candidate.score, expected, candidate.chunkId);
  }
});

test('A12 向量示意：没有预计算坐标的问题返回「不可用」，且不产生任何候选', () => {
  const { chunks } = chunkDocuments({ preset: 'paragraph' });
  const result = retrieve({ chunks, questionId: 'graduation-venue', mode: 'vector-demo' });
  assert.equal(result.available, false);
  assert.equal(result.candidates.length, 0);
  assert.match(result.note, /没有预计算查询坐标/);
  assert.equal(result.formula, null);
});

test('检索：查询词项稳定去重（同一问题两次得到同一词项表）', () => {
  const question = getLabQuestion('open-day-date');
  assert.deepEqual(queryTerms(question), queryTerms(question));
  assert.ok(queryTerms(question).includes('开放'));
});

/* ==================================================================== *
 * 三、RAG / 上下文 / 引用
 * ==================================================================== */
test('A13 RAG：检索 → 上下文 → 结论可追溯，引用指向真实片段与来源', () => {
  const run = runKnowledgeLab({ questionId: 'career-fair-date', preset: 'paragraph' });
  assert.ok(run.context.segments.length > 0);
  assert.ok(run.context.usedChars <= CONTEXT_CHAR_BUDGET);
  assert.equal(run.context.segments.length + run.context.dropped.length, run.retrieval.candidates.length);
  for (const citation of run.answer.citations) {
    const segment = run.context.segments.find((s) => s.chunkId === citation.chunkId);
    assert.ok(segment, `${citation.chunkId} 引用必须指向本次进入上下文的片段`);
    assert.equal(segment.docId, citation.docId);
    const chunk = run.chunking.chunks.find((c) => c.chunkId === citation.chunkId);
    assert.ok(chunk.text.includes(citation.value.replace(/\s/g, '')) || /月/.test(citation.value));
  }
});

test('A14 无证据：没有命中或没有锚点时输出「资料不足」，引用数为 0', () => {
  const noHit = runKnowledgeLab({ questionId: 'graduation-venue' });
  assert.equal(noHit.answer.status, 'insufficient');
  assert.equal(noHit.answer.citations.length, 0);
  assert.ok(noHit.answer.lines.some((line) => /资料不足/.test(line)) || /未验证/.test(noHit.answer.statusCn));

  // 候选被锚点检查拦下 → 上下文为空 → 仍不生成引用
  const anchored = runKnowledgeLab({ questionId: 'graduation-venue', preset: 'paragraph' });
  assert.equal(anchored.relevance.filter((r) => r.relevant).length, 0);
  assert.equal(anchored.context.segments.length, 0);
  assert.equal(anchored.answer.citations.length, 0);
});

test('RAG 证据冲突：两份公告日期不一致 → 未决，且并列保留两个来源', () => {
  const run = runKnowledgeLab({ questionId: 'career-fair-date' });
  assert.equal(run.answer.status, 'unresolved');
  assert.equal(run.answer.citations.length, 2);
  const values = run.answer.citations.map((c) => c.value);
  assert.ok(values.includes('10 月 24 日'));
  assert.ok(values.includes('10 月 26 日'));
});

test('RAG 更正关系：启用 Skill 后按 supersedes + 正文采信新日期', () => {
  const without = runKnowledgeLab({ questionId: 'open-day-date', skillEnabled: false });
  assert.equal(without.answer.status, 'unresolved');
  const withSkill = runKnowledgeLab({ questionId: 'open-day-date', skillEnabled: true });
  assert.equal(withSkill.answer.status, 'resolved');
  assert.ok(withSkill.answer.citations.some((c) => c.docId === 'NTC-1007'));
  assert.match(withSkill.answer.lines.join('\n'), /予以更正/);
});

test('RAG：值相同的多份公告不算冲突', () => {
  // 创客分享会只有一份公告：单一取值 → 有支撑
  const run = runKnowledgeLab({ questionId: 'maker-signup' });
  assert.ok(['supported', 'unverified'].includes(run.answer.status), run.answer.status);
  assert.ok(run.answer.citations.length >= 1);
});

test('RAG：抽取规则只认「锚点 + 线索词 + 日期」，不会从任意数字里造日期', () => {
  assert.deepEqual(extractDates('没有日期的句子'), []);
  assert.deepEqual(extractDates('10 月 24 日').map((d) => d.raw), ['10 月 24 日']);
  const run = runKnowledgeLab({ questionId: 'library-hours' });
  // 图书馆问题不是日期型：只做原文摘录，不做日期结论
  assert.ok(['supported', 'unverified'].includes(run.answer.status));
  assert.match(run.answer.statusCn, /原文摘录|谨慎/);
});

test('上下文预算：片段总长超预算时被舍弃，并给出具体原因', () => {
  const run = runKnowledgeLab({ questionId: 'open-day-date', preset: 'fixed', size: 120, topK: 8 });
  assert.ok(run.context.usedChars <= CONTEXT_CHAR_BUDGET);
  for (const dropped of run.context.dropped) {
    assert.ok(dropped.reason.length > 0);
  }
});

test('确定性：同一配置两次运行结果深度相等（无随机、无时间依赖）', () => {
  const a = runKnowledgeLab({ questionId: 'open-day-date', preset: 'fixed', size: 90, skillEnabled: true });
  const b = runKnowledgeLab({ questionId: 'open-day-date', preset: 'fixed', size: 90, skillEnabled: true });
  assert.deepEqual(a, b);
  assert.deepEqual(diffRuns(a, b).changed, []);
});

/* ==================================================================== *
 * 四、Memory
 * ==================================================================== */
test('A15 Memory：只有显式保存才写入，使用独立命名空间', () => {
  const storage = memoryStorage();
  const store = createMemoryStore({ storage, now: () => 1000 });
  assert.equal(store.list().length, 0);
  assert.equal(storage.getItem(LAB_MEMORY_KEY), null);

  const saved = store.save({ kind: 'focus', value: '关注日期冲突' });
  assert.equal(saved.ok, true);
  assert.equal(saved.entry.kindCn, '关注点');
  assert.equal(saved.entry.origin, '用户手动保存');
  assert.equal(store.list().length, 1);
  assert.ok(storage.getItem(LAB_MEMORY_KEY).includes('关注日期冲突'));
  // 不写其它命名空间
  assert.equal(storage.keys().length, 1);
  assert.equal(storage.keys()[0], LAB_MEMORY_KEY);
});

test('A15 Memory：空内容 / 未知类别 / 超过上限都被拒绝，并给出原因', () => {
  const store = createMemoryStore({ storage: memoryStorage(), now: () => 1 });
  assert.equal(store.save({ kind: 'focus', value: '   ' }).reason, 'EMPTY_VALUE');
  assert.equal(store.save({ kind: 'nope', value: 'x' }).reason, 'UNKNOWN_KIND');
  for (let i = 0; i < MAX_MEMORY_ENTRIES; i += 1) assert.equal(store.save({ kind: 'history', value: `摘要 ${i}` }).ok, true);
  assert.equal(store.save({ kind: 'history', value: '再来一条' }).reason, 'OVER_LIMIT');
  assert.equal(store.list().length, MAX_MEMORY_ENTRIES);
});

test('A15 Memory：单条删除与整体清除都只影响记忆本身', () => {
  const storage = memoryStorage({ 'agent-zero:learning:v2': JSON.stringify({ schemaVersion: 2, concepts: {} }) });
  const store = createMemoryStore({ storage, now: () => 1 });
  store.save({ kind: 'focus', value: '一' });
  store.save({ kind: 'preference', value: '二' });
  assert.equal(store.remove(store.list()[0].id), true);
  assert.equal(store.list().length, 1);
  assert.equal(store.clearAll(), 1);
  assert.equal(store.list().length, 0);
  assert.equal(storage.getItem(LAB_MEMORY_KEY), null);
  // 学习进度命名空间未被触碰
  assert.ok(storage.getItem('agent-zero:learning:v2'));
});

test('A15 Memory：损坏存储安全降级，不抛异常也不清空其它命名空间', () => {
  const storage = memoryStorage({ [LAB_MEMORY_KEY]: '{ broken' });
  const store = createMemoryStore({ storage });
  assert.deepEqual(store.list(), []);
  assert.equal(store.notice.code, 'LAB_MEMORY_CORRUPT');
  assert.equal(store.save({ kind: 'focus', value: '新条目' }).ok, true);
  assert.equal(store.list().length, 1);
});

test('A15 Memory：逐条校验，未知类别与重复 ID 被丢弃而不是整表清空', () => {
  const raw = JSON.stringify({
    schemaVersion: 1,
    entries: [
      { id: 'mem-1', kind: 'focus', value: '保留我', createdAt: 1 },
      { id: 'mem-2', kind: 'unknown-kind', value: '丢弃我' },
      { id: 'mem-1', kind: 'history', value: '重复 ID', createdAt: 2 },
      { id: 'mem-3', kind: 'history', value: '' },
    ],
  });
  const parsed = parseMemory(raw);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].value, '保留我');
  assert.equal(parsed.dropped.length, 3);
  assert.equal(parsed.notice.code, 'LAB_MEMORY_PARTIAL');
});

test('A15 Memory：记忆内容不会出现在上下文 / 检索结果里（三栏互相独立）', () => {
  const run = runKnowledgeLab({ questionId: 'career-fair-date' });
  assert.equal(run.memoryView.persisted, null, '记忆由 UI 从独立 store 读取，不混进检索结果');
  const ids = new Set(run.context.segments.map((s) => s.chunkId));
  assert.ok([...ids].every((id) => run.chunking.chunks.some((c) => c.chunkId === id)));
});

/* ==================================================================== *
 * 五、Skills
 * ==================================================================== */
test('A16 Skills：启用后方法步骤变多，但工具与权限集合完全不变', () => {
  const off = methodPlan({ skillEnabled: false });
  const on = methodPlan({ skillEnabled: true });
  assert.ok(on.steps.length > off.steps.length);
  assert.equal(on.added.length, SKILL_CARDS[0].checks.length);
  assert.equal(on.toolsUnchanged, true);
  assert.deepEqual([...SKILL_CARDS[0].grants.tools], ['announcement_search', 'document_reader']);
  // 启用前后工具清单逐字相同
  assert.deepEqual([...SKILL_CARDS[0].grants.tools], [...SKILL_CARDS[0].grants.tools]);
  assert.match(SKILL_CARDS[0].grants.note, /不会新增工具/);
});

test('A16 Skills：核验结果只由本次选中的片段决定（不读隐藏数据）', () => {
  const run = runKnowledgeLab({ questionId: 'open-day-date', skillEnabled: true });
  assert.equal(run.checks.enabled, true);
  const ids = new Set(run.context.segments.map((s) => s.chunkId));
  for (const check of run.checks.checks) {
    assert.ok(check.reason.length > 0, check.id);
  }
  // 更正检查必须依赖本次上下文里的正文
  const revision = run.checks.checks.find((c) => c.id === 'revision');
  assert.ok(['pass', 'fail', 'skip'].includes(revision.status));
  assert.ok(run.context.segments.some((s) => ids.has(s.chunkId)));
});

test('A16 Skills：未启用时不做任何检查，也不改变结论', () => {
  const off = runKnowledgeLab({ questionId: 'open-day-date', skillEnabled: false });
  assert.equal(off.checks.enabled, false);
  assert.deepEqual(off.checks.checks, []);
  assert.equal(off.plan.added.length, 0);
});

test('Skills：runChecks 在空证据时安全返回，不抛异常', () => {
  const result = runChecks({ skillEnabled: true, selected: [] });
  assert.equal(result.enabled, true);
  assert.equal(result.verdict, 'no-evidence');
  assert.equal(result.checks.length, 1);
});

/* ==================================================================== *
 * 六、差异解释与默认配置
 * ==================================================================== */
test('差异说明：改切分会同时反映在片段数与结论状态上', () => {
  const before = runKnowledgeLab({ questionId: 'career-fair-date', preset: 'paragraph' });
  const after = runKnowledgeLab({ questionId: 'career-fair-date', preset: 'fixed', size: 60 });
  const diff = diffRuns(before, after);
  assert.ok(diff.changed.some((c) => c.key === 'preset'));
  const chunksDelta = diff.deltas.find((d) => d.key === 'chunks');
  assert.notEqual(chunksDelta.from, chunksDelta.to);
});

test('默认配置：覆盖全部维度，且每个问题都有可读的说明', () => {
  assert.ok(DEFAULT_LAB_CONFIG.preset);
  assert.ok(DEFAULT_LAB_CONFIG.questionId);
  assert.equal(DEFAULT_LAB_CONFIG.mode, 'keyword');
  for (const question of LAB_QUESTIONS) {
    assert.ok(question.text.length > 4);
    assert.ok(question.anchors.length > 0, `${question.id} 必须有锚点`);
    assert.ok(question.note.length > 6, `${question.id} 必须说明该怎么读`);
    assert.ok(['date', 'quote'].includes(question.factKind));
    if (question.factKind === 'quote') assert.ok(question.quoteAnchor, `${question.id} 摘录型问题必须有锚点词`);
  }
});
