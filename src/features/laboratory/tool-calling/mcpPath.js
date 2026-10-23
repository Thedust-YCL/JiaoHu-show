/**
 * src/features/laboratory/tool-calling/mcpPath.js
 * ------------------------------------------------------------------
 * Lab 03 的**协议路径纯逻辑**：把同一份已发生的工具调用轨迹，分别用
 * 「直连」与「MCP」两种路径表达出来。
 *
 * 三条硬约束（M1.2_TASK §6）：
 *   1. **不伪造第二套执行记录**：本模块只读取既有 runSimulation 产物
 *      （events / payloads / evidence），不生成新的工具事件、不改写消息；
 *   2. **协议不改变事实**：两条路径引用的 payload 引用完全一致，
 *      `sameUnderlyingData()` 对同一份 run 恒为 true——「用了 MCP」不会让
 *      文档内容更准确，也不会让成功率变高；
 *   3. **不声称真实握手**：这里只是把角色（Host / Client / Server）
 *      叠在既有事件上做教学可视化，不实现 JSON-RPC、SDK 或网络传输。
 *
 * 能力类型（Tools / Resources / Prompts）来自 MCP 规范；本模块把它们作为
 * **本地声明的能力清单**展示，不声称已与任何真实服务端协商。
 * ------------------------------------------------------------------
 */

/** MCP 三角色：与官方架构文档的角色划分一致（Host / Client / Server） */
export const MCP_ROLES = Object.freeze([
  Object.freeze({
    id: 'host',
    cn: 'Host · 宿主应用',
    note: '发起这一轮任务的 AI 应用：决定要不要用工具、把结果写回上下文。',
  }),
  Object.freeze({
    id: 'client',
    cn: 'Client · 协议客户端',
    note: '由 Host 为每个 Server 创建：负责按协议转发请求与回传结果。',
  }),
  Object.freeze({
    id: 'server',
    cn: 'Server · 协议服务端',
    note: '按协议提供能力的一方：接收调用、执行本地实现、返回结果。',
  }),
  Object.freeze({
    id: 'app',
    cn: 'App · 直连执行方',
    note: '不经协议时的执行位置：应用自己校验参数、调用本地工具、把结果写回上下文。',
  }),
]);

/** 能力类型：规范里 Server 可提供三类能力，用途不同 */
export const CAPABILITY_TYPES = Object.freeze([
  Object.freeze({ id: 'tools', cn: 'Tools · 工具', note: '会产生动作：模型请求执行一个函数，运行环境负责执行。' }),
  Object.freeze({ id: 'resources', cn: 'Resources · 资源', note: '只读的上下文与数据：例如公告原文、目录清单。' }),
  Object.freeze({ id: 'prompts', cn: 'Prompts · 提示模板', note: '模版化的消息与工作流：帮助构造任务，不执行动作。' }),
]);

/**
 * 本地声明的能力清单（教学演示用）。
 * 注意：`available` 表示「声明中存在」，是否放行还要看权限与调用条件。
 */
export const DEMO_CAPABILITIES = Object.freeze([
  Object.freeze({
    id: 'announcement_search',
    type: 'tools',
    cn: '公告检索',
    serverId: 'campus-announcements',
    note: '按范围标签在本地虚构语料里检索公告条目。',
  }),
  Object.freeze({
    id: 'document_reader',
    type: 'tools',
    cn: '文档读取',
    serverId: 'campus-announcements',
    note: '读取命中公告的摘要或正文，二者结果不同。',
  }),
  Object.freeze({
    id: 'notice-catalog',
    type: 'resources',
    cn: '公告目录',
    serverId: 'campus-announcements',
    note: '只读资源：列出本地语料里有哪些公告，不触发检索动作。',
  }),
  Object.freeze({
    id: 'research-task-template',
    type: 'prompts',
    cn: '研究任务模板',
    serverId: 'campus-announcements',
    note: '提示模板：把「校园活动整合可行性研究」拆成可复用的任务描述。',
  }),
]);

const TOOL_EVENT_TYPES = Object.freeze(['tool.call', 'tool.result', 'tool.error', 'tool.blocked']);

function isToolEvent(event) {
  return TOOL_EVENT_TYPES.includes(event.type) || String(event.type || '').startsWith('tool.');
}

