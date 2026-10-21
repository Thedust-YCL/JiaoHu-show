/**
 * src/features/atlas/data/concepts.js
 * ------------------------------------------------------------------
 * M0.3 知识图谱的单一权威知识节点数据源：Atlas 星图、节点详情、
 * 搜索别名、知识页与「在系统中查看」的定位目标全部读取本文件，
 * 不允许在组件里另写一份概念文案或另一套节点 ID。
 *
 * 本文件是纯数据 + 纯函数，不依赖 DOM、Three.js、状态管理或渲染层，
 * 因此可以脱离浏览器在普通单元测试中直接运行（M0.3_TASK §4）。
 *
 * 名词策略：LLM、Agent、Tool Calling、API、MCP、Skills、RAG、Workflow、
 * Harness、JSON 等专有名词保留英文；说明文字使用中文，不造似是而非的中文译名。
 *
 * systemTarget 语义（由代码消费，取值固定三种）：
 *   'core'  → 该概念对应中央核心本身（LLM / Agent）
 *   'tools' → 该概念可定位到装配台里的工具模块（tool_calling / tools）
 *   'none'  → 解释性节点，装配台暂无对应模块，界面必须显示
 *             「能力架尚未提供对应模块」，不得伪装成已存在
 * ------------------------------------------------------------------
 */

/** 冻结一个概念条目：对象本身与其中的数组都不能被外部改写 */
function freezeConcept(concept) {
  return Object.freeze({
    ...concept,
    aliases: Object.freeze(concept.aliases),
    understand: Object.freeze(concept.understand),
    misconceptions: Object.freeze(concept.misconceptions.map((item) => Object.freeze(item))),
    related: Object.freeze(concept.related),
  });
}

/**
 * 概念节点表，键为稳定的 conceptId。
 * 顺序按章节推进：01 智能诞生 → 03 外部能力 → 04 信息与方法 → 05 执行系统。
 */
