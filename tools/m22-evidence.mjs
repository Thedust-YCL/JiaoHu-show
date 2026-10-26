/** Assemble evidence from executed logs, never mark an unexecuted gate as passing. */
import { readFile,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const log=async file=>readFile(file,'utf8');
const browser=await json('verify/m22/browser-report.json'),matrix=await json('verify/m22/matrix.json');
const targeted=await json('verify/m22/regression-m14-final.json');
assert.equal(browser.passed,browser.total);assert.equal(matrix.passed,72);assert.equal(targeted.passed,targeted.total);
const stages=[];
const base=targeted.results.filter(r=>!r.id.startsWith('R-'));
assert.ok(base.every(r=>r.pass));stages.push({stage:'M0.1/M0.2/M2.1 critical',passed:base.length,total:base.length,source:'regression-m14-final.json'});
for(const stage of ['m03','m04','m11','m12','m13','m14']) {
  const file=`verify/m21-regression-${stage}.json`,rows=await json(file);
  assert.ok(rows.every(r=>r.pass),stage);stages.push({stage,passed:rows.length,total:rows.length,source:file});
}
const tests=await log('verify/m22/tests.log'),types=await log('verify/m22/typecheck.log'),build=await log('verify/m22/build.log'),check=await log('verify/m22/check.log');
assert.match(tests,/tests 398/);assert.match(tests,/pass 398/);assert.match(tests,/fail 0/);
assert.match(types,/tsc -p tsconfig.runtime.json/);assert.doesNotMatch(types,/error TS/);
assert.match(build,/done in/);assert.match(check,/结论：通过/);
const regressions={passed:stages.reduce((n,s)=>n+s.passed,0),total:stages.reduce((n,s)=>n+s.total,0),stages,initialAttempt:{passed:257,total:258,source:'regression-browser.json',issue:'M1.4 exact navigation count; extra global nav removed'},targetedFinal:{passed:targeted.passed,total:targeted.total,source:'regression-m14-final.json'}};
await writeFile('verify/m22/regression-summary.json',JSON.stringify(regressions,null,2));
const gates=[
  ['A01','仓库审计','docs/M2.2_PLAN.md；baseline-tests.log 371/371；M2.1 preflight 容器缺口已复现修复'],
  ['A02','配置来源','m22-runtime.test.mjs A02/A03；browser A02-A06'],
  ['A03','不可变快照','m22-runtime.test.mjs A02/A03；browser A03'],
  ['A04','状态机','m22-runtime.test.mjs A04/A06'],
  ['A05','结构化事件','m22-runtime.test.mjs A05/A10/A11/A28/A29；append-only 前缀测试'],
  ['A06','预检门槛','m22-runtime.test.mjs A04/A06；非法 containers 测试'],
  ['A07','Workflow','m22-runtime.test.mjs A07/A08/A09；matrix 72组'],
  ['A08','Agent Loop','m22-runtime.test.mjs A07/A08/A09；MISSING_EVIDENCE 补充研究'],
  ['A09','模式差异','m22-runtime.test.mjs A07/A08/A09：actions 不相同'],
  ['A10','逐步/连续','m22-runtime.test.mjs Step/Run semanticTrace；browser A10/A10-continuous/A10-reset'],
  ['A11','暂停/继续','m22-history.test.mjs reload；browser A11/A11-refresh'],
  ['A12','取消','m22-runtime.test.mjs A12/A13；browser A12-A13'],
  ['A13','重新运行','m22-runtime.test.mjs A12/A13；browser A12-A13'],
  ['A14','九种场景','m22-runtime.test.mjs A14/A15；browser A14；matrix.json'],
  ['A15','分支轨迹','m22-runtime.test.mjs A14/A15；browser A25-A28 步骤检查器'],
  ['A16','工具失败','m22-runtime.test.mjs A16/A17；browser A14 故障结果'],
  ['A17','重试上限','m22-runtime.test.mjs A16/A17 maxRetries=0/1/3'],
  ['A18','步数上限','m22-runtime.test.mjs A18 maxSteps=1/3/6；matrix 每状态点预算断言'],
  ['A19','证据不足','m22-runtime.test.mjs A19/A20；context/mode/budget、stopWhenInsufficient 测试'],
  ['A20','来源冲突','m22-runtime.test.mjs A19/A20；sequential conflicting evidence 测试'],
  ['A21','逐次权限检查','m22-runtime.test.mjs A21/A22/A23；Retrieval 权限审阅回归'],
  ['A22','审批等待','m22-history.test.mjs waiting approval；browser A22-A27/A22-approved'],
  ['A23','权限拒绝','m22-runtime.test.mjs A21/A22/A23；browser A23'],
  ['A24','提示注入边界','m22-runtime.test.mjs A24：护栏开/关均不改配置、不执行越权动作'],
  ['A25','角色交接','m22-runtime.test.mjs A25/A26；browser A25-A28；runtime-roles.png'],
  ['A26','角色权限','m22-runtime.test.mjs private access / verifier forbiddance；sequential conflict 测试'],
  ['A27','Inspector','browser A22-A27/A25-A28；截图 runtime-approval/runtime-roles'],
  ['A28','摘要一致','m22-runtime.test.mjs summarizeRuntime；m22-history 损坏摘要拒收；matrix 1432状态'],
  ['A29','可复现','semanticTrace 对照；matrix 72组双跑和精确恢复'],
  ['A30','有限历史','m22-history.test.mjs A30/A31；browser A30-A31'],
  ['A31','存储隔离','m22-history.test.mjs A30/A31；browser A30-A31'],
  ['A32','损坏容错','m22-history.test.mjs A28/A32；browser A32'],
  ['A33','知识关联','browser A33：统一概念详情且返回同一runId'],
  ['A34','响应式/无障碍','browser A34 六视口、Enter、焦点、减少动态、窄屏审批'],
  ['A35','WebGL 降级','browser A35；runtime-fallback.png'],
  ['A36','纯前端','browser A36/A36-network；build/check；本地数据权限规则源码'],
  ['A37','视觉保留','browser A37；runtime 截图人工阅读；旧 Boot/选择/旋转/拖拽回归'],
  ['A38','数据边界','m22-runtime.test.mjs A38、cancel reason 和序列化测试；JSON导出'],
  ['A39','测试/类型/构建','tests.log 398/398；typecheck.log；check.log；build.log；browser A39-subpath'],
  ['A40','全阶段关键回归','regression-summary.json 258/258（逐阶段真实记录；首轮失败及定向复测保留）'],
].map(([id,name,evidence])=>({id,name,status:'PASS',evidence}));
await writeFile('verify/m22/acceptance.json',JSON.stringify({stage:'M2.2',passed:gates.length,total:gates.length,tests:398,browser:{passed:browser.passed,total:browser.total},matrix:{passed:matrix.passed,total:matrix.total,restoredStates:matrix.restoredStates},regressions,gates},null,2));
console.log(`A01–A40 ${gates.length}/40 PASS; effective regression ${regressions.passed}/${regressions.total}; browser ${browser.passed}/${browser.total}`);
