/**
 * src/knowledge/concepts/ch04-knowledge.js
 * 第 04 章 · 信息与方法（KNOWLEDGE）
 *
 * 交付状态（M1.1）：
 *   rag / skills —— 已审校（正文沿用 M0.3，INSPECT 本轮补写）
 *   retrieval / embedding / memory / chunking —— 仅索引（正文与 Knowledge Vault 属于 M1.3）
 * ------------------------------------------------------------------
 */
import { defineConcept } from './helpers.js';
import { NODE_LAYOUT } from '../layout.js';

const CHAPTER_ID = 'knowledge';
const REVIEW_NOTE =
  'UNDERSTAND 与常见误解沿用 M0.3 已审校文本；INSPECT 深层要点在 M1.1 依据 PRD 技术边界补写，未新增外部引用。';

export const CHAPTER_04_CONCEPTS = Object.freeze([
  defineConcept({
    id: 'retrieval',
    chapterId: CHAPTER_ID,
    order: 1,
    name: 'Retrieval',
    cn: '检索',
    tagline: '按查询从资料库里找出相关片段。',
    aliases: ['retrieval', 'retrieve', '检索', '召回', '资料检索'],
    contentStatus: 'outline',
    oneLiner: '检索是按查询去找相关片段的动作：它可以是关键词匹配，也可以是向量相似度。',
    plannedMilestone: 'M1.3',
    sources: ['src-index-draft'],
    related: ['rag', 'chunking', 'context_engineering'],
    nextSteps: '正文将在 M1.3 开放，并配合 Knowledge Vault 对比不同检索方式。',
  }),

  defineConcept({
    id: 'rag',
    chapterId: CHAPTER_ID,
    order: 2,
    name: 'RAG',
    cn: '检索增强生成',
    tagline: '先检索出相关片段、放进上下文，再让模型据此生成回答的流程。',
    aliases: [
      'rag',
      'retrieval augmented generation',
      'retrievalaugmentedgeneration',
      '检索增强生成',
      '检索增强',
      '知识库问答',
    ],
    contentStatus: 'reviewed',
    oneLiner: 'RAG 是一条流程：先把资料切分建索引，用问题检索片段，再把片段放进上下文让模型据此作答。',
    understand: [
      'RAG 即检索增强生成：先把资料切分并建立索引，用当前问题检索出相关片段，再把这些片段放进上下文，让模型依据它们生成回答。它补的是模型参数里没有的资料，而不是改模型本身。',
      '它既不等于记忆，也不等于关键词搜索：记忆偏向跨轮次保留信息，检索则每次按查询去找证据；检索方式可以是关键词，也可以是向量等其它方式。检索质量直接决定结果，RAG 能减少无依据的编造，但不能完全消除幻觉。',
    ],
    inspect: [
      '四个环节 · 切分（chunking）→ 建索引 → 按问题检索 → 片段入上下文生成；任何一环出问题都会让回答变差。',
      '向量角色 · 向量检索式 RAG 用 embedding 计算语义相似度；关键词式 RAG 不用 embedding，因此「RAG 必须有向量库」是错误说法。',
      '能力边界 · RAG 降低「无依据编造」的概率，但不校验资料本身是否互相矛盾；资料冲突仍要靠核验流程（M0.4 报告链演示的就是这一层）。',
      '与记忆的区别 · 检索每次按当前查询取证；记忆是跨轮次保留的信息沉淀，两者常组合使用，但职责不同。',
    ],
    misconceptions: [
      {
        claim: 'RAG 就是关键词搜索，只要在资料库里搜到词就能答对。',
        correction:
          'RAG 是一整条流程：检索出片段、放进上下文、再由模型生成回答。检索只是其中一步，检索方式也不限于关键词；检索不到或片段不相关时，回答依然可能出错。',
      },
    ],
    example: {
      label: '流程示意 · 本地虚构语料',
      body: '问题「NTC-1001 什么时候截止报名」→ 切分后的公告片段被检索出来 → 片段连同问题进入上下文 → 模型依据片段中的日期作答。',
    },
    sources: ['doc-m0-3-task', 'doc-prd'],
    related: ['agent', 'retrieval', 'embedding', 'memory', 'chunking'],
    nextSteps:
      '后续学习提示：区分 Retrieval、RAG 与 Memory 三者的职责，再看 Agent 如何在需要时选择检索；本节点是解释性节点，相关实验后续开放。',
    systemTarget: 'none',
    graph: NODE_LAYOUT.rag,
    reviewNote: REVIEW_NOTE,
  }),

  defineConcept({
    id: 'embedding',
    chapterId: CHAPTER_ID,
    order: 3,
    name: 'Embedding',
    cn: '向量表示',
    tagline: '把文本压成向量，用距离衡量语义相近程度。',
    aliases: ['embedding', 'embeddings', '向量', '向量表示', '嵌入', '语义向量'],
    contentStatus: 'outline',
    oneLiner: 'embedding 把文本映射成向量，用向量距离近似表达语义相近程度。',
    plannedMilestone: 'M1.3',
    sources: ['src-index-draft'],
    related: ['rag'],
    nextSteps: '正文将在 M1.3 开放：说明相似不等于正确，以及为什么向量检索也会召回不相关片段。',
  }),

  defineConcept({
    id: 'memory',
    chapterId: CHAPTER_ID,
    order: 4,
    name: 'Memory',
    cn: '记忆',
    tagline: '跨轮次保留的信息，不等于模型记住了你。',
    aliases: ['memory', '记忆', '长期记忆', '记忆机制'],
    contentStatus: 'outline',
    oneLiner: '记忆是跨轮次保留并再次注入上下文的信息，它靠外部存储实现，不是模型参数被改写。',
    plannedMilestone: 'M1.3',
    sources: ['src-index-draft'],
    related: ['rag', 'context_window'],
    nextSteps: '正文将在 M1.3 开放：对比记忆与检索、记忆与微调的区别。',
  }),

  defineConcept({
    id: 'skills',
    chapterId: CHAPTER_ID,
    order: 5,
    name: 'Skills',
    cn: '技能说明',
    tagline: '可按需加载的任务说明文档及其随附资源，本身不是工具。',
    aliases: ['skills', 'skill', 'skill.md', 'skillmd', '技能', '技能说明', '技能包'],
    contentStatus: 'reviewed',
    oneLiner: 'Skills 是按需加载的任务说明与随附资源：告诉系统该怎么做，但不授予执行能力。',
    understand: [
      'Skills 是一份按需加载的任务说明：通常是一个说明文件（例如 SKILL.md），写明某类任务该怎么做、按什么步骤走、注意哪些约束，还可能随附模板、脚本或参考资料等资源。',
      '它的关键是按需读入上下文，而不是一次性塞进系统指令：相关任务出现时才加载，避免长期占用上下文。加载一份说明只提供做法，不会因此获得任何执行能力，具体动作仍要由具备相应权限的工具去完成。',
    ],
    inspect: [
      '加载时机 · 任务相关时才把说明读进上下文；与「把全部说明一次性塞进系统指令」相比，它节省窗口容量。',
      '内容形态 · 说明文本 + 可选资源（模板、脚本、参考资料）；资源被读取不等于被允许执行。',
      '权限边界 · 加载 Skills 不授予工具、文件或网络权限，也不产生任何动作记录。',
      '本原型的真实情况 · 装配台没有「Skills 模块」：这是解释性节点，界面不会伪装成已装配能力。',
    ],
    misconceptions: [
      {
        claim: '加载了 Skills 就等于获得了工具权限，可以读写文件和联网了。',
        correction:
          'Skills 只是读入上下文的说明文本与资源，不授予工具、文件或网络权限，也不会自己执行任何动作。真正的操作要由运行环境调用已提供的工具来完成，权限也在那一侧控制。',
      },
    ],
    sources: ['doc-m0-3-task', 'doc-prd'],
    related: ['agent'],
    nextSteps:
      '后续学习提示：把 Skills 和 Tools 对照看，分清「告诉系统怎么做」与「真正去做」；本节点是解释性节点，装配台暂无对应模块。',
    systemTarget: 'none',
    graph: NODE_LAYOUT.skills,
    reviewNote: REVIEW_NOTE,
  }),

  defineConcept({
    id: 'chunking',
    chapterId: CHAPTER_ID,
    order: 6,
    name: 'Chunking',
    cn: '资料切分',
    tagline: '把长资料切成可检索的片段。',
    aliases: ['chunking', 'chunk', '切分', '资料切分', '分块'],
    contentStatus: 'outline',
    oneLiner: 'chunking 把长资料切成片段：切得太碎丢上下文，切得太大浪费窗口并降低命中精度。',
    plannedMilestone: 'M1.3',
    sources: ['src-index-draft'],
    related: ['retrieval'],
    nextSteps: '正文将在 M1.3 开放：说明切分粒度对检索质量的影响。',
  }),
]);
