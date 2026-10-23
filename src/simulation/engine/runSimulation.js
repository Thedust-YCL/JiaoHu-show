/**
 * src/simulation/engine/runSimulation.js
 * ------------------------------------------------------------------
 * 模拟引擎：**纯逻辑**，不引用 DOM、Canvas、Three.js、动画帧或 React。
 *
 * 单向数据流（M0.3_TASK §0.3 / M0.4_TASK §0.4）：
 *     已确认 Constructor 配置快照 + 任务包版本 + 本次运行策略/故障选项
 *        → 纯规则判定 → 确定性事件序列 + 结构化证据 → 报告与可视化投影
 *
 * M0.4 增量（不是第二个引擎）：
 *   · 读取阶段从「只读第一条」扩展为「按任务包声明读取本次可见的多条」，
 *     mini 任务包声明 readLimit=1，因此 M0.3 的轨迹逐事件保持不变；
 *   · 具备研究能力的任务包（mission-001）在读取之后进入证据阶段：
 *     可见声明抽取 → 冲突分组 → 更正关系核验 → 报告装配；
 *   · 证据与报告都只来自**本次真正返回的工具响应**，不读隐藏数据包。
 *
 * 运行开始时会深拷贝并冻结输入快照，因此之后在装配台里改参数或移除模块，
 * 都不会重写已经产生的历史轨迹（A23 / A50）。
 * ------------------------------------------------------------------
 */
import {
  EVIDENCE_POLICIES,
  EVENT_TYPES,
  FAULT_MODES,
  OUTCOME_META,
  SIMULATION_SCHEMA_VERSION,
  createEvent,
  evidencePolicyMeta,
} from '../events/schema.js';
import { deepClone, deepFreeze, deriveRunId } from '../events/serializer.js';
import { deriveToolAvailability } from '../rules/availability.js';
import { evaluateEvidence, PREDICATES, REVISION_STATUS } from '../rules/evidence/index.js';
import { evidenceBranchesFor, refineBranchAfterSearch, selectBranch, selectEvidenceBranch } from '../rules/branches.js';
import { generateReport } from '../reports/generateReport.js';
import { getSimulationTool, paramText } from '../tools/registry.js';
import { loadMission, missionSupportsResearch } from '../../research-packs/index.js';
import { prepareCorpus } from '../../research-packs/mission-001/validate.js';

/** 默认的空白快照：没有任何已装配模块，运行会走 B02 阻断分支 */
export const EMPTY_CONFIG_SNAPSHOT = Object.freeze({ schemaVersion: 1, modules: Object.freeze([]) });

/** 默认研究策略：核验更正关系 */
export const DEFAULT_EVIDENCE_POLICY = 'VERIFY_REVISIONS';

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

/** 研究策略：缺省时使用文档约定的默认值，不因读不到字段而崩溃（A48） */
function resolveEvidencePolicy(runOptions, problems) {
  const raw = runOptions?.evidencePolicy ?? DEFAULT_EVIDENCE_POLICY;
  if (!EVIDENCE_POLICIES.includes(raw)) {
    problems.push(`未知研究策略「${String(raw)}」，已按 ${DEFAULT_EVIDENCE_POLICY} 处理`);
    return DEFAULT_EVIDENCE_POLICY;
  }
  return raw;
}

/** 本次实际读多少条：mini 为 1（保持 M0.3 轨迹），研究包按自身声明并封顶 */
function readLimitOf(mission, returned) {
  const declared = mission?.research?.readLimit;
  if (!Number.isInteger(declared) || declared < 1) return 1;
  return Math.min(returned, declared);
}

function configSummaryOf(snapshot) {
  const modules = Array.isArray(snapshot?.modules) ? snapshot.modules : [];
  const find = (id) => modules.find((m) => m && m.moduleId === id) || null;
  const search = find('announcement_search');
  const reader = find('document_reader');
  return {
    tools: modules.map((m) => `${m.moduleId}${m.enabled === false ? '(Disabled)' : ''}`).join(' + ') || '未装配任何模块',
    searchScope: search?.settings?.searchScope ?? null,
    maxResults: search?.settings?.maxResults ?? null,
    readMode: reader?.settings?.readMode ?? null,
    includeMetadata: reader ? reader.settings?.includeMetadata === true : null,
    searchEnabled: search ? search.enabled !== false && search.permissions?.read === true : false,
    readerEnabled: reader ? reader.enabled !== false && reader.permissions?.read === true : false,
  };
}

/**
 * 执行一次浏览器本地教学模拟。
 *
 * @param {object} constructorSnapshot M0.2 已确认配置的快照 `{ schemaVersion, modules }`
 * @param {object|string} missionData  研究样本包（或它的 missionId）
 * @param {{faultMode?:string, evidencePolicy?:string}} runOptions 本次运行选项
 * @returns {object} 冻结的 SimulationRun
 */
