/**
 * src/simulation/events/schema.js
 * ------------------------------------------------------------------
 * M0.3 事件模型 + M0.4 研究闭环增量：阶段、类型、状态、参与者、结局、
 * 运行策略与故障选项。
 *
 * 这里是**唯一**的事件语义定义处：模拟引擎、执行图、时间轴、Inspector
 * 与持久化都引用它，避免出现第二套互相矛盾的执行事件模型。
 *
 * 事件 ID 稳定规则：`${runId}#e${序号}`，不依赖 Date.now() / Math.random()。
 * ------------------------------------------------------------------
 */

/** 运行记录 schema 版本：2 = 含证据链与结构化报告（M0.4） */
export const SIMULATION_SCHEMA_VERSION = 2;

/** 仍然可以被读取（但不能被重新生成）的历史版本 */
export const LEGACY_SCHEMA_VERSIONS = Object.freeze([1]);

/** 事件阶段：M0.4 增加 REPORT（报告装配），其余沿用 M0.3 */
export const PHASES = Object.freeze(['VALIDATION', 'PLAN', 'SEARCH', 'READ', 'EVIDENCE', 'REPORT', 'END']);

export const PHASE_META = Object.freeze({
  VALIDATION: { en: 'VALIDATION', cn: '校验', desc: '读取已确认配置，判断工具是否可用' },
  PLAN: { en: 'PLAN', cn: '规划', desc: '本阶段写死的简化步骤，不是真实模型推理' },
  SEARCH: { en: 'SEARCH', cn: '检索', desc: '请求检索工具在本地语料中查找条目' },
  READ: { en: 'READ', cn: '读取', desc: '请求读取工具打开命中的条目' },
  EVIDENCE: { en: 'EVIDENCE', cn: '证据', desc: '从可见文本抽取声明、识别冲突并核验更正关系' },
  REPORT: { en: 'REPORT', cn: '报告', desc: '由本次 Run 的结构化证据按模板装配报告' },
  END: { en: 'END', cn: '结束', desc: '本次运行的结局与产物说明' },
});

/** 事件状态 */
export const STATUSES = Object.freeze(['started', 'success', 'blocked', 'error', 'info', 'unresolved', 'skipped']);

export const STATUS_META = Object.freeze({
  started: { en: 'started', cn: '已发起', tone: 'signal' },
  success: { en: 'success', cn: '成功', tone: 'success' },
  blocked: { en: 'blocked', cn: '被阻断', tone: 'attention' },
  error: { en: 'error', cn: '出错', tone: 'error' },
  info: { en: 'info', cn: '记录', tone: 'muted' },
  unresolved: { en: 'unresolved', cn: '未决', tone: 'attention' },
  skipped: { en: 'skipped', cn: '已跳过', tone: 'muted' },
});

/** 参与者：系统、模型核心（仅指提出请求）、两个本地模拟工具、证据规则内核、报告装配器 */
export const ACTORS = Object.freeze(['system', 'model_core', 'announcement_search', 'document_reader', 'evidence_kernel', 'report_composer']);

export const ACTOR_META = Object.freeze({
  system: { en: 'system', cn: '运行环境' },
  model_core: { en: 'model_core', cn: '模型核心' },
  announcement_search: { en: 'announcement_search', cn: '公告检索（本地模拟工具）' },
  document_reader: { en: 'document_reader', cn: '文档读取（本地模拟工具）' },
  evidence_kernel: { en: 'evidence_kernel', cn: '证据规则内核（本地确定性规则）' },
  report_composer: { en: 'report_composer', cn: '报告装配器（本地模板）' },
});

