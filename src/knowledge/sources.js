/**
 * src/knowledge/sources.js
 * ------------------------------------------------------------------
 * 知识来源注册表（M1.2 A07：每概念有核实过的来源元数据，无伪造来源）。
 *
 * 原则（在 M1.1 基础上加强）：
 *   · **不编造** URL、作者、版本与日期：每个 external 条目都记录了
 *     `checkedAt`（实际抓取核验的日期）、`versionOrDate`（页面上真实可见的
 *     版本号或日期）与 `claim`（这条来源**具体支持哪一句断言**）；
 *   · 面向中国大陆用户：优先选择可直连的中文官方文档与政府法规原文；
 *     arxiv.org / modelcontextprotocol.io 为国际学术与规范站点，本环境实测可直连；
 *   · 抓取失败或正文取不到的链接**一律不登记**（例如 openai.com 与
 *     platform.claude.com 的文档页在本环境被 Cloudflare 拦截，MDN 连接失败），
 *     这些失败记录写在 docs/DELIVERY_M1.2.md 的「来源核验记录」里，
 *     不进入本表，也不出现在任何知识页上；
 *   · M0.4 的 MISSION 001 虚构研究公告属于**研究包数据**，与知识来源严格分开。
 * ------------------------------------------------------------------
 */

/**
 * 来源类型：
 *   internal —— 仓库内文档（可逐字核对，无 URL）
 *   external —— 外部权威资料（必须有可核验 https URL 且 reviewed=true）
 */
export const SOURCE_TYPES = Object.freeze({
  internal: '仓库内文档（无外部链接）',
  external: '外部资料（已核验 URL）',
});

