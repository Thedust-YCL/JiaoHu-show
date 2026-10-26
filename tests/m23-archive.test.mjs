import test from 'node:test';
import assert from 'node:assert/strict';
import {createExample} from '../src/features/constructor/model/configuration.js';
import {createExperiment,runExperiment,copyExperiment} from '../src/features/comparison/model/experiment.js';
const api=await import('../src/features/comparison/state/archive.js').catch(()=>({}));
const exporter=await import('../src/features/comparison/export/markdown.js').catch(()=>({}));
const experiment=()=>{const c=createExample();return runExperiment(createExperiment({A:c,B:c}));};
function memory(rows=[]){let data=structuredClone(rows);return {list:async()=>structuredClone(data),transact:async fn=>{const change=fn(structuredClone(data));if(change.put)data=[...data.filter(x=>x.experimentId!==change.put.experimentId),structuredClone(change.put)];if(change.delete)data=data.filter(x=>x.experimentId!==change.delete);return change.result;},data:()=>structuredClone(data)};}
test('M23 A32–A35 archive save/open/rename/copy/delete are isolated immutable operations',async()=>{
  assert.equal(typeof api.createArchive,'function','archive repository must exist');
  const backend=memory(),archive=api.createArchive({backend}),e=experiment(),original=JSON.stringify(e);
  assert.equal((await archive.save(e)).ok,true);
  const read=await archive.list();assert.equal(read.experiments[0].A.run.runId,e.A.run.runId);
  assert.equal((await archive.rename(e.experimentId,'renamed')).ok,true);
  assert.equal(JSON.stringify(e),original);
  const copy=copyExperiment(e);assert.equal((await archive.save(copy)).ok,true);
  await archive.remove(e.experimentId);assert.equal((await archive.list()).experiments.length,1);
  assert.equal((await archive.list()).experiments[0].A.run.runId,e.A.run.runId);
});
test('M23 A33 damaged/unknown rows preserved; delete only selected damaged row',async()=>{
  const e=experiment(),backend=memory([e,{experimentId:'bad',schemaVersion:99},{experimentId:'wrong',schemaVersion:1}]);
  const archive=api.createArchive({backend}),read=await archive.list();
  assert.equal(read.experiments.length,1);assert.equal(read.corrupt.length,2);
  await archive.remove('bad');assert.equal(backend.data().length,2);assert.ok(backend.data().some(x=>x.experimentId==='wrong'));
});
test('M23 quota failure and capacity never evict archives or poison existing records',async()=>{
  const e=experiment(),backend=memory([e]),archive=api.createArchive({backend,maxRows:1});
  assert.equal((await archive.save(copyExperiment(e))).ok,false);assert.equal(backend.data().length,1);
  const before=JSON.stringify(backend.data());
  const broken=api.createArchive({backend:{list:backend.list,transact:async()=>{throw Error('QuotaExceededError');}}});
  assert.equal((await broken.save(e)).ok,false);assert.equal(JSON.stringify(backend.data()),before);
});
test('M23 archive refuses inconsistent snapshot/events, reads old dataset without substituting new data',async()=>{
  const e=structuredClone(experiment());e.A.configSnapshot.name='changed after run';
  const backend=memory(),archive=api.createArchive({backend});assert.equal((await archive.save(e)).ok,false);
  const old=structuredClone(experiment());old.controls.datasetVersion='missing';old.A.run.corpusVersion='missing';old.B.run.corpusVersion='missing';
  const oldArchive=api.createArchive({backend:memory([old])});
  const read=await oldArchive.list();assert.equal(read.experiments.length,1);assert.equal(read.experiments[0].controls.datasetVersion,'missing');
});
test('M23 A36 Markdown includes real metrics, controls, branches, source/event IDs and escaped title',()=>{
  const e=experiment(),md=exporter.experimentToMarkdown({...e,title:'[unsafe](javascript:bad) <script>'});
  assert.ok(md.includes('SIMULATION / 本地模拟'));assert.ok(md.includes(e.controls.datasetVersion));
  assert.ok(md.includes(e.A.run.runId));assert.ok(md.includes('step.started'));assert.ok(md.includes('sourceId'));
  assert.ok(!md.includes('<script>'));assert.ok(!md.includes('[unsafe](javascript:bad)'));
});
test('M23 review: missing archive timestamps and comparison fields quarantine only damaged row',async()=>{
  const good=experiment(),damaged=structuredClone(good);damaged.experimentId='damaged';delete damaged.updatedAt;
  const a=api.createArchive({backend:memory([damaged,good])}),read=await a.list();
  assert.equal(read.available,true);assert.equal(read.experiments.length,1);assert.equal(read.corrupt.length,1);
  const missing=structuredClone(good);delete missing.comparison;assert.throws(()=>api.validateExperiment(missing));
});
test('M23 review: archive control, approvals and derived cache tampering are rejected',async()=>{
  const e=experiment(),a=api.createArchive({backend:memory()});
  for(const change of [p=>p.controls.seed='wrong',p=>p.controls.approvalPolicyId='reject-all',p=>p.comparison.metrics[0].A.value='fake',p=>p.alignment[0].A='missing-event']){
    const p=structuredClone(e);change(p);assert.equal((await a.save(p)).ok,false);
  }
});
