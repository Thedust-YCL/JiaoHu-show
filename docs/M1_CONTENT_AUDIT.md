# M1 内容准确性与完整度审查

审查日期：2026-10-25。数据由 `npm run audit:m14` 实际读取注册表生成；语义审查和外部正文核验在本轮执行。

- 六章 6；概念 36（published 25 / reviewed 11 / draft 0 / outline 0）。
- 真实关系 49；孤立节点 0；结构/章节/引用校验问题 0。
- 来源 37（外部 30；已核验 36；待核验 1；已发布概念引用待核验来源 0）。
- 六实验均有有效登记、章节与稳定入口；实验完成与阅读进度分别呈现，不推断掌握程度。

## 36 概念逐项检查

逐项读取定义、UNDERSTAND、INSPECT、误解、案例、关联及来源。数字为真实字段条数；每项均有中文定义与模拟案例。

| ID | 章节 | 中文 | 内容状态 | 别名 | 入门/深入/误解 | 关系 | 模拟案例 |
|---|---|---|---|---:|---|---:|---|
| ai | 01 | 人工智能 | reviewed | 5 | 3/4/1 | 1 | 是 |
| ml | 01 | 机器学习 | reviewed | 5 | 3/4/1 | 2 | 是 |
| llm | 01 | 大语言模型 | reviewed | 6 | 2/4/1 | 7 | 是 |
| transformer | 01 | 注意力架构 | reviewed | 6 | 3/4/1 | 2 | 是 |
| token | 01 | 文本最小单位 | published | 5 | 3/4/1 | 4 | 是 |
| inference | 01 | 推理（前向计算） | reviewed | 4 | 3/4/1 | 2 | 是 |
| prompt | 02 | 提示（这一轮的输入） | published | 5 | 3/4/1 | 1 | 是 |
| instructions | 02 | 指令 | published | 5 | 3/4/1 | 2 | 是 |
| system_prompt | 02 | 系统指令 | reviewed | 5 | 3/4/1 | 1 | 是 |
| context_window | 02 | 上下文窗口 | published | 5 | 3/4/1 | 3 | 是 |
| context_engineering | 02 | 上下文工程 | published | 4 | 3/4/1 | 2 | 是 |
| hallucination | 02 | 幻觉 | reviewed | 5 | 3/5/1 | 2 | 是 |
| api | 03 | 应用程序接口 | reviewed | 5 | 3/4/1 | 2 | 是 |
| tools | 03 | 工具 | reviewed | 6 | 2/5/1 | 6 | 是 |
| tool_calling | 03 | 工具调用 | published | 6 | 3/6/2 | 4 | 是 |
| function_calling | 03 | 函数调用 | reviewed | 5 | 3/4/1 | 1 | 是 |
| mcp | 03 | 模型上下文协议 | published | 5 | 3/5/1 | 4 | 是 |
| mcp_server | 03 | 协议服务端 | reviewed | 5 | 3/4/1 | 2 | 是 |
| chunking | 04 | 资料切分 | published | 7 | 2/4/2 | 2 | 是 |
| retrieval | 04 | 检索 | published | 5 | 2/4/2 | 3 | 是 |
| embedding | 04 | 向量表示 | published | 6 | 2/4/2 | 1 | 是 |
| rag | 04 | 检索增强生成 | published | 6 | 2/4/2 | 5 | 是 |
| memory | 04 | 记忆 | published | 5 | 2/4/2 | 2 | 是 |
| skills | 04 | 技能说明 | published | 7 | 2/4/2 | 1 | 是 |
| agent | 05 | 智能体执行系统 | published | 6 | 2/4/2 | 8 | 是 |
| agent_loop | 05 | 执行循环 | published | 5 | 2/4/2 | 4 | 是 |
| workflow | 05 | 工作流 | published | 5 | 2/4/2 | 4 | 是 |
| harness | 05 | 运行环境层 | published | 6 | 2/4/2 | 3 | 是 |
| orchestration | 05 | 编排 | published | 5 | 2/4/2 | 2 | 是 |
| multi_agent | 05 | 多智能体 | published | 5 | 2/4/2 | 1 | 是 |
| permissions | 06 | 权限 | published | 5 | 2/4/2 | 4 | 是 |
| sandbox | 06 | 沙箱 | published | 5 | 2/4/2 | 2 | 是 |
| prompt_injection | 06 | 提示注入 | published | 5 | 2/4/2 | 3 | 是 |
| guardrails | 06 | 护栏 | published | 5 | 2/4/2 | 2 | 是 |
| tracing | 06 | 追踪 | published | 6 | 2/4/2 | 1 | 是 |
| evals | 06 | 评估 | published | 6 | 2/4/2 | 2 | 是 |

