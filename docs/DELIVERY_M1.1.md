# DELIVERY — M1.1 知识架构与学习基础

> 阶段：M1.1 · KNOWLEDGE UNIVERSE / 知识架构与学习基础
> 交付性质：纯前端增量交付（无业务后端、无远程 LLM、无云存储）
> 执行环境：Node v24.17.0 / npm 11.13.0 / 本机 Chrome（无头 CDP 真实渲染）/ PowerShell **7.6.7**（本次全部命令在 `pwsh` 中执行，未降级到 5.1）
> 验收证据：`verify/report.json` + `verify/shots/F01–F34`

---

## 0. 结论摘要

| 项目 | 结果 |
|---|---|
| D01–D07 七项交付 | **全部完成**（详见 §1） |
| 六章注册表 | 6 章，`chapterId` 稳定、顺序与 PRD 精简路线一致 |
| 概念索引 | **36** 个（30–40 区间内），M0.3 的 10 个稳定 ID 全部保留 |
| 内容状态分布 | `outline 26 / draft 0 / reviewed 9 / published 1` |
| 语义关系 | **47** 条（USES 7 / PART_OF 3 / RELATED 33 / CONTRASTS 4），M0.3 的 10 条原样保留 |
| 星图画布 | 10 个已开放节点 / 12 条边（只画有正文的节点） |
| 实验登记 | 6 个：可操作 1 / 后续阶段开放 5 |
| 纯逻辑测试 | **189 通过 / 0 失败** |
| 静态检查 | 语法 74 文件通过 + 数据契约 0 问题 + 产物相对路径通过 |
| 生产构建 | 通过（`dist/` 与离线单文件 `index.html`） |
| 浏览器验收 | T01–T13 **13/13**、M0.2 **25/25**、M0.3 **33/33**、M0.4 **44/44**、**M1.1 27/27** |
| 横向溢出 | 1920 / 1280 / 1024 / 390 四种视口均为 **0px** |

**一句话**：M1.1 交付的是「可扩展、可验证、非虚构」的知识底座与最小可用界面；六章正文与 36 个教程**没有**在这一轮完成，这是设计如此，不是遗漏。

---

## 1. 范围核对（D01–D07）

