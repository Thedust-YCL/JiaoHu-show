/**
 * src/features/laboratory/runtime/runtimeLab.js
 * ------------------------------------------------------------------
 * LAB 05 · RUNTIME LAB 的界面层（M1.3 D05 / §6）。
 *
 * 两种控制方式对照 + 一个受控多角色演示，全部读自 ../runtime/engine.js：
 *   · 同一份资料、同一组工具与权限（A17）；
 *   · 播放 / 暂停 / 逐步前进 / 选中事件看详情 / 重置运行（§6.10）；
 *   · 播放只是**逐条揭示已经算好的事件**，暂停或减少动态效果不改逻辑；
 *   · Harness 用「职责叠加层」呈现，不画成另一个模型（A19）。
 * ------------------------------------------------------------------
 */
import { h, esc, md } from '../../constructor/components/dom.js';
import { RUNTIME_TASK, queryById } from './task.js';
import {
  AGENT_ROLES,
  HARNESS_ROLES,
  MODE_LABELS,
  RETRY_LIMIT_OPTIONS,
  STEP_LIMIT_OPTIONS,
  STATUS_LABELS,
  WORKFLOW_STEPS,
  harnessViewOf,
  simulateAgentLoop,
  simulateMultiAgent,
  simulateWorkflow,
} from './engine.js';

const CONCEPT_LINKS = Object.freeze(['agent', 'agent_loop', 'workflow', 'harness', 'orchestration', 'multi_agent']);
const PLAY_INTERVAL = 700;
const CONCLUSION_TONE = Object.freeze({ supported: 'success', unresolved: 'attention', insufficient: 'muted', unverified: 'attention' });

