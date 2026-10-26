/**
 * src/features/laboratory/runtime/engine.js
 * ------------------------------------------------------------------
 * Runtime Lab 的确定性状态机（M1.3 D05 / §6）。
 *
 * 三个入口，一份任务数据：
 *   simulateWorkflow  —— 预定义五步流程（路线写死）
 *   simulateAgentLoop —— 每轮读状态后按规则决定下一步（有重试与步数上限）
 *   simulateMultiAgent—— Researcher / Verifier / Reporter 顺序交接
 *
 * 关键约束（验收 A17–A22）：
 *   · 三种入口共用 task.js 的资料、工具、权限与检索规则，不存在
 *     「为了某种模式赢」的私有数据或成功率调整；
 *   · 每个事件都带 eventId / runId / stepType / status / 输入输出摘要 /
 *     来源 ID / 分支原因 / 顺序号；
 *   · 循环必然终止：步数上限、重试上限、无可用动作三种出口都写死；
 *   · 全部同步、无随机、无时间戳依赖，同一输入永远得到同一串事件。
 * ------------------------------------------------------------------
 */
import { RUNTIME_TASK, eventDateOf, queryById, searchDocs } from './task.js';

/* ==================================================================== *
 * 一、事件模型
 * ==================================================================== */

export const STEP_TYPES = Object.freeze({
  'permission-check': { id: 'permission-check', cn: '权限检查', harness: ['policy', 'log'] },
  'tool-call': { id: 'tool-call', cn: '工具调用', harness: ['dispatch', 'policy', 'log'] },
  decision: { id: 'decision', cn: '分支决策', harness: ['context', 'loop'] },
  compare: { id: 'compare', cn: '证据比对', harness: ['context'] },
  assign: { id: 'assign', cn: '任务分派', harness: ['dispatch', 'log'] },
  handoff: { id: 'handoff', cn: '角色交接', harness: ['dispatch', 'log'] },
  report: { id: 'report', cn: '结论生成', harness: ['log'] },
  terminate: { id: 'terminate', cn: '终止', harness: ['loop', 'log'] },
});

export const STATUS_LABELS = Object.freeze({
  ok: { id: 'ok', cn: '成功', tone: 'success' },
  denied: { id: 'denied', cn: '被拒绝', tone: 'attention' },
  warning: { id: 'warning', cn: '需注意', tone: 'attention' },
  skipped: { id: 'skipped', cn: '已跳过', tone: 'muted' },
  error: { id: 'error', cn: '失败', tone: 'attention' },
  info: { id: 'info', cn: '记录', tone: 'muted' },
});

export const HARNESS_ROLES = Object.freeze([
  Object.freeze({ id: 'context', cn: '上下文组装', desc: '决定这一轮把哪些状态与资料交给模型。' }),
  Object.freeze({ id: 'dispatch', cn: '工具分派', desc: '接收工具请求，找到对应工具并真正执行。' }),
  Object.freeze({ id: 'loop', cn: '循环与终止', desc: '判断继续还是结束：步数上限、重试上限、无可用动作。' }),
  Object.freeze({ id: 'policy', cn: '权限检查', desc: '在调用前按规则判定允许或拒绝，拒绝也写入事件。' }),
  Object.freeze({ id: 'log', cn: '事件记录', desc: '把每一步的输入输出摘要、来源与原因写成可回放事件。' }),
]);

export const STEP_LIMIT_OPTIONS = Object.freeze([3, 4, 6]);
export const RETRY_LIMIT_OPTIONS = Object.freeze([0, 1, 2]);

