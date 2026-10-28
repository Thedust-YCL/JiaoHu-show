/** Browser regression for sidebar widths, collapse controls, and saved-config placeholder. */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { CDP, waitReady } from './m14-acceptance.mjs';

const sleep=ms=>new Promise(r=>setTimeout(r,ms)),port=8199,debug=9399,rows=[];
const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';const root=path.resolve('dist'),file=path.resolve(root,name);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(port,'127.0.0.1',r));
const proc=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new',`--remote-debugging-port=${debug}`,`--user-data-dir=${path.join(os.tmpdir(),`az-sidebar-${Date.now()}`)}`,'--no-first-run','--disable-extensions','--enable-unsafe-swiftshader','--use-angle=swiftshader','about:blank'],{stdio:'ignore'});
let cdp;
try{
 let target;for(let i=0;i<60&&!target;i++){await sleep(200);try{target=(await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json()).find(t=>t.type==='page');}catch{}}
 if(!target)throw Error('Chrome not ready');
 const ws=await new Promise((resolve,reject)=>{const s=new WebSocket(target.webSocketDebuggerUrl);s.addEventListener('open',()=>resolve(s),{once:true});s.addEventListener('error',reject,{once:true});});
 cdp=new CDP(ws);await cdp.send('Page.enable');await cdp.send('Runtime.enable');
 const ev=code=>cdp.eval(`(async()=>{${code}})()`,true);
 const check=async(name,code)=>{try{const result=await ev(code);rows.push({name,...result});console.log(`${result.pass?'PASS':'FAIL'} ${name} ${JSON.stringify(result)}`);}catch(error){rows.push({name,pass:false});console.log(`FAIL ${name} ${error.message}`);}};
 const viewport=async(width,height)=>{await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await sleep(400);};
 await viewport(1024,768);await cdp.send('Page.navigate',{url:`http://127.0.0.1:${port}/`});if(!await waitReady(cdp))throw Error('App not ready');
 await ev(`__AZ.skipIntro('sidebar');document.querySelector('.config-manager summary').click();`);
 await check('empty saved configuration has placeholder',`const s=document.querySelector('#agent-saved-configurations');return {pass:s.selectedIndex===0&&s.selectedOptions[0]?.textContent==='选择本地快照',index:s.selectedIndex};`);
 await ev(`document.querySelector('[aria-controls="az-inspector"]').click();await new Promise(r=>setTimeout(r,400));`);
 await check('1024px expanded sidebar has usable width with inspector open',`const d=document.querySelector('.dock');return {pass:d.getBoundingClientRect().width>=190&&getComputedStyle(document.querySelector('.bay')).display!=='none',width:d.getBoundingClientRect().width};`);
 await ev(`document.querySelector('.inspector .panel-head button').click();`);
 await ev(`__AZ.configurationActions.useExample('starter',true);__AZ.configurationActions.save(true);const s=document.querySelector('#agent-saved-configurations');s.value='';s.dispatchEvent(new Event('change',{bubbles:true}));`);
 await check('saved configuration selection updates actions',`const s=document.querySelector('#agent-saved-configurations'),load=document.querySelector('[data-config-act="load"]');const emptyDisabled=load.disabled;s.value=s.options[1].value;s.dispatchEvent(new Event('change',{bubbles:true}));return {pass:emptyDisabled&&!load.disabled,emptyDisabled,selectedDisabled:load.disabled};`);
 await ev(`document.querySelector('[aria-controls="az-dock"]').click();await new Promise(r=>setTimeout(r,400));`);
 await check('topbar collapse synchronizes content',`const d=document.querySelector('.dock');return {pass:d.dataset.collapsed==='true'&&getComputedStyle(document.querySelector('.bay')).display==='none'&&d.querySelector('.panel-head button').textContent==='展开',state:d.dataset.collapsed,bay:getComputedStyle(document.querySelector('.bay')).display};`);
 await cdp.send('Page.reload',{ignoreCache:false});await waitReady(cdp);await ev(`__AZ.skipIntro('sidebar');await new Promise(r=>setTimeout(r,400));`);
 await check('collapsed state restores after reload',`const d=document.querySelector('.dock');return {pass:d.dataset.collapsed==='true'&&getComputedStyle(document.querySelector('.bay')).display==='none'&&d.querySelector('.panel-head button').textContent==='展开',state:d.dataset.collapsed};`);
 await ev(`document.querySelector('.dock .panel-head button').click();await new Promise(r=>setTimeout(r,400));`);
 await check('sidebar expand restores full width',`const d=document.querySelector('.dock');return {pass:d.dataset.collapsed==='false'&&d.getBoundingClientRect().width>=190&&getComputedStyle(document.querySelector('.bay')).display!=='none',state:d.dataset.collapsed,width:d.getBoundingClientRect().width};`);
 await ev(`document.querySelector('.dock .panel-head button').click();await new Promise(r=>setTimeout(r,400));`);
 await check('sidebar collapse updates width',`const d=document.querySelector('.dock');return {pass:d.dataset.collapsed==='true'&&d.getBoundingClientRect().width<=65&&getComputedStyle(document.querySelector('.bay')).display==='none',state:d.dataset.collapsed,width:d.getBoundingClientRect().width};`);
 await viewport(390,844);await ev(`document.querySelector('[aria-controls="az-dock"]').click();await new Promise(r=>setTimeout(r,400));`);
 await check('mobile drawer ignores desktop rail preference',`const d=document.querySelector('.dock');return {pass:document.querySelector('.shell').dataset.dock==='open'&&getComputedStyle(document.querySelector('.bay')).display!=='none',state:d.dataset.collapsed,bay:getComputedStyle(document.querySelector('.bay')).display};`);
 await ev(`document.querySelector('.dock .panel-head button').click();await new Promise(r=>setTimeout(r,400));`);
 await check('mobile drawer close restores workspace',`return {pass:document.querySelector('.shell').dataset.dock==='closed'&&document.querySelector('.dock').inert&&!document.querySelector('.stage').inert,state:document.querySelector('.shell').dataset.dock};`);
}catch(error){rows.push({name:'harness',pass:false});console.error(error);}finally{try{await cdp?.send('Browser.close');}catch{}proc.kill();server.close();}
console.log(`${rows.filter(r=>r.pass).length}/${rows.length} PASS`);if(rows.some(r=>!r.pass))process.exitCode=1;
