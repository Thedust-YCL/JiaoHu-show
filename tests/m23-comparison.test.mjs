import test from 'node:test';
import assert from 'node:assert/strict';
import {createExample,cloneConfiguration} from '../src/features/constructor/model/configuration.js';
import {createRuntime,semanticTrace,restoreRuntime} from '../src/simulation/engine/runtime.js';
const api=await import('../src/features/comparison/model/experiment.js').catch(()=>({}));
const metrics=await import('../src/features/comparison/model/metrics.js').catch(()=>({}));
const reportApi=await import('../src/features/comparison/model/report.js').catch(()=>({}));
const trace=await import('../src/features/comparison/model/trace.js').catch(()=>({}));
const cfg=()=>{const c=createExample('starter');c.modules.find(m=>m.moduleId==='document_reader').settings.readMode='full_text';return c;};
const pair=(options={})=>api.runExperiment(api.createExperiment({A:cfg(),B:cfg(),...options}));

test('M23 A02–A11 same engine, distinct Runs, immutable snapshots and equivalent inputs',()=>{
  assert.equal(typeof api.createExperiment,'function','comparison pairing API must exist');
  const c=cfg(),draft=api.createExperiment({A:c,B:c});c.settings.maxSteps=2;
  const p=api.runExperiment(draft);
  assert.notEqual(p.A.run.runId,p.B.run.runId);
  assert.equal(p.A.configSnapshot.settings.maxSteps,24);
  assert.deepEqual(semanticTrace(p.A.run),semanticTrace(p.B.run));
  assert.throws(()=>{p.A.configSnapshot.name='mutated';});
  assert.ok(p.comparison.metrics.every(m=>m.status==='equal'));
});
test('M23 A05 configuration diff excludes copied identity but includes settings/modules/permissions',()=>{
  const a=cfg(),b=cloneConfiguration(a);b.name='Variant';
  assert.equal(api.configurationDiff(a,b).filter(x=>!x.equal).length,0);
  b.settings.maxRetries=0;b.modules.find(m=>m.moduleId==='document_reader').enabled=false;
  const diffs=api.configurationDiff(a,b).filter(x=>!x.equal);
  assert.ok(diffs.some(x=>x.field==='settings.maxRetries'));
  assert.ok(diffs.some(x=>x.field==='modules.document_reader.enabled'));
});
test('M23 A06/A14 independent preflight does not replace absent metrics by zeros',()=>{
  const bad=cfg();bad.settings.maxSteps=0;const p=pair({B:bad});
  assert.equal(p.B.run,null);assert.equal(p.B.preflight.ready,false);
  assert.ok(p.A.run);assert.equal(p.comparison.metrics.find(m=>m.metricId==='steps').B.value,null);
  assert.equal(p.comparison.metrics.find(m=>m.metricId==='steps').status,'unavailable');
});
test('M23 A07/A08 approval scripts are recorded independently and reject cannot dispatch tool',()=>{
  for(const approvalPolicyId of ['approve-all','reject-all']){
    const p=pair({controls:{scenarioId:'PERMISSION_REQUIRED',approvalPolicyId,seed:'fair'}});
    for(const side of ['A','B']){
      assert.ok(p[side].approvalInputs.length);
      assert.equal(p[side].approvalInputs[0].decision,approvalPolicyId==='approve-all'?'approve':'reject');
      assert.equal(p[side].run.events.filter(e=>e.type==='permission.requested').length,p[side].approvalInputs.length);
      if(approvalPolicyId==='reject-all')assert.equal(p[side].run.events.filter(e=>e.type==='tool.call').length,0);
    }
  }
  assert.throws(()=>api.createExperiment({A:cfg(),B:cfg(),controls:{approvalPolicyId:null}}),/审批/);
});
test('M23 A12 versions/controls mismatch block strict comparison and exact rerun',()=>{
  const p=pair(),b=structuredClone(p.B.run);b.corpusVersion='missing-v0';
  const result=metrics.compareRuns(p.A.run,b);
  assert.equal(result.strict,false);assert.ok(result.warnings.length);
  const old=structuredClone(p);old.controls.datasetVersion='missing-v0';
  assert.equal(api.reproducibility(old).exact,false);assert.throws(()=>api.rerunExperiment(old),/版本/);
  b.corpusVersion=p.A.run.corpusVersion;b.seed='other';assert.equal(metrics.compareRuns(p.A.run,b).strict,false);
});
test('M23 A13/A15–A18 all nine scenarios reduce actual counts and terminal reasons',()=>{
  for(const scenarioId of ['NORMAL_PATH','MISSING_EVIDENCE','TOOL_FAILURE_ONCE','TOOL_FAILURE_EXHAUSTED','CONFLICTING_SOURCES','PERMISSION_REQUIRED','PERMISSION_DENIED','STEP_LIMIT_REACHED','UNTRUSTED_INSTRUCTION']){
    const p=pair({controls:{scenarioId}}),r=p.A.run;
    for(const [id,type] of [['steps','step.started'],['toolCalls','tool.call'],['failures','tool.error'],['retries','tool.retry'],['requests','permission.requested'],['approvals','permission.approved'],['denials','permission.denied']])
      assert.equal(p.comparison.metrics.find(m=>m.metricId===id).A.value,r.events.filter(e=>e.type===type).length,id);
    const byType=p.comparison.metrics.find(m=>m.metricId==='toolTypes').A.value;
    for(const toolId of ['announcement_search','document_reader'])assert.equal(byType[toolId]||0,r.events.filter(e=>e.type==='tool.call'&&e.toolId===toolId).length);
    assert.ok(r.result.terminationReason);assert.ok(p.comparison.metrics.every(m=>m.definition&&m.algorithm&&m.A.eventIds.every(id=>r.events.some(e=>e.eventId===id))));
  }
});
test('M23 A13 cancellation and one side not run remain observable partial results',()=>{
  const rt=createRuntime(cfg());rt.step();rt.cancel();const r=rt.getRun();
  const c=metrics.compareRuns(r,null);assert.equal(c.metrics.find(m=>m.metricId==='status').A.value,'cancelled');
  assert.equal(c.metrics.find(m=>m.metricId==='steps').A.value,1);
  assert.equal(reportApi.runtimeReport(r).report.status,'blocked');
});
test('M23 A19/A20/A27/A28 report adapter reuses actual visible evidence and validates citations',()=>{
  const p=pair(),projection=reportApi.runtimeReport(p.A.run);
  assert.ok(projection.report.citations.length);
  for(const c of projection.report.citations){const resolved=reportApi.resolveCitation(p.A.run,projection.report,c.id);assert.equal(resolved.valid,true);assert.ok(resolved.chunk.text.includes(c.excerpt));}
  const broken=structuredClone(projection.report);broken.citations[0].eventId='missing';
  assert.equal(reportApi.resolveCitation(p.A.run,broken,broken.citations[0].id).valid,false);
  const c=cfg();c.modules.find(m=>m.moduleId==='document_reader').settings.includeMetadata=false;
  const limited=pair({B:c});assert.notEqual(limited.B.report.status,'complete');
  assert.ok(limited.B.report.claims.filter(x=>x.kind==='finding').some(x=>x.status!=='supported'));
});
test('M23 A24/A25 source/action alignment retains unmatched/repeated events',()=>{
  const e=(eventId,type,action,source)=>({eventId,type,phase:'READ',stepId:eventId,status:'success',sourceIds:[source],input:{sourceId:source},output:null});
  const a={events:[e('a1','tool.call','READ','s1'),e('a2','tool.call','READ','s2')],steps:[{stepId:'a1',action:'READ'},{stepId:'a2',action:'READ'}]};
  const b={events:[e('b0','tool.call','READ','extra'),e('b1','tool.call','READ','s1'),e('b2','tool.call','READ','s2')] ,steps:[{stepId:'b0',action:'READ'},{stepId:'b1',action:'READ'},{stepId:'b2',action:'READ'}]};
  const rows=trace.alignEvents(a,b);assert.equal(rows.find(x=>x.A==='a1').B,'b1');assert.ok(rows.some(x=>x.A===null&&x.B==='b0'));
});
test('M23 A35 rerun creates new experiment/run IDs without changing original',()=>{
  const p=pair(),before=JSON.stringify(p),next=api.rerunExperiment(p);
  assert.notEqual(next.experimentId,p.experimentId);assert.notEqual(next.A.run.runId,p.A.run.runId);
  assert.equal(JSON.stringify(p),before);assert.deepEqual(semanticTrace(p.A.run),semanticTrace(next.A.run));
});
test('M23 review: full report metrics agree with observed search and downgraded evidence',()=>{
  const c=cfg();c.modules.find(m=>m.moduleId==='document_reader').settings.includeMetadata=false;
  const p=pair({B:c}),r=p.B.report;
  assert.equal(r.metrics.sourcesFound,1);
  assert.equal(r.metrics.factClaimsSupported,0);
  assert.equal(r.metrics.evidenceCoverage,0);
});
test('M23 A20 metadata revision proof and collect-only have rule-grounded report differences',()=>{
  const a=cfg(),b=cfg();
  for(const c of [a,b]){c.modules.find(m=>m.moduleId==='context').settings.sourceIds=['NTC-1006','NTC-1007'];c.modules.find(m=>m.moduleId==='context').settings.budget=2200;}
  b.modules.find(m=>m.moduleId==='model').settings.preset='careful';
  const p=pair({A:a,B:b});
  assert.ok(p.B.run.events.some(e=>e.type==='evidence.claims_extracted'&&e.output.resolutions.some(r=>r.status==='revision_confirmed')));
  assert.equal(p.comparison.metrics.find(m=>m.metricId==='resolved').A.value,0);
  assert.ok(p.comparison.metrics.find(m=>m.metricId==='resolved').B.value>0);
  assert.equal(p.B.run.result.evidenceStatus,'sufficient');
  assert.ok(p.B.report.claims.some(c=>c.text.includes('20 日')&&c.citationIds.length));
  assert.ok(p.A.report.claims.some(c=>c.status==='unresolved'));
});
test('M23 regression: old m22.1 records retain their original confirmation classification on restore',()=>{
  const c=cfg();c.modules.find(m=>m.moduleId==='context').settings.sourceIds=['NTC-1006','NTC-1007'];c.modules.find(m=>m.moduleId==='context').settings.budget=2200;c.modules.find(m=>m.moduleId==='model').settings.preset='careful';
  const rt=createRuntime(c,{engineVersion:'m22.1'});for(let n=0;n<100&&!['completed','failed'].includes(rt.getRun().status);n++)rt.step();
  const r=rt.getRun();assert.equal(r.engineVersion,'m22.1');assert.equal(r.result.evidenceStatus,'conflicting');assert.deepEqual(restoreRuntime(r,{pauseRunning:false}).getRun(),r);
});
test('M23 copied configuration identities do not manufacture semantic trace differences',()=>{
  const a=cfg(),p=pair({A:a,B:cloneConfiguration(a)});
  assert.ok(p.comparison.metrics.every(m=>m.status==='equal'));
  assert.ok(p.alignment.every(row=>row.status==='equal'));
});
