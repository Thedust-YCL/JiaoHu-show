/** M3.1 focused browser regressions for Atlas, Runtime and A/B workspace state. */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { CDP, waitReady } from './m14-acceptance.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rows = [];
const outputDir = path.resolve('verify/m31-workspace');
const appPort = 8189;
const debugPort = 9369;
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const rel = url.pathname.replace(/^\/agent-zero\/?/, '') || 'index.html';
    const root = path.resolve('dist');
    const file = path.resolve(root, rel);
    if (!file.startsWith(`${root}${path.sep}`)) return res.writeHead(403).end();
    const body = await readFile(file);
    res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(appPort, '127.0.0.1', resolve));

const chrome = spawn(
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${path.join(os.tmpdir(), `az0-m31-workspace-${Date.now()}`)}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    '--mute-audio',
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--window-size=1440,900',
    'about:blank',
  ],
  { stdio: 'ignore' }
);

let cdp;
try {
  let target;
  for (let i = 0; i < 50 && !target; i += 1) {
    await sleep(200);
    try {
      target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((item) => item.type === 'page');
    } catch {}
  }
  if (!target) throw new Error('Chrome not ready');
  const socket = await new Promise((resolve, reject) => {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    ws.addEventListener('open', () => resolve(ws), { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  cdp = new CDP(socket);
  for (const name of ['Page.enable', 'Runtime.enable']) await cdp.send(name);
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}/agent-zero/` });
  if (!(await waitReady(cdp))) throw new Error('App not ready');
  const evaluate = (code) => cdp.eval(`(async()=>{${code}})()`, true);
  const key = async (key, code = key, virtual = key === 'Enter' ? 13 : undefined, modifiers = 0) => {
    for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: virtual, modifiers, ...(key === 'Enter' && type === 'keyDown' ? { text: '\r' } : {}) });
  };
  const check = async (id, code) => {
    try {
      const result = await evaluate(code);
      rows.push({ id, pass: result === true || result?.pass === true, note: result?.note || JSON.stringify(result) });
    } catch (error) {
      rows.push({ id, pass: false, note: error.message });
    }
    const row = rows.at(-1);
    console.log(`${row.pass ? 'PASS' : 'FAIL'} ${id} ${row.note}`);
  };

  await evaluate(`__AZ.skipIntro('M31');localStorage.clear();__AZ.goHub();`);
  await check('atlas-view-state-roundtrip', `
    __AZ.openAtlas();
    const graph=__AZ.atlasApi().graph;
    graph.zoomBy(1.4,220,180);
    const expected=graph.getViewState();
    graph.resetView();
    graph.restoreViewState(expected);
    const actual=graph.getViewState();
    return {pass:Math.abs(actual.k-expected.k)<0.0001&&Math.abs(actual.x-expected.x)<0.01&&Math.abs(actual.y-expected.y)<0.01,note:JSON.stringify({expected,actual})};
  `);
  await check('atlas-return-restores-context', `
    const api=__AZ.atlasApi();
    const relation=document.querySelector('[data-filter="relation"]');
    relation.value='USES';relation.dispatchEvent(new Event('change'));
    api.search('MCP');
    api.graph.zoomBy(1.2,300,200);
    document.querySelector('.atlas-list').scrollTop=48;
    document.querySelector('.atlas-detail__scroll').scrollTop=36;
    const before={selection:api.currentSelection(),view:api.graph.getViewState(),query:document.querySelector('.atlas-search__input').value,relation:relation.value};
    document.querySelector('[data-act="learn"]').click();
    document.querySelector('[data-act="return"]').click();
    const next=__AZ.atlasApi();
    const after={selection:next.currentSelection(),view:next.graph.getViewState(),query:document.querySelector('.atlas-search__input').value,relation:document.querySelector('[data-filter="relation"]').value};
    return {pass:JSON.stringify(before)===JSON.stringify(after),note:JSON.stringify({before,after})};
  `);

  await check('runtime-history-focus-and-selection', `
    __AZ.configurationActions.useExample('starter',true);
    __AZ.openRuntime();
    const api=__AZ.runtimeApi();api.newRun();
    document.querySelector('[data-rt-act="step"]').click();
    const history=document.querySelector('[data-rt-history]');history.focus();history.click();
    const focusKept=document.activeElement?.dataset?.rtHistory===history.dataset.rtHistory;
    const firstStep=document.querySelector('[data-rt-step]');firstStep.click();
    const event=document.querySelector('[data-rt-event]');if(event)event.click();
    const before=api.selection();
    document.querySelector('[data-rt-concept]').click();
    document.querySelector('[data-act="return"]').click();
    const after=__AZ.runtimeApi().selection();
    return {pass:focusKept&&JSON.stringify(before)===JSON.stringify(after),note:JSON.stringify({focusKept,before,after})};
  `);
  await check('runtime-approval-enter-ready', `
    const scenario=document.querySelector('[aria-label="本地模拟场景"]');
    scenario.value='PERMISSION_REQUIRED';
    document.querySelector('[data-rt-act="new"]').click();
    const api=__AZ.runtimeApi();
    for(let i=0;i<60&&api.currentRun().status!=='waiting_approval';i++)document.querySelector('[data-rt-act="step"]').click();
    const approve=document.querySelector('[data-rt-act="approve"]');
    approve?.focus();
    return {pass:!!approve&&api.currentRun().status==='waiting_approval'&&document.activeElement===approve,note:JSON.stringify({status:api.currentRun().status,focus:document.activeElement?.dataset?.rtAct})};
  `);
  await key('Enter');
  await check('runtime-approval-enter-focus', `
    const run=__AZ.runtimeApi().currentRun();
    return {pass:run.summary.approvals===1&&document.activeElement?.dataset?.rtAct==='step',note:JSON.stringify({approvals:run.summary.approvals,status:run.status,focus:document.activeElement?.dataset?.rtAct})};
  `);
  await check('runtime-export-failure-feedback', `
    const original=URL.createObjectURL;
    URL.createObjectURL=()=>{throw new Error('download blocked');};
    document.querySelector('[data-rt-act="export"]').click();
    URL.createObjectURL=original;
    const text=document.querySelector('.rt-notice').textContent;
    return {pass:text.includes('无法导出')&&text.includes('download blocked'),note:text};
  `);

  await check('comparison-unsaved-confirmation', `
    __AZ.openComparison();
    document.querySelector('[data-ab-act="run"]').click();
    await new Promise(resolve=>setTimeout(resolve,120));
    const id=__AZ.comparisonApi().currentExperiment()?.experimentId;
    document.querySelector('[data-ab-act="new"]').click();
    await new Promise(resolve=>setTimeout(resolve,250));
    const dialog=document.querySelector('.confirm[data-open="true"]');
    const preserved=__AZ.comparisonApi().currentExperiment()?.experimentId===id;
    dialog?.querySelector('.btn:not(.btn--primary)')?.click();
    return {pass:!!dialog&&preserved,note:JSON.stringify({dialog:!!dialog,preserved})};
  `);
  await check('comparison-table-semantics-and-focus', `
    const api=__AZ.comparisonApi();
    document.querySelector('[data-ab-act="tab-config"]').click();
    const tables=[...document.querySelectorAll('.ab-table')];
    const semantic=tables.length>0&&tables.every(table=>table.parentElement?.classList.contains('ab-table-wrap')&&!!table.querySelector('tbody'))&&!document.querySelector('details>tr');
    document.querySelector('[data-ab-act="tab-report"]').click();
    const full=document.querySelector('[data-ab-act^="full-report-"]');
    if(full)full.click();
    await new Promise(resolve=>requestAnimationFrame(resolve));
    const focusRestored=!full||document.activeElement?.classList.contains('rp-doc__title');
    return {pass:semantic&&focusRestored,note:JSON.stringify({tables:tables.length,semantic,focus:document.activeElement?.className})};
  `);
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  await check('drawer-open-focus-and-background-inert', `
    __AZ.goHub();
    const trigger=document.querySelector('[aria-controls="az-dock"]');
    trigger.focus();trigger.click();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const dock=document.getElementById('az-dock');
    const focusables=[...dock.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(node=>!node.hidden&&getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden');
    focusables.at(-1)?.focus();
    globalThis.__m31Drawer={trigger,first:focusables[0],last:focusables.at(-1)};
    return {pass:dock.contains(document.activeElement)&&!dock.inert&&document.getElementById('az-main').inert&&document.querySelector('.topbar').inert,note:JSON.stringify({focus:document.activeElement?.textContent?.trim(),count:focusables.length})};
  `);
  await key('Tab','Tab',9);
  await check('drawer-tab-wrap', `return {pass:document.activeElement===__m31Drawer.first,note:document.activeElement?.textContent?.trim()};`);
  await key('Tab','Tab',9,8);
  await check('drawer-shift-tab-wrap', `return {pass:document.activeElement===__m31Drawer.last,note:document.activeElement?.textContent?.trim()};`);
  await key('Escape','Escape',27);
  await check('drawer-escape-restores-focus', `const dock=document.getElementById('az-dock');return {pass:document.activeElement===__m31Drawer.trigger&&dock.inert&&!document.getElementById('az-main').inert,note:JSON.stringify({focus:document.activeElement?.getAttribute('aria-controls'),dockInert:dock.inert})};`);
} catch (error) {
  console.error(error);
  rows.push({ id: 'harness', pass: false, note: error.stack });
} finally {
  try { await cdp?.send('Browser.close'); } catch {}
  chrome.kill();
  server.close();
}

await mkdir(outputDir,{recursive:true});
await writeFile(path.join(outputDir,'results.json'),JSON.stringify({generatedAt:new Date().toISOString(),rows},null,2));
await writeFile(path.join(outputDir,'probe.log'),`${rows.map(row=>`${row.pass?'PASS':'FAIL'} ${row.id} ${row.note}`).join('\n')}\n`);
console.log(`${rows.filter((row) => row.pass).length}/${rows.length} passed`);
if (rows.some((row) => !row.pass)) process.exitCode = 1;
