/**
 * src/knowledge/relations.js
 * ------------------------------------------------------------------
 * 统一语义关系（M1.1_TASK §4）：**唯一**的关系数据源。
 *
 * 规则：
 *   · 只使用 USES / PART_OF / RELATED / CONTRASTS 四种类型；
 *   · 每条边必须有 id / sourceId / targetId / type / directed / description，
 *     且 description 要写清「是什么关系、容易误解在哪」，不允许只写「相关」；
 *   · USES 与 PART_OF 是有向的：**sourceId 使用 / 属于 targetId**；
 *     RELATED 与 CONTRASTS 无向，不能画成强依赖箭头；
 *   · M0.3 的 10 条边原样保留（id、端点、类型、方向与说明都不改），
 *     新增边只补充已被教科书与 PRD 确认的语义，不为填满线型而虚构；
 *   · PART_OF 只登记经得起推敲的三条（ml→ai、system_prompt→instructions、
 *     mcp_server→mcp），不用它制造假层级。
 * ------------------------------------------------------------------
 */

/** 关系类型定义：中文解释与线型集中在这里，图例、Inspector 与知识页共用 */
export const RELATION_TYPES = Object.freeze({
  USES: Object.freeze({
    id: 'USES',
    cn: '使用',
    directed: true,
    dash: '',
    desc: '左侧概念在实现任务时会用到右侧概念所代表的能力，方向明确（左 → 右）。',
  }),
  PART_OF: Object.freeze({
    id: 'PART_OF',
    cn: '组成部分',
    directed: true,
    dash: '7 4',
    desc: '左侧概念是右侧概念的一个组成部分，方向明确（部分 → 整体）；不表示「整体只能靠它」。',
  }),
  RELATED: Object.freeze({
    id: 'RELATED',
    cn: '相关',
    directed: false,
    dash: '4 5',
    desc: '两个概念经常一起出现或容易被混淆，但不构成必需依赖，也不表示因果方向。',
  }),
  CONTRASTS: Object.freeze({
    id: 'CONTRASTS',
    cn: '对照',
    directed: false,
    dash: '2 4',
    desc: '两者解决相似问题但控制方式不同，用来对照理解，不能简化成谁更好。',
  }),
});

/** 关系类型稳定顺序（图例与校验用） */
export const RELATION_TYPE_ORDER = Object.freeze(['USES', 'PART_OF', 'RELATED', 'CONTRASTS']);

