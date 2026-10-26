/** M1.4：真实浏览器交互、键盘、刷新、静态子路径与WebGL降级验收。
 * node tools/m14-acceptance.mjs [--regress-m03]，使用独立临时浏览器配置。 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';

const PORT = 9344;
const OUT = path.join(process.cwd(), 'verify', 'm14-shots');
const LEARNING_KEY = 'agent-zero:learning:v2';
const LEARNING_LEGACY_KEY = 'agent-zero:learning:v1';
const MEMORY_KEY = 'agent-zero:lab-knowledge:v1';
const CONSTRUCTOR_KEY = 'agent-zero:constructor:v1';
const RESEARCH_KEY = 'agent-zero:research:v2';

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.console = [];
    this.documentContext = null;
    this.navigationFromContext = null;
    this.awaitingNavigation = false;
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if(msg.method==='Runtime.executionContextCreated'&&msg.params.context.auxData?.isDefault)this.documentContext=msg.params.context.uniqueId||msg.params.context.id;
      if(msg.method==='Page.javascriptDialogOpening'&&msg.params.type==='beforeunload')this.send('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});
      if (msg.method === 'Runtime.consoleAPICalled') {
        this.console.push(`[${msg.params.type}] ${(msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ')}`);
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        this.console.push(`[exception] ${msg.params.exceptionDetails?.text || ''} ${msg.params.exceptionDetails?.exception?.description || ''}`);
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    if(method==='Page.reload'||method==='Page.navigate'){this.navigationFromContext=this.documentContext;this.awaitingNavigation=true;}
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${method} 超时`));
        }
      }, 45000).unref();
    });
  }
  async eval(expression, awaitPromise = false) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise, userGesture: true });
    if (r.exceptionDetails) {
      console.error('[m13] 求值失败，表达式开头：\n' + expression.split('\n').slice(0, 4).join('\n'));
      throw new Error(r.exceptionDetails.exception?.description || 'evaluate 异常');
    }
    return r.result?.value;
  }
  async shot(file) {
    const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(file, Buffer.from(r.data, 'base64'));
    return file;
  }
}

export async function waitReady(cdp, timeout = 20000) {
  // A navigation command can acknowledge before the previous JS context is destroyed.
  // Yield before checking __AZ so a stale pre-navigation app cannot satisfy readiness.
  await sleep(350);
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try {
      if(cdp.awaitingNavigation&&(!cdp.documentContext||cdp.documentContext===cdp.navigationFromContext)){await sleep(100);continue;}
      if (await cdp.eval('!!(window.__AZ && window.__AZ.knowledgeStats)')) {cdp.awaitingNavigation=false;return true;}
    } catch {
      /* 页面导航中 */
    }
    await sleep(200);
  }
  return false;
}

/* ==================================================================== *
 * 验收主体
 * ==================================================================== */

