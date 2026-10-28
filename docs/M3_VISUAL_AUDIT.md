# M3.1 视觉与交互审计

审计日期：2026-10-26。需求：`PRD .md` v0.7、`DESIGN_SYSTEM.md` v1、M0.1–M2.3 全部任务书及 `M3.1_TASK.md`。本文件随修复与实际验收更新。

## 产品认知与保留范围

这是面向中文新手的浏览器 AI 知识实验室。用户从六章/Atlas 学习，进入六个 Lab，再装配配置、检查真实本地事件、比较 A/B 并追溯引用。首要任务是解释配置为什么改变执行路径；窄屏同样要能装配、审批、读证据与导出。工作区是科研控制台，Story 是引导阅读，Report 是档案阅读，各自保留信息结构。

沿用原生 JS DOM、Three.js、唯一 Constructor store、M2.2 Runtime、M2.3 Comparison、统一知识注册表、hash 路由及独立持久化。保留 AZ-CORE 01 三组机械轨道、黑曜几何核心与深色科研终端。没有新 UI 框架、业务后端或真实 AI API。

## 基线与审计方法

- 当前分支 main；开始时仅 `docs/M3.1_TASK.md` 未跟踪，为用户任务书，保留。
- `npm test`：419/419 PASS，日志 `verify/m31/baseline-tests.log`。
- `npm run build`：PASS，`verify/m31/baseline-build.log`。
- 现有 M2.3 Chrome 浏览器回归：23/23 PASS，`verify/m31/baseline-browser.log`。受限环境 Chrome 立即退出；获工具自动审批后使用独立临时配置的无头 Chrome 执行成功。
- 实查文件：app 路由/生命周期，panels 共享控件，styles tokens/各页面布局，constructor store/schema/Inspector，Atlas graph/list，Runtime/Comparison/Report/Journal 与测试脚本。
- 视觉基线截图：`verify/m23/02-metrics-traces.png` 等；截图只用于视觉，不代替功能测试。

## 实际问题与修复策略

| 编号 | 优先级 | 实际问题 / 根因 | 策略 | 验收方法 | 状态 |
|---|---|---|---|---|---|
| V01 | P1 | Runtime 停靠的主 3D 沿用当前 Constructor，未同步历史 Run 的配置快照；暂停未冻结 bay 脉冲 | 展示适配层消费 run.configSnapshot/current event/status，退出后恢复当前配置；不改引擎 | 修改当前配置后打开历史，核对 3D/2D/Inspector；暂停审批/取消检查 | 已修复并验收：resume-review A10-runtime-snapshot |
| V02 | P1 | 旧执行台 `openExecution` 写入 `#/hub`，深链/刷新不对应页面 | 在现有 hash 分派中补 execution/report 路径 | 深链刷新、浏览器前进/后退与引用往返 | 已修复并验收：resume-review report-refresh；resume-acceptance 深链 |
| V03 | P1 | Atlas 重建 workspace，搜索、章节/关系筛选、transform 和滚动没有返回快照 | 仅保存 UI 上下文，graph 增加受限恢复接口，不复制知识数据 | 搜索/缩放/滚动→详情→返回，同步检查 ID 与 transform | 已修复并验收：resume-workspace Atlas 往返 |
| V04 | P1 | 透明或移出视窗的 Dock/Inspector/Boot 背后控件仍可能进入 Tab 顺序，抽屉无完整焦点边界 | 实际隐藏状态设置 inert；抽屉/确认弹层隔离背景、Esc 和返回焦点 | 真实 Tab/Shift+Tab/Esc、关闭后焦点与背景不可达 | 已修复并验收：resume-review modal Tab；resume-workspace 抽屉 |
| V05 | P1 | 工作区导航缺 Constructor/Runtime，A/B 没有 current 标识；workspace mode 未覆盖 dock | 复用同一导航配置统一入口与 active 映射 | 六章/Atlas/Lab/Constructor/Runtime/A/B 地址与 active 对照 | 已修复并验收：resume-acceptance 导航与深链 |
| V06 | P2 | 品牌 `A<b>/</b>0` 使用 grid，真实截图字形分三行 | 改为水平 flex，固定不换行 | 桌面/360px 品牌包围盒与截图 | 已修复并验收：resume-review A03-logo |
| V07 | P2 | `--fs-micro:10.5px`、高频辅助字较小；`--text-3` 在 raised 面板对比偏弱 | 保留色板，提升辅助文本亮度与字号 token、统一行高 | 计算对比度、桌面/窄屏视觉复核 | 已修复并验收：resume-review A02-contrast 5.776:1 |
| V08 | P2 | Runtime/Comparison 等重复硬编码背景/状态色；控件最小高度 26px，表单 focus/disabled 不统一 | 扩展已有 tokens，迁移高频颜色、尺寸、层级、motion、表单规则；沿用 btn/tag/note | CSS token 检查、variants 默认/hover/focus/disabled/loading 浏览器检查 | 已修复并验收：resume-acceptance 共享控件及状态 |
| V09 | P1 | 窄屏工具栏、固定面板与长文本需实际逐页验证，既有验收只覆盖 390px A/B 主入口 | 统一关键操作触控尺寸、可滚动工具栏/表格与浮层边界；逐页检查 | 1366×768、1440×900、1024×768、768×1024、390×844、360×800、430×932 | 已修复并验收：resume-acceptance 七视口；resume-review 页头七视口及截图 |
| V10 | P2 | 运行 JSON / 配置下载缺真实失败反馈，保存反馈语义与警告共用 | 共享本地下载反馈，捕获可知错误；真实成功只描述已生成/已请求下载 | Blob/URL 失败注入与实际磁盘下载检查 | 已修复并验收：resume-acceptance 实际下载和失败反馈 |
| V11 | P2 | 3D/2D caption 不完整兼容 Runtime event.message / outputSummary 等差异；2D caption 被隐藏 | 只读表现适配，保留状态文字与真实事件 ID，不补造未来步骤 | M0/M2 events 两种模型、A/B 未选事件及失败/审批 | 已修复并验收：resume-review core-reset、A10；resume-tests 表现适配 |

