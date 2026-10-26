# AGENT / ZERO · M2.3 开发与验收交付

日期：2026-10-26（Asia/Shanghai）  
结论：**M2.3 A01–A40 全部 PASS；必要前序回归通过，M2 · Agent Laboratory 正式结束。**

本结论限于下列真实执行的本地测试环境和证据。生产仍为纯静态前端，没有调用真实 AI、Embedding、搜索、MCP Server 或业务后台。未提交、推送或部署。

## 1. 完成的实验闭环

从装配台「A/B COMPARISON · 对比实验」、工作区导航「A/B 对比」，或 `#/compare` 进入。

1. **BUILD**：两侧选择已有具名配置，或使用当前装配配置；复制 A 为 B。
2. **REBUILD**：点击「复制并到装配台编辑」，沿用现有 Constructor 的全部表单、权限、装配、校验和保存机制。确认替换未保存草稿后才设置回流标记；取消不会覆盖任一侧。
3. **RUN**：同一任务/资料版本/场景/seed/审批脚本/角色模式/引擎版本，分别 Preflight，调用同一个 `createRuntime`。一侧预检失败时该侧 Run 为 null，对应运行指标为 N/A。
4. **INSPECT**：查看真实事件、输入/输出、分支原因、角色、工具、审批和原始来源。点击系统图模块会清除旧事件选中，Inspector 正确切到模块快照。
5. **COMPARE**：独立滚动双栏轨迹、Difference View、17 项可解释观察指标、双侧报告；相同配置和仅 ID 不同的复制配置不会制造语义差异。
6. **ARCHIVE / EXPORT**：保存、打开、重命名、复制、确认删除、原条件新实验重跑；浏览器真正下载 Markdown。

打开历史实验会同步其快照、标题和共同条件到可编辑实验上下文。编辑后下一次运行生成新的实验和 Run，旧档案不变。

## 2. 真实仓库审计与复用

要求阅读的文档实际位于 `docs/`；PRD 实际文件名为 `PRD .md`。已阅读 PRD、设计系统、M0.1–M0.4、M1.1–M1.4、M2.1、M2.2、M2.3 任务书。仓库存在大量前序未提交工作，本轮保留它们，在当前目录增量开发，没有重置或搬走基线。

| 领域 | 实际接口与版本 | 本轮处理 |
| --- | --- | --- |
| 配置 | `AgentConfiguration` schema v2；`serializeAgentConfiguration`、`cloneConfiguration`、store、模块注册表 | 原样复用；只补具名快照只读获取和复制快照进入现有编辑器的入口 |
| Preflight | 统一 `preflight`；共享字段、依赖、权限与 Retrieval 校验 | 每侧独立计算，不用 UI 布尔值代替 |
| Runtime | `createRuntime` / `restoreRuntime` / `semanticTrace`；Run schema v3；九场景、commands、审批、重试、步数限制 | 所有配对调用同一引擎；仅修复更正状态映射并保留版本兼容 |
| Evidence | M0.4 `evaluateEvidence`，由 M2.2 Evidence Check 产出 claims/conflicts/resolutions | 使用已保存的证据事件，不在比较层再次运行证据规则 |
| Research Report | M0.4 `generateReport`、`createReportView`、已有 Markdown 下载函数 | 新增只读 Run→Report 适配；复用完整报告阅读器和 Citation 结构 |
| 3D / 2D | `bay.sync`、`setExecutionFocus`；现有 `SystemGraph` | 单一真实核心停靠；配置快照投影只读，不写 Constructor |
| Knowledge | M1 同源 conceptId 和统一知识详情 | 返回实验时保留实验、侧、事件和合理滚动位置 |
| 历史 | Runtime `agent-zero:runtime:v1` 最近 5 条；其他业务独立命名空间 | 实验档案独立拥有 Run 副本，不依赖最近历史淘汰策略 |

基线实测：398/398 单测通过，类型检查、语法检查、静态生产构建通过。

### 发现并修复的问题

