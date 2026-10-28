/**
 * src/features/execution/components/executionCore.js
 * ------------------------------------------------------------------
 * 中央「AZ-CORE 01 · 执行联动」视图：
 *   · 3D 可用时，这里停靠真实的三维画布（由 app 层移动 canvasHost），
 *     事件高亮通过 scene.bay.setExecutionFocus 驱动；
 *   · 无 WebGL 时，用同一份事件数据绘制二维执行核心（SVG）：
 *     模型核心 → 两个工具轨道，当前事件的数据包沿对应链路移动，
 *     阻断/错误在局部呈现断点。
 *
 * 两种模式表达同一份事件，且都不会因为动画而改变任何业务状态。
 * ------------------------------------------------------------------
 */
import { h, esc } from '../../constructor/components/dom.js';
import { PHASE_META, STATUS_META, EVENT_TYPE_META } from '../../../simulation/events/schema.js';
import { RUNTIME_STATUS } from '../../../simulation/engine/runtimeScenarios.js';

const VIEW_W = 420;
const VIEW_H = 300;
const CORE = { x: 210, y: 150, r: 40 };
const TOOLS = {
  announcement_search: { x: 74, y: 76, label: 'Search', cn: '公告检索' },
  document_reader: { x: 346, y: 224, label: 'Reader', cn: '文档读取' },
};

const RUN_TONE = Object.freeze({
  idle: 'attention',
  ready: 'muted',
  running: 'signal',
  paused: 'attention',
  waiting_approval: 'attention',
  completed: 'success',
  failed: 'error',
  cancelled: 'muted',
});

/**
 * Normalize both the M0 research-event shape (`id`/`message`) and Runtime v2
 * shape (`eventId`/`reason`) before either the 2D core or the parked 3D core
 * presents it. A run without a selected event is still meaningful (notably
 * when A/B first opens an already-completed pair), so it exposes the real run
 * state instead of claiming that execution has not started.
 */
export function normalizeCorePresentation(run, event) {
  if (event) {
    const status = event.status || 'info';
    return {
      id: event.eventId || event.id || null,
      sequence: Number.isFinite(event.sequence) ? event.sequence : null,
      phase: event.phase || null,
      type: event.type || 'runtime.control',
      typeLabel: EVENT_TYPE_META[event.type]?.cn || event.type || '运行事件',
      status,
      statusLabel: STATUS_META[status]?.cn || status,
      tone: STATUS_META[status]?.tone || RUN_TONE[status] || 'muted',
      toolId: event.toolId || null,
      message: event.message || event.reason || '本次事件没有附加说明。',
    };
  }

  if (run) {
    const status = run.status || 'ready';
    const reason = run.result?.terminationReason || run.pendingApproval?.reason || '';
    return {
      id: run.runId || null,
      sequence: null,
      phase: null,
      type: 'runtime.status',
      typeLabel: '运行状态',
      status,
      statusLabel: RUNTIME_STATUS[status] || status,
      tone: RUN_TONE[status] || 'muted',
      toolId: run.pendingApproval?.toolId || null,
      message: reason ? `当前运行：${RUNTIME_STATUS[status] || status} · ${reason}` : `当前运行：${RUNTIME_STATUS[status] || status}`,
    };
  }

  return {
    id: null,
    sequence: null,
    phase: null,
    type: null,
    typeLabel: '等待运行',
    status: 'ready',
    statusLabel: '未开始',
    tone: 'muted',
    toolId: null,
    message: '尚未开始模拟运行：点击 RUN SIMULATION 或 New Run。',
  };
}

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    el.setAttribute(k, String(v));
  }
  return el;
}

