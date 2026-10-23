/**
 * src/data/content.js
 * ------------------------------------------------------------------
 * 单一权威内容源：几何参数、部件词条、导航、章节与术语。
 * 全部为本地静态数据（P0：不请求任何外部数据/业务接口）。
 *
 * 名词策略（DESIGN_SYSTEM §1.1）：专有名词与系统标签保持英文，
 * 中文作为分类与教学解释；不翻译成似是而非的中文造词。
 *
 * M1.1：六章蓝图与术语索引改为**由知识层派生**，不再手写第二份
 * （见文件末尾 CHAPTERS / TERM_INDEX），避免两处章节或术语对不上。
 * ------------------------------------------------------------------
 */
import { CHAPTERS as CHAPTER_REGISTRY } from '../knowledge/chapters.js';
import { CONCEPTS, CONCEPT_ORDER, getConceptsByChapter } from '../knowledge/concepts/index.js';

/** AZ-CORE 01 归一化几何参数（原文来自 DESIGN_SYSTEM §3.3 与 M0.1_TASK §4.2） */
export const GEOMETRY = Object.freeze({
  coreRadius: 1.0,
  shellPerturb: 0.075,
  constraintRingRadius: 1.16,
  rings: [
    { id: 'ring-1', radius: 1.45, tilt: -35, speed: 0.5, thickness: 0.042 },
    { id: 'ring-2', radius: 1.9, tilt: 25, speed: -0.35, thickness: 0.05 },
    { id: 'ring-3', radius: 2.4, tilt: 65, speed: 0.2, thickness: 0.034 },
  ],
  portRadius: 2.5,
  portSpread: 2.9,
  portCount: 12,
  cameraFov: 40,
  /** Hub 标准镜位（开场第 04/05 镜头收敛到此姿态）
   *  取景依据：三组轨道外缘半径 2.40，纵向 FOV 40° → 约 7 单位可完整容纳并留出装配空间；
   *  极角约 71°、方位 26°，轻微偏轴以展示轨道相互穿插的空间深度。 */
  hubCamera: { x: 2.9, y: 2.35, z: 5.85, target: { x: 0, y: 0, z: 0 } },
  zoom: { min: 4.2, max: 11.5 },
});

export const SIMULATED_CONSTANT = 'SIMULATED · 本地教学模拟';

/**
 * 可选中部件：视觉高亮、Inspector 文案、2D 图高亮三处共用同一份数据，
 * 保证“唯一选中状态”不出现两套真假状态（M0.1_TASK §6.2-6）。
 */