export function createRuntimeLab({
  learning,
  entryConceptId = 'agent_loop',
  onBackToHub,
  onOpenLab,
  onOpenConcept,
  onLog,
  reducedMotion = false,
} = {}) {
  const el = h('div', { class: 'workspace workspace--lab-lab', 'data-open': 'true', 'data-lab': 'runtime' });

  const state = {
    mode: 'agent-loop',
    queryId: 'career-fair',
    maxSteps: 6,
    maxRetries: 2,
    failRole: null,
  };
  let run = simulateRun();
  /* 初始就展示完整轨迹（与 restart 一致），播放按钮负责从 0 重新揭示 */
  let cursor = run.events.length;
  let playing = false;
  let timer = null;
  let touched = false;
  let completed = false;
  let multi = null;

  function simulateRun() {
    return state.mode === 'workflow'
      ? simulateWorkflow({ queryId: state.queryId })
      : simulateAgentLoop({ queryId: state.queryId, maxSteps: state.maxSteps, maxRetries: state.maxRetries });
  }

  /* ----------------------------- 头部 ----------------------------- */
  const head = h('header', { class: 'ws-head' });
  const headMeta = h('div', { class: 'ws-head__meta', 'data-el': 'context' });
  head.append(
    h('div', { class: 'ws-head__id' }, `
      <span class="ws-head__tag">A/0</span>
      <span class="ws-head__title">LAB 05 · RUNTIME LAB</span>
      <span class="ws-head__meta" data-el="subtitle">Workflow 与 Agent Loop · Harness · 编排 · 多角色</span>`),
    h('div', { class: 'ws-head__actions' }, '<span class="tag tag--attention">SIMULATION · 确定性状态机</span>')
  );
  const actions = head.querySelector('.ws-head__actions');
  const backLab = h('button', { class: 'btn btn--primary', type: 'button', 'data-act': 'back-lab' }, '← 返回实验空间');
  backLab.addEventListener('click', () => {
    stopPlay();
    onOpenLab?.();
  });
  const hub = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'hub' }, 'Back to Hub');
  hub.addEventListener('click', () => {
    stopPlay();
    onBackToHub?.('hub');
  });
  const reset = h('button', { class: 'btn btn--ghost', type: 'button', 'data-act': 'reset' }, 'RESET · 重置运行');
  reset.addEventListener('click', () => resetRun('手动重置'));
  actions.append(backLab, hub, reset);

  /* ----------------------------- 三栏 ----------------------------- */
  const params = h('aside', { class: 'lab-params surface', 'aria-label': '运行参数' });
  const paramsBody = h('div', { class: 'lab-params__scroll' });
  params.append(h('div', { class: 'panel-head' }, '<span class="panel-head__title">运行参数</span>'), paramsBody);

  const main = h('section', { class: 'lab-canvas', 'aria-live': 'polite', 'aria-label': '事件时间线、指标与多角色' });
  const aside = h('aside', { class: 'lab-inspector surface', 'aria-label': '事件详情与 Harness 职责' });
  const asideBody = h('div', { class: 'lab-inspector__scroll' });
  aside.append(h('div', { class: 'panel-head' }, '<span class="panel-head__title">事件详情 / Harness</span>'), asideBody);

  el.append(head, h('div', { class: 'lab-body' }, params, main, aside));

  /* ================================================================== *
   * 参数区
   * ================================================================== */
  function segmented(label, options, activeId, onSelect, hint = '') {
    const group = h('div', { class: 'section' });
    group.append(h('div', { class: 'section__label' }, `<span>${esc(label)}</span><span>${esc(hint)}</span>`));
    const row = h('div', { class: 'tk-seg tk-seg--wrap', role: 'group', 'aria-label': label });
    for (const option of options) {
      const b = h('button', {
        type: 'button',
        'data-option': option.id,
        'data-group': label,
        'aria-pressed': String(activeId === option.id),
        title: option.note || '',
      }, esc(option.cn));
      b.addEventListener('click', () => {
        if (activeId === option.id) return;
        onSelect(option);
      });
      row.append(b);
    }
    group.append(row);
    const active = options.find((o) => o.id === activeId);
    if (active?.note) group.append(h('div', { class: 'tk-field__hint' }, esc(active.note)));
    return group;
  }

  function renderParams() {
    paramsBody.replaceChildren();

    paramsBody.append(
      segmented(
        '控制方式',
        [MODE_LABELS.workflow, MODE_LABELS['agent-loop']],
        state.mode,
        (option) => {
          state.mode = option.id;
          restart(`${MODE_LABELS[option.id].cn}`);
        },
        '两种方式共用资料与权限'
      )
    );
    paramsBody.append(
      segmented(
        '任务查询',
        RUNTIME_TASK.queries.map((q) => ({ id: q.id, cn: q.cn, note: q.expect })),
        state.queryId,
        (option) => {
          state.queryId = option.id;
          state.failRole = null;
          multi = null;
          restart(`查询改为「${option.cn}」`);
        }
      )
    );
    paramsBody.append(
      segmented(
        '步数上限',
        STEP_LIMIT_OPTIONS.map((n) => ({ id: String(n), cn: `${n} 步`, note: '' })),
        String(state.maxSteps),
        (option) => {
          state.maxSteps = Number(option.id);
          restart(`步数上限改为 ${option.cn}`);
        },
        state.mode === 'workflow' ? '固定流程不受此项影响' : '超过即终止'
      )
    );
    paramsBody.append(
      segmented(
        '重试上限',
        RETRY_LIMIT_OPTIONS.map((n) => ({ id: String(n), cn: `${n} 次`, note: '' })),
        String(state.maxRetries),
        (option) => {
          state.maxRetries = Number(option.id);
          restart(`重试上限改为 ${option.cn}`);
        }
      )
    );

    /* 播放控制 */
    const ctl = h('div', { class: 'section', 'data-act': 'playback' });
    ctl.append(h('div', { class: 'section__label' }, `<span>播放控制</span><span>${cursor}/${run.events.length}</span>`));
    const row = h('div', { class: 'chips' });
    const playBtn = h('button', { class: 'btn btn--sm btn--primary', type: 'button', 'data-act': 'play' }, playing ? 'PAUSE · 暂停' : 'PLAY · 播放');
    playBtn.addEventListener('click', () => (playing ? pause() : play()));
    const stepBtn = h('button', { class: 'btn btn--sm', type: 'button', 'data-act': 'step' }, 'STEP · 前进一步');
    stepBtn.addEventListener('click', () => stepForward());
    const allBtn = h('button', { class: 'btn btn--sm', type: 'button', 'data-act': 'show-all' }, '全部展开');
    allBtn.addEventListener('click', () => {
      stopPlay();
      cursor = run.events.length;
      render();
    });
    row.append(playBtn, stepBtn, allBtn);
    ctl.append(row, h('div', { class: 'tk-field__hint' }, '播放只是逐条揭示已经算好的事件：暂停、跳步或减少动态效果都不会改变结论。'));
    paramsBody.append(ctl);

    /* 多角色演示 */
    const ma = h('div', { class: 'section', 'data-act': 'multi-agent-config' });
    ma.append(h('div', { class: 'section__label' }, '<span>多角色演示</span><span>顺序交接</span>'));
    const runMa = h('button', { class: 'btn btn--sm', type: 'button', 'data-act': 'run-multi' }, multi ? '重新运行三角色流程' : '运行三角色流程');
    runMa.addEventListener('click', () => {
      multi = simulateMultiAgent({ queryId: state.queryId, failRole: state.failRole });
      markTouched('运行了 Multi-Agent 三角色演示');
      render();
    });
    const failBtn = h('button', {
      class: 'btn btn--sm',
      type: 'button',
      'data-act': 'toggle-fail-role',
      'aria-pressed': String(state.failRole === 'verifier'),
    }, state.failRole === 'verifier' ? '恢复正常核验' : '模拟 Verifier 失败');
    failBtn.addEventListener('click', () => {
      state.failRole = state.failRole === 'verifier' ? null : 'verifier';
      if (multi) multi = simulateMultiAgent({ queryId: state.queryId, failRole: state.failRole });
      onLog?.('实验', `Lab 05 Verifier 失败模拟：${state.failRole === 'verifier' ? '开启' : '关闭'}`, 'info');
      render();
    });
    ma.append(h('div', { class: 'chips' }, runMa, failBtn));
    ma.append(h('div', { class: 'tk-field__hint' }, '三个角色按顺序执行，不并排播放动画假装并发；角色失败会改变结论。'));
    paramsBody.append(ma);

    paramsBody.append(
      h('div', { class: 'note note--info', style: 'margin-top:10px' }, `
        <span class="note__key">共用条件</span>
        <span>资料：本语料 9 份虚构公告；工具：${RUNTIME_TASK.tools.map((t) => esc(t.id)).join(' / ')}；权限：${esc(RUNTIME_TASK.permissions.note)}</span>`)
    );
  }

  /* ================================================================== *
   * 主区
   * ================================================================== */
  function renderMain() {
    main.replaceChildren();
    main.append(
      h('div', { class: 'lab-hero' }, `
        <div class="lab-hero__idx">LAB 05 / 第 05 章 执行系统</div>
        <h2 class="lab-hero__title">同一个任务，谁来定下一步：写死的流程，还是运行期的判断</h2>
        <p class="lab-hero__lead">两种控制方式共用同一份资料、同一组工具与同一套权限。切换只改变「怎么决定下一步」，不改变「能拿到什么」——所以谁都不会被偷偷放水。</p>`)
    );
    main.append(renderTimeline());
    main.append(renderMetrics());
    main.append(renderHarnessPanel());
    main.append(renderMultiAgentPanel());
  }

  function renderTimeline() {
    const wrap = h('div', { class: 'section', 'data-act': 'timeline' });
    wrap.append(
      h('div', { class: 'section__label' }, `<span>事件时间线 · ${esc(MODE_LABELS[run.mode].cn)}</span><span>已显示 ${cursor}/${run.events.length} 条</span>`)
    );
    wrap.append(
      h('div', { class: 'note note--isolation' }, `
        <span class="note__key">SIMULATION</span>
        <span>事件由本地确定性规则生成，按顺序揭示；不是真实模型遥测，也不是并发执行。终止原因、重试次数与来源覆盖都来自下面这些事件。</span>`)
    );

    if (run.mode === 'workflow') {
      const plan = h('div', { class: 'rtl-plan' });
      plan.append(h('div', { class: 'rtl-plan__head' }, `预定义流程（${WORKFLOW_STEPS.length} 步，顺序固定）`));
      WORKFLOW_STEPS.forEach((step, index) => {
        const covered = run.events.filter((event) => event.stepType === step.stepType);
        plan.append(
          h('div', { class: 'rtl-plan__step', 'data-plan-step': step.id }, `
            <span class="mono">${String(index + 1).padStart(2, '0')}</span>
            <span>${esc(step.cn)}</span>
            <span class="knl-dim">${covered.length ? `${covered.length} 条事件` : '未执行'}</span>`)
        );
      });
      wrap.append(plan);
    }

    const list = h('ol', { class: 'rtl-events', 'data-act': 'event-list' });
    run.events.forEach((event, index) => {
      const visible = index < cursor;
      const selected = index === Math.min(cursor - 1, run.events.length - 1) || index === selectedIndex();
      const item = h('li', {
        class: `rtl-event${visible ? '' : ' rtl-event--hidden'}${selected ? ' rtl-event--current' : ''}`,
        'data-event': event.eventId,
        'data-seq': event.seq,
        'data-visible': visible ? 'true' : 'false',
        'data-step-type': event.stepType,
        'data-status': event.status,
      });
      const btn = h('button', { class: 'rtl-event__btn', type: 'button', 'aria-pressed': String(index === selectedIndex()) }, `
        <span class="rtl-event__seq mono">${String(event.seq).padStart(2, '0')}</span>
        <span class="rtl-event__type">${esc(event.stepTypeCn)}</span>
        <span class="tag tag--${event.tone}">${esc(event.statusCn)}</span>
        <span class="rtl-event__title">${visible ? esc(event.title) : '（尚未播放）'}</span>
        <span class="rtl-event__branch mono">${visible ? esc(event.branchReason) : ''}</span>`);
      btn.addEventListener('click', () => {
        selectEvent(index);
      });
      item.append(btn);
      list.append(item);
    });
    wrap.append(list);

    const conclusion = h('div', { class: 'knl-answer', 'data-act': 'conclusion', 'data-status': run.conclusion.status });
    const shown = cursor >= run.events.length;
    conclusion.append(
      h('div', { class: 'knl-answer__head' }, `
        <span class="tag tag--${CONCLUSION_TONE[run.conclusion.status] || 'muted'}">${esc(run.conclusion.statusCn)}</span>
        <span class="knl-answer__label">模拟结论（${shown ? '已完整播放' : '仍在播放中'}）</span>`),
      h('p', { class: 'knl-answer__line' }, md(shown ? run.conclusion.summary : '播放或逐步前进到末尾后显示结论；结论本身在运行开始时就已确定，不依赖动画。')),
      h('div', { class: 'tk-field__hint' }, `终止原因：${esc(run.metrics.terminator)} · 来源覆盖 ${esc(run.metrics.sourceCoverage)}`)
    );
    wrap.append(conclusion);
    return wrap;
  }

  function renderMetrics() {
    const wrap = h('div', { class: 'section', 'data-act': 'metrics' });
    const m = run.metrics;
    wrap.append(h('div', { class: 'section__label' }, '<span>运行指标</span><span>全部来自事件</span>'));
    wrap.append(
      h('div', { class: 'tk-metrics' }, `
        <div class="tk-metric"><span class="tk-metric__k">步骤数</span><b class="tk-metric__v">${m.steps}</b></div>
        <div class="tk-metric"><span class="tk-metric__k">工具调用</span><b class="tk-metric__v">${m.toolCalls}</b></div>
        <div class="tk-metric"><span class="tk-metric__k">重试</span><b class="tk-metric__v">${m.retries}/${m.maxRetries}</b></div>
        <div class="tk-metric"><span class="tk-metric__k">未解决问题</span><b class="tk-metric__v">${m.unresolved}</b></div>
        <div class="tk-metric"><span class="tk-metric__k">来源覆盖</span><b class="tk-metric__v">${esc(m.sourceCoverage)}</b></div>
        <div class="tk-metric"><span class="tk-metric__k">被拒绝</span><b class="tk-metric__v">${m.denied}</b></div>`)
    );
    if (run.conclusion.unresolved.length) {
      const ul = h('ul', { class: 'lab-reading' });
      for (const item of run.conclusion.unresolved) ul.append(h('li', {}, esc(item)));
      wrap.append(h('div', { class: 'tk-field__hint' }, '未解决问题：'), ul);
    }
    wrap.append(
      h('div', { class: 'tk-field__hint' }, `上限：步数 ${m.maxSteps} · 重试 ${m.maxRetries}；终止：${esc(m.terminator)}。没有随机成分，同一配置永远得到同一串事件。`)
    );
    return wrap;
  }

  function renderHarnessPanel() {
    const wrap = h('div', { class: 'section', 'data-act': 'harness' });
    wrap.append(h('div', { class: 'section__label' }, '<span>Harness 职责叠加层</span><span>运行环境，不是另一个模型</span>'));
    wrap.append(
      h('div', { class: 'note note--info' }, `
        <span class="note__key">Harness</span>
        <span>下面五项是同一层工程代码的职责：组装上下文、分派工具、控制循环、检查权限、记录事件。它不产生语言判断，也不是第二个模型。</span>`)
    );
    const current = run.events[Math.max(0, Math.min(cursor - 1, run.events.length - 1))];
    const roles = harnessViewOf(cursor > 0 ? current : null);
    const grid = h('div', { class: 'rtl-harness' });
    for (const role of roles) {
      grid.append(
        h('div', { class: 'rtl-harness__row', 'data-harness': role.id, 'data-active': role.active ? 'true' : 'false' }, `
          <span class="rtl-harness__name">${esc(role.cn)}</span>
          <span class="tag tag--${role.active ? 'signal' : 'muted'}">${role.active ? '本次触发' : '本次未触发'}</span>
          <span class="knl-dim">${esc(role.detail || role.desc)}</span>`)
      );
    }
    wrap.append(grid);
    return wrap;
  }

  function renderMultiAgentPanel() {
    const wrap = h('div', { class: 'section', 'data-act': 'multi-agent' });
    wrap.append(h('div', { class: 'section__label' }, '<span>Multi-Agent · 受控角色演示</span><span>顺序交接，不假装并发</span>'));

    const roles = h('div', { class: 'rtl-roles' });
    for (const role of AGENT_ROLES) {
      roles.append(
        h('div', { class: 'rtl-role', 'data-role': role.id }, `
          <div class="rtl-role__head">${esc(role.cn)}</div>
          <div class="knl-dim">职责：${esc(role.duty)}</div>
          <div class="knl-dim">输出：${esc(role.outputs)}</div>`)
      );
    }
    wrap.append(roles);

    if (!multi) {
      wrap.append(
        h('div', { class: 'note', 'data-act': 'multi-idle' }, `
          <span class="note__key">未运行</span>
          <span>点击左侧「运行三角色流程」查看 Researcher → Verifier → Reporter 的交接事件；可开启「模拟 Verifier 失败」观察降级路径。</span>`)
      );
      return wrap;
    }

    wrap.append(
      h('div', { class: 'tk-metrics' }, `
        <div class="tk-metric"><span class="tk-metric__k">角色</span><b class="tk-metric__v">3</b></div>
        <div class="tk-metric"><span class="tk-metric__k">交接</span><b class="tk-metric__v">${multi.extra.handoffs}</b></div>
        <div class="tk-metric"><span class="tk-metric__k">事件</span><b class="tk-metric__v">${multi.events.length}</b></div>
        <div class="tk-metric"><span class="tk-metric__k">结论</span><b class="tk-metric__v">${esc(multi.conclusion.statusCn)}</b></div>`)
    );
    const list = h('ol', { class: 'rtl-events rtl-events--compact', 'data-act': 'multi-events' });
    for (const event of multi.events) {
      list.append(
        h('li', { class: 'rtl-event', 'data-multi-event': event.eventId, 'data-step-type': event.stepType, 'data-status': event.status }, `
          <div class="rtl-event__btn">
            <span class="rtl-event__seq mono">${String(event.seq).padStart(2, '0')}</span>
            <span class="rtl-event__type">${esc(event.stepTypeCn)}${event.role ? ` · ${esc(event.role)}` : ''}</span>
            <span class="tag tag--${event.tone}">${esc(event.statusCn)}</span>
            <span class="rtl-event__title">${esc(event.title)}</span>
          </div>
          <div class="knl-dim rtl-event__io">输入：${esc(event.input)}<br />输出：${esc(event.output)}<br />分支原因：<span class="mono">${esc(event.branchReason)}</span>${event.sourceIds.length ? ` · 来源 ${esc(event.sourceIds.join('、'))}` : ''}</div>`)
      );
    }
    wrap.append(list);
    return wrap;
  }

  /* ================================================================== *
   * Inspector
   * ================================================================== */
  function renderAside() {
    asideBody.replaceChildren();
    const current = cursor > 0 ? run.events[Math.min(cursor - 1, run.events.length - 1)] : null;

    const detail = h('div', { class: 'section', 'data-act': 'event-detail' });
    detail.append(h('div', { class: 'section__label' }, '<span>选中事件</span><span>输入 / 输出 / 来源</span>'));
    if (!current) {
      detail.append(h('div', { class: 'note' }, '<span class="note__key">尚未开始</span><span>点击「播放」或「前进一步」以查看事件详情。</span>'));
    } else {
      detail.append(
        h('div', { class: 'kv' }, `
          <dt>事件</dt><dd><span class="mono">${esc(current.eventId)}</span> · ${esc(current.stepTypeCn)} · 第 ${current.seq} 条</dd>
          <dt>运行</dt><dd class="mono">${esc(current.runId)}</dd>
          <dt>状态</dt><dd>${esc(current.statusCn)}（${esc(current.status)}）</dd>
          <dt>标题</dt><dd>${esc(current.title)}</dd>
          ${current.role ? `<dt>角色</dt><dd>${esc(current.role)}</dd>` : ''}
          ${current.toolId ? `<dt>工具</dt><dd class="mono">${esc(current.toolId)}</dd>` : ''}
          <dt>输入摘要</dt><dd>${esc(current.input)}</dd>
          <dt>输出摘要</dt><dd>${esc(current.output)}</dd>
          <dt>来源 ID</dt><dd class="mono">${current.sourceIds.length ? esc(current.sourceIds.join('、')) : '—'}</dd>
          <dt>分支原因</dt><dd class="mono">${esc(current.branchReason || '—')}</dd>`)
      );
    }
    asideBody.append(detail);

    const harness = h('div', { class: 'section', 'data-act': 'harness-detail' });
    harness.append(h('div', { class: 'section__label' }, '<span>这一条触发了哪些 Harness 职责</span><span>逐项显示</span>'));
    for (const role of HARNESS_ROLES) {
      const active = current ? current.harness.includes(role.id) : false;
      harness.append(
        h('div', { class: 'rtl-check', 'data-harness-role': role.id, 'data-active': active ? 'true' : 'false' }, `
          <span>${esc(role.cn)}</span><span class="tag tag--${active ? 'signal' : 'muted'}">${active ? '触发' : '未触发'}</span>`)
      );
    }
    harness.append(h('div', { class: 'tk-field__hint' }, 'Harness 只做这些工程动作；判断下一步的是模型（本实验用规则代替），两者不是同一层。'));
    asideBody.append(harness);

    /* 完成状态 */
    const done = learning?.isExperimentCompleted?.(entryConceptId) || completed;
    const check = h('div', { class: 'section', 'data-act': 'completion' });
    check.append(h('div', { class: 'section__label' }, '<span>实验记录</span><span>只记录真实操作</span>'));
    check.append(
      h('div', { class: 'note' }, `
        <span class="note__key">${done ? '已记录' : '未记录'}</span>
        <span>${done ? '你已切换控制方式或运行多角色流程并看到结果，本地学习进度记了一次完成。' : '切换控制方式 / 查询 / 上限，或运行多角色流程，才会被记录；只浏览不记录。'}</span>`)
    );
    asideBody.append(check);

    /* 相关概念 */
    const concept = h('div', { class: 'section' });
    concept.append(h('div', { class: 'section__label' }, '<span>相关概念</span><span>回到知识页</span>'));
    const chips = h('div', { class: 'chips' });
    for (const id of CONCEPT_LINKS) {
      const b = h('button', { class: 'btn btn--sm', type: 'button', 'data-concept': id }, id);
      b.addEventListener('click', () => onOpenConcept?.(id, { from: 'lab', experimentId: 'exp-agent-loop-lab' }));
      chips.append(b);
    }
    concept.append(chips);
    asideBody.append(concept);

    asideBody.append(
      h('div', { class: 'section' }, `
        <div class="section__label"><span>必守边界</span><span>不夸大</span></div>
        <div class="kv">
          <dt>不是真实推理</dt><dd>决策由本地规则产生，模型被「规则」代替，页面不会说这是 AI 自主运行</dd>
          <dt>不伪并发</dt><dd>多角色顺序执行，事件里带交接记录，不并排播放动画假装并行</dd>
          <dt>不暗改数据</dt><dd>两种模式共用同一份语料、工具与权限，结论差异只来自控制方式</dd>
          <dt>必然终止</dt><dd>步数上限、重试上限与无可用动作三种出口都写死，可逐步验证</dd>
        </div>`)
    );
  }

  /* ================================================================== *
   * 播放与状态
   * ================================================================== */
  function selectedIndex() {
    return Math.max(0, Math.min(cursor - 1, run.events.length - 1));
  }

  function selectEvent(index) {
    stopPlay();
    cursor = Math.max(1, Math.min(index + 1, run.events.length));
    render();
  }

  function stepForward() {
    stopPlay();
    if (cursor < run.events.length) cursor += 1;
    render();
  }

  function play() {
    if (cursor >= run.events.length) cursor = 0;
    playing = true;
    render();
    if (reducedMotion) {
      /* 减少动态效果：直接展开全部事件，不逐条动画，逻辑完全一致 */
      cursor = run.events.length;
      playing = false;
      render();
      return;
    }
    timer = setInterval(() => {
      if (cursor >= run.events.length) {
        stopPlay();
        render();
        return;
      }
      cursor += 1;
      render();
    }, PLAY_INTERVAL);
  }

  function pause() {
    stopPlay();
    render();
  }

  function stopPlay() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    playing = false;
  }

  function markTouched(reason) {
    touched = true;
    if (completed) return;
    completed = true;
    const ok = learning?.markExperimentCompleted?.(entryConceptId);
    onLog?.(
      '实验',
      `Lab 05 操作：${reason} → 结论 ${run.conclusion.statusCn} · 步骤 ${run.metrics.steps} · 工具调用 ${run.metrics.toolCalls}${ok ? ' · 已记录一次实验完成' : ''}`,
      'signal'
    );
  }

  function restart(reason) {
    stopPlay();
    run = simulateRun();
    /* 默认展开全部事件：页面一进来就能读到完整轨迹；「从头播放」会先回到 0 */
    cursor = run.events.length;
    markTouched(reason);
    render();
  }

  function resetRun(reason) {
    stopPlay();
    run = simulateRun();
    cursor = run.events.length;
    onLog?.('实验', `Lab 05 已重置运行：${reason}（不改变学习进度与参数）`, 'info');
    render();
  }

  function render() {
    renderParams();
    renderMain();
    renderAside();
    headMeta.textContent = `${MODE_LABELS[run.mode].cn} · ${queryById(state.queryId).cn} · 步数上限 ${state.maxSteps} · 已显示 ${cursor}/${run.events.length} 条事件`;
  }

  render();

  const unsubscribe = learning?.subscribe?.(() => renderAside());

  return {
    el,
    activate() {},
    dispose() {
      stopPlay();
      unsubscribe?.();
    },
    /* ---------------- 自检脚本接口 ---------------- */
    snapshot() {
      return {
        mode: run.mode,
        queryId: run.queryId,
        runId: run.runId,
        events: run.events.map((e) => ({
          eventId: e.eventId,
          stepType: e.stepType,
          status: e.status,
          branchReason: e.branchReason,
          toolId: e.toolId,
          role: e.role,
          sourceIds: [...e.sourceIds],
          harness: [...e.harness],
          input: e.input,
          output: e.output,
        })),
        metrics: { ...run.metrics },
        conclusion: { status: run.conclusion.status, summary: run.conclusion.summary, unresolved: [...run.conclusion.unresolved] },
        cursor,
        visibleEvents: run.events.filter((_, index) => index < cursor).length,
        playing,
        multi: multi
          ? {
              events: multi.events.map((e) => ({ eventId: e.eventId, stepType: e.stepType, role: e.role, status: e.status })),
              conclusion: multi.conclusion.status,
              handoffs: multi.extra.handoffs,
            }
          : null,
      };
    },
    configure(patch = {}) {
      const keys = Object.keys(patch).filter((k) => k in state);
      if (!keys.length) return;
      Object.assign(state, patch);
      if ('failRole' in patch && multi) multi = simulateMultiAgent({ queryId: state.queryId, failRole: state.failRole });
      restart(`外部配置：${keys.map((k) => `${k}=${patch[k]}`).join('、')}`);
    },
    setMode(mode) {
      if (!MODE_LABELS[mode] || mode === 'multi-agent') return;
      state.mode = mode;
      restart(`控制方式切换为 ${MODE_LABELS[mode].cn}`);
    },
    play,
    pause,
    step: stepForward,
    showAll() {
      stopPlay();
      cursor = run.events.length;
      render();
    },
    reset() {
      resetRun('接口调用');
    },
    selectEvent,
    currentEvent: () => run.events[Math.max(0, Math.min(cursor - 1, run.events.length - 1))] || null,
    metrics: () => ({ ...run.metrics }),
    events: () => run.events.map((e) => ({ ...e })),
    harnessOf: (index) => harnessViewOf(run.events[Math.max(0, Math.min(index, run.events.length - 1))]),
    runMultiAgent(failRole = null) {
      state.failRole = failRole;
      multi = simulateMultiAgent({ queryId: state.queryId, failRole });
      markTouched(`运行多角色流程（failRole=${failRole || 'none'}）`);
      render();
      return multi;
    },
    multiAgent: () => multi,
    isPlaying: () => playing,
  };
}
