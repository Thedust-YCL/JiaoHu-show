# M3.2 性能报告

## M3.3 续修（2026-10-28）

五个独立 Lab 的静态站生产构建已按需拆包，离线单文件仍内联。Intel Arc、Chrome Headless 156、150 ms / 200 KiB/s、无缓存各一次：无压缩首次 ready 10,700.8 → 9,635.2 ms，模拟 gzip 3,388.7 → 3,183.8 ms。首屏 JS 请求合计含协议开销分别约 1,581,179 B / 433,098 B；实际托管的压缩和缓存未验证。单次结果受噪声及浏览器小版本差异影响；无压缩首屏仍慢，Q03 保持阻断。资源大小、故障恢复、兼容回归与原始证据见 [M3.3 发布审计](M3_3_RELEASE_AUDIT.md)。

无节流 UI 样本仍测得 67 ms、55 ms 长任务；调用栈、长日志和慢设备尚未剖析，A15 仍未闭环。下文保留原 M3.2 数值，不能当成本次产物。

日期：2026-10-28。结论及验收状态见 [M3_QUALITY_GATE.md](M3_QUALITY_GATE.md)。原始 M3.2 测量保留在下文，本次续修复及最新数据见文末。数字仅代表所述环境和操作，不能外推为所有 GPU、手机或公网的性能承诺。

## 测量条件和方法

- Windows 10.0.26200；CPU Intel Core Ultra 7 255H；浏览器报告 16 逻辑处理器、`deviceMemory=32`（浏览器近似值，不是实测物理内存）。前后对比使用 ANGLE / Vulkan SwiftShader 软件渲染；另进行了禁用软件光栅器的硬件测试，WebGL 报告 Intel Arc 140T / Direct3D 11，显存容量未独立核验。
- Chrome Headless 156.0.8078.47，独立临时 profile；生产 `dist/`，本机 HTTP `/agent-zero/` 子路径，`Cache-Control: no-store`，无网络节流；1440×900 CSS 像素、DPR 1。冷启动是新 profile 首次加载；第二次是同一 profile 再导航，但服务器禁止缓存，**不是热缓存测试**。
- `node tools/m32-performance.mjs baseline` 在优化前执行；`node tools/m32-performance.mjs final-all --check --lifecycle --stress` 在上轮构建执行。每个场景切换后等待 500 ms，再采样约 2 秒；在页面内测 rAF 时间戳间隔及 `scene.tick` 次数。rAF 间隔反映该无头环境的调度，不能当作真实显示器帧率；tick 的 JS 耗时不代表 GPU 完成时间。
- 原始数据 `verify/m32/baseline.json`、`verify/m32/final-all.json`、`verify/m32/hardware.json`；`verify/` 被 Git 忽略，复制仓库时须另行保留。两组采样各一次，非统计意义上的多次重复；性能面板、Lighthouse、功耗和设备级内存均未运行。

## 前后对比

| 场景 | 2 秒内 3D tick 前 → 后 | rAF 间隔中位数 ms 前 → 后 | p95 ms 前 → 后 |
|---|---:|---:|---:|
| Hub | 36 → 31 | 54.6 → 54.6 | 72.8 → 72.7 |
| Atlas | 40 → 0 | 48.5 → 6.1 | 54.6 → 6.2 |
| Token Lab | 44 → 0 | 48.5 → 6.1 | 48.6 → 6.1 |
| Context Lab | 44 → 0 | 48.4 → 6.1 | 48.6 → 6.1 |
| Tool Calling Lab | 45 → 0 | 42.5 → 6.1 | 48.6 → 6.1 |
| Knowledge Lab | 42 → 0 | 48.5 → 6.1 | 54.6 → 6.2 |
| Runtime Lab | 42 → 0 | 48.5 → 6.1 | 54.6 → 6.1 |
| Reliability Lab | 42 → 0 | 48.5 → 6.1 | 54.5 → 6.1 |
| Constructor / Hub | 34 → 35 | 60.5 → 54.6 | 72.8 → 66.7 |
| Runtime，3D 停靠 | 125 → 122 | 18.2 → 18.2 | 18.3 → 18.3 |
| A/B，3D 停靠 | 74 → 123 | 18.2 → 18.2 | 139.4 → 18.2 |