export const RELATIONSHIPS = Object.freeze([
  /* ================================================================
   * 一、M0.3 既有 10 条边（原样保留，语义不变，id 不变）
   * ================================================================ */
  Object.freeze({
    id: 'rel-agent-llm',
    sourceId: 'agent',
    targetId: 'llm',
    type: 'USES',
    directed: true,
    origin: 'M0.3',
    description: 'Agent 系统通常可以使用模型完成判断、归纳与生成任务相关内容；模型是可被使用的部件，不是 Agent 本身。',
  }),
  Object.freeze({
    id: 'rel-agent-tools',
    sourceId: 'agent',
    targetId: 'tools',
    type: 'USES',
    directed: true,
    origin: 'M0.3',
    description: 'Agent 可以调用外部工具来完成任务；工具由运行环境提供并执行，模型只提出调用请求。',
  }),
  Object.freeze({
    id: 'rel-llm-toolcalling',
    sourceId: 'llm',
    targetId: 'tool_calling',
    type: 'RELATED',
    directed: false,
    origin: 'M0.3',
    description: '支持工具调用的模型可以生成结构化的工具请求；真正执行发生在模型外部的运行环境，因此两者相关但不等同。',
  }),
  Object.freeze({
    id: 'rel-toolcalling-tools',
    sourceId: 'tool_calling',
    targetId: 'tools',
    type: 'USES',
    directed: true,
    origin: 'M0.3',
    description: '工具调用机制请求执行已经提供好的工具；没有可用的工具，调用请求只会被拒绝或阻断。',
  }),
  Object.freeze({
    id: 'rel-tools-api',
    sourceId: 'tools',
    targetId: 'api',
    type: 'RELATED',
    directed: false,
    origin: 'M0.3',
    description: '部分工具内部会封装一个 API，但两者不是同义词：API 是软件之间的接口约定，工具是交给模型请求的能力入口。',
  }),
  Object.freeze({
    id: 'rel-mcp-tools',
    sourceId: 'mcp',
    targetId: 'tools',
    type: 'RELATED',
    directed: false,
    origin: 'M0.3',
    description: 'MCP Server 可以对外暴露工具，也可以暴露资源、提示模板等其它能力；反过来，工具完全可以不经 MCP 由应用直接注册。',
  }),
  Object.freeze({
    id: 'rel-agent-skills',
    sourceId: 'agent',
    targetId: 'skills',
    type: 'RELATED',
    directed: false,
    origin: 'M0.3',
    description: 'Agent 可以按需加载任务技能说明来获得做法，但加载 Skills 不等于授予工具权限，也不代表某个动作已经执行。',
  }),
  Object.freeze({
    id: 'rel-agent-rag',
    sourceId: 'agent',
    targetId: 'rag',
    type: 'RELATED',
    directed: false,
    origin: 'M0.3',
    description: '检索增强是 Agent 可选的一种机制，并非所有 Agent 都使用；不用 RAG 的系统同样可以完成任务，只是资料获取方式不同。',
  }),
  Object.freeze({
    id: 'rel-workflow-agent',
    sourceId: 'workflow',
    targetId: 'agent',
    type: 'CONTRASTS',
    directed: false,
    origin: 'M0.3',
    description: '对照说明预设流程与运行期动态选择的区别：Workflow 的步骤由开发者写死，Agent 的下一步在运行期决定；两者不构成优劣排序。',
  }),
  Object.freeze({
    id: 'rel-harness-agent',
    sourceId: 'harness',
    targetId: 'agent',
    type: 'RELATED',
    directed: false,
    origin: 'M0.3',
    description: 'Harness 负责支持与组织 Agent 的执行环境（上下文组装、工具分派、循环控制），它不是另一个模型。',
  }),

  /* ================================================================
   * 二、第 01 章新增：智能诞生
   * ================================================================ */
  Object.freeze({
    id: 'rel-ml-ai',
    sourceId: 'ml',
    targetId: 'ai',
    type: 'PART_OF',
    directed: true,
    origin: 'M1.1',
    description: '机器学习是「让人工智能达成目标」的一条实现路径：它是 AI 的组成部分，但 AI 不等于机器学习（还有规则系统等其它做法）。',
  }),
  Object.freeze({
    id: 'rel-llm-ml',
    sourceId: 'llm',
    targetId: 'ml',
    type: 'RELATED',
    directed: false,
    origin: 'M1.1',
    description: 'LLM 由机器学习方法训练得到，但两者不同层：LLM 是具体模型，机器学习是方法范畴，不能互相替代也不构成依赖。',
  }),
  Object.freeze({
    id: 'rel-llm-transformer',
    sourceId: 'llm',
    targetId: 'transformer',
    type: 'RELATED',
    directed: false,
    origin: 'M1.1',
    description: '当前主流 LLM 采用 Transformer 结构，但 LLM 是能力范畴、Transformer 是网络结构；把两者当同义词会误以为换结构就等于换能力。',
  }),
  Object.freeze({
    id: 'rel-llm-token',
    sourceId: 'llm',
    targetId: 'token',
    type: 'RELATED',
    directed: false,
    origin: 'M1.1',
    description: '模型的输入输出都以 token 计量，但 token 只是切分单位，不承载语义判断；上下文容量与计费按它计算。',
  }),
  Object.freeze({
    id: 'rel-llm-inference',
    sourceId: 'llm',
    targetId: 'inference',
    type: 'USES',
    directed: true,
    origin: 'M1.1',
    description: 'LLM 产生回答的过程就是一次推理（前向计算）：它用已有参数把输入变成输出，不读取外部数据，也不产生可观察的「思考过程」。',
  }),
  Object.freeze({
    id: 'rel-token-transformer',
    sourceId: 'token',
    targetId: 'transformer',
    type: 'RELATED',
    directed: false,
    origin: 'M1.1',
    description: 'Transformer 以 token 序列作为输入输出的单位；token 是切分产物，不是网络结构的一部分。',
  }),
  Object.freeze({
    id: 'rel-token-inference',
    sourceId: 'token',
    targetId: 'inference',
    type: 'RELATED',
    directed: false,
    origin: 'M1.1',
    description: '推理按 token 逐个生成输出，因此响应长度、上下文容量与耗时都以 token 计。',
  }),
  Object.freeze({
    id: 'rel-token-contextwindow',
    sourceId: 'token',
    targetId: 'context_window',
    type: 'RELATED',
    directed: false,
    origin: 'M1.1',
    description: '上下文窗口的容量通常用 token 衡量：窗口限制的是总量，不改变单个 token 的含义。',
  }),

  /* ================================================================
   * 三、第 02 章新增：指令与上下文
   * ================================================================ */
  Object.freeze({
    id: 'rel-contextwindow-contextengineering',
    sourceId: 'context_window',
    targetId: 'context_engineering',
    type: 'RELATED',
    directed: false,
    origin: 'M1.1',
    description: '上下文工程要在窗口容量内做取舍，因此窗口是它的前提约束，而不是它的同义词；调窗口大小 ≠ 做上下文工程。',
  }),
  Object.freeze({
    id: 'rel-instructions-prompt',
    sourceId: 'instructions',
    targetId: 'prompt',
    type: 'RELATED',
    directed: false,
    origin: 'M1.1',
    description: 'Prompt 是这一轮的完整输入，Instructions 是其中规定做法的那部分；资料与用户问题同样在 prompt 里，混为一谈会误判作用范围。',
  }),
  Object.freeze({
    id: 'rel-systemprompt-instructions',
    sourceId: 'system_prompt',
    targetId: 'instructions',
    type: 'PART_OF',
    directed: true,
    origin: 'M1.1',
    description: '系统指令是指令集合中优先级最高的一部分：它不等于全部指令，也不等于用户输入；把它当成「唯一指令」会低估其它来源。',
  }),
  Object.freeze({
    id: 'rel-llm-hallucination',
    sourceId: 'llm',
    targetId: 'hallucination',
    type: 'RELATED',
    directed: false,
    origin: 'M1.1',
    description: '幻觉来自按概率续写而非查询事实，是模型的固有边界现象；它不是「资料缺失」的同义说法，也不是故意说谎。',
  }),
  Object.freeze({
    id: 'rel-hallucination-promptinjection',
    sourceId: 'hallucination',
    targetId: 'prompt_injection',
    type: 'CONTRASTS',
    directed: false,
    origin: 'M1.1',
    description: '对照两种「输出不可信」：幻觉是无依据的生成，提示注入是被外部内容操纵行为；成因与防线完全不同，不能用一个概念解释另一种现象。',
  }),

  /* ================================================================
   * 四、第 03 章新增：外部能力
   * ================================================================ */
  Object.freeze({
    id: 'rel-functioncalling-toolcalling',
    sourceId: 'function_calling',
    targetId: 'tool_calling',
    type: 'RELATED',
    directed: false,
    origin: 'M1.1',
    description: 'Function Calling 常被当作 Tool Calling 的同义说法，但它更强调「按函数签名与参数 Schema 调用」这一种实现形式，工具调用还包含其它形态。',
  }),
  Object.freeze({
    id: 'rel-mcpserver-mcp',
    sourceId: 'mcp_server',
    targetId: 'mcp',
    type: 'PART_OF',
    directed: true,
    origin: 'M1.1',
    description: 'MCP Server 是 MCP 架构中的组成部分：它按协议对外提供能力，由客户端一侧连接与调用；协议本身不等于服务端实现。',
  }),
  Object.freeze({
    id: 'rel-mcpserver-tools',
    sourceId: 'mcp_server',
    targetId: 'tools',
    type: 'RELATED',
    directed: false,
    origin: 'M1.1',
    description: 'MCP Server 可以对外暴露工具，但工具也可以由应用直接注册；服务端存在不等于能力已被授权可用。',
  }),
  Object.freeze({
    id: 'rel-api-mcp',
    sourceId: 'api',
    targetId: 'mcp',
    type: 'RELATED',
    directed: false,
    origin: 'M1.1',
    description: '两者都在接口层面，但 API 是软件之间的调用约定，MCP 是外部能力接入模型应用的协议；协议接得上不代表模型会直接调用 API。',
  }),
  Object.freeze({
    id: 'rel-toolcalling-mcp',
    sourceId: 'tool_calling',
    targetId: 'mcp',
    type: 'RELATED',
    directed: false,
    origin: 'M1.2',
    description: '工具调用是「模型请求 → 运行环境执行」的机制，MCP 是这类能力的一种接入路径：同一份能力可以直连注册，也可以经 MCP 暴露；换路径不改变执行者与授权方，也不改变数据本身。',
  }),

  /* ================================================================
   * 五、第 04 章新增：信息与方法
   * ================================================================ */
  Object.freeze({
    id: 'rel-retrieval-rag',
    sourceId: 'retrieval',
    targetId: 'rag',
    type: 'RELATED',
    directed: false,
    origin: 'M1.1',
    description: '检索是 RAG 流程中的一步，但检索可以单独使用；RAG 还包含切分、建索引与基于片段的生成，不能互相替代。',
  }),
  Object.freeze({
    id: 'rel-rag-embedding',
    sourceId: 'rag',
    targetId: 'embedding',
    type: 'USES',
    directed: true,
    origin: 'M1.1',
    description: '向量检索式 RAG 会使用 embedding 计算语义相似度；关键词式 RAG 不使用 embedding，因此这是常用实现方式，而不是绝对依赖。',
  }),
  Object.freeze({
    id: 'rel-chunking-retrieval',
    sourceId: 'chunking',
    targetId: 'retrieval',
    type: 'RELATED',
    directed: false,
    origin: 'M1.1',
    description: '检索前通常要把长资料切分成片段，切分粒度直接影响命中精度；但切分不是检索本身。',
  }),
  Object.freeze({
    id: 'rel-chunking-rag',
    sourceId: 'chunking',
    targetId: 'rag',
    type: 'RELATED',
    directed: false,
    origin: 'M1.1',
    description: '切分粒度直接决定 RAG 的检索质量：片段太碎会丢掉上下文，太大则浪费窗口并降低命中精度。',
  }),
  Object.freeze({
    id: 'rel-memory-rag',
    sourceId: 'memory',
    targetId: 'rag',
    type: 'CONTRASTS',
    directed: false,
    origin: 'M1.1',
    description: '对照两种「把信息带进上下文」：记忆侧重跨轮次保留，检索侧重按当前查询取证据；两者常组合使用，不存在互相替代。',
  }),
  Object.freeze({
    id: 'rel-memory-contextwindow',
    sourceId: 'memory',
    targetId: 'context_window',
    type: 'RELATED',
    directed: false,
    origin: 'M1.1',
    description: '记忆决定了哪些历史信息会被重新注入有限的上下文窗口；两者是「取舍内容」与「容量上限」的关系。',
  }),
  Object.freeze({
    id: 'rel-retrieval-contextengineering',
    sourceId: 'retrieval',
    targetId: 'context_engineering',
    type: 'RELATED',
    directed: false,
    origin: 'M1.1',
    description: '检索是上下文工程获取资料的主要手段之一，但上下文工程还包括排序、裁剪与取舍；把上下文工程等同于检索会漏掉一半工作。',
  }),

  /* ================================================================
   * 六、第 05 章新增：执行系统
   * ================================================================ */
  Object.freeze({
    id: 'rel-agent-agentloop',
    sourceId: 'agent',
    targetId: 'agent_loop',
    type: 'USES',
    directed: true,
    origin: 'M1.1',
    description: 'Agent 的运行依赖执行循环：观察、决策、调用、核验、再决策，直到满足终止条件；没有循环就只是一次性问答。',
  }),
  Object.freeze({
    id: 'rel-harness-agentloop',
    sourceId: 'harness',
    targetId: 'agent_loop',
    type: 'USES',
    directed: true,
    origin: 'M1.1',
    description: 'Harness 负责驱动并约束执行循环，包括停止条件、失败处理与事件记录；循环逻辑写在运行环境里，而不是写进模型参数。',
  }),
  Object.freeze({
    id: 'rel-orchestration-workflow',
    sourceId: 'orchestration',
    targetId: 'workflow',
    type: 'RELATED',
    directed: false,
    origin: 'M1.1',
    description: '编排既可以写成固定流程，也可以写成运行期调度；Workflow 是编排收敛后的一种形态，不是编排的全部。',
  }),
  Object.freeze({
    id: 'rel-multiagent-orchestration',
    sourceId: 'multi_agent',
    targetId: 'orchestration',
    type: 'RELATED',
    directed: false,
    origin: 'M1.1',
    description: '多智能体需要编排来决定分工、结果合并与失败重试；但编排不等于多智能体，单个 Agent 同样需要调度。',
  }),
  Object.freeze({
    id: 'rel-workflow-harness',
    sourceId: 'workflow',
    targetId: 'harness',
    type: 'RELATED',
    directed: false,
    origin: 'M1.1',
    description: '固定流程同样需要运行环境来执行、约束与记录；两者一个是被执行的路径，一个是承载并控制它的环境。',
  }),

  /* ================================================================
   * 七、第 06 章新增：可靠性与边界
   * ================================================================ */
  Object.freeze({
    id: 'rel-permissions-sandbox',
    sourceId: 'permissions',
    targetId: 'sandbox',
    type: 'RELATED',
    directed: false,
    origin: 'M1.1',
    description: '权限是授权规则（能做什么），沙箱是执行环境的隔离边界（碰得到什么）；两者互补，不能互相替代。',
  }),
  Object.freeze({
    id: 'rel-guardrails-permissions',
    sourceId: 'guardrails',
    targetId: 'permissions',
    type: 'CONTRASTS',
    directed: false,
    origin: 'M1.1',
    description: '对照两类控制：护栏检查内容与格式，权限控制动作与数据访问；控制对象不同，只做其中一个都会留缺口。',
  }),
  Object.freeze({
    id: 'rel-evals-tracing',
    sourceId: 'evals',
    targetId: 'tracing',
    type: 'RELATED',
    directed: false,
    origin: 'M1.1',
    description: '追踪记录每一步发生了什么，评估衡量结果好不好：前者提供证据，后者给出判断，缺一个都会让结论站不住。',
  }),
  Object.freeze({
    id: 'rel-evals-agent',
    sourceId: 'evals',
    targetId: 'agent',
    type: 'RELATED',
    directed: false,
    origin: 'M1.1',
    description: '评估用来衡量 Agent 的任务完成度，因此评估口径必须写清任务定义与判定标准，否则「跑通了」等于没测。',
  }),
  Object.freeze({
    id: 'rel-sandbox-tools',
    sourceId: 'sandbox',
    targetId: 'tools',
    type: 'RELATED',
    directed: false,
    origin: 'M1.1',
    description: '工具在受限环境中执行，沙箱缩小它可能触达的资源范围；限制范围不等于授权，工具仍然需要显式放行。',
  }),
  Object.freeze({
    id: 'rel-agentloop-permissions',
    sourceId: 'agent_loop',
    targetId: 'permissions',
    type: 'RELATED',
    directed: false,
    origin: 'M1.1',
    description: '执行循环的每一轮都必须检查权限：越权的下一步要被直接拒绝，否则循环会把一次错误放大成一条轨迹。',
  }),
  Object.freeze({
    id: 'rel-promptinjection-guardrails',
    sourceId: 'prompt_injection',
    targetId: 'guardrails',
    type: 'RELATED',
    directed: false,
    origin: 'M1.1',
    description: '护栏是拦截提示注入的主要手段之一，但规则总有绕过风险，不能当作绝对防线；高权限动作仍需人工确认。',
  }),
  Object.freeze({
    id: 'rel-promptinjection-permissions',
    sourceId: 'prompt_injection',
    targetId: 'permissions',
    type: 'RELATED',
    directed: false,
    origin: 'M1.1',
    description: '注入常试图诱导越权动作，因此权限是最后一道硬约束：即使模型被说服，也无法调用未授权的工具。',
  }),
]);

