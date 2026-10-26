/**
 * src/features/laboratory/reliability/reliability.js
 * ------------------------------------------------------------------
 * Reliability Lab 的编排层（M1.3 D06 / §7）。
 *
 * 一次运行依次产生：规则检查 → 工具请求 → 允许/拒绝 → 来源使用
 * → 输出检查 → 终止原因，并据此跑一遍固定 Eval。
 *
 * 不可动摇的三条（验收 A23 / A25 / A29）：
 *   1. 被拒绝的请求**只有** deny 事件，绝不会同时出现「成功」；
 *   2. 文档内容只作为数据被检查：代码里没有任何「内容 → 配置」的写入路径，
 *      因此 configChanged 永远是 false，策略与系统指令按值比较保持不变；
 *   3. 全部为前端规则模拟：不访问文件、不发请求、不做真实渗透测试。
 * ------------------------------------------------------------------
 */
import {
  DEFAULT_POLICY,
  GUARDRAIL_TOGGLES,
  POLICY_TOGGLES,
  RESOURCES,
  applyPolicyPatch,
  evaluateRequest,
  sandboxMode,
} from './policy.js';
import { checkInput, checkOutput, checkToolRequest } from './guardrails.js';
import { INJECTION_SAMPLE, loadSamples } from './samples.js';
import { runEvals } from './evals.js';

export const TRACE_TYPES = Object.freeze({
  'policy-check': { id: 'policy-check', cn: '规则检查', tone: 'muted' },
  'input-check': { id: 'input-check', cn: '输入检查', tone: 'attention' },
  'tool-request': { id: 'tool-request', cn: '工具请求', tone: 'signal' },
  allow: { id: 'allow', cn: '允许执行', tone: 'success' },
  deny: { id: 'deny', cn: '拒绝执行', tone: 'attention' },
  'source-use': { id: 'source-use', cn: '来源使用', tone: 'muted' },
  'output-check': { id: 'output-check', cn: '输出检查', tone: 'attention' },
  terminate: { id: 'terminate', cn: '终止', tone: 'muted' },
});

export const TRACE_FILTERS = Object.freeze([
  Object.freeze({ id: 'all', cn: '全部', matches: () => true }),
  Object.freeze({ id: 'rule', cn: '规则检查', matches: (event) => ['policy-check', 'input-check', 'output-check'].includes(event.type) }),
  Object.freeze({ id: 'tool', cn: '工具请求', matches: (event) => event.type === 'tool-request' }),
  Object.freeze({ id: 'decision', cn: '允许 / 拒绝', matches: (event) => event.type === 'allow' || event.type === 'deny' }),
  Object.freeze({ id: 'source', cn: '来源使用', matches: (event) => event.type === 'source-use' }),
  Object.freeze({ id: 'terminate', cn: '终止原因', matches: (event) => event.type === 'terminate' }),
]);

export function filterTrace(events, filterId = 'all') {
  const filter = TRACE_FILTERS.find((item) => item.id === filterId) || TRACE_FILTERS[0];
  return events.filter((event) => filter.matches(event));
}

function createTrace(policy) {
  const events = [];
  const runId = `RUN-reliability-${policy.sandbox}`;
  let seq = 0;
  return {
    events,
    runId,
    push(partial) {
      seq += 1;
      const type = TRACE_TYPES[partial.type] ? partial.type : 'policy-check';
      const event = Object.freeze({
        eventId: `TR-${String(seq).padStart(2, '0')}`,
        runId,
        seq,
        type,
        typeCn: TRACE_TYPES[type].cn,
        tone: TRACE_TYPES[type].tone,
        title: partial.title || TRACE_TYPES[type].cn,
        detail: partial.detail || '',
        status: partial.status || 'info',
        resourceId: partial.resourceId || null,
        rule: partial.rule || null,
        decision: partial.decision || null,
        sourceIds: Object.freeze([...(partial.sourceIds || [])]),
        checks: Object.freeze([...(partial.checks || [])]),
      });
      events.push(event);
      return event;
    },
  };
}

/**
 * 运行一次可靠性实验。
 * @param {{policy?:object, includeInjection?:boolean}} config
 */
