/**
 * src/knowledge/experiments.js
 * ------------------------------------------------------------------
 * 实验登记表（M1.1 §4 / §6 Lab；M1.2 §1 D03–D05 扩展）。
 *
 * 规则：
 *   · 只有**真实存在并可操作**的实验才允许 `status: 'available'`；
 *   · `openMode` 说明从哪个入口打开，界面据此决定按钮行为，不出现点了没反应的假按钮：
 *       lab-workspace  —— 打开独立实验工作区（Lab 01 / Lab 02）
 *       knowledge-step —— 打开知识页的 EXPERIMENT 步骤（Tool Calling，复用 M0.3）
 *   · 实验 ID 保持 M1.1 的稳定命名：exp-token-lab / exp-context-lab /
 *     exp-tool-calling-demo 三个可用，其余仍为 planned；
 *   · concept.experimentId 只能指向本表存在且可用的实验，由校验器强制。
 * ------------------------------------------------------------------
 */

export const EXPERIMENT_STATUS = Object.freeze({
  available: { id: 'available', cn: '可操作', tone: 'success', note: '本阶段真实可用，可在实验工作区或知识页内直接运行观察。' },
  planned: { id: 'planned', cn: '后续阶段开放', tone: 'muted', note: '仅登记计划，未提供可点击的运行入口。' },
});

/** 打开方式：决定按钮文案与路由，避免在 UI 里散落 if/else */
export const EXPERIMENT_OPEN_MODES = Object.freeze({
  'lab-workspace': { id: 'lab-workspace', cn: '独立实验工作区', cta: 'RUN · 打开实验' },
  'knowledge-step': { id: 'knowledge-step', cn: '知识页 EXPERIMENT 步骤', cta: 'RUN · 打开内嵌实验' },
});

export const EXPERIMENTS = Object.freeze([
  Object.freeze({
    id: 'exp-token-lab',
    title: 'Lab 01 · Token 与上下文预算',
    chapterId: 'intelligence',
    conceptIds: Object.freeze(['token', 'context_window']),
    status: 'available',
    milestone: 'M1.2 已开放',
    openMode: 'lab-workspace',
    labKind: 'token',
    entryConceptId: 'token',
    entryStep: null,
    dataNote: '离线预计算分词表（cl100k_base / o200k_base，gpt-tokenizer 构建期切分并逐条校验）· 不联网 · 运行期不含分词器本体',
  }),
  Object.freeze({
    id: 'exp-context-lab',
    title: 'Lab 02 · 指令、背景与上下文预算',
    chapterId: 'context',
    conceptIds: Object.freeze(['prompt', 'instructions', 'context_engineering']),
    status: 'available',
    milestone: 'M1.2 已开放',
    openMode: 'lab-workspace',
    labKind: 'context',
    entryConceptId: 'context_engineering',
    entryStep: null,
    dataNote: '本地确定性规则模拟 · 背景卡片取自 M0.4 虚构语料 · 不调用任何模型',
  }),
  Object.freeze({
    id: 'exp-tool-calling-demo',
    title: 'Lab 03 · Tool Calling 与 MCP 路径对照',
    chapterId: 'connection',
    conceptIds: Object.freeze(['tool_calling', 'mcp']),
    status: 'available',
    milestone: 'M0.3 交付 · M1.2 扩展 MCP 对照',
    /** 复用 M0.3 的内嵌实验，不新建第二套引擎 */
    openMode: 'knowledge-step',
    labKind: null,
    entryConceptId: 'tool_calling',
    entryStep: 'experiment',
    dataNote: '本地虚构语料 mission-001-mini · 沿用既有工具定义与模拟引擎 · 不联网 · 不写入运行记录',
  }),
  Object.freeze({
    id: 'exp-retrieval-lab',
    /** 稳定 ID 保持不变（M1.1 起登记）；标题在 M1.3 更新为实际交付的实验名 */
    title: 'KNOWLEDGE LAB · 切分、检索与 RAG',
    chapterId: 'knowledge',
    conceptIds: Object.freeze(['chunking', 'retrieval', 'embedding', 'rag', 'memory', 'skills']),
    status: 'available',
    milestone: 'M1.3 已开放',
    openMode: 'lab-workspace',
    labKind: 'knowledge',
    entryConceptId: 'chunking',
    entryStep: null,
    dataNote:
      '本地虚构校园公告语料（沿用 M0.4 mission-001）· 切分/检索/RAG 全部为确定性规则 · 二维向量为人工设定的演示坐标 · 不调用任何 Embedding 或 LLM 服务',
  }),
  Object.freeze({
    id: 'exp-agent-loop-lab',
    title: 'RUNTIME LAB · Workflow 与 Agent Loop',
    chapterId: 'runtime',
    conceptIds: Object.freeze(['agent', 'agent_loop', 'workflow', 'harness', 'orchestration', 'multi_agent']),
    status: 'available',
    milestone: 'M1.3 已开放',
    openMode: 'lab-workspace',
    labKind: 'runtime',
    entryConceptId: 'agent_loop',
    entryStep: null,
    dataNote:
      '同一份资料与同一组工具能力 · 两种控制方式共用确定性状态机 · 事件全部来自本地规则 · 不连接任何模型或远程服务',
  }),
  Object.freeze({
    id: 'exp-boundary-lab',
    title: 'RELIABILITY LAB · 权限、注入与评估',
    chapterId: 'reliability',
    conceptIds: Object.freeze([
      'permissions',
      'sandbox',
      'prompt_injection',
      'guardrails',
      'tracing',
      'evals',
    ]),
    status: 'available',
    milestone: 'M1.3 已开放',
    openMode: 'lab-workspace',
    labKind: 'reliability',
    entryConceptId: 'permissions',
    entryStep: null,
    dataNote:
      '权限与沙箱为本地判定规则（非真实隔离）· 注入样本是明确标记的教学模拟文本 · 评估按固定样例与确定性规则打分',
  }),
]);

const EXPERIMENT_INDEX = Object.freeze(Object.fromEntries(EXPERIMENTS.map((e) => [e.id, e])));

export function getExperiment(experimentId) {
  return Object.prototype.hasOwnProperty.call(EXPERIMENT_INDEX, experimentId) ? EXPERIMENT_INDEX[experimentId] : null;
}

/** 概念关联实验（只返回登记过的实验；没有则返回 null，界面按「未开放」处理） */
export function experimentOfConcept(conceptId) {
  return EXPERIMENTS.find((e) => e.conceptIds.includes(conceptId)) || null;
}

/** 只有 available 的实验才算真实可用入口 */
export function isExperimentAvailable(experimentId) {
  return getExperiment(experimentId)?.status === 'available';
}

/** 按章节分组的实验清单（Lab 页使用；顺序固定） */
export function experimentsByChapter(chapterId) {
  return EXPERIMENTS.filter((e) => e.chapterId === chapterId);
}

/** 按 labKind 取实验（Lab 工作区路由使用） */
export function experimentByLabKind(labKind) {
  return EXPERIMENTS.find((e) => e.labKind === labKind) || null;
}

export function experimentStats() {
  return {
    total: EXPERIMENTS.length,
    available: EXPERIMENTS.filter((e) => e.status === 'available').length,
    planned: EXPERIMENTS.filter((e) => e.status !== 'available').length,
  };
}
