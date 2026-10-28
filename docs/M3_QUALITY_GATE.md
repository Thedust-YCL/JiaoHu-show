# M3.2 全项目质量门禁

日期：2026-10-28。**唯一结论：`BLOCKED`。** 已修复遮挡视图持续渲染、研究历史覆盖、WebGL 降级、本地静态服务路径越界、FPS、应用销毁与后处理资源释放，以及 Atlas 重复更新和焦点竞争问题；后台切换和恢复已实测。受限网络首屏加载缓慢，生产拆包、长日志及真实设备长时使用的证据仍不充分，不能宣称技术门禁已满足。未部署、发布、提交或推送。

## 审计与范围

仓库实际需求文档位于 `docs/`：PRD 文件名为 `PRD .md`，同时有 `DESIGN_SYSTEM.md`、M0.1–M0.4、M1.1–M1.4、M2.1–M2.3、M3.1 和 M3.2 任务书；根目录不存在名为 `PRD.md` 的文件。以现有实现和本轮证据为准，不将旧交付报告当作本轮测试。

原生 ES Modules / DOM，Three.js 0.160.1，Node 24.16.0、npm 11.13.0，esbuild 0.28.2；生产静态资源为一个同步 JS、一个 CSS 和相对路径 HTML，另有根目录离线单文件。Hash 路由；浏览器本地数据使用多个 localStorage 命名空间和 A/B IndexedDB。构建工具为开发期脚本，没有业务服务、真实 LLM、Embedding、MCP 或实时搜索调用。

修改：`src/app.js` 的可见性、渲染调度和销毁清理；`src/scenes/scene.js` 的真实时间帧率与后处理资源释放；本地 `src/scenes/vendor/OrbitControls.js` 保留 Three.js r160 控制器，补齐 document 键盘监听的销毁清理，并在构建中保留 MIT 许可证；`src/features/execution/components/{runtimeWorkspace,executionWorkspace}.js` 与 `src/features/comparison/components/comparisonWorkspace.js` 的上下文丢失降级；`src/features/execution/state/persistence.js` 防止损坏历史被覆盖；`tools/{dev,preview}.mjs` 限制路径并只监听 127.0.0.1。增加隔离测试与测量工具；升级 esbuild 并更新锁文件。`index.html` 由生产构建更新。保留已有 M3.1 工作树改动。

## 实际执行的测试

| 测试 | 结果与证据 |
|---|---|
| `npm test` | 最终改动后 429/429 PASS，0 skipped，`verify/m32/final-tests.log` |
| `npm run typecheck` | 最终改动后 PASS，`verify/m32/final-typecheck.log` |
| `npm run check` | 最终改动后 PASS；JS 语法、6 章、36 概念、49 关系、6 实验、配置契约与相对资源路径，`verify/m32/final-check.log` |
| `npm run tokens:verify` | 最终改动后 PASS，24 组真实 tokenizer 序列复算，`verify/m32/final-tokens.log` |
| `npm run build` | PASS；最终资源体积见性能报告 |
| `node tools/m21-acceptance.mjs --regression --report=verify/m32/m21-repaired-report.json` | 修复后 260/260 PASS：M0.3 33、M0.4 44、M1.1 27、M1.2 29、M1.3 36、M1.4 50 及 M2.1 检查，`verify/m32/m21-repaired.log` 及 JSON |
| `node tools/m21-acceptance.mjs --regression --stage=m14 --report=verify/m32/m21-atlas-post-report.json` | Atlas 最终修改后 91/91 PASS，`verify/m32/m21-atlas-post.log` |
| `node tools/m22-acceptance.mjs` | 修复后 33/33 PASS，`verify/m32/m22-repaired.log` |
| `node tools/m23-acceptance.mjs` | 修复后 23/23 PASS，`verify/m32/m23-repaired.log` |
| `node tools/m31-acceptance.mjs` | 最终改动后 44/44 PASS，`verify/m32/m31-post.log` |
| `node tools/m31-acceptance.mjs --review-only / --states-only` | 最终改动后分别 23/23、10/10 PASS，`verify/m32/m31-review-post.log`、`m31-states-post.log` |
| `node tools/m32-performance.mjs repaired --check --lifecycle --stress` | 续修复构建 PASS；先在修改前重现遮挡渲染、上下文丢失后的错误 3D 以及暂停时诊断显示旧读数；脚本完成不等于完整长时间内存验收 |
| `AZ_GPU_MODE=hardware` 的 `m32-performance.mjs hardware --check` 和 `hardware-dpr2 --check --stress` | PASS；Intel Arc 140T、禁用软件光栅器，分别模拟 DPR 1 和 2；后者含 100 次视图切换。仅有修改后数据，见性能报告 |
| Edge 156 `m32-performance.mjs edge-post --check --lifecycle` | 最终改动后 PASS；独立 profile、SwiftShader，打开 Hub、Atlas、六 Lab、Constructor、Runtime、A/B 并检查遮挡渲染及 context loss 2D；不是 Edge 完整业务回归，`verify/m32/edge-post.json` |
| `node --test tools/m32-preview-security.mjs` | 2/2 PASS；真实本机 HTTP 验证开发与预览服务对编码斜杠和反斜杠穿越返回 403。修改前预览测试复现返回 200 |
| `npm audit --json` | 升级后在线官方数据库：0 项漏洞，`verify/m32/audit-fixed.json`；此前的 1 项 moderate 保留在 `audit-online.json` |
| `node tools/m32-dispose-check.mjs repeat100` | PASS；100 次创建/销毁、运行中工作区停止、订阅与全局监听器清理、Bloom 和调色材质释放 |
| `node tools/m32-visibility-check.mjs` / `node tools/m32-motion-check.mjs` | PASS；最终改动后重测真实后台/前台、上下文恢复后 2D、单步及刷新后重建；此前同配置与 seed 下完整运行的减少动态业务轨迹一致 |
| `AZ_GPU_MODE=hardware` 的 `m32-performance.mjs deep-100 --deep-stress` | PASS；100 次装配、完整 Runtime、A/B、移除，几何/纹理/程序数量稳定，观察范围见性能报告 |

