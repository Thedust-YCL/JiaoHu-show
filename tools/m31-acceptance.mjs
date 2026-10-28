/** M3.1 browser evidence: real Chrome, static project subpath, isolated local data. */
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { CDP, waitReady } from './m14-acceptance.mjs';

const out=path.resolve('verify/m31'), downloads=path.join(out,'downloads');
await mkdir(downloads,{recursive:true});
const rows=[],network=[],failedResources=[],port=9373,httpPort=8187;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const server=createServer(async(req,res)=>{
  try {
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(!pathname.startsWith('/agent-zero/')){res.writeHead(404).end();return;}
    const file=path.resolve('dist',pathname.slice('/agent-zero/'.length)||'index.html');
    if(!file.startsWith(path.resolve('dist')+path.sep)){res.writeHead(403).end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');
    res.end(await readFile(file));
  }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(httpPort,'127.0.0.1',r));
const proc=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[
  '--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${path.join(os.tmpdir(),`az-m31-${Date.now()}`)}`,
  '--no-first-run','--no-default-browser-check','--disable-extensions','--hide-scrollbars','--mute-audio',
  '--enable-unsafe-swiftshader','--use-angle=swiftshader','--window-size=1440,900','--force-device-scale-factor=1','about:blank'
],{stdio:'ignore'});
let cdp;
try {
  let target;for(let i=0;i<60&&!target;i++){await sleep(200);try{target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page');}catch{}}
  if(!target)throw Error('Chrome not ready');
  const ws=await new Promise((resolve,reject)=>{const s=new WebSocket(target.webSocketDebuggerUrl);s.addEventListener('open',()=>resolve(s),{once:true});s.addEventListener('error',reject,{once:true});});
  cdp=new CDP(ws);ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Network.requestWillBeSent')network.push(m.params.request.url);if(m.method==='Network.responseReceived'&&m.params.response.url.startsWith(`http://127.0.0.1:${httpPort}/agent-zero/`)&&m.params.response.status>=400)failedResources.push({url:m.params.response.url,status:m.params.response.status});});
  for(const domain of ['Page.enable','Runtime.enable','Network.enable'])await cdp.send(domain);
  await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
  const ev=code=>cdp.eval(`(async()=>{${code}})()`,true);
  const check=async(id,name,code)=>{try{const result=await ev(code);rows.push({id,name,status:result===true||result?.pass===true?'PASS':'FAIL',evidence:result});}catch(error){rows.push({id,name,status:'FAIL',evidence:error.message});}const r=rows.at(-1);console.log(`${r.status} ${id} ${name} ${JSON.stringify(r.evidence).slice(0,1200)}`);};
  const viewport=async(width,height)=>{await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await sleep(160);};
  const shot=async(name)=>{await sleep(180);await cdp.shot(path.join(out,`${name}.png`));};
  const key=async(key,code=key,virtual=key==='Enter'?13:key==='Tab'?9:key==='Escape'?27:undefined)=>{for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:virtual,...(key==='Enter'&&type==='keyDown'?{text:'\r'}:{})});};
  await viewport(1440,900);
  await cdp.send('Page.navigate',{url:`http://127.0.0.1:${httpPort}/agent-zero/?intro=always`});
  if(!await waitReady(cdp))throw Error('App not ready');
  await check('A06','开场可随时跳过，同一机械核心',`const core=__AZ.scene.core;__AZ.skipIntro('M31');return {pass:__AZ.state.phase==='hub'&&__AZ.scene.core===core&&core.rings.length===3&&__AZ.timeline.t.finished};`);
  await check('A03-logo','A/0 三个字形在同一行',`const el=document.querySelector('.brand__mark'),walk=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),boxes=[];for(let n=walk.nextNode();n;n=walk.nextNode()){if(!n.textContent.trim())continue;const r=document.createRange();r.selectNodeContents(n);boxes.push(r.getBoundingClientRect());}return {pass:boxes.every(x=>Math.abs(x.top-boxes[0].top)<2),boxes:boxes.map(x=>({top:x.top,height:x.height}))};`);
  await check('A02-contrast','辅助文本在 Raised 背景达到 4.5:1',`const css=getComputedStyle(document.documentElement),parse=h=>h.trim().slice(1).match(/../g).map(x=>parseInt(x,16)/255),l=c=>c.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0),ratio=(l(parse(css.getPropertyValue('--text-3')))+.05)/(l(parse(css.getPropertyValue('--raised')))+.05);return {pass:ratio>=4.5,ratio};`);
  await viewport(360,800);
  await check('A04-target','窄屏工具按钮触控目标至少 44px',`const b=document.querySelector('.topbar .iconbtn');return {pass:b.getBoundingClientRect().height>=44,height:b.getBoundingClientRect().height};`);
  if(process.argv.includes('--shared-red')){await shot('shared-red');}
  if(process.argv.includes('--reduced-only')){
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await cdp.send('Page.reload',{ignoreCache:false});await waitReady(cdp);
    await check('A08-diagnostic','减少动态开场终态与模拟单步',`for(let i=0;i<50&&__AZ.state.phase!=='hub';i++)await new Promise(r=>setTimeout(r,100));const before={phase:__AZ.state.phase,reduced:__AZ.state.reducedMotion,time:__AZ.timeline.t.value,duration:__AZ.timeline.duration};__AZ.configurationActions.useExample('starter',true);__AZ.openRuntime();document.querySelector('[data-rt-act="new"]').click();document.querySelector('[data-rt-act="step"]').click();return {pass:before.phase==='hub'&&before.reduced&&__AZ.runtimeApi().currentRun().summary.steps===1,before,steps:__AZ.runtimeApi().currentRun().summary.steps};`);
  }
  if(process.argv.includes('--review-only')){
    await viewport(1440,900);
    await check('review-core-reset','新运行清空上一事件的核心文字与链路',`__AZ.configurationActions.useExample('starter',true);__AZ.openRuntime();document.querySelector('[data-rt-act="step"]').click();const before=document.querySelector('.ex-core__caption').textContent;document.querySelector('[data-rt-act="new"]').click();const after=document.querySelector('.ex-core__caption').textContent;return {pass:__AZ.runtimeApi().currentRun().steps.length===0&&document.querySelector('.ex-core__caption .mono').textContent==='—'&&after.includes('就绪'),before,after};`);
    await check('A10-runtime-snapshot','主 3D 使用运行快照，真实事件与 Inspector 同步',`const api=__AZ.runtimeApi();for(let i=0;i<4;i++)document.querySelector('[data-rt-act="step"]').click();const event=api.currentRun().events.find(e=>e.type==='tool.call');api.selectStep(event.stepId);document.querySelector('[data-rt-event="'+event.sequence+'"]').click();const focus=__AZ.scene.bay.getExecutionFocus();__AZ.removeModule('document_reader');const isolated=__AZ.scene.bay.hasInstance('document_reader')&&!__AZ.agentConfiguration().modules.some(m=>m.moduleId==='document_reader')&&api.currentRun().configSnapshot.modules.some(m=>m.moduleId==='document_reader');const inspector=document.querySelector('.ex-core__caption .mono').textContent.includes(String(event.sequence).padStart(2,'0'));__AZ.goHub();for(let i=0;i<30&&__AZ.scene.bay.hasInstance('document_reader');i++)await new Promise(r=>setTimeout(r,100));const restored=!__AZ.scene.bay.hasInstance('document_reader');__AZ.configurationActions.useExample('starter',true);return {pass:focus.moduleId===event.toolId&&focus.hasInstance&&isolated&&inspector&&restored,focus,isolated,inspector,restored};`);
    await check('review-workspace-width','收起 Inspector 后工作区不保留空侧栏',`__AZ.goHub();if(__AZ.state.inspectOpen)document.querySelector('[aria-controls="az-inspector"]').click();__AZ.openRuntime();await new Promise(r=>setTimeout(r,350));const r=document.querySelector('.workspace-host').getBoundingClientRect();return {pass:r.width>innerWidth*.85,width:r.width,viewport:innerWidth};`);
    await viewport(390,844);
    await check('review-modal-setup','抽屉内键盘定位会触发确认的按钮',`__AZ.goHub();__AZ.configureModule('model',{preset:'careful'});const trigger=document.querySelector('[aria-controls="az-dock"]');trigger.click();await new Promise(r=>setTimeout(r,280));const b=document.querySelector('[data-config-act="starter"]');b.closest('details').open=true;b.focus();return {pass:document.activeElement===b&&__AZ.constructor.isDirty()};`);
    await key('Enter');
    await check('review-modal-enter','原生 Enter 打开确认并聚焦取消',`return {pass:document.querySelector('.confirm').dataset.open==='true'&&document.activeElement.textContent==='取消',open:document.querySelector('.confirm').dataset.open,focus:document.activeElement.outerHTML.slice(0,180),dirty:__AZ.constructor.isDirty()};`);
    await key('Tab');await key('Tab');
    await check('review-modal-tab','确认弹层正向 Tab 可循环回取消',`return {pass:document.activeElement.textContent==='取消',focus:document.activeElement.textContent};`);
    await key('Escape');await key('Escape');
    await viewport(1440,900);
    await check('review-old-run-setup','建立两条有区别的旧研究记录',`__AZ.configurationActions.useExample('starter',true);__AZ.configureModule('document_reader',{readMode:'full_text'});__AZ.configurationActions.save(true);__AZ.openExecution();const api=__AZ.executionApi();api.setFaultMode('normal');api.newRun();api.setFaultMode('search_timeout');api.newRun();api.selectHistory(1);const old=api.currentRun(),seq=old.events.find(e=>e.toolId)?.sequence;api.seek(seq);globalThis.m31Old={runId:old.runId,seq};document.querySelector('.ex-inspector [data-act="open-knowledge"]').click();document.querySelector('[data-act="return"]').click();return {pass:__AZ.executionApi().currentRun().runId===m31Old.runId&&__AZ.executionApi().currentIndex()===m31Old.seq,expected:m31Old,actual:{runId:__AZ.executionApi().currentRun().runId,seq:__AZ.executionApi().currentIndex()}};`);
    await check('review-report-setup','报告视图可保存实际事件上下文',`__AZ.executionApi().setRunView('report');return {pass:location.hash==='#/report'&&Number.isInteger(history.state?.azRoute?.context?.eventSequence)};`);
    await cdp.send('Page.reload',{ignoreCache:false});await waitReady(cdp);
    await check('review-report-refresh','报告刷新后地址、视图与旧 Run 一致',`return {pass:location.hash==='#/report'&&__AZ.executionApi().currentRunView()==='report',hash:location.hash,view:__AZ.executionApi().currentRunView()};`);
    for(const [width,height] of [[1366,768],[1440,900],[1024,768],[768,1024],[390,844],[360,800],[430,932]]){
      await viewport(width,height);
      await check('A23/A24/A25-header',`${width}×${height} 旧执行台标题与导航完整分行`,`const head=document.querySelector('.workspace--execution .ws-head'),title=head.querySelector('.ws-head__title').getBoundingClientRect(),nav=head.querySelector('.learning-nav').getBoundingClientRect(),bounds=head.getBoundingClientRect();return {pass:title.width>160&&nav.width>bounds.width*.85&&document.documentElement.scrollWidth<=innerWidth+1,title:{width:title.width,height:title.height},navWidth:nav.width,headWidth:bounds.width};`);
      if(width===1440||width===390)await shot(`${width}-report`);
    }
    await viewport(1440,900);
    await check('review-focus-race','返回 Hub 的延迟焦点恢复不抢走新的用户焦点',`__AZ.openAtlas();__AZ.goHub();const b=document.querySelector('[data-config-act="starter"]');b.closest('details').open=true;b.focus();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {pass:document.activeElement===b,focus:document.activeElement.getAttribute('aria-controls')||document.activeElement.textContent};`);
    await sleep(1000);await shot('01-hub-desktop');
    await check('review-ab-beforeunload','未归档的 A/B 结果离站前受保护',`__AZ.configurationActions.useExample('starter',true);__AZ.configurationActions.save(true);__AZ.openComparison();document.querySelector('[data-ab-act="run"]').click();await new Promise(r=>setTimeout(r,100));const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return {pass:event.defaultPrevented&&!__AZ.constructor.isDirty(),prevented:event.defaultPrevented,dirty:__AZ.constructor.isDirty()};`);
    await check('review-ab-archive-guard','打开档案前保护未保存结果，取消后保留',`const api=__AZ.comparisonApi();document.querySelector('[data-ab-act="save"]').click();await new Promise(r=>setTimeout(r,180));const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);const savedDoesNotBlock=!event.defaultPrevented;document.querySelector('[data-ab-act="rerun"]').click();const id=api.currentExperiment().experimentId;document.querySelector('[data-ab-act="tab-archive"]').click();await new Promise(r=>setTimeout(r,180));document.querySelector('[data-ab-act="archive-open"]').click();const box=document.querySelector('.confirm[data-open="true"]');if(!box)return {pass:false,savedDoesNotBlock};box.querySelector('.btn--ghost').click();return {pass:savedDoesNotBlock&&api.currentExperiment().experimentId===id,savedDoesNotBlock};`);
  }
  if(process.argv.includes('--states-only')){
    const html=await readFile('dist/index.html','utf8');
    rows.push({id:'A19-markup',name:'真实初始加载状态与恢复入口',status:html.includes('aria-busy="true"')&&html.includes('正在准备本地实验室')&&html.includes('location.reload()')?'PASS':'FAIL',evidence:'dist/index.html: aria-busy + status + reload action'});
    await check('A19-ready','初始化完成后移除加载内容与 busy',`return {pass:!document.querySelector('.initializing')&&!document.querySelector('#app').hasAttribute('aria-busy')};`);
    await check('A20-empty','新用户无运行/档案/日志时有真实下一步',`__AZ.openRuntime();const rt=document.querySelector('.rt-history').textContent;__AZ.openComparison();document.querySelector('[data-ab-act="tab-archive"]').click();await new Promise(r=>setTimeout(r,180));const archive=document.querySelector('.ab-main').textContent;__AZ.openJournal();const journal=document.querySelector('.journal-empty').textContent;return {pass:rt.includes('暂无运行')&&rt.includes('逐步执行')&&archive.includes('暂无实验档案')&&journal.includes('按章学习'),rt,archive,journal};`);
    await check('A35-storage-setup','准备独立浏览器的损坏配置，保留其他命名空间',`__AZ.configurationActions.useExample('starter',true);__AZ.configurationActions.save(true);globalThis.isolatedKeys=['agent-zero:learning:v2','agent-zero:journal:v1','agent-zero:runtime:v1'];sessionStorage.setItem('m31-isolation',JSON.stringify(Object.fromEntries(isolatedKeys.map(k=>[k,localStorage.getItem(k)]))));localStorage.setItem('agent-zero:constructor:v2','{M31-invalid-json');return true;`);
    await cdp.send('Page.reload',{ignoreCache:false});await waitReady(cdp);
    await check('A21/A35-storage','损坏配置有具体提示，原始数据与其他域不被清空',`__AZ.skipIntro('states');__AZ.goHub();const expected=JSON.parse(sessionStorage.getItem('m31-isolation')),text=document.querySelector('.config-recovery').textContent;return {pass:localStorage.getItem('agent-zero:constructor:v2')==='{M31-invalid-json'&&Object.entries(expected).every(([k,v])=>localStorage.getItem(k)===v)&&text.includes('保留')&&text.includes('恢复'),text};`);
    await cdp.send('Network.setBlockedURLs',{urls:['*/assets/app.js']});
    await cdp.send('Page.reload',{ignoreCache:true});await sleep(400);
    await check('A19-resource-failure','主脚本加载失败仍保留明确恢复入口',`const loader=document.querySelector('.initializing');return {pass:!!loader&&loader.textContent.includes('重新载入')&&!!loader.querySelector('button')&&document.querySelector('#app').getAttribute('aria-busy')==='true',text:loader?.textContent};`);
    await cdp.send('Network.setBlockedURLs',{urls:[]});
  }
  if(!process.argv.includes('--shared-red')&&!process.argv.includes('--states-only')&&!process.argv.includes('--review-only')&&!process.argv.includes('--reduced-only')){
    await viewport(1440,900);
    await key('Tab');
    await check('A03/A04','共享控件 variants、focus、disabled、loading 可辨',`const fixture=document.createElement('section');fixture.style.cssText='position:fixed;z-index:100;top:100px;left:100px;background:var(--panel);padding:20px';fixture.innerHTML='<button class="btn btn--primary">执行</button><button class="btn btn--secondary">次要</button><button class="btn btn--ghost">查看</button><button class="btn btn--destructive">删除</button><button class="btn" disabled>不可用</button><button class="btn" aria-busy="true">正在保存</button>';document.body.append(fixture);const buttons=[...fixture.querySelectorAll('button')],colors=buttons.slice(0,4).map(b=>getComputedStyle(b).backgroundColor);buttons[0].focus();const pass=new Set(colors).size>=3&&buttons[4].disabled&&getComputedStyle(buttons[5],'::before').content.includes('◌')&&getComputedStyle(buttons[0]).outlineStyle!=='none';fixture.remove();return {pass,colors};`);
    await check('A06-full','五镜头完整播放后稳定进入 Hub',`__AZ.replayIntro();for(let i=0;i<160&&__AZ.state.phase!=='hub';i++)await new Promise(r=>setTimeout(r,100));return {pass:__AZ.state.phase==='hub'&&__AZ.timeline.t.finished&&document.querySelector('.boot').inert};`);
    await shot('01-hub-desktop');
    await ev(`__AZ.configurationActions.useExample('starter',true);__AZ.configureModule('document_reader',{readMode:'full_text'});__AZ.configurationActions.save(true);`);
    await check('A14/A15','配置草稿导航后保留、禁用不等于移除',`__AZ.configureModule('model',{preset:'careful'});__AZ.toggleModule('document_reader',false);const before=JSON.stringify(__AZ.agentConfiguration());__AZ.openAtlas();__AZ.locateInConstructor('llm');const result={pass:before===JSON.stringify(__AZ.agentConfiguration())&&__AZ.constructorSnapshot().modules.find(m=>m.moduleId==='document_reader').status==='Disabled'&&document.querySelector('.config-manager__status').textContent.includes('未保存')};__AZ.toggleModule('document_reader',true);__AZ.configurationActions.save(true);return result;`);
    await check('A21-form','字段非法时保留原值并关联错误',`__AZ.selectModule('runtime');const input=document.querySelector('#azf-runtime-maxSteps');const old=input.value;input.value='-5';input.dispatchEvent(new Event('change',{bubbles:true}));const current=document.querySelector('#azf-runtime-maxSteps'),id=current.getAttribute('aria-describedby');return {pass:current.value===old&&current.getAttribute('aria-invalid')==='true'&&!!document.getElementById(id),message:document.getElementById(id)?.textContent};`);
    await check('A22-export-error','导出失败有实际原因和恢复路径',`const b=document.querySelector('[data-config-act="export"]'),original=URL.createObjectURL;URL.createObjectURL=()=>{throw new Error('M31 下载能力被阻止')};b.click();URL.createObjectURL=original;const text=document.querySelector('.config-manager__notes').textContent;return {pass:text.includes('无法导出')&&text.includes('M31 下载能力被阻止')&&text.includes('重试'),text};`);
    await check('A22-download','本地配置真实请求下载',`document.querySelector('[data-config-act="export"]').click();return {pass:document.querySelector('.config-manager__notes').textContent.includes('请求浏览器下载')};`);
    await check('A26/A20','Atlas 零结果与键盘列表替代',`__AZ.openAtlas();__AZ.atlasApi().search('M31没有这个概念');const empty=document.querySelector('.atlas-search__note').textContent;__AZ.atlasApi().search('MCP');const first=document.querySelector('.atlas-list [data-concept]');first.focus();return {pass:empty.includes('没有找到')&&empty.includes('清空')&&first===document.activeElement&&first.tagName==='BUTTON',empty};`);
    await shot('02-atlas-desktop');
    await check('A13-atlas','Atlas 知识往返恢复搜索、选中与缩放',`const api=__AZ.atlasApi();api.graph.zoomBy(1.25);const before={id:api.currentSelection(),transform:api.graph.getTransform(),query:document.querySelector('.atlas-search__input').value};document.querySelector('[data-act="learn"]').click();document.querySelector('[data-act="return"]').click();const after={id:__AZ.atlasApi().currentSelection(),transform:__AZ.atlasApi().graph.getTransform(),query:document.querySelector('.atlas-search__input').value};return {pass:JSON.stringify(before)===JSON.stringify(after),before,after};`);
    await check('A12-history','浏览器前进/后退恢复对应工作区',`__AZ.openStory();__AZ.openAtlas();history.back();await new Promise(r=>setTimeout(r,180));const back=__AZ.workspaceKind();history.forward();await new Promise(r=>setTimeout(r,180));return {pass:back==='story'&&__AZ.workspaceKind()==='atlas',back,forward:__AZ.workspaceKind()};`);
    await check('A16','Runtime 单步、连续、暂停、继续、取消均为真实状态',`__AZ.openRuntime();document.querySelector('[data-rt-act="new"]').click();document.querySelector('[data-rt-act="step"]').click();const rt=__AZ.runtimeApi(),one=rt.currentRun().summary.steps;document.querySelector('[data-rt-act="resume"]').click();document.querySelector('[data-rt-act="pause"]').click();const paused=rt.currentRun();await new Promise(r=>setTimeout(r,900));const stable=rt.currentRun().summary.steps===paused.summary.steps;document.querySelector('[data-rt-act="resume"]').click();const resumed=rt.currentRun().status;document.querySelector('[data-rt-act="cancel"]').click();return {pass:one===1&&paused.status==='paused'&&stable&&resumed==='running'&&rt.currentRun().status==='cancelled'&&rt.currentRun().events.at(-1).type==='run.cancelled',one,status:rt.currentRun().status};`);
    await check('A16/A31','Runtime 等待审批明确且拒绝后没有受限成功',`document.querySelector('[aria-label="本地模拟场景"]').value='PERMISSION_REQUIRED';document.querySelector('[data-rt-act="new"]').click();const api=__AZ.runtimeApi();for(let i=0;i<50&&api.currentRun().status!=='waiting_approval';i++)document.querySelector('[data-rt-act="step"]').click();const before=api.currentRun(),approval=document.querySelector('.rt-approval');if(!approval)return {pass:false,status:before.status};document.querySelector('[data-rt-act="reject"]').click();return {pass:before.status==='waiting_approval'&&approval.textContent.includes('影响范围')&&api.currentRun().summary.denials===1&&!api.currentRun().events.some(e=>e.type==='tool.result'),status:api.currentRun().status,text:approval.textContent};`);
    await shot('03-runtime-desktop');
    await check('A21/A33','证据不足与工具失败保留真实失败和原因',`const api=__AZ.runtimeApi(),results=[];for(const scenario of ['MISSING_EVIDENCE','TOOL_FAILURE_EXHAUSTED','CONFLICTING_SOURCES']){document.querySelector('[aria-label="本地模拟场景"]').value=scenario;document.querySelector('[data-rt-act="new"]').click();for(let i=0;i<80&&!['completed','failed','cancelled'].includes(api.currentRun().status);i++)document.querySelector('[data-rt-act="step"]').click();const r=api.currentRun();results.push({scenario,status:r.status,evidence:r.result?.evidenceStatus,errors:r.events.filter(e=>e.type==='tool.error').length,text:document.querySelector('.rt-summary').textContent.slice(0,260)});}return {pass:results[0].evidence==='insufficient'&&results[1].status==='failed'&&results[1].errors>0&&results[2].evidence==='conflicting'&&results.every(r=>/终止原因/.test(r.text)),results};`);
    await check('A17/A18','A/B 两侧、模拟声明与真实指标',`__AZ.openComparison();document.querySelector('[data-ab-act="run"]').click();await new Promise(r=>setTimeout(r,100));const e=__AZ.comparisonApi().currentExperiment();return {pass:!!e&&e.A.run.runId!==e.B.run.runId&&document.querySelector('.comparison-workspace').textContent.includes('SIMULATION / 本地模拟')&&document.querySelectorAll('[data-ab-config]').length===0&&e.comparison.metrics.find(x=>x.metricId==='steps').A.value===e.A.run.summary.steps,A:e?.A.run.status,B:e?.B.run.status};`);
    await check('A14-comparison','新建实验取消后保留未保存结果',`const api=__AZ.comparisonApi(),id=api.currentExperiment().experimentId;document.querySelector('[data-ab-act="new"]').click();await new Promise(r=>setTimeout(r,200));const box=document.querySelector('.confirm[data-open="true"]');if(!box)return false;box.querySelector('.btn--ghost').click();return {pass:api.currentExperiment().experimentId===id};`);
    await check('A17-selected','A/B 观察侧、Inspector 与核心快照一致',`document.querySelector('[data-ab-act="side-B"]').click();const display=__AZ.comparisonDisplay();return {pass:display?.side==='B'&&document.querySelector('.ab-inspection').textContent.includes('B')&&__AZ.comparisonApi().session.side==='B',display:display?.side};`);
    await shot('04-comparison-desktop');
    await check('A22-ab-download','A/B Markdown 实际请求下载',`document.querySelector('[data-ab-act="export"]').click();return {pass:document.querySelector('.ab-notice').textContent.includes('已生成')};`);
    await check('A20-journal','学习日志空状态提供真实下一步',`__AZ.openJournal();const empty=document.querySelector('.journal-empty');return {pass:!empty||!![...empty.querySelectorAll('button')].find(b=>b.textContent.includes('按章学习')),empty:empty?.textContent||'已有真实学习记录'};`);
    await check('A30-journal','日志确认弹窗进入焦点并返回触发按钮',`const b=document.querySelector('[data-act="clear-journal"]');b.focus();b.click();const dialog=document.querySelector('dialog[open]'),inside=dialog?.contains(document.activeElement);dialog.querySelector('button').click();return {pass:inside&&document.activeElement===b};`);
    await check('A38','六章六个 Lab 全部可访问',`const chapters=__AZ.chapters(),labs=__AZ.experiments(),results=[];for(const c of chapters){__AZ.openChapterStory(c.id);results.push({id:c.id,kind:__AZ.workspaceKind(),title:document.querySelector('.ws-head__title')?.textContent});}for(const lab of labs){await __AZ.openLabExperiment(lab.id);results.push({id:lab.id,kind:__AZ.workspaceKind(),title:document.querySelector('.ws-head__title')?.textContent});}return {pass:chapters.length===6&&labs.length===6&&results.every(r=>r.title&&r.kind&&r.kind!=='lab-loading'),results};`);
    for(const [width,height] of [[1366,768],[1440,900],[1024,768],[768,1024],[390,844],[360,800],[430,932]]){
      await viewport(width,height);
      const detail=[];
      for(const [id,action,selector] of [
        ['story','__AZ.openStory()','.story-body,.story-grid,.workspace'],
        ['atlas','__AZ.openAtlas()','.atlas-search__input'],
        ['labs','__AZ.openLab()','.workspace'],
        ['constructor',"__AZ.locateInConstructor('llm')",'.stage'],
        ['runtime','__AZ.openRuntime()','[data-rt-act="step"]'],
        ['comparison','__AZ.openComparison()','[data-ab-act="run"]'],
        ['report','__AZ.openReport()','.rp'],
        ['journal','__AZ.openJournal()','.journal-body']
      ]){
        const result=await ev(`${action};await new Promise(r=>setTimeout(r,320));const node=document.querySelector(${JSON.stringify(selector)}),box=node?.getBoundingClientRect(),main=document.querySelector('.workspace-host[data-open="true"]')||document.querySelector('.stage');return {id:${JSON.stringify(id)},pass:document.documentElement.scrollWidth<=innerWidth+1&&!!box&&box.width>0&&main.getBoundingClientRect().width>innerWidth*(${JSON.stringify(id)}==='constructor'?.3:.7),width:innerWidth,scroll:document.documentElement.scrollWidth,mainWidth:main.getBoundingClientRect().width,box:box?{left:box.left,right:box.right,width:box.width}:null};`);
        detail.push(result);
        if((width===1440||width===390)&&['story','atlas','constructor','runtime','comparison','report','journal'].includes(id))await shot(`${width}-${id}`);
      }
      rows.push({id:width>=1100?'A23':width>=768?'A24':'A25',name:`${width}×${height} 八个工作区布局`,status:detail.every(r=>r.pass)?'PASS':'FAIL',evidence:detail});
      console.log(`${detail.every(r=>r.pass)?'PASS':'FAIL'} responsive ${width} ${JSON.stringify(detail.filter(r=>!r.pass))}`);
    }
    await viewport(390,844);
    await check('A27','窄屏审批、拒绝、结果可滚动访问',`__AZ.openRuntime();document.querySelector('[aria-label="本地模拟场景"]').value='PERMISSION_REQUIRED';document.querySelector('[data-rt-act="new"]').click();const api=__AZ.runtimeApi();for(let i=0;i<60&&api.currentRun().status!=='waiting_approval';i++)document.querySelector('[data-rt-act="step"]').click();const b=document.querySelector('[data-rt-act="approve"]');if(!b)return {pass:false,status:api.currentRun().status};b.scrollIntoView({block:'center'});b.focus();const r=b.getBoundingClientRect();globalThis.approvalKeyboardReady=true;return {pass:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&r.height>=44,rect:{top:r.top,bottom:r.bottom,height:r.height}};`);
    await shot('05-mobile-approval');await key('Enter');
    await check('A29-approval','真实 Enter 批准且焦点回单步',`return {pass:__AZ.runtimeApi().currentRun().summary.approvals===1&&document.activeElement.dataset.rtAct==='step',approvals:__AZ.runtimeApi().currentRun().summary.approvals,focused:document.activeElement.outerHTML.slice(0,180)};`);
    await check('A28','窄屏指标表可横向滚动、A/B 轨迹单列',`__AZ.openComparison();document.querySelector('[data-ab-act="tab-trace"]').click();const table=document.querySelector('.ab-table-wrap');if(!table)return {pass:false};table.scrollLeft=200;const columns=document.querySelector('.ab-columns');return {pass:table.scrollWidth>table.clientWidth&&table.scrollLeft>0&&getComputedStyle(columns).gridTemplateColumns.split(' ').length===1,scroll:table.scrollLeft,columns:getComputedStyle(columns).gridTemplateColumns};`);
    await check('A29/A30','窄屏导航抽屉键盘可关闭且返回焦点',`__AZ.goHub();const b=document.querySelector('[aria-controls="az-dock"]');b.focus();b.click();globalThis.drawerTrigger=b;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {pass:document.querySelector('.dock').contains(document.activeElement)&&!document.querySelector('.dock').inert};`);
    await key('Escape');
    await check('A30-drawer','关闭后背景恢复、隐藏抽屉不可聚焦',`return {pass:document.activeElement===drawerTrigger&&document.querySelector('.dock').inert};`);
    await viewport(1440,900);
    for(const [route,kind] of [['execution','execution'],['report','execution'],['runtime','runtime'],['compare','comparison'],['atlas','atlas']]){
      await cdp.send('Page.navigate',{url:`http://127.0.0.1:${httpPort}/agent-zero/?m31=deep-${route}#/${route}`});if(!await waitReady(cdp))throw Error('Deep link not ready');
      await check('A07/A12',`静态子路径深链 ${route}`,`return {pass:__AZ.workspaceKind()===${JSON.stringify(kind)}&&__AZ.state.phase==='hub'&&location.hash===${JSON.stringify('#/'+route)},hash:location.hash,kind:__AZ.workspaceKind()};`);
    }
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await cdp.send('Page.navigate',{url:`http://127.0.0.1:${httpPort}/agent-zero/?intro=always`});await waitReady(cdp);
    await check('A08','减少动态开场、知识与 Runtime 路径仍可用',`for(let i=0;i<40&&__AZ.state.phase!=='hub';i++)await new Promise(r=>setTimeout(r,100));const reducedState={reduced:__AZ.state.reducedMotion,phase:__AZ.state.phase,time:__AZ.timeline.t.value,duration:__AZ.timeline.duration};const staticCore=reducedState.reduced&&reducedState.phase==='hub';__AZ.configurationActions.useExample('starter',true);__AZ.openStory();const animation=getComputedStyle(document.querySelector('.workspace')).animationName;__AZ.openRuntime();document.querySelector('[data-rt-act="new"]').click();document.querySelector('[data-rt-act="step"]').click();return {pass:staticCore&&animation==='none'&&__AZ.runtimeApi().currentRun().summary.steps===1,animation,reducedState,steps:__AZ.runtimeApi().currentRun().summary.steps,status:__AZ.runtimeApi().currentRun().status};`);
    await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:original.call(this,type,...args)};`});
    await cdp.send('Page.reload',{ignoreCache:false});await waitReady(cdp);
    await check('A11','WebGL 失败仍可装配、运行、A/B、读证据',`__AZ.skipIntro('fallback');__AZ.configurationActions.useExample('starter',true);__AZ.openRuntime();document.querySelector('[data-rt-act="new"]').click();document.querySelector('[data-rt-act="step"]').click();const rt=__AZ.runtimeApi().currentRun();__AZ.openComparison();document.querySelector('[data-ab-act="run"]').click();await new Promise(r=>setTimeout(r,100));return {pass:!__AZ.scene.ok&&rt.summary.steps===1&&!!__AZ.comparisonApi().currentExperiment()&&!!document.querySelector('.ex-core__svg')};`);
    await shot('06-webgl-fallback');
    await sleep(350);
    const files=await readdir(downloads),md=files.find(x=>x.endsWith('.md')),json=files.find(x=>x.endsWith('.json'));
    const markdown=md?await readFile(path.join(downloads,md),'utf8'):'';
    rows.push({id:'A22-file',name:'磁盘实际导出文件',status:json&&markdown.includes('SIMULATION / 本地模拟')&&markdown.includes('sourceId')?'PASS':'FAIL',evidence:files});
    rows.push({id:'A36-network',name:'仅本地静态请求',status:network.every(url=>url.startsWith(`http://127.0.0.1:${httpPort}/`)||url.startsWith('data:')||url.startsWith('blob:'))?'PASS':'FAIL',evidence:[...new Set(network)]});
    rows.push({id:'A36-http',name:'关键静态资源无 HTTP 错误',status:failedResources.length?'FAIL':'PASS',evidence:failedResources});
  }
  await writeFile(path.join(out,'browser-results.json'),JSON.stringify({browser:'Chrome headless / SwiftShader',rows,network,console:cdp.console},null,2));
} catch(error) { rows.push({id:'HARNESS',name:'浏览器执行环境',status:'BLOCKED',evidence:error.stack});console.error(error); }
finally {
  await writeFile(path.join(out,'browser-summary.json'),JSON.stringify(rows,null,2));
  try{await cdp?.send('Browser.close');}catch{}try{cdp?.ws.close();}catch{}proc.kill();server.close();
  console.log(`${rows.filter(r=>r.status==='PASS').length}/${rows.length} PASS`);
  if(rows.some(r=>r.status!=='PASS'))process.exitCode=1;
}
