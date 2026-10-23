# M1.2 交付报告 · AI 基础与工具交互

> 阶段：M1 · KNOWLEDGE UNIVERSE / M1.2
> 前置：M0.1–M0.4、M1.1 的**实际仓库代码**（审计见 `docs/AUDIT_M1.2.md`）
> 交付日期：2026-10-22
> P0 边界：100% 纯前端；无业务后端、无远程 LLM API、无云端数据库、无实时外部研究请求。

---

## 1. 审计与实现摘要

### 1.1 现有基础（审计结论）

M1.1 的六项能力在仓库中**真实存在且可用**，因此本轮是纯增量开发，没有重建平行系统：

- 六章注册表（`src/knowledge/chapters.js`，6 章 · 稳定 id/no/order）
- 36 概念索引（`concepts/index.js`，`CONCEPT_ORDER` 唯一顺序）
- 分层内容 schema（`helpers.js`：outline / draft / reviewed / published）
- 语义关系（`relations.js`：USES / PART_OF / RELATED / CONTRASTS + 有向性校验）
- 统一内容访问（`knowledge/index.js`：Story / Atlas / Knowledge / Lab 四个入口同源）
- 学习进度 v2 迁移（`learning.js`：`agent-zero:learning:v2`，旧键只读保留）

### 1.2 本轮实际扩展

| 交付 | 内容 |
|---|---|
| D01 三章知识内容 | 第 01–03 章 **18 个概念**全部完成 `reviewed`/`published` 分层正文：一句话解释、UNDERSTAND（2–3 段）、INSPECT（4–6 条）、常见误解（19 条）、本章研究情境示例、语义关系、经核验来源、审校日期 |
| D02 三章 Story 路径 | `src/content/chapters/01-intelligence.js`、`02-context.js`、`03-connection.js` + 通用章节叙事页；每章含开场目标、研究任务、4 个叙事节拍（含可观察局限）、实验入口与步骤、结果解读、章节过渡、上下章导航、随时退出 Atlas |
| D03 Lab 01 · Token / Context Budget | 真实分词（cl100k_base / o200k_base 离线预计算 + 逐条回译校验）、token 片段与序号、四类预算分区、整条舍弃与超限解释、双编码对比 |
| D04 Lab 02 · Instructions / Context | 5 个可配置维度、确定性规则生成报告、事实状态（有来源 / 未验证）、卡片整张舍弃、轻量前后对照 |
| D05 Lab 03 · Tool Calling & MCP | 复用 M0.3 引擎与工具定义；新增「检索超时」失败预设 + 直连 / MCP 路径对照（Host/Client/Server 角色 + Tools/Resources/Prompts 能力类型 + 6 项一致性对照表） |
| D06 跨视图与学习状态 | Story / Atlas / Knowledge / Lab 双向入口；实验完成只在真实操作后写入 `learning:v2`，刷新可恢复 |
| D07 测试、审校、回归 | 239 个单元测试、静态检查、token 复算校验、生产构建、32 项浏览器验收（含 M0.3/M0.4/M1.1 三套回归 33+44+27 项） |

### 1.3 仍未实现（如实说明，属于后续阶段）

- Chapter 04–06 的正文与实验（13 个概念仍为 `outline`，5 个保持 M1.1 的 `reviewed`）→ M1.3
- 全站 Atlas 终极可视化、整章滚动叙事体验、Knowledge Journal → M1.4
- 任意文本的真实分词（运行期不含词表）、真实 MCP 握手 / SDK、真实 LLM 推理 → 不属于本项目任何阶段（P0 红线）

---

## 2. 变更文件清单

### 2.1 知识内容