- M2.2 将证据状态 `revision_confirmed` 错按 `confirmed` 判断，使有效更正仍被归类为冲突。新运行升级为 **m22.2**；原 **m22.1** 仍由同一引擎以版本兼容标记复原原始判断，不改写历史。专项测试覆盖有效更正、只收集证据和旧历史恢复。
- Runtime 的紧凑结论未接入既有完整报告。现从已保存的读取响应和证据检查事件派生报告，不增加另一个模拟器。
- 独立审查发现：报告状态降级后的统计缓存、损坏时间字段隔离、取消编辑回流、历史 REBUILD 上下文。均补回归并修复。
- 浏览器实测补修：系统图选中被旧事件覆盖；切换轨迹视图遗留回放定时器。失败记录保留在 `verify/m23-replay-red.txt` 等日志，最终浏览器回归全绿。
- M1.4 回归原断言固定导航为 5 个；新增 A/B 后为 6 个。改为核对必要导航项，复跑通过，没有放宽功能标准。

## 3. 数据模型、公平性和复现

实验 schema v1，比较算法 `m23.1`。每个 Experiment 保存名称、ID、时间、A/B v2 配置快照、独立 Run、Report、逐侧审批输入、共同控制条件、比较缓存和事件对齐结果。

控制条件包括 `taskId`、`datasetId`、`datasetVersion`、`missionVersion`、`scenarioId`、`seed`、`approvalPolicyId`、`collaboration`、`engineVersion`。当前只有一份既有研究任务和资料包，不新增任务或暗换数据。

- 配置和 Run 递归冻结并隔离复制，编辑、动画、Seek、倍速不会修改历史。
- 每侧审批脚本分别派发 `approve` / `reject`，记录请求 Event ID、Step ID、Tool ID、决策和脚本。没有跨侧隐式复用授权。
- 数据版本、任务、seed、场景、角色或引擎不一致时不作严格比较；审批缺失不得声称公平。
- 历史重跑使用存档的控制条件和快照，产生新 Experiment/Run ID，不覆盖原记录。
- 当前资料或引擎版本不可用时，仍能浏览已保存摘要/片段，但禁止静默以新版本精确重跑。
- 档案写入/读取会校验配置与 Run、控制条件、审批输入、事件结构；当前算法缓存需与已保存事件重算结果一致。未知版本/坏记录保留并隔离，不清空正常记录。
- 首个比较 schema 没有更早的比较档案需要迁移；未来版本采取拒绝覆盖并保留原数据的策略。既有 Constructor 和 Runtime 历史使用原有兼容路径。

## 4. 指标与引用口径

| 观察项 | 实际算法 / 来源 |
| --- | --- |
| 状态、终止 | RunRecord 终态和终止事件；允许 completed 控制流程同时明确标注 insufficient_evidence |
| 步骤 | `step.started` 数，不含回放帧或按钮点击 |
| 工具调用 | `tool.call` 总数及按 toolId 分组数；实际重试调用另计 |
| 失败、重试 | `tool.error` / `tool.retry`；拒绝不计工具失败 |
| 审批 | `permission.requested` / `approved` / `denied` |
| 分支 | 实际 `runtime.decision` 中不同 branchId；未走备用路径不计入 |
| 配置开销 | 冻结快照中启用模块的数量 |
| 证据支持 | 有 supported 状态且全部引用有效的发现 / 全部需要证据的发现，包含缺引用项 |
| 引用有效性 | 能定位到该 Run 中真实文档工具返回的 sourceId/chunkId/eventId，且文本及 anchor 匹配的条目 / 所有引用 |
| 冲突、更正 | 最后一次 Evidence Check 的 conflict 组数及 `revision_confirmed` 数 |
| 最终结论 | 对应 RunResult 的有限结论，附原始终止原因和局限 |

每项包含 metricId、定义、统计口径、双方值、可比较状态、数值差及源事件 ID。没有“B 更优”标签；没有实际 Token、API 费用、准确率、网络延迟或提升百分比。

轨迹使用动作/事件类型/工具/角色/稳定来源键做顺序对齐，保留重复和未匹配事件，不以数组下标或墙钟时间认定等价。

引用链：**报告发现 → Citation → 本次实际可见原文/摘要片段 → 读取事件 → 对应模块/证据检查**。失效引用明确提示，不替换成当前资料；更正继续沿用 M0.4 的正文、supersedes、发布主体和时间关系规则。

## 5. 本地档案与隔离

IndexedDB：`agent-zero:experiments:v1`，object store `experiments`。

- 最多 **12 条**；总计 **20 MiB**；单条 **3 MiB**。容量不足显示清理/导出提示，不自动淘汰。
- 事务写入失败保留原记录；当前实验可继续在会话内查看和导出。
- 每条档案包含两侧运行和引用片段的独立副本。复制可以共享语义 Run ID，但没有跨业务删除引用。
- 删除有确认和影响范围说明，只删除选中的 Experiment；不修改最近 Runtime 历史、Constructor、Journal、学习进度、旧 M0 报告或 Memory Lab。
- IndexedDB 不可用时明确说明无法持久化；保留会话与 Markdown 下载，不无限写入 localStorage。
- 本阶段不实现可选 JSON 导入、公开分享、云同步。

