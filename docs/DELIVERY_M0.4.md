# AGENT / ZERO — 交付说明（M0.4 研究闭环与来源追溯）

> 面向本仓库当前交付：`docs/PRD .md`（v0.7）+ `docs/DESIGN_SYSTEM.md`（AZ-DESIGN v1.0）
> + `docs/M0.4_TASK.md` 的**可运行前端实现**，承接已通过验收的 M0.1 / M0.2 / M0.3。
> 使用方式见 [README.md](../README.md)；M0.3 的交付说明保留在 [DELIVERY.md](./DELIVERY.md)。

## 1. 实际交付清单

| 交付物 | 路径 | 说明 |
|---|---|---|
| 离线单文件演示 | [index.html](../index.html) | 双击即运行，CSS/JS/three.js 全内联，运行期零外部请求（约 1.07 MB） |
| 标准静态包 | [dist/index.html](../dist/index.html) · `dist/assets/app.js`（980 KB） · `dist/assets/app.css`（110 KB） | 相对路径 + 无前端路由，可直接部署到 GitHub Pages 子路径 |
| MISSION 001 研究包 | [src/research-packs/mission-001/](../src/research-packs/mission-001/) | 9 份虚构公告（含更正链 + 未决冲突）+ 3 张方案比较卡 + 数据校验器，`mission-001@2` |
| 证据规则层 | [src/simulation/rules/evidence/](../src/simulation/rules/evidence/) | 可见声明抽取 / 冲突分组 / 更正关系核验（六条必要条件） |
| 报告生成器 | [src/simulation/reports/generateReport.js](../src/simulation/reports/generateReport.js) | R1–R6 + 真实指标 + 稳定引用编号，纯逻辑 |
| 报告阅读器 | [src/features/reports/](../src/features/reports/) | 三栏阅读（目录 / 正文 / SOURCE INSPECTOR）、引用双向跳转、Markdown 导出 |
| 自动测试 | [tests/](../tests/) | `npm test`：**163 项**（M0.1–M0.3 的 97 项 + M0.4 新增 66 项），node:test，无需浏览器 |
| 浏览器验收 | [tools/m04-acceptance.mjs](../tools/m04-acceptance.mjs) 由 [tools/shots.mjs](../tools/shots.mjs) 驱动 | T01–T13 + A01–A23 + A01–A30 + **A31–A70（M0.4）** |
| 验收截图 | [verify/shots/](../verify/shots/) | F01–F22 旧帧 + **F23–F30（+F30b）** 新帧 + 4 视口 + 移动端抽屉，共 37 张 |
| 自检报告 | [verify/report.json](../verify/report.json) | 每次 `npm run shots` 覆盖写入，含每项 PASS/FAIL 与证据文本 |

### 1.1 研究包规模与事实建模

| 类别 | 实际交付 |
|---|---|
| 虚构校园公告 | **9 份**：`NTC-1001…NTC-1009`。其中 5 份沿用 M0.3 的稳定 ID 与原文（一字未改），4 份为 M0.4 新增 |
| 有效更正关系 | **1 组**：`NTC-1006`（10/18，2026-10-12 发布）→ `NTC-1007`（10/20，2026-10-13 发布，`supersedes: ["NTC-1006"]`，正文含「予以更正」并指向原公告标题） |
| 不可消解冲突 | **1 组**：`NTC-1008`（10/24，就业指导中心）vs `NTC-1009`（10/26，计算机学院学工办），双方均无 `supersedes` |
| 可引用片段 | 每份公告 ≥ 2 个片段（`#summary` + `#body-N`），共 30 个片段，ID 全局唯一 |
| 事实声明映射 | 每份公告 ≥ 1 条 `claim`（谓词 + 值 + anchor + 允许片段类型）；正文级声明（`revision_notice` / `revision_target`）只在读到正文时才可能出现 |
| 技术方案比较卡 | 3 张：规则自动化 / 固定 LLM 工作流 / Agent 式流程，各含前提、优势、代价、适用条件与教学免责说明 |
| 检索/读取故障 | 沿用 M0.3 的 `search_timeout`；不新增随机故障 |