P0：当前审计未发现业务后端/真实 AI 调用。错误、权限拒绝、未决冲突与 SIMULATION 标识保留。没有计划重建配置、Runtime 或比较模型。

## 已有能力，直接复用

Atlas 搜索/章节和关系筛选/键盘列表、固定图谱布局；Constructor 即时草稿与具名快照、预检及字段级错误；Runtime 九场景/审批/历史；Comparison 真实指标、事件对齐、引用与 IndexedDB 档案；Journal 原生 dialog、清除隔离；全局 reduced-motion CSS 与 WebGL fallback；静态子路径构建。修复不改变这些数据语义。

## 验收与交接

最终结果见 `DELIVERY_M3.1.md`：逐项 A01–A40，PASS/FAIL/BLOCKED/NOT RUN；新浏览器验收、前序回归、单元测试、类型检查、构建及截图实证分别记录。真实设备、其他浏览器与正式辅助技术若未执行，明确 NOT RUN。

M3.2：全站渲染剖析、3D DPR/几何与透明层预算、包体与分包缓存、跨浏览器和真实设备矩阵、完整读屏与对比度审计、长时间切换内存/资源测试、数据边界发布前审查。

## 续接复核：额外发现与修复

| 问题 | 修复与实证 |
|---|---|
| 收起 Inspector 后桌面保留空列，窄屏工作区可能被挤至零宽 | 修正 workspace 列规则及窄屏覆盖；resume-review workspace-width 和 resume-acceptance 七视口检查通过。 |
| 确认框首次聚焦被 visibility 隐藏阻止，抽屉 Tab 处理会抢焦点 | 保留 inert 和 opacity 隐藏，确认框优先处理键盘；resume-review Enter/Tab、resume-workspace 抽屉 Tab/Shift+Tab/Esc 通过。 |
| 旧 Execution/Report 标题被导航和按钮挤压 | 页头允许换行并给导航独立一行；resume-review 七视口宽度检查通过，并人工查看 1440/390 报告截图。窄屏内容纵向滚动阅读。 |

R01–R06 的发现历史与本次根执行者复核见 M3.1_REVIEW.md。浏览器证据限本机 Chrome headless/SwiftShader；截图不是功能测试或正式无障碍认证。
