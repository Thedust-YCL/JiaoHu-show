/**
 * src/features/laboratory/token/encodings.js
 * ------------------------------------------------------------------
 * Lab 01 使用的分词编码元数据（运行期与构建期共用）。
 *
 * 诚实边界（本文件是这些说法的唯一出处）：
 *   · 编码名（cl100k_base / o200k_base）是真实存在的 BPE 编码族；
 *   · 「大致对应哪些模型」只写成“常用 / 相关”，**不承诺**某个具体模型
 *     今天到底用哪一种编码——厂商会换编码，接口也可能叠加额外 token；
 *   · 两种编码对同一段中文的切分数不同，这正是本实验要展示的事实：
 *     token 数取决于分词器，不取决于字数。
 * ------------------------------------------------------------------
 */

export const ENCODING_DEFS = Object.freeze([
  Object.freeze({
    id: 'cl100k_base',
    label: 'cl100k_base',
    short: 'cl100k',
    family: 'OpenAI 公开的 BPE 编码族（tiktoken 体系）',
    zhNote: '中文通常 1 个 token 约等于 1 个汉字，生僻字与标点常被拆成多个 token。',
    modelNote: '常用作 GPT‑4 系列、文本嵌入模型的编码之一；具体模型以官方文档为准。',
  }),
  Object.freeze({
    id: 'o200k_base',
    label: 'o200k_base',
    short: 'o200k',
    family: 'OpenAI 公开的较新 BPE 编码族（tiktoken 体系）',
    zhNote: '词表更大，常见中文词更可能被合并成更少的 token，但并非总是更少。',
    modelNote: '常用作 GPT‑4o / o 系列等较新模型的编码之一；具体模型以官方文档为准。',
  }),
]);

export const ENCODING_IDS = Object.freeze(ENCODING_DEFS.map((e) => e.id));

export function getEncoding(id) {
  return ENCODING_DEFS.find((e) => e.id === id) || ENCODING_DEFS[0];
}