> 说明：任务书对公告数量给的是「6–8 份」的建议范围。本包保留 M0.3 的 5 份稳定资料（A34 要求不得改名）并新增 4 份，共 9 份；这些资料全部真实进入检索 / 读取 / 引用链路，没有只为凑数的资料。

## 2. 代码改动摘要

### 2.1 新增（19 个文件）

```
src/research-packs/index.js                      研究包注册表（mission-001 / mission-001-mini）
src/research-packs/mission-001/notices.js        9 份虚构公告 + 方案卡引用 + 范围标签
src/research-packs/mission-001/comparison.js     3 张方案比较卡
src/research-packs/mission-001/validate.js       数据完整性校验 + prepareCorpus（坏资料剔除）
src/research-packs/mission-001/index.js          版本化研究包入口（missionVersion 2）
src/simulation/rules/evidence/claims.js          可见声明抽取（只认本次返回的文本/元数据）
src/simulation/rules/evidence/conflicts.js       eventKey + 字段 的冲突分组
src/simulation/rules/evidence/revision.js        更正核验六条必要条件（逐条给出缺失原因）
src/simulation/rules/evidence/index.js           证据评估入口 + 必要条件表 + 指标
src/simulation/reports/generateReport.js         结构化报告生成（纯逻辑 + 固定模板）
src/features/reports/components/reportView.js    报告阅读器 + SOURCE INSPECTOR + 引用导航
src/features/reports/export/markdown.js          Markdown 串行化 + 本地下载 + 转义
src/features/reports/state/reportState.js        报告派生状态（指标合并 / legacy 判定 / 反查）
src/styles/reports.css                           报告阅读与证据分支样式（含窄屏降级）
tests/research-pack.test.mjs                     17 项（数据包与校验）
tests/evidence.test.mjs                          20 项（可见性 / 冲突 / 核验 / 分支 / 确定性）
tests/report.test.mjs                            16 项（报告 / 引用 / 指标 / 导出）
tests/research-persistence.test.mjs              13 项（运行历史 / 兼容 / 损坏降级）
tools/m04-acceptance.mjs                         A31–A70 + F23–F30 浏览器验收
```

### 2.2 增量修改（不推倒重写）

| 现有组件 | 增量内容 |
|---|---|
| [src/simulation/engine/runSimulation.js](../src/simulation/engine/runSimulation.js) | **同一个引擎**：读取阶段由「只读首条」扩展为「按任务包声明读取本次可见的多条」（mini 声明 `readLimit=1`，事件序列与 M0.3 逐条一致）；新增证据阶段与报告装配；`RunOptions` 增加 `evidencePolicy` |
| [src/simulation/events/schema.js](../src/simulation/events/schema.js) | schemaVersion 2；新增 `REPORT` 阶段、8 个证据/报告事件类型、`unresolved`/`skipped` 状态、`evidence_kernel`/`report_composer` 参与者、`research_complete`/`research_partial` 结局、`EVIDENCE_POLICIES` |
| [src/simulation/events/serializer.js](../src/simulation/events/serializer.js) | runId 纳入研究策略；v2 形状校验 + v1 只读兼容；`parseHistory` 返回 `legacy` 标记 |
| [src/simulation/rules/branches.js](../src/simulation/rules/branches.js) | 新增第二根轴「证据分支」E00–E05 与多分支同时成立的计算 |
| [src/simulation/tools/documentReader.js](../src/simulation/tools/documentReader.js) | 返回片段级文本 `chunks`；`includeMetadata=true` 时暴露 `publisherId / eventKey / supersedes / validity`；`chunkIds` 与片段清单统一 |
| [src/simulation/tools/announcementSearch.js](../src/simulation/tools/announcementSearch.js) | 语料来源切换到 mission-001 研究包（范围标签与排序规则不变） |
| [src/features/execution/components/executionWorkspace.js](../src/features/execution/components/executionWorkspace.js) | 研究策略选择器、`VIEW: EXECUTION / REPORT` 切换、最近两次运行历史、报告视图与执行视图共用同一个 Run |
| [src/features/execution/components/executionGraph.js](../src/features/execution/components/executionGraph.js) | 证据分支候选条（可多条同时标记为「已执行」） |
| [src/features/execution/components/inspector.js](../src/features/execution/components/inspector.js) | 显示参与判断的可见声明、核验必要条件逐条结果与报告状态 |
| [src/features/execution/state/persistence.js](../src/features/execution/state/persistence.js) | 新命名空间 `agent-zero:research:v2`（最近两次）；`agent-zero:execution:v1` 只读兼容；容量与隐私模式降级 |
| [src/data/content.js](../src/data/content.js) · [src/app.js](../src/app.js) | 新增「研究报告」导航入口；画布停靠改用 `ResizeObserver` 校正尺寸；暴露研究包与校验器给验收脚本 |
| [tools/shots.mjs](../tools/shots.mjs) · [tools/m03-acceptance.mjs](../tools/m03-acceptance.mjs) | 接入 M0.4 验收；M0.3 断言随数据包与命名空间更新（语义不变） |

