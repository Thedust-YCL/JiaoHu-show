/**
 * tools/shots.mjs
 * ------------------------------------------------------------------
 * 用本机 Chrome 的无头模式做**真实渲染验证**：
 *   1. 通过 CDP 驱动（DeviceOrientation 无关，零额外依赖，仅用 Node 内置能力）
 *   2. 截取 F01–F22 高保真画面
 *   3. 运行 T01–T13（M0.1 回归）、A01–A23（M0.2 装配）与 A01–A30（M0.3 知识与执行）
 *
 * 用法：node tools/shots.mjs [file-url-or-http-url]
 * ------------------------------------------------------------------
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runM03Acceptance } from './m03-acceptance.mjs';

const URL_ARG = process.argv[2] || null;
const PORT = 9333;
const OUT = path.join(process.cwd(), 'verify', 'shots');

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findBrowser() {
  return CHROME_CANDIDATES.find((p) => existsSync(p));
}

async function connect() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const targets = await res.json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('未找到调试页面目标');
  return page.webSocketDebuggerUrl;
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${method} 超时`));
        }
      }, 45000);
    });
  }
  async eval(expression, awaitPromise = false) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
      userGesture: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'evaluate 异常');
    return r.result?.value;
  }
  async shot(file) {
    const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(file, Buffer.from(r.data, 'base64'));
    return file;
  }
}

async function waitReady(cdp, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try {
      const ok = await cdp.eval('!!(window.__AZ && window.__AZ.constructorSnapshot)');
      if (ok) return true;
    } catch {
      /* 页面正在导航：继续等待 */
    }
    await sleep(200);
  }
  return false;
}

