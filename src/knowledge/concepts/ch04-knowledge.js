/**
 * src/knowledge/concepts/ch04-knowledge.js
 * 第 04 章 · 信息与方法（KNOWLEDGE）
 *
 * 交付状态（M1.3）：
 *   6 个概念全部为 `published`：正文（UNDERSTAND / INSPECT）、常见误解、
 *   虚构校园研究示例、语义关系、已核验来源与 Knowledge Lab 实验入口齐备。
 *
 * 本章回答：已连接工具拿回资料之后，系统怎样找到相关内容、切分文档、
 * 组织上下文，并区分「按查询取证」「跨轮次保留」「可复用的方法」三件事。
 *
 * 技术准确性边界（M1.3_TASK §3.1–§3.6）：
 *   · 关键词检索与向量检索是不同方法，不用字符串匹配冒充语义检索；
 *   · chunking 的切分长度在本项目里只是演示参数，不假称真实 token 计数；
 *   · 浏览器只展示**预计算/简化的示例向量**，不声称调用了 Embedding 模型；
 *   · RAG ≠ 向量数据库，检索命中 ≠ 答案正确；
 *   · Memory ≠ 当前上下文、≠ RAG 检索结果；
 *   · Skills 是方法封装，不自动授予工具权限。
 * ------------------------------------------------------------------
 */
import { defineConcept } from './helpers.js';
import { NODE_LAYOUT } from '../layout.js';

const CHAPTER_ID = 'knowledge';
const LAB = 'exp-retrieval-lab';
const REVIEWED_AT = '2026-10-23';
const REVIEW_NOTE =
  'M1.3 重写：18 个第 04–06 章概念按任务书 §3 的 18 条技术红线逐条核对；来源在 2026-10-23 通过 arXiv Atom 接口与原文页面实际抓取核验，无法核验的链接一律未登记。';

