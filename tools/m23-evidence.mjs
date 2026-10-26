/** Execute final CLI checks and assemble an evidence-indexed A01–A40 matrix. */
import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out='verify/m23';await mkdir(out,{recursive:true});
const cli=[];
for(const [name,args] of [['tests',['--test','--test-reporter=spec','tests/**/*.test.mjs']],['typecheck',['node_modules/typescript/bin/tsc','-p','tsconfig.runtime.json']],['check',['tools/check.mjs']],['build',['tools/build.mjs']]]){
  const result=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:8*1024*1024});
  const text=(result.stdout||'')+(result.stderr||'');await writeFile(`${out}/${name}.txt`,text);
  cli.push({name,command:`node ${args.join(' ')}`,exitCode:result.status,pass:result.status===0,evidence:`${out}/${name}.txt`});
  console.log(`${result.status===0?'PASS':'FAIL'} ${name} exit=${result.status}`);
}
const read=async name=>JSON.parse(await readFile(name,'utf8'));
const original=await read('verify/m23-regression-report.json'),recheck=await read('verify/m23-m14-recheck.json');
const replacement=new Map(recheck.results.map(x=>[x.id,x]));
const regression=original.results.map(x=>replacement.get(x.id)||x);
const m22=await read('verify/m22/browser-report.json');
const browser=await read(`${out}/results.json`);
const combined={original:'verify/m23-regression-report.json',correctedRecheck:'verify/m23-m14-recheck.json',results:regression,passed:regression.filter(x=>x.pass).length,total:regression.length,m22:{source:'verify/m22/browser-report.json',passed:m22.passed,total:m22.total}};
await writeFile(`${out}/regression-final.json`,JSON.stringify(combined,null,2));
const sourceMap={
  A01:['docs/M2.3_PLAN.md','仓库审计与398项基线'],A02:['tests/m23-comparison.test.mjs','同一 createRuntime 与独立 Run'],A03:['src/features/comparison/model/experiment.js','M2.1 serializeAgentConfiguration / preflight'],
  A04:['tools/m23-acceptance.mjs:A04','选择、确认编辑、取消编辑、回流'],A05:['tests/m23-comparison.test.mjs','配置字段差异与复制ID去噪'],A06:['tests/m23-comparison.test.mjs','独立预检与失败侧'],
  A07:['tools/m23-acceptance.mjs:A07','共同条件与真实配对'],A08:['tests/m23-comparison.test.mjs','approve-all/reject-all 独立输入'],A09:['tests/m23-comparison.test.mjs','冻结与历史隔离'],
  A10:['tests/m23-comparison.test.mjs','不同 Run / Event ID'],A11:['tests/m23-comparison.test.mjs','semanticTrace 与相同复制配置'],A12:['tests/m23-comparison.test.mjs','数据版本/seed不一致与重跑拒绝'],
  A13:['tests/m23-comparison.test.mjs','九场景及取消终态'],A14:['tests/m23-comparison.test.mjs','未运行 null/N/A'],A15:['tests/m23-comparison.test.mjs','step.started 实数'],A16:['tests/m23-comparison.test.mjs','tool.call 总数和每工具分组'],
  A17:['tests/m23-comparison.test.mjs','tool.error/retry 与终止'],A18:['tests/m23-comparison.test.mjs','permission 请求/批准/拒绝'],A19:['tests/m23-comparison.test.mjs','发现分母、支持状态、有效引用及报告缓存一致'],A20:['tests/m23-comparison.test.mjs','COLLECT_ONLY / revision_confirmed / 无法消解冲突'],
  A21:['src/features/comparison/model/metrics.js','17项教学观察指标，无伪费用或准确率'],A22:['tools/m23-acceptance.mjs:A22','定义和事件定位'],A23:['tools/m23-acceptance.mjs:A24','双栏真实事件列表'],A24:['tools/m23-acceptance.mjs:A24','增缺事件和分支'],A25:['tests/m23-comparison.test.mjs','动作/类型/工具/角色/来源LCS'],
  A26:['tools/m23-acceptance.mjs:A22','输入、输出、原因和来源'],A27:['tools/m23-acceptance.mjs:A27','双侧报告及已有完整Report阅读器'],A28:['tools/m23-acceptance.mjs:A27','真实片段到读取事件与失效引用单测'],A29:['tools/m23-acceptance.mjs:A29','不同启用状态、模块选择、3D/2D同侧快照'],
  A30:['tools/m23-acceptance.mjs:A30','回放不改结果；切换清理调度'],A31:['tools/m23-acceptance.mjs:A31','知识返回实验/侧/事件'],A32:['tools/m23-acceptance.mjs:A32','IndexedDB保存和刷新读取'],A33:['tests/m23-archive.test.mjs','重命名/复制/确认删除/损坏隔离/容量'],A34:['tests/m23-archive.test.mjs','独立档案嵌入Run，不清其他命名空间'],
  A35:['tools/m23-acceptance.mjs:A35','原条件新Run和历史REBUILD'],A36:['verify/m23/downloads/','真实下载Markdown，包含来源和事件'],A37:['tools/m23-acceptance.mjs:A37','390宽/键盘/减少动态/WebGL禁用'],A38:['verify/m23/acceptance.json','静态子路径实际网络清单'],A39:['verify/m23/cli.json','测试、类型、语法和生产构建'],A40:['verify/m23/regression-final.json','M0–M2.2回归，保留初轮失败及修复复跑记录'],
};
const testPass=cli.every(x=>x.pass),browserPass=browser.every(x=>x.pass),regressionPass=regression.every(x=>x.pass)&&m22.results.every(x=>x.pass);
const spec=await readFile('docs/M2.3_TASK.md','utf8');
const matrix=[...spec.matchAll(/^\| (A\d{2}) \| ([^|]+) \| ([^|]+) \|$/gm)].map(([,id,name,criterion])=>{
  const relevant=sourceMap[id][0].startsWith('tools/m23-acceptance')?browser.filter(x=>x.id.startsWith(sourceMap[id][0].split(':')[1])):[];
  const pass=id==='A40'?regressionPass:id==='A39'?testPass:id==='A38'?browserPass:testPass&&relevant.every(x=>x.pass);
  return {id,name:name.trim(),criterion:criterion.trim(),status:pass?'PASS':'FAIL',evidence:sourceMap[id]};
});
const hashes={};for(const file of ['dist/assets/app.js','dist/assets/app.css','dist/index.html','index.html'])hashes[file]=createHash('sha256').update(await readFile(file)).digest('hex');
await writeFile(`${out}/cli.json`,JSON.stringify({cli,hashes},null,2));
await writeFile(`${out}/matrix.json`,JSON.stringify({stage:'M2.3',generatedAt:new Date().toISOString(),matrix,pass:matrix.length===40&&matrix.every(x=>x.status==='PASS')&&browserPass&&testPass&&regressionPass,browser:{passed:browser.filter(x=>x.pass).length,total:browser.length},regression:{passed:combined.passed,total:combined.total},m22:{passed:m22.passed,total:m22.total}},null,2));
console.log(`M2.3 ${matrix.filter(x=>x.status==='PASS').length}/${matrix.length}; browser ${browser.filter(x=>x.pass).length}/${browser.length}; regression ${combined.passed}/${combined.total}; M2.2 ${m22.passed}/${m22.total}`);
if(!testPass||!browserPass||!regressionPass||matrix.length!==40||matrix.some(x=>x.status!=='PASS'))process.exitCode=1;
