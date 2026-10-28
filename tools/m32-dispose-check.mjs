/** Exercise application teardown in an isolated production-preview browser. */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { build } from 'esbuild';
import { CDP, waitReady } from './m14-acceptance.mjs';

const bundle = await build({ stdin: { contents: "export { createApp } from './src/app.js'", resolveDir: process.cwd(), sourcefile: 'm32-test-app.js' }, bundle: true, format: 'esm', write: false, logLevel: 'silent' });
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/m32-test-app.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(bundle.outputFiles[0].contents); }
    const file = path.resolve('dist', pathname === '/' ? 'index.html' : pathname.slice(1));
    if (!file.startsWith(path.resolve('dist') + path.sep)) return res.writeHead(403).end();
    res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(8193, '127.0.0.1', resolve));
const proc = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9383', `--user-data-dir=${path.join(os.tmpdir(), `az-dispose-${Date.now()}`)}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank',
], { stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let cdp;
try {
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch('http://127.0.0.1:9383/json/list')).json()).find(t => t.type === 'page'); } catch {}
  }
  if (!target) throw Error('Chrome not ready');
  const ws = await new Promise((resolve, reject) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    socket.addEventListener('open', () => resolve(socket), { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  cdp = new CDP(ws);
  for (const domain of ['Page.enable', 'Runtime.enable']) await cdp.send(domain);
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:8193/' });
  if (!await waitReady(cdp)) throw Error('App not ready');
  const before = await cdp.eval(`(()=>{__AZ.skipIntro('dispose test');__AZ.configurationActions.useExample('starter',true);__AZ.openRuntime();document.querySelector('[data-rt-act="run"]').click();globalThis.m32Released={bloom:false,grade:false};__AZ.scene.bloomPass.separableBlurMaterials[0].addEventListener('dispose',()=>m32Released.bloom=true);__AZ.scene.composer.passes.find(p=>p.material?.uniforms?.uVignette).material.addEventListener('dispose',()=>m32Released.grade=true);return {workspace:__AZ.workspaceKind(),status:__AZ.runtimeApi().currentRun().status}})()`);
  const after = await cdp.eval(`(()=>{const app=__AZ,log=document.querySelector('.status .log');app.dispose();const rows=log.querySelectorAll('.log__row').length;app.log('TEST','event after teardown');const afterRows=log.querySelectorAll('.log__row').length;return {rows,afterRows,workspace:app.workspaceKind(),status:app.runtimeApi()?.currentRun()?.status??null,released:{...m32Released}}})()`);
  const events = {};
  for (const targetName of ['window', 'document']) {
    const obj = await cdp.send('Runtime.evaluate', { expression: targetName });
    const result = await cdp.send('DOMDebugger.getEventListeners', { objectId: obj.result.objectId });
    events[targetName] = result.listeners.map(x => x.type).sort();
    await cdp.send('Runtime.releaseObject', { objectId: obj.result.objectId });
  }
  const result = { before, after, events };
  await mkdir('verify/m32', { recursive: true });
  await writeFile(`verify/m32/dispose-${process.argv[2] || 'result'}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  const leaked = events.window.filter(type => ['beforeunload','hashchange','keydown','resize','orientationchange'].includes(type));
  if (after.afterRows !== after.rows || after.workspace !== null || !after.released.bloom || !after.released.grade || leaked.length || events.document.some(type => ['visibilitychange','keydown','keyup'].includes(type))) throw Error('Application teardown left active subscriptions, workspace, postprocessing resources, or global listeners');
  await cdp.eval(`(async()=>{globalThis.disposeModule=await import('/m32-test-app.js')})()`, true);
  const cycles = [];
  const cycleCount = Number(process.env.AZ_DISPOSE_CYCLES || 10);
  if (!Number.isInteger(cycleCount) || cycleCount < 1 || cycleCount > 100) throw Error('Invalid cycle count');
  for (let i = 0; i < cycleCount; i++) {
    const cycle = await cdp.eval(`(()=>{const root=document.getElementById('app'),app=disposeModule.createApp(root);app.skipIntro('dispose repeat');app.openRuntime();const alive=app.workspaceKind()==='runtime'&&!!app.scene.ok;const log=root.querySelector('.status .log');app.dispose();app.dispose();const rows=log.childElementCount;app.log('TEST','after dispose');return {alive,empty:root.childElementCount===0,logUnchanged:log.childElementCount===rows,globalRemoved:!window.__AZ}})()`);
    await cdp.send('HeapProfiler.collectGarbage');
    cycle.heap = (await cdp.send('Runtime.getHeapUsage')).usedSize;
    cycles.push(cycle);
    if (!cycle.alive || !cycle.empty || !cycle.logUnchanged || !cycle.globalRemoved) throw Error(`Repeated teardown failed at cycle ${i + 1}: ${JSON.stringify(cycle)}`);
  }
  for (const targetName of ['window', 'document']) {
    const obj = await cdp.send('Runtime.evaluate', { expression: targetName });
    const listeners = (await cdp.send('DOMDebugger.getEventListeners', { objectId: obj.result.objectId })).listeners.map(x=>x.type);
    await cdp.send('Runtime.releaseObject', { objectId: obj.result.objectId });
    if (listeners.some(type=>['beforeunload','hashchange','keydown','keyup','resize','orientationchange','visibilitychange'].includes(type))) throw Error(`Repeated teardown left ${targetName} listeners: ${listeners}`);
  }
  result.cycles = cycles;
  await writeFile(`verify/m32/dispose-${process.argv[2] || 'result'}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ repeatedTeardown: cycles }, null, 2));
} finally {
  if (cdp) { await cdp.send('Browser.close').catch(() => {}); cdp.ws.close(); }
  proc.kill(); server.close();
}
