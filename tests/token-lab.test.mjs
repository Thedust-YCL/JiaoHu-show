/**
 * tests/token-lab.test.mjs
 * ------------------------------------------------------------------
 * Lab 01（A14–A16 / M1.2 §4）的纯逻辑测试。
 *
 * 最关键的一条：**用真实分词器复算**预计算表里的每一个 token 序列。
 * 这保证「预计算」不是编出来的，也保证 A16「没有按字符数伪称真实 token 数」。
 * ------------------------------------------------------------------
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { TOKEN_TABLE } from '../src/features/laboratory/token/tokenTable.js';
import { ALL_FRAGMENTS, DOC_FRAGMENTS, TOKEN_SAMPLES, WINDOW_OPTIONS, OUTPUT_RESERVE_OPTIONS } from '../src/features/laboratory/token/fragments.js';
import { ENCODING_DEFS } from '../src/features/laboratory/token/encodings.js';
import { buildTokenView, computeBudget, countTokens, getFragment, listDocs, listSamples } from '../src/features/laboratory/token/budget.js';

const require = createRequire(import.meta.url);

async function loadEncoding(id) {
  const mod = await import(`gpt-tokenizer/encoding/${id}`);
  return mod.default?.default ?? mod.default ?? mod;
}

/* ==================================================================== *
 * 一、表结构与真实复算
 * ==================================================================== */
test('Token 表：每个片段都有两种编码，ids 与 texts 一一对应', () => {
  for (const fragment of ALL_FRAGMENTS) {
    const row = TOKEN_TABLE.fragments[fragment.id];
    assert.ok(row, `缺少片段 ${fragment.id}`);
    assert.equal(row.text, fragment.text, `${fragment.id} 文本必须与 fragments.js 一致`);
    for (const def of ENCODING_DEFS) {
      const entry = row.encodings[def.id];
      assert.ok(entry, `${fragment.id} 缺少编码 ${def.id}`);
      assert.equal(entry.ids.length, entry.texts.length, `${fragment.id}/${def.id} 长度不一致`);
      assert.ok(entry.ids.length > 0, `${fragment.id}/${def.id} 不应为空`);
      assert.ok(entry.ids.every((id) => Number.isInteger(id) && id >= 0), `${fragment.id}/${def.id} token id 必须是整数`);
      assert.equal(entry.texts.join(''), fragment.text, `${fragment.id}/${def.id} 逐 token 文本拼接必须等于原文`);
    }
  }
});

test('A14 真实分词：表内每一条 token 序列都能被真实分词器逐条复算出来', async () => {
  const pkg = require('gpt-tokenizer/package.json');
  assert.equal(TOKEN_TABLE.generator.packageVersion, pkg.version, '生成版本必须与本地分词器一致');
  for (const def of ENCODING_DEFS) {
    const enc = await loadEncoding(def.id);
    for (const fragment of ALL_FRAGMENTS) {
      const stored = TOKEN_TABLE.fragments[fragment.id].encodings[def.id];
      const recomputed = enc.encode(fragment.text);
      assert.equal(recomputed.length, stored.ids.length, `${fragment.id}/${def.id} token 数不一致`);
      assert.deepEqual(recomputed, stored.ids, `${fragment.id}/${def.id} token 序列不一致`);
      assert.equal(enc.decode(recomputed), fragment.text, `${fragment.id}/${def.id} 回译不一致`);
    }
  }
});

test('A16 无字符数折算：token 数与字符数、字节数都不相等，且随编码变化', () => {
  const zh = TOKEN_TABLE.fragments['sample-zh-notice'];
  assert.equal(zh.chars, 69);
  assert.equal(zh.encodings.cl100k_base.ids.length, 61);
  assert.equal(zh.encodings.o200k_base.ids.length, 43);
  // 若存在「字数 × 固定系数」的实现，这两条断言必然失败
  assert.notEqual(zh.chars, zh.encodings.cl100k_base.ids.length);
  assert.notEqual(Math.round(zh.chars * 0.75), zh.encodings.cl100k_base.ids.length);
  assert.notEqual(zh.bytes, zh.encodings.cl100k_base.ids.length);
  // 英文与 JSON 的 token/字符比例又与中文不同 → 任何固定系数都不成立
  const en = TOKEN_TABLE.fragments['sample-en-model'];
  const json = TOKEN_TABLE.fragments['sample-en-json'];
  assert.ok(en.encodings.cl100k_base.ids.length / en.chars < zh.encodings.cl100k_base.ids.length / zh.chars + 1);
  assert.ok(json.chars / json.encodings.cl100k_base.ids.length > 3);
});

