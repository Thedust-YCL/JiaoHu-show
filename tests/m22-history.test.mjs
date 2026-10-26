import test from 'node:test';
import assert from 'node:assert/strict';
import { createExample } from '../src/features/constructor/model/configuration.js';
import { createRuntime, restoreRuntime } from '../src/simulation/engine/runtime.js';
import { RUNTIME_HISTORY_KEY, readRuntimeHistory, saveRuntimeRun, deleteRuntimeRun } from '../src/features/execution/state/runtimeHistory.js';
function storage(){const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
function run(){const rt=createRuntime(createExample());rt.step();return rt;}
test('A30/A31 retain 5 recent independent runs, delete one and isolate every previous namespace',()=>{
  const s=storage();for(const key of ['agent-zero:constructor:v2','agent-zero:journal:v1','agent-zero:learning:v2','agent-zero:research:v2','agent-zero:execution:v1'])s.setItem(key,'unchanged');
  const rs=Array.from({length:6},()=>run().getRun());
  for(const r of rs)assert.equal(saveRuntimeRun(s,r).ok,true);
  assert.equal(readRuntimeHistory(s).runs.length,5);
  assert.equal(readRuntimeHistory(s).runs[0].runId,rs[5].runId);
  assert.equal(deleteRuntimeRun(s,rs[3].runId).ok,true);assert.equal(readRuntimeHistory(s).runs.length,4);
  for(const key of ['agent-zero:constructor:v2','agent-zero:journal:v1','agent-zero:learning:v2','agent-zero:research:v2','agent-zero:execution:v1'])assert.equal(s.getItem(key),'unchanged');
});
test('A28/A32 damaged per-run summary/trace is quarantined; append preserves bad data and other runs',()=>{
  const s=storage();const a=run().getRun(),b=run().getRun();saveRuntimeRun(s,a);saveRuntimeRun(s,b);
  const raw=JSON.parse(s.getItem(RUNTIME_HISTORY_KEY));raw.runs[0].summary.steps=999;
  s.setItem(RUNTIME_HISTORY_KEY,JSON.stringify(raw));
  const result=readRuntimeHistory(s);assert.equal(result.runs.length,1);assert.equal(result.corrupt.length,1);
  assert.match(result.notice,/损坏/);assert.equal(saveRuntimeRun(s,run().getRun()).ok,true);
  assert.ok(JSON.parse(s.getItem(RUNTIME_HISTORY_KEY)).runs.some(r=>r.summary.steps===999));
  const key=readRuntimeHistory(s).corrupt[0].key;assert.equal(deleteRuntimeRun(s,key).ok,true);
  assert.equal(readRuntimeHistory(s).corrupt.length,0);assert.equal(readRuntimeHistory(s).runs.length,2);
});
test('A32 invalid JSON locks writes; explicit removal is scoped; quota failure preserves existing bytes',()=>{
  const s=storage();s.setItem(RUNTIME_HISTORY_KEY,'{broken');assert.ok(readRuntimeHistory(s).locked);
  assert.equal(saveRuntimeRun(s,run().getRun()).ok,false);assert.equal(s.getItem(RUNTIME_HISTORY_KEY),'{broken');
  assert.equal(deleteRuntimeRun(s,'corrupt-envelope').ok,true);assert.equal(s.getItem(RUNTIME_HISTORY_KEY),null);
  saveRuntimeRun(s,run().getRun());const before=s.getItem(RUNTIME_HISTORY_KEY);
  s.setItem=()=>{throw Error('QuotaExceeded');};assert.equal(saveRuntimeRun(s,run().getRun()).ok,false);
  assert.equal(s.getItem(RUNTIME_HISTORY_KEY),before);
});
test('A03/A11/A29 reload pauses a running run and replays exact consumed budgets; unknown command tampering rejected',()=>{
  const rt=run();rt.resume();rt.step();const before=rt.getRun();
  const restored=restoreRuntime(before);assert.equal(restored.getRun().status,'paused');
  assert.deepEqual(restored.getRun().steps,before.steps);assert.equal(restored.getRun().summary.steps,before.summary.steps);
  assert.equal(restored.step(),true);assert.equal(restored.getRun().summary.steps,before.summary.steps+1);
  const corrupt=JSON.parse(JSON.stringify(before));corrupt.commands.push({action:'restart',args:[]});assert.throws(()=>restoreRuntime(corrupt));
});
test('A22 refresh preserves waiting approval without executing or inheriting old approval on restart',()=>{
  const rt=createRuntime(createExample(),{scenarioId:'PERMISSION_REQUIRED'});
  while(rt.getRun().status!=='waiting_approval')rt.step();
  const restored=restoreRuntime(rt.getRun());assert.equal(restored.getRun().status,'waiting_approval');
  assert.equal(restored.getRun().summary.toolCalls,0);restored.approve();assert.equal(restored.getRun().summary.toolCalls,1);
  assert.equal(restored.approve(),false);
  const next=restored.restart();while(next.getRun().status!=='waiting_approval')next.step();
  assert.equal(next.getRun().summary.approvals,0);
});
