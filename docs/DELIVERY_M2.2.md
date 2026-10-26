# AGENT / ZERO · M2.2 Runtime 交付与验收

日期：2026-10-26（Asia/Shanghai）。**M2.2 A01–A40：40 PASS / 0 FAIL / 0 BLOCKED / 0 NOT RUN。** 证据为本轮实际执行的测试、浏览器操作和构建；不是沿用前阶段交付报告的通过声明。

入口：根目录 `index.html` → 装配台加载 Starter / Evidence First → 配置预检 →「进入 Runtime 检查器」，或 `#/runtime`；旧执行台也保留进入入口。要观察正文级证据，可把 Document Reader 配置为全文并保留元数据。Starter 默认摘要读取会保留证据不足状态，不会自动变成研究成功。

## 1. 实际审计与最小修复

已完整读取实际文件 `docs/PRD .md`（文件名含空格）、DESIGN_SYSTEM、M0.1–M0.4、M1.1–M1.4、M2.1、M2.2 任务书。用户未提交的前阶段改动作为当前基线保留，没有重置或替换 checkout。

- M2.1 已有 v2 `AgentConfiguration`、11 个实例/10 类模块、统一 store、依赖/字段校验、预检、具名快照和本地持久化。实际基线单测 **371/371**，日志 `verify/m22/baseline-tests.log`。
- 发现 `preflight` 对 `modules/connections/settings` 容器检查不完整，`connections={}` 仍可被标为 ready；已补充结构错误和坏 modules 的安全派生，保留原始配置，不做静默清洗。
- ready 只表示配置预检通过，不是逐次权限凭证。无 Guardrails 的旧工具实验可继续按原约定工作；**新 Runtime 对无规则的公开/私有读取都默认拒绝**。
- 原 M0 执行台是一次性生成轨迹再回放，M1 Runtime Lab 是独立教学示例，均不能直接假称已具备暂停实际调度或等待审批。
- 复用现有事件工厂、序列化、Search/Reader、MISSION 001、证据抽取/冲突/更正规则、Knowledge Lab 检索/切分、Reliability 输入/输出护栏及统一知识 ID。
- 旧 `agent-zero:execution:v1`、`agent-zero:research:v2` 的格式和原入口保留；没有用新规则重算历史报告。

独立审阅发现的 Retrieval 权限/全文输出/元数据/预算泄露已按 RED→GREEN 修复。另以测试复现并修复事件输出持有可变 Context 引用的问题，后续步骤不会改写事件前缀。复审未发现遗留 P0/P1。

## 2. Runtime 架构与数据契约

`createRuntime(AgentConfiguration, {scenarioId, seed, collaboration})` 位于 `src/simulation/engine/runtime.js`，属于原 simulation 分层的增量调度能力。没有第二个模块注册表、工具实现、知识库或配置 store。启动时调用 M2.1 `prepareSimulationInput` 并冻结深拷贝。

状态由引擎管理：`idle → ready → running → paused / waiting_approval / completed / failed / cancelled`。只有 ready 可启动；paused 可继续；审批只能处理当前待审批动作；终态拒绝继续执行。非法控制返回 false，不产生虚假事件或历史命令。

- 每次 Step 最多调度一个 action；连续运行的定时器只调用同一个 Step。
- Workflow 按固定步骤和前置条件推进，不能跳过证据检查。
- 单流程 Agent Loop 根据已搜索/已读取/证据状态、可用能力与预算选择动作；资料不足或冲突时可追加一次研究。无新动作或到达预算就停止。
- 顺序角色流程限定 Researcher 读取、Verifier 检查、Synthesizer 整理。Verifier 没有研究工具权限，因此不会借动态循环越权补资料。
- Role handoff 带 from/to、原因和 `roleArtifacts.*` 引用；产物是已收集片段、核验清单、综合结果或证据不足回执。

运行记录 `schemaVersion:3`，配置版本另存为 `configSchemaVersion:2`，包含 configId/不可变配置、任务/语料版本、scenarioId、seed、options、status、逻辑 startedAt/finishedAt、events、steps、commands、roleArtifacts、result 和由 events 计算的 summary。`engineVersion:m22.1` 用于恢复兼容性检查。