export const PARTS = Object.freeze({
  shell: {
    id: 'shell',
    index: 'L0',
    name: 'Obsidian Shell',
    cn: '黑曜切面外壳',
    sub: 'L0 / POLYHEDRAL FACET SHELL',
    tags: ['L0', 'Geometry', 'Faceted'],
    state: { label: '静态可用', tone: 'muted', shape: 'diamond' },
    metrics: [
      ['Vertices', '42 · icosahedron'],
      ['Facet', 'Flat-shaded 20 面'],
      ['Radius', '1.00'],
      ['Material', 'Obsidian graphite'],
    ],
    understand:
      '这是 AZ-CORE 01 的实体外壳：由二十面体顶点做确定性微扰后形成的**非规则切面**，因此它永远是多面体，不会退化成一颗普通发光球。切面之间的裂隙就是内部能量可见的唯一通道。',
    inspect: [
      ['几何来源', 'IcosahedronGeometry(1, 0) + 顶点确定性扰动，全部程序化生成'],
      ['面法线', 'Flat shading，棱面明暗由面法线而非贴图产生'],
      ['教学映射', 'L0 对应“模型核心”——只处理语言的基础能力'],
      ['越界提醒', '外壳不是 Agent；Agent 是围绕核心与运行环境形成的执行系统'],
    ],
    notes: [
      ['边界', '外壳只是视觉与教学映射，不代表软件架构中真实存在这一层实体。'],
    ],
    related: ['core', 'ring-1', 'ports'],
  },

  core: {
    id: 'core',
    index: 'L1',
    name: 'Energy Core',
    cn: '内部能量核',
    sub: 'L1 / CONSTRAINED ENERGY VOLUME',
    tags: ['L1', 'Emissive', 'Cool white'],
    state: { label: '待机 · 低强度呼吸', tone: 'signal', shape: 'round' },
    metrics: [
      ['Radius', '0.90'],
      ['Color', 'Cool white → Signal'],
      ['Emission', 'Additive · 受控'],
      ['Pulse', '0.16 Hz 呼吸'],
    ],
    understand:
      '冷白能量在约束体积内缓慢呼吸，只能从外壳裂隙透出。它的亮度由系统状态驱动：`DORMANT` 几乎不可见，`BOOTING` 依次点亮，`IDLE` 保持克制，`FOCUSED` 局部增强。',
    inspect: [
      ['发光策略', '不用大面积 Bloom 掩盖结构，裂缝与轮廓本身可读'],
      ['状态驱动', '亮度来自 sceneState.coreIntensity，不由视觉动画反向决定业务状态'],
      ['降级', '关闭后期光效后，核心仍能凭剪影与切面明暗辨认'],
    ],
    notes: [
      ['诚实声明', '本原型不模拟真实模型推理；能量亮度只是状态可视化的教学映射。'],
    ],
    related: ['shell', 'channels'],
  },

  constraint: {
    id: 'constraint',
    index: 'L1·R',
    name: 'Constraint Ring',
    cn: '内部约束环与刻度',
    sub: 'L1-R / INNER BOUNDARY GAUGE',
    tags: ['Boundary', 'Gauge', 'Static'],
    state: { label: '静态可用', tone: 'muted', shape: 'diamond' },
    metrics: [
      ['Radius', '1.16'],
      ['Gauge', '72 ticks · 5° 间隔'],
      ['Tick length', '0.045'],
      ['Motion', '静态基准'],
    ],
    understand:
      '约束环标出核心的边界与刻度基准。所有外部连接必须在它之外发生——这是一个视觉化的“边界”隐喻，用来说明权限与作用域总是有边界的。',
    inspect: [
      ['刻度语义', '每格 5°，用于读取轨道倾角的相对关系'],
      ['为什么静态', '边界本身不应随待机动画漂移，否则读数失去意义'],
    ],
    notes: [['边界', '刻度不承载业务数据，只提供空间参照。']],
    related: ['shell', 'ring-1'],
  },

  'ring-1': {
    id: 'ring-1',
    index: 'L2·A',
    name: 'Gimbal Ring A',
    cn: '机械轨道 A',
    sub: 'L2 / GIMBAL FRAME · TILT −35°',
    tags: ['L2', 'Gimbal', 'Tilt −35°'],
    state: { label: '待机 · 缓慢相对旋转', tone: 'signal', shape: 'round' },
    metrics: [
      ['Radius', '1.45'],
      ['Tilt', '−35°'],
      ['Rate', '+0.50 °/s'],
      ['Thickness', '0.042'],
    ],
    understand:
      '三组机械轨道中最内的一组。它们不是装饰性魔法阵：不同倾角提供了**可扩展的结构空间**，用于安置未来的能力模块与接口。',
    inspect: [
      ['为什么三组', '单一平面无法表达“不同能力处于不同空间层”的关系'],
      ['旋转速率', '轨道 A +0.50°/s，与 B、C 方向不同，形成可读的空间层次'],
      ['当前边界', '轨道是静态几何；可装配的只有登记在 SEARCH_PORT / READER_PORT 上的两个工具模块'],
    ],
    notes: [['诚实声明', '轨道目前是几何结构，端口为静态机械接口；只有两个兼容接口可用于装配。']],
    related: ['ring-2', 'ring-3', 'ports'],
  },

  'ring-2': {
    id: 'ring-2',
    index: 'L2·B',
    name: 'Gimbal Ring B',
    cn: '机械轨道 B',
    sub: 'L2 / GIMBAL FRAME · TILT +25°',
    tags: ['L2', 'Gimbal', 'Tilt +25°'],
    state: { label: '待机 · 缓慢相对旋转', tone: 'signal', shape: 'round' },
    metrics: [
      ['Radius', '1.90'],
      ['Tilt', '+25°'],
      ['Rate', '−0.35 °/s'],
      ['Thickness', '0.050'],
    ],
    understand:
      '中间轨道是三组中唯一反向旋转的一组：它的任务是与相邻轨道互相穿插，制造真实的前后遮挡关系，避免整台装置看起来像一张平面贴图。',
    inspect: [
      ['空间关系', '与 Ring A / Ring C 在不同角度相交，用于检验深度与遮挡'],
      ['材质', '哑光钛灰、纤细高光，避免强镜面反射'],
    ],
    notes: [['性能', '轨道几何为程序化低面数 Tube/Torus，无外部模型文件。']],
    related: ['ring-1', 'ring-3'],
  },

  'ring-3': {
    id: 'ring-3',
    index: 'L2·C',
    name: 'Gimbal Ring C',
    cn: '机械轨道 C',
    sub: 'L2 / GIMBAL FRAME · TILT +65°',
    tags: ['L2', 'Gimbal', 'Tilt +65°'],
    state: { label: '待机 · 缓慢相对旋转', tone: 'signal', shape: 'round' },
    metrics: [
      ['Radius', '2.40'],
      ['Tilt', '+65°'],
      ['Rate', '+0.20 °/s'],
      ['Thickness', '0.034'],
    ],
    understand:
      '最外层的轨道最接近正面相机，倾角最大。它定义了整台装置的外轮廓，也是外部能力端口的主要承载面。',
    inspect: [
      ['视觉职责', '在静止截图中提供最外层轮廓与精密感'],
      ['数据流', '只有低密度脉冲沿通道流动，待机不持续爆发'],
    ],
    notes: [['边界', '轨道倾角为设计初值，允许实测微调；结构层次与运动方式是冻结项。']],
    related: ['ring-1', 'ring-2', 'ports'],
  },

  ports: {
    id: 'ports',
    index: 'L3',
    name: 'Interface Ports',
    cn: '接口 / 装配定位点',
    sub: 'L3 / ASSEMBLY INTERFACE POINTS',
    tags: ['L3', 'Assembly ready', '2 compatible'],
    state: { label: '2 个兼容接口可装配', tone: 'signal', shape: 'diamond' },
    metrics: [
      ['Count', '12'],
      ['Radius', '2.50 – 2.90'],
      ['Geometry', 'Chamfered hex interface'],
      ['Compatible', 'SEARCH_PORT · READER_PORT'],
    ],
    understand:
      '端口是外部能力接入的位置。12 个机械接口中有两个被登记为**兼容接口**：`SEARCH_PORT`（序号 1）与 `READER_PORT`（序号 11），分别只接受 Announcement Search 与 Document Reader。其余接口保持静态，不会假装可装配。',
    inspect: [
      ['为什么预留', '端口让“Agent 可以扩展外部能力”这件事有空间上的落点'],
      ['命名', 'Tools / MCP / Retrieval / Memory / Skills 将在后续阶段落位到其余接口'],
      ['禁止项', '不会出现点击后假装装配成功的假交互；未定义的接口不会高亮'],
    ],
    notes: [
      ['当前边界', '两个兼容接口的装配、配置与禁用都已可用；其余 10 个接口仍是静态结构。'],
      ['诚实声明', 'Tools 不一定通过 MCP 提供；MCP 只是连接协议之一，不是模型本身。'],
    ],
    related: ['ring-3', 'flows', 'core'],
  },

  channels: {
    id: 'channels',
    index: 'L4',
    name: 'Energy Channels',
    cn: '能量通道与裂隙',
    sub: 'L4 / ENERGY CHANNEL PATH',
    tags: ['L4', 'Emissive', 'Controlled'],
    state: { label: '待机 · 微弱呼吸', tone: 'signal', shape: 'round' },
    metrics: [
      ['Pattern', 'Triplanar seams'],
      ['Width', '0.055'],
      ['Glow', 'Cyan → cool white'],
      ['Bloom', '受控 · 阈值 0.72'],
    ],
    understand:
      '裂隙不是随机噪声，而是沿三个正交平面切出的**几何接缝**。这让光看起来像从结构内部漏出，而不是贴在表面的一层荧光。',
    inspect: [
      ['着色方式', 'Triplanar 距离场计算接缝，无需贴图，可离线打包'],
      ['不过曝原则', '常态光强受控，只有真实交互事件才允许显著增强'],
    ],
    notes: [['审美红线', '禁止全屏闪电、泛滥荧光描边与无意义粒子。']],
    related: ['core', 'shell', 'flows'],
  },

  flows: {
    id: 'flows',
    index: 'L4·D',
    name: 'Data Pulses',
    cn: '数据脉冲',
    sub: 'L4 / LOW-DENSITY DATA FLOW',
    tags: ['L4', 'Idle-safe', 'Low density'],
    state: { label: '待机 · 低密度脉冲', tone: 'signal', shape: 'round' },
    metrics: [
      ['Curves', '3'],
      ['Pulses', '3 段循环'],
      ['Density', '低'],
      ['Trigger', '真实状态变化'],
    ],
    understand:
      '少量脉冲在通道上循环流动，用来表达“活动路径”。待机时它保持低频，只有真实的状态变化（选中、重置、视图切换）才会增强。',
    inspect: [
      ['为什么低密度', '视觉噪声会掩盖结构，且无端消耗移动端性能'],
      ['事件驱动', '脉冲强度绑定 sceneState.activity，不凭空编造工具调用'],
    ],
    notes: [['诚实声明', '脉冲不代表任何真实模型调用或联网请求。']],
    related: ['channels', 'ports'],
  },
});