| ID | 要求 | 实际完成情况 | 证据 |
|---|---|---|---|
| **D01** | 六章节统一注册表（`chapterId`、顺序、双语标题、简介、叙事问题、关联概念） | ✅ 完成。`src/knowledge/chapters.js` 为唯一来源：6 章、编号 01–06、`title.zh/en`、`question`、`intro`、`hook`、`contentMilestone`（M1.2 / M1.3）、`labId`；关联概念由概念数据派生（`getConceptsByChapter`）。`src/data/content.js` 的 `CHAPTERS` 改为从注册表派生，杜绝并行副本 | `validateKnowledge()` 零问题；STORY 页面截图 `F31` |
| **D02** | 30–40 个概念元数据（稳定 ID、章节归属、双语名称、别名、内容状态） | ✅ 完成 36 个（每章 6 个）。字段：`id / chapterId / order / idx / title.zh·en / name / cn / aliases / contentStatus / oneLiner / plannedMilestone / tagline`；M0.3 的 10 个 ID 原样保留，未完成项一律 `outline` 并写明计划阶段 | `tests/knowledge.test.mjs` A03/A04/A05；`npm run check` 输出 |
| **D03** | 类型化知识节点内容模板（一句话 / UNDERSTAND / INSPECT / 常见误解 / 示例 / 关联 / 来源 / 对应实验） | ✅ 完成。`defineConcept()` 统一字段与默认值；`src/features/knowledge/components/knowledgePage.js` 一个模板覆盖「已审校 / 仅索引」两类，缺字段走降级分支 | A08 / A09 浏览器断言；`F32`（INSPECT 层）、`F33`（建设中索引页） |
| **D04** | 统一语义关系与校验（USES / PART_OF / RELATED / CONTRASTS，方向与解释明确，不造假依赖） | ✅ 完成 47 条。M0.3 的 10 条 `id/端点/类型/方向/说明` **一字未改**（`origin: 'M0.3'`）；新增 37 条的 `description` 均写明「是什么关系 + 容易误解在哪」；PART_OF 只保留 3 条可推敲的层级（`ml→ai`、`system_prompt→instructions`、`mcp_server→mcp`），并修正了 M0.3 中 PART_OF 的方向说明（原描述「右侧是左侧的组成部分」与命名相反，本轮改成「左侧是右侧的组成部分」） | `validateKnowledge()` 的 12 类关系校验；A11 / A12 / A13 |
| **D05** | 统一内容访问接口（ID / 别名 / 章节 / 关系查询，Story/Atlas/Node/Lab 同源） | ✅ 完成。`src/knowledge/index.js` 导出 `getConcept / getChapter / getConceptsByChapter / searchConcepts / getConceptByAlias / getRelations / edgesOf / relatedOf / conceptAvailability / graphModel / knowledgeStats / validateKnowledge`；`src/features/atlas/data/index.js` 退化为**纯转发层**（旧文件 `concepts.js`、`relationships.js` 已删除），因此不存在第二套知识系统 | A06 搜索断言；`grep` 确认组件内无第二份过滤/别名表 |
| **D06** | 学习进度基础 + 非破坏性迁移（探索 / 实验完成 / 关联发现独立标志，本地持久化） | ✅ 完成。`schemaVersion 2`，新键 `agent-zero:learning:v2`，旧键 `agent-zero:learning:v1` **只读迁移、原样保留**；新增 `visitedAt / lastViewedAt / experimentCompletedAt / relatedDiscoveredIds / experimentIds` 与全局 `lastViewed`；「完成实验」只对真实可用实验生效（对无实验概念调用会被拒绝并记日志） | A18 / A19 / A20；`tests/atlas.test.mjs` 学习用例 |
| **D07** | 最小可用界面与质量保障（六章目录、统一知识详情、Tool Calling 保持可用、测试与静态构建通过） | ✅ 完成。新增 STORY（六章目录）与 LAB（实验登记表）；ATLAS 升级为「36 概念章节目录 + 10 节点画布」；Tool Calling 四步路径与内嵌实验行为不变；`npm run check`、`npm test`、`npm run build`、`npm run shots` 全部实际执行 | §4 测试结果 |

### 本轮**没有**做（按任务书属后续阶段）

- 六章正文与 36 个完整教程（第 1–3 章 → M1.2，第 4–6 章 → M1.3）；本轮只有 10 个概念的正文可用。
- 六个完整实验：只登记，仅 Tool Calling 内嵌实验可操作。
- 完整知识星图视觉优化、整章电影级滚动叙事、完整 Knowledge Journal UI（→ M1.4）。
- 不重做 M0.1 开场 / AZ-CORE 01、M0.2 三维装配、M0.3/M0.4 研究运行与报告链。
- 不接入真实 MCP / RAG / 向量库 / 爬取 / 在线模型 / 用户同步。

---

## 2. 文件变更

### 2.1 新增 · 统一知识层（`src/knowledge/`）

| 路径 | 作用 |
|---|---|
| `src/knowledge/chapters.js` | 六章唯一注册表（`CHAPTERS / CHAPTER_ORDER / getChapter / chapterIdByNo`） |
| `src/knowledge/concepts/helpers.js` | `defineConcept()` 与内容状态定义（`outline/draft/reviewed/published`），负责字段默认值与冻结 |
| `src/knowledge/concepts/ch01-intelligence.js` … `ch06-reliability.js` | 每章 6 个概念元数据（共 36）；M0.3 的 10 个概念正文迁入并按新 schema 补齐 `oneLiner / inspect / sources / graph` |
| `src/knowledge/concepts/index.js` | 汇总、全局 `idx`（01–36）、章节派生字段、章内位置与相邻概念查询 |
| `src/knowledge/relations.js` | 47 条语义关系 + 关系类型定义 + 按端点索引（`edgesOf`） |
| `src/knowledge/layout.js` | 画布坐标（10 个已开放节点，逐点沿用 M0.3）、`GRAPH_ORDER`、`GRAPH_VIEW` |
| `src/knowledge/sources.js` | 来源注册表（全部为仓库内文档、无 URL；`reviewed` 标记）+ 来源诚实校验 |
| `src/knowledge/experiments.js` | 实验登记表（1 可用 / 5 计划）与可用性判定 |
| `src/knowledge/index.js` | **统一内容访问接口**、检索、可用性、星图模型、统计与 `validateKnowledge()` |