Atlas 和 Lab 工作区不显示核心：此前被遮挡的画布仍执行 130 次绘制调用/帧，修改后不执行场景 tick。Runtime 和 A/B 中核心画布实际停靠到可见区域，仍继续渲染。测得的遮挡场景 rAF 间隔下降与停止绘制相一致；单次采样不能说明其他设备的提升比例。Hub 和 A/B 的尾部数据波动较大，不能断言这些可见 3D 场景提速。

上轮硬件采样：同一机器的 Chrome Headless、Intel Arc 140T、1440×900、DPR 1，Hub 2 秒内 329 个 rAF 间隔的 p50/p95 为 6.1/6.2 ms，超过 33.4 ms 为 0；Runtime 和 A/B 分别为 330 个间隔、p50/p95 均 6.1/6.2 ms，超过 33.4 ms 均为 0。Headless 调度频率并非显示器呈现帧率，CPU tick 时间也不含 GPU 完成时间；没有优化前的硬件采样，不能与 SwiftShader 基线作性能前后比较。

同一硬件在模拟 DPR 2 下，Hub 的 329 个间隔 p50/p95 为 6.1/6.2 ms，超过 33.4 ms 为 0；Runtime 和 A/B 各 330 个间隔也均为 6.1/6.2 ms、超过 33.4 ms 为 0。诊断显示实际渲染像素比受限为 1.85。100 次相同视图切换、每 10 次强制 GC，堆从 7,041,656 B 到 7,906,164 B；几何体 84、纹理 13、窗口/文档监听器 5/2 保持不变。原始数据 `verify/m32/hardware-dpr2.json`；这不是对 GPU 进程内存、长时间装配或真机屏幕的完整测量。

页面 ready 检测（`__AZ` 就绪后的采样时刻）首次 804 → 779.8 ms、第二次 999.9 → 1051 ms；每项仅一次且无缓存、不含公网延迟，不能据此声称加载改善。基线资源：JS 1,799,036 B / gzip 485,059 B，CSS 205,256 B / gzip 39,031 B；上轮 JS 1,800,452 B / gzip 485,498 B，CSS 205,256 B / gzip 39,031 B，HTML 1,196 B，离线单文件 2,006,852 B / gzip 525,158 B。gzip 是本机计算值，预览服务未启用压缩，实际托管传输取决于服务器。

esbuild metafile 对上轮包的近似贡献：`three.module.js` 493,033 B；应用壳约 61 KB；Tool Calling 知识页约 42 KB；知识资料、实验、模拟器和 A/B 界面均静态进入首包。项目同时要求静态子路径和双击离线单文件，当前构建为二者生成同一同步 bundle；尚未验证双构建拆包对真实网络和交互的收益及回归，故未实施拆包。系统字体，无外部字体或贴图请求；样本中的资源仅同源 HTML、CSS、JS 和浏览器 favicon 请求。390×844 的优化前性能基线、实际公网冷/热缓存、设备级帧耗时和交互延迟 **NOT RUN**。

## 渲染与资源

