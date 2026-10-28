/** Reproducible production-preview measurements; isolated Chrome profile. */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { gzipSync } from 'node:zlib';
import { CDP, waitReady } from './m14-acceptance.mjs';

const label = process.argv[2] || 'baseline';
if (!/^[a-z0-9-]+$/.test(label)) throw Error('Invalid result label');
const dpr = Number(process.env.AZ_DPR || 1);
if (!Number.isFinite(dpr) || dpr < 0.5 || dpr > 4) throw Error('Invalid DPR');
const out = path.resolve('verify/m32');
await mkdir(out, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (!pathname.startsWith('/agent-zero/')) return res.writeHead(404).end();
    const file = path.resolve('dist', pathname.slice('/agent-zero/'.length) || 'index.html');
    if (!file.startsWith(path.resolve('dist') + path.sep)) return res.writeHead(403).end();
    res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.setHeader('Cache-Control', 'no-store');
    const body = await readFile(file);
    if (process.env.AZ_GZIP === '1' && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.end(gzipSync(body));
    } else res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(8192, '127.0.0.1', resolve));
const gpuArgs = process.env.AZ_GPU_MODE === 'hardware' ? ['--enable-gpu', '--disable-software-rasterizer'] : ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'];
const proc = spawn(process.env.AZ_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9382', `--user-data-dir=${path.join(os.tmpdir(), `az-m32-${Date.now()}`)}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars',
  ...gpuArgs, '--window-size=1440,900', '--force-device-scale-factor=1', 'about:blank'
], { stdio: 'ignore' });
let cdp;
try {
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch('http://127.0.0.1:9382/json/list')).json()).find(t => t.type === 'page'); } catch {}
  }
  if (!target) throw Error('Chrome not ready');
  const version = await (await fetch('http://127.0.0.1:9382/json/version')).json();
  const ws = await new Promise((resolve, reject) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    socket.addEventListener('open', () => resolve(socket), { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  cdp = new CDP(ws);
  for (const domain of ['Page.enable', 'Runtime.enable', 'Network.enable']) await cdp.send(domain);
  if (process.env.AZ_THROTTLE === '1') {
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200 * 1024, uploadThroughput: 100 * 1024 });
  }
  const requests = [];
  ws.addEventListener('message', event => { const m = JSON.parse(event.data); if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url); });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: dpr, mobile: false });
  const nav = async () => {
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:8192/agent-zero/?m32=1' });
    if (!await waitReady(cdp)) throw Error('App not ready');
    return cdp.eval(`({navigation:performance.getEntriesByType('navigation').map(x=>({domContentLoaded:x.domContentLoadedEventEnd,load:x.loadEventEnd,duration:x.duration,transferSize:x.transferSize})),resources:performance.getEntriesByType('resource').map(x=>({name:x.name,transferSize:x.transferSize,duration:x.duration})),ready:performance.now(),userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory})`);
  };
  const cold = await nav();
  const warm = await nav(); // no-store preview: repeated startup, not a browser-cache measurement
  await cdp.eval(`__AZ.skipIntro('M32'); if(!__AZ.scene.ok)throw Error('No WebGL'); globalThis.m32tick=[];const original=__AZ.scene.tick;__AZ.scene.tick=function(...args){const t=performance.now();try{return original.apply(this,args)}finally{m32tick.push(performance.now()-t)}};`);
  const sample = async (name, action) => {
    await cdp.eval(action);
    await sleep(500);
    const value = await cdp.eval(`(async()=>{m32tick.length=0;const deltas=[];let prev;const start=performance.now();await new Promise(resolve=>{function frame(t){if(prev!==undefined)deltas.push(t-prev);prev=t;if(performance.now()-start<2000)requestAnimationFrame(frame);else resolve()}requestAnimationFrame(frame)});const sort=a=>a.slice().sort((x,y)=>x-y), p=(a,n)=>a.length?sort(a)[Math.min(a.length-1,Math.floor(a.length*n))]:null;const canvas=__AZ.scene.renderer.domElement,rect=canvas.getBoundingClientRect(),gl=__AZ.scene.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {elapsedMs:performance.now()-start,rafFrames:deltas.length,rafP50:p(deltas,.5),rafP95:p(deltas,.95),over33ms:deltas.filter(x=>x>33.4).length,tickCalls:m32tick.length,tickP50:p(m32tick,.5),tickP95:p(m32tick,.95),stats:__AZ.scene.getStats(),canvas:{width:rect.width,height:rect.height,display:getComputedStyle(canvas).display,pixelRatio:__AZ.scene.renderer.getPixelRatio(),bufferWidth:canvas.width,bufferHeight:canvas.height},heap:performance.memory?.usedJSHeapSize??null,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)}})()`, true);
    const diagnostic = await cdp.eval(`document.querySelector('#diag-kv')?.textContent || ''`);
    return { name, ...value, diagnostic };
  };
  const scenes = [];
  scenes.push(await sample('hub', '__AZ.goHub()'));
  let experiments = [];
  if (!process.argv.includes('--load-only')) {
    scenes.push(await sample('atlas', '__AZ.openAtlas()'));
    experiments = await cdp.eval('__AZ.experiments().map(e=>e.id)');
    for (const id of experiments) scenes.push(await sample(`lab:${id}`, `__AZ.openLabExperiment(${JSON.stringify(id)})`));
    scenes.push(await sample('constructor', '__AZ.goHub()'));
    scenes.push(await sample('runtime', '__AZ.openRuntime()'));
    scenes.push(await sample('comparison', '__AZ.openComparison()'));
  }
  const stress = [];
  if (process.argv.includes('--stress')) {
    await cdp.eval('__AZ.goHub()');
    for (let batch = 0; batch <= 10; batch++) {
      if (batch) await cdp.eval(`(()=>{for(let i=0;i<10;i++){__AZ.openAtlas();__AZ.openLabExperiment('exp-token-lab');__AZ.openRuntime();__AZ.openComparison();__AZ.goHub();}})()`);
      await sleep(400);
      await cdp.send('HeapProfiler.collectGarbage');
      const heap = await cdp.send('Runtime.getHeapUsage');
      const stats = await cdp.eval('__AZ.scene.getStats()');
      const counts = {};
      for (const target of ['window', 'document']) {
        const obj = await cdp.send('Runtime.evaluate', { expression: target });
        const listeners = await cdp.send('DOMDebugger.getEventListeners', { objectId: obj.result.objectId });
        counts[target] = listeners.listeners.length;
        await cdp.send('Runtime.releaseObject', { objectId: obj.result.objectId });
      }
      stress.push({ cycles: batch * 10, usedHeapBytes: heap.usedSize, stats, listeners: counts });
    }
  }
  const deepStress = [];
  if (process.argv.includes('--deep-stress')) {
    const count = Number(process.env.AZ_DEEP_CYCLES || 100);
    if (!Number.isInteger(count) || count < 1 || count > 100) throw Error('Invalid deep stress cycle count');
    await cdp.eval('__AZ.goHub()');
    for (let completed = 0; completed < count;) {
      const batch = Math.min(5, count - completed);
      await cdp.eval(`(async()=>{for(let i=0;i<${batch};i++){
        __AZ.configurationActions.useExample('starter',true);
        __AZ.openRuntime();document.querySelector('[aria-label="本地模拟场景"]').value='NORMAL_PATH';document.querySelector('[data-rt-act="new"]').click();
        let steps=0;while(!['completed','failed','cancelled'].includes(__AZ.runtimeApi().currentRun().status)&&steps++<120){if(__AZ.runtimeApi().currentRun().status==='waiting_approval')document.querySelector('[data-rt-act="approve"]').click();else document.querySelector('[data-rt-act="step"]').click()}
        if(__AZ.runtimeApi().currentRun().status!=='completed')throw Error('Runtime did not complete');
        __AZ.openComparison();document.querySelector('[data-ab-act="run"]').click();await new Promise(r=>setTimeout(r,100));
        if(!__AZ.comparisonApi().currentExperiment()?.comparison)throw Error('A/B comparison missing');
        __AZ.goHub();__AZ.removeModule('document_reader');
        const until=performance.now()+4000;while(__AZ.scene.bay.hasInstance('document_reader')&&performance.now()<until)await new Promise(r=>setTimeout(r,50));
        if(__AZ.scene.bay.hasInstance('document_reader'))throw Error('Module did not finish removal');
      }})()`, true);
      completed += batch;
      await cdp.send('HeapProfiler.collectGarbage');
      const heap = await cdp.send('Runtime.getHeapUsage');
      deepStress.push({ cycles: completed, usedHeapBytes: heap.usedSize, stats: await cdp.eval('__AZ.scene.getStats()') });
    }
  }
  let uiCheck = null;
  if (process.argv.includes('--cpu-profile')) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.start');
  }
  if (process.argv.includes('--ui-check')) {
    uiCheck = await cdp.eval(`(async()=>{
      const longTasks=[],spans=[],observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration}))));
      if(PerformanceObserver.supportedEntryTypes.includes('longtask'))observer.observe({type:'longtask',buffered:false});
      const frame=()=>new Promise(r=>requestAnimationFrame(()=>r())),shell=document.querySelector('.shell'),durations={search:[],editing:[],runtime:[]};
      let phase=performance.now();const host=document.querySelector('.workspace-host'),openObserver=new MutationObserver(()=>{});openObserver.observe(host,{childList:true,subtree:true});const originalReplace=Element.prototype.replaceChildren;let totalListRenders=0;Element.prototype.replaceChildren=function(...args){if(this.classList?.contains('atlas-list'))totalListRenders++;return originalReplace.apply(this,args)};try{__AZ.openAtlas()}finally{Element.prototype.replaceChildren=originalReplace}const input=document.querySelector('.atlas-search__input'),list=document.querySelector('.atlas-list'),openAdds=openObserver.takeRecords().filter(r=>r.target===list&&r.addedNodes.length).length;openObserver.disconnect();if(${process.argv.includes('--atlas-open-check')}&&openAdds!==list.children.length)throw Error('Atlas opening rebuilt the list more than once: '+JSON.stringify({openAdds,groups:list.children.length}));if(${process.argv.includes('--atlas-total-check')}&&totalListRenders!==1)throw Error('Atlas opening rendered the list more than once including before attachment: '+totalListRenders);const listObserver=new MutationObserver(()=>{});listObserver.observe(list,{childList:true});__AZ.atlasApi().search('MCP');const listAdds=listObserver.takeRecords().filter(r=>r.addedNodes.length).length;listObserver.disconnect();if(__AZ.atlasApi().currentSelection()!=='mcp')throw Error('Atlas positive search failed');if(${process.argv.includes('--atlas-render-check')}&&listAdds!==list.children.length)throw Error('Atlas positive search rebuilt the list more than once: '+JSON.stringify({listAdds,groups:list.children.length}));input.focus();spans.push({name:'atlas-open-positive',start:phase,end:performance.now()});
      for(const term of ['M32不存在A','M32不存在B','M32不存在A','M32不存在B','M32不存在A','M32不存在B']){
        const start=performance.now();input.value=term;input.dispatchEvent(new Event('input',{bubbles:true}));
        const until=start+4000;while(!document.querySelector('.atlas-search__note').textContent.toLowerCase().includes(term.toLowerCase())&&performance.now()<until)await new Promise(r=>setTimeout(r,20));
        await frame();if(!document.querySelector('.atlas-search__note').textContent.toLowerCase().includes(term.toLowerCase()))throw Error('Atlas search did not update');
        durations.search.push(performance.now()-start);spans.push({name:'search',start,end:performance.now()});if(document.activeElement!==input||document.querySelector('.shell')!==shell)throw Error('Search lost focus or recreated application shell');
      }
      phase=performance.now();__AZ.goHub();const name=document.querySelector('#agent-config-name');name.focus();spans.push({name:'go-hub',start:phase,end:performance.now()});
      for(let i=0;i<5;i++){const start=performance.now(),value='M32 responsiveness '+i;name.value=value;name.dispatchEvent(new Event('change',{bubbles:true}));await frame();if(__AZ.agentConfiguration().name!==value||document.activeElement!==name||document.querySelector('.shell')!==shell)throw Error('Configuration edit lost state or focus: '+JSON.stringify({value,actual:__AZ.agentConfiguration().name,focus:document.activeElement?.outerHTML?.slice(0,200),sameShell:document.querySelector('.shell')===shell}));durations.editing.push(performance.now()-start);spans.push({name:'editing',start,end:performance.now()})}
      phase=performance.now();__AZ.configurationActions.useExample('starter',true);__AZ.openRuntime();document.querySelector('[data-rt-act="new"]').click();spans.push({name:'runtime-open',start:phase,end:performance.now()});
      for(let i=0;i<4;i++){const start=performance.now(),before=__AZ.runtimeApi().currentRun().summary.steps;document.querySelector('[data-rt-act="step"]').click();await frame();if(__AZ.runtimeApi().currentRun().summary.steps!==before+1||document.querySelector('.shell')!==shell)throw Error('Runtime step did not advance');durations.runtime.push(performance.now()-start);spans.push({name:'runtime-step',start,end:performance.now()})}
      await new Promise(r=>setTimeout(r,100));observer.disconnect();const sorted=a=>a.slice().sort((a,b)=>a-b),p=(a,n)=>sorted(a)[Math.min(a.length-1,Math.floor(a.length*n))];
      return {durations,summary:Object.fromEntries(Object.entries(durations).map(([k,a])=>[k,{samples:a.length,p50:p(a,.5),p95:p(a,.95)}])),longTaskSupported:PerformanceObserver.supportedEntryTypes.includes('longtask'),longTasks,spans};
    })()`, true);
  }
  if (process.argv.includes('--cpu-profile')) {
    const { profile } = await cdp.send('Profiler.stop');
    await writeFile(path.join(out, `${label}-cpu-profile.json`), JSON.stringify(profile, null, 2));
  }
  let lifecycle = null;
  if (process.argv.includes('--lifecycle')) {
    const supported = await cdp.eval(`(()=>{__AZ.openRuntime();const gl=__AZ.scene.renderer.getContext(),ext=gl.getExtension('WEBGL_lose_context');if(!ext)return false;ext.loseContext();return true})()`);
    if (!supported) throw Error('WEBGL_lose_context unavailable');
    await sleep(1000);
    lifecycle = await cdp.eval(`(()=>{const state=__AZ.state.webgl,existingRuntime=document.querySelector('.ex-core')?.dataset.view;__AZ.openRuntime();const runtime=document.querySelector('.ex-core')?.dataset.view;__AZ.openComparison();const comparison=document.querySelector('.ex-core')?.dataset.view;__AZ.openExecution();const execution=document.querySelector('.ex-core')?.dataset.view;return {webgl:state,existingRuntime,runtime,comparison,execution}})()`);
    if (lifecycle.webgl !== false || [lifecycle.existingRuntime,lifecycle.runtime,lifecycle.comparison,lifecycle.execution].some(x=>x!=='2d')) throw Error(`WebGL context loss fallback failed: ${JSON.stringify(lifecycle)}`);
  }
  const files = {};
  for (const file of ['dist/index.html', 'dist/assets/app.js', 'dist/assets/app.css', 'index.html']) {
    const bytes = await readFile(file); files[file] = { bytes: bytes.length, gzipBytes: gzipSync(bytes).length };
  }
  const result = { label, timestamp: new Date().toISOString(), browser: version.Browser, conditions: `Production dist under /agent-zero/, local HTTP no-store${process.env.AZ_GZIP === '1' ? ', simulated gzip server' : ''}, headless ${process.env.AZ_GPU_MODE === 'hardware' ? 'hardware GPU requested, software rasterizer disabled' : 'SwiftShader'}, 1440x900 DPR ${dpr}, ${process.env.AZ_THROTTLE === '1' ? '150ms latency, 200 KiB/s download, 100 KiB/s upload' : 'no network throttling'}, 2s per scene after 500ms settle`, cold, warm, scenes, stress, deepStress, uiCheck, lifecycle, files, requests, errors: cdp.console.filter(x => x.startsWith('[exception]')) };
  await writeFile(path.join(out, `${label}.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (process.argv.includes('--check')) {
    const ticks = Object.fromEntries(scenes.map(s => [s.name, s.tickCalls]));
    if (!(ticks.hub > 0 && ticks.atlas === 0 && experiments.every(id => ticks[`lab:${id}`] === 0) && ticks.constructor > 0 && ticks.runtime > 0 && ticks.comparison > 0)) {
      throw Error(`Visible and covered scene render assertions failed: ${JSON.stringify(ticks)}`);
    }
    if (!scenes.find(s=>s.name==='atlas').diagnostic.includes('3D 已暂停')) throw Error('Covered scene diagnostics do not disclose paused rendering');
    if (scenes.find(s=>s.name==='constructor').diagnostic.includes('3D 已暂停')) throw Error('Diagnostics did not resume after returning to the visible core');
  }
} finally {
  if (cdp) { await cdp.send('Browser.close').catch(() => {}); cdp.ws.close(); }
  proc.kill(); server.close();
}
