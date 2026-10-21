/**
 * src/research-packs/mission-001-mini/notices.js
 * ------------------------------------------------------------------
 * M0.3 本地教学研究样本 — 虚构大学的校园公告语料（**全部为虚构数据**）。
 *
 * 诚实边界：
 *   · 这里没有任何真实学校的公告、时间或联系人，isFictional 一律为 true；
 *   · M0.3 不做正式的来源冲突核验：supersedes / citation / validity 只为
 *     M0.4 预留结构，本阶段不据此判断任何一条资料「已被更正」；
 *   · 数据是仓库内可读的本地文件，不从网络下载，也不写入后端数据库。
 *
 * 字段说明：
 *   sourceId   稳定资料标识（M0.4 的引用溯源将复用它）
 *   chunkId    默认读取的片段标识（单片段资料）
 *   chunkIds   summary 片段 + 正文片段，供 readMode=full_text 定位
 *   scope      检索标签：all_notices 覆盖全部；campus_events 只覆盖活动类
 *   summary    预先定义的摘要：readMode=summary 只能拿到它，拿不到全文
 *   body       正文段落：只有 readMode=full_text 才会全部返回
 * ------------------------------------------------------------------
 */

/** 语料包版本：事件里记录它，保证「同一数据版本 → 同一事件轨迹」 */
export const CORPUS_VERSION = 'mission-001-mini@1';

/** 检索标签：与 M0.2 的 searchScope 取值一一对应（不是另建一套开关） */
export const SEARCH_SCOPES = Object.freeze({
  all_notices: { id: 'all_notices', cn: '全部公告', matches: () => true },
  campus_events: { id: 'campus_events', cn: '校园活动', matches: (n) => n.scope === 'campus_events' },
});

/**
 * 5 条虚构公告：3 条活动类 + 2 条事务类。
 * 这样 searchScope 与 maxResults 的组合能产生**可检查的真实差异**：
 *   all_notices   → 5 条候选；campus_events → 3 条候选
 *   maxResults=3  → 截断为 3 条（total 5，truncated true）；maxResults=5 → 3 条全返回
 */
