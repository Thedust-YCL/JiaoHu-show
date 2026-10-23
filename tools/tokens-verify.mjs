/**
 * tools/tokens-verify.mjs
 * ------------------------------------------------------------------
 * Lab 01 的**复算校验**：证明 src/features/laboratory/token/tokenTable.js
 * 里的 token 序列不是编出来的。
 *
 * 校验项：
 *   1. 表内每个片段都存在于 fragments.js（文本逐字相同）；
 *   2. 对每种编码重新用真实分词器 encode(text)，得到的结果必须与表内 ids
 *      **完全一致**（同一编码 + 同一文本 → 同一组 token）；
 *   3. 表内逐 token 文本拼接后必须等于原文；
 *   4. 不存在「按字符数折算 token」的字段或函数（用源码扫描保证）。
 *
 * 用法：node tools/tokens-verify.mjs
 * 通过时退出码 0；任何一项不一致都退出码 1 并打印差异位置。
 * ------------------------------------------------------------------
 */
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { TOKEN_TABLE } from '../src/features/laboratory/token/tokenTable.js';
import { ALL_FRAGMENTS } from '../src/features/laboratory/token/fragments.js';
import { ENCODING_DEFS } from '../src/features/laboratory/token/encodings.js';

const require = createRequire(import.meta.url);
const pkg = require('gpt-tokenizer/package.json');

async function loadEncoding(id) {
  const mod = await import(`gpt-tokenizer/encoding/${id}`);
  return mod.default?.default ?? mod.default ?? mod;
}

function firstDiff(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) if (a[i] !== b[i]) return i;
  return -1;
}

async function main() {
  const problems = [];
  const encoders = {};
  for (const def of ENCODING_DEFS) encoders[def.id] = await loadEncoding(def.id);

  if (TOKEN_TABLE.generator.packageVersion !== pkg.version) {
    problems.push(
      `生成版本 ${TOKEN_TABLE.generator.packageVersion} 与本地 ${pkg.version} 不一致：请重新运行 node tools/tokens-build.mjs`
    );
  }

  for (const fragment of ALL_FRAGMENTS) {
    const row = TOKEN_TABLE.fragments[fragment.id];
    if (!row) {
      problems.push(`表内缺少片段 ${fragment.id}`);
      continue;
    }
    if (row.text !== fragment.text) {
      problems.push(`片段 ${fragment.id} 的文本与 fragments.js 不一致（表内已过期，请重新生成）`);
      continue;
    }
    for (const def of ENCODING_DEFS) {
      const stored = row.encodings[def.id];
      if (!stored) {
        problems.push(`片段 ${fragment.id} 缺少编码 ${def.id}`);
        continue;
      }
      const recomputed = encoders[def.id].encode(fragment.text);
      if (recomputed.length !== stored.ids.length) {
        problems.push(`片段 ${fragment.id} / ${def.id}：表内 ${stored.ids.length} 个 token，复算 ${recomputed.length} 个`);
        continue;
      }
      const at = firstDiff(recomputed, stored.ids);
      if (at !== -1) {
        problems.push(`片段 ${fragment.id} / ${def.id}：第 ${at + 1} 个 token 不一致（表内 ${stored.ids[at]}，复算 ${recomputed[at]}）`);
      }
      if (stored.texts.join('') !== fragment.text) {
        problems.push(`片段 ${fragment.id} / ${def.id}：逐 token 文本拼接不等于原文`);
      }
      if (stored.ids.length !== stored.texts.length) {
        problems.push(`片段 ${fragment.id} / ${def.id}：ids 与 texts 长度不一致`);
      }
    }
  }

  /* ---------- 反向守护：运行期源码里不允许出现「按字符数折算」的实现 ---------- */
  const tokenDir = path.join(process.cwd(), 'src', 'features', 'laboratory', 'token');
  const files = (await readdir(tokenDir)).filter((f) => f.endsWith('.js') && f !== 'tokenTable.js');
  const forbidden = [/\/\s*[34]\b/, /Math\.ceil\(\s*chars/i, /length\s*\/\s*1\.5/, /charCount\s*\*\s*\d/];
  for (const file of files) {
    const source = await readFile(path.join(tokenDir, file), 'utf8');
    for (const pattern of forbidden) {
      if (pattern.test(source)) problems.push(`${file} 命中可疑的字符数折算写法：${pattern}`);
    }
  }

  const fragmentCount = Object.keys(TOKEN_TABLE.fragments).length;
  console.log(`[verify] 片段 ${fragmentCount} · 编码 ${ENCODING_DEFS.length} · gpt-tokenizer@${pkg.version}（表内 @${TOKEN_TABLE.generator.packageVersion}）`);
  console.log(`[verify] 复算比对 ${fragmentCount * ENCODING_DEFS.length} 组 token 序列`);
  if (problems.length) {
    console.log(`[verify] 未通过：${problems.length} 项`);
    for (const p of problems) console.log('  FAIL ' + p);
    process.exit(1);
  }
  console.log('[verify] 通过：所有 token 序列与真实分词器逐条一致');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
