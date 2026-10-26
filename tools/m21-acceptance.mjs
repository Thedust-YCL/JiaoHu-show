/** Local browser harness, independent temporary profile. No product network or backend. */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';
import { CDP, waitReady } from './m14-acceptance.mjs';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const OUT='verify/m21-shots';const results=[];
await mkdir(OUT,{recursive:true});
const port=9352;
const proc=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${path.join(os.tmpdir(),`az0-m21-${Date.now()}`)}`,'--no-first-run','--no-default-browser-check','--disable-extensions','--hide-scrollbars','--mute-audio','--allow-file-access-from-files','--enable-unsafe-swiftshader','--use-angle=swiftshader','--window-size=1440,900','--force-device-scale-factor=1','about:blank'],{stdio:'ignore'});
let cdp,server;
try {
  let target;for(let i=0;i<60&&!target;i++){await sleep(250);try{target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page');}catch{}}
  if(!target)throw Error('浏览器调试端口未就绪');
  const ws=await new Promise((resolve,reject)=>{const socket=new WebSocket(target.webSocketDebuggerUrl);socket.addEventListener('open',()=>resolve(socket),{once:true});socket.addEventListener('error',reject,{once:true});});
  cdp=new CDP(ws);await cdp.send('Page.enable');await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await cdp.send('Page.navigate',{url:'file:///'+path.join(process.cwd(),'index.html').replace(/\\/g,'/')});
  if(!await waitReady(cdp)){await writeFile('verify/m21-startup-console.json',JSON.stringify(cdp.console,null,2));throw Error('应用未就绪：'+JSON.stringify(cdp.console));}
  const ev=code=>cdp.eval(`(async()=>{${code}})()`,true);
  const check=async(id,name,code)=>{try{const r=await ev(code);const row={id,name,pass:r===true||r?.pass===true,note:r?.note||JSON.stringify(r)};results.push(row);console.log(`${row.pass?'PASS':'FAIL'} ${id} ${name} ${row.note}`);}catch(e){results.push({id,name,pass:false,note:e.message});console.log(`FAIL ${id}: ${e.message}`);}};
  const shot=async(name,setup)=>{if(setup)await cdp.eval(`(${setup.toString()})()`);await sleep(300);return cdp.shot(path.join(OUT,name));};
  const key=async(key,code=key)=>{for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:key==='Enter'?13:key==='Escape'?27:9,...(key==='Enter'&&type==='keyDown'?{text:'\r',unmodifiedText:'\r'}:{})});};
  await ev(`__AZ.skipIntro('M21');__AZ.goHub();__AZ.resetConstructor();`);
  await check('startup','应用和新配置契约可用',`return {pass:__AZ.agentConfiguration().schemaVersion===2&&!!document.querySelector('[data-config-act="starter"]')};`);
  if(process.argv.includes('--smoke')){await shot('smoke.png');}
  else {
    await check('A40-boot','五镜头重播与跳过仍到同一稳定核心',`const core=__AZ.scene.core;__AZ.replayIntro();const seq=[];for(const t of [0.6,2.8,5.5,7.6,9.6]){__AZ.captureFrame(t);seq.push(__AZ.timeline.currentShot().shot.no);}__AZ.skipIntro('M21-regression');return {pass:seq.join(',')==='01,02,03,04,05'&&__AZ.scene.core===core&&__AZ.state.phase==='hub'&&__AZ.state.coreState==='IDLE'&&__AZ.scene.core.rings.every(r=>r.visible)};`);
    await check('A40-selection','核心聚焦与 Inspector 对应',`__AZ.selectPart('ring-3');const visual=__AZ.scene.visual.selection==='ring-3';const inspector=document.querySelector('.inspector__title')?.textContent.includes('机械轨道 C');__AZ.selectPart('ring-3');__AZ.resetView();return {pass:visual&&inspector};`);await sleep(1200);
    const orbit=await ev(`const r=document.querySelector('.stage__canvas').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,angle:__AZ.scene.rig.controls.getAzimuthalAngle()};`);
    await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:orbit.x,y:orbit.y,button:'left',clickCount:1});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:orbit.x+100,y:orbit.y+25,buttons:1,button:'left'});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:orbit.x+100,y:orbit.y+25,button:'left',clickCount:1});await sleep(200);
    await check('A40-orbit','真实鼠标旋转及缩放限幅',`const controls=__AZ.scene.rig.controls;const changed=Math.abs(controls.getAzimuthalAngle()-${orbit.angle})>0.01;__AZ.resetView();return {pass:changed&&controls.minDistance===4.2&&controls.maxDistance===11.5};`);await sleep(1200);
    await check('A08','真实点击预览与确认写入同一配置',`document.querySelector('.bay-card[data-module="model"] [data-act="add"]').click();const preview=__AZ.constructorSnapshot().preview?.moduleId==='model';document.querySelector('.inspector button.btn--primary').click();return {pass:preview&&__AZ.agentConfiguration().modules.some(m=>m.moduleId==='model')};`);
    await check('A11','重复安装不产生实例',`__AZ.previewModule('model');__AZ.confirmAssembly();return {pass:__AZ.agentConfiguration().modules.filter(m=>m.moduleId==='model').length===1};`);
    await ev(`__AZ.goHub();__AZ.setView('assembly');__AZ.resetView();`);await sleep(700);
    const drag=async(moduleId,portId)=>{
      const source=await ev(`const el=document.querySelector('.bay-card[data-module="${moduleId}"] .bay-card__grip');el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};`);
      const target=await ev(`return __AZ.portScreenPoint('${portId}');`);
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:source.x,y:source.y});
      await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:source.x,y:source.y,button:'left',clickCount:1});
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:target.x,y:target.y,button:'left',buttons:1});await sleep(150);
      const during=await ev(`return __AZ.constructorSnapshot().drag;`);
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:target.x,y:target.y,button:'left',clickCount:1});await sleep(650);return during;
    };
    const legalDrag=await drag('announcement_search','SEARCH_PORT');
    await check('A09-valid','真实鼠标拖拽到兼容端口',`return {pass:__AZ.agentConfiguration().modules.some(m=>m.moduleId==='announcement_search'),note:${JSON.stringify(JSON.stringify(legalDrag))}};`);
    const illegalDrag=await drag('document_reader','SEARCH_PORT');
    await check('A09-invalid','真实鼠标非法拖拽无半成品',`return {pass:!__AZ.agentConfiguration().modules.some(m=>m.moduleId==='document_reader')&&!__AZ.constructorSnapshot().drag,note:${JSON.stringify(JSON.stringify(illegalDrag))}};`);
    await check('A07','示例确认后加载全部十类',`document.querySelector('[data-config-act="evidence-first"]').click();const dialog=document.querySelector('.confirm[data-open="true"]');dialog.querySelector('.btn--primary').click();return {pass:__AZ.agentConfiguration().modules.length===11&&__AZ.configurationPreflight().ready};`);
    await sleep(800);await shot('assembly-desktop.png');
    await check('A17','真实 3D 实体与配置启用状态一致',`const bay=__AZ.scene.bay;const all=__AZ.agentConfiguration().modules.every(m=>bay.hasInstance(m.moduleId)&&bay.instanceStatus(m.moduleId)===__AZ.constructor.statusOf(m.moduleId));__AZ.toggleModule('memory',false);const disabled=bay.instanceStatus('memory')==='Disabled';__AZ.toggleModule('memory',true);return {pass:all&&disabled&&bay.instanceCount()===11};`);
    await check('A12','Inspector 的文本、数值、多选修改真实更新',`__AZ.selectModule('instructions');const input=document.querySelector('[name="objective"]');input.value='核验本地更正公告';input.dispatchEvent(new Event('change',{bubbles:true}));__AZ.selectModule('runtime');const steps=document.querySelector('[name="maxSteps"]');steps.value='18';steps.dispatchEvent(new Event('change',{bubbles:true}));__AZ.selectModule('memory');const entry=document.querySelector('[name="entryIds"]');entry.click();return {pass:__AZ.agentConfiguration().settings.maxSteps===18&&__AZ.agentConfiguration().modules.find(m=>m.moduleId==='instructions').settings.objective==='核验本地更正公告'&&__AZ.agentConfiguration().modules.find(m=>m.moduleId==='memory').settings.entryIds.length===1};`);
    await check('A13','非法数字被拒绝并显示字段反馈',`__AZ.selectModule('runtime');let input=document.querySelector('[name="maxSteps"]');input.value='0';input.dispatchEvent(new Event('change',{bubbles:true}));return {pass:__AZ.agentConfiguration().settings.maxSteps===18&&__AZ.constructorSnapshot().notice.code==='INVALID_CONFIG'};`);
    await check('A24','共享审批字段从 Guardrails 更新根 Runtime',`__AZ.selectModule('guardrails');document.querySelector('[name="requireApprovalForRestrictedActions"]').click();const off=!__AZ.agentConfiguration().settings.requireApprovalForRestrictedActions;document.querySelector('[name="allowPrivateRecords"]').click();const issue=__AZ.configurationPreflight().issues.some(i=>i.code==='APPROVAL_REQUIRED');document.querySelector('[name="requireApprovalForRestrictedActions"]').click();document.querySelector('[name="allowPrivateRecords"]').click();return {pass:off&&issue&&__AZ.agentConfiguration().settings.requireApprovalForRestrictedActions};`);
    await check('A18','禁用与系统图/Inspector 状态同步',`__AZ.toggleModule('retrieval',false);__AZ.setView('system');const node=document.querySelector('.sg-node[data-node="retrieval"]');const disabled=node?.dataset.status==='Disabled';__AZ.showPreflight();const errors=__AZ.configurationPreflight().issues.some(i=>i.moduleId==='context'&&i.code==='MISSING_DEPENDENCY');__AZ.toggleModule('retrieval',true);return {pass:disabled&&errors&&__AZ.configurationPreflight().ready,note:JSON.stringify({disabled,errors,ready:__AZ.configurationPreflight().ready})};`);
    await shot('system-desktop.png');
    await check('A25','保存快照后本地列表可选择',`__AZ.configurationActions.save();return {pass:__AZ.savedConfigurations().length===1&&document.querySelector('[aria-label="已保存的本地配置"]').options.length===2};`);
    await check('A27','复制重命名和删除确认',`const first=__AZ.agentConfiguration().configId;document.querySelector('[data-config-act="copy"]').click();const second=__AZ.agentConfiguration().configId;const name=document.querySelector('#agent-config-name');name.value='本地研究副本';name.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[data-config-act="save"]').click();document.querySelector('[aria-label="已保存的本地配置"]').value=first;document.querySelector('[data-config-act="delete"]').click();const before=__AZ.savedConfigurations().length;document.querySelector('.confirm[data-open="true"] .btn--ghost').click();const cancelled=__AZ.savedConfigurations().length===before;document.querySelector('[data-config-act="delete"]').click();document.querySelector('.confirm[data-open="true"] .btn--primary').click();return {pass:first!==second&&cancelled&&__AZ.savedConfigurations().length===1&&__AZ.agentConfiguration().name==='本地研究副本'};`);
    await check('A29','加载未保存草稿必须确认且取消不丢数据',`__AZ.configureModule('model',{preset:'concise'});const id=__AZ.savedConfigurations()[0].configId;document.querySelector('[aria-label="已保存的本地配置"]').value=id;document.querySelector('[data-config-act="load"]').click();const dialog=!!document.querySelector('.confirm[data-open="true"]');document.querySelector('.confirm[data-open="true"] .btn--ghost').click();return {pass:dialog&&__AZ.agentConfiguration().modules.find(m=>m.moduleId==='model').settings.preset==='concise'};`);
    await check('A26-load','确认加载恢复已保存模块参数和名称',`document.querySelector('[data-config-act="load"]').click();document.querySelector('.confirm[data-open="true"] .btn--primary').click();const c=__AZ.agentConfiguration();const restored=c.modules.find(m=>m.moduleId==='model').settings.preset==='careful'&&c.settings.maxSteps===18&&c.modules.length===11&&c.name==='本地研究副本';__AZ.configureModule('model',{preset:'concise'});return {pass:restored};`);
    await check('A31','Preflight 由真实草稿产生摘要和警告',`__AZ.showPreflight();return {pass:!!document.querySelector('.configuration-preflight[data-ready="true"]')&&document.querySelector('.configuration-preflight').textContent.includes('本地模拟')&&document.querySelector('[data-issue-id^="UNSAVED_CHANGES"]')!==null};`);
    await shot('preflight-desktop.png');
    await check('A32','模块知识链接与返回位置',`__AZ.selectModule('retrieval');document.querySelector('[data-concept="rag"]').click();const target=__AZ.knowledgeApi()?.currentConcept()==='rag';document.querySelector('[data-act="return"]').click();return {pass:target&&__AZ.constructorSnapshot().selectedModuleId==='retrieval'&&location.hash==='#/constructor'};`);
    await check('A33','配置管理不改 Journal/学习/研究记录',`const keys=['agent-zero:journal:v1','agent-zero:learning:v2','agent-zero:research:v2'];const before=keys.map(k=>localStorage.getItem(k));__AZ.configurationActions.copy();__AZ.configurationActions.rename('隔离验证');return {pass:keys.every((k,i)=>localStorage.getItem(k)===before[i])};`);
    await cdp.send('Page.reload',{ignoreCache:false});await waitReady(cdp);
    await check('A26','刷新恢复草稿全部字段',`__AZ.skipIntro('reload');return {pass:__AZ.agentConfiguration().name==='隔离验证'&&__AZ.agentConfiguration().settings.maxSteps===18&&__AZ.agentConfiguration().modules.length===11&&__AZ.constructorSnapshot().preview===null};`);
    await check('A29-unblurred-setup','真实可见文本框保留焦点',`__AZ.showPreflight();__AZ.selectModule('instructions');const input=document.querySelector('[name="objective"]');input.focus();input.value='离开前尚未失焦的研究目标';return {pass:document.activeElement===input,note:JSON.stringify({focused:document.activeElement===input,visible:input.getBoundingClientRect().width>0})};`);
    await cdp.send('Page.reload',{ignoreCache:false});await waitReady(cdp);
    await check('A29-unblurred','刷新前提交尚未失焦的文本草稿',`__AZ.skipIntro('unblurred');const value=__AZ.agentConfiguration().modules.find(m=>m.moduleId==='instructions').settings.objective;return {pass:value==='离开前尚未失焦的研究目标',note:JSON.stringify({value})};`);
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    for(const width of [1440,1024,768,390]) {
      await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:width===390?844:900,deviceScaleFactor:1,mobile:false});
      await check(`A34-${width}`,'响应式无页面横向溢出',`__AZ.goHub();__AZ.setView('system');__AZ.selectModule('context');return {pass:document.documentElement.scrollWidth<=innerWidth+2,note:JSON.stringify({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})};`);
    }
    await check('A34-mobile-form','窄屏检视抽屉真实可见且能编辑',`const input=document.querySelector('[name="budget"]');const r=input.getBoundingClientRect();const visible=r.width>0&&r.x>=0&&r.right<=innerWidth+1;input.value='880';input.dispatchEvent(new Event('change',{bubbles:true}));return {pass:visible&&__AZ.agentConfiguration().modules.find(m=>m.moduleId==='context').settings.budget===880,note:JSON.stringify({visible,x:r.x,right:r.right,width:innerWidth})};`);
    await shot('mobile.png');
    await check('A34-mobile-preflight','窄屏目录可进入预检并让出抽屉空间',`const dockButton=document.querySelector('.topbar [aria-label^="显示或隐藏左侧导航"]');dockButton.click();document.querySelector('.dock__scroll').scrollTop=0;document.querySelector('[data-config-act="preflight"]').click();const r=document.querySelector('.configuration-preflight').getBoundingClientRect();return {pass:r.width>0&&r.x>=0&&r.right<=innerWidth+1&&document.querySelector('.shell').dataset.dock==='closed',note:JSON.stringify({x:r.x,right:r.right,width:innerWidth})};`);
    await shot('preflight-mobile.png');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    await check('A34-keyboard-setup','键盘确认弹层准备',`__AZ.goHub();const button=document.querySelector('[data-config-act="starter"]');button.closest('details').open=true;button.focus();return {pass:document.activeElement===button};`);
    await key('Enter');
    await check('A34-dialog-focus','Enter 打开确认并聚焦取消',`return {pass:document.querySelector('.confirm').dataset.open==='true'&&document.activeElement.textContent==='取消'};`);
    await key('Tab');
    await check('A34-focus-trap','确认弹层焦点圈定',`return {pass:document.querySelector('.confirm__actions').contains(document.activeElement)};`);
    await key('Escape');
    await check('A34-focus-return','Escape 取消且焦点返回触发按钮',`return {pass:document.querySelector('.confirm').dataset.open==='false'&&document.activeElement.dataset.configAct==='starter'};`);
    await cdp.send('Emulation.setEmulatedMedia',{features:[]});
    if(process.argv.includes('--regression')) {
      const only=process.argv.find(arg=>arg.startsWith('--stage='))?.slice(8);
      for(const [name,exportName] of [['m03','runM03Acceptance'],['m04','runM04Acceptance'],['m11','runM11Acceptance'],['m12','runM12Acceptance'],['m13','runM13Acceptance'],['m14','runM14Acceptance']].filter(([name])=>!only||name===only)) {
        await ev(`__AZ.goHub();localStorage.removeItem('agent-zero:constructor:v2');localStorage.removeItem('agent-zero:constructor:v1');`);
        const mod=await import(`./${name}-acceptance.mjs`);
        const rows=await mod[exportName]({cdp,sleep,shot:async()=>null,waitReady});
        await writeFile(`verify/m21-regression-${name}.json`,JSON.stringify(rows,null,2));
        results.push(...rows.map(r=>({...r,id:`R-${name}-${r.id}`})));console.log(`${name}: ${rows.filter(r=>r.pass).length}/${rows.length}`);
      }
    }
    await check('A05-XSS-setup','异常文本只作为数据预备',`__AZ.goHub();__AZ.configurationActions.useExample('evidence-first',true);const envelope=JSON.parse(localStorage.getItem('agent-zero:constructor:v2'));envelope.draft.settings.maxSteps='<img src=x onerror="globalThis.injected=true">';envelope.draft.connections=[null];envelope.draft.modules.find(m=>m.moduleId==='context').settings=null;localStorage.setItem('agent-zero:constructor:v2',JSON.stringify(envelope));return {pass:true};`);
    await cdp.send('Page.reload',{ignoreCache:false});await waitReady(cdp);
    await check('A05-XSS','损坏字段不执行 HTML，也不使页面崩溃',`__AZ.skipIntro('safe');__AZ.showPreflight();return {pass:!globalThis.injected&&!document.querySelector('.configuration-preflight img')&&!__AZ.configurationPreflight().ready&&!!document.querySelector('.configuration-preflight')};`);
    await check('A30-setup','保留损坏的原始存储',`localStorage.setItem('agent-zero:constructor:v2','{broken');return {pass:true};`);
    await cdp.send('Page.reload',{ignoreCache:false});await waitReady(cdp);
    await check('A30','损坏数据提示、锁定、备份恢复',`__AZ.skipIntro('recover');__AZ.configurationActions.useExample('starter',true);const preserved=localStorage.getItem('agent-zero:constructor:v2')==='{broken';document.querySelector('[data-config-act="recover"]').click();document.querySelector('.confirm[data-open="true"] .btn--primary').click();return {pass:preserved&&localStorage.getItem('agent-zero:constructor:v2:recovery')==='{broken'&&JSON.parse(localStorage.getItem('agent-zero:constructor:v2')).draft.modules.length===7};`);
    await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:original.call(this,type,...args)};`});
    await cdp.send('Page.reload',{ignoreCache:false});await waitReady(cdp);
    await check('A35','真实 WebGL 不可用时仍可配置/预检',`__AZ.skipIntro('fallback');__AZ.goHub();__AZ.selectModule('context');const input=document.querySelector('[name="budget"]');input.value='900';input.dispatchEvent(new Event('change',{bubbles:true}));__AZ.showPreflight();return {pass:!__AZ.scene.ok&&__AZ.agentConfiguration().modules.find(m=>m.moduleId==='context').settings.budget===900&&!!document.querySelector('.configuration-preflight')&&!!document.querySelector('.sg-node[data-node="context"]')};`);
    await shot('fallback.png');
    await check('A36','无远程运行资源',`return {pass:performance.getEntriesByType('resource').filter(e=>/^https?:/.test(e.name)&&!e.name.startsWith(location.origin)).length===0};`);
    const files=new Map([['/agent-zero/',['dist/index.html','text/html']],['/agent-zero/assets/app.js',['dist/assets/app.js','text/javascript']],['/agent-zero/assets/app.css',['dist/assets/app.css','text/css']]]);
    server=createServer(async(req,res)=>{const file=files.get(req.url);if(!file){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':file[1]+'; charset=utf-8'});res.end(await readFile(file[0]));});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/agent-zero/#/knowledge/rag`});await waitReady(cdp);
    await check('A39-subpath','真实静态项目子路径与知识深链',`return {pass:__AZ.knowledgeApi()?.currentConcept()==='rag'&&performance.getEntriesByType('resource').some(e=>e.name.includes('/agent-zero/assets/app.js'))};`);
  }
}catch(error){results.push({id:'HARNESS',pass:false,note:error.stack});console.error(error);}
finally {
  const reportPath=process.argv.find(arg=>arg.startsWith('--report='))?.slice(9)||'verify/m21-browser-report.json';
  await writeFile(reportPath,JSON.stringify({stage:'M2.1',generatedAt:new Date().toISOString(),passed:results.filter(r=>r.pass).length,total:results.length,results,console:cdp?.console||[]},null,2));
  server?.close();try{await cdp?.send('Browser.close');}catch{}proc.kill();
}
console.log(`${results.filter(r=>r.pass).length}/${results.length} passed`);if(results.some(r=>!r.pass))process.exitCode=1;