### 2.2 新增 · 界面与样式

| 路径 | 作用 |
|---|---|
| `src/features/knowledge/components/storyWorkspace.js` | STORY 六章目录：章节导航、双语标题、核心问题、简介、章内概念（含状态与学习标记）、本章实验登记 |
| `src/features/knowledge/components/knowledgePage.js` | 统一知识详情模板：章内目录 + UNDERSTAND/INSPECT + 常见误解 + 示例 + 关联关系 + 来源状态 + 实验入口 + 章内导航；outline 概念只呈现索引信息 |
| `src/features/knowledge/components/labWorkspace.js` | LAB 实验登记表：只有真实可用实验渲染运行按钮，其余显示「后续阶段开放」 |
| `src/styles/universe.css` | 上述三块界面的样式（沿用 tokens.css 语义变量；含 1280 / 1024 断点） |

### 2.3 修改

| 路径 | 变更 |
|---|---|
| `src/features/atlas/data/index.js` | 从「知识数据源」改为**兼容转发层**，只 re-export 统一知识层 |
| `src/features/atlas/data/concepts.js`、`relationships.js` | **删除**（内容迁移进 `src/knowledge/`，避免第二套知识系统） |
| `src/features/atlas/graph/atlasGraph.js` | 改为读取 `graphModel()`：只画有坐标的已开放节点与两端可画的边；修复 `setPointerCapture` 在合成事件下抛 `NotFoundError` 的问题 |
| `src/features/atlas/components/atlasWorkspace.js` | 左栏改为六章分组目录（36 条，含建设中概念与状态标签）；搜索覆盖全量概念；详情增强章节位置、可用性、实验状态与知识页入口 |
| `src/features/atlas/state/learning.js` | 学习进度 v2：多标志 + 时间戳 + 关联/实验 ID 列表 + `lastViewed` + 旧键迁移 + 实验真实性校验 |
| `src/features/atlas/knowledge/toolCalling.js` | 仅修正渲染层：把 9 处字面量 `**加粗**` 改为真实 `<strong>`（正文内容与实验逻辑未改） |
| `src/data/content.js` | `CHAPTERS` 与 `TERM_INDEX` 改为由知识层派生；NAV 解锁 STORY / LAB 并更新说明；MILESTONES 更新到 M1.1 |
| `src/app.js` | 新增 `openStory / openLab` 与工作区路由；`openKnowledge` 按概念分流（Tool Calling 走四步页，其余走统一模板）；Esc 逐级返回；`window.__AZ` 暴露知识层快照；启动日志与新命名空间提示；修复无 WebGL 时 `scene.resize` 缺失导致的窗口尺寸异常 |
| `src/components/layout/panels.js` | 术语索引条数改为动态（36）并修正说明文案中的字面量加粗 |
| `README.md` | 更新为 M1.1 定位、路径说明与新增章节 |
| `package.json` | 版本/描述更新；新增 `npm run check` |
| `tests/atlas.test.mjs` | 按新数据事实更新断言（36 概念 / 47 关系 / v2 存储），保留全部 M0.3 语义断言 |
| `tools/m03-acceptance.mjs`、`tools/m04-acceptance.mjs`、`tools/shots.mjs` | 更新受 M1.1 影响的期望值（目录 36 条、画布 12 条边、学习键 v2、导航全部解锁），并接入 M1.1 验收 |

### 2.4 新增 · 测试与验收

| 路径 | 作用 |
|---|---|
| `tests/knowledge.test.mjs` | M1.1 知识层测试（A02–A14）：章节、概念索引、归属、双语搜索、内容状态、分层模板、误区、实验链接、关系语义与方向、旧关系保留、来源诚实、画布节点集合 |
| `tools/check.mjs` | 可执行的静态检查：`node --check`（74 个源文件）+ `validateKnowledge()` + 产物相对路径 |
| `tools/m11-acceptance.mjs` | M1.1 浏览器验收 A01–A24（真实 DOM 与真实 store 驱动，含旧数据迁移、损坏数据、Run 隔离、dist 相对路径加载） |