export function createExecutionCore({ onLog } = {}) {
  const el = h('section', { class: 'ex-core surface', 'aria-label': '中央核心执行联动视图' });
  const head = h('div', { class: 'panel-head' }, `
    <span class="panel-head__title">AZ-CORE 01 · 执行联动</span>
    <span class="tag tag--muted" data-el="mode">—</span>`);
  const stage = h('div', { class: 'ex-core__stage' }); // 3D 模式时承载真实画布
  const svg2d = svgEl('svg', {
    class: 'ex-core__svg',
    viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
    role: 'img',
    'aria-label': '二维执行核心：模型核心与两个工具模块的本次事件链路',
  });

  /* ---------------- 二维执行核心 ---------------- */
  const edges = svgEl('g', { class: 'exc-edges' });
  const nodes = svgEl('g', { class: 'exc-nodes' });
  const packet = svgEl('g', { class: 'exc-packet', 'data-active': 'false' });
  packet.append(svgEl('circle', { r: 7, class: 'exc-packet__dot' }), svgEl('circle', { r: 13, class: 'exc-packet__halo' }));
  const labels = svgEl('g', { class: 'exc-labels' });
  svg2d.append(edges, labels, nodes, packet);

  for (const [toolId, t] of Object.entries(TOOLS)) {
    edges.append(svgEl('line', { x1: CORE.x, y1: CORE.y, x2: t.x, y2: t.y, class: 'exc-edge', 'data-tool': toolId }));
    const g = svgEl('g', { class: 'exc-node', 'data-tool': toolId, transform: `translate(${t.x},${t.y})` });
    g.append(svgEl('circle', { r: 30, class: 'exc-node__halo' }));
    g.append(svgEl('circle', { r: 22, class: 'exc-node__disc' }));
    const name = svgEl('text', { class: 'exc-node__name', y: 4, 'text-anchor': 'middle' });
    name.textContent = t.label;
    const cn = svgEl('text', { class: 'exc-node__cn', y: 44, 'text-anchor': 'middle' });
    cn.textContent = t.cn;
    g.append(name, cn);
    nodes.append(g);
  }
  nodes.append(
    (() => {
      const g = svgEl('g', { class: 'exc-node exc-node--core', transform: `translate(${CORE.x},${CORE.y})` });
      g.append(svgEl('circle', { r: CORE.r + 10, class: 'exc-node__halo' }));
      g.append(svgEl('circle', { r: CORE.r, class: 'exc-node__disc' }));
      const a = svgEl('text', { class: 'exc-node__name', y: -2, 'text-anchor': 'middle' });
      a.textContent = 'Model Core';
      const b = svgEl('text', { class: 'exc-node__cn', y: 15, 'text-anchor': 'middle' });
      b.textContent = '模型核心';
      g.append(a, b);
      return g;
    })()
  );

  stage.append(svg2d);
  const caption = h('div', { class: 'ex-core__caption', 'data-el': 'caption' });
  const phaseBar = h('div', { class: 'ex-core__phase', 'data-el': 'phase' });
  el.append(head, stage, caption, phaseBar);

  let view = '3d';
  let has3D = false;

  /** 3D 模式下把真实画布挂到中心列；退出时由 app 层负责搬回 */
  function mountCanvas(canvasHost) {
    if (!canvasHost) return;
    stage.append(canvasHost);
  }

  /**
   * 二维执行核心：把「当前事件」映射成链路高亮、数据包位置与断点。
   * 只读事件数据，不推断任何未发生的事。
   */
  function render2D(event) {
    const presentation = normalizeCorePresentation(run, event);
    const { tone } = presentation;
    const toolId = presentation.toolId && TOOLS[presentation.toolId] ? presentation.toolId : null;
    svg2d.setAttribute('data-status', presentation.status);
    svg2d.setAttribute('data-tone', tone);

    for (const node of svg2d.querySelectorAll('.exc-node[data-tool]')) {
      const id = node.getAttribute('data-tool');
      node.setAttribute('data-active', id === toolId ? 'true' : 'false');
      node.setAttribute('data-state', toolId && id === toolId ? presentation.status : 'idle');
    }
    for (const edge of svg2d.querySelectorAll('.exc-edge')) {
      edge.setAttribute('data-active', edge.getAttribute('data-tool') === toolId ? 'true' : 'false');
      edge.setAttribute('data-state', toolId && edge.getAttribute('data-tool') === toolId ? presentation.status : 'idle');
    }

    if (toolId && event && (event.type === 'tool.call' || event.type === 'tool.result' || event.type === 'tool.error')) {
      const t = TOOLS[toolId];
      // 请求 → 停在工具侧；返回 → 回到核心侧，用位置本身表达方向
      const towardsTool = event.type === 'tool.call';
      const target = towardsTool ? { x: t.x, y: t.y } : { x: CORE.x, y: CORE.y };
      packet.setAttribute('data-active', 'true');
      packet.setAttribute('data-state', event.status);
      packet.setAttribute('style', `transform: translate(${target.x}px, ${target.y}px)`);
    } else {
      packet.setAttribute('data-active', 'false');
      packet.removeAttribute('style');
    }

    caption.replaceChildren(
      h('div', { class: 'ex-core__caption-line' }, `
        <span class="mono">${presentation.sequence === null ? '—' : `#${String(presentation.sequence).padStart(2, '0')}`}</span>
        <span class="ex-core__type">${esc(presentation.typeLabel)}</span>
        <span class="tag tag--${tone}">${esc(presentation.statusLabel)}</span>`),
      h('div', { class: 'ex-core__caption-msg' }, esc(presentation.message))
    );
    phaseBar.replaceChildren();
    for (const phase of ['VALIDATION', 'PLAN', 'SEARCH', 'READ', 'EVIDENCE', 'END']) {
      const on = event?.phase === phase;
      phaseBar.append(
        h('span', { class: 'exc-phase', 'data-active': on ? 'true' : 'false', 'data-done': isDone(phase) ? 'true' : 'false' },
          `${PHASE_META[phase].cn}`)
      );
    }
  }

  let run = null;
  function isDone(phase) {
    if (!run || !event0()) return false;
    const order = ['VALIDATION', 'PLAN', 'SEARCH', 'READ', 'EVIDENCE', 'END'];
    return order.indexOf(phase) < order.indexOf(event0().phase);
  }
  let currentEvent = null;
  const event0 = () => currentEvent;

  return {
    el,
    stage,
    setView(next, { has3D: three = false } = {}) {
      view = next === '2d' ? '2d' : '3d';
      has3D = three;
      el.dataset.view = view;
      head.querySelector('[data-el="mode"]').textContent =
        view === '3d' ? (has3D ? '3D · 真实三维核心（只读聚焦）' : '3D 不可用 · 已用二维执行核心替代') : '2D · 执行核心投影';
      svg2d.style.display = view === '3d' && has3D ? 'none' : 'block';
      // The caption is the non-colour, textual equivalent of both renderers.
      // Keeping it visible in 2D also fixes WebGL/reduced-motion fallback semantics.
      caption.style.display = 'block';
      onLog?.('执行', `中央执行视图切换为 ${view.toUpperCase()}${view === '3d' && !has3D ? '（当前环境无 WebGL，使用二维等价视图）' : ''}`, 'info');
    },
    getView: () => view,
    mountCanvas,
    render(nextRun, event) {
      run = nextRun;
      currentEvent = event || null;
      render2D(currentEvent);
    },
    setEvent(event) {
      currentEvent = event || null;
      render2D(currentEvent);
    },
  };
}