- `src/app.js`：已完成开场后，如果学习工作区遮挡且未停靠画布则跳过场景 tick，诊断显示“3D 已暂停”，返回时恢复实时读数；真实停靠的 Runtime、执行台、A/B 继续渲染。页面隐藏时不推进开场和场景，恢复时重置时间基准。未改变业务运行结果、核心造型或可见 3D 的后处理。
- 既有 DPR 上限为标准 1.85、低功耗 1.35；低功耗识别依赖视口、触控、CPU 和浏览器内存提示，**不是依据实时负载的动态分档**。现有 bloom、灯光、粒子与核心结构保留；已有硬件 GPU 模拟 DPR 2 的短时采样，尚无真实高 DPI 显示器测试。
- 使用 `WEBGL_lose_context` 在正在运行的 Runtime 触发真实上下文丢失：当前 Runtime、重新打开的 Runtime、A/B 和旧执行台均进入 2D，`verify/m32/final-all.json`。初始 WebGL 不可用时的运行/审批/对比由 M22/M23/M31 浏览器回归覆盖。续修复后已验证上下文恢复时保持 2D，以及刷新后重新建立 WebGL 并恢复 Runtime。
- 上轮构建 100 次 Atlas → Token Lab → Runtime → A/B → Hub 切换，每 10 次强制 GC 后采样：JS 堆 6,717,468 B → 7,745,936 B；中间 7,445,628–7,746,956 B 波动，不能据此判定泄漏或保证无泄漏。renderer 几何体 84、纹理 13；`window` 监听器 5、`document` 监听器 2，所有采样点相同。此测试未反复装卸模块、执行完整 Run、回放或数小时停留；续修复后补做的装配和运行测试见文末。
- rAF 主循环每次仍存在；遮挡视图不再提交 3D 工作。应用全局 `dispose()` 的订阅和监听器清理已在续修复中验证，详见文末的 100 次创建/销毁测试。

## 待处理

1. 在目标 GPU、DPR 1/2 和 390×844 上建立可比的前后帧耗时、掉帧、功耗和长时使用数据；隐藏/恢复标签页和上下文恢复已验证。现有硬件记录只有修改后的无头采样。
2. 对生产静态版和离线单文件分别评估拆包、缓存及压缩，测真实网络条件；保留所有内容和同步导航语义。
3. 已修复此前诊断 FPS 使用限幅动画 `dt` 导致低帧率高估的问题；动画仍限幅，诊断使用原始经过时间。
4. 继续扩充已完成的 100 次装配/运行/移除测试，覆盖回放、Inspector、档案、所有模块、GPU 进程内存及受限设备。

## 续修复及最新复测

- esbuild 从 0.21.5 升至 0.28.2。帧率诊断与动画步进分离：`tests/m32-frame-rate.test.mjs` 验证实际经过 100 ms/帧时显示 10 fps；`verify/m32/repaired.json` 中 SwiftShader Hub 的 34 次 tick、rAF p50 54.5 ms、诊断 17.89 fps，不再被限制到 20 fps。该诊断是窗口平均值，不能代替 GPU 帧时间。
- `node tools/m32-performance.mjs repaired --check --lifecycle --stress` 在续修复构建后执行，条件与前面的 SwiftShader 基线相同：Hub rAF p50/p95 54.5/78.8 ms；Atlas 0 tick、6.1/6.1 ms；Runtime 123 tick、18.2/18.3 ms；A/B 124 tick、18.2/18.3 ms。各 Lab 均 0 tick。与修改前相比仅能说明此环境中被遮挡的渲染被消除，不能推断硬件提速。
- 该构建 JS 为 1,802,693 B / gzip 486,787 B，CSS 205,256 B / gzip 39,031 B，离线单文件 2,009,093 B / gzip 526,428 B；增长包括生命周期修复和保留 Three.js MIT 许可文本。首次/二次 ready 649.3/1602.7 ms；单次无缓存结果不能作为加载改善结论。
- Intel Arc 140T 硬件、DPR 1、独立 profile 下 `deep-100.json` 记录 100 次「装配 Starter → 完整 Runtime → A/B → 移除 Document Reader」：第 5–100 次采样几何体均 132、纹理均 13、程序均 19；每 5 次强制 GC 后的 JS 堆由 8,461,076 B 到 9,109,008 B，第 80–100 次为 9,090,624–9,110,372 B。无浏览器异常。此测试未覆盖数小时停留、所有模块及 GPU 进程总内存。
- `node tools/m32-dispose-check.mjs repeat100` 用隔离浏览器创建/销毁应用 100 次；运行中的 Runtime 被停止，销毁后的日志订阅和窗口/文档监听器不再存活，Bloom 与调色材质都发出真实 dispose 事件。强制 GC 后第 1/51/100 次堆为 6,367,628 / 7,401,632 / 7,438,372 B；不能据此保证所有设备的长期内存稳定。销毁时也释放后处理资源和 WebGL 上下文。
- `node tools/m32-visibility-check.mjs` 实际切换到另一个 Chrome 标签页：隐藏 1.5 秒期间渲染 tick 和开场进度不变，回到前台后恢复；`WEBGL_lose_context` 丢失再恢复后保持 2D，Runtime 可单步。结果在 `verify/m32/visibility-restore.json`。
- `node tools/m32-motion-check.mjs` 在同一隔离配置、权限审批场景及 seed 31415 下对比普通和减少动态两次完整运行：均完成 6 步、1 次批准，配置快照和规范化业务事件/结果一致；证据 `verify/m32/motion-equivalence.json`。

