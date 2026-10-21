# AGENT / ZERO — M0.3 知识与执行

> 一句话定位：**一座运行在浏览器里的交互式 AI 实验室**。用户从一颗只能处理语言的模型核心出发，
> 逐步看懂指令、上下文、工具、MCP、检索、Skills、记忆、Harness 等概念如何拼成一个能完成多步任务的系统。
>
> 品牌主张：**FROM LANGUAGE TO ACTION. / 从语言，到行动。**
>
> 本仓库当前交付的是 **M0.3 / Knowledge & Execution**：在 M0.1（AZ-CORE 01 实时三维核心与启动序列）与
> M0.2（工具模块的真实装配与配置）之上，增加**知识星图**、**Tool Calling 完整分层知识页**、
> **由真实配置驱动的本地模拟引擎**与**可暂停的事件回放**——
> 10 个审校概念节点、10 条人工配置的语义关系、4 条必需执行分支、执行图/时间轴/事件 Inspector，
> 以及三维与二维的事件联动。
> **不含**正式研究报告、资料冲突核验与引用溯源（M0.4）。

---

## 1. 立刻体验（两种方式）

| 方式 | 操作 | 说明 |
|---|---|---|
| **直接打开** | 双击根目录 `index.html` | 单文件离线版，CSS/JS/Three.js 全部内联，无需服务器、无需联网 |
| **本地开发服务** | `npm install` → `npm run dev` → 打开 http://127.0.0.1:5187/ | 静态文件服务，仅用于本地开发 |

> 首次访问播放约 11 秒的开场序列（可随时按 **跳过开场** 或 `ESC`）。看过一次后，再次访问直接进入控制台；
> 顶栏 **重播开场** 可完整重看。想每次都看开场，可访问 `index.html?intro=always`。

**四条推荐路径（都能走通）：**

1. **从知识到系统**：`知识星图` → 搜索 `Tool Calling`（画布自动定位）→ `LEARN` 进入完整知识页 →
   `VIEW IN CONSTRUCTOR` → 在装配台装配 Search / Reader → `RUN SIMULATION`。
2. **从装配到运行**：`装配台` → 能力架点击或拖拽装配两种工具 → 授予只读模拟权限 → `RUN SIMULATION` →
   在执行台里播放/暂停/单步/Seek/调速，查看每个事件的输入输出与分支依据。
3. **对照学习**：在执行台把 Reader 禁用或移除，再点 `New Run`，观察事件轨迹如何变化
   （检索成功 → 读取被阻断 → 以摘要级资料结束）。
4. **降级与无障碍**：任何页面都可只用键盘完成操作；无 WebGL 时自动使用二维执行核心与结构投影。

## 2. 构建与部署

```bash
npm install          # 安装依赖（three、esbuild）
npm run dev          # 本地开发预览（静态服务）
npm run build        # 产出 dist/ 与离线单文件 index.html
npm test             # 97 项纯逻辑测试（装配 / 图谱 / 引擎 / 回放 / 持久化）
npm run preview      # 预览 dist/ 产物
npm run shots        # 无头 Chrome 真实渲染自检：T01–T13 + A01–A23 + A01–A30 + 22 帧截图
```

- `npm run build` 产出：
  - `dist/index.html` + `dist/assets/app.js` + `dist/assets/app.css`（标准静态包，引用相对路径）
  - 根目录 `index.html`（**离线单文件版**，便于无服务器演示）
- **GitHub Pages**：把 `dist/` 内容推到 Pages 分支即可。产物使用相对路径，放在仓库子路径下也能正常加载；
  项目未使用前端路由，刷新不会 404。
- **零外部依赖**：three.js 与全部样式在构建时打包进产物，运行期不请求任何 CDN、字体或业务接口。

## 3. 这一轮实现了什么（M0.3）

### 3.1 知识星图 Atlas：10 个首期节点

