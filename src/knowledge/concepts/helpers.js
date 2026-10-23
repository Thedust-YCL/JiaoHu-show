/**
 * src/knowledge/concepts/helpers.js
 * ------------------------------------------------------------------
 * 概念条目的唯一构造入口。
 *
 * 为什么需要它：
 *   · 36 个概念必须拥有**同一套字段与同一套默认值**，否则模板会到处判空；
 *   · 基础元数据（索引级，`outline` 也能有）与深度正文（`understand` /
 *     `inspect` / 示例 / 来源）在这里被明确分开，避免「有索引 = 已学完」；
 *   · 冻结后任何组件都无法在运行期篡改知识数据（知识图 ≠ 执行轨迹）。
 * ------------------------------------------------------------------
 */

/** 内容状态：唯一决定「能不能当正文读」的字段 */
export const CONTENT_STATUS = Object.freeze({
  outline: Object.freeze({
    id: 'outline',
    cn: '内容建设中',
    tone: 'muted',
    hasBody: false,
    note: '只有索引级元数据：能出现在目录、搜索与关系图索引中，但正文未撰写，不得算作已学完。',
  }),
  draft: Object.freeze({
    id: 'draft',
    cn: '草稿 · 未审校',
    tone: 'attention',
    hasBody: true,
    note: '正文已存在但未审校：界面必须显示草稿标记，不能当作最终说法引用。',
  }),
  reviewed: Object.freeze({
    id: 'reviewed',
    cn: '已审校',
    tone: 'signal',
    hasBody: true,
    note: '正文已按 PRD 技术边界逐条核对；实验入口仍以实验登记表为准。',
  }),
  published: Object.freeze({
    id: 'published',
    cn: '已发布 · 含实验',
    tone: 'success',
    hasBody: true,
    note: '正文与可操作实验同时可用：当前仅 Tool Calling 具备完整四步学习路径。',
  }),
});

export const CONTENT_STATUS_ORDER = Object.freeze(['outline', 'draft', 'reviewed', 'published']);

/** 内容状态是否允许呈现正文（UNDERSTAND / INSPECT） */
export function hasBody(contentStatus) {
  return CONTENT_STATUS[contentStatus]?.hasBody === true;
}

/** 概念是否有可操作实验入口：必须同时满足「状态已发布」与「实验真实可用」 */
export function canRunExperiment(contentStatus) {
  return contentStatus === 'published';
}

const FROZEN_ARRAY_FIELDS = ['aliases', 'understand', 'inspect', 'related'];

/**
 * 定义并冻结一个概念条目。
 * 只做结构调整与默认值补齐，不做任何内容生成，避免「凭空长出来的正文」。
 */
export function defineConcept(record) {
  const contentStatus = record.contentStatus || 'outline';
  if (!CONTENT_STATUS[contentStatus]) throw new Error(`未知内容状态：${contentStatus}（${record.id}）`);

  const concept = {
    /* ---------- 基础元数据（outline 也必须有） ---------- */
    id: record.id,
    chapterId: record.chapterId,
    order: record.order,
    name: record.name,
    cn: record.cn,
    title: Object.freeze({ zh: record.cn, en: record.name }),
    tagline: record.tagline || '',
    aliases: Object.freeze([...(record.aliases || [])]),
    contentStatus,
    /** 索引级一句话说明：outline 概念也会有，但明确标记为草稿调用 */
    oneLiner: record.oneLiner || '',
    oneLinerStatus: record.oneLinerStatus || (contentStatus === 'outline' ? 'draft' : 'reviewed'),
    /** 计划交付阶段：未完成概念必须明确写出预计阶段，界面不许含糊 */
    plannedMilestone: record.plannedMilestone || null,

    /* ---------- 深度正文（可以缺省） ---------- */
    understand: Object.freeze([...(record.understand || [])]),
    inspect: Object.freeze([...(record.inspect || [])]),
    misconceptions: Object.freeze((record.misconceptions || []).map((item) => Object.freeze({ ...item }))),
    example: record.example ? Object.freeze({ isSimulated: true, ...record.example }) : null,
    /** 只有在实验登记表里真实可用时才允许填写 */
    experimentId: record.experimentId || null,
    sources: Object.freeze([...(record.sources || [])]),

    /* ---------- 导航与关系提示 ---------- */
    related: Object.freeze([...(record.related || [])]),
    nextSteps: record.nextSteps || '',
    /** 装配台落点：core / tools / none（沿用 M0.3 语义） */
    systemTarget: record.systemTarget || 'none',
    /** 星图坐标：只有拥有固定布局的节点才画在画布上 */
    graph: record.graph ? Object.freeze({ x: record.graph.x, y: record.graph.y }) : null,
    /** 本轮审校范围说明：让读者知道哪些段落是何时核对的 */
    reviewNote: record.reviewNote || null,
    /** 审校日期（YYYY-MM-DD）：与来源的 checkedAt 对应，便于交付文档逐条核对 */
    reviewedAt: record.reviewedAt || null,
  };

  for (const field of FROZEN_ARRAY_FIELDS) Object.freeze(concept[field]);
  return Object.freeze(concept);
}
