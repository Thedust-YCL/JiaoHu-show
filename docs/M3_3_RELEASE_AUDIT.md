# M3.3 V1.0 发布准备审计

日期：2026-10-28。**最终结论：`BLOCKED`。** 尚未公开部署，线上验证 `NOT RUN`。本文是当前工作的真实快照，不代表所有 M3.3 工作已完成。

## 续修记录：实验按需加载

静态站将五个独立 Lab 拆为按需加载的本地代码块；离线单文件单独构建并同步内联。加载状态可见，失效请求不会覆盖更新的导航，网络失败时可重新载入原深链。构建回归 `node --test tools/m33-build-test.mjs` 从无代码块的失败转为通过；`node tools/m33-lazy-acceptance.mjs` 在生产子路径及离线版覆盖新用户学习旅程、五 Lab、延迟竞态、503 后恢复、配置保留、深链刷新和前进后退，18/18 通过，[证据](evidence/m33/lazy-acceptance.json)。首次故障测试选错导航按钮，修正选择器后复测；一次深链测试使用 hash-only 跳转，等待新文档超时，改用不同 URL 后复测；不得将其当作产品故障证据。

续修后 `npm test` 429/429、`npm run typecheck`、`npm run check`、`npm run tokens:verify` 和 `npm run build` 退出 0；M21 全阶段 260/260、M22 33/33、M23 23/23、M31 45/45 均退出 0。M31 新增子路径 HTTP 错误断言；关键资源无 HTTP 错误、收集的控制台为空。分包后原 M22 测试服务未提供 chunk 而 32/33，修正测试服务并复测通过；原断言未降低。[M21](evidence/m33/m21-split.json)、[M22](evidence/m33/m22-split.json)、[M23](evidence/m33/m23-split.json)、[M31](evidence/m33/m31-split.json)。

同机 Intel Arc、Chrome Headless 156、150 ms / 200 KiB/s、无缓存各一次：无压缩首次 ready 10,700.8 → 9,635.2 ms；模拟 gzip 3,388.7 → 3,183.8 ms。生产入口 JS 1,802,772 → 1,532,745 B，首屏仍需四个共享代码块：含协议记账的首屏 JS 传输约 1,581,179 B（无压缩）或 433,098 B（模拟 gzip），旧值分别 1,803,097 / 487,127 B。样本少、浏览器小版本有差异，结果不是统计保证；真实 Pages 压缩和缓存仍未验证，无压缩首屏仍偏慢，Q03 保持开放。原始结果为 `verify/m32/m33-split-uncompressed.json` 和 `m33-split-gzip.json`。

同机无节流 UI 续测：Atlas 正向打开/搜索附近长任务 67 ms，编辑/Runtime 打开附近 55 ms；搜索 6 次 p50/p95 为 169.7/172 ms（含防抖），编辑 5 次 8/41.4 ms，运行单步 4 次 17.1/19.2 ms。见 [原始记录](evidence/m33/ui-profile.json)。单次测量无调用栈、长日志及慢设备样本，A15 不关闭。设备检查未发现 Android USB 设备或 Firefox 可执行文件，不能替代真机与浏览器验证。

另一次打开 Chrome CPU 采样时记录长任务 78/73 ms；[采样文件](evidence/m33/ui-cpu-profile.json)及[运行结果](evidence/m33/ui-cpu-summary.json)已保留。采样中可见渲染尺寸更新和焦点调用，但生产包已压缩，部分函数名无法可靠映射；此证据尚不能确定单一根因或推翻 A15 阻断。

下方最初审计的构建体积、哈希和测试是**修改前**记录，不能作为当前构建标识。

本次最新生产入口 `dist/assets/app.js` SHA-256 为 `655b8a412baef4c63774ca37588e885ee8665d85f8c25a0dc1d5b58599ac2a5a`；`dist/index.html` 为 `8e770c1f605827d39c4fda2e78749ec2b3be78f8401870e4c75b71f5c92ab200`，`app.css` 为 `278cee62b7c2146c039b4074ef099668e647faf08ac7e52926f7f5c7d34a6bfd`，离线页为 `201b51cde4a8d18571c20784681bd3b222185ac2c35e9e46f98b9863302e91a1`。[完整 dist 摘要](evidence/m33/dist-sha256.txt)包含全部代码块；发布必须归档并上传整套产物，不能只按入口哈希识别整个产物。

