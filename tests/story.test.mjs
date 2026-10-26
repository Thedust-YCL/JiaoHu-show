/**
 * tests/story.test.mjs
 * ------------------------------------------------------------------
 * Chapter 01–06 叙事（A10–A13 / M1.2 §3 · M1.3 §4）的结构与一致性测试。
 *
 * 关注点：
 *   · 每章都有开场目标、可观察局限、实验入口、结果解读、章节过渡；
 *   · 叙事里引用的概念与实验都必须真实存在、且能对应到知识层；
 *   · M1.3 起六章叙事全部交付，且不得出现「引用了不存在的章节 / 概念 / 实验」。
 * ------------------------------------------------------------------
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHAPTER_STORIES,
  STORY_ORDER,
  getChapterStory,
  neighborStories,
  validateStories,
} from '../src/content/chapters/index.js';
import {
  CHAPTERS,
  CONCEPTS,
  EXPERIMENTS,
  conceptAvailability,
  getChapter,
  getExperiment,
  getConceptsByChapter,
} from '../src/knowledge/index.js';

const ALL_CHAPTERS = ['intelligence', 'context', 'connection', 'knowledge', 'runtime', 'reliability'];

test('叙事数据：六章齐全、顺序固定、校验零问题', () => {
  assert.deepEqual([...STORY_ORDER], ALL_CHAPTERS);
  assert.deepEqual(Object.keys(CHAPTER_STORIES), ALL_CHAPTERS);
  assert.deepEqual(validateStories(), []);
  // 与章节注册表一一对齐（不多不少）
  assert.deepEqual(CHAPTERS.map((c) => c.id), ALL_CHAPTERS);
});

test('A10–A12 每章都必须有：开场目标、可观察局限、实验入口、结果解读、章节过渡', () => {
  for (const chapterId of STORY_ORDER) {
    const story = getChapterStory(chapterId);
    assert.equal(story.no, getChapter(chapterId).no);
    assert.ok(story.opening.goal.length >= 8, `${chapterId} 开场目标`);
    assert.ok(story.opening.task.includes('研究'), `${chapterId} 研究任务`);
    assert.ok(story.limitation.text.length >= 8, `${chapterId} 局限`);
    assert.ok(story.limitation.detail.length >= 20, `${chapterId} 局限细节`);
    assert.ok(story.beats.length >= 4, `${chapterId} 叙事节拍`);
    assert.ok(
      story.beats.some((b) => b.kind === 'limit' || b.observation),
      `${chapterId} 必须至少有一处可观察的问题/局限`
    );
    assert.ok(story.beats.some((b) => b.kind === 'experiment'), `${chapterId} 必须有实验节拍`);
    assert.ok(story.lab.steps.length >= 2, `${chapterId} 实验步骤`);
    assert.ok(story.lab.observe.length >= 2, `${chapterId} 观察要点`);
    assert.ok(story.reading.items.length >= 3, `${chapterId} 结果解读`);
    assert.ok(story.reading.items.every((item) => item.q.length > 4 && item.a.length > 10));
    assert.ok(story.transition.text.length >= 10, `${chapterId} 章节过渡`);
  }
});

test('A10 第 01 章：明确写出「能生成回答 ≠ 已检索核验」这一局限', () => {
  const story = getChapterStory('intelligence');
  assert.match(story.limitation.text, /并不等于/);
  assert.match(story.limitation.text, /检索/);
  assert.match(story.limitation.text, /核验/);
  // 开场必须是「显式标注为模拟」的回答
  const openingBeat = story.beats.find((b) => b.kind === 'opening');
  assert.ok(openingBeat.sample);
  assert.match(openingBeat.sample.label, /模拟/);
  assert.match(openingBeat.sample.label, /不是真实/);
});

test('A11 第 02 章：局限落在「没有接入真实资料」，并指向 Context Lab', () => {
  const story = getChapterStory('context');
  assert.match(story.limitation.text, /没有接入真实资料/);
  assert.equal(story.lab.experimentId, 'exp-context-lab');
  const steps = story.lab.steps.join('\n');
  assert.match(steps, /证据要求|标注来源/);
  assert.match(steps, /预算/);
});

test('A12 第 03 章：工具与 MCP 路径都被讲到，局限落在「数据不自动保证正确」', () => {
  const story = getChapterStory('connection');
  const text = story.beats.map((b) => `${b.title}\n${b.text}`).join('\n');
  assert.match(text, /Search/);
  assert.match(text, /Reader/);
  assert.match(text, /Host/);
  assert.match(text, /Client/);
  assert.match(text, /Server/);
  assert.match(story.limitation.text, /不自动保证正确/);
  assert.equal(story.lab.experimentId, 'exp-tool-calling-demo');
});

test('A13 章节过渡：01→02→03→04→05→06 连成一条线，第 06 章收束并指向 M1.4', () => {
  for (let i = 0; i < ALL_CHAPTERS.length - 1; i += 1) {
    assert.equal(
      getChapterStory(ALL_CHAPTERS[i]).transition.toChapterId,
      ALL_CHAPTERS[i + 1],
      `${ALL_CHAPTERS[i]} → ${ALL_CHAPTERS[i + 1]}`
    );
  }
  assert.equal(getChapterStory('reliability').transition.toChapterId, null);
  assert.match(getChapterStory('reliability').transition.text, /M1\.4/);
  const first = neighborStories('intelligence');
  assert.equal(first.prev, null);
  assert.equal(first.next.chapterId, 'context');
  const last = neighborStories('reliability');
  assert.equal(last.next, null);
  assert.equal(last.prev.chapterId, 'runtime');
});

test('叙事引用：每章概念都属于该章，且在知识层有正文', () => {
  for (const chapterId of STORY_ORDER) {
    const story = getChapterStory(chapterId);
    const chapterConcepts = getConceptsByChapter(chapterId).map((c) => c.id);
    assert.deepEqual([...story.concepts].sort(), [...chapterConcepts].sort(), `${chapterId} 概念清单必须与知识层一致`);
    for (const id of story.concepts) {
      assert.ok(CONCEPTS[id], `${id} 不存在`);
      assert.equal(CONCEPTS[id].chapterId, chapterId);
      const availability = conceptAvailability(id);
      assert.equal(availability.hasBody, true, `${id} 应该有正文（叙事会引用它）`);
      assert.ok(CONCEPTS[id].reviewedAt, `${id} 必须有审校日期`);
    }
  }
});

test('叙事引用：每章实验都真实可用，且入口概念属于本章', () => {
  for (const chapterId of STORY_ORDER) {
    const story = getChapterStory(chapterId);
    const experiment = getExperiment(story.lab.experimentId);
    assert.ok(experiment, `${chapterId} 引用了不存在的实验`);
    assert.equal(experiment.status, 'available', `${chapterId} 的实验必须可操作`);
    assert.equal(experiment.chapterId, chapterId);
    assert.ok(experiment.conceptIds.includes(story.lab.entryConceptId));
    assert.equal(conceptAvailability(story.lab.entryConceptId).canRunExperiment, true);
  }
});

test('M1.3 交付：第 04–06 章叙事存在，且讲到本章必须讲清的技术边界', () => {
  const expectations = {
    knowledge: { experimentId: 'exp-retrieval-lab', entry: 'chunking', keywords: [/检索/, /切分/, /RAG/] },
    runtime: { experimentId: 'exp-agent-loop-lab', entry: 'agent_loop', keywords: [/Workflow/, /Agent Loop/, /Harness/] },
    reliability: { experimentId: 'exp-boundary-lab', entry: 'permissions', keywords: [/权限/, /沙箱/, /注入/] },
  };
  for (const [chapterId, expected] of Object.entries(expectations)) {
    const story = getChapterStory(chapterId);
    assert.ok(story, `${chapterId} 叙事缺失`);
    assert.equal(story.lab.experimentId, expected.experimentId);
    assert.equal(story.lab.entryConceptId, expected.entry);
    assert.ok(story.beats.some((b) => b.kind === 'experiment'), `${chapterId} 必须有实验节拍`);
    const text = `${story.beats.map((b) => `${b.title}\n${b.text}`).join('\n')}${story.limitation.text}`;
    for (const keyword of expected.keywords) assert.match(text, keyword, `${chapterId} 叙事必须讲到 ${keyword}`);
    assert.ok(neighborStories(chapterId).prev, `${chapterId} 必须有上一章`);
  }
  // 第 06 章必须写明「演示不等于安全认证」
  assert.match(getChapterStory('reliability').limitation.text, /不代表/);
});

test('叙事与知识层实验登记表一一对应：6 个可用实验各自被一章叙事引用', () => {
  const available = EXPERIMENTS.filter((e) => e.status === 'available').map((e) => e.id);
  const referenced = STORY_ORDER.map((id) => getChapterStory(id).lab.experimentId);
  assert.deepEqual([...referenced].sort(), [...available].sort());
  assert.equal(available.length, 6);
});
