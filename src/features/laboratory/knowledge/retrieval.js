/**
 * src/features/laboratory/knowledge/retrieval.js
 * ------------------------------------------------------------------
 * Lab 04 · 检索（M1.3 D04 / §5.3–5.4，验收 A11 / A12）。
 *
 * 两条通道，一套排序：
 *   keyword      —— 关键词检索：对**片段文本**做字面匹配打分（中文按二元组、
 *                   英文/数字按词），分数完全由本地规则算出；
 *   vector-demo  —— 向量检索示意：只使用 corpus.js 里**人工设定的二维坐标**，
 *                   按「1 − 距离/最大距离」算相似度，并在结果里写清公式。
 *
 * 不允许的行为：
 *   · 把关键词匹配结果标成「语义检索」；
 *   · 为自由输入临时编造向量（没有预计算坐标就明确返回 unavailable）；
 *   · 随机数、随机抖动、按点击次数偏移分数。
 * ------------------------------------------------------------------
 */
import { DEMO_DOC_COORDS, DEMO_QUERY_COORDS, DEMO_VECTOR_NOTE, getLabQuestion } from './corpus.js';

export const RETRIEVAL_MODES = Object.freeze([
  Object.freeze({
    id: 'keyword',
    cn: '关键词检索',
    note: '字面匹配（中文二元组 + 英文/数字词）：可解释、可复现，但同义改写会漏。',
  }),
  Object.freeze({
    id: 'vector-demo',
    cn: '向量示意检索',
    note: '只用人工设定的二维坐标算距离：能跨字面差异，但相似 ≠ 正确，也不是真实模型。',
  }),
]);

export const DEFAULT_TOP_K = 5;
export const TOP_K_OPTIONS = Object.freeze([3, 5, 8]);

export function retrievalMode(modeId) {
  return RETRIEVAL_MODES.find((m) => m.id === modeId) || RETRIEVAL_MODES[0];
}

/* ==================================================================== *
 * 一、分词（只用于关键词检索）
 * ==================================================================== */

const CJK = /[\u3400-\u9fff]/;

/**
 * 极简分词：中文连续片段切成二元组（单字片段保留单字），
 * 拉丁字母与数字按连续串切词。这是演示用的确定性规则，不是分whitespace之外的完整分词器。
 */
export function tokenize(text) {
  const source = String(text || '').toLowerCase();
  const tokens = [];
  let buffer = '';
  let latin = '';

  const flushLatin = () => {
    if (latin) {
      tokens.push(latin);
      latin = '';
    }
  };
  const flushBuffer = () => {
    if (!buffer) return;
    if (buffer.length === 1) tokens.push(buffer);
    else for (let i = 0; i < buffer.length - 1; i += 1) tokens.push(buffer.slice(i, i + 2));
    buffer = '';
  };

  for (const ch of source) {
    if (CJK.test(ch)) {
      flushLatin();
      buffer += ch;
      continue;
    }
    if (/[a-z0-9]/.test(ch)) {
      flushBuffer();
      latin += ch;
      continue;
    }
    flushBuffer();
    flushLatin();
  }
  flushBuffer();
  flushLatin();
  return tokens;
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while (index <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, index);
    if (found < 0) break;
    count += 1;
    index = found + needle.length;
  }
  return count;
}

/** 查询 → 去重词项（保持首次出现顺序，便于稳定输出） */
export function queryTerms(question) {
  const raw = [question?.text || '', ...(question?.keywords || [])].join(' ');
  const seen = new Set();
  const out = [];
  for (const token of tokenize(raw)) {
    if (token.length === 0) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

/* ==================================================================== *
 * 二、关键词通道
 * ==================================================================== */

const FIELD_WEIGHT = Object.freeze({ text: 1, title: 2, tags: 1.5 });
const MAX_PER_TERM = 3;

function scoreChunk(chunk, terms) {
  const text = chunk.text.toLowerCase();
  const title = String(chunk.title || '').toLowerCase();
  const tags = (chunk.tags || []).join(' ').toLowerCase();
  const matched = [];
  let score = 0;

  for (const term of terms) {
    const inText = countOccurrences(text, term);
    const inTitle = countOccurrences(title, term);
    const inTags = countOccurrences(tags, term);
    if (!inText && !inTitle && !inTags) continue;
    const capped = Math.min(MAX_PER_TERM, inText);
    const contribution =
      capped * FIELD_WEIGHT.text + Math.min(2, inTitle) * FIELD_WEIGHT.title + Math.min(2, inTags) * FIELD_WEIGHT.tags;
    score += contribution;
    matched.push({ term, text: inText, title: inTitle, tags: inTags, contribution });
  }
  return { score: Number(score.toFixed(2)), matched };
}

/* ==================================================================== *
 * 三、向量示意通道
 * ==================================================================== */

const MAX_DISTANCE = Math.sqrt(2) * 100;

export function vectorSimilarity(queryCoord, docCoord) {
  const dx = queryCoord[0] - docCoord[0];
  const dy = queryCoord[1] - docCoord[1];
  const distance = Math.sqrt(dx * dx + dy * dy);
  return {
    distance: Number(distance.toFixed(2)),
    similarity: Number((1 - distance / MAX_DISTANCE).toFixed(4)),
  };
}

/* ==================================================================== *
 * 四、统一排序
 * ==================================================================== */

/**
 * 排序：分数降序 → 来源 ID 升序 → 片段序号升序。
 * 三重键保证同分时结果仍然稳定，重复运行完全一致。
 */
function sortCandidates(list) {
  return list.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.docId !== b.docId) return a.docId < b.docId ? -1 : 1;
    return a.ordinal - b.ordinal;
  });
}