### 2.3 关键接口位置

| 关注点 | 位置 |
|---|---|
| **配置唯一权威 store** | `src/features/constructor/state/store.js`（`agent-zero:constructor:v1`），M0.4 未新增任何配置源 |
| **证据纯逻辑入口** | `evaluateEvidence()` → `src/simulation/rules/evidence/index.js` |
| **更正核验规则** | `evaluateConflict()` → `src/simulation/rules/evidence/revision.js`（六条必要条件，逐条返回 `requirements` / `missing`） |
| **报告生成入口** | `generateReport()` → `src/simulation/reports/generateReport.js` |
| **事件 ↔ 引用关联** | 事件带 `claimIds` / `sourceIds` / `chunkIds`；报告 `citations[].eventId` 指向该片段进入本次研究的 `tool.result` 事件；`claimsForEvent()` / `citationsForSource()` 位于 `src/features/reports/state/reportState.js` |
| **运行产物挂载点** | `run.artifacts.evidence`（声明/冲突/判定/计数）与 `run.artifacts.report`（ResearchReport） |

### 2.4 数据纪律（关键实现选择）

1. **范围 = 发布栏目**：`NTC-1007`（更正公告）发布在「事务通知」栏目，`scope: 'service_notice'`。因此 `searchScope=campus_events` 时**看不到**它 —— 这是 A47 的真实数据前提，而不是伪造的截断。
2. **正文级证据门槛**：`revision_notice` / `revision_target` 两条声明的 `scope` 为 `body`，摘要模式下永远抽不到 → 摘要里即使出现新日期，也只能得到「证据不足」。
3. **元数据门槛**：`published_at / publisher_id / event_key / supersedes / validity` 五类声明只能由 `document_reader` 在 `includeMetadata=true` 时返回；关闭后核验一律降级为 `metadata_missing`。
4. **去重与唯一**：同资料同谓词只保留一条声明（正文优先于摘要）；引用按 `sourceId + chunkId` 稳定排序，同一片段永远同一编号。

## 3. 测试结果（实际执行）

### 3.1 自动逻辑测试（`npm test`）— 163 / 163 通过

| 文件 | 项数 | 覆盖 |
|---|---:|---|
| `constructor.test.mjs` / `persistence.test.mjs` / `atlas.test.mjs` / `execution.test.mjs` / `simulation.test.mjs` | 97 | M0.2–M0.3 既有回归（未删减，仅随新命名空间与数据包更新断言） |
| `research-pack.test.mjs` | 17 | ID 唯一、虚构标识、anchor 有效性、更正对、未决冲突、范围过滤、循环/悬空/跨事项/倒置 supersedes、非法日期、坏资料剔除 |
| `evidence.test.mjs` | 20 | 可见性边界（摘要 / 元数据 / 搜索摘要）、冲突事件、更正成立、未决、证据不足、COLLECT_ONLY、六条必要条件逐条失败、确定性与策略隔离、旧任务包事件序列不变 |
| `report.test.mjs` | 16 | 六部分、状态由证据计算、条件性建议、10/18 与 10/20 双引用、引用可解析、引用文本范围、编号稳定、指标真实、Markdown 内容/文件名/转义 |
| `research-persistence.test.mjs` | 13 | 两次历史、完整产物恢复、容量淘汰、旧记录只读兼容、坏 JSON/坏结构/单条坏记录/配额不足降级 |