## 发布阻断与遗留事项

1. **P1 / Q03，部分缓解，未关闭。** 受控拆分和局部回归已完成，受限网络下无压缩首屏仍约 9.64 秒；实际 Pages 压缩、缓存和完整回归尚未验证。不得凭假定压缩关闭问题。
2. **P1 / Q01，证据不足。** M3.2 有 Intel Arc 短时及 100 次重复操作测量；真实移动设备、数小时运行、GPU 进程内存等未测。需要目标设备与长时证据，不能把桌面模拟当真机。
3. **M3.2 A15 未闭环。** 记录过 90/74 ms 长任务，长日志、轨迹及慢设备尚未充分剖析。其严重性需用重复测量确定；不得将该缺口视为通过。
4. **部署与回滚未确定。** GitHub 连接器只读确认仓库公开且默认分支为 `main`，未提供 Pages 设置；公开 Pages API 查询返回 403 rate limit，来源、现有站点及 URL 仍未查明。本地子路径通过不代表实际托管的缓存、压缩和回滚可用。旧版本读取新版持久化数据的降级兼容未验证，回滚前必须以隔离数据验证或制定非破坏性恢复。
5. **回归脚本偶发异常。** 首次 M21 回归的 260 条断言全通过，但关闭浏览器时 `Browser.close` 等待未完成、命令退出码 1；随后不并发其他浏览器重新运行，260/260 且退出 0。一次复跑不足以确定异常根因或证明不会再出现，保留两次证据。
6. **P2 / Q10、Q14。** Firefox、Safari、iOS/Android 真机、触控和软键盘、屏幕阅读器、200% 缩放及完整对比度审查未运行；长任务根因仍待定位。
7. **任务书阅读证据缺口。** 已定位并批量读取全部指定历史任务书，但批量工具输出被截断，本轮不能证明逐字完整核对；须分批补读并核对历史约束后完成最终交付审查。

本轮未发现新的 P0，但未覆盖的范围不能证明不存在 P0。续修只改变实验加载和相应浏览器测试服务，未改变模拟逻辑或降低测试断言；未关闭上述阻断。

## 仓库与候选

- 分支 `main`，起始 HEAD `e4775e12b90778471af5c3d7f01e0e33ea053a63`；本地无 tag。remote 为 `https://github.com/Thedust-YCL/JiaoHu-show.git`。大量既存未提交与未跟踪变更，包含 M3.1/M3.2 工作及报告；不代表 HEAD 已包含它们。没有执行提交、推送、远程 tag、Release 或部署。
- `package.json` / 锁文件现为 `0.9.0`；`1.0.0` 仅为目标草案，未冒称正式冻结。正式 RC 需在问题关闭后检查远程 tag 冲突、更新一致版本、固定提交与产物摘要。
- 需求文档位于 `docs/`，PRD 的实际名称为 `PRD .md`；其余 M0.1–M3.3 任务书均存在。报告和设计规范是未提交工作区文件，应与候选一并审查；不能只凭旧 HEAD 重建本轮结果。

## 实际命令与结果

环境：Windows，Node v24.16.0、npm 11.13.0，PowerShell 7；浏览器脚本使用本地 Chrome、隔离 profile 和 SwiftShader，视口由脚本设置。关键 JSON 证据已复制至 [evidence/m33](evidence/m33/)；完整 `verify/` 被 Git 忽略，移交时仍须另行保存，不得将其误认为随仓库自动归档。

