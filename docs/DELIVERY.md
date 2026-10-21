# AGENT / ZERO — 交付说明（M0.3 知识与执行）

> 面向本仓库当前交付：`docs/PRD .md`（v0.7）+ `docs/DESIGN_SYSTEM.md`（AZ-DESIGN v1.0）
> + `docs/M0.3_TASK.md` 的**可运行前端实现**，承接已通过验收的 M0.1（视觉基础）与 M0.2（装配原型）。
> 使用方式见 [README.md](../README.md)。

## 1. 交付物清单

| 交付物 | 路径 | 说明 |
|---|---|---|
| 离线单文件演示 | `index.html` | 双击即可运行，CSS/JS/three.js 全部内联，运行期零外部请求（约 953 KB） |
| 标准静态包 | `dist/index.html`、`dist/assets/app.js`（856 KB）、`dist/assets/app.css`（96 KB） | 可部署到 GitHub Pages 等静态托管（相对路径 + 无前端路由） |
| 知识与执行源码 | `src/simulation/**`、`src/features/atlas/**`、`src/features/execution/**`、`src/research-packs/**` | 纯逻辑引擎 / 知识星图 / 执行台 / 本地语料，共 25 个新文件 |
| 本地研究样本 | `src/research-packs/mission-001-mini/**` | 5 条虚构公告 + 检索范围定义 + M0.4 预留字段 |
| 自动测试 | `tests/**` | `npm test`：**97 项**（M0.2 原有 35 + 新增 62），node:test，无需浏览器 |
| 浏览器验收 | `tools/shots.mjs`、`tools/m03-acceptance.mjs` | T01–T13 回归 + A01–A23（M0.2）+ **A01–A30（M0.3）** |
| 验收截图 | `verify/shots/**` | F01–F22 共 22 帧 + 4 种视口 + 移动端抽屉 |
| 自检报告 | `verify/report.json` | 每次 `npm run shots` 覆盖写入 |

## 2. 实现摘要（M0.3 七个交付面）

### 2.1 Atlas：10 个可用知识节点

- 数据源 `src/features/atlas/data/concepts.js`：10 个概念（`llm / agent / tool_calling / tools / api / mcp / skills / rag / workflow / harness`），每个含一句话定义、2–3 段审校解释、1–2 条常见误解（claim + 纠正）、相关概念与后续提示。**只有 `tool_calling` 拥有完整分层知识页**，其余 9 个在详情里明确显示「Coming in later phase」，没有假按钮。
- 关系 `src/features/atlas/data/relationships.js`：**10 条人工配置的语义边**（USES 3 / RELATED 6 / CONTRASTS 1），每条含 `id / sourceId / targetId / type / description / directed`。本轮**不编造任何 PART_OF 实例**；`RELATED` 与 `CONTRASTS` 一律 `directed: false`，界面不画箭头，并在关系 Inspector 里写明「无向 · 不表示必需依赖」。
- 布局：`NODE_LAYOUT` 固定坐标（`820×560` viewBox），刷新、切页、重新打开都不会重排，避免「学习导航失忆」。
- 交互：滚轮/按钮缩放（0.55–2.6 限幅）、指针拖拽平移（有边界）、`Reset View`、`适配视窗`、双击聚焦、节点选中与关联高亮；所有节点与关系都有 `tabindex=0` + `role=button` + 完整 `aria-label`，左侧概念清单为键盘/触屏提供不依赖画布命中点的等价入口。
- 搜索：中英文别名、大小写、去空格写法、部分匹配；命中后画布自动定位并打开摘要；空结果显示「没有找到相关概念」并提供清除。

### 2.2 Tool Calling：首个完整知识节点

`src/features/atlas/knowledge/toolCalling.js`

