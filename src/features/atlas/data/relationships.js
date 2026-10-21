/**
 * src/features/atlas/data/relationships.js
 * ------------------------------------------------------------------
 * M0.3 知识图的语义关系（人工逐条配置，不用任何随机或自动布局算法臆造）。
 *
 * 规则（M0.3_TASK §4.2）：
 *   · 关系类型只使用 USES / PART_OF / RELATED / CONTRASTS；
 *   · 本轮**不编造 PART_OF 实例**：宁可没有，也不为填满连线样式而虚构层级；
 *   · 每条边必须有 id / sourceId / targetId / type / description；
 *   · 只有明确有向的语义才标记 directed=true（USES），
 *     RELATED / CONTRASTS 不默认为严格单向因果，因此不画方向箭头。
 * ------------------------------------------------------------------
 */

/** 关系类型定义：中文解释与线型都集中在这里，图例与 Inspector 共用 */
export const RELATION_TYPES = Object.freeze({
  USES: Object.freeze({
    id: 'USES',
    cn: '使用',
    directed: true,
    dash: '',
    desc: '左侧概念在实现任务时会用到右侧概念所代表的能力，方向明确。',
  }),
  PART_OF: Object.freeze({
    id: 'PART_OF',
    cn: '组成部分',
    directed: true,
    dash: '7 4',
    desc: '右侧是左侧的组成部分。本轮没有经过审校的实例，因此图中不会出现该类型的连线。',
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

/**
 * 首期 10 条边。description 必须写清「是什么关系、以及容易误解的地方」，
 * 悬停或选中时直接展示，不让线条只用于制造复杂效果。
 */
export const RELATIONSHIPS = Object.freeze([
  Object.freeze({
    id: 'rel-agent-llm',
    sourceId: 'agent',
    targetId: 'llm',
    type: 'USES',
    directed: true,
    description: 'Agent 系统通常可以使用模型完成判断、归纳与生成任务相关内容；模型是可被使用的部件，不是 Agent 本身。',
  }),
  Object.freeze({
    id: 'rel-agent-tools',
    sourceId: 'agent',
    targetId: 'tools',
    type: 'USES',
    directed: true,
    description: 'Agent 可以调用外部工具来完成任务；工具由运行环境提供并执行，模型只提出调用请求。',
  }),
  Object.freeze({
    id: 'rel-llm-toolcalling',
    sourceId: 'llm',
    targetId: 'tool_calling',
    type: 'RELATED',
    directed: false,
    description: '支持工具调用的模型可以生成结构化的工具请求；真正执行发生在模型外部的运行环境，因此两者相关但不等同。',
  }),
  Object.freeze({
    id: 'rel-toolcalling-tools',
    sourceId: 'tool_calling',
    targetId: 'tools',
    type: 'USES',
    directed: true,
    description: '工具调用机制请求执行已经提供好的工具；没有可用的工具，调用请求只会被拒绝或阻断。',
  }),
  Object.freeze({
    id: 'rel-tools-api',
    sourceId: 'tools',
    targetId: 'api',
    type: 'RELATED',
    directed: false,
    description: '部分工具内部会封装一个 API，但两者不是同义词：API 是软件之间的接口约定，工具是交给模型请求的能力入口。',
  }),
  Object.freeze({
    id: 'rel-mcp-tools',
    sourceId: 'mcp',
    targetId: 'tools',
    type: 'RELATED',
    directed: false,
    description: 'MCP Server 可以对外暴露工具，也可以暴露资源、提示模板等其它能力；反过来，工具完全可以不经 MCP 由应用直接注册。',
  }),
  Object.freeze({
    id: 'rel-agent-skills',
    sourceId: 'agent',
    targetId: 'skills',
    type: 'RELATED',
    directed: false,
    description: 'Agent 可以按需加载任务技能说明来获得做法，但加载 Skills 不等于授予工具权限，也不代表某个动作已经执行。',
  }),
  Object.freeze({
    id: 'rel-agent-rag',
    sourceId: 'agent',
    targetId: 'rag',
    type: 'RELATED',
    directed: false,
    description: '检索增强是 Agent 可选的一种机制，并非所有 Agent 都使用；不用 RAG 的系统同样可以完成任务，只是资料获取方式不同。',
  }),
  Object.freeze({
    id: 'rel-workflow-agent',
    sourceId: 'workflow',
    targetId: 'agent',
    type: 'CONTRASTS',
    directed: false,
    description: '对照说明预设流程与运行期动态选择的区别：Workflow 的步骤由开发者写死，Agent 的下一步在运行期决定；两者不构成优劣排序。',
  }),
  Object.freeze({
    id: 'rel-harness-agent',
    sourceId: 'harness',
    targetId: 'agent',
    type: 'RELATED',
    directed: false,
    description: 'Harness 负责支持与组织 Agent 的执行环境（上下文组装、工具分派、循环控制），它不是另一个模型。',
  }),
]);

export function getRelationship(id) {
  return RELATIONSHIPS.find((r) => r.id === id) || null;
}

/** 节点坐标：**固定、可重现**，刷新不会重新随机排布，避免学习导航失去记忆 */
export const NODE_LAYOUT = Object.freeze({
  llm: Object.freeze({ x: 240, y: 88 }),
  rag: Object.freeze({ x: 132, y: 214 }),
  agent: Object.freeze({ x: 410, y: 262 }),
  skills: Object.freeze({ x: 206, y: 414 }),
  workflow: Object.freeze({ x: 322, y: 472 }),
  harness: Object.freeze({ x: 500, y: 480 }),
  tool_calling: Object.freeze({ x: 612, y: 126 }),
  tools: Object.freeze({ x: 712, y: 262 }),
  api: Object.freeze({ x: 614, y: 412 }),
  mcp: Object.freeze({ x: 748, y: 470 }),
});

/** 图的画布坐标空间（SVG viewBox），缩放与平移都在这个空间上做变换 */
export const GRAPH_VIEW = Object.freeze({ width: 820, height: 560 });