### 2.5 迁移的旧内容与存储键

| 旧位置 | 新位置 | 处理方式 |
|---|---|---|
| `src/features/atlas/data/concepts.js`（10 个概念） | `src/knowledge/concepts/ch01/03/04/05-*.js` | **正文逐字迁移**（`understand` / `misconceptions` / `tagline` / `aliases` / `systemTarget` / `graph` 坐标），新增 `oneLiner / inspect / sources / reviewNote`；`contentStatus` 按审校事实标注（Tool Calling = published，其余 9 个 = reviewed） |
| `src/features/atlas/data/relationships.js`（10 条边） | `src/knowledge/relations.js` | **id / 端点 / 类型 / 方向 / 说明全部原样保留**，新增 `origin: 'M0.3'` 供审计区分 |
| `NODE_LAYOUT` / `GRAPH_VIEW` | `src/knowledge/layout.js` | 坐标逐点不变（刷新不重排） |
| 学习进度 `agent-zero:learning:v1` | `agent-zero:learning:v2` | **只读迁移**：读到 v1 后按 v2 规则规范化并写入 v2；**v1 不删除、不改写**，降级回旧版本仍可读 |
| 构建器 `agent-zero:constructor:v1` / 运行记录 `agent-zero:research:v2` | 不变 | 未触碰；A21 与 A28b 断言互不覆盖 |

---

## 3. 章节与概念摘要

### 3.1 六章

| # | chapterId | 中文 | 英文 | 核心问题 | 章内可用 / 总数 | 实验登记 |
|---:|---|---|---|---|---|---:|---:|
| 01 | `intelligence` | 智能诞生 | INTELLIGENCE | 模型为什么能回答，却不必然有可验证的外部事实？ | 1/6 | Token Lab（M1.2） |
| 02 | `context` | 指令与上下文 | CONTEXT | 为什么相同模型在不同上下文下行为不同？ | 0/6 | Context Lab（M1.2） |
| 03 | `connection` | 外部能力 | CONNECTION | 模型如何请求外部工具读取资料？ | 4/6 | Tool Calling 内嵌实验（**可用**） |
| 04 | `knowledge` | 信息与方法 | KNOWLEDGE | 检索、增强、记忆和任务方法如何区别？ | 2/6 | Knowledge Vault（M1.3） |
| 05 | `runtime` | 执行系统 | RUNTIME | 多步骤任务怎样协调、执行与调整？ | 3/6 | Execution Lab（M1.3） |
| 06 | `reliability` | 可靠性与边界 | RELIABILITY | 结果如何验证，权限和风险如何控制？ | 0/6 | Reliability Lab（M1.3） |

### 3.2 36 个概念的构成

- **已发布（1）**：`tool_calling` —— 四步学习路径 + 可操作内嵌实验。
- **已审校（9）**：`llm`、`agent`、`tools`、`api`、`mcp`、`skills`、`rag`、`workflow`、`harness` —— UNDERSTAND 与常见误解沿用 M0.3 审校文本，INSPECT 深层要点本轮依据 PRD 技术边界补写。
- **仅索引（26）**：`ai`、`ml`、`transformer`、`token`、`inference`、`prompt`、`instructions`、`system_prompt`、`context_window`、`context_engineering`、`hallucination`、`function_calling`、`mcp_server`、`retrieval`、`embedding`、`memory`、`chunking`、`agent_loop`、`orchestration`、`multi_agent`、`permissions`、`sandbox`、`prompt_injection`、`guardrails`、`tracing`、`evals` —— 有 `id/章节/双语名/别名/一句话草稿/计划阶段`，**没有**正文、没有实验，界面明确显示「内容建设中」。

> 统计口径：`contentStatus` 是唯一判据；`outline` 概念即使出现在目录、搜索与关系图数据中，也**不会被算作已学完**，也不会被画进星图画布。

### 3.3 关系与来源