- 四步学习路径：**DISCOVER**（为什么模型不知道虚构公告，可一键从本地语料取回真实条目作对照）→ **UNDERSTAND**（请求 → 执行 → 返回三段职责，可上一步/播放/下一步/复位）→ **EXPERIMENT** → **CONNECT**（关系、术语边界、回装配台）。
- 两个深度层：**UNDERSTAND（入门）** 用日常语言讲三方分工；**INSPECT（深入）** 左列三段职责 + 右列当前段的深入说明（简化 JSON 请求、权限检查清单、事件记录字段），并明确「简化示意格式，不是逐字协议规范」。
- 内嵌实验：与装配台**完全共享** `simulation/tools/registry.js` 的工具名、参数 Schema 与执行函数；运行条件（两种工具就绪 / Search 未装配 / Reader 未装配 / Reader 未授权）与参数（`searchScope`、`maxResults`、`readMode`、`includeMetadata`）都能真实改变事件与响应。页面常驻标注「这是知识示范，不会修改当前构建器配置」——A11 实测：实验前后构建器配置与 localStorage 完全不变，只写入独立的 `agent-zero:learning:v1`。
- 术语边界：Tool Calling / Tools / API / MCP / Skills / Agent 六者的差异与常见误解常驻右侧栏。

### 2.3 mission-001-mini 本地语料

- 5 条**虚构**公告（`isFictional: true`），3 条活动类 + 2 条事务类：`searchScope=all_notices` → 5 条候选；`campus_events` → 3 条候选。
- 每条含 `sourceId / chunkId / chunkIds / publishedAt / publisher / title / scope / tags / summary / body`，并预留 `supersedes / supersededBy / citation / validity`（本阶段一律 `null` / `'unverified'`，不参与任何判断）。
- 排序稳定：发布日期倒序 + `sourceId` 升序；`maxResults` 截断时事件里如实报告 `total / returned / truncated`（数据少于上限时报告真实较小数量）。

### 2.4 模拟引擎（纯逻辑、确定性）

`src/simulation/**`：`events/schema.js`、`events/serializer.js`、`tools/*`、`rules/availability.js`、`rules/branches.js`、`engine/runSimulation.js`

- 入口 `runSimulation(configSnapshot, missionData, runOptions)` → 冻结的 `SimulationRun`（`schemaVersion / runId / missionId / missionVersion / corpusVersion / configSnapshot / options / outcome / branchId / events / artifacts / stats / notes`）。
- **工具可用性直接从 M0.2 配置派生**（`deriveStatus` + `validateModuleConfig`），不存在 `searchAvailable` 之类的第二套开关；原因为 `NOT_INSTALLED / DISABLED / PERMISSION_MISSING / INCOMPLETE / INVALID`。
- **事件 ID 稳定**：`runId#eNN`；`runId = hash(任务 ID + 版本 + 配置快照 + 故障选项)`，**不含时间与随机数**。时间戳只出现在持久化封装的 `savedAt`。
- 分支：B01 正常、B02 缺/禁用/未授权/非法 Search、B03 Search 可用但 Reader 不可用、B04 显式 `faultMode=search_timeout`、B05 检索无结果（引擎与单测覆盖，UI 可达 B01–B04）。
- 参数真实生效：`searchScope` 改变候选集合、`maxResults` 截断并报告真实数量、`readMode=summary` 只返回预定义摘要（`content: null`）、`readMode=full_text` 才返回正文、`includeMetadata=false` 时用户可见响应里没有来源与日期（内部追踪元数据另存 `artifacts.internal`）。
- 快照不可变：输入深拷贝 + 递归冻结；运行后再改配置不会重写历史（A23 实测 `Object.isFrozen` 为 true，写入会抛 `TypeError`）。

### 2.5 Execution 工作区与回放

`src/features/execution/**`

- 布局：左侧 Execution Graph（只画本次真实走过的事件；未走过的阶段用虚线标注「本次未执行」，候选分支条只有一条被标为「已执行 · 本次路径」）· 中央 AZ-CORE 01 联动 · 右侧 Event Inspector · 底部 Event Timeline。
- 回放：`Play/Pause`、`Previous/Next`、`Seek`（执行图节点与时间轴事件条都可点）、`0.5× / 1× / 2× / 4×`、`Restart Replay`（只归零指针，不重新调用引擎）、`New Run`（才读取当前装配台配置）。
- 回放调度**不依赖 requestAnimationFrame 或 WebGL**：执行台自持 60ms 定时器，离开工作区立即清理；无 WebGL、后台节流时播放依然推进。
- Inspector 显示序号、阶段、类型、状态、参与者、工具、输入/输出载荷（折叠、纯文本渲染，不使用 innerHTML）、`sourceIds` / `chunkIds`、`branchId` / `ruleId`、本次运行的样本等级与「本阶段不生成报告」说明。
- 持久化：`agent-zero:execution:v1`（只存最近一次 Run + `savedAt`），损坏/错版本/事件缺失一律降级为「无历史 + 可读提示」，从不触碰 `agent-zero:constructor:v1`。