function createRecorder(mode, queryId) {
  const events = [];
  const runId = `RUN-${mode}-${queryId}`;
  let seq = 0;

  function push(partial) {
    seq += 1;
    const stepType = STEP_TYPES[partial.stepType] ? partial.stepType : 'decision';
    const status = STATUS_LABELS[partial.status] ? partial.status : 'ok';
    const event = Object.freeze({
      eventId: `EV-${String(seq).padStart(2, '0')}`,
      runId,
      seq,
      stepType,
      stepTypeCn: STEP_TYPES[stepType].cn,
      status,
      statusCn: STATUS_LABELS[status].cn,
      tone: STATUS_LABELS[status].tone,
      title: partial.title || STEP_TYPES[stepType].cn,
      input: partial.input || '',
      output: partial.output || '',
      sourceIds: Object.freeze([...(partial.sourceIds || [])]),
      branchReason: partial.branchReason || '',
      toolId: partial.toolId || null,
      role: partial.role || null,
      harness: Object.freeze([...STEP_TYPES[stepType].harness]),
    });
    events.push(event);
    return event;
  }

  return { events, runId, push };
}

/* ==================================================================== *
 * 二、共享的「工具执行」与「证据比对」
 * ==================================================================== */

/**
 * 工具执行：统一入口，三种模式走同一条路径。
 * 返回 {event, dates}——绝不把「日期」挂在冻结事件上。
 * `anchor` 来自当前任务查询，不允许写死某个查询的词。
 */
export function callTool(recorder, { toolId, input, docs, role = null, anchor = '' }) {
  const allowed = RUNTIME_TASK.tools.some((tool) => tool.id === toolId);
  if (!allowed) {
    return {
      event: recorder.push({
        stepType: 'tool-call',
        status: 'denied',
        title: '权限检查拒绝未知工具',
        input: String(input ?? ''),
        output: `工具 ${toolId} 不在允许清单内：请求被拒绝，没有产生任何数据`,
        branchReason: 'permissions/tool-allowlist',
        role,
      }),
      dates: {},
    };
  }
  if (toolId === 'announcement_search') {
    const hits = searchDocs(input);
    return {
      event: recorder.push({
        stepType: 'tool-call',
        toolId,
        role,
        status: hits.length ? 'ok' : 'warning',
        title: `检索公告：${input}`,
        input: `关键词「${input}」`,
        output: hits.length ? `命中 ${hits.length} 份：${hits.join('、')}` : '命中 0 份',
        sourceIds: hits,
        branchReason: hits.length ? 'search/has-hits' : 'search/empty',
      }),
      dates: {},
    };
  }
  const targetDocs = (docs || []).filter(Boolean);
  const dates = {};
  for (const docId of targetDocs) {
    const hit = eventDateOf(docId, anchor);
    if (hit) dates[docId] = hit.value;
  }
  return {
    event: recorder.push({
      stepType: 'tool-call',
      toolId,
      role,
      status: 'ok',
      title: `读取公告正文：${targetDocs.join('、')}`,
      input: `公告 ID「${targetDocs.join('、')}」`,
      output: targetDocs
        .map((docId) => {
          const doc = RUNTIME_TASK.getDoc(docId);
          return `${docId}「${doc ? doc.title : '未知'}」${dates[docId] ? ` → 事件日期 ${dates[docId]}` : ' → 未抽到事件日期'}`;
        })
        .join('；'),
      sourceIds: targetDocs,
      branchReason: 'reader/returned',
    }),
    dates,
  };
}

/** 证据比对：抽取到的日期不一致 → 冲突 */
export function compareEvidence(recorder, datePerDoc, { role = null } = {}) {
  const entries = Object.entries(datePerDoc || {});
  const distinct = [...new Set(entries.map(([, value]) => value))];
  const event = recorder.push({
    stepType: 'compare',
    role,
    status: distinct.length > 1 ? 'warning' : 'ok',
    title: '证据比对：日期是否一致',
    input: entries.map(([docId, value]) => `${docId}=${value}`).join('、') || '（无证据）',
    output: distinct.length > 1 ? `发现冲突：${distinct.join(' / ')}` : distinct.length === 1 ? `一致：${distinct[0]}` : '无日期可比对',
    sourceIds: entries.map(([docId]) => docId),
    branchReason: distinct.length > 1 ? 'compare/conflict' : distinct.length === 1 ? 'compare/consistent' : 'compare/no-date',
  });
  return Object.freeze({ event, conflict: distinct.length > 1, distinct });
}