`verify/` 是本地忽略目录，报告中引用的 JSON、日志和截图不会自动随 Git 提交，移交时应另行保存。浏览器自动化均使用隔离 profile，不访问真实用户数据。已目视 Hub、Atlas、Runtime、A/B 与 390px 审批截图；自动断言与截图目视不等于完整无障碍或安全认证。

## A01–A40

PASS 仅覆盖证据所述范围；`NOT RUN` 表示未执行，`BLOCKED` 表示证据或门禁仍缺。性能数值和方法见 [M3_PERFORMANCE_REPORT.md](M3_PERFORMANCE_REPORT.md)。

| ID | 状态 | 证据及限制 |
|---|---|---|
| A01 | PASS | 本报告列出框架、构建、依赖、路由、资源、存储与风险 |
| A02 | PASS | 上表记录实际命令、范围和缺口 |
| A03 | PASS | 性能报告记录设备、浏览器、视口、软件渲染、网络和方法 |
| A04 | PASS | 修改前 `baseline.json` 覆盖 Hub、Atlas、六 Lab、Constructor、Runtime、A/B；窄屏性能基线未执行 |
| A05 | PASS | 原始 rAF p50/p95 和超过 33.4 ms 次数记录在 JSON；不声称 60fps |
| A06 | PASS | 单主循环代码审计；遮挡视图 0 tick、可见视图继续；100 次切换及另行 100 次应用销毁的监听器检查 |
| A07 | PASS | 两个真实 Chrome 标签页切换：隐藏期间开场及渲染不前进，恢复后继续；`visibility-restore.json` |
| A08 | PASS | Intel Arc 100 次装配、运行、A/B 和移除，几何体/纹理稳定；另验证 Bloom/调色材质真实释放及 100 次应用销毁。GPU 进程总内存与数小时运行未测 |
| A09 | PASS | 现有低功耗能力判断及 DPR 1.35/1.85 上限；Intel Arc 模拟 DPR 2 诊断显示 1.85；未测真实高 DPI 显示器或动态负载调档 |
| A10 | PASS | M31 44/44、M21 浏览器回归和 Hub/Runtime/A-B 截图；机械轨道、几何核心与可见核心保留 |
| A11 | PASS | JS/CSS/HTML 原始和 gzip 字节、esbuild 贡献及请求路径见性能报告 |
| A12 | BLOCKED | 首屏同步下载所有功能的约 1.8 MB JS；模拟 150 ms / 200 KiB/s 下未压缩首次 ready 10.7 秒。离线单文件与同步导航解释现状，但生产版拆包的收益、路径和回归尚未验证 |
| A13 | PASS | 本地子路径加载 HTML/CSS/JS；无远程字体/贴图或动态 chunk；M21/M31 子路径深链检查 |
| A14 | PASS | M21/M31 在 `/agent-zero/` 上验证多个深链；不等同正式 GitHub Pages 部署 |
| A15 | BLOCKED | 已实测 Atlas 搜索、配置编辑及 Runtime 单步，并消除 Atlas 重复重建；一次采样仍观察到 90/74 ms 长任务，长日志、轨迹和慢设备未做充分剖析 |
| A16 | PASS | 100 次实际装配/运行/A-B/移除及 100 次应用销毁均有堆趋势；样本尾段稳定，未发现明显持续泄漏。数小时、完整回放及 GPU 进程内存未测 |
| A17 | PASS | `check` 36 概念/6 章/49 关系；M1.4 回归验证访问、搜索、关系和详情 |
| A18 | PASS | M1.2–M1.4 浏览器回归与单元测试覆盖六 Lab 真实操作，M31 验证入口 |
| A19 | PASS | Journal 和学习进度测试、隔离迁移及 M1.4 浏览器刷新/清除回归 |
| A20 | PASS | M21 配置、模块装配、拖拽和 2D/3D 同步回归 |
| A21 | PASS | M21 预检与字段断言、配置纯逻辑测试 |
| A22 | PASS | 隔离 fixture 覆盖旧配置、未知/损坏数据和保护；本轮新增研究历史不得覆盖测试；不操作真实用户数据 |
| A23 | PASS | Runtime 单元测试覆盖固定快照/资料/场景/seed 的业务结果；展示时间/标识与业务确定性区分 |
| A24 | PASS | M22 33/33、M31 单步/连续/暂停/继续/取消/审批 |
| A25 | PASS | Runtime 自动化及 M22/M31 的工具失败、重试、证据不足、冲突等分支 |
| A26 | PASS | Runtime 权限/提示注入规则测试及浏览器审批拒绝断言；属于本地模拟边界 |
| A27 | PASS | 报告/引用单测和 M23 浏览器来源回溯检查，引用指向本地资料与事件 |
| A28 | PASS | M23 公平控制、不可变快照、实际事件派生指标测试 |
| A29 | PASS | 档案单测与 M23 IndexedDB 保存、刷新、打开/删除与隔离；非所有浏览器 |
| A30 | PASS | M23 和 M31 Markdown 内容及浏览器实际下载请求；未逐一核验所有操作系统下载 UI |
| A31 | PASS | Chrome 156 无头桌面 1366×768、1440×900 核心流程；另有 Intel Arc 硬件 GPU 的最终构建短时采样 |
| A32 | PASS | Chrome 模拟 360×800、390×844、430×932 的学习/运行、审批和滚动；非手机真机 |
| A33 | PASS | Chrome 实际键盘、焦点、审批、替代视图和状态文字；未做完整 NVDA/VoiceOver 或 WCAG 认证 |
| A34 | PASS | 同配置、场景和 seed 下普通/减少动态完整运行均完成 6 步、1 次审批；配置快照与规范化业务轨迹一致，`motion-equivalence.json` |
| A35 | PASS | 初始化无 WebGL 的 M22/M23/M31 回归；真实 context loss 时当前和后续视图切 2D，恢复事件后保持 2D，刷新后重建 WebGL 并恢复 Runtime |
| A36 | PASS | 源码网络调用检索、生产请求记录及 M21/M22/M23/M31 无远程业务请求；普通参考链接不属于业务请求 |
| A37 | PASS | 在线 npm audit 0 项漏洞、直接依赖许可证与构建敏感模式检查；非全面安全认证 |
| A38 | PASS | 单测、typecheck、check、token 验证及生产构建真实执行；本次最终回归记录见文末 |
| A39 | PASS | 修改前后相同无头条件的 3D/加载数字及代价见性能报告；业务回归见上表；软件基线不能用于计算硬件 GPU 的提升 |
| A40 | PASS | 本报告逐项列明状态、未闭环 P1 与 M3.3 交接；整体结论仍为 BLOCKED |