### 2.6 3D / 2D 联动

- 3D 可用时把**同一个** canvas 停靠到执行台中央列（不新建 WebGL 上下文），通过 `bay.setExecutionFocus(moduleId, tone)` 只降亮/聚焦当前事件涉及的模块与接口；`blocked` 事件不会让工具显得「成功」。
- 无 WebGL 时中心列渲染二维执行核心（模型核心 + 两条工具轨道），数据包沿链路移动，阻断/错误在局部呈现断点。
- 同一 `eventId` 同时驱动三处：三维聚焦、二维高亮、Inspector 内容（A27 实测三者一致；选中 `validation.blocked` 时不会亮起 Reader 成功态）。

### 2.7 导航与学习进度

- 主导航新增 `知识星图`（Atlas）与 `执行台`（Execution）两个**真实入口**；`引导叙事` / `实验空间` 仍标注未开放并提供阶段说明面板（T07 断言未开放入口=2、无假按钮）。
- 三向导航闭环：Atlas → 知识页 → `VIEW IN CONSTRUCTOR`（只定位、不装配、不授权）→ 工具 Inspector → `查看 Tool Calling 知识节点` → `返回上一处` **恢复原 Inspector 上下文**（A12/A13）。
- 学习进度 `agent-zero:learning:v1`：`explored / relatedDiscovered / experimentCompleted / visits` 多标志组合，显示名只是派生；与构建器配置、模拟分支完全独立。

## 3. 修改文件清单（M0.3）

### 新增

```text
src/simulation/events/schema.js            事件阶段/类型/状态/参与者/结局/故障选项
src/simulation/events/serializer.js        规范化 JSON、稳定 hash、runId、历史解析与形状校验
src/simulation/tools/announcementSearch.js 本地模拟检索（纯函数）
src/simulation/tools/documentReader.js     本地模拟读取（纯函数）
src/simulation/tools/registry.js           全站共享的工具定义表（复用 M0.2 参数 Schema）
src/simulation/rules/availability.js       配置 → 工具可用性派生
src/simulation/rules/branches.js           B01–B05 分支规则
src/simulation/engine/runSimulation.js     纯逻辑确定性引擎 + summarizeRun
src/research-packs/mission-001-mini/notices.js   5 条虚构公告
src/research-packs/mission-001-mini/index.js     版本化数据包入口
src/features/atlas/data/concepts.js        10 个知识节点
src/features/atlas/data/relationships.js   10 条语义边 + 固定坐标 + viewBox
src/features/atlas/data/index.js           检索、相关概念、图完整性校验
src/features/atlas/graph/atlasGraph.js     SVG 星图渲染与缩放/平移/聚焦
src/features/atlas/components/atlasWorkspace.js  Atlas 三栏工作区
src/features/atlas/knowledge/toolCalling.js     Tool Calling 四步知识页 + 内嵌实验
src/features/atlas/state/learning.js       学习进度 store（独立命名空间）
src/features/execution/state/replay.js     回放指针控制器（可单测）
src/features/execution/state/persistence.js 最近一次 Run 持久化
src/features/execution/components/executionWorkspace.js 执行台合成与调度
src/features/execution/components/executionGraph.js     执行图
src/features/execution/components/executionCore.js      中央 3D 停靠 / 2D 执行核心
src/features/execution/components/inspector.js          事件 Inspector
src/features/execution/components/timeline.js           时间轴与回放控制
src/features/execution/components/eventView.js          共用事件行/载荷块
src/styles/atlas.css  src/styles/knowledge.css  src/styles/execution.css
tests/simulation.test.mjs  tests/atlas.test.mjs  tests/execution.test.mjs
tools/m03-acceptance.mjs                   M0.3 浏览器验收（A01–A30）
```

### 改动（增量，未重写 M0.1/M0.2）

