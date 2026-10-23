/**
 * src/knowledge/concepts/ch06-reliability.js
 * 第 06 章 · 可靠性与边界（RELIABILITY）
 *
 * 交付状态（M1.1）：六个概念全部仅索引 —— 正文与 Reliability Lab 属于 M1.3。
 * ------------------------------------------------------------------
 */
import { defineConcept } from './helpers.js';

const CHAPTER_ID = 'reliability';

export const CHAPTER_06_CONCEPTS = Object.freeze([
  defineConcept({
    id: 'permissions',
    chapterId: CHAPTER_ID,
    order: 1,
    name: 'Permissions',
    cn: '权限',
    tagline: '规定能碰哪些数据、能做哪些动作的授权规则。',
    aliases: ['permissions', 'permission', '权限', '授权', '访问控制'],
    contentStatus: 'outline',
    oneLiner: '权限规定「能碰什么、能做什么」，越权请求必须被运行环境拒绝，而不是交给模型自行判断。',
    plannedMilestone: 'M1.3',
    sources: ['src-index-draft'],
    related: ['sandbox', 'guardrails', 'agent_loop'],
    nextSteps: '正文将在 M1.3 开放：说明权限为什么必须由执行侧强制，以及最小权限原则。',
  }),

  defineConcept({
    id: 'sandbox',
    chapterId: CHAPTER_ID,
    order: 2,
    name: 'Sandbox',
    cn: '沙箱',
    tagline: '受限的执行环境，用来缩小误操作的破坏范围。',
    aliases: ['sandbox', '沙箱', '隔离环境', '受限环境'],
    contentStatus: 'outline',
    oneLiner: '沙箱用隔离的执行环境限制代码与工具能触达的资源，属于「环境层」的兜底手段。',
    plannedMilestone: 'M1.3',
    sources: ['src-index-draft'],
    related: ['permissions', 'tools'],
    nextSteps: '正文将在 M1.3 开放：区分沙箱与权限——一个是环境隔离，一个是授权规则。',
  }),

  defineConcept({
    id: 'prompt_injection',
    chapterId: CHAPTER_ID,
    order: 3,
    name: 'Prompt Injection',
    cn: '提示注入',
    tagline: '外部内容里夹带指令，试图劫持原本的可信指令。',
    aliases: ['prompt injection', 'promptinjection', '提示注入', '指令注入', '注入攻击'],
    contentStatus: 'outline',
    oneLiner: '提示注入是数据里夹带指令：它利用「资料与指令共用同一段文本通道」这一结构性弱点。',
    plannedMilestone: 'M1.3',
    sources: ['src-index-draft'],
    related: ['hallucination', 'guardrails', 'permissions'],
    nextSteps: '正文将在 M1.3 开放：说明它和幻觉不是一回事，以及为什么只靠提示词防不住。',
  }),

  defineConcept({
    id: 'guardrails',
    chapterId: CHAPTER_ID,
    order: 4,
    name: 'Guardrails',
    cn: '护栏',
    tagline: '输入输出侧的规则检查，用来拦截越界内容与高风险行为。',
    aliases: ['guardrails', 'guardrail', '护栏', '内容检查', '拦截规则'],
    contentStatus: 'outline',
    oneLiner: '护栏在输入输出两侧做规则检查，它拦的是内容与格式，不替代权限控制。',
    plannedMilestone: 'M1.3',
    sources: ['src-index-draft'],
    related: ['permissions', 'prompt_injection'],
    nextSteps: '正文将在 M1.3 开放：说明护栏的漏报与误报，以及人工复核的位置。',
  }),

  defineConcept({
    id: 'tracing',
    chapterId: CHAPTER_ID,
    order: 5,
    name: 'Tracing',
    cn: '追踪',
    tagline: '完整记录每一步调用与来源，便于回放与定位问题。',
    aliases: ['tracing', 'trace', 'traces', '追踪', '链路追踪', '事件追踪'],
    contentStatus: 'outline',
    oneLiner: '追踪记录每一步「谁发起、谁执行、依据什么、返回什么」，是可靠性与审计的证据层。',
    plannedMilestone: 'M1.3',
    sources: ['src-index-draft'],
    related: ['evals'],
    nextSteps: '正文将在 M1.3 开放：与本项目的事件记录、引用溯源做对照。',
  }),

  defineConcept({
    id: 'evals',
    chapterId: CHAPTER_ID,
    order: 6,
    name: 'Evals',
    cn: '评估',
    tagline: '用可计算的指标衡量任务完成度，而不是编一个智能分。',
    aliases: ['evals', 'eval', 'evaluation', '评估', '评测', '指标'],
    contentStatus: 'outline',
    oneLiner: '评估用可复现的指标衡量任务完成度：它给出判断，追踪给出证据，两者不能互相替代。',
    plannedMilestone: 'M1.3',
    sources: ['src-index-draft'],
    related: ['tracing', 'agent'],
    nextSteps: '正文将在 M1.3 开放：说明数据集、判定标准与过拟合风险。',
  }),
]);
