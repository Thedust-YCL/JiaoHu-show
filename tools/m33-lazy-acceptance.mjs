/** Isolated production-subpath and offline regression for deferred labs. */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { CDP, waitReady } from './m14-acceptance.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [], requests = [];
let failNext = false, delayChunks = false;
const root = path.resolve('dist');
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (!pathname.startsWith('/agent-zero/')) return res.writeHead(404).end();
  const file = path.resolve(root, pathname.slice('/agent-zero/'.length) || 'index.html');
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  if (pathname.includes('/chunk-') && failNext) {
    failNext = false; requests.push({ pathname, status: 503, intentional: true });
    return res.writeHead(503).end('simulated failure');
  }
  if (pathname.includes('/chunk-') && delayChunks) await sleep(1000);
  try {
    const body = await readFile(file);
    requests.push({ pathname, status: 200 });
    res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html', 'Cache-Control': 'no-store' }).end(body);
  } catch { requests.push({ pathname, status: 404 }); res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(8197, '127.0.0.1', resolve));
const proc = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9387', `--user-data-dir=${path.join(os.tmpdir(), `az-m33-${Date.now()}`)}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank',
], { stdio: 'ignore' });
let cdp;
try {
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch('http://127.0.0.1:9387/json/list')).json()).find(t => t.type === 'page'); } catch {}
  }
  if (!target) throw Error('Chrome not ready');
  const ws = await new Promise((resolve, reject) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    socket.addEventListener('open', () => resolve(socket), { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  cdp = new CDP(ws);
  for (const domain of ['Page.enable', 'Runtime.enable', 'Network.enable']) await cdp.send(domain);
  const ev = code => cdp.eval(`(async()=>{${code}})()`, true);
  const check = async (name, fn) => {
    try { const value = await fn(); results.push({ name, pass: !!value, value }); }
    catch (error) { results.push({ name, pass: false, error: error.message }); }
    console.log(`${results.at(-1).pass ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(results.at(-1))}`);
  };
  const navigate = async url => { await cdp.send('Page.navigate', { url }); if (!await waitReady(cdp)) throw Error('App not ready'); };
  await navigate('http://127.0.0.1:8197/agent-zero/');
  const entry = await readFile('dist/assets/app.js', 'utf8');
  const lazy = [...entry.matchAll(/import\(["']\.\/(chunk-[A-Z0-9]+\.js)["']\)/g)].map(m => m[1]);
  await check('first page does not request deferred lab entries', () => lazy.length >= 5 && !requests.some(r => lazy.some(name => r.pathname.endsWith(name))));
  await check('new user journey from boot to Journal', () => ev(`
    const wait=async kind=>{for(let i=0;i<100;i++){if(__AZ.workspaceKind()===kind)return true;await new Promise(r=>setTimeout(r,50));}throw Error('Missing '+kind)};
    document.querySelector('.boot__skip').click();
    [...document.querySelectorAll('button')].find(b=>b.textContent==='查看六章蓝图').click();
    await wait('story'); document.querySelector('.story-chapter [data-act="open-chapter-story"]').click();
    await wait('chapter'); document.querySelector('.ch-concept[data-concept="llm"]').click();
    await wait('knowledge'); document.querySelector('.workspace--knowledge [data-act="atlas"]').click();
    await wait('atlas'); document.querySelector('.atlas-list__item[data-concept="token"]').click();
    document.querySelector('.atlas-detail__learn').click(); await wait('knowledge');
    [...document.querySelectorAll('.learning-nav button')].find(b=>b.textContent==='章节').click();
    await wait('story'); document.querySelector('.story-chapter [data-act="open-chapter-story"]').click();
    await wait('chapter'); document.querySelector('[data-act="run-experiment"]').click();
    await wait('lab-token'); document.querySelector('[data-encoding="o200k_base"]').click();
    [...document.querySelectorAll('.learning-nav button')].find(b=>b.textContent==='章节').click();
    await wait('story'); document.querySelector('.story-chapter [data-act="open-chapter-story"]').click(); await wait('chapter');
    [...document.querySelectorAll('.learning-nav button')].find(b=>b.textContent==='学习日志').click(); await wait('journal');
    return __AZ.journal.events().some(e=>e.type==='lab_completed') && __AZ.journal.events().some(e=>e.type==='concept_viewed');
  `));
  await cdp.send('Page.reload', { ignoreCache: true });
  if (!await waitReady(cdp)) throw Error('Journal reload failed');
  await check('journey progress survives refresh', () => ev(`return __AZ.workspaceKind()==='journal' && __AZ.journal.events().some(e=>e.type==='lab_completed');`));
  const labs = [
    ['exp-token-lab', 'lab-token'], ['exp-context-lab', 'lab-context'], ['exp-retrieval-lab', 'lab-knowledge'],
    ['exp-agent-loop-lab', 'lab-runtime'], ['exp-boundary-lab', 'lab-reliability'],
  ];
  for (const [id, kind] of labs) await check(`open ${id}`, () => ev(`await __AZ.openLabExperiment(${JSON.stringify(id)}); return __AZ.workspaceKind()===${JSON.stringify(kind)};`));
  await navigate('http://127.0.0.1:8197/agent-zero/');
  await ev(`__AZ.skipIntro('m33-race')`);
  delayChunks = true;
  const race = await ev(`__AZ.openLabExperiment('exp-token-lab'); __AZ.openStory(); await new Promise(r=>setTimeout(r,1600)); return __AZ.workspaceKind();`);
  delayChunks = false;
  await check('slow request cannot replace newer navigation', () => race === 'story');
  await navigate('http://127.0.0.1:8197/agent-zero/');
  await ev(`__AZ.skipIntro('m33-failure')`);
  const savedIds = await ev(`__AZ.configurationActions.useExample('starter',true); __AZ.configurationActions.save(true); return __AZ.savedConfigurations().map(c=>c.configId);`);
  failNext = true;
  await ev(`await __AZ.openLabExperiment('exp-boundary-lab');`);
  await check('failed chunk exposes a recovery action', () => ev(`const b=[...document.querySelectorAll('.workspace--lab-loading button')].find(x=>x.textContent==='重新载入页面'); return !!document.querySelector('.workspace--lab-loading [role="alert"]') && !!b && !b.hidden;`));
  await ev(`[...document.querySelectorAll('.workspace--lab-loading button')].find(x=>x.textContent==='重新载入页面').click();`);
  await sleep(500);
  let recovered = false;
  for (let i = 0; i < 60 && !recovered; i++) {
    await sleep(150);
    try { recovered = await ev(`return window.__AZ?.workspaceKind()==='lab-reliability'`); } catch {}
  }
  await check('recovery action really reopens the failed lab', () => recovered);
  await check('recovery preserves saved configuration', () => ev(`return JSON.stringify(__AZ.savedConfigurations().map(c=>c.configId))===${JSON.stringify(JSON.stringify(savedIds))};`));
  // A distinct document URL exercises a direct load, not a hash-only navigation.
  await navigate('http://127.0.0.1:8197/agent-zero/?deep=1#/labs/exp-token-lab');
  const waitKind = async kind => {
    for (let i = 0; i < 60; i++) {
      if (await ev(`return __AZ.workspaceKind()===${JSON.stringify(kind)}`)) return true;
      await sleep(100);
    }
    return false;
  };
  await check('direct subpath lab deep link', () => waitKind('lab-token'));
  await cdp.send('Page.reload', { ignoreCache: true });
  if (!await waitReady(cdp)) throw Error('Deep link reload failed');
  await check('deep link reload restores the lab', () => waitKind('lab-token'));
  await ev(`__AZ.openStory(); history.back();`);
  await check('browser back restores the loaded lab', () => waitKind('lab-token'));
  await ev(`history.forward();`);
  await check('browser forward restores Story', () => waitKind('story'));
  await check('no unexpected static resource failures', () => requests.every(r => r.status === 200 || r.intentional));
  await navigate('file:///' + path.resolve('index.html').replace(/\\/g, '/'));
  await check('offline file opens lab synchronously', () => ev(`__AZ.skipIntro('offline'); __AZ.openLabExperiment('exp-token-lab'); return __AZ.workspaceKind()==='lab-token';`));
} catch (error) { results.push({ name: 'harness', pass: false, error: error.stack }); console.error(error); }
finally {
  await mkdir('verify/m33', { recursive: true });
  await writeFile('verify/m33/lazy-acceptance.json', JSON.stringify({ results, requests, console: cdp?.console || [] }, null, 2));
  try { await cdp?.send('Browser.close'); } catch {}
  proc.kill(); server.close();
}
console.log(`${results.filter(r => r.pass).length}/${results.length} passed`);
if (results.some(r => !r.pass)) process.exitCode = 1;
