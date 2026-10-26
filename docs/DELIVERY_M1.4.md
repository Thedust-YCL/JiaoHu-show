# AGENT / ZERO — M1.4 交付与验收

日期：2026-10-25。运行环境：Windows / PowerShell 7 / Node.js / 本机无头Chrome（独立临时配置，SwiftShader）；主界面为简体中文。

## 审计与结果

基线真实运行336项单元测试全部通过。M1.1知识注册表、M1.2前三实验与M1.3后三实验均已有实际实现，未重建知识库、进度系统或模拟引擎。仓库原有M1.3未提交成果全部保留。初始缺失M1.2任务书，用户随后补齐，本轮已全文读取核对并更新来源状态。

本轮整合六章、36概念、49关系、六实验、学习日志与静态深链。最终M1.4浏览器检查50项和M0.3重跑33项，共 **83/83 PASS**；下表A01–A40全部PASS。

## 变更文件（本轮）

| 分组 | 文件 | 作用 |
|---|---|---|
| Atlas | src/knowledge/layout.js；index.js；concepts/helpers.js；src/features/atlas/data/index.js；graph/atlasGraph.js；components/atlasWorkspace.js | 36固定节点、49真实关系，保留旧十节点坐标，组合筛选/搜索/聚焦/关系/实验导航、输入法与列表焦点 |
| Story/章节 | src/knowledge/chapters.js；src/features/knowledge/components/storyWorkspace.js；chapterNarrative.js | 六章共享目标/总结/概念/实验/前后导航，按章/自由探索、续学、跳过/重读与主动完成总结 |
| 学习事件 | src/features/atlas/state/learning.js；src/features/knowledge/components/knowledgePage.js；src/features/atlas/knowledge/toolCalling.js；src/features/knowledge/components/labWorkspace.js | 保留v2兼容字段，真实查看/深入/关联/实验事件，按实验ID聚合完成状态，修正错误概念记录与重复激活 |
| Journal | src/features/atlas/state/journal.js；src/features/knowledge/components/journalWorkspace.js | 独立200条流水、中文时间、六章概览、筛选回访、空态、分别确认清除 |
| 路由/体验 | src/app.js；src/data/content.js；src/components/layout/panels.js；src/styles/zz-learning.css | 全局学习导航、hash深链、前进后退、Tool Calling实验刷新、开场退出焦点、窄屏与reduce |
| 内容 | src/knowledge/concepts/ch01-intelligence.js、ch03-connection.js、ch05-runtime.js、ch06-reliability.js；sources.js | 修正定义/执行方/绝对化表述，复核30外部原文、来源组织与状态 |
| 验证 | tests/m14-learning.test.mjs；m14-journal.test.mjs；atlas.test.mjs；knowledge.test.mjs；m13-content.test.mjs；tools/m03-acceptance.mjs；m04-acceptance.mjs；m11-acceptance.mjs；m14-acceptance.mjs；m14-content-audit.mjs | 新行为/边界单测与浏览器检查；历史断言按36节点/49关系/真实视图尺寸更新 |
| 交付 | package.json；package-lock.json；tools/build.mjs；README.md；index.html；docs/M1.4_PLAN.md；M1_CONTENT_AUDIT.md；本文件 | 验证命令、静态构建、当前说明及审查记录 |

## Atlas验收

完整36节点与49边同源于知识层；无孤立节点、无失效端点、自环或重复边。USES 7、PART_OF 3为有向，RELATED 34、CONTRASTS 5为无向。名称、英文别名与关键词可检索；章节与关系类型可组合筛选，清除恢复全图。单击摘要、双击或显式按钮进详情；摘要/自动搜索不增加学习进度。概念与关系有键盘/目录替代路径。布局固定，旧十节点坐标保留。

## Story验收

六章均通过共享模板呈现目标、核心问题、研究情境、概念、实验、结果解读、边界、前后导航和Atlas出口。按01→06推荐顺序但不锁关。续学保留章节与开场/总结位置；跳过与重读直接控制阅读位置，不自动完成任何学习。主动点击“我已读完本章总结”才完成章节总结，概念阅读和实验状态保持独立。

## Journal/存储验收

- 事件仅来自实际打开知识页、切换深入层、关联跳转、进入实验、完成已有关键操作、主动完成章节总结。自动搜索、预取、章节浏览和动画完成不创建完成状态。
- not_started=未开始；explored=已查看；in_progress=深入/关联/启动实验；completed=本概念关联的核心实验已完成。旧标签保留兼容，completed不等于掌握。
- agent-zero:learning:v2继续是进度唯一权威；实验完成数按有效稳定实验ID去重，最多6个。新增inspectedAt、章节总结和续学位置采用兼容可选字段。
- agent-zero:journal:v1仅保存稳定ID、类型、时间，最多200条，相邻2秒内相同事件去重；不保存用户原文。
- 清除活动只清流水；清除学习进度单独确认且保留活动；装配配置、研究记录、实验记忆均不受影响。旧v1原样保留，重置写空v2避免刷新后重新迁移复活。
- 损坏/更新版原始数据在未确认清除前不覆盖，新活动仅暂存会话并说明；确认清除后可重新保存新进度。无存储权限时明确提示会话限制。异常日期被拒绝，避免日志渲染崩溃。