/** 部件分组，用于 Inspector 的“相关结构”快速跳转 */
export const PART_ORDER = [
  'shell',
  'core',
  'constraint',
  'ring-1',
  'ring-2',
  'ring-3',
  'ports',
  'channels',
  'flows',
];

/** 主导航（M0.3：atlas / execution 已成为真实入口，其余明确标注阶段且不伪装可用）
 *  命名策略：分类与说明用中文，只有专有名词保留英文。 */
export const NAV = Object.freeze([
  {
    id: 'story',
    idx: '01',
    name: '引导叙事',
    en: 'Story',
    cn: '六章节知识主线',
    milestone: 'M1.1 已实现 · 目录优先',
    locked: false,
    detail:
      '六章统一目录：编号、双语标题、贯穿问题、简介与章内概念清单。每章与每个概念都显示真实开放状态（可读 / 建设中 / 计划阶段 M1.2 或 M1.3），点开即进入统一知识模板。整章电影级滚动叙事与星图联动属于 M1.4，本轮不虚构完成度。',
  },
  {
    id: 'atlas',
    idx: '02',
    name: '知识星图',
    en: 'Atlas',
    cn: '概念节点与关系',
    milestone: 'M0.3 已实现 · M1.1 扩展',
    locked: false,
    detail:
      '36 个概念按六章分组进入目录与搜索；星图画布只绘制 10 个已开放节点，避免把尚未审校的节点画成已完成。关系共 47 条人工配置的 USES / PART_OF / RELATED / CONTRASTS，方向与说明逐条可查。Tool Calling 拥有完整四步学习路径与可操作实验，其余概念在统一模板中按状态呈现。',
  },
  {
    id: 'lab',
    idx: '03',
    name: '实验空间',
    en: 'Laboratory',
    cn: '动手观察技术机制',
    milestone: 'M1.1 已实现 · 登记表',
    locked: false,
    detail:
      '六类实验按章节登记：本轮只有 Tool Calling 内嵌实验真实可操作（本地模拟引擎 + 本地虚构语料），其余显示「后续阶段开放」，不提供可点击的假运行按钮，也不显示虚构进度。第 01–02 章实验属于 M1.2，第 04–06 章属于 M1.3。',
  },
  {
    id: 'constructor',
    idx: '04',
    name: '装配台',
    en: 'Constructor',
    cn: '组装研究能力',
    milestone: 'M0.2 已实现',
    locked: false,
    detail:
      '左侧能力架提供 Announcement Search 与 Document Reader 两种示范模块：点击自动装配（选择 → 预览 → 确认 → 装配 → 配置）与引导拖拽都能使用，装配结果由三维视图、二维系统视图与检视面板共享同一份配置。M0.3 起这份配置会真正成为模拟运行的输入快照。',
  },
  {
    id: 'execution',
    idx: '05',
    name: '执行台',
    en: 'Execution',
    cn: '模拟运行与事件回放',
    milestone: 'M0.3 已实现 · M0.4 扩展',
    locked: false,
    detail:
      '读取装配台已确认的配置快照，在浏览器本地运行一次教学模拟：左侧显示本次真正走过的事件路径（执行分支 + 证据分支），中央联动 AZ-CORE 01，右侧可查看每个事件的输入输出、参与判断的可见声明与核验必要条件，底部支持播放、暂停、单步、Seek、调速与复位。本次研究策略（VERIFY_REVISIONS / COLLECT_ONLY）与故障模式都是单次运行的本地规则选项，不是装进能力架的第三个工具。不接入真实搜索服务、真实 MCP 或在线 AI。',
  },
  {
    id: 'report',
    idx: '06',
    name: '研究报告',
    en: 'Report',
    cn: '证据溯源与引用导航',
    milestone: 'M0.4 已实现',
    locked: false,
    detail:
      '本次 Run 的结构化研究报告：左侧目录与真实指标，中间正文与 [S1] 引用标记，右侧来源检视（来源、可见元数据、片段高亮、进入本次研究的事件）。点击引用可跳到执行轨迹中的真实 eventId，再返回原段落；报告可导出为本地 Markdown。报告由本地规则与模板装配，不是真实语言模型撰写的结论。',
  },
  {
    id: 'system',
    idx: '00',
    name: '中央核心',
    en: 'System',
    cn: 'AZ-CORE 01 实时三维',
    milestone: 'M0.1 已实现 · M0.2 扩展',
    locked: false,
    detail: '本阶段的核心装配视图：可旋转、缩放、聚焦，并直接在三维修视装配与配置结果。',
  },
]);