- 关系 47 条：`USES 7 / PART_OF 3 / RELATED 33 / CONTRASTS 4`；PART_OF 只认「部分 → 整体」方向。
- 画布只画 10 个节点、12 条边（10 条 M0.3 的边 + 新增 `api–mcp`、`workflow–harness` 两条真实关系）。
- 来源 5 个，全部为仓库内文档（`M0.3_TASK.md`、`M1.1_TASK.md`、PRD、DESIGN_SYSTEM、索引草稿）；**没有任何外部 URL**，也没有编造作者/日期/引用。索引草稿 `reviewed: false`，界面显示「待核验」。

---

## 4. 测试结果（全部实际执行）

### 4.1 命令与结果

| 命令 | 结果 | 证据 |
|---|---|---|
| `npm run check` | **通过** —— 语法 74/74 文件、知识层契约 0 问题（6 章 / 36 概念 / 47 关系）、产物相对路径通过 | 终端输出 |
| `npm test` | **189 通过 / 0 失败 / 0 跳过**（含新增 `tests/knowledge.test.mjs`） | node --test 汇总 |
| `npm run build` | **通过** —— `dist/assets/app.css` 127.0 KB、`dist/assets/app.js` 1091.1 KB、`dist/index.html`、离线单文件 `index.html` | 构建输出 |
| `npm run shots` | **通过** —— 无头 Chrome 真实渲染：T13/13、M0.2 25/25、M0.3 33/33、M0.4 44/44、M1.1 27/27；目录 `verify/shots` 重出 F01–F34 | `verify/report.json` |

> **关于「TypeScript 检查」**：仓库经审计为**原生 ES Module + esbuild** 的纯前端工程（无 React、无 TS 配置、无 `typescript` 依赖，离线环境也无法安装）。因此本轮**没有**伪造 `tsc` 结果，而是提供可执行的等价门禁 `npm run check`（全量 ESM 语法检查 + 数据契约校验 + 产物路径校验），并以 esbuild 生产构建作为模块解析的二次验证。A22 判为 **Pass（以可执行替代方案覆盖）**，但「严格 TS 类型检查」如实标注为 **不适用**。

### 4.2 M1.1 验收矩阵（A01–A24）