| 文件 | 改动 |
|---|---|
| `src/app.js` | 新增工作区宿主与打开/关闭清理、画布停靠、3D 聚焦、导航路由（atlas/execution）、`RUN SIMULATION` 入口、Esc 分层处理、真实帧计数（`frameCount`）、自检 API |
| `src/data/content.js` | NAV 解锁 atlas 并新增 execution、MILESTONES / BOOT_LOG 更新、端口与轨道文案同步到当前能力 |
| `src/components/layout/panels.js` | 分组标签与术语索引说明更新 |
| `src/features/constructor/components/dom.js` | `h()` 支持子节点参数（第 3 参仍为受信任 HTML，向后兼容） |
| `src/features/constructor/components/moduleInspector.js` | 新增「查看 Tool Calling 知识节点」入口，回传当前上下文 |
| `src/features/constructor/state/persistence.js` | 导出 `serializeConfig` 供运行快照复用（行为不变） |
| `src/scenes/core/modules3d.js` | 新增 `setExecutionFocus / clearExecutionFocus / getExecutionFocus` 与基准不透明度，修复逐帧累乘导致的淡出 |
| `src/styles/constructor.css` | 新增紧凑控件样式 |
| `src/styles/atlas.css` | 工作区外壳（全宽、单列 `minmax(0,1fr)`）、Atlas 样式与 ≤900px 窄屏规则 |
| `src/styles/layout.css` | **修复 M0.1/M0.2 遗留的窄屏缺陷**：≤767px 时属性选择器（`data-inspect` / `data-dock` / `data-workspace`）特异性高于单列规则，导致 shell 仍是「232px + 1fr + 0」，舞台被挤成 106px 窄条；现以同等特异性覆盖为单列 |
| `tools/shots.mjs` | T07 断言更新为 M0.3 导航事实；接入 M0.3 验收段与报告 |
| `package.json` | 版本 0.3.0、description 更新 |

**状态所有权**：装配配置仍唯一属于 `constructor` store；学习进度属于 `learning` store；最近一次运行属于 `agent-zero:execution:v1`。三者互不写入。

## 4. 数据说明

### 4.1 10 个概念与关系

| 概念 | 中文名 | 章节 | 系统落点 |
|---|---|---|---|
| `llm` | 大语言模型 | 01 智能诞生 | 中央核心 |
| `agent` | 智能体执行系统 | 05 执行系统 | 中央核心 |
| `tool_calling` | 工具调用 | 03 外部能力 | 能力架工具模块 |
| `tools` | 工具 | 03 外部能力 | 能力架工具模块 |
| `api` | 应用程序接口 | 03 外部能力 | 解释性节点 |
| `mcp` | 模型上下文协议 | 03 外部能力 | 解释性节点 |
| `skills` | 技能说明 | 04 信息与方法 | 解释性节点 |
| `rag` | 检索增强生成 | 04 信息与方法 | 解释性节点 |
| `workflow` | 工作流 | 05 执行系统 | 解释性节点 |
| `harness` | 运行环境层 | 05 执行系统 | 解释性节点 |

边（10 条）：`agent→llm USES`、`agent→tools USES`、`llm→tool_calling RELATED`、`tool_calling→tools USES`、`tools→api RELATED`、`mcp→tools RELATED`、`agent→skills RELATED`、`agent→rag RELATED`、`workflow→agent CONTRASTS`、`harness→agent RELATED`。

### 4.2 语料版本

`mission-001-mini@1`（`MISSION_VERSION = 1`，`CORPUS_VERSION = 'mission-001-mini@1'`）。事件里记录语料版本，保证「同一配置 + 同一数据版本 → 同一轨迹」。

### 4.3 参数如何影响结果

| 参数 | 影响 | 实测证据 |
|---|---|---|
| `searchScope` | 候选集合 5 条 / 3 条 | 事件消息「候选 5 条」vs「候选 3 条」 |
| `maxResults` | 返回上限与截断标记 | 3 → 「受上限 3 限制返回 3 条（已截断）」；5 → 「全部返回 5 条」 |
| `readMode` | 摘要 vs 全文 | `textScope=summary / content=null`；`textScope=full_text`（245 字符正文） |
| `includeMetadata` | 用户可见元数据 | 关闭时 `metadata=null` 且响应 JSON 不含 `publishedAt/publisher`；`artifacts.internal` 仍保留 |
| `faultMode=search_timeout` | 确定性超时 | B04 / `SEARCH_TIMEOUT` / outcome=error，无假成功 |
| 缺 Search / Reader / 未授权 / Invalid | 阻断分支 | B02（无任何成功调用）/ B03（检索成功、读取阻断） |