test('样例与资料清单：包含中/英/混合三类，资料片段全部来自虚构语料并带 sourceId', () => {
  const samples = listSamples();
  assert.ok(samples.length >= 3 && samples.length <= 5, '样例数应为 3–5 个');
  assert.deepEqual([...new Set(samples.map((s) => s.lang))].sort(), ['en', 'mixed', 'zh']);
  const docs = listDocs();
  assert.ok(docs.length >= 3);
  for (const doc of docs) {
    assert.match(doc.sourceId, /^NTC-\d{4}$/);
    assert.ok(doc.tokensByEncoding.cl100k_base > 0);
  }
  assert.equal(getFragment('not-a-fragment'), null);
  assert.equal(countTokens('not-a-fragment'), 0);
});

/* ==================================================================== *
 * 二、原文 → token 视图
 * ==================================================================== */
test('Token 视图：序号从 1 起、片段数与真实计数一致、比率由真实数据算出', () => {
  const view = buildTokenView('sample-zh-notice', 'cl100k_base');
  assert.equal(view.total, 61);
  assert.equal(view.tokens[0].index, 1);
  assert.equal(view.tokens.at(-1).index, 61);
  assert.equal(view.tokens.map((t) => t.text).join(''), view.text);
  assert.ok(Math.abs(view.charsPerToken - 69 / 61) < 1e-9);
  assert.ok(view.tokens.some((t) => t.isContinuation), '中文样例应当存在「只贡献字节」的 token');
  assert.equal(view.comparison.find((c) => c.id === 'o200k_base').tokens, 43);
});

test('Token 视图：切换编码后同一原文得到不同 token 数，但原文字符数不变', () => {
  const a = buildTokenView('sample-mixed-goal', 'cl100k_base');
  const b = buildTokenView('sample-mixed-goal', 'o200k_base');
  assert.equal(a.chars, b.chars);
  assert.equal(a.total, 48);
  assert.equal(b.total, 31);
  assert.notEqual(a.total, b.total);
});

/* ==================================================================== *
 * 三、预算分配与截断
 * ==================================================================== */
const baseConfig = { windowTokens: 512, outputReserveTokens: 128, encodingId: 'cl100k_base', sampleId: 'sample-zh-notice', docIds: ['NTC-1001#summary', 'NTC-1001#body-1'] };

test('预算：默认配置的四个分区齐全，合计等于已用 token', () => {
  const plan = computeBudget(baseConfig);
  assert.equal(plan.fits, true);
  assert.deepEqual(plan.sections.map((s) => s.id), ['system', 'task', 'docs', 'output']);
  assert.equal(plan.sections[0].tokens, 72);
  assert.equal(plan.sections[1].tokens, 61);
  assert.equal(plan.sections[2].tokens, 78 + 76);
  assert.equal(plan.sections[3].tokens, 128);
  assert.equal(plan.usedTokens, 72 + 61 + 154 + 128);
  assert.equal(plan.remainingTokens, 512 - plan.usedTokens);
  assert.deepEqual(plan.dropped, []);
});

test('预算：确定性——同一配置两次调用结果完全一致', () => {
  assert.deepEqual(computeBudget(baseConfig), computeBudget(baseConfig));
});

test('A15 预算边界：窗口 384 时第 2 条资料被整条舍弃并给出具体原因', () => {
  const plan = computeBudget({ ...baseConfig, windowTokens: 384 });
  assert.equal(plan.fits, true);
  assert.equal(plan.dropped.length, 1);
  assert.equal(plan.dropped[0].id, 'NTC-1001#body-1');
  assert.match(plan.dropped[0].reason, /整条舍弃/);
  assert.match(plan.dropped[0].reason, /放不下/);
  assert.equal(plan.docs.find((d) => d.id === 'NTC-1001#body-1').included, false);
  assert.equal(plan.sections[2].tokens, 78, '只剩第一条资料的 token');
  assert.ok(plan.notes.some((n) => /整条舍弃/.test(n)));
});