export const CONCEPTS = Object.freeze({
  llm: freezeConcept({
    id: 'llm',
    idx: '01',
    name: 'LLM',
    cn: '大语言模型',
    chapter: '01',
    chapterCn: '智能诞生',
    tagline: '负责语言生成与工具调用请求的模型能力，本身只处理文本。',
    aliases: Object.freeze([
      'llm',
      'large language model',
      'largelanguagemodel',
      '大语言模型',
      '语言模型',
      '大模型',
    ]),
    systemTarget: 'core',
    understand: Object.freeze([
      'LLM 是只做语言处理的模型本体：它读取一段文本，按训练中学到的统计规律继续生成文本。它擅长改写、归纳、按格式作答，但这些输出都来自已有参数，不是去外部查询得到的事实。',
      '它没有内置的互联网访问，也不会自己执行动作。当应用把可用工具的说明一并放进上下文，模型可以产出一段结构化的调用请求；至于这个请求是否被执行，由外部运行环境决定，模型只负责提出请求。',
    ]),
    misconceptions: Object.freeze([
      {
        claim: '大语言模型自带实时联网，所以它说的事实一定是查到的。',
        correction: '模型本体不联网，它只是根据上下文续写文本。要拿到外部事实，需要由应用检索资料或调用工具，再把结果放回上下文。因此模型说得流畅不等于内容有依据。',
      },
    ]),
    related: Object.freeze(['tool_calling', 'agent']),
    nextSteps:
      '后续学习提示：接着看 Tool Calling，理解模型提出的请求如何被外部执行；实验空间开放后可以动手观察「只有模型」与「模型加工具」的差别。',
  }),

  agent: freezeConcept({
    id: 'agent',
    idx: '02',
    name: 'Agent',
    cn: '智能体执行系统',
    chapter: '05',
    chapterCn: '执行系统',
    tagline: '模型与工具、控制流程共同组成、用来完成任务的执行系统。',
    aliases: Object.freeze([
      'agent',
      'ai agent',
      'aiagent',
      '智能体',
      '智能体执行系统',
      '代理',
    ]),
    systemTarget: 'core',
    understand: Object.freeze([
      'Agent 是一套执行系统，而不是模型的另一个名字。它通常由模型、可调用的工具、上下文与执行控制共同组成：模型负责判断下一步做什么，运行环境负责真正执行，并把结果放回上下文供下一轮判断。',
      '它和 Workflow 的区别在控制权归属：Workflow 的步骤由开发者预先写死，Agent 的下一步在运行期由模型根据当前信息选择。这不代表 Agent 一定更好：可预测、要求稳定的任务，固定流程往往更合适。',
    ]),
    misconceptions: Object.freeze([
      {
        claim: 'Agent 就是更聪明的模型，模型升级换代就等于有了 Agent。',
        correction: 'Agent 是围绕模型搭建的执行系统，模型只是其中的判断与生成部件。没有工具、上下文管理和执行控制，再强的模型也只是一个会说文本的模型，不会自己去完成任务。',
      },
    ]),
    related: Object.freeze(['llm', 'tools', 'workflow']),
    nextSteps:
      '后续学习提示：先看 LLM 明确模型的能力边界，再看 Workflow 与 Harness，理解执行路径由谁决定、由谁承载；实验空间开放后可以观察同一任务在固定流程与运行期选择下的不同轨迹。',
  }),

  tool_calling: freezeConcept({
    id: 'tool_calling',
    idx: '03',
    name: 'Tool Calling',
    cn: '工具调用',
    chapter: '03',
    chapterCn: '外部能力',
    tagline: '模型提出结构化调用请求，外部执行环境执行工具并把结果返回模型。',
    aliases: Object.freeze([
      'tool calling',
      'toolcalling',
      'tool call',
      'toolcall',
      '工具调用',
      '函数调用',
      'function calling',
      'functioncalling',
      '工具使用',
    ]),
    systemTarget: 'tools',
    understand: Object.freeze([
      'Tool Calling 是一套三方分工的机制：模型根据上下文判断需要外部能力，产出一段结构化的调用请求，写明要调用的工具名和参数；这份请求本身不是执行结果，只是「我想调用什么」。',
      '真正执行的是外部运行环境。应用拿到请求后检查工具是否已提供、参数是否合法、当前是否有权限，然后去调用对应的本地函数或接口，再把返回值作为新消息放回模型上下文，让模型基于真实结果继续作答。',
      '边界要分清：模型不执行工具，也不等于模型自带联网能力；能输出合法的工具 JSON，只能说明请求格式正确，不能说明工具已经执行成功。工具可以预先在应用里注册，不一定通过 MCP 提供，API 与 MCP 也都只是实现方式。',
    ]),
    misconceptions: Object.freeze([
      {
        claim: '模型能输出工具 JSON，就说明工具已经执行成功了。',
        correction: '模型只负责生成请求，执行发生在外部环境。工具未提供、参数不合法、权限不足或执行出错时，都不会有成功结果；模型只能在收到返回内容后，才知道这次调用到底成没成功。',
      },
      {
        claim: '会 Tool Calling 就等于模型自己长了手，可以自己上网、自己读写文件。',
        correction: '调用请求必须由外部运行环境执行，文件与网络权限也在那一侧控制。模型拿到的只是执行后返回的文本，它既没有直接的操作权，也没有绕过权限的能力。',
      },
    ]),
    related: Object.freeze(['llm', 'tools', 'api']),
    nextSteps:
      '后续学习提示：这是本阶段唯一提供完整分层知识页的节点，可以在 Understand 与 Inspect 之间切换，看清请求、执行与返回三段职责；再去 Constructor 把 Search 或 Reader 装配起来，实验空间开放后就能观察同一请求在工具缺失或未授权时的真实分支。',
  }),

  tools: freezeConcept({
    id: 'tools',
    idx: '04',
    name: 'Tools',
    cn: '工具',
    chapter: '03',
    chapterCn: '外部能力',
    tagline: '提供特定外部能力的可调用接口，用来补上模型本身没有的能力。',
    aliases: Object.freeze([
      'tools',
      'tool',
      '工具',
      '外部工具',
      '可调用接口',
      '工具模块',
    ]),
    systemTarget: 'tools',
    understand: Object.freeze([
      '工具是提供给模型使用的一项具体外部能力，通常带上名字、说明和参数格式，让模型知道它能做什么、该怎么请求。它由外部环境实现和执行，模型只能请求调用，不能直接操作。',
      '工具与协议是两件事：工具是具体的能力入口，MCP 之类的协议是连接方式。工具可以写在应用里直接注册，也可以经某种协议接进来；能力是否可用，取决于运行环境是否提供并放行，而不取决于用了哪种协议。',
    ]),
    misconceptions: Object.freeze([
      {
        claim: '工具必须通过 MCP 这类协议才能给模型用。',
        correction: '工具由运行环境注册即可使用，协议只是其中一种标准化的接入方式。把工具和协议当成同一件事，会误以为没接协议就没有工具能力。',
      },
    ]),
    related: Object.freeze(['tool_calling', 'api', 'mcp']),
    nextSteps:
      '后续学习提示：接着看 API 与 MCP，分清「能力入口」「接口形式」和「连接协议」三种不同的东西；实验空间开放后可以在装配台里观察工具从缺少配置到可用的过程。',
  }),

  api: freezeConcept({
    id: 'api',
    idx: '05',
    name: 'API',
    cn: '应用程序接口',
    chapter: '03',
    chapterCn: '外部能力',
    tagline: '软件之间约定的调用接口，规定请求格式、参数与返回内容。',
    aliases: Object.freeze([
      'api',
      'application programming interface',
      'applicationprogramminginterface',
      '应用程序接口',
      '接口',
    ]),
    systemTarget: 'none',
    understand: Object.freeze([
      'API 是软件之间约定好的调用接口：一方按约定发出请求，另一方按约定返回结果，双方不必了解对方内部怎么实现。它描述的是「怎么调用」，不负责决定什么时候调用。',
      '在 AI 应用里，API 常常是工具背后的实现手段：某个工具内部可能去请求一个 HTTP API。但两者并不等同，API 是接口概念，工具是给模型使用的能力封装；而且模型不会自己发起 API 调用，仍然是运行环境去执行。',
    ]),
    misconceptions: Object.freeze([
      {
        claim: 'API 就是一种工具，接上 API 模型就能自己调用外部服务。',
        correction: 'API 是软件之间的接口约定，工具是交给模型请求的能力封装。模型不会直接调用 API，必须由运行环境按工具的约定去执行，再把结果返回模型。',
      },
    ]),
    related: Object.freeze(['tools', 'mcp']),
    nextSteps:
      '后续学习提示：看完 API 再对照 Tools 与 MCP，把「接口约定」「能力入口」「连接协议」三层的差别固定下来；本节点目前是解释性节点，装配台尚未提供对应模块。',
  }),

  mcp: freezeConcept({
    id: 'mcp',
    idx: '06',
    name: 'MCP',
    cn: '模型上下文协议',
    chapter: '03',
    chapterCn: '外部能力',
    tagline: '把外部能力以统一方式接入模型应用的连接协议，工具不必依赖它。',
    aliases: Object.freeze([
      'mcp',
      'model context protocol',
      'modelcontextprotocol',
      '模型上下文协议',
      '模型连接协议',
      'mcp server',
      'mcpserver',
    ]),
    systemTarget: 'none',
    understand: Object.freeze([
      'MCP 是一套标准化连接协议，用来把外部能力以统一的方式接入模型应用：提供服务的一方按规范暴露能力，客户端按规范连接与调用，不必为每个服务单独写一套适配。',
      '它解决的是连接方式的统一，不是能力的来源。工具完全可以不经 MCP 由应用直接注册；MCP 服务端除了工具，也可以暴露资源与提示模板等别的内容。它不是模型，也不保证接上以后效果更好。',
    ]),
    misconceptions: Object.freeze([
      {
        claim: '用了 MCP 才能调用工具，没接 MCP 就没有工具能力。',
        correction: '工具可以在应用里直接注册使用，MCP 只是众多连接方式中的一种。它带来的是接入方式的统一，而不是工具能力本身；反过来说，接了 MCP 也不等于任务一定做得更好。',
      },
    ]),
    related: Object.freeze(['tools', 'api']),
    nextSteps:
      '后续学习提示：把 MCP 与 Tools、API 放在一起比较，记住「协议不等于能力」；本节点是解释性节点，装配台暂无对应模块，也不会触发任何真实连接。',
  }),

  skills: freezeConcept({
    id: 'skills',
    idx: '07',
    name: 'Skills',
    cn: '技能说明',
    chapter: '04',
    chapterCn: '信息与方法',
    tagline: '可按需加载的任务说明文档及其随附资源，本身不是工具。',
    aliases: Object.freeze([
      'skills',
      'skill',
      'skill.md',
      'skillmd',
      '技能',
      '技能说明',
      '技能包',
    ]),
    systemTarget: 'none',
    understand: Object.freeze([
      'Skills 是一份按需加载的任务说明：通常是一个说明文件（例如 SKILL.md），写明某类任务该怎么做、按什么步骤走、注意哪些约束，还可能随附模板、脚本或参考资料等资源。',
      '它的关键是按需读入上下文，而不是一次性塞进系统指令：相关任务出现时才加载，避免长期占用上下文。加载一份说明只提供做法，不会因此获得任何执行能力，具体动作仍要由具备相应权限的工具去完成。',
    ]),
    misconceptions: Object.freeze([
      {
        claim: '加载了 Skills 就等于获得了工具权限，可以读写文件和联网了。',
        correction: 'Skills 只是读入上下文的说明文本与资源，不授予工具、文件或网络权限，也不会自己执行任何动作。真正的操作要由运行环境调用已提供的工具来完成，权限也在那一侧控制。',
      },
    ]),
    related: Object.freeze(['agent', 'tools']),
    nextSteps:
      '后续学习提示：把 Skills 和 Tools 对照看，分清「告诉系统怎么做」与「真正去做」；本节点是解释性节点，装配台暂无对应模块。',
  }),

  rag: freezeConcept({
    id: 'rag',
    idx: '08',
    name: 'RAG',
    cn: '检索增强生成',
    chapter: '04',
    chapterCn: '信息与方法',
    tagline: '先检索出相关片段、放进上下文，再让模型据此生成回答的流程。',
    aliases: Object.freeze([
      'rag',
      'retrieval augmented generation',
      'retrievalaugmentedgeneration',
      '检索增强生成',
      '检索增强',
      '知识库问答',
    ]),
    systemTarget: 'none',
    understand: Object.freeze([
      'RAG 即检索增强生成：先把资料切分并建立索引，用当前问题检索出相关片段，再把这些片段放进上下文，让模型依据它们生成回答。它补的是模型参数里没有的资料，而不是改模型本身。',
      '它既不等于记忆，也不等于关键词搜索：记忆偏向跨轮次保留信息，检索则每次按查询去找证据；检索方式可以是关键词，也可以是向量等其它方式。检索质量直接决定结果，RAG 能减少无依据的编造，但不能完全消除幻觉。',
    ]),
    misconceptions: Object.freeze([
      {
        claim: 'RAG 就是关键词搜索，只要在资料库里搜到词就能答对。',
        correction: 'RAG 是一整条流程：检索出片段、放进上下文、再由模型生成回答。检索只是其中一步，检索方式也不限于关键词；检索不到或片段不相关时，回答依然可能出错。',
      },
    ]),
    related: Object.freeze(['agent', 'tools']),
    nextSteps:
      '后续学习提示：区分 Retrieval、RAG 与 Memory 三者的职责，再看 Agent 如何在需要时选择检索；本节点是解释性节点，相关实验后续开放。',
  }),

  workflow: freezeConcept({
    id: 'workflow',
    idx: '09',
    name: 'Workflow',
    cn: '工作流',
    chapter: '05',
    chapterCn: '执行系统',
    tagline: '由开发者预先定义步骤与顺序的执行路径，运行期不会自己改路线。',
    aliases: Object.freeze([
      'workflow',
      '工作流',
      '流程编排',
      '固定流程',
      '编排',
    ]),
    systemTarget: 'none',
    understand: Object.freeze([
      'Workflow 是由开发者预先编排好的执行路径：有哪些步骤、按什么顺序、每步失败后怎么处理，都在运行前写定。它可能在某个步骤里调用模型，但整体路线由代码决定，而不是由模型临场决定。',
      '它的优势是稳定、可预测、容易排查和审计，代价是遇到预设之外的情况不会自己重新规划。这与 Agent 的区别只是控制方式不同，不代表 Workflow 是较低级的做法，两者常常组合使用。',
    ]),
    misconceptions: Object.freeze([
      {
        claim: 'Agent 一定比 Workflow 强，所以能做成 Agent 就不该用固定流程。',
        correction: '两者是控制方式不同，不是优劣排序。步骤明确、要求稳定可复现的任务，固定流程更可控也更容易定位问题；只有在需要运行期根据信息调整下一步时，Agent 式的动态选择才更有价值。',
      },
    ]),
    related: Object.freeze(['agent', 'harness']),
    nextSteps:
      '后续学习提示：接着看 Agent 与 Harness，理解固定路径、动态选择与运行环境三者的配合；本节点是解释性节点，对照实验后续开放。',
  }),

  harness: freezeConcept({
    id: 'harness',
    idx: '10',
    name: 'Harness',
    cn: '运行环境层',
    chapter: '05',
    chapterCn: '执行系统',
    tagline: '包围模型的工具协调、上下文组装与运行控制环境。',
    aliases: Object.freeze([
      'harness',
      'agent harness',
      'agentharness',
      '运行环境层',
      '运行外壳',
      '运行环境',
    ]),
    systemTarget: 'none',
    understand: Object.freeze([
      'Harness 是围绕模型的那层运行环境：它组织每一轮送入模型的上下文，接收模型产出的文本或工具调用请求，分派工具去执行，再把结果写回上下文，并按规则决定继续还是结束。',
      '它是工程代码而不是语言能力，也不是第二个模型：判断仍然来自模型，Harness 负责让判断变成可执行、可约束、可追踪的过程。同一个模型配上不同的 Harness，稳定性和可控性会明显不同。',
    ]),
    misconceptions: Object.freeze([
      {
        claim: 'Harness 就是另一个更聪明的模型，负责在背后帮主模型思考。',
        correction: 'Harness 是循环、工具分派、上下文组装与控制逻辑组成的运行环境，不产生语言判断。它让模型的输出变成真实可执行的步骤，也可能因为权限或规则而拒绝某次调用。',
      },
    ]),
    related: Object.freeze(['agent', 'workflow']),
    nextSteps:
      '后续学习提示：回到 Agent 节点，把「模型判断」与「运行环境执行」两层合起来看；本节点是解释性节点，装配台暂无对应模块。',
  }),
});

/** Atlas 首期节点的固定顺序（01..10），布局与详情导航都依赖它保持稳定 */
export const CONCEPT_ORDER = Object.freeze([
  'llm',
  'agent',
  'tool_calling',
  'tools',
  'api',
  'mcp',
  'skills',
  'rag',
  'workflow',
  'harness',
]);

/** 取概念节点；未知标识返回 null，调用方必须显式处理，不抛异常 */
export function getConcept(conceptId) {
  return Object.prototype.hasOwnProperty.call(CONCEPTS, conceptId) ? CONCEPTS[conceptId] : null;
}
