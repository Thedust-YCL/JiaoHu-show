/**
 * src/features/constructor/state/persistence.js
 * ------------------------------------------------------------------
 * 版本化本地持久化：只保存已确认的权威配置，绝不保存 Preview / Dragging /
 * 动画中间帧（M0.2_TASK §9）。
 *
 * storage 通过参数注入，便于在 Node 单元测试里替换为内存实现；
 * 这里不需要 IndexedDB，也不依赖任何网络请求。
 * ------------------------------------------------------------------
 */
import { CONSTRUCTOR_STORAGE_KEY, SCHEMA_VERSION, normalizeModules } from './reducer.js';

export { CONSTRUCTOR_STORAGE_KEY, SCHEMA_VERSION };

/** 只序列化权威字段：瞬态 UI 状态（预览、拖动、选中）一律不落盘 */
export function serializeConfig(state) {
  return {
    schemaVersion: SCHEMA_VERSION,
    modules: (state?.modules || []).map((m) => ({
      moduleId: m.moduleId,
      portId: m.portId,
      enabled: m.enabled === true,
      permissions: { read: m.permissions?.read === true },
      settings: { ...(m.settings || {}) },
    })),
  };
}

/**
 * 解析并校验本地数据。任何异常都优雅降级为「空白配置 + 可读提示」，
 * 不会抛错，也不会导致整站白屏（A19）。
 */
export function parseConfig(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return { modules: [], notice: null, dropped: [] };
  }

  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return {
        modules: [],
        dropped: [],
        notice: {
          level: 'error',
          code: 'STORAGE_CORRUPT',
          message: '本地构建器配置无法解析，已回退为空白配置（未影响开场偏好等其它本地数据）',
          fix: '可在检视面板底部执行「重置构建器」清理损坏数据',
        },
      };
    }
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      modules: [],
      dropped: [],
      notice: {
        level: 'error',
        code: 'STORAGE_SHAPE',
        message: '本地构建器配置的数据结构不符合预期，已回退为空白配置',
        fix: '可执行「重置构建器」重新开始',
      },
    };
  }

  const version = data.schemaVersion;
  const { modules, dropped } = normalizeModules(data.modules);

  let notice = null;
  if (version !== SCHEMA_VERSION) {
    notice = {
      level: 'attention',
      code: 'STORAGE_VERSION',
      message: `本地构建器配置版本为 ${String(version ?? '未知')}，与当前 schemaVersion ${SCHEMA_VERSION} 不一致：已按当前规则逐条校验后恢复`,
      fix: '如需彻底清理，可执行「重置构建器」',
    };
  } else if (dropped.length > 0) {
    notice = {
      level: 'attention',
      code: 'STORAGE_PARTIAL',
      message: `本地构建器配置中有 ${dropped.length} 条记录无法识别（${dropped.map((d) => `${d.reason}:${d.value}`).join('、')}），已忽略这些记录`,
      fix: '其余合法配置已正常恢复；可执行「重置构建器」清理',
    };
  }

  return { modules, dropped, notice };
}

function safeStorage(storage) {
  if (storage) return storage;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function readConfig(storage, key = CONSTRUCTOR_STORAGE_KEY) {
  const store = safeStorage(storage);
  if (!store) return { modules: [], dropped: [], notice: null };
  let raw = null;
  try {
    raw = store.getItem(key);
  } catch {
    return {
      modules: [],
      dropped: [],
      notice: { level: 'attention', code: 'STORAGE_BLOCKED', message: '浏览器拒绝了本地存储读取（可能处于隐私模式），本次以空白配置运行', fix: '装配与配置功能仍可正常使用，仅无法跨刷新恢复' },
    };
  }
  return parseConfig(raw);
}

export function writeConfig(storage, key, state) {
  const store = safeStorage(storage);
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(serializeConfig(state)));
    return true;
  } catch {
    // 配额或隐私模式：静默降级，不影响本次会话内的功能
    return false;
  }
}

export function clearConfig(storage, key = CONSTRUCTOR_STORAGE_KEY) {
  const store = safeStorage(storage);
  if (!store) return false;
  try {
    store.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