export const NOTICES = Object.freeze([
  Object.freeze({
    sourceId: 'NTC-1001',
    chunkId: 'NTC-1001#summary',
    chunkIds: Object.freeze(['NTC-1001#summary', 'NTC-1001#body-1', 'NTC-1001#body-2']),
    title: '「校园创客分享会」报名开启',
    scope: 'campus_events',
    tags: Object.freeze(['campus_events', 'workshop', '报名']),
    publishedAt: '2026-10-06',
    publisher: '虚构大学 · 学生创新中心',
    isFictional: true,
    summary:
      '学生创新中心将于 10 月 20 日 19:00 在学生活动中心 B201 举办校园创客分享会，分享三个学生项目从想法到原型的经过，报名截止 10 月 18 日 17:00。',
    body: Object.freeze([
      '学生创新中心将于 10 月 20 日 19:00 至 21:00，在学生活动中心 B201 举办本学期第一场校园创客分享会。活动面向全校学生开放，无需专业背景。',
      '本场分享会安排三个学生项目：宿舍智能用电提醒、校园二手书交换看板、无障碍路线查询原型。每个项目 20 分钟，包含一次现场提问环节。',
      '报名方式：在创新中心工作日窗口登记，或通过院系学生联络人报名，截止时间为 10 月 18 日 17:00。场地座位有限，按报名先后安排；如报名人数超出场地容量，将在活动前通过院系通知顺延安排。',
    ]),
    /* ---- M0.4 预留字段（本阶段不参与任何判断） ---- */
    supersedes: null,
    supersededBy: null,
    citation: null,
    validity: 'unverified',
  }),

  Object.freeze({
    sourceId: 'NTC-1002',
    chunkId: 'NTC-1002#summary',
    chunkIds: Object.freeze(['NTC-1002#summary', 'NTC-1002#body-1', 'NTC-1002#body-2']),
    title: '「社团招新咨询周」场地与时间安排',
    scope: 'campus_events',
    tags: Object.freeze(['campus_events', '社团', '咨询']),
    publishedAt: '2026-10-02',
    publisher: '虚构大学 · 社团联合会',
    isFictional: true,
    summary:
      '社团招新咨询周于 10 月 12 日至 10 月 18 日在综合楼一层中庭设咨询台，每日 11:30–13:30 与 16:30–18:00 两个时段，超过 40 个学生社团轮流值班。',
    body: Object.freeze([
      '社团联合会组织的招新咨询周定于 10 月 12 日至 10 月 18 日，在综合楼一层中庭设置统一咨询台，共 42 个学生社团轮流值班。',
      '咨询台每日开放两个时段：11:30–13:30 与 16:30–18:00。每个社团至少安排一个时段，具体值班表张贴在中庭入口公告板。',
      '现场只做咨询与登记，不收取任何费用，也不办理入社手续。各社团的正式招新由社团自行安排，请以社团后续通知为准。',
    ]),
    supersedes: null,
    supersededBy: null,
    citation: null,
    validity: 'unverified',
  }),

  Object.freeze({
    sourceId: 'NTC-1003',
    chunkId: 'NTC-1003#summary',
    chunkIds: Object.freeze(['NTC-1003#summary', 'NTC-1003#body-1']),
    title: '「实验室安全培训」第三期开放报名',
    scope: 'campus_events',
    tags: Object.freeze(['campus_events', '培训', '安全']),
    publishedAt: '2026-09-30',
    publisher: '虚构大学 · 实验室管理处',
    isFictional: true,
    summary:
      '实验室管理处第三期安全培训于 10 月 9 日 14:00 在实训楼 302 举行，面向需进入实验场所的学生，共 60 个名额，需提前完成线上自测。',
    body: Object.freeze([
      '实验室管理处将于 10 月 9 日 14:00 至 16:00 在实训楼 302 举办第三期实验室安全培训，主讲内容包括用电安全、危险品存放与应急处置流程。',
      '本期共 60 个名额，面向需要进入实验场所开展课程或项目的学生。报名前需完成线上安全自测，自测未通过者可参加下一期。',
    ]),
    supersedes: null,
    supersededBy: null,
    citation: null,
    validity: 'unverified',
  }),

  Object.freeze({
    sourceId: 'NTC-1004',
    chunkId: 'NTC-1004#summary',
    chunkIds: Object.freeze(['NTC-1004#summary', 'NTC-1004#body-1']),
    title: '图书馆十月开馆时间调整',
    scope: 'library_notice',
    tags: Object.freeze(['library_notice', '开馆时间']),
    publishedAt: '2026-10-04',
    publisher: '虚构大学 · 图书馆',
    isFictional: true,
    summary:
      '图书馆十月起工作日开馆时间调整为 07:30–22:30，周末为 09:00–21:00；自助借还机与自习区不单独延长开放时间。',
    body: Object.freeze([
      '图书馆自十月起调整开馆时间：工作日 07:30–22:30，周末 09:00–21:00。法定节假日安排另行通知。',
      '自助借还机与自习区随馆舍同步开放，不单独延长时间。闭馆前 20 分钟停止借还，请读者提前安排。',
    ]),
    supersedes: null,
    supersededBy: null,
    citation: null,
    validity: 'unverified',
  }),

  Object.freeze({
    sourceId: 'NTC-1005',
    chunkId: 'NTC-1005#summary',
    chunkIds: Object.freeze(['NTC-1005#summary', 'NTC-1005#body-1']),
    title: '校园卡系统维护窗口公告',
    scope: 'service_notice',
    tags: Object.freeze(['service_notice', '维护']),
    publishedAt: '2026-09-26',
    publisher: '虚构大学 · 信息化办公室',
    isFictional: true,
    summary:
      '校园卡系统将于 10 月 11 日 00:30–04:30 停机维护，期间食堂刷卡、门禁与自助充值暂停，维护后如余额异常可在服务窗口登记。',
    body: Object.freeze([
      '校园卡系统计划于 10 月 11 日 00:30 至 04:30 进行停机维护，期间食堂刷卡、门禁认证、自助充值与线上查询服务暂停。',
      '维护完成后如出现余额或消费记录异常，可携带校园卡到信息化办公室服务窗口登记，工作人员会按维护日志核对处理。',
    ]),
    supersedes: null,
    supersededBy: null,
    citation: null,
    validity: 'unverified',
  }),
]);

/** 稳定排序：发布日期新的在前，同日期按 sourceId 升序，保证输出可复现 */
export function sortNotices(list) {
  return [...list].sort((a, b) => {
    if (a.publishedAt !== b.publishedAt) return a.publishedAt < b.publishedAt ? 1 : -1;
    return a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0;
  });
}

export function getNotice(sourceId) {
  return NOTICES.find((n) => n.sourceId === sourceId) || null;
}
