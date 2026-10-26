/** M2.2 browser acceptance: isolated profile, local static files only. */
import { spawn } from 'node:child_process';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { CDP,waitReady } from './m14-acceptance.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const out='verify/m22';await mkdir(out,{recursive:true});
const rows=[],network=[];const port=9356;
const proc=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${path.join(os.tmpdir(),`az0-m22-${Date.now()}`)}`,'--no-first-run','--no-default-browser-check','--disable-extensions','--hide-scrollbars','--mute-audio','--allow-file-access-from-files','--enable-unsafe-swiftshader','--use-angle=swiftshader','--window-size=1440,900','--force-device-scale-factor=1','about:blank'],{stdio:'ignore'});
let cdp,server;
try {
  let target;for(let i=0;i<50&&!target;i++){await sleep(200);try{target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page');}catch{}}
  if(!target)throw Error('Chrome 调试端口未就绪');
  const socket=await new Promise((resolve,reject)=>{const ws=new WebSocket(target.webSocketDebuggerUrl);ws.addEventListener('open',()=>resolve(ws),{once:true});ws.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Network.requestWillBeSent')network.push(m.params.request.url);});
  cdp=new CDP(socket);await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  const ev=code=>cdp.eval(`(async()=>{${code}})()`,true);
  const check=async(id,name,code)=>{try{const r=await ev(code);rows.push({id,name,pass:r===true||r?.pass===true,note:r?.note||JSON.stringify(r)});}catch(error){rows.push({id,name,pass:false,note:error.message});}const row=rows.at(-1);console.log(`${row.pass?'PASS':'FAIL'} ${id} ${name} ${row.note}`);};
  const shot=async name=>{await sleep(200);await cdp.shot(`${out}/${name}.png`);};
  const key=async key=>{for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key,code:key,windowsVirtualKeyCode:key==='Enter'?13:9,...(key==='Enter'&&type==='keyDown'?{text:'\r'}:{})});};
  await cdp.send('Page.navigate',{url:'file:///'+path.join(process.cwd(),'index.html').replace(/\\/g,'/')});
  if(!await waitReady(cdp))throw Error('应用启动失败');
  await ev(`__AZ.skipIntro('M22');__AZ.goHub();__AZ.configurationActions.useExample('starter',true);__AZ.configureModule('document_reader',{readMode:'full_text'});globalThis.originalCore=__AZ.scene.core;__AZ.showPreflight();`);
  await check('A02-A06','预检进入真实 Runtime，统一配置与本地标记',`document.querySelector('[data-preflight-run]').click();return {pass:!!__AZ.runtimeApi()&&document.querySelector('.runtime-workspace').textContent.includes('本地模拟')&&__AZ.runtimeApi().currentRun().configId===__AZ.agentConfiguration().configId};`);
  await shot('runtime-ready');
  await check('A10','真实单步按钮仅推进一个动作',`document.querySelector('[data-rt-act="step"]').click();return {pass:__AZ.runtimeApi().currentRun().summary.steps===1&&__AZ.runtimeApi().currentRun().status==='paused'};`);
  await check('A11','连续继续可暂停，轨迹和计数保留',`document.querySelector('[data-rt-act="resume"]').click();await new Promise(r=>setTimeout(r,950));document.querySelector('[data-rt-act="pause"]').click();const a=__AZ.runtimeApi().currentRun();await new Promise(r=>setTimeout(r,900));const b=__AZ.runtimeApi().currentRun();return {pass:a.status==='paused'&&a.summary.steps===b.summary.steps&&a.summary.steps>=2};`);
  await check('A12-A13','取消后无后续动作，相同快照重跑保留原记录',`const id=__AZ.runtimeApi().currentRun().runId;document.querySelector('[data-rt-act="cancel"]').click();const r=__AZ.runtimeApi().currentRun();document.querySelector('[data-rt-act="restart"]').click();return {pass:r.status==='cancelled'&&r.events.at(-1).type==='run.cancelled'&&__AZ.runtimeApi().currentRun().runId!==id&&JSON.parse(localStorage.getItem('agent-zero:runtime:v1')).runs.some(r=>r.runId===id)};`);
  await check('A03','现场编辑配置不会改当前快照',`globalThis.savedSnapshot=JSON.stringify(__AZ.runtimeApi().currentRun().configSnapshot);__AZ.configureModule('model',{preset:'concise'});return {pass:JSON.stringify(__AZ.runtimeApi().currentRun().configSnapshot)===savedSnapshot};`);
  await check('A14','九种场景可选择且触发对应实际轨迹',`const select=document.querySelector('[aria-label="本地模拟场景"]');const ids=[...select.options].map(o=>o.value);const results=[];for(const id of ids){select.value=id;document.querySelector('[data-rt-act="new"]').click();let n=0;while(!['completed','failed'].includes(__AZ.runtimeApi().currentRun().status)&&n++<120){const c=__AZ.runtimeApi().controller();if(c.getRun().status==='waiting_approval')c.approve();else c.step();}const r=__AZ.runtimeApi().currentRun();results.push({id,status:r.status,steps:r.summary.steps,requests:r.summary.requests,errors:r.summary.toolErrors});}return {pass:ids.length===9&&results.every(r=>['completed','failed'].includes(r.status)),note:JSON.stringify(results)};`);
  await check('A22-A27','审批面板说明范围并停止工具派发',`document.querySelector('[aria-label="本地模拟场景"]').value='PERMISSION_REQUIRED';document.querySelector('[data-rt-act="new"]').click();for(let n=0;n<8&&__AZ.runtimeApi().currentRun().status!=='waiting_approval';n++)document.querySelector('[data-rt-act="step"]').click();return {pass:__AZ.runtimeApi().currentRun().summary.toolCalls===0&&!!document.querySelector('[aria-label="模拟权限审批"]')&&document.querySelector('[aria-label="模拟权限审批"]').textContent.includes('不授予浏览器或系统权限')&&document.querySelector('[data-rt-act="step"]').disabled};`);
  await shot('runtime-approval');
  await check('A23','真实拒绝按钮阻止工具且无重试',`document.querySelector('[data-rt-act="reject"]').click();const r=__AZ.runtimeApi().currentRun();return {pass:r.status==='failed'&&r.summary.denials===1&&r.summary.toolCalls===0&&r.summary.retries===0};`);
  await check('A22-approved','批准按钮只执行当前动作，不重复批准',`document.querySelector('[data-rt-act="restart"]').click();while(__AZ.runtimeApi().currentRun().status!=='waiting_approval')document.querySelector('[data-rt-act="step"]').click();document.querySelector('[data-rt-act="approve"]').click();const r=__AZ.runtimeApi().currentRun();return {pass:r.status==='paused'&&r.summary.toolCalls===1&&r.summary.approvals===1&&!document.querySelector('[data-rt-act="approve"]')};`);
  await check('A25-A28','三角色完成、选择步骤与事件、摘要有真实数值',`document.querySelector('[aria-label="本地模拟场景"]').value='NORMAL_PATH';document.querySelector('[aria-label="角色协作模式"]').value='sequential';document.querySelector('[data-rt-act="new"]').click();while(!['completed','failed'].includes(__AZ.runtimeApi().currentRun().status))document.querySelector('[data-rt-act="step"]').click();const r=__AZ.runtimeApi().currentRun();document.querySelector('[data-rt-step="s4"]').click();document.querySelector('[data-rt-event]')?.click();return {pass:r.status==='completed'&&r.events.filter(e=>e.type==='role.handoff').length===2&&!!document.querySelector('[aria-label="运行摘要"]')&&document.querySelector('[aria-label="步骤检查器"]').textContent.includes('输入'),note:JSON.stringify(r.summary)};`);
  await shot('runtime-roles');
  await check('A33','知识链接使用统一概念页且可返回同一运行',`const id=__AZ.runtimeApi().currentRun().runId;const concept=document.querySelector('[data-rt-concept]').dataset.rtConcept;document.querySelector('[data-rt-concept]').click();const correct=__AZ.knowledgeApi()?.currentConcept()===concept;document.querySelector('[data-act="return"]').click();return {pass:correct&&__AZ.runtimeApi().currentRun().runId===id};`);
  await check('A30-A31','删除单条运行保留其他命名空间，实际确认弹层',`const keys=['agent-zero:constructor:v2','agent-zero:learning:v2','agent-zero:journal:v1','agent-zero:research:v2'];const before=keys.map(k=>localStorage.getItem(k));const runs=JSON.parse(localStorage.getItem('agent-zero:runtime:v1')).runs;document.querySelector('[data-rt-delete]').click();const confirm=document.querySelector('.confirm[data-open="true"]');confirm.querySelector('.btn--primary').click();return {pass:JSON.parse(localStorage.getItem('agent-zero:runtime:v1')).runs.length===runs.length-1&&keys.every((k,i)=>localStorage.getItem(k)===before[i])};`);
  await check('A11-refresh-setup','刷新前保存运行中轨迹',`document.querySelector('[data-rt-act="new"]').click();document.querySelector('[data-rt-act="run"]').click();await new Promise(r=>setTimeout(r,1000));globalThis.beforeRefreshRun=__AZ.runtimeApi().currentRun();return {pass:beforeRefreshRun.status==='running'&&beforeRefreshRun.summary.steps>0};`);
  await cdp.send('Page.reload',{ignoreCache:false});await waitReady(cdp);
  await check('A11-refresh','刷新恢复暂停，等待后不偷偷运行',`const a=__AZ.runtimeApi().currentRun();await new Promise(r=>setTimeout(r,1000));const b=__AZ.runtimeApi().currentRun();return {pass:a.status==='paused'&&a.summary.steps===b.summary.steps&&a.summary.steps>0};`);
  await check('A32-setup','构造独立坏记录保留其他运行',`const e=JSON.parse(localStorage.getItem('agent-zero:runtime:v1'));e.runs.push({runId:'bad',schemaVersion:3,summary:{steps:999}});localStorage.setItem('agent-zero:runtime:v1',JSON.stringify(e));__AZ.openRuntime();return {pass:document.querySelector('[data-rt-corrupt]')!==null};`);
  await check('A32','坏记录显式删除，正常记录保留',`const before=JSON.parse(localStorage.getItem('agent-zero:runtime:v1')).runs.length;document.querySelector('[data-rt-corrupt]').click();document.querySelector('.confirm[data-open="true"] .btn--primary').click();return {pass:JSON.parse(localStorage.getItem('agent-zero:runtime:v1')).runs.length===before-1&&!document.querySelector('[data-rt-corrupt]')};`);
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  for(const width of [1920,1440,1280,1024,768,390]) {
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:900,deviceScaleFactor:1,mobile:false});
    await check(`A34-${width}`,'窄屏无页面溢出，关键控制可见',`const b=document.querySelector('[data-rt-act="step"]'),r=b.getBoundingClientRect();return {pass:document.documentElement.scrollWidth<=innerWidth+2&&r.width>0&&r.x>=0&&r.right<=innerWidth+1,note:JSON.stringify({width:innerWidth,scroll:document.documentElement.scrollWidth,right:r.right})};`);
  }
  await check('A34-keyboard-setup','键盘设置运行焦点',`document.querySelector('[data-rt-act="new"]').click();document.querySelector('[data-rt-act="step"]').focus();return {pass:document.activeElement.dataset.rtAct==='step'};`);await key('Enter');
  await check('A34-keyboard','Enter 触发单步，焦点保留且可见',`const b=document.activeElement;return {pass:b.dataset.rtAct==='step'&&__AZ.runtimeApi().currentRun().summary.steps===1&&getComputedStyle(b).outlineStyle!=='none'};`);
  await shot('runtime-mobile');
  await check('A34-approval-focus','窄屏审批有可见按钮，键盘可处理',`document.querySelector('[aria-label="本地模拟场景"]').value='PERMISSION_REQUIRED';document.querySelector('[aria-label="角色协作模式"]').value='single';document.querySelector('[data-rt-act="new"]').click();while(__AZ.runtimeApi().currentRun().status!=='waiting_approval')document.querySelector('[data-rt-act="step"]').click();const b=document.querySelector('[data-rt-act="approve"]');b.scrollIntoView({block:'center'});b.focus();const r=b.getBoundingClientRect();return {pass:r.width>0&&r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight};`);
  await shot('runtime-mobile-approval');await key('Enter');
  await check('A34-approval-keyboard','Enter 批准单次动作后返回可操作焦点',`return {pass:__AZ.runtimeApi().currentRun().summary.approvals===1&&__AZ.runtimeApi().currentRun().summary.toolCalls===1&&document.activeElement.dataset.rtAct==='step'};`);
  await check('A10-continuous','连续运行到真实终态而非播放预制结果',`document.querySelector('[aria-label="本地模拟场景"]').value='NORMAL_PATH';document.querySelector('[data-rt-act="new"]').click();document.querySelector('[data-rt-act="run"]').click();for(let i=0;i<110&&__AZ.runtimeApi().currentRun().status==='running';i++)await new Promise(r=>setTimeout(r,100));return {pass:__AZ.runtimeApi().currentRun().status==='completed'&&__AZ.runtimeApi().currentRun().summary.toolCalls===2};`);
  await check('A10-reset','复位视图保留运行快照与轨迹',`const before=JSON.stringify(__AZ.runtimeApi().currentRun());document.querySelector('[data-rt-act="reset"]').click();return {pass:JSON.stringify(__AZ.runtimeApi().currentRun())===before};`);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await check('A37','AZ-CORE 身份与开场视觉保持',`const core=__AZ.scene.core;__AZ.goHub();__AZ.openRuntime();return {pass:__AZ.scene.core===core&&core.rings.length===3};`);
  await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:original.call(this,type,...args)};`});
  await cdp.send('Page.reload',{ignoreCache:false});await waitReady(cdp);
  await check('A35','WebGL 不可用时运行检查器和审批仍完整可用',`__AZ.skipIntro('fallback');__AZ.openRuntime();document.querySelector('[aria-label="本地模拟场景"]').value='PERMISSION_REQUIRED';document.querySelector('[data-rt-act="new"]').click();while(__AZ.runtimeApi().currentRun().status!=='waiting_approval')document.querySelector('[data-rt-act="step"]').click();return {pass:!__AZ.scene.ok&&!!document.querySelector('.ex-core__svg')&&!!document.querySelector('[data-rt-act="approve"]')&&!!document.querySelector('[aria-label="步骤检查器"]')};`);
  await shot('runtime-fallback');
  const files=new Map([['/agent-zero/',['dist/index.html','text/html']],['/agent-zero/assets/app.js',['dist/assets/app.js','text/javascript']],['/agent-zero/assets/app.css',['dist/assets/app.css','text/css']]]);
  server=createServer(async(req,res)=>{const f=files.get(req.url);if(!f){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':f[1]+'; charset=utf-8'});res.end(await readFile(f[0]));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/agent-zero/#/runtime`});await waitReady(cdp);
  await check('A39-subpath','真实静态子路径及 Runtime 深链',`return {pass:!!__AZ.runtimeApi()&&performance.getEntriesByType('resource').some(e=>e.name.includes('/agent-zero/assets/app.js'))};`);
  await check('A36','运行不产生远程业务请求',`return {pass:performance.getEntriesByType('resource').every(e=>!/^https?:/.test(e.name)||e.name.startsWith(location.origin))};`);
  rows.push({id:'A36-network',name:'完整验收无远程请求',pass:network.every(url=>!/^https?:/.test(url)||/^http:\/\/127\.0\.0\.1/.test(url)),note:JSON.stringify([...new Set(network)])});
}catch(error){rows.push({id:'HARNESS',name:'浏览器验收',pass:false,note:error.stack});console.error(error);}
finally {
  const report={stage:'M2.2',generatedAt:new Date().toISOString(),total:rows.length,passed:rows.filter(r=>r.pass).length,results:rows,console:cdp?.console||[],network:[...new Set(network)]};
  await writeFile(`${out}/browser-report.json`,JSON.stringify(report,null,2));
  server?.close();try{await cdp?.send('Browser.close');}catch{}proc.kill();
}
console.log(`${rows.filter(r=>r.pass).length}/${rows.length} passed`);if(rows.some(r=>!r.pass))process.exitCode=1;
