import test from 'node:test';
import assert from 'node:assert/strict';
import { createExample, prepareSimulationInput } from '../src/features/constructor/model/configuration.js';
import { createRuntime, semanticTrace, summarizeRuntime } from '../src/simulation/engine/runtime.js';
import { RUNTIME_SCENARIOS } from '../src/simulation/engine/runtimeScenarios.js';
import { runtimePermission } from '../src/simulation/engine/runtimeRules.js';

export function config(mode='agent-loop') {
  const c=createExample('starter'); c.settings.executionMode=mode;
  c.modules.find(m=>m.moduleId==='document_reader').settings.readMode='full_text';
  return c;
}
export function finish(rt,decision=true) {
  for(let n=0;n<150;n++) {
    const r=rt.getRun();
    if(['completed','failed','cancelled','idle'].includes(r.status))return r;
    if(r.status==='waiting_approval')decision?rt.approve():rt.reject();
    else rt.step();
  }
  throw Error('Runtime failed to terminate');
}
test('A02/A03 runtime full v2 snapshot is immutable and preflight gates malformed containers',()=>{
  const c=config();const rt=createRuntime(c);c.modules[0].settings.preset='concise';
  assert.equal(rt.getRun().configSnapshot.modules[0].settings.preset,'balanced');
  assert.throws(()=>{rt.getRun().configSnapshot.settings.maxSteps=100;});
  for(const field of ['connections','modules','settings']) {
    const bad=config();bad[field]={};assert.equal(prepareSimulationInput(bad).ready,false,field);
    assert.equal(createRuntime(bad).step(),false);
  }
});
test('A04/A06 state machine blocks invalid transitions and terminal mutations',()=>{
  const rt=createRuntime(config());assert.equal(rt.getRun().status,'ready');
  assert.equal(rt.resume(),false);assert.equal(rt.approve(),false);assert.equal(rt.pause(),false);
  assert.equal(rt.start(),true);assert.equal(rt.start(),false);assert.equal(rt.pause(),true);
  assert.equal(rt.getRun().status,'paused');assert.equal(rt.resume(),true);
  const r=finish(rt);assert.equal(r.status,'completed');
  assert.equal(rt.step(),false);assert.equal(rt.cancel(),false);assert.deepEqual(rt.getRun(),r);
  const bad=config();bad.settings.maxSteps=0;assert.equal(createRuntime(bad).getRun().status,'idle');
});
test('A05/A10/A11/A28/A29 Step and Run share rules; controls preserve counts and deterministic semantic trace',()=>{
  const c=config();const a=createRuntime(c,{seed:'repeat'}),b=createRuntime(c,{seed:'repeat'});
  a.step();assert.equal(a.getRun().summary.steps,1);assert.equal(a.getRun().status,'paused');
  const count=a.getRun().events.length;a.resume();a.pause();assert.ok(a.getRun().events.length>=count);
  const ra=finish(a);b.start();const rb=finish(b);
  assert.deepEqual(semanticTrace(ra),semanticTrace(rb));
  assert.deepEqual(ra.summary,summarizeRuntime(ra.events));
  assert.equal(new Set(ra.events.map(e=>e.eventId)).size,ra.events.length);
  ra.events.forEach((e,i)=>{assert.equal(e.sequence,i);for(const k of ['timestamp','inputSummary','outputSummary','reason','status','sourceIds'])assert.ok(k in e,k);});
});
test('A07/A08/A09 workflow never adds adaptive research; Agent Loop recovers missing evidence by new search',()=>{
  const a=finish(createRuntime(config('workflow'),{scenarioId:'MISSING_EVIDENCE'}));
  const b=finish(createRuntime(config(),{scenarioId:'MISSING_EVIDENCE'}));
  assert.equal(a.result.evidenceStatus,'insufficient');
  assert.ok(b.events.some(e=>e.branchId==='additional-research'));
  assert.notDeepEqual(a.steps.map(s=>s.action),b.steps.map(s=>s.action));
});
test('A12/A13 cancellation stops all later work; restart creates new id and retains old snapshot',()=>{
  const rt=createRuntime(config());rt.step();rt.cancel('用户取消教学运行');const before=rt.getRun();
  assert.equal(before.status,'cancelled');assert.ok(before.events.some(e=>e.type==='run.cancelled'));
  assert.equal(rt.step(),false);assert.deepEqual(rt.getRun(),before);
  const fresh=rt.restart();assert.notEqual(fresh.getRun().runId,before.runId);
  assert.deepEqual(fresh.getRun().configSnapshot,before.configSnapshot);
});
test('A14/A15 nine explicit scenarios terminate deterministically, distinguish alternatives from executed',()=>{
  assert.equal(RUNTIME_SCENARIOS.length,9);
  for(const s of RUNTIME_SCENARIOS) {
    const c=config();const a=finish(createRuntime(c,{scenarioId:s.id,seed:'fixed'}));
    const b=finish(createRuntime(c,{scenarioId:s.id,seed:'fixed'}));
    assert.deepEqual(semanticTrace(a),semanticTrace(b),s.id);
    assert.ok(a.events.every(e=>typeof e.reason==='string'),s.id);
    assert.ok(a.steps.every(s=>s.alternatives.every(a=>a.executed===false)),s.id);
    assert.ok(['completed','failed'].includes(a.status),s.id);
  }
});
test('A16/A17 recoverable tool failures honor retries including zero; persistent errors cannot look successful',()=>{
  for(const maxRetries of [0,1,3]) {
    const c=config();c.settings.maxRetries=maxRetries;
    const once=finish(createRuntime(c,{scenarioId:'TOOL_FAILURE_ONCE'}));
    assert.equal(once.summary.retries,maxRetries===0?0:1);
    assert.equal(once.summary.toolErrors,1);
    const fail=finish(createRuntime(c,{scenarioId:'TOOL_FAILURE_EXHAUSTED'}));
    assert.equal(fail.summary.retries,maxRetries);assert.equal(fail.summary.toolCalls,maxRetries+1);
    assert.equal(fail.status,'failed');assert.equal(fail.result.evidenceStatus,'insufficient');
  }
});
test('A18 every action including role handoffs consumes same maxSteps, no hidden synthesis',()=>{
  for(const maxSteps of [1,3,6]) {
    const c=config();c.settings.maxSteps=maxSteps;
    const r=finish(createRuntime(c,{scenarioId:'STEP_LIMIT_REACHED',collaboration:'sequential'}));
    assert.equal(r.summary.steps,maxSteps);assert.equal(r.status,'failed');
    assert.equal(r.result.terminationReason,'max_steps');assert.ok(!r.events.some(e=>e.type==='report.generated'));
  }
});
test('A19/A20 no reader/full metadata/related sources means no fabricated supported evidence',()=>{
  for(const variant of ['reader-disabled','summary','metadata','no-search']) {
    const c=config();const reader=c.modules.find(m=>m.moduleId==='document_reader');
    if(variant==='reader-disabled')reader.enabled=false;
    if(variant==='summary')reader.settings.readMode='summary';
    if(variant==='metadata')reader.settings.includeMetadata=false;
    if(variant==='no-search')c.modules.find(m=>m.moduleId==='announcement_search').enabled=false;
    const r=finish(createRuntime(c));assert.notEqual(r.result.evidenceStatus,'sufficient',variant);
    if(variant==='reader-disabled')assert.ok(!r.events.some(e=>e.type==='tool.result'&&e.toolId==='document_reader'));
  }
  const r=finish(createRuntime(config(),{scenarioId:'CONFLICTING_SOURCES'}));
  assert.equal(r.result.evidenceStatus,'conflicting');assert.ok(r.result.conflicts.length>0);
});
test('A21/A22/A23 approvals block execution; rejection never calls denied tool or retries it',()=>{
  for(const decision of [true,false]) {
    const rt=createRuntime(config(),{scenarioId:'PERMISSION_REQUIRED'});
    while(rt.getRun().status!=='waiting_approval')rt.step();
    const waiting=rt.getRun();assert.ok(waiting.pendingApproval.requiredPermission);
    assert.equal(rt.step(),false);assert.equal(rt.resume(),false);
    assert.ok(!waiting.events.some(e=>e.type==='tool.call'));
    decision?rt.approve():rt.reject();const r=finish(rt);
    assert.equal(r.summary.approvals,decision?1:0);assert.equal(r.summary.denials,decision?0:1);
    if(!decision) {assert.equal(r.summary.toolCalls,0);assert.equal(r.summary.retries,0);}
  }
  const denied=finish(createRuntime(config(),{scenarioId:'PERMISSION_DENIED'}));
  assert.equal(denied.summary.toolCalls,0);assert.equal(denied.summary.denials,1);
  const c=config();c.modules=c.modules.filter(m=>m.moduleId!=='guardrails');
  c.modules.find(m=>m.moduleId==='announcement_search').settings.resourceScope='private';
  assert.equal(finish(createRuntime(c)).summary.toolCalls,0);
});
test('A24 malicious local sample stays data with guardrail on and off and never changes configuration',()=>{
  for(const enabled of [true,false]) {
    const c=config();c.modules.find(m=>m.moduleId==='guardrails').settings.blockUntrustedOverrides=enabled;
    const before=JSON.stringify(c);const r=finish(createRuntime(c,{scenarioId:'UNTRUSTED_INSTRUCTION'}));
    assert.ok(r.events.some(e=>e.type==='guardrail.decision'));assert.equal(JSON.stringify(c),before);
    assert.equal(JSON.stringify(r.configSnapshot),before);assert.ok(!r.events.some(e=>e.toolId==='external/mail'));
  }
});
test('A25/A26 role handoffs carry artifacts and tool authority is intersection with configuration',()=>{
  const r=finish(createRuntime(config(),{collaboration:'sequential'}));
  assert.deepEqual(r.events.filter(e=>e.type==='role.handoff').map(e=>[e.fromRole,e.roleId]),[['researcher','verifier'],['verifier','synthesizer']]);
  assert.ok(r.events.filter(e=>e.type==='role.handoff').every(e=>e.artifactRefs.length));
  for(const key of ['researcher','verifier','synthesizer'])assert.ok(r.roleArtifacts[key]);
  assert.ok(r.events.filter(e=>e.type==='tool.call').every(e=>e.roleId==='researcher'));
  const c=config();c.modules.find(m=>m.moduleId==='document_reader').enabled=false;
  const bad=finish(createRuntime(c,{collaboration:'sequential'}));
  assert.ok(!bad.events.some(e=>e.type==='tool.result'&&e.toolId==='document_reader'));
});
test('A38 runtime snapshot and result are JSON only; secrets and unknown scenario are rejected',()=>{
  const r=finish(createRuntime(config()));assert.deepEqual(JSON.parse(JSON.stringify(r)),r);
  const c=config();c.apiKey='never-store';assert.throws(()=>createRuntime(c));
  assert.throws(()=>createRuntime(config(),{scenarioId:'random'}));
});
test('root stopWhenInsufficient actually stops synthesis after available recovery; false permits a limited report',()=>{
  const c=config();c.modules.find(m=>m.moduleId==='document_reader').settings.readMode='summary';
  const stopped=finish(createRuntime(c));assert.ok(!stopped.events.some(e=>e.type==='report.generated'));
  c.settings.stopWhenInsufficient=false;
  const continued=finish(createRuntime(c));assert.ok(continued.events.some(e=>e.type==='report.generated'));
  assert.equal(continued.result.evidenceStatus,'insufficient');
});
test('complete configuration consumption: Retrieval, MCP, context budgets, Skills and Memory affect actual artifacts',()=>{
  const c=createExample('evidence-first');
  c.modules.find(m=>m.moduleId==='retrieval').settings.questionId='maker-signup';
  c.modules.find(m=>m.moduleId==='memory').settings={mode:'session',entryIds:['output-evidence-first']};
  c.modules.find(m=>m.moduleId==='context').settings.budget=1200;
  c.modules.find(m=>m.moduleId==='announcement_search').settings.connectionMode='mcp';
  const r=finish(createRuntime(c));assert.ok(r.steps.some(s=>s.action==='RETRIEVE'));
  const intake=r.steps.find(s=>s.action==='TASK_INTAKE').output;
  assert.deepEqual(intake.memory,['output-evidence-first']);
  assert.equal(r.steps.find(s=>s.action==='PLAN').output.method.toolsUnchanged,true);
  assert.ok(r.events.some(e=>e.type==='permission.check'&&e.reason.includes('mcp')));
  const small=config();small.modules.find(m=>m.moduleId==='context').settings.mode='task-only';
  assert.equal(finish(createRuntime(small)).result.evidenceStatus,'insufficient');
  const budget=config();budget.modules.find(m=>m.moduleId==='model').settings.contextBudget=128;
  budget.modules.find(m=>m.moduleId==='context').settings.budget=128;
  const limited=finish(createRuntime(budget));assert.equal(limited.result.evidenceStatus,'insufficient');
});
test('private access requires configured policy AND separate approval; verifier cannot execute researcher tools',()=>{
  const c=config();c.modules.find(m=>m.moduleId==='guardrails').settings.allowPrivateRecords=true;
  c.modules.find(m=>m.moduleId==='announcement_search').settings.resourceScope='private';
  const r=finish(createRuntime(c));assert.equal(r.summary.requests,1);assert.equal(r.summary.approvals,1);
  assert.equal(runtimePermission(c,'announcement_search',{role:'verifier',collaboration:'sequential'}).code,'ROLE_FORBIDDEN');
  assert.equal(runtimePermission(c,'made-up').decision,'deny');
});
test('sequential conflicting evidence is handed off, never escalates Verifier to unauthorized tool user',()=>{
  const r=finish(createRuntime(config(),{scenarioId:'CONFLICTING_SOURCES',collaboration:'sequential'}));
  assert.equal(r.status,'completed');assert.equal(r.result.evidenceStatus,'conflicting');
  assert.deepEqual(r.events.filter(e=>e.type==='role.handoff').map(e=>e.roleId),['verifier','synthesizer']);
});
test('Retrieval cannot expose complete chunk corpus or closed metadata, and obeys context budget',()=>{
  const c=createExample('evidence-first');c.modules.find(m=>m.moduleId==='retrieval').settings.includeMetadata=false;
  c.modules.find(m=>m.moduleId==='context').settings.budget=128;
  const rt=createRuntime(c);rt.step();rt.step();const remaining=rt.getRun().steps[0].output.remaining;rt.step();
  const payload=rt.getRun().steps.at(-1).output;
  assert.ok(!payload.chunking.chunks);assert.ok(!JSON.stringify(payload).includes('publishedAt'));
  assert.ok(!JSON.stringify(payload).includes('publisher'));
  assert.ok(payload.contextFragments.reduce((n,f)=>n+f.text.length,0)<=remaining);
});
test('Retrieval obeys Guardrails before even looking at the local corpus',()=>{
  const c=createExample('evidence-first');c.modules.filter(m=>m.moduleType==='tools').forEach(m=>m.enabled=false);
  c.modules.find(m=>m.moduleId==='guardrails').settings.allowPublicRead=false;
  const rt=createRuntime(c);rt.step();rt.step();rt.step();const r=rt.getRun();
  assert.equal(r.status,'failed');assert.equal(r.summary.denials,1);
  assert.ok(!JSON.stringify(r.steps.at(-1).output).includes('NTC-1001'));
  assert.ok(r.events.some(e=>e.type==='permission.check'&&e.toolId==='retrieval'));
});
test('recorded step outputs and event prefixes remain immutable as later context consumes budget',()=>{
  const rt=createRuntime(config());rt.step();const first=rt.getRun();const events=JSON.stringify(first.events),output=JSON.stringify(first.steps[0].output);
  const done=finish(rt);assert.equal(JSON.stringify(done.events.slice(0,first.events.length)),events);
  assert.equal(JSON.stringify(done.steps[0].output),output);
});
test('controls reject non-text cancel reasons without putting functions or DOM-like objects into a record',()=>{
  const rt=createRuntime(config());rt.step();assert.equal(rt.cancel({script:()=>{}}),false);
  assert.equal(rt.getRun().status,'paused');assert.equal(rt.cancel('x'.repeat(300)),false);
});
test('configured output format and answer style select real local presentation structures',()=>{
  const c=config();const model=c.modules.find(m=>m.moduleId==='model'),ins=c.modules.find(m=>m.moduleId==='instructions');
  const table=finish(createRuntime(c)).result;assert.equal(table.presentation.kind,'evidence-table');
  model.settings.answerStyle='explanatory';ins.settings.outputFormat='outline';
  const outline=finish(createRuntime(c)).result;assert.equal(outline.presentation.kind,'outline');
  assert.ok(outline.conclusion.length>table.conclusion.length);
  ins.settings.outputFormat='brief';assert.equal(finish(createRuntime(c)).result.presentation.kind,'brief');
});
