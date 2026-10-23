# AGENT / ZERO — M1.2 AI 基础与工具交互

> 一句话定位：**一座运行在浏览器里的交互式 AI 实验室**。用户从一颗只能处理语言的模型核心出发，
> 逐步看懂指令、上下文、工具、MCP、检索、Skills、记忆、Harness 等概念如何拼成一个能完成多步任务的系统。
>
> 品牌主张：**FROM LANGUAGE TO ACTION. / 从语言，到行动。**
>
> 本仓库当前交付的是 **M1.2 / AI 基础与工具交互**：在 M1.1 已经建立的六章注册表与 36 概念索引之上，
> 完成 **Chapter 01–03 的 18 个概念正文（全部 reviewed / published）**、**三章连续叙事**（模型「会说话」→ 指令与上下文 → 外部工具），
> 以及 **三个真正可操作的实验**：Lab 01 Token / Context Budget（真实分词 + 预算取舍）、
> Lab 02 Instructions / Context（确定性上下文模拟）、Lab 03 Tool Calling & MCP（复用 M0.3 引擎 + 协议路径对照）。
> **M1.2 通过验收 ≠ 六章正文已完成、≠ 全站星图与整章滚动叙事已完成（那属于 M1.3 / M1.4）。**

---

## 1. 立刻体验（两种方式）

| 方式 | 操作 | 说明 |
|---|---|---|
| **直接打开** | 双击根目录 `index.html` | 单文件离线版，CSS/JS/Three.js 全部内联，无需服务器、无需联网 |
| **本地开发服务** | `npm install` → `npm run dev` → 打开 http://127.0.0.1:5187/ | 静态文件服务，仅用于本地开发 |

> 首次访问播放约 11 秒的开场序列（可随时按 **跳过开场** 或 `ESC`）。看过一次后，再次访问直接进入控制台；
> 顶栏 **重播开场** 可完整重看。想每次都看开场，可访问 `index.html?intro=always`。

**六条推荐路径（都能走通）：**

1. **先看叙事（M1.2 主线）**：`引导叙事 / STORY` → 六章目录 → 第 01 章卡片「进入第 01 章叙事」→
   读完开场、可观察局限与结果解读后，点 `RUN` 进 **Lab 01**；第 02 章 → **Lab 02**、第 03 章 → **Lab 03** 同理。
   第 04–06 章仍标注「后续阶段（M1.3）」。
2. **从知识到系统**：`知识星图` → 搜索 `Tool Calling`（画布自动定位）→ `LEARN` 进入完整知识页 →
   `VIEW IN CONSTRUCTOR` → 装配 Search / Reader → `RUN SIMULATION`。
3. **装配到运行**：`装配台` → 装配两种工具 → 授予只读模拟权限 → `RUN SIMULATION` →
   执行台里播放/暂停/单步/Seek/调速，查看每个事件的输入输出、**参与判断的可见声明**与**核验必要条件**。
4. **完整研究闭环（M0.4 主线）**：装配台把 Reader 设为 `全文` 且开启 `元数据` →
   执行台选择策略 `VERIFY_REVISIONS` → `RUN SIMULATION` → 证据阶段出现「发现冲突」→「更正关系核验成立」→
   「报告已装配」→ 切到 `REPORT · 研究报告` 读结论、点 `[S1]` 看来源、`VIEW IN EXECUTION` 回到事件。
5. **对照看差异**：把策略改成 `COLLECT_ONLY`，或把读取方式改成 `摘要`，或关闭 `元数据`，再点 `RUN SIMULATION`：
   **报告、证据状态与轨迹都会按配置变化**；本地保留最近两次运行，可随时切回上一次对照。
6. **看实验边界**：`实验空间 / LAB` → 3 个真实可操作实验（Lab 01 / 02 / 03）+ 3 个后续阶段登记；
   只有真实可用的实验才渲染运行按钮，其余明确标注「后续阶段开放」，没有点了没反应的假按钮。
7. **降级与无障碍**：任何页面都可只用键盘完成操作；无 WebGL 时自动使用二维执行核心与结构投影，
   报告阅读、引用反查与 Markdown 导出仍然可用。

## 2. 构建与部署

