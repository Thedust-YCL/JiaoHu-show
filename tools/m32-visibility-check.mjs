/** Real Chromium tab background/foreground and WebGL context restoration checks. */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { CDP, waitReady } from './m14-acceptance.mjs';

const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve('dist', pathname === '/' ? 'index.html' : pathname.slice(1));
    if (!file.startsWith(path.resolve('dist') + path.sep)) return res.writeHead(403).end();
    res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(8194, '127.0.0.1', resolve));
const proc = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9384', `--user-data-dir=${path.join(os.tmpdir(), `az-visibility-${Date.now()}`)}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank',
], { stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let cdp;
try {
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch('http://127.0.0.1:9384/json/list')).json()).find(t => t.type === 'page'); } catch {}
  }
  if (!target) throw Error('Chrome not ready');
  const ws = await new Promise((resolve, reject) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    socket.addEventListener('open', () => resolve(socket), { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  cdp = new CDP(ws);
  for (const domain of ['Page.enable', 'Runtime.enable']) await cdp.send(domain);
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:8194/?intro=always' });
  if (!await waitReady(cdp)) throw Error('App not ready');
  await cdp.eval(`(()=>{globalThis.visibilityTicks=0;const original=__AZ.scene.tick;__AZ.scene.tick=function(...args){visibilityTicks++;return original.apply(this,args)};__AZ.replayIntro()})()`);
  await sleep(500);
  const other = await cdp.send('Target.createTarget', { url: 'about:blank' });
  await cdp.send('Target.activateTarget', { targetId: other.targetId });
  let hidden = false;
  for (let i=0;i<30&&!hidden;i++){await sleep(100);hidden=await cdp.eval('document.hidden');}
  if (!hidden) throw Error('Chromium did not expose a hidden tab in this environment');
  const hiddenStart = await cdp.eval('({hidden:document.hidden,ticks:visibilityTicks,position:__AZ.timeline.t.value})');
  await sleep(1500);
  const hiddenEnd = await cdp.eval('({hidden:document.hidden,ticks:visibilityTicks,position:__AZ.timeline.t.value})');
  await cdp.send('Target.activateTarget', { targetId: target.id });
  await sleep(700);
  const resumed = await cdp.eval('({hidden:document.hidden,ticks:visibilityTicks,position:__AZ.timeline.t.value})');
  const visibilityPass = hiddenStart.hidden && hiddenEnd.hidden && !resumed.hidden && hiddenStart.ticks === hiddenEnd.ticks && hiddenStart.position === hiddenEnd.position && resumed.ticks > hiddenEnd.ticks && resumed.position > hiddenEnd.position;
  await cdp.eval(`(()=>{__AZ.skipIntro('restore test');__AZ.configurationActions.useExample('starter',true);__AZ.openRuntime();globalThis.lossExtension=__AZ.scene.renderer.getContext().getExtension('WEBGL_lose_context');if(!lossExtension)throw Error('WEBGL_lose_context unavailable');lossExtension.loseContext()})()`);
  await sleep(700);
  const lost = await cdp.eval('({lost:__AZ.scene.renderer.getContext().isContextLost(),webgl:__AZ.state.webgl,view:document.querySelector(".ex-core")?.dataset.view})');
  await cdp.eval('lossExtension.restoreContext()');
  let restored = false;
  for(let i=0;i<40&&!restored;i++){await sleep(100);restored=await cdp.eval('!__AZ.scene.renderer.getContext().isContextLost()');}
  const fallback = await cdp.eval(`(()=>{__AZ.openRuntime();document.querySelector('[data-rt-act="new"]').click();document.querySelector('[data-rt-act="step"]').click();return {webgl:__AZ.state.webgl,view:document.querySelector('.ex-core')?.dataset.view,steps:__AZ.runtimeApi().currentRun().summary.steps}})()`);
  await cdp.send('Page.reload', { ignoreCache: false });
  if (!await waitReady(cdp)) throw Error('App not ready after context recovery reload');
  const reloaded = await cdp.eval('({webgl:__AZ.state.webgl,scene:__AZ.scene.ok,kind:__AZ.workspaceKind()})');
  const result = { visibilityPass, hiddenStart, hiddenEnd, resumed, lost, restored, fallback, reloaded };
  await mkdir('verify/m32',{recursive:true});
  await writeFile('verify/m32/visibility-restore.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
  if (!visibilityPass || !lost.lost || lost.webgl !== false || lost.view !== '2d' || !restored || fallback.webgl !== false || fallback.view !== '2d' || fallback.steps !== 1 || !reloaded.webgl || !reloaded.scene) throw Error('Visibility or restored-context fallback verification failed');
} finally {
  if (cdp) { await cdp.send('Browser.close').catch(() => {}); cdp.ws.close(); }
  proc.kill(); server.close();
}