| 文件 | 变更 |
|---|---|
| `src/knowledge/concepts/ch01-intelligence.js` | 重写：ai/ml/llm/transformer/token/inference 六个概念正文完整化；token 置 published 并挂 Lab 01 |
| `src/knowledge/concepts/ch02-context.js` | 重写：prompt/instructions/system_prompt/context_window/context_engineering/hallucination 六个概念正文 |
| `src/knowledge/concepts/ch03-connection.js` | 重写：api/tools/tool_calling/mcp 文本保留并补来源与 INSPECT；新增 function_calling / mcp_server 正文；mcp 置 published |
| `src/knowledge/concepts/helpers.js` | 新增 `reviewedAt` 字段（审校日期） |
| `src/knowledge/sources.js` | 新增 14 条已核验外部来源（org / versionOrDate / checkedAt / claim），外部来源强制 https + 已核验 + 核验日期 + 版本 + 组织 |
| `src/knowledge/relations.js` | 新增 `rel-toolcalling-mcp`（RELATED，M1.2），总边数 47 → 48 |
| `src/knowledge/experiments.js` | 3 个实验置 available；新增 `openMode / labKind / entryConceptId`；新增 `experimentByLabKind` |
| `src/knowledge/index.js` | 导出扩展 + 新增校验：外部来源必需、审校日期必需（仅第 01–03 章）、实验打开方式/入口概念/可操作唯一性、published 概念必须有实验 |

### 2.2 章节叙事（新增）

| 文件 | 内容 |
|---|---|
| `src/content/chapters/01-intelligence.js` | 第 01 章「MODEL WITHOUT EVIDENCE」叙事数据 |
| `src/content/chapters/02-context.js` | 第 02 章「DEFINE THE QUESTION」叙事数据 |
| `src/content/chapters/03-connection.js` | 第 03 章「CONNECT TO THE WORLD」叙事数据 |
| `src/content/chapters/index.js` | 统一入口 + `validateStories()` 结构校验 + 上下章导航 |

### 2.3 实验逻辑（纯函数，可在无 3D 环境单测）

| 文件 | 内容 |
|---|---|
| `src/features/laboratory/token/fragments.js` | Lab 01 唯一原文来源（5 个样例 + 系统指令 + 6 条虚构资料片段） |
| `src/features/laboratory/token/encodings.js` | 编码元数据（诚实的模型对应说明） |
| `src/features/laboratory/token/tokenTable.js` | **自动生成**：12 片段 × 2 编码的真实 token id 序列与逐 token 文本 |
| `src/features/laboratory/token/budget.js` | 分词视图 + 预算分配/整条舍弃/超限判定（纯逻辑） |
| `src/features/laboratory/context/simulation.js` | Lab 02 确定性规则表与纯函数（卡片预算、事实状态、报告结构、前后对照） |
| `src/features/laboratory/tool-calling/mcpPath.js` | Lab 03 协议路径：角色叠加、能力发现、六项一致性对照（**只读既有 run**） |
| `tools/tokens-build.mjs` | 构建期分词与回译校验，生成 tokenTable |
| `tools/tokens-verify.mjs` | 复算校验（并与真实分词器逐条比对） |

### 2.4 UI / 路由 / 样式

| 文件 | 变更 |
|---|---|
| `src/features/laboratory/token/tokenLab.js`（新） | Lab 01 工作区（参数区 / 主画布 / 结果解释三栏） |
| `src/features/laboratory/context/contextLab.js`（新） | Lab 02 工作区 |
| `src/features/knowledge/components/chapterNarrative.js`（新） | STORY 章节叙事页模板 |
| `src/features/atlas/knowledge/toolCalling.js` | 新增「检索超时」条件与 `buildRun`；新增直连/MCP 路径面板；CONNECT 步骤概念入口 |
| `src/features/knowledge/components/labWorkspace.js` | 3 个可操作实验卡片 + 实验路由；计划实验仍不渲染运行按钮 |
| `src/features/knowledge/components/storyWorkspace.js` | 章节叙事入口（仅前三章有按钮）与状态文案更新 |
| `src/features/knowledge/components/knowledgePage.js` | 来源卡片升级（组织/版本/核验时间/支持断言），实验入口交给应用层路由 |
| `src/app.js` | 新增 `openChapterStory / openLabExperiment / openLabByKind` 与 `chapter/lab-token/lab-context` 工作区；Esc 分层退出；只读快照 API |
| `src/styles/labs.css`（新） | 实验工作区、章节叙事、协议路径、响应式与 reduced-motion |
| `.gitignore` | 修复不可解析的 glob（阻断 ripgrep 的根因） |

