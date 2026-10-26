/**
 * src/knowledge/layout.js
 * ------------------------------------------------------------------
 * 星图节点坐标与画布空间（M1.1 起属于统一知识层的几何数据）。
 *
 * 规则（沿用 M0.3 的硬约束）：
 *   · 坐标**固定、可重现**：不使用随机或力导向布局，刷新不会重排；
 *   · 只有「正文可用 + 有真实关系」的节点才给坐标，因此 outline 概念不会
 *     被画成已完成节点（M1.1_TASK §6「避免把未审校节点用已完成高亮呈现」）；
 *   · 概念一旦拿到坐标就不要再改，避免学习者的空间记忆失效。
 * ------------------------------------------------------------------
 */
import { CHAPTERS } from './chapters.js';

/** 画布坐标空间（SVG viewBox），缩放与平移都作用在这个空间上 */
export const GRAPH_VIEW = Object.freeze({ width: 1500, height: 1020 });

/** M1.4全量固定坐标：旧M0.3十节点逐点保留，其余向外扩展 */
export const NODE_LAYOUT = Object.freeze({
  llm: Object.freeze({ x: 240, y: 88 }),
  rag: Object.freeze({ x: 132, y: 214 }),
  agent: Object.freeze({ x: 410, y: 262 }),
  skills: Object.freeze({ x: 206, y: 414 }),
  workflow: Object.freeze({ x: 322, y: 472 }),
  harness: Object.freeze({ x: 500, y: 480 }),
  tool_calling: Object.freeze({ x: 612, y: 126 }),
  tools: Object.freeze({ x: 712, y: 262 }),
  api: Object.freeze({ x: 614, y: 412 }),
  mcp: Object.freeze({ x: 748, y: 470 }),
  // M1.4：保留旧十节点原坐标；新增节点向右、下扩展。纯固定坐标，无随机布局。
  ai: Object.freeze({ x: 920, y: 155 }),
  ml: Object.freeze({ x: 1130, y: 155 }),
  transformer: Object.freeze({ x: 1340, y: 155 }),
  token: Object.freeze({ x: 920, y: 250 }),
  inference: Object.freeze({ x: 1130, y: 250 }),
  prompt: Object.freeze({ x: 1340, y: 250 }),
  instructions: Object.freeze({ x: 920, y: 400 }),
  system_prompt: Object.freeze({ x: 1130, y: 400 }),
  context_window: Object.freeze({ x: 1340, y: 400 }),
  context_engineering: Object.freeze({ x: 920, y: 550 }),
  hallucination: Object.freeze({ x: 1130, y: 550 }),
  function_calling: Object.freeze({ x: 1340, y: 550 }),
  mcp_server: Object.freeze({ x: 130, y: 670 }),
  retrieval: Object.freeze({ x: 370, y: 670 }),
  chunking: Object.freeze({ x: 610, y: 670 }),
  embedding: Object.freeze({ x: 850, y: 700 }),
  memory: Object.freeze({ x: 1090, y: 700 }),
  agent_loop: Object.freeze({ x: 1340, y: 700 }),
  orchestration: Object.freeze({ x: 130, y: 820 }),
  multi_agent: Object.freeze({ x: 370, y: 820 }),
  permissions: Object.freeze({ x: 610, y: 820 }),
  sandbox: Object.freeze({ x: 850, y: 850 }),
  prompt_injection: Object.freeze({ x: 1090, y: 850 }),
  guardrails: Object.freeze({ x: 1340, y: 850 }),
  tracing: Object.freeze({ x: 250, y: 960 }),
  evals: Object.freeze({ x: 490, y: 960 }),
});

/**
 * 星图节点顺序：保留旧十节点的相对绘制顺序，随后补齐26节点。
 * 与「概念全量顺序」分开：36个概念同时出现在画布、目录与搜索中。
 */
export const GRAPH_ORDER = Object.freeze([
  'llm',
  'agent',
  'tool_calling',
  'tools',
  'api',
  'mcp',
  'skills',
  'rag',
  'workflow',
  'harness',
  'ai', 'ml', 'transformer', 'token', 'inference', 'prompt', 'instructions', 'system_prompt',
  'context_window', 'context_engineering', 'hallucination', 'function_calling', 'mcp_server',
  'retrieval', 'chunking', 'embedding', 'memory', 'agent_loop', 'orchestration', 'multi_agent',
  'permissions', 'sandbox', 'prompt_injection', 'guardrails', 'tracing', 'evals',
]);

/** 章节 → 画布区域（后续阶段扩展星图时用；本轮不据此绘制） */
export const CHAPTER_GRAPH_HINTS = Object.freeze(
  Object.fromEntries(CHAPTERS.map((c) => [c.id, Object.freeze({ no: c.no, zh: c.title.zh })]))
);