```bash
npm install          # 安装依赖（three、esbuild）
npm run dev          # 本地开发预览（静态服务）
npm run build        # 产出 dist/ 与离线单文件 index.html
npm test             # 239 项纯逻辑测试（装配 / 图谱 / 知识层 / 引擎 / 证据 / 报告 / 回放 / 持久化 / 分词 / 上下文模拟 / 协议路径 / 叙事）
npm run tokens:verify # 用真实分词器复算 Lab 01 的 token 表（24 组序列逐条比对）
npm run accept:m12   # 构建 + 浏览器验收 A01–A30（含 M0.3/M0.4/M1.1 回归）
npm run preview      # 预览 dist/ 产物
npm run shots        # 无头 Chrome 真实渲染自检：T01–T13 + M0.2 + M0.3 + M0.4 + M1.1 A01–A24 + M1.2 A01–A30 + 截图 F01–F45
```

- `npm run build` 产出：
  - `dist/index.html` + `dist/assets/app.js` + `dist/assets/app.css`（标准静态包，引用相对路径）
  - 根目录 `index.html`（**离线单文件版**，便于无服务器演示）
- **GitHub Pages**：把 `dist/` 内容推到 Pages 分支即可。产物使用相对路径，放在仓库子路径下也能正常加载；
  项目未使用前端路由，刷新不会 404。
- **零外部依赖**：three.js 与全部样式在构建时打包进产物，运行期不请求任何 CDN、字体或业务接口。

## 3. 这一轮实现了什么（M1.2 新增 · M1.1 基础保留）

### 3.0 M1.2 交付（当前阶段）

| 交付 | 实际内容 | 从这里进入 |
|---|---|---|
| **Chapter 01–03 共 18 个概念** | 每概念：一句话解释 / UNDERSTAND（2–3 段）/ INSPECT（4–6 条）/ 常见误解 / 本章研究情境示例 / 语义关系 / 经核验来源 / 审校日期。来源共 14 条**已实际抓取核验**的外部资料（优先中文官方文档与政府法规原文），失败链接一律未登记 | `STORY` → 任一概念，或直接点概念名 |
| **三章连续叙事** | 01 会说话但没证据 → 02 把问题问清楚 → 03 把资料真的拿进来；每章含开场目标、4 个节拍（含可观察局限）、实验步骤与观察要点、结果解读、章节过渡、上下章导航、随时退出 Atlas | `STORY` → 章卡片「进入第 01 章叙事」 |
| **Lab 01 · Token / Context Budget** | 真实分词（cl100k_base / o200k_base，构建期离线切分并逐条回译校验）；token 片段与序号；系统指令 / 用户任务 / 资料 / 输出预留四类预算；整条舍弃与超限解释 | `LAB` → Lab 01，或 `Token` 知识页 EXPERIMENT |
| **Lab 02 · Instructions / Context** | 5 个维度可调（目标 / 输出方式 / 证据要求 / 背景 / 预算）；确定性规则生成报告；有来源与「未验证」分明；没有资料时**不生成任何引用** | `LAB` → Lab 02，或 `上下文工程` 知识页 EXPERIMENT |
| **Lab 03 · Tool Calling & MCP** | 复用 M0.3 引擎与工具定义；新增「检索超时」失败预设；「直连 / MCP」路径切换显示 Host→Client→Server 与 Tools/Resources/Prompts，并用 6 项对照表证明**协议不改变事实** | `LAB` → Lab 03，或 `工具调用` 知识页 EXPERIMENT |

> 三个实验都在本地运行：不联网、不调用模型、不写入装配配置与运行记录；实验完成状态只在**真实改过参数并看到结果**之后写入本地学习进度。

### 3.1（M1.1 基础，仍然有效）六章统一注册表 + 36 概念索引


- 六个稳定 `chapterId`：`intelligence / context / connection / knowledge / runtime / reliability`，
  编号 01–06、双语标题、核心问题与简介集中在 `src/knowledge/chapters.js`，全站唯一来源。
- 36 个概念按章各 6 个，元数据包含 `id / chapterId / order / title.zh·en / aliases / contentStatus /
  oneLiner / plannedMilestone`；**M0.3 的 10 个稳定 ID 原样保留**（`llm agent tool_calling tools api mcp
  skills rag workflow harness`），旧地址与旧学习记录不受影响。
- 内容状态如实分层：`outline 26 / reviewed 9 / published 1`。只有 Tool Calling 拥有完整四步学习路径与
  可操作实验；其余 13 个概念只有索引（第 04–06 章，属于 M1.3），在目录与搜索中可见，但正文明确标注「内容建设中 · M1.2/M1.3」。