| conceptId | 中文名 | 解释焦点 | 系统落点 |
|---|---|---|---|
| `llm` | 大语言模型 | 负责语言生成与工具调用请求的模型能力 | 中央核心 |
| `agent` | 智能体执行系统 | 模型 + 工具 + 控制流程组成的执行系统 | 中央核心 |
| `tool_calling` | 工具调用 | 模型提出请求、外部执行、结果回传 | 能力架工具模块（**唯一完整知识页**） |
| `tools` | 工具 | 提供外部能力的可调用接口，不等同协议 | 能力架工具模块 |
| `api` | 应用程序接口 | 软件能力暴露与调用的接口概念 | 解释性节点 |
| `mcp` | 模型上下文协议 | 标准化连接协议；工具无需一律通过 MCP | 解释性节点 |
| `skills` | 技能说明 | 按需加载的任务说明与资源，不是工具 | 解释性节点 |
| `rag` | 检索增强生成 | 检索 + 生成；不等于记忆或关键词搜索 | 解释性节点 |
| `workflow` | 工作流 | 开发者定义执行路径，运行期不改路线 | 解释性节点 |
| `harness` | 运行环境层 | 工具协调、上下文组装与运行控制 | 解释性节点 |

- **语义关系 10 条**（人工逐条配置）：`USES` 3 条（有向，画箭头）、`RELATED` 6 条、`CONTRASTS` 1 条。
  本轮**不编造 PART_OF**；`RELATED` / `CONTRASTS` 不画箭头，关系 Inspector 明确写「无向 · 不表示必需依赖」。
- **固定坐标**：`820×560` 画布内手写坐标，刷新与切页都不重排；缩放限幅 `0.55–2.6`，平移有边界，
  `Reset View` 回到标准视角，`适配视窗` 自动取景。
- **搜索**：中英文别名、大小写、去空格写法、部分匹配；命中自动定位并打开摘要；空结果有明确文案。
- **无障碍**：左侧概念清单 + 画布内节点/关系都可 `Tab` 聚焦、`Enter` 打开，`Esc` 清除选中；
  只有 Tool Calling 显示 `LEARN`，其余 9 个明确标注「Coming in later phase」，没有假按钮。

### 3.2 Tool Calling：四步 + 两个深度层

- **DISCOVER**：为什么模型不能直接知道一条虚构校园公告？可一键从本地语料取回 NTC-1001 的摘要做对照
  （标注「示意片段 · 不是真实模型输出」）。
- **UNDERSTAND / INSPECT**：三段职责「模型提出请求 → 运行环境检查并执行 → 结果回到上下文」，
  可上一步/播放/下一步/复位。**INSPECT 深入层**为左三段 + 右详情的双列：简化 JSON 请求、权限检查五项、
  事件记录字段（`tool.call / tool.result / tool.error`、稳定 ID、`branchId + ruleId`、资料引用）。
- **EXPERIMENT**：内嵌实验使用与装配台**完全相同**的工具定义与模拟引擎，可切换运行条件与参数
  （`searchScope` / `maxResults` / `readMode` / `includeMetadata`），真实改变事件与响应；
  页面常驻「这是知识示范，不会修改当前构建器配置」，实测构建器配置与 localStorage 前后完全不变。
- **CONNECT**：与 LLM / Tools / API / MCP / Agent 的关系入口 + 回装配台定位。

### 3.3 本地教学研究样本 `mission-001-mini`

- 5 条**虚构**公告（`isFictional: true`）：3 条活动类 + 2 条事务类。
- `searchScope=all_notices` → 5 条候选；`campus_events` → 3 条候选。
- 每条含 `sourceId / chunkId / publishedAt / publisher / summary / body`，并预留
  `supersedes / supersededBy / citation / validity`（本阶段不参与任何判断）。
- `readMode=summary` 只能拿到预定义摘要，**不会**产生全文读取事件；
  `includeMetadata=false` 时用户可见响应里没有来源与日期（内部追踪元数据另存）。

### 3.4 模拟引擎：确定性、可解释

```text
M0.2 已确认配置快照  →  纯规则判定  →  确定性事件序列  →  执行图 / 时间轴 / Inspector / 三维聚焦
```

