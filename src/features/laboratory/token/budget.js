/**
 * src/features/laboratory/token/budget.js
 * ------------------------------------------------------------------
 * Lab 01 的**纯逻辑**（无 DOM、无 localStorage、无计时器）：
 *   · 从预计算表里取真实 token 序列，生成「原文 → token 片段」视图；
 *   · 按固定规则把一次会话的上下文预算切给四类内容，并解释截断。
 *
 * 预算规则（**必须可复述**，界面与测试逐条对应）：
 *   1. 先固定预留「输出预算」：它为模型这一轮的回答留出空间；
 *   2. 再固定放入「系统指令」：它是行为约束，不能悄悄丢掉；
 *   3. 再放入「用户任务」：本轮问题；
 *   4. 剩余空间按**选择顺序**放「资料片段」，**整条放入或整条舍弃**，
 *      不截半个片段（截半个片段会让读者以为看到了完整证据）；
 *   5. 若连 1–3 都放不下，则判定超限（overflow）：如实给出缺口数量，
 *      并说明「减少输出预留 / 换更短任务 / 提高窗口」三种可选做法。
 *
 * 重要边界：这些数字来自本地预计算表，是**教学示意**；
 * 真实接口还有消息包装、工具定义等隐式 token，本实验不做承诺。
 * ------------------------------------------------------------------
 */
import { TOKEN_TABLE } from './tokenTable.js';
import { DOC_FRAGMENTS, SYSTEM_INSTRUCTIONS, TOKEN_SAMPLES, WINDOW_OPTIONS, OUTPUT_RESERVE_OPTIONS } from './fragments.js';
import { ENCODING_DEFS, getEncoding } from './encodings.js';

/** 四类内容：界面与测试共用同一份顺序与文案 */
export const BUDGET_SECTIONS = Object.freeze([
  Object.freeze({ id: 'system', label: '系统指令', role: 'fixed', note: '行为约束：先占位，不参与取舍' }),
  Object.freeze({ id: 'task', label: '用户任务', role: 'fixed', note: '本轮问题：整段放入' }),
  Object.freeze({ id: 'docs', label: '已选资料片段', role: 'flexible', note: '按选择顺序放入，放不下整条舍弃' }),
  Object.freeze({ id: 'output', label: '保留给输出', role: 'reserved', note: '回答留给自己的空间：先预留' }),
]);

export const SAMPLE_IDS = Object.freeze(TOKEN_SAMPLES.map((s) => s.id));
export const DOC_IDS = Object.freeze(DOC_FRAGMENTS.map((d) => d.id));

/** 取预计算片段（未知 ID 返回 null，调用方必须显式处理） */
export function getFragment(id) {
  return Object.prototype.hasOwnProperty.call(TOKEN_TABLE.fragments, id) ? TOKEN_TABLE.fragments[id] : null;
}

/** 样例清单（含每种编码的真实 token 数，界面直接显示，不重新计数） */
export function listSamples() {
  return TOKEN_SAMPLES.map((sample) => ({
    ...sample,
    chars: getFragment(sample.id)?.chars ?? [...sample.text].length,
    tokensByEncoding: Object.fromEntries(
      ENCODING_DEFS.map((enc) => [enc.id, getFragment(sample.id)?.encodings?.[enc.id]?.ids.length ?? 0])
    ),
  }));
}

/** 资料片段清单：始终带 sourceId，界面据此标注「虚构教学数据」 */
export function listDocs() {
  return DOC_FRAGMENTS.map((doc) => ({
    ...doc,
    chars: getFragment(doc.id)?.chars ?? 0,
    tokensByEncoding: Object.fromEntries(
      ENCODING_DEFS.map((enc) => [enc.id, getFragment(doc.id)?.encodings?.[enc.id]?.ids.length ?? 0])
    ),
  }));
}

