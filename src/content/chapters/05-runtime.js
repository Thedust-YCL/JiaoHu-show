/**
 * src/content/chapters/05-runtime.js
 * ------------------------------------------------------------------
 * Chapter 05 的 Story 叙事数据（M1.3 D02 / §4「FROM STEPS TO CONTROL」）。
 *
 * 叙事任务：同一任务先用固定流程跑一遍（能跑通、能审计），遇到冲突后
 * 才发现「下一步该做什么」需要运行期判断；再把 Harness 与编排的职责
 * 拆开，最后说明多角色分工的收益与成本。
 * ------------------------------------------------------------------
 */

export const CHAPTER_05_STORY = Object.freeze({
  chapterId: 'runtime',
  no: '05',
  title: Object.freeze({ zh: '执行系统', en: 'RUNTIME' }),
  subtitle: 'FROM STEPS TO CONTROL · 从步骤到控制',
  opening: Object.freeze({
    goal: '分清「路线由谁决定」「运行环境负责什么」「多个执行者怎么协调」三件事。',
    task: '研究任务（沿用第 04 章）：检索到两份日期不一致的招聘会公告后，系统该继续、重试，还是停下？',
    prompt: '本实验的「模型判断」用确定性规则代替：不是真实模型推理，也不会因为某次点击而变得更聪明。',
    expectation: '读完你应该能回答：为什么 Agent 不必然优于固定流程，以及 Harness 为什么不是第二个模型？',
  }),
  beats: Object.freeze([
    Object.freeze({
      id: 'fixed',
      idx: '01',
      kind: 'opening',
      title: '先按固定流程跑一遍',
      text: 'Workflow 模式把路线写死：校验配置 → 检索 → 读取 → 比对 → 出结论。它跑得稳、失败点能精确指到某一步，代价是遇到冲突不会自己改路线。',
      sample: Object.freeze({
        label: '模拟对照 · Workflow 的 5 步',
        body: '检索命中 NTC-1008 与 NTC-1009 → 读取两份正文 → 比对发现 10 月 24 日 / 10 月 26 日 → 结论「未决」。流程不会为冲突再检索一次。',
      }),
      takeaway: '固定流程的价值是「可预期」，不是「能力弱」；它不是 Agent 的低配版，而是另一种控制方式。',
    }),
    Object.freeze({
      id: 'loop',
      idx: '02',
      kind: 'insight',
      title: '遇到冲突时，下一步该做什么并不写在流程里',
      text: 'Agent Loop 模式每一轮先看状态，再决定动作：没有证据就检索；检索为空且没到重试上限就再试；读到日期就比对；发现冲突就去找更正公告；没有新动作可做就停下。',
      observation: '两种模式共用同一份语料、同一组工具、同一套权限。差异只来自「谁决定下一步」，不来自偷偷换数据。',
      takeaway: '循环换来灵活性，也带来成本：步数更多、调用更多，而且必须有明确的终止条件。',
    }),
    Object.freeze({
      id: 'limit',
      idx: '03',
      kind: 'limit',
      title: '循环不设上限，就会变成失控',
      text: '把步数上限从 6 改成 3，同一任务会在拿到冲突后立刻被截断；把重试上限降到 0，空结果的查询会在第一次失败后就停止。这两种停止都不是「想通了」，而是规则强制。',
      observation: '事件里能直接看到终止原因：max-steps / retry-limit / no-more-actions。终止条件由执行环境强制，不靠模型自己宣布。',
      takeaway: '可靠的循环不是「能一直转」，而是「知道什么时候必须停」。',
    }),
    Object.freeze({
      id: 'harness',
      idx: '04',
      kind: 'insight',
      title: 'Harness 是那层工地：组装、分派、控制、记录',
      text: '模型只输出「请调用某个工具」；真正把上下文拼好、把工具找到、把权限查一遍、把结果写回、把每一步记成事件的是运行环境。它不是另一个模型，也不产生语言判断。',
      sample: Object.freeze({
        label: '模拟事件 · 被 Harness 拒绝的请求',
        body: '模型请求读取私有评议记录 → 权限检查命中 permissions/read-private → 拒绝执行，事件记录 denied；模型只收到「被拒绝」这个事实。',
      }),
      takeaway: '同一个模型换个壳子表现就不同，因为壳子决定了它看到什么、能做什么、留下什么记录。',
    }),
    Object.freeze({
      id: 'orchestration',
      idx: '05',
      kind: 'insight',
      title: '编排与多角色：分工有收益，也有协调成本',
      text: '编排决定步骤之间的顺序、合并与失败处理；多智能体则把参与者换成角色：Researcher 取资料、Verifier 挑错、Reporter 汇总。角色之间按顺序交接，每一步都要写清输入输出。',
      observation: 'Verifier 失败时，Reporter 只能写「核验未完成」——失败不会被静默忽略，也不会被另一个角色「猜出来」。',
      takeaway: '多一个角色不代表更准：它带来审查，也带来更多不一致点与更高的成本。',
    }),
    Object.freeze({
      id: 'hands-on',
      idx: '06',
      kind: 'experiment',
      title: '进入 Runtime Lab：同一任务，两种控制',
      text: '在 Lab 05 里切换 Workflow 与 Agent Loop，比较步骤数、工具调用、重试与终止原因；播放、暂停、逐步前进，点开任意事件看输入输出与来源；再运行一次三角色流程，观察交接事件。',
      takeaway: '所有指标都来自事件数据：没有随机成分，播放或暂停都不会改变结论。',
    }),
  ]),
  limitation: Object.freeze({
    title: '本章的局限',
    text: '更复杂的执行结构也会产生错误、循环与不一致。',
    detail:
      '循环让系统能临场调整，也让错误有机会被放大；多角色能互相审查，也让结论需要更多协调。控制结构解决不了「该不该做这件事」——权限、沙箱、不可信输入与评估，是第 06 章的问题。',
  }),
  lab: Object.freeze({
    experimentId: 'exp-agent-loop-lab',
    entryConceptId: 'agent_loop',
    title: 'RUNTIME LAB · Workflow 与 Agent Loop',
    prompt: '先用默认配置各跑一遍两种模式，记住步骤数与终止原因，再改上限。',
    steps: Object.freeze([
      '在 Workflow 模式下播放完整流程，记录 5 步与终止原因「plan-complete」。',
      '切到 Agent Loop，同一查询再跑一次，比较步骤数、工具调用与终止原因。',
      '把步数上限改为 3，观察循环在拿到冲突后被强制截断（max-steps）。',
      '把任务查询切到「毕业典礼」，把重试上限设为 1，观察 retry-limit 终止与「无证据」结论。',
      '运行三角色流程，查看 Researcher → Verifier → Reporter 的交接事件与输入输出。',
      '开启「模拟 Verifier 失败」，再运行一次，观察结论变为「核验未完成」。',
    ]),
    observe: Object.freeze([
      '两种模式使用同一份资料与同一组工具：差异只来自控制方式。',
      '每个事件都带 eventId / runId / stepType / status / 输入输出摘要 / 来源 ID / 分支原因。',
      'Harness 的职责在右侧逐项点亮：它只做工程动作，不产生语言判断。',
      '角色失败会改变结论，不会被静默忽略；页面也不会用并排动画假装并发。',
    ]),
  }),
  reading: Object.freeze({
    title: '结果解读',
    items: Object.freeze([
      Object.freeze({
        q: '为什么 Agent Loop 的步骤更多，结论却和 Workflow 一样？',
        a: '因为冲突客观存在且没有更正关系。循环多做的动作（换关键词、找更正）是「努力」，不是「结果保证」——它尝试过，但没有新的证据可用，所以结论仍是未决。',
      }),
      Object.freeze({
        q: '那什么时候该用 Agent Loop？',
        a: '当「需要多少步、走哪条分支」无法预先写定时。若任务步骤清楚、要求每次都一样，固定流程更便宜、更好审计，也更容易复现。',
      }),
      Object.freeze({
        q: '多一个 Verifier 有什么用？',
        a: '它把「挑错」变成一个显式环节：日期不一致、来源不可采信都会被写成事件。代价是交接本身可能丢信息，所以要写清输入输出格式。',
      }),
    ]),
  }),
  transition: Object.freeze({
    toChapterId: 'reliability',
    text: '系统能跑、能停、能记录了，但它能碰到什么、遇到不可信输入会怎样、结果由谁评判——这些才是「能不能信」的问题。',
  }),
  concepts: Object.freeze(['agent', 'agent_loop', 'workflow', 'harness', 'orchestration', 'multi_agent']),
});
