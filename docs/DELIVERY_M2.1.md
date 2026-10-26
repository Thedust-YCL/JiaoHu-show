# AGENT / ZERO — M2.1 交付与验收

执行日期：2026-10-25 至 2026-10-26（Asia/Shanghai）。本地 Windows / PowerShell 7 / Node.js / 独立临时 Chrome，3D 自动化使用 SwiftShader。

**结论：M2.1 完成，A01–A40 全部 PASS。最终 371/371 单元测试、258/258 浏览器检查、静态检查及生产构建通过；无剩余 P0/P1 阻断。**

## 审计与复用

需求文件实际位于 `docs/`，PRD 文件名为 `PRD .md`；已读取 PRD、DESIGN_SYSTEM 与 M0.1–M2.1 全部任务书。工作区原有 M1.4 的未提交成果全部保留。

基线实跑 346 项单元测试通过。复用原生 ES modules、Three.js 0.160.1、esbuild，以及原 constructor model/reducer/store、Library、Inspector、SystemGraph、端口装配与拖拽；保留 `announcement_search` / `document_reader`、SEARCH_PORT / READER_PORT 及旧工具参数、权限和研究快照。

实际缺口包括：仅有两工具、无具名配置和实例 ID、无跨模块规则/预检、旧解析丢未知项。实施中还复现并修复：旧版工具校验把新增字段误作必填、知识返回后地址未更新、窄屏 Inspector 开关被强制隐藏、SVG 核心轨道裁切、坏配置使预检崩溃、异常字段 HTML 注入与空模块重置遗漏根参数。独立审查指出的原型属性与 v1 坏记录分支均有失败→通过的测试证据。

## 配置契约与单一状态

- Schema v2：`configId/name/description?/createdAt/updatedAt/modules/connections/settings`；ISO UTC 时间。类型契约：`src/features/constructor/model/types.d.ts`。
- 实例：`instanceId/moduleId/moduleType/portId/enabled/order/settings/permissions`。延续 `settings`，对应任务书的模块 `config`；十类模块包含两个 Tools 安装项，共最多十一个正常实例。
- 当前 store 的根对象去掉 `ui` 后就是唯一可写配置。3D、2D、Inspector、目录、Preflight 均从它派生。草稿与具名快照使用独立拷贝，临时选中/预览/拖动不进入配置。
- Runtime 五个字段仅存根 `settings`；Runtime 与 Guardrails 的审批控件读写同一个值。Runtime 实例的 `settings` 为 `{}`。最低后续运行条件是启用 Model、Instructions、Runtime 并且没有 error；禁用 Runtime 保留参数并阻断预检。
- 默认依赖/工具接入边自动推导，不重复持久化；显式关系使用稳定实例引用和声明过的关系类型。禁用停用显式边、移除清理引用、复制重建配置/实例/连接 ID 并修复内部引用。2D 的显式边有效性也来自纯逻辑预检。
- 字段 schema 共用于默认值、控件与验证；数值范围、文本长度、多选项数、ID 引用、重复实例、缺依赖、上下文冲突、权限拒绝和审批均为纯逻辑。问题含稳定 ID、级别、标题、说明、模块/字段和建议，排序确定。
- 配置上限 240 KB；模块数组上限 32；普通数组上限 200、选择列表上限 20；最多 20 套具名配置，存储集合限制 1,800,000 字符。拒绝函数、运行时对象、循环引用、危险键和秘密字段。

M2.2 入口：`prepareSimulationInput(configuration)`，返回 `{ interfaceVersion: 1, simulationOnly: true, ready, configuration, preflight }`。相同配置得到相同预检；返回独立可序列化快照。有 error 时 `ready=false`。构建器 Run 进入预检。

原 M0/M1 工具实验使用 `legacySimulationProjection()`，只消费旧双工具契约；私有范围或公开读取被拒绝时，不放行旧读取权限。历史 Run 按原快照和原产物读取，不重写报告或引用；新增 Runtime 参数的完整执行留给 M2.2。

## 十类模块