/* ==================================================================== *
 * 三、模式一：Workflow（路线写死）
 * ==================================================================== */

export const WORKFLOW_STEPS = Object.freeze([
  Object.freeze({ id: 'check-config', cn: '校验配置与权限', stepType: 'permission-check' }),
  Object.freeze({ id: 'search', cn: '检索公告', stepType: 'tool-call', toolId: 'announcement_search' }),
  Object.freeze({ id: 'read', cn: '读取整篇公告', stepType: 'tool-call', toolId: 'document_reader' }),
  Object.freeze({ id: 'compare', cn: '比对日期', stepType: 'compare' }),
  Object.freeze({ id: 'report', cn: '输出结论', stepType: 'report' }),
]);

export function simulateWorkflow({ queryId = 'career-fair' } = {}) {
  const query = queryById(queryId);
  const recorder = createRecorder('workflow', query.id);

  /* 1. 校验配置与权限（固定第一步） */
  recorder.push({
    stepType: 'permission-check',
    status: RUNTIME_TASK.permissions.readPublicNotices ? 'ok' : 'denied',
    title: '校验配置与权限',
    input: 'readPublicNotices / readPrivateRecords / writeAnything',
    output: `读公开公告=${RUNTIME_TASK.permissions.readPublicNotices ? '允许' : '拒绝'} · 读私有记录=${RUNTIME_TASK.permissions.readPrivateRecords ? '允许' : '拒绝'} · 写操作=${RUNTIME_TASK.permissions.writeAnything ? '允许' : '拒绝'}`,
    branchReason: 'plan/fixed-step-1',
  });

  /* 2. 检索（固定用任务的查询词，不判断是否该换关键词） */
  const searchCall = callTool(recorder, { toolId: 'announcement_search', input: query.keyword });
  const hits = [...searchCall.event.sourceIds];

  /* 3. 读取整篇公告（命中就全读） */
  let dates = {};
  if (hits.length) {
    const readCall = callTool(recorder, { toolId: 'document_reader', docs: hits, anchor: query.anchor });
    dates = readCall.dates;
  } else {
    recorder.push({
      stepType: 'tool-call',
      toolId: 'document_reader',
      status: 'skipped',
      title: '跳过读取：没有命中任何公告',
      input: '（空列表）',
      output: '按固定流程，本步被跳过而不是重试',
      sourceIds: [],
      branchReason: 'plan/skip-on-empty',
    });
  }

  /* 4. 比对 */
  const comparison = compareEvidence(recorder, dates);

  /* 5. 输出结论（固定路线不会为冲突再检索一次） */
  const conclusion = buildConclusion({ mode: 'workflow', comparison, dates, hits, query });
  recorder.push({
    stepType: 'report',
    status: conclusion.status === 'supported' ? 'ok' : 'warning',
    title: '输出结论',
    input: `${Object.keys(dates).length} 份证据的日期`,
    output: conclusion.summary,
    sourceIds: hits,
    branchReason: 'report/finish',
  });

  recorder.push({
    stepType: 'terminate',
    status: 'info',
    title: '流程结束',
    input: '预定义 5 步',
    output: '计划执行完毕：固定流程不会自行增加步骤或重新检索',
    branchReason: 'terminate/plan-complete',
  });

  return finalize({
    mode: 'workflow',
    recorder,
    conclusion,
    query,
    hits,
    dates,
    extra: { planLength: WORKFLOW_STEPS.length, executed: WORKFLOW_STEPS.length },
  });
}

/* ==================================================================== *
 * 四、模式二：Agent Loop（每轮按状态与规则选动作）
 * ==================================================================== */

/**
 * 一轮循环 = 一次「读状态 → 决策 → 执行动作」，计为一步。
 * 终止出口（先命中先生效）：
 *   1. 步数达到上限 → max-steps
 *   2. 冲突已确认且更正检索已尝试 → no-more-actions
 *   3. 检索为空且重试达到上限 → retry-limit
 */