| 命令 | 本轮结果 |
|---|---|
| `npm ci` | 首次因沙箱不能读取系统 npm 缓存而 EPERM；工作区缓存尝试被中止。获得系统缓存访问后 `npm ci --no-audit --no-fund` 退出 0，安装 5 个包。|
| `npm test` | 429/429，通过；0 fail、0 skipped；退出 0。|
| `npm run typecheck` | 退出 0；是配置范围内类型检查，不是全仓严格类型验证。|
| `npm run check` | 退出 0：128 文件语法、6 章、36 概念、49 关系、6 实验、配置契约和相对资源检查。|
| `npm run tokens:verify` | 退出 0，24 组真实分词序列一致。|
| `npm run build` | 退出 0；重新生成 `dist/` 和根目录离线版。|
| `node tools/m21-acceptance.mjs --regression --report=verify/m33-m21.json` | 260/260 断言，M03 33、M04 44、M11 27、M12 29、M13 36、M14 50；清理时异常，进程退出 1。不能将完整命令记为通过。|
| `node tools/m21-acceptance.mjs --regression --report=verify/m33-m21-retry.json` | 串行复跑 260/260，退出 0；首次清理异常未复现。|
| `node tools/m22-acceptance.mjs` | 沙箱内 Chrome 调试连接异常；获准启动隔离 Chrome 后 33/33，退出 0；主体使用离线版并测试静态子路径。|
| `node tools/m23-acceptance.mjs` | 23/23，退出 0；本地 `http://127.0.0.1:8183/agent-zero/#/compare` 使用真实 `dist/`。|
| `node tools/m31-acceptance.mjs` | 44/44，退出 0；本地静态子路径、六章/六实验入口、桌面与模拟窄屏、降级及核心交互。|
| `node tools/m32-motion-check.mjs` | 退出 0；普通/减少动态同一配置、场景、seed 31415 均完成 6 步、1 次审批、29 事件；比较规范化业务结果。|
| `node --test tools/m32-preview-security.mjs` | 2/2，退出 0；验证本地开发和预览服务拒绝编码路径穿越。|
| `npm audit --json` | 退出 0；本次数据库返回 0 项已知漏洞，不等于全面安全审计。|
| 构建敏感模式检索 | `rg` 针对常见 AWS、私钥、sk 和 GitHub token 模式在 `src`、`dist`、离线页无匹配；不证明不存在所有秘密。|

生产产物：`dist/index.html` 1,196 B，`dist/assets/app.js` 1,802,772 B，`dist/assets/app.css` 205,256 B；另有根目录 `index.html` 离线版。SHA-256：HTML `8e770c1f605827d39c4fda2e78749ec2b3be78f8401870e4c75b71f5c92ab200`；JS `5e83e6aeb11b14a94db239ea42f073fe8d51d5ee3d458aab38cee2e2c1765d6c`；CSS `278cee62b7c2146c039b4074ef099668e647faf08ac7e52926f7f5c7d34a6bfd`。Hash 只标识本次产物，不是提交或发布标识。

## 五条旅程覆盖与缺口

- A 学习：M33 隔离新 profile 使用实际界面从跳过开场、Story、概念、Atlas、Lab、返回章节到 Journal，刷新后活动保留；M21/M31 补充各章节与实验覆盖。不是人工可用性评价。
- B 构建：M21 检查点击和拖拽、预检、保存、复制、删除、刷新和损坏数据；串行复跑 260 条通过、退出 0。M31 补充草稿与字段检查。
- C 执行：M22 33/33 覆盖九场景、控制、批准/拒绝、失败与子路径；单测覆盖相同输入复现。M31 补充报告和证据不足。
- D A/B：M23 23/23 覆盖同条件、指标、引用、保存、重开、重跑与下载，实际使用 `dist/` 子路径。
- E 异常：M21/M22/M23/M31 覆盖模拟 WebGL 不可用、部分数据损坏、权限拒绝和窄屏；减少动态结果对照已运行。真机、长时间、完整存储故障矩阵未完成。

## A01–A40

状态只覆盖本轮上述证据及明确引用的 M3.2 证据；`BLOCKED` 是前置条件未满足，`NOT RUN` 是对应完整验证未执行。

