/**
 * src/features/atlas/state/learning.js
 * ------------------------------------------------------------------
 * 概念学习进度（M1.1 起 schema v2）：**独立命名空间**，只记录「看过 /
 * 展开过相关概念 / 做完过真实存在的实验」这类学习状态，不写入构建器配置，
 * 也绝不影响模拟引擎的分支（M0.3_TASK §9 / M1.1_TASK D06）。
 *
 * 为什么用多个标志而不是一个枚举：
 *   真实情况是「已经探索过、但还没完成实验、并且刚发现了一个相关概念」，
 *   压成一个标签会丢信息。界面上的 `label` 只是这些标志的**派生显示名**。
 *
 * v2 相对 v1 的变化（必须非破坏性）：
 *   · 新增时间戳 visitedAt / lastViewedAt / experimentCompletedAt；
 *   · 新增 relatedDiscoveredIds（发现过哪些关联）与 experimentIds（完成过哪些实验）；
 *   · 新增 lastViewed（最后阅读的章节 / 概念），用于「继续上次的学习」；
 *   · 写入新键 agent-zero:learning:v2；**旧键原样保留**，只在读取时迁移，
 *     所以降级回旧版本时旧进度仍然可读；
 *   · 不认识的概念 ID 只丢弃该条记录，不会清空整个命名空间；
 *   · 仍不是测验成绩：没有分数、排名或对错判定。
 * ------------------------------------------------------------------
 */
import { CONCEPT_ORDER, conceptAvailability, getConcept } from '../../../knowledge/index.js';

export const LEARNING_STORAGE_KEY = 'agent-zero:learning:v2';
export const LEARNING_SCHEMA_VERSION = 2;
/** 旧版本键：只读迁移来源，永不删除、永不覆盖 */
export const LEGACY_LEARNING_KEYS = Object.freeze(['agent-zero:learning:v1']);

/** 学习状态显示名（由标志组合派生，不是唯一真相） */
export const LEARNING_LABELS = Object.freeze({
  unexplored: { id: 'unexplored', cn: '尚未查看', tone: 'muted' },
  exploring: { id: 'exploring', cn: '正在了解', tone: 'signal' },
  related_discovered: { id: 'related_discovered', cn: '已发现相关概念', tone: 'signal' },
  experiment_completed: { id: 'experiment_completed', cn: '已完成内嵌实验', tone: 'success' },
});

function emptyRecord() {
  return {
    explored: false,
    relatedDiscovered: false,
    experimentCompleted: false,
    visits: 0,
    visitedAt: null,
    lastViewedAt: null,
    experimentCompletedAt: null,
    relatedDiscoveredIds: [],
    experimentIds: [],
  };
}

/** 从标志组合派生显示名（优先级：实验完成 > 发现相关 > 查看过） */
export function deriveLearningLabel(record) {
  if (!record) return 'unexplored';
  if (record.experimentCompleted) return 'experiment_completed';
  if (record.relatedDiscovered) return 'related_discovered';
  if (record.explored) return 'exploring';
  return 'unexplored';
}

export function learningLabelMeta(label) {
  return LEARNING_LABELS[label] || LEARNING_LABELS.unexplored;
}

