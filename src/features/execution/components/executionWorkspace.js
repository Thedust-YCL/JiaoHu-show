/**
 * src/features/execution/components/executionWorkspace.js
 * ------------------------------------------------------------------
 * EXECUTION / MISSION-001-MINI 工作区。
 *
 * 职责（M0.3_TASK §8）：
 *   · 左侧只画本次真正走过的事件路径；中央联动 AZ-CORE 01；右侧事件
 *     Inspector；底部可操作时间轴；
 *   · 回放只在已生成的事件数组上移动指针（state/replay.js）；
 *   · New Run 才读取装配台当前配置生成新轨迹；旧轨迹保存在快照里，
 *     装配台之后怎么改都不会重写它；
 *   · 只保存最近一次 Run 到独立命名空间，绝不触碰构建器配置。
 * ------------------------------------------------------------------
 */
import { h, esc } from '../../constructor/components/dom.js';
import { SIMULATED_CONSTANT } from '../../../data/content.js';
import { canonicalize } from '../../../simulation/events/serializer.js';
import { summarizeRun, runSimulation } from '../../../simulation/engine/runSimulation.js';
import { deriveToolAvailability } from '../../../simulation/rules/availability.js';
import { MISSION_001_MINI } from '../../../research-packs/mission-001-mini/index.js';
import { createReplay, SPEEDS } from '../state/replay.js';
import { EXECUTION_STORAGE_KEY, readExecution, writeExecution } from '../state/persistence.js';
import { createExecutionGraph } from './executionGraph.js';
import { createExecutionCore } from './executionCore.js';
import { createEventInspector } from './inspector.js';
import { createTimeline } from './timeline.js';