| ID | 检查项 | 结果 | 证据摘要 |
|---|---|---|---|
| A01 | 仓库审计 | **Pass** | 见 §0/§2：审计记录 M0 内容模型、路由、存储与可复用组件（另含两处既有缺陷修复） |
| A02 | 六章完整 | **Pass** | `章节=6`，`chapterId` 顺序 `intelligence,context,connection,knowledge,runtime,reliability`，中文/英文标题与 PRD 一致，问题齐全 |
| A03 | 概念索引 | **Pass** | `概念=36`、ID 唯一、目录条目 36（30–40 区间） |
| A04 | M0 ID 兼容 | **Pass** | 原 10 个 ID 全部可在目录/搜索定位，正文与坐标保留 |
| A05 | 归属有效 | **Pass** | 6 组、36 条全部指向合法章节；每章 `order` 1–6 连续 |
| A06 | 双语搜索 | **Pass** | `LLM→llm`、`TOOLCALLING→tool_calling`、`工具调用→tool_calling`、`幻觉→hallucination`、`沙→sandbox`；零结果与清除状态清晰 |
| A07 | 内容状态 | **Pass** | `outline 26 / reviewed 9 / published 1`；outline 页无正文、无深度层开关、有「内容建设中 + M1.3」 |
| A08 | 分层模板 | **Pass** | UNDERSTAND 3 段 / INSPECT 4 条可切换，示例块存在 |
| A09 | 误区模板 | **Pass** | 误解/纠正成对；outline 概念不渲染误区区块但页面仍有 1159 字索引信息与关系导航 |
| A10 | 实验链接 | **Pass** | 概念页未开放实验无运行按钮；Lab 6 项中仅 1 个运行按钮、5 条「后续阶段开放」 |
| A11 | 语义关系 | **Pass** | 画布 12 条边、选中 `agent` 8 条关系，全部有 ≥20 字解释；47 条关系端点/类型/说明校验零问题 |
| A12 | 关系方向 | **Pass** | 有向 3 行（`→`）/无向 5 行（「无向 · 不表示必需依赖」）；PART_OF 仅 3 条且方向为「部分→整体」 |
| A13 | 旧关系保留 | **Pass** | M0.3 的 10 条边 `id/类型/方向/说明` 未改（`origin: 'M0.3'`），浏览器内可见 6/6 的 agent 相关旧边 |
| A14 | 来源诚实 | **Pass** | 来源 2 行全部「已核验」内部文档、外部链接 0、页面明示「不编造外部链接」 |
| A15 | Story 目录 | **Pass** | 六章可浏览，章状态 `partial/index-only`、每章 6 个概念与实验登记可见 |
| A16 | Atlas 衔接 | **Pass** | 画布 10 节点可选/搜索/聚焦，目录 36 条（建设中概念弱化虚线但仍可选中） |
| A17 | Tool Calling 回归 | **Pass** | 四步齐全、可直接落在 EXPERIMENT、事件行 9、本地学习记录写入 v2、装配台未被改动 |
| A18 | 学习状态独立 | **Pass** | `memory` explored=true 而 experiment=false；`lastViewed=memory/knowledge`；汇总 `total=36`；对无实验概念标记实验被拒绝 |
| A19 | 学习迁移 | **Pass** | v1 记录（含 `visits=3`）逐条迁入 v2，`tool_calling` 三个标志全保留，v1 原文逐字节未变 |
| A20 | 损坏数据 | **Pass** | v2 写入坏 JSON 后页面仍可用（5081 字）、日志可读提示、仍可继续记录、两个学习命名空间都在、构建器与运行记录未受影响 |
| A21 | Run 隔离 | **Pass** | 阅读/搜索 5 个概念后 `runId` 不变、事件数 5→5、配置快照一致、`research:v2` 未被改写 |
| A22 | 静态构建 | **Pass（替代方案）** | `npm run check` 通过 + `npm test` 189/189 + `npm run build` 通过；严格 TS 检查**不适用**（无 TS 工程） |
| A23 | 路径适配 | **Pass** | 离线单文件无外部资源/无绝对路径/0 外部请求；`dist/index.html` 以 `./assets/*` 加载并在浏览器内成功启动（36 概念就绪） |
| A24 | 回归与报告 | **Pass** | M0 主链路回归通过 + M0.2/M0.3/M0.4 既有验收套件全绿（见 §5）；控制台无未捕获异常 |

> 未验证项（如实记录）：真实 GPU/移动设备上的帧率与触控手感、外部权威资料的人工核验（本轮未引入外部来源，故无外部核验记录）、M1.2/M1.3 的正文与实验（不在本轮范围）。

---

## 5. M0 回归记录（每条均为实际运行结果）

| 链路 | 证据 |
|---|---|
| **M0.1 开场 / AZ-CORE 01** | T01–T13 全通过（13/13）；`T05` 三维高亮 + SVG 高亮 + 检视面板同步（标题「机械轨道 C」）；`T07` 导航全部为真实入口（未开放 0 个）、无「隐藏却可点」控件 |
| **M0.2 装配** | M0.2 验收 25/25；A24 回归中 `previewModule → confirmAssembly → configureModule` 得到 `Ready`，Atlas 节点 10 |
| **M0.3 Atlas + Tool Calling** | M0.3 验收 33/33；A01/A02 断言画布 10 节点 / 12 条边；A17 中 Tool Calling 四步 + 实验事件 9 条 + 学习记录写入 |
| **M0.3 执行回放** | M0.3 A25/A26/A26b：播放/暂停/单步/Seek/调速/复位均不改变事件数组 |
| **M0.4 研究运行与报告** | M0.4 验收 44/44；A24 回归中 `RUN SIMULATION` 产生 12 个事件、Seek 定位一致、报告视图可打开；`A63` 报告导出 3698 字符、引用齐全；`A64` 旧版运行（schema v1）恢复为「尚无结构化报告」而不补造结论；`A69` 前三阶段冒烟通过；`A70` 外部资源 0、绝对 URL 0 |
| **报告来源追溯** | M0.4 A55/A63：旧事实与更正结论的引用同时保留，引用可反查到真实 `eventId` |
| **降级路径** | M0.3 A29：无 WebGL + 减少动态 + 窄屏下星图/知识页/执行台均可用，关键控件可键盘聚焦；M1.1 多视口截图溢出均为 0 |

