/**
 * src/knowledge/concepts/ch03-connection.js
 * 第 03 章 · 外部能力（CONNECTION）
 *
 * M1.2 交付：六个概念全部完成分层正文。
 * 状态说明：
 *   tool_calling —— published（M0.3 四步学习路径 + 内嵌实验，M1.2 扩展 MCP 对照模式）
 *   mcp —— published（实验路径同上：同一份工具能力上切换「直连 / MCP」演示）
 *   api / tools / function_calling / mcp_server —— reviewed（正文完整，实验经 tool_calling 进入）
 *
 * 重点边界（M1.2_TASK §2）：
 *   · Tool Calling 是模型/应用选择或描述工具调用的机制；执行与授权由运行环境负责；
 *   · Function Calling 是这类机制的一种 API 表达，不虚构普适唯一标准；
 *   · MCP 是连接协议，不等于 Agent / 工具 / 联网能力；Server 可暴露 Tools、Resources、Prompts；
 *   · 接上协议不会自动提高研究结论的准确度。
 * ------------------------------------------------------------------
 */
import { defineConcept } from './helpers.js';
import { NODE_LAYOUT } from '../layout.js';

const CHAPTER_ID = 'connection';
const REVIEWED_AT = '2026-10-22';
const REVIEW_NOTE =
  'M1.2 复核：M0.3 已审校正文保留，INSPECT 依据官方接口文档与 MCP 规范补写「参数校验」「三类能力」「角色划分」等事实，外部来源于 2026-10-22 抓取核验。';