### 2.5 测试

| 文件 | 内容 |
|---|---|
| `tests/token-lab.test.mjs`（新） | 21 项：真实分词复算、无字符数折算、预算边界/超限/顺序/非法输入 |
| `tests/context-lab.test.mjs`（新） | 18 项：确定性、五维因果、无来源不出引用、卡片舍弃因果、前后对照 |
| `tests/lab-tool-calling-mcp.test.mjs`（新） | 10 项：协议只包装不新增事件、六项一致、失败/权限/超时、run 不被改写 |
| `tests/story.test.mjs`（新） | 9 项：三章结构完整性、局限文案、概念与实验一致性、04–06 无叙事 |
| `tests/knowledge.test.mjs` / `tests/atlas.test.mjs` | 按 M1.2 状态更新断言（逐条见 §6 备注） |
| `tools/m12-acceptance.mjs`（新） | A01–A29 浏览器验收 + A30 回归（真实运行 M0.3/M0.4/M1.1 验收脚本） |

---

## 3. 18 个知识节点清单（含审校状态与来源核验）

> 「来源核验」列为 2026-10-22 实际抓取成功的链接数 / 该概念登记的来源数。
> 登记表中的每一条外部来源都记录了 `org`、`versionOrDate`、`checkedAt` 与「支持哪一句断言」。

### 第 01 章 · 智能诞生（INTELLIGENCE）

| # | ID | 中文 | 状态 | 主要来源（均已核验） | 核验 |
|---|---|---|---|---|---|
| 01 | `ai` | 人工智能 | reviewed | 网信办《生成式人工智能服务管理暂行办法》(2023-07-13)；PRD | 外部 1/2 |
| 02 | `ml` | 机器学习 | reviewed | arXiv:2001.08361 Scaling Laws (v1, 2020-01-23)；PRD | 外部 1/2 |
| 03 | `llm` | 大语言模型 | reviewed | DeepSeek Chat Completions API（system/user/tool 角色与参数校验条款）；M0.3 任务书；PRD | 外部 1/3 |
| 04 | `transformer` | 注意力架构 | reviewed | arXiv:1706.03762 Attention Is All You Need (v7, 2023-08-02)；PRD | 外部 1/2 |
| 05 | `token` | 文本最小单位 | **published**（Lab 01） | DeepSeek《Token 用量计算》；DeepSeek Chat Completions API | 外部 2/2 |
| 06 | `inference` | 推理（前向计算） | reviewed | DeepSeek Chat Completions API（max_tokens / finish_reason）；arXiv:2001.08361 | 外部 2/2 |

### 第 02 章 · 指令与上下文（CONTEXT）

| # | ID | 中文 | 状态 | 主要来源（均已核验） | 核验 |
|---|---|---|---|---|---|
| 07 | `prompt` | 提示（这一轮的输入） | **published**（Lab 02） | DeepSeek Chat Completions API；Anthropic《Effective context engineering》 | 外部 2/2 |
| 08 | `instructions` | 指令 | **published**（Lab 02） | Anthropic 上下文工程文章；DeepSeek Chat Completions API | 外部 2/2 |
| 09 | `system_prompt` | 系统指令 | reviewed | DeepSeek Chat Completions API（role=system）；PRD | 外部 1/2 |
| 10 | `context_window` | 上下文窗口 | **published**（Lab 01） | DeepSeek Chat Completions API（输入+输出受上下文长度限制、finish_reason=length）；DeepSeek 模型与价格页（上下文长度 1M） | 外部 2/2 |
| 11 | `context_engineering` | 上下文工程 | **published**（Lab 02） | Anthropic《Effective context engineering》；DeepSeek《Token 用量计算》 | 外部 2/2 |
| 12 | `hallucination` | 幻觉 | reviewed | arXiv:2311.05232 幻觉综述 (v2, 2024-11-19)；网信办规章 | 外部 2/2 |