## 缺陷与待确认项

本轮未发现 P0；Q03 为尚未修复的 P1 性能问题，Q01 为 P1 验收证据阻断。未覆盖的范围不能视为没有缺陷。

| ID | 级别 / 状态 | 复现、影响与处理 |
|---|---|---|
| Q01 | P1 / 阻断：证据不足 | 已有 Intel Arc 硬件 GPU、模拟 DPR 1/2 的短时采样及 100 次装配/运行/移除；真实移动设备、数小时运行及可比硬件优化前基线未测 |
| Q02 | P1 / 已验证 | 两个 Chrome 标签页实测隐藏/恢复；WebGL 丢失再恢复后保持 2D，Runtime 可单步；随后刷新重建成功并恢复 Runtime |
| Q03 | P1 / 阻断：未修复 | 全功能同步 bundle 首屏约 1.8 MB；模拟受限网络未压缩时首次 ready 10.7 秒，模拟 gzip 为 3.4 秒。生产构建仍未拆包，真实托管压缩和缓存未验证；需验证拆包、离线版和深链的收益与回归 |
| Q04 | P1 / 已修复 | `agent-zero:research:v2` 损坏/未知/部分损坏或读取失败时，新运行可覆盖原始数据；新增隔离 fixture 并锁定写入，15/15 研究历史测试通过 |
| Q05 | P1 / 已修复 | 在 Runtime 触发 WebGL context loss，旧代码后续工作区仍选 3D；`context-red.log` 复现，`final-all.json` 验证当前/后续视图使用 2D |
| Q06 | P1 / 已修复 | 本机预览请求 `/%2e%2e%2fpackage.json` 曾读取 dist 外文件；开发和预览现仅回环监听、拒绝路径越界，两项 HTTP 回归通过 |
| Q07 | P2 / 已修复 | 动画时间仍限幅，帧率诊断改用真实经过时间；10 fps 测试及浏览器约 17.9 fps 的低帧率实测通过 |
| Q08 | P2 / 已修复 | 应用销毁解除订阅、监听、计时器和待执行帧，关闭工作区；100 次重建/销毁与全局监听检查通过 |
| Q09 | P2 / 已修复 | esbuild 升至 0.28.2；[GHSA-67mh-4wv8-2f99](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99) 不再命中，在线 npm audit 0 项漏洞 |
| Q10 | P2 / 范围限制 | Edge 仅做视图和降级冒烟，未做完整业务回归；Firefox、Safari、iOS/Android 真机、触控/软键盘、屏幕阅读器、200% 缩放与完整对比度审计未运行 |
| Q11 | P1 / 已修复 | Bloom 和调色材质此前未在场景销毁时释放；真实 dispose 事件先失败后通过，现同时释放后处理和 WebGL 上下文 |
| Q12 | P2 / 已修复 | Atlas 打开和有结果搜索时重复重建列表；浏览器 DOM 计数先失败后通过，最终 M1.4 回归 91/91 |
| Q13 | P2 / 已修复 | 关闭工作区后的延迟焦点恢复可能抢走用户新选中的输入框；实际交互先复现，修复后保留用户新焦点 |
| Q14 | P2 / 待进一步定位 | 一次硬件 GPU UI 采样中仍有约 90 ms 与 74 ms 长任务，分别与 Atlas 初始化/搜索及编辑/Runtime 打开邻近；未剖析长日志、慢设备或重复样本，暂不能判断根因和严重程度 |