事件通过原 `createEvent` 扩展，旧事件调用不变。新事件具有唯一 id/eventId、runId、单调 sequence、确定性逻辑 timestamp、stepId、moduleInstanceId、roleId、输入输出摘要与安全载荷、reason、sourceIds、errorCode、ruleId/branchId。步骤显示下一动作或终止原因；备选分支明确标为未执行，没有备选运行结果。

`summarizeRuntime(events)` 是步骤数、工具调用/错误/重试、权限检查/请求/批准/拒绝、真实分支、证据状态及终止摘要的唯一计算入口。历史加载会用确切快照重新核对控制命令与完整记录，轨迹/摘要不一致的条目不会显示为有效。

## 3. 配置消费清单

| 配置来源 | 实际消费点 / 效果 |
|---|---|
| 根 settings.executionMode | decision() 选择固定流程或允许追加研究的状态决策 |
| maxSteps / maxRetries | 调度前预算检查；仅 SEARCH_TIMEOUT 可恢复；累计重试不能超限 |
| stopWhenInsufficient | 无允许的恢复动作后，证据不足直接 FINALIZE，不产生综合步骤；false 允许有限报告 |
| requireApprovalForRestrictedActions | 受限动作进入 waiting_approval；配置未开启则拒绝，不自动放行 |
| model.preset | careful 使用更正核验策略；concise 限制摘录数量；balanced 保留收集策略 |
| model.answerStyle / contextBudget | brief 限制摘录；explanatory 加入原因；预算与 Context 预算取较小值 |
| model.deterministic | PLAN 明确显示 requested/effective；**当前始终确定性，关闭后的随机行为 not_consumed_yet** |
| instructions.objective/systemInstructions/constraints | 任务与可信 Context 输入、字符预算分配、结果目标；文本不作为脚本或任意自然语言程序执行 |
| instructions.outputFormat | 生成真实 evidence-table / outline / brief 结构化 presentation |
| context.background/mode/includeTaskBrief/budget | 任务/背景接纳与遗漏、task-only 排除证据片段、字符预算；不是 Token 计数 |
| context.sourceIds | 用户明确选择的本地候选来源，读取仍须工具权限；与本次搜索返回条目区分 |
| context.includeRetrieval | 决定检索片段是否进入预算内上下文、是否用候选集合约束后续搜索 |
| tools.enabled/permissions.read | 每次派发前检查；禁用/无权不产生成功读取 |
| searchScope/maxResults | 原 Search 工具实际过滤/截断结果 |
| readMode/includeMetadata | 原 Reader 仅返回摘要/正文及允许的元数据；预算外片段不进入证据 |
| connectionMode/resourceScope | direct/mcp 路径检查、公开/私有权限和单次审批；没有真实私有记录或远程连接 |
| mcp.profileId/capabilityIds | 静态档案、工具能力目录和启用状态检查；Resources/Prompts 的执行 **not_consumed_yet** |
| retrieval.mode/topK/chunkPreset/chunkSize/questionId/sourceIds | 直接复用 Knowledge Lab 算法，改变候选、切分和后续资料范围；向量模式仍是人工二维演示 |
| retrieval.includeMetadata | 运行可见输出按白名单提供元数据；不再输出完整切分库；Context 只接纳预算内候选片段 |
| skills.skillIds | 公告核验方法提供方法检查项及更正核验策略；不授予工具或权限 |
| memory.mode/entryIds | session 模式只复用明确选择的偏好；evidence-first 偏好影响输出顺序；不读取 Journal |
| guardrails 四个本地布尔字段 | 逐次公开/私有读检查；不可信输入检查；输出证据检查。关闭护栏也不能把数据变成可执行指令 |
| modules.instanceId/order、configId/name、版本/时间 | 实例追踪、配置/历史身份与兼容校验；不是性能参数 |
| connections | 复用 M2.1 的语义/启用校验；任意连接编排 **not_consumed_yet**，不把结构连线伪装成实际执行 |

种子是复现标识。当前规则没有概率故障；不同种子不承诺改变结果。相同快照、任务版本、场景、种子和审批选择/控制命令可重建一致记录。`semanticTrace` 对比会规范化 run/event 身份并排除 UI 控制日志/逻辑序号差异，用于证明 Step/Run 的执行语义一致。

