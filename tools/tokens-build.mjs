/**
 * tools/tokens-build.mjs
 * ------------------------------------------------------------------
 * Lab 01 的**离线预计算**脚本（构建期工具，不是运行时代码）。
 *
 * 做什么：
 *   1. 读取 src/features/laboratory/token/fragments.js 里的全部原文；
 *   2. 用真实 BPE 分词器（gpt-tokenizer 的 cl100k_base 与 o200k_base 编码）
 *      对每段文本切分，得到 token id 序列；
 *   3. 逐 token 求出「这个 token 让明文前进了哪些字符」，供界面按 token 展示；
 *   4. 校验 decode(ids) === 原文（不通过就报错退出，绝不写出不可信的统计）；
 *   5. 写出 src/features/laboratory/token/tokenTable.js（**自动生成，勿手改**）。
 *
 * 为什么预计算而不是运行时打包分词器：
 *   · 运行期打包 cl100k_base 词表会让首屏多出约 1MB（实测 1021.5KB min）；
 *   · 本实验只需要固定样例的真实切分，不需要对任意输入计数；
 *   · 因此把「真实计数」放在构建期完成，运行期只读取已核验的结果，
 *     并用 tools/tokens-verify.mjs / tests/token-lab.test.mjs 复算校验。
 *
 * 用法：node tools/tokens-build.mjs
 * ------------------------------------------------------------------
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ALL_FRAGMENTS } from '../src/features/laboratory/token/fragments.js';
import { ENCODING_DEFS } from '../src/features/laboratory/token/encodings.js';

const require = createRequire(import.meta.url);
const root = process.cwd();
const OUT = path.join(root, 'src', 'features', 'laboratory', 'token', 'tokenTable.js');

const pkg = require('gpt-tokenizer/package.json');

async function loadEncoding(id) {
  const mod = await import(`gpt-tokenizer/encoding/${id}`);
  const enc = mod.default?.default ?? mod.default ?? mod;
  if (typeof enc?.encode !== 'function' || typeof enc?.decode !== 'function') {
    throw new Error(`编码 ${id} 不可用：缺少 encode/decode`);
  }
  return enc;
}

/**
 * 逐 token 求「可见文本」：
 * 中文等多字节字符常被拆到相邻两个 token 里，单个 token 的 decode 结果
 * 可能是空的或替换字符。这里直接取每个 token 的**原始字节**，再用
 * TextDecoder 的流式解码把字符归到「让它完成」的那个 token 上：
 *   · 能独立成字的 token 显示文本；
 *   · 只提供半个字符的 token 显示为空串（界面标「续前面字节」）。
 * 这样逐 token 文本拼接后必须恰好等于原文，可作为一条自检。
 */
function tokenChunks(enc, id) {
  const core = enc.bytePairEncodingCoreProcessor;
  const chunk = core?.tryDecodeToken?.(id);
  if (chunk === undefined) throw new Error(`token ${id} 不在编码表中`);
  return typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk);
}

function tokenTexts(enc, ids) {
  const decoder = new TextDecoder('utf-8');
  const out = [];
  for (const id of ids) out.push(decoder.decode(tokenChunks(enc, id), { stream: true }));
  const tail = decoder.decode();
  if (tail) out.push(tail);
  return out;
}

async function main() {
  const fragments = {};
  const stats = {};
  const encoders = [];

  for (const def of ENCODING_DEFS) {
    const enc = await loadEncoding(def.id);
    encoders.push({ ...def, vocabularySize: enc.vocabularySize });
    for (const fragment of ALL_FRAGMENTS) {
      const ids = enc.encode(fragment.text);
      const decoded = enc.decode(ids);
      if (decoded !== fragment.text) {
        throw new Error(`编码 ${def.id} 的「${fragment.id}」回译不一致：decode(encode(text)) !== text`);
      }
      const texts = tokenTexts(enc, ids);
      if (texts.join('') !== fragment.text) {
        throw new Error(`编码 ${def.id} 的「${fragment.id}」逐 token 文本拼接不一致`);
      }
      fragments[fragment.id] ??= {
        id: fragment.id,
        kind: fragment.kind,
        label: fragment.label,
        sourceId: fragment.sourceId || null,
        text: fragment.text,
        chars: [...fragment.text].length,
        bytes: Buffer.byteLength(fragment.text, 'utf8'),
        encodings: {},
      };
      fragments[fragment.id].encodings[def.id] = { ids, texts };
    }
  }

  for (const fragment of Object.values(fragments)) {
    stats[fragment.id] = Object.fromEntries(
      Object.entries(fragment.encodings).map(([encId, value]) => [encId, value.ids.length])
    );
  }

  const payload = {
    schema: 'az-token-table/1',
    builtAt: new Date().toISOString().slice(0, 10),
    generator: {
      script: 'tools/tokens-build.mjs',
      verifier: 'tools/tokens-verify.mjs',
      package: 'gpt-tokenizer',
      packageVersion: pkg.version,
      homepage: 'https://github.com/niieani/gpt-tokenizer',
      note: '运行期不包含分词器本体：本文件是离线预计算并逐条回译校验过的结果表。',
    },
    encoders,
    fragments,
    stats,
  };

  const header = `/**
 * src/features/laboratory/token/tokenTable.js
 * ------------------------------------------------------------------
 * ⚠️ 自动生成文件（AUTO-GENERATED），不要手动编辑。
 *    重新生成：node tools/tokens-build.mjs
 *    复算校验：node tools/tokens-verify.mjs
 *
 * 内容：Lab 01 所用全部样例的**真实** token 序列（${ENCODING_DEFS.map((e) => e.id).join(' / ')}），
 * 由 gpt-tokenizer@${pkg.version} 在构建期离线切分，并逐条通过
 * decode(encode(text)) === text 的回译校验。
 *
 * 生成时间：${payload.builtAt}
 * ------------------------------------------------------------------
 */

`;

  await writeFile(OUT, header + `export const TOKEN_TABLE = Object.freeze(${JSON.stringify(payload, null, 2)});\n`, 'utf8');

  const rows = Object.entries(stats).map(([id, byEnc]) => {
    const counts = ENCODING_DEFS.map((e) => `${e.id}=${byEnc[e.id]}`).join(' · ');
    return `  ${id.padEnd(22)} chars=${String(fragments[id].chars).padStart(3)} bytes=${String(fragments[id].bytes).padStart(3)}  ${counts}`;
  });
  console.log(`[tokens] 片段 ${Object.keys(fragments).length} 个 · 编码 ${ENCODING_DEFS.length} 种 · ${OUT.replace(root + path.sep, '')}`);
  console.log('[tokens] gpt-tokenizer@' + pkg.version + ' · 回译校验全部通过');
  console.log(rows.join('\n'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
