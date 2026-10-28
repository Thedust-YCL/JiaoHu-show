/**
 * src/features/execution/state/persistence.js
 * ------------------------------------------------------------------
 * 运行记录的版本化本地持久化。
 *
 * 边界（M0.3_TASK §8.4，M0.4_TASK §6.2 / §10.2）：
 *   · 新命名空间 `agent-zero:research:v2` 保存**最近两次** Run，便于演示
 *     「改配置重跑后，旧 Run 仍可检查」；超过容量时丢弃更早的一条。
 *   · **绝不触碰** M0.2 的 `agent-zero:constructor:v1` 与 M0.3 的
 *     `agent-zero:execution:v1`，也不清理学习进度与开场偏好。
 *   · M0.3 的旧记录只读：解析为 legacy（只有执行轨迹、没有结构化报告），
 *     绝不用当前资料包替旧 Run 补造结论。
 *   · 输出只含虚构资料，不含真实用户个人数据或任何 API Key。
 *   · 损坏数据安全降级为「没有历史记录 + 可读提示」，不白屏、不抛错。
 * ------------------------------------------------------------------
 */
import { parseHistory, serializeHistory } from '../../../simulation/events/serializer.js';

/** M0.3 命名空间：只读兼容，绝不写入、绝不删除 */
export const EXECUTION_STORAGE_KEY = 'agent-zero:execution:v1';

/** M0.4 命名空间：最近两次研究运行的完整记录（含证据与报告） */
export const RESEARCH_STORAGE_KEY = 'agent-zero:research:v2';

/** 本地最多保留几次运行（控制容量；界面会显示清理策略） */
export const MAX_LOCAL_RUNS = 2;

