/**
 * src/content/chapters/02-context.js
 * ------------------------------------------------------------------
 * Chapter 02 的 Story 叙事数据（M1.2 D02 / §3）。
 *
 * 叙事任务：读者发现「研究目标不够明确」，于是通过指令卡、背景资料与
 * 模拟预算的调整，观察报告结构与限制说明的变化；最后把局限说清楚：
 * 「指令更清晰，但没有接入真实资料，仍无法核实公告。」
 * ------------------------------------------------------------------
 */

export const CHAPTER_02_STORY = Object.freeze({
  chapterId: 'context',
  no: '02',
  title: Object.freeze({ zh: '指令与上下文', en: 'CONTEXT' }),
  subtitle: 'DEFINE THE QUESTION · 把问题问清楚',
  opening: Object.freeze({
    goal: '搞清「指令、背景资料与上下文预算」各自改变产出的哪一部分。',
    task: '研究任务（沿用第 01 章）：整合分散的校园活动公告是否可行？',
    prompt: '这一章不接任何外部数据；所有背景资料都是虚构卡片，且只有真的进入上下文的卡片才能被引用。',
    expectation: '读完你应该能回答：为什么「加了要求」不等于「答案就可信」？',
  }),
  beats: Object.freeze([
    Object.freeze({
      id: 'vague',
      idx: '01',
      kind: 'opening',
      title: '问题太泛：结论只能是「看起来可行」',
      text: '第 01 章留下的那句「总体可行」，问题不在语气，而在任务本身太宽：没有说要判断什么、按什么标准判断、缺资料时怎么办。',
      sample: Object.freeze({
        label: '模拟输出 · 宽泛任务 + 无资料',
        body: '从现有信息看，整合分散的校园活动公告似乎可行，但还需要更多资料确认。',
      }),
      takeaway: '一句「还需要更多资料」既没说缺什么，也没说怎么补——这就是目标不清的代价。',
    }),
    Object.freeze({
      id: 'define',
      idx: '02',
      kind: 'insight',
      title: '把任务拆成四个可回答的子问题',
      text: '明确的研究目标会把「可行性」拆开：时间是否冲突、场地是否冲突、报名与容量是否可控、资料缺口在哪里。拆开之后，每一条都能指向具体事实，而不是感觉。',
      takeaway: '目标写清楚，产出的结构会立刻变化：从两段泛泛而谈变成四节可回答的问题。',
    }),
    Object.freeze({
      id: 'context',
      idx: '03',
      kind: 'insight',
      title: '上下文里放什么，比措辞更重要',
      text: '同样的目标，配上背景卡片与不同预算，报告能引用的事实条数会变。预算不足时被整张舍弃的卡片，它支撑的事实会自动回到「未验证」。',
      observation: '注意：要求标注来源并不会让模型凭空产生引文；没有资料时它会写「未验证」，而不是编一条出处。',
      takeaway: '指令约束「怎么做」，资料决定「能说什么」。两者都缺一不可，但作用完全不同。',
    }),
    Object.freeze({
      id: 'hands-on',
      idx: '04',
      kind: 'experiment',
      title: '进入 Lab 02：五个维度，逐一看因果',
      text: '在 Lab 02 里改研究目标、输出方式、证据要求、背景资料与预算。每次改动都会在右侧留下「上一组 → 本次」的对照，以及逐条原因说明。',
      takeaway: '产出由确定性规则生成，不是随机的「更聪明的答案」；同一组配置永远得到同一份报告。',
    }),
  ]),
  limitation: Object.freeze({
    title: '本章的局限',
    text: '指令更清晰，但没有接入真实资料，仍无法核实公告。',
    detail:
      '这一章改善的是「问法」与「装配方式」：报告结构清楚了、缺口列出来了、未验证项也标出来了。但所有事实仍然只来自虚构卡片，系统没有能力去读一条真实的公告——那需要工具。',
  }),
  lab: Object.freeze({
    experimentId: 'exp-context-lab',
    entryConceptId: 'context_engineering',
    title: 'Lab 02 · 指令、背景与上下文预算',
    prompt: '先用默认配置跑一遍，记住「有来源 / 未验证」的条数，再逐项改。',
    steps: Object.freeze([
      '把「证据要求」从「无要求」改成「标注来源及不确定性」，看引用与未验证标记。',
      '在「不添加背景」下勾选「要求标注来源」：报告会怎么处理？',
      '添加背景卡片，再把预算从「充足」切到「受限」，看被舍弃的卡片与对应事实。',
      '把「输出方式」在自由陈述与结构化提纲之间切换，比较可读性差异。',
    ]),
    observe: Object.freeze([
      '没有资料时，报告不会生成任何引文，而是明确写出「未验证 · 哪一项」。',
      '预算受限时被舍弃的是整张卡片，且给出「剩多少 token、需要多少 token」的具体数字。',
      '任何一次改动都能在右侧找到对应原因，而不是「反正就是变了」。',
    ]),
  }),
  reading: Object.freeze({
    title: '结果解读',
    items: Object.freeze([
      Object.freeze({ q: '为什么勾了「要求来源」还是没有引用？', a: '因为上下文里没有可引用的资料。要求来源只改变「要不要标注」，不能凭空造出资料——正好说明幻觉与「没查」是两件事。' }),
      Object.freeze({ q: '预算受限为什么会让结论变少？', a: '被舍弃的卡片模型看不到，它支撑的事实就只能标为未验证。这是取舍的直接后果，不是模型「变保守」。' }),
      Object.freeze({ q: '那还缺什么？', a: '缺「真的去读公告」的能力。第 03 章讲工具：模型可以请求检索与读取，运行环境负责执行。' }),
    ]),
  }),
  transition: Object.freeze({
    toChapterId: 'connection',
    text: '问题问清楚了、该放什么也想明白了，最后一步是把外部资料真的拿进来——这需要工具，而不是更好的措辞。',
  }),
  concepts: Object.freeze(['prompt', 'instructions', 'system_prompt', 'context_window', 'context_engineering', 'hallucination']),
});