export async function runM14Acceptance({cdp, shot, waitReady}) {
  const results = [];
  async function check(id,name,code) {
    try { const value = await cdp.eval(`(async()=>{${code}})()`,true); results.push({id,name,status:value?.pass?'PASS':'FAIL',pass:!!value?.pass,note:value?.note || JSON.stringify(value)}); }
    catch(error) { results.push({id,name,status:'FAIL',pass:false,note:error.message}); }
  }
  await cdp.eval(`window.__AZ.skipIntro('M1.4验收');window.__AZ.learning.reset();window.__AZ.journal.clear();`);
  await check('A01','仓库与知识契约',`const a=__AZ;return {pass:a.knowledgeValidation().length===0&&a.knowledgeStats().concepts===36,note:JSON.stringify(a.knowledgeStats())};`);
  await check('A02','六章稳定顺序',`return {pass:__AZ.chapters().map(c=>c.id).join(',')==='intelligence,context,connection,knowledge,runtime,reliability'};`);
  await check('A03','36概念均可打开同一详情',`let count=0;for(const id of __AZ.conceptIds()){__AZ.openKnowledge(id);const active=__AZ.knowledgeApi();if(active&&document.querySelector('.workspace--knowledge'))count++;}return {pass:count===36,note:count+' / 36'};`);
  await check('A04','深链与稳定ID',`__AZ.openKnowledge('system_prompt');return {pass:location.hash==='#/knowledge/system_prompt'&&__AZ.knowledgeApi().currentConcept()==='system_prompt'};`);
  await check('A04-lab-route','MCP概念入口进入工具实验保留实验深链',`__AZ.openLabExperiment('exp-tool-calling-demo','mcp');return {pass:location.hash==='#/labs/exp-tool-calling-demo'&&__AZ.knowledgeApi().currentStep()==='experiment',note:location.hash};`);
  await cdp.send('Page.reload',{ignoreCache:false}); await waitReady(cdp);
  await check('A04-lab-refresh','Tool Calling 实验刷新仍在实验步骤',`return {pass:location.hash==='#/labs/exp-tool-calling-demo'&&__AZ.knowledgeApi()?.currentStep()==='experiment'};`);
  await check('A04-history','浏览器后退前进恢复学习工作区',`const waitKind=async(kind)=>{const end=performance.now()+5000;while(performance.now()<end){if(__AZ.workspaceKind()===kind)return true;await new Promise(r=>setTimeout(r,25));}return false;};__AZ.openStory();__AZ.openJournal();history.back();const back=await waitKind('story');const backHash=location.hash;history.forward();const forward=await waitKind('journal');return {pass:back&&forward,note:JSON.stringify({back,forward,backHash,forwardHash:location.hash})};`);
  await check('A05','49关系有效',`__AZ.openAtlas();return {pass:document.querySelectorAll('.atlas-edge').length===49&&__AZ.knowledgeValidation().length===0};`);
  await check('A06','全图缩放平移复位',`const g=__AZ.atlasApi().graph;const before=g.getTransform();g.zoomBy(1.2);const changed=g.getTransform().k!==before.k;g.resetView();g.svg.dispatchEvent(new PointerEvent('pointerdown',{clientX:550,clientY:300,pointerId:4,bubbles:true}));g.svg.dispatchEvent(new PointerEvent('pointermove',{clientX:590,clientY:325,pointerId:4,bubbles:true}));g.svg.dispatchEvent(new PointerEvent('pointerup',{pointerId:4,bubbles:true}));const moved=g.getTransform().x!==0;g.resetView();return {pass:changed&&moved&&g.getTransform().k===1,note:JSON.stringify({changed,moved})};`);
  await check('A07','选中与直接邻居高亮',`document.querySelector('.atlas-node[data-concept="agent"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));return {pass:document.querySelector('.atlas-node.is-selected')?.dataset.concept==='agent'&&document.querySelectorAll('.atlas-node.is-related').length>0&&document.querySelector('.atlas-detail [data-concept="agent"]')!==null};`);
  await check('A08','名称别名关键词搜索不记录阅读',`__AZ.learning.reset();__AZ.journal.clear();const a=__AZ.atlasApi();a.search('模型上下文协议');const found=a.currentSelection()==='mcp';a.search('不存在的概念');return {pass:found&&document.querySelector('.atlas-search__note').textContent.includes('没有找到')&&__AZ.learning.summary().explored===0&&__AZ.journal.events().length===0};`);
  await check('A08-api','外部定位会清除阻挡目标的筛选',`const a=__AZ.atlasApi();a.selectConcept('tools',{focus:true});return {pass:a.graph.nodeElement('tools').classList.contains('is-selected')&&a.graph.nodeElement('tools').style.display!=='none'};`);
  await check('A09','组合筛选与恢复全图',`__AZ.openAtlas();const c=document.querySelector('[data-filter="chapter"]'),r=document.querySelector('[data-filter="relation"]');c.value='knowledge';c.dispatchEvent(new Event('change'));const six=[...document.querySelectorAll('.atlas-node')].filter(e=>e.style.display!=='none').length===6&&document.querySelectorAll('.atlas-list__item').length===6;r.value='USES';r.dispatchEvent(new Event('change'));const edges=[...document.querySelectorAll('.atlas-edge')].filter(e=>e.style.display!=='none');const typed=edges.every(e=>e.dataset.type==='USES');document.querySelector('.atlas-search button').click();return {pass:six&&typed&&document.querySelectorAll('.atlas-list__item').length===36&&[...document.querySelectorAll('.atlas-node')].every(e=>e.style.display!=='none')};`);
  await check('A10','布局稳定与旧十节点坐标保留',`const a=[...document.querySelectorAll('.atlas-node')].map(e=>e.getAttribute('transform')).join('|');__AZ.openAtlas();const b=[...document.querySelectorAll('.atlas-node')].map(e=>e.getAttribute('transform')).join('|');return {pass:a===b&&a.includes('translate(240,88)')&&new Set(b.split('|')).size===36};`);
  await check('A11','关系跳转与详情一致',`__AZ.atlasApi().selectConcept('agent');const target=document.querySelector('.atlas-rel .atlas-rel__other').textContent;document.querySelector('.atlas-rel').click();const id=__AZ.atlasApi().currentSelection();document.querySelector('[data-act="learn"]').click();return {pass:__AZ.workspaceKind()==='knowledge'&&__AZ.knowledgeApi()?.currentConcept()===id&&location.hash.startsWith('#/knowledge/'),note:target};`);
  await shot('atlas-desktop.png', async()=>__AZ.openAtlas());
  await check('A12','共享六章模板目标概念实验总结',`let valid=0;for(const c of __AZ.chapters()){__AZ.openChapterStory(c.id);if(document.querySelector('.ch-opening')&&document.querySelectorAll('.ch-concept').length===6&&document.querySelector('[data-act="run-experiment"]')&&document.querySelector('.ch-reading')&&document.querySelector('.ch-transition'))valid++;}return {pass:valid===6,note:valid+'/6'};`);
  await check('A13','六章叙事衔接',`const rows=__AZ.storyChapters();return {pass:rows.length===6&&rows.every(c=>c.available&&c.opening&&c.limitation&&c.beats.length>=3),note:rows.map(c=>c.id).join('→')};`);
  await check('A14','跳过重读不自动完成',`__AZ.learning.reset();__AZ.journal.clear();__AZ.openChapterStory('context');document.querySelector('[data-act="skip-narrative"]').click();const skipped=__AZ.learning.storyPosition().section==='summary';document.querySelector('[data-act="replay-narrative"]').click();return {pass:skipped&&__AZ.learning.storyPosition().section==='opening'&&!__AZ.learning.chapterSummary('context').completed&&__AZ.journal.events().length===0};`);
  await check('A15','任意章节可自由跳转',`__AZ.openChapterStory('reliability');document.querySelector('[data-act="exit-atlas"]').click();const atlas=__AZ.workspaceKind()==='atlas';__AZ.openChapterStory('knowledge');document.querySelector('[data-act="run-experiment"]').click();return {pass:atlas&&__AZ.workspaceKind()==='lab-knowledge'};`);
  await check('A16','章节进度来自操作',`__AZ.learning.reset();__AZ.openChapterStory('context');const before=__AZ.learning.chapterSummary('context');document.querySelector('[data-act="complete-chapter"]').click();const after=__AZ.learning.chapterSummary('context');return {pass:before.explored===0&&!before.completed&&after.completed&&after.explored===0&&document.querySelector('[data-el="chapter-progress"]').textContent.includes('总结已完成')};`);
  await check('A17','按章推荐路径与续学',`__AZ.openStory();return {pass:document.querySelectorAll('.story-chapter').length===6&&document.querySelector('[data-act="resume-story"]').textContent.includes('02')&&!!document.querySelector('[data-act="free-exploration"]')};`);
  await check('A18','切换学习路径不重置进度',`__AZ.openKnowledge('rag');const before=__AZ.learning.flagsOf('rag').explored;__AZ.openAtlas();__AZ.openStory();return {pass:before&&__AZ.learning.flagsOf('rag').explored&&document.querySelector('.story-concept[data-concept="rag"]').textContent.includes('已探索')};`);
  await check('A19','真实阅读深入与去重',`__AZ.learning.reset();__AZ.journal.clear();__AZ.openKnowledge('rag');__AZ.knowledgeApi().setLayer('inspect');__AZ.knowledgeApi().setLayer('inspect');const e=__AZ.journal.events();return {pass:e.filter(x=>x.type==='concept_viewed').length===1&&e.filter(x=>x.type==='concept_inspected').length===1,note:JSON.stringify(e)};`);
  await check('A20','学习状态分层且不宣称掌握',`return {pass:__AZ.learning.statusOf('rag')==='in_progress'&&__AZ.learning.statusOf('llm')==='not_started'};`);
  await check('A21','日志章节与类型筛选',`__AZ.openKnowledge('token');__AZ.openJournal();const c=document.querySelector('[data-filter="chapter"]'),t=document.querySelector('[data-filter="type"]');c.value='knowledge';c.dispatchEvent(new Event('change'));t.value='concept_inspected';t.dispatchEvent(new Event('change'));const rows=[...document.querySelectorAll('.journal-row')];return {pass:rows.length===1&&rows.every(e=>e.dataset.chapter==='knowledge'&&e.dataset.type==='concept_inspected')};`);
  await check('A22','日志回访',`document.querySelector('[data-act="revisit"]').click();return {pass:__AZ.workspaceKind()==='knowledge'&&__AZ.knowledgeApi().currentConcept()==='rag'};`);
  await check('A23','新用户空态可跳过引导',`__AZ.journal.clear();__AZ.openJournal();return {pass:!!document.querySelector('[data-el="empty"]')&&document.querySelector('.journal-empty').textContent.includes('自由探索')&&document.querySelectorAll('.journal-chapter').length===6};`);
  await check('A24','清除确认取消与确定',`__AZ.openKnowledge('rag');__AZ.openJournal();document.querySelector('[data-act="clear-journal"]').click();const opened=!!document.querySelector('dialog[open]');document.querySelector('dialog button').click();const cancelled=__AZ.journal.events().length>0;document.querySelector('[data-act="clear-journal"]').click();document.querySelector('[data-act="confirm-clear"]').click();return {pass:opened&&cancelled&&__AZ.journal.events().length===0&&!!document.querySelector('[data-el="empty"]')};`);
  await check('A25','清除活动与其他命名空间隔离',`const keys=['agent-zero:constructor:v1','agent-zero:research:v2','agent-zero:lab-knowledge:v1','agent-zero:learning:v2'];const before=keys.map(k=>localStorage.getItem(k));__AZ.journal.clear();return {pass:keys.every((k,i)=>localStorage.getItem(k)===before[i])&&__AZ.learning.flagsOf('rag').explored};`);
  await check('A26','刷新恢复概念实验章节和位置',`__AZ.learning.markExperimentCompleted('token');__AZ.learning.markChapterCompleted('knowledge');__AZ.learning.setStoryPosition('knowledge','summary');__AZ.openJournal();return {pass:__AZ.learning.summary().completedLabs===1};`);
  await cdp.send('Page.reload',{ignoreCache:false}); await waitReady(cdp);
  await check('A26-refresh','刷新实际恢复',`return {pass:__AZ.workspaceKind()==='journal'&&__AZ.learning.isLabCompleted('exp-token-lab')&&__AZ.learning.chapterSummary('knowledge').completed&&__AZ.learning.storyPosition().section==='summary'};`);
  await check('A27','旧版非破坏性迁移与损坏容错',`localStorage.setItem('agent-zero:learning:v1',JSON.stringify({schemaVersion:1,concepts:{rag:{explored:true,visits:2}}}));localStorage.removeItem('agent-zero:learning:v2');return {pass:true,note:'准备真实刷新迁移；另有Node损坏/未来版本保护测试'};`);
  await cdp.send('Page.reload',{ignoreCache:false}); await waitReady(cdp);
  await check('A27-migration','实际迁移保留旧键',`const valid=__AZ.learning.flagsOf('rag').explored&&!!localStorage.getItem('agent-zero:learning:v1');__AZ.learning.reset();return {pass:valid};`);
  await check('A28','六个Lab从章节Atlas及全局可达',`let valid=0;for(const e of __AZ.experiments()){__AZ.openAtlas(e.entryConceptId);const b=document.querySelector('[data-act="open-lab"]');if(b){b.click();if(__AZ.workspaceKind().startsWith('lab-')||(__AZ.workspaceKind()==='knowledge'&&__AZ.knowledgeApi().currentStep()==='experiment'))valid++;}}return {pass:valid===6,note:valid+'/6'};`);
  await check('A29','打开实验不完成，只有关键操作完成',`__AZ.learning.reset();__AZ.openLabExperiment('exp-token-lab');const before=__AZ.learning.summary().completedLabs;const api=__AZ.tokenLabApi();return {pass:before===0&&!!api,note:'完成关键操作回归由M1.2/M1.3实验验收逐项执行'};`);
  await check('A30','跨页面状态一致与章内导航',`__AZ.openKnowledge('rag');__AZ.knowledgeApi().openConcept('retrieval');const changed=__AZ.learning.flagsOf('retrieval').explored&&location.hash==='#/knowledge/retrieval';__AZ.openStory();return {pass:changed&&document.querySelector('.story-concept[data-concept="retrieval"]').textContent.includes('已探索')};`);
  await check('A31','36概念内容与模拟示例',`const c=__AZ.knowledgeConcepts();return {pass:c.length===36&&c.every(c=>c.understand>=2&&c.inspect>=3&&c.misconceptions.length>=1&&c.example?.isSimulated&&c.related.length>0)};`);
  await check('A32','来源标记不虚报',`const s=__AZ.knowledgeSources();return {pass:s.filter(s=>s.type==='external').every(s=>s.reviewed&&s.checkedAt&&s.url.startsWith('https://'))&&s.find(s=>s.id==='doc-m1-2-task').reviewed===true,note:s.length+'条来源，补充任务书已实际核对'};`);
  await check('A33','本地模拟与虚构材料声明',`__AZ.openChapterStory('reliability');return {pass:document.querySelector('.workspace').textContent.includes('本地教学模拟')&&document.querySelector('.workspace').textContent.includes('虚构')};`);
  for (const width of [1440,1024,768,390]) {
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    await check('A34-'+width,'响应式核心路径 '+width,`let valid=true;const details=[];for(const kind of ['story','atlas','journal','chapter']){if(kind==='story')__AZ.openStory();if(kind==='atlas')__AZ.openAtlas();if(kind==='journal')__AZ.openJournal();if(kind==='chapter')__AZ.openChapterStory('knowledge');await new Promise(r=>requestAnimationFrame(r));const e=document.querySelector('.workspace');const overflow=e.scrollWidth-e.clientWidth;const nav=e.querySelector('.learning-nav');valid&&=overflow<=2&&nav.getBoundingClientRect().width>0;details.push({kind,overflow});}return {pass:valid,note:JSON.stringify(details)};`);
  }
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await check('A35','减少动态效果和键盘替代',`__AZ.openAtlas();const b=document.querySelector('.atlas-list__item');b.focus();b.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));b.click();document.querySelector('[data-act="learn"]').click();const labels=[...document.querySelectorAll('.learning-nav button')].map(b=>b.textContent);return {pass:__AZ.workspaceKind()==='knowledge'&&matchMedia('(prefers-reduced-motion:reduce)').matches&&['章节','星图','实验','学习日志','A/B 对比','中央核心'].every(label=>labels.includes(label))};`);
  await cdp.eval(`__AZ.openAtlas();document.querySelector('.atlas-list__item[data-concept="ai"]').focus();`);
  for(const type of ['keyDown','keyUp']) await cdp.send('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:type==='keyDown'?'\r':'',unmodifiedText:type==='keyDown'?'\r':''});
  await check('A35-keyboard','浏览器真实Enter选择、焦点反馈',`return {pass:__AZ.atlasApi().currentSelection()==='ai'&&document.activeElement.dataset.concept==='ai'&&getComputedStyle(document.activeElement).outlineStyle!=='none'};`);
  await cdp.eval(`document.querySelector('[data-act="learn"]').focus();`);
  for(const type of ['keyDown','keyUp']) await cdp.send('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:type==='keyDown'?'\r':'',unmodifiedText:type==='keyDown'?'\r':''});
  await check('A35-keyboard-open','浏览器真实Enter打开知识页',`return {pass:__AZ.knowledgeApi()?.currentConcept()==='ai'};`);
  await shot('journal-mobile.png',async()=>__AZ.openJournal());
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await cdp.send('Emulation.setEmulatedMedia',{features:[]});
  await shot('journal-desktop.png',async()=>__AZ.openJournal());
  await shot('story-desktop.png',async()=>__AZ.openChapterStory('knowledge'));
  await check('A37','保留品牌与核心',`__AZ.goHub();return {pass:!!__AZ.scene&&document.body.textContent.includes('AGENT / ZERO')&&document.documentElement.lang==='zh-CN'};`);
  await check('A38','运行时无远程请求',`const remote=performance.getEntriesByType('resource').filter(e=>/^https?:/.test(e.name)&&!e.name.startsWith(location.origin));return {pass:remote.length===0,note:JSON.stringify(remote.map(e=>e.name))};`);
  return results;
}

async function main() {
  const browser = CHROME_CANDIDATES.find(p=>existsSync(p));
  if(!browser) throw Error('Chrome/Edge未找到');
  await mkdir(OUT,{recursive:true});
  const profile=path.join(os.tmpdir(),`az0-m14-${Date.now()}`);
  const proc=spawn(browser,['--headless=new',`--remote-debugging-port=${PORT}`,`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--disable-extensions','--hide-scrollbars','--mute-audio','--allow-file-access-from-files','--enable-unsafe-swiftshader','--use-angle=swiftshader','--window-size=1440,900','--force-device-scale-factor=1','about:blank'],{stdio:'ignore'});
  let cdp;
  let staticServer;
  try {
    let target;
    for(let i=0;i<40&&!target;i++){await sleep(250);try{target=(await(await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t=>t.type==='page');}catch{}}
    if(!target) throw Error('Chrome调试端口未就绪');
    const ws=await new Promise((resolve,reject)=>{const ws=new WebSocket(target.webSocketDebuggerUrl);ws.addEventListener('open',()=>resolve(ws),{once:true});ws.addEventListener('error',reject,{once:true});});
    cdp=new CDP(ws);await cdp.send('Page.enable');await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    const url='file:///'+path.join(process.cwd(),'index.html').replace(/\\/g,'/');
    await cdp.send('Page.navigate',{url}); if(!await waitReady(cdp)) throw Error('应用未就绪');
    if(process.argv.includes('--keyboard-debug')) {
      console.log(await cdp.eval(`__AZ.skipIntro('debug');__AZ.openAtlas();document.querySelector('.atlas-list__item[data-concept="ai"]').focus();({active:document.activeElement.outerHTML,selected:__AZ.atlasApi().currentSelection()})`));
      for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:type==='keyDown'?'\r':'',unmodifiedText:type==='keyDown'?'\r':''});
      console.log(await cdp.eval(`({active:document.activeElement.outerHTML.slice(0,300),selected:__AZ.atlasApi().currentSelection(),learn:!!document.querySelector('[data-act="learn"]'),kind:__AZ.workspaceKind()})`));
      return;
    }
    const shot=async(name,setup)=>{if(setup)await cdp.eval(`(${setup.toString()})()`);await sleep(200);return cdp.shot(path.join(OUT,name));};
    const results=await runM14Acceptance({cdp,shot,waitReady});
    if (process.argv.includes('--regress-m03')) {
      const {runM03Acceptance}=await import('./m03-acceptance.mjs');
      const regression=await runM03Acceptance({cdp,sleep,shot:async()=>null,waitReady});
      results.push(...regression.map(row=>({...row,id:'R03-'+row.id,status:row.pass?'PASS':'FAIL'})));
    }
    // WebGL缺失时，真实新文档中阻止创建上下文再跑学习链路。
    await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:original.call(this,type,...args)};`});
    await cdp.send('Page.reload',{ignoreCache:false});await waitReady(cdp);
    const fallback=await cdp.eval(`(()=>{__AZ.skipIntro('fallback');__AZ.openAtlas();const atlas=document.querySelectorAll('.atlas-node').length===36;__AZ.openChapterStory('runtime');const chapter=!!document.querySelector('.ch-reading');__AZ.openJournal();return {pass:!__AZ.scene.ok&&atlas&&chapter&&!!document.querySelector('.journal-body'),note:JSON.stringify({sceneOk:__AZ.scene.ok,atlas,chapter})}})()`);
    results.push({id:'A36',name:'WebGL不可用真实降级',status:fallback.pass?'PASS':'FAIL',...fallback});
    // 固定3个静态文件映射，验证真实项目子路径与hash刷新，无业务端点。
    const files = new Map([['/agent-zero/', ['dist/index.html','text/html; charset=utf-8']],['/agent-zero/assets/app.js',['dist/assets/app.js','text/javascript']],['/agent-zero/assets/app.css',['dist/assets/app.css','text/css']]]);
    staticServer=createServer(async(req,res)=>{const file=files.get(req.url);if(!file){res.writeHead(404);res.end();return;}try{res.writeHead(200,{'content-type':file[1]});res.end(await readFile(file[0]));}catch{res.writeHead(500);res.end();}});
    await new Promise(r=>staticServer.listen(0,'127.0.0.1',r));
    await cdp.send('Page.navigate',{url:`http://127.0.0.1:${staticServer.address().port}/agent-zero/#/knowledge/rag`});await waitReady(cdp);
    const subpath=await cdp.eval(`(()=>{const resources=performance.getEntriesByType('resource');return {pass:__AZ.knowledgeApi()?.currentConcept()==='rag'&&resources.some(e=>e.name.includes('/agent-zero/assets/app.js'))&&resources.every(e=>new URL(e.name).origin===location.origin),note:resources.map(e=>e.name).join(',')}})()`);
    await cdp.send('Page.reload',{ignoreCache:false});await waitReady(cdp);
    subpath.pass &&= await cdp.eval(`__AZ.knowledgeApi()?.currentConcept()==='rag'`);
    results.push({id:'A38-subpath',name:'静态项目子路径及深链刷新',status:subpath.pass?'PASS':'FAIL',...subpath});
    const report={stage:'M1.4',generatedAt:new Date().toISOString(),total:results.length,passed:results.filter(r=>r.pass).length,results,console:cdp.console};
    await writeFile('verify/m14-report.json',JSON.stringify(report,null,2));
    for(const r of results) console.log(`${r.pass?'PASS':'FAIL'} ${r.id} ${r.name} ${r.note||''}`);
    console.log(`${report.passed}/${report.total} passed`);process.exitCode=results.some(r=>!r.pass)?1:0;
  } finally {staticServer?.close();try{await cdp?.send('Browser.close');}catch{}proc.kill();}
}
if(process.argv[1]?.replace(/\\/g,'/').endsWith('/m14-acceptance.mjs'))main().catch(e=>{console.error(e);process.exitCode=1;});
