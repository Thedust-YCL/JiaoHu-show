/**
 * src/features/execution/components/executionWorkspace.js
 * ------------------------------------------------------------------
 * EXECUTION / MISSION 001 工作区（M0.3 执行台 + M0.4 研究闭环）。
 *
 * 职责：
 *   · 左侧只画本次真正走过的事件路径；中央联动 AZ-CORE 01；右侧事件
 *     Inspector；底部可操作时间轴；
 *   · 回放只在已生成的事件数组上移动指针（state/replay.js）；
 *   · New Run 才读取装配台当前配置生成新轨迹；旧轨迹保存在快照里，
 *     装配台之后怎么改都不会重写它；
 *   · M0.4：新增「研究策略」运行选项（不是第三个工具）、运行历史（最近两次）、
 *     以及 REPORT 视图（报告 + 来源检视 + 引用反查）；三者共用同一次 Run 的
 *     eventId / sourceId / chunkId。
 * ------------------------------------------------------------------
 */
import { h, esc } from '../../constructor/components/dom.js';
import { SIMULATED_CONSTANT } from '../../../data/content.js';
import { canonicalize } from '../../../simulation/events/serializer.js';
import { summarizeRun, runSimulation, DEFAULT_EVIDENCE_POLICY } from '../../../simulation/engine/runSimulation.js';
import { deriveToolAvailability } from '../../../simulation/rules/availability.js';
import { EVIDENCE_POLICIES, EVIDENCE_POLICY_META, FAULT_MODE_META } from '../../../simulation/events/schema.js';
import { MISSION_001 } from '../../../research-packs/mission-001/index.js';
import { createReplay, SPEEDS } from '../state/replay.js';
import { appendResearchRun, readResearchHistory, RESEARCH_STORAGE_KEY } from '../state/persistence.js';
import { createExecutionGraph } from './executionGraph.js';
import { createExecutionCore } from './executionCore.js';
import { createEventInspector } from './inspector.js';
import { createTimeline } from './timeline.js';
import { createReportView } from '../../reports/components/reportView.js';
import { reportOf, reportMetrics, legacyNotice, indexOfEvent, claimsForEvent } from '../../reports/state/reportState.js';

