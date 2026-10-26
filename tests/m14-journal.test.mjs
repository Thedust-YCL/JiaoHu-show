import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { memoryStorage } from './helpers.mjs';
import { createLearningStore } from '../src/features/atlas/state/learning.js';

async function api() {
  assert.ok(existsSync('src/features/atlas/state/journal.js'), '需要真实事件流水存储');
  return import('../src/features/atlas/state/journal.js');
}

test('M1.4 Journal 只接受有效事件及一致的ID，删除多余输入，不记录自动加载', async () => {
  const { createJournalStore } = await api();
  const storage = memoryStorage();
  const journal = createJournalStore({storage, now: () => 1700000000000});
  assert.equal(journal.events().length, 0);
  assert.equal(journal.record('page_loaded', {conceptId:'llm'}), false);
  assert.equal(journal.record('concept_viewed', {conceptId:'unknown'}), false);
  assert.equal(journal.record('lab_started', {conceptId:'token',experimentId:'exp-boundary-lab'}), false);
  assert.equal(journal.record('concept_viewed', {conceptId:'llm',secret:'sensitive text'}), true);
  assert.equal(journal.record('concept_viewed', {conceptId:'llm'}), false);
  assert.equal(JSON.stringify(journal.events()).includes('sensitive'), false);
  assert.equal(journal.events()[0].chapterId, 'intelligence');
});

test('M1.4 Journal 筛选、回访与清除仅影响流水，不影响配置和进度', async () => {
  const { createJournalStore, journalTarget } = await api();
  const storage = memoryStorage({'agent-zero:constructor:v1':'keep', 'agent-zero:research:v2':'research'});
  let tick = 1700000000000;
  const journal = createJournalStore({storage, now: () => tick += 4000});
  const learning = createLearningStore({storage, journal, now: () => tick});
  learning.markExplored('rag');
  learning.markInspected('rag');
  learning.markExperimentCompleted('token');
  learning.markExperimentCompleted('token');
  assert.equal(journal.events({chapterId:'knowledge'}).length, 2);
  assert.equal(journal.events({type:'lab_completed'}).length, 1);
  assert.deepEqual(journalTarget(journal.events({type:'lab_completed'})[0]), {kind:'lab',id:'exp-token-lab'});
  journal.clear();
  assert.equal(journal.events().length, 0);
  assert.equal(learning.flagsOf('rag').explored, true);
  assert.equal(storage.getItem('agent-zero:constructor:v1'), 'keep');
  assert.equal(storage.getItem('agent-zero:research:v2'), 'research');
  assert.equal(createJournalStore({storage}).events().length, 0);
});

test('M1.4 Journal 限制增长、损坏/未来版本不覆盖、存储拒绝可控降级', async () => {
  const { createJournalStore, JOURNAL_STORAGE_KEY, MAX_JOURNAL_EVENTS } = await api();
  let tick = 1700000000000;
  const storage = memoryStorage();
  const journal = createJournalStore({storage, now: () => tick += 4000});
  for (let i=0; i<MAX_JOURNAL_EVENTS+20; i++) journal.record('concept_viewed', {conceptId:'llm'});
  assert.equal(createJournalStore({storage}).events().length, MAX_JOURNAL_EVENTS);
  for (const raw of ['{broken', JSON.stringify({schemaVersion:88,events:[]})]) {
    storage.setItem(JOURNAL_STORAGE_KEY,raw);
    const bad = createJournalStore({storage});
    assert.ok(bad.notice());
    bad.record('concept_viewed',{conceptId:'rag'});
    assert.equal(storage.getItem(JOURNAL_STORAGE_KEY),raw);
  }
  const denied = createJournalStore({storage:{getItem(){throw Error('denied');},setItem(){throw Error('denied');}}});
  denied.record('concept_viewed',{conceptId:'llm'});
  assert.equal(denied.events().length,1);
  assert.ok(denied.notice());
});

test('M1.4 损坏日期不得进入日志并导致渲染异常', async () => {
  const {createJournalStore}=await api();
  const journal=createJournalStore({storage:memoryStorage(),now:()=>1e100});
  assert.equal(journal.record('concept_viewed',{conceptId:'llm'}),false);
  assert.equal(journal.events().length,0);
});