export function simulateAgentLoop({ queryId = 'career-fair', maxSteps = 6, maxRetries = 2 } = {}) {
  const query = queryById(queryId);
  const recorder = createRecorder('agent-loop', query.id);
  const stepLimit = STEP_LIMIT_OPTIONS.includes(Number(maxSteps)) ? Number(maxSteps) : RUNTIME_TASK.limits.maxSteps;
  const retryLimit = RETRY_LIMIT_OPTIONS.includes(Number(maxRetries)) ? Number(maxRetries) : RUNTIME_TASK.limits.maxRetries;

  const state = {
    hits: [],
    dates: {},
    searched: 0,
    retries: 0,
    conflict: false,
    correctionTried: false,
    compared: false,
    lastDistinct: [],
  };
  const iterations = [];
  let terminated = null;

  while (true) {
    /* ---- 终止判定（先命中先生效）---- */
    if (state.compared && state.lastDistinct.length === 1) {
      terminated = {
        reason: 'target-reached',
        cn: '目标达成',
        text: `日期一致（${state.lastDistinct[0]}），继续执行不会改变结论：结束并输出有依据的答案。`,
      };
      break;
    }
    if (state.compared && state.lastDistinct.length === 0) {
      terminated = {
        reason: 'no-date',
        cn: '证据不足',
        text: '命中了公告，但正文与摘要里都抽不到事件日期：结束并如实报告「证据不足」。',
      };
      break;
    }
    if (state.conflict && state.correctionTried) {
      terminated = {
        reason: 'no-more-actions',
        cn: '无可用动作',
        text: '冲突已确认、更正检索也已尝试，没有新的动作可做：结束并如实报告未决。',
      };
      break;
    }
    if (iterations.length >= stepLimit) {
      terminated = {
        reason: 'max-steps',
        cn: '达到步数上限',
        text: `已执行 ${iterations.length} 步（上限 ${stepLimit}）：立即终止，不再新增动作。`,
      };
      break;
    }

    /* ---- 决策：只看当前状态，不看预设顺序 ---- */
    let decision;
    if (!state.searched) {
      decision = { action: 'search', input: query.keyword, reason: '尚无任何证据：先去检索。' };
    } else if (!state.hits.length) {
      decision =
        state.retries < retryLimit
          ? {
              action: 'search',
              input: query.keyword,
              retry: true,
              reason: `检索为空，重试次数 ${state.retries} < 上限 ${retryLimit}：再试一次。`,
            }
          : { action: 'stop', reason: `检索仍为空且重试已达上限 ${retryLimit}：停止，如实报告无证据。` };
    } else if (!Object.keys(state.dates).length) {
      decision = { action: 'read', input: state.hits, reason: '已有命中但没有日期：读正文抽取事实。' };
    } else if (!state.conflict) {
      decision = { action: 'compare', reason: '已读到日期：比对是否一致。' };
    } else if (!state.correctionTried) {
      decision = {
        action: 'search',
        input: '更正',
        correction: true,
        reason: '日期冲突：先检索是否存在更正公告，再决定能否采信。',
      };
    } else {
      decision = { action: 'compare', reason: '更正检索没有改变结论：再比对一次并收尾。' };
    }

    recorder.push({
      stepType: 'decision',
      status: 'ok',
      title: `第 ${iterations.length + 1} 步决策：${decision.action}`,
      input: `已检索 ${state.searched} 次 · 命中 ${state.hits.length} · 已读 ${Object.keys(state.dates).length} · 重试 ${state.retries} · 冲突 ${state.conflict ? '是' : '否'}`,
      output: decision.reason,
      branchReason: `loop/${decision.action}`,
    });

    if (decision.action === 'stop') {
      iterations.push({ action: 'stop' });
      terminated = { reason: 'retry-limit', cn: '达到重试上限', text: decision.reason };
      break;
    }

    if (decision.action === 'search') {
      state.searched += 1;
      if (decision.retry) state.retries += 1;
      if (decision.correction) state.correctionTried = true;
      const { event } = callTool(recorder, { toolId: 'announcement_search', input: decision.input });
      if (decision.correction) {
        /* 更正检索：只有真正指向冲突公告的更正才算有效线索 */
        const relevant = event.sourceIds.filter((docId) => {
          const doc = RUNTIME_TASK.getDoc(docId);
          return doc && doc.supersedes.some((id) => state.hits.includes(id));
        });
        state.correctionFound = relevant.length > 0;
        state.correctionSources = relevant;
      } else {
        state.hits = [...new Set([...state.hits, ...event.sourceIds])];
      }
      iterations.push({ action: 'search', input: decision.input });
      continue;
    }

    if (decision.action === 'read') {
      const { dates } = callTool(recorder, { toolId: 'document_reader', docs: decision.input, anchor: query.anchor });
      Object.assign(state.dates, dates);
      iterations.push({ action: 'read', input: decision.input });
      continue;
    }

    /* compare */
    const comparison = compareEvidence(recorder, state.dates);
    state.compared = true;
    state.conflict = comparison.conflict;
    state.lastDistinct = comparison.distinct;
    iterations.push({ action: 'compare' });
  }

  const conclusion = buildConclusion({
    mode: 'agent-loop',
    comparison: Object.freeze({ conflict: state.conflict, distinct: state.lastDistinct || [] }),
    dates: state.dates,
    hits: state.hits,
    query,
  });

  recorder.push({
    stepType: 'report',
    status: conclusion.status === 'supported' ? 'ok' : 'warning',
    title: '输出结论',
    input: `${Object.keys(state.dates).length} 份证据 · 检索 ${state.searched} 次 · 重试 ${state.retries}`,
    output: conclusion.summary,
    sourceIds: state.hits,
    branchReason: 'report/finish',
  });
  recorder.push({
    stepType: 'terminate',
    status: 'info',
    title: `循环终止：${terminated.cn}`,
    input: `步数 ${iterations.length}/${stepLimit} · 重试 ${state.retries}/${retryLimit}`,
    output: terminated.text,
    sourceIds: state.correctionSources || [],
    branchReason: `terminate/${terminated.reason}`,
  });

  return finalize({
    mode: 'agent-loop',
    recorder,
    conclusion,
    query,
    hits: state.hits,
    dates: state.dates,
    extra: {
      executed: iterations.length,
      stepLimit,
      retryLimit,
      retries: state.retries,
      terminated: terminated.reason,
      terminatedCn: terminated.cn,
      actions: iterations.map((it) => it.action),
    },
  });
}