/** 六章知识体系蓝图（M1.1：由知识层的章节注册表派生，不再手写第二份）
 *  Story 目录与锁定面板都读取这里，保证「章数、编号、标题、问题」只有一个来源。 */
export const CHAPTERS = Object.freeze(
  CHAPTER_REGISTRY.map((chapter) => ({
    no: chapter.no,
    en: chapter.title.en,
    cn: chapter.title.zh,
    terms: getConceptsByChapter(chapter.id)
      .map((concept) => concept.name)
      .join(' · '),
    q: chapter.question,
  }))
);

/**
 * 术语索引：[英文专有名词, 中文名, 所属章节, 一句话中文解释]
 * 规则：专有名词保留英文；凡是难懂的名词，都必须能就地看到中文解释。
 * M1.1 起直接由 36 个概念派生：术语表与知识层不可能再对不上。
 */
export const TERM_INDEX = Object.freeze(
  CONCEPT_ORDER.map((id) => {
    const concept = CONCEPTS[id];
    return [concept.name, concept.cn, concept.chapterNo, concept.oneLiner || concept.tagline];
  })
);

/** 术语速查：在任意界面按英文名取中文解释 */
export const TERM_GLOSSARY = Object.freeze(
  Object.fromEntries(TERM_INDEX.map(([en, cn, ch, note]) => [en, { cn, ch, note }]))
);