## 数据和安全边界

学习进度、Journal、配置、研究历史、Runtime 历史和实验档案使用分离命名空间；Journal 最多 200 条、旧研究历史最近 2 次、Runtime 历史最近 5 次、实验档案最多 12 条/20 MiB/单条 3 MiB，配置集合最多 20 条。旧研究历史在配额不足时原有策略可能仅保留本次并提示；浏览器也可能被用户或系统清除，不能承诺永久保存。损坏的研究历史现在禁止新运行覆盖，当前运行保留在会话中并提示；恢复或清理需用户明确处理。

源码搜索未发现业务 `fetch`、XHR、WebSocket 或遥测；样本浏览器网络记录未见远程业务请求。报告、配置异常输入及导出有现有转义与 XSS 测试；检查不是全面渗透测试。直接依赖许可证：Three.js、esbuild、gpt-tokenizer 为 MIT，TypeScript 为 Apache-2.0；传递依赖许可证未逐项人工法务审查。构建产物敏感字符串模式扫描未发现明显密钥，不能证明不存在所有秘密。

## M3.3 交接清单

1. 先关闭仍阻断的 Q01 和 Q03，并补足 A15：真实设备数小时运行、实际托管压缩/缓存和拆包取舍，剖析长日志和慢设备长任务；后台/恢复已验证，继续复跑涉及模块的功能及跨视口关键流程。
2. 按目标浏览器和真机补测 Chrome/Edge、Firefox、Safari、iOS/Android，触控、输入法、下载、存储和真实静态子路径；补读屏及缩放审计。
3. Q07–Q09、Q11–Q13 已修复；保存本地 `verify/m32/` 原始证据与复现环境，按测试条件解释其范围。
4. 仅在门禁满足后，M3.3 再处理正式托管、真实域名/子路径、回滚、版本、发布文档与发布手续；本阶段没有执行这些操作。
