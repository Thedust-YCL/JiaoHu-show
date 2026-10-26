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
import { migrateConfiguration, serializeAgentConfiguration, createConfiguration } from '../model/configuration.js';

export { CONSTRUCTOR_STORAGE_KEY, SCHEMA_VERSION };
const LEGACY_SCHEMA_VERSION=1;

/** 只序列化权威字段：瞬态 UI 状态（预览、拖动、选中）一律不落盘 */
export function serializeConfig(state) {
  if(state?.configId) { const {ui,...configuration}=state;return serializeAgentConfiguration(configuration); }
  return {
    schemaVersion: LEGACY_SCHEMA_VERSION,
    modules: (state?.modules || []).map((m) => ({
      moduleId: m.moduleId,
      portId: m.portId,
      enabled: m.enabled === true,
      permissions: { read: m.permissions?.read === true },
      settings: { ...(m.settings || {}) },
    })),
  };
}

export const LEGACY_CONSTRUCTOR_KEY='agent-zero:constructor:v1';
const MAX_REPOSITORY_CHARS=1800000;
/** Preserve malformed/forward-version raw data; writes remain locked until explicit recovery. */
export function readRepository(storage,key=CONSTRUCTOR_STORAGE_KEY) {
  const store=safeStorage(storage);let raw=null;
  const empty={draft:createConfiguration(),configurations:[],quarantined:[],blocked:false,raw:null,notice:null};
  if(!store)return empty;
  try {
    raw=store.getItem(key);
    if(!raw) {
      const old=store.getItem(LEGACY_CONSTRUCTOR_KEY);
      if(!old)return empty;
      raw=old;
      const migrated=migrateConfiguration(old);
      return {...empty,draft:migrated.configuration,migrationSource:LEGACY_CONSTRUCTOR_KEY,notice:{level:'attention',code:'STORAGE_VERSION',message:'已读取并迁移 M0.2 配置；原 v1 存储完整保留，已建立 v2 草稿，请保存具名快照'}};
    }
    if(raw.length>MAX_REPOSITORY_CHARS)throw Error('配置集合超过容量上限');
    const data=JSON.parse(raw);
    if(data?.schemaVersion===1&&Array.isArray(data.modules))return {...empty,draft:migrateConfiguration(data).configuration,notice:{level:'attention',code:'STORAGE_VERSION',message:'旧配置已迁移，原数据保留'}};
    if(data?.schemaVersion!==2||!data.draft||!Array.isArray(data.configurations)||data.configurations.length>20)throw Error('配置集合结构或版本不兼容');
    const draft=migrateConfiguration(data.draft).configuration;
    const configurations=[],quarantined=Array.isArray(data.quarantined)?data.quarantined:[];
    for(const entry of data.configurations) {
      try {const c=migrateConfiguration(entry).configuration;if(configurations.some(x=>x.configId===c.configId))throw Error('重复配置 ID');configurations.push(c);}
      catch {quarantined.push(entry);}
    }
    return {...empty,draft,configurations,quarantined,notice:quarantined.length?{level:'attention',code:'STORAGE_PARTIAL',message:`${quarantined.length} 条配置已隔离保留，其余可用；可下载恢复数据`}:null};
  }catch(error) {
    return {...empty,blocked:true,raw,notice:{level:'error',code:raw===null?'STORAGE_BLOCKED':'STORAGE_CORRUPT',message:`无法恢复构建器存储：${error.message}。原数据已锁定保留`,fix:'下载原数据后使用「备份并恢复存储」；不影响其他记录'}};
  }
}
export function writeRepository(storage,key,repository) {
  const store=safeStorage(storage);if(!store)return false;
  try {
    const data={schemaVersion:2,draft:serializeAgentConfiguration(repository.draft),configurations:repository.configurations.map(serializeAgentConfiguration),quarantined:repository.quarantined||[]};
    const raw=JSON.stringify(data);if(raw.length>MAX_REPOSITORY_CHARS)throw Error('配置集合超过容量上限');
    store.setItem(key,raw);return true;
  }catch{return false;}
}
export function backupRepository(storage,key,raw) {
  try {const store=safeStorage(storage);if(!store)return false;store.setItem(`${key}:recovery`,raw??'');return true;}catch{return false;}
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
  if (version !== LEGACY_SCHEMA_VERSION) {
    notice = {
      level: 'attention',
      code: 'STORAGE_VERSION',
      message: `旧工具配置版本为 ${String(version ?? '未知')}，与兼容读取版本 ${LEGACY_SCHEMA_VERSION} 不一致：已按旧工具规则逐条校验后恢复`,
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
