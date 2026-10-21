/**
 * src/app.js
 * ------------------------------------------------------------------
 * 应用壳：
 *   · 唯一渲染循环（一个 requestAnimationFrame 驱动 3D + 开场 + HUD）
 *   · 唯一选中状态同时驱动 Canvas 高亮、SVG 高亮与 Inspector 文案
 *   · 开场与 Hub 共用同一套核心对象与相机
 * ------------------------------------------------------------------
 */
import { state, setState, subscribe, log, onLog, logEntries, patchReadout } from './state/store.js';
import { PARTS, GEOMETRY, SIMULATED_CONSTANT, BOOT_LOG, NAV } from './data/content.js';
import { createScene } from './scenes/scene.js';
import { createTimeline, TOTAL_DURATION, shotLabel, SHOTS } from './scenes/intro/timeline.js';
import { renderCoreSvg, applySvgSelection } from './scenes/core/svgParts.js';
import {
  Topbar,
  Dock,
  Stage,
  Inspector,
  Status,
  Boot,
  FallbackNotice,
  LockedPanel,
  bindTermClick,
  createEl,
} from './components/layout/panels.js';

/* M0.2 装配领域：模型 / 状态 / 视图与组件 */
import { createConstructorStore } from './features/constructor/state/store.js';
import { MODULES, PORTS, getModule, getPort } from './features/constructor/model/modules.js';
import { describeStatus, validateConnection } from './features/constructor/model/validation.js';
import { serializeConfig } from './features/constructor/state/persistence.js';
import { ModuleLibrary } from './features/constructor/components/library.js';
import { buildModulePanel } from './features/constructor/components/moduleInspector.js';
import { DragLayer } from './features/constructor/components/dragLayer.js';
import { SystemGraph } from './features/constructor/views/systemView.js';

/* M0.3 知识与执行：Atlas 星图 / Tool Calling 知识页 / 执行台与回放 */
import { createLearningStore } from './features/atlas/state/learning.js';
import { createAtlasWorkspace } from './features/atlas/components/atlasWorkspace.js';
import { createToolCallingKnowledge } from './features/atlas/knowledge/toolCalling.js';
import { getConcept } from './features/atlas/data/index.js';
import { createExecutionWorkspace } from './features/execution/components/executionWorkspace.js';
import { deriveToolAvailability } from './simulation/rules/availability.js';

const STORE = {
  intro: 'az0.intro.seen.v1',
  prefs: 'az0.prefs.v1',
};

/** 端口序号 → 端口标识：二维结构投影需要与三维接口共用同一份定位（M0.2_TASK §3.2） */
const PORT_MARKS = Object.fromEntries(Object.values(PORTS).map((p) => [p.anchorIndex, p.id]));

function safeGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 隐私模式等场景下静默降级：不影响功能 */
  }
}

