/**
 * src/features/constructor/model/validation.js
 * ------------------------------------------------------------------
 * M0.2 派生校验层：端口兼容性、模块配置合法性、逻辑状态推导。
 *
 * 全部为纯函数，不读取 DOM / Three.js / localStorage。
 * 逻辑状态只从配置派生，绝不从三维发光效果反推（M0.2_TASK §4.1）。
 * ------------------------------------------------------------------
 */
import {
  PERMISSION_FIELD,
  defaultPermissions,
  fieldsOf,
  getModule,
  getPort,
  moduleForPort,
  PORTS,
} from './modules.js';

/** 逻辑状态定义（与 PRD §7 / M0.2_TASK §4.2 一致） */
export const STATUS = Object.freeze({
  AVAILABLE: 'Available',
  PREVIEW: 'Preview',
  ATTACHED: 'Attached',
  UNCONFIGURED: 'Unconfigured',
  READY: 'Ready',
  DISABLED: 'Disabled',
  INVALID: 'Invalid',
});

const STATUS_META = Object.freeze({
  Available: { en: 'Available', cn: '可用', tone: 'muted', desc: '模块尚未装配，可从能力架选择或拖拽。' },
  Preview: { en: 'Preview', cn: '预览中', tone: 'attention', desc: '正在预览装配位置，尚未提交。' },
  Attached: { en: 'Attached', cn: '已装配', tone: 'signal', desc: '已占用接口，等待配置。' },
  Unconfigured: { en: 'Unconfigured', cn: '未配置', tone: 'attention', desc: '已装配，但缺少必要参数或只读授权。' },
  Ready: { en: 'Ready', cn: '就绪', tone: 'signal', desc: '已装配、已启用、参数有效且授权满足。' },
  Disabled: { en: 'Disabled', cn: '已禁用', tone: 'muted', desc: '已装配但用户关闭了该模块，结构继续在位。' },
  Invalid: { en: 'Invalid', cn: '配置非法', tone: 'error', desc: '已装配的配置不满足字段或兼容性规则。' },
});

/** 取出状态的展示元数据（英文状态名 + 中文解释 + 语义色） */
export function describeStatus(status) {
  return STATUS_META[status] || STATUS_META.Available;
}

/** 装配地址是否合法：模块与端口必须成对匹配 */
export function validateConnection(moduleId, portId) {
  const mod = getModule(moduleId);
  if (!mod) {
    return { ok: false, code: 'UNKNOWN_MODULE', field: 'moduleId', message: `未知模块标识「${String(moduleId)}」`, fix: '请从左侧能力架重新选择模块' };
  }
  const port = getPort(portId);
  if (!port) {
    return { ok: false, code: 'UNKNOWN_PORT', field: 'portId', message: `未知接口标识「${String(portId)}」`, fix: '请选择已定义的兼容接口' };
  }
  if (!port.accepts.includes(moduleId)) {
    const right = PORTS[mod.portId];
    return {
      ok: false,
      code: 'INCOMPATIBLE_PORT',
      field: 'portId',
      message: `${mod.cn}不能连接到${port.cn}（${port.name}）`,
      fix: `请改接${right ? `${right.cn}（${right.name}）` : '匹配的接口'}`,
    };
  }
  return { ok: true, code: 'OK', moduleId, portId };
}

/**
 * 配置字段校验。返回的每一条错误都带字段级定位与修复建议，
 * 界面据此显示「字段级提示」，而不是只说一句“配置无效”。
 */
export function validateModuleConfig(moduleId, settings = {}, permissions = {}) {
  const mod = getModule(moduleId);
  const errors = [];
  if (!mod) {
    errors.push({ field: 'moduleId', label: '模块', code: 'UNKNOWN_MODULE', message: `未知模块标识「${String(moduleId)}」`, fix: '移除该实例或重置构建器' });
    return { ok: false, errors };
  }

  for (const field of mod.fields) {
    const raw = settings[field.key];
    if (raw === undefined || raw === null || raw === '') {
      if (field.required) {
        errors.push({
          field: field.key,
          label: field.label,
          code: 'MISSING',
          message: `缺少必填参数「${field.label}」`,
          fix: `在检视面板中选择「${field.label}」`,
        });
      }
      continue;
    }
    if (field.type === 'select') {
      const wanted = field.numeric ? Number(raw) : String(raw);
      if (field.numeric && !Number.isFinite(wanted)) {
        errors.push({
          field: field.key,
          label: field.label,
          code: 'INVALID_VALUE',
          message: `「${field.label}」必须是数字，当前值为「${String(raw)}」`,
          fix: `改选 ${field.options.map((o) => o.label).join(' / ')}`,
        });
        continue;
      }
      const allowed = field.options.some((o) => (field.numeric ? Number(o.value) : String(o.value)) === wanted);
      if (!allowed) {
        errors.push({
          field: field.key,
          label: field.label,
          code: 'INVALID_VALUE',
          message: `「${field.label}」的取值「${String(raw)}」不在允许范围内`,
          fix: `改选 ${field.options.map((o) => o.label).join(' / ')}`,
        });
      }
    } else if (field.type === 'checkbox' && typeof raw !== 'boolean') {
      errors.push({
        field: field.key,
        label: field.label,
        code: 'INVALID_TYPE',
        message: `「${field.label}」必须是布尔开关，当前类型为 ${typeof raw}`,
        fix: '重新切换该开关以写入合法值',
      });
    }
  }

  if (permissions.read !== true) {
    errors.push({
      field: PERMISSION_FIELD.key,
      label: PERMISSION_FIELD.label,
      code: 'PERMISSION_REQUIRED',
      message: '尚未授予只读模拟权限，模块不能进入 Ready',
      fix: '在检视面板中打开「只读模拟权限」',
    });
  }

  return { ok: errors.length === 0, errors };
}

