/**
 * src/features/constructor/state/store.js
 * ------------------------------------------------------------------
 * 装配能力的唯一权威数据源（Single Source of Truth）。
 *
 * 三维装配视图、二维系统视图、Inspector 与左侧能力架**全部订阅同一个
 * store**；页面里只有这一处写 localStorage，避免多处写入造成状态竞争
 * （M0.2_TASK §4.1 / §11）。
 * ------------------------------------------------------------------
 */
import { CONSTRUCTOR_STORAGE_KEY, SCHEMA_VERSION, createInitialState, createInitialUi, reduce } from './reducer.js';
import { clearConfig, readConfig, writeConfig } from './persistence.js';
import { deriveStatus, portOccupant } from '../model/validation.js';
import { getModule, getPort } from '../model/modules.js';

export { CONSTRUCTOR_STORAGE_KEY, SCHEMA_VERSION };

export function createConstructorStore({ storage = null, key = CONSTRUCTOR_STORAGE_KEY, onLog = null } = {}) {
  const loaded = readConfig(storage, key);
  let state = createInitialState();
  state = { ...state, modules: loaded.modules, ui: { ...createInitialUi(), notice: loaded.notice } };

  const listeners = new Set();

  function getState() {
    return state;
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function emit(action, prev) {
    for (const fn of [...listeners]) fn(state, { action, prev });
  }

  function persist() {
    const ok = writeConfig(storage, key, state);
    if (!ok) onLog?.('配置', '本地存储不可用（隐私模式或配额限制）：本次会话功能不受影响，但刷新后不会恢复', 'attention');
    return ok;
  }

  /**
   * 唯一入口：任何界面动作都必须经过 dispatch。
   * 返回被拒绝时为 { ok:false }，界面据此给出原因，而不是静默失败。
   */
  function dispatch(action) {
    const prev = state;
    let next;
    try {
      next = reduce(prev, action);
    } catch (error) {
      onLog?.('配置', `状态转换异常已被拦截：${error.message}`, 'error');
      return { ok: false, rejected: true, error };
    }
    if (next === prev) return { ok: false, rejected: true, notice: prev.ui.notice };

    state = next;
    if (next.modules !== prev.modules) persist();
    emit(action, prev);
    // ok 表达的是业务结果，而不是“引用是否变化”：被校验拒绝的动作必须返回失败，
    // 界面据此显示字段级原因（M0.2_TASK §7.2）。
    return { ok: state.ui.notice?.level !== 'error', notice: state.ui.notice };
  }

  /* ---------------- 只读查询（派生自同一份权威配置） ---------------- */

  function getInstalled(moduleId) {
    return state.modules.find((m) => m.moduleId === moduleId) || null;
  }

  function statusOf(moduleId) {
    const installed = getInstalled(moduleId);
    if (!installed) return state.ui.preview?.moduleId === moduleId ? 'Preview' : 'Available';
    return deriveStatus(installed);
  }

  function occupantOf(portId) {
    return portOccupant(state.modules, portId);
  }

  function isPortFree(portId) {
    return !occupantOf(portId);
  }

  /** 供 Inspector / 2D 视图统一使用的完整快照 */
  function describe(moduleId) {
    const mod = getModule(moduleId);
    if (!mod) return null;
    const installed = getInstalled(moduleId);
    const status = statusOf(moduleId);
    return {
      module: mod,
      port: getPort(mod.portId),
      installed,
      status,
      preview: state.ui.preview?.moduleId === moduleId ? state.ui.preview : null,
      occupiedBy: occupantOf(mod.portId)?.moduleId || null,
    };
  }

  /* ---------------- 语义化动作（界面只调用这些） ---------------- */

  const actions = {
    preview: (moduleId) => dispatch({ type: 'assembly/preview', moduleId }),
    cancel: () => dispatch({ type: 'assembly/cancel' }),
    commit: (moduleId, portId) => dispatch({ type: 'assembly/commit', moduleId, portId }),
    configure: (moduleId, patch) => dispatch({ type: 'module/configure', moduleId, patch }),
    setEnabled: (moduleId, enabled) => dispatch({ type: 'module/toggle', moduleId, enabled }),
    remove: (moduleId) => dispatch({ type: 'module/remove', moduleId }),
    select: (moduleId) => dispatch({ type: 'select', moduleId }),
    dragStart: (moduleId) => dispatch({ type: 'drag/start', moduleId }),
    dragTarget: (portId, valid, message) => dispatch({ type: 'drag/target', portId, valid, message }),
    dragEnd: (commit, portId) => dispatch({ type: 'drag/end', commit, portId }),
    clearNotice: () => dispatch({ type: 'notice/clear' }),
    /** 重置构建器：只清理构建器命名空间下的数据，不触碰 M0.1 的开场偏好 */
    reset: () => {
      const result = dispatch({ type: 'module/reset' });
      clearConfig(storage, key);
      return result;
    },
  };

  return {
    getState,
    subscribe,
    dispatch,
    actions,
    getInstalled,
    statusOf,
    occupantOf,
    isPortFree,
    describe,
    /** 自检脚本使用：直接读回落盘内容，验证“刷新可恢复” */
    readPersisted: () => readConfig(storage, key),
  };
}
