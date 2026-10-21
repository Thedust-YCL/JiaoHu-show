/**
 * src/simulation/engine/runSimulation.js
 * ------------------------------------------------------------------
 * M0.3 模拟引擎：**纯逻辑**，不引用 DOM、Canvas、Three.js、动画帧或 React。
 *
 * 单向数据流（M0.3_TASK §0.3 / §7.1）：
 *     M0.2 用户配置快照  →  纯规则判定  →  确定性事件序列  →  渲染 / 回放
 *
 * 它绝不根据「三维动画是否播放、节点是否亮起」决定模拟结果；视觉层只是
 * 订阅事件数组的下游。运行开始时会深拷贝并冻结输入快照，因此之后在装配台
 * 里改参数或移除模块，都不会重写已经产生的历史轨迹（A23）。
 * ------------------------------------------------------------------
 */
import {
  ACTORS,
  EVENT_TYPES,
  FAULT_MODES,
  OUTCOME_META,
  SIMULATION_SCHEMA_VERSION,
  createEvent,
} from '../events/schema.js';
import { deepClone, deepFreeze, deriveRunId } from '../events/serializer.js';
import { deriveToolAvailability } from '../rules/availability.js';
import { refineBranchAfterSearch, selectBranch } from '../rules/branches.js';
import { getSimulationTool, paramText } from '../tools/registry.js';
import { loadMission } from '../../research-packs/mission-001-mini/index.js';

/** 默认的空白快照：没有任何已装配模块，运行会走 B02 阻断分支 */
export const EMPTY_CONFIG_SNAPSHOT = Object.freeze({ schemaVersion: 1, modules: Object.freeze([]) });

function normalizeSnapshot(configSnapshot) {
  if (configSnapshot && typeof configSnapshot === 'object') return deepFreeze(deepClone(configSnapshot));
  return deepFreeze(deepClone({ schemaVersion: 1, modules: [] }));
}

function resolveMission(missionData) {
  if (!missionData) return loadMission();
  if (typeof missionData === 'string') return loadMission(missionData);
  if (typeof missionData === 'object' && missionData.missionId) return missionData;
  return null;
}

function resolveFaultMode(runOptions, problems) {
  const raw = runOptions?.faultMode ?? 'normal';
  if (!FAULT_MODES.includes(raw)) {
    problems.push(`未知故障选项「${String(raw)}」，已按 normal 处理`);
    return 'normal';
  }
  return raw;
}

/**
 * 执行一次浏览器本地教学模拟。
 *
 * @param {object} constructorSnapshot M0.2 已确认配置的快照 `{ schemaVersion, modules }`
 * @param {object|string} missionData  研究样本包（或它的 missionId）
 * @param {{faultMode?:string}} runOptions 本次运行选项（不是模块的永久状态）
 * @returns {object} 冻结的 SimulationRun
 */
