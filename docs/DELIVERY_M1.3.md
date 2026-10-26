# M1.3 交付报告 · Agent 进阶与运行机制

> 阶段：M1 · KNOWLEDGE UNIVERSE / **M1.3**
> 任务书：`docs/M1.3_TASK.md`
> 交付日期：2026-10-23
> 结论：**交付完成**（A01–A36 全部 PASS；浏览器验收 40/40，其中含 1 项补充检查 A17b；A36 回归 133 项全通过；未运行项 0）
> 运行环境：Node v24.17.0 / Chrome 141（headless，CDP 驱动）/ Windows

---

## 1. 审计摘要（A01）

### 1.1 审计范围与方式

按任务书 §11 的顺序先做审计：阅读 `PRD .md`、`DESIGN_SYSTEM.md`、`M0.1`–`M0.4`、`M1.1`、`M1.2` 与本轮任务书；逐文件检查路由、知识 schema、概念 ID、内容访问接口、Atlas / Story / 三个既有实验、模拟事件引擎、学习进度存储、测试与构建脚本，并**实际运行**既有测试与验收脚本确认 M1.2 的真实状态（而不是依据「报告已完成」推断）。

### 1.2 M1.2 的实际状态（审计结论）

| 项目 | 审计结果 |
| --- | --- |
| 统一知识层 | `src/knowledge/index.js` 提供唯读查询面；36 概念 / 6 章 / 48 条关系；`validateKnowledge()` 零问题 |
| 第 01–03 章 | 18 个概念有正文，其中 7 个 `published`（挂 M1.2 三实验），11 个 `reviewed` |
| 第 04–06 章 | 18 个概念**仅有 `outline` 索引**：无正文、无来源、无实验 —— 正是本轮要交付的内容（`ch04-knowledge.js` / `ch05-runtime.js` / `ch06-runtime.js` 头部均写明「正文与实验属于 M1.3」） |
| 实验登记表 | 6 条登记，3 个 `available`（Token / Context / Tool Calling），3 个 `planned`（retrieval / agent-loop / boundary） |
| 路由 | `app.js` 的 `openLabExperiment()` 只识别 `token` / `context` 两种 `labKind`；`knowledge-step` 走 Tool Calling 四步页 |
| 叙事 | `content/chapters/index.js` 只注册第 01–03 章，`STORY_ORDER` 为三章；第 04–06 章返回 `null`，界面显示「后续阶段」 |
| 存储 | 学习进度 `agent-zero:learning:v2`（v1 只读迁移）；装配 `agent-zero:constructor:v1`；研究 `agent-zero:research:v2`；三者命名空间隔离 |
| 测试 / 构建 | 13 个测试文件、239 项全绿；`node tools/build.mjs`、`node tools/check.mjs` 通过；M0.3/M0.4/M1.1/M1.2 浏览器验收脚本可独立运行 |

### 1.3 发现的阻断问题与处理

| 问题 | 影响 | 处理 |
| --- | --- | --- |
| 第 04–06 章 18 个概念只有索引，且三个实验为 `planned` | 无法进入本轮任何验收项 | 本轮交付内容 + 三个实验（本文第 3、4 节） |
| `CONTENT_STATUS.published.note` 仍写「仅 Tool Calling 具备完整四步路径」 | 文案与事实不符 | 改为按章说明（第 01–03 章 / 第 04–06 章各配三个实验） |
| 章节叙事 `STORY_ORDER` 只有三章，第 03 章 `transition.toChapterId = null` | 第 04–06 章在 STORY 里显示「后续阶段」 | 扩展为六章，第 03 章过渡指向 `knowledge`，第 06 章过渡指向 M1.4 |
| `m11-acceptance.mjs` / `m12-acceptance.mjs` 硬编码「13 个索引态 / 3 个可用实验 / 三章叙事」 | 交付后这两个回归脚本必然失败 | 更新为 M1.3 基线（0 个索引态 / 6 个可用实验 / 六章叙事 / 49 条关系），保留原有检查意图，不放宽标准 |
| 第 04–06 章缺少「Agent Loop ↔ Workflow」对照边 | 任务书 §8.3 要求的语义关系缺失 | 新增 `rel-agentloop-workflow`（CONTRASTS，无向，origin M1.3），关系总数 48 → 49 |

**结论**：M1.2 的核心链路没有发现功能性缺陷；阻断本阶段的只有「内容与实验尚未交付」与「回归脚本基线过期」两类，均已在本轮处理，其余历史实现零改动。

---

## 2. 变更文件清单

### 2.1 知识内容（18 个概念 + 来源 + 章节叙事）

