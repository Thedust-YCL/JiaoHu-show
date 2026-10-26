/**
 * src/simulation/tools/documentReader.js
 * ------------------------------------------------------------------
 * 本地模拟工具 `document_reader`（文档读取）—— 纯函数，无副作用。
 *
 * 两条必须遵守的规则（M0.3_TASK §6.1 / §6.2，M0.4_TASK §4.4）：
 *   1. `readMode=summary` 只返回**预先定义的摘要**，不返回正文、不发全文读取
 *      事件；`readMode=full_text` 才返回完整正文段落与**片段级文本**。
 *   2. `includeMetadata=false` 时，用户可见的模拟工具响应里**不得**悄悄补回
 *      已被关闭的来源 / 日期 / 更正关系元数据。引擎内部仍会用 sourceId 做
 *      事件追踪，但那是内部追踪元数据，与工具返回的公开数据分开存放。
 *
 * M0.4 增量：返回值增加 `chunks`（片段级文本，供证据抽取与引用高亮）。
 * 只有在 full_text 下才包含正文片段；summary 下只有一个摘要片段。
 * ------------------------------------------------------------------
 */
import { getModule } from '../../features/constructor/model/modules.js';
import { getNotice } from '../../research-packs/mission-001/notices.js';

export const TOOL_ID = 'document_reader';

/** 正文片段字符上限：异常超长文本安全降级，避免把事件详情撑爆 */
const MAX_TEXT_CHARS = 4000;

function clampText(text, limit = MAX_TEXT_CHARS) {
  const s = String(text ?? '');
  return { text: s.length <= limit ? s : `${s.slice(0, limit)}…`, truncated: s.length > limit };
}

/** 合法资料标识形状：外部传入的异常 ID 一律拒绝，不做猜测 */
const SOURCE_ID_PATTERN = /^[A-Z]{2,6}-\d{3,6}$/;

export function validateReadSettings(settings = {}) {
  const mod = getModule(TOOL_ID);
  const errors = [];
  for (const field of mod.fields) {
    const raw = settings[field.key];
    if(!field.required && raw===undefined)continue;
    if (raw === undefined || raw === null || raw === '') {
      errors.push({ field: field.key, code: 'MISSING', message: `缺少必填参数「${field.label}」` });
      continue;
    }
    if (field.type === 'select') {
      const wanted = String(raw);
      const allowed = field.options.some((o) => String(o.value) === wanted);
      if (!allowed) errors.push({ field: field.key, code: 'INVALID_VALUE', message: `「${field.label}」取值「${String(raw)}」不在允许范围内` });
    } else if (field.type === 'checkbox' && typeof raw !== 'boolean') {
      errors.push({ field: field.key, code: 'INVALID_TYPE', message: `「${field.label}」必须是布尔开关` });
    }
  }
  return { ok: errors.length === 0, errors };
}

/** 片段级文本：摘要模式只有一个摘要片段，全文模式才有正文片段 */
function chunksOf(notice, isFullText) {
  const declared = Array.isArray(notice.chunks) && notice.chunks.length
    ? notice.chunks
    : [
        { chunkId: notice.chunkId, kind: 'summary', text: notice.summary },
        ...notice.body.map((text, i) => ({ chunkId: `${notice.sourceId}#body-${i + 1}`, kind: 'body', text })),
      ];
  return declared
    .filter((c) => (isFullText ? c.kind === 'body' : c.kind === 'summary'))
    .map((c) => Object.freeze({ chunkId: c.chunkId, kind: c.kind, text: clampText(c.text).text }));
}

/**
 * 读取一条本地语料。
 * @param {{settings?:object, sourceId:unknown}} params
 * @returns {{ok:true,payload:object,meta:object}|{ok:false,error:{code:string,message:string}}}
 */
export function runDocumentReader({ settings = {}, sourceId } = {}) {
  const check = validateReadSettings(settings);
  if (!check.ok) {
    return { ok: false, error: { code: 'INVALID_ARGUMENTS', message: check.errors[0].message, errors: check.errors } };
  }

  if (typeof sourceId !== 'string' || !SOURCE_ID_PATTERN.test(sourceId)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_SOURCE_ID',
        message: `资料标识「${String(sourceId).slice(0, 32)}」形状不合法：只接受形如 NTC-1001 的稳定 ID`,
      },
    };
  }

  const notice = getNotice(sourceId);
  if (!notice) {
    return {
      ok: false,
      error: { code: 'UNKNOWN_SOURCE', message: `本地语料中没有资料 ${sourceId}：不会读取或猜测不存在的内容` },
    };
  }

  const readMode = String(settings.readMode);
  const includeMetadata = settings.includeMetadata === true;
  const isFullText = readMode === 'full_text';

  const rawText = isFullText ? notice.body.join('\n\n') : notice.summary;
  const { text, truncated } = clampText(rawText);
  const chunks = chunksOf(notice, isFullText);
  /* 片段 ID 与片段内容必须来自同一份清单，避免「载荷里有 2 段、ID 只有 1 个」 */
  const chunkIds = chunks.map((c) => c.chunkId);

  return {
    ok: true,
    payload: {
      kind: 'read.response',
      toolId: TOOL_ID,
      simulated: true,
      sourceId: notice.sourceId,
      title: notice.title,
      readMode,
      /** 内容范围：知识页与 Inspector 都据此说明「拿到的是摘要还是全文」 */
      textScope: isFullText ? 'full_text' : 'summary',
      chunkIds,
      /** 片段级文本：证据抽取与引用高亮只认这里的内容 */
      chunks,
      textTruncated: truncated,
      /** 只有 full_text 才带正文；summary 永远拿不到 body */
      content: isFullText ? text : null,
      summary: isFullText ? null : text,
      metadataIncluded: includeMetadata,
      /** includeMetadata=false 时为 null：不悄悄补回被关闭的元数据 */
      metadata: includeMetadata
        ? {
            publishedAt: notice.publishedAt,
            publisher: notice.publisher,
            publisherId: notice.publisherId || notice.publisher,
            noticeScope: notice.scope,
            eventKey: notice.eventKey || null,
            supersedes: Array.isArray(notice.supersedes) ? [...notice.supersedes] : [],
            validity: notice.validity || 'active',
          }
        : null,
    },
    meta: {
      sourceId: notice.sourceId,
      title: notice.title,
      readMode,
      textScope: isFullText ? 'full_text' : 'summary',
      chunkIds,
      chunks,
      isFictional: notice.isFictional === true,
      /** 内部追踪元数据：引擎调试与资料定位用，不进入用户可见的工具响应 */
      internal: {
        publisher: notice.publisher,
        publisherId: notice.publisherId,
        publishedAt: notice.publishedAt,
        noticeScope: notice.scope,
        eventKey: notice.eventKey || null,
        supersedes: Array.isArray(notice.supersedes) ? [...notice.supersedes] : [],
        validity: notice.validity,
      },
    },
  };
}

export const documentReaderTool = Object.freeze({
  toolId: TOOL_ID,
  moduleId: TOOL_ID,
  run: runDocumentReader,
  validate: validateReadSettings,
});

