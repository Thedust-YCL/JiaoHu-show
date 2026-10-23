# M1.2 审计报告 · 现有基础与复用清单

> 阶段：M1 · KNOWLEDGE UNIVERSE / M1.2「AI 基础与工具交互」
> 性质：**先审计、后增量开发**。本文件记录开工前的仓库实际状态、可复用模块、
> 数据/存储键清单与影响范围，作为 `M1.2_TASK.md` §10.1 与验收项 A01 的证据。
> 审计时间：2026-10-22（与本轮所有来源核验同日）

---

## 1. 审计结论（一句话）

M1.1 声明的六项能力**全部在仓库中真实存在**（六章注册表、36 概念索引、分层内容
schema、语义关系、统一内容访问、学习进度 v2 迁移），因此 M1.2 **不需要补做 M1.1**，
可以直接在既有结构上做增量：补 18 个概念正文、补三章叙事、新建两个 Lab、扩展
第三个 Lab。没有另建平行学习系统。

同时发现 3 处**必须先修的阻断问题**（见 §5），已在本轮一并处理。

---

## 2. 既有知识层（M1.1 实际代码）

| 模块 | 文件 | 实际状态 | M1.2 处理 |
|---|---|---|---|
| 章节注册表 | `src/knowledge/chapters.js` | 6 章，id/no/order/双语标题/question/intro/hook/labId 齐全；`narrativeStatus` 统一 `outline` | 不改结构；仅新增 `src/content/chapters/` 叙事数据层 |
| 概念注册表 | `src/knowledge/concepts/index.js` | 36 概念，`CONCEPT_ORDER` 唯一顺序，`idx` 派生 | 不改结构；只改 ch01–ch03 三个数据文件的内容 |
| 分层 schema | `src/knowledge/concepts/helpers.js` | `defineConcept` 统一默认值 + 冻结；四种内容状态 outline/draft/reviewed/published | 新增 `reviewedAt` 字段；其余不改 |
| 第 01 章 | `concepts/ch01-intelligence.js` | llm=reviewed，其余 5 个=outline（plannedMilestone M1.2） | **重写**：18 → 6 个概念的正文全部补齐 |
| 第 02 章 | `concepts/ch02-context.js` | 6 个全部 outline | **重写**：全部补齐 |
| 第 03 章 | `concepts/ch03-connection.js` | tool_calling=published，api/tools/mcp=reviewed，function_calling/mcp_server=outline | **重写**：保留已审校文本，补 2 个概念、加外部来源 |
| 第 04–06 章 | `concepts/ch04..06` | 13 outline + 5 reviewed（skills/agent/workflow/harness） | **不改**（属于 M1.3），仅回归测试确认未被动到 |
| 语义关系 | `src/knowledge/relations.js` | 47 条（M0.3 10 + M1.1 37），四种类型、有向性校验 | 新增 1 条 `tool_calling ↔ mcp`（M1.2），共 48 |
| 图布局 | `src/knowledge/layout.js` | 10 节点固定坐标，`GRAPH_ORDER` 恒定 | **不改**：Canvas 仍只画 10 个已开放节点（见 §6 决策） |
| 来源表 | `src/knowledge/sources.js` | 5 条，**全部为仓库内文档**，无外部链接 | **扩展**：新增 14 条已核验外部来源，并强化校验 |
| 实验登记表 | `src/knowledge/experiments.js` | 6 个登记，1 个 available（exp-tool-calling-demo） | 改为 3 个 available，并新增 `openMode/labKind/entryConceptId` |
| 统一访问接口 | `src/knowledge/index.js` | getConcept / searchConcepts / relatedOf / conceptAvailability / graphModel / validateKnowledge 等 | 扩展导出与校验项（见 §4） |

## 3. 既有交互层

| 模块 | 文件 | 实际状态 | M1.2 处理 |
|---|---|---|---|
| Story 目录 | `features/knowledge/components/storyWorkspace.js` | 六章目录 + 概念清单 + 实验登记行 | 增加「进入本章叙事」入口与状态文案 |
| 知识页模板 | `features/knowledge/components/knowledgePage.js` | UNDERSTAND/INSPECT 双层、误解、示例、关系、来源、实验入口 | 增强来源卡片（组织/版本/核验时间/支持何种断言） |
| Tool Calling 知识页 | `features/atlas/knowledge/toolCalling.js` | 四步路径 + 内嵌实验（5 个真实工具条件中的 4 个） | **扩展**：新增「检索超时」失败预设 + 直连/MCP 路径对照 |
| Lab 登记页 | `features/knowledge/components/labWorkspace.js` | 只登记、不运行；1 个可操作 | 改为 3 个可操作卡片 + 实验路由（不重建引擎） |
| Atlas 星图 | `features/atlas/*` | 10 节点 / 12 边画布 + 章节分组目录 | 不改画布；新增 1 条边后为 13 边 |
| 学习进度 | `features/atlas/state/learning.js` | schema v2，独立命名空间，`markExperimentCompleted` 有可用性守卫 | **不改存储结构**；Lab 通过同一守卫写入 |
| 执行台 / 报告 / 研究包 | `features/execution/*`、`features/reports/*`、`research-packs/*` | M0.3/M0.4 已交付 | **不改**，仅回归 |