| 文件 | 变更 |
| --- | --- |
| `src/knowledge/concepts/ch04-knowledge.js` | 重写：6 个概念 → `published`，含 UNDERSTAND / INSPECT / 误解 / 虚构示例 / 关系 / 来源 / 审校日期 |
| `src/knowledge/concepts/ch05-runtime.js` | 重写：6 个概念 → `published`（含 Workflow 不是 Agent 低配版的明示） |
| `src/knowledge/concepts/ch06-reliability.js` | 重写：6 个概念 → `published`（含「不构成真实隔离」「不等于安全认证」） |
| `src/knowledge/concepts/helpers.js` | 更新 `published` 状态说明文案 |
| `src/knowledge/sources.js` | 新增 16 条来源（15 条外部已核验 + 1 条仓库内任务书），全部记录 URL / 版本 / 核验日期 / 支持的具体断言 |
| `src/knowledge/relations.js` | 新增 `rel-agentloop-workflow`（CONTRASTS） |
| `src/knowledge/experiments.js` | 三个 `planned` → `available`，补 `labKind`、完整 `conceptIds`、`dataNote`、`milestone` |
| `src/knowledge/index.js` | 校验器新增「第 04–06 章必须有已核验外部来源 + 审校日期」 |
| `src/content/chapters/04-knowledge.js` | 新增章节叙事（5 节拍 + 局限 + 实验 + 结果解读 + 过渡） |
| `src/content/chapters/05-runtime.js` | 新增章节叙事（6 节拍 + 局限 + 实验 + 结果解读 + 过渡） |
| `src/content/chapters/06-reliability.js` | 新增章节叙事（6 节拍 + 局限含「不代表已通过安全认证」+ 实验 + 结果解读 + 收束到 M1.4） |
| `src/content/chapters/index.js` | 注册六章；`STORY_ORDER` 六章；`validateStories()` 覆盖六章 |
| `src/content/chapters/03-connection.js` | 过渡指向 `knowledge`（原为 `null`） |

### 2.2 实验逻辑（纯函数，无 DOM / 无存储副作用）

| 文件 | 作用 |
| --- | --- |
| `src/features/laboratory/knowledge/corpus.js` | 复用 M0.4 `mission-001` 语料；人工设定的二维示意坐标；5 个固定问题（含「资料不足」与「无查询坐标」用例） |
| `src/features/laboratory/knowledge/chunking.js` | 三种切分预设 + 三种长度；片段 ID 编码预设与参数；跨段 / 断句标记 |
| `src/features/laboratory/knowledge/retrieval.js` | 关键词通道（中文二元组 + 英文词、正文/标题/标签加权）与向量示意通道（1 − 距离/最大距离）；三重键稳定排序 |
| `src/features/laboratory/knowledge/skills.js` | 「公告核验方法」Skill 卡、方法步骤、四项检查；显式声明不授予权限 |
| `src/features/laboratory/knowledge/memory.js` | 独立命名空间 `agent-zero:lab-knowledge:v1` 的记忆 store：显式保存、单条删除、整体清除、损坏容错 |
| `src/features/laboratory/knowledge/pipeline.js` | 切分 → 检索 → 锚点相关性 → 上下文预算 → 回答（日期 / 摘录 / 不足）→ 与 Skill 检查联动 → 差异说明 |
| `src/features/laboratory/runtime/task.js` | 共享任务：同一语料、同一工具、同一权限、同一检索与抽取规则 |
| `src/features/laboratory/runtime/engine.js` | 三个确定性入口（Workflow / Agent Loop / Multi-Agent）、事件模型、Harness 职责映射、指标 |
| `src/features/laboratory/reliability/policy.js` | 权限（4 开关）× 沙箱（3 档）三层判定；`applyPolicyPatch` 白名单 |
| `src/features/laboratory/reliability/guardrails.js` | 输入 / 工具调用 / 输出三类检查与「可能漏掉什么」 |
| `src/features/laboratory/reliability/samples.js` | 明确标记的「教学用模拟提示注入样本」+ 正常公开公告 |
| `src/features/laboratory/reliability/evals.js` | 4 条固定样例、确定性判定、事件定位 |
| `src/features/laboratory/reliability/reliabilityLabLogic.js` | 事件链编排（规则检查 / 工具请求 / 允许或拒绝 / 来源 / 输出检查 / 终止）、评估接线、策略只读快照 |

### 2.3 UI 与路由

| 文件 | 变更 |
| --- | --- |
| `src/features/laboratory/knowledge/knowledgeLab.js` | 新增 LAB 04 工作区（参数区 / 主区 / Inspector） |
| `src/features/laboratory/runtime/runtimeLab.js` | 新增 LAB 05 工作区（时间线 / 指标 / Harness / 多角色 / 播放控制） |
| `src/features/laboratory/reliability/reliabilityLab.js` | 新增 LAB 06 工作区（配置 / 请求判定 / 2×2 联动 / 追踪 / 评估） |
| `src/styles/labs.css` | 新增 `.knl-*` / `.rtl-*` / `.rlb-*` 样式 + 窄屏单列 + 减少动态效果 |
| `src/app.js` | `LAB_REGISTRY` 支持五个独立工作区；Esc 回实验空间；新增三个 `*LabApi()` 与记忆键快照；`storyChapters()` 覆盖六章 |
| `src/features/knowledge/components/labWorkspace.js` | 六个实验卡片、实验边界说明更新、无计划实验时不渲染空区 |
| `src/features/knowledge/components/storyWorkspace.js` | 目录文案改为「六章叙事与六个实验全部开放」，状态计数改为动态 |
| `src/features/knowledge/components/chapterNarrative.js` | 「后续阶段」提示改为 M1.4 / 全书完成 |