### 3.2 类型化知识节点与统一访问接口

- `src/knowledge/index.js` 提供 **唯一查询面**：`getConcept / getChapter / getConceptsByChapter /
  searchConcepts / getRelations / relatedOf / conceptAvailability / graphModel / validateKnowledge`，
  组件里不再出现手写过滤或第二份别名表。
- 概念数据支持「一句话解释 / UNDERSTAND / INSPECT / 常见误解 / 示例 / 关联 / 来源 / 对应实验」，
  缺字段的模板分支都有降级路径，不会白屏。
- 关系共 47 条（USES 7 / PART_OF 3 / RELATED 33 / CONTRASTS 4）：**M0.3 的 10 条边 id、端点、类型、
  方向与说明一字未改**（`origin: 'M0.3'`），新增边全部附解释；PART_OF 只保留三条经得起推敲的层级。
- 来源诚实：本轮所有来源都是**仓库内文档**（无 URL），外部权威资料必须核验后才登记；
  索引草稿来源 `reviewed: false`，界面显示「待核验」。

### 3.3 学习进度 v2 与非破坏性迁移

- 新命名空间 `agent-zero:learning:v2`，旧键 `agent-zero:learning:v1` **只读迁移、原样保留**（降级回旧版本仍可读）。
- 单个概念记录 `explored / relatedDiscovered / experimentCompleted / visits` 之外，新增
  `visitedAt / lastViewedAt / experimentCompletedAt / relatedDiscoveredIds / experimentIds` 与全局 `lastViewed`。
- 「完成实验」只对**真实存在且已开放**的实验生效：仅有索引的概念调用会被拒绝并给出可读提示。
- 损坏记录只丢弃该条、不清空命名空间、不影响构建器配置与运行记录。

### 3.4 最小可用界面

- `STORY` 六章目录（章节定位、开放状态、章内概念、本章实验登记）；`LAB` 实验登记表（1 个可操作 / 5 个后续阶段）。
- 统一知识详情模板：章内目录 + UNDERSTAND/INSPECT 双深度层 + 常见误解 + 示例 + 关联关系 + 来源状态 + 实验入口；
  outline 概念只呈现索引信息与计划阶段，不出现可点击的假实验按钮。
- `ATLAS` 升级为「36 个概念章节分组目录 + 10 个已开放节点的星图画布」：未审校概念不画进画布，
  但可选中、可读索引页；搜索覆盖全部 36 个概念。
- Tool Calling 的四步学习路径与内嵌实验**保持原样可用**，返回上下文、学习记录与事件联动均未改变。

---

## 4. M0.4 已交付内容（保留）

### 4.1 MISSION 001 正式小型研究包 `mission-001@2`

- **9 份虚构公告**（`isFictional: true`）：5 份沿用 M0.3 的稳定 ID 与原文（一字未改），4 份新增。
- **更正链**：`NTC-1006`（活动日期 10/18，2026-10-12 发布）→ `NTC-1007`
  （10/20，2026-10-13 发布，`supersedes: ["NTC-1006"]`，正文写明「予以更正」并指向原公告标题）。
- **未决冲突**：`NTC-1008`（10/24，就业指导中心）与 `NTC-1009`（10/26，计算机学院学工办）
  共享同一 `eventKey`，但**没有**任何 `supersedes` 关系 —— 系统必须保留「未核实」，不能靠日期先后裁决。
- **可引用片段**：每份资料 `#summary` + `#body-N`，共 30 个片段，ID 全局唯一。
- **事实声明映射**：每条声明 = 谓词 + 取值 + anchor + 允许片段类型。anchor 必须在**本次返回的文本**里
  真实出现才成立；正文级声明（「正文明确说明更正」「指向原公告」）只有在 `readMode=full_text` 时才可能被抽到。
- **数据校验** `validateMissionPack()`：重复 ID、重复片段、非法日期（含 `2026-02-31`）、悬空/自指/
  跨事项/时间倒置的 supersedes、循环更正链、anchor 失效、重复谓词全部拦下；
  `prepareCorpus()` 会把有致命缺陷的资料剔除并如实记录，坏数据既不崩溃也不会被采信。
- **3 张方案比较卡**：规则自动化 / 固定 LLM 工作流 / Agent 式流程，明确标注是**教学架构说明**，
  不是本次模拟跑过三种系统后的性能数据。

