/**
 * src/features/laboratory/knowledge/corpus.js
 * ------------------------------------------------------------------
 * Knowledge Lab 的本地语料与演示数据（M1.3 D04 / §5）。
 *
 * 三条硬约束：
 *   · 语料**直接复用** M0.4 的虚构研究包 mission-001（isFictional: true），
 *     不新建第二套资料，也不改写任何原文；sourceId / 段落内容与执行台一致；
 *   · 二维「向量」是**人工设定的演示坐标**（0–100 的示意投影），不是任何
 *     Embedding 模型的输出，也不用于训练或索引；页面必须显示这一声明；
 *   · 这里只有数据与纯函数，不触碰 DOM、localStorage 与网络。
 * ------------------------------------------------------------------
 */
import { CORPUS_VERSION, NOTICES } from '../../../research-packs/mission-001/notices.js';

export const LAB_CORPUS_META = Object.freeze({
  corpusId: 'mission-001',
  corpusVersion: CORPUS_VERSION,
  title: '虚构校园活动公告语料',
  note: '全部为虚构教学数据（isFictional: true）：没有真实学校、真实日期与真实个人信息。',
  /** 语料来源与执行台共用同一份冻结对象 */
  sharedWith: 'M0.4 执行台 / M1.3 Knowledge Lab',
});

/** 语料适配：把公告展开为「文档 + 段落」，供切分与定位使用 */
export const LAB_DOCS = Object.freeze(
  NOTICES.map((notice) =>
    Object.freeze({
      docId: notice.sourceId,
      title: notice.title,
      publisher: notice.publisher,
      publisherId: notice.publisherId,
      publishedAt: notice.publishedAt,
      scope: notice.scope,
      tags: notice.tags,
      isFictional: true,
      eventKey: notice.eventKey,
      eventDate: notice.eventDate,
      supersedes: notice.supersedes,
      validity: notice.validity,
      /** 段落 0 是摘要，正文段落依次编号：与执行台「摘要 / 正文」的划分一致 */
      paragraphs: Object.freeze([notice.summary, ...notice.body]),
    })
  )
);

const DOC_INDEX = new Map(LAB_DOCS.map((doc) => [doc.docId, doc]));

export function getLabDoc(docId) {
  return DOC_INDEX.get(docId) || null;
}

/** 语料整体字符数（只用于展示规模，不假称 token 数） */
export function corpusSize() {
  let chars = 0;
  let paragraphs = 0;
  for (const doc of LAB_DOCS) {
    for (const text of doc.paragraphs) {
      chars += text.length;
      paragraphs += 1;
    }
  }
  return { docs: LAB_DOCS.length, paragraphs, chars };
}

/* ==================================================================== *
 * 一、演示用二维坐标（人工设定，非模型输出）
 * ==================================================================== */

/**
 * 每个文档一个二维示意坐标。数值由人工按「主题相近程度」排版，
 * 目的只是让「距离近 ≈ 话题接近」这件事可视化。
 * 声明：这些数字不是任何 embedding 模型的计算结果。
 */
export const DEMO_DOC_COORDS = Object.freeze({
  'NTC-1001': Object.freeze([18, 62]),
  'NTC-1002': Object.freeze([12, 34]),
  'NTC-1003': Object.freeze([26, 86]),
  'NTC-1004': Object.freeze([62, 18]),
  'NTC-1005': Object.freeze([72, 30]),
  'NTC-1006': Object.freeze([44, 74]),
  'NTC-1007': Object.freeze([48, 82]),
  'NTC-1008': Object.freeze([80, 62]),
  'NTC-1009': Object.freeze([86, 70]),
});

/** 演示查询的二维坐标：与文档坐标同一套人工设定 */
export const DEMO_QUERY_COORDS = Object.freeze({
  'q-career-fair': Object.freeze([82, 66]),
  'q-open-day': Object.freeze([46, 78]),
  'q-maker-signup': Object.freeze([18, 62]),
  'q-library-hours': Object.freeze([62, 18]),
  'q-card-maintenance': Object.freeze([72, 30]),
});

