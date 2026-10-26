/**
 * src/content/chapters/03-connection.js
 * ------------------------------------------------------------------
 * Chapter 03 的 Story 叙事数据（M1.2 D02 / §3）。
 *
 * 叙事任务：用既有的 Search / Reader 演示「外部资料怎么被取回来」，
 * 再把「直连工具链路」与「MCP Host/Client/Server 路径」并排对比；
 * 结束时把话说完整：
 * 「工具可以带来可检查的资料，但返回数据不自动保证正确。」
 * → 衔接 Chapter 04（检索 / 知识）与 Chapter 06（可靠性）。
 * ------------------------------------------------------------------
 */

export const CHAPTER_03_STORY = Object.freeze({
  chapterId: 'connection',
  no: '03',
  title: Object.freeze({ zh: '外部能力', en: 'CONNECTION' }),
  subtitle: 'CONNECT TO THE WORLD · 把资料真的拿进来',
  opening: Object.freeze({
    goal: '搞清「模型请求 / 运行环境执行 / 结果回写」三段分工，以及直连与 MCP 两种接入路径的差别。',
    task: '研究任务（沿用前两章）：整合分散的校园活动公告是否可行？这次允许使用 Search 与 Reader。',
    prompt: '所有工具都在浏览器内运行，语料是随页面打包的虚构公告；没有任何网络请求。',
    expectation: '读完你应该能回答：为什么「拿到资料」和「结论正确」仍然是两件事？',
  }),
  beats: Object.freeze([
    Object.freeze({
      id: 'request',
      idx: '01',
      kind: 'opening',
      title: '模型开口要，运行环境真的去拿',
      text: 'Tool Calling 把动作拆成三段：模型提出结构化请求（工具名 + 参数）；运行环境检查工具是否已提供、参数是否合法、权限是否满足，然后执行；结果作为新消息写回上下文。',
      sample: Object.freeze({
        label: '简化请求格式 · 不是逐字协议规范',
        body: '{ "tool": "announcement_search", "arguments": { "scope": "campus_events", "maxResults": 3 } }',
      }),
      takeaway: '能输出这段 JSON 只说明格式正确，不说明工具已存在、已授权或已执行成功。',
    }),
    Object.freeze({
      id: 'two-tools',
      idx: '02',
      kind: 'insight',
      title: 'Search 找到，Reader 才能读到',
      text: '检索与读取是两个独立工具：只有 Search 时，拿到的只是候选摘要；只有 Reader 而没有 Search 时，连读哪一条都不知道。两者都就绪，才走完「发现 → 读取」。',
      observation: '注意：工具缺失、被禁用或未授权时，事件记录里只有阻断原因，没有成功响应。',
      takeaway: '工具的「存在」与「可用」是两件事，权限与参数检查都在运行环境这一侧。',
    }),
    Object.freeze({
      id: 'path',
      idx: '03',
      kind: 'insight',
      title: '直连还是经 MCP：路径不同，事实不变',
      text: '同一份工具能力可以直连（应用自己注册并执行），也可以经 MCP 由 Host → Client → Server 转发。协议统一的是接入方式：它会带来更多环节，但不会改变返回的数据、也不会让成功率变高。',
      takeaway: '把「接入成本」和「结果质量」分开看，是这一章最重要的一条。',
    }),
    Object.freeze({
      id: 'hands-on',
      idx: '04',
      kind: 'experiment',
      title: '进入 Lab 03：在同一份轨迹上切换两条路径',
      text: 'Lab 03 复用既有 Tool Calling 实验：改条件与参数观察事件分支，再切换「直连示意 / MCP 适配示意」，看角色如何叠加在同一份事件上，以及对照表如何证明两边数据一致。',
      takeaway: '事件轨迹只生成一次；MCP 路径只是把角色标签叠上去，不会伪造第二套执行记录。',
    }),
  ]),
  limitation: Object.freeze({
    title: '本章的局限',
    text: '工具可以带来可检查的资料，但返回数据不自动保证正确。',
    detail:
      '工具解决的是「能不能拿到」，不是「拿到的对不对」。资料可能过期、可能互相冲突、也可能根本不是研究需要的那一条。要判断正确性，需要检索策略、来源时间戳、冲突检测与人工核验——那是第 04 章（检索与知识）与第 06 章（可靠性）的内容。',
  }),
  lab: Object.freeze({
    experimentId: 'exp-tool-calling-demo',
    entryConceptId: 'tool_calling',
    title: 'Lab 03 · Tool Calling 与 MCP 路径对照',
    prompt: '先保持「两种工具都就绪」，看完整成功轨迹，再逐项把条件改成失败情形。',
    steps: Object.freeze([
      '运行条件选「两种工具都就绪」：单步推进，读请求参数与响应数据。',
      '切到「Search 未装配」：确认没有任何成功响应，只有阻断原因。',
      '切到「Reader 未授权」：检索成功但读取被拒绝，结论范围随之缩小。',
      '把结果数量上限改成 1：观察 total / returned / truncated 的变化。',
      '切换「直连示意 / MCP 适配示意」：对照表里逐项确认数据一致。',
    ]),
    observe: Object.freeze([
      '失败情形下绝不会显示「调用成功」，也不会凭空补出资料内容。',
      'MCP 路径多出的是角色包装步骤，工具事件与返回数据与直连完全一致。',
      '知识页里没有任何真实网络请求：语料与工具都在本地。',
    ]),
  }),
  reading: Object.freeze({
    title: '结果解读',
    items: Object.freeze([
      Object.freeze({ q: '为什么两条路径结论一样？', a: '因为决定事实的是数据与规则，不是传输路径。协议只改变谁转发请求；同一份 run 的事件与载荷逐字段相同，对照表就是在验证这一点。' }),
      Object.freeze({ q: '工具成功了，为什么还不能当作研究结论？', a: '成功只代表「拿到了返回内容」。内容是否过期、是否与别的公告冲突、是否回答了研究问题，仍要单独核验。' }),
      Object.freeze({ q: '下一章讲什么？', a: '第 04 章讲检索与知识：怎么从大量资料里找到证据、怎么切片、怎么处理冲突；第 06 章讲可靠性：权限、护栏、追踪与评估。' }),
    ]),
  }),
  transition: Object.freeze({
    toChapterId: 'knowledge',
    text: '到这里，「模型 → 上下文 → 工具」这条线已经接通。接下来要问的是：工具把资料拿回来之后，系统怎样找到相关内容、切分文档、组织上下文——第 04 章接着讲。',
  }),
  concepts: Object.freeze(['api', 'tools', 'tool_calling', 'function_calling', 'mcp', 'mcp_server']),
});