export const CHAPTER_04_CONCEPTS = Object.freeze([
  defineConcept({
    id: 'chunking',
    chapterId: CHAPTER_ID,
    order: 1,
    name: 'Chunking',
    cn: '资料切分',
    tagline: '把长资料切成可索引、可检索、可放进上下文的片段。',
    aliases: ['chunking', 'chunk', 'chunks', '切分', '资料切分', '分块', '片段切分'],
    contentStatus: 'published',
    oneLiner:
      'Chunking 是把长文档切成片段的过程：切得太碎会丢掉上下文，切得太大既浪费窗口又降低命中精度。',
    understand: [
      '检索系统通常不能把一整份文档直接塞进上下文：既装不下，也很难说清「答案到底在哪一段」。所以要把资料切成一个个片段（chunk），每段带一个稳定 ID 和来源定位，之后才谈索引与检索。',
      '切分不是纯粹的工程细节，它决定了「一条证据的边界」。按段落切，语义完整但长度参差；按固定长度切，长度整齐却可能把「更正公告」的更正说明与原文切开，检索时只拿到半句。片段边界一变，检索结果就会变。',
    ],
    inspect: [
      '常见策略 · 按段落 / 标题切、按固定长度切（可带重叠）、按语义或结构切；重叠（overlap）用重复一部分内容换取边界处的连续性，代价是索引变大、片段重复。',
      '为什么影响检索 · 片段是检索的最小单位：太长时一个片段里混着多个主题，匹配分数被稀释；太短时缺失上下文，模型拿到也读不懂指代对象。',
      '位置效应 · 检索到的片段最终要放进上下文，而长上下文里信息所处的位置本身会影响模型能否用上它（见来源中的 Lost in the Middle 实验）。',
      '本项目的边界 · Knowledge Lab 里的「片段长度」以**字符**为演示单位，只用来展示边界变化，不声称等于任何模型的分词结果（token 计数见 Lab 01）。',
    ],
    misconceptions: [
      {
        claim: '切分只是预处理细节，切法不会影响最终答案质量。',
        correction:
          '片段边界直接决定检索能拿回什么。切分把一条完整事实劈成两半时，检索可能只命中半句，生成阶段就只能得到残缺证据；反之片段过大时匹配分数被稀释，真正相关的内容可能排在候选之外。',
      },
      {
        claim: '片段越长越安全，反正上下文窗口够大。',
        correction:
          '窗口够大不等于用得上。片段越长，单个片段承载的主题越杂、检索精度越低，还会挤占其它证据的位置；实验显示相关信息落在长上下文中部时反而更容易被忽略。',
      },
    ],
    example: {
      label: '模拟示例 · 虚构校园公告（NTC-1007 更正公告）',
      body: '按段落切分时，摘要里的「调整至 10 月 20 日」与正文里的「现对该日期予以更正」分属两个片段；只命中摘要片段时，系统无法确认「这是一次更正」，只能把结论标为未核实。',
    },
    experimentId: LAB,
    sources: ['src-arxiv-lost-middle', 'src-arxiv-rag', 'doc-m1-3-task', 'doc-prd'],
    related: ['retrieval', 'rag'],
    nextSteps:
      '接着看 Retrieval：片段切好之后，系统靠什么规则把「与问题相关的那几段」找回来。',
    reviewNote: REVIEW_NOTE,
    reviewedAt: REVIEWED_AT,
  }),

  defineConcept({
    id: 'retrieval',
    chapterId: CHAPTER_ID,
    order: 2,
    name: 'Retrieval',
    cn: '检索',
    tagline: '按查询从资料集合里找出相关片段。',
    aliases: ['retrieval', 'retrieve', '检索', '召回', '资料检索'],
    contentStatus: 'published',
    oneLiner:
      '检索是按当前查询从资料集合中找回相关片段的过程：它可以是关键词匹配，也可以是基于向量的相似度计算，两者不是同一件事。',
    understand: [
      '检索解决的是「从一堆资料里找出相关的那几条」。用户提出问题或系统生成查询后，检索器在已索引的片段上打分排序，返回前若干个候选片段，并附上来源定位。',
      '关键在于：检索是一种**筛选**，不是**理解**。关键词检索靠字面重合，能被精确词命中，却对同义改写无能为力；向量检索靠向量距离，能跨越字面差异，却也可能因为「看起来相近」而召回不相关的内容。两种方法各有盲区，说「我们做了语义检索」时应当说清到底用了哪一种。',
    ],
    inspect: [
      '关键词检索 · 以词项重合度或词频统计打分（如 BM25 一类方法），可解释性强、不需要模型，但对同义词与改写敏感度低。',
      '向量检索 · 先把片段与查询编码成向量，再按余弦相似度等度量比较（dense retrieval）；它需要 embedding 模型与向量索引，召回结果的好坏取决于编码质量。',
      '混合检索 · 实际系统常把两路结果融合并重排（rerank），再用来源、时间、栏目等元数据过滤，避免单纯分数排序带来的偏差。',
      '能力边界 · 检索只保证「返回它认为相关的片段」，不保证片段本身正确、不保证覆盖全部相关资料，也不对冲突资料做裁决。',
    ],
    misconceptions: [
      {
        claim: '检索就是搜索框里的字符串匹配，做了检索就等于做了语义理解。',
        correction:
          '字符串匹配只是关键词检索一种实现。语义相似度要靠 embedding 编码后比较向量，两者在实现、成本与失败模式上都不同；把简单匹配叫成语义检索，会让人误以为系统理解同义改写。',
      },
      {
        claim: '检索命中了，答案就一定有依据。',
        correction:
          '命中只说明「这段文字与查询的相似度高」。片段可能已过期、与另一份公告冲突，或者只覆盖问题的一部分；是否成立仍要靠来源核对与冲突处理。',
      },
    ],
    example: {
      label: '模拟示例 · 同一查询的两种召回',
      body: '查询「秋季招聘会哪天办」时，关键词检索命中含「招聘会」的 NTC-1008 与转发公告 NTC-1009；两份公告给出不同日期，检索不会替你裁决——冲突仍需核验流程处理。',
    },
    experimentId: LAB,
    sources: ['src-arxiv-dpr', 'src-arxiv-rag', 'doc-m1-3-task', 'doc-prd'],
    related: ['rag', 'chunking', 'context_engineering'],
    nextSteps:
      '检索之后通常是 Embedding 与 RAG：先理解向量表示为什么能近似语义，再看检索到的片段如何进入生成过程。',
    reviewNote: REVIEW_NOTE,
    reviewedAt: REVIEWED_AT,
  }),

  defineConcept({
    id: 'embedding',
    chapterId: CHAPTER_ID,
    order: 3,
    name: 'Embedding',
    cn: '向量表示',
    tagline: '把文本映射成向量，用距离近似表达语义相近程度。',
    aliases: ['embedding', 'embeddings', '向量', '向量表示', '嵌入', '语义向量'],
    contentStatus: 'published',
    oneLiner:
      'Embedding 是把数据映射为定长向量的表示方法；向量距离只是「相近程度」的近似，不等于正确性或相关性判断。',
    understand: [
      'Embedding 把一段文本（也可以是图片、音频）编码成一串数字，也就是向量。训练目标让「意思相近的内容」在向量空间里彼此靠近，于是可以用余弦相似度这类度量快速比较成千上万条片段。',
      '需要强调的是：向量表示的是**学到的相似性**，不是事实核验。它能告诉你「这两段话说的事情很像」，但不能告诉你「这句话是真的」，也无法保证「差异很大的表述一定不相关」——同义改写是它的强项，反讽、否定与数字差异是它常见的盲区。',
    ],
    inspect: [
      '怎么来 · 一般由专门的编码模型产出（早期的词向量方法就已把词映射到连续向量空间）；模型固定后，同一段文本每次得到同一个向量。',
      '怎么用 · 建索引时把片段向量存下来，查询时编码查询向量，比较距离取 top-k；因此 embedding 的质量直接决定向量检索的上限。',
      '为什么相近不等于正确 · 相似度只反映训练中学到的分布规律：一段错误但与问题高度相似的说法，同样会拿到高分。',
      '本项目的边界 · Knowledge Lab 展示的是**预计算的二维示例向量**（人工设定的演示坐标）与简化数学演示，浏览器里没有任何 Embedding 模型，也不发任何请求。',
    ],
    misconceptions: [
      {
        claim: '向量相似度高就说明内容正确、相关。',
        correction:
          '相似度高只表示「在向量空间里靠近」。它既可能带来有用召回，也可能召回措辞相近但内容过时或错误的片段；正确性必须回到原文与来源核验。',
      },
      {
        claim: '既然有向量，检索就可以完全摆脱关键词。',
        correction:
          '向量与关键词各自有盲区：专有名词、编号、精确日期这类字面特征，关键词往往更稳；同义改写与跨语言场景，向量更擅长。工程上常见的是混合检索与重排，而不是二选一。',
      },
    ],
    example: {
      label: '模拟示例 · 二维投影（非真实模型输出）',
      body: '在演示坐标里，「招聘会时间」「校园招聘会安排」两段文本被放在相近位置，「实验室开放日」较远；这个坐标是人工设定的示意值，用来解释「距离近 ≈ 语义近」，不是任何模型算出来的向量。',
    },
    experimentId: LAB,
    sources: ['src-arxiv-word2vec', 'src-arxiv-dpr', 'doc-m1-3-task'],
    related: ['rag'],
    nextSteps:
      '理解了向量表示，就能看清 RAG 里「向量检索式」与「关键词式」两条实现路线的差别。',
    reviewNote: REVIEW_NOTE,
    reviewedAt: REVIEWED_AT,
  }),

  defineConcept({
    id: 'rag',
    chapterId: CHAPTER_ID,
    order: 4,
    name: 'RAG',
    cn: '检索增强生成',
    tagline: '先检索出相关片段、放进上下文，再据此生成回答的流程。',
    aliases: [
      'rag',
      'retrieval augmented generation',
      'retrievalaugmentedgeneration',
      '检索增强生成',
      '检索增强',
      '知识库问答',
    ],
    contentStatus: 'published',
    oneLiner:
      'RAG 是一条流程：切分建索引 → 按问题检索片段 → 把片段放进上下文 → 依据片段生成回答；它不等于向量数据库。',
    understand: [
      'RAG（Retrieval-Augmented Generation）把「外部资料」接进生成过程：先把资料切分并建立索引，用当前问题检索出相关片段，再把这些片段连同问题一起放进上下文，让模型依据片段作答，并尽量把回答指向具体来源。',
      '它补的是模型参数里没有的资料，而不是改模型本身。因此 RAG 能降低「无依据编造」的概率，却不能保证片段可靠、不能自动消解资料之间的冲突，也不能替你完成权限控制与执行安全——那些是第 05、06 章的事。',
    ],
    inspect: [
      '四个环节 · 切分（chunking）→ 建索引 → 检索 → 片段入上下文生成；任何一环变差，最终回答都会变差，且很难从答案本身看出是哪一环的问题。',
      '向量只是可选组件 · 向量检索式 RAG 用 embedding 计算语义相似度，关键词式 RAG 不用向量；「RAG 必须配向量数据库」是常见的错误归因。',
      '能力边界 · 检索为空时应当输出「资料不足 / 未验证」，而不是编造来源；片段互相矛盾时应当并列呈现并标注未决，而不是挑一个看起来顺眼的。',
      '与记忆的区别 · RAG 每次按当前查询去外部取证；记忆是跨轮次保留的信息沉淀。二者常组合使用，但职责不同。',
    ],
    misconceptions: [
      {
        claim: '接上向量数据库就是 RAG，RAG 就等于向量数据库。',
        correction:
          '向量数据库只是「向量检索」的一种存储与索引实现。RAG 的核心是「检索结果参与生成」这条流程；用关键词检索配合纯文本索引同样可以构成 RAG，没有向量库的 RAG 完全成立。',
      },
      {
        claim: 'RAG 出来的答案有引用，就一定可信。',
        correction:
          '引用只能证明「这段文字出现在检索结果里」。片段可能过期、可能被更正的公告推翻，也可能与另一份公告冲突；可信度来自来源核验与冲突处理，而不是引用的存在。',
      },
    ],
    example: {
      label: '流程示意 · 虚构校园公告（本地模拟）',
      body: '问题「NTC-1001 的截止报名日期」→ 检索命中该公告的摘要片段 → 片段进入上下文 → 规则驱动的模拟答案引用该片段中的日期，并标注来源 ID。检索不到时输出「资料不足」，不生成引用。',
    },
    experimentId: LAB,
    sources: ['src-arxiv-rag', 'src-arxiv-lost-middle', 'doc-m1-3-task', 'doc-prd'],
    related: ['retrieval', 'embedding', 'chunking', 'memory', 'agent'],
    nextSteps:
      'RAG 解决「这一轮把什么资料放进上下文」，接下来的 Memory 与 Skills 解决另外两件事：跨轮次保留什么、按什么方法做事。',
    systemTarget: 'none',
    graph: NODE_LAYOUT.rag,
    reviewNote: REVIEW_NOTE,
    reviewedAt: REVIEWED_AT,
  }),

  defineConcept({
    id: 'memory',
    chapterId: CHAPTER_ID,
    order: 5,
    name: 'Memory',
    cn: '记忆',
    tagline: '跨轮次保留并再次使用的信息，靠外部存储实现。',
    aliases: ['memory', '记忆', '长期记忆', '记忆机制', '记忆存储'],
    contentStatus: 'published',
    oneLiner:
      '记忆是系统把过去的信息保存下来、在后续轮次再取出来用的机制；它不等于当前上下文，也不等于 RAG 的检索结果。',
    understand: [
      '模型的参数在一次训练之后就固定了，它不会因为你今天说了什么而「记住」。所谓记忆，是系统在模型之外把信息写下来（偏好、历史摘要、任务状态等），下次需要时再挑一部分重新放进上下文。',
      '因此记忆的关键不只是「存」，而是「存什么、什么时候取、什么时候清」。存得太多，会把过时或无关的信息一遍遍塞回上下文，甚至污染后续判断；没有清除入口，用户就无法收回自己的数据。',
    ],
    inspect: [
      '与上下文窗口的关系 · 窗口是一次请求能容纳的内容上限，记忆是窗口之外的外部存储；记忆必须被「取出来」才有作用。',
      '与 RAG 的区别 · RAG 按查询去资料库里找证据，记忆按用户/任务保留状态与偏好；同一份资料既可能被检索到，也可能被摘要进记忆，但两条链路的目的不同。',
      '常见实现 · 分层记忆（把近期对话放在快速层、把长期摘要放进慢速层并搬运）、结构化笔记、向量化历史检索等；MemGPT 一类工作借用了操作系统的分层内存思路。',
      '风险与边界 · 记忆可能过时、可能被错误写入、也可能包含不应长期保存的个人信息；必须提供可见、可改、可删的控制，而不是「悄悄记住一切」。',
    ],
    misconceptions: [
      {
        claim: '模型记住了我上次说的话，说明它的参数被更新了。',
        correction:
          '常规使用中模型参数不会因对话而改变。所谓「记住」是应用把上次的内容存到了外部，再在下一次请求里重新放回上下文——这正是记忆属于「系统能力」而非「模型能力」的原因。',
      },
      {
        claim: '记忆就是 RAG，把历史记录向量化检索一下而已。',
        correction:
          '向量化历史只是实现记忆的一种手段。记忆的核心是「跨轮次保留并复用」这件事本身，可以用摘要、结构化字段或数据库实现；把它们混为一谈会漏掉记忆特有的写入、过期与清除问题。',
      },
    ],
    example: {
      label: '模拟示例 · Knowledge Lab 的本地记忆',
      body: '用户在实验里点了「保存本次偏好」后，系统把「关注点：日期冲突；输出：表格」写入本地存储，并在下一次实验时作为可选项重新载入；点击清除后该条消失，检索结果与当前上下文都不受影响。',
    },
    experimentId: LAB,
    sources: ['src-arxiv-memgpt', 'src-anthropic-context-engineering', 'doc-m1-3-task'],
    related: ['rag', 'context_window'],
    nextSteps:
      '最后一块是关于「怎么做」：Skills 把可复用的方法写成说明，与检索、记忆三者职责完全不同。',
    reviewNote: REVIEW_NOTE,
    reviewedAt: REVIEWED_AT,
  }),

  defineConcept({
    id: 'skills',
    chapterId: CHAPTER_ID,
    order: 6,
    name: 'Skills',
    cn: '技能说明',
    tagline: '按需加载的任务方法与资源封装，本身不是工具，也不等同于授权。',
    aliases: ['skills', 'skill', 'skill.md', 'skillmd', '技能', '技能说明', '技能包'],
    contentStatus: 'published',
    oneLiner:
      'Skills 是把「某类任务该怎么做」写成可按需加载的说明与资源：它改变方法步骤，但不自动授予工具权限。',
    understand: [
      'Skills 通常是一个说明文件（例如 SKILL.md）加可选资源（模板、脚本、参考资料），写清某类任务的步骤、检查项与注意事项。系统只先加载名称与描述这类元数据，判断相关时才把正文读进上下文——这种渐进加载避免让一份长说明长期占着窗口。',
      '要分清「告诉系统怎么做」与「真的去做」：加载一份 Skill 只是获得方法，实际动作仍要由具备相应权限的工具完成。反过来说，Skill 也不因此变得无害——来源不明的 Skill 可能诱导错误做法，随附脚本同样要按工具的权限受控。',
    ],
    inspect: [
      '加载方式 · 渐进披露：元数据常驻、正文按需读入、附加文件再按需读入；这是它与「把所有说明一次性塞进系统指令」的关键差别。',
      '内容形态 · 说明文本 + 可选资源；资源被读取不等于被允许执行，执行权限由运行环境决定。',
      '权限边界 · 启用 Skill 不应该改变工具白名单、权限位或网络访问范围；如果一个「技能开关」顺带放开了权限，那是权限系统被绕过，而不是 Skill 的能力。',
      '本项目的边界 · Knowledge Lab 的「公告核验方法」Skill 只改变模拟流程的步骤与检查项，工具权限面板始终独立可见且不受影响。',
    ],
    misconceptions: [
      {
        claim: '装好 Skills 就获得了读写文件、联网的能力。',
        correction:
          'Skill 是方法与资源的封装，不授予任何权限，也不会自己执行动作。真正的读写与联网要由运行环境提供的工具完成，并在那一侧按权限规则检查；加载说明与获得授权是两件事。',
      },
      {
        claim: 'Skill 只是文档，读进来绝对安全。',
        correction:
          'Skill 可能包含可执行脚本与外部依赖，也可能被恶意作者写进诱导性指令。来自不可信来源的 Skill 需要先审查；它能做什么，最终仍受工具权限与沙箱边界约束。',
      },
    ],
    example: {
      label: '模拟示例 · 一张「公告核验方法」Skill 卡',
      body: '启用后流程从「检索 → 直接作答」变为「检索 → 检查发布主体与发布日期 → 检查是否有更正关系 → 输出结论或未决」；步骤变多、结论更保守，但可用的工具与权限集合完全不变。',
    },
    experimentId: LAB,
    sources: ['src-anthropic-agent-skills', 'doc-m1-3-task', 'doc-prd'],
    related: ['agent'],
    nextSteps:
      '第 04 章到此结束：检索与上下文增强改善了信息可用性，但没有解决「谁来决定下一步、谁来兜底」。第 05 章进入执行系统。',
    systemTarget: 'none',
    graph: NODE_LAYOUT.skills,
    reviewNote: REVIEW_NOTE,
    reviewedAt: REVIEWED_AT,
  }),
]);