/** 来源登记表：id 永久稳定，正文通过 id 引用 */
function withAuditMetadata(records) {
  return Object.fromEntries(Object.entries(records).map(([id, source]) => [id, Object.freeze({
    ...source,
    org: source.org || 'AGENT / ZERO 项目',
    reviewStatus: source.reviewed ? 'reviewed' : 'needs_review',
    // 2026-10-25 实际通过浏览工具读取全部30条外部原始页面，详见内容审查报告。
    ...(source.type === 'external' ? { checkedAt: '2026-10-25' } : {}),
  })]));
}
export const SOURCES = Object.freeze(withAuditMetadata({
  /* ================================================================
   * 一、仓库内文档（可逐字核对）
   * ================================================================ */
  'doc-m0-3-task': Object.freeze({
    id: 'doc-m0-3-task',
    type: 'internal',
    title: 'M0.3_TASK.md · 知识节点与关系审校任务书',
    where: 'docs/M0.3_TASK.md',
    url: null,
    versionOrDate: '仓库内文件',
    checkedAt: null,
    reviewed: true,
    claim: '首期 10 个概念的中文解释与语义关系由该任务书约束并逐条人工配置。',
  }),
  'doc-m1-1-task': Object.freeze({
    id: 'doc-m1-1-task',
    type: 'internal',
    title: 'M1.1_TASK.md · 知识架构与学习基础任务书',
    where: 'docs/M1.1_TASK.md',
    url: null,
    versionOrDate: '仓库内文件',
    checkedAt: null,
    reviewed: true,
    claim: '章节注册表、36 概念索引与内容状态规则来自该任务书。',
  }),
  'doc-m1-2-task': Object.freeze({
    id: 'doc-m1-2-task',
    type: 'internal',
    title: 'M1.2_TASK.md · AI 基础与工具交互任务书',
    where: 'docs/M1.2_TASK.md',
    url: null,
    versionOrDate: '仓库内文件',
    checkedAt: '2026-10-25',
    reviewed: true,
    claim: 'M1.2_TASK.md 已于本轮补充并实际阅读核对。第01–03章分层内容、真实分词样例、确定性上下文实验与既有 Tool Calling/MCP 复用要求均在原任务书中明确。',
  }),
  'doc-prd': Object.freeze({
    id: 'doc-prd',
    type: 'internal',
    title: 'PRD · 产品需求与技术边界',
    where: 'docs/PRD .md',
    url: null,
    versionOrDate: '仓库内文件',
    checkedAt: null,
    reviewed: true,
    claim: '术语边界（LLM ≠ Agent、MCP ≠ Tool、Skills ≠ 权限等）以 PRD 为准。',
  }),
  'doc-design-system': Object.freeze({
    id: 'doc-design-system',
    type: 'internal',
    title: 'DESIGN_SYSTEM.md · 视觉与文案规范',
    where: 'docs/DESIGN_SYSTEM.md',
    url: null,
    versionOrDate: '仓库内文件',
    checkedAt: null,
    reviewed: true,
    claim: '黑曜基底、精密线条、Cyan 活动信号与中文可读性要求。',
  }),
  'src-index-draft': Object.freeze({
    id: 'src-index-draft',
    type: 'internal',
    title: '概念索引草稿（尚未审校）',
    where: 'src/knowledge/concepts/',
    url: null,
    versionOrDate: '仓库内文件',
    checkedAt: null,
    reviewed: false,
    claim: '仅有索引级说明，正文与来源核验未完成；不得当作已审校内容。',
  }),

  /* ================================================================
   * 二、学术论文（arxiv.org，本环境实测 200）
   * ================================================================ */
  'src-arxiv-transformer': Object.freeze({
    id: 'src-arxiv-transformer',
    type: 'external',
    title: 'Attention Is All You Need',
    org: 'arXiv（作者 Vaswani 等，Google Brain / Google Research / 多伦多大学）',
    where: 'arxiv.org/abs/1706.03762',
    url: 'https://arxiv.org/abs/1706.03762',
    versionOrDate: 'arXiv:1706.03762v7（2023-08-02 修订；v1 于 2017-06-12 提交）',
    checkedAt: '2026-10-22',
    reviewed: true,
    claim: '提出 Transformer——一种完全基于注意力机制、去掉循环与卷积的序列转导网络结构，即本文所讲「Transformer」的原始出处。',
  }),
  'src-arxiv-scaling-laws': Object.freeze({
    id: 'src-arxiv-scaling-laws',
    type: 'external',
    title: 'Scaling Laws for Neural Language Models',
    org: 'arXiv（作者 Kaplan、McCandlish、Henighan 等）',
    where: 'arxiv.org/abs/2001.08361',
    url: 'https://arxiv.org/abs/2001.08361',
    versionOrDate: 'arXiv:2001.08361v1（2020-01-23 提交）',
    checkedAt: '2026-10-22',
    reviewed: true,
    claim: '语言模型的损失随模型规模、数据量与训练算力呈幂律变化——支持「参数学到的是训练数据上的统计规律」这一说法（教学文案中属于引申，已在正文标注）。',
  }),
  'src-arxiv-hallucination-survey': Object.freeze({
    id: 'src-arxiv-hallucination-survey',
    type: 'external',
    title: 'A Survey on Hallucination in Large Language Models: Principles, Taxonomy, Challenges, and Open Questions',
    org: 'arXiv（作者 Huang、Yu、Ma 等；已被 ACM TOIS 接收，DOI 10.1145/3703155）',
    where: 'arxiv.org/abs/2311.05232',
    url: 'https://arxiv.org/abs/2311.05232',
    versionOrDate: 'arXiv:2311.05232v2（2024-11-19 修订）',
    checkedAt: '2026-10-22',
    reviewed: true,
    claim: '对 LLM 幻觉给出系统性分类（taxonomy）、成因分析与检测方法综述——支持「幻觉有不同类型、需要分开讨论」的说法。',
  }),

  /* ================================================================
   * 三、中文官方文档与法规（面向中国大陆用户优先）
   * ================================================================ */
  'src-deepseek-token-usage': Object.freeze({
    id: 'src-deepseek-token-usage',
    type: 'external',
    title: 'Token 用量计算 · DeepSeek API 文档',
    org: 'DeepSeek（深度求索）官方 API 文档',
    where: 'api-docs.deepseek.com/zh-cn/quick_start/token_usage',
    url: 'https://api-docs.deepseek.com/zh-cn/quick_start/token_usage',
    versionOrDate: '文档页未标注版本；核验时间 2026-10-22',
    checkedAt: '2026-10-22',
    reviewed: true,
    claim: 'token 是模型表示文本的基本单位；不同模型分词不同、换算比例有差异，实际 token 数以模型返回的 usage 为准——直接支持「token ≠ 字符 / 单词」和「不同 tokenizer 结果不同」。',
  }),
  'src-deepseek-chat-api': Object.freeze({
    id: 'src-deepseek-chat-api',
    type: 'external',
    title: 'Chat Completions API · DeepSeek API 文档',
    org: 'DeepSeek（深度求索）官方 API 文档',
    where: 'api-docs.deepseek.com/zh-cn/api/create-chat-completion',
    url: 'https://api-docs.deepseek.com/zh-cn/api/create-chat-completion',
    versionOrDate: '文档页未标注版本；核验时间 2026-10-22',
    checkedAt: '2026-10-22',
    reviewed: true,
    claim: 'messages 支持 system / user / assistant / tool 四种角色（支持 system_prompt 的定位）；max_tokens 与「输入 + 输出总长度受上下文长度限制」、finish_reason=length 时内容可能被部分截断（支持 context_window 与截断）；tool_calls 的 arguments 由模型生成且「可能臆造出函数模式中未定义的参数，调用前需在代码中验证」（支持 tools / tool_calling / function_calling 的执行分工与参数校验）。',
  }),
  'src-deepseek-tool-calls': Object.freeze({
    id: 'src-deepseek-tool-calls',
    type: 'external',
    title: 'Tool Calls · DeepSeek API 指南',
    org: 'DeepSeek（深度求索）官方 API 文档',
    where: 'api-docs.deepseek.com/zh-cn/guides/tool_calls',
    url: 'https://api-docs.deepseek.com/zh-cn/guides/tool_calls',
    versionOrDate: '文档页未标注版本；核验时间 2026-10-22',
    checkedAt: '2026-10-22',
    reviewed: true,
    claim: '明确写出「函数功能需由用户提供，模型本身不执行具体函数」，并把流程拆成模型产出调用请求 → 用户执行函数 → 结果回传模型——直接支持「模型只提出请求、执行在运行环境」。',
  }),
  'src-deepseek-pricing': Object.freeze({
    id: 'src-deepseek-pricing',
    type: 'external',
    title: '模型 & 价格 · DeepSeek API 文档',
    org: 'DeepSeek（深度求索）官方 API 文档',
    where: 'api-docs.deepseek.com/zh-cn/quick_start/pricing',
    url: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing',
    versionOrDate: '文档页未标注版本；核验时间 2026-10-22',
    checkedAt: '2026-10-22',
    reviewed: true,
    claim: '页面列出各模型的「上下文长度 1M」「输出长度 最大 384K」——支持「上下文窗口是按 token 计的容量上限，且输入与输出共同占用」这一说法；具体数值随模型不同，正文不把任何单一数值当作通用承诺。',
  }),
  'src-cac-genai-rules': Object.freeze({
    id: 'src-cac-genai-rules',
    type: 'external',
    title: '生成式人工智能服务管理暂行办法',
    org: '国家互联网信息办公室等七部门（令第 15 号），中国网信网发布',
    where: 'cac.gov.cn/2023-07/13/c_1690898327029107.htm',
    url: 'https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm',
    versionOrDate: '2023-07-13 发布，2023-08-15 施行',
    checkedAt: '2026-10-22',
    reviewed: true,
    claim: '第七条要求训练数据「增强训练数据的真实性、准确性、客观性、多样性」，第四条（五）要求「提高生成内容的准确性和可靠性」——支持「生成内容必须做真实性核验，不能只凭流畅度判断」这一合规语境。',
  }),
  'src-bigmodel-http': Object.freeze({
    id: 'src-bigmodel-http',
    type: 'external',
    title: 'HTTP API 调用 · 智谱 AI 开放文档',
    org: '智谱 AI（Zhipu）开放平台文档',
    where: 'docs.bigmodel.cn/cn/guide/develop/http/introduction',
    url: 'https://docs.bigmodel.cn/cn/guide/develop/http/introduction',
    versionOrDate: '文档页未标注版本；核验时间 2026-10-22',
    checkedAt: '2026-10-22',
    reviewed: true,
    claim: '中文说明如何通过 HTTP 请求调用模型接口（请求地址、鉴权头、JSON 请求体）——支持「API 是软件之间的调用约定，模型接口本身也是 API」这一说法。',
  }),
  'src-rfc9110': Object.freeze({
    id: 'src-rfc9110',
    type: 'external',
    title: 'RFC 9110: HTTP Semantics',
    org: 'IETF（Internet Engineering Task Force），STD 97',
    where: 'rfc-editor.org/rfc/rfc9110.html',
    url: 'https://www.rfc-editor.org/rfc/rfc9110.html',
    versionOrDate: '2022 年 6 月发布（STD 97）',
    checkedAt: '2026-10-22',
    reviewed: true,
    claim: 'HTTP 的语义规范：请求 / 响应模型、方法、状态码——支持「API 建立在客户端与服务器之间的请求-响应约定之上」。',
  }),

  /* ================================================================
   * 四、MCP 协议与工程实践
   * ================================================================ */
  'src-mcp-architecture': Object.freeze({
    id: 'src-mcp-architecture',
    type: 'external',
    title: 'Architecture overview · Model Context Protocol',
    org: 'Model Context Protocol（官方文档站 modelcontextprotocol.io）',
    where: 'modelcontextprotocol.io/docs/2026-07-28/learn/architecture',
    url: 'https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture',
    versionOrDate: 'Version 2026-07-28（页面标注 latest）',
    checkedAt: '2026-10-22',
    reviewed: true,
    claim: '原文写明 MCP 采用 client-server 架构：MCP host（AI 应用）为每个 MCP server 创建一个 MCP client 来建立连接——支持 Host / Client / Server 三角色划分。',
  }),
  'src-mcp-spec': Object.freeze({
    id: 'src-mcp-spec',
    type: 'external',
    title: 'Specification · Model Context Protocol（2025-06-18 版）',
    org: 'Model Context Protocol（官方规范）',
    where: 'modelcontextprotocol.io/specification/2025-06-18',
    url: 'https://modelcontextprotocol.io/specification/2025-06-18',
    versionOrDate: '规范版本 2025-06-18（架构文档已更新到 2026-07-28，引用时须写明版本）',
    checkedAt: '2026-10-22',
    reviewed: true,
    claim: '规范写明 Server 可向 Client 提供 Resources（上下文与数据）、Prompts（模版化消息与工作流）、Tools（供模型执行的函数）三类能力——支持「MCP Server 不只是工具」。',
  }),
  'src-anthropic-mcp-announce': Object.freeze({
    id: 'src-anthropic-mcp-announce',
    type: 'external',
    title: 'Introducing the Model Context Protocol · Anthropic',
    org: 'Anthropic（Anthropic PBC）',
    where: 'anthropic.com/news/model-context-protocol',
    url: 'https://www.anthropic.com/news/model-context-protocol',
    versionOrDate: '页面未标注发布日期；页脚 © 2026 Anthropic PBC',
    checkedAt: '2026-10-22',
    reviewed: true,
    claim: '宣布开源 MCP，称其为「connecting AI assistants to the systems where data lives」的开放标准——支持「MCP 是连接协议，用于把数据源与工具接到 AI 应用」，并说明它不等于模型能力本身。',
  }),
  'src-anthropic-context-engineering': Object.freeze({
    id: 'src-anthropic-context-engineering',
    type: 'external',
    title: 'Effective context engineering for AI agents · Anthropic',
    org: 'Anthropic（Anthropic PBC，Research 栏目）',
    where: 'anthropic.com/research/effective-context-engineering-for-ai-agents',
    url: 'https://www.anthropic.com/research/effective-context-engineering-for-ai-agents',
    versionOrDate: '页面未标注发布日期；页脚 © 2026 Anthropic PBC',
    checkedAt: '2026-10-22',
    reviewed: true,
    claim: '给出上下文工程的定义（在有限上下文预算内维护「最小的高信号 token 集合」），并列出压缩、结构化笔记、子代理三种取舍做法——支持「上下文工程 = 有限的预算内做取舍」。',
  }),

  /* ================================================================
   * 五、M1.3 新增：检索 / 记忆 / 技能 / 执行 / 可靠性
   *
   * 核验方式（2026-10-23）：
   *   · arXiv 条目通过 export.arxiv.org 的 Atom 接口逐条取回标题、作者、
   *     版本与修订日期，再用摘要原文核对 claim；
   *   · Anthropic 的三篇文章与 Simon Willison 的文章直接抓取正文核对，
   *     注意实际响应地址是 /research/ 前缀（/engineering/ 会被重定向）；
   *   · OpenTelemetry 文档页实测 200，正文取到导航与页头，claim 只写
   *     「trace 由 span 组成、记录操作与时间关系」这一页面上成立的通用定义。
   * ------------------------------------------------------------------
   */
  'src-arxiv-rag': Object.freeze({
    id: 'src-arxiv-rag',
    type: 'external',
    title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks',
    org: 'arXiv（作者 Lewis、Perez、Karpukhin 等；NeurIPS 2020）',
    where: 'arxiv.org/abs/2005.11401',
    url: 'https://arxiv.org/abs/2005.11401',
    versionOrDate: 'arXiv:2005.11401v4（2021-04-12 修订；v1 于 2020-05-22 提交）',
    checkedAt: '2026-10-23',
    reviewed: true,
    claim: '提出 RAG：把参数化记忆（预训练 seq2seq 模型）与非参数化记忆（维基百科的稠密向量索引，经神经检索器访问）结合用于生成——支持「RAG = 检索到的外部片段参与生成」，也支持「检索命中不等于答案正确」。',
  }),
  'src-arxiv-dpr': Object.freeze({
    id: 'src-arxiv-dpr',
    type: 'external',
    title: 'Dense Passage Retrieval for Open-Domain Question Answering',
    org: 'arXiv（作者 Karpukhin、Oğuz、Min 等；EMNLP 2020）',
    where: 'arxiv.org/abs/2004.04906',
    url: 'https://arxiv.org/abs/2004.04906',
    versionOrDate: 'arXiv:2004.04906v3（2020-09-30 修订；v1 于 2020-04-10 提交）',
    checkedAt: '2026-10-23',
    reviewed: true,
    claim: '摘要明确对比两类方法：传统稀疏向量模型（TF-IDF、BM25）是当时的事实标准，而稠密表示（embedding）只用学习到的向量即可实现检索——直接支持「关键词检索与向量检索是不同方法，不能互相冒充」。',
  }),
  'src-arxiv-word2vec': Object.freeze({
    id: 'src-arxiv-word2vec',
    type: 'external',
    title: 'Efficient Estimation of Word Representations in Vector Space',
    org: 'arXiv（作者 Mikolov、Chen、Corrado、Dean）',
    where: 'arxiv.org/abs/1301.3781',
    url: 'https://arxiv.org/abs/1301.3781',
    versionOrDate: 'arXiv:1301.3781v3（2013-09-07 修订；v1 于 2013-01-16 提交）',
    checkedAt: '2026-10-23',
    reviewed: true,
    claim: '提出两种从大规模语料计算词向量（连续向量表示）的模型结构，并用词相似度任务衡量向量质量——支持「embedding 是把数据映射为向量表示，相近程度可用向量距离近似」。',
  }),
  'src-arxiv-lost-middle': Object.freeze({
    id: 'src-arxiv-lost-middle',
    type: 'external',
    title: 'Lost in the Middle: How Language Models Use Long Contexts',
    org: 'arXiv（作者 Liu、Lin、Hewitt 等；TACL 2023）',
    where: 'arxiv.org/abs/2307.03172',
    url: 'https://arxiv.org/abs/2307.03172',
    versionOrDate: 'arXiv:2307.03172v3（2023-11-20 修订；v1 于 2023-07-06 提交）',
    checkedAt: '2026-10-23',
    reviewed: true,
    claim: '实验显示：相关信息在长上下文中的位置会显著影响表现，信息在开头或结尾时往往最好、落在中间时明显下降——支持「切分粒度与片段在上下文中的位置都会影响检索/回答效果」。',
  }),
  'src-arxiv-memgpt': Object.freeze({
    id: 'src-arxiv-memgpt',
    type: 'external',
    title: 'MemGPT: Towards LLMs as Operating Systems',
    org: 'arXiv（作者 Packer、Wooders、Lin 等）',
    where: 'arxiv.org/abs/2310.08560',
    url: 'https://arxiv.org/abs/2310.08560',
    versionOrDate: 'arXiv:2310.08560v2（2024-02-12 修订；v1 于 2023-10-12 提交）',
    checkedAt: '2026-10-23',
    reviewed: true,
    claim: '提出「虚拟上下文管理」：借用操作系统分层内存思路，在不同记忆层间搬运数据，让模型在有限上下文窗口下获得更大的可用记忆——支持「记忆是外部存储与搬运机制，不是模型参数被改写」。',
  }),
  'src-anthropic-agent-skills': Object.freeze({
    id: 'src-anthropic-agent-skills',
    type: 'external',
    title: 'Equipping agents for the real world with Agent Skills · Anthropic',
    org: 'Anthropic（Anthropic PBC，Research 栏目）',
    where: 'anthropic.com/research/equipping-agents-for-the-real-world-with-agent-skills',
    url: 'https://www.anthropic.com/research/equipping-agents-for-the-real-world-with-agent-skills',
    versionOrDate: '页面含 2025-12-18 更新说明（Agent Skills 开放标准）；页脚 © 2026 Anthropic PBC',
    checkedAt: '2026-10-23',
    reviewed: true,
    claim: '把 Skill 定义为「组织好的指令、脚本与资源目录」，按需动态加载（progressive disclosure：先只放 name/description 元数据，需要时再读正文与附加文件）；并提示恶意 Skill 可引入漏洞或诱导数据外泄，需从可信来源安装——支持「Skill 是方法封装、按需加载，本身不自动等于安全或授权」。',
  }),
  'src-anthropic-effective-agents': Object.freeze({
    id: 'src-anthropic-effective-agents',
    type: 'external',
    title: 'Building effective AI agents · Anthropic',
    org: 'Anthropic（Anthropic PBC，Research 栏目）',
    where: 'anthropic.com/research/building-effective-agents',
    url: 'https://www.anthropic.com/research/building-effective-agents',
    versionOrDate: '页面未标注发布日期（正文提到 2024 年 12 月起的观察）；页脚 © 2026 Anthropic PBC',
    checkedAt: '2026-10-23',
    reviewed: true,
    claim: '原文区分：Workflow 是「用预定义代码路径编排 LLM 与工具」的系统，Agent 是「由 LLM 动态决定自身流程与工具使用」的系统；并列出 prompt chaining、routing、parallelization、orchestrator-workers、evaluator-optimizer 五种编排模式与「先用最简单方案」的建议——直接支持 Workflow ≠ Agent 且不存在优劣排序。',
  }),
  'src-arxiv-react': Object.freeze({
    id: 'src-arxiv-react',
    type: 'external',
    title: 'ReAct: Synergizing Reasoning and Acting in Language Models',
    org: 'arXiv（作者 Yao、Zhao、Yu 等；ICLR 2023）',
    where: 'arxiv.org/abs/2210.03629',
    url: 'https://arxiv.org/abs/2210.03629',
    versionOrDate: 'arXiv:2210.03629v3（2023-03-10 修订；v1 于 2022-10-06 提交）',
    checkedAt: '2026-10-23',
    reviewed: true,
    claim: '让模型交替产生推理轨迹与动作，动作用于与外部来源交互取回信息、推理用于更新计划——支持「执行循环 = 观察 → 决策 → 动作 → 再决策」，并说明动作带来的外部反馈可减少幻觉与错误传播。',
  }),
  'src-arxiv-swe-agent': Object.freeze({
    id: 'src-arxiv-swe-agent',
    type: 'external',
    title: 'SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering',
    org: 'arXiv（作者 Yang、Jimenez、Wettig 等）',
    where: 'arxiv.org/abs/2405.15793',
    url: 'https://arxiv.org/abs/2405.15793',
    versionOrDate: 'arXiv:2405.15793v3（2024-11-11 修订；v1 于 2024-05-06 提交）',
    checkedAt: '2026-10-23',
    reviewed: true,
    claim: '提出 Agent-Computer Interface（ACI）：围绕模型的那层接口设计（文件编辑、仓库导航、执行测试）会显著影响 Agent 表现——支持「Harness/接口层是独立的工程层，决定模型能做什么、看到什么，而不是另一个模型」。',
  }),
  'src-arxiv-autogen': Object.freeze({
    id: 'src-arxiv-autogen',
    type: 'external',
    title: 'AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation',
    org: 'arXiv（作者 Wu、Bansal、Zhang 等）',
    where: 'arxiv.org/abs/2308.08155',
    url: 'https://arxiv.org/abs/2308.08155',
    versionOrDate: 'arXiv:2308.08155v2（2023-10-03 修订；v1 于 2023-08-16 提交）',
    checkedAt: '2026-10-23',
    reviewed: true,
    claim: '用「多个可对话的 agent 通过对话协作」来搭建应用，并强调可定制各 agent 的交互行为——支持「Multi-Agent 是多个角色分工与交接，需要额外的编排与协调机制」。',
  }),
  'src-anthropic-sandboxing': Object.freeze({
    id: 'src-anthropic-sandboxing',
    type: 'external',
    title: 'Making Claude Code safer with sandboxing · Anthropic',
    org: 'Anthropic（Anthropic PBC，Research 栏目）',
    where: 'anthropic.com/research/claude-code-sandboxing',
    url: 'https://www.anthropic.com/research/claude-code-sandboxing',
    versionOrDate: '页面未标注发布日期（正文提到研究预览版）；页脚 © 2026 Anthropic PBC',
    checkedAt: '2026-10-23',
    reviewed: true,
    claim: '说明「基于权限的模型」默认只读、需要显式批准才能修改或执行，并用操作系统级原语实现文件系统隔离（只可访问指定目录）与网络隔离（只可连批准的主机），指出两者缺一不可——支持「权限是授权规则、沙箱是执行范围隔离，二者互补且都由执行侧强制」。',
  }),
  'src-arxiv-injection-design-patterns': Object.freeze({
    id: 'src-arxiv-injection-design-patterns',
    type: 'external',
    title: 'Design Patterns for Securing LLM Agents against Prompt Injections',
    org: 'arXiv（作者 Beurer-Kellner、Buesser、Creţu 等）',
    where: 'arxiv.org/abs/2506.08837',
    url: 'https://arxiv.org/abs/2506.08837',
    versionOrDate: 'arXiv:2506.08837v3（2025-06-27 修订；v1 于 2025-06-10 提交）',
    checkedAt: '2026-10-23',
    reviewed: true,
    claim: '提出一组面向提示注入的架构级设计模式，并分析其在实用性与安全性上的取舍——支持「面对不可信输入，单靠内容过滤不够，要在动作与权限层面做结构性约束」。',
  }),
  'src-willison-lethal-trifecta': Object.freeze({
    id: 'src-willison-lethal-trifecta',
    type: 'external',
    title: 'The lethal trifecta for AI agents: private data, untrusted content, and external communication',
    org: 'Simon Willison（个人技术博客；提示注入一词的提出者）',
    where: 'simonwillison.net/2025/Jun/16/the-lethal-trifecta/',
    url: 'https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/',
    versionOrDate: '2025-06-16 发布',
    checkedAt: '2026-10-23',
    reviewed: true,
    claim: '指出「私有数据 + 不可信内容 + 对外通信」三种能力同时存在时攻击者可窃取数据；并写明护栏产品无法 100% 拦住、模型不能可靠区分指令来源——支持「提示注入不可靠关键词过滤彻底防御」与「减少能力组合比叠加过滤器更有效」。',
  }),
  'src-arxiv-agentdojo': Object.freeze({
    id: 'src-arxiv-agentdojo',
    type: 'external',
    title: 'AgentDojo: A Dynamic Environment to Evaluate Prompt Injection Attacks and Defenses for LLM Agents',
    org: 'arXiv（作者 Debenedetti、Zhang、Balunović 等）',
    where: 'arxiv.org/abs/2406.13352',
    url: 'https://arxiv.org/abs/2406.13352',
    versionOrDate: 'arXiv:2406.13352v3（2024-11-24 修订；v1 于 2024-06-19 提交）',
    checkedAt: '2026-10-23',
    reviewed: true,
    claim: '提供 97 个真实任务与 629 个安全测试用例来度量 Agent 对提示注入的鲁棒性，并指出已有攻击只破坏部分安全属性——支持「评估要看具体属性与可复现用例，而且单个样例通过不代表系统安全」。',
  }),
  'src-arxiv-helm': Object.freeze({
    id: 'src-arxiv-helm',
    type: 'external',
    title: 'Holistic Evaluation of Language Models',
    org: 'arXiv（斯坦福 CRFM 团队，作者 Liang、Bommasani 等；TMLR 2023）',
    where: 'arxiv.org/abs/2211.09110',
    url: 'https://arxiv.org/abs/2211.09110',
    versionOrDate: 'arXiv:2211.09110v2（2023-10-01 修订；v1 于 2022-11-16 提交）',
    checkedAt: '2026-10-23',
    reviewed: true,
    claim: '把评估定义为「场景 × 指标」的矩阵：同一批模型在标准化的场景与 7 类指标（准确率、校准、鲁棒性、公平性、偏见、毒性、效率）下对比，并公开原始提示与输出——支持「评估需要固定任务、固定判定标准与可复现记录，单一指标不足以说明问题」。',
  }),
  'src-otel-traces': Object.freeze({
    id: 'src-otel-traces',
    type: 'external',
    title: 'Traces · OpenTelemetry 文档（Concepts / Signals）',
    org: 'OpenTelemetry（CNCF 项目，官方文档）',
    where: 'opentelemetry.io/docs/concepts/signals/traces/',
    url: 'https://opentelemetry.io/docs/concepts/signals/traces/',
    versionOrDate: '文档页未标注版本；核验时间 2026-10-23',
    checkedAt: '2026-10-23',
    reviewed: true,
    claim: '把 trace 定义为一次操作链路的记录，由带父子关系与时间信息的 span 组成——支持「Tracing 记录步骤、输入输出摘要与时间顺序，用来定位问题与追责」。',
  }),
  'doc-m1-3-task': Object.freeze({
    id: 'doc-m1-3-task',
    type: 'internal',
    title: 'M1.3_TASK.md · Agent 进阶与运行机制任务书',
    where: 'docs/M1.3_TASK.md',
    url: null,
    versionOrDate: '仓库内文件',
    checkedAt: null,
    reviewed: true,
    claim: '第 04–06 章 18 个概念的技术准确性红线、三个实验的验收底线与「模拟不等于真实」的声明要求来自该任务书。',
  }),
}));

