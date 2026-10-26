/**
 * src/features/constructor/model/modules.js
 * ------------------------------------------------------------------
 * M0.2 装配领域模型：模块定义、端口注册表与配置字段 Schema。
 *
 * 本文件是纯数据 + 纯函数，不依赖 DOM、Three.js 或任何渲染层，
 * 因此可以脱离三维场景在普通单元测试中直接运行（M0.2_TASK §11）。
 *
 * 名词策略：模块名、端口名、状态名属于专有名词，保留英文；
 * 其余说明、字段标签、错误原因全部使用中文。
 * ------------------------------------------------------------------
 */

/** 本阶段允许装配的模块标识（每种最多 1 个实例） */
import { EXTRA_MODULES, TOOL_EXTRA_FIELDS } from './catalog.js';
export const MODULE_IDS = Object.freeze(['announcement_search', 'document_reader', ...Object.keys(EXTRA_MODULES)]);

/** 本阶段定义的兼容端口标识 */
export const PORT_IDS = Object.freeze(['SEARCH_PORT', 'READER_PORT', ...Object.values(EXTRA_MODULES).map(m=>m.portId)]);

/**
 * 端口注册表。
 * anchorIndex 指向 AZ-CORE 01 的 L3 接口阵列（scenes/core/assembly.js 按
 * GEOMETRY.portCount 顺序程序化生成的 12 个接口）中的具体序号。
 * 该序号是稳定标识，不用网格位置或 DOM 下标判断身份（M0.2_TASK §3.2）。
 */
export const PORTS = Object.freeze({
  ...Object.fromEntries(Object.values(EXTRA_MODULES).map((m,i)=>[m.portId,{id:m.portId,name:m.portId,cn:`${m.cn}接口`,accepts:[m.id],anchorIndex:[0,2,3,4,5,6,7,8,9][i],note:m.tagline}])),
  SEARCH_PORT: {
    id: 'SEARCH_PORT',
    name: 'SEARCH_PORT',
    cn: '检索接口',
    accepts: Object.freeze(['announcement_search']),
    anchorIndex: 1,
    note: '只接受 Announcement Search 模块；接口本身不带任何联网能力。',
  },
  READER_PORT: {
    id: 'READER_PORT',
    name: 'READER_PORT',
    cn: '读取接口',
    accepts: Object.freeze(['document_reader']),
    anchorIndex: 11,
    note: '只接受 Document Reader 模块；读取对象是本地教学模拟资料。',
  },
});

/** 只读模拟权限字段：纳入统一表单与校验，但不写入 settings */
export const PERMISSION_FIELD = Object.freeze({
  key: 'readPermission',
  type: 'checkbox',
  label: '只读模拟权限',
  en: 'READ PERMISSION',
  hint: '仅表示允许本模块读取本地教学模拟资料，不是浏览器真实文件访问权限，也不会发起任何网络请求。',
});

/**
 * 模块定义。settings 字段使用判别联合，而不是任由 Record<string, unknown> 蔓延。
 * numeric 为 true 时，值在写入前会被规范化为数字。
 */