/** 时间戳只接受有限数字（毫秒），其它一律归零而不是丢弃整条记录 */
function normalizeTimestamp(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    if (!getConcept(item)) continue;
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

/** 单条记录规范化：只保留已知字段，损坏字段回到安全默认值 */
function normalizeRecord(value) {
  const explored = value.explored === true;
  const relatedDiscovered = value.relatedDiscovered === true;
  const experimentCompleted = value.experimentCompleted === true;
  const visitedAt = normalizeTimestamp(value.visitedAt);
  const lastViewedAt = normalizeTimestamp(value.lastViewedAt);
  const experimentCompletedAt = normalizeTimestamp(value.experimentCompletedAt);
  return {
    explored,
    relatedDiscovered,
    experimentCompleted,
    visits: Number.isFinite(Number(value.visits)) ? Math.max(0, Math.floor(Number(value.visits))) : 0,
    visitedAt: visitedAt ?? lastViewedAt ?? null,
    lastViewedAt: lastViewedAt ?? visitedAt ?? null,
    experimentCompletedAt,
    relatedDiscoveredIds: normalizeIdList(value.relatedDiscoveredIds),
    experimentIds: Array.isArray(value.experimentIds) ? value.experimentIds.filter((id) => typeof id === 'string') : [],
  };
}

/**
 * 只接受已知 conceptId：未知键被丢弃（并记录原因），
 * 损坏的单个条目不会影响其它概念，也不清空整个命名空间。
 */
export function normalizeLearning(raw) {
  const concepts = {};
  const dropped = [];
  if (!raw || typeof raw !== 'object') return { concepts, dropped };
  const source = raw.concepts && typeof raw.concepts === 'object' ? raw.concepts : {};
  for (const [id, value] of Object.entries(source)) {
    if (!getConcept(id)) {
      // 未完成章节 / 已下线概念：保留可读提示，但不写入
      dropped.push({ reason: 'UNKNOWN_CONCEPT', value: id });
      continue;
    }
    if (!value || typeof value !== 'object') {
      dropped.push({ reason: 'INVALID_RECORD', value: id });
      continue;
    }
    concepts[id] = normalizeRecord(value);
  }
  return { concepts, dropped };
}

/** 最后阅读位置：只保留已知概念，章节由概念派生，避免记录指向不存在的章节 */
function normalizeLastViewed(value) {
  if (!value || typeof value !== 'object') return null;
  const concept = getConcept(value.conceptId);
  if (!concept) return null;
  return {
    conceptId: concept.id,
    chapterId: concept.chapterId,
    at: normalizeTimestamp(value.at),
  };
}

export function serializeLearning(state) {
  return JSON.stringify({
    schemaVersion: LEARNING_SCHEMA_VERSION,
    concepts: state.concepts || {},
    lastViewed: state.lastViewed || null,
  });
}

/**
 * 解析存储内容（纯函数）：
 *   · 空 → 全新状态；
 *   · 结构错误 / 无法解析 → 从零开始 + 可读提示（不抛出）；
 *   · 旧版 schema → 逐条迁移，保留全部可用标志，并提示已迁移。
 */
export function parseLearning(raw) {
  const empty = { schemaVersion: LEARNING_SCHEMA_VERSION, concepts: {}, lastViewed: null, dropped: [], notice: null, migratedFrom: null };
  if (raw === null || raw === undefined || raw === '') return empty;

  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return {
        ...empty,
        notice: { level: 'error', code: 'LEARNING_STORAGE_CORRUPT', message: '本地学习进度无法解析，已从零开始记录（不影响已装配模块与模拟记录）' },
      };
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      ...empty,
      notice: { level: 'error', code: 'LEARNING_STORAGE_SHAPE', message: '本地学习进度结构不符合预期，已忽略' },
    };
  }

  const { concepts, dropped } = normalizeLearning(data);
  const lastViewed = normalizeLastViewed(data.lastViewed);
  const version = data.schemaVersion;
  let notice = null;

  if (version !== LEARNING_SCHEMA_VERSION) {
    const fromV1 = version === 1 || version === '1' || version === undefined;
    notice = {
      level: 'attention',
      code: fromV1 ? 'LEARNING_STORAGE_MIGRATED' : 'LEARNING_STORAGE_VERSION',
      message: fromV1
        ? `本地学习进度来自旧版（v${String(version ?? '1')}）：已逐条迁移到 v${LEARNING_SCHEMA_VERSION}，原有「看过 / 发现关联 / 完成实验」标志全部保留，旧数据未被删除`
        : `本地学习进度版本为 ${String(version ?? '未知')}，已按当前规则逐条校验后恢复`,
    };
  } else if (dropped.length) {
    notice = { level: 'attention', code: 'LEARNING_STORAGE_PARTIAL', message: `学习进度中有 ${dropped.length} 条记录无法识别，已忽略这些记录` };
  }

  return {
    schemaVersion: LEARNING_SCHEMA_VERSION,
    concepts,
    lastViewed,
    dropped,
    notice,
    migratedFrom: version !== LEARNING_SCHEMA_VERSION ? `v${String(version ?? '1')}` : null,
  };
}