### 3.2 浏览器真实验收（`npm run shots`）

```
M0.1 回归        13 / 13 通过
M0.2 装配        25 / 25 通过
M0.3 知识与执行   33 / 33 通过
M0.4 研究闭环     44 / 44 通过   ← A31–A70（40 项）+ D06 + A53b
页面异常         0 条
四视口横向溢出    0 px（1920×1080 / 1280×800 / 1024×768 / 390×844）
```

### 3.3 A31–A70 逐项结果

| ID | 场景 | 结果 | 实测证据（摘自 `verify/report.json`） |
|---|---|---|---|
| A31 | 数据集版本与稳定 ID | **PASS** | 资料=9 · 片段=30 · 校验问题=[] · 虚构标记=true |
| A32 | 更正对 10/18 → 10/20 | **PASS** | `evt-open-campus` · 2026-10-18 → 2026-10-20 · supersedes=["NTC-1006"] |
| A33 | 不可消解冲突 | **PASS** | `evt-career-fair` · 2026-10-24 / 2026-10-26 · supersedes 均为空 |
| A34 | 保持 M0.3 ID 与工具 schema | **PASS** | mini 资料逐字保留=true · 可装配工具仅两种 |
| A35 | Search 过滤与数量 | **PASS** | 检索返回 5 → 读取 5 · 读到未返回资料=0 |
| A36 | Reader 全文/摘要 | **PASS** | 全文：读取响应 5 份均为 `full_text`；摘要：`textScope=summary`、更正成立=0、证据不足事件=1 |
| A37 | includeMetadata=false | **PASS** | 元数据声明=0 · `metadata_missing` 事件=2 · 更正成立=0 |
| A38 | 重复资料与非法关系 | **PASS** | 发现问题码 DUPLICATE_SOURCE_ID / INVALID_DATE / DUPLICATE_CHUNK_ID / SUPERSEDES_TIME_ORDER / SUPERSEDES_CYCLE · 剔除 2 条 |
| A39 | claim 来源 | **PASS** | 文本级声明 7 条，全部可追溯到本次真实事件 |
| A40 | 正常发现冲突 | **PASS** | 冲突事件=2 · 首个冲突 sourceIds=["NTC-1008","NTC-1009"] |
| A41 | 正确核验 | **PASS** | 规则 `rule.evidence.revision.confirmed` · NTC-1006 → NTC-1007 · 旧资料仍在证据集中 |
| A42 | 无法核验 | **PASS** | 缺失原因=["MISSING_SUPERSEDES"]，未决事件 ruleId=`...noSupersession` |
| A43 | COLLECT_ONLY | **PASS** | 跳过事件=2 · 更正成立=0 · 报告 partial |
| A44 | Search 不可用 | **PASS** | B02 · 成功检索=0 · 报告 blocked · 引用=0 |
| A45 | Reader 不可用 | **PASS** | B03 · 读取成功=0 · 更正成立=0 · 引用级别=search_excerpt |
| A46 | faultMode=search_timeout | **PASS** | B04 · 错误事件=1 · 报告 blocked |
| A47 | 只含旧公告 | **PASS** | campus_events 可见 5 条不含 NTC-1007 · 开放日取值仅 2026-10-18 · 更正事件=0 |
| A48 | RunOptions 独立性 | **PASS** | 装配仍只有两种工具 · `RunOptions={faultMode,evidencePolicy}` |
| A49 | 固定输入可复现 | **PASS** | 两次运行 runId 相同、事件与报告完全一致 |
| A50 | 快照隔离 | **PASS** | 旧 Run 未被改写 · 新 Run runId 不同 · 新 Run 读全文数=0 |
| A51 | Replay 扩展 | **PASS** | 冲突/核验/报告事件可播放、暂停、单步、Seek 到末尾 |
| A52 | 3D/2D 同步 | **PASS** | 二维视图下节点与 Inspector 同为 `#e20`，且暂停中 |
| A53 | 六部分报告 | **PASS** | R1–R6 齐全 · 局限 5 条 · 建议 4 条 |
| A54 | 条件性建议 | **PASS** | 3 张方案卡 · 明确提到「规则自动化」适用条件 · 无「Agent 唯一正确」表述 |
| A55 | 更正报告 | **PASS** | 10/18 旧事实引用 NTC-1006=true · 10/20 更正引用 NTC-1007=true |
| A56 | 未决报告 | **PASS** | 未决陈述=2 · conflictsResolved=0 |
| A57 | 引用完整性 | **PASS** | 引用 5 条 · 无法解析=0 · 陈述引用均存在 |
| A58 | 引用文本范围 | **PASS** | 引用片段与本次读取响应逐条比对通过 |
| A59 | Source Inspector | **PASS** | 引用 S4 · 标题「秋季校园招聘会公告」 · 含 sourceId/chunkId/eventId · 高亮 1 处 |
| A60 | Report → Replay | **PASS** | citation S4 → 事件 `#e12`，执行图节点与 Inspector 同一 ID |
| A61 | Replay → Report | **PASS** | 返回入口可见、视图回到 report、原段落高亮 1 处 |
| A62 | 指标准确 | **PASS** | 读取 5/5 · 全文 5 · 冲突 2 · 调用 6/6 · 事件 23 · 面板一致 |
| A63 | Markdown 导出 | **PASS** | 3698 字符，标题/模拟声明/引用齐全/未决段/局限段/元信息全部命中，文件名 `AGENT-ZERO_MISSION-001_run-34ef522b.md` |
| A64 | 旧版 Run 兼容 | **PASS** | 恢复 `run-legacy0001`（schemaVersion 1）· 报告标题「尚无结构化报告」· 陈述数=0 |
| A65 | 新版恢复 | **PASS** | 刷新后事件 23 / 陈述 11 / 引用 5，配置保留 |
| A66 | 损坏数据 | **PASS** | 坏 JSON 降级提示可见 · 新运行照常 · 页面可用 |
| A67 | 窄屏与键盘 | **PASS** | 横向溢出 0 · 引用可聚焦 · 来源面板可见 |
| A68 | WebGL 与减少动态 | **PASS** | WebGL=false + reducedMotion=true 下仍可核验阅读、回放、报告与导出 |
| A69 | 前三阶段回归 | **PASS** | Hub / Atlas（10 节点 + 10 边）/ Tool Calling / 装配 / 回放全部可用 |
| A70 | 纯静态部署 | **PASS** | 外部资源=0 · 绝对 URL 引用=0 · 单文件内联 · 无业务 API 请求 |

