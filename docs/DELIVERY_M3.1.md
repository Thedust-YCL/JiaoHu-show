# M3.1 交付与验收记录

日期：2026-10-27。状态：M3.1 验收完成，未发布。基线 HEAD e4775e12b90778471af5c3d7f01e0e33ea053a63；改动保留本地工作树。

## 视觉审计与实现

审计、问题优先级及逐项修复证据见 [M3_VISUAL_AUDIT.md](M3_VISUAL_AUDIT.md)，独立审查及根执行者复核见 [M3.1_REVIEW.md](M3.1_REVIEW.md)。共享 token 补足字号、间距、控件高度、焦点、浮层和动效；常用按钮、表单、状态和响应式规则统一。辅助文字在 Raised 背景的特定组合实测 5.776:1，不代表全站对比度认证。

保留 AZ-CORE 01 机械轨道与几何核心、深色科研终端；开场可跳过，减少动态时采用静态相机，WebGL 失败提供 2D 路径。Runtime 主核心消费真实运行快照及事件，退出后恢复当前配置。Story、Atlas 和六个 Lab 保留原有结构，统一导航与状态；Atlas 恢复同会话筛选和视图。Constructor 增强字段及下载反馈；Runtime、旧 Execution/Report 恢复运行和事件上下文；A/B 保留观察侧并保护未保存结果；Journal 保留数据隔离及原生弹窗。

键盘改进包括跳过主内容、隐藏区域 inert、抽屉和确认框焦点圈定与返回；状态保留文字说明，不仅依赖颜色。审批、拒绝、证据不足、来源冲突和本地模拟边界仍可见。

## 测试环境与范围

本机 Chrome headless + SwiftShader，独立临时配置；静态站点与离线 HTML。桌面 1366×768、1440×900；平板 1024×768、768×1024；窄屏 360×800、390×844、430×932。自动化检查七视口及关键操作，人工查看新版 1440/390 Report；截图不能替代功能测试。

其他浏览器、iOS/Android 真机、触屏和软键盘、真实 GPU 性能与资源增长、完整 NVDA/VoiceOver、200% 全站缩放、正式 WCAG 和安全审计、外部来源时效核验均未运行；详见 [M3.2_BACKLOG.md](M3.2_BACKLOG.md)。

## 实际验证

| 命令或专项 | 结果与证据 |
|---|---|
| npm test | 426/426 PASS，resume-tests.log |
| npm run check / typecheck / tokens:verify | 均退出 0；token 24 组，resume-check/typecheck/tokens.log |
| npm run build | PASS；CSS 194.1 KB、JS 1757.7 KB、dist HTML 1.2 KB、离线 HTML 1953.0 KB，零外部 CDN；不是性能预算结论 |
| m31-acceptance --review-only | 23/23 PASS，resume-review.log 和 resume-review-results.json |
| m31-acceptance | 44/44 PASS，resume-acceptance.log 和 resume-acceptance-results.json |
| m31-acceptance --states-only | 10/10 PASS，resume-states.log 和 resume-states-results.json |
| m31-workspace-probe | 12/12 PASS，resume-workspace.log |
| M0–M2.1 浏览器回归 | 258/258 PASS；m03 33/33、m04 44/44、m11 27/27、m12 29/29、m13 36/36、m14 48/48；resume-m21.log、resume-m21-report.json |
| M2.2 浏览器回归 | 33/33 PASS；resume-m22.log |
| M2.3 浏览器回归 | 23/23 PASS；resume-m23.log |

上述日志和截图位于本地忽略目录 verify/m31/；测试结果按各次运行记录，不拼接历史运行。

## A01–A40