## 内容审查

详见 [M1_CONTENT_AUDIT.md](M1_CONTENT_AUDIT.md)：36概念中25 published / 11 reviewed，六章各6概念。37来源中36 reviewed、1 needs_review；30外部原文均实际读取，未发现失效链接。唯一待审来源为无人引用的历史索引草稿，不阻断学习。大陆多运营商的真实可达性 **NOT RUN**；产品不依赖这些外站。

## A01–A40逐项验收

证据：verify/m14-report.json（M1.4与R03）；verify/report.json（M0–M1.2首次全回归）；verify/m13-report.json（M1.3及前序）；verify/m14-unit.log；m14-check.log；m14-content-audit.json。

| ID | 验收项 | 结果 | 证据 |
|---|---|---|---|
| A01 | 仓库审计 | PASS | {"chapters":6,"concepts":36,"edges":49,"byStatus":{"outline":0,"draft":0,"reviewed":11,"published":25},"byType":{"USES":7,"RELATED":34,"CONTRASTS":5,"PART_OF":3},"canvas":{"nodes":36,"edges":49},"chapterStats":[{"id":"intelligence","no":"01","total":6,"ready":6,"outline":0,"experiments":1},{"id":"context","no":"02","total":6,"ready":6,"outline":0,"experiments":1},{"id":"connection","no":"03","total":6,"ready":6,"outline":0,"experiments":1},{"id":"knowledge","no":"04","total":6,"ready":6,"outline":0,"experiments":1},{"id":"runtime","no":"05","total":6,"ready":6,"outline":0,"experiments":1},{"id":"reliability","no":"06","total":6,"ready":6,"outline":0,"experiments":1}],"experiments":{"total":6,"available":6,"planned":0},"sources":37} |
| A02 | 六章注册 | PASS | {"pass":true} |
| A03 | 36概念覆盖 | PASS | 36 / 36 |
| A04 | ID兼容与深链 | PASS | 含 A04-lab-route / lab-refresh / history |
| A05 | 关系数据 | PASS | {"pass":true} |
| A06 | Atlas全图/缩放/平移/复位 | PASS | {"changed":true,"moved":true} |
| A07 | Atlas选中与邻居 | PASS | {"pass":true} |
| A08 | Atlas搜索与自动聚焦 | PASS | 含A08-api：无结果后外部定位自动解除阻挡 |
| A09 | Atlas筛选与清除 | PASS | {"pass":true} |
| A10 | 稳定布局 | PASS | {"pass":true} |
| A11 | 关系导航 | PASS | 相关节点：大语言模型 · LLM |
| A12 | 章节模板 | PASS | 6/6 |
| A13 | 六章叙事衔接 | PASS | intelligence→context→connection→knowledge→runtime→reliability |
| A14 | Story跳过与重读 | PASS | {"pass":true} |
| A15 | 自由探索 | PASS | {"pass":true} |
| A16 | 章节状态 | PASS | {"pass":true} |
| A17 | 推荐学习路径 | PASS | {"pass":true} |
| A18 | 路径切换保持进度 | PASS | {"pass":true} |
| A19 | Journal真实事件 | PASS | [{"type":"concept_inspected","at":1792921569527,"chapterId":"knowledge","conceptId":"rag"},{"type":"concept_viewed","at":1792921569524,"chapterId":"knowledge","conceptId":"rag"}] |
| A20 | 状态语义 | PASS | {"pass":true} |
| A21 | Journal筛选 | PASS | {"pass":true} |
| A22 | Journal回访 | PASS | {"pass":true} |
| A23 | Journal空状态 | PASS | {"pass":true} |
| A24 | Journal清除确认 | PASS | {"pass":true} |
| A25 | 存储隔离 | PASS | {"pass":true} |
| A26 | 刷新恢复 | PASS | 含A26-refresh |
| A27 | 迁移与损坏容错 | PASS | 含A27-migration + Node损坏/未来版本/重置恢复 |
| A28 | 六Lab入口 | PASS | 6/6 |
| A29 | 实验完成判定 | PASS | M1.2/M1.3关键操作回归；不会因打开实验而完成 |
| A30 | 跨系统状态 | PASS | {"pass":true} |
| A31 | 内容审查 | PASS | {"pass":true} |
| A32 | 来源状态 | PASS | 37条来源，补充任务书已实际核对 |
| A33 | 模拟声明 | PASS | {"pass":true} |
| A34 | 响应式 | PASS | 1440 / 1024 / 768 / 390px，四核心工作区均无横向溢出 |
| A35 | 无障碍 | PASS | 原生Enter选择与打开、可见焦点、reduce；跳过后的开场不能抢焦点 |
| A36 | WebGL降级 | PASS | {"sceneOk":false,"atlas":true,"chapter":true} |
| A37 | 视觉一致性 | PASS | {"pass":true} |
| A38 | 纯前端与子路径 | PASS | file单文件、真实HTTP /agent-zero/ 子路径与深链刷新；远程业务请求0 |
| A39 | 自动测试/静态检查/构建 | PASS | npm test 346/346；npm run check 108/108语法 + 数据契约0问题；生产构建成功；Token24组复算 |
| A40 | 全阶段回归 | PASS | M0.1 13/13、M0.2 25/25、M0.3 33/33、M0.4 44/44、M1.1 27/27、M1.2 29/29、M1.3 36/36 |