- 入口：`runSimulation(configSnapshot, missionData, runOptions)` → 冻结的 `SimulationRun`。
- 工具可用性**直接从 M0.2 配置派生**（`Ready / Disabled / Unconfigured / Invalid` + 权限），
  没有第二套 `searchAvailable` 开关。
- 事件 ID = `runId#eNN`；`runId` 由「任务 ID + 版本 + 配置快照 + 故障选项」hash 派生，**无时间、无随机**。
- 分支：

| 分支 | 条件 | 结果 |
|---|---|---|
| `B01_NORMAL` | Search 与 Reader 都 Ready | 检索 → 读取 → 记录样本 → 结束（`sample_acquired`） |
| `B02_NO_SEARCH` | Search 未装配 / 禁用 / 未授权 / 非法 | 校验阶段阻断，**没有任何成功调用**（`blocked`） |
| `B03_NO_READER` | Search 可用、Reader 不可用 | 真实检索结果 → 读取阻断 → 摘要级资料结束（`partial`） |
| `B04_SEARCH_TIMEOUT` | 显式开启 `faultMode=search_timeout` | 确定性超时，无假成功（`error`） |
| `B05_NO_RESULTS` | 范围内没有条目 | 不调用 Reader，部分完成（引擎与单测覆盖） |

- 运行后再改配置**不会重写历史**；`New Run` 才使用新配置。

### 3.5 执行台与回放

- **左侧 Execution Graph**：只画本次真实走过的事件；未走过的阶段用虚线标注「本次未执行」；
  候选分支条只有一条被标为「已执行 · 本次路径」。
- **中央 AZ-CORE 01 联动**：3D 可用时把同一块 canvas 停靠到中央列（不新建 WebGL 上下文），
  只聚焦当前事件涉及的模块与接口；无 WebGL 时用二维执行核心 + 数据包沿链路移动。
- **右侧 Event Inspector**：序号、阶段、类型、状态、参与者、工具、输入/输出载荷（折叠、纯文本）、
  `sourceIds / chunkIds`、`branchId / ruleId`、样本等级与「本阶段不生成报告」。
- **底部 Event Timeline**：播放/暂停、上一事件/下一事件、事件条 Seek、`0.5× / 1× / 2× / 4×`、
  `Restart Replay`（只归零指针）、`New Run`（才重新运行引擎）。回放调度由执行台自持定时器驱动，
  **不依赖 rAF 或 WebGL**，离开工作区立即清理。
- **本次运行设置**：`正常运行` / `模拟检索超时（search_timeout）`——故障注入只影响单次运行，
  不会把模块写成永久 `Invalid`，也不会随机触发。

### 3.6 三维 / 二维 / 存储

- 同一个 `eventId` 同时驱动三维聚焦、二维执行路径与 Inspector 内容（实测三者一致；
  选中 `validation.blocked` 时不会亮起 Reader 成功态）。
- 命名空间：`agent-zero:constructor:v1`（装配配置）· `agent-zero:execution:v1`（最近一次 Run）·
  `agent-zero:learning:v1`（学习进度）。三者互不覆盖，损坏数据各自降级为「无数据 + 可读提示」。
- 学习进度用 `explored / relatedDiscovered / experimentCompleted` 多标志组合，**不是测验成绩**。

### 3.7 继续保留的 M0.1 / M0.2 能力

AZ-CORE 01 造型、五镜头开场（可随时跳过并落到唯一确定的 IDLE + Hub 终态）、控制台布局、
旋转 / 缩放 / 聚焦、低功耗档、二维 SVG 兜底、设计令牌；能力架的点击自动装配（选择 → 预览 → 确认 →
装配 → 配置）与引导拖拽、端口兼容性、7 种逻辑状态、字段级校验、三维/二维/检视面板同步、
版本化持久化与损坏兜底——全部由 T01–T13 与 A01–A23 回归用例守护。

## 4. 文案与术语规则

面向中文用户：

