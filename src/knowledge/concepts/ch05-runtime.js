/**
 * src/knowledge/concepts/ch05-runtime.js
 * 第 05 章 · 执行系统（RUNTIME）
 *
 * 交付状态（M1.1）：
 *   agent / workflow / harness —— 已审校（正文沿用 M0.3，INSPECT 本轮补写）
 *   agent_loop / orchestration / multi_agent —— 仅索引（正文与 Execution Lab 属于 M1.3）
 * ------------------------------------------------------------------
 */
import { defineConcept } from './helpers.js';
import { NODE_LAYOUT } from '../layout.js';

const CHAPTER_ID = 'runtime';
const REVIEW_NOTE =
  'UNDERSTAND 与常见误解沿用 M0.3 已审校文本；INSPECT 深层要点在 M1.1 依据 PRD 技术边界补写，未新增外部引用。';

export const CHAPTER_05_CONCEPTS = Object.freeze([
  defineConcept({
    id: 'agent',
    chapterId: CHAPTER_ID,
    order: 1,
    name: 'Agent',
    cn: '智能体执行系统',
    tagline: '模型与工具、控制流程共同组成、用来完成任务的执行系统。',
    aliases: ['agent', 'ai agent', 'aiagent', '智能体', '智能体执行系统', '代理'],
    contentStatus: 'reviewed',
    oneLiner: 'Agent 是一套执行系统：模型负责判断，运行环境负责执行，两者合起来才是 Agent。',
    understand: [
      'Agent 是一套执行系统，而不是模型的另一个名字。它通常由模型、可调用的工具、上下文与执行控制共同组成：模型负责判断下一步做什么，运行环境负责真正执行，并把结果放回上下文供下一轮判断。',
      '它和 Workflow 的区别在控制权归属：Workflow 的步骤由开发者预先写死，Agent 的下一步在运行期由模型根据当前信息选择。这不代表 Agent 一定更好：可预测、要求稳定的任务，固定流程往往更合适。',
    ],
    inspect: [
      '组成 · 模型 + 工具 + 上下文管理 + 执行控制（循环、终止条件、失败处理）；缺任何一块都只能算「会说话的模型」。',
      '控制权 · 下一步由谁决定，是区分 Agent 与 Workflow 的唯一标准；两者常常组合：固定流程里放一个 Agent 步骤。',
      '可观察性 · Agent 的可信度依赖事件记录（谁请求、谁执行、依据哪条规则），而不是靠「它说它做了」。',
      '本原型 · M0.4 执行台演示的是固定流程 + 本地工具的教学模拟，不是自主 Agent；页面上不会把模拟结果说成 Agent 自主运行。',
    ],
    misconceptions: [
      {
        claim: 'Agent 就是更聪明的模型，模型升级换代就等于有了 Agent。',
        correction:
          'Agent 是围绕模型搭建的执行系统，模型只是其中的判断与生成部件。没有工具、上下文管理和执行控制，再强的模型也只是一个会说文本的模型，不会自己去完成任务。',
      },
    ],
    sources: ['doc-m0-3-task', 'doc-prd'],
    related: ['llm', 'tools', 'workflow', 'skills', 'rag', 'harness', 'agent_loop', 'evals'],
    nextSteps:
      '后续学习提示：先看 LLM 明确模型的能力边界，再看 Workflow 与 Harness，理解执行路径由谁决定、由谁承载；实验空间开放后可以观察同一任务在固定流程与运行期选择下的不同轨迹。',
    systemTarget: 'core',
    graph: NODE_LAYOUT.agent,
    reviewNote: REVIEW_NOTE,
  }),

  defineConcept({
    id: 'agent_loop',
    chapterId: CHAPTER_ID,
    order: 2,
    name: 'Agent Loop',
    cn: '执行循环',
    tagline: '观察 → 决策 → 调用 → 核验 → 再决策的反复过程。',
    aliases: ['agent loop', 'agentloop', '执行循环', '循环', 'agent 循环'],
    contentStatus: 'outline',
    oneLiner: '执行循环是 Agent 的运转方式：每一轮看当前信息、决定下一步、执行、把结果写回上下文。',
    plannedMilestone: 'M1.3',
    sources: ['src-index-draft'],
    related: ['agent', 'harness', 'permissions'],
    nextSteps: '正文将在 M1.3 开放：讲清终止条件、失败分支与人为打断点。',
  }),

  defineConcept({
    id: 'workflow',
    chapterId: CHAPTER_ID,
    order: 3,
    name: 'Workflow',
    cn: '工作流',
    tagline: '由开发者预先定义步骤与顺序的执行路径，运行期不会自己改路线。',
    aliases: ['workflow', '工作流', '流程编排', '固定流程', '固定路线'],
    contentStatus: 'reviewed',
    oneLiner: 'Workflow 是开发者预先写死步骤与顺序的执行路径，运行期不会自己改变路线。',
    understand: [
      'Workflow 是由开发者预先编排好的执行路径：有哪些步骤、按什么顺序、每步失败后怎么处理，都在运行前写定。它可能在某个步骤里调用模型，但整体路线由代码决定，而不是由模型临场决定。',
      '它的优势是稳定、可预测、容易排查和审计，代价是遇到预设之外的情况不会自己重新规划。这与 Agent 的区别只是控制方式不同，不代表 Workflow 是较低级的做法，两者常常组合使用。',
    ],
    inspect: [
      '两种形态 · 顺序编排（步骤写死）与运行期调度（按条件分支），但分支条件仍由代码判断，不是模型临场决定。',
      '可审计性 · 因为路线固定，失败点可以被精确定位到某个步骤，这也是它更适合合规场景的原因。',
      '与 Agent 的组合 · 常见做法是「固定流程为主干，个别步骤交给 Agent 决策」，而不是二选一。',
      '本原型 · M0.4 执行台的研究流程就是本地固定流程：由配置快照派生分支，不接任何在线模型。',
    ],
    misconceptions: [
      {
        claim: 'Agent 一定比 Workflow 强，所以能做成 Agent 就不该用固定流程。',
        correction:
          '两者是控制方式不同，不是优劣排序。步骤明确、要求稳定可复现的任务，固定流程更可控也更容易定位问题；只有在需要运行期根据信息调整下一步时，Agent 式的动态选择才更有价值。',
      },
    ],
    sources: ['doc-m0-3-task', 'doc-prd'],
    related: ['agent', 'harness', 'orchestration'],
    nextSteps:
      '后续学习提示：接着看 Agent 与 Harness，理解固定路径、动态选择与运行环境三者的配合；本节点是解释性节点，对照实验后续开放。',
    systemTarget: 'none',
    graph: NODE_LAYOUT.workflow,
    reviewNote: REVIEW_NOTE,
  }),

  defineConcept({
    id: 'harness',
    chapterId: CHAPTER_ID,
    order: 4,
    name: 'Harness',
    cn: '运行环境层',
    tagline: '包围模型的工具协调、上下文组装与运行控制环境。',
    aliases: ['harness', 'agent harness', 'agentharness', '运行环境层', '运行外壳', '运行环境'],
    contentStatus: 'reviewed',
    oneLiner: 'Harness 是围绕模型的运行环境：组装上下文、分派工具、控制循环，它不是第二个模型。',
    understand: [
      'Harness 是围绕模型的那层运行环境：它组织每一轮送入模型的上下文，接收模型产出的文本或工具调用请求，分派工具去执行，再把结果写回上下文，并按规则决定继续还是结束。',
      '它是工程代码而不是语言能力，也不是第二个模型：判断仍然来自模型，Harness 负责让判断变成可执行、可约束、可追踪的过程。同一个模型配上不同的 Harness，稳定性和可控性会明显不同。',
    ],
    inspect: [
      '四项职责 · 上下文组装、工具分派、循环与终止控制、事件记录；其中任何一项缺失都会让系统变得不可排查。',
      '为什么容易被误认为模型 · 因为它决定了「模型看到什么」，读者容易把 Harness 加工后的表现当成模型本身的能力。',
      '约束能力 · 权限、白名单与拒绝策略都在这一层执行；它可以拒绝模型提出的调用请求。',
      '本原型 · 装配台 + 本地模拟引擎扮演的正是 Harness 角色：它们组装上下文、按配置检查工具可用性，并记录事件。',
    ],
    misconceptions: [
      {
        claim: 'Harness 就是另一个更聪明的模型，负责在背后帮主模型思考。',
        correction:
          'Harness 是循环、工具分派、上下文组装与控制逻辑组成的运行环境，不产生语言判断。它让模型的输出变成真实可执行的步骤，也可能因为权限或规则而拒绝某次调用。',
      },
    ],
    sources: ['doc-m0-3-task', 'doc-prd'],
    related: ['agent', 'workflow', 'agent_loop'],
    nextSteps:
      '后续学习提示：回到 Agent 节点，把「模型判断」与「运行环境执行」两层合起来看；本节点是解释性节点，装配台暂无对应模块。',
    systemTarget: 'none',
    graph: NODE_LAYOUT.harness,
    reviewNote: REVIEW_NOTE,
  }),

  defineConcept({
    id: 'orchestration',
    chapterId: CHAPTER_ID,
    order: 5,
    name: 'Orchestration',
    cn: '编排',
    tagline: '决定谁先谁后、如何合并结果与失败重试的调度逻辑。',
    aliases: ['orchestration', 'orchestrator', '编排', '调度', '流程调度'],
    contentStatus: 'outline',
    oneLiner: '编排解决「多个步骤 / 多个执行者之间怎么排」的问题：顺序、并发、合并与重试。',
    plannedMilestone: 'M1.3',
    sources: ['src-index-draft'],
    related: ['workflow', 'multi_agent'],
    nextSteps: '正文将在 M1.3 开放：区分编排与 Workflow，以及编排带来的额外故障面。',
  }),

  defineConcept({
    id: 'multi_agent',
    chapterId: CHAPTER_ID,
    order: 6,
    name: 'Multi-Agent',
    cn: '多智能体',
    tagline: '多个 Agent 分工协作，带来能力上限也带来协调成本。',
    aliases: ['multi agent', 'multiagent', '多智能体', '多 agent', '协作智能体'],
    contentStatus: 'outline',
    oneLiner: 'Multi-Agent 是多个执行者分工协作：能力上限提高，协调、一致性与可追溯成本也同时提高。',
    plannedMilestone: 'M1.3',
    sources: ['src-index-draft'],
    related: ['orchestration'],
    nextSteps: '正文将在 M1.3 开放：说明为什么「多」不等于「强」，以及如何判定是否真的需要多个 Agent。',
  }),
]);