补充两项自动化断言：`D06`（决策可解释：8 条必要条件全部通过 + 规则 ID 可见）与 `A53b`（报告正文可在 R1–R6 / 指标 / 未决区块定位）。

### 3.4 F23–F30 验收帧

| 帧 | 文件 | 验收结论 |
|---|---|---|
| F23 | `F23-MISSION001启动界面.png` | 研究任务、`SIMULATED` 声明、配置快照（检索范围/上限、读取方式、元数据）、研究策略与故障模式在同一屏可辨认 |
| F24 | `F24-两份公告冲突显现.png` | 冲突事件选中，两条证据路径的 sourceId 同时出现在 Inspector；证据分支条以 Amber 标出「发现冲突」 |
| F25 | `F25-更正链核验成立.png` | 同一事件链上显示 `evidence.revision_confirmed`，旧来源仍在证据集中；三维核心、执行图、时间轴、Inspector 使用同一 eventId |
| F26 | `F26-未决冲突状态.png` | COLLECT_ONLY 下的报告：状态「部分完成 · 仍有未决」，无绿光成功；双来源保留，缺失依据在陈述中写明 |
| F27 | `F27-Report全景.png` | 三栏科研档案阅读：目录 / 正文 / 来源，引用标记明显、正文行宽受控 |
| F28 | `F28-Citation-SourceInspector.png` | 片段高亮（Amber 标记）+ SOURCE ID / CHUNK ID / eventId / 可见元数据同时可读，信息不拥挤 |
| F29 | `F29-Report与Execution联动.png` | 从引用跳到执行事件后，执行图当前节点与 Inspector 的 eventId 与引用完全一致 |
| F30 / F30b | `F30-移动端与2DFallback.png` / `F30b-无WebGL二维降级报告.png` | 390×844 下目录默认折叠、正文可读、来源面板可达；无 WebGL + 减少动态仍能读报告与追溯 |