const TOOL_MODULES = {
  announcement_search: {
    id: 'announcement_search',
    name: 'Announcement Search',
    cn: '公告检索',
    kind: '模拟搜索工具',
    kindEn: 'SIMULATED SEARCH TOOL',
    portId: 'SEARCH_PORT',
    index: 'T1',
    tagline: '按范围在本地教学资料中检索公告条目，返回可读条目清单。',
    knowledge:
      '这是 **Tool（工具）** 的最小形态：模型自己不搜索，它只产出结构化的调用请求，由运行环境去执行。本模块把「搜索范围」「结果数量」和「只读权限」固化成可校验的配置，供后续阶段的研究引擎读取。',
    limits: [
      '不执行真实检索：本阶段只保存配置，不产生任何检索结果。',
      '不代表 MCP 连接：MCP 是众多连接协议之一，不是模型本身。',
      '只读：没有写入、删除或发布动作。',
    ],
    fields: Object.freeze([
      {
        key: 'searchScope',
        type: 'select',
        label: '搜索范围',
        en: 'SEARCH SCOPE',
        required: true,
        default: 'all_notices',
        options: Object.freeze([
          { value: 'all_notices', label: '全部公告', note: '覆盖本地教学资料中的全部公告条目。' },
          { value: 'campus_events', label: '校园活动', note: '只覆盖活动类条目，范围更窄、噪声更低。' },
        ]),
      },
      {
        key: 'maxResults',
        type: 'select',
        label: '结果数量',
        en: 'MAX RESULTS',
        required: true,
        numeric: true,
        default: 5,
        options: Object.freeze([
          { value: 3, label: '3 条', note: '上下文占用最小。' },
          { value: 5, label: '5 条', note: '默认值，覆盖与成本均衡。' },
          { value: 10, label: '10 条', note: '覆盖最广，占用上下文最多。' },
        ]),
      },
    ]),
  },

  document_reader: {
    id: 'document_reader',
    name: 'Document Reader',
    cn: '文档读取',
    kind: '模拟读取工具',
    kindEn: 'SIMULATED READ TOOL',
    portId: 'READER_PORT',
    index: 'T2',
    tagline: '按读取方式打开本地教学模拟文档，可选是否附带元数据。',
    knowledge:
      '读取能力与检索能力是两件事：检索负责「找到」，读取负责「打开」。本模块把读取方式与元数据开关显式化，让后续研究引擎能据此决定是把全文放进上下文，还是只放入摘要。',
    limits: [
      '不读取任何真实文件：没有文件选择器，也不访问本地磁盘。',
      '全文模式只代表后续模拟策略，不改变本阶段行为。',
      '只读：没有写入或修改文档的动作。',
    ],
    fields: Object.freeze([
      {
        key: 'readMode',
        type: 'select',
        label: '读取方式',
        en: 'READ MODE',
        required: true,
        default: 'summary',
        options: Object.freeze([
          { value: 'summary', label: '摘要', note: '只取摘要段落，上下文占用低。' },
          { value: 'full_text', label: '全文', note: '取全文，信息更完整但占用上下文显著更高。' },
        ]),
      },
      {
        key: 'includeMetadata',
        type: 'checkbox',
        label: '包含元数据',
        en: 'INCLUDE METADATA',
        required: true,
        default: true,
        hint: '是否一并请求发布日期、来源等元数据字段。',
      },
    ]),
  },
};

export const MODULES = Object.freeze({
  ...Object.fromEntries(Object.entries(TOOL_MODULES).map(([id,m])=>[id,{...m,moduleType:'tools',category:'工具',singleton:true,available:true,dependencies:[],systemRelation:'tool-access',conflicts:[],conceptIds:['tool_calling','tools','api'],fields:Object.freeze([...m.fields,...TOOL_EXTRA_FIELDS])}])),
  ...EXTRA_MODULES,
});

/** 取模块定义；未知标识返回 null（调用方必须显式处理） */
export function getModule(moduleId) {
  return Object.prototype.hasOwnProperty.call(MODULES, moduleId) ? MODULES[moduleId] : null;
}

/** 取端口定义；未知标识返回 null */
export function getPort(portId) {
  return Object.prototype.hasOwnProperty.call(PORTS, portId) ? PORTS[portId] : null;
}

/** 端口 → 模块：用于「该接口已被谁占用」查询 */
export function moduleForPort(portId) {
  const port = getPort(portId);
  if (!port) return null;
  return port.accepts.length === 1 ? getModule(port.accepts[0]) : null;
}

/** 模块字段默认值：装配即写入，未授权时仍为 Unconfigured，不会直接 Ready */
export function defaultSettings(moduleId) {
  const mod = getModule(moduleId);
  if (!mod) return {};
  const out = {};
  if (moduleId === 'runtime') return out;
  for (const field of mod.fields) if(field.scope !== 'root') out[field.key] = Array.isArray(field.default) ? [...field.default] : field.default;
  return out;
}

/** 默认权限：一律未授权（M0.2_TASK §3.1） */
export function defaultPermissions() {
  return { read: false };
}

/**
 * 配置字段总表（含权限字段），供表单渲染与校验共用，避免出现两套字段定义。
 */
export function fieldsOf(moduleId) {
  const mod = getModule(moduleId);
  if (!mod) return [];
  return mod.moduleType === 'tools' ? [...mod.fields, PERMISSION_FIELD] : mod.fields;
}

/** 左侧能力架 / 2D 节点使用的紧凑标签 */
export function moduleLabel(moduleId) {
  const mod = getModule(moduleId);
  if (!mod) return { name: String(moduleId), cn: '未知模块', index: '—', kind: '未知' };
  return { index: mod.index, name: mod.name, cn: mod.cn, kind: mod.kind, portId: mod.portId };
}
