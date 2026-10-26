/**
 * src/features/laboratory/knowledge/memory.js
 * ------------------------------------------------------------------
 * Lab 04 · Memory（M1.3 D04 / §5.6，验收 A15）。
 *
 * 设计要点：
 *   · 记忆是**独立命名空间**（agent-zero:lab-knowledge:v1），与学习进度
 *     （agent-zero:learning:v2）、装配配置、研究运行记录完全分开；
 *   · 只有用户显式点「保存」才会写入：不自动把检索结果当记忆；
 *   · 每条记录必须带类别与来源说明，最多 6 条，可单条删除、可整体清除；
 *   · 读取时逐条校验：损坏或未知类别的条目被丢弃，绝不清空整个命名空间；
 *   · 纯逻辑 + 可注入 storage，Node 测试可用内存实现直接验证。
 * ------------------------------------------------------------------
 */

export const LAB_MEMORY_KEY = 'agent-zero:lab-knowledge:v1';
export const LAB_MEMORY_SCHEMA_VERSION = 1;
export const MAX_MEMORY_ENTRIES = 6;
export const MAX_VALUE_LENGTH = 120;

export const MEMORY_KINDS = Object.freeze([
  Object.freeze({ id: 'focus', cn: '关注点', hint: '例如「关心日期冲突」' }),
  Object.freeze({ id: 'preference', cn: '输出偏好', hint: '例如「先给表格再给结论」' }),
  Object.freeze({ id: 'history', cn: '历史摘要', hint: '例如「上次查到两份招聘会公告日期不一致」' }),
]);

export function memoryKind(kindId) {
  return MEMORY_KINDS.find((k) => k.id === kindId) || null;
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  const kind = memoryKind(raw.kind);
  if (!kind) return null;
  const value = typeof raw.value === 'string' ? raw.value.trim() : '';
  if (!value) return null;
  return {
    id: raw.id,
    kind: kind.id,
    kindCn: kind.cn,
    value: value.slice(0, MAX_VALUE_LENGTH),
    createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : null,
    /** 来源说明：记忆不是检索结果，这里如实写清它是用户手动保存的 */
    origin: typeof raw.origin === 'string' && raw.origin ? raw.origin : '用户手动保存',
  };
}

export function parseMemory(raw) {
  const empty = { entries: [], dropped: [], notice: null };
  if (raw === null || raw === undefined || raw === '') return empty;
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return {
        ...empty,
        notice: { level: 'error', code: 'LAB_MEMORY_CORRUPT', message: '本地记忆无法解析：已按空记忆处理（不影响学习进度与实验设置）' },
      };
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      ...empty,
      notice: { level: 'error', code: 'LAB_MEMORY_SHAPE', message: '本地记忆结构不符合预期：已忽略' },
    };
  }
  const list = Array.isArray(data.entries) ? data.entries : [];
  const entries = [];
  const dropped = [];
  for (const item of list) {
    const entry = normalizeEntry(item);
    if (!entry) {
      dropped.push({ reason: 'INVALID_ENTRY' });
      continue;
    }
    if (entries.some((e) => e.id === entry.id)) {
      dropped.push({ reason: 'DUPLICATE_ID', value: entry.id });
      continue;
    }
    if (entries.length >= MAX_MEMORY_ENTRIES) {
      dropped.push({ reason: 'OVER_LIMIT', value: entry.id });
      continue;
    }
    entries.push(entry);
  }
  const notice =
    data.schemaVersion !== LAB_MEMORY_SCHEMA_VERSION
      ? { level: 'attention', code: 'LAB_MEMORY_MIGRATED', message: `本地记忆版本为 ${String(data.schemaVersion)}：已逐条校验并保留可用条目` }
      : dropped.length
        ? { level: 'attention', code: 'LAB_MEMORY_PARTIAL', message: `有 ${dropped.length} 条记忆无法识别，已忽略` }
        : null;
  return { entries, dropped, notice };
}

export function serializeMemory(entries) {
  return JSON.stringify({ schemaVersion: LAB_MEMORY_SCHEMA_VERSION, entries });
}

function nextId(entries) {
  let max = 0;
  for (const entry of entries) {
    const match = /^mem-(\d+)$/.exec(entry.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `mem-${max + 1}`;
}

/**
 * 记忆 store：唯一写入点，与其它命名空间互不影响。
 */
export function createMemoryStore({ storage = null, key = LAB_MEMORY_KEY, now = () => Date.now() } = {}) {
  let store = storage;
  if (!store) {
    try {
      store = typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      store = null;
    }
  }

  let raw = null;
  if (store) {
    try {
      raw = store.getItem(key);
    } catch {
      raw = null;
    }
  }
  const parsed = parseMemory(raw);
  let entries = parsed.entries;

  function persist() {
    if (!store) return false;
    try {
      store.setItem(key, serializeMemory(entries));
      return true;
    } catch {
      return false;
    }
  }

  return {
    /** 当前记忆条目（只读副本） */
    list: () => entries.map((entry) => ({ ...entry })),
    count: () => entries.length,
    /** 显式保存一条记忆：返回 {ok, entry, reason} */
    save(rawValues = {}) {
      const kind = memoryKind(rawValues.kind);
      const value = String(rawValues.value ?? '').trim().slice(0, MAX_VALUE_LENGTH);
      if (!kind) return { ok: false, reason: 'UNKNOWN_KIND', message: '请选择记忆类别（关注点 / 输出偏好 / 历史摘要）' };
      if (!value) return { ok: false, reason: 'EMPTY_VALUE', message: '记忆内容不能为空' };
      if (entries.length >= MAX_MEMORY_ENTRIES) {
        return { ok: false, reason: 'OVER_LIMIT', message: `最多保存 ${MAX_MEMORY_ENTRIES} 条记忆，请先删除旧条目` };
      }
      const entry = {
        id: nextId(entries),
        kind: kind.id,
        kindCn: kind.cn,
        value,
        createdAt: now(),
        origin: rawValues.origin || '用户手动保存',
      };
      entries = [...entries, entry];
      persist();
      return { ok: true, entry: { ...entry } };
    },
    remove(id) {
      const before = entries.length;
      entries = entries.filter((entry) => entry.id !== id);
      if (entries.length === before) return false;
      persist();
      return true;
    },
    clearAll() {
      const had = entries.length;
      entries = [];
      if (store) {
        try {
          store.removeItem(key);
        } catch {
          /* 隐私模式：至少清空内存状态 */
        }
      }
      return had;
    },
    notice: parsed.notice,
    dropped: parsed.dropped,
    /** 自检脚本用：确认真的写进了独立命名空间 */
    readPersisted() {
      if (!store) return null;
      try {
        return parseMemory(store.getItem(key));
      } catch {
        return null;
      }
    },
    storageKey: key,
  };
}
