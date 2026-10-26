/**
 * src/knowledge/concepts/ch05-runtime.js
 * 第 05 章 · 执行系统（RUNTIME）
 *
 * 交付状态（M1.3）：
 *   6 个概念全部为 `published`，并统一挂到 Runtime Lab（exp-agent-loop-lab）。
 *
 * 本章回答：多步骤任务为什么需要状态、循环、执行边界与协调策略；
 * 强调「控制权归属」是区分 Workflow 与 Agent 的关键，而不是谁更先进。
 * ------------------------------------------------------------------
 */
import { defineConcept } from './helpers.js';
import { NODE_LAYOUT } from '../layout.js';

const CHAPTER_ID = 'runtime';
const LAB = 'exp-agent-loop-lab';
const REVIEWED_AT = '2026-10-23';
const REVIEW_NOTE =
  'M1.3 重写：Agent / Workflow / Harness 的边界按 Anthropic《Building effective agents》原文与 SWE-agent 的 ACI 论述核对；「不把 Agent 说成更聪明的模型」「不把 Harness 说成第二个模型」两条为本章硬约束。';

export const CHAPTER_05_CONCEPTS = Object.freeze([
  defineConcept({
    id: 'agent',
    chapterId: CHAPTER_ID,
    order: 1,
    name: 'Agent',
    cn: '智能体执行系统',
    tagline: '模型、工具与执行控制共同组成、用来完成任务的执行系统。',
    aliases: ['agent', 'ai agent', 'aiagent', '智能体', '智能体执行系统', '代理'],
    contentStatus: 'published',
    oneLiner:
      'Agent 是一套执行系统：模型负责判断，运行环境负责执行与约束；只有模型没有执行控制，就只是会说话的模型。',
    understand: [
      'Agent 不是模型的另一个名字，而是围绕模型搭起来的一套系统：模型、可用工具、上下文管理与执行控制（循环、终止条件、失败处理）。模型判断下一步做什么，运行环境真的去执行，再把结果放回上下文供下一轮判断。',
      '它与 Workflow 的分界在于**控制权**：Workflow 的步骤由开发者预先写定，Agent 的下一步在运行期根据当前状态选择。这不意味着 Agent 更强——步骤清晰、要求可复现的任务，固定流程更可控；只有在无法预知步数与分支时，动态选择才有价值。',
    ],
    inspect: [
      '组成部分 · 模型 + 工具 + 上下文管理 + 执行控制；缺少工具与执行控制时，系统只能生成文本，无法真正完成任务。',
      '定义依系统而异 · 「Agent」在业界没有统一阈值：有的强调长时间自主运行，有的把预定义流程也叫 agentic system。本项目采用「能根据状态选择后续步骤」这一最小可教学内容，并在正文中说明取舍。',
      '成本结构 · 自主性换来灵活性，也带来更多步骤、更多工具调用与更高的错误累积概率；同一任务用固定流程往往更便宜、更易复现。',
      '本原型 · M0.4 执行台是「固定流程 + 本地工具 + 显式规则」的教学模拟，不是自主 Agent；页面不会把模拟输出说成模型自主决策。',
    ],
    misconceptions: [
      {
        claim: '模型升级换代就等于有了 Agent。',
        correction:
          '模型只负责判断与生成。没有工具、上下文管理和执行控制，再强的模型也不会自己去读资料、校验结果或终止循环——这些都在它之外的执行系统里。',
      },
      {
        claim: 'Agent 一定比固定流程先进，能用 Agent 就不该写 Workflow。',
        correction:
          '两者是控制方式不同，不是优劣排序。可预测、要求稳定审计的任务，固定流程更合适；只有在需要运行期按信息调整下一步时，动态选择才值得付出额外成本。',
      },
    ],
    example: {
      label: '模拟示例 · 同一任务的两种控制方式',
      body: '同一个「核验公告日期」任务：Workflow 按「检索 → 读取 → 比对 → 出结论」固定执行；Agent Loop 模式则每轮读取状态后决定「继续检索 / 换关键词 / 结束」，步数可能更多，也可能更早停下。',
    },
    experimentId: LAB,
    sources: ['src-anthropic-effective-agents', 'src-arxiv-react', 'doc-m1-3-task', 'doc-prd'],
    related: ['llm', 'tools', 'workflow', 'skills', 'rag', 'harness', 'agent_loop', 'evals'],
    nextSteps:
      '先看 Agent Loop 理解「一轮一轮怎么转」，再看 Workflow 与 Harness，分清路径由谁决定、由谁承载。',
    systemTarget: 'core',
    graph: NODE_LAYOUT.agent,
    reviewNote: REVIEW_NOTE,
    reviewedAt: REVIEWED_AT,
  }),

  defineConcept({
    id: 'agent_loop',
    chapterId: CHAPTER_ID,
    order: 2,
    name: 'Agent Loop',
    cn: '执行循环',
    tagline: '观察状态 → 选择动作 → 执行 → 依据结果继续或结束。',
    aliases: ['agent loop', 'agentloop', '执行循环', '循环', 'agent 循环'],
    contentStatus: 'published',
    oneLiner:
      '执行循环是 Agent 的运转方式：每一轮观察当前状态、选择动作、执行、把结果写回上下文，直到满足终止条件。',
    understand: [
      '循环的每一轮做四件事：读取当前状态（已有结果、缺口、错误）、决定下一步动作、由运行环境执行、把结果写回状态。下一轮再基于新状态重新判断，这也是它和「一次性问答」最直接的区别。',
      '循环必须能停下来。真实的系统至少要写清三类出口：任务完成、达到最大步数或重试上限、遇到无法处理的错误或需要人工介入。没有终止条件的循环不是强大，而是失控。',
    ],
    inspect: [
      '终止条件 · 目标达成（证据齐备）、步数上限、重试上限、致命错误、需要人工确认；这些条件必须由执行环境强制，而不是等模型自己说「我停了」。',
      '状态 · 循环的输入输出都写进状态：已取到哪些资料、哪些结论已核验、哪些冲突未决；状态不清时，循环会反复做同一件事。',
      '失败处理 · 工具报错应触发重试或降级分支，而不是静默继续；每次重试都要计入上限，避免无限重试。',
      '本原型 · Runtime Lab 的 Agent Loop 用确定性规则选下一步，并强制展示最大步数（6）、重试上限（2）与终止原因，任何一个条件触发都会立即结束。',
    ],
    misconceptions: [
      {
        claim: '循环可以让 Agent 一直试到成功为止。',
        correction:
          '工程上必须设上限。没有步数与重试上限时，一次错误判断会被无限放大，既烧成本也无法审计；正确做法是把「什么时候必须停」写进执行环境。',
      },
      {
        claim: '循环里的「思考」是模型在内部反复推理直到正确。',
        correction:
          '教学模型里的每一轮都是「根据当前状态选择动作」。真实系统可能包含多轮模型调用，但每次仍然只是产生一次输出；循环的推进来自执行环境把结果写回，而不是模型在内部持续演算。',
      },
    ],
    example: {
      label: '模拟示例 · 一次带重试的循环',
      body: '第 1 轮检索无结果 → 缩小查询词重试；第 2 轮仍无结果 → 判定「资料不足」并结束。事件里保留了两次检索的输入输出与重试计数，终止原因是「达到重试上限」。',
    },
    experimentId: LAB,
    sources: ['src-arxiv-react', 'src-anthropic-effective-agents', 'doc-m1-3-task'],
    related: ['agent', 'harness', 'permissions', 'workflow'],
    nextSteps:
      '循环要有人驱动、有人兜底，这就是 Harness 的职责；而在拿到结果之后，还需要判断「下一步该不该做」。',
    reviewNote: REVIEW_NOTE,
    reviewedAt: REVIEWED_AT,
  }),

  defineConcept({
    id: 'workflow',
    chapterId: CHAPTER_ID,
    order: 3,
    name: 'Workflow',
    cn: '工作流',
    tagline: '由代码预先编排的步骤流，运行期不改路线。',
    aliases: ['workflow', '工作流', '流程编排', '固定流程', '固定路线'],
    contentStatus: 'published',
    oneLiner:
      'Workflow 是用代码预先编排的步骤流：走哪几步、什么顺序、失败怎么办都在运行前写定，模型只能被嵌在某个步骤里。',
    understand: [
      'Workflow 把任务拆成明确步骤，按预设顺序执行；条件分支由代码判断，而不是由模型临场决定。某一步可以调用模型，但整体路线依旧由开发者掌握。',
      '它的价值在于可预期：同一输入走同一条路径，出错时能精确指到某一步，审计也容易。代价是遇到预设之外的情况不会自己重新规划——需要临场应变时，就该考虑 Agent 式的动态选择。',
    ],
    inspect: [
      '常见形态 · 顺序链（prompt chaining）、按类别路由、并行拆分后汇总、编排者-执行者、生成-评审循环；这些模式的共同点是路径由代码定义。',
      '可审计性 · 步骤固定意味着失败点可定位、可复现、可回放，这也是它在合规与生产环境里更常见的原因。',
      '与 Agent 的关系 · 两者是控制方式不同，不是优劣排序：Workflow 不是 Agent 的低配版，Agent 也不是 Workflow 的升级版；常见做法是固定流程为主干、个别步骤交给模型决策。',
      '本原型 · Runtime Lab 的 Workflow 模式展示的就是预定义五步流程；同一份资料、同一组工具能力与权限，与 Agent Loop 模式完全一致，不做任何数据偏置。',
    ],
    misconceptions: [
      {
        claim: 'Workflow 就是不用模型的传统自动化。',
        correction:
          'Workflow 里完全可以有模型调用，只是「走到哪一步」由代码决定。区分标准是控制权归属，不是有没有模型。',
      },
      {
        claim: '所有 Workflow 都是完全固定的，一点分支都没有。',
        correction:
          'Workflow 可以有条件分支、重试与并行，只是分支条件由代码或配置判断。把 Workflow 简化为「一条直线」会低估它的表达能力，也会误判它和 Agent 的实际差异。',
      },
    ],
    example: {
      label: '模拟示例 · 固定的五步核验流程',
      body: '校验配置 → 检索公告 → 读取正文 → 比对日期 → 生成结论；即使第 3 步发现两份公告冲突，流程也不会自己改路线，而是按预设规则把冲突标记为「未决」并继续到最后一步。',
    },
    experimentId: LAB,
    sources: ['src-anthropic-effective-agents', 'doc-m1-3-task', 'doc-prd'],
    related: ['agent', 'harness', 'orchestration'],
    nextSteps:
      '固定路径同样需要有人执行与记录，这正是 Harness；当步骤变多、参与者变多时，还需要 Orchestration。',
    systemTarget: 'none',
    graph: NODE_LAYOUT.workflow,
    reviewNote: REVIEW_NOTE,
    reviewedAt: REVIEWED_AT,
  }),

  defineConcept({
    id: 'harness',
    chapterId: CHAPTER_ID,
    order: 4,
    name: 'Harness',
    cn: '运行环境层',
    tagline: '围绕模型的上下文组装、工具分派、循环控制与记录层。',
    aliases: ['harness', 'agent harness', 'agentharness', '运行环境层', '运行外壳', '运行环境'],
    contentStatus: 'published',
    oneLiner:
      'Harness 是围绕模型的运行环境：组装上下文、分派工具、控制循环、执行权限与记录事件；它不是第二个模型。',
    understand: [
      'Harness 是模型外面那层工程代码：它决定每一轮把什么放进上下文、接收模型的工具请求并分派执行、按规则决定继续还是结束、把每一步写成可回放的事件。',
      '它不产生语言判断，却决定了「模型能看到什么、能做什么、能留下什么记录」。同一个模型配不同的 Harness，稳定性、可控性与可排查性会明显不同——这也是为什么「换个壳子」有时比换模型更有效。',
    ],
    inspect: [
      '常见职责 · 上下文组装、工具分派、循环与终止控制、事件记录；具体组合取决于任务，缺少关键执行记录会让问题难以排查。',
      '为什么容易被误认为模型 · 因为读者看到的是 Harness 加工后的结果：截断的上下文、被拒绝的调用、被重排的证据。把这些表现当成模型能力，就会误判问题出在哪一层。',
      '约束的执行位置 · 权限、白名单与拒绝策略都在这一层落地；它可以拒绝模型提出的调用请求，而且这个拒绝要出现在记录里。',
      '本原型 · 装配配置 + 本地模拟引擎扮演的正是 Harness 角色：按配置检查工具是否可用、按规则推进流程、把每一步写成事件。',
    ],
    misconceptions: [
      {
        claim: 'Harness 是另一个更聪明的模型，在背后帮主模型思考。',
        correction:
          'Harness 是循环、工具分派、上下文组装与记录组成的工程层，不做语言推理。它让模型的输出变成可执行、可约束、可追踪的步骤，也可能因为权限或规则直接拒绝某次调用。',
      },
      {
        claim: '只要模型足够强，Harness 怎么写都无所谓。',
        correction:
          '同一模型在不同接口与上下文组织下表现差异明显：工具描述不清、错误信息不可读、上下文被随意截断，都会让强模型也做不出结果。接口层本身就是需要设计、需要测试的对象。',
      },
    ],
    example: {
      label: '模拟示例 · 被 Harness 拒绝的一次调用',
      body: '模型请求读取「私有评议记录」，Harness 依据权限规则判定未授权并拒绝执行，事件里记录「规则 permissions/private-record-deny · 结果 denied」；模型只会收到「被拒绝」这个事实，而不是数据本身。',
    },
    experimentId: LAB,
    sources: ['src-arxiv-swe-agent', 'src-anthropic-context-engineering', 'doc-m1-3-task', 'doc-prd'],
    related: ['agent', 'workflow', 'agent_loop'],
    nextSteps:
      '当一个任务需要多个步骤或多个执行者时，谁先谁后、结果怎么合，就进入 Orchestration 的范围。',
    systemTarget: 'none',
    graph: NODE_LAYOUT.harness,
    reviewNote: REVIEW_NOTE,
    reviewedAt: REVIEWED_AT,
  }),

  defineConcept({
    id: 'orchestration',
    chapterId: CHAPTER_ID,
    order: 5,
    name: 'Orchestration',
    cn: '编排',
    tagline: '决定任务步骤、工具或多个执行者如何协调的调度逻辑。',
    aliases: ['orchestration', 'orchestrator', '编排', '调度', '流程调度'],
    contentStatus: 'published',
    oneLiner:
      '编排解决「多个步骤 / 多个执行者之间怎么排」：谁先谁后、结果怎么合并、失败怎么重试，因此它比单次工具调用多一层协调。',
    understand: [
      '单次工具调用是「请求 → 执行 → 返回」；编排要管的是这一串调用之间的关系：能不能并行、谁依赖谁、结果按什么规则合并、某个环节失败时是重试、降级还是整体中止。',
      '编排可以是固定的（写在代码里的 DAG），也可以是运行期决定的（由模型或调度器按当前情况拆分任务）。无论哪种，编排都会引入额外的故障面：合并规则写错、重试放大成本、参与者之间的结果互相矛盾，都需要显式处理。',
    ],
    inspect: [
      '与 Workflow 的区别 · Workflow 是被执行的路径，编排是「如何组织这些路径与参与者」的机制；编排可以产出固定流程，也可以产出动态调度。',
      '常见模式 · 顺序链、按类别路由、并行分段、编排者-执行者（中心节点拆分任务再汇总）、生成-评审循环；这些模式可以叠加。',
      '失败处理 · 需要定义每个环节的超时、重试上限与降级方案，并保证合并阶段能识别「某一路没回来」。',
      '本原型 · Runtime Lab 展示的编排是「检索 → 分派 → 核验 → 汇总」四个协调步骤，每个步骤都有明确输入输出与事件，不用并行动画假装真实并发。',
    ],
    misconceptions: [
      {
        claim: '编排就是多调用几次工具，不需要额外设计。',
        correction:
          '多调用几次只是重复执行。编排要回答的是顺序与依赖、结果合并规则、失败与重试策略；这些规则没写清时，多步骤系统会比单步更容易出错，也更难查。',
      },
      {
        claim: '有了编排器就等于有了多智能体。',
        correction:
          '编排器负责协调，参与者可以只是一个工具、一个固定步骤，也可以是多个 Agent。多智能体是「参与者是谁」的问题，编排是「怎么协调」的问题，两者不是同义词。',
      },
    ],
    example: {
      label: '模拟示例 · 四步协调与一次合并失败',
      body: '检索取回 3 份公告 → 分派给核验环节 → 核验返回「两份冲突、一份带更正关系」→ 汇总时按规则标记「未决」而不是二选一；如果核验环节超时，汇总会明确写出「核验未完成」。',
    },
    experimentId: LAB,
    sources: ['src-anthropic-effective-agents', 'src-arxiv-autogen', 'doc-m1-3-task'],
    related: ['workflow', 'multi_agent'],
    nextSteps:
      '当参与者从「步骤」换成「角色」时，就进入 Multi-Agent：能力上限提高，协调成本也同步上升。',
    reviewNote: REVIEW_NOTE,
    reviewedAt: REVIEWED_AT,
  }),

  defineConcept({
    id: 'multi_agent',
    chapterId: CHAPTER_ID,
    order: 6,
    name: 'Multi-Agent',
    cn: '多智能体',
    tagline: '多个 Agent 或角色分工协作，能力与协调成本同时上升。',
    aliases: ['multi agent', 'multiagent', '多智能体', '多 agent', '协作智能体'],
    contentStatus: 'published',
    oneLiner:
      'Multi-Agent 是多个执行者按角色分工并交接结果；增加 Agent 数量不保证更准、更快或更好，反而增加协调与一致性成本。',
    understand: [
      '多智能体把任务拆给不同角色，例如研究者负责取资料、核验者负责挑错、撰写者负责汇总。角色有各自的输入、输出与职责，中间通过「交接」传递结构化结果，而不是把同一段对话复制几份。',
      '它的收益来自分工：不同角色可以用不同的指令、不同的工具集合，甚至互相审查。代价同样具体：交接信息可能丢失、各角色结论可能冲突、调用次数与成本成倍增加，而且整体行为更难预测与复现。',
    ],
    inspect: [
      '角色设计 · 每个角色必须有明确职责边界与输出格式，否则「多角色」会退化成多个模型各说一遍。',
      '交接 · 交接本身就是最容易出错的环节：上一环的输出没写清，下一环只能猜；因此交接事件要记录输入摘要、输出摘要与来源。',
      '并不保证更好 · 多个 Agent 会带来更多调用与更多不一致点；在任务本身简单或强依赖单一上下文时，单 Agent 或固定流程往往更稳。',
      '本原型 · Runtime Lab 提供 Researcher / Verifier / Reporter 三个受控角色，按顺序交接（不伪装真实并发），并展示某一角色失败时的降级路径。',
    ],
    misconceptions: [
      {
        claim: 'Agent 越多越聪明，多开几个就能互相纠错。',
        correction:
          '多角色确实能引入互相审查，但也会引入新的不一致：结论冲突、交接丢信息、成本翻倍。是否值得取决于任务是否需要不同视角与不同工具，而不是数量本身。',
      },
      {
        claim: '多智能体天然并行，所以一定更快。',
        correction:
          '并行需要真的并发执行与结果合并机制；如果角色之间有依赖（核验依赖检索结果），串行交接反而更常见。把并行当作卖点而不实现并发，只会得到更长的调用链。',
      },
    ],
    example: {
      label: '模拟示例 · 三角色交接',
      body: 'Researcher 取回 3 份公告并给出候选结论 → Verifier 发现其中两份日期冲突、要求标注未决 → Reporter 按「已核验 / 未决」两栏输出；每步交接都带结构化摘要与来源 ID。',
    },
    experimentId: LAB,
    sources: ['src-arxiv-autogen', 'src-anthropic-effective-agents', 'doc-m1-3-task'],
    related: ['orchestration'],
    nextSteps:
      '第 05 章到此结束：更复杂的执行结构也会产生错误、循环与不一致。第 06 章讨论如何限制、观察与评估这些风险。',
    reviewNote: REVIEW_NOTE,
    reviewedAt: REVIEWED_AT,
  }),
]);
