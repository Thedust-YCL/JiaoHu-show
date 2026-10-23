/**
 * src/features/laboratory/token/fragments.js
 * ------------------------------------------------------------------
 * Lab 01（TOKEN / CONTEXT BUDGET）的**唯一原文来源**。
 *
 * 为什么把所有文本集中在这一份文件里：
 *   1. 页面展示的「原文」与「token 序列」必须来自完全相同的字符串，
 *      否则「所见即所测」就不成立；
 *   2. 构建期由 tools/tokens-build.mjs 读取本文件，用真实 BPE 分词器
 *      （gpt-tokenizer，cl100k_base / o200k_base）离线预计算，写出
 *      tokenTable.js；运行期**不包含**分词器本体，也不对任意输入伪称计数；
 *   3. 资料片段直接派生自 M0.4 的虚构研究语料（mission-001-mini），
 *      保证实验与全站是同一条「校园活动整合可行性研究」叙事，
 *      并且这些公告确实是虚构数据（isFictional: true）。
 *
 * 诚实边界：
 *   · 本实验只对这里列出的文本给出**真实** token 序列；
 *   · 不提供「任意文本输入 → 声称真实 token 数」的功能，因为那必须带
 *     真实分词器，而我们选择不为一次教学演示把 1MB 词表塞进首屏；
 *   · 预算上限是**教学示意**，不是任何真实模型的容量承诺。
 * ------------------------------------------------------------------
 */
import { NOTICES } from '../../../research-packs/mission-001-mini/notices.js';

/**
 * 分块来源（sample）：用户可切换的原文，覆盖中文 / 英文 / 混合三类，
 * 让「同一个字在不同语言、不同编码下 token 数不同」可以被直接观察到。
 */
export const TOKEN_SAMPLES = Object.freeze([
  Object.freeze({
    id: 'sample-zh-notice',
    label: '中文 · 校园活动公告',
    lang: 'zh',
    note: '典型中文公告句：中文常用 1 个 token 表示 1–2 个汉字，但绝不等于「一个字一个 token」。',
    text: '学生创新中心将于 10 月 20 日 19:00 在学生活动中心 B201 举办校园创客分享会，报名截止 10 月 18 日 17:00。',
  }),
  Object.freeze({
    id: 'sample-en-model',
    label: '英文 · 技术说明',
    lang: 'en',
    note: '英文按子词切分：长单词会被拆成词干与后缀，"tokenization" 很少是 1 个 token。',
    text: 'A tokenizer splits text into tokens. The same sentence may need more tokens in Chinese than in English, because the vocabulary was trained mostly on English text.',
  }),
  Object.freeze({
    id: 'sample-mixed-goal',
    label: '中英混合 · 研究目标',
    lang: 'mixed',
    note: '术语中英混写在真实研究任务里很常见：两种语言的切分规则会在同一句里交替生效。',
    text: '研究问题：校园创客分享会（Campus Maker Meetup）的报名截止时间与场地容量是否冲突？请标注证据来源。',
  }),
  Object.freeze({
    id: 'sample-zh-digits',
    label: '中文 · 日期与数字',
    lang: 'zh',
    note: '数字与标点经常被切成多个 token，所以「日期写得越长」不代表「信息越多」。',
    text: '2026年10月18日17:00｜学生活动中心 B201｜3 场分享｜每场 20 分钟｜座位 120 个',
  }),
  Object.freeze({
    id: 'sample-en-json',
    label: '英文 · 工具请求参数',
    lang: 'mixed',
    note: '结构化参数同样占预算：花括号、引号和字段名都会计入 token。',
    text: '{"tool":"announcement_search","arguments":{"scope":"campus_events","maxResults":3}}',
  }),
]);

/**
 * 固定系统指令：每次运行的「系统指令」占用都来自这一段，
 * 因此用户改预算时能清楚看到哪一项被压缩、哪一项被优先保留。
 */
export const SYSTEM_INSTRUCTIONS = Object.freeze({
  id: 'sys-instructions',
  label: '系统指令',
  kind: 'system',
  text: '你是 AGENT / ZERO 的研究助手。只依据本轮上下文中提供的资料作答；缺少资料时必须写明「未验证」，不得补充或推测具体日期、地点与联系方式。',
});

/**
 * 可用资料片段：直接取 M0.4 虚构语料的摘要与正文首段。
 * 每条都带 sourceId，界面上始终标注「虚构教学数据」。
 */
export const DOC_FRAGMENTS = Object.freeze(
  NOTICES.slice(0, 3).flatMap((notice) => [
    Object.freeze({
      id: `${notice.sourceId}#summary`,
      sourceId: notice.sourceId,
      label: `${notice.sourceId} 摘要`,
      kind: 'doc',
      text: notice.summary,
    }),
    Object.freeze({
      id: `${notice.sourceId}#body-1`,
      sourceId: notice.sourceId,
      label: `${notice.sourceId} 正文首段`,
      kind: 'doc',
      text: notice.body[0],
    }),
  ])
);

/** 全部需要预计算 token 的片段（构建期使用；顺序即表内顺序） */
export const ALL_FRAGMENTS = Object.freeze([SYSTEM_INSTRUCTIONS, ...TOKEN_SAMPLES, ...DOC_FRAGMENTS]);

/** 预算实验的默认选择：一段系统指令 + 一条中文样例 + 两条资料 */
export const DEFAULT_LAB_STATE = Object.freeze({
  sampleId: 'sample-zh-notice',
  encodingId: 'cl100k_base',
  windowTokens: 512,
  outputReserveTokens: 128,
  docIds: Object.freeze(['NTC-1001#summary', 'NTC-1001#body-1']),
});

/** 预算可选上限（教学示意值，不是任何真实模型的承诺） */
export const WINDOW_OPTIONS = Object.freeze([256, 384, 512, 1024, 2048]);
/** 输出预留可选值 */
export const OUTPUT_RESERVE_OPTIONS = Object.freeze([64, 128, 256]);
