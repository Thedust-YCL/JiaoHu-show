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
import { BRANCHES, BRANCH_ORDER, EVIDENCE_BRANCHES, EVIDENCE_BRANCH_ORDER } from '../../../simulation/rules/branches.js';

export function createExecutionGraph({ onSeek } = {}) {
  const el = h('section', { class: 'ex-graph surface', 'aria-label': '执行图：本次真正走过的事件路径' });
  const head = h('div', { class: 'panel-head' }, `
    <span class="panel-head__title">EXECUTION GRAPH</span>
    <span class="tag tag--muted" data-el="summary">—</span>`);
  const branchBar = h('div', { class: 'ex-branches', 'aria-label': '候选执行分支：只有实际走过的分支会被标为已执行' });
  const evidenceBar = h('div', { class: 'ex-branches ex-branches--evidence', 'aria-label': '候选证据分支：本次证据检查真正得出的结论' });
  const lanes = h('ol', { class: 'ex-lanes' });
  const foot = h('div', { class: 'ex-graph__foot' });
  el.append(head, branchBar, evidenceBar, lanes, foot);

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

  /**
   * 证据分支：与执行分支并列的第二根轴。
   * 一次运行里可能同时出现「一组更正成立」与「一组未决」，两条都要如实标出。
   */
  function renderEvidenceBranches() {
    evidenceBar.replaceChildren();
    if (!run) return;
    const executed = Array.isArray(run.evidenceBranchIds) && run.evidenceBranchIds.length
      ? run.evidenceBranchIds
      : run.evidenceBranchId
        ? [run.evidenceBranchId]
        : [];
    evidenceBar.append(h('span', { class: 'ex-branches__label' }, '证据分支'));
    for (const id of EVIDENCE_BRANCH_ORDER) {
      const branch = EVIDENCE_BRANCHES[id];
      const isOn = executed.includes(id);
      evidenceBar.append(
        h(
          'button',
          {
            class: 'ex-branch ex-branch--evidence',
            type: 'button',
            'data-evidence-branch': id,
            'data-active': isOn ? 'true' : 'false',
            'data-tone': branch.tone,
            'aria-label': `${branch.cn}：${branch.condition}。${isOn ? '本次运行走过这条证据分支' : '本次运行未走这条证据分支'}`,
            title: `${branch.cn} · ${branch.condition} → ${branch.expect}`,
          },
          `<span class="ex-branch__id">${esc(id.split('_')[0])}</span>
           <span class="ex-branch__name">${esc(branch.title)}</span>
           <span class="ex-branch__state">${isOn ? '已执行 · 本次结论' : '未执行'}</span>`
        )
      );
    }
    // 本次真正走过的证据分支可能被挤到右侧：滚进可视区，避免用户以为「没有证据分支」
    const activeEvidence = evidenceBar.querySelector('.ex-branch[data-active="true"]');
    if (activeEvidence) evidenceBar.scrollLeft = Math.max(0, activeEvidence.offsetLeft - 8);
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
    head.querySelector('[data-el="summary"]').textContent = `${run.events.length} 个事件 · 分支 ${run.branchId}${run.evidenceBranchId ? ` · 证据 ${run.evidenceBranchId}` : ''}`;

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
    renderEvidenceBranches();
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