function safeStorage(storage) {
  if (storage) return storage;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** 读取旧命名空间（只读）：找第一个存在且可解析的旧键 */
function readLegacy(store, legacyKeys) {
  if (!store) return null;
  for (const key of legacyKeys) {
    let raw = null;
    try {
      raw = store.getItem(key);
    } catch {
      raw = null;
    }
    if (raw === null || raw === undefined || raw === '') continue;
    return { key, raw };
  }
  return null;
}

/**
 * 学习进度 store：订阅 + 唯一写入点，与构建器 store 完全独立
 * （两者写入不同的命名空间，互不覆盖）。
 */
export function createLearningStore({
  storage = null,
  key = LEARNING_STORAGE_KEY,
  legacyKeys = LEGACY_LEARNING_KEYS,
  onLog = null,
  now = () => Date.now(),
} = {}) {
  const store = safeStorage(storage);

  let raw = null;
  if (store) {
    try {
      raw = store.getItem(key);
    } catch {
      raw = null;
    }
  }

  let migrated = null;
  if (raw === null || raw === undefined || raw === '') {
    const legacy = readLegacy(store, legacyKeys);
    if (legacy) {
      raw = legacy.raw;
      migrated = legacy.key;
    }
  }

  const loaded = parseLearning(raw);
  let state = {
    schemaVersion: LEARNING_SCHEMA_VERSION,
    concepts: loaded.concepts,
    lastViewed: loaded.lastViewed,
  };
  const listeners = new Set();

  function persist() {
    if (!store) return false;
    try {
      store.setItem(key, serializeLearning(state));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 迁移落盘：只有确实从旧键读到数据时才写新键。
   * 旧键**不删除、不改写**，因此降级回旧版本时旧进度仍然完整可读。
   */
  if (migrated) persist();

  function emit(reason) {
    for (const fn of [...listeners]) fn(state, { reason });
  }

  function record(conceptId) {
    return state.concepts[conceptId] || emptyRecord();
  }

  function sameRecord(a, b) {
    return (
      a.explored === b.explored &&
      a.relatedDiscovered === b.relatedDiscovered &&
      a.experimentCompleted === b.experimentCompleted &&
      a.visits === b.visits &&
      a.visitedAt === b.visitedAt &&
      a.lastViewedAt === b.lastViewedAt &&
      a.experimentCompletedAt === b.experimentCompletedAt &&
      a.relatedDiscoveredIds.length === b.relatedDiscoveredIds.length &&
      a.experimentIds.length === b.experimentIds.length
    );
  }

  /**
   * 唯一写入点：更新某个概念的记录，可选同步「最后阅读位置」。
   * 未变化时不写盘、不发通知，避免无意义的重复持久化。
   */
  function update(conceptId, patch, reason, { touch = false, at = null } = {}) {
    const concept = getConcept(conceptId);
    if (!concept) {
      onLog?.('学习', `未知概念标识「${String(conceptId)}」，学习进度未变更`, 'attention');
      return false;
    }
    const current = record(conceptId);
    const next = { ...current, ...patch };
    const recordChanged = !sameRecord(current, next);
    const viewedChanged =
      touch && (state.lastViewed?.conceptId !== conceptId || state.lastViewed?.at !== at);
    if (!recordChanged && !viewedChanged) return false;
    state = {
      ...state,
      concepts: recordChanged ? { ...state.concepts, [conceptId]: next } : state.concepts,
      lastViewed: touch ? { conceptId, chapterId: concept.chapterId, at } : state.lastViewed,
    };
    persist();
    emit(reason);
    return recordChanged;
  }

  /** 打开某个概念：标记「正在了解」并记录阅读位置（不代表学完） */
  function markExplored(conceptId) {
    const current = record(conceptId);
    const at = now();
    return update(
      conceptId,
      { explored: true, visits: current.visits + 1, visitedAt: current.visitedAt ?? at, lastViewedAt: at },
      'explored',
      { touch: true, at }
    );
  }

  /** 从详情里点开相关概念：记录「已发现关联」以及发现了哪个概念 */
  function markRelatedDiscovered(conceptId, discoveredId = null) {
    const current = record(conceptId);
    const ids = [...current.relatedDiscoveredIds];
    if (discoveredId && getConcept(discoveredId) && discoveredId !== conceptId && !ids.includes(discoveredId)) ids.push(discoveredId);
    return update(conceptId, { explored: true, relatedDiscovered: true, relatedDiscoveredIds: ids }, 'related');
  }

  /**
   * 完成内嵌实验：**只对真实存在且已开放的实验生效**。
   * 概念若没有可用实验（例如仅有索引的概念），调用会被拒绝并给出可读提示，
   * 避免界面把「看过说明」误记成「完成实验」。
   */
  function markExperimentCompleted(conceptId, experimentId = null) {
    const concept = getConcept(conceptId);
    if (!concept) {
      onLog?.('学习', `未知概念标识「${String(conceptId)}」，学习进度未变更`, 'attention');
      return false;
    }
    const availability = conceptAvailability(conceptId);
    const experiment = availability.experiment;
    if (!availability.canRunExperiment || !experiment) {
      onLog?.(
        '学习',
        `${concept.cn} 当前没有可用实验（${availability.statusMeta.cn}），未记录「已完成实验」`,
        'attention'
      );
      return false;
    }
    const id = experimentId || experiment.id;
    const at = now();
    const current = record(conceptId);
    const experimentIds = current.experimentIds.includes(id) ? current.experimentIds : [...current.experimentIds, id];
    return update(
      conceptId,
      {
        explored: true,
        experimentCompleted: true,
        experimentCompletedAt: current.experimentCompletedAt ?? at,
        lastViewedAt: at,
        visits: current.visits + 1,
        experimentIds,
      },
      'experiment'
    );
  }

  return {
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    markExplored,
    markRelatedDiscovered,
    markExperimentCompleted,
    flagsOf: (conceptId) => record(conceptId),
    labelOf: (conceptId) => deriveLearningLabel(record(conceptId)),
    isExperimentCompleted: (conceptId) => record(conceptId).experimentCompleted === true,
    /** 最后阅读的知识节点 / 章节（继续上次学习用；没有记录返回 null） */
    lastViewed: () => state.lastViewed,
    /** 概览统计：分母是全部 36 个概念，分子只统计真实记录 */
    summary() {
      let explored = 0;
      let experiments = 0;
      let related = 0;
      for (const id of CONCEPT_ORDER) {
        const r = state.concepts[id];
        if (r?.explored) explored += 1;
        if (r?.experimentCompleted) experiments += 1;
        if (r?.relatedDiscovered) related += 1;
      }
      return {
        total: CONCEPT_ORDER.length,
        explored,
        experiments,
        related,
        unexplored: CONCEPT_ORDER.length - explored,
      };
    },
    /** 清除学习进度：只影响本命名空间（旧键保持不动，可继续作为回退备份） */
    reset() {
      state = { schemaVersion: LEARNING_SCHEMA_VERSION, concepts: {}, lastViewed: null };
      if (store) {
        try {
          store.removeItem(key);
        } catch {
          /* 隐私模式：本次会话内仍然清空内存状态 */
        }
      }
      emit('reset');
    },
    /** 迁移来源（旧键名）；没有迁移时为 null */
    migratedFrom: migrated,
    notice: loaded.notice,
    readPersisted: () => {
      if (!store) return null;
      try {
        return parseLearning(store.getItem(key));
      } catch {
        return null;
      }
    },
    /** 旧命名空间的只读快照：用于自检脚本确认「旧数据没被删」 */
    readLegacy: () => {
      if (!store) return null;
      const legacy = readLegacy(store, legacyKeys);
      return legacy ? { key: legacy.key, parsed: parseLearning(legacy.raw) } : null;
    },
  };
}
