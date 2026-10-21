/**
 * src/simulation/rules/availability.js
 * ------------------------------------------------------------------
 * 从 **M0.2 已确认的权威配置**推导「本次运行里工具是否真的可用」。
 *
 * 这里不创建任何 `searchAvailable` / `readerAvailable` 之类的独立业务开关：
 * 输入就是 constructor 的快照（`{ schemaVersion, modules: [...] }`），
 * 输出是纯派生结果。逻辑状态依旧由 M0.2 的 `deriveStatus` 判定，
 * 本文件只把状态翻译成「模拟引擎能读懂的原因」。
 * ------------------------------------------------------------------
 */
import { getModule } from '../../features/constructor/model/modules.js';
import { deriveStatus, validateModuleConfig, isStructuralError } from '../../features/constructor/model/validation.js';
import { TOOL_IDS } from '../tools/registry.js';

/** 工具不可用的原因码：事件消息与界面提示共用同一套解释 */
export const BLOCK_CODES = Object.freeze({
  OK: 'OK',
  NOT_INSTALLED: 'NOT_INSTALLED',
  DISABLED: 'DISABLED',
  PERMISSION_MISSING: 'PERMISSION_MISSING',
  INCOMPLETE: 'INCOMPLETE',
  INVALID: 'INVALID',
  UNKNOWN_MODULE: 'UNKNOWN_MODULE',
});

export const BLOCK_META = Object.freeze({
  OK: { cn: '可用', tone: 'signal' },
  NOT_INSTALLED: { cn: '尚未装配', tone: 'attention' },
  DISABLED: { cn: '已被禁用', tone: 'muted' },
  PERMISSION_MISSING: { cn: '缺少只读模拟权限', tone: 'attention' },
  INCOMPLETE: { cn: '参数不完整', tone: 'attention' },
  INVALID: { cn: '配置非法', tone: 'error' },
  UNKNOWN_MODULE: { cn: '未知模块', tone: 'error' },
});

/** 规范化快照：只接受合法形状，异常结构不会被当作「可用」 */
export function normalizeSnapshot(configSnapshot) {
  if (!configSnapshot || typeof configSnapshot !== 'object') return { modules: [], problems: ['EMPTY_SNAPSHOT'] };
  const modules = Array.isArray(configSnapshot.modules) ? configSnapshot.modules : [];
  const problems = [];
  if (!Array.isArray(configSnapshot.modules)) problems.push('MISSING_MODULES');
  return { modules, problems };
}

/**
 * 推导单个工具的可用性。
 * @returns {{toolId:string,module:object|null,installed:boolean,enabled:boolean,status:string,ready:boolean,blockCode:string,blockReason:string,settings:object,permissions:object}}
 */
export function describeTool(toolId, snapshot) {
  const mod = getModule(toolId);
  const { modules } = normalizeSnapshot(snapshot);
  const installed = modules.find((m) => m && m.moduleId === toolId) || null;
  const base = {
    toolId,
    module: mod,
    label: mod ? mod.cn : toolId,
    installed: !!installed,
    enabled: installed?.enabled === true,
    status: 'Available',
    ready: false,
    blockCode: BLOCK_CODES.NOT_INSTALLED,
    blockReason: mod ? `${mod.cn}尚未装配到${mod.portId}` : `未知工具 ${toolId}`,
    settings: {},
    permissions: { read: false },
  };

  if (!mod) return { ...base, status: 'Invalid', blockCode: BLOCK_CODES.UNKNOWN_MODULE, blockReason: `未知工具标识「${String(toolId)}」` };
  if (!installed) return base;

  // 端口不匹配等结构问题由 M0.2 的状态派生判定，这里不另写规则
  const status = deriveStatus(installed);
  const { errors } = validateModuleConfig(installed.moduleId, installed.settings, installed.permissions);
  const structural = errors.filter(isStructuralError);
  const permissionError = errors.find((e) => e.code === 'PERMISSION_REQUIRED');
  const missingField = errors.find((e) => e.code === 'MISSING' || e.code === 'INVALID_TYPE' || e.code === 'INVALID_VALUE');

  const result = {
    ...base,
    installed: true,
    enabled: installed.enabled === true,
    status,
    settings: { ...(installed.settings || {}) },
    permissions: { read: installed.permissions?.read === true },
  };

  if (status === 'Invalid') {
    return {
      ...result,
      ready: false,
      blockCode: BLOCK_CODES.INVALID,
      blockReason: structural[0] ? structural[0].message : `${mod.cn}的配置不满足字段或兼容性规则`,
    };
  }
  if (!result.enabled) {
    return { ...result, ready: false, blockCode: BLOCK_CODES.DISABLED, blockReason: `${mod.cn}已被禁用：结构继续在位，但本次运行不会调用它` };
  }
  if (permissionError) {
    return { ...result, ready: false, blockCode: BLOCK_CODES.PERMISSION_MISSING, blockReason: `${mod.cn}尚未授予只读模拟权限` };
  }
  if (missingField) {
    return { ...result, ready: false, blockCode: BLOCK_CODES.INCOMPLETE, blockReason: missingField.message };
  }
  if (status !== 'Ready') {
    return { ...result, ready: false, blockCode: BLOCK_CODES.INCOMPLETE, blockReason: `${mod.cn}当前状态为 ${status}，不能进入本次模拟` };
  }
  return { ...result, ready: true, blockCode: BLOCK_CODES.OK, blockReason: `${mod.cn}已就绪` };
}

/** 一次性推导两个工具的可用性（引擎与界面共用） */
export function deriveToolAvailability(configSnapshot) {
  const { problems } = normalizeSnapshot(configSnapshot);
  const tools = {};
  for (const toolId of TOOL_IDS) tools[toolId] = describeTool(toolId, configSnapshot);
  return {
    tools,
    /** 缺哪个工具都不影响读取快照，但必须在事件里如实说明 */
    snapshotProblems: problems,
    anyReady: Object.values(tools).some((t) => t.ready),
  };
}

export { TOOL_IDS };
