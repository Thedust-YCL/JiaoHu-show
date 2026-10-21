/**
 * src/state/store.js
 * ------------------------------------------------------------------
 * 唯一权威 UI 状态（PRD §7.1 / §12：逻辑配置是唯一数据源，
 * 视觉层只订阅状态，不得反向判断业务状态）。
 * ------------------------------------------------------------------
 */
const listeners = new Set();

export const state = {
  /** d | boot | hub | error */
  phase: 'd',
  /** 当前模式：system 为 M0.1 唯一真实交互视图 */
  mode: 'system',
  /** 选中的部件 id，null 表示未选中 */
  selection: null,
  /** 2D System 视图是否显示 */
  systemView: false,
  /** 左侧导航在窄视图下是否展开 */
  dockOpen: false,
  /** 右侧 Inspector 是否展开 */
  inspectOpen: true,
  /** 底部状态/事件区是否展开 */
  statusOpen: true,
  /** 3D 创建成功 */
  webgl: false,
  /** 是否处于降级渲染档 */
  lowPower: false,
  /** 是否遵守减少动态效果 */
  reducedMotion: false,
  /** 舞台读数（真实数据，由渲染循环更新） */
  readout: {
    fps: 0,
    ms: 0,
    zoom: 0,
    azimuth: 0,
    polar: 0,
    drawCalls: 0,
    triangles: 0,
    ringSpeeds: [0, 0, 0],
  },
  /** 运行状态机（M0.1 只使用 DORMANT/BOOTING/IDLE/FOCUSED） */
  coreState: 'DORMANT',
  /** 事件计数：真实交互次数 */
  events: 0,
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setState(patch, reason = 'state') {
  let changed = false;
  for (const [k, v] of Object.entries(patch)) {
    if (state[k] !== v) {
      state[k] = v;
      changed = true;
    }
  }
  if (changed) for (const fn of listeners) fn(state, reason);
}

/** 直接写入读数（高频更新，不触发全局重渲染） */
export function patchReadout(patch) {
  Object.assign(state.readout, patch);
}

/* --------------------------------------------------------------------------
   系统事件日志：只记录真实发生的事件（含 WebGL 状态、用户操作、真实耗时）。
   绝不写入虚构的工具调用或模拟结果。
   -------------------------------------------------------------------------- */
const LOG_LIMIT = 220;
export const logEntries = [];
const logListeners = new Set();

function pad(n, w = 2) {
  return String(n).padStart(w, '0');
}

export function log(kind, message, level = 'info') {
  const now = new Date();
  const entry = {
    id: `E${pad(++state.events, 4)}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`,
    kind,
    message,
    level,
  };
  logEntries.push(entry);
  if (logEntries.length > LOG_LIMIT) logEntries.shift();
  for (const fn of logListeners) fn(entry, logEntries);
  return entry;
}

export function onLog(fn) {
  logListeners.add(fn);
  return () => logListeners.delete(fn);
}
