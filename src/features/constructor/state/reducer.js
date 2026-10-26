/**
 * src/features/constructor/state/reducer.js
 * ------------------------------------------------------------------
 * 装配状态的**唯一权威转换器**：纯函数、无副作用、不接触 DOM / Three.js /
 * localStorage。用户输入 → 校验 → 状态更新 只在这里发生一次，动画与渲染
 * 只订阅结果，不能反向决定业务数据（M0.2_TASK §4.1）。
 *
 * 数据分两层：
 *   · modules —— Persisted Configuration（权威，会落盘）
 *   · ui      —— Assembly UI Session（瞬态：预览、拖动、选中、提示，不落盘）
 * ------------------------------------------------------------------
 */
import { defaultPermissions, defaultSettings, getModule, getPort } from '../model/modules.js';
import { applyPatch, deriveStatus, isStructuralError, validateConnection, validateModuleConfig } from '../model/validation.js';
import { createConfiguration, createInstance, DEFAULT_RUNTIME } from '../model/configuration.js';

export const SCHEMA_VERSION = 2;

/** 持久化命名空间键（M0.2_TASK §9） */
export const CONSTRUCTOR_STORAGE_KEY = 'agent-zero:constructor:v2';

export function createInitialUi() {
  return {
    /** Inspector 当前编辑的模块实例 */
    selectedModuleId: null,
    /** 点击装配的预览态：{ moduleId, portId } */
    preview: null,
    /** 引导拖拽态：{ moduleId, targetPortId, valid, message } */
    drag: null,
    /** 最近一次操作结果（供界面提示与 aria-live 播报） */
    notice: null,
    /** 每次状态变化自增，用于可靠的订阅通知与动画触发 */
    revision: 0,
  };
}

export function createInitialState() {
  return { ...createConfiguration(), ui: createInitialUi() };
}

function withUi(state, uiPatch, notice) {
  const ui = { ...state.ui, ...uiPatch, revision: state.ui.revision + 1 };
  if (notice !== undefined) ui.notice = notice;
  return { ...state, ui };
}

/** 只更新提示，不触碰权威配置 */
function noticeOnly(state, notice, uiPatch = {}) {
  return withUi(state, uiPatch, notice);
}

function findIndex(modules, moduleId) {
  return modules.findIndex((m) => m.moduleId === moduleId);
}

/**
 * 纯转换函数。返回值引用变化即表示状态确实改变；
 * 返回原 state 表示该动作被拒绝或没有实际影响。
 */