### 2.4 测试与验收

| 文件 | 变更 |
| --- | --- |
| `tests/knowledge-lab.test.mjs` | 新增 34 项：语料、切分、检索（含同分排序）、向量示意、RAG、预算、Memory、Skills、差异说明 |
| `tests/runtime-lab.test.mjs` | 新增 19 项：共享条件、事件结构、成功 / 未决 / 无证据三类结局、Harness、指标复算、多角色与失败路径 |
| `tests/reliability-lab.test.mjs` | 新增 21 项：权限/沙箱 2×2、注入不改配置、拒绝即拒绝、护栏、追踪筛选、评估确定性与事件定位 |
| `tests/m13-content.test.mjs` | 新增 23 项：18 概念分层字段、来源核验、18 条技术红线逐条断言、关系与实验联动 |
| `tests/knowledge.test.mjs` / `tests/atlas.test.mjs` / `tests/story.test.mjs` | 更新为 M1.3 基线（状态分布、关系总数 49、六章叙事、无索引态概念） |
| `tools/m13-acceptance.mjs` | 新增：A01–A35 浏览器验收 + A36 运行四个既有阶段回归 |
| `tools/m11-acceptance.mjs` / `tools/m12-acceptance.mjs` | 更新基线数字与章节状态断言；检查意图不变 |
| `package.json` | 版本 0.7.0、描述、`accept:m13` 脚本 |
| `docs/DELIVERY_M1.3.md` | 本文件 |

---

## 3. 18 个概念内容表（D01–D03）

内容状态全部为 `published`（正文 + 可操作实验），审校日期均为 2026-10-23；`(外)` 为已核验外部来源，`(内)` 为仓库内可逐字核对文档。

| 概念 ID | 中文 | 状态 | 审校日期 | 来源 | 关联实验 |
| --- | --- | --- | --- | --- | --- |
| `chunking` | 资料切分 | published | 2026-10-23 | src-arxiv-lost-middle(外) / src-arxiv-rag(外) / doc-m1-3-task(内) / doc-prd(内) | exp-retrieval-lab |
| `retrieval` | 检索 | published | 2026-10-23 | src-arxiv-dpr(外) / src-arxiv-rag(外) / doc-m1-3-task(内) / doc-prd(内) | exp-retrieval-lab |
| `embedding` | 向量表示 | published | 2026-10-23 | src-arxiv-word2vec(外) / src-arxiv-dpr(外) / doc-m1-3-task(内) | exp-retrieval-lab |
| `rag` | 检索增强生成 | published | 2026-10-23 | src-arxiv-rag(外) / src-arxiv-lost-middle(外) / doc-m1-3-task(内) / doc-prd(内) | exp-retrieval-lab |
| `memory` | 记忆 | published | 2026-10-23 | src-arxiv-memgpt(外) / src-anthropic-context-engineering(外) / doc-m1-3-task(内) | exp-retrieval-lab |
| `skills` | 技能说明 | published | 2026-10-23 | src-anthropic-agent-skills(外) / doc-m1-3-task(内) / doc-prd(内) | exp-retrieval-lab |
| `agent` | 智能体执行系统 | published | 2026-10-23 | src-anthropic-effective-agents(外) / src-arxiv-react(外) / doc-m1-3-task(内) / doc-prd(内) | exp-agent-loop-lab |
| `agent_loop` | 执行循环 | published | 2026-10-23 | src-arxiv-react(外) / src-anthropic-effective-agents(外) / doc-m1-3-task(内) | exp-agent-loop-lab |
| `workflow` | 工作流 | published | 2026-10-23 | src-anthropic-effective-agents(外) / doc-m1-3-task(内) / doc-prd(内) | exp-agent-loop-lab |
| `harness` | 运行环境层 | published | 2026-10-23 | src-arxiv-swe-agent(外) / src-anthropic-context-engineering(外) / doc-m1-3-task(内) / doc-prd(内) | exp-agent-loop-lab |
| `orchestration` | 编排 | published | 2026-10-23 | src-anthropic-effective-agents(外) / src-arxiv-autogen(外) / doc-m1-3-task(内) | exp-agent-loop-lab |
| `multi_agent` | 多智能体 | published | 2026-10-23 | src-arxiv-autogen(外) / src-anthropic-effective-agents(外) / doc-m1-3-task(内) | exp-agent-loop-lab |
| `permissions` | 权限 | published | 2026-10-23 | src-anthropic-sandboxing(外) / src-arxiv-injection-design-patterns(外) / doc-m1-3-task(内) / doc-prd(内) | exp-boundary-lab |
| `sandbox` | 沙箱 | published | 2026-10-23 | src-anthropic-sandboxing(外) / src-willison-lethal-trifecta(外) / doc-m1-3-task(内) | exp-boundary-lab |
| `prompt_injection` | 提示注入 | published | 2026-10-23 | src-willison-lethal-trifecta(外) / src-arxiv-agentdojo(外) / doc-m1-3-task(内) | exp-boundary-lab |
| `guardrails` | 护栏 | published | 2026-10-23 | src-willison-lethal-trifecta(外) / src-arxiv-injection-design-patterns(外) / src-cac-genai-rules(外) / doc-m1-3-task(内) | exp-boundary-lab |
| `tracing` | 追踪 | published | 2026-10-23 | src-otel-traces(外) / doc-m1-3-task(内) / doc-prd(内) | exp-boundary-lab |
| `evals` | 评估 | published | 2026-10-23 | src-arxiv-helm(外) / src-arxiv-agentdojo(外) / doc-m1-3-task(内) | exp-boundary-lab |