## 4. 存储键与数据边界（必须非破坏）

| 键 | 用途 | M1.2 是否写入 |
|---|---|---|
| `agent-zero:constructor:v1` | 装配配置 | 不写入（实验使用独立演示快照） |
| `agent-zero:execution:v1` | 执行记录 / 最近一次运行 | 不写入 |
| `agent-zero:research:v2` | 研究报告 | 不写入 |
| `agent-zero:learning:v2` | 学习进度（本轮唯一写入的学习状态） | 只在真实操作后写入 |
| `agent-zero:learning:v1` | 旧版学习进度（只读迁移） | 只读，永不删除 |
| `az0.prefs.v1` / `az0.intro.seen.v1` | 界面偏好与开场标记 | 不改语义 |

## 5. 审计发现的阻断问题（本轮已修）

1. **`.gitignore` 第 25 行是不可解析的 glob**（`{console.log*`），导致 `ripgrep` 等
   工具在该仓库直接报错退出，影响所有内容检索与 CI 检索类检查。
   → 已转义为 `\{console.log*`，并补充 `console.log*`。
2. **仓库根目录残留 3 个 0 字节的重定向垃圾文件**（`{console.log('loaded-err-expected')})`、
   `console.log('ok'))`，以及一次误建文件）。它们会污染构建与检索。
   → 已确认内容为空后删除，并在 `.gitignore` 里防止再次生成。
3. **来源表只有仓库内文档**，无法满足 M1.2「真实可核验参考来源」要求。
   → 已按 §7 逐条抓取核验后新增 14 条外部来源（含 6 条中文官方文档/法规）。

## 6. 关键设计决策（审计得出，不是随手选的）

1. **星图画布保持 10 节点不变**：`layout.js` 明确要求「概念拿到坐标后不再改，避免
   学习者空间记忆失效」。M1.2 新增正文的概念（token / prompt / mcp_server …）出现在
   目录、搜索、关系列表与知识页里，但不重排画布；全站 Atlas 终极可视化属于 M1.4。
2. **分词器在构建期运行，运行期只带结果表**：实测把 `cl100k_base` 词表打进 bundle
   会让首屏多出 1021.5 KB（min）。因此用 `gpt-tokenizer` 在构建期切分、逐条回译校验，
   运行期只读取 `tokenTable.js`（≈50 KB），并提供 `tools/tokens-verify.mjs` 复算。
3. **Lab 03 不新建引擎**：MCP 路径只把 Host/Client/Server 角色叠加在**同一份**
   `runSimulation` 事件上（`buildProtocolTrace`），并强制 `comparePaths().same === true`
   作为验收门槛，从结构上保证「协议不改变事实」。
4. **实验完成状态沿用 M1.1 守卫**：`markExperimentCompleted` 仍会检查概念是否真的
   登记了可用实验；Lab 只是多了一个调用方，没有绕开这条规则。

## 7. 影响范围（改动面）

- 内容数据：`src/knowledge/concepts/ch01–ch03`、`src/knowledge/sources.js`、`relations.js`（+1 边）
- 新增内容层：`src/content/chapters/*`（三章叙事）
- 新增实验逻辑：`src/features/laboratory/token/*`、`laboratory/context/*`、`laboratory/tool-calling/mcpPath.js`
- 扩展交互：`toolCalling.js`、`labWorkspace.js`、`storyWorkspace.js`、`knowledgePage.js`、`app.js`（路由）
- 新增样式：`src/styles/labs.css`
- 构建工具：`tools/tokens-build.mjs`、`tools/tokens-verify.mjs`、`tools/m12-acceptance.mjs`
- 测试：新增 `tests/token-lab`、`context-lab`、`lab-tool-calling-mcp`、`story`；更新
  `tests/knowledge.test.mjs`、`tests/atlas.test.mjs`（M1.2 状态变化导致的断言更新，逐条见交付报告）
- **未触碰**：三维场景、装配台、执行台、报告、研究包、`agent-zero:*` 存储结构