> 截图只评价视觉；数据与逻辑联动由 §3.2 / §3.3 的实测断言证明。

## 4. 旧阶段回归

| 阶段 | 回归结论 |
|---|---|
| M0.1 | T01–T13 全部通过：开场可跳过/重播、五镜头收敛、Hub 布局、检视联动、二维兜底、键盘 |
| M0.2 | A01–A23 全部通过：点击/拖拽装配、端口兼容、字段校验、三维/二维/检视同步、持久化与损坏兜底 |
| M0.3 | A01–A30 全部通过：Atlas 10 节点/10 关系、Tool Calling 知识页与内嵌实验、B01–B05 分支、回放控制、学习进度命名空间独立 |
| 数据兼容 | `mission-001-mini` 与 `agent-zero:execution:v1` 保持只读可用；Tool Calling 知识页的内嵌实验仍使用 mini 包，行为未变 |

## 5. 静态部署核验

- `npm run build` 产出 `dist/index.html` + `dist/assets/app.js` + `dist/assets/app.css` + 根目录单文件 `index.html`；全部引用相对路径（`./assets/...`）。
- 构建时把 three.js / 全部样式打包进产物，运行期不请求任何 CDN、字体或业务接口：`A30` / `A70` 实测外部资源 **0**、绝对 URL 引用 **0**、业务 API 请求 **0**。
- 项目无前端路由，深链刷新不会 404；`file://` 直接打开（单文件版）即可完整运行 —— 这是最严格的离线条件，验收全程正是这样执行的。
- 首次打开仍需加载页面自身资源，本阶段**不包含** PWA / Service Worker。

## 6. 限制与剩余问题

1. **资料与结论均为虚构教学样本**：`isFictional: true`，不含真实学校公告、真实日期与真实个人信息；报告中的「更正成立」只在本教学数据与模拟规则内成立。
2. **规则不是模型推理**：claim 抽取依赖研究包内预设的「谓词 + anchor」映射，没有调用任何语言模型；换一种句式写公告就可能抽不到 —— 这正是 R5 里写明的边界。
3. **不联网、不接真实 AI**：无真实检索、无 MCP 握手、无 LLM API；`Agent 式流程` 只做概念比较，没有伪造自主运行轨迹。
4. **规模**：9 份公告、1 组更正链、1 组未决冲突、3 张方案卡；任务书中「8–12 份公告 / 4–6 份技术资料 / 多个注入情境」的更大规模属于后续阶段。
5. **A47 的数据前提**：为了让「只看到旧公告」可复现，更正公告被放在「事务通知」栏目（`scope: service_notice`）。这是**栏目差异**造成的真实可见性差异，不是伪造截断。
6. **运行历史容量**：本地只保留最近两次 Run（可用 Markdown 导出留存更早结论）；不使用 IndexedDB，单次 Run 约 60–80 KB。
7. **无头环境性能数字不可当结论**：截图中的帧率来自 SwiftShader 软件渲染，不代表真实 GPU 性能；未在移动真机实测。
8. **未执行项**：真实浏览器下载对话框（`a[download]` 已触发、串行化内容已断言，但无头环境无法确认系统级弹窗）；真实 GPU 帧率；跨设备同步。

## 7. M0 Golden Path 最终结论

按本次真实执行结果：**M0 完成（无阻断）**。

Boot → Hub → Constructor（装配 Search / Reader）→ Atlas / Tool Calling → RUN SIMULATION → 冲突核验（10/18 → 10/20 成立；另一组保持未决）→ Replay → Report（含来源反查与 Markdown 导出）→ 改配置重跑（报告与证据按配置变化、旧 Run 不被覆盖）—— 这条链路在 `npm run shots` 中逐段被驱动并断言通过，页面异常 0 条。

前提与边界（必须一起读）：这一切发生在**纯静态、无后端、无真实 AI、资料全虚构**的教学实验室里；「M0 完成」指本阶段的演示闭环通过验收，**不**等于六章节内容、完整 Agent Constructor、真实联网 Deep Research 或 M1–M4 已完成。