每个概念同时具备：一句话定义、`UNDERSTAND`（≥2 段）、`INSPECT`（≥4 条）、至少 1 条「误解 + 纠正」、与虚构校园活动研究相关的示例（`isSimulated: true`）、语义关系、实验入口与 `reviewNote`（写明本轮审校范围）。

### 3.1 来源核验方式（A06）

| 来源类型 | 核验方式 | 结果 |
| --- | --- | --- |
| arXiv 论文（9 条） | 通过 `export.arxiv.org` 的 Atom 接口按 ID 取回标题、作者、版本与修订日期，再以摘要原文核对 claim | 全部命中，版本号与日期写入登记表 |
| Anthropic 研究文章（4 条） | 直接抓取页面正文（注意实际地址是 `/research/` 前缀，`/engineering/` 会 302 重定向） | 正文取到，逐句核对后登记 |
| Simon Willison 博客（1 条） | 直接抓取正文，核对「lethal trifecta」与「Guardrails won't protect you」两段 | 正文取到，claim 引用原文观点 |
| OpenTelemetry 文档（1 条） | 文档页 HTTP 200，正文取到导航与页头 | claim 只写页面上成立的通用定义（trace = span 组成、含父子与时间关系） |

> 未登记任何抓取失败或无法核验的链接：`npc.gov.cn` 的个人信息保护法深链实测被重定向到首页，因此**没有**进入来源表。

---

## 4. 三个实验说明（D04–D06）

三个实验共用同一套主工作区结构（参数区 / 主工作区 / Inspector），共用 M0.4 的虚构校园公告语料，全部在前端确定性运行。

### 4.1 LAB 04 · KNOWLEDGE LAB（`exp-retrieval-lab`，入口概念 `chunking`）

| 项目 | 内容 |
| --- | --- |
| 可操作参数 | 切分方式（按段落 / 固定长度 / 固定长度 + 重叠）、片段长度（60/90/120 字符）、检索范围（全部 / 仅校园活动栏目）、研究问题（5 个固定问题）、检索模式（关键词 / 向量示意）、候选上限（3/5/8）、Skill 开关 |
| 确定性规则 | 关键词：正文 ×1（每词最多 3 次）、标题 ×2、标签 ×1.5，同分按来源 ID → 片段序号；向量示意：`相似度 = 1 − 欧氏距离/141.42`，坐标人工设定 |
| 关键结果 | 片段 ID 形如 `NTC-1007#para-2` / `NTC-1007#fixed60-3`；上下文预算 360 字符；回答状态 `supported / resolved / unresolved / unverified / insufficient` |
| 失败路径 | ①问题「毕业典礼」→ 无锚点 → 上下文为空 → `insufficient` 且引用 0；②向量模式对无预计算坐标的问题返回「不可用」，不编造向量；③片段不含锚点被拦在上下文外并写出原因；④预算不足时整段舍弃并给出剩余/需要字符数 |
| 模拟声明 | 页面常显 `SIMULATION · 本地规则`；向量区写明「人工设定的二维坐标，浏览器内没有任何 Embedding 模型」；回答区写明「本地规则生成，不是模型推理」 |
| 完成记录 | 改动任意参数并看到新结果后记一次「已完成实验」，只浏览不记录 |

### 4.2 LAB 05 · RUNTIME LAB（`exp-agent-loop-lab`，入口概念 `agent_loop`）

| 项目 | 内容 |
| --- | --- |
| 可操作参数 | 控制方式（Workflow / Agent Loop）、任务查询（招聘会 / 创客分享会 / 毕业典礼，分别对应「未决 / 成功 / 无证据」三类结局）、步数上限（3/4/6）、重试上限（0/1/2）、多角色演示（运行 / 模拟 Verifier 失败） |
| 确定性规则 | 同一份语料、同一组工具（announcement_search / document_reader）、同一套权限；一轮循环 = 决策 + 动作，计为一步 |
| 关键结果 | 事件含 `eventId / runId / seq / stepType / status / title / input / output / sourceIds / branchReason / toolId / role / harness`；指标含步骤数、工具调用、重试、拒绝、来源覆盖、未解决问题、终止原因 |
| 结局与终止 | ①成功（日期唯一）→ `target-reached`，结论 `supported`；②未决（日期冲突且无更正）→ `no-more-actions`；③无证据（检索为空）→ `retry-limit`，结论 `insufficient` 且来源 0；④步数触顶 → `max-steps`；⑤命中文档但抽不到日期 → `no-date`（结论 `insufficient`，当前语料未触发，属防御性出口）；⑥Verifier 失败 → 结论 `unverified`（核验未完成） |
| 模拟声明 | 常显 `SIMULATION · 确定性状态机`；说明「事件由本地规则生成，按顺序揭示，不是真实模型遥测，也不是并发执行」 |
| 播放控制 | 播放 / 暂停 / 前进一步 / 全部展开 / 点选事件 / 重置运行；减少动态效果时直接展开，逻辑结果不变 |