export function reduce(state, action) {
  switch (action?.type) {
    /* ---------------- 点击装配：预览 → 确认 ---------------- */
    case 'assembly/preview': {
      const mod = getModule(action.moduleId);
      const portId = action.portId || mod?.portId;
      const check = validateConnection(action.moduleId, portId);
      if (!check.ok) return noticeOnly(state, { level: 'error', ...check });
      if (findIndex(state.modules, action.moduleId) >= 0) {
        return noticeOnly(state, {
          level: 'attention',
          code: 'ALREADY_INSTALLED',
          message: `${mod.cn}已经装配，不重复添加`,
          fix: '已定位到现有实例，可直接查看配置、禁用或移除',
        }, { selectedModuleId: action.moduleId });
      }
      const occupant = state.modules.find((m) => m.portId === portId);
      if (occupant) {
        const other = getModule(occupant.moduleId);
        return noticeOnly(state, {
          level: 'attention',
          code: 'PORT_OCCUPIED',
          message: `${getPort(portId).cn}（${portId}）已被 ${other ? other.cn : occupant.moduleId} 占用`,
          fix: '请先移除已占用的模块，或选择其它兼容接口',
        });
      }
      return noticeOnly(state, { level: 'info', code: 'PREVIEW', message: `预览：${mod.cn} → ${getPort(portId).cn}（${portId}）`, fix: '确认装配或取消' }, {
        preview: { moduleId: action.moduleId, portId },
        // 预览时 Inspector 直接展示该模块的简介、目标接口与确认 / 取消入口
        selectedModuleId: action.moduleId,
      });
    }

    case 'assembly/cancel': {
      if (!state.ui.preview) return state;
      const mod = getModule(state.ui.preview.moduleId);
      return noticeOnly(state, { level: 'info', code: 'PREVIEW_CANCELLED', message: `已取消${mod ? mod.cn : ''}的装配预览，未写入任何配置` }, { preview: null });
    }

    case 'assembly/commit': {
      const pending = state.ui.preview;
      const moduleId = action.moduleId || pending?.moduleId;
      const portId = action.portId || pending?.portId || getModule(moduleId)?.portId;
      // 没有待确认的预览时不产生任何副作用：连点、动画被中断或视图切换都不会误提交
      if (!moduleId) return state;
      const check = validateConnection(moduleId, portId);
      if (!check.ok) return noticeOnly(state, { level: 'error', ...check }, { preview: null });
      const mod = getModule(moduleId);
      if (findIndex(state.modules, moduleId) >= 0) {
        return noticeOnly(state, {
          level: 'attention',
          code: 'ALREADY_INSTALLED',
          message: `${mod.cn}已经装配，本次确认被忽略（不产生重复实例）`,
          fix: '已定位到现有实例',
        }, { preview: null, selectedModuleId: moduleId });
      }
      const occupant = state.modules.find((m) => m.portId === portId);
      if (occupant) {
        return noticeOnly(state, {
          level: 'attention',
          code: 'PORT_OCCUPIED',
          message: `${getPort(portId).cn}已被占用，本次确认被拒绝`,
          fix: '请先移除已占用的模块',
        }, { preview: null });
      }
      const installed = createInstance(moduleId, Math.max(-1,...state.modules.map(m=>Number.isInteger(m?.order)?m.order:-1))+1, action.instanceId);
      return withUi(
        { ...state, modules: [...state.modules, installed] },
        { preview: null, selectedModuleId: moduleId },
        {
          level: 'signal',
          code: 'ASSEMBLED',
          message: `${mod.cn}已装配到 ${portId}（连接关系已建立，非模拟 API 请求成功）`,
          fix: mod.moduleType==='tools' ? '尚未授予只读模拟权限，模块当前为 Unconfigured' : '在 Inspector 配置后查看预检',
        }
      );
    }

    /* ---------------- 配置：保存、禁用、移除 ---------------- */
    case 'module/configure': {
      const index = findIndex(state.modules, action.moduleId);
      if (index < 0) return state;
      const current = state.modules[index];
      const mod = getModule(action.moduleId);
      const { settings, permissions } = applyPatch(action.moduleId, current, action.patch);
      const rootSettings={...state.settings};
      for(const field of mod.fields.filter(f=>f.scope==='root'))if(Object.hasOwn(action.patch||{},field.key))rootSettings[field.key]=field.numeric ? Number(action.patch[field.key]) : action.patch[field.key];
      const check = validateModuleConfig(action.moduleId, action.moduleId==='runtime'?rootSettings:settings, permissions);
      if(mod.fields.some(f=>f.scope==='root'))check.errors.push(...validateModuleConfig('runtime',rootSettings,{}).errors);
      const structural = check.errors.filter(isStructuralError);
      if (structural.length > 0) {
        // 拒绝写入非法值：已有合法配置不被局部破坏（M0.2_TASK §7.2）
        return noticeOnly(state, {
          level: 'error',
          code: 'INVALID_CONFIG',
          moduleId: action.moduleId,
          message: structural[0].message,
          field: structural[0].field,
          fix: structural[0].fix,
          errors: structural,
        });
      }
      const modules = [...state.modules];
      modules[index] = { ...current, settings, permissions };
      const status = deriveStatus(modules[index],{...state,settings:rootSettings});
      const permissionErrors = check.errors.filter((e) => !isStructuralError(e));
      return withUi(
        { ...state, modules, settings:rootSettings },
        { selectedModuleId: action.moduleId },
        {
          level: status === 'Ready' ? 'success' : 'info',
          code: 'CONFIG_SAVED',
          message: `${mod.cn}草稿已更新 · 当前状态 ${status}`,
          fix: permissionErrors.length ? permissionErrors[0].fix : undefined,
        }
      );
    }

    case 'module/toggle': {
      const index = findIndex(state.modules, action.moduleId);
      if (index < 0) return state;
      const current = state.modules[index];
      const mod = getModule(action.moduleId)||{cn:action.moduleId};
      const enabled = typeof action.enabled === 'boolean' ? action.enabled : current.enabled !== true;
      if (enabled === current.enabled) return state;
      const modules = [...state.modules];
      modules[index] = { ...current, enabled };
      const status = deriveStatus(modules[index],state);
      let message = `${mod.cn}已${enabled ? '重新启用' : '禁用'}`;
      let fix;
      if (enabled) {
        if (status === 'Unconfigured') {
          message += ' · 重新校验未通过，仍为 Unconfigured';
          fix = '请补全参数或授予只读模拟权限';
        } else if (status === 'Invalid') {
          message += ' · 重新校验未通过，配置非法';
          fix = '请按字段提示修复后再次保存';
        } else {
          message += ' · 重新校验通过，状态 Ready';
        }
      } else {
        message += ' · 结构继续在位，仅连接关系不再活跃';
      }
      const connections=(state.connections||[]).map(e=>e&&(e.sourceInstanceId===current.instanceId||e.targetInstanceId===current.instanceId)&&!enabled?{...e,enabled:false}:e);
      return withUi({ ...state, modules, connections }, { selectedModuleId: action.moduleId }, { level: enabled && status === 'Ready' ? 'success' : 'attention', code: 'TOGGLED', message, fix });
    }

    case 'module/remove': {
      const mod = getModule(action.moduleId);
      const index = findIndex(state.modules, action.moduleId);
      if (index < 0) return state;
      const removed = state.modules[index];
      const modules = state.modules.filter((_, i) => i !== index);
      // 移除必须清理所有指向该实例的交互引用，Inspector 不得再指向不存在的实例
      const uiPatch = {
        selectedModuleId: state.ui.selectedModuleId === action.moduleId ? null : state.ui.selectedModuleId,
        preview: state.ui.preview?.moduleId === action.moduleId ? null : state.ui.preview,
        drag: state.ui.drag?.moduleId === action.moduleId ? null : state.ui.drag,
      };
      const connections=(state.connections||[]).filter(e=>!e||(e.sourceInstanceId!==removed.instanceId&&e.targetInstanceId!==removed.instanceId));
      return withUi({ ...state, modules, connections }, uiPatch, {
        level: 'attention',
        code: 'REMOVED',
        message: `${mod ? mod.cn : action.moduleId}已移除 · 接口 ${removed.portId}（${getPort(removed.portId)?.cn || ''}）已释放`,
        fix: '重新添加将视为新一次装配',
      });
    }

    case 'module/reset': {
      if (state.modules.length === 0 && !state.ui.preview && !state.ui.drag && !state.connections?.length && JSON.stringify(state.settings)===JSON.stringify(DEFAULT_RUNTIME)) return state;
      return withUi({ ...state, modules: [], connections:[],settings:{...DEFAULT_RUNTIME} }, { preview: null, drag: null, selectedModuleId: null }, {
        level: 'attention',
        code: 'RESET',
        message: '构建器已重置：全部模块实例与接口占用已清空（不影响开场偏好等其它本地数据）',
      });
    }

    /* ---------------- 选中与瞬态交互 ---------------- */
    case 'select': {
      const moduleId = action.moduleId || null;
      if (state.ui.selectedModuleId === moduleId) return state;
      return withUi(state, { selectedModuleId: moduleId });
    }

    case 'drag/start': {
      const mod = getModule(action.moduleId);
      const check = validateConnection(action.moduleId, mod?.portId);
      if (!check.ok) return noticeOnly(state, { level: 'error', ...check });
      return withUi(state, {
        drag: { moduleId: action.moduleId, targetPortId: null, valid: false, message: `拖拽中：把${mod.cn}拖到${getPort(mod.portId)?.cn || ''}` },
      });
    }

    case 'drag/target': {
      if (!state.ui.drag) return state;
      const drag = state.ui.drag;
      if (drag.targetPortId === (action.portId || null) && drag.valid === !!action.valid && drag.message === action.message) return state;
      return withUi(state, { drag: { ...drag, targetPortId: action.portId || null, valid: !!action.valid, message: action.message || '' } });
    }

    case 'drag/end': {
      const drag = state.ui.drag;
      if (!drag) return state;
      if (action.commit && action.portId) {
        const check = validateConnection(drag.moduleId, action.portId);
        if (check.ok) {
          // 拖拽提交与点击确认共用同一套校验与装配逻辑
          const committed = reduce({ ...state, ui: { ...state.ui, preview: { moduleId: drag.moduleId, portId: action.portId } } }, { type: 'assembly/commit' });
          return withUi(committed, { drag: null });
        }
        return withUi(state, { drag: null }, { level: 'error', ...check });
      }
      return withUi(state, { drag: null }, {
        level: 'info',
        code: 'DRAG_CANCELLED',
        message: `${getModule(drag.moduleId)?.cn || ''}的拖拽已取消，配置未变更`,
      });
    }

    case 'notice/clear':
      if (!state.ui.notice) return state;
      return withUi(state, {}, null);

    /* ---------------- 载入（持久化恢复 / 重置） ---------------- */
    case 'config/hydrate': {
      if(action.configuration)return withUi({...action.configuration,ui:state.ui},{preview:null,drag:null,selectedModuleId:null},action.notice||null);
      const modules = Array.isArray(action.modules) ? action.modules : [];
      return withUi({ ...state, modules }, { preview: null, drag: null, selectedModuleId: null }, action.notice || null);
    }
    case 'config/rename': {
      if(typeof action.name!=='string'||!action.name.trim()||action.name.length>80)return noticeOnly(state,{level:'error',code:'INVALID_NAME',message:'名称须为 1–80 字符'});
      return withUi({...state,name:action.name.trim()}, {}, {level:'info',code:'RENAMED',message:'草稿名称已更新，请保存配置'});
    }

    default:
      return state;
  }
}