/** 某片段在某编码下的真实 token 数（未登记片段返回 0，并让调用方显示「未登记」） */
export function countTokens(fragmentId, encodingId = 'cl100k_base') {
  return getFragment(fragmentId)?.encodings?.[encodingId]?.ids?.length ?? 0;
}

/**
 * 「原文 → token 片段」视图：序号、可见文本、是否只是续字节。
 * 每一个 token 都来自预计算表，界面上不存在对任意输入即兴计数。
 */
export function buildTokenView(sampleId, encodingId = 'cl100k_base') {
  const fragment = getFragment(sampleId) || getFragment(SAMPLE_IDS[0]);
  const enc = getEncoding(encodingId);
  const entry = fragment.encodings[enc.id] || fragment.encodings[ENCODING_DEFS[0].id];
  const tokens = entry.ids.map((id, index) => {
    const text = entry.texts[index] ?? '';
    return Object.freeze({
      index: index + 1,
      id,
      text,
      /** 空文本 = 该 token 只贡献字节，字符在相邻 token 上完成 */
      isContinuation: text === '',
      /** 用于界面按字符宽度给色块分组 */
      length: [...text].length,
    });
  });
  const chars = fragment.chars;
  const bytes = fragment.bytes;
  const total = tokens.length;
  const other = ENCODING_DEFS.filter((e) => e.id !== enc.id).map((e) => ({
    id: e.id,
    label: e.label,
    tokens: fragment.encodings[e.id]?.ids.length ?? 0,
  }));

  return {
    fragmentId: fragment.id,
    label: fragment.label,
    text: fragment.text,
    chars,
    bytes,
    encoding: enc,
    tokens,
    total,
    /** 真实算出来的两个比值：这不是「一个字一个 token」的证据，而是反证 */
    charsPerToken: total ? chars / total : 0,
    bytesPerToken: total ? bytes / total : 0,
    comparison: other,
    isFictional: fragment.kind === 'doc',
  };
}

function clampWindow(value) {
  const n = Number(value);
  return WINDOW_OPTIONS.includes(n) ? n : WINDOW_OPTIONS[1];
}

function clampReserve(value) {
  const n = Number(value);
  return OUTPUT_RESERVE_OPTIONS.includes(n) ? n : OUTPUT_RESERVE_OPTIONS[1];
}

/**
 * 预算分配（纯函数）：同一份配置永远得到同一份结果。
 *
 * @param {object} config
 * @param {number} config.windowTokens        演示窗口上限（256/512/1024/2048）
 * @param {number} config.outputReserveTokens 预留输出 token 数（64/128/256）
 * @param {string} config.encodingId          编码（cl100k_base / o200k_base）
 * @param {string} config.sampleId            用户任务样例
 * @param {string[]} config.docIds            已选资料片段（顺序 = 优先级）
 */