| ID | 状态 | 证据或缺口 |
|---|---|---|
| A01 | BLOCKED | M3.2 为 BLOCKED，Q01/Q03 和 A15 未闭环。|
| A02 | PASS | 分支、HEAD、工作区、tag 与目标版本如上。|
| A03 | BLOCKED | 范围未扩张，但 1.0.0 尚未冻结到可复现提交。|
| A04 | PASS | 锁文件干净安装成功；未升级依赖。|
| A05 | PASS | 干净安装后生产构建退出 0。|
| A06 | PASS | 范围内 typecheck 退出 0。|
| A07 | PASS | 429 项、0 失败/跳过；浏览器脚本退出异常另记。|
| A08 | PASS | dist 为 HTML/CSS/JS 静态产物；业务代码本地执行。|
| A09 | PASS | 相对资源及本地子路径浏览器回归；实际线上资源未测。|
| A10 | BLOCKED | 本地 `/agent-zero/` 已测，实际 Pages 来源及 base 未确认。|
| A11 | PASS | M31 本地 Hash 深链及前进/后退；真实线上 URL 未测。|
| A12 | PASS | M23 使用真实 dist 的本机静态子路径。|
| A13 | PASS | M31 主流程与各 Lab 的项目子路径 HTTP 错误断言通过、控制台为空；M33 覆盖故障恢复。线上和其他浏览器未测。|
| A14 | PASS | M33 隔离浏览器完成新用户连续旅程并验证刷新后进度。|
| A15 | PASS | check 6 章、36 概念、49 关系与来源状态。|
| A16 | PASS | M21 阶段断言和 M31 六个入口；串行复跑退出 0。|
| A17 | PASS | M21 报告装配、Inspector、预检、同步断言，M31 补充；串行复跑退出 0。|
| A18 | PASS | M21 报告具名保存、加载、复制、删除及损坏保护；迁移单测。|
| A19 | PASS | M22 33/33 和 Runtime 单测。|
| A20 | PASS | M22 权限批准/拒绝、失败重试和终止场景。|
| A21 | PASS | 单测覆盖固定配置/场景/seed 的语义复现。|
| A22 | PASS | M22/M23 和报告测试核查本地证据与不足。|
| A23 | PASS | M23 同条件运行及真实事件指标。|
| A24 | PASS | M23 档案保存、重开、重跑与 Markdown 下载。|
| A25 | PASS | M21/M31 和单测覆盖活动、进度与隔离；M21 串行复跑退出 0。|
| A26 | PASS | M21/M22/M23 有各自删除隔离检查；不代表所有浏览器。|
| A27 | PASS | 单测及 M21/M22 损坏数据保留和恢复测试；M21 串行复跑退出 0。|
| A28 | PASS | M31 无 WebGL 覆盖装配、运行、对比及证据；学习入口另有 M21。|
| A29 | PASS | 本轮 `m32-motion-check` 规范化轨迹一致。|
| A30 | PASS | M31 桌面模拟视口回归，非全部浏览器。|
| A31 | PASS | M31/M22/M23 Chrome 模拟 360–430px；非真实手机。|
| A32 | PASS | 脚本覆盖键盘、焦点、弹窗及审批；非完整读屏认证。|
| A33 | PASS | 检查和现有文案区分本地模拟、来源及限制；参考资料未重新线上核验。|
| A34 | PASS | 有限敏感模式扫描无匹配；不是全面泄密审计。|
| A35 | PASS | 源码网络调用检索与 M22/M23 请求检查无远程业务请求；外链由用户主动打开。|
| A36 | BLOCKED | 草案已编写；README 保留历史阶段内容，完整一致性审阅未完成。|
| A37 | BLOCKED | 说明为未发布草案，依赖未闭环门禁和最终版本复核。|
| A38 | BLOCKED | 回滚草案存在；实际部署机制和降级数据兼容未验证。|
| A39 | PASS | 本轮无远程发布操作；用户授权边界已记录。|
| A40 | BLOCKED | 已列出逐项证据和结论，但历史任务书完整核对、多项前置与完整旅程未完成。|

## 交付与下一步

文档：README、`USER_GUIDE.md`、`ARCHITECTURE.md`、`CHANGELOG.md`、`RELEASE_NOTES_V1.0.md`、`RELEASE_CHECKLIST.md`、`ROLLBACK_PLAN.md`、`M3_3_HANDOFF.md` 均为当前候选草案。需完成上述阻断、复测并重新逐项审查文档后才能声明 `READY_TO_PUBLISH`。获得明确授权并实际完成部署、线上验收后才可声明 `PUBLISHED_VERIFIED`。
