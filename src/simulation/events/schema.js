/**
 * src/simulation/events/schema.js
 * ------------------------------------------------------------------
 * M0.3 事件模型：阶段、类型、状态、参与者、结果与故障选项。
 *
 * 这里是**唯一**的事件语义定义处：模拟引擎、执行图、时间轴、Inspector
 * 与持久化都引用它，避免出现第二套互相矛盾的执行事件模型
 * （M0.3_TASK §7.2 末条）。
 *
 * 事件 ID 稳定规则：`${runId}#e${序号}`，不依赖 Date.now() / Math.random()。
 * ------------------------------------------------------------------
 */

export const SIMULATION_SCHEMA_VERSION = 1;

/** 事件阶段（M0.3_TASK §7.2） */
export const PHASES = Object.freeze(['VALIDATION', 'PLAN', 'SEARCH', 'READ', 'EVIDENCE', 'END']);

export const PHASE_META = Object.freeze({
  VALIDATION: { en: 'VALIDATION', cn: '校验', desc: '读取已确认配置，判断工具是否可用' },
  PLAN: { en: 'PLAN', cn: '规划', desc: '本阶段写死的简化步骤，不是真实模型推理' },
  SEARCH: { en: 'SEARCH', cn: '检索', desc: '请求检索工具在本地语料中查找条目' },
  READ: { en: 'READ', cn: '读取', desc: '请求读取工具打开命中的条目' },
  EVIDENCE: { en: 'EVIDENCE', cn: '资料', desc: '记录本次真正取得的样本片段（不等于真实性核验）' },
  END: { en: 'END', cn: '结束', desc: '本次运行的结局；本阶段不生成报告' },
});

/** 事件状态 */
export const STATUSES = Object.freeze(['started', 'success', 'blocked', 'error', 'info']);

export const STATUS_META = Object.freeze({
  started: { en: 'started', cn: '已发起', tone: 'signal' },
  success: { en: 'success', cn: '成功', tone: 'success' },
  blocked: { en: 'blocked', cn: '被阻断', tone: 'attention' },
  error: { en: 'error', cn: '出错', tone: 'error' },
  info: { en: 'info', cn: '记录', tone: 'muted' },
});

/** 参与者：系统、模型核心（仅指提出请求）、两个本地模拟工具 */
export const ACTORS = Object.freeze(['system', 'model_core', 'announcement_search', 'document_reader']);

export const ACTOR_META = Object.freeze({
  system: { en: 'system', cn: '运行环境' },
  model_core: { en: 'model_core', cn: '模型核心' },
  announcement_search: { en: 'announcement_search', cn: '公告检索（本地模拟工具）' },
  document_reader: { en: 'document_reader', cn: '文档读取（本地模拟工具）' },
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
  'run.completed': { cn: '运行结束', tone: 'muted' },
});

/** 运行结局 */
export const OUTCOMES = Object.freeze(['sample_acquired', 'partial', 'blocked', 'error']);

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
