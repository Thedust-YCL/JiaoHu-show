/** Determinism, exact resume and append-only proof across every supported scenario/mode. */
import assert from 'node:assert/strict';
import { writeFile,mkdir } from 'node:fs/promises';
import { createExample } from '../src/features/constructor/model/configuration.js';
import { createRuntime,restoreRuntime,semanticTrace,summarizeRuntime } from '../src/simulation/engine/runtime.js';
import { RUNTIME_SCENARIOS } from '../src/simulation/engine/runtimeScenarios.js';
const results=[];let restoredStates=0;
for(const example of ['starter','evidence-first'])for(const mode of ['workflow','agent-loop'])for(const collaboration of ['single','sequential'])for(const scenario of RUNTIME_SCENARIOS) {
  const c=createExample(example);c.settings.executionMode=mode;
  const options={scenarioId:scenario.id,seed:'matrix-v1',collaboration};
  function execute() {
    const rt=createRuntime(c,options);let prefix=[];
    for(let i=0;i<150;i++) {
      const r=rt.getRun();assert.deepEqual(r.events.slice(0,prefix.length),prefix);prefix=r.events;
      assert.deepEqual(restoreRuntime(r,{pauseRunning:false}).getRun(),r);restoredStates++;
      assert.deepEqual(summarizeRuntime(r.events),r.summary);
      assert.ok(r.summary.steps<=c.settings.maxSteps);assert.ok(r.summary.retries<=c.settings.maxRetries);
      if(['completed','failed','cancelled'].includes(r.status))return r;
      assert.notEqual(r.status,'idle');r.status==='waiting_approval'?rt.approve():rt.step();
    }
    throw Error('未达到终止条件');
  }
  const a=execute(),b=execute();assert.deepEqual(semanticTrace(a),semanticTrace(b));
  results.push({example,mode,collaboration,scenarioId:scenario.id,pass:true,status:a.status,summary:a.summary,actions:a.steps.map(s=>s.action)});
}
await mkdir('verify/m22',{recursive:true});
await writeFile('verify/m22/matrix.json',JSON.stringify({passed:results.length,total:results.length,restoredStates,results},null,2));
console.log(`M2.2 matrix ${results.length}/${results.length} PASS; ${restoredStates} exact restored states; append-only and summary consistency PASS`);