## 4. 九种场景与权限/恢复结果

以下为 **Starter + Reader 全文/元数据 + 单流程** 下的规则，参数改变可导致更早的阻断。场景选择不是成功承诺。

| 场景 | 触发条件与真实结果 | 实测 |
|---|---|---|
| NORMAL_PATH | 使用 NTC-1001，本地工具正常；可见正文及来源元数据支持有限摘录 | PASS |
| MISSING_EVIDENCE | 第一次搜索隐藏关键资料；Workflow 结束为证据不足，Agent Loop 追加搜索后再读/检查 | PASS |
| TOOL_FAILURE_ONCE | 第一次实际搜索确定性超时；maxRetries=0 停止，≥1 恢复一次 | PASS |
| TOOL_FAILURE_EXHAUSTED | 每次搜索都超时；仅在可恢复错误和预算内重试，耗尽失败，无假结果 | PASS |
| CONFLICTING_SOURCES | NTC-1008/1009 日期矛盾，没有可信更正链；保留双方与未决 | PASS |
| PERMISSION_REQUIRED | 搜索前场景要求单次模拟审批；批准仅执行待审批动作，拒绝不调用工具 | PASS |
| PERMISSION_DENIED | 场景拒绝搜索；拒绝事件后终止，不重试权限拒绝 | PASS |
| STEP_LIMIT_REACHED | 明确要求持续复核尚未确认项，逐步消耗配置预算，达到上限即终止 | PASS |
| UNTRUSTED_INSTRUCTION | 复用 NTC-X01 教学注入样本；展示企图和护栏判定，不改配置、不执行外发/私有读取 | PASS |

步数定义：TASK_INTAKE、PLAN、RETRIEVE、每次搜索/读取/重试、证据检查、注入检查、每次角色交接、综合、FINALIZE/复核均各算一个 action。permission.check、审批回复、暂停/继续、终止记录属于步骤内/控制事件，不另造隐藏 action。等待审批的工具步骤在请求时已计数；批准只完成该步骤。不会通过拆角色绕开 maxSteps。

当前重试预算是本次运行累计恢复次数。输入错误、未知权限、拒绝等均不属于可恢复错误。工具失败是本次运行事件，不会把构建器模块写为 Invalid。

## 5. 检查器、历史和可复现交接

- UI 有逐步、连续、暂停、继续、取消、新运行、同快照重跑、仅复位视图、JSON 导出、时间线、输入输出、错误、分支与摘要。
- 审批说明动作、原因、权限与范围，明确只影响本地模拟；窄屏和键盘可完成批准/拒绝，回复后焦点返回可操作控件。
- 新配置只影响新 Run。重新运行创建新 runId，旧 Run 保留；加载历史不依赖实时具名配置仍存在。
- `agent-zero:runtime:v1` 最多保留 5 条有效记录，约 2.4M 字符上限。损坏条目隔离保留，不静默清空正常记录；整集合 JSON 损坏时锁定写入，只有明确确认才移除。
- 页面刷新/离开工作区后不自动继续。running 恢复为 paused，waiting_approval 保持等待。恢复必须通过版本和完整轨迹一致性校验。
- 与 constructor:v2、learning:v2、journal:v1、research:v2、legacy execution:v1 隔离。单条删除不清理其他命名空间。
- JSON 包含运行格式、版本和不可变快照，供 M2.3 消费；没有完整实验比较、排行榜、云端档案或运行分叉系统。

## 6. A01–A40 逐项结果

机器可读证据：`verify/m22/acceptance.json`，生成器 `node tools/m22-evidence.mjs` 会先核对真实日志和每阶段结果。