## 6. 修改文件清单（仅本轮）

| 文件 | 作用 |
| --- | --- |
| `src/features/comparison/model/experiment.js` | 实验快照、配对运行、审批脚本、复制/重跑、配置差异、复现判定 |
| `src/features/comparison/model/metrics.js` | 真实事件/证据指标与严格比较限制 |
| `src/features/comparison/model/trace.js` | 结构化事件键与顺序对齐 |
| `src/features/comparison/model/report.js` | M2.2 Run→M0.4 Report 只读适配、真实引用解析与统计同步 |
| `src/features/comparison/model/projection.js` | 既有 SystemGraph 的只读快照适配 |
| `src/features/comparison/model/types.d.ts` | 比较条件、会话和工作区契约，引用原 AgentConfiguration |
| `src/features/comparison/state/archive.js` | 有界 IndexedDB、验证、损坏隔离、重命名及范围删除 |
| `src/features/comparison/export/markdown.js` | 浏览器对比报告序列化与真实下载 |
| `src/features/comparison/components/comparisonWorkspace.js` | 配置/轨迹/报告/档案工作区、Inspector、回放、知识返回 |
| `src/styles/zz-comparison.css` | 沿用 AZ-DESIGN、双栏/纵向布局、焦点和减少动态 |
| `src/app.js` | A/B 入口、深链、知识返回、编辑回流、同一核心停靠和快照同步 |
| `src/features/constructor/state/store.js` | 只读获取具名配置、复制快照进入现有编辑器 |
| `src/features/constructor/views/systemView.js` | 新增只读投影模式，保留原编辑模式 |
| `src/features/reports/components/reportView.js` | Runtime 报告读取实际可见元数据，不从完整资料偷补 |
| `src/scenes/core/modules3d.js` | 比较回放暂停时冻结执行脉冲 |
| `src/simulation/engine/runtime.js` | m22.2 版本和 m22.1 原语义恢复兼容 |
| `src/simulation/engine/runtimeRules.js` | 使用 M0.4 的正式更正状态常量 |
| `src/simulation/engine/runtimeTypes.d.ts` | 引擎兼容版本参数 |
| `tests/m23-comparison.test.mjs` | 配对、公平性、版本、指标、证据、对齐、重跑、旧引擎兼容 |
| `tests/m23-archive.test.mjs` | 档案CRUD、容量、损坏隔离、篡改拒绝与Markdown |
| `tools/m23-acceptance.mjs` | 隔离 Chrome、静态子路径、23项真实交互/下载/降级验收 |
| `tools/m23-evidence.mjs` | 最终CLI运行、退出码、构建hash、40项证据索引 |
| `tools/m14-acceptance.mjs` | 导航由硬编码数量改为必要项语义回归 |
| `tsconfig.runtime.json` | 将全部比较目录纳入真实类型检查 |
| `package.json` / `package-lock.json` | 阶段名称及 accept:m23 脚本；没有新增依赖 |
| `README.md` | 使用路径、存储限制与验证方式 |
| `docs/M2.3_PLAN.md` / 本文 | 审计、实施记录、验收与交接 |
| `index.html`、`dist/` | 构建生成的本地演示和标准静态产物 |

## 7. 最终测试与可复查证据

环境：Windows、PowerShell 7、Node 原生测试、TypeScript 5.9.3、隔离 Chrome 无头浏览器及 SwiftShader。Chrome 在受限环境中最初因 Crashpad 管道失败退出，随后通过授权的隔离浏览器测试执行；不访问用户日常浏览器配置。

最终运行 `node tools/m23-evidence.mjs`，以下命令均真实执行且 exit 0。它们与 npm 对应脚本执行同一工具：