/* ==================================================================== *
 * 五、模式三：受控 Multi-Agent（顺序交接，不伪装并发）
 * ==================================================================== */

export const AGENT_ROLES = Object.freeze([
  Object.freeze({ id: 'researcher', cn: 'Researcher · 取资料', duty: '检索并读取公告，产出候选证据。', outputs: '候选来源 ID + 抽取到的日期' }),
  Object.freeze({ id: 'verifier', cn: 'Verifier · 挑错', duty: '核对日期是否一致、是否需要更正关系。', outputs: '冲突清单 + 是否可采信' }),
  Object.freeze({ id: 'reporter', cn: 'Reporter · 汇总', duty: '按已核验 / 未决两栏写结论，并标注来源。', outputs: '结论 + 引用列表' }),
]);

export function simulateMultiAgent({ queryId = 'career-fair', failRole = null } = {}) {
  const query = queryById(queryId);
  const recorder = createRecorder('multi-agent', query.id);

  /* 1. 编排：分派任务（顺序执行，不假装并发） */
  recorder.push({
    stepType: 'assign',
    status: 'ok',
    role: 'orchestrator',
    title: '编排：把任务分派给 Researcher（第 1 / 3 步，顺序执行）',
    input: `任务「${RUNTIME_TASK.title}」· 查询「${query.keyword}」`,
    output: 'Researcher 取资料 → Verifier 挑错 → Reporter 汇总。三个角色按顺序交接，不并发执行。',
    branchReason: 'orchestration/sequential-handoff',
  });

  /* 2. Researcher：检索 */
  const searchCall = callTool(recorder, { toolId: 'announcement_search', input: query.keyword, role: 'researcher' });
  const hits = [...searchCall.event.sourceIds];

  /* 3. Researcher：读取 */
  let dates = {};
  if (hits.length) {
    dates = callTool(recorder, { toolId: 'document_reader', docs: hits, role: 'researcher', anchor: query.anchor }).dates;
  } else {
    recorder.push({
      stepType: 'tool-call',
      toolId: 'document_reader',
      role: 'researcher',
      status: 'skipped',
      title: 'Researcher：没有命中，跳过读取',
      input: '（空列表）',
      output: '无证据可读，把空结果交给 Verifier',
      branchReason: 'researcher/no-hits',
    });
  }

  /* 4. 交接：Researcher → Verifier */
  recorder.push({
    stepType: 'handoff',
    status: 'ok',
    role: 'verifier',
    title: '交接：Researcher → Verifier',
    input: `候选来源 ${hits.length} 份 · 抽取日期 ${Object.keys(dates).length} 条`,
    output: `交接内容：${JSON.stringify(dates)}；来源：${hits.join('、') || '无'}`,
    sourceIds: hits,
    branchReason: 'handoff/researcher-to-verifier',
  });

  /* 5. Verifier：比对（可模拟失败） */
  let comparison = { conflict: false, distinct: [] };
  if (failRole === 'verifier') {
    recorder.push({
      stepType: 'compare',
      role: 'verifier',
      status: 'error',
      title: 'Verifier：核验失败',
      input: `${Object.keys(dates).length} 条日期`,
      output: '核验环节返回错误（教学模拟失败）：无法确认日期是否冲突，下游只能报告「核验未完成」。',
      sourceIds: hits,
      branchReason: 'verifier/failed',
    });
  } else {
    comparison = compareEvidence(recorder, dates, { role: 'verifier' });
  }

  /* 6. 交接：Verifier → Reporter */
  recorder.push({
    stepType: 'handoff',
    status: failRole === 'verifier' ? 'warning' : 'ok',
    role: 'reporter',
    title: '交接：Verifier → Reporter',
    input:
      failRole === 'verifier'
        ? '核验失败的回执'
        : `冲突=${comparison.conflict ? '是' : '否'} · 取值 ${comparison.distinct.join(' / ') || '无'}`,
    output: 'Reporter 只按收到的回执写结论，不能自行补一个「看起来合理」的答案。',
    sourceIds: hits,
    branchReason: failRole === 'verifier' ? 'handoff/degraded' : 'handoff/verifier-to-reporter',
  });

  /* 7. Reporter：汇总 */
  const conclusion = buildConclusion({
    mode: 'multi-agent',
    comparison,
    dates,
    hits,
    query,
    verifierFailed: failRole === 'verifier',
  });
  recorder.push({
    stepType: 'report',
    role: 'reporter',
    status: conclusion.status === 'supported' ? 'ok' : 'warning',
    title: 'Reporter：输出结论',
    input: failRole === 'verifier' ? '核验未完成' : `${comparison.distinct.length} 个取值`,
    output: conclusion.summary,
    sourceIds: hits,
    branchReason: 'report/finish',
  });
  recorder.push({
    stepType: 'terminate',
    status: 'info',
    title: '流程终止：三个角色全部完成',
    input: '3 个角色 · 顺序执行',
    output: '多角色流程结束；任一角色失败会改变结论，而不是被静默忽略。',
    branchReason: 'terminate/roles-complete',
  });

  return finalize({
    mode: 'multi-agent',
    recorder,
    conclusion,
    query,
    hits,
    dates,
    extra: {
      failRole,
      roles: AGENT_ROLES.map((role) => role.id),
      executed: AGENT_ROLES.length,
      handoffs: recorder.events.filter((e) => e.stepType === 'handoff').length,
    },
  });
}