### 第 03 章 · 外部能力（CONNECTION）

| # | ID | 中文 | 状态 | 主要来源（均已核验） | 核验 |
|---|---|---|---|---|---|
| 13 | `api` | 应用程序接口 | reviewed | RFC 9110 HTTP Semantics (2022-06, STD 97)；智谱《HTTP API 调用》；PRD | 外部 2/3 |
| 14 | `tools` | 工具 | reviewed | DeepSeek《Tool Calls》（模型不执行函数）；Chat Completions API；M0.3 任务书；PRD | 外部 2/4 |
| 15 | `tool_calling` | 工具调用 | **published**（Lab 03） | DeepSeek《Tool Calls》；Chat Completions API；M0.3 任务书；PRD | 外部 2/4 |
| 16 | `function_calling` | 函数调用 | reviewed | DeepSeek Chat Completions API（tools/function schema、参数须校验）；《Tool Calls》 | 外部 2/2 |
| 17 | `mcp` | 模型上下文协议 | **published**（Lab 03 的 MCP 路径） | MCP 官方架构文档（Version 2026-07-28，Host/Client/Server）；MCP 规范 2025-06-18（Tools/Resources/Prompts）；Anthropic MCP 公告 | 外部 3/3 |
| 18 | `mcp_server` | 协议服务端 | reviewed | MCP 规范 2025-06-18；MCP 架构文档 | 外部 2/2 |

**审校方式**：每条外部断言都指向 `sources.js` 中 `claim` 字段描述的**具体条款**；凡是
论文结论被用于教学引申的地方（如 scaling laws → 「参数里是统计规律」）在 INSPECT 里显式
标注「属于教学上的引申」。全部 18 个概念 `reviewedAt = 2026-10-22`。

### 3.1 来源核验记录（含**失败**项，一律未登记）

| 链接 | 结果 | 处理 |
|---|---|---|
| `docs.anthropic.com/docs/build-with-claude/*`（token counting / context windows / system prompts / tool use） | 跨域重定向到 `platform.claude.com`，被 Cloudflare 拦截（403） | **未登记**；改用 DeepSeek 中文官方文档等可直连来源 |
| `platform.openai.com/docs/guides/function-calling` | Cloudflare 403 | **未登记**；改用 DeepSeek《Tool Calls》 |
| `cookbook.openai.com/.../how_to_count_tokens_with_tiktoken` | 重定向后 403 | **未登记**（分词事实改由 DeepSeek《Token 用量计算》支撑） |
| `nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf` | HTTP 406（落错误页） | **未登记**；改用网信办规章作为「内容真实性」合规来源 |
| `developer.mozilla.org/zh-CN/docs/Web/HTTP/Overview` | 连接失败（无法取证） | **未登记**；改用 RFC 9110（IETF 原文） |
| `arxiv.org/abs/1706.03762`、`2311.05232`、`2001.08361` | 200 | 已登记 |
| `api-docs.deepseek.com`（token_usage / chat-completion / tool_calls / pricing） | 200 | 已登记 |
| `modelcontextprotocol.io`（architecture / specification 2025-06-18） | 200 | 已登记 |
| `anthropic.com`（context engineering / MCP 公告） | 200 | 已登记 |
| `cac.gov.cn`（生成式人工智能服务管理暂行办法） | 200 | 已登记 |
| `rfc-editor.org/rfc/rfc9110.html`、`docs.bigmodel.cn`（HTTP API 调用） | 200 | 已登记 |

---

## 4. 三个实验使用说明

### Lab 01 · TOKEN / CONTEXT BUDGET（第 01 章，概念 `token` / `context_window`）

