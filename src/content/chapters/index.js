/**
 * src/content/chapters/index.js
 * ------------------------------------------------------------------
 * 三章 Story 叙事数据的统一入口（M1.2 D02）。
 *
 * 为什么单独一层：
 *   · 章节叙事属于**内容**，与渲染组件解耦，测试可以直接在 Node 里断言
 *     「每章是否有开场目标 / 可观察局限 / 实验入口 / 结果解读 / 上下章导航」；
 *   · 第 04–06 章的叙事属于 M1.3，这里返回 null，界面据此显示「后续阶段」，
 *     不假装已经写完。
 * ------------------------------------------------------------------
 */
import { CHAPTER_01_STORY } from './01-intelligence.js';
import { CHAPTER_02_STORY } from './02-context.js';
import { CHAPTER_03_STORY } from './03-connection.js';

export const CHAPTER_STORIES = Object.freeze({
  intelligence: CHAPTER_01_STORY,
  context: CHAPTER_02_STORY,
  connection: CHAPTER_03_STORY,
});

/** 本阶段已交付叙事的章节顺序（用于上一章 / 下一章导航） */
export const STORY_ORDER = Object.freeze(['intelligence', 'context', 'connection']);

/** 取章节叙事：未交付章节返回 null（调用方必须显式处理） */
export function getChapterStory(chapterId) {
  return Object.prototype.hasOwnProperty.call(CHAPTER_STORIES, chapterId) ? CHAPTER_STORIES[chapterId] : null;
}

/** 上一章 / 下一章（只在本阶段已交付的三章范围内） */
export function neighborStories(chapterId) {
  const index = STORY_ORDER.indexOf(chapterId);
  if (index < 0) return { prev: null, next: null };
  return {
    prev: index > 0 ? getChapterStory(STORY_ORDER[index - 1]) : null,
    next: index < STORY_ORDER.length - 1 ? getChapterStory(STORY_ORDER[index + 1]) : null,
  };
}

/**
 * 章节叙事完整性校验（测试与自检脚本共用）：
 * 每章必须有开场目标、至少一次可观察的问题/局限、实验入口、
 * 结果解读、章节过渡（或明确的「后续阶段」说明）。
 */
export function validateStories() {
  const issues = [];
  for (const chapterId of STORY_ORDER) {
    const story = getChapterStory(chapterId);
    if (!story) {
      issues.push({ code: 'STORY_MISSING', id: chapterId });
      continue;
    }
    if (story.chapterId !== chapterId) issues.push({ code: 'STORY_CHAPTER_MISMATCH', id: chapterId });
    if (!story.opening?.goal || story.opening.goal.length < 8) issues.push({ code: 'STORY_OPENING_THIN', id: chapterId });
    if (!story.opening?.task) issues.push({ code: 'STORY_TASK_MISSING', id: chapterId });
    if (!Array.isArray(story.beats) || story.beats.length < 3) issues.push({ code: 'STORY_BEATS_THIN', id: chapterId });
    const observable = (story.beats || []).filter((b) => b.kind === 'limit' || b.observation);
    if (!observable.length) issues.push({ code: 'STORY_NO_OBSERVABLE', id: chapterId });
    if (!story.limitation?.text) issues.push({ code: 'STORY_LIMITATION_MISSING', id: chapterId });
    if (!story.lab?.experimentId) issues.push({ code: 'STORY_LAB_MISSING', id: chapterId });
    if (!Array.isArray(story.lab?.steps) || story.lab.steps.length < 2) issues.push({ code: 'STORY_LAB_STEPS_THIN', id: chapterId });
    if (!story.reading?.items?.length) issues.push({ code: 'STORY_READING_MISSING', id: chapterId });
    if (!story.transition?.text) issues.push({ code: 'STORY_TRANSITION_MISSING', id: chapterId });
    if (!Array.isArray(story.concepts) || story.concepts.length === 0) issues.push({ code: 'STORY_CONCEPTS_MISSING', id: chapterId });
  }
  return issues;
}