/* ==================================================================== *
 * 六、结论与收尾
 * ==================================================================== */

function buildConclusion({ comparison, dates, hits, query, verifierFailed = false }) {
  const distinct = [...new Set(Object.values(dates))];
  if (verifierFailed) {
    return {
      status: 'unverified',
      statusCn: '核验未完成',
      summary: '核验角色失败：本轮不给出日期结论，只报告「已取到证据但未完成核验」。',
      unresolved: ['核验未完成'],
    };
  }
  if (!hits.length) {
    return {
      status: 'insufficient',
      statusCn: '无证据',
      summary: `查询「${query.keyword}」在本地语料中没有命中任何公告：结论为「资料不足」，不生成来源。`,
      unresolved: ['没有任何证据'],
    };
  }
  if (distinct.length > 1) {
    return {
      status: 'unresolved',
      statusCn: '证据冲突 · 未决',
      summary: `命中 ${hits.length} 份公告，但事件日期不一致（${distinct.join(' / ')}）：结论为未决，保留全部来源。`,
      unresolved: distinct.map((value) => `日期取值冲突：${value}`),
    };
  }
  if (distinct.length === 1) {
    return {
      status: 'supported',
      statusCn: '有证据支撑',
      summary: `命中 ${hits.length} 份公告，日期一致为 ${distinct[0]}。`,
      unresolved: [],
    };
  }
  return {
    status: 'insufficient',
    statusCn: '证据不足',
    summary: `命中 ${hits.length} 份公告，但没有抽取到事件日期：结论为证据不足。`,
    unresolved: ['未抽取到事件日期'],
  };
}

