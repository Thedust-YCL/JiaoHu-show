/**
 * src/features/execution/state/replay.js
 * ------------------------------------------------------------------
 * 回放控制器：只在**已经生成的事件数组**上移动指针，不重新运行模拟逻辑
 * （M0.3_TASK §7.1 第 5 条）。
 *
 * 纯逻辑：时间由外部渲染循环通过 `tick(dt)` 提供，因此
 *   · 单元测试可以直接推进时间，验证边界与确定性；
 *   · Tab 切换、播放速度、WebGL 降级都不会改变 SimulationRun 数据。
 * ------------------------------------------------------------------
 */

/** 只提供这四档速度：只影响事件展示节奏，不影响任何模拟规则 */
export const SPEEDS = Object.freeze([0.5, 1, 2, 4]);

/** 1× 时每个事件的可见停留时间（纯视觉参数，不是业务规则） */
export const BASE_INTERVAL_MS = 1100;

export function createReplay(run, { baseIntervalMs = BASE_INTERVAL_MS } = {}) {
  const events = Array.isArray(run?.events) ? run.events : [];
  const total = events.length;
  let index = total > 0 ? 0 : -1;
  let playing = false;
  let speed = 1;
  let accumulator = 0;
  let disposed = false;
  const listeners = new Set();

  function getState() {
    return {
      index,
      total,
      playing,
      speed,
      atStart: index <= 0,
      atEnd: total === 0 || index >= total - 1,
      event: index >= 0 ? events[index] : null,
      intervalMs: baseIntervalMs / speed,
    };
  }

  function emit(reason) {
    const s = getState();
    for (const fn of [...listeners]) fn(s, { reason });
  }

  function clamp(i) {
    if (total === 0) return -1;
    return Math.max(0, Math.min(total - 1, i));
  }

  /** 指针移动的唯一入口：越界一律夹紧，不产生非法事件下标 */
  function seek(next, reason = 'seek') {
    const clamped = clamp(next);
    if (clamped === index) {
      emit(reason);
      return index;
    }
    index = clamped;
    accumulator = 0;
    emit(reason);
    return index;
  }

  return {
    getState,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    events,
    play() {
      if (disposed || playing || total === 0) return;
      // 已经停在末尾时再次播放：从末尾不动，避免「播放完又跳回去」的假动作
      if (index >= total - 1) {
        emit('play-noop');
        return;
      }
      playing = true;
      accumulator = 0;
      emit('play');
    },
    pause() {
      if (!playing) return;
      playing = false;
      accumulator = 0;
      emit('pause');
    },
    toggle() {
      if (playing) this.pause();
      else this.play();
    },
    next() {
      return seek(index + 1, 'next');
    },
    prev() {
      return seek(index - 1, 'prev');
    },
    seekTo(i) {
      return seek(i, 'seek');
    },
    setSpeed(value) {
      const next = SPEEDS.includes(Number(value)) ? Number(value) : speed;
      if (next === speed) return speed;
      speed = next;
      accumulator = 0;
      emit('speed');
      return speed;
    },
    /** 复位：指针归零，**不重新调用引擎**，也不改动已生成的事件 */
    restart() {
      index = total > 0 ? 0 : -1;
      accumulator = 0;
      playing = false;
      emit('restart');
      return index;
    },
    /**
     * 由渲染循环驱动。只有播放中才推进指针；速度只影响停留时长。
     * 推进到末尾会自动暂停并停在最后一个事件。
     */
    tick(dtSeconds) {
      if (disposed || !playing || total === 0) return getState();
      const dt = Math.max(0, Math.min(0.25, Number(dtSeconds) || 0)) * 1000;
      accumulator += dt;
      const interval = baseIntervalMs / speed;
      let steps = 0;
      while (accumulator >= interval && steps < 8) {
        accumulator -= interval;
        steps += 1;
        if (index >= total - 1) {
          playing = false;
          accumulator = 0;
          emit('end');
          return getState();
        }
        index += 1;
      }
      if (steps > 0) emit('advance');
      return getState();
    },
    dispose() {
      disposed = true;
      playing = false;
      listeners.clear();
    },
  };
}
