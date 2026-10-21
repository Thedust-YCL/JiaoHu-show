/**
 * src/simulation/events/serializer.js
 * ------------------------------------------------------------------
 * 运行结果与事件轨迹的序列化 / 反序列化 / 稳定标识派生。
 *
 * 关键要求（M0.3_TASK §7.2 / §7.4）：
 *   · 事件内容不得包含 Date.now() / Math.random() 造成的差异；
 *   · runId 由「配置快照 + 任务版本 + 故障选项」的内容 hash 派生，
 *     因此同一输入必然得到同一 runId 与同一条事件轨迹；
 *   · 任何损坏的本地数据都要安全降级为「没有历史记录 + 可读提示」，
 *     绝不抛出异常把整页拖垮（A28）。
 * ------------------------------------------------------------------
 */
import { SIMULATION_SCHEMA_VERSION, PHASES, STATUSES, ACTORS, EVENT_TYPES, FAULT_MODES, OUTCOMES } from './schema.js';

/* ----------------------------- 稳定序列化 ----------------------------- */

/** 键排序的规范化 JSON：同一份数据无论键顺序如何都得到同一字符串 */
export function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalize(v)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
}

/** FNV-1a 32 位 hash → 8 位十六进制，用于派生稳定 runId（不用于安全场景） */
export function stableHash(text) {
  let h = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** 深拷贝（仅 JSON 安全结构）：用于冻结运行输入，防止后续编辑污染历史 */
export function deepClone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => deepClone(v));
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = deepClone(v);
  return out;
}

/** 递归冻结：运行快照与事件数组都不可被后续代码改写 */
export function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const v of Object.values(value)) deepFreeze(v);
  return value;
}

/**
 * runId = hash(任务标识 + 版本 + 配置快照 + 故障选项)。
 * 不含时间：同一输入重复运行得到同一个 runId，这是可复现性的直接体现。
 */
export function deriveRunId({ missionId, missionVersion, configSnapshot, faultMode }) {
  const payload = canonicalize({
    missionId,
    missionVersion,
    faultMode,
    snapshot: configSnapshot,
  });
  return `run-${stableHash(payload)}`;
}

/* ----------------------------- 事件校验 ----------------------------- */

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** 单条事件形状校验：任何不合法字段都会被拒绝，而不是带病渲染 */
export function isEventShapeValid(event) {
  if (!isPlainObject(event)) return false;
  if (typeof event.id !== 'string' || !event.id) return false;
  if (!Number.isInteger(event.sequence) || event.sequence < 0) return false;
  if (!PHASES.includes(event.phase)) return false;
  if (!Object.values(EVENT_TYPES).includes(event.type)) return false;
  if (!STATUSES.includes(event.status)) return false;
  if (!ACTORS.includes(event.actorId)) return false;
  if (typeof event.message !== 'string') return false;
  if (event.toolId !== null && event.toolId !== undefined && typeof event.toolId !== 'string') return false;
  if (event.sourceIds !== undefined && !Array.isArray(event.sourceIds)) return false;
  if (event.chunkIds !== undefined && !Array.isArray(event.chunkIds)) return false;
  return true;
}

/** 整次运行形状校验（恢复历史时使用） */
export function isRunShapeValid(run) {
  if (!isPlainObject(run)) return false;
  if (run.schemaVersion !== SIMULATION_SCHEMA_VERSION) return false;
  if (typeof run.runId !== 'string' || !run.runId) return false;
  if (typeof run.missionId !== 'string' || run.missionId !== 'mission-001-mini') return false;
  if (!Number.isInteger(run.missionVersion)) return false;
  if (!OUTCOMES.includes(run.outcome)) return false;
  if (!FAULT_MODES.includes(run.options?.faultMode)) return false;
  if (!Array.isArray(run.events) || run.events.length === 0 || run.events.length > 200) return false;
  if (!run.events.every(isEventShapeValid)) return false;
  if (!isPlainObject(run.artifacts)) return false;
  if (!isPlainObject(run.artifacts.payloads)) return false;
  if (!isPlainObject(run.configSnapshot)) return false;
  return true;
}

/* --------------------------- 历史记录读写 --------------------------- */

/** 历史记录封装：语义部分（run）之外只放非语义的本地元数据 */
export function serializeHistory(record) {
  return JSON.stringify({
    schemaVersion: SIMULATION_SCHEMA_VERSION,
    savedAt: record.savedAt || null,
    run: record.run,
  });
}

/**
 * 解析历史记录。任何异常都返回 `{ run: null, notice }`，
 * 由调用方以可读提示降级，不抛错、不白屏。
 */
export function parseHistory(raw) {
  if (raw === null || raw === undefined || raw === '') return { run: null, savedAt: null, notice: null };

  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return {
        run: null,
        savedAt: null,
        notice: {
          level: 'error',
          code: 'EXECUTION_STORAGE_CORRUPT',
          message: '本地运行记录无法解析，已忽略该记录（不影响已装配模块与开场偏好）',
          fix: '可重新运行一次模拟以覆盖该记录',
        },
      };
    }
  }

  if (!isPlainObject(data)) {
    return {
      run: null,
      savedAt: null,
      notice: {
        level: 'error',
        code: 'EXECUTION_STORAGE_SHAPE',
        message: '本地运行记录结构不符合预期，已忽略',
        fix: '可重新运行一次模拟以覆盖该记录',
      },
    };
  }

  if (data.schemaVersion !== SIMULATION_SCHEMA_VERSION) {
    return {
      run: null,
      savedAt: null,
      notice: {
        level: 'attention',
        code: 'EXECUTION_STORAGE_VERSION',
        message: `本地运行记录版本为 ${String(data.schemaVersion ?? '未知')}，与当前 schemaVersion ${SIMULATION_SCHEMA_VERSION} 不一致，已忽略`,
        fix: '可重新运行一次模拟以写入当前版本的记录',
      },
    };
  }

  if (!isRunShapeValid(data.run)) {
    return {
      run: null,
      savedAt: null,
      notice: {
        level: 'error',
        code: 'EXECUTION_STORAGE_INVALID',
        message: '本地运行记录的字段不合法（事件缺失或类型错误），已忽略该记录',
        fix: '历史轨迹不会被重算或猜测；可重新运行一次模拟',
      },
    };
  }

  return { run: data.run, savedAt: typeof data.savedAt === 'string' ? data.savedAt : null, notice: null };
}
