/**
 * src/knowledge/concepts/ch02-context.js
 * 第 02 章 · 指令与上下文（CONTEXT）
 *
 * M1.2 交付：六个概念全部完成分层正文。
 * 状态说明：
 *   prompt / instructions / context_engineering / context_window —— published
 *     （对应 Lab 01 的预算观察与 Lab 02 的上下文模拟，均可真实操作）
 *   system_prompt / hallucination —— reviewed（正文完整，实验通过相邻概念进入）
 *
 * 重点边界（M1.2_TASK §2）：
 *   · context window 的计数规则与具体模型/接口相关，示意预算不是任何模型的承诺；
 *   · system prompt 的优先级行为依实现而异，不得夸大成绝对安全边界；
 *   · 「幻觉」不等于一切不确定性，输出是否真实必须与来源核查区分。
 * ------------------------------------------------------------------
 */
import { defineConcept } from './helpers.js';

const CHAPTER_ID = 'context';
const REVIEWED_AT = '2026-10-22';
const REVIEW_NOTE =
  'M1.2 新写：六个概念的分层正文全部落到已核验来源（DeepSeek 官方文档 / Anthropic 工程文章 / arXiv 综述 / 网信办规章），核验时间 2026-10-22。';

export const CHAPTER_02_CONCEPTS = Object.freeze([
  defineConcept({
    id: 'prompt',
    chapterId: CHAPTER_ID,
    order: 1,
    name: 'Prompt',
    cn: '提示（这一轮的输入）',
    tagline: '这一轮交给模型的全部输入文本。',
    aliases: ['prompt', 'prompts', '提示', '提示词', '输入'],
    contentStatus: 'published',
    oneLiner: 'Prompt 是这一轮交给模型的完整输入，包含指令、资料与用户问题，而不只是「用户那句话」。',
    understand: [
      'Prompt 指一次请求里模型真正收到的全部文本：系统指令、用户消息、历史对话、检索到的资料片段、工具返回结果，最终都会被拼进同一个上下文窗口。',
      '因此「改提示词」有两种完全不同的做法：改**指令**（要求它怎么做）与改**资料**（给它什么可核对的内容）。前者影响结构与风格，后者才可能提高事实准确性。',
      '把 prompt 只理解成「用户输入的一句话」，就会误以为模型的表现只由话术决定，从而忽略上下文里放了什么、又漏了什么。',
    ],
    inspect: [
      '组成 · 系统指令 + 用户消息 + 历史 + 资料 + 工具结果；每部分的包装格式由接口决定（messages 的 role 取值为 system / user / assistant / tool，来源：src-deepseek-chat-api）。',
      '顺序影响 · 同样内容换个顺序，模型表现可能变化：这不是玄学，而是长序列建模与位置信息的实际效果。',
      '作用范围 · prompt 只影响这一轮；它不会改写模型参数，也不会永久改变系统行为。',
      '易混 · Prompt engineering（改措辞）与 Context engineering（改信息装配）不是一回事；本原型更关心后者。',
    ],
    misconceptions: [
      {
        claim: '只要提示词写得足够好，模型就能说出正确的公告日期。',
        correction:
          '措辞能改善结构与稳定性，但日期、地点这类事实必须来自上下文里的资料。没有资料时，再好的措辞也只能得到一段「流畅但未验证」的内容。',
      },
    ],
    example: {
      label: '本章研究情境 · 虚构校园活动整合研究',
      body: 'Lab 02 里同一句研究目标配上不同资料与预算，产出的报告结构完全不同——差别在上下文，而不在措辞。',
    },
    sources: ['src-deepseek-chat-api', 'src-anthropic-context-engineering'],
    related: ['instructions'],
    nextSteps: '接着看 Instructions：prompt 里真正规定「该怎么做」的那一部分，比措辞更值得先改。',
    reviewedAt: REVIEWED_AT,
    reviewNote: REVIEW_NOTE,
  }),

  defineConcept({
    id: 'instructions',
    chapterId: CHAPTER_ID,
    order: 2,
    name: 'Instructions',
    cn: '指令',
    tagline: '规定「该怎么做」的文本，与资料内容分开看。',
    aliases: ['instructions', 'instruction', '指令', '指示', '要求说明'],
    contentStatus: 'published',
    oneLiner: 'Instructions 是 prompt 中规定做法与约束的部分，它不应该被资料内容随手覆盖。',
    understand: [
      '指令回答的是「怎么做」：你是谁、目标是什么、输出成什么格式、要不要标注来源、遇到不确定怎么办。它不提供事实，只提供做法与约束。',
      '指令分成不同层次：开发者写的系统指令、用户这一轮的要求、工具或资料里夹带的「建议」。层次越低的文本越不该被当成命令执行——尤其当它来自外部资料时。',
      '把「指令」和「资料」混在一起，是很多失败的来源：资料里的一句话可能被模型当成要求执行（提示注入），而真正的指令反而被淹没。',
    ],
    inspect: [
      '结构 · 一份可验收的指令通常包含：任务目标、可用材料范围、输出格式、证据要求、失败处理方式（如何说「不知道」）。',
      '与资料分离 · 把资料放进独立的角色或标签里，比和口语混在一段里更稳；这正是 messages 区分 system 与 user 的原因。',
      '不保证 · 指令不是程序：模型可能不完全遵守，需要护栏、校验与评估配合（本阶段只讲到概念层，不实现）。',
      '易混 · 「指令更长、语气更强」不等于「更可靠」；清晰度、顺序与可验证的验收标准更重要。',
    ],
    misconceptions: [
      {
        claim: '指令写得越强硬，模型就越不会出错。',
        correction:
          '语气不改变模型有没有资料。指令能约束结构与做法，但事实正确性取决于上下文里的证据，以及事后是否核验。',
      },
    ],
    example: {
      label: '本章研究情境 · 虚构校园活动整合研究',
      body: 'Lab 02 里把「证据要求」从「无要求」切到「标注来源」，报告立刻多出来源与「未验证」标记——这是指令在起作用，不是模型变聪明了。',
    },
    experimentId: 'exp-context-lab',
    sources: ['src-anthropic-context-engineering', 'src-deepseek-chat-api'],
    related: ['prompt', 'system_prompt'],
    nextSteps: '接着看 System Prompt：指令里优先级最高的那一层，以及它为什么不能当安全边界。',
    reviewedAt: REVIEWED_AT,
    reviewNote: REVIEW_NOTE,
  }),

  defineConcept({
    id: 'system_prompt',
    chapterId: CHAPTER_ID,
    order: 3,
    name: 'System Prompt',
    cn: '系统指令',
    tagline: '由开发者写定、贯穿整轮的指令层，但不是安全边界。',
    aliases: ['system prompt', 'systemprompt', '系统指令', '系统提示', '系统提示词'],
    contentStatus: 'reviewed',
    oneLiner: '系统指令是开发者写定的、贯穿整轮对话的指令；它通常优先级最高，但不是绝对的安全边界。',
    understand: [
      '在消息列表里，system 角色承载由应用（开发者）写定的指令：身份、语气、可用范围、禁止事项。它出现在用户消息之前，作用于整轮对话。',
      '它的作用是让应用行为可控、可复现：同一套系统指令配上不同用户输入，输出风格与边界会更一致。',
      '但它**不是**硬安全边界：模型仍可能被精心构造的输入带偏，外部资料里夹带的「指令」也可能被误当成系统指令。真正的权限控制必须放在运行环境里。',
    ],
    inspect: [
      '接口形态 · messages 中的 system 角色是主流接口的通用做法（来源：src-deepseek-chat-api：role 取值含 system / user / assistant / tool）。',
      '优先级 · 「优先级最高」是常见实现与文档的说法，但具体行为依实现而异；本原型不把它描述成不可绕过的隔离层。',
      '层次关系 · 系统指令是全部指令的一部分；用户这一轮的要求与资料内容都在它之外，并不因为写了「忽略一切其它要求」就真的失效。',
      '工程做法 · 高危动作（写文件、发请求、付款）不能靠系统指令兜底，而要靠权限、沙箱与人工确认。',
    ],
    misconceptions: [
      {
        claim: '只要系统指令写清「不许越权」，模型就不会越权。',
        correction:
          '系统指令是文本约束，不是权限系统。越权是否发生，取决于运行环境有没有真的检查权限——这也是为什么权限与沙箱必须独立实现。',
      },
    ],
    example: {
      label: '本章研究情境 · 虚构校园活动整合研究',
      body: '即便系统指令写着「只依据资料作答」，如果上下文里没有资料，模型仍可能顺畅地编出日期。这类问题要用检索与核验解决，而不是再加一句禁令。',
    },
    sources: ['src-deepseek-chat-api', 'doc-prd'],
    related: ['instructions'],
    nextSteps: '接着看 Context Window：系统指令也要占预算，窗口一满，它同样参与取舍。',
    reviewedAt: REVIEWED_AT,
    reviewNote: REVIEW_NOTE,
  }),

  defineConcept({
    id: 'context_window',
    chapterId: CHAPTER_ID,
    order: 4,
    name: 'Context Window',
    cn: '上下文窗口',
    tagline: '一次请求能容纳的 token 总量上限。',
    aliases: ['context window', 'contextwindow', '上下文窗口', '上下文长度', '窗口'],
    contentStatus: 'published',
    oneLiner: '上下文窗口是模型单次能读取的 token 总量上限，超出就必须裁剪、摘要或分段。',
    understand: [
      '模型一次能读的内容不是无限的：接口把「输入 + 输出」的总长度限制在一个上限内，这个上限就是上下文窗口，按 token 计。',
      '窗口装满时，应用必须做选择：丢掉旧对话、砍掉部分资料、把长文压成摘要，或者拆成多轮。选择方式不同，模型看到的世界就不同。',
      '所以「模型记不住刚才说的话」往往是窗口与取舍的问题，而不是模型「不想记」。',
    ],
    inspect: [
      '计量单位 · 窗口按 token 计，不按字数；同一段中文在不同 tokenizer 下占用不同（见 Lab 01 的实测对比）。',
      '输入输出共享 · 官方文档明确：输入 token 与输出 token 的总长度受模型上下文长度限制；输出达到上限时以 finish_reason=length 结束，内容可能被部分截断（来源：src-deepseek-chat-api）。',
      '数值不是承诺 · 各模型窗口不同（官方价格页给出「上下文长度 1M」「输出长度 最大 384K」这样的数值，来源：src-deepseek-pricing）；引用具体数值必须写明型号与时间。',
      '易混 · 「窗口大」不等于「信息利用率高」：塞入无关内容会稀释信号，反而降低判断质量。',
    ],
    misconceptions: [
      {
        claim: '窗口足够大就可以把所有资料一次性全放进去，不用做取舍。',
        correction:
          '更大的窗口只是把上限抬高：无关内容会稀释关键信息，成本与延迟也会上升。上下文工程要解决的是「放什么最有用」，而不是「能放多少就放多少」。',
      },
    ],
    example: {
      label: 'Lab 01 实测 · 教学示意预算',
      body: '把窗口从 1024 降到 256 时，两条资料被整条舍弃——模型的结论范围随之缩小，而不是「更聪明地挑了重点」。',
    },
    experimentId: 'exp-token-lab',
    sources: ['src-deepseek-chat-api', 'src-deepseek-pricing'],
    related: ['token', 'context_engineering', 'memory'],
    nextSteps: '接着看 Context Engineering：窗口给定之后，工程上要决定「放什么、放多少、舍弃什么」。',
    reviewedAt: REVIEWED_AT,
    reviewNote: REVIEW_NOTE,
  }),

  defineConcept({
    id: 'context_engineering',
    chapterId: CHAPTER_ID,
    order: 5,
    name: 'Context Engineering',
    cn: '上下文工程',
    tagline: '在有限窗口内决定放什么、放多少、舍弃什么。',
    aliases: ['context engineering', 'contextengineering', '上下文工程', '上下文编排'],
    contentStatus: 'published',
    oneLiner: '上下文工程是工程方法：在有限窗口内决定放进什么、按什么顺序放、放多少，并说明舍弃了什么。',
    understand: [
      '上下文工程处理的是一个装配问题：这一轮要完成任务，最少需要哪些信息？哪些必须精确、哪些可以摘要？哪些干脆不放？',
      '它和「提示词技巧」不同：提示词技巧改措辞，上下文工程改**信息集合**——检索结果、历史摘要、工具输出、结构化笔记都在它的范围内。',
      '好的上下文工程会留下可解释的取舍记录：为什么这条资料被舍弃、为什么这段历史被压缩。没有记录的取舍，事后无法复盘。',
    ],
    inspect: [
      '定义 · 官方工程文章把它定义为在有限的上下文预算内维护「最小的高信号 token 集合」（来源：src-anthropic-context-engineering）。',
      '常用手段 · 压缩（compaction）、结构化笔记、把子任务交给子代理；三者都是在窗口内做取舍的具体做法。',
      '可验证性 · 取舍必须留下依据（哪条被舍弃、为什么），否则无法判断结论是否因为缺资料而出错——Lab 02 的「未验证」列表就是这种依据。',
      '易混 · 上下文工程 ≠ 检索：检索只是获取资料的一种手段；排序、裁剪、舍弃、格式与顺序都属于上下文工程。',
    ],
    misconceptions: [
      {
        claim: '上下文工程就是多写点提示词、多塞点资料。',
        correction:
          '恰恰相反：它的核心往往是**减少**——只保留支撑当前判断所需的最小高信号集合，并把舍弃原因写清楚。塞满窗口通常是反面案例。',
      },
    ],
    example: {
      label: 'Lab 02 实测 · 虚构数据',
      body: '把背景预算从「充足」调到「受限」，第三张公告卡片被整张舍弃，它支撑的两条事实立刻回到「未验证」——这就是上下文工程的因果链。',
    },
    experimentId: 'exp-context-lab',
    sources: ['src-anthropic-context-engineering', 'src-deepseek-token-usage'],
    related: ['context_window', 'retrieval'],
    nextSteps: '接着看 Hallucination：上下文没放对时，最典型的后果就是「流畅但没依据」。',
    reviewedAt: REVIEWED_AT,
    reviewNote: REVIEW_NOTE,
  }),

  defineConcept({
    id: 'hallucination',
    chapterId: CHAPTER_ID,
    order: 6,
    name: 'Hallucination',
    cn: '幻觉',
    tagline: '流畅但无依据的输出，本质是概率续写。',
    aliases: ['hallucination', 'hallucinations', '幻觉', '编造', '胡说'],
    contentStatus: 'reviewed',
    oneLiner: '幻觉指流畅却没有依据的输出：它来自按概率续写，而不是来自「查了但查错」。',
    understand: [
      '模型生成每个 token 时选的是「最可能的下一段」，而不是「有证据支持的下一段」。当上下文缺少相关信息时，它仍然会给出看起来合理的答案——这就是幻觉。',
      '幻觉不等于「所有不确定的说法」：有时资料本身过期或相互冲突，输出忠实于资料却与事实不符。这类问题要靠来源核验、冲突检测与时间戳来解决，不能归因于模型乱编。',
      '所以判断一段输出能不能用，要看它有没有可回溯的来源，而不是看它读起来有多顺。',
    ],
    inspect: [
      '分类 · 幻觉研究把它分成事实性错误、与输入不一致等多种类型，成因与检测方法各不相同（来源：src-arxiv-hallucination-survey）。',
      '常见触发 · 缺少资料、问题过于具体（如精确到分钟的日期）、资料互相冲突、被要求必须给出确定答案。',
      '缓解手段 · 让资料进入上下文、要求标注来源、允许回答「未验证」、对外部事实做事后核验。',
      '合规语境 · 我国《生成式人工智能服务管理暂行办法》要求增强训练数据的真实性、准确性，并提升生成内容的准确性与可靠性（来源：src-cac-genai-rules）——可核验不是可选项。',
      '易混 · 幻觉 ≠ 提示注入：前者是无依据生成，后者是被外部内容操纵行为；两者防线不同。',
    ],
    misconceptions: [
      {
        claim: '模型说错了，说明它在故意说谎或者有坏心眼。',
        correction:
          '幻觉不是动机问题，而是生成机制的结果：模型没有「真值」这个概念，只有概率。要减少它，靠的是把依据放进上下文并建立核验流程。',
      },
    ],
    example: {
      label: '本章研究情境 · 虚构校园活动整合研究',
      body: '第 01 章开场的回答给出了一个像模像样的截止日期，语气笃定、语法正确，但它没有来源——这就是典型幻觉。',
    },
    sources: ['src-arxiv-hallucination-survey', 'src-cac-genai-rules'],
    related: ['llm', 'prompt_injection'],
    nextSteps: '看完这一章可以进 Story 第 02 章叙事或 Lab 02；第 03 章接着讲「怎么把外部资料真正接进来」。',
    reviewedAt: REVIEWED_AT,
    reviewNote: REVIEW_NOTE,
  }),
]);
