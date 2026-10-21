/**
 * src/features/execution/state/persistence.js
 * ------------------------------------------------------------------
 * 最近一次完整运行记录的版本化本地持久化。
 *
 * 边界（M0.3_TASK §8.4）：
 *   · 只保存最近一次 Run：输入配置快照、任务数据版本、事件、outcome
 *     与显示需要的安全载荷；
 *   · **绝不触碰** M0.2 的 `agent-zero:constructor:v1`，也不清理它；
 *   · 输出只含虚构资料，不含真实用户个人数据或任何 API Key；
 *   · 损坏数据安全降级为「没有历史记录 + 可读提示」，不白屏。
 * ------------------------------------------------------------------
 */
import { parseHistory, serializeHistory } from '../../../simulation/events/serializer.js';

export const EXECUTION_STORAGE_KEY = 'agent-zero:execution:v1';

function safeStorage(storage) {
  if (storage) return storage;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function readExecution(storage, key = EXECUTION_STORAGE_KEY) {
  const store = safeStorage(storage);
  if (!store) return { run: null, savedAt: null, notice: null };
  let raw = null;
  try {
    raw = store.getItem(key);
  } catch {
    return {
      run: null,
      savedAt: null,
      notice: { level: 'attention', code: 'EXECUTION_STORAGE_BLOCKED', message: '浏览器拒绝了本地运行记录的读取（可能处于隐私模式）：本次不恢复历史轨迹，但仍可运行新的模拟' },
    };
  }
  return parseHistory(raw);
}

/** 写入成功返回 true；配额或隐私模式失败时静默降级，不影响本次会话 */
export function writeExecution(storage, key = EXECUTION_STORAGE_KEY, run, savedAt = new Date().toISOString()) {
  const store = safeStorage(storage);
  if (!store) return false;
  try {
    store.setItem(key, serializeHistory({ run, savedAt }));
    return true;
  } catch {
    return false;
  }
}

export function clearExecution(storage, key = EXECUTION_STORAGE_KEY) {
  const store = safeStorage(storage);
  if (!store) return false;
  try {
    store.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