| ID | 状态 | 实际证据 |
|---|---|---|
| A01 审计 | PASS | M2.2_PLAN、baseline-tests.log、容器缺口 RED→GREEN |
| A02 配置来源 | PASS | m22-runtime A02/A03；browser A02-A06 |
| A03 快照 | PASS | 单测冻结/现场修改隔离；browser A03 |
| A04 状态机 | PASS | 单测 A04/A06、终态拒绝非法控制 |
| A05 事件 | PASS | 唯一 ID/单调序号/字段检查；append-only 测试 |
| A06 预检 | PASS | 错误配置及坏容器不能启动 |
| A07 Workflow | PASS | 固定前置条件；MISSING_EVIDENCE 路径断言 |
| A08 Agent Loop | PASS | 基于证据追加研究及显式停止 |
| A09 模式差异 | PASS | 同资料不同实际 actions；matrix |
| A10 步骤控制 | PASS | Step/Run semanticTrace；browser 连续到终态/复位 |
| A11 暂停/继续 | PASS | 保留预算/轨迹；浏览器刷新后暂停 |
| A12 取消 | PASS | 取消事件、无后续工具；browser A12-A13 |
| A13 重跑 | PASS | 新 runId、保留旧快照；browser A12-A13 |
| A14 场景 | PASS | 九场景单测及真实 UI 场景选择；72组合 |
| A15 分支 | PASS | 实际路径/具体原因/未执行备选分支 |
| A16 失败 | PASS | 超时事件无假成功；browser A14 |
| A17 重试 | PASS | maxRetries 0/1/3 和恢复上限 |
| A18 步数 | PASS | maxSteps 1/3/6、角色共用预算、矩阵逐状态断言 |
| A19 不足 | PASS | 摘要、缺 Reader/元数据、预算/task-only 与停止策略 |
| A20 冲突 | PASS | 真实冲突保留双方；单流程/三角色断言 |
| A21 权限 | PASS | 逐次工具/检索检查，未知/无规则默认拒绝 |
| A22 审批 | PASS | 等待阻断、批准单次动作、刷新/重跑重新检查 |
| A23 拒绝 | PASS | 拒绝无调用、无重试；browser A23 |
| A24 注入 | PASS | 护栏开/关都不执行资料指令、不修改配置 |
| A25 交接 | PASS | 三角色结构化产物/引用；runtime-roles.png |
| A26 角色边界 | PASS | Verifier 禁用研究工具；依赖缺失明示失败 |
| A27 检查器 | PASS | 浏览器选择步骤/事件/输入输出、审批及错误详情 |
| A28 摘要 | PASS | events reducer；坏摘要隔离；1,432 恢复状态点 |
| A29 复现 | PASS | 72 组合双跑与完整恢复，semanticTrace 一致 |
| A30 历史 | PASS | 最多5条、保存/恢复/重跑/单删；浏览器确认 |
| A31 隔离 | PASS | 五个旧命名空间逐值不变断言 |
| A32 损坏 | PASS | 独立损坏条目保留/移除、坏JSON锁定、配额错误保留 |
| A33 知识 | PASS | 浏览器统一概念页往返同一 runId |
| A34 可访问性 | PASS | 1920/1440/1280/1024/768/390 六视口、Enter、焦点、减少动态、窄屏审批 |
| A35 WebGL | PASS | 禁用 getContext(webgl) 后运行/检查器/审批可用 |
| A36 纯前端 | PASS | 全程浏览器请求记录无远程；静态构建与源码检查 |
| A37 视觉 | PASS | 同一核心对象；Boot/旋转/聚焦/拖拽回归；实际截图阅读 |
| A38 边界 | PASS | JSON 往返、秘密字段拒绝、非法取消输入拒绝 |
| A39 测试/构建 | PASS | 398单测、tsc、118语法文件/契约、生产构建与子路径 |
| A40 回归 | PASS | 最终有效258/258，首轮失败与定向复测均保留 |

## 7. 实际执行证据

环境：Windows、PowerShell 7、Node v24.16.0、TypeScript 5.9.3、本地无头 Chrome/SwiftShader，独立临时浏览器配置。

| 命令 | 结果 | 证据 |
|---|---|---|
| `npm test` | **398/398，0失败/跳过**，其中27个M2.2测试 | verify/m22/tests.log |
| `npm run typecheck` | PASS，`tsc -p tsconfig.runtime.json` | typecheck.log |
| `npm run check` | **118/118** 语法通过；6章/36概念/49关系零问题；两示例 ready | check.log |
| `npm run build` | PASS；静态dist + 单文件index.html，零CDN依赖 | build.log |
| `node tools/m22-matrix.mjs` | **72/72组合；1,432个精确恢复状态点**，前缀/摘要/预算通过 | matrix.json / matrix.log |
| `node tools/m22-acceptance.mjs` | **33/33** 浏览器检查 | browser-report.json / browser.log |
| `node tools/m21-acceptance.mjs --regression --report=verify/m22/regression-browser.json` | 首轮 **257/258**，新增全局导航破坏原五项数量；已移除该扩展 | regression-browser.json / .log |
| `node tools/m21-acceptance.mjs --regression --stage=m14 --report=verify/m22/regression-m14-final.json` | 最终 **89/89**，含 M2.1 41项与 M1.4 48项 | regression-m14-final.json / .log |
| `node tools/m22-evidence.mjs` | A01–A40 PASS；汇总有效回归 **258/258** | acceptance.json / regression-summary.json |