test('A15 预算边界：窗口 256 时连固定段都放不下，判定超限且不偷偷截断系统指令', () => {
  const plan = computeBudget({ ...baseConfig, windowTokens: 256 });
  assert.equal(plan.fits, false);
  assert.ok(plan.overflow);
  assert.equal(plan.overflow.gap, 72 + 61 + 128 - 256);
  assert.equal(plan.dropped.length, 2, '资料全部未进入上下文');
  assert.ok(plan.notes.some((n) => /超限/.test(n)));
  assert.ok(plan.notes.some((n) => /调高窗口上限/.test(n)));
  // 超限时输出预留记为 0，界面不会显示「已预留」
  assert.equal(plan.sections[3].tokens, 0);
});

test('预算边界：任何窗口 × 预留组合都不会产生负数或超过窗口的已用量', () => {
  for (const windowTokens of WINDOW_OPTIONS) {
    for (const outputReserveTokens of OUTPUT_RESERVE_OPTIONS) {
      const plan = computeBudget({ ...baseConfig, windowTokens, outputReserveTokens });
      assert.ok(plan.usedTokens >= 0);
      assert.ok(plan.remainingTokens <= windowTokens);
      assert.ok(plan.sections.every((s) => s.tokens >= 0));
      if (plan.fits) assert.ok(plan.usedTokens <= windowTokens, `${windowTokens}/${outputReserveTokens} 已用超过窗口`);
    }
  }
});

test('预算：无资料时有明确说明，不会凭空产生资料占用', () => {
  const plan = computeBudget({ ...baseConfig, docIds: [] });
  assert.equal(plan.sections[2].tokens, 0);
  assert.equal(plan.sections[2].included, false);
  assert.ok(plan.notes.some((n) => /没有选择任何资料片段/.test(n)));
});

test('预算：资料按选择顺序优先，顺序改变会改变被舍弃的那一条', () => {
  const planA = computeBudget({ ...baseConfig, windowTokens: 384, docIds: ['NTC-1001#summary', 'NTC-1001#body-1'] });
  const planB = computeBudget({ ...baseConfig, windowTokens: 384, docIds: ['NTC-1001#body-1', 'NTC-1001#summary'] });
  assert.equal(planA.docs[0].included, true);
  assert.equal(planB.docs[0].id, 'NTC-1001#body-1');
  // 76 + 78 = 154 > 384 - 72 - 61 - 128 = 123 → 只放得下一条
  assert.equal(planB.docs.filter((d) => d.included).length, 1);
  assert.notEqual(planA.docs.find((d) => !d.included)?.id, planB.docs.find((d) => !d.included)?.id);
});

test('预算：非法输入被安全收敛（未知样例 / 未知编码 / 未知资料 / 非法窗口）', () => {
  const plan = computeBudget({ windowTokens: 999, outputReserveTokens: 5, encodingId: 'nope', sampleId: 'nope', docIds: ['nope'] });
  assert.ok(WINDOW_OPTIONS.includes(plan.windowTokens), '非法窗口回退到默认值');
  assert.ok(OUTPUT_RESERVE_OPTIONS.includes(plan.outputReserveTokens));
  assert.equal(plan.encodingId, 'cl100k_base');
  assert.equal(plan.sampleId, TOKEN_SAMPLES[0].id);
  assert.deepEqual(plan.docIds, []);
});

test('预算：重复资料 ID 只计一次，资料片段与语料一致', () => {
  const plan = computeBudget({ ...baseConfig, docIds: ['NTC-1001#summary', 'NTC-1001#summary'] });
  assert.equal(plan.docIds.length, 1);
  assert.equal(plan.sections[2].tokens, 78);
  for (const doc of DOC_FRAGMENTS) {
    assert.ok(TOKEN_TABLE.fragments[doc.id], `${doc.id} 必须在预计算表里`);
  }
});
