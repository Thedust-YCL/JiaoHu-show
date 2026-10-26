/**
 * src/features/laboratory/runtime/task.js
 * ------------------------------------------------------------------
 * Runtime Lab 的共享任务定义（M1.3 D05 / §6）。
 *
 * 硬约束（验收 A17）：Workflow 与 Agent Loop 两种模式必须使用
 * **同一份资料、同一组工具、同一套权限边界**。因此任务、语料、
 * 工具定义、权限规则全部集中在这里，任何模式都不能私藏一套数据。
 * ------------------------------------------------------------------
 */
import { LAB_DOCS, getLabDoc } from '../knowledge/corpus.js';

export const RUNTIME_TASK = Object.freeze({
  taskId: 'campus-consolidation',
  title: '校园活动公告整合 · 日期核验',
  goal: '判断「秋季校园招聘会」的具体日期，并在证据冲突时如实标注。',
  /** 两种模式共用的终止与重试上限 */
  limits: Object.freeze({ maxSteps: 6, maxRetries: 2 }),
  tools: Object.freeze([
    Object.freeze({
      id: 'announcement_search',
      cn: '检索公告',
      input: '关键词',
      output: '命中的公告 ID 列表',
      sideEffect: '只读',
    }),
    Object.freeze({
      id: 'document_reader',
      cn: '读取公告',
      input: '公告 ID',
      output: '标题 + 片段文本',
      sideEffect: '只读',
    }),
  ]),
  permissions: Object.freeze({
    readPublicNotices: true,
    readPrivateRecords: false,
    writeAnything: false,
    note: '两种模式共用：可读公开公告，不可读私有评议记录，不可写任何文件。',
  }),
  /**
   * 可选查询：三条路径分别对应「成功 / 冲突 / 无证据」。
   * `anchor` 是该查询抽取事件日期时使用的锚点词——引擎读文档时按它取句子，
   * 不允许在引擎里写死某一个查询的词（否则换个查询就抽不到日期）。
   */
  queries: Object.freeze([
    Object.freeze({
      id: 'career-fair',
      cn: '「招聘会」相关公告',
      keyword: '招聘会',
      anchor: '招聘会',
      expect: '命中两份日期不一致的公告（NTC-1008 / NTC-1009）：结论应为未决。',
    }),
    Object.freeze({
      id: 'maker-share',
      cn: '「创客分享会」相关公告',
      keyword: '创客',
      anchor: '创客',
      expect: '只命中一份公告（NTC-1001）：结论应为「有证据支撑」，用来对照成功路径。',
    }),
    Object.freeze({
      id: 'no-such-event',
      cn: '「毕业典礼」相关公告',
      keyword: '毕业典礼',
      anchor: '毕业典礼',
      expect: '本地语料里没有任何毕业典礼公告：两种模式都必须如实报告「无证据」。',
    }),
  ]),
  docs: LAB_DOCS,
  getDoc: getLabDoc,
});

export function queryById(queryId) {
  return RUNTIME_TASK.queries.find((q) => q.id === queryId) || RUNTIME_TASK.queries[0];
}

/** 检索规则：标题/摘要/正文的**字面**包含关系（不用相似度，保证可复现） */
export function searchDocs(keyword) {
  if (!keyword) return [];
  return RUNTIME_TASK.docs
    .filter((doc) => {
      const haystack = [doc.title, ...doc.paragraphs].join('\n');
      return haystack.includes(keyword);
    })
    .sort((a, b) => (a.publishedAt === b.publishedAt ? (a.docId < b.docId ? -1 : 1) : a.publishedAt < b.publishedAt ? 1 : -1))
    .map((doc) => doc.docId);
}

const DATE_PATTERN = /(\d{1,2})\s*月\s*(\d{1,2})\s*日/g;
const DATE_CUES = Object.freeze(['定于', '举行', '举办', '调整至', '截止', '开始']);

/** 从文档里抽取「事件日期」：句子需同时含锚点与线索词（与 Lab 04 同一规则） */
export function eventDateOf(docId, anchorTerm) {
  const doc = getLabDoc(docId);
  if (!doc) return null;
  for (const text of doc.paragraphs) {
    const sentences = String(text)
      .split(/(?<=[。！？；])/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const sentence of sentences) {
      if (!sentence.includes(anchorTerm)) continue;
      if (!DATE_CUES.some((cue) => sentence.includes(cue))) continue;
      DATE_PATTERN.lastIndex = 0;
      const match = DATE_PATTERN.exec(sentence);
      if (match) return { value: `${match[1]} 月 ${match[2]} 日`, sentence };
    }
  }
  return null;
}

/** 任务状态（两种模式共用同一份初始状态结构） */
export function initialState() {
  return {
    evidence: [],
    datePerDoc: {},
    conflict: false,
    unresolved: [],
    retries: 0,
    finished: false,
    conclusion: null,
  };
}