| 类别 | 可操作字段与本地行为 | 依赖与关键规则 | M1 知识入口 |
|---|---|---|---|
| Model | balanced/careful/concise、回答风格、教学预算、确定性 | 基础模块；无真实模型/Key | llm、inference、context_window |
| Instructions | 研究目标、系统指令、输出格式、约束 | Model；必填/长度；资料不自动升为指令 | instructions、prompt、context_engineering |
| Context | 背景、模式、任务简介/检索证据、预算、资料 ID | Model；检索开关要求 Retrieval；预算不能超 Model；仅任务模式与检索冲突 | context_window、context_engineering、memory |
| Tools | 原 Search 范围/数量、Reader 模式/元数据、只读授权；新增直连/MCP、公开/私有范围 | 原两稳定 ID；权限、MCP 能力与审批预检；输入输出/失败说明可读 | tool_calling、tools、api |
| MCP | campus-announcements 本地档案、Tools/Resources/Prompts 静态能力 | Model；未知能力/MCP 未启用不能当作有效工具路径；无网络连接 | mcp、mcp_server、tool_calling |
| Retrieval | 方式、Top-K、切分预设/长度、问题、源 ID、元数据 | Context；无源/坏 ID 报错；预览直接复用 Knowledge Lab 的 chunkDocuments/retrieve | retrieval、rag、embedding、chunking |
| Skills | notice-verification 稳定 ID、公告核验方法说明 | Instructions；不自动增加工具或权限 | skills、workflow |
| Memory | disabled/session、显式选择本地偏好条目 | Context；不自动保存输入、不读取 Journal，不等同 RAG | memory、context_window |
| Runtime | workflow/agent-loop、步数 1–100、重试 0–5、证据不足停止、审批 | Model/Instructions；参数只在根保存；本轮只配置与预检 | agent、agent_loop、workflow、harness |
| Guardrails | 公开读取、私有记录默认拒绝、证据要求、不可信覆盖阻止、共享审批 | Model；权限/审批真实改变预检；关闭保护有警告 | permissions、sandbox、prompt_injection、guardrails |

两套示例均使用同一 schema，预检零 error、零 warning：Research Assistant — Starter；Research Assistant — Evidence First。示例体现取舍，不宣称性能排名。

## 配置管理与数据保护

`agent-zero:constructor:v2` 保存当前草稿、具名快照及隔离记录。v1 从原始 JSON 非破坏性迁移；原键不改不删，迁移后建立 v2 草稿，ID 跨刷新稳定。未知模块/字段保留并提示；启用未知模块阻断预检，禁用未知模块允许保留兼容数据。

保存前重新预检；加载恢复名称、实例、参数和关系。复制生成新 ID；重命名是草稿修改。覆盖、删除、重置和放弃未保存草稿均二次确认。删除快照保留当前草稿；重置当前草稿恢复运行默认值，保留其他具名快照。刷新前提交当前未失焦的字段；草稿刷新恢复与具名保存明确区分。

损坏/未来集合版本锁定原数据，继续提供安全会话；单条不兼容快照隔离保留，其他快照可用。提供原数据下载和明确的备份恢复，备份写入 `agent-zero:constructor:v2:recovery`。配额/备份失败不宣称保存成功，也不破坏原快照。

学习进度、Journal、Memory Lab、`agent-zero:research:v2`、`agent-zero:execution:v1` 与开场偏好不由本轮构建器存储改写。自动浏览器测试使用独立临时配置，未操作用户日常浏览器数据。

## 本轮文件清单

| 分组 | 新增/修改 |
|---|---|
| 模型与契约 | `src/features/constructor/model/catalog.js`、`configuration.js`、`preflight.js`、`types.d.ts`；扩展 `modules.js`、`validation.js` |
| 单一 store / 存储 | `src/features/constructor/state/reducer.js`、`store.js`、`persistence.js` |
| UI | 新增 `components/configurationManager.js`、`preflightPanel.js`；扩展 `library.js`、`moduleInspector.js`、`views/systemView.js` |
| 集成与视觉 | `src/app.js`；`src/components/layout/panels.js`；`src/scenes/core/modules3d.js`、`svgParts.js`；`src/styles/zz-constructor.css` |
| 旧工具兼容 | `src/simulation/tools/announcementSearch.js`、`documentReader.js`，新增可选字段不再误作旧运行必填 |
| 测试与工具 | `tests/m21-configuration.test.mjs`；更新 `constructor.test.mjs`、`persistence.test.mjs`；新增 `tools/m21-acceptance.mjs`；更新 `check.mjs`、`m03-acceptance.mjs`、`m14-acceptance.mjs` |
| 构建与文档 | `package.json`、`package-lock.json`、`README.md`、`index.html`、`docs/M2.1_PLAN.md`、本文件；生成静态 `dist/` |

