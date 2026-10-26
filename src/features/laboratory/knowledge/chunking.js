/**
 * src/features/laboratory/knowledge/chunking.js
 * ------------------------------------------------------------------
 * Lab 04 · 切分（M1.3 D04 / §5.2，验收 A10）。
 *
 * 说明：
 *   · 三种预设：按段落 / 按固定字符长度 / 按固定长度 + 重叠；
 *   · 「长度」以**字符**为演示单位，只用来展示边界如何变化，
 *     **不声称等于任何模型的分词（token）结果**——真实 token 计数见 Lab 01；
 *   · 片段 ID 编码「预设 + 参数 + 序号」，因此改参数后 ID 与边界必然变化，
 *     可以直接在测试里断言；
 *   · 纯函数：同一输入永远得到同一输出。
 * ------------------------------------------------------------------
 */
import { LAB_DOCS } from './corpus.js';

export const CHUNK_PRESETS = Object.freeze([
  Object.freeze({
    id: 'paragraph',
    cn: '按段落切分',
    note: '以原始段落为边界：语义完整，但长度参差；长段落会撑大片段。',
  }),
  Object.freeze({
    id: 'fixed',
    cn: '按固定长度切分',
    note: '每 N 个字符切一刀：长度整齐，但可能把一句话、甚至一组「更正」说明切开。',
  }),
  Object.freeze({
    id: 'fixed-overlap',
    cn: '固定长度 + 重叠',
    note: '在固定长度基础上让相邻片段重叠一段：缓解边界断裂，代价是索引变大、片段重复。',
  }),
]);

export const CHUNK_SIZES = Object.freeze([60, 90, 120]);
export const OVERLAP_CHARS = 20;
export const DEFAULT_CHUNK_CONFIG = Object.freeze({ preset: 'paragraph', size: 90 });

export function chunkPreset(presetId) {
  return CHUNK_PRESETS.find((p) => p.id === presetId) || CHUNK_PRESETS[0];
}

function normalizeConfig(config = {}) {
  const preset = chunkPreset(config.preset).id;
  const size = CHUNK_SIZES.includes(Number(config.size)) ? Number(config.size) : DEFAULT_CHUNK_CONFIG.size;
  return { preset, size };
}

function chunkIdOf(docId, preset, size, ordinal) {
  return preset === 'paragraph' ? `${docId}#para-${ordinal}` : `${docId}#${preset}${size}-${ordinal}`;
}

/** 单文档按段落切分：每段一个片段，保留原始段号用于原文定位 */
function byParagraph(doc) {
  return doc.paragraphs.map((text, index) => ({
    docId: doc.docId,
    ordinal: index + 1,
    text,
    chars: text.length,
    paragraphs: [index],
    crossesParagraph: false,
    locator: index === 0 ? '摘要段' : `正文第 ${index} 段`,
  }));
}

/**
 * 单文档按固定长度切分：把段落用换行拼成连续文本后硬切。
 * 记录每刀落在哪个段落，用于标注「跨段/断句」的边界问题。
 */
function byFixedLength(doc, size, overlap) {
  const joined = doc.paragraphs.join('\n');
  /** 段落起始偏移表：判断一个字符区间覆盖了哪些段落 */
  const starts = [];
  let cursor = 0;
  for (const text of doc.paragraphs) {
    starts.push({ start: cursor, end: cursor + text.length });
    cursor += text.length + 1;
  }
  const covered = (from, to) =>
    starts
      .map((range, index) => ({ index, ...range }))
      .filter((range) => range.start < to && range.end > from)
      .map((range) => range.index);

  const out = [];
  const step = Math.max(1, size - overlap);
  for (let start = 0, ordinal = 1; start < joined.length; start += step, ordinal += 1) {
    const end = Math.min(joined.length, start + size);
    const text = joined.slice(start, end);
    const paragraphs = covered(start, end);
    out.push({
      docId: doc.docId,
      ordinal,
      text,
      chars: text.length,
      paragraphs,
      /** 片段覆盖 >1 段，说明这一刀跨过了段落边界 */
      crossesParagraph: paragraphs.length > 1,
      /** 末尾不是句末标点：说明这句话被切断了 */
      truncated: !/[。！？；\n]$/.test(text),
      locator: `字符 ${start}–${end}`,
    });
    if (end >= joined.length) break;
  }
  return out;
}

/**
 * 切分全部文档。
 * @param {{preset?:string,size?:number,scopeDocs?:Array}} options
 * @returns {{config:{preset:string,size:number},chunks:Array,stats:object}}
 */
export function chunkDocuments(options = {}) {
  const { preset, size } = normalizeConfig(options);
  /** 显式传入空数组表示「没有文档可切」；只有缺省时才回退到全部语料 */
  const docs = Array.isArray(options.scopeDocs) ? options.scopeDocs : LAB_DOCS;
  const chunks = [];

  for (const doc of docs) {
    const parts = preset === 'paragraph' ? byParagraph(doc) : byFixedLength(doc, size, preset === 'fixed-overlap' ? OVERLAP_CHARS : 0);
    for (const part of parts) {
      chunks.push(
        Object.freeze({
          chunkId: chunkIdOf(doc.docId, preset, size, part.ordinal),
          docId: doc.docId,
          sourceId: doc.docId,
          title: doc.title,
          publisher: doc.publisher,
          publishedAt: doc.publishedAt,
          scope: doc.scope,
          isFictional: true,
          supersedes: doc.supersedes,
          validity: doc.validity,
          ordinal: part.ordinal,
          text: part.text,
          chars: part.chars,
          paragraphs: Object.freeze([...part.paragraphs]),
          crossesParagraph: part.crossesParagraph,
          truncated: part.truncated === true,
          locator: part.locator,
        })
      );
    }
  }

  const lengths = chunks.map((c) => c.chars);
  const stats = {
    docs: docs.length,
    chunkCount: chunks.length,
    minChars: lengths.length ? Math.min(...lengths) : 0,
    maxChars: lengths.length ? Math.max(...lengths) : 0,
    avgChars: lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : 0,
    crossBoundary: chunks.filter((c) => c.crossesParagraph).length,
    truncated: chunks.filter((c) => c.truncated).length,
    /** 与执行台一致：栏目是发布标签，不参与切分 */
    note:
      preset === 'paragraph'
        ? '段落边界 = 语义边界：长度参差，但每段内容完整。'
        : '固定长度切分只看字符数：可能跨段、断句，甚至把更正说明切到两个片段里。',
  };

  return { config: { preset, size }, chunks, stats };
}

/** 片段 ID 列表（测试与自检脚本用：换预设必须换 ID） */
export function chunkIdsOf(options) {
  return chunkDocuments(options).chunks.map((c) => c.chunkId);
}