## 六章与六实验

| 章节 | 稳定实验 ID | 入口概念 | 实际完成条件（沿用前序实验） |
|---|---|---|---|
| 智能诞生 | exp-token-lab | token | 用户改变文本/编码/预算/资料配置，重算并呈现实际分词表与预算。 |
| 指令与上下文 | exp-context-lab | context_engineering | 用户改变指令/背景/预算，重算并呈现报告与遗漏原因。 |
| 外部能力 | exp-tool-calling-demo | tool_calling | 用户逐步/主动播放至末条真实模拟事件；默认打开实验不完成。 |
| 信息与方法 | exp-retrieval-lab | chunking | 用户改变切分/检索/RAG/方法等参数，重算并呈现结果。 |
| 执行系统 | exp-agent-loop-lab | agent_loop | 用户主动改变控制方式/配置、推进或检查运行，生成并呈现确定性结果。 |
| 可靠性与边界 | exp-boundary-lab | permissions | 用户改变权限/沙箱/护栏配置，重算判定与评估并呈现。 |

完成指核心操作被执行且结果被渲染，并非测验通过或知识掌握。服务端/模型不参与。六实验的失败、权限、数据因果与重放见本轮 M1.2/M1.3 回归报告。

## 关系审查

统一49条关系全部验证端点、稳定ID、类型、方向、说明、自环与重复；孤立节点0。USES 7 / PART_OF 3 为有向；RELATED 34 / CONTRASTS 5 为无向。旧10条关系ID和含义保留。图与列表使用同一关系数据，过滤后不生成补充连线。

## 来源复核

本轮浏览工具实际读取30条外部页面，核对标题、作者/组织、页面正文与登记的支撑断言；链接读取成功30，确认失效0，因无法读取而待核验0。这里只证明本轮工具环境可以读取，不能代表中国大陆所有网络线路可达。外部参考仅供主动打开，应用运行不请求这些站点。

用户已补充 M1.2_TASK.md，本轮实际阅读后将来源恢复为reviewed；不再作为缺失项。唯一needs_review为未被任何概念引用的历史索引草稿，不冒充课程来源。