function finalize({ mode, recorder, conclusion, query, hits, dates, extra }) {
  const events = recorder.events;
  const toolCalls = events.filter((event) => event.toolId).length;
  const denied = events.filter((event) => event.status === 'denied').length;
  const sources = [...new Set(events.flatMap((event) => event.sourceIds))];

  return {
    mode,
    runId: recorder.runId,
    queryId: query.id,
    queryText: query.keyword,
    events,
    conclusion,
    metrics: {
      steps: extra.executed,
      maxSteps: extra.stepLimit ?? RUNTIME_TASK.limits.maxSteps,
      toolCalls,
      retries: extra.retries ?? 0,
      maxRetries: extra.retryLimit ?? RUNTIME_TASK.limits.maxRetries,
      denied,
      eventCount: events.length,
      sourceCount: sources.length,
      sourceCoverage: hits.length ? `${sources.length}/${hits.length}` : '0/0',
      unresolved: conclusion.unresolved.length,
      terminator: extra.terminated || (mode === 'workflow' ? 'plan-complete' : mode === 'multi-agent' ? 'roles-complete' : null),
    },
    sources,
    dates,
    extra,
  };
}

/* ==================================================================== *
 * 七、Inspector 用的派生视图
 * ==================================================================== */

/** 某事件触发了 Harness 的哪些职责（把「Harness 不是第二个模型」落到具体行） */
export function harnessViewOf(event) {
  return HARNESS_ROLES.map((role) => ({
    ...role,
    active: event ? event.harness.includes(role.id) : false,
    detail: event && event.harness.includes(role.id) ? `${event.eventId} · ${event.title}` : '',
  }));
}

export const MODE_LABELS = Object.freeze({
  workflow: { id: 'workflow', cn: 'Workflow · 预定义流程', note: '路线写死：5 步固定执行，冲突时不会再检索一次。' },
  'agent-loop': { id: 'agent-loop', cn: 'Agent Loop · 运行期选择', note: '每轮读状态再决定：会重试、会主动找更正，但受步数与重试上限约束。' },
  'multi-agent': { id: 'multi-agent', cn: 'Multi-Agent · 三角色顺序交接', note: 'Researcher / Verifier / Reporter 顺序交接，不并发、不隐藏失败。' },
});