async function main() {
  const browser = findBrowser();
  if (!browser) throw new Error('未找到本机 Chrome/Edge，无法进行渲染验证');
  const url = URL_ARG || 'file:///' + path.join(process.cwd(), 'index.html').replace(/\\/g, '/');
  const profile = path.join(os.tmpdir(), `az0-verify-${Date.now()}`);

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const args = [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    '--mute-audio',
    '--allow-file-access-from-files',
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--window-size=1440,900',
    '--force-device-scale-factor=1',
    'about:blank',
  ];
  const proc = spawn(browser, args, { stdio: 'ignore', detached: false });

  try {
    let wsUrl = null;
    for (let i = 0; i < 40 && !wsUrl; i++) {
      await sleep(300);
      try {
        wsUrl = await connect();
      } catch {
        wsUrl = null;
      }
    }
    if (!wsUrl) throw new Error('无法连接到无头浏览器调试端口');

    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    const cdp = new CDP(ws);
    cdp.console = [];
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        cdp.console.push('EXCEPTION: ' + (d.exception?.description || d.text));
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        cdp.console.push(
          msg.params.type + ': ' + msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ')
        );
      }
    });
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Page.navigate', { url });
    await sleep(2600);

    const report = { url, gl: null, console: [] };
    report.gl = await cdp.eval(`(() => {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return null;
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return { version: gl.getParameter(gl.VERSION), renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'n/a' };
    })()`);

    const ready = await cdp.eval(`!!(window.__AZ && window.__AZ.scene)`);
    report.ready = ready;
    report.sceneOk = await cdp.eval(`!!(window.__AZ && window.__AZ.scene && window.__AZ.scene.ok)`);
    report.console = cdp.console.slice(0, 40);
    if (!ready) {
      console.log('\n=== 页面未就绪，控制台输出 ===');
      console.log(report.console.join('\n') || '(无输出)');
      const body = await cdp.eval(`document.body.innerText.slice(0, 400)`);
      console.log('--- body ---\n' + body);
      await cdp.shot(path.join(OUT, 'Z-failure.png'));
      throw new Error('window.__AZ 未就绪，见上方控制台输出');
    }
    if (cdp.console.length) {
      console.log('\n=== 控制台（前 20 条）===');
      console.log(cdp.console.slice(0, 20).join('\n'));
    }

    /* ---------------- F01–F06 六帧 ---------------- */
    const frames = [
      ['F01-虚空', 1.1],
      ['F02-核心唤醒', 3.4],
      ['F03-轨道装配', 5.9],
      ['F04-完整核心', 8.4],
    ];
    if (ready && report.sceneOk) {
      for (const [name, t] of frames) {
        const ok = await cdp.eval(`window.__AZ.captureFrame(${t})`);
        if (!ok) break;
        await sleep(420);
        await cdp.shot(path.join(OUT, `${name}.png`));
      }
    }

    // F05 主控制台 + F06 选中检视
    await cdp.eval(`window.__AZ.skipIntro('自检脚本')`);
    await sleep(900);
    await cdp.eval(`window.__AZ.resetView()`);
    await sleep(1300);
    await cdp.shot(path.join(OUT, 'F05-主控制台.png'));

    if (report.sceneOk) {
      await cdp.eval(`window.__AZ.selectPart('ring-2')`);
      await sleep(1500);
      await cdp.shot(path.join(OUT, 'F06-选中检视.png'));
      await cdp.eval(`window.__AZ.selectPart('ring-2')`);
      await sleep(300);
    }

    // F07b 二维系统视图（空配置基线；M0.2 的 F12 展示带模块的真实投影）
    await cdp.eval(`window.__AZ.setView('system')`);
    await sleep(700);
    await cdp.shot(path.join(OUT, 'F07b-二维系统视图-空配置.png'));
    await cdp.eval(`window.__AZ.setView('assembly')`);
    await sleep(400);

    /* ---------------- T01–T12 功能自检 ---------------- */
    const tests = await cdp.eval(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const has3D = !!(az.scene && az.scene.ok);

      // T01 开场镜头顺序
      az.replayIntro();
      await sleep(120);
      const seq = [];
      if (has3D) {
        for (const t of [0.6, 2.8, 5.5, 7.6, 9.6]) {
          az.captureFrame(t);
          seq.push(az.timeline.currentShot().shot.no);
        }
      }
      rec('T01', '五镜头顺序正确', seq.join(',') === '01,02,03,04,05', seq.join(' → ') || '无 3D');

      // T02 随时 SKIP 落到唯一稳定状态
      az.replayIntro();
      await sleep(60);
      if (has3D) az.captureFrame(6.2);
      az.skipIntro('T02');
      await sleep(280);
      const ringsOK = has3D ? az.scene.core.rings.every(r => r.visible && Math.abs(r.scale.x - 1) < 1e-6) : true;
      const asmOK = has3D ? az.scene.visual.assembly.every(v => v > 0.999) : true;
      rec('T02', '任何时刻 SKIP → 稳定 IDLE+HUB', az.state.phase === 'hub' && az.state.coreState === 'IDLE' && ringsOK && asmOK,
        'phase=' + az.state.phase + ' state=' + az.state.coreState + ' rings=' + (ringsOK ? 'exact' : 'drift'));

      // T03 再次访问：默认直达 Hub（localStorage 标记）
      const seen = JSON.parse(localStorage.getItem('az0.intro.seen.v1'));
      rec('T03', '首访标记已写入（再次访问直达 Hub）', seen === true, 'az0.intro.seen.v1=' + seen);

      // T04 旋转/缩放边界
      const c = has3D ? az.scene.rig.controls : null;
      rec('T04', '缩放与极角受约束（不穿模、不失去主体）', !!c && c.minDistance === 4.2 && c.maxDistance === 11.5,
        c ? c.minDistance + '–' + c.maxDistance + 'u · 极角 56°–124° · 禁用平移' : '无三维场景');

      // T05 选中一致性（3D 高亮 + Inspector 文案 + SVG 同步）
      az.selectPart('ring-3');
      await sleep(140);
      const selVisual = has3D ? az.scene.visual.selection === 'ring-3' : true;
      const inspTitle = document.querySelector('.inspector__title')?.textContent || '';
      az.setView('system');
      await sleep(160);
      const svgSel = !!document.querySelector('.svg-part[data-part="ring-3"].is-selected');
      az.setView('assembly');
      rec('T05', '三维高亮 / 二维高亮 / 检视面板同步', selVisual && svgSel && inspTitle.includes('机械轨道 C'),
        '检视标题=' + inspTitle + ' · svg=' + svgSel);

      // T06 重置视角：检查方向与自适应取景距离（窄视口会自动后撤）
      let d = 0;
      if (has3D) {
        az.scene.camera.position.set(0.1, 5.4, 9.9);
        az.resetView();
        await sleep(1500);
        const p = az.scene.camera.position;
        const cam = az.scene.camera;
        const canvas = document.querySelector('.stage__canvas');
        const aspect = canvas.clientWidth / canvas.clientHeight;
        const contentR = 2.4 * 1.12;
        const hFov = 2 * Math.atan(Math.tan((cam.fov * Math.PI) / 180 / 2) * aspect);
        const expected = Math.max(4.2, Math.min(11.5, contentR / Math.tan(Math.min((cam.fov * Math.PI) / 180, hFov) / 2)));
        const len = Math.hypot(p.x, p.y, p.z);
        d = Math.abs(len - expected);
      }
      rec('T06', '重置视角回到标准镜位且取景自适应', !has3D || d < 0.15, '取景距离偏差 Δ=' + d.toFixed(3));

      // T07 无假按钮：当前场景下不存在被隐藏却仍可点击的控件（二维投影层在其隐藏时不计入）
      const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      const inHiddenLayer = (el) => !!el.closest('.projection[style*="display: none"]');
      const fakeBtns = [...document.querySelectorAll('button')].filter(
        (b) => !b.disabled && b.getAttribute('aria-disabled') !== 'true' && !visible(b) && !inHiddenLayer(b)
      );
      const lockedNav = [...document.querySelectorAll('.navitem[data-locked="true"]')].length;
      const realNav = [...document.querySelectorAll('.navitem[data-locked="false"]')].map((n) => n.textContent);
      rec('T07', '未开放入口状态明确（无假按钮）',
        lockedNav === 2 && fakeBtns.length === 0
          && realNav.some((t) => /知识星图/.test(t)) && realNav.some((t) => /执行台/.test(t)),
        '未开放入口=' + lockedNav + ' 个（引导叙事 / 实验空间，均带阶段说明面板）· 已开放=' + realNav.length + ' 个（含知识星图与执行台）· 隐藏却可点的控件=' + fakeBtns.length);

      // T08 主视口无横向溢出
      const overflow = document.documentElement.scrollWidth - window.innerWidth;
      const canvasVisible = (() => {
        const r = document.querySelector('.stage__canvas').getBoundingClientRect();
        return r.width > 200 && r.height > 200;
      })();
      rec('T08', '1440×900 无溢出且舞台尺寸正常', overflow <= 1 && canvasVisible, 'overflowX=' + overflow + 'px');

      // T09 reduced-motion 降级通路
      const rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
      rec('T09', '已读取 prefers-reduced-motion 并接入降级', typeof az.state.reducedMotion === 'boolean',
        'state.reducedMotion=' + az.state.reducedMotion + ' · 系统=' + rm);

      // T10 2D/SVG 兜底可交互
      az.setView('system');
      await sleep(220);
      const proj = document.querySelector('.projection');
      const svgParts = document.querySelectorAll('.projection .svg-part').length;
      rec('T10', '2D/SVG 结构视图可挂载且结构可点选', !!proj && proj.style.display !== 'none' && svgParts >= 6,
        'svg-part 分组=' + svgParts);
      az.setView('assembly');

      // T11 无业务网络请求
      const res = performance.getEntriesByType('resource');
      const ext = res.filter(r => !r.name.startsWith('file:') && !r.name.startsWith('data:') && !r.name.startsWith('blob:'));
      rec('T11', '零外部 CDN / 业务网络请求', ext.length === 0, '外部资源=' + ext.length + ' / 全部资源=' + res.length);

      // T12 重播不叠加场景
      az.replayIntro();
      await sleep(120);
      az.replayIntro();
      await sleep(120);
      az.skipIntro('T12');
      await sleep(220);
      let geoms = 0; let coreCount = 0;
      if (has3D) {
        const coreRoots = az.scene.scene.children.filter(o => o.name === 'AZ-CORE-01' || (o.children || []).some(c => c.name === 'AZ-CORE-01'));
        coreCount = coreRoots.length;
        geoms = az.scene.renderer.info.memory.geometries;
      }
      rec('T12', '连续 REPLAY 不叠加核心或几何膨胀', !has3D || (coreCount === 1 && geoms < 300),
        'coreRoots=' + coreCount + ' geometries=' + geoms + ' programs=' + (has3D ? az.scene.renderer.info.programs.length : 0));

      // T13 二维 → 三维必须能切回来，且切换控件不被投影层遮挡
      az.setView('system');
      await sleep(260);
      const hitTest = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return { found: false };
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { found: true, reachable: !!top && (el === top || el.contains(top)), label: el.textContent.trim() };
      };
      const barBack = hitTest('.projection__bar-actions .btn');
      const projSeg = hitTest('.projection__bar-actions .seg button');
      document.querySelector('.projection__bar-actions .btn')?.click();
      await sleep(320);
      const backTo3D = az.state.systemView === false
        && document.querySelector('.projection')?.style.display === 'none'
        && document.querySelector('.stage__br .seg button')?.getAttribute('aria-pressed') === 'true';
      rec('T13', '二维视图有明确返回入口且能切回三维', barBack.reachable && projSeg.reachable && backTo3D,
        '投影内返回按钮可点=' + barBack.reachable + ' · 投影内视图开关可点=' + projSeg.reachable + ' · 已回到三维=' + backTo3D);

      return out;
    })()`, true);

    report.tests = tests;

    /* ==================================================================
       M0.2 装配原型验收（A01–A23 中可自动化的部分）
       ================================================================== */
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const m02 = [];
    const push = (rows) => {
      if (Array.isArray(rows)) m02.push(...rows);
    };

    // 起始条件：清空构建器命名空间（保留 M0.1 偏好），重新加载
    await cdp.eval(`localStorage.removeItem('agent-zero:constructor:v1')`);
    await cdp.send('Page.reload', { ignoreCache: false });
    if (!(await waitReady(cdp))) throw new Error('重新加载后 __AZ 未就绪');
    await cdp.eval(`window.__AZ.skipIntro('M0.2 验收')`);
    await sleep(900);

    /* ---------- A01 初始系统 + F07 ---------- */
    push(
      await cdp.eval(`(() => {
        const az = window.__AZ;
        const out = [];
        const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
        const snap = az.constructorSnapshot();
        const cards = document.querySelectorAll('.bay-card').length;
        const addBtns = document.querySelectorAll('.bay-card [data-act="add"]').length;
        const meshes = az.scene && az.scene.ok ? az.scene.bay.instanceCount() : 0;
        rec('A01', '初始系统：无已装配模块，3D 无模块网格，能力架显示可添加',
          snap.modules.length === 0 && meshes === 0 && cards === 2 && addBtns === 2,
          '已装配=' + snap.modules.length + ' · 3D 模块网格=' + meshes + ' · 能力架=' + cards + ' 张 · 可添加=' + addBtns);
        return out;
      })()`)
    );
    await sleep(500);
    await cdp.shot(path.join(OUT, 'F07-初始能力架与核心.png'));

    /* ---------- A02 点击预览 + F08 ---------- */
    push(
      await cdp.eval(`(async () => {
        const az = window.__AZ;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const out = [];
        const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
        document.querySelector('.bay-card[data-module="announcement_search"] [data-act="add"]').click();
        await sleep(420);
        const snap = az.constructorSnapshot();
        const chips = [...document.querySelectorAll('.port-chip')].map((c) => [c.dataset.port, c.dataset.state]);
        const map = Object.fromEntries(chips);
        const ghost = az.scene && az.scene.ok ? az.scene.bay.getPreviewPortId() : 'no-3d';
        rec('A02', 'Search 点击预览：仅合法接口高亮，Ghost 可取消且不持久化',
          !!snap.preview && snap.preview.portId === 'SEARCH_PORT' && snap.modules.length === 0
            && snap.persisted.length === 0 && map.SEARCH_PORT === 'preview' && map.READER_PORT === 'free' && ghost === 'SEARCH_PORT',
          'preview=' + JSON.stringify(snap.preview) + ' · SEARCH_PORT=' + map.SEARCH_PORT + ' · READER_PORT=' + map.READER_PORT + ' · 落盘=' + snap.persisted.length);
        return out;
      })()`, true)
    );
    await sleep(700);
    await cdp.shot(path.join(OUT, 'F08-Search预览-Ghost.png'));

    /* ---------- A03 / A04 / A05 + F09 ---------- */
    push(
      await cdp.eval(`(async () => {
        const az = window.__AZ;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const out = [];
        const rec = (id, name, pass, note) => out.push({ id, name, pass, note });

        az.confirmAssembly();
        await sleep(260);
        let snap = az.constructorSnapshot();
        const search = snap.modules.filter((m) => m.moduleId === 'announcement_search');
        rec('A03', 'Search 确认装配：唯一实例已写入权威配置并落盘',
          search.length === 1 && snap.persisted.length === 1 && search[0].portId === 'SEARCH_PORT',
          '实例=' + search.length + ' · 落盘=' + snap.persisted.length + ' · 状态=' + (search[0] || {}).status);

        az.previewModule('document_reader');
        await sleep(140);
        az.confirmAssembly();
        await sleep(260);
        snap = az.constructorSnapshot();
        rec('A04', 'Reader 另行装配：两种模块共存且互不覆盖',
          snap.modules.length === 2 && snap.modules.some((m) => m.portId === 'SEARCH_PORT') && snap.modules.some((m) => m.portId === 'READER_PORT'),
          snap.modules.map((m) => m.moduleId + ' → ' + m.portId).join(' · '));

        az.previewModule('announcement_search');
        await sleep(140);
        snap = az.constructorSnapshot();
        rec('A05', '重复添加同类工具：只定位现有实例，不产生重复节点',
          snap.modules.length === 2 && snap.notice.code === 'ALREADY_INSTALLED' && snap.selectedModuleId === 'announcement_search',
          'notice=' + (snap.notice && snap.notice.code) + ' · 实例数=' + snap.modules.length);
        return out;
      })()`, true)
    );
    await sleep(1000);
    await cdp.shot(path.join(OUT, 'F09-Search与Reader已装配.png'));

    /* ---------- A06 缺少授权 + F10 ---------- */
    push(
      await cdp.eval(`(async () => {
        const az = window.__AZ;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const out = [];
        const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
        az.selectModule('document_reader');
        await sleep(300);
        const snap = az.constructorSnapshot();
        const reader = snap.modules.find((m) => m.moduleId === 'document_reader');
        const hero = document.querySelector('.inspector__hero');
        const errText = document.querySelector('.field__error, .field-error-note')?.textContent || '';
        const chip = document.querySelector('.port-chip[data-port="READER_PORT"]');
        rec('A06', '缺少授权：已装配但不得 Ready，明确指出缺少只读模拟权限',
          reader.status === 'Unconfigured' && /只读模拟权限/.test(errText)
            && /Unconfigured/.test(hero ? hero.textContent : '') && !/Ready/.test(hero ? hero.textContent : '')
            && /Unconfigured/.test(chip ? chip.textContent : ''),
          '状态=' + reader.status + ' · 端口标注=' + (chip ? chip.textContent : '—') + ' · 字段提示=' + errText.replace(/\\s+/g, ' ').slice(0, 46));
        return out;
      })()`, true)
    );
    await sleep(600);
    await cdp.shot(path.join(OUT, 'F10-Reader未授权.png'));

    /* ---------- A07 / A09 + F11 ---------- */
    push(
      await cdp.eval(`(async () => {
        const az = window.__AZ;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const out = [];
        const rec = (id, name, pass, note) => out.push({ id, name, pass, note });

        az.configureModule('document_reader', { readPermission: true, readMode: 'full_text', includeMetadata: false });
        await sleep(160);
        let snap = az.constructorSnapshot();
        const reader = snap.modules.find((m) => m.moduleId === 'document_reader');
        const readyNotice = snap.notice;
        rec('A07', '完成配置：合法参数 + 授权后显示 Ready，三维 / 二维 / 检视面板一致',
          reader.status === 'Ready' && readyNotice.code === 'CONFIG_SAVED' && reader.settings.readMode === 'full_text',
          '状态=' + reader.status + ' · readMode=' + reader.settings.readMode + ' · 提示=' + readyNotice.message);

        az.configureModule('announcement_search', { searchScope: 'campus_events', maxResults: 10, readPermission: true });
        await sleep(160);
        az.toggleModule('announcement_search', false);
        await sleep(200);
        snap = az.constructorSnapshot();
        const search = snap.modules.find((m) => m.moduleId === 'announcement_search');
        const chip = document.querySelector('.port-chip[data-port="SEARCH_PORT"]');
        rec('A09', '禁用继续在位：结构与参数保留，仅连接关系不再活跃',
          search.status === 'Disabled' && search.settings.maxResults === 10 && snap.modules.length === 2
            && /Disabled/.test(chip ? chip.textContent : ''),
          '状态=' + search.status + ' · maxResults=' + search.settings.maxResults + ' · 在位实例=' + snap.modules.length);
        return out;
      })()`, true)
    );
    await sleep(1400);
    await cdp.shot(path.join(OUT, 'F11-Ready与Disabled对照.png'));

    push(
      await cdp.eval(`(async () => {
        const az = window.__AZ;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const out = [];
        const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
        az.toggleModule('announcement_search', true);
        await sleep(220);
        const snap = az.constructorSnapshot();
        const search = snap.modules.find((m) => m.moduleId === 'announcement_search');
        rec('A09b', '重新启用重新校验：参数与授权满足时回到 Ready',
          search.status === 'Ready' && search.settings.maxResults === 10,
          '状态=' + search.status + ' · maxResults=' + search.settings.maxResults);
        return out;
      })()`, true)
    );

    /* ---------- A08 字段非法 + A10 移除 ---------- */
    push(
      await cdp.eval(`(async () => {
        const az = window.__AZ;
        const out = [];
        const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
        const before = JSON.stringify(az.constructorSnapshot().modules.find((m) => m.moduleId === 'announcement_search').settings);
        const rejected = az.configureModule('announcement_search', { maxResults: 999 });
        const snap = az.constructorSnapshot();
        const after = JSON.stringify(snap.modules.find((m) => m.moduleId === 'announcement_search').settings);
        rec('A08', '字段非法：拒绝写入、指出字段与修复方式、不破坏已有合法配置',
          rejected.ok === false && snap.notice.code === 'INVALID_CONFIG' && snap.notice.field === 'maxResults'
            && !!snap.notice.fix && before === after,
          'ok=' + rejected.ok + ' · code=' + snap.notice.code + ' · 字段=' + snap.notice.field + ' · 配置未被破坏=' + (before === after));

        az.removeModule('document_reader');
        const after2 = az.constructorSnapshot();
        const chip = document.querySelector('.port-chip[data-port="READER_PORT"]');
        rec('A10', '移除工具：释放接口、2D 节点移除、Inspector 不再引用已删除模块',
          after2.modules.length === 1 && after2.selectedModuleId !== 'document_reader'
            && after2.modules.every((m) => m.moduleId !== 'document_reader')
            && /空闲/.test(chip ? chip.textContent : '')
            && !/文档读取/.test(document.querySelector('.inspector__title')?.textContent || ''),
          '剩余实例=' + after2.modules.length + ' · 选中=' + after2.selectedModuleId + ' · READER_PORT=' + (chip ? chip.textContent : '—'));
        return out;
      })()`, true)
    );

    /* ---------- A11–A14 引导拖拽 ---------- */
    await cdp.eval(`window.__AZ.resetConstructor()`);
    await sleep(300);
    push(
      await cdp.eval(`(async () => {
        const az = window.__AZ;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const out = [];
        const rec = (id, name, pass, note) => out.push({ id, name, pass, note });

        const gripOf = (id) => document.querySelector('.bay-card[data-module="' + id + '"] .bay-card__grip');
        const drop = async (moduleId, portId, { commit = true } = {}) => {
          const grip = gripOf(moduleId);
          const r = grip.getBoundingClientRect();
          const from = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          const target = az.portScreenPoint(portId) || from;
          grip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 7, clientX: from.x, clientY: from.y }));
          await sleep(60);
          window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientX: (from.x + target.x) / 2, clientY: (from.y + target.y) / 2 }));
          await sleep(60);
          window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientX: target.x, clientY: target.y }));
          await sleep(160);
          const during = az.constructorSnapshot();
          const paused = az.scene && az.scene.ok ? az.scene.rig.isIdlePaused() : null;
          const hint = document.querySelector('.drag-hint')?.textContent || '';
          if (commit) {
            window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, clientX: target.x, clientY: target.y }));
            await sleep(320);
          }
          return { during, paused, hint, target };
        };

        // A11 合法拖拽
        const legal = await drop('announcement_search', 'SEARCH_PORT');
        let snap = az.constructorSnapshot();
        rec('A11', '合法拖拽：吸附到匹配接口并成功装配落盘',
          snap.modules.length === 1 && snap.modules[0].portId === 'SEARCH_PORT' && snap.persisted.length === 1 && legal.during.drag && legal.during.drag.valid,
          'drag.valid=' + (legal.during.drag && legal.during.drag.valid) + ' · 提示=' + legal.hint + ' · 落盘=' + snap.persisted.length);

        // A14 拖拽期间暂停自转
        rec('A14', '拖拽期间暂停核心自转，结束后恢复此前状态',
          legal.paused === true && (az.scene && az.scene.ok ? az.scene.rig.isIdlePaused() === false : true),
          '拖拽中暂停=' + legal.paused + ' · 结束后=' + (az.scene && az.scene.ok ? az.scene.rig.isIdlePaused() : 'no-3d'));

        // A12 不合法拖拽（在提交前截图）
        const bad = await drop('document_reader', 'SEARCH_PORT', { commit: false });
        window.__M02_BAD_DRAG = true;
        rec('A12', '不合法拖拽：不提交、给出兼容性原因、幽灵预览可取消',
          bad.during.drag && bad.during.drag.valid === false && /不能连接到/.test(bad.during.drag.message)
            && az.constructorSnapshot().modules.length === 1,
          '原因=' + (bad.during.drag && bad.during.drag.message));
        return out;
      })()`, true)
    );

    /* ---------- A12 截图（重新进入不合法拖拽并保持） ---------- */
    await cdp.eval(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const grip = document.querySelector('.bay-card[data-module="document_reader"] .bay-card__grip');
      const r = grip.getBoundingClientRect();
      const target = az.portScreenPoint('SEARCH_PORT') || { x: r.left, y: r.top };
      grip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 9, clientX: r.left + 6, clientY: r.top + 6 }));
      await sleep(50);
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 9, clientX: target.x, clientY: target.y }));
      await sleep(50);
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 9, clientX: target.x + 2, clientY: target.y + 2 }));
      await sleep(200);
      return true;
    })()`, true);
    await sleep(500);
    await cdp.shot(path.join(OUT, 'F13-非法拖拽回退.png'));

    push(
      await cdp.eval(`(async () => {
        const az = window.__AZ;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const out = [];
        const rec = (id, name, pass, note) => out.push({ id, name, pass, note });

        // A13 Esc 取消：拖拽中按 Esc
        const snapBefore = az.constructorSnapshot();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await sleep(320);
        const afterEsc = az.constructorSnapshot();
        rec('A13', 'Esc / 放到空处：拖拽与预览消失、端口恢复、配置不变',
          afterEsc.drag === null && afterEsc.preview === null && afterEsc.modules.length === snapBefore.modules.length
            && document.querySelector('.drag-layer')?.dataset.open === 'false'
            && document.querySelector('.port-chip[data-port="SEARCH_PORT"]')?.dataset.state !== 'invalid',
          'drag=' + afterEsc.drag + ' · 实例=' + afterEsc.modules.length + ' · SEARCH_PORT=' + document.querySelector('.port-chip[data-port="SEARCH_PORT"]')?.dataset.state);

        // A17 快速操作 / 中断动画
        for (let i = 0; i < 5; i++) { az.previewModule('announcement_search'); az.confirmAssembly(); }
        az.previewModule('document_reader'); az.cancelAssembly();
        await sleep(600);
        const rapid = az.constructorSnapshot();
        rec('A17', '快速操作与中断：不产生幽灵模块与双重提交',
          rapid.modules.length === 1 && rapid.preview === null
            && (az.scene && az.scene.ok ? az.scene.bay.instanceCount() === 1 : true),
          '实例=' + rapid.modules.length + ' · 3D 网格=' + (az.scene && az.scene.ok ? az.scene.bay.instanceCount() : 'no-3d') + ' · preview=' + rapid.preview);
        return out;
      })()`, true)
    );

    /* ---------- A15 / A16 二维视图 + F12 ---------- */
    await cdp.eval(`window.__AZ.setView('system')`);
    await sleep(700);
    push(
      await cdp.eval(`(async () => {
        const az = window.__AZ;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const out = [];
        const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
        const snap = az.constructorSnapshot();
        const nodes = [...document.querySelectorAll('.sg-panel .sg-node')].map((n) => n.dataset.node);
        const coreOnly = document.querySelectorAll('.sg-panel .sg-node--core').length;
        const slots = document.querySelectorAll('.sg-panel .slot-card').length;
        rec('A15', '切换三维 / 二维：不复制数据，节点与当前配置一致',
          coreOnly === 1 && nodes.includes('announcement_search') && nodes.includes('document_reader')
            && slots === 2 && snap.modules.length === 1,
          '核心节点=' + coreOnly + ' · 模块节点=' + nodes.filter((n) => n !== 'core').join('/') + ' · 槽位=' + slots + ' · 实例=' + snap.modules.length);
        return out;
      })()`, true)
    );
    await sleep(300);
    await cdp.shot(path.join(OUT, 'F12-二维系统视图.png'));


    push(
      await cdp.eval(`(async () => {
        const az = window.__AZ;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const out = [];
        const rec = (id, name, pass, note) => out.push({ id, name, pass, note });

        // A16 在二维中完成添加 / 取消 / 配置 / 禁用 / 移除
        const slotBtn = (moduleId, sel = 'button') => document.querySelector('.slot-card[data-module="' + moduleId + '"] ' + sel);
        slotBtn('document_reader').click();                 // 添加 → 进入预览
        await sleep(220);
        slotBtn('document_reader', '.btn--ghost').click();  // 取消预览
        await sleep(220);
        const cancelled = az.constructorSnapshot().preview === null;
        slotBtn('document_reader').click();                 // 再次添加
        await sleep(220);
        slotBtn('document_reader', '.btn--primary').click(); // 二维中直接确认装配
        await sleep(300);
        az.configureModule('document_reader', { readPermission: true, readMode: 'summary' });
        await sleep(200);
        let snap = az.constructorSnapshot();
        const added = snap.modules.length === 2 && snap.modules.find((m) => m.moduleId === 'document_reader').status === 'Ready' && cancelled;

        az.toggleModule('document_reader', false);
        await sleep(220);
        snap = az.constructorSnapshot();
        const disabled = snap.modules.find((m) => m.moduleId === 'document_reader').status === 'Disabled';

        // 二维中点击节点 → 同步选中并显示同一份检视内容
        const node = document.querySelector('.sg-panel .sg-node[data-node="document_reader"]');
        node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await sleep(220);
        snap = az.constructorSnapshot();
        const selected = snap.selectedModuleId === 'document_reader'
          && /Document Reader|文档读取/.test(document.querySelector('.inspector__title')?.textContent || '');

        az.removeModule('document_reader');
        await sleep(220);
        snap = az.constructorSnapshot();
        const removed = snap.modules.length === 1;

        az.setView('assembly');
        await sleep(500);
        const back = az.constructorSnapshot();
        rec('A16', '二维视图中完成添加、配置、禁用、移除与选中同步，回到三维结果一致',
          added && disabled && selected && removed && back.modules.length === 1,
          '添加=' + added + ' · 禁用=' + disabled + ' · 选中同步=' + selected + ' · 移除=' + removed);
        return out;
      })()`, true)
    );

    /* ---------- A15b 导航「装配台」是真实入口 ---------- */
    push(
      await cdp.eval(`(async () => {
        const az = window.__AZ;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const out = [];
        const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
        az.setView('system');
        await sleep(400);
        const nav = [...document.querySelectorAll('.navitem')].find((n) => /装配台/.test(n.textContent));
        nav.click();
        await sleep(460);
        rec('A15b', '导航「装配台」是真实入口：从二维直接切回三维装配视图',
          !!nav && az.state.mode === 'constructor' && az.state.systemView === false
            && document.querySelector('.projection')?.style.display === 'none',
          'mode=' + az.state.mode + ' · systemView=' + az.state.systemView + ' · 投影层=' + document.querySelector('.projection')?.style.display);
        return out;
      })()`, true)
    );

    /* ---------- A18 刷新恢复 ---------- */
    await cdp.eval(`(async () => {
      const az = window.__AZ;
      az.configureModule('announcement_search', { searchScope: 'campus_events', maxResults: 10, readPermission: true });
      az.previewModule('document_reader');
      return true;
    })()`, true);
    await sleep(200);
    await cdp.send('Page.reload', { ignoreCache: false });
    if (!(await waitReady(cdp))) throw new Error('刷新后 __AZ 未就绪');
    await cdp.eval(`window.__AZ.skipIntro('A18')`);
    await sleep(900);
    push(
      await cdp.eval(`(() => {
        const az = window.__AZ;
        const out = [];
        const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
        const snap = az.constructorSnapshot();
        const s = snap.modules.find((m) => m.moduleId === 'announcement_search');
        rec('A18', '刷新恢复：仅恢复已确认配置，Preview / Dragging 不恢复',
          snap.modules.length === 1 && !!s && s.settings.searchScope === 'campus_events' && s.settings.maxResults === 10
            && s.permissions.read === true && s.status === 'Ready' && snap.preview === null,
          '实例=' + snap.modules.length + ' · 参数=' + JSON.stringify(s && s.settings) + ' · preview=' + snap.preview);
        return out;
      })()`)
    );

    /* ---------- A20 重置边界 ---------- */
    push(
      await cdp.eval(`(async () => {
        const az = window.__AZ;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const out = [];
        const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
        const introBefore = localStorage.getItem('az0.intro.seen.v1');
        const prefsBefore = localStorage.getItem('az0.prefs.v1');
        document.querySelector('.bay__foot button').click();
        await sleep(260);
        const dialogOpen = document.querySelector('.confirm')?.dataset.open === 'true';
        document.querySelector('.confirm__actions .btn--primary').click();
        await sleep(320);
        const snap = az.constructorSnapshot();
        rec('A20', '重置构建器：二次确认后只清理构建器数据，不删除开场偏好',
          dialogOpen && snap.modules.length === 0 && snap.persisted.length === 0
            && localStorage.getItem('az0.intro.seen.v1') === introBefore
            && localStorage.getItem('az0.prefs.v1') === prefsBefore,
          '确认层=' + dialogOpen + ' · 构建器=' + localStorage.getItem('agent-zero:constructor:v1') + ' · 开场偏好保留=' + (localStorage.getItem('az0.intro.seen.v1') === introBefore));
        return out;
      })()`, true)
    );

    /* ---------- A21 键盘等价路径 ---------- */
    push(
      await cdp.eval(`(async () => {
        const az = window.__AZ;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const out = [];
        const rec = (id, name, pass, note) => out.push({ id, name, pass, note });

        const addBtn = document.querySelector('.bay-card[data-module="announcement_search"] [data-act="add"]');
        addBtn.focus();
        const focused = document.activeElement === addBtn;
        addBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        addBtn.click();  // 键盘 Enter 在按钮上的默认行为
        await sleep(240);
        let snap = az.constructorSnapshot();
        const previewed = !!snap.preview;

        // 端口标注按钮在预览态可聚焦，作为触屏 / 键盘的端口选择入口
        const chip = document.querySelector('.port-chip[data-port="SEARCH_PORT"]');
        const chipFocusable = chip && chip.tabIndex === 0;
        chip.click();
        await sleep(300);
        snap = az.constructorSnapshot();
        const assembled = snap.modules.length === 1;

        az.configureModule('announcement_search', { readPermission: true });
        await sleep(200);
        snap = az.constructorSnapshot();
        rec('A21', '键盘与触屏等价路径：不依赖拖拽也能完成选择、端口确认与配置',
          focused && previewed && chipFocusable && assembled && snap.modules[0].status === 'Ready'
            && document.querySelector('.drag-layer')?.dataset.open === 'false',
          '按钮可聚焦=' + focused + ' · 预览=' + previewed + ' · 端口按钮可用=' + chipFocusable + ' · 装配=' + assembled + ' · 状态=' + snap.modules[0].status);
        return out;
      })()`, true)
    );

    /* ---------- A19 本地数据损坏 ---------- */
    await cdp.eval(`localStorage.setItem('agent-zero:constructor:v1', '{ broken json ')`);
    await cdp.send('Page.reload', { ignoreCache: false });
    if (!(await waitReady(cdp))) throw new Error('损坏数据下页面白屏（__AZ 未就绪）');
    await cdp.eval(`window.__AZ.skipIntro('A19')`);
    await sleep(700);
    push(
      await cdp.eval(`(() => {
        const az = window.__AZ;
        const out = [];
        const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
        const snap = az.constructorSnapshot();
        const cards = document.querySelectorAll('.bay-card').length;
        rec('A19', '本地数据损坏：不白屏、回退为空白配置并给出可恢复提示',
          snap.modules.length === 0 && snap.notice && snap.notice.code === 'STORAGE_CORRUPT' && cards === 2
            && !!document.querySelector('.inspector__hero'),
          'notice=' + (snap.notice && snap.notice.code) + ' · 能力架=' + cards + ' 张 · 页面可交互=' + !!document.querySelector('.bay-card button'));
        return out;
      })()`)
    );

    /* ---------- A22 降低动态效果 ---------- */
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await cdp.send('Page.reload', { ignoreCache: false });
    if (!(await waitReady(cdp))) throw new Error('reduced-motion 下 __AZ 未就绪');
    await cdp.eval(`window.__AZ.skipIntro('A22')`);
    await sleep(800);
    push(
      await cdp.eval(`(async () => {
        const az = window.__AZ;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const out = [];
        const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
        az.previewModule('announcement_search');
        await sleep(120);
        az.confirmAssembly();
        await sleep(200);
        az.configureModule('announcement_search', { readPermission: true });
        const snap = az.constructorSnapshot();
        rec('A22', '降低动态效果：装配与配置功能完全可用，逻辑结果相同',
          az.state.reducedMotion === true && snap.modules.length === 1 && snap.modules[0].status === 'Ready',
          'reducedMotion=' + az.state.reducedMotion + ' · 状态=' + (snap.modules[0] || {}).status);
        return out;
      })()`, true)
    );
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });

    /* ---------- A23 / F14 WebGL 不可用 ---------- */
    const injected = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
          if (String(type).startsWith('webgl')) return null;
          return original.call(this, type, ...rest);
        };
      })();`,
    });
    await cdp.eval(`localStorage.removeItem('agent-zero:constructor:v1')`);
    await cdp.send('Page.reload', { ignoreCache: false });
    if (!(await waitReady(cdp))) throw new Error('WebGL 兜底路径下 __AZ 未就绪');
    await sleep(900);
    push(
      await cdp.eval(`(async () => {
        const az = window.__AZ;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const out = [];
        const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
        const before = az.constructorSnapshot();
        const no3d = !(az.scene && az.scene.ok);
        // 通过二维系统视图完成全部操作：添加 → 确认装配 → 配置 → 禁用 → 启用 → 移除
        const slotBtn = (sel = 'button') => document.querySelector('.slot-card[data-module="announcement_search"] ' + sel);
        slotBtn().click();
        await sleep(240);
        slotBtn('.btn--primary').click();
        await sleep(300);
        const after = az.constructorSnapshot();
        az.configureModule('announcement_search', { readPermission: true });
        await sleep(160);
        az.toggleModule('announcement_search', false);
        await sleep(160);
        const disabled = az.constructorSnapshot();
        az.toggleModule('announcement_search', true);
        await sleep(160);
        const enabled = az.constructorSnapshot();
        az.removeModule('announcement_search');
        await sleep(160);
        const removed = az.constructorSnapshot();
        const projectionVisible = document.querySelector('.projection') && document.querySelector('.projection').style.display !== 'none';
        rec('A23', 'WebGL 不可用：自动落到二维系统视图，添加、配置、禁用、移除全部可用',
          no3d && before.modules.length === 0 && after.modules.length === 1
            && disabled.modules[0].status === 'Disabled' && enabled.modules[0].status === 'Ready'
            && removed.modules.length === 0 && projectionVisible,
          'WebGL=' + (az.scene && az.scene.ok) + ' · 装配=' + after.modules.length + ' · 禁用=' + (disabled.modules[0] || {}).status + ' · 移除后=' + removed.modules.length);
        return out;
      })()`, true)
    );
    await sleep(600);
    await cdp.shot(path.join(OUT, 'F14-二维降级完整可操作.png'));

    // 恢复三维渲染路径，供后续多视口截图使用
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injected.identifier });
    await cdp.send('Page.reload', { ignoreCache: false });
    if (!(await waitReady(cdp))) throw new Error('恢复三维路径后 __AZ 未就绪');
    await cdp.eval(`window.__AZ.skipIntro('视口截图')`);
    await sleep(700);

    report.m02 = m02;
    report.m02Summary = {
      total: m02.length,
      passed: m02.filter((t) => t.pass).length,
      failed: m02.filter((t) => !t.pass).map((t) => t.id),
    };

    /* ==================================================================
       M0.3 知识与执行验收（A01–A30）
       ================================================================== */
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const m03 = await runM03Acceptance({
      cdp,
      sleep,
      waitReady,
      shot: (name) => cdp.shot(path.join(OUT, name)),
    });
    report.m03 = m03;
    report.m03Summary = {
      total: m03.length,
      passed: m03.filter((t) => t.pass).length,
      failed: m03.filter((t) => !t.pass).map((t) => t.id),
    };

    // 回到三维路径，供后续多视口截图使用
    await cdp.send('Page.reload', { ignoreCache: false });
    if (!(await waitReady(cdp))) throw new Error('M0.3 验收后恢复页面失败');
    await cdp.eval(`window.__AZ.skipIntro('视口截图')`);
    await sleep(700);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(400);

    /* ---------------- 多视口响应式截图 ---------------- */
    const viewports = [
      ['VP-1920x1080', 1920, 1080],
      ['VP-1280x800', 1280, 800],
      ['VP-1024x768', 1024, 768],
      ['VP-390x844-mobile', 390, 844],
    ];
    for (const [name, w, h] of viewports) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 768 });
      await sleep(700);
      const overflow = await cdp.eval(`document.documentElement.scrollWidth - window.innerWidth`);
      await cdp.shot(path.join(OUT, `${name}.png`));
      report[`overflow_${name}`] = overflow;
    }

    // 移动端抽屉自检
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await sleep(700);
    await cdp.shot(path.join(OUT, 'VP-390x844-mobile.png'));
    await cdp.eval(`document.querySelector('.topbar__right button').click()`);
    await sleep(600);
    const drawerOpen = await cdp.eval(`document.querySelector('.shell').dataset.dock`);
    report.mobileDrawer = drawerOpen;
    await cdp.shot(path.join(OUT, 'VP-390x844-drawer.png'));

    await writeFile(path.join(process.cwd(), 'verify', 'report.json'), JSON.stringify(report, null, 2), 'utf8');

    console.log('\n=== 渲染环境 ===');
    console.log(report.gl ? `WebGL: ${report.gl.version}\nRenderer: ${report.gl.renderer}` : 'WebGL: 不可用（兜底路径）');
    console.log('\n=== T01–T12 功能自检 ===');
    for (const t of report.tests || []) {
      console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.id}  ${t.name}  —  ${t.note}`);
    }
    const failed = (report.tests || []).filter((t) => !t.pass);
    console.log(`\n合计：${(report.tests || []).length - failed.length}/${(report.tests || []).length} 通过`);

    console.log('\n=== M0.2 装配原型验收（A01–A23 自动化部分） ===');
    for (const t of report.m02 || []) {
      console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.id}  ${t.name}  —  ${t.note}`);
    }
    const m02Failed = (report.m02 || []).filter((t) => !t.pass);
    console.log(`\nM0.2 合计：${(report.m02 || []).length - m02Failed.length}/${(report.m02 || []).length} 通过`);

    console.log('\n=== M0.3 知识与执行验收（A01–A30） ===');
    for (const t of report.m03 || []) {
      console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.id}  ${t.name}  —  ${t.note}`);
    }
    const m03Failed = (report.m03 || []).filter((t) => !t.pass);
    console.log(`\nM0.3 合计：${(report.m03 || []).length - m03Failed.length}/${(report.m03 || []).length} 通过`);
    console.log('截图目录：verify/shots');
  } finally {
    proc.kill();
  }
}

main().catch((e) => {
  console.error('[shots] 失败：', e.message);
  if (process.env.AZ_DEBUG_STACK === '1') console.error(e.stack);
  process.exit(1);
});