export function createApp(root) {
  const reducedMotion =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** System Graph 组件实例（延迟挂载；声明提前以免出现 TDZ 引用） */
  let sg = null;

  /* ----------------------- 偏好 ----------------------- */
  const prefs = Object.assign(
    { dock: true, inspect: true, status: true, dockRail: false },
    safeGet(STORE.prefs, {})
  );
  const introSeen = safeGet(STORE.intro, false) === true;
  const forceIntro = new URLSearchParams(location.search).get('intro') === 'always';

  setState({ reducedMotion, inspectOpen: prefs.inspect, statusOpen: prefs.status });

  /* ----------------------- 装配领域：唯一权威配置 ----------------------- */
  // 3D / 2D / Inspector / 能力架全部订阅这一个 store；页面里只有它写 localStorage。
  const constructor = createConstructorStore({
    onLog: (kind, message, level) => log(kind, message, level),
  });
  const library = ModuleLibrary({
    store: constructor,
    onDragIntent: startDragIntent,
    onResetRequest: requestReset,
  });
  const dragLayer = DragLayer();

  /* ----------------------- M0.3 知识域：学习进度（独立命名空间） ----------------------- */
  const learning = createLearningStore({
    onLog: (kind, message, level) => log(kind, message, level),
  });

  /* ----------------------- 布局骨架 ----------------------- */
  const shell = createEl('div', { class: 'shell', 'data-dock': prefs.dockRail ? 'rail' : 'full' });

  const stage = Stage({
    onViewChange: setView,
    onReset: resetView,
    onToggleStatus: () => toggleStatus(),
  });

  const topbar = Topbar({
    onReplay: () => replayIntro(),
    onToggleDock: () => toggleDock(),
    onToggleInspect: () => toggleInspect(),
    onToggleStatus: () => toggleStatus(),
  });

  const dock = Dock({
    onMode: handleMode,
    onTerm: (term) => bindTermClick(term),
    bayEl: library.el,
    onToggleCollapse: (collapsed) => {
      prefs.dockRail = collapsed;
      persistPrefs();
      setState({}, 'dock-collapse');
    },
  });

  const inspector = Inspector({
    onSelect: selectPart,
    onToggle: () => toggleInspect(),
  });

  const status = Status({
    onClear: () => {
      logEntries.length = 0;
      status.renderAll(logEntries);
      log('日志', '事件日志已由用户清空（仅本地）', 'attention');
    },
    onToggle: () => toggleStatus(),
  });

  const boot = Boot({
    onSkip: () => skipIntro('SKIP 按钮'),
    onFirstFrame: () => {},
  });

  const scrim = createEl('div', { class: 'scrim', 'data-open': 'false' });
  scrim.addEventListener('click', () => {
    setState({ dockOpen: false }, 'scrim');
  });

  const toast = createEl('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
  let toastTimer = 0;
  function showToast(text, ms = 2600) {
    toast.textContent = text;
    toast.dataset.open = 'true';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.dataset.open = 'false'), ms);
  }

  shell.append(dock.el, stage.el, inspector.el, status.el);
  root.append(shell, topbar.el, scrim, toast, boot.el, dragLayer.el);
  root.classList.add('is-ready');

  /* ----------------------- 3D 场景 ----------------------- */
  let scene = null;
  let fallbackReason = null;
  const projection = createEl('div', { class: 'projection' });
  let projectionSvg = null;

  function mountProjection(reason) {
    fallbackReason = reason;
    projection.innerHTML = '';
    const bar = createEl('div', { class: 'projection__bar' });
    const barText = createEl('div', { class: 'projection__bar-text' }, `
      <span>二维系统视图 · AZ-CORE 01 结构投影</span>
      <span>${reason === 'USER_SWITCH' ? '与三维视图共用同一份配置与选中状态' : '降级模式 · 当前环境不支持 WebGL'}</span>
      <span class="projection__sim">${SIMULATED_CONSTANT}</span>`);
    // 投影层内部必须有明确的返回入口：不能只靠底部控制条（曾经出现过按钮被盖住的问题）
    const barActions = createEl('div', { class: 'projection__bar-actions' });
    const backBtn = createEl('button', { class: 'btn btn--primary', type: 'button', 'aria-label': '返回三维核心视图' }, '← 返回三维核心');
    backBtn.addEventListener('click', () => setView('assembly'));
    const seg2 = createEl('div', { class: 'seg', role: 'group', 'aria-label': '视图切换' });
    const p2Assembly = createEl('button', { type: 'button', 'aria-pressed': 'false', 'title': '三维核心视图（快捷键 S）' }, '三维核心');
    const p2System = createEl('button', { type: 'button', 'aria-pressed': 'true', 'title': '二维系统视图（快捷键 S）' }, '二维系统视图');
    p2Assembly.addEventListener('click', () => setView('assembly'));
    p2System.addEventListener('click', () => setView('system'));
    seg2.append(p2Assembly, p2System);
    barActions.append(backBtn, seg2);
    bar.append(barText, barActions);
    stage.bindProjectionSwitch({
      setMode(view) {
        const isSystem = view === 'system';
        p2Assembly.setAttribute('aria-pressed', isSystem ? 'false' : 'true');
        p2System.setAttribute('aria-pressed', isSystem ? 'true' : 'false');
      },
    });
    const main = createEl('div', { class: 'projection__main' });
    const corePane = createEl('div', { class: 'projection__core' });
    corePane.append(
      createEl('div', { class: 'projection__core-head' }, `
        <span>AZ-CORE 01 · 二维结构投影</span>
        <span>轨道倾角 −35° / +25° / +65° · 接口定位点 12 个</span>`),
      createEl('div', { class: 'svg-stage' }, renderCoreSvg({ portMarks: PORT_MARKS })),
      createEl('div', { class: 'projection__core-foot' }, '后侧轨道被核心遮挡、前侧绘制在核心之上，用遮挡关系表达真实空间层次。')
    );
    projectionSvg = corePane.querySelector('svg');

    let graphPane = null;
    // 二维系统图始终挂载：它由当前配置派生，同时也是 WebGL 不可用时的完整配置入口
    sg = SystemGraph({ store: constructor });
    graphPane = createEl('div', { class: 'projection__graph' });
    if (reason !== 'USER_SWITCH') graphPane.append(FallbackNotice({ reason }));
    graphPane.append(sg.el);
    main.append(corePane, graphPane);

    const foot = createEl('div', { class: 'projection__foot' });
    foot.append(
      createEl('div', { class: 'projection__legend' }, `
        <span><i style="background:rgba(170,190,208,.72)"></i>L2 机械轨道 · 倾角 −35° / +25° / +65°</span>
        <span><i style="background:rgba(119,216,236,.5)"></i>L1 能量核与约束环</span>
        <span><i style="background:rgba(240,189,120,.7)"></i>SEARCH_PORT / READER_PORT 兼容接口</span>`),
      createEl('div', { class: 'mono' }, '二维与三维共用同一份配置')
    );
    projection.append(bar, main, foot);
    stage.el.insertBefore(projection, stage.el.querySelector('.stage__chrome'));

    projectionSvg.querySelectorAll('.svg-part').forEach((group) => {
      group.setAttribute('tabindex', '0');
      group.setAttribute('role', 'button');
      const partId = group.dataset.part;
      const part = PARTS[partId];
      if (part) group.setAttribute('aria-label', `${part.name} ${part.cn}`);
      const activate = () => selectPart(partId);
      group.addEventListener('click', activate);
      group.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      });
    });
    applySvgSelection(projectionSvg, state.selection);
    updateSvgPortStates();
    sg?.render();
    sg?.setSelection(constructor.getState().ui.selectedModuleId);
  }

  function showProjection(show) {
    if (show && !projection.parentElement) mountProjection(fallbackReason || 'USER_SWITCH');
    if (projection.parentElement) projection.style.display = show ? 'grid' : 'none';
  }

  try {
    scene = createScene({
      stageEl: stage.el,
      canvasHost: stage.canvasHost,
      onLog: (kind, message, level) => log(kind, message, level),
      onContextLost: () => {
        setState({ webgl: false }, 'context-lost');
        fallbackReason = 'CONTEXT_LOST';
        showProjection(true);
        stage.setView('system');
        showFallbackBanner();
      },
    });
  } catch (error) {
    log('渲染', `场景初始化异常：${error.message}`, 'error');
    scene = { ok: false, caps: { reduced: reducedMotion, webgl: false, lowPower: true }, reason: 'RENDERER_CREATE_FAILED' };
  }

  setState({ webgl: !!scene?.ok, lowPower: !!scene?.caps?.lowPower }, 'scene');

  function showFallbackBanner() {
    const existing = stage.el.querySelector('.fallback-banner');
    if (existing) existing.remove();
    const banner = createEl('div', { class: 'note fallback-banner', style: 'position:absolute;left:14px;right:14px;bottom:64px;z-index:6' }, `
      <span class="note__key">降级</span>
      <span>3D 视图不可用或已丢失上下文：已切到 2D / SVG 结构投影，交互与文字信息保持可用，不显示永久黑屏。</span>`);
    stage.el.append(banner);
  }

  if (!scene?.ok) {
    fallbackReason = scene?.reason || 'WEBGL_UNAVAILABLE';
    setState({ systemView: true }, 'fallback');
    showProjection(true);
    stage.setView('system');
    log('渲染', `WebGL（浏览器三维渲染接口）不可用（${fallbackReason}）→ 已启用二维 / SVG 兜底视图`, 'attention');
  }

  /* ----------------------- 开场时间线 ----------------------- */
  const timeline = createTimeline({ reduced: reducedMotion });
  let bootFinished = false;

  function startIntro() {
    bootFinished = false;
    setState({ phase: 'boot', selection: null, coreState: 'BOOTING' }, 'intro-start');
    shell.dataset.boot = 'true';
    boot.setRunning();
    boot.el.dataset.phase = 'run';
    timeline.play();
    log('开场', `开场序列 AZ / INITIALIZATION SEQUENCE 开始 · 目标 ${TOTAL_DURATION.toFixed(1)}s（可随时跳过）`, 'signal');
  }

  function finishIntro(reason) {
    if (bootFinished) return;
    bootFinished = true;
    timeline.finish();
    boot.setDone();
    shell.dataset.boot = 'false';
    safeSet(STORE.intro, true);
    setState({ phase: 'hub', coreState: 'IDLE' }, 'intro-finish');
    if (scene?.ok) {
      scene.visual.assembly = [1, 1, 1];
      scene.visual.lit = 1;
      scene.visual.bootLight = 1;
      scene.visual.idle = true;
      scene.core.update(0.016, scene.visual);
      scene.rig.enterIdle(!!reason && reason.includes('SKIP'));
    }
    stage.setCanvasOpacity(1);
    log('开场', `开场结束（${reason}）· 进入稳定待机（IDLE）+ 控制台终态`, 'success');
  }

  function skipIntro(reason = 'SKIP') {
    if (bootFinished) return;
    finishIntro(`SKIP · ${reason}`);
    showToast('已跳过开场，直接进入 Hub 稳定状态。');
  }

  function replayIntro() {
    if (!scene?.ok) {
      log('开场', '重播需要三维场景；当前为二维兜底视图，已忽略', 'attention');
      showToast('当前为二维兜底视图，开场序列不可用。');
      return;
    }
    bootFinished = true; // 允许重播：先稳定，再重新开始
    startIntro();
    log('开场', '重播开场已触发 · 时间线重置（不含任何残留动画）', 'attention');
  }

  /* ----------------------- 视图与选中 ----------------------- */
  function selectPart(id) {
    const next = id && PARTS[id] ? id : null;
    // 结构选中与模块选中互斥：Inspector 永远只有一套说法
    if (next && constructor.getState().ui.selectedModuleId) constructor.actions.select(null);
    if (state.selection === next) {
      setState({ selection: null }, 'select-toggle');
      log('选中', '取消选中，恢复整体亮度与标准焦距', 'attention');
      return;
    }
    setState({ selection: next }, 'select');
    if (!next) return;
    const part = PARTS[next];
    log('选中', `${part.index} ${part.name} · ${part.cn} — 检视面板已同步`, 'signal');
    if (scene?.ok && next) {
      const frame = scene.core.getPartFrame(next);
      scene.rig.focusPart(frame.radius, frame.center);
    }
  }

  function resetView() {
    if (!scene?.ok) {
      log('视图', '二维兜底视图下无需重置视角（视图为静态投影）', 'attention');
      showToast('当前为 二维投影视图，无需重置三维视角。');
      return;
    }
    scene.rig.resetView();
    log('视图', `重置视角 · 镜头回到标准镜位 (${GEOMETRY.hubCamera.x}, ${GEOMETRY.hubCamera.y}, ${GEOMETRY.hubCamera.z})`, 'signal');
  }

  function setView(view) {
    stage.setView(view);
    const toSystem = view === 'system';
    setState({ systemView: toSystem }, 'view');
    // 视图切换必须清理瞬态装配：不留幽灵模块与被占用的空接口
    cancelTransientAssembly();
    if (toSystem) {
      showProjection(true);
      sg?.render();
      log('视图', '二维系统视图 · 由当前配置派生的结构与连接（可在此处直接编辑）', 'signal');
    } else {
      showProjection(false);
      if (scene?.ok) log('视图', '三维装配视图 · 实时渲染舞台', 'signal');
    }
  }

  function handleMode(nav) {
    if (nav.locked) {
      // 未开放入口：不制造假按钮，改为展示阶段说明面板（可一键返回）
      closeWorkspace();
      log('导航', `${nav.name} 尚未开放（计划阶段 ${nav.milestone}）· 已展示阶段说明面板（可返回）`, 'attention');
      setState({ mode: nav.id }, 'mode-locked');
      return;
    }
    // M0.3：知识星图与执行台是真实入口，直接在舞台内打开对应工作区
    if (nav.id === 'atlas') {
      setState({ mode: 'atlas' }, 'mode');
      dock.setMode('atlas');
      openAtlas();
      return;
    }
    if (nav.id === 'execution') {
      setState({ mode: 'execution' }, 'mode');
      dock.setMode('execution');
      openExecution();
      return;
    }
    closeWorkspace();
    setState({ mode: nav.id }, 'mode');
    // 「装配台」是 M0.2 的真实入口：直接落到三维装配视图，并把能力架展开
    if (nav.id === 'constructor') {
      if (state.systemView) setView('assembly');
      if (shell.dataset.dock === 'rail' && window.innerWidth >= 768) {
        shell.dataset.dock = 'full';
        prefs.dockRail = false;
        persistPrefs();
      }
      syncTopbar();
      log('导航', '装配台已激活 · 左侧能力架与三维装配视图使用同一份权威配置', 'signal');
      return;
    }
    log('导航', `${nav.name} · ${nav.cn} 已激活`, 'signal');
  }

  function toggleDock() {
    if (window.innerWidth < 768) {
      const open = !state.dockOpen;
      setState({ dockOpen: open }, 'dock');
      scrim.dataset.open = open ? 'true' : 'false';
      applyShellState();
    } else {
      shell.dataset.dock = shell.dataset.dock === 'rail' ? 'full' : 'rail';
      prefs.dockRail = shell.dataset.dock === 'rail';
      persistPrefs();
      log('界面', `左侧导航已${prefs.dockRail ? '折叠为图标栏' : '展开'}`, 'info');
    }
    topbar.setPressed({ dock: shell.dataset.dock !== 'rail', inspect: state.inspectOpen, status: state.statusOpen });
  }

  function toggleInspect() {
    const open = !state.inspectOpen;
    setState({ inspectOpen: open }, 'inspect');
    inspector.setCollapsed(!open);
    prefs.inspect = open;
    persistPrefs();
    applyShellState();
    topbar.setPressed({ dock: shell.dataset.dock !== 'rail', inspect: open, status: state.statusOpen });
    log('界面', `检视面板已${open ? '展开' : '收起'}`, 'info');
  }

  function toggleStatus() {
    const open = !state.statusOpen;
    setState({ statusOpen: open }, 'status');
    stage.setStatusLabel(open);
    prefs.status = open;
    persistPrefs();
    applyShellState();
    topbar.setPressed({ dock: shell.dataset.dock !== 'rail', inspect: state.inspectOpen, status: open });
    log('界面', `底部事件区已${open ? '展开' : '收起'}`, 'info');
  }

  function persistPrefs() {
    safeSet(STORE.prefs, prefs);
  }

  /* ==================================================================
     装配集成（M0.2）
     能力架 / 三维接口 / 二维系统图 / Inspector 全部读写同一个 constructor
     store；这里是唯一的“表现同步”层，不持有第二份模块状态。
     ================================================================== */

  /** 三维接口的文字标注层：兼容性不能只靠颜色表达 */
  const portOverlay = createEl('div', { class: 'port-overlay', 'data-open': 'false' });
  const portChips = new Map();
  for (const port of Object.values(PORTS)) {
    const chip = createEl(
      'button',
      { class: 'port-chip', type: 'button', 'data-port': port.id, 'data-state': 'free', tabindex: '-1' },
      `<span class="port-chip__name">${port.name}</span><span class="port-chip__state" data-el="state">空闲 · 可装配</span>`
    );
    chip.addEventListener('click', () => handlePortClick(port.id));
    portOverlay.append(chip);
    portChips.set(port.id, chip);
  }
  stage.el.append(portOverlay);

  const NOTICE_KIND = {
    ASSEMBLED: '装配',
    REMOVED: '装配',
    PREVIEW: '装配',
    PREVIEW_CANCELLED: '装配',
    ALREADY_INSTALLED: '装配',
    PORT_OCCUPIED: '装配',
    DRAG_CANCELLED: '装配',
    RESET: '装配',
    TOGGLED: '配置',
    CONFIG_SAVED: '配置',
    INVALID_CONFIG: '校验',
    INCOMPATIBLE_PORT: '校验',
    UNKNOWN_MODULE: '校验',
    UNKNOWN_PORT: '校验',
    STORAGE_CORRUPT: '配置',
    STORAGE_SHAPE: '配置',
    STORAGE_VERSION: '配置',
    STORAGE_PARTIAL: '配置',
    STORAGE_BLOCKED: '配置',
  };

  function noticeLevel(level) {
    if (level === 'error') return 'error';
    if (level === 'attention') return 'attention';
    if (level === 'success') return 'success';
    return 'signal';
  }

  /* ---------------- 表现同步：唯一数据流的下游 ---------------- */
  function syncConstructor() {
    const s = constructor.getState();
    const statuses = {};
    for (const m of s.modules) statuses[m.moduleId] = constructor.statusOf(m.moduleId);

    const previewing = !!s.ui.preview || !!s.ui.drag;
    if (scene?.ok) {
      scene.bay.sync(s.modules, statuses);

      const portStates = {};
      for (const port of Object.values(PORTS)) {
        if (s.ui.preview?.portId === port.id) portStates[port.id] = 'preview';
        else if (s.ui.drag?.targetPortId === port.id) portStates[port.id] = s.ui.drag.valid ? 'preview' : 'invalid';
        else if (constructor.occupantOf(port.id)) portStates[port.id] = 'occupied';
        else portStates[port.id] = 'free';
      }
      scene.bay.setPortStates(portStates);

      const ghost = s.ui.preview || (s.ui.drag?.valid ? { moduleId: s.ui.drag.moduleId, portId: s.ui.drag.targetPortId } : null);
      if (ghost) scene.bay.setPreview(ghost.moduleId, ghost.portId);
      else scene.bay.clearPreview();

      // 预览与拖拽期间暂停自转并减弱镜头操作，防止目标在指针下移动
      scene.rig.setIdlePaused(previewing);
      scene.rig.controls.enableRotate = !previewing;
    }

    for (const port of Object.values(PORTS)) {
      const chip = portChips.get(port.id);
      const mod = getModule(port.accepts[0]);
      const occupant = constructor.occupantOf(port.id);
      let text = '空闲 · 可装配';
      let key = 'free';
      if (s.ui.preview?.portId === port.id) {
        text = `预览中 · ${mod.cn}`;
        key = 'preview';
      } else if (s.ui.drag?.targetPortId === port.id) {
        text = s.ui.drag.valid ? `松开装配 · ${mod.cn}` : `不兼容 · ${s.ui.drag.message}`;
        key = s.ui.drag.valid ? 'preview' : 'invalid';
      } else if (occupant) {
        const meta = describeStatus(constructor.statusOf(occupant.moduleId));
        text = `已占用 · ${meta.cn}（${meta.en}）`;
        key = meta.en === 'Ready' ? 'ready' : meta.en === 'Invalid' ? 'invalid' : 'occupied';
      }
      chip.dataset.state = key;
      chip.querySelector('[data-el="state"]').textContent = text;
      chip.setAttribute('aria-label', `${port.name} ${port.cn}，${text}`);
      chip.tabIndex = key === 'preview' ? 0 : -1;
    }

    library.render();
    renderInspector();
    updateSvgPortStates();
    sg?.render();
    sg?.setSelection(s.ui.selectedModuleId);
  }

  /** 二维结构投影上的兼容接口状态：与三维热点、系统图节点共用同一份配置 */
  function updateSvgPortStates() {
    if (!projectionSvg) return;
    const s = constructor.getState();
    for (const port of Object.values(PORTS)) {
      const node = projectionSvg.querySelector(`.svg-port[data-port="${port.id}"]`);
      if (!node) continue;
      const occupant = constructor.occupantOf(port.id);
      let state = 'free';
      let label = '空闲 · 可装配';
      if (s.ui.drag?.targetPortId === port.id) {
        state = s.ui.drag.valid ? 'preview' : 'invalid';
        label = s.ui.drag.valid ? '可吸附' : '不兼容';
      } else if (s.ui.preview?.portId === port.id) {
        state = 'preview';
        label = '装配预览中';
      } else if (occupant) {
        const meta = describeStatus(constructor.statusOf(occupant.moduleId));
        state = meta.en === 'Ready' ? 'ready' : meta.en === 'Invalid' ? 'invalid' : 'occupied';
        label = `已占用 · ${meta.cn}`;
      }
      node.dataset.state = state;
      node.setAttribute('aria-label', `${port.name} ${port.cn}，${label}`);
    }
  }

  function renderInspector() {
    const moduleId = constructor.getState().ui.selectedModuleId;
    if (moduleId) {
      inspector.renderCustom(
        buildModulePanel(constructor, moduleId, {
          // 从已装配工具的 Inspector 直接进入知识节点，并把当前上下文带过去（A13）
          onOpenKnowledge: () => openKnowledge('tool_calling', { from: 'constructor', selectedModuleId: moduleId }),
        })
      );
      return;
    }
    inspector.render(state);
    inspector.prependSummary(buildAssemblySummary());
  }

  /** 运行条件摘要：由同一份权威配置派生，供 RUN SIMULATION 与自检脚本共用 */
  function runCondition() {
    const availability = deriveToolAvailability(constructorSnapshot());
    const search = availability.tools.announcement_search;
    const reader = availability.tools.document_reader;
    return {
      search,
      reader,
      /** 只有两个工具都就绪才会走正常分支；否则运行会产生可解释的阻断轨迹 */
      bothReady: search.ready && reader.ready,
      anyReady: search.ready,
    };
  }

  /** 未选中模块时的装配概览：先回答“现在装配了什么” */
  function buildAssemblySummary() {
    const s = constructor.getState();
    const wrap = createEl('div', { class: 'section' });
    wrap.append(
      createEl('div', { class: 'section__label' }, `<span>装配概览</span><span>${s.modules.length} / ${Object.keys(MODULES).length}</span>`)
    );

    if (s.modules.length === 0) {
      wrap.append(
        createEl('div', { class: 'note note--info' }, `
          <span class="note__key">M0.2</span>
          <span>尚未装配任何工具。左侧能力架提供 <b>Announcement Search</b> 与 <b>Document Reader</b>，点击「添加」进入装配预览，或按住卡片拖到三维核心的兼容接口。</span>`)
      );
    } else {
      const list = createEl('div', { class: 'summary-list' });
      for (const m of s.modules) {
        const meta = describeStatus(constructor.statusOf(m.moduleId));
        const mod = getModule(m.moduleId);
        const row = createEl('button', { class: 'summary-row', type: 'button', 'data-module': m.moduleId, 'data-status': meta.en }, `
          <span class="summary-row__name">${mod.name}<em>${mod.cn}</em></span>
          <span class="summary-row__port">${m.portId}</span>
          <span class="tag tag--${meta.tone}">${meta.en} · ${meta.cn}</span>`);
        row.addEventListener('click', () => constructor.actions.select(m.moduleId));
        list.append(row);
      }
      wrap.append(list);
    }

    const unconfigured = s.modules.filter((m) => constructor.statusOf(m.moduleId) === 'Unconfigured');
    if (unconfigured.length) {
      wrap.append(
        createEl('div', { class: 'note', style: 'margin-top:8px' }, `
          <span class="note__key">待配置</span>
          <span>${unconfigured.map((m) => getModule(m.moduleId).cn).join('、')} 尚未达成 Ready：请补全参数并授予只读模拟权限。</span>`)
      );
    }

    /* M0.3：运行条件与 RUN SIMULATION 入口（条件不满足时也允许运行，产生可解释的阻断轨迹） */
    const condition = runCondition();
    const run = createEl('div', { class: 'section', 'data-el': 'run-entry' });
    run.append(
      createEl('div', { class: 'section__label' }, '<span>运行条件</span><span>由同一份配置派生</span>'),
      createEl('div', { class: 'chips' }, `
        <span class="tag tag--${condition.search.ready ? 'signal' : 'attention'}" data-el="search-state">Search · ${condition.search.ready ? 'Ready' : condition.search.blockCode}</span>
        <span class="tag tag--${condition.reader.ready ? 'signal' : 'attention'}" data-el="reader-state">Reader · ${condition.reader.ready ? 'Ready' : condition.reader.blockCode}</span>`),
      createEl('div', { class: 'note note--info', style: 'margin-top:8px' }, `
        <span class="note__key">说明</span>
        <span>运行会读取当前配置的快照：之后修改参数或移除模块都不会重写已经产生的轨迹。条件不满足时同样可以运行，会得到一条可解释的阻断轨迹用于对照学习。</span>`)
    );
    const runBtn = createEl(
      'button',
      { class: 'btn btn--primary', type: 'button', 'data-act': 'run-simulation', style: 'width:100%;justify-content:center;margin-top:9px' },
      'RUN SIMULATION · 运行本地模拟'
    );
    runBtn.addEventListener('click', () => openExecution({ autorun: true }));
    run.append(runBtn);
    wrap.append(run);
    return wrap;
  }

  /* ---------------- 三维端口交互 ---------------- */
  function handlePortClick(portId) {
    const s = constructor.getState();
    if (s.ui.preview && s.ui.preview.portId === portId) {
      constructor.actions.commit();
      return;
    }
    const occupant = constructor.occupantOf(portId);
    if (occupant) {
      constructor.actions.select(occupant.moduleId);
      log('装配', `${getPort(portId).cn}（${portId}）已被 ${getModule(occupant.moduleId).cn} 占用 · 已定位到该模块`, 'attention');
      return;
    }
    const mod = getModule(getPort(portId).accepts[0]);
    if (mod) constructor.actions.preview(mod.id);
  }

  function updatePortLabels() {
    if (!scene?.ok || activeWorkspace) {
      portOverlay.dataset.open = 'false';
      return;
    }
    const rect = stage.canvasHost.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    portOverlay.dataset.open = 'true';
    for (const [portId, chip] of portChips) {
      const v = scene.bay.getAnchorWorld(portId);
      if (!v) continue;
      v.project(scene.camera);
      const x = (v.x * 0.5 + 0.5) * rect.width;
      const y = (-v.y * 0.5 + 0.5) * rect.height;
      chip.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      const visible = v.z < 1 && x > -80 && x < rect.width + 80 && y > -50 && y < rect.height + 50;
      chip.dataset.visible = visible ? 'true' : 'false';
    }
  }

  /* ---------------- 引导式拖拽 ---------------- */
  let dragState = null;

  function startDragIntent(moduleId, event) {
    if (typeof event?.button === 'number' && event.button !== 0) return;
    if (!scene?.ok) {
      // 无三维视图时拖拽退化为等价的点击路径，功能不缩水（M0.2_TASK §10.2）
      constructor.actions.preview(moduleId);
      log('装配', `${getModule(moduleId).cn}：当前无三维视图，拖拽已转为点击装配路径`, 'attention');
      return;
    }
    if (constructor.getState().ui.drag) return;
    constructor.actions.dragStart(moduleId);
    dragState = {
      moduleId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      portId: null,
      valid: false,
      message: '',
    };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragUp);
    window.addEventListener('pointercancel', onDragCancel);
  }

  function onDragMove(event) {
    if (!dragState) return;
    const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
    if (!dragState.active && distance < 7) return;
    dragState.active = true;

    const mod = getModule(dragState.moduleId);
    const inside = scene.isInsideStage(event.clientX, event.clientY);
    const portId = inside ? scene.pickPortAt(event.clientX, event.clientY) : null;
    let valid = false;
    let message = inside ? '把模块拖到高亮的兼容接口上' : '把模块拖入中央三维舞台';

    if (portId) {
      const check = validateConnection(dragState.moduleId, portId);
      const occupant = constructor.occupantOf(portId);
      if (!check.ok) {
        valid = false;
        message = check.message;
      } else if (occupant && occupant.moduleId !== dragState.moduleId) {
        valid = false;
        message = `${getPort(portId).cn}（${portId}）已被 ${getModule(occupant.moduleId).cn} 占用`;
      } else {
        valid = true;
        message = `松开即可装配到 ${portId} · ${getPort(portId).cn}`;
      }
    }

    dragState.portId = portId;
    dragState.valid = valid;
    dragState.message = message;
    constructor.actions.dragTarget(portId, valid, message);
    dragLayer.show({
      x: event.clientX,
      y: event.clientY,
      label: mod.index,
      name: mod.name,
      cn: mod.cn,
      message,
      tone: portId ? (valid ? 'valid' : 'invalid') : 'idle',
    });
  }

  function onDragUp(event) {
    if (!dragState) return;
    const { moduleId, active } = dragState;
    const inside = scene.isInsideStage(event.clientX, event.clientY);
    const portId = inside ? scene.pickPortAt(event.clientX, event.clientY) : null;
    endDragInteraction();
    if (active) {
      if (portId && validateConnection(moduleId, portId).ok) constructor.actions.dragEnd(true, portId);
      else constructor.actions.dragEnd(false, null);
    } else {
      // 未达到拖拽阈值：按一次点击处理，点击路径始终完整可用
      constructor.actions.dragEnd(false, null);
      constructor.actions.preview(moduleId);
    }
  }

  function onDragCancel() {
    if (!dragState) return;
    endDragInteraction();
    constructor.actions.dragEnd(false, null);
  }

  function endDragInteraction() {
    dragState = null;
    dragLayer.hide();
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragUp);
    window.removeEventListener('pointercancel', onDragCancel);
  }

  /** Esc / 视图切换 / 卸载时的统一清理：不留幽灵预览与被占用的空接口 */
  function cancelTransientAssembly() {
    const s = constructor.getState();
    if (dragState || s.ui.drag) {
      endDragInteraction();
      constructor.actions.dragEnd(false, null);
      return true;
    }
    if (s.ui.preview) {
      constructor.actions.cancel();
      return true;
    }
    return false;
  }

  /* ---------------- 重置构建器（二次确认） ---------------- */
  const confirmLayer = createEl('div', { class: 'confirm', 'data-open': 'false' });
  const confirmTitle = createEl('h2', { class: 'confirm__title', id: 'az-confirm-title' }, '重置构建器');
  const confirmText = createEl('p', { class: 'confirm__text' });
  const confirmOk = createEl('button', { class: 'btn btn--primary', type: 'button' }, '确认重置');
  const confirmCancel = createEl('button', { class: 'btn btn--ghost', type: 'button' }, '取消');
  const confirmBox = createEl('div', { class: 'confirm__box surface', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'az-confirm-title' });
  confirmBox.append(confirmTitle, confirmText, createEl('div', { class: 'confirm__actions' }));
  confirmBox.querySelector('.confirm__actions').append(confirmOk, confirmCancel);
  confirmLayer.append(confirmBox);
  root.append(confirmLayer);

  let confirmAction = null;
  function closeConfirm() {
    confirmLayer.dataset.open = 'false';
    confirmAction = null;
  }
  function requestReset() {
    const count = constructor.getState().modules.length;
    confirmText.textContent = count
      ? `将清空 ${count} 个已装配模块及其接口占用。此操作只清理构建器数据，不会删除开场偏好等其它本地记录。`
      : '当前没有已装配模块。此操作只清理构建器的本地记录，不会删除开场偏好等其它数据。';
    confirmAction = () => {
      constructor.actions.reset();
      showToast('构建器已重置。');
    };
    confirmLayer.dataset.open = 'true';
    confirmOk.focus({ preventScroll: true });
  }
  confirmOk.addEventListener('click', () => {
    const run = confirmAction;
    closeConfirm();
    run?.();
  });
  confirmCancel.addEventListener('click', closeConfirm);
  confirmLayer.addEventListener('click', (e) => {
    if (e.target === confirmLayer) closeConfirm();
  });

  /* ---------------- 订阅：唯一数据流的下游 ---------------- */
  constructor.subscribe((s, { action, prev }) => {
    syncConstructor();

    if (s.ui.selectedModuleId && state.selection) setState({ selection: null }, 'select-module');
    if (action?.type === 'select' && s.ui.selectedModuleId && scene?.ok) {
      // 轻微推近到接口层，让被选中的模块看得清，但不脱离整体构图
      const frame = scene.core.getPartFrame('ports');
      scene.rig.focusPart(frame.radius * 0.66, frame.center);
    }

    const notice = s.ui.notice;
    if (notice && notice !== prev.ui.notice) {
      const kind = NOTICE_KIND[notice.code] || '装配';
      log(kind, `${notice.message}${notice.fix ? ` · ${notice.fix}` : ''}`, noticeLevel(notice.level));
      if (notice.level !== 'info') showToast(notice.message);
    }
  });

  /* ----------------------- 渲染循环 ----------------------- */
  let last = performance.now();
  let raf = 0;
  let frames = 0;
  let diagTimer = 0;
  let portLabelTimer = 0;

  function applyShellState() {
    const narrow = window.innerWidth < 768;
    const drawerMode = window.innerWidth <= 1100;
    shell.dataset.dock = narrow ? (state.dockOpen ? 'open' : 'closed') : prefs.dockRail ? 'rail' : 'full';
    // 窄视图下不让浮层默认遮挡主舞台：Inspector 与事件区默认收起，由用户主动打开
    shell.dataset.inspect = !drawerMode && state.inspectOpen ? 'on' : 'off';
    shell.dataset.status = !narrow && state.statusOpen ? 'on' : 'off';
    // M0.3：工作区自己带导航与检视面板，打开时把左侧导航与右侧检视让给工作区
    if (activeWorkspace) shell.dataset.workspace = activeWorkspace.kind;
    else delete shell.dataset.workspace;
    boot.el.dataset.phase = bootFinished ? 'done' : 'run';
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    frames += 1;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (!scene?.ok) {
      // 无 3D 时的最小开销：仍然更新开场 HUD，避免界面停滞
      portOverlay.dataset.open = 'false';
      if (!bootFinished && timeline.t.playing) {
        timeline.advance(dt);
        const s = timeline.sample();
        boot.update(s, shotLabel(timeline.currentShot().shot));
        if (timeline.t.finished) finishIntro('TIMELINE END');
      }
      return;
    }

    const v = scene.visual;
    if (!bootFinished) {
      timeline.advance(dt);
      const s = timeline.sample();
      scene.camera.position.copy(s.camera);
      scene.camera.lookAt(s.target);
      v.assembly = s.assembly;
      v.lit = s.lit;
      v.bootLight = 0.06 + s.lit * 0.94;
      v.idle = s.progress > 0.62;
      v.activity = 0.25 + s.progress * 0.5;
      stage.setCanvasOpacity(s.lit * 0.9 + 0.1);
      boot.update(s, shotLabel(timeline.currentShot().shot));
      if (!timeline.currentShot().shot || timeline.t.finished) finishIntro('TIMELINE END');
    } else {
      v.idle = true;
      v.bootLight = 1;
      // 装配预览 / 拖拽时核心活动度提高：表示「正在建立连接关系」的轻微聚焦
      const assembling = constructor.getState().ui.preview || constructor.getState().ui.drag;
      let activity = assembling ? 0.72 : 0.35;
      // M0.3：执行台回放期间数据流强度跟随真实播放状态；暂停即回到静态
      if (activeWorkspace?.kind === 'execution') activity = execApi?.isPlaying() ? 0.92 : 0.34;
      v.activity = activity;
      stage.setCanvasOpacity(1);
    }

    scene.tick(dt);

    // 端口文字标注：位置跟随三维投影，但不需要每帧写 DOM
    portLabelTimer += dt;
    if (portLabelTimer > 0.1) {
      portLabelTimer = 0;
      updatePortLabels();
    }

    // 读数与诊断：真实数据，不虚构
    diagTimer += dt;
    if (diagTimer > 0.45) {
      diagTimer = 0;
      const p = scene.camera.position;
      const radius = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
      patchReadout({
        zoom: radius,
        azimuth: (Math.atan2(p.x, p.z) * 180) / Math.PI,
        polar: (Math.acos(Math.max(-1, Math.min(1, p.y / Math.max(1e-6, radius)))) * 180) / Math.PI,
      });
      const stats = scene.getStats();
      patchReadout({
        fps: stats.fps,
        ms: stats.fps > 0 ? 1000 / stats.fps : 0,
        drawCalls: stats.calls,
        triangles: stats.triangles,
      });
      stage.updateReadout({
        coreState: state.coreState,
        zoom: state.readout.zoom,
        azimuth: state.readout.azimuth,
        polar: state.readout.polar,
        fps: stats.fps,
        ms: state.readout.ms,
        drawCalls: stats.calls,
        triangles: stats.triangles,
        programs: stats.programs,
        post: scene.hasPost,
        renderer: scene.caps.lowPower ? '低功耗档' : '标准档',
      });
      status.updateDiag([
        ['帧率', stats.fps ? stats.fps.toFixed(0) + ' fps' : '—'],
        ['单帧耗时', `${state.readout.ms.toFixed(1)} ms`],
        ['绘制调用', String(stats.calls)],
        ['三角面', stats.triangles > 0 ? `${stats.triangles.toLocaleString('zh-CN')} 个` : '—'],
        ['几何体', String(stats.geometries)],
        ['纹理', String(stats.textures)],
        ['渲染档位', scene.caps.lowPower ? '低功耗' : '标准'],
        ['后期处理', scene.hasPost ? '泛光 + 调色' : '关闭'],
        ['像素比', String(scene.renderer.getPixelRatio().toFixed(2))],
        ['选中结构', state.selection ? PARTS[state.selection].name : '—'],
      ]);
    }
  }

  /* ----------------------- 状态同步 ----------------------- */
  subscribe((s, reason) => {
    if (s.selection !== undefined) {
      if (scene?.ok) scene.visual.selection = s.selection;
      applySvgSelection(projectionSvg, s.selection);
      renderInspector();
    }
    if (reason === 'mode' || reason === 'mode-locked') {
      dock.setMode(s.mode);
      renderModePanel(s.mode);
    }
    if (reason === 'select' || reason === 'select-toggle') dock.setMode(s.mode);
    if (reason === 'view' || reason === 'fallback') {
      if (s.systemView && !projection.parentElement) showProjection(true);
    }
  });

  /* ----------------------- 侧栏模式面板 ----------------------- */
  const modeOverlay = createEl('div', {
    class: 'mode-overlay',
    style:
      'position:absolute;inset:0;z-index:8;display:none;padding:16px;background:linear-gradient(180deg,rgba(7,9,13,.86),rgba(5,7,10,.94))',
  });
  stage.el.append(modeOverlay);

  function renderModePanel(mode) {
    // M0.1 不为未完成模式造功能面板：锁定的模式只提供诚实的阶段说明与返回入口
    const nav = NAV.find((n) => n.id === mode);
    if (!nav || !nav.locked) {
      modeOverlay.style.display = 'none';
      modeOverlay.innerHTML = '';
      return;
    }
    modeOverlay.innerHTML = '';
    modeOverlay.append(LockedPanel({ nav, onBack: () => handleMode(NAV.find((n) => n.id === 'system')) }));
    modeOverlay.style.display = 'block';
  }

  /* ==================================================================
     M0.3 工作区：ATLAS 知识星图 / Tool Calling 知识页 / 执行台
     三者都是舞台区域内的覆盖层，共用同一宿主与同一套退出清理逻辑；
     它们不持有第二份模块状态，只读取 constructor / learning / 运行记录。
     ================================================================== */
  const workspaceHost = createEl('div', { class: 'workspace-host', 'data-open': 'false', 'data-kind': 'none' });
  stage.el.append(workspaceHost);

  /** 当前工作区：{ kind, api, el } —— 同时最多一个，避免多份回放调度并存 */
  let activeWorkspace = null;
  let execApi = null;
  let canvasParked = false;

  /** 运行输入快照：复用落盘用的序列化函数，保证与权威配置逐字段一致 */
  function constructorSnapshot() {
    return serializeConfig(constructor.getState());
  }

  function syncTopbar() {
    topbar.setPressed({ dock: shell.dataset.dock !== 'rail', inspect: state.inspectOpen, status: state.statusOpen });
  }

  function closeWorkspace() {
    if (!activeWorkspace) return false;
    const { kind, api, el } = activeWorkspace;
    try {
      api.deactivate?.();
    } catch (error) {
      log('界面', `工作区退出清理异常已被拦截：${error.message}`, 'error');
    }
    try {
      api.dispose?.();
    } catch (error) {
      log('界面', `工作区销毁异常已被拦截：${error.message}`, 'error');
    }
    el.remove();
    if (kind === 'execution') execApi = null;
    unparkCanvas();
    activeWorkspace = null;
    workspaceHost.dataset.open = 'false';
    workspaceHost.dataset.kind = 'none';
    delete stage.el.dataset.workspace;
    applyShellState();
    setState({ workspace: null }, 'workspace-close');
    return true;
  }

  function openWorkspace(kind, build) {
    closeWorkspace();
    const api = build();
    workspaceHost.append(api.el);
    workspaceHost.dataset.open = 'true';
    workspaceHost.dataset.kind = kind;
    stage.el.dataset.workspace = 'true';
    activeWorkspace = { kind, api, el: api.el };
    applyShellState();
    // 导航高亮跟随工作区：知识页属于 Atlas，避免出现「高亮执行台却在看知识页」
    setState({ workspace: kind, mode: kind === 'knowledge' ? 'atlas' : kind }, 'workspace');
    api.activate?.();
    return api;
  }

  /* ---------------- 三维画布停靠：执行台中央列复用同一个 WebGL 上下文 ---------------- */
  function parkCanvas(target) {
    if (!scene?.ok || !target) return;
    const host = stage.canvasHost;
    if (host.parentElement === target) return;
    target.append(host);
    canvasParked = true;
    scene.resize();
  }

  function unparkCanvas() {
    if (!scene?.ok) return;
    const host = stage.canvasHost;
    if (host.parentElement === stage.el) {
      canvasParked = false;
      return;
    }
    stage.el.prepend(host);
    canvasParked = false;
    scene.resize();
  }

  /** 事件 → 三维表现：只做聚焦表现，不改变任何装配或运行数据 */
  function applyExecutionFocus(focus) {
    if (!scene?.ok) return;
    if (!focus?.moduleId) {
      scene.bay.clearExecutionFocus();
      return;
    }
    scene.bay.setExecutionFocus(focus.moduleId, focus.tone || 'signal');
  }

  /* ---------------- 导航：知识 ↔ 构建器 ↔ 执行 ---------------- */
  function goHub() {
    closeWorkspace();
    handleMode(NAV.find((n) => n.id === 'system'));
    log('导航', '已返回中央核心（Hub）· 装配配置、学习进度与运行记录都未被清空', 'info');
  }

  /** 回到装配台上下文：可选恢复原来选中的模块，保证「返回」不丢上下文 */
  function openConstructorContext({ selectedModuleId = null, reason = '' } = {}) {
    closeWorkspace();
    setState({ mode: 'constructor' }, 'mode');
    dock.setMode('constructor');
    if (state.systemView) setView('assembly');
    if (window.innerWidth >= 768 && shell.dataset.dock === 'rail') {
      shell.dataset.dock = 'full';
      prefs.dockRail = false;
      persistPrefs();
    }
    syncTopbar();
    if (selectedModuleId && constructor.getInstalled(selectedModuleId)) constructor.actions.select(selectedModuleId);
    if (reason) log('导航', reason, 'signal');
  }

  /** 「在系统中查看」：只定位与说明，绝不私自装配模块或授予权限 */
  function locateInConstructor(concept, context = {}) {
    openConstructorContext({ reason: `知识节点「${concept.cn}」→ 装配台定位（只定位，不改动配置与权限）` });
    if (concept.systemTarget === 'core') {
      selectPart('core');
      log('导航', `${concept.cn}对应中央核心（Model Core）：已选中该结构，未触发任何装配动作`, 'signal');
      return;
    }
    const installed = constructor.getState().modules;
    const target = installed.find((m) => m.moduleId === 'announcement_search') || installed.find((m) => m.moduleId === 'document_reader');
    if (target) {
      constructor.actions.select(target.moduleId);
      log('导航', `${concept.cn}对应能力架中的工具模块：已定位到已装配的 ${getModule(target.moduleId).cn}（未修改任何参数）`, 'signal');
      return;
    }
    constructor.actions.select(null);
    showToast('Search / Reader 尚未装配：已在能力架中定位，不会自动添加模块或授予权限。');
    log(
      '导航',
      `${concept.cn}对应能力架里的 Announcement Search 与 Document Reader，但当前尚未装配：只定位能力架并说明「尚未装配」，不私自添加模块或授予权限`,
      'attention'
    );
  }

  function locateModuleInConstructor(moduleId) {
    const mod = getModule(moduleId);
    if (!mod) return;
    openConstructorContext({ reason: `从执行台定位 ${mod.cn}` });
    if (constructor.getInstalled(moduleId)) {
      constructor.actions.select(moduleId);
      log('导航', `已定位到已装配的 ${mod.cn}：本次运行的事件不对模块做任何写入`, 'signal');
    } else {
      showToast(`${mod.cn}当前尚未装配：已在能力架中定位，不会自动添加。`);
      log('导航', `执行台引用了 ${mod.cn}，但装配台里当前没有这个模块：已在能力架中定位并说明「尚未装配」`, 'attention');
    }
  }

  function openAtlas(conceptId = null) {
    const api = openWorkspace('atlas', () =>
      createAtlasWorkspace({
        learning,
        reducedMotion,
        onLog: (kind, message, level) => log(kind, message, level),
        onBackToHub: () => goHub(),
        onOpenKnowledge: (id) => openKnowledge(id, { from: 'atlas', conceptId }),
        onViewInConstructor: (concept) => locateInConstructor(concept, { from: 'atlas' }),
      })
    );
    api.activate(conceptId);
    log(
      '导航',
      `知识星图已打开${conceptId && getConcept(conceptId) ? ` · 已定位 ${getConcept(conceptId).cn}` : ''}（概念关系图；打开知识页不会触发模拟运行，也不会清空运行轨迹）`,
      'signal'
    );
    return api;
  }

  function openKnowledge(conceptId = 'tool_calling', context = {}) {
    const concept = getConcept(conceptId);
    const api = openWorkspace('knowledge', () =>
      createToolCallingKnowledge({
        learning,
        reducedMotion,
        onLog: (kind, message, level) => log(kind, message, level),
        onBackToHub: () => goHub(),
        onOpenAtlas: (id) => openAtlas(id),
        onViewInConstructor: (c) => locateInConstructor(c, { from: 'knowledge' }),
        onReturn: () => {
          if (context.from === 'constructor') {
            openConstructorContext({
              selectedModuleId: context.selectedModuleId || null,
              reason: `从 Tool Calling 知识节点返回装配台 · 保持原有 Inspector 上下文（${context.selectedModuleId || '未选中模块'}）`,
            });
          } else if (context.from === 'execution') {
            openExecution();
          } else if (context.from === 'atlas') {
            openAtlas(context.conceptId || conceptId);
          } else {
            goHub();
          }
        },
      })
    );
    api.activate();
    log('导航', `已进入 ${concept ? concept.cn : conceptId} 知识页（四步学习路径；实验为知识示范，不修改构建器配置）`, 'signal');
    return api;
  }

  function openExecution({ autorun = false } = {}) {
    const api = openWorkspace('execution', () => {
      execApi = createExecutionWorkspace({
        getConfigSnapshot: constructorSnapshot,
        has3D: !!scene?.ok,
        reducedMotion,
        onLog: (kind, message, level) => log(kind, message, level),
        onBackToHub: () => goHub(),
        onBackToConstructor: () => openConstructorContext({ selectedModuleId: constructor.getState().ui.selectedModuleId }),
        onOpenKnowledge: (id, ctx) => openKnowledge(id, ctx),
        onLocateModule: (moduleId) => locateModuleInConstructor(moduleId),
        onMountCanvas: () => parkCanvas(execApi?.coreStage?.() || null),
        onReleaseCanvas: () => unparkCanvas(),
        onFocusScene: (focus) => applyExecutionFocus(focus),
      });
      return execApi;
    });
    log('导航', '执行台已打开：使用装配台当前配置快照在浏览器本地运行教学模拟（无真实检索、无在线 AI）', 'signal');
    if (autorun) api.newRun();
    return api;
  }

  /* ----------------------- 键盘与事件 ----------------------- */
  function onKey(e) {
    if (e.key === 'Escape') {
      if (confirmLayer.dataset.open === 'true') {
        closeConfirm();
        return;
      }
      if (!bootFinished) {
        skipIntro('ESC');
        return;
      }
      // M0.3：工作区内 Esc 先清除选中，再退出工作区；返回入口始终可见，不会困住用户
      if (activeWorkspace) {
        if (activeWorkspace.kind === 'atlas' && activeWorkspace.api.clearSelection?.()) return;
        if (activeWorkspace.kind === 'execution') return; // 执行台不因误触 Esc 丢失当前事件定位
        closeWorkspace();
        return;
      }
      // Esc 依次取消：装配预览 / 引导拖拽 → 移动端抽屉 → 选中
      if (cancelTransientAssembly()) return;
      if (state.dockOpen) {
        setState({ dockOpen: false }, 'esc');
        scrim.dataset.open = 'false';
        return;
      }
      if (state.selection) selectPart(null);
      return;
    }
    if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'r') resetView();
    else if (k === 'd') toggleDock();
    else if (k === 'i') toggleInspect();
    else if (k === 'e') toggleStatus();
    else if (k === 's') setView(state.systemView ? 'assembly' : 'system');
  }

  function onResize() {
    scene?.resize();
    applyShellState();
    updatePortLabels();
    // 视口比例变化会改变取景距离：入场后重新收敛到标准镜位，避免主体被裁切
    if (scene?.ok && bootFinished) {
      const p = scene.camera.position;
      const n = Math.hypot(p.x, p.y, p.z) || 1;
      const h = Math.hypot(GEOMETRY.hubCamera.x, GEOMETRY.hubCamera.y, GEOMETRY.hubCamera.z) || 1;
      const dot = (p.x / n) * (GEOMETRY.hubCamera.x / h) + (p.y / n) * (GEOMETRY.hubCamera.y / h) + (p.z / n) * (GEOMETRY.hubCamera.z / h);
      if (dot > 0.9) scene.rig.resetView();
    }
  }

  function onPointerUp(e) {
    if (!scene?.ok || bootFinished === false) return;
    if (e.target !== scene.renderer.domElement) return;
    if (scene.rig.moved) return;
    // M0.2：兼容接口优先于结构拾取，且只对预先定义的合法端口生效
    const portId = scene.pickPortAt(e.clientX, e.clientY);
    if (portId) {
      handlePortClick(portId);
      return;
    }
    const part = scene.pickAt(e.clientX, e.clientY);
    if (part) selectPart(part);
    else if (state.selection) selectPart(null);
  }

  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  if (scene?.ok) {
    scene.renderer.domElement.addEventListener('pointerup', onPointerUp);
    scene.rig.controls.addEventListener('start', () => {
      if (!bootFinished) skipIntro('用户拖拽');
    });
    const canvas = scene.renderer.domElement;
    let downX = 0;
    let downY = 0;
    canvas.addEventListener('pointerdown', (e) => {
      downX = e.clientX;
      downY = e.clientY;
    });
    canvas.addEventListener('pointerup', (e) => {
      scene.rig.moved = Math.hypot(e.clientX - downX, e.clientY - downY) > 6;
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) last = performance.now();
  });

  /* ----------------------- 启动 ----------------------- */
  onLog((entry) => status.append(entry));
  status.renderAll(logEntries);

  BOOT_LOG.forEach(([kind, message]) => log(kind, message, kind === 'SIM' ? 'attention' : 'info'));
  log(
    'ENV',
    `WebGL ${scene?.ok ? '可用' : '不可用'} · ${scene?.caps?.lowPower ? '低功耗档' : '标准档'} · reduced-motion ${
      reducedMotion ? 'ON' : 'OFF'
    } · DPR ${window.devicePixelRatio}`
  );
  if (!scene?.ok) log('渲染', `兜底原因：${fallbackReason}`, 'error');

  log(
    '知识',
    'M0.3 知识星图已载入：10 个概念节点 + 10 条人工配置的语义关系（USES 3 / RELATED 6 / CONTRASTS 1，本轮不编造 PART_OF）',
    'signal'
  );
  log('执行', 'M0.3 本地模拟引擎就绪：配置快照派生可用性 → 确定性事件（B01–B05）· 运行期零网络请求', 'signal');
  log('配置', `学习进度命名空间 ${'agent-zero:learning:v1'} · 运行记录命名空间 agent-zero:execution:v1（与装配台配置互不覆盖）`, 'info');

  applyShellState();
  dock.setMode('system');
  topbar.setPressed({ dock: !prefs.dockRail, inspect: state.inspectOpen, status: state.statusOpen });
  stage.setStatusLabel(state.statusOpen);

  // 装配状态初始化：先同步已恢复的配置，再渲染检视面板，避免出现“面板与配置不一致”
  syncConstructor();
  updatePortLabels();

  const restoredState = constructor.getState();
  if (restoredState.ui.notice) {
    const notice = restoredState.ui.notice;
    log(NOTICE_KIND[notice.code] || '配置', `${notice.message}${notice.fix ? ` · ${notice.fix}` : ''}`, noticeLevel(notice.level));
  } else if (restoredState.modules.length > 0) {
    log(
      '配置',
      `已从本机恢复 ${restoredState.modules.length} 个已确认配置（瞬态预览与拖动不恢复）`,
      'signal'
    );
  } else {
    log('配置', '构建器本地配置为空：可从左侧能力架装配 Announcement Search 或 Document Reader', 'info');
  }

  if (introSeen && !forceIntro) {
    bootFinished = true;
    boot.setDone();
    shell.dataset.boot = 'false';
    setState({ phase: 'hub', coreState: scene?.ok ? 'IDLE' : 'DORMANT' }, 'boot-skip');
    if (scene?.ok) {
      scene.visual.assembly = [1, 1, 1];
      scene.visual.lit = 1;
      scene.visual.bootLight = 1;
      scene.visual.idle = true;
      scene.rig.enterIdle(true);
    }
    log('开场', '检测到本地首访标记：本次直接进入控制台（顶栏可重播开场）', 'info');
  } else {
    startIntro();
    setTimeout(() => boot.focusSkip(), 400);
  }

  raf = requestAnimationFrame(loop);

  /* ----------------------- 对外 API（便于自检脚本驱动） ----------------------- */
  const api = {
    state,
    PARTS,
    hubCamera: GEOMETRY.hubCamera,
    selectPart,
    resetView,
    setView,
    skipIntro,
    replayIntro,
    scene,
    timeline,
    log,
    /* M0.2 装配域：自检脚本通过它与点击 / 拖拽完全相同的入口驱动状态 */
    constructor,
    modules: MODULES,
    ports: PORTS,
    describeStatus,
    validateConnection,
    /* M0.3 知识与执行域：自检脚本使用与界面按钮完全相同的入口 */
    learning,
    openAtlas: (conceptId = null) => openAtlas(conceptId),
    openKnowledge: (conceptId = 'tool_calling', context = {}) => openKnowledge(conceptId, context),
    openExecution: (options = {}) => openExecution(options),
    closeWorkspace,
    goHub,
    workspaceKind: () => activeWorkspace?.kind || null,
    atlasApi: () => (activeWorkspace?.kind === 'atlas' ? activeWorkspace.api : null),
    knowledgeApi: () => (activeWorkspace?.kind === 'knowledge' ? activeWorkspace.api : null),
    executionApi: () => (activeWorkspace?.kind === 'execution' ? activeWorkspace.api : null),
    runCondition: () => {
      const c = runCondition();
      return { searchReady: c.search.ready, readerReady: c.reader.ready, searchCode: c.search.blockCode, readerCode: c.reader.blockCode, bothReady: c.bothReady };
    },
    toolAvailability: () => deriveToolAvailability(constructorSnapshot()),
    constructorConfigSnapshot: () => constructorSnapshot(),
    learningSnapshot: () => ({ summary: learning.summary(), concepts: { ...learning.getState().concepts } }),
    learningStorageKey: 'agent-zero:learning:v1',
    executionStorageKey: 'agent-zero:execution:v1',
    locateInConstructor: (conceptId) => {
      const concept = getConcept(conceptId);
      if (!concept) return false;
      locateInConstructor(concept);
      return true;
    },
    /** 从模块 Inspector 的知识链接进入知识页（与界面点击同一条路径） */
    openKnowledgeFromInspector: () => {
      const btn = document.querySelector('.inspector [data-act="open-knowledge"]');
      if (!btn) return false;
      btn.click();
      return true;
    },
    /** 兼容 M0.2 自检脚本：快照保持不变 */
    constructorSnapshotOnly() {
      return constructorSnapshot();
    },
    /** 真实渲染帧计数：自检脚本用它区分「回放调度没运行」与「事件没推进」 */
    frameCount: () => frames,
    /** 端口锚点的屏幕坐标（用于拖拽吸附与验收断言） */
    portScreenPoint(portId) {
      if (!scene?.ok) return null;
      const v = scene.bay.getAnchorWorld(portId);
      if (!v) return null;
      v.project(scene.camera);
      const rect = scene.renderer.domElement.getBoundingClientRect();
      return { x: rect.left + (v.x * 0.5 + 0.5) * rect.width, y: rect.top + (-v.y * 0.5 + 0.5) * rect.height };
    },
    /* 语义化入口：自检脚本与界面按钮调用同一套动作 */
    previewModule: (moduleId) => constructor.actions.preview(moduleId),
    confirmAssembly: () => constructor.actions.commit(),
    cancelAssembly: () => constructor.actions.cancel(),
    configureModule: (moduleId, patch) => constructor.actions.configure(moduleId, patch),
    toggleModule: (moduleId, enabled) => constructor.actions.setEnabled(moduleId, enabled),
    removeModule: (moduleId) => constructor.actions.remove(moduleId),
    selectModule: (moduleId) => constructor.actions.select(moduleId),
    resetConstructor: () => constructor.actions.reset(),
    /** 当前已装配模块的状态快照（供验收矩阵断言） */
    constructorSnapshot() {
      const s = constructor.getState();
      return {
        modules: s.modules.map((m) => ({ moduleId: m.moduleId, portId: m.portId, enabled: m.enabled, status: constructor.statusOf(m.moduleId), settings: { ...m.settings }, permissions: { ...m.permissions } })),
        preview: s.ui.preview,
        drag: s.ui.drag,
        selectedModuleId: s.ui.selectedModuleId,
        notice: s.ui.notice,
        persisted: constructor.readPersisted().modules,
      };
    },
    /** 单帧渲染：跳转到开场任意时刻并渲染一帧（用于确定性截图与自检） */
    captureFrame(time) {
      if (!scene?.ok) return false;
      const paused = bootFinished;
      bootFinished = false;
      timeline.t.playing = false;
      timeline.t.finished = false;
      timeline.t.value = time;
      const s = timeline.sample();
      scene.camera.position.copy(s.camera);
      scene.camera.lookAt(s.target);
      const v = scene.visual;
      v.assembly = s.assembly;
      v.lit = s.lit;
      v.bootLight = 0.06 + s.lit * 0.94;
      v.idle = s.progress > 0.62;
      v.activity = 0.25 + s.progress * 0.5;
      stage.setCanvasOpacity(s.lit * 0.9 + 0.1);
      boot.el.dataset.phase = 'run';
      shell.dataset.boot = 'true';
      boot.update(s, shotLabel(timeline.currentShot().shot));
      scene.tick(1 / 60);
      if (paused) {
        bootFinished = true;
        boot.setDone();
        shell.dataset.boot = 'false';
      }
      return true;
    },
    dispose() {
      cancelAnimationFrame(raf);
      endDragInteraction();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      scene?.dispose?.();
    },
  };
  window.__AZ = api;
  return api;
}