- **界面文字、按钮、分类、说明一律中文**（如「能力架」「确认装配」「执行台」「事件检视面板」）。
- **专有名词保留英文**：`AZ-CORE 01`、`Tool Calling`、`Announcement Search`、`SEARCH_PORT`、
  `Ready / Unconfigured / Disabled / Invalid`、`MCP`、`Skills`、`Harness`、`RAG`、`Agent` 等；
  英文状态名一律配中文解释（如 `Ready · 就绪`）。
- **难懂的名词就地给中文解释**：左侧术语索引展开即有中文释义；知识节点详情有「常见误解」对照；
  执行台的事件 Inspector 直接给出触发分支与规则标识。
- **诚实标注**：`SIMULATED · 本地教学模拟` 常驻；资料标 `isFictional: true`；
  不宣称「模型内部思维链」「来源已验证」「AI 正在深度思考」。

## 5. 工程结构

```text
src/
  app.js                          # 应用壳：唯一渲染循环、工作区宿主、装配与执行集成、键盘与偏好
  main.js                         # 入口
  data/content.js                 # 单一权威内容源：几何参数、结构词条、导航、章节、术语与释义
  state/store.js                  # M0.1 的 UI 状态 + 真实事件日志
  simulation/                     # M0.3 纯逻辑模拟层（不依赖 DOM / Three.js）
    events/schema.js              # 阶段、类型、状态、参与者、结局、故障选项
    events/serializer.js          # 规范化 JSON、稳定 hash、runId、历史解析与形状校验
    tools/registry.js             # 全站共享工具定义（复用 M0.2 参数 Schema）
    tools/announcementSearch.js   # 本地模拟检索（纯函数）
    tools/documentReader.js       # 本地模拟读取（纯函数）
    rules/availability.js         # 配置 → 工具可用性
    rules/branches.js             # B01–B05 分支规则
    engine/runSimulation.js       # runSimulation(config, data, options)
  research-packs/mission-001-mini # 5 条虚构公告（版本化数据包）
  features/constructor/           # M0.2 装配领域（与渲染层解耦，可脱离 WebGL 单测）
  features/atlas/                 # M0.3 知识星图
    data/concepts.js              # 10 个概念（定义 / 解释 / 误解 / 相关 / 后续）
    data/relationships.js         # 10 条语义边 + 固定坐标
    data/index.js                 # 检索、相关概念、图完整性校验
    graph/atlasGraph.js           # SVG 星图：缩放 / 平移 / 聚焦 / 选中
    components/atlasWorkspace.js  # 三栏工作区（清单 / 画布 / 详情）
    knowledge/toolCalling.js      # 四步知识页 + 内嵌实验
    state/learning.js             # 学习进度（独立命名空间）
  features/execution/             # M0.3 执行台
    state/replay.js               # 回放指针控制器（纯逻辑，可单测）
    state/persistence.js          # 最近一次 Run 持久化
    components/executionWorkspace.js / executionGraph.js / executionCore.js
    components/inspector.js / timeline.js / eventView.js
  scenes/                         # WebGL 渲染器 / AZ-CORE 01 / 三维装配与执行聚焦 / 开场时间线
  components/layout/panels.js     # 顶栏 / 导航 / 舞台 / 检视 / 事件 / 开场 / 未开放说明
  styles/                         # tokens / base / components / constructor / atlas / knowledge / execution / core-svg / layout / system-graph
tests/                            # 97 项纯逻辑测试（node:test）
tools/
  build.mjs                       # 构建静态产物 + 离线单文件
  dev.mjs / preview.mjs           # 本地静态服务
  shots.mjs                       # 无头 Chrome：T01–T13 + A01–A23（M0.2）
  m03-acceptance.mjs              # 无头 Chrome：A01–A30（M0.3）
verify/shots/                     # 验收截图 F01–F22 + 视口
verify/report.json                # 自检结果
```

**分层原则**：`model`（定义与校验）→ `state`（唯一状态与转换）→ `simulation`（纯逻辑引擎）→ `scenes`（视觉表现）
→ `components`（DOM）。`validateConnection`、`deriveStatus`、`runSimulation`、`createReplay` 等能力全部可以脱离
Three.js 在普通单元测试中运行；三维模型不承担任何状态数据库职责。