## 实际命令与测试结果

| 命令 | 结果 |
|---|---|
| npm test | 346/346 PASS（基线336，新增10项；每项包含多个ID/边界组合） |
| npm run check | 108/108 JS语法；六章36概念49关系数据契约零问题；dist相对资源通过 |
| npm run build | 成功；dist静态资源与根目录单文件离线版 |
| npm run tokens:verify | 24组真实Token序列全部复算一致 |
| npm run audit:m14 | 36概念、37来源、六实验；问题0 |
| node tools/m14-acceptance.mjs --regress-m03 | 83/83 PASS（含原生键盘、移动、reduce、WebGL、实际HTTP子路径） |
| node tools/shots.mjs | M0.1/M0.2/M0.4/M1.1/M1.2全部通过；M0.3首次3项失败，已修正并重跑33/33 |
| node tools/m13-acceptance.mjs | M1.3本身36/36；前序M0.4/M1.1/M1.2全过；M0.3首次失败已由最新R03结果替代 |

TypeScript类型检查：**NOT RUN / 不适用**。原项目为原生JavaScript，未安装或伪报tsc；实际执行JS解析与严格内容/存储/关系数据契约检查。

## M0–M1.3关键回归

| 阶段 | 实际结果 | 证据 |
|---|---|---|
| M0.1 | 13/13 PASS | tests |
| M0.2 | 25/25 PASS | m02 |
| M0.3 | 33/33 PASS | 最新 R03 |
| M0.4 | 44/44 PASS | m04 |
| M1.1 | 27/27 PASS | m11 |
| M1.2 | 29/29 PASS | m12 |
| M1.3 | 36/36 PASS | m13 |

首次M0.3失败记录保留：A02旧断言只接受13条边且排除PART_OF；A04固定1000×640画布边界；A05无结果搜索后外部定位仍被筛选隐藏。前两项按当前49边/实际viewBox修正，第三项修复产品逻辑，新增A08-api复现测试，最终R03 33/33通过。没有删除原始失败记录或降低验收标准。

独立代码复审发现并修复：损坏进度清除后未解除写保护；Tool Calling实验被知识路由覆盖导致刷新丢失步骤。均有先失败后通过的回归证据。原生键盘验收额外定位并修复开场延迟焦点与Atlas目录重绘焦点丢失。

## 截图与使用

- verify/m14-shots/atlas-desktop.png：36节点全图与中文目录。
- verify/m14-shots/story-desktop.png：共享章节目标/概念/总结入口。
- verify/m14-shots/journal-desktop.png、journal-mobile.png：本机进度与日志；窄屏可纵向滚动访问全部内容。
- 双击 index.html 可直接体验；或 npm run dev → http://127.0.0.1:5187/。全局导航可在章节/星图/实验/学习日志/中央核心间切换。

## 遗留与技术纪律

- P0/P1阻塞：无。
- P2：无人引用的历史索引草稿来源待审；境外参考在大陆多运营商网络可达性未实测。核心学习/实验不依赖外网。
- NOT RUN：真实硬件多GPU帧率、真机触屏/屏幕阅读器人工测试；浏览器自动化已覆盖390px布局、键盘、reduce与无WebGL路径。没有据此宣称所有设备60fps或完整无障碍认证。
- 100%纯前端；生产仅静态资源；无业务后端、真实AI/Embedding/MCP API、云数据库或运行时远程研究请求。验证用Node静态服务仅本地测试。
- 仅本地文件/Git工作区变更；未提交、未推送、未部署，未重置或删除用户历史与真实浏览器存储。

M1.4整合范围已达到本任务的验收门槛，M1知识宇宙阶段可结束；后续M2.1扩展完整Agent Constructor，不重复建设知识架构。