### 本轮顺带修复的既有缺陷（最小改动）

1. **`src/app.js`**：无 WebGL 时 `scene` 是降级对象（没有 `resize`），窗口尺寸变化会抛 `TypeError`。改为 `scene?.resize?.()`。
2. **`src/features/atlas/graph/atlasGraph.js`**：合成指针事件下 `setPointerCapture` 抛 `NotFoundError` 会中断画布交互。改为 `try/catch` 包裹（捕获失败只影响拖出画布后的继续接收）。
3. **`src/features/atlas/knowledge/toolCalling.js`**：9 处字面量 `**加粗**` 在 HTML 里未转换，会显示原始星号；改为 `<strong>`（内容未改）。
4. **`src/components/layout/panels.js`**：术语索引条数硬编码「29 个」与实际不符；改为动态计数，并清理说明中的字面量加粗。

---

## 6. 技术纪律

- **纯前端**：运行期只用本地静态资源、本地 TS/JS 数据、本地状态与 `localStorage`；无业务后端、无 API Routes、无 Serverless。
- **零远程调用**：验收中 `performance.getEntriesByType('resource')` 的外部请求数为 **0**；`M0.4 A70` 同结论。
- **静态部署**：`dist/index.html` 使用 `./assets/app.js`、`./assets/app.css` 相对路径，且在浏览器中实际启动成功（M1.1 `A23b`）；项目无前端路由，子路径下刷新不会 404。
- **数据分区**：知识（`src/knowledge/`）、系统配置（`agent-zero:constructor:v1`）、执行轨迹（`agent-zero:research:v2` / `agent-zero:execution:v1`）、学习进度（`agent-zero:learning:v2`）四类数据互不覆盖（A20/A21/A28b 断言）。
- **Git**：**仅本地工作区变更，未提交、未推送**。需注意当前工作区同时包含 M0.4 阶段尚未提交的既有改动（本次未改动其内容，如 `src/simulation/*`、`src/features/execution/*`、`src/features/reports/*` 等为 M0.4 遗留未提交文件）。
- **PowerShell**：本次全部命令在 **PowerShell 7.6.7**（`pwsh`）下执行，未使用 Windows PowerShell 5.1。

---

## 7. 待办（移交下一阶段）

### → M1.2（第 01–03 章正文与实验）

- 为 `ai / ml / transformer / token / inference`（章 01）、`prompt / instructions / system_prompt / context_window / context_engineering / hallucination`（章 02）、`function_calling / mcp_server`（章 03）撰写 UNDERSTAND / INSPECT / 常见误解 / 示例，并把 `contentStatus` 从 `outline` 升到 `reviewed`（升到 `published` 需同时交付可操作实验）。
- 实现 Token Lab、Context Lab，并在 `src/knowledge/experiments.js` 中把 `status` 改为 `available`、补齐 `openMode`。
- 为已审校内容补充可核验来源（外部资料需人工核验后登记 `reviewed: true`）。

### → M1.3（第 04–06 章正文与实验）

- 章 04（`retrieval / embedding / memory / chunking`）、章 05（`agent_loop / orchestration / multi_agent`）、章 06（6 个概念）正文与实验。
- Knowledge Vault、Execution Lab、Reliability Lab 落地；实验登记表状态升级。

### → M1.4（知识宇宙体验）

- 星图视觉扩展（36 节点布局、按章节分区、建设中节点的弱化表达）、整章电影级滚动叙事、Story ↔ 星图 ↔ 知识页联动、完整 Knowledge Journal UI。
- 可选：学习进度 JSON 导出（本轮未做，任务书标注为加分项）。

### 已知边界（非缺陷，供后续判断）

- 星图画布刻意只画 10 个已开放节点：26 个 `outline` 概念不画，避免「索引存在 = 内容完成」的误读。
- 搜索别名做了唯一性约束，因此 `函数调用` 从 `tool_calling` 移交给新概念 `function_calling`（M0.3 的别名映射属便利映射，非稳定 ID）；两个概念都可通过别名与关系互相到达。
- `PART_OF` 目前只有 3 条经审校实例，其余层级关系宁缺勿造。
