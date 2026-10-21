/**
 * src/features/execution/components/timeline.js
 * ------------------------------------------------------------------
 * EVENT TIMELINE：播放 / 暂停、前后单步、Seek、调速、复位。
 *
 * 只操作回放指针，不重新调用模拟引擎（M0.3_TASK §8.2）。
 * ------------------------------------------------------------------
 */
import { h, esc } from '../../constructor/components/dom.js';
import { STATUS_META, EVENT_TYPE_META } from '../../../simulation/events/schema.js';
import { SPEEDS } from '../state/replay.js';

export function createTimeline({ onPlayToggle, onPrev, onNext, onSeek, onSpeed, onRestart, onNewRun } = {}) {
  const el = h('section', { class: 'ex-timeline surface', 'aria-label': '事件时间轴与回放控制' });
  const head = h('div', { class: 'ex-timeline__head' });
  const transport = h('div', { class: 'ex-transport', role: 'group', 'aria-label': '回放控制' });

  const mk = (label, aria, fn, cls = 'btn btn--sm') => {
    const b = h('button', { class: cls, type: 'button', 'aria-label': aria }, label);
    b.addEventListener('click', fn);
    return b;
  };

  const prevBtn = mk('◀ 上一事件', '回到上一个事件', () => onPrev?.());
  const playBtn = mk('▶ 播放', '播放或暂停已生成的事件序列', () => onPlayToggle?.(), 'btn btn--sm btn--primary');
  const nextBtn = mk('下一事件 ▶', '前进到下一个事件', () => onNext?.());
  const restartBtn = mk('⟲ Restart Replay', '把事件指针归零（不重新运行模拟）：只推进已生成的事件数组', () => onRestart?.());
  const newRunBtn = mk('New Run · 按当前配置重新运行', '使用装配台当前配置生成一条新的模拟轨迹', () => onNewRun?.(), 'btn btn--sm btn--ghost');

  const speed = h('select', { class: 'field__control field__control--sm', 'aria-label': '回放速度：只影响事件展示节奏，不影响模拟结果' });
  for (const s of SPEEDS) speed.append(h('option', { value: String(s) }, `${s}×`));
  speed.value = '1';
  speed.addEventListener('change', () => onSpeed?.(Number(speed.value)));

  const counter = h('span', { class: 'mono ex-timeline__counter', 'data-el': 'counter' }, '事件 — / —');
  const outcome = h('span', { class: 'ex-timeline__outcome', 'data-el': 'outcome' });

  transport.append(prevBtn, playBtn, nextBtn, restartBtn, h('span', { class: 'ex-timeline__sep', 'aria-hidden': 'true' }), speed, newRunBtn);
  head.append(
    h('div', { class: 'ex-timeline__title' }, `<span class="panel-head__title">EVENT TIMELINE</span>`),
    h('div', { class: 'ex-timeline__meta' }, counter, outcome),
    transport
  );

  const strip = h('div', { class: 'ex-strip', role: 'group', 'aria-label': '事件条：选择任一事件可跳到该步' });
  el.append(head, strip);

  let count = 0;

  function renderStrip(run, index) {
    strip.replaceChildren();
    count = run.events.length;
    run.events.forEach((ev, i) => {
      const typeMeta = EVENT_TYPE_META[ev.type] || { cn: ev.type, tone: 'muted' };
      const statusMeta = STATUS_META[ev.status] || STATUS_META.info;
      const b = h(
        'button',
        {
          class: 'ex-tick',
          type: 'button',
          'data-event': ev.id,
          'data-status': ev.status,
          'data-tone': typeMeta.tone,
          'data-current': i === index ? 'true' : 'false',
          'data-done': i < index ? 'true' : 'false',
          'aria-label': `跳到事件 ${ev.sequence}：${typeMeta.cn} · ${statusMeta.cn}`,
          title: `#${String(ev.sequence).padStart(2, '0')} ${typeMeta.cn} · ${statusMeta.cn} —— ${ev.message}`,
        },
        `<span class="ex-tick__seq">${String(ev.sequence).padStart(2, '0')}</span>
         <span class="ex-tick__dot" aria-hidden="true"></span>`
      );
      b.addEventListener('click', () => onSeek?.(ev.sequence));
      strip.append(b);
    });
  }

  return {
    el,
    render(run, state) {
      renderStrip(run, state.index);
      counter.textContent = `事件 ${state.index + 1} / ${count} · 速度 ${state.speed}×`;
      playBtn.textContent = state.playing ? '❚❚ 暂停' : state.atEnd && count > 0 ? '▶ 重播' : '▶ 播放';
      playBtn.setAttribute('aria-label', state.playing ? '暂停回放' : '播放事件序列');
      prevBtn.disabled = state.atStart;
      nextBtn.disabled = state.atEnd;
      outcome.textContent = '';
      outcome.append(
        h('span', { class: `tag tag--${state.playing ? 'signal' : 'muted'}`, 'data-el': 'play-state' }, state.playing ? 'PLAYING · 播放中' : 'PAUSED · 已暂停')
      );
    },
    setSpeed(value) {
      speed.value = String(value);
    },
    setCurrent(index) {
      const ticks = strip.querySelectorAll('.ex-tick');
      ticks.forEach((t, i) => {
        t.setAttribute('data-current', i === index ? 'true' : 'false');
        t.setAttribute('data-done', i < index ? 'true' : 'false');
      });
      counter.textContent = `事件 ${index + 1} / ${count} · 速度 ${speed.value}×`;
    },
    setPlaying(playing, atEnd) {
      playBtn.textContent = playing ? '❚❚ 暂停' : atEnd ? '▶ 重播' : '▶ 播放';
      outcome.replaceChildren(h('span', { class: `tag tag--${playing ? 'signal' : 'muted'}` }, playing ? 'PLAYING · 播放中' : 'PAUSED · 已暂停'));
    },
    disableNewRun(disabled) {
      newRunBtn.disabled = !!disabled;
    },
    /** 无历史轨迹时给出诚实状态，而不是假按钮 */
    renderEmpty() {
      strip.replaceChildren(h('div', { class: 'ex-strip__empty' }, '尚未生成事件轨迹：点击 New Run 使用当前配置运行一次本地模拟。'));
      counter.textContent = '事件 — / —';
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      playBtn.disabled = true;
      restartBtn.disabled = true;
      speed.disabled = true;
    },
    setEnabled() {
      prevBtn.disabled = false;
      playBtn.disabled = false;
      restartBtn.disabled = false;
      speed.disabled = false;
    },
    refreshCounter: (index) => {
      counter.textContent = `事件 ${index + 1} / ${count} · 速度 ${speed.value}×`;
    },
    esc,
  };
}