| 验证 | 最终结果 | 证据 |
| --- | --- | --- |
| `npm test` / `node --test` | **419/419 PASS**，无跳过、失败或取消；比基线增加21项 | `verify/m23/tests.txt` |
| `npm run typecheck` | **PASS**，新增比较目录与 Runtime 均纳入；不宣称旧JS全仓严格迁移 | `verify/m23/typecheck.txt` |
| `npm run check` | **126/126** JS语法通过；6章/36概念/49关系，知识契约0问题；示例预检通过 | `verify/m23/check.txt` |
| `npm run build` | **PASS**，静态 dist 与内联演示产物 | `verify/m23/build.txt` |
| `node tools/m23-acceptance.mjs` | **23/23 PASS** | `verify/m23/results.json`、`verify/m23/acceptance.json` |
| M0–M2.1关键浏览器回归 | **最终合并 258/258 PASS** | `verify/m23/regression-final.json` |
| M2.2浏览器回归 | **33/33 PASS** | `verify/m22/browser-report.json` |
| A01–A40证据矩阵 | **40/40 PASS** | `verify/m23/matrix.json` |
| 生产产物SHA-256与CLI退出码 | 已记录 | `verify/m23/cli.json` |

前序实际运行：`node tools/m21-acceptance.mjs --regression --report=verify/m23-regression-report.json` 首次 **257/258**，唯一失败为旧 M1.4 导航数量断言。修正后执行 `--regression --stage=m14 --report=verify/m23-m14-recheck.json`，**89/89**（M2.1 41项 + M1.4 48项）；证据汇总只替换有真实复测结果的条目，保留初轮失败报告。M2.2 在引擎状态映射兼容修复后也重新执行。

| 前序领域 | 关键浏览器回归 |
| --- | --- |
| M0.1 / M0.2 | M2.1的41项包含五镜头/Skip/同核心/鼠标旋转/缩放限幅、装配/拖拽/Inspector/权限/存储；全部PASS |
| M0.3 Atlas / Replay | 33/33 PASS |
| M0.4 Report / Evidence / Citation | 44/44 PASS |
| M1.1知识架构 | 27/27 PASS |
| M1.2前三章/三个实验 | 29/29 PASS |
| M1.3后三章/三个实验 | 36/36 PASS |
| M1.4 Story / Atlas / Journal / 学习状态 | 最终48/48 PASS |
| M2.1装配、配置、Preflight及兼容 | 41/41 PASS |
| M2.2状态机、九场景、审批、历史、深链 | 33/33 PASS |

浏览器实际请求只涉及本地静态站点资源；核心模拟无外部业务请求。静态测试使用 `/agent-zero/` 子路径与深链刷新。浏览器真实下载的 `.md` 位于 `verify/m23/downloads/`，已读取文件核对模拟声明、实际指标、来源和事件信息。

## 8. A01–A40 逐项验收

U = `verify/m23/tests.txt`（含具名M23单测）；B = `verify/m23/results.json`；R = `verify/m23/regression-final.json`。完整机器索引见 `verify/m23/matrix.json`。

