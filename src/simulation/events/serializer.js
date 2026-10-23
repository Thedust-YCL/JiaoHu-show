/**
 * src/simulation/events/serializer.js
 * ------------------------------------------------------------------
 * 运行结果与事件轨迹的序列化 / 反序列化 / 稳定标识派生。
 *
 * 关键要求（M0.3_TASK §7.2 / §7.4，M0.4_TASK §6.2 / §10.2）：
 *   · 事件内容不得包含 Date.now() / Math.random() 造成的差异；
 *   · runId 由「配置快照 + 任务版本 + 故障选项 + 研究策略」的内容 hash 派生，
 *     策略不同 → runId 不同，因此不同策略的产物不会被混为一谈；
 *   · schemaVersion 2 是本阶段产物；旧的 1 版记录仍然可读，但会被标记为
 *     legacy（只有执行轨迹、没有结构化报告），绝不替旧 Run 编造结论；
 *   · 任何损坏的本地数据都要安全降级为「没有历史记录 + 可读提示」，
 *     绝不抛出异常把整页拖垮（A28 / A66）。
 * ------------------------------------------------------------------
 */
import {
  ACTORS,
  EVIDENCE_POLICIES,
  EVENT_TYPES,
  FAULT_MODES,
  LEGACY_SCHEMA_VERSIONS,
  OUTCOMES,
  PHASES,
  SIMULATION_SCHEMA_VERSION,
  STATUSES,
} from './schema.js';
import { MISSION_IDS } from '../../research-packs/index.js';

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
 * runId = hash(任务标识 + 版本 + 配置快照 + 故障选项 + 研究策略)。
 * 不含时间：同一输入重复运行得到同一个 runId，这是可复现性的直接体现。
 */
export function deriveRunId({ missionId, missionVersion, configSnapshot, faultMode, evidencePolicy = 'VERIFY_REVISIONS' }) {
  const payload = canonicalize({
    missionId,
    missionVersion,
    faultMode,
    evidencePolicy,
    snapshot: configSnapshot,
  });
  return `run-${stableHash(payload)}`;
}

/* ----------------------------- 事件校验 ----------------------------- */

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function isStringArray(v) {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
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
  if (event.sourceIds !== undefined && !isStringArray(event.sourceIds)) return false;
  if (event.chunkIds !== undefined && !isStringArray(event.chunkIds)) return false;
  if (event.claimIds !== undefined && !isStringArray(event.claimIds)) return false;
  if (event.evidenceIds !== undefined && !isStringArray(event.evidenceIds)) return false;
  return true;
}

function hasValidEvents(run) {
  if (!Array.isArray(run.events) || run.events.length === 0 || run.events.length > 400) return false;
  return run.events.every(isEventShapeValid);
}

/** M0.4（schemaVersion 2）运行形状校验 */
export function isRunShapeValid(run) {
  if (!isPlainObject(run)) return false;
  if (run.schemaVersion !== SIMULATION_SCHEMA_VERSION) return false;
  if (typeof run.runId !== 'string' || !run.runId) return false;
  if (!MISSION_IDS.includes(run.missionId)) return false;
  if (!Number.isInteger(run.missionVersion)) return false;
  if (!OUTCOMES.includes(run.outcome)) return false;
  if (!FAULT_MODES.includes(run.options?.faultMode)) return false;
  if (!EVIDENCE_POLICIES.includes(run.options?.evidencePolicy)) return false;
  if (!hasValidEvents(run)) return false;
  if (!isPlainObject(run.artifacts)) return false;
  if (!isPlainObject(run.artifacts.payloads)) return false;
  if (!isPlainObject(run.artifacts.report)) return false;
  if (!isPlainObject(run.configSnapshot)) return false;
  return true;
}

/** M0.3（schemaVersion 1）运行形状校验：只用于读取旧记录，不会据此重算 */
export function isLegacyRunShapeValid(run) {
  if (!isPlainObject(run)) return false;
  if (!LEGACY_SCHEMA_VERSIONS.includes(run.schemaVersion)) return false;
  if (typeof run.runId !== 'string' || !run.runId) return false;
  if (!MISSION_IDS.includes(run.missionId)) return false;
  if (!Number.isInteger(run.missionVersion)) return false;
  if (!OUTCOMES.includes(run.outcome)) return false;
  if (!FAULT_MODES.includes(run.options?.faultMode)) return false;
  if (!hasValidEvents(run)) return false;
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

/** 各类降级提示集中定义，避免界面出现两套说法 */
function notice(level, code, message, fix) {
  return { level, code, message, fix };
}

/**
 * 解析历史记录。任何异常都返回 `{ run: null, notice }`，
 * 由调用方以可读提示降级，不抛错、不白屏。
 *
 * 返回值额外带 `legacy`：true 表示这是 M0.3 的历史轨迹，
 * 只有执行记录、没有结构化报告（A64）。
 */
export function parseHistory(raw) {
  if (raw === null || raw === undefined || raw === '') return { run: null, savedAt: null, legacy: false, notice: null };

  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return {
        run: null,
        savedAt: null,
        legacy: false,
        notice: notice('error', 'EXECUTION_STORAGE_CORRUPT', '本地运行记录无法解析，已忽略该记录（不影响已装配模块与开场偏好）', '可重新运行一次模拟以覆盖该记录'),
      };
    }
  }

  if (!isPlainObject(data)) {
    return {
      run: null,
      savedAt: null,
      legacy: false,
      notice: notice('error', 'EXECUTION_STORAGE_SHAPE', '本地运行记录结构不符合预期，已忽略', '可重新运行一次模拟以覆盖该记录'),
    };
  }

  /* ---------------- M0.3 旧记录：可读、可回放，但没有报告 ---------------- */
  if (LEGACY_SCHEMA_VERSIONS.includes(data.schemaVersion)) {
    if (!isLegacyRunShapeValid(data.run)) {
      return {
        run: null,
        savedAt: null,
        legacy: false,
        notice: notice('error', 'EXECUTION_STORAGE_INVALID', '本地运行记录的字段不合法（事件缺失或类型错误），已忽略该记录', '历史轨迹不会被重算或猜测；可重新运行一次模拟'),
      };
    }
    return {
      run: data.run,
      savedAt: typeof data.savedAt === 'string' ? data.savedAt : null,
      legacy: true,
      notice: notice(
        'attention',
        'EXECUTION_STORAGE_LEGACY',
        `读取到 M0.3 的历史运行（schemaVersion ${data.schemaVersion}）：只有执行轨迹，没有结构化报告`,
        '旧 Run 不会被新资料包补造结论；如需完整报告请发起一次新的 New Run'
      ),
    };
  }

  if (data.schemaVersion !== SIMULATION_SCHEMA_VERSION) {
    return {
      run: null,
      savedAt: null,
      legacy: false,
      notice: notice(
        'attention',
        'EXECUTION_STORAGE_VERSION',
        `本地运行记录版本为 ${String(data.schemaVersion ?? '未知')}，与当前 schemaVersion ${SIMULATION_SCHEMA_VERSION} 不一致，已忽略`,
        '可重新运行一次模拟以写入当前版本的记录'
      ),
    };
  }

  if (!isRunShapeValid(data.run)) {
    return {
      run: null,
      savedAt: null,
      legacy: false,
      notice: notice('error', 'EXECUTION_STORAGE_INVALID', '本地运行记录的字段不合法（事件缺失或类型错误），已忽略该记录', '历史轨迹不会被重算或猜测；可重新运行一次模拟'),
    };
  }

  return { run: data.run, savedAt: typeof data.savedAt === 'string' ? data.savedAt : null, legacy: false, notice: null };
}