## 受限网络与 UI 补充测量

在相同 Intel Arc / Chrome Headless、1440×900 DPR 1、隔离 profile 和 `/agent-zero/` 生产构建下，用 CDP 模拟 150 ms 延迟、200 KiB/s 下载与 100 KiB/s 上传，服务器均禁用缓存。每种条件仅一次冷启动和一次重新导航，且采样发生在最后一轮 Atlas 小幅修改前；两次导航都不是热缓存。

| 本地测试服务 | 首次 ready | 再次 ready | JS transferSize | JS 下载耗时 |
|---|---:|---:|---:|---:|
| 未压缩 | 10,700.8 ms | 10,484.2 ms | 1,803,097 B | 10,059 ms |
| 测试服务模拟 gzip | 3,388.7 ms | 3,172.1 ms | 487,127 B | 2,755.9 ms |

原始数据为 `verify/m32/load-uncompressed.json`、`verify/m32/load-gzip.json`；transferSize 包含浏览器记账的协议开销。gzip 是实验服务器配置，**不是已部署 GitHub Pages 的实测结果**，也不是本次生产构建已经应用的托管优化。同步 bundle 及真实托管缓存仍是阻断项，不能把该模拟差异当作已交付的加载提升。

进一步用 esbuild 在隔离实验中将五个 Lab 工厂替换为桩，模拟它们不在首包的理论上限：同步 JS 从 1,802,772 B 降至 1,573,255 B，最多减少 229,517 B；此实验没有实现实际加载，也未计入异步加载器、共享 chunk 和协议开销，不能作为可交付性能提升。五个 Lab 输出模块自身合计约 252 KB，其中部分仍被其他功能引用；原始 metafile 和桩实验结果分别为 `verify/m32/bundle-metafile.json`、`verify/m32/lab-split-bound.json`。

相同硬件、无节流的一次 UI 测量（`ui-profile.json` → `atlas-total-green.json`）：Atlas 打开并执行有结果搜索用时 95.9 → 89.5 ms；搜索输入至无结果展示的 6 次 p50/p95 为 169.9/181.7 → 169.7/179.1 ms（含既有 140 ms 防抖）；配置编辑 5 次为 9.2/26.3 → 12.3/40.5 ms；Runtime 单步 4 次为 17.5/22 → 23.1/24.8 ms。样本过少，不能据此声称延迟有统计意义的改善。

在真实页面用 DOM 调用计数复现并修复了 Atlas 打开和有结果搜索时的重复列表重建：每个操作各由两次降至一次；并修复了关闭工作区后延迟焦点恢复抢占用户新焦点的问题。修复后仍观察到约 90 ms 与 74 ms 长任务，分别与 Atlas 初始化/搜索及编辑/Runtime 打开邻近；尚未完成调用栈、慢设备和长日志剖析。最终构建资源：JS 1,802,772 B / gzip 486,820 B；CSS 205,256 B / gzip 39,031 B；离线单文件 2,009,172 B / gzip 526,452 B。