### 4.4 虚构资料如何标注

界面常驻 `SIMULATED · 本地教学模拟`；语料每条 `isFictional: true`；DISCOVER 步骤展示条目时标注「本地教学语料 · NTC-1001 · 虚构数据（isFictional: true）」；Inspector 的 `notes` 里写明「本地教学模拟：不接入真实搜索服务、真实 MCP Server 或在线 AI」。

## 5. 实际验证

### 5.1 命令

```bash
npm install          # three@0.160.1 + esbuild
npm test             # 97 项纯逻辑测试
npm run build        # dist/ + 离线单文件 index.html
npm run shots        # 无头 Chrome：T01–T13 + A01–A23(M0.2) + A01–A30(M0.3) + 22 帧截图
```

### 5.2 单元测试：97 / 97 通过

覆盖：图关系端点/唯一 ID/Alias 检索/固定坐标、配置→可用性推导、B01–B05、`searchScope/maxResults/readMode/includeMetadata`、确定性（含键顺序无关）、快照不可变、回放指针边界与调速、历史记录往返与损坏降级、学习进度独立命名空间。

### 5.3 浏览器验收（真实 DOM + 真实 store 驱动）

- **M0.1 回归 T01–T13：13 / 13**
- **M0.2 装配 A01–A23：25 / 25**
- **M0.3 知识与执行 A01–A30：33 / 33**（30 项矩阵 + 3 项补充：A16b Invalid 配置、A26b 回放不改数据、A28b 损坏降级）

| 编号 | 场景 | 结果 | 关键证据（实测） |
|---|---|---|---|
| A01 | Atlas 初始载入 | 通过 | 节点=10 / 清单=10 / viewBox=0 0 820 560 |
| A02 | 语义关系 | 通过 | 边=10 · USES 3 / RELATED 6 / CONTRASTS 1 · 无 PART_OF · 说明缺失 0 |
| A03 | 搜索 | 通过 | LLM→llm · TOOLCALLING→tool_calling · 工具调用→tool_calling · 空结果提示可见 |
| A04 | 缩放/平移/复位 | 通过 | 放大上限 2.60 / 缩小下限 0.55 / 平移受限 / 复位 k=1,x=0,y=0 |
| A05 | 点击/聚焦 | 通过 | 详情=工具调用 · 关联高亮 · 聚焦 k=1.50 · 坐标固定 |
| A06 | 关系 Inspector | 通过 | RELATED/CONTRASTS 标注「无向」、USES 标注「有向」 |
| A07 | 键盘与触屏 | 通过 | 清单按钮可聚焦并打开详情；节点与关系均 tabindex=0 |
| A08 | Tool Calling 入门 | 通过 | 三段职责 request→execute→return；一句话定义含「执行通常由外部应用或运行环境完成」 |
| A09 | Tool Calling 深入 | 通过 | JSON 请求 + 权限检查五项 + MCP/Skills/API 边界 |
| A10 | Tool Calling 实验 | 通过 | 参数效应=true；单步 index=2；播放中按钮=暂停；复位 index=0 |
| A11 | 实验隔离 | 通过 | 构建器配置不变 · 学习进度写入 · 执行记录未被写入 |
| A12 | 知识→Constructor | 通过 | mode=constructor · 模块数 0→0 · 「尚未装配」提示 |
| A13 | Constructor→知识 | 通过 | 知识页打开 · 返回后保持选中 document_reader |
| A14 | 正常 Run | 通过 | sample_acquired / B01 / 9 事件 / 执行图 9 节点 / 时间轴 9 条 / 报告 not_generated |
| A15 | Search 缺失/Disabled | 通过 | B02 · 调用事件 0 · 原因可读 |
| A16 | Search 未授权/Invalid | 通过 | B02 ·「尚未授予只读模拟权限」；非法值 999 →「不在允许范围内」 |
| A17 | Reader 缺失 | 通过 | B03 · 1 个 blocked 节点 · 样本等级 search_excerpt · 无成功读取 |
| A18 | summary / full_text | 通过 | summary: content=null / 证据 summary_chunk；full_text: 245 字符正文 |
| A19 | includeMetadata | 通过 | 关闭时响应不含 publishedAt/publisher，内部追踪仍保留 |
| A20 | searchScope / maxResults | 通过 | 候选 5 → 返回 3（截断）/ 全部 5 / campus 3 |
| A21 | 固定超时分支 | 通过 | B04 / SEARCH_TIMEOUT / error；关闭后回到 B01，模块未被写成 Invalid |
| A22 | 确定性 | 通过 | 两次运行 runId 与事件签名完全一致 |
| A23 | 配置快照隔离 | 通过 | 旧轨迹不变 · 快照保留 · 新运行分支 B03 |
| A24 | 事件 Inspector | 通过 | 字段完整 + 载荷以文本节点渲染（children=0）+ 输入/输出引用齐全 |
| A25 | 播放/暂停 | 通过 | 播放推进、暂停后指针不动、播放到末尾自动暂停 |
| A26 | 单步/Seek/速度 | 通过 | 首尾不越界 · Seek→4 · 0.5/1/2/4 均可用 · 结果不变 |
| A27 | 3D/2D 同步 | 通过 | 三维聚焦 document_reader = 二维高亮 = Inspector 事件；阻断步骤不亮成功态 |
| A28 | 存储恢复与损坏 | 通过 | 恢复 runId 一致、指针从 0 开始、不自动播放；坏 JSON 不白屏且不覆盖其它命名空间 |
| A29 | 无障碍/降级/回归 | 通过 | 无 WebGL + reduced-motion + 390px 下星图/知识页/执行台（2D）全部可用，控件可聚焦 |
| A30 | 纯静态构建 | 通过 | 工作区打开时外部资源 = 0 |