/** 中文释义小组件：专有名词后紧跟一条中文解释 */
export function termHint(en) {
  const t = TERM_GLOSSARY[en];
  return t ? t.note : '';
}

/** 术语边界速查（PRD §4 “必守技术边界”） */
export const BOUNDARIES = Object.freeze([
  ['LLM ≠ Agent', 'Agent 是围绕模型与运行环境形成的执行系统，不是模型自身的另一个名字。'],
  ['Tools ≠ MCP', '工具不一定通过 MCP 提供；MCP 是标准化连接协议，不等于模型或 Agent，也不保证能力提高。'],
  ['Skills ≠ API', 'Skills 是按需加载的任务说明与可能资源，不自动获得工具或网络权限。'],
  ['Retrieval ≠ Embedding', '关键词检索不能冒充向量检索；RAG、Embedding、Memory 相关但不同义。'],
  ['Workflow ≠ Agent', '两者执行控制方式不同，不应宣称 Agent 总是更好。'],
  ['Harness ≠ 第二个模型', 'Harness 表达运行环境、Agent Loop、工具协调与控制，不是发光的第二模型。'],
]);

/** 系统日志的固定启动序列（真实时间戳，非伪造内容） */
export const BOOT_LOG = Object.freeze([
  ['系统', 'AGENT / ZERO · M1.1 知识架构与学习基础'],
  ['范围', '纯前端静态原型 · 无业务后端 · 无真实 AI API'],
  ['资源', '本地打包资源校验通过 · 无外部 CDN 请求'],
  ['模拟', '本地教学模拟已启用 · 不表示真实模型执行'],
]);

/** 里程碑表（用于未开放面板的诚实说明） */
export const MILESTONES = Object.freeze([
  ['M0.1', '视觉基础', '品牌系统 · AZ-CORE 01 · 五镜头开场 · 控制台 · 响应式降级', '已完成'],
  ['M0.2', '装配原型', '能力架 · 点击自动装配 · 引导拖拽 · 接口兼容 · 三维/二维/检视面板状态同步', '已完成'],
  ['M0.3', '知识与执行', '10 个星图节点 · Tool Calling 知识页 · 本地模拟引擎与四条分支 · 事件回放与执行图', '已完成'],
  ['M0.4', '完整闭环', '资料冲突核验 · 引用溯源 · 结构化研究报告 · Markdown 导出', '已完成'],
  ['M1.1', '知识架构', '六章注册表 · 36 概念索引 · 统一内容/关系接口 · 学习进度 v2 迁移 · 统一知识模板', '当前阶段'],
  ['M1.2–M1.3', '章节正文', '第 01–03 章正文与实验 → M1.2；第 04–06 章 → M1.3', '未开始'],
  ['M1.4', '知识宇宙', '星图视觉与 Story 联动 · Knowledge Journal', '未开始'],
]);