export const CHAPTER_03_CONCEPTS = Object.freeze([
  defineConcept({
    id: 'api',
    chapterId: CHAPTER_ID,
    order: 1,
    name: 'API',
    cn: '应用程序接口',
    tagline: '软件之间约定的调用接口，规定请求格式、参数与返回内容。',
    aliases: ['api', 'application programming interface', 'applicationprogramminginterface', '应用程序接口', '接口'],
    contentStatus: 'reviewed',
    oneLiner: 'API 是软件与软件之间的调用约定，描述「怎么调」，不决定「什么时候调」。',
    understand: [
      'API 是软件之间约定好的调用接口：一方按约定发出请求，另一方按约定返回结果，双方不必了解对方内部怎么实现。它描述的是「怎么调用」，不负责决定什么时候调用。',
      '在 AI 应用里，API 常常是工具背后的实现手段：某个工具内部可能去请求一个 HTTP API。但两者并不等同，API 是接口概念，工具是给模型使用的能力封装；而且模型不会自己发起 API 调用，仍然是运行环境去执行。',
      '绝大多数互联网 API 建立在 HTTP 之上：客户端发请求、服务器返响应，用状态码表达成功与失败（来源：src-rfc9110）。模型接口本身也是这样一个 API。',
    ],
    inspect: [
      '层次 · 约定层（API）→ 能力封装层（工具）→ 请求发起层（模型输出）三层不同；混为一谈就会出现「模型直接调用 API」这类错误说法。',
      '执行者 · 即使工具内部封装了 API，发起请求的仍然是运行环境的代码，而不是模型本身。',
      '真实接口的三要素 · 中文官方文档展示调用模型接口需要：请求地址、鉴权头、JSON 请求体（来源：src-bigmodel-http）。',
      '边界 · 本原型不注册任何真实 API：装配台里的两个工具都是浏览器内的本地模拟函数。',
    ],
    misconceptions: [
      {
        claim: 'API 就是一种工具，接上 API 模型就能自己调用外部服务。',
        correction:
          'API 是软件之间的接口约定，工具是交给模型请求的能力封装。模型不会直接调用 API，必须由运行环境按工具的约定去执行，再把结果返回模型。',
      },
    ],
    example: {
      label: '本章研究情境 · 虚构校园活动整合研究',
      body: '假设公告系统对外提供 HTTP 接口，那也只是一个 API；研究系统要读公告，仍然需要通过「工具 + 运行环境」这一层，不能指望模型自己去请求。',
    },
    sources: ['src-rfc9110', 'src-bigmodel-http', 'doc-prd'],
    related: ['tools', 'mcp'],
    nextSteps:
      '接着看 Tools 与 MCP，把「接口约定」「能力入口」「连接协议」三层的差别固定下来；本节点是解释性节点，装配台尚未提供对应模块。',
    systemTarget: 'none',
    graph: NODE_LAYOUT.api,
    reviewedAt: REVIEWED_AT,
    reviewNote: REVIEW_NOTE,
  }),

  defineConcept({
    id: 'tools',
    chapterId: CHAPTER_ID,
    order: 2,
    name: 'Tools',
    cn: '工具',
    tagline: '提供特定外部能力的可调用接口，用来补上模型本身没有的能力。',
    aliases: ['tools', 'tool', '工具', '外部工具', '可调用接口', '工具模块'],
    contentStatus: 'reviewed',
    oneLiner: '工具是提供给模型使用的一项具体外部能力，由运行环境实现与执行。',
    understand: [
      '工具是提供给模型使用的一项具体外部能力，通常带上名字、说明和参数格式，让模型知道它能做什么、该怎么请求。它由外部环境实现和执行，模型只能请求调用，不能直接操作。',
      '工具与协议是两件事：工具是具体的能力入口，MCP 之类的协议是连接方式。工具可以写在应用里直接注册，也可以经某种协议接进来；能力是否可用，取决于运行环境是否提供并放行，而不取决于用了哪种协议。',
    ],
    inspect: [
      '组成 · 名称、说明、参数 Schema 三部分决定模型「能不能正确请求」，缺参数说明就会产生大量非法调用。',
      '执行位置 · 工具函数运行在应用侧；模型只看到调用结果文本，看不到函数内部实现。',
      '参数必须校验 · 官方文档明确提示：模型生成的参数「可能臆造出函数模式中未定义的参数」，调用前必须在代码里验证（来源：src-deepseek-chat-api）。',
      '模型不执行工具 · 文档同时说明「函数功能需由用户提供，模型本身不执行具体函数」（来源：src-deepseek-tool-calls）。',
      '本原型的真实边界 · 装配台里只有 Announcement Search 与 Document Reader 两个本地模拟工具，运行期零网络请求。',
    ],
    misconceptions: [
      {
        claim: '工具必须通过 MCP 这类协议才能给模型用。',
        correction:
          '工具由运行环境注册即可使用，协议只是其中一种标准化的接入方式。把工具和协议当成同一件事，会误以为没接协议就没有工具能力。',
      },
    ],
    example: {
      label: '本章研究情境 · 虚构校园活动整合研究',
      body: 'Search 负责「发现公告」，Reader 负责「读正文」。两者是两个独立工具，只装配 Search 时研究只能拿到摘要，拿不到正文。',
    },
    sources: ['src-deepseek-tool-calls', 'src-deepseek-chat-api', 'doc-m0-3-task', 'doc-prd'],
    related: ['tool_calling', 'api', 'mcp', 'mcp_server', 'sandbox'],
    nextSteps:
      '接着看 Tool Calling 与 Function Calling，理解「请求 / 执行 / 返回」三段职责；实验空间里可以在装配台观察工具从缺失到可用的过程。',
    systemTarget: 'tools',
    graph: NODE_LAYOUT.tools,
    reviewedAt: REVIEWED_AT,
    reviewNote: REVIEW_NOTE,
  }),

  defineConcept({
    id: 'tool_calling',
    chapterId: CHAPTER_ID,
    order: 3,
    name: 'Tool Calling',
    cn: '工具调用',
    tagline: '模型提出结构化调用请求，外部执行环境执行工具并把结果返回模型。',
    // '函数调用' 归 function_calling 节点所有：它是那个概念的正式名称，
    // Tool Calling 页面会在正文里解释两者的关系，不再占用同一条别名。
    aliases: ['tool calling', 'toolcalling', 'tool call', 'toolcall', '工具调用', '工具使用'],
    contentStatus: 'published',
    oneLiner:
      'Tool Calling 让模型可以请求调用外部工具，实际执行通常由外部应用或运行环境完成，再把结果交回模型处理。',
    understand: [
      'Tool Calling 是一套三方分工的机制：模型根据上下文判断需要外部能力，产出一段结构化的调用请求，写明要调用的工具名和参数；这份请求本身不是执行结果，只是「我想调用什么」。',
      '真正执行的是外部运行环境。应用拿到请求后检查工具是否已提供、参数是否合法、当前是否有权限，然后去调用对应的本地函数或接口，再把返回值作为新消息放回模型上下文，让模型基于真实结果继续作答。',
      '边界要分清：模型不执行工具，也不等于模型自带联网能力；能输出合法的工具 JSON，只能说明请求格式正确，不能说明工具已经执行成功。工具可以预先在应用里注册，不一定通过 MCP 提供，API 与 MCP 也都只是实现方式。',
    ],
    inspect: [
      '请求阶段 · 模型输出「工具名 + 参数」，这一步不产生任何外部副作用；参数由模型生成，可能不合法。',
      '执行阶段 · 运行环境依次检查：工具是否已提供 → 是否启用 → 参数是否合法 → 权限是否满足；任一不满足即阻断，不会假装成功。',
      '返回阶段 · 执行结果写回上下文成为新消息，模型据此继续作答；事件记录里会保留 toolId、分支依据与引用来源。',
      '官方文档的印证 · 执行流程被明确写成「模型产出调用请求 → 用户执行函数 → 结果传给模型」，并注明模型本身不执行具体函数（来源：src-deepseek-tool-calls）。',
      '与协议的关系 · 同一份工具能力可以直连（应用自己注册并执行），也可以经 MCP 由服务端暴露；协议改变的是接入路径，不改变「谁执行、谁授权」。',
      '本原型验证方式 · 知识页 EXPERIMENT 使用与装配台完全相同的工具定义，在本地固定语料上运行，可切换「工具缺失 / 未授权 / 超时」并对照「直连 / MCP」两条路径。',
    ],
    misconceptions: [
      {
        claim: '模型能输出工具 JSON，就说明工具已经执行成功了。',
        correction:
          '模型只负责生成请求，执行发生在外部环境。工具未提供、参数不合法、权限不足或执行出错时，都不会有成功结果；模型只能在收到返回内容后，才知道这次调用到底成没成功。',
      },
      {
        claim: '会 Tool Calling 就等于模型自己长了手，可以自己上网、自己读写文件。',
        correction:
          '调用请求必须由外部运行环境执行，文件与网络权限也在那一侧控制。模型拿到的只是执行后返回的文本，它既没有直接的操作权，也没有绕过权限的能力。',
      },
    ],
    example: {
      label: '简化请求格式 · 不是逐字协议规范',
      body: '{ "tool": "announcement_search", "arguments": { "scope": "campus_events", "maxResults": 3 } }',
    },
    experimentId: 'exp-tool-calling-demo',
    sources: ['src-deepseek-tool-calls', 'src-deepseek-chat-api', 'doc-m0-3-task', 'doc-prd'],
    related: ['llm', 'tools', 'function_calling', 'mcp'],
    nextSteps:
      '这是本阶段提供完整分层知识页的实验节点：可以在 UNDERSTAND 与 INSPECT 之间切换，也可以在 EXPERIMENT 里切换「直连 / MCP」两条路径，观察协议不改变事实。',
    systemTarget: 'tools',
    graph: NODE_LAYOUT.tool_calling,
    reviewedAt: REVIEWED_AT,
    reviewNote:
      '四步学习路径与内嵌实验在 M0.3 交付；M1.2 扩展 MCP 对照模式，并核对官方文档中的执行分工与参数校验条款。',
  }),

  defineConcept({
    id: 'function_calling',
    chapterId: CHAPTER_ID,
    order: 4,
    name: 'Function Calling',
    cn: '函数调用',
    tagline: '按函数签名与参数 Schema 发起调用的一种具体形式。',
    aliases: ['function calling', 'functioncalling', 'function call', '函数调用', '函数调用形式'],
    contentStatus: 'reviewed',
    oneLiner:
      'Function Calling 是工具调用的一种具体实现形式：按预先声明的函数签名与参数 Schema 输出调用，常被当作 Tool Calling 的同义说法。',
    understand: [
      '做法是：应用先把可用的函数连同名称、说明与 JSON Schema 参数一起交给模型；模型判断需要时，输出一个包含函数名与参数的调用请求；应用解析、校验、执行，再把结果作为一条新消息回传。',
      '它和 Tool Calling 描述的是同一类协作机制的不同侧面：Tool Calling 强调「模型请求调用外部能力」这件事，Function Calling 强调「按函数签名与参数 Schema」这种表达形式。不同厂商的字段名与结构并不统一。',
      '执行权仍在应用侧：模型输出的参数可能不合法，官方文档明确要求在调用函数前于代码中校验（来源：src-deepseek-chat-api）。',
    ],
    inspect: [
      '输入 · tools 数组中的每一项包含类型、函数名、说明与 parameters（JSON Schema）；部分实现还支持 strict 模式。',
      '输出 · 回应消息里的 tool_calls 带函数名、arguments（JSON 字符串）与一个 id，用于把执行结果对回去。',
      '校验 · 参数由模型生成，「可能臆造出未定义的参数」，因此必须先校验再执行；校验失败应当拒绝而不是猜测。',
      '易混 · 不是所有模型都支持；不同模型的 JSON 结构不同，不能把某家的字段名当成通用标准。',
    ],
    misconceptions: [
      {
        claim: 'Function Calling 就是模型直接执行函数。',
        correction:
          '模型只输出一个「想调用哪个函数、参数是什么」的请求；真正的函数执行、权限检查与异常处理都在应用侧完成。',
      },
    ],
    example: {
      label: '简化示意 · 非逐字协议规范',
      body: '{ "name": "announcement_search", "arguments": "{\\"scope\\": \\"campus_events\\", \\"maxResults\\": 3}" }',
    },
    sources: ['src-deepseek-chat-api', 'src-deepseek-tool-calls'],
    related: ['tool_calling'],
    nextSteps: '接着看 MCP：当同一个函数要接给多个应用时，「怎么接」才会变成协议问题。',
    reviewedAt: REVIEWED_AT,
    reviewNote: REVIEW_NOTE,
  }),

  defineConcept({
    id: 'mcp',
    chapterId: CHAPTER_ID,
    order: 5,
    name: 'MCP',
    cn: '模型上下文协议',
    tagline: '把外部能力以统一方式接入模型应用的连接协议，工具不必依赖它。',
    // 注意：'mcp server' 归 mcp_server 节点所有，避免同一条查询命中两个节点
    aliases: ['mcp', 'model context protocol', 'modelcontextprotocol', '模型上下文协议', '模型连接协议'],
    contentStatus: 'published',
    oneLiner: 'MCP 是标准化连接协议：统一「外部能力怎么接进来」，不提供能力本身。',
    understand: [
      'MCP 是一套标准化连接协议，用来把外部能力以统一的方式接入模型应用：提供服务的一方按规范暴露能力，客户端按规范连接与调用，不必为每个服务单独写一套适配。',
      '它解决的是连接方式的统一，不是能力的来源。工具完全可以不经 MCP 由应用直接注册；MCP 服务端除了工具，也可以暴露资源与提示模板。它不是模型，也不保证接上以后效果更好。',
      '协议在架构上是 client-server 的：Host（AI 应用）为每个 Server 创建一个 Client 来建立连接（来源：src-mcp-architecture）。',
    ],
    inspect: [
      '三角色 · Host（AI 应用，如桌面客户端）→ 为每个 Server 创建一个 Client → Client 与 Server 建立连接并转发请求。这是官方架构文档的划分（来源：src-mcp-architecture）。',
      '三类能力 · 规范写明 Server 可向 Client 提供 Tools（可由模型请求、由运行环境执行的函数）、Resources（上下文与数据）、Prompts（模版化消息与工作流）（来源：src-mcp-spec，2025-06-18 版）。',
      '与工具的关系 · 工具 = 能力入口，MCP = 连接方式；同一份工具能力可以经 MCP 暴露，也可以由应用直接注册。',
      '边界 · 本原型**不建立任何真实 MCP 连接**：知识页只做概念解释与本地路径仿真，不发起网络握手，也不声称实现了 SDK。',
      '常见误区 · 接上 MCP 不代表能力变强或结果更准确；它改变的是接入成本与一致性。',
    ],
    misconceptions: [
      {
        claim: '用了 MCP 才能调用工具，没接 MCP 就没有工具能力。',
        correction:
          '工具可以在应用里直接注册使用，MCP 只是众多连接方式中的一种。它带来的是接入方式的统一，而不是工具能力本身；反过来说，接了 MCP 也不等于任务一定做得更好。',
      },
    ],
    example: {
      label: '本章研究情境 · 虚构校园活动整合研究',
      body: '把 Announcement Search 换成经 MCP 暴露的同一能力，研究拿到的公告内容不会因为「走了协议」而变得更准确；能核对的事实仍然取决于数据本身。',
    },
    sources: ['src-mcp-architecture', 'src-mcp-spec', 'src-anthropic-mcp-announce'],
    related: ['tools', 'api', 'mcp_server', 'tool_calling'],
    nextSteps:
      '在 Tool Calling 知识页的 EXPERIMENT 里可以切换「直连示意 / MCP 适配示意」：同一份能力、同一份数据，两条路径得到相同的资料内容。',
    systemTarget: 'none',
    graph: NODE_LAYOUT.mcp,
    reviewedAt: REVIEWED_AT,
    reviewNote: REVIEW_NOTE,
  }),

  defineConcept({
    id: 'mcp_server',
    chapterId: CHAPTER_ID,
    order: 6,
    name: 'MCP Server',
    cn: '协议服务端',
    tagline: '按 MCP 规范对外提供工具、资源与提示模板的一方。',
    aliases: ['mcp server', 'mcpserver', 'mcp 服务端', '协议服务端', '服务端'],
    contentStatus: 'reviewed',
    oneLiner: 'MCP Server 是按协议对外提供能力的一方：可以暴露工具、资源与提示模板；提供能力不等于它就是模型。',
    understand: [
      '在 MCP 的 client-server 架构里，服务端是被连接的一方：它声明自己有哪些能力，接收客户端转来的请求并返回结果。',
      '它能暴露的不只是工具：规范列了三类能力——Tools（可由模型请求、由运行环境执行的函数）、Resources（上下文与数据）、Prompts（模版化消息与工作流）（来源：src-mcp-spec）。',
      '服务端存在不等于能力可用：连接成功只说明协议对上了；具体能力是否被发现、是否被授予权限、结果是否可信，还要看客户端策略与数据本身。',
    ],
    inspect: [
      '角色 · Host（AI 应用）为每个 Server 创建一个 Client 连接（来源：src-mcp-architecture）；Server 的协议角色不等于推理模型。2025-06-18 规范还允许服务端经客户端请求 Sampling，后续版本有所变化；本实验仅演示工具、资源与提示模板。',
      '能力类型 · Tools 会产生动作，Resources 是读取，Prompts 是模版：三者用途不同，不能互相替代。',
      '与平台内置工具的区别 · 内置工具由应用直接注册；MCP Server 提供的能力需要经过协议发现与授权。',
      '易混 · 「MCP Server 上线了」不代表「模型会自动用它」：还需要客户端连接、能力筛选与权限配置。',
    ],
    misconceptions: [
      {
        claim: 'MCP Server 就是一个工具。',
        correction:
          '服务端是连接的提供方，它可以同时暴露工具、资源与提示模板三类能力。把服务端等同单个工具，会忽略资源与提示模板，也会误判权限范围。',
      },
    ],
    example: {
      label: '本章研究情境 · 虚构校园活动整合研究',
      body: '假设公告库由一个 MCP Server 暴露：它可能同时提供「检索工具」「公告原文资源」「研究任务模板」三种能力，客户端需要分别发现并按需放行。',
    },
    sources: ['src-mcp-spec', 'src-mcp-architecture'],
    related: ['mcp', 'tools'],
    nextSteps: '回到 MCP 节点看协议整体，或进 Tool Calling 的 EXPERIMENT 观察 Server 在路径中的位置。',
    reviewedAt: REVIEWED_AT,
    reviewNote: REVIEW_NOTE,
  }),
]);