export function runReliabilityLab({ policy = DEFAULT_POLICY, includeInjection = true } = {}) {
  const policyBefore = Object.freeze({ ...policy, guardrails: Object.freeze({ ...policy.guardrails }) });
  /** 系统指令固定不动：没有「文档写入」这条路径 */
  const systemInstructionBefore = INJECTION_SAMPLE.systemInstructionText;
  const trace = createTrace(policyBefore);
  const samples = loadSamples({ includeInjection });
  const requests = [];

  /* ---------- 1. 规则检查（权限 + 沙箱 + 护栏开关） ---------- */
  trace.push({
    type: 'policy-check',
    status: 'info',
    title: '加载权限与沙箱配置',
    detail: [
      ...POLICY_TOGGLES.map((toggle) => `${toggle.cn}=${policyBefore[toggle.key] ? '允许' : '拒绝'}`),
      `沙箱=${sandboxMode(policyBefore.sandbox).cn}`,
      ...GUARDRAIL_TOGGLES.map((toggle) => `${toggle.cn}=${policyBefore.guardrails[toggle.key] ? '开启' : '关闭'}`),
    ].join(' · '),
    rule: 'policy/snapshot',
  });

  /* ---------- 2. 正常路径：读取公开公告 ---------- */
  const usedSources = [];
  for (const doc of samples.publicDocs) {
    const resourceId = doc.docId === 'NTC-1008' ? 'public/notices/career-fair' : 'public/notices/open-day';
    const verdict = evaluateRequest({ resourceId, operation: 'read', policy: policyBefore });
    requests.push({ resourceId, decision: verdict.decision, primaryReason: verdict.primaryReason, inducedBy: null, checks: verdict.checks });

    trace.push({
      type: 'tool-request',
      status: 'info',
      title: `请求读取 ${resourceId}`,
      detail: `${doc.docId}「${doc.title}」· 发布主体 ${doc.publisher}`,
      resourceId,
      rule: 'task/normal-read',
      checks: verdict.checks,
    });
    trace.push({
      type: verdict.decision === 'allowed' ? 'allow' : 'deny',
      status: verdict.decision === 'allowed' ? 'ok' : 'denied',
      decision: verdict.decision,
      title: verdict.decision === 'allowed' ? `允许：${resourceId}` : `拒绝：${resourceId}`,
      detail: verdict.decision === 'allowed' ? verdict.primaryReason : `${verdict.primaryReason}（未读取任何内容）`,
      resourceId,
      rule: verdict.primaryReason,
      checks: verdict.checks,
    });
    if (verdict.decision === 'allowed') {
      usedSources.push(doc.docId);
      trace.push({
        type: 'source-use',
        status: 'ok',
        title: `来源进入证据：${doc.docId}`,
        detail: `只使用本次真正读到内容的来源；来源 ID 与原始公告一致。`,
        resourceId,
        sourceIds: [doc.docId],
      });
    }
  }

  /* ---------- 3. 不可信内容：先过输入护栏，再逐条评估它诱导的动作 ---------- */
  const injection = {
    included: Boolean(samples.injection),
    flagged: false,
    hits: [],
    totalActions: 0,
    allowedActions: 0,
    deniedActions: 0,
    influenced: false,
    configChanged: false,
    systemInstructionsChanged: false,
  };

  if (samples.injection) {
    const inputVerdict = checkInput(samples.injection.paragraphs.join('\n'), { enabled: policyBefore.guardrails.input });
    injection.flagged = inputVerdict.hit;
    injection.hits = inputVerdict.hits;
    trace.push({
      type: 'input-check',
      status: inputVerdict.hit ? 'warning' : 'info',
      title: inputVerdict.hit ? `输入护栏命中 ${inputVerdict.hits.length} 条规则` : '输入护栏未命中',
      detail: inputVerdict.hit
        ? `${samples.injection.title}｜命中：${inputVerdict.hits.map((hit) => hit.cn).join('、')}（仅字面模式命中，换措辞可能绕过）`
        : `${samples.injection.title}｜未命中任何已知模式：可能是干净文本，也可能是绕过——单靠关键词无法区分`,
      rule: 'guardrail/input',
      sourceIds: [samples.injection.docId],
    });
    trace.push({
      type: 'policy-check',
      status: 'info',
      title: '不可信内容按数据处理：不进入配置写入路径',
      detail: `样本 ID ${samples.injection.docId} 被标记为 untrusted + 教学模拟样本；它的文字只用于生成「待评估的请求」，系统配置与系统指令不从文档读取。`,
      rule: 'untrusted/data-only',
      sourceIds: [samples.injection.docId],
    });

    injection.totalActions = samples.injection.attemptedActions.length;
    for (const action of samples.injection.attemptedActions) {
      const toolCheck = checkToolRequest({ resourceId: action.resourceId, operation: action.operation }, { enabled: policyBefore.guardrails.tool });
      const verdict = evaluateRequest({ resourceId: action.resourceId, operation: action.operation, policy: policyBefore });
      requests.push({
        resourceId: action.resourceId,
        decision: verdict.decision,
        primaryReason: verdict.primaryReason,
        inducedBy: samples.injection.docId,
        checks: verdict.checks,
      });

      trace.push({
        type: 'tool-request',
        status: 'info',
        title: `请求（由不可信样本诱导）：${action.resourceId} · ${action.operation}`,
        detail: `${action.why}；工具护栏${toolCheck.hit ? `命中 ${toolCheck.hits.map((hit) => hit.cn).join('、')}` : '未命中'}`,
        resourceId: action.resourceId,
        rule: 'injection/induced-action',
        checks: verdict.checks,
        sourceIds: [samples.injection.docId],
      });

      if (verdict.decision === 'denied') {
        injection.deniedActions += 1;
        trace.push({
          type: 'deny',
          status: 'denied',
          decision: 'denied',
          title: `拒绝：${action.resourceId}`,
          detail: `${verdict.primaryReason}（被拒绝的请求不会产生任何数据）`,
          resourceId: action.resourceId,
          rule: verdict.primaryReason,
          checks: verdict.checks,
          sourceIds: [samples.injection.docId],
        });
      } else {
        injection.allowedActions += 1;
        injection.influenced = true;
        trace.push({
          type: 'allow',
          status: 'warning',
          decision: 'allowed',
          title: `允许（风险）：${action.resourceId}`,
          detail: `${verdict.primaryReason}；这是一次由不可信内容触发的动作，说明当前配置过宽。`,
          resourceId: action.resourceId,
          rule: verdict.primaryReason,
          checks: verdict.checks,
          sourceIds: [samples.injection.docId],
        });
      }

      /* 配置写入尝试：无论权限是否允许，文档内容都不会真的改写配置 */
      if (action.resourceId === 'config/experiment-rules') {
        trace.push({
          type: 'policy-check',
          status: 'info',
          title: '配置写入尝试被记录，但没有发生写入',
          detail: '实验配置只由界面上的开关修改；文档内容没有通往配置对象的写入路径，因此 configChanged=false。',
          rule: 'config/no-write-path',
          resourceId: action.resourceId,
          sourceIds: [samples.injection.docId],
        });
      }
    }
  }

  /* ---------- 4. 结论（冲突来自公开公告的日期比对） ---------- */
  const dateA = '10 月 24 日';
  const dateB = '10 月 26 日';
  const conclusion = {
    status: usedSources.length < 2 ? 'insufficient' : 'unresolved',
    statusCn: usedSources.length < 2 ? '资料不足' : '证据冲突 · 未决',
    text:
      usedSources.length < 2
        ? '可用来源不足：无法给出日期结论，结论为资料不足。'
        : `NTC-1008 给出 ${dateA}，NTC-1009 给出 ${dateB}：同一事项日期冲突且没有更正关系，结论为未决。`,
    citations: usedSources.map((docId) => ({ docId })),
  };
  if (injection.influenced) {
    conclusion.text += ' 另：本次有由不可信文本诱导的动作被放行，属于配置过宽的直接后果。';
  }

  const outputVerdict = checkOutput(
    { text: conclusion.text, citations: conclusion.citations.length, status: conclusion.status },
    { enabled: policyBefore.guardrails.output }
  );
  trace.push({
    type: 'output-check',
    status: outputVerdict.hit ? 'warning' : 'info',
    title: outputVerdict.hit ? `输出护栏命中 ${outputVerdict.hits.length} 条规则` : '输出护栏未命中',
    detail: outputVerdict.hit ? outputVerdict.hits.map((hit) => `${hit.cn}：${hit.excerpt}`).join('；') : outputVerdict.note,
    rule: 'guardrail/output',
    sourceIds: conclusion.citations.map((citation) => citation.docId),
  });

  trace.push({
    type: 'terminate',
    status: 'info',
    title: `运行终止：${injection.totalActions ? (injection.influenced ? '存在被放行的诱导动作' : '全部诱导动作被拒绝') : '仅正常流程'}`,
    detail: `公开来源 ${usedSources.length} 条 · 诱导动作 ${injection.deniedActions} 拒绝 / ${injection.allowedActions} 放行 · 配置变更 ${injection.configChanged ? '是' : '否'}`,
    rule: 'terminate/completed',
    sourceIds: usedSources,
  });

  /* ---------- 5. 只读快照：验证策略与指令未被文档改写 ---------- */
  const policyAfter = Object.freeze({ ...policyBefore, guardrails: Object.freeze({ ...policyBefore.guardrails }) });
  const systemInstructionAfter = INJECTION_SAMPLE.systemInstructionText;

  const run = {
    runId: trace.runId,
    events: trace.events,
    requests,
    policy: policyBefore,
    policyAfter,
    systemInstructions: systemInstructionBefore,
    systemInstructionsAfter: systemInstructionAfter,
    samples,
    injection,
    conclusion,
    usedSources,
    traceFilters: TRACE_FILTERS,
  };
  run.evals = runEvals(run);
  run.scope = {
    resources: RESOURCES.length,
    sandbox: sandboxMode(policyBefore.sandbox),
    note: '权限与沙箱均为前端规则模拟：没有真实文件系统、没有网络访问，也不构成真实系统隔离。',
  };
  return run;
}

export { applyPolicyPatch, DEFAULT_POLICY };