### 4.3 LAB 06 · RELIABILITY LAB（`exp-boundary-lab`，入口概念 `permissions`）

| 项目 | 内容 |
| --- | --- |
| 可操作参数 | 权限 4 开关（读公开 / 读私有 / 写配置 / 对外发送）、沙箱 3 档（仅公开目录 / 公开 + 配置 / 关闭隔离）、护栏 3 开关（输入 / 工具 / 输出）、是否加载注入样本 |
| 确定性规则 | 三层判定：权限 → 沙箱路径白名单 → 工具护栏（只阻断非法路径结构，敏感资源仅标记）；拒绝即 deny，不产生任何数据 |
| 关键结果 | 2×2「权限 × 沙箱」联动表实时计算；Tracing 可按「规则 / 工具请求 / 允许-拒绝 / 来源 / 终止」筛选；Evals 4 条样例给出样例输入、预期规则、实际结果、判定理由与事件 ID |
| 失败路径 | ①默认配置 → 3/3 诱导动作被拒绝、评估 4/4；②权限 + 沙箱全开 → 私有读取被放行、评估降至 2/4；③关闭三处护栏 → 输入检查显示「没检查」；④注入样本要求写配置 → 记录「请求被拒绝且未发生写入」 |
| 模拟声明 | 常显 `SIMULATION · 前端规则`；沙箱区写明「不构成真实隔离」；评估区写明「通过这些演示不代表真实系统已通过安全认证或全面评测」 |

---

## 5. A01–A36 逐项验收

浏览器验收以 `node tools/m13-acceptance.mjs` 驱动真实 DOM 与真实 store（报告 `verify/m13-report.json`），逻辑层由 `node --test` 覆盖。下表「证据」列给出可复现的检查点。