- **入口**：Lab 页「RUN · 打开实验」／`token` 知识页 EXPERIMENT／第 01 章叙事实验入口。
- **可操作参数**：原文样例（中文公告 / 英文说明 / 中英混合 / 日期数字 / 工具 JSON）、分词编码（cl100k_base / o200k_base）、上下文窗口上限（256 / 384 / 512 / 1024 / 2048）、保留给输出（64 / 128 / 256）、资料片段多选（6 条，来自虚构语料 NTC-1001…1003）。
- **关键结果**：token 片段（带序号与边界，含「续字节」标记）、字符数 / UTF-8 字节 / token 数 / 字符每 token、双编码实测对比、四类预算占用条与明细表、被舍弃资料与原因、结果解读。
- **异常路径**：窗口 256 时「系统指令 + 用户任务 + 输出预留」已超限 → 明确缺口数值与三种可选做法，资料全部未进入上下文；窗口 384 时第 2 条资料按「整条放入或整条舍弃」规则被舍弃。
- **模拟标记**：标题栏 `LOCAL · 离线预计算`；页内注明窗口数值为教学示意，不是任何真实模型的容量承诺；运行期不含分词器本体。
- **真实计数证明**：`npm run tokens:verify` 用真实分词器逐条复算 24 组 token 序列。

### Lab 02 · INSTRUCTIONS / CONTEXT（第 02 章，概念 `prompt` / `instructions` / `context_engineering`）

- **入口**：Lab 页／`context_engineering` 知识页 EXPERIMENT／第 02 章叙事实验入口。
- **可操作参数**：研究目标（宽泛 / 明确）、输出方式（自由陈述 / 结构化提纲）、证据要求（无要求 / 标注来源及不确定性）、背景资料（不添加 / 3 张虚构卡片）、上下文预算（充足 1024 / 受限 200，按真实 token 数计算）。
- **关键结果**：本轮上下文快照（指令 + 卡片是否进入）、模拟研究报告（按子问题分节）、引用列表、事实状态表（有来源 / 未验证 + 原因）、与上一组配置的差异对照（维度 + 指标）、逐维原因说明、被舍弃卡片。
- **异常路径**：勾选「要求标注来源」但不添加背景 → 引用数 0，报告写「未验证 · 某一行」，且**不出现任何具体日期/地点**；预算受限 → 第 3 张卡片整张舍弃、其支撑的 2 条事实回到未验证。
- **模拟标记**：`SIMULATED · 确定性规则`；报告页脚声明「不是模型推理，不代表任何真实研究结论」。

### Lab 03 · TOOL CALLING & MCP（第 03 章，概念 `tool_calling` / `mcp`）

- **入口**：Lab 页／`tool_calling` 知识页（四步路径的 EXPERIMENT 步骤）／`mcp` 知识页／第 03 章叙事实验入口。
- **可操作参数**：运行条件（两种工具就绪 / Search 未装配 / Reader 未装配 / Reader 未授权 / **检索超时**）、搜索范围、结果数量上限、读取方式（摘要 / 全文）、是否包含元数据、**调用路径（直连示意 / MCP 适配示意）**。
- **关键结果**：事件轨迹（单步 / 播放 / 复位）、事件详情（输入/输出载荷、分支依据）、本次取得的样本资料；MCP 路径另显能力发现（Host→Client→Server）、三类能力卡片（Tools 2 / Resources 1 / Prompts 1）、角色时间轴（可点回对应事件）、**6 项一致性对照表**。
- **异常路径**：Search 未装配 → 校验阶段阻断、无成功响应；Reader 未授权 → 检索成功但读取被拒；检索超时 → `tool.error` 事件、结局非成功、无任何读取内容；三种失败在两条路径上完全一致。
- **模拟标记**：`SIMULATED · 本地教学模拟`；页内声明 MCP 为可视化教学仿真，不发起网络请求、不实现 JSON-RPC 握手、不接入真实服务端。

---

## 5. 测试与构建证据（实际执行）

执行环境：Windows · Node.js v24.17.0 · npm 10.x · Chrome（headless=new + SwiftShader）· 1440×900 与 390×844。

```
$ npm test
ℹ tests 239
ℹ pass 239
ℹ fail 0
ℹ duration_ms 1537.2182
```

