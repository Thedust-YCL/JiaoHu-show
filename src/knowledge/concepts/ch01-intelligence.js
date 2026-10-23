/**
 * src/knowledge/concepts/ch01-intelligence.js
 * 第 01 章 · 智能诞生（INTELLIGENCE）
 *
 * M1.2 交付：六个概念全部完成分层正文（UNDERSTAND / INSPECT / 常见误解 /
 * 本章研究情境示例 / 经核验来源）。状态说明：
 *   ai / ml / transformer / inference / llm —— reviewed（正文已审校）
 *   token —— published（另有 Lab 01 可操作实验）
 *
 * 审校范围：全部外部断言都能落到 sources 里的已核验来源上；
 * 「引申」性质的表述在 INSPECT 中明确标注，不冒充论文原话。
 * ------------------------------------------------------------------
 */
import { defineConcept } from './helpers.js';
import { NODE_LAYOUT } from '../layout.js';

const CHAPTER_ID = 'intelligence';
const REVIEWED_AT = '2026-10-22';
const REVIEW_NOTE =
  'M1.2 重写：UNDERSTAND / INSPECT / 常见误解 / 研究情境示例全部按来源逐条核对；外部来源已于 2026-10-22 实际抓取核验（见 sources.js 的 checkedAt）。';

export const CHAPTER_01_CONCEPTS = Object.freeze([
  defineConcept({
    id: 'ai',
    chapterId: CHAPTER_ID,
    order: 1,
    name: 'AI',
    cn: '人工智能',
    tagline: '目标范畴：让机器完成通常需要理解、判断与生成的任务。',
    aliases: ['ai', 'artificial intelligence', 'artificialintelligence', '人工智能', '人工智慧'],
    contentStatus: 'reviewed',
    oneLiner: 'AI 是一类目标的总称，不是某一种具体技术，也不是某个产品的名字。',
    understand: [
      'AI（人工智能）是**目标层面的说法**：它描述的是一类「让机器完成通常需要理解、判断或生成内容的任务」的努力方向。既然是目标，它就不规定实现方式——可以靠规则系统，也可以靠机器学习。',
      '所以「这是 AI 吗」这个问题本身信息量很低，真正要问的是「它用什么方法做到的」。本原型涉及的是其中一条路线：用大量数据训练出来的模型来生成文本。',
      '把 AI 当成「会自己思考、知道自己说得对不对的系统」是最常见的过度解读。当前系统能生成流畅回答，不等于它拥有目标、常识或可核对的事实来源。',
    ],
    inspect: [
      '范围 · AI ⊃ 机器学习 ⊃ 神经网络 ⊃ 大语言模型。链条上每一层都在缩小范围，因此不能反过来说「AI 就是大模型」。',
      '实现路径 · 规则系统、传统机器学习、神经网络三条路都能做出「看起来智能」的功能；判断一个系统要看它实际用了什么方法，而不是看它的宣传语。',
      '合规语境 · 《生成式人工智能服务管理暂行办法》对「生成式人工智能」给出了范围界定，并明确要求提升生成内容的准确性与可靠性（来源：src-cac-genai-rules，2023-07-13 发布）。',
      '易混 · 「AI 产品」是产品说法，「LLM」是模型类别：同一个产品可以更换底层模型，同一个模型也可以被装进完全不同的产品。',
    ],
    misconceptions: [
      {
        claim: 'AI 就是 ChatGPT 这类聊天产品的名字，它们指的是同一个东西。',
        correction:
          'AI 是一类目标与技术范畴，聊天产品只是其中一种应用形态。同一产品可以更换底层模型，同一模型也可以被装进完全不同的产品。把两者当同义词，就再也分不清「能力来自哪里」和「产品怎么用它」。',
      },
    ],
    example: {
      label: '本章研究情境 · 虚构校园活动整合研究',
      body: '研究笔记里问「这套系统算不算 AI」，真正需要回答的是：它用了规则匹配、统计模型还是神经网络？范围不同，能承诺的准确度也不同。',
    },
    sources: ['src-cac-genai-rules', 'doc-prd'],
    related: ['ml'],
    nextSteps: '接着看 Machine Learning：它回答「能力是怎么被造出来的」，也解释了为什么模型里的知识只能算统计规律。',
    reviewedAt: REVIEWED_AT,
    reviewNote: REVIEW_NOTE,
  }),

  defineConcept({
    id: 'ml',
    chapterId: CHAPTER_ID,
    order: 2,
    name: 'Machine Learning',
    cn: '机器学习',
    tagline: '用数据与优化过程得到模型参数的方法。',
    aliases: ['ml', 'machine learning', 'machinelearning', '机器学习', '训练方法'],
    contentStatus: 'reviewed',
    oneLiner: '机器学习是通过数据与优化过程得到模型参数的做法，本身不等于「理解」。',
    understand: [
      '机器学习换了一条思路：不把规则一条条写死，而是准备大量样例，让程序在训练过程中调整自己的参数，使输出在样例上尽量接近预期。训练完成后，这组参数就是「模型」。',
      '所以模型里存的是**数据上的统计规律**，不是一份可以查询的资料库。它可能把「常见搭配」学得很好，却不会知道训练结束之后才发布的那条公告。',
      '机器学习能覆盖规则写不完的任务（识别、翻译、生成），代价是行为只能靠数据与评估去约束，很难逐条审计某个判断到底是怎么来的。',
    ],
    inspect: [
      '训练 vs 推理 · 训练是调参数（离线、昂贵、需要数据）；推理是用固定参数算输出（在线、相对便宜）。日常讨论常把两者混为一谈。',
      '数据决定边界 · 训练数据里没有的内容，模型不会「知道」；训练数据里的偏差也会被学进参数。',
      '可核对的实证 · 语言模型的损失随模型规模、数据量与训练算力呈幂律变化（来源：src-arxiv-scaling-laws）；这说明「更大更准」是统计意义上的趋势，不是「更懂事实」。注意这是教学上的引申，论文讨论的是损失而非事实正确性。',
      '易混 · 「训练过海量网页」不等于「记住了这条公告」：公告类的时效信息必须靠检索或工具带进上下文。',
    ],
    misconceptions: [
      {
        claim: '模型训练时读过海量网页，所以它记得每一条公告的具体时间。',
        correction:
          '训练学到的是统计规律与语言模式，不是逐条可检索的记录。具体公告的时间、地点需要检索到原文、并且带来源引用，才能当作依据。',
      },
    ],
    example: {
      label: '本章研究情境 · 虚构校园活动整合研究',
      body: '如果研究结论只靠模型「回忆」公告日期，这个日期就没办法核对；正确做法是把公告放进上下文，或让工具把它读出来。',
    },
    sources: ['src-arxiv-scaling-laws', 'doc-prd'],
    related: ['ai', 'llm'],
    nextSteps: '接着看 LLM：它是机器学习在大规模文本上的一种产物，也是本原型里唯一「会说话」的部件。',
    reviewedAt: REVIEWED_AT,
    reviewNote: REVIEW_NOTE,
  }),

  defineConcept({
    id: 'llm',
    chapterId: CHAPTER_ID,
    order: 3,
    name: 'LLM',
    cn: '大语言模型',
    tagline: '负责语言生成与工具调用请求的模型能力，本身只处理文本。',
    aliases: ['llm', 'large language model', 'largelanguagemodel', '大语言模型', '语言模型', '大模型'],
    contentStatus: 'reviewed',
    oneLiner: 'LLM 是只处理语言的模型本体：读取文本、按训练学到的规律继续生成文本。',
    understand: [
      'LLM 是只做语言处理的模型本体：它读取一段文本，按训练中学到的统计规律继续生成文本。它擅长改写、归纳、按格式作答，但这些输出都来自已有参数，不是去外部查询得到的事实。',
      '它没有内置的互联网访问，也不会自己执行动作。当应用把可用工具的说明一并放进上下文，模型可以产出一段结构化的调用请求；至于这个请求是否被执行，由外部运行环境决定，模型只负责提出请求。',
    ],
    inspect: [
      '机制 · 一次回答就是一次前向计算：输入被切成 token，模型逐 token 生成输出，这个过程叫 inference，不是「查阅资料」。',
      '边界 · 参数学到的是语言与任务的统计规律，不含「刚刚发生的网页内容」；要拿到外部事实，必须由应用检索或调用工具再把结果写回上下文。',
      '接口事实 · 官方接口文档明确提示：模型生成的 tool_calls 参数「可能臆造出函数模式中未定义的参数」，在调用函数之前必须在代码里验证（来源：src-deepseek-chat-api）。',
      '工程事实 · 同一模型换 Harness、换上下文，表现会明显不同：模型能力只是系统能力的一部分。',
    ],
    misconceptions: [
      {
        claim: '大语言模型自带实时联网，所以它说的事实一定是查到的。',
        correction:
          '模型本体不联网，它只是根据上下文续写文本。要拿到外部事实，需要由应用检索资料或调用工具，再把结果放回上下文。因此模型说得流畅不等于内容有依据。',
      },
    ],
    example: {
      label: '示意片段 · 不是真实模型输出',
      body: '「报名一般会提前一周左右截止，建议你尽快联系主办方确认。」——这句话读起来合理，但没有任何可核对的来源。',
    },
    sources: ['src-deepseek-chat-api', 'doc-m0-3-task', 'doc-prd'],
    related: ['agent', 'tool_calling', 'transformer', 'token', 'inference', 'hallucination', 'ml'],
    nextSteps:
      '接着看 Transformer 与 Token：前者是结构，后者是切分单位；两个概念都常被误当成「模型本身」。',
    systemTarget: 'core',
    graph: NODE_LAYOUT.llm,
    reviewedAt: REVIEWED_AT,
    reviewNote:
      'UNDERSTAND 与常见误解沿用 M0.3 已审校文本；M1.2 补入官方接口文档中「参数必须校验」这一条 INSPECT 事实，并核验外部来源。',
  }),

  defineConcept({
    id: 'transformer',
    chapterId: CHAPTER_ID,
    order: 4,
    name: 'Transformer',
    cn: '注意力架构',
    tagline: '以注意力机制处理序列的主流网络结构。',
    aliases: ['transformer', 'attention', 'self attention', 'selfattention', '注意力机制', '注意力架构'],
    contentStatus: 'reviewed',
    oneLiner: 'Transformer 是当前主流大模型采用的网络结构，靠注意力机制在长序列上建模。',
    understand: [
      'Transformer 是一种神经网络**结构**，2017 年在论文《Attention Is All You Need》中提出：它用注意力让序列中的每个位置直接参考其它位置，从而不必像循环网络那样一个词一个词往前传。',
      '这个结构能并行处理、也能建模较远距离的关联，因此成为当前主流大模型的基础结构。但要注意：Transformer 是结构，LLM 是能力范畴——同一结构可以做出不同规模、不同用途的模型。',
      '「注意力」不是人的注意力，也不是模型在「关注重点」：它是一组按相关性加权的数值计算。把它读成「模型思考时看向哪里」是常见的拟人化误读。',
    ],
    inspect: [
      '出处 · 原始论文明确写出「a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely」（来源：src-arxiv-transformer，arXiv:1706.03762v7）。',
      '变体 · 原论文是编码器-解码器结构；后来的主流生成式模型多采用只保留解码器的变体。所以「Transformer = 某个具体模型」并不准确。',
      '能力边界 · 结构本身不含事实知识：知识全部来自训练得到的参数，结构只决定「怎么算」。',
      '易混 · 「注意力权重」常被当成解释模型决策的证据，但它只是计算中间量，不能直接当作「模型为什么这么说」的理由。',
    ],
    misconceptions: [
      {
        claim: 'Transformer 是一种模型，GPT 就是 Transformer。',
        correction:
          'Transformer 是网络结构，具体模型是在这个结构上堆叠、训练、调参得到的产物。结构相同不代表能力相同；把两者等同，会误以为「换了结构就换了智能水平」。',
      },
    ],
    example: {
      label: '本章研究情境 · 虚构校园活动整合研究',
      body: '研究笔记写「该系统基于 Transformer」，只能说明它用了这类结构；能不能读到公告、会不会编日期，取决于有没有检索与核验环节。',
    },
    sources: ['src-arxiv-transformer', 'doc-prd'],
    related: ['llm', 'token'],
    nextSteps: '接着看 Token：结构处理的是 token 序列，因此「模型能看到多少内容」先从切分开始算。',
    reviewedAt: REVIEWED_AT,
    reviewNote: REVIEW_NOTE,
  }),

  defineConcept({
    id: 'token',
    chapterId: CHAPTER_ID,
    order: 5,
    name: 'Token',
    cn: '文本最小单位',
    tagline: '模型读写文本的切分单位，不等于字、词或字符。',
    aliases: ['token', 'tokens', '词元', '文本最小单位', '切分单位'],
    contentStatus: 'published',
    oneLiner: 'token 是模型读写文本时的切分单位：上下文容量、计费与截断都以它计算，而它不等于字符或单词。',
    understand: [
      '模型不直接读「句子」：文本先被分词器切成一个个 token，每个 token 对应词表里的一个编号，模型处理的正是这些编号序列。',
      '中文里一个 token 常常对应 1 个汉字，但**并不固定**：常见词可能合并成一个 token，生僻字、标点与数字常被拆成多个；英文的长单词会被拆成词干与后缀。',
      '因为切分取决于词表，所以同一段文字在不同 tokenizer 下的 token 数不同。这也是为什么不能用「字数 × 固定系数」去估算 token。',
    ],
    inspect: [
      '真实计量 · 官方文档明确：token 是模型表示文本的基本单位，不同模型分词不同、换算比例存在差异，实际 token 数以接口返回的 usage 为准（来源：src-deepseek-token-usage）。',
      '可复算的实测 · Lab 01 用 cl100k_base 与 o200k_base 对同一段中文离线切分并逐条校验：同样 69 个字符，分别是 61 与 43 个 token。',
      '计量影响 · 上下文占用、输出长度上限与计费都按 token 计，所以「压缩字数」和「压缩 token」不是一回事。',
      '易混 · 字节数不等于 token 数：中文 UTF‑8 一个汉字占 3 字节，但可能只对应 1 个 token，也可能被拆成 2–3 个。',
    ],
    misconceptions: [
      {
        claim: '一个汉字就是一个 token，估算 token 数按字数乘 1 就行。',
        correction:
          '中文 token 与汉字并非一一对应：常见词会合并、生僻字会被拆开，不同 tokenizer 结果也不同。可靠做法是用对应编码的分词器计数，或直接读接口返回的 usage。',
      },
    ],
    example: {
      label: 'Lab 01 实测 · 虚构教学数据',
      body: '把 NTC-1001 的摘要放进上下文时，模型看到的不是 87 个字符，而是 78 个（cl100k_base）或 56 个（o200k_base）token。',
    },
    experimentId: 'exp-token-lab',
    sources: ['src-deepseek-token-usage', 'src-deepseek-chat-api'],
    related: ['llm', 'transformer', 'context_window', 'inference'],
    nextSteps: '现在可以打开 Lab 01 亲手观察切分与预算：改编码、改窗口，看看哪些资料被舍弃、为什么。',
    reviewedAt: REVIEWED_AT,
    reviewNote: REVIEW_NOTE,
  }),

  defineConcept({
    id: 'inference',
    chapterId: CHAPTER_ID,
    order: 6,
    name: 'Inference',
    cn: '推理（前向计算）',
    tagline: '把输入变成输出的一次计算过程，不等于「思考」。',
    aliases: ['inference', '推理', '前向计算', '前向传播'],
    contentStatus: 'reviewed',
    oneLiner: '推理是把输入变成一次输出所执行的前向计算；它不读取外部数据，也不保证结论正确。',
    understand: [
      '训练完成之后，使用模型做一次回答就是一次推理：输入被编码成 token 序列，经过网络逐层计算，模型给出下一个 token 的概率分布，选出其中一个，再把它接回输入继续算，直到结束。',
      '所以「模型在推理」描述的是**计算过程**，不是「它在思考」：没有查资料、没有验证，也没有可读的内心独白。',
      '推理阶段的输出质量由三件事共同决定：参数（训练得到的能力）、上下文（这一轮放了什么）、解码设置（如温度与最大长度）。',
    ],
    inspect: [
      '逐 token 生成 · 自回归生成意味着每个输出 token 都依赖此前所有 token；上下文越长，单次生成的开销越大。',
      '输出长度受控 · 接口用 max_tokens 一类参数限制生成长度，达到上限会以 finish_reason=length 结束，内容可能被截断（来源：src-deepseek-chat-api）。',
      '不是「读库」· 推理不会访问训练数据之外的内容；外部事实必须在推理之前由检索或工具放进上下文。',
      '易混 · 中文「推理」也指逻辑推导（reasoning）；本概念取机器学习里的 inference（前向计算）。思考模式输出的「思考内容」同样是生成的文本，不是可审计的计算轨迹。',
    ],
    misconceptions: [
      {
        claim: '模型回答前会先在心里检索资料、再做推理，所以它的结论是有依据的。',
        correction:
          '推理只是用参数做前向计算，没有检索步骤。结论有依据的前提是：这一轮上下文里真的有可核对的资料，并且我们事后做了来源核验。',
      },
    ],
    example: {
      label: '本章研究情境 · 虚构校园活动整合研究',
      body: '第 01 章开场的那段回答就是这样生成的：句子通顺、没有任何检索动作，也没有任何可核对的来源。',
    },
    sources: ['src-deepseek-chat-api', 'src-arxiv-scaling-laws'],
    related: ['llm', 'token'],
    nextSteps: '看完这一章可以进 Story 的第 01 章叙事，或直接进 Lab 01；第 02 章会接着讲「上下文里到底放了什么」。',
    reviewedAt: REVIEWED_AT,
    reviewNote: REVIEW_NOTE,
  }),
]);