/**
 * 反序列化时的规范化：只接受已知模块、已知端口、合法字段形状的实例。
 * 未知项被丢弃并记入报告，避免损坏数据把整站拖垮（M0.2_TASK §9）。
 */
export function normalizeModules(rawModules) {
  const accepted = [];
  const dropped = [];
  if (!Array.isArray(rawModules)) {
    if (rawModules !== undefined && rawModules !== null) dropped.push({ reason: 'UNKNOWN_SHAPE', value: String(rawModules).slice(0, 40) });
    return { modules: accepted, dropped };
  }
  const seen = new Set();
  for (const raw of rawModules) {
    if (!raw || typeof raw !== 'object') {
      dropped.push({ reason: 'NOT_AN_OBJECT', value: String(raw).slice(0, 40) });
      continue;
    }
    const mod = getModule(raw.moduleId);
    if (!mod) {
      dropped.push({ reason: 'UNKNOWN_MODULE', value: String(raw.moduleId) });
      continue;
    }
    if (raw.portId !== mod.portId) {
      dropped.push({ reason: 'PORT_MISMATCH', value: `${raw.moduleId} → ${String(raw.portId)}` });
      continue;
    }
    if (seen.has(raw.moduleId)) {
      dropped.push({ reason: 'DUPLICATE_INSTANCE', value: raw.moduleId });
      continue;
    }
    seen.add(raw.moduleId);
    accepted.push({
      moduleId: raw.moduleId,
      portId: raw.portId,
      enabled: raw.enabled === true,
      permissions: { read: raw.permissions?.read === true },
      // settings 原样保留：非法值会在校验层被报为 Invalid 并给出字段级提示，
      // 而不是被静默改写为用户没选过的值。
      settings: raw.settings && typeof raw.settings === 'object' ? { ...raw.settings } : {},
    });
  }
  return { modules: accepted, dropped };
}