export function runSimulation(constructorSnapshot, missionData = null, runOptions = {}) {
  const problems = [];
  const snapshot = normalizeSnapshot(constructorSnapshot);
  const mission = resolveMission(missionData);
  const faultMode = resolveFaultMode(runOptions, problems);
  const evidencePolicy = resolveEvidencePolicy(runOptions, problems);
  const research = missionSupportsResearch(mission);

  /* ---------------- 任务数据不可用：安全降级为可解释的错误运行 ---------------- */
  if (!mission) {
    const runId = deriveRunId({ missionId: 'unknown', missionVersion: 0, configSnapshot: snapshot, faultMode, evidencePolicy });
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
      options: Object.freeze({ faultMode, evidencePolicy }),
      outcome: 'error',
      branchId: 'B02_NO_SEARCH',
      evidenceBranchId: null,
      events,
      artifacts: {
        payloads: {},
        internal: {},
        evidence: { level: null, sourceIds: [], chunkIds: [], note: '未取得任何样本资料' },
        report: { status: 'blocked', note: '任务数据不可用，未生成任何内容。' },
        plan: [],
      },
      stats: { eventCount: events.length, toolsInvoked: [], searches: 0, reads: 0, toolCalls: 0, toolErrors: 0 },
      notes: ['任务数据不可用，未执行任何工具调用。', ...problems],
    });
  }

  const availability = deriveToolAvailability(snapshot);
  const runId = deriveRunId({ missionId: mission.missionId, missionVersion: mission.missionVersion, configSnapshot: snapshot, faultMode, evidencePolicy });

  /* 语料安全降级：损坏资料从本次语料中剔除，并如实记录（A38） */
  const prepared = prepareCorpus(mission.notices || []);
  const corpus = prepared.notices;

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

  const config = configSummaryOf(snapshot);
  const policyMeta = evidencePolicyMeta(evidencePolicy);

  /* ---------------- 00 运行开始 ---------------- */
  const faultMeta = faultMode === 'normal' ? '正常运行（未注入故障）' : '本次运行注入了 search_timeout 故障条件';
  push({
    phase: 'VALIDATION',
    type: EVENT_TYPES.RUN_STARTED,
    status: 'info',
    actorId: 'system',
    message: `开始本地教学模拟：任务 ${mission.missionId}@${mission.missionVersion} · ${faultMeta} · 研究策略 ${policyMeta.en} · 无真实网络请求`,
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
    message: `配置校验：${search.label} ${search.ready ? '就绪' : `不可用（${search.blockCode}）`} · ${reader.label} ${reader.ready ? '就绪' : `不可用（${reader.blockCode}）`} · 研究策略 ${policyMeta.cn}`,
  });

  if (prepared.dropped.length > 0) {
    addPayload('p:corpus-problems', { kind: 'corpus.problems', dropped: prepared.dropped });
    push({
      phase: 'VALIDATION',
      type: EVENT_TYPES.VALIDATION_BLOCKED,
      status: 'info',
      actorId: 'system',
      outputRef: 'p:corpus-problems',
      branchId: branch.branchId,
      ruleId: 'rule.corpus.integrity',
      message: `研究包校验：${prepared.dropped.length} 条资料因数据缺陷被剔除（不会崩溃，也不会被采信）· ${prepared.dropped[0].message}`,
    });
  }

  const baseArtifacts = () => ({
    payloads,
    internal,
    plan: (mission.plan || []).map((p) => ({ ...p })),
  });

  /* ---------------- 研究阶段（仅在取得可读证据后执行） ---------------- */
  /**
   * 证据 / 报告阶段。`reads` 是本次真正可见的读取记录；
   * 读取工具不可用时，用搜索摘要构造「仅搜索摘要线索」的可见记录。
   */
  function runEvidenceStage(reads, searchMeta, options = {}) {
    const { allowReport = true, noReader = false } = options;
    const evidence = evaluateEvidence({ reads, search: searchMeta, policy: evidencePolicy, mission });
    const evidenceBranch = selectEvidenceBranch(evidence.resolutions);
    const evidenceBranches = evidenceBranchesFor(evidence.resolutions);

    /* 可见声明的抽取结果：这是「原始资料 → 可见证据 → claim」链路的中段 */
    const claimsPayloadId = addPayload('p:claims', {
      kind: 'evidence.claims',
      policy: evidencePolicy,
      claimCount: evidence.claims.length,
      claims: evidence.claims.map((c) => ({
        claimId: c.claimId,
        predicate: c.predicate,
        value: c.value,
        subject: c.subject,
        sourceId: c.sourceId,
        chunkId: c.chunkId,
        textScope: c.textScope,
        fromMetadata: c.fromMetadata,
      })),
      simulated: true,
    });
    push({
      phase: 'EVIDENCE',
      type: EVENT_TYPES.EVIDENCE_CLAIMS,
      status: 'success',
      actorId: 'evidence_kernel',
      outputRef: claimsPayloadId,
      sourceIds: evidence.visibleSourceIds,
      chunkIds: [...new Set(evidence.claims.map((c) => c.chunkId))],
      claimIds: evidence.claims.map((c) => c.claimId),
      branchId: evidenceBranch.branchId,
      ruleId: 'rule.evidence.claims.extract',
      message: `从本次实际返回的文本抽取到 ${evidence.claims.length} 条可见事实声明（其中 ${evidence.claims.filter((c) => !c.fromMetadata).length} 条来自文本，${evidence.claims.filter((c) => c.fromMetadata).length} 条来自元数据）`,
    });

    // 冲突事件先出现（Amber），随后才是判定结果
    for (const conflict of evidence.conflicts) {
      const payloadId = addPayload(`p:conflict:${conflict.conflictId}`, {
        kind: 'evidence.conflict',
        conflictId: conflict.conflictId,
        subject: conflict.subject,
        predicate: conflict.predicate,
        predicateLabel: conflict.predicateLabel,
        values: conflict.values.map((v) => ({ value: v.value, sourceIds: v.sourceIds, claimIds: v.claimIds })),
        simulated: true,
      });
      const titles = conflict.sourceIds.map((id) => `《${mission.getNotice?.(id)?.title || id}》`).join(' 与 ');
      const conflictChunkIds = [...new Set(conflict.claimIds.map((cid) => evidence.claims.find((c) => c.claimId === cid)?.chunkId).filter(Boolean))];
      const ev = push({
        phase: 'EVIDENCE',
        type: EVENT_TYPES.EVIDENCE_CONFLICT,
        status: 'info',
        actorId: 'evidence_kernel',
        outputRef: payloadId,
        sourceIds: conflict.sourceIds,
        chunkIds: conflictChunkIds,
        claimIds: conflict.claimIds,
        branchId: evidenceBranch.branchId,
        ruleId: 'rule.evidence.conflict.group',
        message: `发现冲突：${titles} 对「${conflict.predicateLabel}」给出 ${conflict.values.length} 种不同取值（${conflict.values.map((v) => v.value).join(' / ')}）`,
      });
      conflict.eventId = ev.id;
    }

    for (const resolution of evidence.resolutions) {
      const typeMap = {
        [REVISION_STATUS.CONFIRMED]: EVENT_TYPES.EVIDENCE_REVISION_CONFIRMED,
        [REVISION_STATUS.SKIPPED]: EVENT_TYPES.EVIDENCE_VERIFICATION_SKIPPED,
        [REVISION_STATUS.UNRESOLVED]: EVENT_TYPES.EVIDENCE_CONFLICT_UNRESOLVED,
        [REVISION_STATUS.INSUFFICIENT]: EVENT_TYPES.EVIDENCE_INSUFFICIENT,
        [REVISION_STATUS.METADATA_MISSING]: EVENT_TYPES.EVIDENCE_METADATA_MISSING,
      };
      const statusMap = {
        [REVISION_STATUS.CONFIRMED]: 'success',
        [REVISION_STATUS.SKIPPED]: 'skipped',
        [REVISION_STATUS.UNRESOLVED]: 'unresolved',
        [REVISION_STATUS.INSUFFICIENT]: 'unresolved',
        [REVISION_STATUS.METADATA_MISSING]: 'unresolved',
      };
      const payloadId = addPayload(`p:resolution:${resolution.conflictId}`, {
        kind: 'evidence.resolution',
        conflictId: resolution.conflictId,
        status: resolution.status,
        ruleId: resolution.ruleId,
        decision: resolution.decision,
        missing: resolution.missing,
        requirements: resolution.requirements,
        usedClaimIds: resolution.usedClaimIds,
        simulated: true,
      });
      const ev = push({
        phase: 'EVIDENCE',
        type: typeMap[resolution.status] || EVENT_TYPES.EVIDENCE_CONFLICT_UNRESOLVED,
        status: statusMap[resolution.status] || 'unresolved',
        actorId: 'evidence_kernel',
        outputRef: payloadId,
        sourceIds: resolution.oldSourceId ? [resolution.oldSourceId, resolution.newSourceId] : [],
        claimIds: resolution.usedClaimIds || resolution.claimIds || [],
        branchId: evidenceBranch.branchId,
        ruleId: resolution.ruleId,
        message: resolution.decision + ((resolution.missing || []).length ? `（未能满足：${resolution.missing.map((m) => m.code).join('、')}）` : ''),
      });
      resolution.eventId = ev.id;
    }

    // 报告装配：只在允许且确有可读证据时生成
    let report = null;
    if (allowReport) {
      const reportPayloadId = 'p:report';
      report = generateReport({
        runId,
        mission,
        evidence,
        reads,
        options: { evidencePolicy, faultMode },
        config,
        blocked: noReader && evidence.counts.sourcesRead === 0 && evidence.counts.searchReturned === 0 ? { reason: '检索没有返回任何资料', ruleId: 'rule.report.blocked' } : null,
        stats: { eventCount: events.length + 1, toolCalls: events.filter((e) => e.type === EVENT_TYPES.TOOL_CALL).length, toolErrors: events.filter((e) => e.type === EVENT_TYPES.TOOL_ERROR).length },
      });
      addPayload(reportPayloadId, { kind: 'report.document', generatedFrom: 'local-template', report });
      push({
        phase: 'REPORT',
        type: EVENT_TYPES.REPORT_GENERATED,
        status: report.status === 'complete' ? 'success' : report.status === 'blocked' ? 'blocked' : 'info',
        actorId: 'report_composer',
        outputRef: reportPayloadId,
        sourceIds: evidence.visibleSourceIds,
        claimIds: report.claims.map((c) => c.id),
        branchId: evidenceBranch.branchId,
        ruleId: 'rule.report.templateAssembly',
        message: `报告已装配：${report.status} · ${report.claims.length} 条结构化陈述 · ${report.citations.length} 条引用 · 由本地模板生成，未调用真实模型`,
      });
    }

    return { evidence, evidenceBranch, evidenceBranches, report };
  }

  const finalizeRun = ({ outcome, branchId, evidenceBranchId, evidenceBranchIds, extraArtifacts = {}, extraNotes = [] }) =>
    finalize({
      runId,
      mission,
      snapshot,
      faultMode,
      evidencePolicy,
      outcome,
      branchId,
      evidenceBranchId,
      evidenceBranchIds,
      events,
      artifacts: { ...baseArtifacts(), ...extraArtifacts },
      toolsInvoked,
      problems: [...problems, ...extraNotes],
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
    const blockedReport = research
      ? generateReport({
          runId,
          mission,
          evidence: evaluateEvidence({ reads: [], search: null, policy: evidencePolicy, mission }),
          reads: [],
          options: { evidencePolicy, faultMode },
          config,
          blocked: { reason: branch.reason, ruleId: branch.ruleId },
          stats: { eventCount: events.length + 1, toolCalls: 0, toolErrors: 0 },
        })
      : null;
    if (blockedReport) addPayload('p:report', { kind: 'report.document', generatedFrom: 'local-template', report: blockedReport });
    if (blockedReport) {
      push({
        phase: 'REPORT',
        type: EVENT_TYPES.REPORT_GENERATED,
        status: 'blocked',
        actorId: 'report_composer',
        outputRef: 'p:report',
        branchId: 'B02_NO_SEARCH',
        ruleId: 'rule.report.blocked',
        message: '报告已装配：blocked · 本次没有可用资料，报告只包含阻断说明，不含任何事实性结论',
      });
    }
    push({
      phase: 'END',
      type: EVENT_TYPES.RUN_COMPLETED,
      status: 'blocked',
      actorId: 'system',
      branchId: 'B02_NO_SEARCH',
      message: `运行结束：blocked（被阻断）· 未取得样本资料${research ? '，报告只保留阻断说明' : '，也未生成报告'}`,
    });
    return finalizeRun({
      outcome: 'blocked',
      branchId: 'B02_NO_SEARCH',
      evidenceBranchId: research ? 'E00_NO_CONFLICT' : null,
      extraArtifacts: {
        evidence: { level: null, sourceIds: [], chunkIds: [], note: '未取得任何样本资料：检索工具不可用，任务没有真正开始。' },
        report: blockedReport
          ? { ...blockedReport, note: `报告状态 blocked：${branch.reason}` }
          : { status: 'not_generated', note: mission.reportNote || '本阶段不生成报告。' },
      },
    });
  }

  /* ---------------- 02 任务规划（固定演示步骤，非真实模型推理） ---------------- */
  const planPayload = addPayload('p:plan', {
    kind: 'task.plan',
    simulatedPlan: true,
    note: '本阶段使用固定简化步骤，不是真实模型的推理过程。',
    steps: (mission.plan || []).map((p) => ({ ...p })),
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
      evidencePolicy,
      faultMode,
    }),
    outputRef: planPayload,
    branchId: branch.branchId,
    ruleId: 'rule.plan.fixedDemoPlan',
    message: research
      ? `固定演示规划：检索 → 逐条读取 → 抽取可见声明 → 识别冲突 → 核验更正关系 → 装配报告（不是真实模型在思考）`
      : '固定演示规划：检索公告 → 读取首条命中 → 记录样本资料（不是真实模型在思考）',
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
    const result = tool.run({ settings: search.settings, corpus, faultMode });
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
    const failedReport = research
      ? generateReport({
          runId,
          mission,
          evidence: evaluateEvidence({ reads: [], search: null, policy: evidencePolicy, mission }),
          reads: [],
          options: { evidencePolicy, faultMode },
          config,
          blocked: { reason: '检索在本次运行中确定性地超时，没有返回任何资料', ruleId: branch.ruleId },
          stats: { eventCount: events.length + 1, toolCalls: 1, toolErrors: 1 },
        })
      : null;
    if (failedReport) {
      addPayload('p:report', { kind: 'report.document', generatedFrom: 'local-template', report: failedReport });
      push({
        phase: 'REPORT',
        type: EVENT_TYPES.REPORT_GENERATED,
        status: 'blocked',
        actorId: 'report_composer',
        outputRef: 'p:report',
        branchId: 'B04_SEARCH_TIMEOUT',
        ruleId: 'rule.report.blocked',
        message: '报告已装配：blocked · 本次检索超时，报告只说明受限原因，不填充任何假数据',
      });
    }
    push({
      phase: 'END',
      type: EVENT_TYPES.RUN_COMPLETED,
      status: 'error',
      actorId: 'system',
      branchId: 'B04_SEARCH_TIMEOUT',
      message: `运行结束：error（出错结束）· ${OUTCOME_META.error.note} 正式重试与回退策略属于下一阶段。`,
    });
    return finalizeRun({
      outcome: 'error',
      branchId: 'B04_SEARCH_TIMEOUT',
      extraArtifacts: {
        evidence: { level: null, sourceIds: [], chunkIds: [], note: '未取得任何样本资料：检索在本次运行中确定性地超时。' },
        report: failedReport ? { ...failedReport, note: '报告状态 blocked：检索超时' } : { status: 'not_generated', note: mission.reportNote },
      },
    });
  }

  const searchTool = getSimulationTool('announcement_search');
  const searchResult = searchTool.run({ settings: search.settings, corpus, faultMode });
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
    return finalizeRun({
      outcome: 'error',
      branchId: branch.branchId,
      extraArtifacts: {
        evidence: { level: null, sourceIds: [], chunkIds: [], note: '未取得任何样本资料。' },
        report: { status: 'not_generated', note: mission.reportNote || '本次运行没有取得任何资料。' },
      },
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

  const searchResultEvent = push({
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
    if (research) {
      const emptyReport = generateReport({
        runId,
        mission,
        evidence: evaluateEvidence({ reads: [], search: searchMeta, policy: evidencePolicy, mission }),
        reads: [],
        options: { evidencePolicy, faultMode },
        config,
        blocked: { reason: `检索范围「${searchMeta.scopeCn || searchMeta.scope}」内没有匹配条目`, ruleId: 'rule.search.empty' },
        stats: { eventCount: events.length + 1, toolCalls: 1, toolErrors: 0 },
      });
      addPayload('p:report', { kind: 'report.document', generatedFrom: 'local-template', report: emptyReport });
      push({
        phase: 'REPORT',
        type: EVENT_TYPES.REPORT_GENERATED,
        status: 'blocked',
        actorId: 'report_composer',
        outputRef: 'p:report',
        branchId: 'B05_NO_RESULTS',
        ruleId: 'rule.report.blocked',
        message: '报告已装配：blocked · 本次没有任何可读取的资料，报告只说明检索受限',
      });
      push({
        phase: 'END',
        type: EVENT_TYPES.RUN_COMPLETED,
        status: 'info',
        actorId: 'system',
        branchId: 'B05_NO_RESULTS',
        message: '运行结束：partial（部分完成）· 检索本身成功，但没有任何可读取的资料',
      });
      return finalizeRun({
        outcome: 'partial',
        branchId: 'B05_NO_RESULTS',
        evidenceBranchId: 'E00_NO_CONFLICT',
        extraArtifacts: {
          evidence: { level: null, sourceIds: [], chunkIds: [], note: '检索成功但候选为 0 条，因此没有取得任何样本资料。' },
          report: { ...emptyReport, note: '报告状态 blocked：检索范围内没有条目' },
        },
      });
    }
    push({
      phase: 'END',
      type: EVENT_TYPES.RUN_COMPLETED,
      status: 'info',
      actorId: 'system',
      branchId: 'B05_NO_RESULTS',
      message: `运行结束：partial（部分完成）· 检索本身成功，但没有任何可读取的资料，未取得样本资料`,
    });
    return finalizeRun({
      outcome: 'partial',
      branchId: 'B05_NO_RESULTS',
      extraArtifacts: {
        evidence: { level: null, sourceIds: [], chunkIds: [], note: '检索成功但候选为 0 条，因此没有取得任何样本资料。' },
        report: { status: 'not_generated', note: mission.reportNote },
      },
    });
  }

  /* ---------------- 05 读取阶段 ---------------- */
  const targetSourceId = searchMeta.firstSourceId;
  const reads = [];
  const readChunkIds = [];
  const readSourceIds = [];

  /** 把搜索结果条目当作「仅搜索摘要线索」的可见记录（Reader 不可用时使用） */
  function searchExcerptReads() {
    return searchResult.payload.items.map((item) => ({
      sourceId: item.sourceId,
      title: item.title,
      eventId: searchResultEvent.id,
      textScope: 'search_excerpt',
      chunks: [{ chunkId: item.chunkId, kind: 'summary', text: item.excerpt }],
      metadata: null,
    }));
  }

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

    const excerptReads = research ? searchExcerptReads() : [];
    const evidencePayload = addPayload('p:evidence', {
      kind: 'evidence.sample',
      level: 'search_excerpt',
      levelCn: '检索摘要级（来自搜索结果，不是工具读取的正文）',
      verified: false,
      sourceIds: returnedIds,
      chunkIds: searchResult.payload.items.map((i) => i.chunkId),
      note: research
        ? '只记录了检索返回的条目摘要；正文未被读取，因此任何涉及正文的核验都只能保持未决。'
        : '只记录了检索返回的条目摘要；全文未被读取。资料真实性与冲突核验属于下一阶段。',
    });
    push({
      phase: 'EVIDENCE',
      type: EVENT_TYPES.EVIDENCE_SAMPLE,
      status: 'info',
      actorId: 'system',
      toolId: 'announcement_search',
      outputRef: evidencePayload,
      sourceIds: returnedIds,
      chunkIds: searchEvidenceChunks(searchResult),
      branchId: 'B03_NO_READER',
      ruleId: 'rule.evidence.fromSearchExcerpt',
      message: `已记录 ${returnedIds.length} 条证据（检索摘要级）· 仅表示取得本地模拟条目摘要，不代表已读全文或真实性核验`,
    });

    if (research) {
      const stage = runEvidenceStage(excerptReads, searchMeta, { noReader: true });
      push({
        phase: 'END',
        type: EVENT_TYPES.RUN_COMPLETED,
        status: 'info',
        actorId: 'system',
        branchId: 'B03_NO_READER',
        message: `运行结束：partial（部分完成）· 读取工具不可用，以检索摘要级资料结束；报告已按有限证据装配`,
      });
      return finalizeRun({
        outcome: 'partial',
        branchId: 'B03_NO_READER',
        evidenceBranchId: stage.evidenceBranch.branchId,
        evidenceBranchIds: stage.evidenceBranches,
        extraArtifacts: researchArtifacts(stage, {
          level: 'search_excerpt',
          sourceIds: returnedIds,
          chunkIds: searchEvidenceChunks(searchResult),
          note: '以检索摘要级资料结束：读取工具不可用，没有已读全文事件。',
        }),
      });
    }

    push({
      phase: 'END',
      type: EVENT_TYPES.RUN_COMPLETED,
      status: 'info',
      actorId: 'system',
      branchId: 'B03_NO_READER',
      message: `运行结束：partial（部分完成）· 读取工具不可用，以摘要级资料结束；本阶段不生成报告`,
    });
    return finalizeRun({
      outcome: 'partial',
      branchId: 'B03_NO_READER',
      extraArtifacts: {
        evidence: {
          level: 'search_excerpt',
          sourceIds: [targetSourceId],
          chunkIds: [],
          note: '以检索摘要级资料结束：读取工具不可用，没有已读全文事件。',
        },
        report: { status: 'not_generated', note: mission.reportNote },
      },
    });
  }

  /* ================= B01：读取（mini 读 1 条；研究包读本次可见的多条） ================= */
  const readMode = String(reader.settings.readMode);
  const includeMetadata = reader.settings.includeMetadata === true;
  const limit = readLimitOf(mission, searchMeta.returned);
  const readTool = getSimulationTool('document_reader');

  for (let i = 0; i < limit; i++) {
    const item = searchResult.payload.items[i];
    const sourceId = item.sourceId;
    const first = i === 0;
    const requestPayloadId = addPayload(first ? 'p:read-request' : `p:read-request:${sourceId}`, {
      kind: 'read.request',
      toolId: 'document_reader',
      simulated: true,
      caller: 'model_core',
      arguments: { sourceId, readMode, includeMetadata },
      argumentsText: `资料 ${sourceId} · 读取方式 ${paramText('document_reader', 'readMode', readMode)} · 元数据 ${paramText('document_reader', 'includeMetadata', includeMetadata)}`,
      permissionCheck: { required: 'read', granted: true, note: '只读模拟权限，不是浏览器文件权限' },
    });
    push({
      phase: 'READ',
      type: EVENT_TYPES.TOOL_CALL,
      status: 'started',
      actorId: 'model_core',
      toolId: 'document_reader',
      inputRef: requestPayloadId,
      sourceIds: [sourceId],
      branchId: 'B01_NORMAL',
      ruleId: 'rule.reader.call',
      message: `模型核心提出读取请求（${i + 1}/${limit}）：${sourceId} · ${paramText('document_reader', 'readMode', readMode)} · 元数据 ${paramText('document_reader', 'includeMetadata', includeMetadata)}`,
    });

    const readResult = readTool.run({ settings: reader.settings, sourceId });
    if (!readResult.ok) {
      const errorPayload = addPayload(`p:read-error:${sourceId}`, {
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
        inputRef: requestPayloadId,
        outputRef: errorPayload,
        sourceIds: [sourceId],
        branchId: 'B01_NORMAL',
        ruleId: 'rule.reader.arguments',
        message: `${readResult.error.message}；没有伪造正文内容`,
      });
      continue;
    }

    const responseId = addPayload(first ? 'p:read-response' : `p:read-response:${sourceId}`, readResult.payload);
    // 内部追踪元数据与用户可见的工具响应分开存放：关闭元数据时不会「悄悄补回」
    internal[first ? 'i:read' : `i:read:${sourceId}`] = deepFreeze(
      deepClone({ ...readResult.meta.internal, requestedSourceId: sourceId, readMode })
    );

    const scopeText = readResult.meta.textScope === 'full_text' ? '完整正文' : '预先定义的摘要（未读取正文）';
    const resultEvent = push({
      phase: 'READ',
      type: EVENT_TYPES.TOOL_RESULT,
      status: 'success',
      actorId: 'document_reader',
      toolId: 'document_reader',
      inputRef: requestPayloadId,
      outputRef: responseId,
      sourceIds: [readResult.meta.sourceId],
      chunkIds: readResult.meta.chunkIds,
      branchId: 'B01_NORMAL',
      ruleId: 'rule.reader.result',
      message: `读取返回（${readResult.meta.sourceId}）：${scopeText} · ${readResult.meta.chunkIds.length} 个片段 · 元数据${includeMetadata ? '已包含（用户可见）' : '已按要求关闭（用户可见响应中不含来源与日期）'}`,
    });

    readSourceIds.push(readResult.meta.sourceId);
    readChunkIds.push(...readResult.meta.chunkIds);
    reads.push({
      sourceId: readResult.meta.sourceId,
      title: readResult.meta.title,
      eventId: resultEvent.id,
      textScope: readResult.meta.textScope,
      chunks: readResult.meta.chunks || [],
      metadata: readResult.payload.metadata || null,
    });
  }

  const anyFullText = reads.some((r) => r.textScope === 'full_text');
  const evidenceLevel = reads.length === 0 ? null : anyFullText && reads.every((r) => r.textScope === 'full_text') ? 'full_text' : anyFullText ? 'mixed' : 'summary_chunk';
  const evidenceLevelCn =
    evidenceLevel === 'full_text' ? '全文片段' : evidenceLevel === 'mixed' ? '全文与摘要混合片段' : evidenceLevel === 'summary_chunk' ? '摘要片段' : '未取得';

  const evidencePayload = addPayload('p:evidence', {
    kind: 'evidence.sample',
    level: evidenceLevel,
    levelCn: evidenceLevelCn,
    verified: false,
    sourceIds: readSourceIds,
    chunkIds: [...new Set(readChunkIds)],
    textTruncated: reads.some((r) => r.chunks.some((c) => c.text.endsWith('…'))),
    note: research
      ? '这些片段是本次研究可见证据的上限：证据抽取、冲突识别与引用都只能来自这里。'
      : '仅表示已从本地模拟语料取得这些片段；不代表资料真实性已核验，也不构成正式引用溯源。',
  });
  push({
    phase: 'EVIDENCE',
    type: EVENT_TYPES.EVIDENCE_SAMPLE,
    status: 'success',
    actorId: 'system',
    toolId: 'document_reader',
    outputRef: evidencePayload,
    sourceIds: readSourceIds,
    chunkIds: [...new Set(readChunkIds)],
    branchId: 'B01_NORMAL',
    ruleId: 'rule.evidence.fromReadResult',
    message: `已记录 ${readSourceIds.length} 份资料的可见片段（${evidenceLevelCn}）· 取得样本不等于真实性核验`,
  });

  /* ---------------- 06 研究阶段（仅研究包） ---------------- */
  if (research) {
    const stage = runEvidenceStage(reads, searchMeta, {});
    const outcome = stage.report?.status === 'blocked' ? 'research_partial' : stage.report?.status === 'complete' ? 'research_complete' : 'research_partial';
    push({
      phase: 'END',
      type: EVENT_TYPES.RUN_COMPLETED,
      status: outcome === 'research_complete' ? 'success' : 'info',
      actorId: 'system',
      branchId: 'B01_NORMAL',
      message: `运行结束：${outcome} · 证据分支 ${stage.evidenceBranch.branchId} · 报告状态 ${stage.report?.status || 'blocked'} · 结论只在本教学数据与模拟规则内成立`,
    });
    return finalizeRun({
      outcome,
      branchId: 'B01_NORMAL',
      evidenceBranchId: stage.evidenceBranch.branchId,
        evidenceBranchIds: stage.evidenceBranches,
      extraArtifacts: researchArtifacts(stage, {
        level: evidenceLevel,
        levelCn: evidenceLevelCn,
        sourceIds: readSourceIds,
        chunkIds: [...new Set(readChunkIds)],
        note: '已取得本地样本片段；结论只在本教学数据与模拟核验规则内成立。',
      }),
    });
  }

  /* ---------------- 07 M0.3 任务包：不进入证据 / 报告阶段 ---------------- */
  push({
    phase: 'END',
    type: EVENT_TYPES.RUN_COMPLETED,
    status: 'success',
    actorId: 'system',
    branchId: 'B01_NORMAL',
    message: `运行结束：sample_acquired（已取得样本资料）· 本任务包不生成研究报告，资料冲突与引用溯源需要 M0.4 研究包`,
  });

  return finalizeRun({
    outcome: 'sample_acquired',
    branchId: 'B01_NORMAL',
    extraArtifacts: {
      evidence: {
        level: evidenceLevel,
        levelCn: evidenceLevelCn,
        sourceIds: readSourceIds,
        chunkIds: [...new Set(readChunkIds)],
        note: '已取得本地样本片段；不代表真实性核验，也未生成报告。',
      },
      report: { status: 'not_generated', note: mission.reportNote || '本任务包不生成报告。' },
    },
  });

  /* ---------------- 局部工具 ---------------- */
  function searchEvidenceChunks(result) {
    return [...new Set((result?.payload?.items || []).map((i) => i.chunkId))];
  }

  function researchArtifacts(stage, evidenceSummary) {
    return {
      evidence: {
        ...evidenceSummary,
        verified: stage.evidence.counts.confirmedCount > 0,
        levelCn: evidenceSummary.levelCn || (evidenceSummary.level === 'full_text' ? '全文片段' : '摘要片段'),
        policy: evidencePolicy,
        claims: stage.evidence.claims,
        conflicts: stage.evidence.conflicts,
        resolutions: stage.evidence.resolutions,
        counts: stage.evidence.counts,
        limitations: stage.evidence.limitations,
        visibleSourceIds: stage.evidence.visibleSourceIds,
      },
      report: stage.report
        ? { ...stage.report, note: `报告状态 ${stage.report.status}：由本次 Run 的结构化证据按模板装配` }
        : { status: 'blocked', note: '本次没有可装配的报告' },
    };
  }
}

/** 统一装配返回值：冻结、补全统计。引擎不写入任何真实时间戳： */
function finalize({ runId, mission, snapshot, faultMode, evidencePolicy, outcome, branchId, evidenceBranchId = null, evidenceBranchIds = null, events, artifacts, toolsInvoked, problems }) {
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
    options: { faultMode, evidencePolicy },
    outcome,
    branchId,
    evidenceBranchId,
    evidenceBranchIds: evidenceBranchIds || (evidenceBranchId ? [evidenceBranchId] : []),
    events,
    artifacts,
    stats: {
      eventCount: events.length,
      toolsInvoked: [...toolsInvoked],
      searches,
      reads,
      toolCalls: events.filter((e) => e.type === EVENT_TYPES.TOOL_CALL).length,
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
    evidenceBranchId: run.evidenceBranchId || null,
    eventCount: run.events.length,
    lastMessage: last ? last.message : '',
    evidence: run.artifacts?.evidence || null,
    report: run.artifacts?.report || null,
    toolsInvoked: run.stats?.toolsInvoked || [],
    hasReport: !!(run.artifacts?.report && Array.isArray(run.artifacts.report.claims) && run.artifacts.report.claims.length > 0),
  };
}

export { EVENT_TYPES, PREDICATES };

