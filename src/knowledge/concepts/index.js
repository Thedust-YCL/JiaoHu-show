/**
 * src/knowledge/concepts/index.js
 * ------------------------------------------------------------------
 * 36 个概念的**唯一汇总入口**（M1.1_TASK §3：索引候选清单）。
 *
 * 组织规则：
 *   · 概念按章节分组存放（ch01…ch06），此处只做拼接、编号与索引；
 *   · `idx` 是按章节顺序计算出的**全局显示序号**（01–36），只用于展示，
 *     稳定的引用键永远是 `id`；
 *   · `chapter` / `chapterCn` / `chapterNo` 为兼容 M0.3 界面而保留的派生字段；
 *   · 概念顺序 `CONCEPT_ORDER` 为「章节顺序 → 章内 order」，全站唯一。
 * ------------------------------------------------------------------
 */
import { CHAPTERS, getChapter } from '../chapters.js';
import { CHAPTER_01_CONCEPTS } from './ch01-intelligence.js';
import { CHAPTER_02_CONCEPTS } from './ch02-context.js';
import { CHAPTER_03_CONCEPTS } from './ch03-connection.js';
import { CHAPTER_04_CONCEPTS } from './ch04-knowledge.js';
import { CHAPTER_05_CONCEPTS } from './ch05-runtime.js';
import { CHAPTER_06_CONCEPTS } from './ch06-reliability.js';

/** 章节顺序固定：先按注册表顺序取每章概念，再统一编号 */
const BY_CHAPTER = Object.freeze({
  intelligence: CHAPTER_01_CONCEPTS,
  context: CHAPTER_02_CONCEPTS,
  connection: CHAPTER_03_CONCEPTS,
  knowledge: CHAPTER_04_CONCEPTS,
  runtime: CHAPTER_05_CONCEPTS,
  reliability: CHAPTER_06_CONCEPTS,
});

const ordered = [];
for (const chapter of CHAPTERS) {
  const list = [...BY_CHAPTER[chapter.id]].sort((a, b) => a.order - b.order);
  for (const concept of list) ordered.push({ concept, chapter });
}

/** 全局显示序号与章节派生字段（冻结前的一次性计算） */
function withDerived({ concept, chapter }, index) {
  return Object.freeze({
    ...concept,
    idx: String(index + 1).padStart(2, '0'),
    chapter: chapter.no,
    chapterNo: chapter.no,
    chapterCn: chapter.title.zh,
    chapterEn: chapter.title.en,
  });
}

export const CONCEPTS = Object.freeze(
  Object.fromEntries(ordered.map((entry, index) => {
    const concept = withDerived(entry, index);
    return [concept.id, concept];
  }))
);

/** 36 个概念的规范顺序（章节顺序 → 章内顺序） */
export const CONCEPT_ORDER = Object.freeze(Object.keys(CONCEPTS));

/** 取概念：未知 ID 返回 null（调用方必须显式处理，不抛异常） */
export function getConcept(conceptId) {
  return Object.prototype.hasOwnProperty.call(CONCEPTS, conceptId) ? CONCEPTS[conceptId] : null;
}

/** 按章节取概念（顺序稳定；未知章节返回空数组而不是抛错） */
export function getConceptsByChapter(chapterId) {
  return CONCEPT_ORDER.map((id) => CONCEPTS[id]).filter((c) => c.chapterId === chapterId);
}

/** 章节内位置（1 起）：知识页用它显示「第 03 章 · 第 2 / 6 个概念」 */
export function positionInChapter(conceptId) {
  const concept = getConcept(conceptId);
  if (!concept) return null;
  const siblings = getConceptsByChapter(concept.chapterId);
  const index = siblings.findIndex((c) => c.id === conceptId);
  return { index: index + 1, total: siblings.length, siblingIds: siblings.map((c) => c.id) };
}

/** 章内相邻概念（上一 / 下一）：知识页底部导航用，未知位置返回 null */
export function neighborConcepts(conceptId) {
  const concept = getConcept(conceptId);
  if (!concept) return { prev: null, next: null };
  const siblings = getConceptsByChapter(concept.chapterId);
  const index = siblings.findIndex((c) => c.id === conceptId);
  return {
    prev: index > 0 ? siblings[index - 1] : null,
    next: index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null,
  };
}

/** 全量概念按章节分组（目录、Story、Atlas 左栏共用一份结构） */
export function conceptsByChapter() {
  return CHAPTERS.map((chapter) => ({
    chapter,
    concepts: getConceptsByChapter(chapter.id),
  }));
}
