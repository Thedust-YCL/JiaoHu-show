/**
 * src/simulation/tools/registry.js
 * ------------------------------------------------------------------
 * 全站共享的「教学工具定义表」。
 *
 * Tool Calling 知识页、内嵌实验、执行引擎、事件 Inspector 与装配台
 * 全部从这里取工具名、中文名、参数 Schema 与执行入口；知识页不允许
 * 另写一套与 Constructor 不一样的工具参数模型（M0.3_TASK §5.3）。
 * ------------------------------------------------------------------
 */
import { MODULES } from '../../features/constructor/model/modules.js';
import { announcementSearchTool } from './announcementSearch.js';
import { documentReaderTool } from './documentReader.js';

const RUNNERS = Object.freeze({
  announcement_search: announcementSearchTool,
  document_reader: documentReaderTool,
});

/** 工具标识（与 M0.2 模块标识一致，不是第二套命名） */
export const TOOL_IDS = Object.freeze(Object.keys(RUNNERS));

export const SIMULATION_TOOLS = Object.freeze(
  Object.fromEntries(
    TOOL_IDS.map((toolId) => {
      const mod = MODULES[toolId];
      return [
        toolId,
        Object.freeze({
          toolId,
          moduleId: mod.id,
          portId: mod.portId,
          name: mod.name,
          cn: mod.cn,
          index: mod.index,
          kind: mod.kind,
          tagline: mod.tagline,
          /** 参数 Schema 直接复用 M0.2 的模块字段定义 */
          params: mod.fields,
          run: RUNNERS[toolId].run,
          validate: RUNNERS[toolId].validate,
        }),
      ];
    })
  )
);

export function getSimulationTool(toolId) {
  return Object.prototype.hasOwnProperty.call(SIMULATION_TOOLS, toolId) ? SIMULATION_TOOLS[toolId] : null;
}

/** 参数的中文标签：事件详情与知识页共用，避免出现两套说法 */
export function paramLabel(toolId, key) {
  const tool = getSimulationTool(toolId);
  const field = tool?.params.find((f) => f.key === key);
  return field ? field.label : String(key);
}

/** 把内部取值翻译成选项的中文标签（用于事件消息） */
export function paramText(toolId, key, value) {
  const tool = getSimulationTool(toolId);
  const field = tool?.params.find((f) => f.key === key);
  if (!field) return String(value);
  if (field.type === 'checkbox') return value === true ? '开启' : '关闭';
  const opt = field.options?.find((o) => (field.numeric ? Number(o.value) : String(o.value)) === (field.numeric ? Number(value) : String(value)));
  return opt ? opt.label : String(value);
}
