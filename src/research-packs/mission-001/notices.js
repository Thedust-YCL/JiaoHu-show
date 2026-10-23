/**
 * src/research-packs/mission-001/notices.js
 * ------------------------------------------------------------------
 * M0.4 MISSION 001 正式小型研究包 —— 虚构大学的校园公告语料。
 *
 * **全部为虚构教学数据**（isFictional: true）。这里没有任何真实学校的
 * 公告、时间、联系人或真实研究结论。
 *
 * 与 M0.3 `mission-001-mini` 的关系（M0.4_TASK §4.3 / A34）：
 *   · 前 5 条资料**直接引用** mini 的冻结对象，sourceId / chunkId /
 *     summary / body 逐字不变；本文件只在其上挂接 M0.4 需要的事实元数据
 *     （eventKey / eventDate / claims），不重命名、不改写原文；
 *   · 新增 5 条资料，用于构造「明确更正链」与「不可消解冲突」；
 *   · 旧包文件继续保留，供 Tool Calling 知识页与 M0.3 回归用例使用。
 *
 * 字段约定：
 *   sourceId      稳定资料标识（引用溯源与历史 Run 都指向它）
 *   chunkId       默认摘要片段 ID
 *   chunks        可被引用的具体片段（summary + body-N），含原文
 *   scope         **发布栏目标签**（= 检索范围的匹配依据），不是内容主题。
 *                 这一点在 M0.4 里被显式用来教学：更正公告发在「事务通知」
 *                 栏目时，scope=campus_events 的检索根本看不到它。
 *   eventKey      同一事项的稳定身份；来自**资料元数据**，不是内部推断
 *   eventDate     该资料宣称的活动日期（ISO）
 *   supersedes    明确更正关系（元数据；需要 includeMetadata=true 才可见）
 *   claims        预设的、可检查的事实声明映射：只从**本次真正返回的文本**
 *                 中匹配 anchor 才成立，绝不从隐藏数据包直接读结论
 * ------------------------------------------------------------------
 */
import { NOTICES as MINI_NOTICES, SEARCH_SCOPES, sortNotices } from '../mission-001-mini/notices.js';

/** 数据包版本：改变语料内容必须同时提升它，旧 Run 的引用才不会漂移 */
export const CORPUS_VERSION = 'mission-001@2';

export { SEARCH_SCOPES };

/* ------------------------------------------------------------------ *
 * 片段构造：summary 片段 + 正文片段
 * ------------------------------------------------------------------ */

/**
 * 由 notice 的 summary / body 生成可引用片段。
 * mini 资料的 chunkIds 形如 `NTC-1001#summary` / `NTC-1001#body-1`，
 * 这里按同一规则生成，保证 ID 与 M0.3 完全一致。
 */
function buildChunks(notice) {
  const chunks = [
    Object.freeze({ chunkId: notice.chunkId, kind: 'summary', text: notice.summary }),
    ...notice.body.map((text, i) => Object.freeze({ chunkId: `${notice.sourceId}#body-${i + 1}`, kind: 'body', text })),
  ];
  return Object.freeze(chunks);
}

/**
 * 事实声明映射（claim spec）。
 * `anchor` 必须真实出现在对应片段里；抽取器只在**本次可见文本**中匹配它。
 * `scope` 限定允许从哪一类片段取得：'body' 表示必须读到正文。
 */
function claims(list) {
  return Object.freeze(list.map((c) => Object.freeze({ scope: 'any', ...c })));
}

/* ------------------------------------------------------------------ *
 * 前 5 条：M0.3 既有资料 + M0.4 事实元数据（原文一字不改）
 * ------------------------------------------------------------------ */

const MINI_META = Object.freeze({
  'NTC-1001': Object.freeze({
    publisherId: 'pub-student-innovation',
    eventKey: 'evt-maker-share',
    eventDate: '2026-10-20',
    supersedes: Object.freeze([]),
    validity: 'active',
    claims: claims([{ predicate: 'event_date', value: '2026-10-20', anchor: '10 月 20 日' }]),
  }),
  'NTC-1002': Object.freeze({
    publisherId: 'pub-club-union',
    eventKey: null,
    eventDate: null,
    supersedes: Object.freeze([]),
    validity: 'active',
    claims: claims([{ predicate: 'key_fact', value: '咨询周 10 月 12–18 日在综合楼中庭设咨询台', anchor: '社团招新咨询周' }]),
  }),
  'NTC-1003': Object.freeze({
    publisherId: 'pub-lab-office',
    eventKey: null,
    eventDate: null,
    supersedes: Object.freeze([]),
    validity: 'active',
    claims: claims([{ predicate: 'key_fact', value: '第三期安全培训 10 月 9 日 14:00 · 实训楼 302', anchor: '第三期安全培训' }]),
  }),
  'NTC-1004': Object.freeze({
    publisherId: 'pub-library',
    eventKey: null,
    eventDate: null,
    supersedes: Object.freeze([]),
    validity: 'active',
    claims: claims([{ predicate: 'key_fact', value: '图书馆十月起调整工作日与周末开馆时间', anchor: '开馆时间调整' }]),
  }),
  'NTC-1005': Object.freeze({
    publisherId: 'pub-cio',
    eventKey: null,
    eventDate: null,
    supersedes: Object.freeze([]),
    validity: 'active',
    claims: claims([{ predicate: 'key_fact', value: '校园卡系统 10 月 11 日 00:30–04:30 停机维护', anchor: '停机维护' }]),
  }),
});