export function runSimulation(constructorSnapshot, missionData = null, runOptions = {}) {
  const problems = [];
  const snapshot = normalizeSnapshot(constructorSnapshot);
  const mission = resolveMission(missionData);
  const faultMode = resolveFaultMode(runOptions, problems);

  /* ---------------- 任务数据不可用：安全降级为可解释的错误运行 ---------------- */
  if (!mission) {
    const runId = deriveRunId({ missionId: 'unknown', missionVersion: 0, configSnapshot: snapshot, faultMode });
    const events = [
      createEvent({ runId, sequence: 0, phase: 'VALIDATION', type: EVENT_TYPES.RUN_STARTED, status: 'info', actorId: 'system', message: '运行已请求，但任务数据不可用：不会执行任何工具调用' }),
      createEvent({ runId, sequence: 1, phase: 'VALIDATION', type: EVENT_TYPES.VALIDATION_BLOCKED, status: 'blocked', actorId: 'system', branchId: 'B02_NO_SEARCH', ruleId: 'rule.mission.availability', message: '未找到匹配的任务数据版本，已阻断本次运行' }),
      createEvent({ runId, sequence: 2, phase: 'END', type: EVENT_TYPES.RUN_COMPLETED, status: 'error', actorId: 'system', branchId: 'B02_NO_SEARCH', message: `运行结束：error · ${OUTCOME_META.error.note}` }),
    ];
    return deepFreeze({
      schemaVersion: SIMULATION_SCHEMA_VERSION,
      runId,
      missionId: 'unknown',
      missionVersion: 0,
      corpusVersion: null,
      configSnapshot: snapshot,
      options: Object.freeze({ faultMode }),
      outcome: 'error',
      branchId: 'B02_NO_SEARCH',
      events,
      artifacts: { payloads: {}, internal: {}, evidence: { level: null, sourceIds: [], chunkIds: [], note: '未取得任何样本资料' }, report: { status: 'not_generated', note: '任务数据不可用，未生成任何内容。' }, plan: [] },
      stats: { eventCount: events.length, toolsInvoked: [], searches: 0, reads: 0 },
      notes: ['任务数据不可用，未执行任何工具调用。', ...problems],
    });
  }

  const availability = deriveToolAvailability(snapshot);
  const runId = deriveRunId({ missionId: mission.missionId, missionVersion: mission.missionVersion, configSnapshot: snapshot, faultMode });

  const payloads = {};
  const internal = {};
  const events = [];
  const toolsInvoked = [];

  const addPayload = (id, data) => {
    payloads[id] = deepFreeze(deepClone(data));
    return id;
  };
  const push = (partial) => {
    const event = createEvent({ runId, sequence: events.length, ...partial });
    events.push(event);
    if (event.toolId && (event.type === EVENT_TYPES.TOOL_CALL || event.type === EVENT_TYPES.TOOL_RESULT || event.type === EVENT_TYPES.TOOL_ERROR)) {
      if (!toolsInvoked.includes(event.toolId)) toolsInvoked.push(event.toolId);
    }
    return event;
  };

  /* ---------------- 00 运行开始 ---------------- */
  const faultMeta = faultMode === 'normal' ? '正常运行（未注入故障）' : '本次运行注入了 search_timeout 故障条件';
  push({
    phase: 'VALIDATION',
    type: EVENT_TYPES.RUN_STARTED,
    status: 'info',
    actorId: 'system',
    message: `开始本地教学模拟：任务 ${mission.missionId}@${mission.missionVersion} · ${faultMeta} · 无真实网络请求`,
  });

  /* ---------------- 01 配置校验（工具可用性由 M0.2 配置派生） ---------------- */
  const search = availability.tools.announcement_search;
  const reader = availability.tools.document_reader;
  const availabilityPayload = addPayload('p:availability', {
    kind: 'config.availability',
    derivedFrom: 'constructor config snapshot',
    tools: Object.values(availability.tools).map((t) => ({
      toolId: t.toolId,
      label: t.label,
      installed: t.installed,
      enabled: t.enabled,
      status: t.status,
      ready: t.ready,
      blockCode: t.blockCode,
      blockReason: t.blockReason,
      settings: t.settings,
      permissions: t.permissions,
    })),
  });

  const branch = selectBranch({ availability, faultMode });
  push({
    phase: 'VALIDATION',
    type: EVENT_TYPES.CONFIG_VALIDATED,
    status: search.ready ? 'success' : 'blocked',
    actorId: 'system',
    toolId: null,
    outputRef: availabilityPayload,
    branchId: branch.branchId,
    ruleId: 'rule.tool.availability',
    message: `配置校验：${search.label} ${search.ready ? '就绪' : `不可用（${search.blockCode}）`} · ${reader.label} ${reader.ready ? '就绪' : `不可用（${reader.blockCode}）`}`,
  });

  const commonArtifacts = () => ({
    payloads,
    internal,
    report: { status: 'not_generated', note: mission.reportNote },
    plan: mission.plan.map((p) => ({ ...p })),
  });

  /* ================= B02：检索工具不可用 → 校验阶段阻断 ================= */
  if (branch.branchId === 'B02_NO_SEARCH') {
    push({
      phase: 'VALIDATION',
      type: EVENT_TYPES.VALIDATION_BLOCKED,
      status: 'blocked',
      actorId: 'system',
      toolId: 'announcement_search',
      inputRef: availabilityPayload,
      branchId: 'B02_NO_SEARCH',
      ruleId: branch.ruleId,
      message: `${branch.reason}；本次运行不会产生任何成功的检索或读取事件`,
    });
    push({
      phase: 'END',
      type: EVENT_TYPES.RUN_COMPLETED,
      status: 'blocked',
      actorId: 'system',
      branchId: 'B02_NO_SEARCH',
      message: `运行结束：blocked（被阻断）· 未取得样本资料，也未生成报告`,
    });
    return finalize({
      runId,
      mission,
      snapshot,
      faultMode,
      outcome: 'blocked',
      branchId: 'B02_NO_SEARCH',
      events,
      artifacts: {
        ...commonArtifacts(),
        evidence: { level: null, sourceIds: [], chunkIds: [], note: '未取得任何样本资料：检索工具不可用，任务没有真正开始。' },
      },
      toolsInvoked,
      problems,
    });
  }

  /* ---------------- 02 任务规划（固定演示步骤，非真实模型推理） ---------------- */
  const planPayload = addPayload('p:plan', {
    kind: 'task.plan',
    simulatedPlan: true,
    note: '本阶段使用固定简化步骤，不是真实模型的推理过程。',
    steps: mission.plan.map((p) => ({ ...p })),
  });
  push({
    phase: 'PLAN',
    type: EVENT_TYPES.TASK_PLAN,
    status: 'info',
    actorId: 'model_core',
    inputRef: addPayload('p:task', {
      kind: 'task.input',
      missionId: mission.missionId,
      missionVersion: mission.missionVersion,
      corpusVersion: mission.corpusVersion,
      title: mission.title,
      query: { ...mission.query },
    }),
    outputRef: planPayload,
    branchId: branch.branchId,
    ruleId: 'rule.plan.fixedDemoPlan',
    message: '固定演示规划：检索公告 → 读取首条命中 → 记录样本资料（不是真实模型在思考）',
  });

  /* ---------------- 03 检索请求 ---------------- */
  const searchRequestPayload = addPayload('p:search-request', {
    kind: 'search.request',
    toolId: 'announcement_search',
    simulated: true,
    caller: 'model_core',
    arguments: { searchScope: search.settings.searchScope, maxResults: search.settings.maxResults },
    argumentsText: `范围 ${paramText('announcement_search', 'searchScope', search.settings.searchScope)} · 结果上限 ${paramText('announcement_search', 'maxResults', search.settings.maxResults)}`,
    permissionCheck: { required: 'read', granted: search.permissions.read === true, note: '只读模拟权限，不是浏览器文件权限' },
  });
  push({
    phase: 'SEARCH',
    type: EVENT_TYPES.TOOL_CALL,
    status: 'started',
    actorId: 'model_core',
    toolId: 'announcement_search',
    inputRef: searchRequestPayload,
    branchId: branch.branchId,
    ruleId: 'rule.search.call',
    message: `模型核心提出检索请求：范围 ${paramText('announcement_search', 'searchScope', search.settings.searchScope)} · 上限 ${paramText('announcement_search', 'maxResults', search.settings.maxResults)}（实际执行由运行环境完成）`,
  });

  /* ---------------- 04 检索执行：超时 / 成功 / 空结果 ---------------- */
  if (branch.branchId === 'B04_SEARCH_TIMEOUT') {
    const tool = getSimulationTool('announcement_search');
    const result = tool.run({ settings: search.settings, corpus: mission.notices, faultMode });
    const errorPayload = addPayload('p:search-error', {
      kind: 'search.error',
      toolId: 'announcement_search',
      simulated: true,
      code: result.ok ? 'UNEXPECTED' : result.error.code,
      message: result.ok ? '内部错误：故障分支未返回错误' : result.error.message,
    });
    push({
      phase: 'SEARCH',
      type: EVENT_TYPES.TOOL_ERROR,
      status: 'error',
      actorId: 'announcement_search',
      toolId: 'announcement_search',
      inputRef: searchRequestPayload,
      outputRef: errorPayload,
      branchId: 'B04_SEARCH_TIMEOUT',
      ruleId: branch.ruleId,
      message: result.ok ? '检索意外成功（不应发生）' : `${result.error.message}；没有返回任何条目，也没有伪造成功响应`,
    });
    push({
      phase: 'END',
      type: EVENT_TYPES.RUN_COMPLETED,
      status: 'error',
      actorId: 'system',
      branchId: 'B04_SEARCH_TIMEOUT',
      message: `运行结束：error（出错结束）· ${OUTCOME_META.error.note} 正式重试与回退策略属于下一阶段。`,
    });
    return finalize({
      runId,
      mission,
      snapshot,
      faultMode,
      outcome: 'error',
      branchId: 'B04_SEARCH_TIMEOUT',
      events,
      artifacts: {
        ...commonArtifacts(),
        evidence: { level: null, sourceIds: [], chunkIds: [], note: '未取得任何样本资料：检索在本次运行中确定性地超时。' },
      },
      toolsInvoked,
      problems,
    });
  }

  const searchTool = getSimulationTool('announcement_search');
  const searchResult = searchTool.run({ settings: search.settings, corpus: mission.notices, faultMode });
  if (!searchResult.ok) {
    const errorPayload = addPayload('p:search-error', {
      kind: 'search.error',
      toolId: 'announcement_search',
      simulated: true,
      code: searchResult.error.code,
      message: searchResult.error.message,
    });
    push({
      phase: 'SEARCH',
      type: EVENT_TYPES.TOOL_ERROR,
      status: 'error',
      actorId: 'announcement_search',
      toolId: 'announcement_search',
      inputRef: searchRequestPayload,
      outputRef: errorPayload,
      branchId: branch.branchId,
      ruleId: 'rule.search.arguments',
      message: `${searchResult.error.message}；没有伪造成功响应`,
    });
    push({
      phase: 'END',
      type: EVENT_TYPES.RUN_COMPLETED,
      status: 'error',
      actorId: 'system',
      branchId: branch.branchId,
      message: `运行结束：error（出错结束）· ${OUTCOME_META.error.note}`,
    });
    return finalize({
      runId,
      mission,
      snapshot,
      faultMode,
      outcome: 'error',
      branchId: branch.branchId,
      events,
      artifacts: { ...commonArtifacts(), evidence: { level: null, sourceIds: [], chunkIds: [], note: '未取得任何样本资料。' } },
      toolsInvoked,
      problems,
    });
  }

  const searchMeta = searchResult.meta;
  const branchId = refineBranchAfterSearch(branch.branchId, searchMeta);
  const returnedIds = searchResult.payload.items.map((i) => i.sourceId);
  const searchResponsePayload = addPayload('p:search-response', searchResult.payload);
  internal['i:search'] = deepFreeze(deepClone({ scope: searchMeta.scope, candidates: searchMeta.candidates, returned: searchMeta.returned }));

  const countText = searchMeta.truncated
    ? `候选 ${searchMeta.candidates} 条，受上限 ${searchMeta.maxResults} 限制返回 ${searchMeta.returned} 条（已截断）`
    : `候选 ${searchMeta.candidates} 条，全部返回 ${searchMeta.returned} 条（未触及上限 ${searchMeta.maxResults}）`;

  push({
    phase: 'SEARCH',
    type: EVENT_TYPES.TOOL_RESULT,
    status: 'success',
    actorId: 'announcement_search',
    toolId: 'announcement_search',
    inputRef: searchRequestPayload,
    outputRef: searchResponsePayload,
    sourceIds: returnedIds,
    branchId,
    ruleId: 'rule.search.result',
    message: `检索返回：${countText}`,
  });

  /* ================= B05：检索成功但没有条目 → 不调用 Reader ================= */
  if (branchId === 'B05_NO_RESULTS' || searchMeta.returned === 0) {
    push({
      phase: 'SEARCH',
      type: EVENT_TYPES.SEARCH_EMPTY,
      status: 'info',
      actorId: 'system',
      toolId: 'announcement_search',
      inputRef: searchResponsePayload,
      branchId: 'B05_NO_RESULTS',
      ruleId: 'rule.search.empty',
      message: `范围内没有匹配条目（${paramText('announcement_search', 'searchScope', search.settings.searchScope)}）：不会调用读取工具，任务无法继续`,
    });
    push({
      phase: 'END',
      type: EVENT_TYPES.RUN_COMPLETED,
      status: 'info',
      actorId: 'system',
      branchId: 'B05_NO_RESULTS',
      message: `运行结束：partial（部分完成）· 检索本身成功，但没有任何可读取的资料，未取得样本资料`,
    });
    return finalize({
      runId,
      mission,
      snapshot,
      faultMode,
      outcome: 'partial',
      branchId: 'B05_NO_RESULTS',
      events,
      artifacts: {
        ...commonArtifacts(),
        evidence: { level: null, sourceIds: [], chunkIds: [], note: '检索成功但候选为 0 条，因此没有取得任何样本资料。' },
      },
      toolsInvoked,
      problems,
    });
  }

  const targetSourceId = searchMeta.firstSourceId;

  /* ================= B03：读取工具不可用 ================= */
  if (!reader.ready) {
    const readRequestPayload = addPayload('p:read-request', {
      kind: 'read.request',
      toolId: 'document_reader',
      simulated: true,
      caller: 'model_core',
      arguments: { sourceId: targetSourceId, readMode: reader.settings.readMode, includeMetadata: reader.settings.includeMetadata === true },
      argumentsText: `资料 ${targetSourceId} · 读取方式 ${
        reader.installed ? paramText('document_reader', 'readMode', reader.settings.readMode) : '未配置'
      }`,
      permissionCheck: { required: 'read', granted: reader.permissions.read === true, note: '只读模拟权限' },
    });
    const blockedPayload = addPayload('p:read-blocked', {
      kind: 'read.blocked',
      toolId: 'document_reader',
      simulated: true,
      blockCode: reader.blockCode,
      status: reader.status,
      reason: reader.blockReason,
      executed: false,
      note: '运行环境在派发前发现该工具不可用，因此工具从未执行，也不存在任何读取结果。',
    });
    push({
      phase: 'READ',
      type: EVENT_TYPES.TOOL_CALL,
      status: 'blocked',
      actorId: 'model_core',
      toolId: 'document_reader',
      inputRef: readRequestPayload,
      outputRef: blockedPayload,
      sourceIds: [targetSourceId],
      branchId: 'B03_NO_READER',
      ruleId: branch.ruleId,
      message: `读取请求被阻断：${reader.blockReason} · 该工具本次从未执行，没有读取正文`,
    });

    const evidencePayload = addPayload('p:evidence', {
      kind: 'evidence.sample',
      level: 'search_excerpt',
      levelCn: '检索摘要级（来自搜索结果，不是工具读取的正文）',
      verified: false,
      sourceIds: [targetSourceId],
      chunkIds: [],
      note: '只记录了检索返回的条目摘要；全文未被读取。资料真实性与冲突核验属于下一阶段。',
    });
    push({
      phase: 'EVIDENCE',
      type: EVENT_TYPES.EVIDENCE_SAMPLE,
      status: 'info',
      actorId: 'system',
      toolId: 'announcement_search',
      outputRef: evidencePayload,
      sourceIds: [targetSourceId],
      branchId: 'B03_NO_READER',
      ruleId: 'rule.evidence.fromSearchExcerpt',
      message: '已记录 1 条样本资料（检索摘要级）· 仅表示取得本地模拟条目摘要，不代表已读全文或真实性核验',
    });
    push({
      phase: 'END',
      type: EVENT_TYPES.RUN_COMPLETED,
      status: 'info',
      actorId: 'system',
      branchId: 'B03_NO_READER',
      message: `运行结束：partial（部分完成）· 读取工具不可用，以摘要级资料结束；本阶段不生成报告`,
    });
    return finalize({
      runId,
      mission,
      snapshot,
      faultMode,
      outcome: 'partial',
      branchId: 'B03_NO_READER',
      events,
      artifacts: {
        ...commonArtifacts(),
        evidence: {
          level: 'search_excerpt',
          sourceIds: [targetSourceId],
          chunkIds: [],
          note: '以检索摘要级资料结束：读取工具不可用，没有已读全文事件。',
        },
      },
      toolsInvoked,
      problems,
    });
  }

  /* ================= B01：正常完成 ================= */
  const readMode = String(reader.settings.readMode);
  const includeMetadata = reader.settings.includeMetadata === true;
  const readRequestPayload = addPayload('p:read-request', {
    kind: 'read.request',
    toolId: 'document_reader',
    simulated: true,
    caller: 'model_core',
    arguments: { sourceId: targetSourceId, readMode, includeMetadata },
    argumentsText: `资料 ${targetSourceId} · 读取方式 ${paramText('document_reader', 'readMode', readMode)} · 元数据 ${paramText('document_reader', 'includeMetadata', includeMetadata)}`,
    permissionCheck: { required: 'read', granted: true, note: '只读模拟权限，不是浏览器文件权限' },
  });
  push({
    phase: 'READ',
    type: EVENT_TYPES.TOOL_CALL,
    status: 'started',
    actorId: 'model_core',
    toolId: 'document_reader',
    inputRef: readRequestPayload,
    sourceIds: [targetSourceId],
    branchId: 'B01_NORMAL',
    ruleId: 'rule.reader.call',
    message: `模型核心提出读取请求：${paramText('document_reader', 'readMode', readMode)} · 元数据 ${paramText('document_reader', 'includeMetadata', includeMetadata)}（执行由运行环境完成）`,
  });

  const readTool = getSimulationTool('document_reader');
  const readResult = readTool.run({ settings: reader.settings, sourceId: targetSourceId });
  if (!readResult.ok) {
    const errorPayload = addPayload('p:read-error', {
      kind: 'read.error',
      toolId: 'document_reader',
      simulated: true,
      code: readResult.error.code,
      message: readResult.error.message,
    });
    push({
      phase: 'READ',
      type: EVENT_TYPES.TOOL_ERROR,
      status: 'error',
      actorId: 'document_reader',
      toolId: 'document_reader',
      inputRef: readRequestPayload,
      outputRef: errorPayload,
      sourceIds: [targetSourceId],
      branchId: 'B01_NORMAL',
      ruleId: 'rule.reader.arguments',
      message: `${readResult.error.message}；没有伪造正文内容`,
    });
    push({
      phase: 'END',
      type: EVENT_TYPES.RUN_COMPLETED,
      status: 'error',
      actorId: 'system',
      branchId: 'B01_NORMAL',
      message: `运行结束：error（出错结束）· ${OUTCOME_META.error.note}`,
    });
    return finalize({
      runId,
      mission,
      snapshot,
      faultMode,
      outcome: 'error',
      branchId: 'B01_NORMAL',
      events,
      artifacts: { ...commonArtifacts(), evidence: { level: null, sourceIds: [], chunkIds: [], note: '读取失败，未取得样本资料。' } },
      toolsInvoked,
      problems,
    });
  }

  const readPayloadId = addPayload('p:read-response', readResult.payload);
  // 内部追踪元数据与用户可见的工具响应分开存放：关闭元数据时不会「悄悄补回」
  internal['i:read'] = deepFreeze(deepClone({ ...readResult.meta.internal, requestedSourceId: targetSourceId, readMode }));

  const scopeText = readResult.meta.textScope === 'full_text' ? '完整正文' : '预先定义的摘要（未读取正文）';
  push({
    phase: 'READ',
    type: EVENT_TYPES.TOOL_RESULT,
    status: 'success',
    actorId: 'document_reader',
    toolId: 'document_reader',
    inputRef: readRequestPayload,
    outputRef: readPayloadId,
    sourceIds: [readResult.meta.sourceId],
    chunkIds: readResult.meta.chunkIds,
    branchId: 'B01_NORMAL',
    ruleId: 'rule.reader.result',
    message: `读取返回：${scopeText} · ${readResult.meta.chunkIds.length} 个片段 · 元数据${includeMetadata ? '已包含（用户可见）' : '已按要求关闭（用户可见响应中不含来源与日期）'}`,
  });

  const evidenceLevel = readResult.meta.textScope === 'full_text' ? 'full_text' : 'summary_chunk';
  const evidencePayload = addPayload('p:evidence', {
    kind: 'evidence.sample',
    level: evidenceLevel,
    levelCn: evidenceLevel === 'full_text' ? '全文片段' : '摘要片段',
    verified: false,
    sourceIds: [readResult.meta.sourceId],
    chunkIds: readResult.meta.chunkIds,
    textTruncated: readResult.payload.textTruncated === true,
    note: '仅表示已从本地模拟语料取得这些片段；不代表资料真实性已核验，也不构成正式引用溯源。',
  });
  push({
    phase: 'EVIDENCE',
    type: EVENT_TYPES.EVIDENCE_SAMPLE,
    status: 'success',
    actorId: 'system',
    toolId: 'document_reader',
    outputRef: evidencePayload,
    sourceIds: [readResult.meta.sourceId],
    chunkIds: readResult.meta.chunkIds,
    branchId: 'B01_NORMAL',
    ruleId: 'rule.evidence.fromReadResult',
    message: `已记录 1 条样本资料（${evidenceLevel === 'full_text' ? '全文片段' : '摘要片段'}）· 取得样本不等于真实性核验`,
  });
  push({
    phase: 'END',
    type: EVENT_TYPES.RUN_COMPLETED,
    status: 'success',
    actorId: 'system',
    branchId: 'B01_NORMAL',
    message: `运行结束：sample_acquired（已取得样本资料）· 本阶段不生成研究报告，资料冲突与引用溯源属于下一阶段`,
  });

  return finalize({
    runId,
    mission,
    snapshot,
    faultMode,
    outcome: 'sample_acquired',
    branchId: 'B01_NORMAL',
    events,
    artifacts: {
      ...commonArtifacts(),
      evidence: {
        level: evidenceLevel,
        sourceIds: [readResult.meta.sourceId],
        chunkIds: readResult.meta.chunkIds,
        note: '已取得本地样本片段；不代表真实性核验，也未生成报告。',
      },
    },
    toolsInvoked,
    problems,
  });
}