上述为 M2.1 改动，不把开始时已有的 M1.4 未提交文件列为本轮成果。

## A01–A40 验收

证据缩写：D＝`tests/m21-configuration.test.mjs`；B＝`verify/m21-final-full-report.json` 中同名浏览器项；R＝同报告 `R-m03`～`R-m14` 的历史回归项；C＝文末真实命令输出。

| ID | 状态 | 实测证据 |
|---|---|---|
| A01 仓库审计 | PASS | 本报告/PLAN；346 项基线输出；检查真实 store、渲染、存储和旧工具 |
| A02 单一配置源 | PASS | D store/Runtime 测试；B A12/A17/A18 读取同一份配置与实际 3D 状态 |
| A03 Schema 版本 | PASS | D 默认、v1 迁移、未来版本锁定、迁移后 ID 稳定 |
| A04 ID 唯一 | PASS | D 复制配置、实例及连接引用修复 |
| A05 可序列化/安全 | PASS | D JSON、秘密/函数/循环/大小拒绝；B A05-XSS 恶意字段不执行 |
| A06 模块注册表 | PASS | D 十类实例、全部共享字段类型校验、所有 conceptId 可解析 |
| A07 两套默认 | PASS | D 两例合法；C check 两例 ready=true；B A07 |
| A08 点击装配 | PASS | B A08 真实 DOM 预览/确认；D 原子提交 |
| A09 可选拖拽 | PASS | B A09-valid/A09-invalid 真实鼠标事件；D 取消/错误端口无修改 |
| A10 移除/禁用 | PASS | D 原 reducer/store 回归；B A17/A18 禁用实体/节点同步 |
| A11 重复模块 | PASS | D 原子性/重复规则；B A11 |
| A12 Inspector | PASS | B A12 文本、数值、多选及 A24 根审批字段真正写入 |
| A13 表单校验 | PASS | D 全部共享字段错误类型；B A13 非法数字拒绝，字段原因保留原值 |
| A14 依赖 | PASS | D 缺 Context/Instructions 等依赖；B A18 关闭 Retrieval 引出 Context 错误 |
| A15 冲突 | PASS | D Context 模式、预算、权限与审批错误；问题有稳定定位与排序 |
| A16 2D 系统图 | PASS | B A18；真实模块、自动依赖、显式无效状态；列表替代；截图 |
| A17 3D 联动 | PASS | B A17 检查实际 bay 实例及状态，11 项一致；移除测试/原回归 |
| A18 各视图一致 | PASS | B A12/A17/A18；目录/图/Inspector/预检均读同一 store |
| A19 MCP 边界 | PASS | D 静态能力和缺模块校验；B 无远程资源；无网络连接代码 |
| A20 Tools 边界 | PASS | D 权限/路径规则与原 simulation 全套；B 无远程请求 |
| A21 Retrieval 复用 | PASS | D 直接比对同一 Knowledge Lab retrieve 结果，坏源安全返回 |
| A22 Skills 权限 | PASS | D Skill 不提升工具权限；R M1.3 Skills 回归 |
| A23 Memory 区分 | PASS | D 仅本地稳定条目/未知 Journal 引用拒绝；R Memory/Journal 隔离 |
| A24 Guardrails | PASS | B A24 审批/私有策略操作；D 拒绝/审批规则 |
| A25 保存 | PASS | B A25 本地列表；D 配额失败原快照不变 |
| A26 加载 | PASS | B A26-load/A26；D 名称、参数、显式连接与实例恢复 |
| A27 复制/重命名/删除 | PASS | B A27 取消/确认删除；D 新 ID 与引用修复 |
| A28 默认/重置 | PASS | B 示例加载；D 清空模块后仍恢复根默认，其他具名快照保留 |
| A29 未保存修改 | PASS | B A29/A29-unblurred：取消切换不丢数据、未失焦输入刷新恢复；草稿标记 |
| A30 损坏恢复 | PASS | B A30 原数据锁定、备份恢复；D v1/v2/未来版本与隔离条目 |
| A31 Preflight | PASS | B A31/A24；真实摘要、error/warning/info、错误时不可运行 |
| A32 知识链接 | PASS | B A32 跳转 rag 并恢复选中与 `#/constructor`；D 所有知识 ID |
| A33 存储隔离 | PASS | B A33；D 管理操作不改 Journal/进度/Run，历史内容逐字不变 |
| A34 响应式/无障碍 | PASS | B 1440/1024/768/390、mobile-form/preflight 实际可见操作、真实 Enter/Tab/Escape、焦点恢复、减少动画 |
| A35 WebGL 降级 | PASS | B 真实阻止 getContext 创建 WebGL 后仍编辑预算、显示系统图/预检 |
| A36 纯前端 | PASS | B A36/A39-subpath；src 无 fetch/WebSocket/XMLHttpRequest/EventSource/eval 调用；C 静态包 |
| A37 数据兼容 | PASS | D v1/未知字段/旧 ID/旧 Run；R M0 研究与来源引用 |
| A38 视觉回归 | PASS | 实际查看 assembly/system/preflight/mobile/fallback 截图；保留原核心、材质、轨道与 token |
| A39 测试/构建 | PASS | C 单元、语法/知识/配置契约、生产 build、token 复算；JavaScript 项目无 tsc 编译链 |
| A40 全阶段回归 | PASS | 最终构建完整回归：M0.3 33/33、M0.4 44/44、M1.1 27/27、M1.2 29/29、M1.3 36/36、M1.4 48/48；M0.1 开场/核心旋转/聚焦另有真实浏览器验证 |