### 3.2 证据链：可见声明 → 冲突 → 更正核验

```text
Search 可见结果 → Reader 实际返回的片段/元数据 → claim（谓词+取值+片段+事件）
      → 冲突分组（eventKey + 字段 + 不同取值）→ 六条必要条件逐条核验 → E00–E05 证据分支
```

- **绝不使用上帝视角**：读不到正文就没有正文级声明；关闭元数据就没有发布主体/时间/更正关系；
  `maxResults` 只返回旧公告时，报告只能写「本次资料中发现 10 月 18 日的公告」，不能声称是最新有效日期。
- **更正成立的六条必要条件**（缺一条就降级，并写明缺什么）：

| # | 条件 | 不满足时 |
|---|---|---|
| 1 | 两份相互影响的公告都在本次可见证据集中 | 未决（可见性不足） |
| 2 | 同一事项（eventKey）+ 同一字段出现不同取值 | 不构成冲突 |
| 3 | 存在可核实的 `supersedes` 更正关系 | 未决（缺关系） |
| 4 | 正文明确说明更正，并指向被更正的公告 | 证据不足（未读正文 / 指向不符） |
| 5 | 发布主体与发布时间由工具返回，且为同一授权机构 | 缺元数据 / 无更正权 |
| 6 | 更正公告发布时间晚于被更正公告 | 未决（时间顺序不成立） |

另有第 7 条硬约束：**本次运行策略必须是 `VERIFY_REVISIONS`**；`COLLECT_ONLY` 下只收集不核验。

- **事件是唯一事实**：`evidence.claims_extracted` → `evidence.conflict_detected` →
  `evidence.revision_confirmed` / `conflict_unresolved` / `insufficient_detail` / `metadata_missing` /
  `verification_skipped` → `report.generated`，全部带稳定 `eventId / sequence / ruleId / sourceIds /
  chunkIds / claimIds / branchId`，可回放、可暂停、可 Seek。

### 3.3 两种研究策略 + 两根分支轴

- **运行选项**（不是第三个可装配工具）：`evidencePolicy = VERIFY_REVISIONS | COLLECT_ONLY`，
  与 `faultMode` 一起冻结进本次 Run 快照，并参与 `runId` 派生 —— 策略不同即不同 Run。
- **执行分支**：沿用 M0.3 的 `B01–B05`（正常 / 无 Search / 无 Reader / 检索超时 / 无结果）。
- **证据分支**：新增 `E00–E05`（未发现冲突 / 更正成立 / 冲突未决 / 按策略跳过 / 证据不足 / 缺元数据）。
  一次运行可能**同时**走过 E01 与 E02，执行图会把两条都标为「已执行 · 本次结论」。

### 3.4 结构化研究报告（R1–R6）

| 部分 | 内容 | 来源 |
|---|---|---|
| R1 研究任务与范围 | 任务、数据包版本、策略、故障模式、检索/读取参数 | 冻结的 Run 快照 |
| R2 核心发现 | 冲突、更正成立、未决、单一取值事实、背景事实 | 可见 claim + 核验状态 |
| R3 方案比较（概念性） | 三类流程的前提 / 适用条件 / 代价 | 内置方案卡 |
| R4 证据引用 | `[S1]…[Sn]` 表格：sourceId + chunkId + eventId + 当时可见文本 | 引用表 |
| R5 局限与风险 | 模拟资料、摘要/元数据边界、未决项、未覆盖范围 | 运行产物 |
| R6 研究建议与待验证 | **条件性**建议，不把 Agent 定为唯一正确方案 | 固定决策规则 |

- 报告由**本地模板装配**，`claims[].status` 由规则计算（界面无法把它「染绿」）；
  没有证据就不出现引用，未证实结论显式标注「未核实 / 证据不足」。
- 指标全部来自当前 Run：已检索 / 已读取（区分全文与摘要）/ 有引用支持的发现 / 冲突 发现-处理-未决 /
  工具调用与错误 / 回放事件数；分母为零时显示「无可评估事实」，不输出误导性的 100%。

### 3.5 引用溯源与双向导航