/** 能力发现步骤：只在 MCP 路径出现，用来解释「角色怎么知道有什么能力」 */
export function capabilityDiscovery({ mode = 'mcp', capabilityIds = null } = {}) {
  const known = DEMO_CAPABILITIES.filter((c) => (capabilityIds ? capabilityIds.includes(c.id) : true));
  if (mode !== 'mcp') {
    return {
      mode,
      steps: [],
      capabilities: known.map((c) => ({ ...c, discovered: true, note: c.note })),
      note: '直连路径不需要协议发现：工具由应用自己注册，能力清单就是应用自己的配置。',
    };
  }
  return {
    mode,
    steps: [
      { role: 'host', phase: 'discover', label: 'Host 建立连接', detail: '应用为每个 Server 创建一个 Client（教学示意，不发起网络请求）。' },
      { role: 'client', phase: 'discover', label: 'Client 请求能力清单', detail: '按协议向 Server 询问可用的工具、资源与提示模板。' },
      { role: 'server', phase: 'discover', label: 'Server 返回能力清单', detail: `本地声明的能力共 ${known.length} 项：${known.map((c) => c.id).join('、')}。` },
    ],
    capabilities: known.map((c) => ({ ...c, discovered: true, note: c.note })),
    note: '本演示的能力清单是本地声明，不声称与任何真实服务端协商过。',
  };
}

/**
 * 把既有 run 的事件轨迹包装成协议路径视图。
 *
 * @param {object} run             runSimulation 的产物（只读，不被修改）
 * @param {string} mode            'direct' | 'mcp'
 * @param {object[]} [options.capabilities] 可用能力清单（默认 DEMO_CAPABILITIES）
 */
export function buildProtocolTrace({ run, mode = 'direct', capabilities = DEMO_CAPABILITIES } = {}) {
  if (!run || !Array.isArray(run.events)) {
    return { mode, steps: [], discovery: capabilityDiscovery({ mode }), events: [], facts: emptyFacts() };
  }
  const steps = [];
  const enabled = new Map(capabilities.map((c) => [c.id, c]));

  for (const event of run.events) {
    const toolEvent = isToolEvent(event);
    const eventStep = {
      kind: 'event',
      /** 引用既有事件，不复制内容也不改写它 */
      eventId: event.id,
      type: event.type,
      status: event.status,
      message: event.message,
      /** 载荷引用：两条路径必须完全一致 */
      inputRef: event.inputRef || null,
      outputRef: event.outputRef || null,
      actor: event.actor || null,
    };

    if (mode !== 'mcp') {
      steps.push({ ...eventStep, role: 'app', phase: toolEvent ? 'execute' : 'assemble' });
      continue;
    }

    /* ---- MCP 路径：在既有事件两侧叠加角色，事件本身保持原样 ---- */
    if (toolEvent && event.type === 'tool.call') {
      steps.push({ kind: 'envelope', role: 'host', phase: 'request', label: 'Host 收到模型的工具请求', eventId: event.id, detail: 'Host 解析工具名与参数，决定是否转发；不执行任何函数。' });
      steps.push({ kind: 'envelope', role: 'client', phase: 'request', label: 'Client 转发 tools/call', eventId: event.id, detail: '按协议把请求转给对应 Server（教学示意，无网络传输）。' });
      steps.push({ ...eventStep, role: 'server', phase: 'execute' });
      continue;
    }
    if (toolEvent && (event.type === 'tool.result' || event.type === 'tool.error' || event.status === 'blocked')) {
      steps.push({ ...eventStep, role: 'server', phase: 'respond' });
      steps.push({ kind: 'envelope', role: 'client', phase: 'relay', label: 'Client 回传结果', eventId: event.id, detail: '把 Server 的结果原样交回 Host；内容不做任何加工。' });
      steps.push({ kind: 'envelope', role: 'host', phase: 'inject', label: 'Host 写回上下文', eventId: event.id, detail: '结果作为新消息进入模型上下文，供下一轮使用。' });
      continue;
    }
    steps.push({ ...eventStep, role: 'host', phase: 'assemble' });
  }

  const discovery = capabilityDiscovery({ mode, capabilityIds: [...enabled.keys()] });
  const toolEvents = run.events.filter(isToolEvent);
  const payloadOf = (event) => (event.outputRef ? run.artifacts?.payloads?.[event.outputRef] : null) ?? null;
  const succeeded = toolEvents.filter((e) => e.status === 'success');
  const succeededPayloads = succeeded.map(payloadOf).filter(Boolean);
  const readPayloads = succeededPayloads.filter((p) => p && p.kind === 'read.response');
  const searchPayloads = succeededPayloads.filter((p) => p && p.kind === 'search.response');
  const facts = {
    /** 注意：facts 里不放 mode —— 两条路径的事实必须能逐字段比较 */
    outcome: run.outcome,
    branchId: run.branchId,
    toolEventIds: toolEvents.map((e) => e.id),
    /** 只统计**成功**的工具返回，失败/阻断不会产生数据引用 */
    dataRefs: succeeded.map((e) => e.outputRef).filter(Boolean),
    successEvents: succeeded.length,
    blockedEvents: toolEvents.filter((e) => e.status === 'blocked' || e.status === 'error').length,
    searchResults: searchPayloads.length,
    readResults: readPayloads.length,
    evidenceLevel: run.artifacts?.evidence?.level ?? null,
    evidenceSourceIds: (run.artifacts?.evidence?.sourceIds || []).slice(),
    /** 真正读到的文档正文：只有成功的 read.response 才算 */
    documentTexts: readPayloads.map((p) => p.content || '').filter(Boolean),
  };
  return { mode, steps, discovery, events: run.events, facts, roles: MCP_ROLES };
}