/**
 * 关系索引：按类型与概念建立的查询结构，避免组件里手写多份过滤逻辑。
 */
const BY_SOURCE = new Map();
const BY_TARGET = new Map();
const BY_CONCEPT = new Map();
for (const edge of RELATIONSHIPS) {
  if (!BY_SOURCE.has(edge.sourceId)) BY_SOURCE.set(edge.sourceId, []);
  BY_SOURCE.get(edge.sourceId).push(edge);
  if (!BY_TARGET.has(edge.targetId)) BY_TARGET.set(edge.targetId, []);
  BY_TARGET.get(edge.targetId).push(edge);
  for (const id of [edge.sourceId, edge.targetId]) {
    if (!BY_CONCEPT.has(id)) BY_CONCEPT.set(id, []);
    BY_CONCEPT.get(id).push(edge);
  }
}

export function getRelationship(edgeId) {
  return RELATIONSHIPS.find((edge) => edge.id === edgeId) || null;
}

/** 与某个概念直接相连的全部边（包含进出两个方向，方向由 edge.directed 表达） */
export function edgesOf(conceptId) {
  return [...(BY_CONCEPT.get(conceptId) || [])];
}

export function relationMeta(type) {
  return RELATION_TYPES[type] || RELATION_TYPES.RELATED;
}

export { BY_SOURCE, BY_TARGET, BY_CONCEPT };