- 报告正文点击 `[S1]` → 右侧 **SOURCE INSPECTOR**：标题、虚构标识、`SOURCE ID` / `CHUNK ID` /
  进入本次研究的事件、可见元数据（只有在 `includeMetadata=true` 时才有发布主体与时间）、
  片段原文并高亮引用位置（`<mark>`，纯文本节点，无 HTML 注入）。
- `VIEW IN EXECUTION` → 同一 `eventId` 在**执行图当前节点 / 二维或三维核心 / Inspector** 三处同步定位。
- `← BACK TO REPORT` → 回到原段落与滚动位置，并保留筛选状态（全部 / 仅已支持 / 仅未决）。
- 引用无法解析时显示「历史记录引用不可解析」，阻断「已验证」展示，绝不静默指向另一份同名文档。

### 3.6 导出与运行历史

- **Markdown 导出**：以当前 Run 的 `ResearchReport` 为唯一来源，文件头写明
  `AGENT / ZERO · SIMULATED RESEARCH REPORT / 虚构教学研究报告`，含任务、数据包版本、配置摘要、
  研究策略、生成方式与局限；核心发现保留 `[S1]`，末尾附参考来源表与未解决问题。
  数据文本做 Markdown 转义（`[]()<>|*_` 等），不允许数据把自己变成可执行链接；`Blob + a[download]` 纯前端下载。
- **运行历史**：新命名空间 `agent-zero:research:v2` 保存**最近两次** Run（含证据与报告），
  容量不足时优先保留本次并给出可读提示；`agent-zero:execution:v1`（M0.3）**只读兼容**，
  旧轨迹显示「旧版运行：只有执行轨迹，尚无结构化报告」，绝不用新资料包补造历史结论。

### 3.7 继续保留的 M0.1 / M0.2 / M0.3 能力

AZ-CORE 01 造型与五镜头开场（可跳过、可重播）、控制台布局、三维/二维/检视同步、
能力架的点击装配与引导拖拽、7 种逻辑状态与字段级校验、10 节点知识星图与 10 条语义关系、
Tool Calling 四步知识页与内嵌实验、B01–B05 分支与回放（播放/暂停/单步/Seek/调速/复位）、
三个独立持久化命名空间与损坏兜底 —— 全部由 T01–T13、A01–A23、A01–A30 回归用例守护。

## 4. 文案与术语规则

面向中文用户：

- **界面文字、按钮、分类、说明一律中文**（如「装配台」「能力架」「执行台」「研究报告」「来源检视」）。
- **专有名词保留英文**：`AZ-CORE 01`、`Tool Calling`、`Announcement Search`、`SEARCH_PORT`、
  `Ready / Unconfigured / Disabled / Invalid`、`VERIFY_REVISIONS / COLLECT_ONLY`、`MCP`、`Skills`、`Harness`、`RAG`；
  英文状态名一律配中文解释（如 `Ready · 就绪`）。
- **诚实标注**：`SIMULATED · 本地教学模拟` 常驻；资料标 `isFictional: true`；
  不宣称「模型内部思维链」「来源已验证」「AI 正在深度思考」「准确率 99%」。
- **边界用词**：只写「在本次模拟公告链中，10 月 18 日已被更正为 10 月 20 日」，
  不写「学校官方已确认最新日期」。

## 5. 工程结构