function emptyFacts() {
  return {
    outcome: null,
    branchId: null,
    toolEventIds: [],
    dataRefs: [],
    successEvents: 0,
    blockedEvents: 0,
    searchResults: 0,
    readResults: 0,
    evidenceLevel: null,
    evidenceSourceIds: [],
    documentTexts: [],
  };
}

/**
 * 两条路径的对照：用来在界面上、也在测试里证明「协议不改变事实」。
 * 相同 run + 相同能力条件下必须完全一致；任何差异都是实现错误。
 */
export function comparePaths(run, { mode = 'mcp' } = {}) {
  const direct = buildProtocolTrace({ run, mode: 'direct' });
  const protocol = buildProtocolTrace({ run, mode });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const checks = [
    { key: 'outcome', label: '运行结局', same: direct.facts.outcome === protocol.facts.outcome, direct: direct.facts.outcome, protocol: protocol.facts.outcome },
    { key: 'branch', label: '分支', same: direct.facts.branchId === protocol.facts.branchId, direct: direct.facts.branchId, protocol: protocol.facts.branchId },
    {
      key: 'toolEvents',
      label: '工具事件序列',
      same: same(direct.facts.toolEventIds, protocol.facts.toolEventIds),
      direct: direct.facts.toolEventIds.length,
      protocol: protocol.facts.toolEventIds.length,
    },
    {
      key: 'dataRefs',
      label: '返回数据引用',
      same: same(direct.facts.dataRefs, protocol.facts.dataRefs),
      direct: direct.facts.dataRefs.join('、') || '（无）',
      protocol: protocol.facts.dataRefs.join('、') || '（无）',
    },
    {
      key: 'documentTexts',
      label: '文档内容',
      same: same(direct.facts.documentTexts, protocol.facts.documentTexts),
      direct: `${direct.facts.documentTexts.length} 段`,
      protocol: `${protocol.facts.documentTexts.length} 段`,
    },
    {
      key: 'success',
      label: '成功 / 阻断计数',
      same: direct.facts.successEvents === protocol.facts.successEvents && direct.facts.blockedEvents === protocol.facts.blockedEvents,
      direct: `${direct.facts.successEvents} 成功 / ${direct.facts.blockedEvents} 阻断`,
      protocol: `${protocol.facts.successEvents} 成功 / ${protocol.facts.blockedEvents} 阻断`,
    },
  ];

  return {
    same: checks.every((c) => c.same),
    checks,
    direct,
    protocol,
    note: checks.every((c) => c.same)
      ? '两条路径引用了完全相同的事件与数据：协议改变的是接入路径，不改变事实、成功率或资料内容。'
      : '检测到路径差异：这属于实现缺陷（协议路径不允许改变事实），请检查是否旁路修改了事件或载荷。',
  };
}

/** 协议路径的步骤计数（界面显示「多了几步」用，不做性能承诺） */
export function protocolStepStats(trace) {
  const envelope = trace.steps.filter((s) => s.kind === 'envelope').length;
  return { total: trace.steps.length, envelope, events: trace.steps.length - envelope };
}

export { isToolEvent };
