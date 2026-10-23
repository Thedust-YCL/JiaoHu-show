/**
 * src/simulation/tools/announcementSearch.js
 * ------------------------------------------------------------------
 * 本地模拟工具 `announcement_search`（公告检索）—— 纯函数，无副作用。
 *
 * 它**不执行任何真实检索**：只在打包进产物的本地语料里按范围标签过滤、
 * 按稳定顺序排序并按 maxResults 截断。参数全部来自 M0.2 已确认的
 * `InstalledModule.settings`，不读取任何界面上的独立开关。
 *
 * 参数是否「真的生效」是本阶段的硬要求（M0.3_TASK §6.2 / §6.3）：
 *   searchScope  决定候选集合（all_notices 5 条 / campus_events 3 条）
 *   maxResults   决定返回上限，并在元数据里如实报告 total 与 truncated
 *   faultMode    仅本次运行的 search_timeout 会返回确定性超时错误
 * ------------------------------------------------------------------
 */
import { getModule } from '../../features/constructor/model/modules.js';
import { SEARCH_SCOPES, sortNotices } from '../../research-packs/mission-001/notices.js';

export const TOOL_ID = 'announcement_search';

/** 单条结果摘要的显示上限：异常长文本安全降级，不整段塞进事件详情 */
const MAX_EXCERPT_CHARS = 320;

function clampText(text, limit = MAX_EXCERPT_CHARS) {
  const s = String(text ?? '');
  return s.length <= limit ? s : `${s.slice(0, limit)}…`;
}

/** 用共享的模块 Schema 校验参数，避免知识页与装配台出现两套参数定义 */
export function validateSearchSettings(settings = {}) {
  const mod = getModule(TOOL_ID);
  const errors = [];
  for (const field of mod.fields) {
    const raw = settings[field.key];
    if (raw === undefined || raw === null || raw === '') {
      errors.push({ field: field.key, code: 'MISSING', message: `缺少必填参数「${field.label}」` });
      continue;
    }
    if (field.type === 'select') {
      const wanted = field.numeric ? Number(raw) : String(raw);
      const allowed = field.options.some((o) => (field.numeric ? Number(o.value) : String(o.value)) === wanted);
      if (!allowed) errors.push({ field: field.key, code: 'INVALID_VALUE', message: `「${field.label}」取值「${String(raw)}」不在允许范围内` });
    }
  }
  const scope = SEARCH_SCOPES[String(settings.searchScope)];
  if (!scope && !errors.some((e) => e.field === 'searchScope')) {
    errors.push({ field: 'searchScope', code: 'UNKNOWN_SCOPE', message: `未知检索范围「${String(settings.searchScope)}」` });
  }
  return { ok: errors.length === 0, errors };
}

/**
 * 执行一次模拟检索。
 * @returns {{ok:true,payload:object,meta:object}|{ok:false,error:{code:string,message:string}}}
 */
export function runAnnouncementSearch({ settings = {}, corpus, faultMode = 'normal' } = {}) {
  const check = validateSearchSettings(settings);
  if (!check.ok) {
    return { ok: false, error: { code: 'INVALID_ARGUMENTS', message: check.errors[0].message, errors: check.errors } };
  }

  const scopeId = String(settings.searchScope);
  const maxResults = Number(settings.maxResults);
  const scope = SEARCH_SCOPES[scopeId];

  // 故障注入只影响**本次运行**：返回确定性错误，绝不退化成假成功
  if (faultMode === 'search_timeout') {
    return {
      ok: false,
      error: {
        code: 'SEARCH_TIMEOUT',
        message: `模拟检索在 ${scope ? scope.cn : scopeId} 范围内超时：本次运行设置了 search_timeout 故障条件，未返回任何条目`,
      },
    };
  }

  const candidates = sortNotices((corpus || []).filter((n) => scope.matches(n)));
  const items = candidates.slice(0, maxResults).map((n) => ({
    sourceId: n.sourceId,
    title: n.title,
    excerpt: clampText(n.summary),
    matchedScope: n.scope,
    chunkId: n.chunkId,
  }));

  return {
    ok: true,
    payload: {
      kind: 'search.response',
      toolId: TOOL_ID,
      simulated: true,
      query: { scope: scopeId, scopeCn: scope.cn, maxResults },
      total: candidates.length,
      returned: items.length,
      truncated: candidates.length > items.length,
      items,
    },
    meta: {
      candidates: candidates.length,
      returned: items.length,
      truncated: candidates.length > items.length,
      scope: scopeId,
      scopeCn: scope.cn,
      maxResults,
      firstSourceId: items.length ? items[0].sourceId : null,
    },
  };
}

export const announcementSearchTool = Object.freeze({
  toolId: TOOL_ID,
  moduleId: TOOL_ID,
  run: runAnnouncementSearch,
  validate: validateSearchSettings,
});
