/**
 * src/knowledge/chapters.js
 * ------------------------------------------------------------------
 * M1.1 六章节统一注册表（唯一权威）。
 *
 * 约束（M1.1_TASK §3）：
 *   · 恰好六个稳定 chapterId，顺序固定为 01 → 06，不得在运行期增删；
 *   · 每章必须有双语标题、核心叙事问题与简介，供 Story 目录与知识页共用；
 *   · 章节只是**知识组织单位**，不代表该章正文已完成：正文与实验分别由
 *     M1.2 / M1.3 交付，narrativeStatus 如实记录这一点；
 *   · 本章不写任何远程数据，全部为本地静态常量。
 * ------------------------------------------------------------------
 */

/** M1.4六章连续叙事、共享模板与学习路径已核对。 */
export const CHAPTER_NARRATIVE_STATUS = 'reviewed';

/**
 * 六章注册表。
 * 键序即展示顺序；`no` 是显示编号，`id` 是永久稳定标识（供关系、实验、
 * 学习记录与深链接引用，不允许因为改名而变更）。
 */
export const CHAPTERS = Object.freeze([
  Object.freeze({
    id: 'intelligence',
    no: '01',
    order: 1,
    title: Object.freeze({ zh: '智能诞生', en: 'INTELLIGENCE' }),
    question: '模型为什么能回答，却不必然有可验证的外部事实？',
    intro:
      '从「模型只是按训练学到的规律续写文本」这一件事讲起：它为什么能写出通顺的答案，又为什么不能保证答案背后有可核对的事实。本章要建立的不是模型排行榜，而是一条底线认知——语言能力与事实来源是两件事。',
    narrativeStatus: CHAPTER_NARRATIVE_STATUS,
    /** 后续阶段归属：正文与实验的交付阶段 */
    contentMilestone: 'M1.2',
    labId: 'lab-intelligence',
    /** 首屏叙事入口：Story 目录里用一句话说明这一章在讲什么 */
    hook: '先分清「会说话」和「知道事实」是两种不同的能力。',
  }),
  Object.freeze({
    id: 'context',
    no: '02',
    order: 2,
    title: Object.freeze({ zh: '指令与上下文', en: 'CONTEXT' }),
    question: '为什么相同模型在不同上下文下行为不同？',
    intro:
      '同一个模型，换一段系统指令、换一批放进窗口的资料，表现就会明显不同。本章关注「这一轮到底把什么放进了上下文」这件工程问题，以及上下文容量、指令优先级与幻觉之间的关系。',
    narrativeStatus: CHAPTER_NARRATIVE_STATUS,
    contentMilestone: 'M1.2',
    labId: 'lab-context',
    hook: '模型的行为不只由参数决定，也由你这一轮喂给它的内容决定。',
  }),
  Object.freeze({
    id: 'connection',
    no: '03',
    order: 3,
    title: Object.freeze({ zh: '外部能力', en: 'CONNECTION' }),
    question: '模型如何请求外部工具读取资料？',
    intro:
      '模型本身不能上网、不能读文件。它只能提出一段结构化的调用请求，由外部运行环境去执行。本章讲清「请求 / 执行 / 返回」三段职责，并把 Tool Calling、Tools、API、MCP 这几个最容易被混为一谈的名词分开。',
    narrativeStatus: CHAPTER_NARRATIVE_STATUS,
    contentMilestone: 'M1.2',
    labId: 'lab-connection',
    hook: '模型负责开口要，运行环境负责真的去拿。',
  }),
  Object.freeze({
    id: 'knowledge',
    no: '04',
    order: 4,
    title: Object.freeze({ zh: '信息与方法', en: 'KNOWLEDGE' }),
    question: '检索、增强、记忆和任务方法如何区别？',
    intro:
      '同样是把外部信息带进上下文，检索、RAG、记忆、技能说明与资料切分解决的是不同问题。本章的难点不是记住名词，而是分清「按查询取证据」「跨轮次保留信息」「告诉系统该怎么做」这三种不同的事。',
    narrativeStatus: CHAPTER_NARRATIVE_STATUS,
    contentMilestone: 'M1.3',
    labId: 'lab-knowledge',
    hook: '检索不是记忆，技能不是权限。',
  }),
  Object.freeze({
    id: 'runtime',
    no: '05',
    order: 5,
    title: Object.freeze({ zh: '执行系统', en: 'RUNTIME' }),
    question: '多步骤任务怎样协调、执行与调整？',
    intro:
      '把模型放进一套执行系统里：谁决定下一步、谁来执行、失败了怎么办。本章区分 Agent 与 Workflow 的控制权归属，说明执行循环与编排各自的职责，并澄清 Harness 不是第二个模型。',
    narrativeStatus: CHAPTER_NARRATIVE_STATUS,
    contentMilestone: 'M1.3',
    labId: 'lab-runtime',
    hook: '决定路径的是谁：写死的代码，还是运行期的判断。',
  }),
  Object.freeze({
    id: 'reliability',
    no: '06',
    order: 6,
    title: Object.freeze({ zh: '可靠性与边界', en: 'RELIABILITY' }),
    question: '结果如何验证，权限和风险如何控制？',
    intro:
      '系统能跑起来不等于可以信任。本章讨论权限与沙箱如何限定能碰的范围，护栏与提示注入为什么是两类不同的问题，以及追踪与评估怎样让「它到底做了什么、做得怎么样」变成可检查的记录。',
    narrativeStatus: CHAPTER_NARRATIVE_STATUS,
    contentMilestone: 'M1.3',
    labId: 'lab-reliability',
    hook: '没有可验证的记录，可靠性就只是一句形容词。',
  }),
]);

/** 稳定顺序的 chapterId 列表：目录、搜索分组与测试共用 */
export const CHAPTER_ORDER = Object.freeze(CHAPTERS.map((c) => c.id));

const CHAPTER_INDEX = Object.freeze(Object.fromEntries(CHAPTERS.map((c) => [c.id, c])));

/** 取章节：未知 ID 返回 null（调用方必须显式处理，不抛异常） */
export function getChapter(chapterId) {
  return Object.prototype.hasOwnProperty.call(CHAPTER_INDEX, chapterId) ? CHAPTER_INDEX[chapterId] : null;
}

/** 显示编号（'01'…'06'）→ chapterId；未知编号返回 null */
export function chapterIdByNo(no) {
  const chapter = CHAPTERS.find((c) => c.no === String(no));
  return chapter ? chapter.id : null;
}