### 5.4 截图（F15–F22 为本轮新增）

| 帧 | 内容 | 关注点 |
|---|---|---|
| F15 | Atlas 全景 | 10 节点网络、三类线型可辨、留白充足、非随机粒子背景 |
| F16 | Atlas 搜索聚焦 | 目标节点突出、其余减弱、右侧摘要打开 |
| F17 | Tool Calling — Understand | 请求 → 执行 → 返回三段可读，当前段高亮 |
| F18 | Tool Calling — Inspect | 左三段 + 右 JSON/权限/事件字段双列，技术内容不压迫新手 |
| F19 | Execution 正常进行 | 执行图/三维核心/Inspector/时间轴同时定位到同一事件 |
| F20 | Reader 不可用分支 | 阻断节点为 blocked 色，检索成功仍在，无「已读全文」 |
| F21 | Replay 暂停 | 数据流冻结、事件详情仍可查看、播放按钮状态明确 |
| F22 | 窄屏 / 无 WebGL | 二维知识与执行路径完整，无横向溢出 |

其余：F01–F14 保持 M0.1/M0.2 基线，另含 1920×1080 / 1280×800 / 1024×768 / 390×844 四视口（横向溢出均为 0）。

### 5.5 未自动断言、需人工确认的项（如实标注）

- 真实 GPU 上的泛光与色调观感、真机（iOS/Android）触屏手感与帧率；
- 无头环境为 SwiftShader 软件渲染（本轮实测约 24–31 fps，26k 三角面 / 98 次绘制调用），**不代表真实设备性能**，不声明「稳定 60fps」；
- 真实读屏器（NVDA/VoiceOver）下的朗读顺序需人工复核（本轮只验证了焦点顺序与 aria 标签）。

## 6. 回归结果

- **M0.1**：T01–T13 全通过——开场五镜头、随时跳过、首访标记、缩放/极角边界、选中一致性、重置视角、无假按钮、无横向溢出、减少动态、二维兜底、零外部请求、重播不叠场景、二维↔三维可达。
- **M0.2**：A01–A23 全通过——初始系统、点击预览、确认装配、两模块共存、重复添加定位、缺授权、完成配置、字段非法拒绝、禁用/启用、移除释放、合法/非法拖拽、Esc 取消、拖拽暂停自转、3D/2D 切换与二维内编辑、快速操作、刷新恢复、损坏数据、重置边界、键盘等价、减少动态、WebGL 兜底。
- **导航语义变化**：`知识星图` 与 `执行台` 由「未开放」变为真实入口，未开放入口由 3 个减为 2 个（引导叙事 / 实验空间），T07 断言已同步更新并额外断言两个新入口存在。
- **修复的 M0.2 遗留缺陷（影响本轮移动端验收，已回归）**：
  1. ≤767px 时 shell 仍按 `232px + 1fr + 0` 排布，舞台被挤成约 106px 窄条（F22 与 `VP-390x844-mobile` 实测）——属性选择器特异性覆盖了单列规则，已在 `layout.css` 的同级媒体查询中修正；
  2. `.workspace` 的隐式 `auto` 列会被最宽子元素撑开，窄屏下头部与信息条溢出被裁切——已显式声明 `grid-template-columns: minmax(0, 1fr)`；
  3. 执行台中心列 `min-height` 把说明与阶段条挤出可视区、知识页 INSPECT 深入内容落在折叠线以下——均已调整布局。
  修复后 390×844 下基础控制台与三个工作区都完整可用，四视口横向溢出均为 0。