function safeStorage(storage) {
  if (storage) return storage;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * M0.3 只读兼容
 * ------------------------------------------------------------------ */

export function readExecution(storage, key = EXECUTION_STORAGE_KEY) {
  const store = safeStorage(storage);
  if (!store) return { run: null, savedAt: null, legacy: false, notice: null };
  let raw = null;
  try {
    raw = store.getItem(key);
  } catch {
    return {
      run: null,
      savedAt: null,
      legacy: false,
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

/* ------------------------------------------------------------------ *
 * M0.4 运行历史
 * ------------------------------------------------------------------ */

function emptyHistory() {
  return { runs: [], legacy: null, notice: null };
}

/**
 * 读取研究运行历史（最近两次，新的在前）。
 * @returns {{runs:Array<{run:object,savedAt:string}>, legacy:object|null, notice:object|null}}
 */
export function readResearchHistory(storage, key = RESEARCH_STORAGE_KEY) {
  const store = safeStorage(storage);
  if (!store) return emptyHistory();

  let raw = null;
  try {
    raw = store.getItem(key);
  } catch {
    return {
      ...emptyHistory(),
      locked: true,
      notice: { level: 'attention', code: 'RESEARCH_STORAGE_BLOCKED', message: '浏览器拒绝了本地运行记录的读取（可能处于隐私模式）：本次不恢复历史 Run，但仍可发起新的研究运行' },
    };
  }

  /* 没有任何新记录时，尝试读取 M0.3 的旧轨迹（只读兼容） */
  if (raw === null || raw === undefined || raw === '') {
    const legacy = readExecution(storage);
    if (legacy.run) {
      return {
        runs: [],
        legacy: { run: legacy.run, savedAt: legacy.savedAt, schemaVersion: legacy.run.schemaVersion },
        notice: legacy.notice,
      };
    }
    return { ...emptyHistory(), notice: legacy.notice || null };
  }

  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    return {
      ...emptyHistory(),
      locked: true,
      notice: { level: 'error', code: 'RESEARCH_STORAGE_CORRUPT', message: '本地研究记录无法解析，原始数据已保留；新的运行仅在本次会话可见。' },
    };
  }

  if (!data || typeof data !== 'object' || !Array.isArray(data.runs)) {
    return {
      ...emptyHistory(),
      locked: true,
      notice: { level: 'error', code: 'RESEARCH_STORAGE_SHAPE', message: '本地研究记录结构不符合预期，原始数据已保留。' },
    };
  }

  if (data.schemaVersion !== 2 || data.runs.length > MAX_LOCAL_RUNS) {
    return { ...emptyHistory(), locked: true, notice: { level: 'error', code: 'RESEARCH_STORAGE_VERSION', message: '研究记录版本或数量不兼容，原始数据已保留。' } };
  }

  const runs = [];
  const problems = [];
  for (const entry of data.runs.slice(0, MAX_LOCAL_RUNS)) {
    // 逐条校验：一条坏记录不应连累其余记录
    const parsed = parseHistory(JSON.stringify({ schemaVersion: 2, savedAt: entry?.savedAt ?? null, run: entry?.run }));
    if (parsed.run) runs.push({ run: parsed.run, savedAt: parsed.savedAt });
    else if (parsed.notice) problems.push(parsed.notice);
  }

  return {
    runs,
    legacy: null,
    ...(problems.length ? { locked: true } : {}),
    notice: problems.length ? { ...problems[0], message: `${problems[0].message}；原始研究记录已保留，新增运行仅在本次会话可见。` } : null,
  };
}

/**
 * 追加一次运行记录（新的在前，最多 MAX_LOCAL_RUNS 条）。
 * @returns {{ok:boolean, runs:Array, evicted:number, notice:object|null}}
 */
export function appendResearchRun(storage, run, savedAt = new Date().toISOString(), key = RESEARCH_STORAGE_KEY) {
  const store = safeStorage(storage);
  if (!store) {
    return { ok: false, runs: [], evicted: 0, notice: { level: 'attention', code: 'RESEARCH_STORAGE_UNAVAILABLE', message: '当前环境没有可用的本地存储：本次会话仍可查看，但刷新后不会恢复' } };
  }

  const current = readResearchHistory(store, key);
  if (current.locked) {
    return { ok: false, runs: current.runs, evicted: 0, notice: current.notice?.code === 'RESEARCH_STORAGE_BLOCKED'
      ? { level: 'attention', code: 'RESEARCH_STORAGE_FULL', message: '无法读取原有研究记录，已停止写入以保留原始数据；本次运行刷新后不会恢复。' }
      : current.notice };
  }
  const next = [{ run, savedAt }, ...current.runs].slice(0, MAX_LOCAL_RUNS);
  const evicted = Math.max(0, current.runs.length + 1 - next.length);

  try {
    store.setItem(key, JSON.stringify({ schemaVersion: 2, savedAt, runs: next }));
    return { ok: true, runs: next, evicted, notice: null };
  } catch (error) {
    /* 容量不足：先尝试只保留本次运行，再失败则明确提示，绝不改动其它命名空间 */
    try {
      store.setItem(key, JSON.stringify({ schemaVersion: 2, savedAt, runs: [{ run, savedAt }] }));
      return {
        ok: true,
        runs: [{ run, savedAt }],
        evicted: Math.max(0, current.runs.length + 1 - 1),
        notice: {
          level: 'attention',
          code: 'RESEARCH_STORAGE_PARTIAL',
          message: '本地存储空间不足：已只保留本次运行，更早的历史记录未写入（装配配置与学习进度未受影响）',
        },
      };
    } catch {
      return {
        ok: false,
        runs: current.runs,
        evicted: 0,
        notice: {
          level: 'attention',
          code: 'RESEARCH_STORAGE_FULL',
          message: '本地存储写入失败（配额或隐私模式）：本次运行仍可在当前会话查看与导出，但刷新后不会恢复',
          fix: error && error.name ? `${error.name}` : undefined,
        },
      };
    }
  }
}

export function clearResearchHistory(storage, key = RESEARCH_STORAGE_KEY) {
  const store = safeStorage(storage);
  if (!store) return false;
  try {
    store.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