/** 统一装配返回值：冻结、补全统计。引擎不写入任何真实时间戳： */
function finalize({ runId, mission, snapshot, faultMode, outcome, branchId, events, artifacts, toolsInvoked, problems }) {
  const searches = events.filter((e) => e.type === EVENT_TYPES.TOOL_RESULT && e.toolId === 'announcement_search').length;
  const reads = events.filter((e) => e.type === EVENT_TYPES.TOOL_RESULT && e.toolId === 'document_reader').length;
  const notes = [
    '本地教学模拟：不接入真实搜索服务、真实 MCP Server 或在线 AI。',
    mission.reportNote,
    mission.dataNote,
  ];
  for (const p of problems || []) notes.push(p);
  return deepFreeze({
    schemaVersion: SIMULATION_SCHEMA_VERSION,
    runId,
    missionId: mission.missionId,
    missionVersion: mission.missionVersion,
    corpusVersion: mission.corpusVersion,
    configSnapshot: snapshot,
    options: { faultMode },
    outcome,
    branchId,
    events,
    artifacts,
    stats: {
      eventCount: events.length,
      toolsInvoked: [...toolsInvoked],
      searches,
      reads,
      toolErrors: events.filter((e) => e.type === EVENT_TYPES.TOOL_ERROR).length,
      blocked: events.filter((e) => e.status === 'blocked').length,
    },
    notes,
  });
}

/**
 * 运行结果的只读摘要：执行台标题、状态条与自检脚本共用。
 * 只用事件与 outcome 派生，不看任何视觉状态。
 */
export function summarizeRun(run) {
  if (!run) return null;
  const meta = OUTCOME_META[run.outcome] || OUTCOME_META.error;
  const last = run.events[run.events.length - 1] || null;
  return {
    runId: run.runId,
    outcome: run.outcome,
    outcomeEn: meta.en,
    outcomeCn: meta.cn,
    tone: meta.tone,
    note: meta.note,
    branchId: run.branchId,
    eventCount: run.events.length,
    lastMessage: last ? last.message : '',
    evidence: run.artifacts?.evidence || null,
    report: run.artifacts?.report || null,
    toolsInvoked: run.stats?.toolsInvoked || [],
  };
}

export { EVENT_TYPES, ACTORS };