## 实际命令、回归与截图

- `npm test`：**371/371 通过**；基线 346、新增配置领域 25；见 `verify/m21-tests.txt` 和 `m21-domain-tests.txt`。
- `npm run check`：**113/113 JS 语法通过**；36 概念/49 关系零问题、两套 Agent 示例零 error/warning，静态相对路径通过；见 `verify/m21-check.txt`。没有伪造 `tsc`，类型契约由 `.d.ts` 文档与运行时 schema 测试共同约束。
- `npm run build`：静态 `dist/` 和单文件 `index.html`；见 `verify/m21-build.txt`。约 JS 1.61 MiB、CSS 173 KB；无 CDN。
- `npm run tokens:verify`：24 组真实 tokenizer 序列一致；见 `verify/m21-tokens.txt`。
- `node tools/m21-acceptance.mjs --regression --report=verify/m21-final-full-report.json`：**258/258 通过**（M2.1 交互 41 + 历史回归 217）；见 JSON 及 `verify/m21-final-full-browser.txt`。
- `git diff --check`：无空白错误；保留仓库原有 CRLF 转换提示。

截图：`verify/m21-shots/assembly-desktop.png`、`system-desktop.png`、`preflight-desktop.png`、`mobile.png`、`preflight-mobile.png`、`fallback.png`。打开根目录 `index.html` 或运行 `npm run dev` 可复现。

历史浏览器脚本的两处测试条件已按新契约修正：M0.3 读取 v2 草稿 envelope；回归起始清除继承的减少动画设置，避免把正确的 k=1 低动态聚焦判为失败。导航等待防止旧 JS 上下文误判就绪；beforeunload 在独立测试配置中明确接受。未放宽产品规则。

## 遗留与边界

- P0/P1：无剩余交付阻断；独立审查指出的问题已修复并通过复核。
- P2：没有真实 GPU、触屏设备与屏幕阅读器的全面人工验收；本机软件渲染截图不代表所有设备帧率保证。自动化覆盖真实 Chrome 键盘/鼠标、四种宽度、减少动态与 WebGL 缺失。
- 本阶段提供配置与预检；完整 Runtime、安全执行分支、多角色调度和 A/B 对比留给 M2.2/M2.3。旧研究实验继续按原双工具契约运行。
- 仅本地变更，未提交、未推送、未部署；无业务后端、真实 AI/MCP/Embedding/搜索连接，无用户数据清空。