export function computeBudget(config = {}) {
  const encodingId = getEncoding(config.encodingId).id;
  const windowTokens = clampWindow(config.windowTokens);
  const outputReserveTokens = clampReserve(config.outputReserveTokens);
  const sampleId = SAMPLE_IDS.includes(config.sampleId) ? config.sampleId : SAMPLE_IDS[0];
  const requestedDocs = (Array.isArray(config.docIds) ? config.docIds : []).filter((id) => DOC_IDS.includes(id));
  const docIds = [...new Set(requestedDocs)];

  const system = getFragment(SYSTEM_INSTRUCTIONS.id);
  const task = getFragment(sampleId);
  const systemTokens = system.encodings[encodingId].ids.length;
  const taskTokens = task.encodings[encodingId].ids.length;

  const docItems = docIds.map((id, order) => {
    const fragment = getFragment(id);
    return {
      id,
      label: fragment.label,
      sourceId: fragment.sourceId,
      order,
      tokens: fragment.encodings[encodingId].ids.length,
      chars: fragment.chars,
      text: fragment.text,
      included: false,
      droppedReason: null,
    };
  });

  /* ---------- 规则 1–3：固定段 ---------- */
  const fixedNeed = outputReserveTokens + systemTokens + taskTokens;
  const remaining = windowTokens - fixedNeed;
  const overflow = remaining < 0;
  const available = Math.max(0, remaining);

  /* ---------- 规则 4：资料片段整条放入或整条舍弃 ---------- */
  let used = 0;
  const dropped = [];
  if (!overflow) {
    for (const doc of docItems) {
      if (used + doc.tokens <= available) {
        doc.included = true;
        used += doc.tokens;
      } else {
        doc.included = false;
        doc.droppedReason = `剩余 ${available - used} token 放不下本条（需要 ${doc.tokens}），按规则整条舍弃而非截半个片段`;
        dropped.push({ id: doc.id, label: doc.label, tokens: doc.tokens, reason: doc.droppedReason });
      }
    }
  } else {
    for (const doc of docItems) {
      doc.droppedReason = '窗口已不足以容纳系统指令、用户任务与输出预留，资料片段全部未进入上下文';
      dropped.push({ id: doc.id, label: doc.label, tokens: doc.tokens, reason: doc.droppedReason });
    }
  }

  const includedDocTokens = docItems.filter((d) => d.included).reduce((sum, d) => sum + d.tokens, 0);
  const inputTokens = systemTokens + taskTokens + includedDocTokens;
  const usedTokens = overflow ? fixedNeed : inputTokens + outputReserveTokens;

  const sections = BUDGET_SECTIONS.map((section) => {
    if (section.id === 'system') {
      return { ...section, tokens: systemTokens, included: !overflow, items: [SYSTEM_INSTRUCTIONS.id] };
    }
    if (section.id === 'task') {
      return { ...section, tokens: taskTokens, included: !overflow, items: [sampleId] };
    }
    if (section.id === 'docs') {
      return {
        ...section,
        tokens: includedDocTokens,
        included: docItems.some((d) => d.included),
        items: docItems.filter((d) => d.included).map((d) => d.id),
        dropped: dropped.map((d) => d.id),
      };
    }
    return { ...section, tokens: overflow ? 0 : outputReserveTokens, included: !overflow, items: [] };
  });

  const notes = [];
  if (overflow) {
    notes.push(
      `超限：窗口 ${windowTokens} token，系统指令 ${systemTokens} + 用户任务 ${taskTokens} + 输出预留 ${outputReserveTokens} 已需要 ${fixedNeed} token，缺口 ${-remaining} token。`
    );
    notes.push('可选做法：调高窗口上限、减少输出预留，或换一段更短的用户任务；本实验不会替你偷偷截断系统指令。');
  } else if (!docItems.length) {
    notes.push('本轮没有选择任何资料片段：模型只能依据系统指令与用户任务作答，没有可引用的事实来源。');
  } else if (!docItems.some((d) => d.included)) {
    notes.push('所选资料一条也放不进剩余空间：本轮实际进入上下文的资料为零。');
  } else if (dropped.length) {
    notes.push(`有 ${dropped.length} 条资料因预算不足被整条舍弃，模型在这一轮看不到它们。`);
  }

  return {
    encodingId,
    encoding: getEncoding(encodingId),
    windowTokens,
    outputReserveTokens,
    sampleId,
    docIds,
    fixedNeed,
    inputTokens,
    usedTokens,
    remainingTokens: windowTokens - usedTokens,
    availableForDocs: available,
    sections,
    docs: docItems,
    dropped,
    overflow: overflow
      ? { need: fixedNeed, window: windowTokens, gap: -remaining }
      : null,
    fits: !overflow,
    notes,
    /** 界面上按比例画条用（不做任何四舍五入以外的加工） */
    ratio: {
      system: systemTokens / windowTokens,
      task: taskTokens / windowTokens,
      docs: includedDocTokens / windowTokens,
      output: overflow ? 0 : outputReserveTokens / windowTokens,
      free: Math.max(0, windowTokens - usedTokens) / windowTokens,
    },
  };
}