/** 事件类型：字符串常量集中定义，UI 只按类型分派，不看中文文案 */
export const EVENT_TYPES = Object.freeze({
  RUN_STARTED: 'run.started',
  CONFIG_VALIDATED: 'config.validated',
  TASK_PLAN: 'task.plan_created',
  VALIDATION_BLOCKED: 'validation.blocked',
  TOOL_CALL: 'tool.call',
  TOOL_RESULT: 'tool.result',
  TOOL_ERROR: 'tool.error',
  SEARCH_EMPTY: 'search.empty',
  EVIDENCE_SAMPLE: 'evidence.sample_collected',
  /* ---- M0.4 证据链与报告 ---- */
  EVIDENCE_CLAIMS: 'evidence.claims_extracted',
  EVIDENCE_CONFLICT: 'evidence.conflict_detected',
  EVIDENCE_REVISION_CONFIRMED: 'evidence.revision_confirmed',
  EVIDENCE_CONFLICT_UNRESOLVED: 'evidence.conflict_unresolved',
  EVIDENCE_INSUFFICIENT: 'evidence.insufficient_detail',
  EVIDENCE_METADATA_MISSING: 'evidence.metadata_missing',
  EVIDENCE_VERIFICATION_SKIPPED: 'evidence.verification_skipped',
  REPORT_GENERATED: 'report.generated',
  RUN_COMPLETED: 'run.completed',
});

export const EVENT_TYPE_META = Object.freeze({
  'run.started': { cn: '运行开始', tone: 'signal' },
  'config.validated': { cn: '配置校验', tone: 'signal' },
  'task.plan_created': { cn: '任务规划（固定演示步骤）', tone: 'muted' },
  'validation.blocked': { cn: '校验阻断', tone: 'attention' },
  'tool.call': { cn: '工具调用请求', tone: 'signal' },
  'tool.result': { cn: '工具返回结果', tone: 'success' },
  'tool.error': { cn: '工具执行失败', tone: 'error' },
  'search.empty': { cn: '检索无结果', tone: 'attention' },
  'evidence.sample_collected': { cn: '样本资料已取得', tone: 'success' },
  'evidence.claims_extracted': { cn: '可见事实声明已抽取', tone: 'signal' },
  'evidence.conflict_detected': { cn: '发现资料冲突', tone: 'attention' },
  'evidence.revision_confirmed': { cn: '更正关系核验成立', tone: 'success' },
  'evidence.conflict_unresolved': { cn: '冲突未决', tone: 'attention' },
  'evidence.insufficient_detail': { cn: '证据不足', tone: 'attention' },
  'evidence.metadata_missing': { cn: '缺少发布关系元数据', tone: 'attention' },
  'evidence.verification_skipped': { cn: '按策略跳过核验', tone: 'muted' },
  'report.generated': { cn: '报告已装配', tone: 'success' },
  'run.completed': { cn: '运行结束', tone: 'muted' },
});

/** 运行结局 */
export const OUTCOMES = Object.freeze(['sample_acquired', 'partial', 'blocked', 'error', 'research_complete', 'research_partial']);

export const OUTCOME_META = Object.freeze({
  sample_acquired: {
    en: 'sample_acquired',
    cn: '已取得样本资料',
    tone: 'success',
    note: '只代表拿到了本地样本片段，不代表资料真实性已被核验，也不代表已生成报告。',
  },
  partial: { en: 'partial', cn: '部分完成', tone: 'attention', note: '只完成了任务的一部分，缺失的步骤有明确原因。' },
  blocked: { en: 'blocked', cn: '被阻断', tone: 'attention', note: '运行条件不满足，任务没有真正开始检索或读取。' },
  error: { en: 'error', cn: '出错结束', tone: 'error', note: '本次运行遇到确定性故障，未伪造成功响应。' },
  research_complete: {
    en: 'research_complete',
    cn: '研究闭环完成',
    tone: 'success',
    note: '在本教学数据与模拟核验规则内完成了检索、证据检查与报告装配；不代表真实世界结论。',
  },
  research_partial: {
    en: 'research_partial',
    cn: '研究完成但证据不足',
    tone: 'attention',
    note: '已产出可追溯报告，但其中仍有未决冲突或证据不足的发现，报告不会把它们写成确定事实。',
  },
});

/** 故障注入：属于**本次运行设置**，不是模块的永久状态 */
export const FAULT_MODES = Object.freeze(['normal', 'search_timeout']);