| ID | 验收项 | 状态 | 实证与范围 |
|---|---|---|---|
| A01 | 视觉审计 | PASS | V01–V11、R01–R06 和新增布局／焦点问题已逐项记录，见视觉审计与审查 |
| A02 | Token 一致性 | PASS | 共享 token 与 5.776:1 实算，主验收 A02 |
| A03 | 共享组件 | PASS | logo 与 primary／secondary／ghost／destructive 浏览器断言 |
| A04 | 控件状态 | PASS | focus／disabled／busy、窄屏 44px；主验收 |
| A05 | 文案行为一致 | PASS | 真配置、审批、下载动作与可知失败；未添加假按钮 |
| A06 | 开场体验 | PASS | 主验收完整五镜头／skip 及同一 core；M21 boot 局部 |
| A07 | 深层链接 | PASS | execution／report／runtime／compare／atlas 静态子路径 |
| A08 | 减少动态开场 | PASS | 最后主验收 phase=hub、animation=none、Runtime 真实一步；新单测 |
| A09 | AZ-CORE 造型 | PASS | 三组轨道／几何核保留，截图与 M21 选择／旋转／装配 |
| A10 | 核心状态映射 | PASS | resume-review A10：真实 Run 快照、事件与 Inspector 同步；退出后恢复当前配置 |
| A11 | 3D 降级 | PASS | 主验收 WebGL 失败仍装配／运行／A/B／2D |
| A12 | 导航状态 | PASS | 主验收路由、review Report 刷新；最新页头视觉另列 A23 |
| A13 | 返回恢复 | PASS | workspace 12 项、Runtime／Atlas／旧 Run 知识往返 |
| A14 | 未保存保护 | PASS | 草稿导航保留、A/B 新建／beforeunload／档案取消 |
| A15 | Constructor 一致性 | PASS | resume-m21 完整配置／装配／预检／字段回归；426 单测 |
| A16 | Runtime 一致性 | PASS | resume-m22 33/33；主验收控制／失败／审批 |
| A17 | A/B 语义 | PASS | 主验收两侧／观察侧／核心快照与真实指标 |
| A18 | 模拟声明 | PASS | 主验收运行／结果／磁盘 Markdown、现有 M22／M23 |
| A19 | Loading | PASS | states 10 项：初始 busy、完成移除、脚本被阻止时恢复入口 |
| A20 | Empty | PASS | states 无运行／无档案／无 Journal 和搜索无结果 |
| A21 | Error | PASS | 真实字段错误、损坏存储保留、运行失败／权限拒绝／冲突 |
| A22 | Success | PASS | 实际下载文件及保存语义；下载失败 helper 测试 |
| A23 | 桌面布局 | PASS | resume-review 两个桌面页头断言；1440 report 截图目视复核；主验收布局 |
| A24 | 平板布局 | PASS | resume-review 两个平板页头断言；主验收 1024/768 工作区布局 |
| A25 | 窄屏布局 | PASS | resume-review 三个窄屏页头断言；390 report 截图目视复核；主验收 360–430 工作区 |
| A26 | Atlas 替代视图 | PASS | 可搜索／筛选／键盘列表与实际往返恢复 |
| A27 | Runtime 窄屏 | PASS | 390px 审批滚动、Enter 批准并回单步，拒绝／结果有文字 |
| A28 | A/B 窄屏 | PASS | 实际横向 scrollLeft=200、轨迹单列、A/B 当前侧 |
| A29 | 键盘操作 | PASS | 真实 Enter、Tab／Shift+Tab／Esc、审批／抽屉／确认框；resume-m21 258/258 |
| A30 | 焦点管理 | PASS | 最新确认框初始焦点、圈定／关闭返回；Journal 原生 dialog |
| A31 | 非颜色提示 | PASS | status／reason／2D caption／拒绝和不足文字保留 |
| A32 | 术语一致性 | PASS | 既有中文解释／必要英文术语、真实模拟边界，无新夸大能力 |
| A33 | 证据呈现 | PASS | 主验收缺证／冲突／拒绝；M23 引用与 Markdown 来源 |
| A34 | 数据语义 | PASS | 引擎／配置模型未重建；全量单测，UI session 类型仅可选 marker |
| A35 | 数据隔离 | PASS | states 损坏原始配置保留，其他命名空间不变；既有隔离测试 |
| A36 | 依赖纪律 | PASS | 无依赖变化、纯静态产物、主验收本地网络记录 |
| A37 | 视觉回归 | PASS | 主验收截图和七视口检查；resume-m21 的 M0.3–M1.4、resume-m22/m23 回归；限本机 Chrome |
| A38 | 核心流程回归 | PASS | 主验收六章六 Lab 与工作区路径；resume-m21 258/258、resume-m22 33/33、resume-m23 23/23 |
| A39 | 测试与构建 | PASS | 426 单测、check、typecheck、24 组 token、生产构建及浏览器回归均通过 |
| A40 | M3.2 交接 | PASS | `docs/M3.2_BACKLOG.md` 已列优先级、验收方法和边界 |


## 修改文件

| 类别 | 文件 |
|---|---|
| 文档／命令 | `README.md`、`package.json`、`docs/DESIGN_SYSTEM.md` |
| 新增阶段文档 | `docs/M3_VISUAL_AUDIT.md`、`docs/M3.1_PLAN.md`、`docs/M3.1_REVIEW.md`、`docs/M3.2_BACKLOG.md`、`docs/M3.1_HANDOFF.md`、`docs/DELIVERY_M3.1.md` |
| 用户任务书 | `docs/M3.1_TASK.md`：用户已有未跟踪文件，保留原文 |
| 全局入口／路由／生命周期 | `src/main.js`、`src/app.js`、`src/components/layout/panels.js` |
| 下载 | 新增 `src/components/ui/download.js` |
| Atlas | `src/features/atlas/components/atlasWorkspace.js`、`src/features/atlas/graph/atlasGraph.js` |
| Constructor | `src/features/constructor/components/configurationManager.js` |
| Runtime／旧 Execution | `src/features/execution/components/executionCore.js`、`runtimeWorkspace.js`、`executionWorkspace.js` |
| Comparison | `src/features/comparison/components/comparisonWorkspace.js`、`src/features/comparison/model/types.d.ts`（仅 UI session 可选 savedExperimentId） |
| 3D／开场 | `src/scenes/core/modules3d.js`、`src/scenes/intro/timeline.js` |
| 样式 | `src/styles/tokens.css`、`base.css`、`components.css`、`layout.css`、`atlas.css`、`system-graph.css`、`zz-learning.css`、`zz-runtime.css`、`zz-comparison.css`；新增 `zzz-polish.css` |
| 构建 | `tools/build.mjs`；生成的根目录 `index.html`，以及被 Git 忽略的 `dist/` |
| 新增单测 | `tests/m31-intro.test.mjs`、`tests/m31-presentation.test.mjs`、`tests/m31-ui.test.mjs` |
| 浏览器工具 | 新增 `tools/m31-acceptance.mjs`、`tools/m31-workspace-probe.mjs`；修改 `tools/m21-acceptance.mjs` 的键盘输入／fixture／稳定等待 |


package.json 仅添加验收命令，无新增依赖。系统为纯前端，无业务后端或真实 AI API；配置 schema/store、Runtime 引擎、Comparison 算法与持久化逻辑未重写。没有提交、推送或部署。