```
$ node tools/check.mjs
=== 1. 语法检查（node --check · ESM） ===
文件数 87 · 通过 87 · 失败 0
=== 2. 知识层数据契约（validateKnowledge） ===
章节 6 · 概念 36 · 关系 48 · 问题 0
状态分布 outline=13 reviewed=16 published=7 draft=0
来源 20 条（外部 14 · 已核验 19）· 实验 3/6 可操作
=== 3. 静态产物路径（dist/index.html） ===
相对引用=true · 绝对/CDN 引用=false
结论：通过
```

```
$ npm run tokens:verify
[verify] 片段 12 · 编码 2 · gpt-tokenizer@4.1.0（表内 @4.1.0）
[verify] 复算比对 24 组 token 序列
[verify] 通过：所有 token 序列与真实分词器逐条一致
```

```
$ npm run build
[build] mode                release (minified)
[build] dist/assets/app.css  151.8 KB
[build] dist/assets/app.js   1299.4 KB
[build] dist/index.html      0.9 KB
[build] index.html (offline) 1452.1 KB
[build] done in 563ms — 零外部 CDN 依赖
```

```
$ npm run accept:m12        # node tools/build.mjs && node tools/m12-acceptance.mjs
=== M1.2 验收（A01–A29） ===
PASS A01 … PASS A29
=== A30 回归（M0.3 / M0.4 / M1.1） ===
PASS A30-M03 M0.3 工具调用与执行台回归 · 通过 33/33
PASS A30-M04 M0.4 研究闭环与来源追溯回归 · 通过 44/44
PASS A30-M11 M1.1 知识架构与学习基础回归 · 通过 27/27
合计：32/32 通过 · 报告 verify/m12-report.json · 截图 verify/m12-shots/
```

**完整流水线（`npm run shots`，同一进程内跑完 M0.1→M1.2）**：

```
T01–T13（M0.1）        13/13
A01–A23（M0.2 装配）   25/25
A01–A30（M0.3）        33/33
A31–A70（M0.4）        44/44
M1.1 A01–A24           27/27
M1.2 A01–A29           29/29
控制台未捕获异常        0 条
截图                   verify/shots/ 53 张（F01–F45 + 五视口）
```

**未运行项**：无。所有「通过」都有上面的真实输出或 `verify/m12-report.json` / `verify/report.json` 中的逐项证据。

**本轮更新的既有断言**（M1.2 状态变化导致，非绕过）：

| 位置 | 旧断言 | 新断言 | 原因 |
|---|---|---|---|
| `tests/knowledge.test.mjs` A07 | published=1 / outline=26 / reviewed=9 | 7 / 13 / 16 | 18 个概念补正文 |
| 同上 A08 | 有正文概念 10 个 | 23 个 | 同上 |
| 同上 A10 | available=1 | available=3（含 2 个新 Lab） | Lab 01/02 开放 |
| 同上 A10（第二处） | `prompt` 为 planned | 改用 `retrieval`（第 04 章）验证 planned 分支 | prompt 已发布 |
| 同上 A13 | 关系 47 条 | 48 条 | 新增 tool_calling↔mcp |
| 同上 A06 | 用 `token` 验证 outline 过滤 | 用 `chunking` | token 已有正文 |
| 同上 A09 | `api.example === null` | 改查 outline 概念 + 所有示例必须标注模拟 | api 已有示例 |
| `tests/atlas.test.mjs` A18 | `prompt` 不可记实验完成 | 改用 `chunking`，并新增 token / context_engineering 可记录 | 实验登记变化 |
| `tools/m03-acceptance.mjs` A02 | 画布 12 边 | 13 边 | 新增关系边 |
| `tools/m04-acceptance.mjs` A69 | 画布 12 边 | 13 边 | 同上 |
| `tools/m11-acceptance.mjs` A05/A10/A11/A14 | 旧状态分布 / 旧 Lab DOM / 禁止外部链接 | 新状态分布 / 新 Lab 卡片 / **外部链接必须已核验且带核验日期** | M1.2 契约变化（A14 反而更严） |