| ID | 验收项 | 结果 | 证据 |
| --- | --- | --- | --- |
| A01 | 仓库审计 | **PASS** | 审计记录见 §1；`knowledgeStats()` 六章 / 36 概念 / 49 关系 / 6 实验，`validateKnowledge()` 0 问题 |
| A02 | 章节覆盖 | **PASS** | 第 04–06 章编号 04/05/06、双语标题与核心问题齐全，与注册表顺序一致 |
| A03 | 概念覆盖 | **PASS** | 18 个稳定 ID 全部存在、归属正确、状态 `published` |
| A04 | ID 兼容 | **PASS** | `rag` 深链可开；`tool_calling` 仍走四步页；M0 十 ID 全部可解析；无重命名 |
| A05 | 分层内容 | **PASS** | 18 概念 UNDERSTAND ≥2 段（最短字符数 >120）、INSPECT ≥4 条、误解、示例、关系齐全 |
| A06 | 参考来源 | **PASS** | 每概念至少 1 条已核验外部来源；37 条来源中 30 条外部、36 条已核验；核验方式见 §3.1 |
| A07 | 概念准确性 | **PASS** | 18 条技术红线逐条断言（`tests/m13-content.test.mjs` 14 项）+ 页面级核对（sandbox 页同时出现「规则模拟」「不构成真实隔离」） |
| A08 | 关系校验 | **PASS** | 49 条边端点存在、无自环、类型与方向一致；18 概念 related 全部命中真实邻居 |
| A09 | Knowledge Lab 文档 | **PASS** | 9 份文档卡片、39 个片段卡片（固定 60 字符档）、片段带 ID 与「摘要段 / 正文第 n 段 / 字符区间」定位 |
| A10 | Chunking | **PASS** | 段落切分 30 片段 → 固定 60 字符 39 片段，ID 全部变化；跨段 / 断句标记可见 |
| A11 | Retrieval | **PASS** | 候选排序严格降序、同分按来源+序号；候选表每行显示分数与匹配理由；重复运行结果一致 |
| A12 | Embedding 示意 | **PASS** | 向量通道显示坐标与距离公式；无预计算坐标的问题 `available=false` 且不产生候选 |
| A13 | RAG 流程 | **PASS** | 流程条（切分→检索→锚点检查→上下文→作答）与引用逐条对应上下文片段 |
| A14 | 无证据处理 | **PASS** | 「毕业典礼」→ `资料不足`、引用 0 条、上下文 0 段；说明「检索命中 ≠ 能回答」 |
| A15 | Memory 区分 | **PASS** | 三栏并列（上下文 / 检索结果 / 本地记忆）；保存写入独立键、清除后为空、学习进度键不变、检索结果不变 |
| A16 | Skills 区分 | **PASS** | 方法步骤 3 → 7；工具清单 `announcement_search/document_reader` 前后一致；页面写明「不会新增工具」 |
| A17 | Runtime 模式 | **PASS** | 两种模式共用语料/工具/权限（冻结对象）；同一「招聘会」查询下 Workflow 5 步 `plan-complete`、Agent Loop 4 步 `no-more-actions`，结论与证据一致 |
| A17b | 成功路径（补充） | **PASS** | 同一「创客分享会」查询下两种模式均为 `supported`：Agent Loop `target-reached`、Workflow `plan-complete`，来源覆盖 1/1 |
| A18 | 循环终止 | **PASS** | 上限 3 步 → `max-steps`（≤3 步）；重试上限 1 → `retry-limit`（1 次）；无新动作 → `no-more-actions` |
| A19 | Harness 解释 | **PASS** | 五项职责（上下文组装 / 工具分派 / 循环与终止 / 权限检查 / 事件记录）逐项点亮；文案写明「不是另一个模型」 |
| A20 | Orchestration | **PASS** | 分派事件写明三角色顺序与「不并发」；每个请求带输入、输出与分支原因 |
| A21 | Multi-Agent | **PASS** | 三角色卡片 + 2 条交接事件（含来源）；Verifier 失败 → 结论「核验未完成」，交接标记降级 |
| A22 | 结果指标 | **PASS** | 步骤 / 工具调用 / 重试 / 来源覆盖均可由事件复算（验收脚本逐项重算比对） |
| A23 | 权限规则 | **PASS** | 默认 denied → 仅开权限仍 denied（沙箱）→ 权限 + 关闭沙箱 allowed；2×2 矩阵四格可复算 |
| A24 | Sandbox 边界 | **PASS** | 三档白名单可切换；页面明确写「不构成真实隔离」「没有文件系统、没有网络」 |
| A25 | Injection 样例 | **PASS** | 样本标题含「教学用模拟提示注入样本」、`untrusted=true`；3 条诱导动作全被拒绝；配置与系统指令变更均为 false |
| A26 | Guardrails | **PASS** | 输入/工具/输出三处检查；命中规则与原因可见；「可能漏掉什么」四条常显；关闭后明确「没检查」 |
| A27 | Tracing | **PASS** | 18 条事件可筛选（全部 / 允许-拒绝 5 / 规则 5 / 来源 2）；每条带规则、来源与终止原因 |
| A28 | Evals | **PASS** | 4 条固定样例；每条含输入、预期、实际、理由 + 事件 ID；默认 4/4、放宽 2/4；重跑完全一致 |
| A29 | 安全声明 | **PASS** | 页面出现「不代表已通过安全认证」「不构成真实隔离」；无肯定式「已通过安全认证 / 完成渗透测试 / 生产级防护」表述 |
| A30 | 跨页面联动 | **PASS** | STORY 六章 → 第 04 章叙事 → Knowledge Lab → 知识页 → 再进 Lab → Atlas 全部可达 |
| A31 | 学习进度 | **PASS** | 改配置后 `chunking` / `permissions` 记录 `experimentCompleted + experimentIds`；刷新后恢复；只浏览不记录 |
| A32 | 旧数据保护 | **PASS** | 预置 M0 装配配置与 M0.4 运行记录后刷新仍逐字保留；学习进度 v1 旧键仍在 |
| A33 | 响应式/无障碍 | **PASS** | `lang=zh-CN`；108 个可聚焦控件全部有可访问名称；4 个 aria-live 区；390px 单列、无横向溢出；`prefers-reduced-motion` 下片段与结论仍正确 |
| A34 | 纯前端 | **PASS** | 运行时资源请求 0 条远程；`dist/index.html` 仅相对路径引用；无后端 / 无真实 AI / Embedding / MCP / 搜索 API |
| A35 | 构建与测试 | **PASS** | `node --test` 336/336；`node tools/check.mjs` 通过（106 文件语法 + 0 数据问题 + 产物路径）；`node tools/build.mjs` 成功 |
| A36 | 回归与汇报 | **PASS** | 同一进程内真实运行 M0.3（33/33）、M0.4（44/44）、M1.1（27/27）、M1.2（29/29）= 133 项全通过；本文即汇报 |

> 补充：任务书 §6.10 要求的「播放 / 暂停 / 逐步前进 / 查看事件 / 重置」由验收脚本的「播放控制」一项单独验证（选中第 1 条 → 可见 1、前进 → 2、全部展开 6/6、播放状态可查询），结果一致。

---

## 6. 测试与构建证据

### 6.1 实际执行的命令与结果