function baseCandidate(chunk) {
  return {
    chunkId: chunk.chunkId,
    docId: chunk.docId,
    sourceId: chunk.sourceId,
    title: chunk.title,
    publishedAt: chunk.publishedAt,
    ordinal: chunk.ordinal,
    locator: chunk.locator,
    chars: chunk.chars,
    crossesParagraph: chunk.crossesParagraph,
    excerpt: chunk.text.length > 76 ? `${chunk.text.slice(0, 76)}…` : chunk.text,
  };
}

/**
 * 执行检索。
 * @param {{chunks:Array, questionId:string, mode:string, topK:number}} input
 * @returns {{mode:string, modeCn:string, available:boolean, note:string,
 *            candidates:Array, totalScored:number, formula:string|null}}
 */
export function retrieve({ chunks, questionId, mode = 'keyword', topK = DEFAULT_TOP_K }) {
  const question = getLabQuestion(questionId);
  const chunkList = Array.isArray(chunks) ? chunks : [];
  const limit = TOP_K_OPTIONS.includes(Number(topK)) ? Number(topK) : DEFAULT_TOP_K;

  if (retrievalMode(mode).id === 'vector-demo') {
    const queryCoord = question.demoVector ? DEMO_QUERY_COORDS[question.demoVector] : null;
    if (!queryCoord) {
      return {
        mode: 'vector-demo',
        modeCn: retrievalMode('vector-demo').cn,
        available: false,
        note: `问题「${question.text}」在本实验中**没有预计算查询坐标**。这里不会临时编造一个向量，因此向量通道不可用——这正是「简化演示」与「真实模型」的差别。`,
        candidates: [],
        totalScored: 0,
        formula: null,
      };
    }
    const scored = chunkList
      .filter((chunk) => DEMO_DOC_COORDS[chunk.docId])
      .map((chunk) => {
        const coord = DEMO_DOC_COORDS[chunk.docId];
        const { distance, similarity } = vectorSimilarity(queryCoord, coord);
        return {
          ...baseCandidate(chunk),
          score: similarity,
          coord,
          queryCoord,
          distance,
          matched: [],
          reason: `坐标 (${coord[0]}, ${coord[1]}) 与查询坐标 (${queryCoord[0]}, ${queryCoord[1]}) 的距离 ${distance}；相似度 = 1 − ${distance}/141.42 = ${similarity}`,
        };
      });
    const candidates = sortCandidates(scored).slice(0, limit);
    return {
      mode: 'vector-demo',
      modeCn: retrievalMode('vector-demo').cn,
      available: true,
      note: DEMO_VECTOR_NOTE,
      formula: '相似度 = 1 − 欧氏距离 / 最大可能距离（141.42 = √2 × 100）',
      candidates,
      totalScored: scored.length,
    };
  }

  const terms = queryTerms(question);
  const scored = [];
  for (const chunk of chunkList) {
    const { score, matched } = scoreChunk(chunk, terms);
    if (score <= 0) continue;
    scored.push({
      ...baseCandidate(chunk),
      score,
      matched,
      reason: matched.length
        ? matched
            .map((m) => `「${m.term}」正文 ${m.text} 次 / 标题 ${m.title} 次 / 标签 ${m.tags} 次（贡献 ${m.contribution}）`)
            .join('；')
        : '未命中任何查询词项',
    });
  }
  const candidates = sortCandidates(scored).slice(0, limit);

  return {
    mode: 'keyword',
    modeCn: retrievalMode('keyword').cn,
    available: true,
    note: '关键词通道只看字面：同一查询词项在正文计 1 分/次（最多 3 次）、标题 ×2、标签 ×1.5；同分按来源 ID 与片段序号升序，保证可复现。',
    formula: '得分 = Σ（正文命中×1 + 标题命中×2 + 标签命中×1.5）',
    candidates,
    totalScored: scored.length,
    terms,
  };
}