---

## 6. A01–A30 逐项验收

> 证据来自 `npm run accept:m12`（`verify/m12-report.json` 逐项保存 note）与上表的命令行输出。
> 浏览器验收全部通过真实 DOM 与真实 store 驱动，走与界面按钮相同的入口。

| ID | 验收项 | 结果 | 证据 |
|---|---|---|---|
| A01 | 仓库审计 | **PASS** | `docs/AUDIT_M1.2.md`；浏览器 `validateKnowledge()===[]`、6 章 / 36 概念 / 3 可用实验 |
| A02 | 章节目录 | **PASS** | 6 章齐全；三章有叙事；第 04–06 章 13 outline + 5 reviewed、0 新增 published |
| A03 | 概念覆盖 | **PASS** | 前三章 18 个概念全部 `hasBody`、UNDERSTAND≥2、INSPECT≥3、误解≥1、示例齐、来源≥2 |
| A04 | 中文入门内容 | **PASS** | 18/18 有研究情境示例且全部标注 `isSimulated` |
| A05 | 技术深入内容 | **PASS** | INSPECT 条数 4–6，最短 221 字符 |
| A06 | 常见误解 | **PASS** | 19 条，每概念 ≥1，claim/correction 均非空 |
| A07 | 参考来源 | **PASS** | 14 条外部来源全部 reviewed + checkedAt + https；18/18 概念至少 1 条外部来源 + `reviewedAt` |
| A08 | 概念 ID | **PASS** | M0.3/M1.1 的 10 个 ID 全在；别名冲突 0 |
| A09 | 关系图谱 | **PASS** | 48 条边，关系类校验问题 0；每概念 ≥1 条 related 且均为真实邻居 |
| A10 | Story 01 | **PASS** | 局限原文「能生成回答，并不等于已经检索、阅读和核验了资料。」；含 limit 节拍；实验入口可点 |
| A11 | Story 02 | **PASS** | 局限「指令更清晰，但没有接入真实资料…」；实验 `exp-context-lab`；结果解读 3 条 |
| A12 | Story 03 | **PASS** | 提到 Search / Reader / Host / Client / Server；局限「工具可以带来可检查的资料，但返回数据不自动保证正确。」 |
| A13 | 叙事衔接 | **PASS** | 过渡链 01→02→03→M1.3；第 01 章「下一章」按钮、第 03 章「后续阶段」说明、Atlas 出口齐全 |
| A14 | Token 样例 | **PASS** | 69 字符 → cl100k 61 / o200k 43 token；`tokens:verify` 24 组逐条一致 |
| A15 | Token 预算 | **PASS** | 384 → 1 条整条舍弃（含原因）；1024 → 0 条；256 → 超限缺口 5 token；清空资料 → 资料占用 0 |
| A16 | Token 准确性 | **PASS** | 字符/token = 1.13（非固定系数）；61 ≠ 按 0.75 折算的 52；复算脚本 + 源码反向守护 |
| A17 | Context 控件 | **PASS** | 5 维可操作；默认 0 条有来源 → 完整配置 7 条；受限预算 2/3 卡片 |
| A18 | Context 因果 | **PASS** | 报告 2→4 节；有来源 5<7；舍弃 1 张并说明；同配置两次结果完全一致；diff 指出 budget 维度 |
| A19 | 无来源处理 | **PASS** | 引用 0、有来源 0、报告含「未验证」、全文无「10 月 20 日」「B201」 |
| A20 | 工具调用复用 | **PASS** | 9 条既有事件（tool.call / tool.result 均在），MCP 模式下事件 ID 完全一致 |
| A21 | Search/Reader 约束 | **PASS** | Search 未装配 / Reader 未授权 → 成功读取 0 条且有阻断事件 |
| A22 | 失败场景 | **PASS** | 检索超时：结局 `error`（正常 `sample_acquired`），2 条异常事件，无伪造读取 |
| A23 | MCP 准确性 | **PASS** | 角色 host/client/server；能力类型 prompts/resources/tools；界面声明不发起网络请求 |
| A24 | 协议中立 | **PASS** | 6/6 对照项一致；结局相同；载荷键完全相同 |
| A25 | 跨视图导航 | **PASS** | 知识页实验入口 → `lab-token`；Story 3 个叙事按钮 → 章节页 → 实验；来源卡片可读 |
| A26 | 进度准确 | **PASS** | 初始未完成 → 改参数后完成；仅浏览 transformer 记 explored 但不记实验；刷新后仍为完成 |
| A27 | 旧数据保护 | **PASS** | `learning:v1` 原样保留；v2 schema=2；装配模块数不变；research 键未被清空（本轮未写入） |
| A28 | 可访问性 | **PASS** | 17 个可聚焦控件均有可访问名称；390px 单列、溢出 0；`lang=zh-CN`；在 `prefers-reduced-motion: reduce` 下 Lab 01 仍渲染 61 个 token 片段、21 个控件，过渡时长≈0 |
| A29 | 纯前端构建 | **PASS** | 运行时远程请求 0；dist 相对路径；dist/index.html 无 https 资源；单文件离线版可用 |
| A30 | 回归测试 | **PASS** | M0.3 33/33、M0.4 44/44、M1.1 27/27（同一次运行中真实执行） |