export const FAULT_MODE_META = Object.freeze({
  normal: { en: 'normal', cn: '正常运行', desc: '不注入任何故障。' },
  search_timeout: {
    en: 'search_timeout',
    cn: '模拟检索超时',
    desc: '仅在本次运行注入一次确定性的检索超时；不会把模块写成永久 Invalid，也不会随机触发。',
  },
});

/**
 * 研究策略：属于**本次 Run 的运行选项**，不是第三个可装配工具，
 * 也不是 Search / Reader 的替代品（M0.4_TASK §6.1 / A48）。
 */
export const EVIDENCE_POLICIES = Object.freeze(['VERIFY_REVISIONS', 'COLLECT_ONLY']);

export const EVIDENCE_POLICY_META = Object.freeze({
  VERIFY_REVISIONS: {
    en: 'VERIFY_REVISIONS',
    cn: '核验更正关系',
    desc: '在满足全部必要条件时，允许把「旧公告已被明确更正」写入本次结论。',
  },
  COLLECT_ONLY: {
    en: 'COLLECT_ONLY',
    cn: '只收集证据',
    desc: '只收集并呈现冲突与来源，不核验更正关系，也不会宣布任何更正成立。',
  },
});


/** 事件 ID：稳定、可复现，与时间无关 */
export function makeEventId(runId, sequence) {
  return `${runId}#e${String(sequence).padStart(2, '0')}`;
}

/**
 * 规范化一条事件：补齐缺省字段并冻结。
 * 引擎只通过它生成事件，保证所有事件形状一致、可序列化、可断言。
 */
export function createEvent({
  runId,
  sequence,
  phase,
  type,
  status,
  actorId = 'system',
  toolId = null,
  message = '',
  inputRef = null,
  outputRef = null,
  sourceIds = [],
  chunkIds = [],
  claimIds = [],
  evidenceIds = [],
  branchId = null,
  ruleId = null,
}) {
  if (!PHASES.includes(phase)) throw new Error(`未知事件阶段：${String(phase)}`);
  if (!STATUSES.includes(status)) throw new Error(`未知事件状态：${String(status)}`);
  if (!ACTORS.includes(actorId)) throw new Error(`未知事件参与者：${String(actorId)}`);
  if (!Object.values(EVENT_TYPES).includes(type)) throw new Error(`未知事件类型：${String(type)}`);
  return Object.freeze({
    id: makeEventId(runId, sequence),
    sequence,
    phase,
    type,
    status,
    actorId,
    toolId,
    message,
    inputRef,
    outputRef,
    sourceIds: Object.freeze([...sourceIds]),
    chunkIds: Object.freeze([...chunkIds]),
    claimIds: Object.freeze([...claimIds]),
    evidenceIds: Object.freeze([...evidenceIds]),
    branchId,
    ruleId,
  });
}

/** 供 UI 使用的展示元数据（英文状态名 + 中文解释，不只靠颜色） */
export function eventTypeLabel(type) {
  return EVENT_TYPE_META[type]?.cn || String(type);
}
export function statusLabel(status) {
  return STATUS_META[status]?.cn || String(status);
}
export function phaseLabel(phase) {
  return PHASE_META[phase]?.cn || String(phase);
}
export function actorLabel(actorId) {
  return ACTOR_META[actorId]?.cn || String(actorId);
}
export function outcomeMeta(outcome) {
  return OUTCOME_META[outcome] || OUTCOME_META.error;
}

/** 研究策略的展示元数据（英文策略名 + 中文解释） */
export function evidencePolicyMeta(policy) {
  return EVIDENCE_POLICY_META[policy] || EVIDENCE_POLICY_META.VERIFY_REVISIONS;
}

/** 某类事件是否属于 M0.4 的证据 / 报告阶段（UI 用于分组与配色） */
export function isEvidenceEventType(type) {
  return String(type).startsWith('evidence.');
}

export function isReportEventType(type) {
  return String(type).startsWith('report.');
}