export function createExecutionWorkspace({
  getConfigSnapshot,
  onLog,
  onBackToHub,
  onBackToConstructor,
  onOpenKnowledge,
  onLocateModule,
  onMountCanvas,
  onReleaseCanvas,
  onFocusScene,
  has3D = false,
  reducedMotion = false,
  storage = null,
} = {}) {
  const el = h('div', { class: 'workspace workspace--execution', 'data-open': 'true' });

  /* ----------------------------- 头部 ----------------------------- */
  const head = h('header', { class: 'ws-head' });
  const info = h('div', { class: 'ex-info', 'data-el': 'info' });
  head.append(
    h('div', { class: 'ws-head__id' }, `
      <span class="ws-head__tag">A/0</span>
      <span class="ws-head__title">EXECUTION / MISSION-001-MINI</span>
      <span class="ws-head__meta">${esc(SIMULATED_CONSTANT)} · 浏览器本地模拟 · 无在线 AI、无真实检索</span>`),
    h('div', { class: 'ws-head__actions' })
  );
  const actions = head.querySelector('.ws-head__actions');
  const viewSeg = h('div', { class: 'seg', role: 'group', 'aria-label': '中央执行视图切换' });
  const b3d = h('button', { type: 'button', 'aria-pressed': 'true', title: has3D ? '三维核心联动' : '当前环境无 WebGL，将使用二维等价视图' }, 'VIEW: 3D');
  const b2d = h('button', { type: 'button', 'aria-pressed': 'false', title: '二维执行核心投影' }, 'VIEW: 2D');
  viewSeg.append(b3d, b2d);
  const newRunBtn = h('button', { class: 'btn btn--primary', type: 'button', 'data-act': 'new-run' }, 'RUN SIMULATION · 新运行');
  const backCtor = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'back-constructor' }, '装配台');
  const backHub = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'back-hub' }, 'Back to Hub');
  actions.append(viewSeg, newRunBtn, backCtor, backHub);

  /* ----------------------------- 主体 ----------------------------- */
  const graph = createExecutionGraph({ onSeek: (seq) => seek(seq, 'graph') });
  const core = createExecutionCore({ onLog });
  const inspector = createEventInspector({ onOpenKnowledge, onLocateModule });

  const grid = h('div', { class: 'ex-grid' }, graph.el, core.el, inspector.el);
  const timeline = createTimeline({
    onPlayToggle: () => togglePlay(),
    onPrev: () => step(-1),
    onNext: () => step(1),
    onSeek: (seq) => seek(seq, 'strip'),
    onSpeed: (value) => setSpeed(value),
    onRestart: () => restart(),
    onNewRun: () => newRun({ reason: '按钮 New Run' }),
  });

  el.append(head, info, grid, timeline.el);

  /* ----------------------------- 状态 ----------------------------- */
  let run = null;
  let replay = null;
  let source = 'none';
  let active = false;
  let savedAt = null;
  let tickTimer = 0;
  let lastTickAt = 0;

  /**
   * 回放调度：自己持有定时器，**不依赖 requestAnimationFrame / WebGL**。
   * 这样无 WebGL 的二维兜底、后台标签页或渲染循环被节流时，事件指针
   * 依然能按设定速度推进；离开工作区时立即清理，不留下播放调度。
   */
  function startTicker() {
    if (tickTimer) return;
    lastTickAt = Date.now();
    tickTimer = setInterval(() => {
      if (!active || !replay) return;
      const now = Date.now();
      const dt = Math.min(0.25, (now - lastTickAt) / 1000);
      lastTickAt = now;
      replay.tick(dt);
    }, 60);
  }

  function stopTicker() {
    if (!tickTimer) return;
    clearInterval(tickTimer);
    tickTimer = 0;
  }

  /**
   * 本次运行设置：故障注入属于**单次运行选项**，不是模块的永久状态，
   * 也不会随机触发（M0.3_TASK §6.3 B04）。
   */
  const runOptions = { faultMode: 'normal' };

  function configSnapshot() {
    try {
      return getConfigSnapshot ? getConfigSnapshot() : { schemaVersion: 1, modules: [] };
    } catch {
      return { schemaVersion: 1, modules: [] };
    }
  }

  function availabilityLine(snapshot, label) {
    const availability = deriveToolAvailability(snapshot);
    const search = availability.tools.announcement_search;
    const reader = availability.tools.document_reader;
    return h('div', { class: 'ex-info__row' }, `
      <span class="ex-info__label">${esc(label)}</span>
      <span class="ex-info__tools">
        <span class="tag tag--${search.ready ? 'signal' : 'attention'}">Search · ${search.ready ? 'Ready' : esc(search.blockCode)}</span>
        <span class="tag tag--${reader.ready ? 'signal' : 'attention'}">Reader · ${reader.ready ? 'Ready' : esc(reader.blockCode)}</span>
        <span class="mono">${esc((snapshot.modules || []).map((m) => `${m.moduleId}${m.enabled === false ? '(Disabled)' : ''}`).join(' + ') || '未装配任何模块')}</span>
      </span>`);
  }

  function renderInfo() {
    info.replaceChildren();
    const live = configSnapshot();
    /* 本次运行设置：明确标注这是单次运行的测试条件，不是模块状态 */
    const faultRow = h('div', { class: 'ex-info__row', 'data-el': 'run-options' });
    const faultSel = h('select', { class: 'field__control field__control--sm', 'aria-label': '本次运行设置：测试条件' });
    for (const [value, label] of [
      ['normal', '正常运行（不注入故障）'],
      ['search_timeout', '模拟检索超时（search_timeout）'],
    ]) {
      faultSel.append(h('option', { value }, label));
    }
    faultSel.value = runOptions.faultMode;
    faultSel.addEventListener('change', () => {
      runOptions.faultMode = faultSel.value === 'search_timeout' ? 'search_timeout' : 'normal';
      onLog?.(
        '执行',
        runOptions.faultMode === 'normal'
          ? '本次运行设置：正常运行（未注入故障）'
          : '本次运行设置：已开启 search_timeout 故障条件——下一次 New Run 会产生一次确定性的检索超时，不会随机触发，也不是模块的永久 Invalid',
        runOptions.faultMode === 'normal' ? 'info' : 'attention'
      );
      renderInfo();
    });
    faultRow.append(
      h('span', { class: 'ex-info__label' }, '本次运行设置'),
      h('span', { class: 'ex-info__tools' }, faultSel),
      h('span', { class: 'ex-info__note' }, runOptions.faultMode === 'search_timeout'
        ? '已开启：下一次 New Run 会确定性地在检索阶段超时并出错结束，不会伪造成功响应。'
        : '故障注入只在显式开启时生效，且只影响单次运行；模块状态不会被改写成 Invalid。')
    );
    info.append(faultRow);

    if (!run) {
      info.append(
        availabilityLine(live, '准备运行（装配台当前配置）'),
        h('div', { class: 'ex-info__note' }, '还没有运行记录：点击 RUN SIMULATION 会用上面这份装配台配置生成一条事件轨迹。条件不满足时也会产生一次可解释的阻断运行，而不是把按钮禁用。')
      );
      return;
    }
    const summary = summarizeRun(run);
    const changed = canonicalize(live) !== canonicalize(run.configSnapshot);
    info.append(
      availabilityLine(run.configSnapshot, `本次运行输入（快照 ${esc(run.runId)}）`),
      h('div', { class: 'ex-info__row', title: '运行期不会重算历史轨迹：装配台之后的修改只在 New Run 时生效。' }, `
        <span class="ex-info__label">结局</span>
        <span class="ex-info__tools">
          <span class="tag tag--${summary.tone}">${esc(summary.outcomeEn)} · ${esc(summary.outcomeCn)}</span>
          <span class="tag tag--muted">${esc(run.branchId)}</span>
          <span class="tag tag--muted">${esc(run.missionId)}@${run.missionVersion}</span>
          <span class="tag tag--${run.options.faultMode === 'normal' ? 'muted' : 'attention'}">faultMode ${esc(run.options.faultMode)}</span>
          ${source === 'restored' ? '<span class="tag tag--attention">从本地记录恢复</span>' : ''}
          <span class="tag tag--${changed ? 'attention' : 'muted'}">${changed ? '装配台已变更 · 本次轨迹未变' : '快照一致'}</span>
          ${savedAt ? `<span class="mono">${esc(savedAt.replace('T', ' ').slice(0, 19))}</span>` : ''}
        </span>`)
    );
  }

  /* ----------------------------- 3D 联动 ----------------------------- */
  function applyEventToScene(event) {
    if (!has3D) return;
    if (!event || !event.toolId) {
      onFocusScene?.(null);
      return;
    }
    onFocusScene?.({ moduleId: event.toolId, tone: event.status });
  }

  /* ----------------------------- 渲染 ----------------------------- */
  function renderAll(reason = 'render') {
    if (!replay) {
      graph.render({ runId: 'none', events: [], branchId: '—' }, 0);
      timeline.renderEmpty();
      inspector.render(null, 0);
      core.render(null, null);
      return;
    }
    const state = replay.getState();
    graph.render(run, state.index);
    timeline.render(run, state);
    inspector.render(run, state.index);
    core.render(run, state.event);
    applyEventToScene(state.event);
    if (reason !== 'tick') onLog?.('执行', `回放定位到事件 #${String(state.index).padStart(2, '0')} ${state.event?.type || ''}（${reason}）`, 'info');
  }

  function attachRun(nextRun, { restored = false, saved = null } = {}) {
    replay?.dispose();
    run = nextRun;
    source = restored ? 'restored' : 'new';
    savedAt = saved;
    replay = createReplay(run, { baseIntervalMs: reducedMotion ? 620 : 1100 });
    replay.subscribe(() => renderAll('tick'));
    timeline.setEnabled();
    timeline.setSpeed(1);
    renderInfo();
    renderAll(restored ? '恢复历史轨迹' : '新运行');
  }

  /* ----------------------------- 操作 ----------------------------- */
  function newRun({ reason = 'New Run' } = {}) {
    const snapshot = configSnapshot();
    const nextRun = runSimulation(snapshot, MISSION_001_MINI, { faultMode: runOptions.faultMode });
    const ok = writeExecution(storage, EXECUTION_STORAGE_KEY, nextRun);
    if (!ok) onLog?.('执行', '本地运行记录写入失败（隐私模式或配额限制）：本次会话仍可正常回放，但刷新后不会恢复', 'attention');
    attachRun(nextRun, { restored: false, saved: ok ? new Date().toISOString() : null });
    const summary = summarizeRun(nextRun);
    onLog?.(
      '执行',
      `${reason}：使用装配台当前配置快照运行本地模拟 → ${summary.outcomeEn} · 分支 ${nextRun.branchId} · ${nextRun.events.length} 个事件 · faultMode ${nextRun.options.faultMode}（配置快照已冻结，之后的修改不会影响这条轨迹）`,
      summary.tone === 'error' ? 'error' : summary.tone === 'success' ? 'success' : 'attention'
    );
  }

  function togglePlay() {
    if (!replay) {
      onLog?.('执行', '还没有事件轨迹：请先点击 RUN SIMULATION', 'attention');
      return;
    }
    const state = replay.getState();
    if (state.atEnd && !state.playing) {
      // 末尾再次播放：从头开始播放（明确的行为，不是假动作）
      replay.restart();
      replay.play();
    } else {
      replay.toggle();
    }
    renderAll('播放/暂停');
  }

  function step(delta) {
    if (!replay) return;
    if (delta > 0) replay.next();
    else replay.prev();
    renderAll(delta > 0 ? '单步前进' : '单步后退');
  }

  function seek(sequence, from) {
    if (!replay) return;
    replay.pause();
    replay.seekTo(sequence);
    renderAll(`Seek（${from === 'graph' ? '执行图' : from === 'strip' ? '事件条' : '外部'}）`);
  }

  function setSpeed(value) {
    if (!replay) return;
    const applied = replay.setSpeed(value);
    timeline.setSpeed(applied);
    onLog?.('执行', `回放速度设为 ${applied}×（只影响事件展示节奏，不改变模拟结果）`, 'info');
  }

  function restart() {
    if (!replay) return;
    replay.restart();
    renderAll('Restart Replay（指针归零，未重新运行引擎）');
  }

  return {
    el,
    /** 打开工作区：恢复最近一次运行记录（如有），并把真实画布停靠到中心列 */
    activate() {
      active = true;
      if (!replay) {
        const restored = readExecution(storage);
        if (restored.notice) onLog?.('执行', `${restored.notice.message}${restored.notice.fix ? ` · ${restored.notice.fix}` : ''}`, restored.notice.level || 'attention');
        if (restored.run) {
          attachRun(restored.run, { restored: true, saved: restored.savedAt });
          onLog?.('执行', `已从本地记录恢复最近一次运行（${restored.run.events.length} 个事件 · ${restored.run.outcome}）：恢复的是快照，不会重新运行引擎`, 'signal');
        } else {
          renderAll('空状态');
        }
      }
      core.setView(core.getView(), { has3D });
      if (core.getView() === '3d' && has3D) onMountCanvas?.();
      renderInfo();
      startTicker();
      return { hasRun: !!run };
    },
    deactivate() {
      active = false;
      replay?.pause();
      stopTicker();
      onReleaseCanvas?.();
      renderAll('离开工作区');
    },
    /** 由内部定时器驱动推进；离开工作区时停止，不留下播放调度 */
    tick(dt) {
      if (!active || !replay) return;
      replay.tick(dt);
    },
    /** 供自检脚本使用的语义化入口（与界面按钮同一套动作） */
    newRun: () => newRun({ reason: '自检脚本' }),
    play: () => togglePlay(),
    next: () => step(1),
    prev: () => step(-1),
    seek: (seq) => seek(seq, 'external'),
    restart: () => restart(),
    setSpeed: (v) => setSpeed(v),
    setView: (next) => {
      const target = next === '2d' ? '2d' : '3d';
      core.setView(target, { has3D });
      b3d.setAttribute('aria-pressed', target === '3d' ? 'true' : 'false');
      b2d.setAttribute('aria-pressed', target === '2d' ? 'true' : 'false');
      el.dataset.coreView = target;
      if (target === '3d' && has3D) onMountCanvas?.();
      else onReleaseCanvas?.();
      if (run) renderAll('视图切换');
    },
    currentView: () => core.getView(),
    /** 中央列容器：app 层把真实三维画布停靠到这里（执行台不新建 WebGL 上下文） */
    coreStage: () => core.stage,
    currentRun: () => run,
    currentIndex: () => replay?.getState().index ?? -1,
    currentEvent: () => (replay ? replay.getState().event : null),
    isPlaying: () => replay?.getState().playing ?? false,
    eventCount: () => run?.events.length ?? 0,
    restoredFrom: () => source,
    /** 本次运行设置（故障注入）：自检脚本用它验证 B04 分支 */
    setFaultMode(mode) {
      runOptions.faultMode = mode === 'search_timeout' ? 'search_timeout' : 'normal';
      renderInfo();
      return runOptions.faultMode;
    },
    currentRunOptions: () => ({ ...runOptions }),
    dispose() {
      active = false;
      stopTicker();
      replay?.dispose();
      onReleaseCanvas?.();
    },
  };
}

export { SPEEDS };