| ID | 状态 | 可复查证据 |
| --- | --- | --- |
| A01 仓库审计 | PASS | 本文§2、M2.3_PLAN、398项基线日志 |
| A02 单一运行引擎 | PASS | U 同一createRuntime；双方Run独立；源码experiment.js |
| A03 单一配置模型 | PASS | 复用v2配置与Preflight；types引用原契约；U |
| A04 双配置选择 | PASS | B A04/A05、A04-edit、A04-cancel；沿用Constructor |
| A05 配置差异 | PASS | U 字段/模块/权限差异，复制身份不制造差异；B |
| A06 预检隔离 | PASS | U 一侧maxSteps非法，Run=null，另一侧可观察 |
| A07 配对控制 | PASS | B A07/A10/A15；U 条件一致与不一致限制 |
| A08 审批可解释 | PASS | U approve-all/reject-all、逐侧请求序列、档案篡改拒绝 |
| A09 快照不可变 | PASS | U 冻结写入拒绝；B A09/A34/A35 |
| A10 独立Run | PASS | U/B 不同Run ID，各自事件引用 |
| A11 语义复现 | PASS | U semanticTrace、相同及克隆配置、原条件重跑 |
| A12 数据版本识别 | PASS | U dataset/seed不一致，旧版本摘要可读且拒绝精确重跑 |
| A13 终态支持 | PASS | U 九场景、取消、步数/重试/权限/证据不足终止 |
| A14 未运行N/A | PASS | U 预检阻塞侧指标null和unavailable |
| A15 步骤正确 | PASS | U 九场景逐项核对step.started数量 |
| A16 工具指标 | PASS | U 逐工具tool.call总数及类型分组 |
| A17 失败与重试 | PASS | U tool.error/tool.retry及终止；M2.2回归 |
| A18 权限指标 | PASS | U 审批请求/批准/拒绝与事件一致 |
| A19 证据覆盖 | PASS | U 支持状态/有效引用/全部发现分母；关闭元数据报告统计降级 |
| A20 冲突核验 | PASS | U 有效更正、COLLECT_ONLY、无链冲突；旧引擎分类兼容 |
| A21 不造假 | PASS | 17项观察口径审查；导出与UI无真实费用/准确率等指标 |
| A22 解释入口 | PASS | B A22/A26/A29 点击指标定位事件，指标定义与口径可见 |
| A23 双栏轨迹 | PASS | B 双栏与独立滚动列表；02截图 |
| A24 差异视图 | PASS | B A24/A25，增缺/分支真实显示；03截图 |
| A25 事件对齐 | PASS | U 不同来源插入保留未匹配；同配置对齐无假差异 |
| A26 Inspector | PASS | B 事件输入/输出/原因/来源及系统图选择 |
| A27 双栏报告 | PASS | B A27/A28、A27-full，复用完整Report组件 |
| A28 引用溯源 | PASS | U 有效/失效引用；B 原始片段→读取事件 |
| A29 3D/2D同步 | PASS | B A29-select-module及A29-toggle，Reader Ready/Disabled，编辑器不变 |
| A30 事件驱动视觉 | PASS | B 暂停/速度不改数据、切换视图停止旧回放；单一核心 |
| A31 知识联动 | PASS | B A31，统一知识详情往返保留实验/侧/事件 |
| A32 新实验档案 | PASS | B A32/A33、A32-refresh，真实IndexedDB刷新恢复 |
| A33 档案管理 | PASS | U CRUD、损坏/未知版本隔离、容量保护；B确认范围 |
| A34 历史隔离 | PASS | U 独立Run副本与范围删除；B其他命名空间不变 |
| A35 历史重跑 | PASS | U新Experiment/Run；B A35-rebuild及原条件重跑 |
| A36 Markdown | PASS | B真实下载、磁盘文件内容复查；U转义与来源/事件序列化 |
| A37 多端/无障碍 | PASS | B真实方向键/焦点、390宽无横溢出、reduced-motion、WebGL禁用 |
| A38 纯前端 | PASS | B真实静态子路径请求清单，源码/构建契约审查 |
| A39 测试与构建 | PASS | cli.json：tests/typecheck/check/build全部exit0 |
| A40 M2回归 | PASS | R最终258/258；M2.2 33/33；各领域具名日志 |

## 9. 截图和人工视觉复核

已用真实页面截图检查桌面信息层级、稳定A/B字母与实线/虚线标识、原AZ核心、双栏轨迹、报告和窄屏布局。截图只支持视觉判断；逻辑通过上述单测及交互验收证明。

- `verify/m23/01-config.png`
- `verify/m23/02-metrics-traces.png`
- `verify/m23/03-difference.png`
- `verify/m23/04-full-report.png`
- `verify/m23/05-archive.png`
- `verify/m23/06-mobile.png`
- `verify/m23/07-fallback.png`

## 10. 遗留问题与M3交接

**P0 / P1 阻断：无。** 独立审查与验收发现的本轮问题均已修复，没有以延期或降低标准换取通过。

非阻断边界和未执行扩展检查：

- **NOT RUN**：真实 iOS/Safari、Android 真机、不同实体GPU和长期大容量性能验证。当前多端证据是隔离Chrome视口、键盘、减少动态及强制WebGL失败，不声称真实设备均达到60fps。
- **P2 / M3.1建议**：在保持冻结视觉身份的基础上，进一步审视窄屏顶部操作密度、双栏长轨迹可读性、完整报告在小屏的阅读节奏；按真实设备测量决定优化。
- **P2 / 后续容量验证**：已有12条/20MiB限制和错误恢复测试；浏览器可因隐私模式、禁用存储或配额拒绝IndexedDB，UI提供会话保留和Markdown导出，不承诺跨设备或永久保存。
- **范围外**：可选JSON导入/公网分享、M3全站重构、正式发布和部署均未实施。

保留一个v2配置源、一个Runtime、既有证据/引用体系和同一个AZ-CORE。M3应从本交付的验收基线继续，先做真实设备视觉/可访问性与性能审查，不重复建设配置、模拟器或知识库。

**最终确认：用户可完成 BUILD → RUN → INSPECT → COMPARE → REBUILD；M2.3及M2阶段已满足本任务书完成定义。**
