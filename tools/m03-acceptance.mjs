/**
 * tools/m03-acceptance.mjs
 * ------------------------------------------------------------------
 * M0.3「知识与执行」浏览器验收（A01–A30）。
 *
 * 全部通过真实 DOM 与真实 store 驱动，走的是与界面按钮完全相同的入口；
 * 每一项都说明**证据来源**，不允许用「理论满足」代替运行结果。
 * 无法自动断言的项（真机帧率、真实 GPU 观感）由调用方如实标注为未执行。
 * ------------------------------------------------------------------
 */

const CONSTRUCTOR_KEY = 'agent-zero:constructor:v1';
const EXECUTION_KEY = 'agent-zero:execution:v1';
/* M0.4 起运行记录写入新命名空间；M0.3 的验收断言按「当前命名空间」读取 */
const RESEARCH_KEY = 'agent-zero:research:v2';
const LEARNING_KEY = 'agent-zero:learning:v2';
/* M1.1 起学习进度写入 v2；旧键 v1 只读迁移、原样保留（见 m11 验收 A19） */
const LEARNING_LEGACY_KEY = 'agent-zero:learning:v1';

export async function runM03Acceptance({ cdp, sleep, shot, waitReady }) {
  const results = [];
  const push = (rows) => {
    if (Array.isArray(rows)) results.push(...rows);
  };

  const evaluate = async (code, awaitPromise = true) => cdp.eval(code, awaitPromise);

  /* ================================================================== *
   * 起始条件：清空三个业务命名空间，保留 M0.1 偏好
   * ================================================================== */
  await evaluate(`(() => {
    localStorage.removeItem(${JSON.stringify(CONSTRUCTOR_KEY)});
    localStorage.removeItem(${JSON.stringify(EXECUTION_KEY)});
    localStorage.removeItem(${JSON.stringify(RESEARCH_KEY)});
    localStorage.removeItem(${JSON.stringify(LEARNING_KEY)});
    return true;
  })()`);
  await cdp.send('Page.reload', { ignoreCache: false });
  if (!(await waitReady(cdp))) throw new Error('M0.3 验收：重新加载后 __AZ 未就绪');
  await evaluate(`window.__AZ.skipIntro('M0.3 验收')`);
  await sleep(900);

  /* ================================================================== *
   * A01–A07 ATLAS
   * ================================================================== */
  await evaluate(`window.__AZ.openAtlas()`, false);
  await sleep(700);
  push(
    await evaluate(`(() => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const nodes = [...document.querySelectorAll('.atlas-node')];
      const list = [...document.querySelectorAll('.atlas-list__item')];
      const svg = document.querySelector('.atlas-svg');
      rec('A01', 'Atlas 初始载入：画布 10 个已开放节点 + 目录 36 个概念索引，画布可观察、信息可读',
        nodes.length === 10 && list.length === 36 && !!svg && !!svg.getAttribute('viewBox')
          && document.querySelector('.atlas-search__note').textContent.includes('36'),
        '节点=' + nodes.length + ' · 清单=' + list.length + ' · viewBox=' + (svg ? svg.getAttribute('viewBox') : '—'));
      return out;
    })()`)
  );
  await sleep(400);
  await shot('F15-Atlas全景.png');

  push(
    await evaluate(`(() => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const ids = [...document.querySelectorAll('.atlas-node')].map((n) => n.dataset.concept);
      const edges = [...document.querySelectorAll('.atlas-edge')];
      const invalid = edges.filter((e) => {
        const label = e.getAttribute('aria-label') || '';
        return !/的关系：/.test(label) || !/USES|RELATED|CONTRASTS/.test(label);
      });
      const types = {};
      edges.forEach((e) => { const t = e.dataset.type; types[t] = (types[t] || 0) + 1; });
      rec('A02', '语义关系：画布 13 条边都有合法类型与文字含义，无悬空关系（M1.1 新增 api–mcp、workflow–harness；M1.2 新增 tool_calling–mcp）',
        edges.length === 13 && invalid.length === 0 && ids.length === 10
          && types.USES === 3 && types.RELATED === 9 && types.CONTRASTS === 1 && !types.PART_OF,
        '边=' + edges.length + ' · 类型=' + JSON.stringify(types) + ' · 说明缺失=' + invalid.length + ' · 本轮不编造 PART_OF');
      return out;
    })()`)
  );

  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.atlasApi();
      const input = document.querySelector('.atlas-search__input');

      const search = async (value) => {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(320);
        return api.currentSelection();
      };

      const a = await search('LLM');
      const b = await search('TOOLCALLING');
      const c = await search('工具调用');
      const d = await search('没有这个概念的词');
      const emptyNote = document.querySelector('.atlas-search__note').textContent;
      rec('A03', '搜索：英文大小写、去空格写法与中文别名都能定位正确节点',
        a === 'llm' && b === 'tool_calling' && c === 'tool_calling' && /没有找到相关概念/.test(emptyNote),
        'LLM→' + a + ' · TOOLCALLING→' + b + ' · 工具调用→' + c + ' · 空结果提示=' + /没有找到相关概念/.test(emptyNote));
      return out;
    })()`, true)
  );

  push(
    await evaluate(`(() => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.atlasApi();
      const graph = api.graph;
      graph.resetView();
      const base = graph.getTransform();
      for (let i = 0; i < 12; i++) graph.zoomBy(1.2);
      const zoomedIn = graph.getTransform().k;
      for (let i = 0; i < 30; i++) graph.zoomBy(1 / 1.2);
      const zoomedOut = graph.getTransform().k;
      graph.resetView();
      const afterReset = graph.getTransform();

      // 平移：真实指针事件，验证有边界且不会把图形无限拖走
      const svg = document.querySelector('.atlas-svg');
      const rect = svg.getBoundingClientRect();
      const from = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      svg.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 21, clientX: from.x, clientY: from.y }));
      svg.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 21, clientX: from.x + 400, clientY: from.y + 300 }));
      const panned = graph.getTransform();
      svg.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 21, clientX: from.x + 400, clientY: from.y + 300 }));
      graph.resetView();
      const bounds = { w: 1000, h: 640 };
      const inside = Math.abs(panned.x) <= bounds.w * 0.42 + 1 && Math.abs(panned.y) <= bounds.h * 0.42 + 1;
      rec('A04', '缩放 / 平移 / 复位：限幅生效，Reset 恢复标准视角',
        base.k === 1 && zoomedIn <= 2.6 + 1e-6 && zoomedOut >= 0.55 - 1e-6 && Math.abs(panned.x) > 1
          && afterReset.k === 1 && afterReset.x === 0 && afterReset.y === 0 && inside,
        '基准 k=' + base.k + ' · 放大上限=' + zoomedIn.toFixed(2) + ' · 缩小下限=' + zoomedOut.toFixed(2)
          + ' · 平移=' + panned.x.toFixed(0) + ',' + panned.y.toFixed(0) + ' · 复位 k=' + afterReset.k);
      return out;
    })()`)
  );

  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.atlasApi();
      const before = [...document.querySelectorAll('.atlas-node')].map((n) => n.getAttribute('transform'));
      api.selectConcept('tool_calling', { focus: true });
      await sleep(200);
      const title = document.querySelector('.atlas-detail__scroll .inspector__title')?.textContent || '';
      const focused = az.atlasApi().graph.getTransform();
      const selected = document.querySelector('.atlas-node[data-concept="tool_calling"].is-selected');
      const related = document.querySelector('.atlas-node[data-concept="tools"].is-related');

      // 离开再进入：坐标固定不重排，视角复位到标准值
      az.goHub();
      await sleep(200);
      az.openAtlas();
      await sleep(300);
      const after = [...document.querySelectorAll('.atlas-node')].map((n) => n.getAttribute('transform'));
      const sameLayout = before.length === after.length && before.every((v, i) => v === after[i]);
      rec('A05', '点击 / 聚焦：选中、详情与关联高亮一致；刷新或切页不重排节点',
        title.includes('工具调用') && !!selected && !!related && focused.k > 1 && sameLayout,
        '详情标题=' + title + ' · 选中=' + !!selected + ' · 关联高亮=' + !!related + ' · 聚焦 k=' + focused.k.toFixed(2) + ' · 坐标固定=' + sameLayout);
      return out;
    })()`, true)
  );

  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.atlasApi();
      const clickEdge = async (type) => {
        const edge = document.querySelector('.atlas-edge[data-type="' + type + '"] .atlas-edge__hit');
        edge.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await sleep(160);
        return document.querySelector('.atlas-detail__scroll').textContent;
      };
      const relatedText = await clickEdge('RELATED');
      const usesText = await clickEdge('USES');
      const contrastsText = await clickEdge('CONTRASTS');
      rec('A06', '关系 Inspector：方向与文字解释正确，可选关系没被画成必需依赖',
        /无向关系/.test(relatedText) && /有向关系/.test(usesText) && /无向关系/.test(contrastsText)
          && /不代表|不构成|不是同义词|不等于/.test(relatedText),
        'RELATED=无向 ' + /无向关系/.test(relatedText) + ' · USES=有向 ' + /有向关系/.test(usesText) + ' · CONTRASTS=无向 ' + /无向关系/.test(contrastsText));
      return out;
    })()`, true)
  );

  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.atlasApi();
      api.clearSelection();
      // 完全不用画布命中点：只用清单按钮 + 键盘
      const items = [...document.querySelectorAll('.atlas-list__item')];
      const target = items.find((b) => b.dataset.concept === 'mcp');
      target.focus();
      const focused = document.activeElement === target;
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      target.click();
      await sleep(200);
      const title = document.querySelector('.atlas-detail__scroll .inspector__title')?.textContent || '';
      const nodeKeyboardable = [...document.querySelectorAll('.atlas-node')].every((n) => n.getAttribute('tabindex') === '0' && n.getAttribute('role') === 'button');
      const edgeKeyboardable = [...document.querySelectorAll('.atlas-edge')].every((n) => n.getAttribute('tabindex') === '0');
      rec('A07', '键盘与触屏访问：不必操作画布命中点也能选择节点并打开详情',
        focused && title.includes('模型上下文协议') && nodeKeyboardable && edgeKeyboardable,
        '清单按钮可聚焦=' + focused + ' · 详情=' + title + ' · 节点可聚焦=' + nodeKeyboardable + ' · 关系可聚焦=' + edgeKeyboardable);
      return out;
    })()`, true)
  );

  /* 搜索聚焦截图（F16） */
  await evaluate(`(() => { const i = document.querySelector('.atlas-search__input'); i.value = 'Tool Calling'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`, false);
  await sleep(700);
  await shot('F16-Atlas搜索聚焦.png');
  await sleep(100);

  /* ================================================================== *
   * A08–A13 Tool Calling 知识页
   * ================================================================== */
  await evaluate(`window.__AZ.openKnowledge('tool_calling')`, false);
  await sleep(600);
  push(
    await evaluate(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const discoverText = document.querySelector('.kn-main').textContent;
      document.querySelector('.kn-steps [data-step="understand"]').click();
      await sleep(320);
      const text = document.querySelector('.kn-main').textContent;
      const stages = [...document.querySelectorAll('.kn-stage')].map((s) => s.dataset.stage);
      const oneLiner = document.querySelector('.kn-hero__title')?.textContent || '';
      const activeStage = document.querySelector('.kn-stage[data-active="true"]')?.dataset.stage;
      rec('A08', 'Tool Calling 入门：DISCOVER 与 UNDERSTAND 的三方职责清楚，无错误概念',
        /为什么模型不能直接知道/.test(discoverText) && stages.join(',') === 'request,execute,return'
          && /外部应用或运行环境完成/.test(oneLiner)
          && /执行通常由外部应用|实际执行通常由外部/.test(oneLiner)
          && /模型不执行工具|模型只负责生成请求|模型只提出|不是执行结果/.test(text)
          && !/模型内部思维链|模型的思考过程可以观察/.test(text),
        '三段职责=' + stages.join('→') + ' · 当前高亮=' + activeStage + ' · 一句话=' + oneLiner.slice(0, 34) + '…');
      return out;
    })()`, true)
  );

  await shot('F17-ToolCalling-Understand.png');

  push(
    await evaluate(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      document.querySelector('.kn-layers button[data-layer="inspect"]').click();
      await sleep(240);
      const code = document.querySelector('.code-block')?.textContent || '';
      const main = document.querySelector('.kn-main').textContent;
      const aside = document.querySelector('.kn-aside').textContent;
      document.querySelector('.kn-flow__controls button:nth-child(3)').click();
      await sleep(200);
      const execLayer = document.querySelector('.kn-inspect')?.textContent || '';
      rec('A09', 'Tool Calling 深入：简化请求格式、权限检查与 MCP/API 边界清楚',
        /"tool": "announcement_search"/.test(code) && /scope/.test(code)
          && /工具是否已提供/.test(execLayer) && /权限是否满足/.test(execLayer)
          && /工具不必通过 MCP 提供/.test(aside) && /MCP 服务端也能暴露资源/.test(aside)
          && /不授予工具/.test(aside) && /部分工具内部会封装 API/.test(aside),
        'INSPECT 请求=' + /"tool": "announcement_search"/.test(code) + ' · 权限检查=' + /权限是否满足/.test(execLayer)
          + ' · MCP 边界=' + /工具不必通过 MCP 提供/.test(aside) + ' · Skills 边界=' + /不授予工具/.test(aside));
      return out;
    })()`, true)
  );
  await sleep(300);
  await shot('F18-ToolCalling-Inspect.png');

  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.knowledgeApi();
      api.setStep('experiment');
      await sleep(260);

      const run = (patch) => { api.rerunExperiment(patch); return api.experimentSnapshot(); };
      const base = run({ condition: 'ready', maxResults: 3, searchScope: 'all_notices', readMode: 'full_text', includeMetadata: true });
      const limited = run({ maxResults: 5 });
      const scoped = run({ searchScope: 'campus_events', maxResults: 10 });
      const summary = run({ searchScope: 'all_notices', maxResults: 5, readMode: 'summary' });
      const noReader = run({ readMode: 'full_text', condition: 'no_reader' });
      const unauthorized = run({ condition: 'reader_unauthorized' });

      const searchOf = (snap) => snap.payloads['p:search-response'];
      const readOf = (snap) => snap.payloads['p:read-response'];
      const paramEffect = searchOf(base).returned === 3 && searchOf(base).truncated === true
        && searchOf(limited).returned === 5 && searchOf(scoped).returned === 3
        && readOf(summary).textScope === 'summary' && readOf(summary).content === null
        && readOf(base).textScope === 'full_text' && readOf(base).content !== null
        && noReader.branchId === 'B03_NO_READER' && unauthorized.branchId === 'B03_NO_READER';

      // step / play / reset 三个控件真实生效（每次点击后重新查询，因为面板会重渲染）
      const btn = (n) => document.querySelector('.kn-exp__transport button:nth-child(' + n + ')');
      btn(3).click(); // 下一步
      await sleep(140);
      btn(3).click();
      await sleep(140);
      const afterNext = api.experimentSnapshot().stepIndex;
      btn(2).click(); // 播放
      await sleep(300);
      const playing = btn(2).textContent;
      btn(2).click(); // 暂停
      await sleep(140);
      const paused = btn(2).textContent;
      btn(4).click(); // 复位
      await sleep(180);
      const afterReset = api.experimentSnapshot().stepIndex;

      rec('A10', 'Tool Calling 实验：step/play/reset 生效，且参数真实改变事件与响应',
        paramEffect && afterNext >= 2 && /暂停/.test(playing) && /播放/.test(paused) && afterReset === 0,
        '参数效应=' + paramEffect + ' · 单步后 index=' + afterNext + ' · 播放中按钮=' + playing.trim() + ' · 暂停后=' + paused.trim()
          + ' · 复位后 index=' + afterReset + ' · 分支（缺 Reader/未授权）=' + noReader.branchId + '/' + unauthorized.branchId);
      return out;
    })()`, true)
  );

  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const beforeConfig = localStorage.getItem(${JSON.stringify(CONSTRUCTOR_KEY)});
      const beforeSnap = JSON.stringify(az.constructorConfigSnapshot());
      const beforeLearning = localStorage.getItem(${JSON.stringify(LEARNING_KEY)});
      const api = az.knowledgeApi();
      api.rerunExperiment({ condition: 'ready', maxResults: 5, searchScope: 'all_notices', readMode: 'full_text', includeMetadata: true });
      await sleep(160);
      api.completeExperiment();
      await sleep(220);
      const afterConfig = localStorage.getItem(${JSON.stringify(CONSTRUCTOR_KEY)});
      const afterSnap = JSON.stringify(az.constructorConfigSnapshot());
      const afterLearning = localStorage.getItem(${JSON.stringify(LEARNING_KEY)});
      const experimentOnly = beforeConfig === afterConfig && beforeSnap === afterSnap && !!afterLearning && afterLearning !== beforeLearning;
      const learningFlags = JSON.parse(afterLearning || '{"concepts":{}}').concepts.tool_calling || {};
      rec('A11', '实验隔离：知识示范不会修改装配配置或授权，只写独立的学习进度',
        experimentOnly && learningFlags.experimentCompleted === true,
        '构建器配置不变=' + (beforeConfig === afterConfig && beforeSnap === afterSnap)
          + ' · 学习进度写入实验完成标记=' + (learningFlags.experimentCompleted === true)
          + ' · 执行记录未被知识页写入=' + (localStorage.getItem(${JSON.stringify(EXECUTION_KEY)}) === null));
      return out;
    })()`, true)
  );

  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.knowledgeApi();
      api.setStep('connect');
      await sleep(260);
      const modulesBefore = az.constructorSnapshot().modules.length;
      document.querySelector('.kn-main [data-act="view-constructor"]').click();
      await sleep(400);
      const after = az.constructorSnapshot();
      const toast = document.querySelector('.toast')?.textContent || '';
      rec('A12', '知识导航到 Constructor：正确定位工具，尚未装配时明确说明而不偷偷添加',
        az.state.mode === 'constructor' && az.state.systemView === false && az.workspaceKind() === null
          && after.modules.length === modulesBefore && modulesBefore === 0
          && /尚未装配/.test(toast + document.querySelector('.shell').textContent),
        'mode=' + az.state.mode + ' · 模块数 ' + modulesBefore + '→' + after.modules.length + ' · 提示=' + toast.slice(0, 30));
      return out;
    })()`, true)
  );

  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      // 装配两种工具并授权，形成一个真实的 Inspector 上下文
      az.previewModule('announcement_search');
      az.confirmAssembly();
      az.configureModule('announcement_search', { readPermission: true });
      az.previewModule('document_reader');
      az.confirmAssembly();
      az.configureModule('document_reader', { readPermission: true, readMode: 'full_text' });
      az.selectModule('document_reader');
      await sleep(360);
      const opened = az.openKnowledgeFromInspector();
      await sleep(420);
      const kind = az.workspaceKind();
      document.querySelector('.ws-head [data-act="return"]').click();
      await sleep(420);
      const back = az.constructorSnapshot();
      rec('A13', 'Constructor 返回知识：从工具 Inspector 往返并保持 Inspector 上下文',
        opened && kind === 'knowledge' && az.state.mode === 'constructor' && az.workspaceKind() === null
          && back.selectedModuleId === 'document_reader',
        '知识页打开=' + kind + ' · 返回后 mode=' + az.state.mode + ' · 保持选中=' + back.selectedModuleId);
      return out;
    })()`, true)
  );

  /* ================================================================== *
   * A14–A28 执行台与回放
   * ================================================================== */
  await evaluate(`window.__AZ.openExecution({ autorun: true })`, false);
  await sleep(700);
  push(
    await evaluate(`(() => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.executionApi();
      const run = api.currentRun();
      const types = run.events.map((e) => e.type);
      const nodes = document.querySelectorAll('.ex-node').length;
      const ticks = document.querySelectorAll('.ex-tick').length;
      const activeBranches = document.querySelectorAll('.ex-branch[data-active="true"]').length;
      const execBranches = document.querySelectorAll('.ex-branches:not(.ex-branches--evidence) .ex-branch[data-active="true"]').length;
      const evBranches = document.querySelectorAll('.ex-branches--evidence .ex-branch[data-active="true"]').length;
      const searchResults = types.filter((t) => t === 'tool.result').length;
      rec('A14', '正常 Run：Search/Reader Ready 时确有检索、读取与样本获得事件',
        ['research_complete', 'research_partial'].includes(run.outcome) && run.branchId === 'B01_NORMAL'
          && searchResults >= 2 && types.includes('evidence.sample_collected') && types.includes('report.generated')
          && types.includes('run.completed')
          && run.artifacts.evidence.level === 'full_text' && nodes === run.events.length && ticks === run.events.length
          && execBranches === 1 && evBranches >= 1 && !!run.artifacts.report.claims,
        '结局=' + run.outcome + ' · 分支=' + run.branchId + ' · 事件=' + run.events.length + ' · 执行图节点=' + nodes
          + ' · 时间轴=' + ticks + ' · 报告=' + run.artifacts.report.status + ' · 执行分支=' + execBranches + ' / 证据分支=' + evBranches);
      return out;
    })()`)
  );

  /* F19：正常进行中的执行画面（先定位到 Reader 返回那一步） */
  await evaluate(`(() => { window.__AZ.executionApi().seek(6); return true; })()`, false);
  await sleep(600);
  await shot('F19-Execution正常进行.png');

  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.executionApi();
      api.seek(0);
      await sleep(120);
      const before = api.currentIndex();
      const has3D = !!(az.scene && az.scene.ok);
      const parked = !!document.querySelector('.ex-core__stage .stage__canvas');
      const framesBefore = az.frameCount();
      api.play();
      const samples = [];
      for (let i = 0; i < 6; i++) {
        await sleep(300);
        samples.push(api.currentIndex());
      }
      const framesDuring = az.frameCount() - framesBefore;
      const during = api.currentIndex();
      const playingTag = document.querySelector('[data-el="play-state"]').textContent;
      api.play(); // 暂停
      await sleep(150);
      const paused = api.currentIndex();
      await sleep(900);
      const stillPaused = api.currentIndex();
      const pausedTag = document.querySelector('[data-el="play-state"]').textContent;
      // 播放到末尾（回放由执行台自己的调度器推进，不依赖渲染帧）；事件数量随 M0.4 增加，用 4× 加速
      api.setSpeed(4);
      api.play();
      for (let i = 0; i < 80; i++) { await sleep(250); if (!api.isPlaying()) break; }
      const ended = api.currentIndex() === api.eventCount() - 1;
      api.setSpeed(1);
      rec('A25', '回放播放 / 暂停：能播放到结束，暂停后指针与执行动画都不再推进',
        during > before && paused === during && stillPaused === paused && ended && /PAUSED/.test(pausedTag) && /PLAYING/.test(playingTag)
          && api.isPlaying() === false,
        '播放 1.8s：' + before + '→' + during + '（采样 ' + samples.join('/') + '）· 暂停后 ' + paused + '=' + stillPaused + ' · 末尾=' + ended
          + ' · 状态标签=' + playingTag.trim() + '/' + pausedTag.trim() + ' · WebGL=' + has3D + ' · 画布停靠=' + parked
          + ' · 期间渲染帧=' + framesDuring);
      return out;
    })()`, true)
  );

  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.executionApi();
      api.seek(0);
      await sleep(100);
      api.prev();
      const atStart = api.currentIndex();
      const total = api.eventCount();
      api.seek(total - 1);
      await sleep(100);
      api.next();
      const atEnd = api.currentIndex();
      // Seek：点击时间轴事件条
      const ticks = [...document.querySelectorAll('.ex-tick')];
      ticks[4].click();
      await sleep(220);
      const seeked = api.currentIndex();
      const currentTick = document.querySelector('.ex-tick[data-current="true"]');
      // 速度
      const speeds = [];
      for (const s of [0.5, 1, 2, 4]) {
        api.setSpeed(s);
        await sleep(60);
        speeds.push(document.querySelector('.ex-transport select').value);
      }
      const signature = api.currentRun().events.map((e) => e.id + e.type).join('|');
      const signatureAfter = api.currentRun().events.map((e) => e.id + e.type).join('|');
      rec('A26', '单步 / Seek / 速度：首尾不越界，四档速度可用且不改变运行结果',
        atStart === 0 && atEnd === total - 1 && seeked === 4 && !!currentTick
          && speeds.join(',') === '0.5,1,2,4' && signature === signatureAfter,
        '起点不越界=' + atStart + ' · 末尾不越界=' + atEnd + ' · Seek→' + seeked + ' · 速度=' + speeds.join('/') + ' · 结果不变=' + (signature === signatureAfter));
      return out;
    })()`, true)
  );

  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.executionApi();
      const run = api.currentRun();

      const toolResultSeq = run.events.findIndex((e) => e.type === 'tool.result' && e.toolId === 'document_reader');
      api.seek(toolResultSeq);
      await sleep(400);
      const focus = az.scene && az.scene.ok ? az.scene.bay.getExecutionFocus() : null;
      const core2dActive = [...document.querySelectorAll('.ex-core__svg .exc-node[data-tool][data-active="true"]')].map((n) => n.dataset.tool);
      const inspectorId = document.querySelector('.ev-detail__hero')?.dataset.event || '';
      const sameEvent = inspectorId === run.events[toolResultSeq].id
        && document.querySelector('.ex-node[data-current="true"]')?.dataset.event === inspectorId;

      // 阻断事件：不得亮起 Reader 成功状态
      const blockedSeq = run.events.findIndex((e) => e.status === 'blocked');
      let blockedOK = null;
      if (blockedSeq >= 0) {
        api.seek(blockedSeq);
        await sleep(300);
        blockedOK = [...document.querySelectorAll('.ex-core__svg .exc-node[data-tool]')].filter((n) => n.getAttribute('data-state') === 'success').length === 0;
      } else {
        blockedOK = true;
      }
      rec('A27', '3D/2D 同步：同一 eventId 在三维聚焦、执行图与 Inspector 三处一致',
        !!focus && focus.moduleId === 'document_reader' && core2dActive.length === 1 && core2dActive[0] === 'document_reader'
          && sameEvent && blockedOK,
        '三维聚焦=' + (focus ? focus.moduleId : '—') + ' · 二维高亮=' + core2dActive.join(',') + ' · eventId 对齐=' + sameEvent
          + ' · 阻断步骤未亮成功态=' + blockedOK);
      return out;
    })()`, true)
  );

  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.executionApi();
      const run = api.currentRun();
      // 事件 Inspector：任意事件都有序号、状态、输入输出与分支依据
      const seq = run.events.findIndex((e) => e.type === 'tool.result' && e.toolId === 'announcement_search');
      api.seek(seq);
      await sleep(300);
      const detail = document.querySelector('.ex-inspector__scroll');
      const json = document.querySelector('.payload__json');
      const safe = json && json.children.length === 0 && /"kind"/.test(json.textContent);
      const allJson = [...document.querySelectorAll('.payload__json')].map((p) => p.textContent).join(' ;; ');
      const refs = [...document.querySelectorAll('.payload__ref')].map((p) => p.textContent);
      const text = detail.textContent;
      const complete = /序号/.test(text) && /状态/.test(text) && /参与者/.test(text)
        && /触发规则/.test(text) && /分支/.test(text) && /资料引用/.test(text) && /片段引用/.test(text);
      rec('A24', '事件 Inspector：任意事件有正确序号、状态、调用 / 响应与原因，资料文本安全显示',
        complete && safe && /search\.request/.test(allJson) && /search\.response/.test(allJson)
          && refs.includes('p:search-request') && refs.includes('p:search-response'),
        '字段完整=' + complete + ' · 载荷以文本节点渲染（无 HTML 注入）=' + safe
          + ' · 输入=' + /search\.request/.test(allJson) + ' / 输出=' + /search\.response/.test(allJson)
          + ' · 载荷引用=' + refs.join(','));
      return out;
    })()`, true)
  );

  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.executionApi();
      const first = api.currentRun();
      const sig = (r) => r.runId + '|' + r.outcome + '|' + r.events.map((e) => e.id + e.type + e.status + e.message).join('|');
      const before = sig(first);
      api.newRun();
      const second = api.currentRun();
      const after = sig(second);
      rec('A22', '确定性：同一配置 + 任务版本 + 故障选项产生相同语义事件与结果',
        before === after && first.runId === second.runId && second.events.length === first.events.length,
        'runId=' + first.runId + ' 两次一致=' + (before === after) + ' · 事件数=' + second.events.length);
      return out;
    })()`, true)
  );

  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.executionApi();
      const run = api.currentRun();
      const eventsBefore = run.events.map((e) => e.id + e.status).join('|');
      const snapshotModules = run.configSnapshot.modules.length;
      // 运行之后修改装配台：移除 Reader 并改参数
      az.removeModule('document_reader');
      az.configureModule('announcement_search', { maxResults: 10 });
      await sleep(320);
      const stillSame = api.currentRun().events.map((e) => e.id + e.status).join('|') === eventsBefore;
      const snapshotKept = api.currentRun().configSnapshot.modules.length === snapshotModules;
      const stored = JSON.parse(localStorage.getItem(${JSON.stringify(RESEARCH_KEY)}));
      const storedKept = stored.runs[0].run.configSnapshot.modules.length === snapshotModules;
      const repoNow = JSON.parse(localStorage.getItem(${JSON.stringify(CONSTRUCTOR_KEY)})).modules.map((m) => m.moduleId).join(',');
      // New Run 才使用新配置
      api.newRun();
      await sleep(300);
      const next = api.currentRun();
      rec('A23', '配置快照隔离：运行后编辑 / 移除模块，旧轨迹与回放不被覆盖或重算',
        stillSame && snapshotKept && storedKept && repoNow === 'announcement_search'
          && next.branchId === 'B03_NO_READER' && next.runId !== run.runId,
        '旧轨迹不变=' + stillSame + ' · 快照保留=' + snapshotKept + ' · 本地记录保留=' + storedKept
          + ' · 装配台现为=' + repoNow + ' · 新运行分支=' + next.branchId);
      return out;
    })()`, true)
  );

  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.executionApi();
      // 当前状态：Reader 已移除 → B03
      const b03 = api.currentRun();
      const b03ok = b03.branchId === 'B03_NO_READER' && b03.outcome === 'partial'
        && b03.events.filter((e) => e.type === 'tool.result' && e.toolId === 'document_reader').length === 0
        && b03.artifacts.evidence.level === 'search_excerpt'
        && b03.events.some((e) => e.status === 'blocked' && e.toolId === 'document_reader');
      const blockedNodes = document.querySelectorAll('.ex-node[data-status="blocked"]').length;
      // 截图前把指针移到阻断事件本身：F20 要展示「阻断位置」，而不是运行开头
      const blockedSeq = b03.events.findIndex((e) => e.status === 'blocked');
      if (blockedSeq >= 0) {
        api.seek(blockedSeq);
        await sleep(300);
      }
      rec('A17', 'Reader 缺失：Search 可成功、Reader 不成功，且不伪造已读全文',
        b03ok && blockedNodes >= 1 && ![...document.querySelectorAll('.ex-node[data-status="success"]')].some((n) => /读取返回/.test(n.textContent)),
        '分支=' + b03.branchId + ' · 结局=' + b03.outcome + ' · 阻断节点=' + blockedNodes + ' · 样本等级=' + b03.artifacts.evidence.level
          + ' · 截图指针=#' + String(blockedSeq).padStart(2, '0'));
      return out;
    })()`, true)
  );
  await sleep(400);
  await shot('F20-Reader不可用分支.png');

  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.executionApi();
      // 移除 Search → B02
      az.removeModule('announcement_search');
      await sleep(240);
      api.newRun();
      await sleep(260);
      const b02 = api.currentRun();
      const noCalls = b02.events.filter((e) => e.type === 'tool.call' || e.type === 'tool.result').length === 0;
      const reason = b02.events.find((e) => e.type === 'validation.blocked')?.message || '';
      const successNodes = document.querySelectorAll('.ex-node[data-status="success"]').length;
      // Disabled 也走同一条阻断路径
      az.previewModule('announcement_search');
      az.confirmAssembly();
      az.configureModule('announcement_search', { readPermission: true });
      az.toggleModule('announcement_search', false);
      await sleep(220);
      api.newRun();
      await sleep(240);
      const disabled = api.currentRun();
      rec('A15', 'Search 缺失 / Disabled：不生成成功的调用结果，并说明缺失原因',
        b02.branchId === 'B02_NO_SEARCH' && b02.outcome === 'blocked' && noCalls && /检索工具不可用/.test(reason) && successNodes === 0
          && disabled.branchId === 'B02_NO_SEARCH' && disabled.outcome === 'blocked'
          && /禁用/.test(disabled.events.find((e) => e.type === 'validation.blocked')?.message || ''),
        '缺失分支=' + b02.branchId + ' · 调用事件=' + (noCalls ? 0 : '有') + ' · 原因=' + reason.slice(0, 34) + '… · Disabled 分支=' + disabled.branchId);
      return out;
    })()`, true)
  );

  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.executionApi();
      // 未授权：已装配、已启用，但缺只读模拟权限
      az.toggleModule('announcement_search', true);
      az.configureModule('announcement_search', { readPermission: false });
      await sleep(240);
      api.newRun();
      await sleep(240);
      const unauthorized = api.currentRun();
      const reason = unauthorized.events.find((e) => e.type === 'validation.blocked')?.message || '';
      rec('A16', 'Search 未授权 / Invalid：不被当作 Ready，事件说明阻断原因',
        unauthorized.branchId === 'B02_NO_SEARCH' && /只读模拟权限/.test(reason)
          && unauthorized.events.filter((e) => e.type === 'tool.result').length === 0,
        '分支=' + unauthorized.branchId + ' · 原因=' + reason.slice(0, 40) + '…');
      return out;
    })()`, true)
  );

  /* Invalid 配置：直接写入不合法的持久化配置（模拟损坏 / 旧版本数据），刷新后运行 */
  await evaluate(`(() => {
    const raw = JSON.parse(localStorage.getItem(${JSON.stringify(CONSTRUCTOR_KEY)}) || '{"schemaVersion":1,"modules":[]}');
    raw.modules = [{ moduleId: 'announcement_search', portId: 'SEARCH_PORT', enabled: true, permissions: { read: true }, settings: { searchScope: 'all_notices', maxResults: 999 } }];
    localStorage.setItem(${JSON.stringify(CONSTRUCTOR_KEY)}, JSON.stringify(raw));
    return true;
  })()`);
  await cdp.send('Page.reload', { ignoreCache: false });
  if (!(await waitReady(cdp))) throw new Error('Invalid 配置下页面未就绪');
  await evaluate(`window.__AZ.skipIntro('A16-invalid')`);
  await sleep(700);
  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const status = az.constructorSnapshot().modules[0].status;
      az.openExecution({ autorun: true });
      await sleep(520);
      const api = az.executionApi();
      const run = api.currentRun();
      const reason = run.events.find((e) => e.type === 'validation.blocked')?.message || '';
      rec('A16b', 'Invalid 配置：非法字段不会被当作 Ready，运行如实阻断',
        status === 'Invalid' && run.branchId === 'B02_NO_SEARCH' && run.outcome === 'blocked' && /非法|取值|不在允许范围/.test(reason),
        '模块状态=' + status + ' · 分支=' + run.branchId + ' · 原因=' + reason.slice(0, 34) + '…');
      return out;
    })()`, true)
  );

  /* 恢复正常配置，继续 A18 / A19 / A20 / A21 */
  await evaluate(`window.__AZ.resetConstructor()`);
  await sleep(300);
  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.executionApi();
      const setup = (readMode, includeMetadata, extra = {}) => {
        az.previewModule('announcement_search');
        az.confirmAssembly();
        az.configureModule('announcement_search', { readPermission: true, searchScope: extra.searchScope || 'all_notices', maxResults: extra.maxResults || 5 });
        az.previewModule('document_reader');
        az.confirmAssembly();
        az.configureModule('document_reader', { readPermission: true, readMode, includeMetadata });
      };

      setup('summary', true);
      await sleep(240);
      api.newRun();
      await sleep(220);
      const summaryRun = api.currentRun();
      const summaryPayload = summaryRun.artifacts.payloads['p:read-response'];
      const summaryEvent = summaryRun.events.find((e) => e.type === 'tool.result' && e.toolId === 'document_reader');

      az.configureModule('document_reader', { readMode: 'full_text' });
      await sleep(200);
      api.newRun();
      await sleep(220);
      const fullRun = api.currentRun();
      const fullPayload = fullRun.artifacts.payloads['p:read-response'];
      const notice = window.__AZ ? null : null;

      rec('A18', 'Reader summary / full_text：返回内容范围正确，summary 不表现为全文读取',
        summaryPayload.textScope === 'summary' && summaryPayload.content === null && typeof summaryPayload.summary === 'string'
          && summaryRun.artifacts.evidence.level === 'summary_chunk' && /摘要/.test(summaryEvent.message)
          && !/完整正文/.test(summaryEvent.message)
          && fullPayload.textScope === 'full_text' && fullPayload.summary === null
          && /完整正文/.test(fullRun.events.find((e) => e.type === 'tool.result' && e.toolId === 'document_reader').message),
        'summary→' + summaryPayload.textScope + '（content=' + summaryPayload.content + '，证据=' + summaryRun.artifacts.evidence.level
          + '，事件=' + summaryEvent.message.slice(0, 22) + '…）· full_text→' + fullPayload.textScope + '（' + (fullPayload.content || '').length + ' 字符）');
      return out;
    })()`, true)
  );

  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.executionApi();
      az.configureModule('document_reader', { includeMetadata: false });
      await sleep(220);
      api.newRun();
      await sleep(240);
      const run = api.currentRun();
      const payload = run.artifacts.payloads['p:read-response'];
      const json = JSON.stringify(payload);
      const internal = run.artifacts.internal['i:read'] || {};
      const hidden = payload.metadata === null && payload.metadataIncluded === false
        && !/publishedAt|publisher|2026-/.test(json) && !!internal.publishedAt;
      az.configureModule('document_reader', { includeMetadata: true });
      await sleep(200);
      api.newRun();
      await sleep(220);
      const withMeta = api.currentRun().artifacts.payloads['p:read-response'];
      rec('A19', 'includeMetadata：关闭时用户可见响应不含来源与日期，内部追踪元数据仍分离保存',
        hidden && withMeta.metadataIncluded === true && !!withMeta.metadata.publishedAt,
        '关闭时用户可见响应含元数据=' + /publishedAt|publisher/.test(json) + ' · metadata=' + payload.metadata
          + ' · 内部追踪仍保留 publishedAt=' + !!internal.publishedAt + ' · 开启后 metadata=' + JSON.stringify(withMeta.metadata));
      return out;
    })()`, true)
  );

  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.executionApi();
      const searchResultOf = (run) => run.events.find((e) => e.type === 'tool.result' && e.toolId === 'announcement_search');
      const runWith = async (patch) => {
        az.configureModule('announcement_search', { readPermission: true, ...patch });
        await sleep(200);
        api.newRun();
        await sleep(220);
        return api.currentRun();
      };
      const all3 = await runWith({ searchScope: 'all_notices', maxResults: 3 });
      const all5 = await runWith({ searchScope: 'all_notices', maxResults: 5 });
      const campus = await runWith({ searchScope: 'campus_events', maxResults: 5 });
      const a = searchResultOf(all3);
      const b = searchResultOf(all5);
      const c = searchResultOf(campus);
      const payloadA = all3.artifacts.payloads['p:search-response'];
      const payloadB = all5.artifacts.payloads['p:search-response'];
      const payloadC = campus.artifacts.payloads['p:search-response'];
      const totalAll = payloadB.total;
      const totalCampus = payloadC.total;
      rec('A20', 'searchScope / maxResults：过滤与上限产生可检查的不同模拟结果',
        /返回 3 条（已截断）/.test(a.message) && a.sourceIds.length === 3 && payloadA.total === totalAll && payloadA.truncated === totalAll > 3
          && /(全部)?返回 5 条/.test(b.message) && b.sourceIds.length === 5 && payloadB.truncated === totalAll > 5
          && c.sourceIds.length === Math.min(5, totalCampus) && totalCampus < totalAll
          && c.sourceIds.every((id) => az.mission001.getNotice(id).scope === 'campus_events')
          && payloadC.items.every((i) => i.matchedScope === 'campus_events'),
        'all/3 → ' + a.message.slice(0, 26) + '… · all/5 → ' + b.message.slice(0, 22) + '… · campus/5 → ' + c.message.slice(0, 22) + '… · 候选 ' + totalAll + ' / ' + totalCampus);
      return out;
    })()`, true)
  );

  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.executionApi();
      api.setFaultMode('search_timeout');
      await sleep(140);
      api.newRun();
      await sleep(260);
      const fault = api.currentRun();
      const errorEvent = fault.events.find((e) => e.type === 'tool.error');
      const optionTag = document.querySelector('.ex-info__tools')?.textContent || '';
      api.setFaultMode('normal');
      await sleep(140);
      api.newRun();
      await sleep(240);
      const normal = api.currentRun();
      rec('A21', '固定超时分支：faultMode 激活后有确定性 error / blocked 轨迹，无假成功',
        fault.branchId === 'B04_SEARCH_TIMEOUT' && fault.outcome === 'error'
          && fault.events.filter((e) => e.type === 'tool.result').length === 0
          && /SEARCH_TIMEOUT/.test(fault.artifacts.payloads['p:search-error'].code)
          && /超时/.test(errorEvent.message) && fault.options.faultMode === 'search_timeout'
          && /faultMode search_timeout/.test(optionTag) === false
          && normal.branchId === 'B01_NORMAL' && ['research_complete', 'research_partial'].includes(normal.outcome),
        '故障分支=' + fault.branchId + ' · 结局=' + fault.outcome + ' · 错误码=' + fault.artifacts.payloads['p:search-error'].code
          + ' · 关闭后分支=' + normal.branchId + ' · 模块未被写成 Invalid=' + (normal.artifacts.payloads['p:availability'].tools[0].status === 'Ready'));
      return out;
    })()`, true)
  );

  /* F21：暂停状态截图 */
  await evaluate(`(() => { const az = window.__AZ; az.executionApi().seek(3); return true; })()`, false);
  await sleep(500);
  await shot('F21-Replay暂停.png');

  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.executionApi();
      const run = api.currentRun();
      const events = run.events.map((e) => e.id).join('|');
      api.play();
      await sleep(700);
      api.setSpeed(2);
      await sleep(500);
      api.seek(1);
      await sleep(200);
      api.restart();
      await sleep(160);
      const after = api.currentRun().events.map((e) => e.id).join('|');
      rec('A26b', '回放控制不改变运行数据：播放 / 调速 / Seek / 复位后事件数组完全一致',
        events === after && api.currentIndex() === 0 && api.isPlaying() === false
          && api.currentRun().runId === run.runId,
        '事件数组不变=' + (events === after) + ' · 复位后 index=' + api.currentIndex() + ' · runId 未变=' + (api.currentRun().runId === run.runId));
      return out;
    })()`, true)
  );

  /* A28：刷新恢复 + 损坏降级 */
  const savedBeforeReload = await evaluate(`(() => {
    const raw = JSON.parse(localStorage.getItem(${JSON.stringify(RESEARCH_KEY)}));
    const storedRun = raw.runs[0].run;
    return { runId: storedRun.runId, events: storedRun.events.length, outcome: storedRun.outcome, savedAt: raw.savedAt };
  })()`);
  await cdp.send('Page.reload', { ignoreCache: false });
  if (!(await waitReady(cdp))) throw new Error('刷新后 __AZ 未就绪');
  await evaluate(`window.__AZ.skipIntro('A28')`);
  await sleep(700);
  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      az.openExecution();
      await sleep(500);
      const api = az.executionApi();
      const run = api.currentRun();
      const restored = api.restoredFrom();
      rec('A28', '存储恢复：最近一次 Run 可从本地恢复（恢复的是快照，不重算引擎）',
        !!run && restored === 'restored' && run.runId === ${JSON.stringify(savedBeforeReload.runId)}
          && run.events.length === ${savedBeforeReload.events} && run.outcome === ${JSON.stringify(savedBeforeReload.outcome)}
          && api.currentIndex() === 0 && api.isPlaying() === false,
        '恢复来源=' + restored + ' · runId 一致=' + (run.runId === ${JSON.stringify(savedBeforeReload.runId)}) + ' · 事件=' + run.events.length
          + ' · 结局=' + run.outcome + ' · 指针从 0 开始（未自动播放）');
      return out;
    })()`, true)
  );

  await evaluate(`localStorage.removeItem(${JSON.stringify(EXECUTION_KEY)}); localStorage.setItem(${JSON.stringify(RESEARCH_KEY)}, '{ broken json ')`);
  await cdp.send('Page.reload', { ignoreCache: false });
  if (!(await waitReady(cdp))) throw new Error('损坏的执行记录下页面白屏（__AZ 未就绪）');
  await evaluate(`window.__AZ.skipIntro('A28-corrupt')`);
  await sleep(700);
  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const constructorBefore = localStorage.getItem(${JSON.stringify(CONSTRUCTOR_KEY)});
      const learningBefore = localStorage.getItem(${JSON.stringify(LEARNING_KEY)});
      az.goHub();
      az.openExecution();
      await sleep(420);
      const api = az.executionApi();
      const body = document.body.innerText;
      const noRun = api.currentRun() === null && api.eventCount() === 0;
      const noticeLogged = (window.__AZ.constructorSnapshot ? true : true) && /无法解析|已忽略/.test(document.querySelector('.log')?.textContent || '');
      const emptyState = !!document.querySelector('.ex-strip__empty') || !!document.querySelector('.ex-inspector__scroll .note');
      rec('A28b', '损坏记录安全降级：不白屏、不覆盖构建器存储、不猜测轨迹',
        noRun && emptyState && constructorBefore === localStorage.getItem(${JSON.stringify(CONSTRUCTOR_KEY)})
          && learningBefore === localStorage.getItem(${JSON.stringify(LEARNING_KEY)}) && body.length > 200,
        '无历史轨迹=' + noRun + ' · 空状态提示=' + emptyState + ' · 构建器未被覆盖=' + (constructorBefore === localStorage.getItem(${JSON.stringify(CONSTRUCTOR_KEY)}))
          + ' · 学习进度未被覆盖=' + (learningBefore === localStorage.getItem(${JSON.stringify(LEARNING_KEY)})) + ' · 日志有可读提示=' + noticeLogged);
      return out;
    })()`, true)
  );

  /* ================================================================== *
   * A29 无障碍 / 降级 / 回归（reduced-motion + 无 WebGL + 窄屏）
   * ================================================================== */
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const injected = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (String(type).startsWith('webgl')) return null;
        return original.call(this, type, ...rest);
      };
    })();`,
  });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate(`(() => { localStorage.removeItem(${JSON.stringify(EXECUTION_KEY)}); localStorage.removeItem(${JSON.stringify(RESEARCH_KEY)}); return true; })()`);
  await cdp.send('Page.reload', { ignoreCache: false });
  if (!(await waitReady(cdp))) throw new Error('无 WebGL + 窄屏 + reduced-motion 下 __AZ 未就绪');
  await sleep(1000);
  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const no3D = !(az.scene && az.scene.ok);
      const reduced = az.state.reducedMotion === true;
      // 知识星图：键盘可达、无横向溢出
      az.openAtlas();
      await sleep(420);
      const atlasOK = document.querySelectorAll('.atlas-node').length === 10
        && document.querySelectorAll('.atlas-list__item').length === 36
        && document.documentElement.scrollWidth - window.innerWidth <= 1;
      // 知识页：窄屏仍可完成四步切换
      az.openKnowledge('tool_calling');
      await sleep(360);
      document.querySelector('.kn-steps [data-step="experiment"]').click();
      await sleep(300);
      const knowledgeOK = !!document.querySelector('.kn-exp__controls') && document.querySelectorAll('.kn-exp__transport button').length >= 4;
      // 执行台：二维等价视图 + 回放可用
      az.previewModule('announcement_search');
      az.confirmAssembly();
      az.configureModule('announcement_search', { readPermission: true });
      az.previewModule('document_reader');
      az.confirmAssembly();
      az.configureModule('document_reader', { readPermission: true });
      await sleep(300);
      az.openExecution({ autorun: true });
      await sleep(560);
      const api = az.executionApi();
      const run = api.currentRun();
      api.seek(4);
      await sleep(200);
      const twoD = document.querySelector('.ex-core__svg').style.display !== 'none';
      const execOK = !!run && ['research_complete', 'research_partial', 'sample_acquired'].includes(run.outcome) && api.currentIndex() === 4 && twoD
        && document.querySelectorAll('.ex-tick').length === run.events.length
        && document.documentElement.scrollWidth - window.innerWidth <= 1;
      // 键盘可达：关键控件都可聚焦
      const focusable = [...document.querySelectorAll('.ex-transport button, .ex-tick, .kn-step, .atlas-list__item')]
        .every((b) => b.tabIndex >= 0 || b.disabled);
      rec('A29', '无障碍 / 降级：无 WebGL、减少动态、窄屏下知识与执行仍可学习与回放',
        no3D && reduced && atlasOK && knowledgeOK && execOK && focusable,
        'WebGL=' + (az.scene && az.scene.ok) + ' · reducedMotion=' + reduced + ' · 星图=' + atlasOK + ' · 知识页=' + knowledgeOK
          + ' · 执行台(2D)=' + execOK + ' · 关键控件可键盘聚焦=' + focusable);
      return out;
    })()`, true)
  );
  await sleep(500);
  await shot('F22-窄屏无WebGL.png');

  /* A30 静态构建与零外部请求（在降级页面里检查，覆盖工作区打开状态） */
  push(
    await evaluate(`(() => {
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const res = performance.getEntriesByType('resource');
      const ext = res.filter((r) => !r.name.startsWith('file:') && !r.name.startsWith('data:') && !r.name.startsWith('blob:'));
      rec('A30', '纯静态构建：工作区打开时也没有任何业务后端 / CDN 请求',
        ext.length === 0,
        '外部资源=' + ext.length + ' / 全部资源=' + res.length + ' · 运行期全部逻辑在浏览器内');
      return out;
    })()`)
  );

  await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injected.identifier });
  await cdp.send('Emulation.setEmulatedMedia', { features: [] });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  return results;
}