export const PUBLISHERS = Object.freeze({
  'pub-student-innovation': '虚构大学 · 学生创新中心',
  'pub-club-union': '虚构大学 · 社团联合会',
  'pub-lab-office': '虚构大学 · 实验室管理处',
  'pub-library': '虚构大学 · 图书馆',
  'pub-cio': '虚构大学 · 信息化办公室',
  'pub-student-affairs': '虚构大学 · 学生事务中心',
  'pub-career-center': '虚构大学 · 学生就业指导中心',
  'pub-cs-office': '虚构大学 · 计算机学院学生工作办公室',
});

const EXTENDED_MINI = MINI_NOTICES.map((notice) => {
  const meta = MINI_META[notice.sourceId];
  return Object.freeze({
    ...notice,
    publisherId: meta.publisherId,
    eventKey: meta.eventKey,
    eventDate: meta.eventDate,
    supersedes: meta.supersedes,
    validity: meta.validity,
    claims: meta.claims,
    chunks: buildChunks(notice),
  });
});

/* ------------------------------------------------------------------ *
 * 新增 5 条：更正链 + 未决冲突
 * ------------------------------------------------------------------ */

const NEW_NOTICES = [
  Object.freeze({
    sourceId: 'NTC-1006',
    chunkId: 'NTC-1006#summary',
    chunkIds: Object.freeze(['NTC-1006#summary', 'NTC-1006#body-1', 'NTC-1006#body-2', 'NTC-1006#body-3']),
    title: '秋季校园开放日安排通知',
    scope: 'campus_events',
    tags: Object.freeze(['campus_events', '开放日', '原公告']),
    publishedAt: '2026-10-12',
    publisher: PUBLISHERS['pub-student-affairs'],
    publisherId: 'pub-student-affairs',
    isFictional: true,
    summary:
      '学生事务中心将于 10 月 18 日 09:00–16:00 举办秋季校园开放日，开放实验楼 A 座三层实验室、图书馆特藏室与三个学生创新项目展位，校内师生凭校园卡进入，无需报名。',
    body: Object.freeze([
      '学生事务中心定于 10 月 18 日（星期六）09:00 至 16:00 举办秋季校园开放日。当天开放实验楼 A 座三层实验室、图书馆特藏室与三个学生创新项目展位。',
      '校内师生凭校园卡进入，受邀访客需在东门入口登记。开放日当天部分道路临时管制，校车按假日时刻表运行。',
      '如遇极端天气，活动安排将在学生事务中心通知栏更新。本通知自发布之日起执行。',
    ]),
    eventKey: 'evt-open-campus',
    eventDate: '2026-10-18',
    supersedes: Object.freeze([]),
    validity: 'active',
    claims: claims([{ predicate: 'event_date', value: '2026-10-18', anchor: '10 月 18 日' }]),
  }),

  Object.freeze({
    sourceId: 'NTC-1007',
    /* 更正公告发布在「事务通知」栏目：scope 是发布栏目，不等于内容主题。
       scope=campus_events 的检索因此看不到它 —— 这正是 M0.4 要教的边界。 */
    scope: 'service_notice',
    chunkId: 'NTC-1007#summary',
    chunkIds: Object.freeze(['NTC-1007#summary', 'NTC-1007#body-1', 'NTC-1007#body-2', 'NTC-1007#body-3']),
    title: '关于秋季校园开放日活动日期更正的公告',
    tags: Object.freeze(['service_notice', '开放日', '更正']),
    publishedAt: '2026-10-13',
    publisher: PUBLISHERS['pub-student-affairs'],
    publisherId: 'pub-student-affairs',
    isFictional: true,
    /* 摘要里出现了新日期，但**没有**「更正」字样，也没有指向原公告：
       只读摘要时只能得到一条有限线索，不能据此宣布更正已核验。 */
    summary: '受场地检修影响，秋季校园开放日的活动时间调整至 10 月 20 日，开放范围与地点不变，请以本公告为准。',
    body: Object.freeze([
      '《秋季校园开放日安排通知》于 2026 年 10 月 12 日发布，其中活动日期为 10 月 18 日。现对该日期予以更正：受实验楼 A 座场地检修影响，秋季校园开放日调整至 10 月 20 日（星期二）09:00 至 16:00 举行。',
      '除日期外，开放范围、地点与入校方式不变：开放实验楼 A 座三层实验室、图书馆特藏室与三个学生创新项目展位，校内师生凭校园卡进入。',
      '已报名参与开放日志愿服务的同学按调整后的日期集合，学生事务中心将另行通知集合时间。',
    ]),
    eventKey: 'evt-open-campus',
    eventDate: '2026-10-20',
    supersedes: Object.freeze(['NTC-1006']),
    validity: 'active',
    claims: claims([
      { predicate: 'event_date', value: '2026-10-20', anchor: '10 月 20 日' },
      /* 必须读到正文才会出现：这是「正文明确说明更正」的可检查依据 */
      { predicate: 'revision_notice', value: 'explicit', anchor: '予以更正', scope: 'body' },
      { predicate: 'revision_target', value: 'NTC-1006', anchor: '《秋季校园开放日安排通知》', scope: 'body' },
    ]),
  }),

  Object.freeze({
    sourceId: 'NTC-1008',
    chunkId: 'NTC-1008#summary',
    chunkIds: Object.freeze(['NTC-1008#summary', 'NTC-1008#body-1', 'NTC-1008#body-2']),
    title: '秋季校园招聘会公告',
    scope: 'campus_events',
    tags: Object.freeze(['campus_events', '招聘会', '就业']),
    publishedAt: '2026-10-08',
    publisher: PUBLISHERS['pub-career-center'],
    publisherId: 'pub-career-center',
    isFictional: true,
    summary: '学生就业指导中心将于 10 月 24 日 13:30–17:00 在体育馆举办秋季校园招聘会，预计 68 家单位参会，面向 2027 届毕业生开放。',
    body: Object.freeze([
      '学生就业指导中心定于 10 月 24 日 13:30 至 17:00 在体育馆举办秋季校园招聘会，预计 68 家用人单位参会，覆盖制造、信息技术与公共服务等行业。',
      '本次招聘会面向 2027 届毕业生开放，请携带学生证与纸质简历入场。现场设有简历诊断与简历打印服务。',
    ]),
    eventKey: 'evt-career-fair',
    eventDate: '2026-10-24',
    supersedes: Object.freeze([]),
    validity: 'active',
    claims: claims([{ predicate: 'event_date', value: '2026-10-24', anchor: '10 月 24 日' }]),
  }),

  Object.freeze({
    sourceId: 'NTC-1009',
    chunkId: 'NTC-1009#summary',
    chunkIds: Object.freeze(['NTC-1009#summary', 'NTC-1009#body-1']),
    title: '转发：秋季校园招聘会时间提示',
    scope: 'campus_events',
    tags: Object.freeze(['campus_events', '招聘会', '转发']),
    publishedAt: '2026-10-09',
    publisher: PUBLISHERS['pub-cs-office'],
    publisherId: 'pub-cs-office',
    isFictional: true,
    summary: '计算机学院学生工作办公室转发的秋季校园招聘会信息显示，招聘会定于 10 月 26 日 13:30 在体育馆举行，请同学提前准备简历。',
    body: Object.freeze([
      '计算机学院学生工作办公室在此转发秋季校园招聘会信息：招聘会定于 10 月 26 日 13:30 在体育馆举行，请同学提前准备纸质简历。',
    ]),
    /* 与 NTC-1008 共享同一事项身份，但没有 supersedes 关系：
       引擎必须保留「未核实」，不能靠日期先后擅自裁决。 */
    eventKey: 'evt-career-fair',
    eventDate: '2026-10-26',
    supersedes: Object.freeze([]),
    validity: 'unknown',
    claims: claims([{ predicate: 'event_date', value: '2026-10-26', anchor: '10 月 26 日' }]),
  }),
];

/**
 * 统一补全可引用片段：新增资料没有手写 chunks，这里按同一规则派生，
 * 保证「每份可引用资料都有明确片段 ID」。
 */
function withChunks(notice) {
  if (Array.isArray(notice.chunks) && notice.chunks.length > 0) return notice;
  return Object.freeze({ ...notice, chunks: buildChunks(notice) });
}

/** 虚构教学资料：5 条保留 M0.3 稳定 ID，4 条为 M0.4 新增 */
export const NOTICES = Object.freeze([...EXTENDED_MINI, ...NEW_NOTICES].map(withChunks));

/** 稳定排序：发布日期新的在前，同日期按 sourceId 升序（沿用 M0.3 规则） */
export { sortNotices };

export function getNotice(sourceId) {
  return NOTICES.find((n) => n.sourceId === sourceId) || null;
}

export function noticesForScope(scopeId) {
  const scope = SEARCH_SCOPES[scopeId];
  if (!scope) return [];
  return sortNotices(NOTICES.filter((n) => scope.matches(n)));
}