```text
src/
  app.js                          # 应用壳：唯一渲染循环、工作区宿主、画布停靠（ResizeObserver）、键盘与偏好
  data/content.js                 # 单一权威内容源：几何参数、结构词条、导航、章节、术语与释义
  state/store.js                  # M0.1 的 UI 状态 + 真实事件日志
  research-packs/
    index.js                      # 研究包注册表（mission-001 / mission-001-mini）
    mission-001/                  # M0.4 研究包：notices / comparison / validate / index
    mission-001-mini/             # M0.3 样本包（保留，知识页内嵌实验仍在用）
  simulation/                     # 纯逻辑模拟层（不依赖 DOM / Three.js）
    events/schema.js              # 阶段、类型、状态、参与者、结局、运行策略
    events/serializer.js          # 规范化 JSON、稳定 hash、runId、v1/v2 历史解析
    tools/registry.js             # 全站共享工具定义（复用 M0.2 参数 Schema）
    tools/announcementSearch.js   # 本地模拟检索（纯函数）
    tools/documentReader.js       # 本地模拟读取（纯函数，返回片段级文本与可选元数据）
    rules/availability.js         # 配置 → 工具可用性
    rules/branches.js             # 执行分支 B01–B05 + 证据分支 E00–E05
    rules/evidence/               # 可见声明抽取 / 冲突分组 / 更正核验 / 证据评估
    reports/generateReport.js     # 结构化报告生成（R1–R6 + 引用 + 指标）
    engine/runSimulation.js       # runSimulation(config, mission, runOptions)
  knowledge/                      # M1.1 统一知识层：chapters / concepts(ch01–06) / relations / layout /
                                  # sources（14 条已核验外部来源）/ experiments / 统一访问与校验
  content/chapters/               # M1.2 三章 Story 叙事数据（01-intelligence / 02-context / 03-connection）
  features/laboratory/
    token/                        # Lab 01：fragments（原文）/ encodings / tokenTable（预计算）/ budget（预算纯逻辑）/ tokenLab（UI）
    context/                      # Lab 02：simulation（确定性规则）/ contextLab（UI）
    tool-calling/mcpPath.js       # Lab 03：直连 / MCP 路径对照（只读既有 run，不新建引擎）
  features/constructor/           # M0.2 装配领域（与渲染层解耦，可脱离 WebGL 单测）
  features/atlas/                 # M0.3 知识星图 + Tool Calling 知识页 + 学习进度
  features/knowledge/             # M1.1/M1.2 Story 目录 / 章节叙事 / 统一知识页 / Lab 登记表
  features/execution/             # 执行台：执行图 / 中央联动 / 事件 Inspector / 时间轴 / 回放 / 持久化
  features/reports/               # M0.4 报告阅读器 / 来源检视 / Markdown 导出 / 派生状态
  scenes/                         # WebGL 渲染器 / AZ-CORE 01 / 三维装配与执行聚焦 / 开场时间线
  components/layout/panels.js     # 顶栏 / 导航 / 舞台 / 检视 / 事件 / 开场 / 未开放说明
  styles/                         # tokens / base / components / constructor / atlas / knowledge /
                                  # execution / reports / core-svg / layout / system-graph / labs
tests/                            # 239 项纯逻辑测试（node:test）
tools/
  build.mjs                       # 构建静态产物 + 离线单文件
  dev.mjs / preview.mjs           # 本地静态服务
  tokens-build.mjs                # 构建期分词 + 回译校验，生成 tokenTable.js
  tokens-verify.mjs               # 用真实分词器复算 token 表（24 组序列）
  shots.mjs                       # 无头 Chrome：T01–T13 + M0.2/03/04 + M1.1 + M1.2 + 截图
  m03-acceptance.mjs / m04-acceptance.mjs / m11-acceptance.mjs / m12-acceptance.mjs
verify/shots/                     # 验收截图 F01–F34 + 视口
verify/m12-shots/                 # M1.2 验收截图 F35–F45
verify/report.json                # 全量自检结果
verify/m12-report.json            # M1.2 逐项验收结果（A01–A30 + 三套回归）
docs/AUDIT_M1.2.md                # 开工前审计与复用清单
docs/DELIVERY_M1.2.md             # M1.2 交付说明与逐项验收结果
```

**分层原则**：`model`（定义与校验）→ `state`（唯一状态与转换）→ `simulation`（纯逻辑引擎 + 证据规则
+ 报告生成）→ `scenes`（视觉表现）→ `components`（DOM）。`runSimulation`、`evaluateEvidence`、
`evaluateConflict`、`generateReport`、`reportToMarkdown`、`createReplay` 等能力全部可以脱离 Three.js
在普通单元测试中运行；三维模型不承担任何状态数据库职责。

## 6. 验收结果

### 6.1 自动逻辑测试（`npm test`）— 239 / 239 通过

装配端口与字段校验、状态派生、持久化与损坏兜底、重置边界；图谱端点/唯一 ID/别名检索/固定坐标；
配置→工具可用性、B01–B05 分支、四个参数的真实效果、确定性、快照不可变；回放指针边界/调速/复位、
历史记录往返与损坏降级、学习进度命名空间独立；**研究包 ID 与数据完整性（A31/A32/A33/A34/A38）、
证据可见性与六条必要条件（A36/A37/A39/A40/A41/A42/A43/A45/A46/A47）、报告与引用（A53–A58/A62/A63）、
运行历史与旧版兼容（A64/A65/A66）**；**M1.2 新增：真实分词复算与「无字符数折算」守护（21）、
上下文确定性模拟与「无资料不出引用」（18）、MCP 协议路径只包装不新增事件（10）、
三章叙事结构完整性（9）**。