```text
$ node --test "tests/**/*.test.mjs"
ℹ tests 336
ℹ pass 336
ℹ fail 0
ℹ duration_ms ~1250

$ node tools/check.mjs
=== 1. 语法检查（node --check · ESM） ===
文件数 106 · 通过 106 · 失败 0
=== 2. 知识层数据契约（validateKnowledge） ===
章节 6 · 概念 36 · 关系 49 · 问题 0
状态分布 outline=0 reviewed=11 published=25 draft=0
来源 37 条（外部 30 · 已核验 36）· 实验 6/6 可操作
=== 3. 静态产物路径（dist/index.html） ===
相对引用=true · 绝对/CDN 引用=false
结论：通过

$ node tools/build.mjs
[build] mode                release (minified)
[build] dist/assets/app.css  163.9 KB
[build] dist/assets/app.js   1582.9 KB
[build] dist/index.html      0.9 KB
[build] index.html (offline) 1746.5 KB
[build] done in ~600ms — 零外部 CDN 依赖

$ node tools/m13-acceptance.mjs
M1.3 验收（A01–A35 + A17b）：36/36 PASS
A36 回归（M0.3 / M0.4 / M1.1 / M1.2）：4/4 组 PASS
合计：40/40 通过 · 报告 verify/m13-report.json · 截图 verify/m13-shots/
```

### 6.2 测试增量

| 阶段 | 测试项 |
| --- | --- |
| M1.2 交付时 | 239 |
| M1.3 交付后 | **336**（+97：知识实验 34、运行实验 19、可靠性实验 21、内容与红线 23） |

### 6.3 截图证据（`verify/m13-shots/`）

| 文件 | 内容 |
| --- | --- |
| `F61-知识页Sandbox-INSPECT.png` | 沙箱概念 INSPECT 层：规则模拟 / 不构成真实隔离 |
| `F62-KnowledgeLab默认.png` | LAB 04 三栏、片段边界标记、差异对照 |
| `F63-RuntimeLab事件时间线.png` | LAB 05 完整 10 条事件、Inspector 详情、Harness 触发 |
| `F64-ReliabilityLab判定与事件.png` | LAB 06 配置区、注入样本、评估概览 |
| `F65-移动端KnowledgeLab.png` | 390px 单列布局 |

---

## 7. 回归结果（M0.1–M1.2）

在同一浏览器进程内依次真实运行四个既有阶段的验收脚本（不清空彼此的断言目标，脚本自身会准备前置数据）：

| 回归组 | 结果 | 说明 |
| --- | --- | --- |
| M0.3 工具调用与执行台 | 33/33 PASS | Atlas、Tool Calling 四步、执行台事件、回放、无 WebGL 降级 |
| M0.4 研究闭环与来源追溯 | 44/44 PASS | 检索 → 读取 → 冲突 → 更正 → 报告 → 引用 |
| M1.1 知识架构与学习基础 | 27/27 PASS | 六章目录、Atlas、知识页模板、学习进度、旧数据迁移；含 A24「M0 回归」（开场 → 装配台 → Atlas → Tool Calling → 执行回放 → 报告） |
| M1.2 AI 基础与工具交互 | 29/29 PASS | 三章叙事、Token / Context / Tool Calling 三个实验、跨视图导航 |

回归脚本中与 M1.3 直接相关的基线数字已同步更新（状态分布 0/11/25、关系 49、六章叙事、六个可用实验、`storyHasChapter=6`），原有检查意图与严格程度不变；未为了让结果变绿而删除任何检查项。

---

## 8. 遗留问题

### P0（阻碍进入 M1.4）：无

### P1（应在 M1.4 处理）

1. **Atlas 画布仍只绘制 M0.3 的 10 个节点**：18 个新概念只能通过目录 / 搜索 / 关系列表进入，星图上没有坐标。任务书本阶段明确不承担 Atlas 视觉升级，M1.4 需为第 04–06 章补坐标与分区。
2. **章节叙事尚未做全站整合**：六章叙事各自完整，但章与章之间的总览页、跨章「研究进度回顾」留待 M1.4。
3. **Knowledge Journal 尚无入口**：本轮按任务书只提供可用导航，不提前实现。

### P2（可后续优化）

1. Knowledge Lab 的向量示意只有 5 个固定问题带坐标；若要支持自由输入，需要引入「预计算坐标表 + 明确标注」的扩展机制，而不是实时编码。
2. Runtime Lab 的指标面板未做多次运行的历史对比（任务书明确排除 M2 的完整档案管理）。
3. Reliability Lab 的护栏规则是字面模式，可考虑增加「同义改写绕过」的演示样例，进一步强化「漏报」教学。
4. `tools/shots.mjs` 尚未把 M1.3 截图纳入统一入口（当前由 `tools/m13-acceptance.mjs` 自行落盘）。

---

## 9. 技术纪律确认