/** 未知来源 ID → null，调用方显示「来源待登记」而不是假装有引用 */
export function getSource(sourceId) {
  return Object.prototype.hasOwnProperty.call(SOURCES, sourceId) ? SOURCES[sourceId] : null;
}

/** 已核验来源（正文用它显示可点击引用；未核验一律不露出为正式引用） */
export function isSourceReviewed(sourceId) {
  return getSource(sourceId)?.reviewed === true;
}

/** 外部来源统计（自检脚本与交付文档使用） */
export function sourceStats() {
  const all = Object.values(SOURCES);
  const external = all.filter((s) => s.type === 'external');
  return {
    total: all.length,
    internal: all.length - external.length,
    external: external.length,
    reviewed: all.filter((s) => s.reviewed).length,
    externalReviewed: external.filter((s) => s.reviewed).length,
  };
}

/**
 * 来源诚实性校验：
 *   · external 来源必须有 https URL、reviewed=true，且写明版本/日期与核验时间；
 *   · internal 来源不允许带 URL（避免把内部文档伪装成外部权威）；
 *   · 未知 ID 直接报错。
 */
export function validateSources(sourceRefs = []) {
  const issues = [];
  if (!Array.isArray(sourceRefs)) return [{ code: 'SOURCES_NOT_ARRAY' }];
  for (const ref of sourceRefs) {
    const id = typeof ref === 'string' ? ref : ref?.id;
    const source = getSource(id);
    if (!source) {
      issues.push({ code: 'UNKNOWN_SOURCE', id });
      continue;
    }
    if (source.type === 'external') {
      if (!/^https:\/\//.test(String(source.url || ''))) issues.push({ code: 'EXTERNAL_SOURCE_WITHOUT_URL', id });
      if (source.reviewed !== true) issues.push({ code: 'EXTERNAL_SOURCE_UNREVIEWED', id });
      if (!source.checkedAt) issues.push({ code: 'EXTERNAL_SOURCE_WITHOUT_CHECK_DATE', id });
      if (!source.versionOrDate) issues.push({ code: 'EXTERNAL_SOURCE_WITHOUT_VERSION', id });
      if (!source.claim) issues.push({ code: 'EXTERNAL_SOURCE_WITHOUT_CLAIM', id });
      if (!source.org) issues.push({ code: 'EXTERNAL_SOURCE_WITHOUT_ORG', id });
    } else if (source.url) {
      issues.push({ code: 'INTERNAL_SOURCE_WITH_URL', id });
    }
  }
  return issues;
}
