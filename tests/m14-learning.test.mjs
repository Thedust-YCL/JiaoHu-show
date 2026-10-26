import test from 'node:test';
import assert from 'node:assert/strict';
import { createLearningStore, LEARNING_STORAGE_KEY } from '../src/features/atlas/state/learning.js';
import { EXPERIMENTS, CHAPTERS, graphModel } from '../src/knowledge/index.js';
import { memoryStorage } from './helpers.mjs';
import * as knowledge from '../src/knowledge/index.js';

test('M1.4 Atlas 查询复用名称/别名/关键词，章节与关系过滤可组合并清除', () => {
  assert.equal(typeof knowledge.queryAtlas, 'function');
  assert.equal(knowledge.queryAtlas().nodes.length, 36);
  assert.equal(knowledge.queryAtlas({chapterId:'knowledge'}).nodes.length,6);
  assert.equal(knowledge.queryAtlas({query:'模型上下文协议'}).nodes[0].id,'mcp');
  const filtered = knowledge.queryAtlas({relationType:'USES'});
  assert.ok(filtered.edges.length > 0);
  assert.ok(filtered.edges.every(e => e.type === 'USES'));
  assert.equal(knowledge.queryAtlas({query:'不存在的概念'}).nodes.length,0);
  assert.equal(knowledge.queryAtlas({chapterId:'intelligence',query:'sandbox'}).nodes.length,0);
});

test('M1.4 Atlas 完整覆盖36概念且固定布局无重叠坐标', () => {
  const model = graphModel();
  assert.equal(model.nodes.length, 36);
  assert.equal(new Set(Object.values(model.layout).map(p => `${p.x},${p.y}`)).size, 36);
});

test('M1.4 完成事件拒绝伪造或串错的实验ID', () => {
  const learning = createLearningStore({ storage: memoryStorage() });
  assert.equal(learning.markExperimentCompleted('token', 'exp-boundary-lab'), false);
  assert.equal(learning.isExperimentCompleted('token'), false);
});

test('M1.4 清除进度后刷新不会从只读旧备份复活', () => {
  const storage = memoryStorage({ 'agent-zero:learning:v1': JSON.stringify({schemaVersion:1, concepts:{rag:{explored:true}}}) });
  const learning = createLearningStore({storage});
  assert.equal(learning.flagsOf('rag').explored, true);
  learning.reset();
  assert.ok(storage.getItem('agent-zero:learning:v1'));
  assert.equal(createLearningStore({storage}).flagsOf('rag').explored, false);
});

test('M1.4 用户清除损坏或更新版数据后，新进度可以正常保存恢复', () => {
  for (const raw of ['{broken', JSON.stringify({schemaVersion:88,concepts:{}})]) {
    const storage=memoryStorage({[LEARNING_STORAGE_KEY]:raw});
    const learning=createLearningStore({storage});
    learning.markExplored('rag');
    assert.equal(storage.getItem(LEARNING_STORAGE_KEY),raw,'确认清除前保留原数据');
    learning.reset();
    learning.markExplored('llm');
    assert.equal(createLearningStore({storage}).flagsOf('llm').explored,true);
    assert.equal(learning.storageNotice(),null);
  }
});

test('M1.4 语义状态、实验聚合、章节总结与续学共享现有进度', () => {
  const storage = memoryStorage();
  const learning = createLearningStore({storage});
  assert.equal(typeof learning.statusOf, 'function');
  assert.equal(learning.statusOf('token'), 'not_started');
  learning.markExplored('token');
  assert.equal(learning.statusOf('token'), 'explored');
  learning.markInspected('token');
  assert.equal(learning.statusOf('token'), 'in_progress');
  for (const experiment of EXPERIMENTS) learning.markExperimentCompleted(experiment.entryConceptId, experiment.id);
  assert.equal(learning.summary().completedLabs, 6);
  learning.setStoryPosition('context', 'summary');
  learning.markChapterCompleted('context');
  const restored = createLearningStore({storage});
  assert.equal(restored.storyPosition().chapterId, 'context');
  assert.equal(restored.storyPosition().section, 'summary');
  assert.equal(restored.chapterSummary('context').completed, true);
  assert.equal(restored.chapterSummary('context').total, 6);
  assert.equal(restored.statusOf('token'), 'completed');
  assert.equal(JSON.parse(storage.getItem(LEARNING_STORAGE_KEY)).schemaVersion, 2);
  assert.equal(CHAPTERS.length, 6);
});