### 6.2 浏览器真实渲染自检（`npm run shots` / `npm run accept:m12`）

- **T01–T13（M0.1）：13 / 13 通过**
- **A01–A23（M0.2 装配）：25 / 25 通过**
- **A01–A30（M0.3 知识与执行）：33 / 33 通过**
- **A31–A70（M0.4 研究闭环）：44 / 44 通过**（40 项矩阵 + D06 决策可解释 + A53b 阅读视图）
- **A01–A24（M1.1 知识架构）：27 / 27 通过**
- **A01–A30（M1.2 AI 基础与工具交互）：32 / 32 通过**（A01–A29 + 回归 A30-M03/M04/M11）
- **页面异常：0 条**；四视口（1920×1080 / 1280×800 / 1024×768 / 390×844）横向溢出均为 **0**
- **验收截图**：`verify/shots/` 内 37 张 —— F01–F22 旧帧 + **F23 启动界面、F24 冲突显现、
  F25 更正成立、F26 未决冲突、F27 Report 全景、F28 引用/来源、F29 Report↔Execution、F30 移动端与
  2D 兜底（+ F30b 无 WebGL 报告）**，以及四种视口与移动端抽屉；
  `verify/m12-shots/` 内 12 张 M1.2 验收帧（F35 章节叙事、F37–F38b Token Lab、F39–F41 Context Lab、
  F42 MCP 路径、F43 知识页 INSPECT、F44–F45 移动端）。
- 明细写入 `verify/report.json` 与 `verify/m12-report.json`（每次运行覆盖）。

> 说明：无头环境使用 SwiftShader 软件渲染，截图中的帧率（约 24–34 fps）**不代表真实 GPU 性能**；
> 真实设备的帧率需在目标机器上实测（现场诊断面板会显示真实读数）。

## 7. 与 PRD / 任务书的差异说明

- **未使用 React + Vite**：本仓库交付物定位为「前端演示 HTML」。为满足 P0「运行期零 CDN、可静态托管、
  双击即可运行」，采用原生 ES Module + esbuild 单文件打包，仍完整保留任务书要求的工程分层与职责边界。
- **未创建后端、未接入任何真实模型**：全部业务逻辑在浏览器执行，模拟标注常驻界面。
- **公告数量 9 份**（任务书建议 6–8）：因为 A34 要求保留 M0.3 的 5 份稳定资料，新增 4 份用于更正链与
  未决冲突；每份都真实进入检索/读取/引用链路。
- **`A47` 的数据前提**：更正公告发布在「事务通知」栏目（`scope: service_notice`），因此
  `searchScope=campus_events` 时看不到它 —— 可见性差异来自**发布栏目**，不是伪造截断。
- **M0.4 范围内不做的事**（严格保留为非目标）：真实联网检索与真实 LLM 抽取、自主规划与多 Agent 协作、
  Workflow vs Agent 的完整 A/B 对照运行、权限审批流、提示注入对抗实验、六个独立实验室、
  其余 26+ 术语节点与自由连线编辑器。未开放的导航入口继续标注阶段并给出说明面板，
  **不存在点了没反应的假按钮**。
- **MCP 的处理**：仅在文案与知识节点中作为「另一种连接协议」出现，不提供任何假装握手的在线连接动画。

## 8. 已知限制

- 无头验证使用软件渲染，性能结论仅限功能可用性；未在移动真机上实测。
- 三维几何为程序化低面数实现（≈26k 三角面 / 约 94 次绘制调用），未包含 LOD 分级。
- 拖拽使用指针事件 + 射线检测，在极小的触屏设备上仍以点击路径为主（已提供等价入口）。
- 术语索引是静态速查（29 条）；语义关系图以知识星图的 10 个首期节点为准。
- 报告的事实抽取依赖研究包内预设的 `anchor` 映射：换一种写法可能抽不到，这是「规则自动化」的固有代价，
  已写进 R5 局限。
- 本地只保留最近两次运行；单次 Run 约 60–80 KB，未使用 IndexedDB。
- `B05`（检索无结果）当前语料不可达，只在引擎与单元测试中覆盖。
- 无头环境无法确认系统级下载对话框；Markdown 串行化内容与触发路径已由自动断言覆盖。