export function createExecutionWorkspace({
  getConfigSnapshot,
  onLog,
  onBackToHub,
  onBackToConstructor,
  onOpenKnowledge,
  onLocateModule,
  onOpenRuntime,
  onMountCanvas,
  onReleaseCanvas,
  onFocusScene,
  has3D = false,
  reducedMotion = false,
  storage = null,
} = {}) {
  const el = h('div', { class: 'workspace workspace--execution', 'data-open': 'true', 'data-view': 'execution' });

  /* ----------------------------- 头部 ----------------------------- */
  const head = h('header', { class: 'ws-head' });
  const info = h('div', { class: 'ex-info', 'data-el': 'info' });
  head.append(
    h('div', { class: 'ws-head__id' }, `
      <span class="ws-head__tag">A/0</span>
      <span class="ws-head__title">EXECUTION / MISSION 001</span>
      <span class="ws-head__meta">${esc(SIMULATED_CONSTANT)} · 本地模拟 · 无在线 AI</span>`),
    h('div', { class: 'ws-head__actions' })
  );
  const actions = head.querySelector('.ws-head__actions');

  const viewSeg = h('div', { class: 'seg', role: 'group', 'aria-label': '执行台视图切换' });
  const bExecution = h('button', { type: 'button', 'aria-pressed': 'true', 'data-act': 'view-execution', title: '事件轨迹与回放' }, 'EXECUTION · 事件轨迹');
  const bReport = h('button', { type: 'button', 'aria-pressed': 'false', 'data-act': 'view-report', title: '结构化研究报告与来源检视' }, 'REPORT · 研究报告');
  viewSeg.append(bExecution, bReport);

  const coreSeg = h('div', { class: 'seg', role: 'group', 'aria-label': '中央执行视图切换' });
  const b3d = h('button', { type: 'button', 'aria-pressed': 'true', title: has3D ? '三维核心联动' : '当前环境无 WebGL，将使用二维等价视图' }, '3D');
  const b2d = h('button', { type: 'button', 'aria-pressed': 'false', title: '二维执行核心投影' }, '2D');
  coreSeg.append(b3d, b2d);

  const backToReportBtn = h('button', { class: 'btn btn--sm btn--attention', type: 'button', 'data-act': 'back-to-report' }, '← 报告');
  backToReportBtn.hidden = true;

  const newRunBtn = h('button', { class: 'btn btn--primary', type: 'button', 'data-act': 'new-run' }, 'RUN SIMULATION');
  const backCtor = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'back-constructor' }, '装配台');
  const backHub = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'back-hub' }, 'HUB');
  actions.append(viewSeg, coreSeg, backToReportBtn, newRunBtn, backCtor, backHub);
  const runtimeButton=h('button',{type:'button',class:'btn btn--primary','data-open-runtime':'true'},'M2.2 Runtime');runtimeButton.onclick=()=>onOpenRuntime?.();actions.append(runtimeButton);

  /* ----------------------------- 主体 ----------------------------- */
  const graph = createExecutionGraph({ onSeek: (seq) => seek(seq, 'graph') });
  const core = createExecutionCore({ onLog });
  const inspector = createEventInspector({ onOpenKnowledge, onLocateModule, onOpenReport: () => setRunView('report') });

  const grid = h('div', { class: 'ex-grid' }, graph.el, core.el, inspector.el);

  const reportView = createReportView({
    mission: MISSION_001,
    onLog,
    onSwitchMode: (mode) => setRunView(mode),
    onViewEvent: (eventId, claimId) => viewEventFromReport(eventId, claimId),
    getRun: () => run,
  });

  const timeline = createTimeline({
    onPlayToggle: () => togglePlay(),
    onPrev: () => step(-1),
    onNext: () => step(1),
    onSeek: (seq) => seek(seq, 'strip'),
    onSpeed: (value) => setSpeed(value),
    onRestart: () => restart(),
    onNewRun: () => newRun({ reason: '按钮 New Run' }),
  });

  el.append(head, info, grid, reportView.el, timeline.el);

  /* ----------------------------- 状态 ----------------------------- */
  let run = null;
  let replay = null;
  let source = 'none';
  let active = false;
  let savedAt = null;
  let tickTimer = 0;
  let lastTickAt = 0;
  let runView = 'execution';
  /** 从报告跳转到执行事件时记住对应的 claim，用于 BACK TO REPORT（A61） */
  let pendingClaimId = null;
  let pendingReportScroll = 0;
  /** 本地运行历史（新的在前，最多两次） */
  let history = [];
  let historyIndex = 0;
  let legacyRun = null;

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
   * 本次运行设置：
   *   · evidencePolicy 是**本地规则策略**，不是第三个可装配工具；
   *   · faultMode 是单次运行的故障条件，不会把模块写成永久 Invalid。
   */
  const runOptions = { faultMode: 'normal', evidencePolicy: DEFAULT_EVIDENCE_POLICY };

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

  /** 运行选项：研究策略 + 故障模式（都是单次 Run 的设置，不是模块状态） */
  function runOptionsRow() {
    const row = h('div', { class: 'ex-info__row', 'data-el': 'run-options' });

    const policySel = h('select', { class: 'field__control field__control--sm', 'aria-label': '本次研究策略（本地规则，不新增工具）' });
    for (const policy of EVIDENCE_POLICIES) policySel.append(h('option', { value: policy }, `${policy} · ${EVIDENCE_POLICY_META[policy].cn}`));
    policySel.value = runOptions.evidencePolicy;
    policySel.addEventListener('change', () => {
      runOptions.evidencePolicy = EVIDENCE_POLICIES.includes(policySel.value) ? policySel.value : DEFAULT_EVIDENCE_POLICY;
      onLog?.('执行', `本次研究策略：${EVIDENCE_POLICY_META[runOptions.evidencePolicy].en} · ${EVIDENCE_POLICY_META[runOptions.evidencePolicy].cn}——这是本次 Run 的本地规则选项，不是新增的 AI 工具；下一次 New Run 才生效`, 'signal');
      renderInfo();
    });

    const faultSel = h('select', { class: 'field__control field__control--sm', 'aria-label': '本次运行设置：故障条件' });
    for (const [value, label] of [
      ['normal', `${FAULT_MODE_META.normal.en} · ${FAULT_MODE_META.normal.cn}`],
      ['search_timeout', `${FAULT_MODE_META.search_timeout.en} · ${FAULT_MODE_META.search_timeout.cn}`],
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

    row.append(
      h('span', { class: 'ex-info__label' }, '本次运行设置'),
      h('span', { class: 'ex-info__tools' }, policySel, faultSel),
      h('span', { class: 'ex-info__note', title: `研究策略 ${EVIDENCE_POLICY_META[runOptions.evidencePolicy].en}：${EVIDENCE_POLICY_META[runOptions.evidencePolicy].desc}` }, EVIDENCE_POLICY_META[runOptions.evidencePolicy].desc)
    );
    return row;
  }

  /** 运行历史（最近两次）：切换只换查看对象，不重新运行引擎 */
  function historyRow() {
    if (history.length === 0 && !legacyRun) return null;
    const row = h('div', { class: 'ex-info__row', 'data-el': 'history' });
    const chips = h('span', { class: 'ex-info__tools' });
    history.forEach((entry, i) => {
      const summary = summarizeRun(entry.run);
      const b = h(
        'button',
        {
          class: 'ex-history',
          type: 'button',
          'data-history-index': String(i),
          'data-active': i === historyIndex ? 'true' : 'false',
          'aria-pressed': i === historyIndex ? 'true' : 'false',
          title: `运行 ${entry.run.runId} · ${summary.outcomeEn} · ${entry.savedAt || ''}`,
        },
        `${i === 0 ? '本次' : '上一次'}运行 · ${summary.outcomeEn} · ${entry.run.options.evidencePolicy} · ${entry.run.events.length} 事件`
      );
      b.addEventListener('click', () => {
        historyIndex = i;
        attachRun(history[i].run, { restored: true, saved: history[i].savedAt });
        renderInfo();
        onLog?.('执行', `已切换到${i === 0 ? '本次' : '上一次'}运行（${history[i].run.runId}）：只切换查看对象，不重新运行引擎，另一条轨迹保持不变`, 'signal');
      });
      chips.append(b);
    });
    if (legacyRun) {
      const b = h('button', { class: 'ex-history', type: 'button', 'data-history-index': 'legacy', 'data-active': 'false' }, `M0.3 旧记录 · ${legacyRun.run.outcome} · ${legacyRun.run.events.length} 事件`);
      b.addEventListener('click', () => {
        attachRun(legacyRun.run, { restored: true, saved: legacyRun.savedAt });
        renderInfo();
        onLog?.('执行', '已切换到 M0.3 的历史运行：只有执行轨迹，没有结构化报告，也不会被新资料包补造结论', 'attention');
      });
      chips.append(b);
    }
    row.append(h('span', { class: 'ex-info__label' }, '运行历史'), chips, h('span', { class: 'ex-info__note' }, '最多保留两次运行；更早记录会被丢弃（可用 Markdown 导出留存）。切换历史不会重新运行引擎。'));
    return row;
  }

  function renderInfo() {
    info.replaceChildren();
    const live = configSnapshot();
    info.append(runOptionsRow());

    if (!run) {
      info.append(
        availabilityLine(live, '准备运行（装配台当前配置）'),
        h('div', { class: 'ex-info__note' }, '还没有运行记录：点击 RUN SIMULATION 会用上面这份装配台配置生成一条事件轨迹与一份结构化报告。条件不满足时也会产生一次可解释的阻断运行，而不是把按钮禁用。')
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
          ${run.evidenceBranchId ? `<span class="tag tag--${run.evidenceBranchId.startsWith('E01') ? 'success' : run.evidenceBranchId.startsWith('E00') ? 'muted' : 'attention'}">${esc(run.evidenceBranchId)}</span>` : ''}
          <span class="tag tag--muted">${esc(run.missionId)}@${run.missionVersion}</span>
          <span class="tag tag--${run.options.evidencePolicy === 'VERIFY_REVISIONS' ? 'signal' : 'muted'}">${esc(run.options.evidencePolicy)}</span>
          ${reportOf(run) ? `<span class="tag tag--${reportOf(run).status === 'complete' ? 'success' : reportOf(run).status === 'blocked' ? 'error' : 'attention'}">报告 ${esc(reportOf(run).status)}</span>` : '<span class="tag tag--attention">无结构化报告</span>'}
          ${source === 'restored' ? '<span class="tag tag--attention">从本地记录恢复</span>' : ''}
          <span class="tag tag--${changed ? 'attention' : 'muted'}">${changed ? '装配台已变更 · 本次轨迹未变' : '快照一致'}</span>
        </span>`)
    );
    const hist = historyRow();
    if (hist) info.append(hist);
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
  function renderExecution(reason = 'render') {
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

  function renderReport() {
    const report = reportOf(run);
    const rendered = reportView.render({ run, report, metrics: reportMetrics(run) });
    if (!report) {
      onLog?.('报告', legacyNotice(run), 'attention');
    }
    return rendered;
  }

  function renderAll(reason = 'render') {
    if (runView === 'report') {
      renderReport();
      if (replay) timeline.render(run, replay.getState());
      else timeline.renderEmpty();
      return;
    }
    renderExecution(reason);
  }

  function setRunView(next, { silent = false } = {}) {
    const target = next === 'report' ? 'report' : 'execution';
    if (target === runView) {
      if (target === 'report' && run) renderReport();
      return;
    }
    runView = target;
    el.dataset.view = target;
    bExecution.setAttribute('aria-pressed', target === 'execution' ? 'true' : 'false');
    bReport.setAttribute('aria-pressed', target === 'report' ? 'true' : 'false');
    grid.hidden = target === 'report';
    reportView.el.hidden = target !== 'report';
    coreSeg.hidden = target === 'report';
    backToReportBtn.hidden = !(target === 'execution' && pendingClaimId);

    if (target === 'report') {
      // 进入报告时暂停回放：阅读不该被数据流打断
      replay?.pause();
      const rendered = renderReport();
      if (!silent) {
        onLog?.(
          '报告',
          rendered.hasReport
            ? `已打开研究报告：${rendered.status} · 每条发现都能回到本次 Run 的真实事件（点击 [S1] 引用）`
            : '当前 Run 没有结构化报告：旧版轨迹或运行在取得证据前结束',
          rendered.hasReport ? 'signal' : 'attention'
        );
      }
    } else if (!silent) {
      onLog?.('执行', '已返回执行视图：事件轨迹与回放指针保持不变', 'info');
    }
    if (target === 'execution' && run) renderExecution('视图切换');
    if (target === 'execution') timeline.setEnabled();
  }

  /** 报告 → 执行事件：同一个 eventId 驱动三处观察区 */
  function viewEventFromReport(eventId, claimId = null) {
    if (!run) return;
    const index = indexOfEvent(run, eventId);
    if (index < 0) {
      onLog?.('报告', `引用指向的事件 ${eventId} 在本 Run 中不可解析：已阻断跳转，不会定位到另一个事件`, 'error');
      return;
    }
    pendingClaimId = claimId || pendingClaimId;
    pendingReportScroll = reportView.currentScroll();
    setRunView('execution', { silent: true });
    replay.pause();
    replay.seekTo(index);
    renderExecution(`从报告引用跳转（${eventId}）`);
    backToReportBtn.hidden = false;
    onLog?.('报告', `已定位到事件 #${String(index).padStart(2, '0')}（${eventId}）· 三维/二维与 Inspector 使用同一个事件来源`, 'signal');
  }

  backToReportBtn.addEventListener('click', () => {
    setRunView('report', { silent: true });
    reportView.resume({ claimId: pendingClaimId, scrollTop: pendingReportScroll });
    onLog?.('报告', `已返回报告原段落${pendingClaimId ? `（${pendingClaimId}）` : ''}，阅读位置与筛选状态保留`, 'signal');
    pendingClaimId = null;
    backToReportBtn.hidden = true;
  });

  bExecution.addEventListener('click', () => setRunView('execution'));
  bReport.addEventListener('click', () => setRunView('report'));

  function attachRun(nextRun, { restored = false, saved = null } = {}) {
    replay?.dispose();
    run = nextRun;
    source = restored ? 'restored' : 'new';
    savedAt = saved;
    pendingClaimId = null;
    pendingReportScroll = 0;
    backToReportBtn.hidden = true;
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
    const nextRun = runSimulation(snapshot, MISSION_001, { faultMode: runOptions.faultMode, evidencePolicy: runOptions.evidencePolicy });
    const written = appendResearchRun(storage, nextRun);
    history = written.runs;
    historyIndex = 0;
    if (!written.ok) onLog?.('执行', written.notice?.message || '本地运行记录写入失败', 'attention');
    else if (written.notice) onLog?.('执行', written.notice.message, 'attention');
    if (written.evicted > 0) onLog?.('执行', `本地运行历史已按容量策略丢弃 ${written.evicted} 条更早记录（不影响装配配置与学习进度）`, 'info');

    attachRun(nextRun, { restored: false, saved: new Date().toISOString() });
    const summary = summarizeRun(nextRun);
    onLog?.(
      '执行',
      `${reason}：使用装配台当前配置快照运行本地模拟 → ${summary.outcomeEn} · ${summary.branchId}/${nextRun.evidenceBranchId || '—'} · ${nextRun.events.length} 个事件 · 策略 ${nextRun.options.evidencePolicy} · faultMode ${nextRun.options.faultMode}（配置快照已冻结，之后的修改不会影响这条轨迹）`,
      summary.tone === 'error' ? 'error' : summary.tone === 'success' ? 'success' : 'attention'
    );
    if (reportOf(nextRun)) {
      onLog?.('报告', `报告已生成：${reportOf(nextRun).status} · ${reportOf(nextRun).claims.length} 条结构化陈述 · ${reportOf(nextRun).citations.length} 条引用（可点击 [S1] 反查来源与事件）`, reportOf(nextRun).status === 'complete' ? 'success' : 'attention');
    }
    return nextRun;
  }

  function togglePlay() {
    if (!replay) {
      onLog?.('执行', '还没有事件轨迹：请先点击 RUN SIMULATION', 'attention');
      return;
    }
    if (runView === 'report') {
      onLog?.('执行', '报告视图下回放处于暂停状态：切回 VIEW: EXECUTION 再播放（阅读不会被数据流打断）', 'info');
      return;
    }
    const state = replay.getState();
    if (state.atEnd && !state.playing) {
      replay.restart();
      replay.play();
    } else {
      replay.toggle();
    }
    renderExecution('播放/暂停');
  }

  function step(delta) {
    if (!replay || runView === 'report') return;
    if (delta > 0) replay.next();
    else replay.prev();
    renderExecution(delta > 0 ? '单步前进' : '单步后退');
  }

  function seek(sequence, from) {
    if (!replay) return;
    replay.pause();
    replay.seekTo(sequence);
    if (runView === 'report') setRunView('execution', { silent: true });
    renderExecution(`Seek（${from === 'graph' ? '执行图' : from === 'strip' ? '事件条' : '外部'}）`);
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
    renderExecution('Restart Replay（指针归零，未重新运行引擎）');
  }

  return {
    el,
    /** 打开工作区：恢复最近一次运行记录（如有），并把真实画布停靠到中心列 */
    activate({ view = null } = {}) {
      active = true;
      if (!replay) {
        const restored = readResearchHistory(storage);
        if (restored.notice) onLog?.('执行', `${restored.notice.message}${restored.notice.fix ? ` · ${restored.notice.fix}` : ''}`, restored.notice.level || 'attention');
        history = restored.runs;
        historyIndex = 0;
        legacyRun = restored.legacy || null;
        if (history.length > 0) {
          attachRun(history[0].run, { restored: true, saved: history[0].savedAt });
          onLog?.('执行', `已从本地记录恢复最近一次运行（${history[0].run.events.length} 个事件 · ${history[0].run.outcome}）：恢复的是快照，不会重新运行引擎`, 'signal');
        } else if (legacyRun) {
          attachRun(legacyRun.run, { restored: true, saved: legacyRun.savedAt });
          onLog?.('执行', '已恢复 M0.3 的历史运行：只有执行轨迹，没有结构化报告（不会被新资料包补造结论）', 'attention');
        } else {
          renderAll('空状态');
        }
      }
      core.setView(core.getView(), { has3D });
      if (core.getView() === '3d' && has3D) onMountCanvas?.();
      if (view === 'report') setRunView('report', { silent: true });
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
    /* ---------------- 供自检脚本使用的语义化入口（与界面按钮同一套动作） ---------------- */
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
    /** 本次研究策略：自检脚本用它验证 VERIFY / COLLECT_ONLY 分支 */
    setEvidencePolicy(policy) {
      runOptions.evidencePolicy = EVIDENCE_POLICIES.includes(policy) ? policy : DEFAULT_EVIDENCE_POLICY;
      renderInfo();
      return runOptions.evidencePolicy;
    },
    currentRunOptions: () => ({ ...runOptions }),
    /* ---------------- M0.4 报告视图入口 ---------------- */
    setRunView: (mode) => setRunView(mode),
    currentRunView: () => runView,
    openReport: () => {
      setRunView('report');
      return reportOf(run);
    },
    reportApi: () => reportView,
    report: () => reportOf(run),
    reportMetrics: () => reportMetrics(run),
    /** 报告引用 → 执行事件（自检脚本可直接跳到某个 citation 的来源事件） */
    viewCitationEvent: (citationId) => {
      const report = reportOf(run);
      const citation = (report?.citations || []).find((c) => c.id === citationId);
      if (!citation) return false;
      reportView.openCitation(citationId, null);
      viewEventFromReport(citation.eventId, null);
      return true;
    },
    /** 执行事件 → 报告 claim（反向定位：Replay → Report，A61） */
    claimsForCurrentEvent: () => {
      const report = reportOf(run);
      const event = replay ? replay.getState().event : null;
      return claimsForEvent(report, event?.id);
    },
    history: () => history.map((e, i) => ({ index: i, runId: e.run.runId, savedAt: e.savedAt, outcome: e.run.outcome, policy: e.run.options.evidencePolicy, events: e.run.events.length })),
    selectHistory: (index) => {
      if (!Number.isInteger(index) || index < 0 || index >= history.length) return false;
      historyIndex = index;
      attachRun(history[index].run, { restored: true, saved: history[index].savedAt });
      renderInfo();
      return true;
    },
    storageKey: RESEARCH_STORAGE_KEY,
    dispose() {
      active = false;
      stopTicker();
      replay?.dispose();
      onReleaseCanvas?.();
    },
  };
}

export { SPEEDS };