## 6. 验收结果

### 6.1 自动逻辑测试（`npm test`）— 97 / 97 通过

端口兼容性、配置字段校验、状态派生、完整转换路径、重复装配、禁用与重新启用、字段非法写入拒绝、
移除清理引用、拖拽提交与点击确认等价、单次确认原子性、序列化往返、损坏数据兜底、版本不一致、
重置只清理构建器命名空间；图谱端点/唯一 ID/别名检索/固定坐标、图完整性校验；配置→工具可用性推导、
B01–B05 分支、四个参数的真实效果、确定性（含键顺序无关）、快照不可变；回放指针边界/调速/复位、
历史记录往返与损坏降级、学习进度独立命名空间。

### 6.2 浏览器真实渲染自检（`npm run shots`）

- **T01–T13（M0.1 回归）：13 / 13 通过**
- **A01–A23（M0.2 装配验收）：25 / 25 通过**
- **A01–A30（M0.3 知识与执行）：33 / 33 通过**（30 项矩阵 + 3 项补充）
- **验收截图**：`verify/shots/` 内 F01–F22 + 四种视口（1920×1080 / 1280×800 / 1024×768 / 390×844）。
  新增帧：F15 Atlas 全景、F16 搜索聚焦、F17 Tool Calling Understand、F18 Tool Calling Inspect、
  F19 Execution 正常进行、F20 Reader 不可用分支、F21 Replay 暂停、F22 窄屏/无 WebGL。
- **顺带修复的窄屏缺陷**：≤767px 时 shell 之前仍按「导航栏 + 舞台 + 检视栏」三列排布，
  舞台被挤成约 106px 窄条（属性选择器覆盖了单列规则）；M0.3 已修正为真正的单列，
  390×844 下基础控制台与三个工作区都完整可用，四视口横向溢出均为 0。
- 明细写入 `verify/report.json`（每次运行覆盖）。

> 说明：无头环境使用 SwiftShader 软件渲染，截图中的帧率（约 24–31 fps）**不代表真实 GPU 性能**，
> 因此不对「稳定 60fps」做任何声明；真实设备的帧率需在目标机器上实测（现场诊断面板会显示真实读数）。

## 7. 与 PRD / 任务书的差异说明

- **未使用 React + Vite**：本仓库交付物定位为「前端演示 HTML」。为满足 P0「运行期零 CDN、可静态托管、
  双击即可运行」，采用原生 ES Module + esbuild 单文件打包，仍完整保留任务书要求的工程分层与职责边界。
- **未创建后端、未接入任何真实模型**：全部业务逻辑在浏览器执行，模拟标注常驻界面。
- **M0.3 范围内不做的事**（严格保留为非目标）：正式研究报告与导出、10/18 与 10/20 来源冲突核验、
  `supersedes` 推理、引用回查到报告句子、Workflow vs Agent 完整 A/B、全自动规划与重试、权限审批流、
  提示注入对抗、其余 26+ 术语节点与六个独立实验室、自由节点连线编辑器。未开放的导航入口继续标注阶段
  并给出说明面板，**不存在点了没反应的假按钮**。
- **MCP 的处理**：仅在文案与知识节点中作为「另一种连接协议」出现，不提供任何假装握手的在线连接动画。

## 8. 已知限制

- 无头验证使用软件渲染，性能结论仅限功能可用性；未在移动真机上实测。
- 三维几何为程序化低面数实现（≈26k 三角面 / 约 98 次绘制调用），未包含 LOD 分级。
- 拖拽使用指针事件 + 射线检测，在极小的触屏设备上仍以点击路径为主（已提供等价入口）。
- 术语索引是静态速查（29 条）；语义关系图以知识星图的 10 个首期节点为准。
- 打开 Atlas / 知识页 / 执行台时，左侧导航与右侧结构检视会让位给工作区（工作区自带导航与检视）。
- `B05`（检索无结果）当前语料不可达，只在引擎与单元测试中覆盖。
