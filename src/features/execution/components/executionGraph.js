/**
 * src/features/execution/components/executionGraph.js
 * ------------------------------------------------------------------
 * Execution Graph：**只显示本次 SimulationRun 真正走过的事件路径**。
 *
 * 与另外两张图严格区分（M0.3_TASK §8.3）：
 *   · Knowledge Graph 只存概念关系，不因运行失败改线；
 *   · System Graph 只投影已装配的工具与逻辑连接；
 *   · Execution Graph 只画 events 经过的阶段与分支，未走过的候选分支
 *     一律用虚线并明确标注「未执行」，不假装走过。
 * ------------------------------------------------------------------
 */
import { h, esc } from '../../constructor/components/dom.js';
import { PHASES, PHASE_META, EVENT_TYPE_META, STATUS_META } from '../../../simulation/events/schema.js';
import { BRANCHES, BRANCH_ORDER } from '../../../simulation/rules/branches.js';

export function createExecutionGraph({ onSeek } = {}) {
  const el = h('section', { class: 'ex-graph surface', 'aria-label': '执行图：本次真正走过的事件路径' });
  const head = h('div', { class: 'panel-head' }, `
    <span class="panel-head__title">EXECUTION GRAPH</span>
    <span class="tag tag--muted" data-el="summary">—</span>`);
  const branchBar = h('div', { class: 'ex-branches', 'aria-label': '候选分支：只有实际走过的分支会被标为已执行' });
  const lanes = h('ol', { class: 'ex-lanes' });
  const foot = h('div', { class: 'ex-graph__foot' });
  el.append(head, branchBar, lanes, foot);

  let current = 0;
  let run = null;

  function renderBranches() {
    branchBar.replaceChildren();
    for (const id of BRANCH_ORDER) {
      const branch = BRANCHES[id];
      const executed = run.branchId === id;
      const chip = h(
        'button',
        {
          class: 'ex-branch',
          type: 'button',
          'data-branch': id,
          'data-active': executed ? 'true' : 'false',
          'data-tone': branch.tone,
          'aria-label': `${branch.cn}：${branch.condition}。${executed ? '本次运行走的是这条分支' : '本次运行未执行这条分支'}`,
          title: `${branch.cn} · ${branch.condition} → ${branch.expect}`,
        },
        `<span class="ex-branch__id">${esc(id.split('_')[0])}</span>
         <span class="ex-branch__name">${esc(branch.title)}</span>
         <span class="ex-branch__state">${executed ? '已执行 · 本次路径' : '未执行'}</span>`
      );
      branchBar.append(chip);
    }
    // 本次真正走的分支可能排在后面：把它滚进可视区，避免用户以为「没有分支」
    const active = branchBar.querySelector('.ex-branch[data-active="true"]');
    if (active) {
      branchBar.scrollLeft = Math.max(0, active.offsetLeft - 6);
    }
  }

  /** 事件 → 阶段分组；阶段本身来自 Schema，不是界面临时下标 */
  function eventsByPhase() {
    const map = new Map(PHASES.map((p) => [p, []]));
    for (const ev of run.events) {
      if (!map.has(ev.phase)) map.set(ev.phase, []);
      map.get(ev.phase).push(ev);
    }
    return map;
  }

  function render() {
    if (!run) return;
    const grouped = eventsByPhase();
    const currentEvent = run.events[current];
    head.querySelector('[data-el="summary"]').textContent = `${run.events.length} 个事件 · 分支 ${run.branchId}`;

    lanes.replaceChildren();
    let order = 0;
    for (const phase of PHASES) {
      const list = grouped.get(phase) || [];
      const executed = list.length > 0;
      const isCurrentPhase = currentEvent?.phase === phase;
      const li = h('li', {
        class: 'ex-lane',
        'data-phase': phase,
        'data-executed': executed ? 'true' : 'false',
        'data-current': isCurrentPhase ? 'true' : 'false',
      });
      li.append(
        h('div', { class: 'ex-lane__label' }, `
          <span class="ex-lane__en mono">${esc(phase)}</span>
          <span class="ex-lane__cn">${esc(PHASE_META[phase]?.cn || phase)}</span>
          <span class="ex-lane__flag">${executed ? `${list.length} 个事件` : '未执行'}</span>`)
      );
      const body = h('div', { class: 'ex-lane__body' });
      if (!executed) {
        body.append(h('div', { class: 'ex-lane__empty' }, '本次未执行（虚线表示候选路径）'));
      } else {
        for (const ev of list) {
          order += 1;
          const typeMeta = EVENT_TYPE_META[ev.type] || { cn: ev.type, tone: 'muted' };
          const statusMeta = STATUS_META[ev.status] || STATUS_META.info;
          const node = h(
            'button',
            {
              class: 'ex-node',
              type: 'button',
              'data-event': ev.id,
              'data-status': ev.status,
              'data-tone': typeMeta.tone,
              'data-current': ev.sequence === current ? 'true' : 'false',
              'aria-label': `事件 ${ev.sequence} · ${typeMeta.cn} · ${statusMeta.cn}：${ev.message}`,
            },
            `<span class="ex-node__seq">${String(ev.sequence).padStart(2, '0')}</span>
             <span class="ex-node__body">
               <span class="ex-node__type">${esc(typeMeta.cn)}</span>
               <span class="ex-node__msg">${esc(ev.message)}</span>
               ${ev.toolId ? `<span class="ex-node__tool mono">${esc(ev.toolId)}</span>` : ''}
             </span>
             <span class="tag tag--${statusMeta.tone} ex-node__status">${esc(statusMeta.cn)}</span>`
          );
          node.addEventListener('click', () => onSeek?.(ev.sequence));
          body.append(node);
          if (order < run.events.length) body.append(h('span', { class: 'ex-node__link', 'aria-hidden': 'true' }));
        }
      }
      li.append(body);
      lanes.append(li);
    }

    foot.innerHTML = `
      <div class="note note--info ex-graph__hint" title="知识图存概念关系，系统图存已装配连接，执行图只画本次事件；未走过的阶段用虚线标注，不代表系统走过。">
        <span class="note__key">读法</span>
        <span>实线节点是本次**真正产生**的事件；标「未执行」的阶段只是候选路径。</span>
      </div>`;
    renderBranches();
  }

  return {
    el,
    render(nextRun, currentSequence = 0) {
      run = nextRun;
      current = currentSequence;
      render();
    },
    setCurrent(sequence) {
      current = sequence;
      for (const node of lanes.querySelectorAll('.ex-node')) {
        const id = node.getAttribute('data-event');
        node.setAttribute('data-current', id === `${run.runId}#e${String(sequence).padStart(2, '0')}` ? 'true' : 'false');
      }
      const currentEvent = run?.events[sequence];
      for (const lane of lanes.querySelectorAll('.ex-lane')) {
        lane.setAttribute('data-current', currentEvent && lane.getAttribute('data-phase') === currentEvent.phase ? 'true' : 'false');
      }
    },
    currentNodeCount: () => lanes.querySelectorAll('.ex-node').length,
  };
}