/** 是否属于「配置结构非法」类错误（权限缺失不算非法，只算未配置） */
export function isStructuralError(error) {
  return error.code !== 'PERMISSION_REQUIRED' && error.code !== 'MISSING';
}

/**
 * 派生逻辑状态。
 * 优先级：结构非法 → Invalid；用户关闭 → Disabled；缺参数或缺授权 → Unconfigured；否则 Ready。
 */
export function deriveStatus(installed) {
  if (!installed || typeof installed !== 'object') return STATUS.INVALID;
  const mod = getModule(installed.moduleId);
  if (!mod || installed.portId !== mod.portId) return STATUS.INVALID;
  const { errors } = validateModuleConfig(installed.moduleId, installed.settings, installed.permissions);
  if (errors.some(isStructuralError)) return STATUS.INVALID;
  if (installed.enabled !== true) return STATUS.DISABLED;
  if (errors.length > 0) return STATUS.UNCONFIGURED;
  return STATUS.READY;
}

/** 该实例当前是否已被接口占用（Attached 结构的判定依据） */
export function isAttached(installed) {
  const mod = getModule(installed?.moduleId);
  return !!mod && installed.portId === mod.portId;
}

/**
 * 把界面表单补丁规范化为可写入的 settings / permissions。
 * 非法值原样保留，交给 validateModuleConfig 报出字段级错误，
 * 这样界面能解释「为什么不合法」，而不是静默丢弃用户输入。
 */
export function applyPatch(moduleId, installed, patch = {}) {
  const mod = getModule(moduleId);
  const settings = { ...(installed?.settings || {}) };
  const permissions = { ...(installed?.permissions || defaultPermissions()) };

  if (!mod) return { settings, permissions };

  for (const field of fieldsOf(moduleId)) {
    if (!Object.prototype.hasOwnProperty.call(patch, field.key)) continue;
    const raw = patch[field.key];
    if (field.key === PERMISSION_FIELD.key) {
      permissions.read = raw === true;
      continue;
    }
    if (field.numeric) settings[field.key] = typeof raw === 'number' ? raw : Number(raw);
    else settings[field.key] = raw;
  }
  return { settings, permissions };
}

/** 单个字段当前的显示值（用于表单与 2D 摘要） */
export function fieldValue(installed, field) {
  if (field.key === PERMISSION_FIELD.key) return installed?.permissions?.read === true;
  return installed?.settings?.[field.key];
}

/** 字段显示文案：把内部取值翻译成中文选项标签 */
export function fieldText(moduleId, field, value) {
  if (field.type === 'checkbox') return value ? '允许' : '拒绝';
  const opt = field.options?.find((o) => (field.numeric ? Number(o.value) : String(o.value)) === (field.numeric ? Number(value) : String(value)));
  return opt ? opt.label : String(value ?? '—');
}

/** 供 2D / Inspector 摘要使用的「人话」配置清单 */
export function configSummary(installed) {
  const mod = getModule(installed?.moduleId);
  if (!mod) return [];
  const rows = [];
  for (const field of mod.fields) {
    rows.push([field.label, fieldText(mod.id, field, fieldValue(installed, field))]);
  }
  rows.push([PERMISSION_FIELD.label, installed?.permissions?.read === true ? '允许' : '拒绝']);
  return rows;
}

/** 端口占用查询：返回占用该端口的实例或 null */
export function portOccupant(modules, portId) {
  return (modules || []).find((m) => m.portId === portId) || null;
}

export { moduleForPort };