**合计：30/30 PASS（浏览器验收 32/32 项通过）**

---

## 7. M0–M1.1 回归结果与遗留问题

### 7.1 回归结果

| 阶段 | 结果 | 说明 |
|---|---|---|
| M0.1 视觉与开场 | 通过 | 开场、Hub、AZ-CORE 01 装配体验未改；截图 F01–F07 仍在 `verify/shots/` |
| M0.2 模块装配 | 通过 | 装配、拖拽、权限、二维降级、持久化未改 |
| M0.3 星图与执行台 | **33/33** | 画布边数因新增 1 条真实关系变为 13（断言同步更新，非放宽） |
| M0.4 研究闭环与来源追溯 | **44/44** | 报告、引用、冲突链未改 |
| M1.1 知识架构与学习基础 | **27/27** | 状态分布、Lab DOM、来源展示随 M1.2 契约更新（A14 反而更严：外部链接必须已核验） |
| 单元测试 | **239/239** | 含新增 58 项（token 21 / context 18 / mcp 10 / story 9） |

### 7.2 遗留问题与风险

| 优先级 | 问题 | 影响 | 是否阻断 M1.3 |
|---|---|---|---|
| 低 | 星图画布仍只有 10 个节点，第 01–03 章新增的 13 个概念不出现在画布上（可搜索、可在关系列表与知识页访问） | 空间导航覆盖不全 | 不阻断（全站 Atlas 属 M1.4；`layout.js` 明确要求不改坐标） |
| 低 | Lab 01 只对预置片段给出真实 token 数，不支持任意文本输入 | 教学自由度略低 | 不阻断（A16 要求「不得用固定系数假称真实 token」，取舍已写明） |
| 低 | 移动端 Lab 参数区在结果之上，需要滚动才能看到 token 流 | 移动端首屏信息密度偏高 | 不阻断（单列、无横向溢出、可键盘操作） |
| 中 | `gpt-tokenizer` 是 devDependency；若在无网络的机器上重建 `tokenTable.js` 会失败 | 仅影响重新生成分词表，不影响构建与运行 | 不阻断（表已提交，`tokens:verify` 需要依赖） |
| 低 | 第 04–06 章仍是索引态（13 个） | 六章体验不完整 | 不阻断（M1.3 范围） |
| 信息 | 4 个 Anthropic 文档页与 2 个 OpenAI 文档页、NIST PDF、MDN 在本环境无法取证 | 相关断言改用可直连来源支撑 | 不阻断 |

**结论：可以进入 M1.3。** 三个章节内容完整且经过审校、三个实验都有可观察且可解释的交互、
跨视图导航与进度一致、M0 核心功能无退化、静态构建与「无后端」检查通过。