| 来源 ID | 标题 / 组织 | 状态 | 原文或本地位置 |
|---|---|---|---|
| doc-m0-3-task | M0.3_TASK.md · 知识节点与关系审校任务书 / AGENT / ZERO 项目 | reviewed | docs/M0.3_TASK.md |
| doc-m1-1-task | M1.1_TASK.md · 知识架构与学习基础任务书 / AGENT / ZERO 项目 | reviewed | docs/M1.1_TASK.md |
| doc-m1-2-task | M1.2_TASK.md · AI 基础与工具交互任务书 / AGENT / ZERO 项目 | reviewed | docs/M1.2_TASK.md |
| doc-prd | PRD · 产品需求与技术边界 / AGENT / ZERO 项目 | reviewed | docs/PRD .md |
| doc-design-system | DESIGN_SYSTEM.md · 视觉与文案规范 / AGENT / ZERO 项目 | reviewed | docs/DESIGN_SYSTEM.md |
| src-index-draft | 概念索引草稿（尚未审校） / AGENT / ZERO 项目 | needs_review | src/knowledge/concepts/ |
| src-arxiv-transformer | Attention Is All You Need / arXiv（作者 Vaswani 等，Google Brain / Google Research / 多伦多大学） | reviewed | [原文](https://arxiv.org/abs/1706.03762) |
| src-arxiv-scaling-laws | Scaling Laws for Neural Language Models / arXiv（作者 Kaplan、McCandlish、Henighan 等） | reviewed | [原文](https://arxiv.org/abs/2001.08361) |
| src-arxiv-hallucination-survey | A Survey on Hallucination in Large Language Models: Principles, Taxonomy, Challenges, and Open Questions / arXiv（作者 Huang、Yu、Ma 等；已被 ACM TOIS 接收，DOI 10.1145/3703155） | reviewed | [原文](https://arxiv.org/abs/2311.05232) |
| src-deepseek-token-usage | Token 用量计算 · DeepSeek API 文档 / DeepSeek（深度求索）官方 API 文档 | reviewed | [原文](https://api-docs.deepseek.com/zh-cn/quick_start/token_usage) |
| src-deepseek-chat-api | Chat Completions API · DeepSeek API 文档 / DeepSeek（深度求索）官方 API 文档 | reviewed | [原文](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion) |
| src-deepseek-tool-calls | Tool Calls · DeepSeek API 指南 / DeepSeek（深度求索）官方 API 文档 | reviewed | [原文](https://api-docs.deepseek.com/zh-cn/guides/tool_calls) |
| src-deepseek-pricing | 模型 & 价格 · DeepSeek API 文档 / DeepSeek（深度求索）官方 API 文档 | reviewed | [原文](https://api-docs.deepseek.com/zh-cn/quick_start/pricing) |
| src-cac-genai-rules | 生成式人工智能服务管理暂行办法 / 国家互联网信息办公室等七部门（令第 15 号），中国网信网发布 | reviewed | [原文](https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm) |
| src-bigmodel-http | HTTP API 调用 · 智谱 AI 开放文档 / 智谱 AI（Zhipu）开放平台文档 | reviewed | [原文](https://docs.bigmodel.cn/cn/guide/develop/http/introduction) |
| src-rfc9110 | RFC 9110: HTTP Semantics / IETF（Internet Engineering Task Force），STD 97 | reviewed | [原文](https://www.rfc-editor.org/rfc/rfc9110.html) |
| src-mcp-architecture | Architecture overview · Model Context Protocol / Model Context Protocol（官方文档站 modelcontextprotocol.io） | reviewed | [原文](https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture) |
| src-mcp-spec | Specification · Model Context Protocol（2025-06-18 版） / Model Context Protocol（官方规范） | reviewed | [原文](https://modelcontextprotocol.io/specification/2025-06-18) |
| src-anthropic-mcp-announce | Introducing the Model Context Protocol · Anthropic / Anthropic（Anthropic PBC） | reviewed | [原文](https://www.anthropic.com/news/model-context-protocol) |
| src-anthropic-context-engineering | Effective context engineering for AI agents · Anthropic / Anthropic（Anthropic PBC，Research 栏目） | reviewed | [原文](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents) |
| src-arxiv-rag | Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks / arXiv（作者 Lewis、Perez、Karpukhin 等；NeurIPS 2020） | reviewed | [原文](https://arxiv.org/abs/2005.11401) |
| src-arxiv-dpr | Dense Passage Retrieval for Open-Domain Question Answering / arXiv（作者 Karpukhin、Oğuz、Min 等；EMNLP 2020） | reviewed | [原文](https://arxiv.org/abs/2004.04906) |
| src-arxiv-word2vec | Efficient Estimation of Word Representations in Vector Space / arXiv（作者 Mikolov、Chen、Corrado、Dean） | reviewed | [原文](https://arxiv.org/abs/1301.3781) |
| src-arxiv-lost-middle | Lost in the Middle: How Language Models Use Long Contexts / arXiv（作者 Liu、Lin、Hewitt 等；TACL 2023） | reviewed | [原文](https://arxiv.org/abs/2307.03172) |
| src-arxiv-memgpt | MemGPT: Towards LLMs as Operating Systems / arXiv（作者 Packer、Wooders、Lin 等） | reviewed | [原文](https://arxiv.org/abs/2310.08560) |
| src-anthropic-agent-skills | Equipping agents for the real world with Agent Skills · Anthropic / Anthropic（Anthropic PBC，Research 栏目） | reviewed | [原文](https://www.anthropic.com/research/equipping-agents-for-the-real-world-with-agent-skills) |
| src-anthropic-effective-agents | Building effective AI agents · Anthropic / Anthropic（Anthropic PBC，Research 栏目） | reviewed | [原文](https://www.anthropic.com/research/building-effective-agents) |
| src-arxiv-react | ReAct: Synergizing Reasoning and Acting in Language Models / arXiv（作者 Yao、Zhao、Yu 等；ICLR 2023） | reviewed | [原文](https://arxiv.org/abs/2210.03629) |
| src-arxiv-swe-agent | SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering / arXiv（作者 Yang、Jimenez、Wettig 等） | reviewed | [原文](https://arxiv.org/abs/2405.15793) |
| src-arxiv-autogen | AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation / arXiv（作者 Wu、Bansal、Zhang 等） | reviewed | [原文](https://arxiv.org/abs/2308.08155) |
| src-anthropic-sandboxing | Making Claude Code safer with sandboxing · Anthropic / Anthropic（Anthropic PBC，Research 栏目） | reviewed | [原文](https://www.anthropic.com/research/claude-code-sandboxing) |
| src-arxiv-injection-design-patterns | Design Patterns for Securing LLM Agents against Prompt Injections / arXiv（作者 Beurer-Kellner、Buesser、Creţu 等） | reviewed | [原文](https://arxiv.org/abs/2506.08837) |
| src-willison-lethal-trifecta | The lethal trifecta for AI agents: private data, untrusted content, and external communication / Simon Willison（个人技术博客；提示注入一词的提出者） | reviewed | [原文](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) |
| src-arxiv-agentdojo | AgentDojo: A Dynamic Environment to Evaluate Prompt Injection Attacks and Defenses for LLM Agents / arXiv（作者 Debenedetti、Zhang、Balunović 等） | reviewed | [原文](https://arxiv.org/abs/2406.13352) |
| src-arxiv-helm | Holistic Evaluation of Language Models / arXiv（斯坦福 CRFM 团队，作者 Liang、Bommasani 等；TMLR 2023） | reviewed | [原文](https://arxiv.org/abs/2211.09110) |
| src-otel-traces | Traces · OpenTelemetry 文档（Concepts / Signals） / OpenTelemetry（CNCF 项目，官方文档） | reviewed | [原文](https://opentelemetry.io/docs/concepts/signals/traces/) |
| doc-m1-3-task | M1.3_TASK.md · Agent 进阶与运行机制任务书 / AGENT / ZERO 项目 | reviewed | docs/M1.3_TASK.md |

## 本轮准确性修订

- 修正LLM“一次回答就是一次前向计算”：自回归回答通常包含多次前向计算，与Inference章节保持一致。
- 机器学习对训练数据之外内容的边界改为“不能仅靠参数可靠核实时效事实”，避免否定泛化能力。
- 区分粗略token估算与实际计数；课程实验仍使用真实编码的离线预计算表，24组序列可复算。
- 修正工具段落“工具不执行动作”为“模型不执行工具”，MCP工具的执行方明确为运行环境。
- MCP Server不等于模型；不再一概声称服务端不能请求模型交互，注明2025规范Sampling与后续版本差异，本实验范围保持三类能力。
- Harness职责与注入风险改为具体条件下的说明，移除无依据的“缺一必然黑箱”“风险最高”。
- RAG/Embedding/Memory/Skills/Workflow/Agent/权限/沙箱/追踪/评估逐项核对，保留教学模拟与生产机制的明确边界。

## 未解决事项

- P0/P1：当前内容结构检查无发现。
- P2：历史索引草稿来源待审，未被课程引用，不阻断M1；若后续使用必须审校。
- P2：境外参考资料在中国大陆的真实多运营商可达性未实测；核心产品不依赖外网，不据此宣称国内网络全面可达。
- NOT RUN：这些教学实验不构成真实模型能力评估、安全认证或生产隔离测试。