回归拆分：M0.1/M0.2/M2.1关键41/41；M0.3 33/33；M0.4 44/44；M1.1 27/27；M1.2 29/29；M1.3 36/36；M1.4 48/48。首轮还暴露旧浏览器脚本的固定等待/旧文档就绪竞争，已改为等待新执行上下文及真实目标工作区，未删除或放松功能断言。并行浏览器中间轮出现的2项时序失败经该修复后定向复测全过。

生产包：`dist/assets/app.css` 178.7 KB，`app.js` 1695.7 KB，`dist/index.html` 0.9 KB，根目录离线单文件1875.2 KB（构建脚本报告单位）。静态相对资源路径与 `/agent-zero/#/runtime` 深链已实际验证。

类型检查范围是**新增 Runtime、规则、场景、历史、检查器及 M2.1 JSDoc 类型关联**。没有把全仓原生 JS 语法检查冒充完整严格 TypeScript 迁移。

截图：`verify/m22/runtime-ready.png`、`runtime-approval.png`、`runtime-roles.png`、`runtime-mobile.png`、`runtime-mobile-approval.png`、`runtime-fallback.png`。已实际打开阅读；手机控制、审批和正文可滚动访问，保留 AZ 色板与同一核心。

## 8. 本轮修改文件

| 分组 | 文件与职责 |
|---|---|
| Runtime核心（新增） | src/simulation/engine/runtime.js、runtimeRules.js、runtimeScenarios.js、runtimeTypes.d.ts |
| 兼容/复用（修改） | src/simulation/events/schema.js（增量事件）；src/simulation/tools/announcementSearch.js（输入JSDoc）；src/features/constructor/model/preflight.js（坏容器校验） |
| 历史/界面（新增） | src/features/execution/state/runtimeHistory.js、components/runtimeWorkspace.js、src/styles/zz-runtime.css |
| 入口（修改） | src/app.js、constructor/components/preflightPanel.js、execution/components/executionWorkspace.js |
| 验证（新增） | tests/m22-runtime.test.mjs、m22-history.test.mjs；tools/m22-acceptance.mjs、m22-matrix.mjs、m22-evidence.mjs；tsconfig.runtime.json |
| 旧测试同步（修改） | tools/m14-acceptance.mjs（新文档/路由状态等待，保持原断言） |
| 工程/交付（修改/新增） | package.json、package-lock.json（TypeScript开发依赖和脚本）；README.md；docs/M2.2_PLAN.md；本交付报告 |
| 静态产物/证据 | 根index.html重新打包；dist/；verify/m22/ 日志、JSON与截图 |

## 9. 遗留与技术纪律

- **P0：无已知未解决项。P1：无已知未解决项。** 不阻碍后续M2.3消费当前结构化记录。
- **P2/明确边界：** 当前只有本地规则和虚构样例；不解析任意自然语言程序，护栏不构成生产安全认证；种子无概率行为，随机执行开关/任意连接编排/Resources与Prompts执行未消费，均已标明。
- **未运行的额外检查：** 移动真机、真实GPU性能基准、屏幕阅读器完整人工审查未执行，不声称这些已通过。A34/A35的PASS限定于本轮真实浏览器键盘、响应式、减少动态与WebGL模拟禁用测试。
- 没有开发M2.3完整对比系统；没有后端、真实AI/Embedding、远程MCP/搜索调用。安装TypeScript仅用于本地开发检查，不进入生产运行依赖。
- 没有提交、推送、部署、破坏性Git操作或清空用户已有数据。除用户另行明确要求的Codex自动审批配置（单独备份）外，产品改动仅在当前工作区。
