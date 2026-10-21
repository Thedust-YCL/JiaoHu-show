/**
 * src/features/atlas/state/learning.js
 * ------------------------------------------------------------------
 * 概念学习进度：**独立命名空间**，只记录「看过 / 展开过相关概念 / 做完过
 * 内嵌实验」这类学习状态，不写入构建器配置，也绝不影响模拟引擎的分支
 * （M0.3_TASK §9）。
 *
 * 单个概念用多个布尔标志组合，而不是一个枚举：这样「已经探索过、但还没
 * 完成实验、并且刚发现了一个相关概念」这种真实情况不会被压成一个标签
 * 而丢掉信息。界面上的 `label` 只是这些标志的**派生显示名**。
 *
 * 这不是测验成绩：没有任何分数、排名或对错判定。
 * ------------------------------------------------------------------
 */
import { CONCEPTS, CONCEPT_ORDER } from '../data/index.js';

export const LEARNING_STORAGE_KEY = 'agent-zero:learning:v1';
export const LEARNING_SCHEMA_VERSION = 1;

/** 学习状态显示名（由标志组合派生，不是唯一真相） */
export const LEARNING_LABELS = Object.freeze({
  unexplored: { id: 'unexplored', cn: '尚未查看', tone: 'muted' },
  exploring: { id: 'exploring', cn: '正在了解', tone: 'signal' },
  related_discovered: { id: 'related_discovered', cn: '已发现相关概念', tone: 'signal' },
  experiment_completed: { id: 'experiment_completed', cn: '已完成内嵌实验', tone: 'success' },
});

function emptyRecord() {
  return { explored: false, relatedDiscovered: false, experimentCompleted: false, visits: 0 };
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

/** 只接受已知 conceptId 与布尔标志：未知键被丢弃，损坏数据不影响其它概念 */
export function normalizeLearning(raw) {
  const concepts = {};
  const dropped = [];
  if (!raw || typeof raw !== 'object') return { concepts, dropped };
  const source = raw.concepts && typeof raw.concepts === 'object' ? raw.concepts : {};
  for (const [id, value] of Object.entries(source)) {
    if (!CONCEPTS[id]) {
      dropped.push({ reason: 'UNKNOWN_CONCEPT', value: id });
      continue;
    }
    if (!value || typeof value !== 'object') {
      dropped.push({ reason: 'INVALID_RECORD', value: id });
      continue;
    }
    concepts[id] = {
      explored: value.explored === true,
      relatedDiscovered: value.relatedDiscovered === true,
      experimentCompleted: value.experimentCompleted === true,
      visits: Number.isFinite(Number(value.visits)) ? Math.max(0, Math.floor(Number(value.visits))) : 0,
    };
  }
  return { concepts, dropped };
}

export function serializeLearning(state) {
  return JSON.stringify({ schemaVersion: LEARNING_SCHEMA_VERSION, concepts: state.concepts || {} });
}

export function parseLearning(raw) {
  if (raw === null || raw === undefined || raw === '') return { concepts: {}, dropped: [], notice: null };
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return {
        concepts: {},
        dropped: [],
        notice: { level: 'error', code: 'LEARNING_STORAGE_CORRUPT', message: '本地学习进度无法解析，已从零开始记录（不影响已装配模块与模拟记录）' },
      };
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { concepts: {}, dropped: [], notice: { level: 'error', code: 'LEARNING_STORAGE_SHAPE', message: '本地学习进度结构不符合预期，已忽略' } };
  }
  const { concepts, dropped } = normalizeLearning(data);
  let notice = null;
  if (data.schemaVersion !== LEARNING_SCHEMA_VERSION) {
    notice = { level: 'attention', code: 'LEARNING_STORAGE_VERSION', message: `本地学习进度版本为 ${String(data.schemaVersion ?? '未知')}，已按当前规则逐条校验后恢复` };
  } else if (dropped.length) {
    notice = { level: 'attention', code: 'LEARNING_STORAGE_PARTIAL', message: `学习进度中有 ${dropped.length} 条记录无法识别，已忽略这些记录` };
  }
  return { concepts, dropped, notice };
}

function safeStorage(storage) {
  if (storage) return storage;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * 学习进度 store：订阅 + 唯一写入点，与构建器 store 完全独立
 * （两者写入不同的命名空间，互不覆盖）。
 */
export function createLearningStore({ storage = null, key = LEARNING_STORAGE_KEY, onLog = null } = {}) {
  const store = safeStorage(storage);
  let raw = null;
  if (store) {
    try {
      raw = store.getItem(key);
    } catch {
      raw = null;
    }
  }
  const loaded = parseLearning(raw);
  let state = { schemaVersion: LEARNING_SCHEMA_VERSION, concepts: loaded.concepts };
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

  function emit(reason) {
    for (const fn of [...listeners]) fn(state, { reason });
  }

  function record(conceptId) {
    return state.concepts[conceptId] || emptyRecord();
  }

  function update(conceptId, patch, reason) {
    if (!CONCEPTS[conceptId]) {
      onLog?.('学习', `未知概念标识「${String(conceptId)}」，学习进度未变更`, 'attention');
      return false;
    }
    const current = record(conceptId);
    const next = { ...current, ...patch };
    if (
      next.explored === current.explored &&
      next.relatedDiscovered === current.relatedDiscovered &&
      next.experimentCompleted === current.experimentCompleted &&
      next.visits === current.visits
    ) {
      return false;
    }
    state = { ...state, concepts: { ...state.concepts, [conceptId]: next } };
    persist();
    emit(reason);
    return true;
  }

  return {
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** 打开某个概念：标记为「正在了解」 */
    markExplored: (conceptId) => update(conceptId, { explored: true, visits: record(conceptId).visits + 1 }, 'explored'),
    /** 从详情里点开相关概念：记录「已发现相关概念」 */
    markRelatedDiscovered: (conceptId) => update(conceptId, { explored: true, relatedDiscovered: true }, 'related'),
    /** 完成 Tool Calling 的内嵌实验：**不是测验成绩** */
    markExperimentCompleted: (conceptId) =>
      update(conceptId, { explored: true, experimentCompleted: true, visits: record(conceptId).visits + 1 }, 'experiment'),
    flagsOf: (conceptId) => record(conceptId),
    labelOf: (conceptId) => deriveLearningLabel(record(conceptId)),
    isExperimentCompleted: (conceptId) => record(conceptId).experimentCompleted === true,
    /** 概览统计：只统计首期 10 个概念 */
    summary() {
      let explored = 0;
      let experiments = 0;
      for (const id of CONCEPT_ORDER) {
        const r = state.concepts[id];
        if (r?.explored) explored += 1;
        if (r?.experimentCompleted) experiments += 1;
      }
      return { total: CONCEPT_ORDER.length, explored, experiments, unexplored: CONCEPT_ORDER.length - explored };
    },
    /** 清除学习进度：只影响本命名空间 */
    reset() {
      state = { schemaVersion: LEARNING_SCHEMA_VERSION, concepts: {} };
      if (store) {
        try {
          store.removeItem(key);
        } catch {
          /* 隐私模式：本次会话内仍然清空内存状态 */
        }
      }
      emit('reset');
    },
    notice: loaded.notice,
    readPersisted: () => {
      if (!store) return null;
      try {
        return parseLearning(store.getItem(key));
      } catch {
        return null;
      }
    },
  };
}