export const DEMO_VECTOR_NOTE =
  '二维坐标由人工按主题相近程度设定，仅用于演示「距离近 ≈ 话题接近」；浏览器内没有任何 Embedding 模型，坐标不是模型输出，也不参与真实索引。';

/* ==================================================================== *
 * 二、实验问题（RAG 与检索共用）
 * ==================================================================== */

/**
 * 固定问题集：每条都写清「关键词模式怎么找」与「向量模式用哪个预计算查询坐标」。
 * `extract` 描述事实抽取规则（只用正则从**实际选中的片段文本**里取），
 * 不在数据里预埋结论，保证「资料不足」是算出来的而不是写死的。
 */
export const LAB_QUESTIONS = Object.freeze([
  Object.freeze({
    id: 'career-fair-date',
    text: '秋季校园招聘会哪天举办？',
    keywords: Object.freeze(['招聘会', '秋季']),
    anchors: Object.freeze(['招聘会']),
    demoVector: 'q-career-fair',
    factKind: 'date',
    anchorTerm: '招聘会',
    note: '语料里有两份招聘会公告给出不同日期，检索命中不等于答案唯一。',
  }),
  Object.freeze({
    id: 'open-day-date',
    text: '秋季校园开放日的活动日期是哪天？',
    keywords: Object.freeze(['开放日', '日期']),
    anchors: Object.freeze(['开放日']),
    demoVector: 'q-open-day',
    factKind: 'date',
    anchorTerm: '开放日',
    note: '更正公告把日期改到 10 月 20 日，但「更正关系」需要读到正文才能确认。',
  }),
  Object.freeze({
    id: 'maker-signup',
    text: '「校园创客分享会」怎么报名？',
    keywords: Object.freeze(['创客', '报名']),
    anchors: Object.freeze(['创客']),
    demoVector: 'q-maker-signup',
    factKind: 'quote',
    quoteAnchor: '报名',
    note: '单份公告即可支撑，适合观察「有证据」时的答案形态（只做原文摘录）。',
  }),
  Object.freeze({
    id: 'library-hours',
    text: '图书馆十月的开馆时间怎么安排？',
    keywords: Object.freeze(['图书馆', '开馆']),
    anchors: Object.freeze(['图书馆']),
    demoVector: 'q-library-hours',
    factKind: 'quote',
    quoteAnchor: '开馆',
    note: '与活动日期无关：用来观察「检索到了但事实类型不匹配」时只做原文摘录。',
  }),
  Object.freeze({
    id: 'graduation-venue',
    text: '今年毕业典礼在哪个场馆举行？',
    keywords: Object.freeze(['毕业典礼', '场馆']),
    anchors: Object.freeze(['毕业典礼']),
    demoVector: null,
    factKind: 'quote',
    quoteAnchor: '毕业典礼',
    note: '语料里没有任何毕业典礼公告：正确答案是「资料不足」，不得编造来源。',
  }),
]);

export function getLabQuestion(questionId) {
  return LAB_QUESTIONS.find((q) => q.id === questionId) || LAB_QUESTIONS[0];
}

/** 文档范围过滤：与执行台的「发布栏目」语义一致（栏目 ≠ 内容主题） */
export const LAB_SCOPES = Object.freeze([
  Object.freeze({ id: 'all_notices', cn: '全部公告', matches: () => true }),
  Object.freeze({ id: 'campus_events', cn: '仅校园活动栏目', matches: (doc) => doc.scope === 'campus_events' }),
]);

export function scopeById(scopeId) {
  return LAB_SCOPES.find((s) => s.id === scopeId) || LAB_SCOPES[0];
}

/** 按范围过滤文档（稳定顺序：发布日期新 → sourceId 升序） */
export function docsInScope(scopeId) {
  const scope = scopeById(scopeId);
  return LAB_DOCS.filter((doc) => scope.matches(doc)).sort((a, b) =>
    a.publishedAt === b.publishedAt ? (a.docId < b.docId ? -1 : 1) : a.publishedAt < b.publishedAt ? 1 : -1
  );
}
