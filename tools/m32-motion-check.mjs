/** Compare complete real UI runs with and without reduced motion. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { CDP, waitReady } from './m14-acceptance.mjs';
import { semanticTrace } from '../src/simulation/engine/runtime.js';

const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve('dist', pathname === '/' ? 'index.html' : pathname.slice(1));
    if (!file.startsWith(path.resolve('dist') + path.sep)) return res.writeHead(403).end();
    res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(8195, '127.0.0.1', resolve));
const proc = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9385', `--user-data-dir=${path.join(os.tmpdir(), `az-motion-${Date.now()}`)}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank',
], { stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let cdp;
try {
  let target;
  for (let i=0;i<60&&!target;i++){await sleep(200);try{target=(await(await fetch('http://127.0.0.1:9385/json/list')).json()).find(t=>t.type==='page');}catch{}}
  if (!target) throw Error('Chrome not ready');
  const ws = await new Promise((resolve,reject)=>{const socket=new WebSocket(target.webSocketDebuggerUrl);socket.addEventListener('open',()=>resolve(socket),{once:true});socket.addEventListener('error',reject,{once:true});});
  cdp=new CDP(ws);
  for(const domain of ['Page.enable','Runtime.enable'])await cdp.send(domain);
  const runs=[];
  for(const motion of ['no-preference','reduce']){
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:motion}]});
    await cdp.send('Page.navigate',{url:`http://127.0.0.1:8195/?motion=${motion}`});
    if(!await waitReady(cdp))throw Error('App not ready');
    const setup = motion === 'no-preference' ? `__AZ.configurationActions.useExample('starter',true);__AZ.configurationActions.save(true);` : '';
    const run = await cdp.eval(`(()=>{__AZ.skipIntro('motion test');${setup}__AZ.openRuntime();document.querySelector('[aria-label="本地模拟场景"]').value='PERMISSION_REQUIRED';document.querySelector('[aria-label="复现种子"]').value='31415';document.querySelector('[aria-label="角色协作模式"]').value='single';document.querySelector('[data-rt-act="new"]').click();let n=0;while(!['completed','failed','cancelled'].includes(__AZ.runtimeApi().currentRun().status)&&n++<120){if(__AZ.runtimeApi().currentRun().status==='waiting_approval')document.querySelector('[data-rt-act="approve"]').click();else document.querySelector('[data-rt-act="step"]').click()}return {reduced:__AZ.state.reducedMotion,run:__AZ.runtimeApi().currentRun()}})()`);
    runs.push(run);
  }
  assert.equal(runs[0].reduced,false);
  assert.equal(runs[1].reduced,true);
  assert.deepEqual(runs[0].run.configSnapshot,runs[1].run.configSnapshot);
  assert.equal(runs[0].run.scenarioId,'PERMISSION_REQUIRED');
  assert.equal(runs[1].run.scenarioId,'PERMISSION_REQUIRED');
  assert.equal(runs[0].run.seed,'31415');
  assert.equal(runs[1].run.seed,'31415');
  assert.equal(runs[0].run.status,'completed');
  assert.equal(runs[1].run.status,'completed');
  assert.ok(runs[0].run.summary.approvals>0);
  assert.deepEqual(semanticTrace(runs[0].run),semanticTrace(runs[1].run));
  const result=runs.map(({reduced,run})=>({reduced,status:run.status,scenarioId:run.scenarioId,seed:run.seed,configId:run.configId,steps:run.summary.steps,approvals:run.summary.approvals,events:run.events.length}));
  await mkdir('verify/m32',{recursive:true});await writeFile('verify/m32/motion-equivalence.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} finally {
  if(cdp){await cdp.send('Browser.close').catch(()=>{});cdp.ws.close();}
  proc.kill();server.close();
}