- **GitHub Pages 子路径**：产物使用相对路径、无前端路由，刷新不 404；`index.html` 单文件版可直接 `file://` 打开。
- **纯前端约束**：无业务后端、无 API Routes、无云数据库、无真实 LLM / MCP / 爬虫、无 API Key；`tools/dev.mjs` 仅本地静态文件服务，生产不需要。

## 7. 限制与风险

1. **M0.3 只是教学模拟**：所有「检索 / 读取 / 事件」都来自随页面打包的本地虚构语料与本地纯函数，不发起任何网络请求，不代表真实模型或真实工具执行。
2. **没有正式研究与报告**：outcome 最高只到 `sample_acquired`（样本片段已取得），`report.status` 恒为 `not_generated`；资料真实性核验、冲突判断、引用溯源留给 M0.4。
3. **B05（检索无结果）在界面上不可达**：当前语料两个范围都非空，因此该分支只在引擎与单元测试中覆盖；若后续语料变化会自动生效。
4. **工作区占用整个舞台**：打开 Atlas / 知识页 / 执行台时左侧导航与右侧结构检视会让位（工作区自带导航与检视）。这是为避免三列被挤成一条缝而在本轮确定的信息架构。
5. **回放为固定节奏**：1× 时每个事件约 1.1 秒，速度只影响展示；没有逐事件自定义时长。
6. **性能**：三维核心 + 执行台面板在软件渲染下约 24–31 fps；低功耗档会降低像素比与泛光强度。未做 LOD。
7. **无头环境限制**：`Page.captureScreenshot` 期间 `requestAnimationFrame` 会被显著节流（实测 1.8 秒 4 帧），因此回放调度改为执行台自持定时器；该方案在真实浏览器中同样更稳，但截图时的播放推进速度受该环境影响。

## 8. 阶段交接（给 M0.4）

已完成并可直接复用的接口：

- **资料标识**：`sourceId`（`NTC-1001`…）与 `chunkId`（`NTC-1001#summary` / `#body-1`…）已贯穿事件（`sourceIds` / `chunkIds`）与 `artifacts.evidence`，可直接用于引用反查。
- **预留字段**：语料每条都有 `supersedes / supersededBy / citation / validity`，本阶段恒为 `null` / `'unverified'`，M0.4 只需填充数据与规则，不必改阅读路径。
- **事件模型**：`SIMULATION_SCHEMA_VERSION = 1`；新增事件类型只需扩展 `events/schema.js` 的 `EVENT_TYPES` 与 `EVENT_TYPE_META`，序列化、校验、Inspector、执行图会自动支持（`isEventShapeValid` 会拒绝未知类型，需同步升版本）。
- **分支规则**：`rules/branches.js` 是纯数据 + 纯函数，新增冲突/更正分支只需加分支定义与判定，不动 UI。
- **报告占位**：`run.artifacts.report = { status: 'not_generated', note }`；M0.4 可改为 `{ status: 'draft', sections: [...] }` 并复用同一套事件与证据数据。
- **回放与持久化**：`createReplay` 只依赖事件数组；历史记录封装已带 `schemaVersion`，M0.4 提升版本时按现有降级策略处理旧记录即可。

## 9. 已知未做（严格保留为非目标）

研究报告与导出、10/18 与 10/20 来源冲突核验与 `supersedes` 推理、引用回查到报告句子、证据评分、Workflow vs Agent 完整 A/B、全自动规划与重试策略、权限审批流、提示注入对抗、其余 26+ 术语节点与六个独立实验室、自由节点连线编辑器、任何后端或真实 AI 接入。