- **纯前端**：运行期所有业务逻辑都在浏览器内执行；无 Flask / FastAPI / Express / API Routes / Serverless；无云端数据库。
- **无真实 AI 依赖**：不调用任何 LLM、Embedding、MCP Server 或实时搜索；核心语料随静态构建打包（`dist/assets/app.js`）。
- **模拟声明**：三个实验常显 `SIMULATION / 本地模拟`；向量坐标、注入样本、权限沙箱、评估结论均写明「非真实模型输出 / 非真实隔离 / 非安全认证」。
- **存储纪律**：学习进度 `agent-zero:learning:v2`、记忆 `agent-zero:lab-knowledge:v1`、装配 `agent-zero:constructor:v1`、研究 `agent-zero:research:v2` 四个命名空间互不覆盖；旧键 `agent-zero:learning:v1` 只读迁移、永不删除。
- **Git**：本轮仅有**工作区本地改动**，未推送远程、未部署上线、未执行破坏性 Git 操作（`git status` 仅显示本轮新增/修改文件与 `docs/M1.3_TASK.md`）。
- **PowerShell**：本报告涉及的命令均在同一会话内以 `pwsh`（PowerShell 7.6.7）执行，未使用 Windows PowerShell 5.1。

---

## 10. 附：M1.3 验收与任务书条目的对照

`tools/m13-acceptance.mjs` 的检查编号是本阶段脚本内部编号，与任务书 A01–A36 不是一对一映射（例如脚本把「权限规则」「沙箱边界」编为 A24/A25）。对应关系如下，便于复核：

| 任务书 | 脚本检查 |
| --- | --- |
| A01–A06 | A01–A06 |
| A07 | A07 + `tests/m13-content.test.mjs` 的 14 项红线断言 |
| A08 | A08 |
| A09–A16 | A09–A16 |
| A17–A22 | A17 / A17b / A18–A22 |
| A23 | A24（权限规则） |
| A24 | A25（沙箱边界） |
| A25 | A26（注入样例） |
| A26 | A27（护栏） |
| A27 | A28（追踪） |
| A28 | A29（评估） |
| A29 | A30（安全声明） |
| A30 | A33（跨页面联动） |
| A31 | A31（学习进度） |
| A32 | A32（旧数据保护） |
| A33 | A34（响应式 / 无障碍） |
| A34 | A35（纯前端） |
| A35 | §6.1 的 build / check / test 输出 |
| A36 | A36（四阶段回归）+ 本文件 |
| （§6.10） | 脚本中的「播放控制」一项 |
| （§13 成功路径） | A17b + `tests/runtime-lab.test.mjs` 的「成功路径」与「三类结局」两项 |
---

## 11. 复核补记（2026-10-23 第二次自查）

交付后按「是否真的做完」重新逐条比对任务书，发现并修复了两处**实质缺陷**（不是文档措辞）：

| 缺陷 | 具体表现 | 影响 | 修复 |
| --- | --- | --- | --- |
| 引擎把事件日期锚点写死为「招聘会」 | `callTool()` 读文档时调用 `eventDateOf(docId, '招聘会')`，换个查询就抽不到日期 | 「成功」路径无法到达：Runtime Lab 只能演示未决与无证据，违反 §13「Workflow / Agent Loop 的成功、失败、重试、最大步数」测试要求 | 锚点改为由任务查询提供（`query.anchor`），并新增第三个查询「创客分享会」（只命中 NTC-1001，日期唯一） |
| Agent Loop 缺少「已完成」出口 | 比对发现日期一致后，`conflict=false` 使决策继续走 `compare`，一直空转到步数上限 | 结论虽正确，但终止原因记为 `max-steps`，会误导读者以为「循环跑到没电」；同时「成功」的终止语义缺失 | 增加 `state.compared` 与两个出口：日期唯一 → `target-reached`（目标达成）；命中但抽不到日期 → `no-date`（证据不足）。三类结局现在各有明确终止原因 |
| 原「成功路径」测试是空断言 | 只断言 `status` ∈ {unresolved, supported, insufficient}，必然为真 | 测试全绿但什么都没验证 | 改为断言 `supported` + `target-reached` + 精确日期 + 来源 + 3 步；并新增「三类结局都可达」一项 |
| 检索缺「同分排序」用例 | 只有顺序断言，没有构造同分场景 | §13 要求「同分排序」未被真正覆盖 | 新增同分用例：三个同分片段打乱输入后必须按「来源 ID → 片段序号」稳定排序 |

复核后的实测结果：`node --test` **336/336**；`tools/check.mjs` 通过；`tools/build.mjs` 成功；浏览器验收 **40/40**（A01–A35 + A17b + 四组回归）。

另外核对了两处容易说过头的地方并已在文中更正：
1. 原 §7 表把「M0.1 开场 / M0.2 装配」算在 M0.3 脚本名下——实际这两项由 **M1.1 脚本的 A24「M0 回归」**覆盖（开场 → 装配台 → Atlas → Tool Calling → 执行回放 → 报告），已改正。
2. 原测试增量写作「+95，知识实验 32 / 可靠性 27」——以实际统计为准改为 **+97（知识 34 / 运行 19 / 可靠性 21 / 内容 23）**。

仍未覆盖、如实列出的一点：`no-date`（命中公告但抽不到事件日期）这条防御性出口在现有语料下无法触发——`图书馆` 类查询会连带命中含日期的开放日公告。它由代码与终止原因白名单守护，但没有端到端用例；若后续更换语料需要补一条样例。
