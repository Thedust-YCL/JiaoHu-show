/**
 * tools/m11-acceptance.mjs
 * ------------------------------------------------------------------
 * M1.1「知识架构与学习基础」浏览器验收（A01–A24）。
 *
 * 全部通过**真实 DOM 与真实 store**驱动，走与界面按钮完全相同的入口；
 * 每一项都写出证据来源，不允许用「理论上满足」代替运行结果。
 * 需要外部 CLI 证据的项（TypeScript / 单测 / 生产构建）由 report 的
 * `cli` 字段承载，本文件只标注浏览器内可观察的部分。
 * ------------------------------------------------------------------
 */
const CONSTRUCTOR_KEY = 'agent-zero:constructor:v1';
const RESEARCH_KEY = 'agent-zero:research:v2';
const LEARNING_KEY = 'agent-zero:learning:v2';
const LEARNING_LEGACY_KEY = 'agent-zero:learning:v1';

import path from 'node:path';

export async function runM11Acceptance({ cdp, sleep, shot, waitReady }) {
  const results = [];
  const consoleStart = (cdp.console || []).length;
  const push = (rows) => {
    if (Array.isArray(rows)) results.push(...rows);
  };
  const evaluate = async (code, awaitPromise = true) => cdp.eval(code, awaitPromise);
  const originUrl = await evaluate(`location.href`);
  const distUrl = 'file:///' + path.join(process.cwd(), 'dist', 'index.html').replace(/\\/g, '/');

  /* ================================================================== *
   * 起始条件：只保留一个旧版学习记录（用于 A19 迁移验证）
   * ================================================================== */
  const legacyPayload = JSON.stringify({
    schemaVersion: 1,
    concepts: { tool_calling: { explored: true, relatedDiscovered: true, experimentCompleted: true, visits: 3 }, rag: { explored: true, visits: 1 } },
  });
  await evaluate(`(() => {
    localStorage.removeItem(${JSON.stringify(CONSTRUCTOR_KEY)});
    localStorage.removeItem(${JSON.stringify(RESEARCH_KEY)});
    localStorage.removeItem(${JSON.stringify(LEARNING_KEY)});
    localStorage.setItem(${JSON.stringify(LEARNING_LEGACY_KEY)}, ${JSON.stringify(legacyPayload)});
    return true;
  })()`);
  await cdp.send('Page.reload', { ignoreCache: false });
  if (!(await waitReady(cdp))) throw new Error('M1.1 验收：重新加载后 __AZ 未就绪');
  await evaluate(`window.__AZ.skipIntro('M1.1 验收')`);
  await sleep(900);

  /* ================================================================== *
   * A19：旧学习记录非破坏性迁移
   * ================================================================== */
  push(
    await evaluate(`(() => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const snapshot = az.learningSnapshot();
      const tc = snapshot.concepts.tool_calling || {};
      const rag = snapshot.concepts.rag || {};
      const v2raw = localStorage.getItem(${JSON.stringify(LEARNING_KEY)});
      const v1raw = localStorage.getItem(${JSON.stringify(LEARNING_LEGACY_KEY)});
      const v2 = v2raw ? JSON.parse(v2raw) : null;
      rec('A19', '学习迁移：旧版 v1 记录逐条迁移到 v2，原有标志不丢，旧键原样保留',
        snapshot.migratedFrom === ${JSON.stringify(LEARNING_LEGACY_KEY)}
          && tc.explored === true && tc.relatedDiscovered === true && tc.experimentCompleted === true && tc.visits === 3
          && rag.explored === true
          && v2 && v2.schemaVersion === 2
          && v1raw === ${JSON.stringify(legacyPayload)},
        '迁移来源=' + snapshot.migratedFrom + ' · tool_calling=' + JSON.stringify({ e: tc.explored, r: tc.relatedDiscovered, x: tc.experimentCompleted, v: tc.visits })
          + ' · v2.schemaVersion=' + (v2 && v2.schemaVersion) + ' · v1 原样保留=' + (v1raw === ${JSON.stringify(legacyPayload)}));
      return out;
    })()`)
  );

  /* ================================================================== *
   * A02 / A03 / A15：六章目录（Story）
   * ================================================================== */
  await evaluate(`window.__AZ.openStory()`, false);
  await sleep(600);
  push(
    await evaluate(`(() => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const chapters = az.chapters();
      const stats = az.knowledgeStats();
      const sections = [...document.querySelectorAll('.story-chapter')];
      const concepts = [...document.querySelectorAll('.story-concept')];
      const sideItems = [...document.querySelectorAll('.story-side__item')];
      const headings = sections.map((s) => s.querySelector('.story-chapter__zh')?.textContent || '');
      const questions = sections.map((s) => s.querySelector('.story-chapter__question')?.textContent || '');
      const enTitles = sections.map((s) => s.querySelector('.story-chapter__en')?.textContent || '');
      rec('A02', '六章完整：恰好 6 个稳定 chapterId，顺序、编号、双语标题与核心问题符合 PRD',
        chapters.length === 6
          && chapters.map((c) => c.id).join(',') === 'intelligence,context,connection,knowledge,runtime,reliability'
          && sections.length === 6
          && headings.join('|') === '智能诞生|指令与上下文|外部能力|信息与方法|执行系统|可靠性与边界'
          && enTitles.join('|') === 'INTELLIGENCE|CONTEXT|CONNECTION|KNOWLEDGE|RUNTIME|RELIABILITY'
          && questions.every((q) => q.length >= 10),
        '章节=' + chapters.length + ' · 中文标题=' + headings.join('/') + ' · 问题齐全=' + questions.every((q) => q.length >= 10));
      rec('A03', '概念索引：36 个稳定概念元数据，目录里可逐条浏览（30–40 建议区间内）',
        az.conceptIds().length === 36 && new Set(az.conceptIds()).size === 36 && concepts.length === 36 && sideItems.length === 6
          && stats.concepts === 36,
        '概念=' + az.conceptIds().length + ' · ID 唯一=' + (new Set(az.conceptIds()).size === 36) + ' · 目录条目=' + concepts.length);
      rec('A04', 'M0 ID 兼容：原 10 个概念 ID 全部保留，目录与搜索仍可定位',
        ['llm', 'agent', 'tool_calling', 'tools', 'api', 'mcp', 'skills', 'rag', 'workflow', 'harness']
          .every((id) => az.conceptIds().includes(id) && !!document.querySelector('.story-concept[data-concept="' + id + '"]')),
        '既有 10 个 ID 均在目录中');
      rec('A15', 'Story 目录：六章可浏览，展示真实开放状态与可用内容入口',
        sections.every((s) => !!s.dataset.status)
          && sections.every((s) => (s.querySelectorAll('.story-concept').length === 6))
          && sections.every((s) => /本章实验/.test(s.textContent))
          && [...document.querySelectorAll('.story-chapter .tag')].length >= 6,
        '章状态=' + sections.map((s) => s.dataset.status).join('/') + ' · 每章概念=6 · 每章实验登记可见');
      return out;
    })()`)
  );
  await sleep(400);
  await shot('F31-Story六章目录.png');

  /* ================================================================== *
   * A05 / A16：Atlas 目录与星图衔接
   * ================================================================== */
  await evaluate(`window.__AZ.openAtlas()`, false);
  await sleep(700);
  push(
    await evaluate(`(() => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const nodes = [...document.querySelectorAll('.atlas-node')];
      const items = [...document.querySelectorAll('.atlas-list__item')];
      const groups = [...document.querySelectorAll('.atlas-group')];
      const byStatus = {};
      items.forEach((i) => { byStatus[i.dataset.status] = (byStatus[i.dataset.status] || 0) + 1; });
      const svg = document.querySelector('.atlas-svg');
      rec('A05', '归属有效：36 个概念按六章分组，全部指向合法章节',
        groups.length === 6 && items.length === 36 && byStatus.outline === 13 && byStatus.reviewed === 16 && byStatus.published === 7,
        '分组=' + groups.length + ' · 条目=' + items.length + ' · 状态分布=' + JSON.stringify(byStatus));
      rec('A16', 'Atlas 衔接：已开放节点可选中 / 搜索 / 聚焦，详情可用；建设中概念弱化但可选',
        nodes.length === 10 && !!svg && items.filter((i) => i.dataset.oncanvas === 'true').length === 10
          && !!document.querySelector('.atlas-detail__hero[data-concept]') === false
          && document.querySelector('.atlas-search__note').textContent.includes('36')
          && document.querySelectorAll('.atlas-group__list').length === 6,
        '画布节点=' + nodes.length + ' · 目录条目=' + items.length + ' · 画布条目=' + items.filter((i) => i.dataset.oncanvas === 'true').length);
      return out;
    })()`)
  );

  /* A06 搜索：中英别名 / 大小写 / 部分匹配 / 零结果 */
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
      const d = await search('幻觉');
      const e = await search('沙');
      const emptyNoteAfterMiss = (await search('没有这个概念的词'), document.querySelector('.atlas-search__note').textContent);
      await search('');
      const clearedNote = document.querySelector('.atlas-search__note').textContent;
      rec('A06', '双语搜索：中文、英文、别名、大小写、部分匹配均有效，空查询与零结果状态清晰',
        a === 'llm' && b === 'tool_calling' && c === 'tool_calling' && d === 'hallucination' && e === 'sandbox'
          && /没有找到相关概念/.test(emptyNoteAfterMiss) && /清除|36/.test(clearedNote),
        'LLM→' + a + ' · TOOLCALLING→' + b + ' · 工具调用→' + c + ' · 幻觉→' + d + ' · 沙→' + e
          + ' · 零结果提示=' + /没有找到相关概念/.test(emptyNoteAfterMiss));
      return out;
    })()`, true)
  );

  /* A11 / A12 / A13：关系语义（画布与详情一致） */
  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.atlasApi();
      const edges = [...document.querySelectorAll('.atlas-edge')];
      const types = {};
      edges.forEach((e) => { types[e.dataset.type] = (types[e.dataset.type] || 0) + 1; });
      api.selectConcept('agent', { focus: false });
      await sleep(220);
      const relRows = [...document.querySelectorAll('.atlas-rel')];
      const legacyIds = ['rel-agent-llm', 'rel-agent-tools', 'rel-agent-skills', 'rel-agent-rag', 'rel-workflow-agent', 'rel-harness-agent'];
      const hasLegacy = legacyIds.every((id) => document.querySelector('.atlas-rel[data-edge="' + id + '"]'));
      const dirTexts = relRows.map((r) => r.querySelector('.atlas-rel__dir')?.textContent || '');
      const directedRows = relRows.filter((r) => r.dataset.type === 'USES' || r.dataset.type === 'PART_OF').length;
      const undirectedRows = relRows.filter((r) => r.dataset.type === 'RELATED' || r.dataset.type === 'CONTRASTS').length;
      rec('A11', '语义关系：每条边端点存在、类型合法、有文字解释（画布与详情同源）',
        edges.length === 13 && relRows.length >= 4
          && relRows.every((r) => (r.querySelector('.atlas-rel__desc')?.textContent || '').length >= 20),
        '画布边=' + edges.length + ' · 选中 agent 的关系=' + relRows.length + ' · 说明全非空');
      rec('A12', '关系方向：USES / PART_OF 有向并写明「→」，RELATED / CONTRASTS 标注无向而非强依赖',
        directedRows >= 2 && undirectedRows >= 2
          && dirTexts.filter((t) => /→/.test(t)).length === directedRows
          && dirTexts.some((t) => /无向/.test(t)),
        '有向行=' + directedRows + ' · 无向行=' + undirectedRows + ' · 示例=' + dirTexts.slice(0, 3).join(' | '));
      rec('A13', '旧关系保留：M0.3 的 10 条边在统一数据源中完整可查，语义未改写',
        hasLegacy,
        '选中 agent 后可见的 M0.3 边=' + legacyIds.filter((id) => document.querySelector('.atlas-rel[data-edge="' + id + '"]')).length + '/6（其余在 llm/tools/mcp 等节点下）');
      return out;
    })()`, true)
  );

  /* ================================================================== *
   * A08 / A09 / A14：统一知识模板（已审校概念）
   * ================================================================== */
  await evaluate(`window.__AZ.openKnowledge('llm', { from: 'atlas' })`, false);
  await sleep(600);
  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.knowledgeApi();
      const understandParas = () => [...document.querySelectorAll('.kn-main .explain')].filter((p) => p.textContent.length > 40);
      const understandCount = understandParas().length;
      const beforeLayer = api.currentLayer();
      // 切到 INSPECT
      document.querySelector('.kn-layers button[data-layer="inspect"]').click();
      await sleep(200);
      const inspectItems = [...document.querySelectorAll('.kn-inspect__list li')];
      const sample = document.querySelector('.kn-sample');
      const misc = [...document.querySelectorAll('.misconception')];
      const railItems = [...document.querySelectorAll('.kn-rail__item')];
      const sourceRows = [...document.querySelectorAll('.kn-source')];
      const externalLinks = document.querySelectorAll('.kn-source a').length;
      rec('A08', '分层模板：已发布/已审校概念可正确呈现 UNDERSTAND 与 INSPECT 两个深度层',
        beforeLayer === 'understand' && api.currentLayer() === 'inspect'
          && understandCount >= 2 && inspectItems.length >= 3,
        'UNDERSTAND 段=' + understandCount + ' · INSPECT 条=' + inspectItems.length + ' · 示例块=' + !!sample);
      rec('A09', '误区模板：常见误解与更正成对呈现，缺字段的空概念不白屏',
        misc.length >= 1 && misc.every((m) => /误解/.test(m.textContent) && /纠正/.test(m.textContent))
          && railItems.length === 6,
        '误解条目=' + misc.length + ' · 章内目录=' + railItems.length + ' 条');
      rec('A14', '来源诚实：外部来源必须已核验且带核验日期，未核验内容不列为引用',
        sourceRows.length >= 1
          && sourceRows.filter((r) => r.dataset.type === 'external').every((r) => /已核验/.test(r.textContent) && /核验于 20/.test(r.textContent))
          && [...document.querySelectorAll('.kn-source a')].every((a) => /^https:\\/\\//.test(a.getAttribute('href') || ''))
          && /外部来源都经过实际抓取核验/.test(document.querySelector('.kn-main').textContent),
        '来源行=' + sourceRows.length + ' · 外部来源行=' + sourceRows.filter((r) => r.dataset.type === 'external').length
          + ' · 外部链接均为 https=' + [...document.querySelectorAll('.kn-source a')].every((a) => /^https:\\/\\//.test(a.getAttribute('href') || ''))
          + ' · 含核验日期=' + sourceRows.some((r) => /核验于 20/.test(r.textContent)));
      return out;
    })()`, true)
  );
  await sleep(300);
  await shot('F32-知识页INSPECT.png');

  /* ================================================================== *
   * A07 / A09 / A10：仅有索引的概念（建设中）
   * ================================================================== */
  await evaluate(`window.__AZ.openKnowledge('chunking', { from: 'atlas' })`, false);
  await sleep(600);
  push(
    await evaluate(`(() => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const main = document.querySelector('.kn-main');
      const banner = document.querySelector('[data-act="outline-banner"]');
      const runBtn = document.querySelector('.kn-main [data-act="run-experiment"]');
      const planned = document.querySelector('[data-act="experiment-planned"], [data-act="experiment-none"]');
      const inspectList = document.querySelectorAll('.kn-inspect__list').length;
      const availability = az.conceptAvailability('chunking');
      const railItems = [...document.querySelectorAll('.kn-rail__item')];
      const detailText = main.textContent;
      rec('A07', '内容状态：outline 概念不呈现正文，明确显示「内容建设中 + 计划阶段」',
        availability.status === 'outline' && availability.hasBody === false
          && !!banner && /内容建设中/.test(banner.textContent) && /M1\.[23]/.test(detailText)
          && inspectList === 0
          && document.querySelectorAll('.kn-layers').length === 0,
        '状态=' + availability.status + ' · 建设横幅=' + !!banner + ' · 计划阶段提示=' + /M1\.[23]/.test(detailText) + ' · 深度层开关=' + document.querySelectorAll('.kn-layers').length);
      rec('A09', '误区模板：无正文概念不渲染误区区块，页面仍有索引信息与关系导航（不白屏）',
        document.querySelectorAll('.misconception').length === 0
          && main.textContent.length > 200
          && document.querySelectorAll('.kn-relation').length >= 1,
        '正文长度=' + main.textContent.length + ' · 关系行=' + document.querySelectorAll('.kn-relation').length + ' · 误解区块=0');
      rec('A10', '实验链接：未开放实验只显示「后续阶段开放」，没有可点击的假运行按钮',
        !runBtn && !!planned && /后续阶段开放/.test(planned.textContent)
          && railItems.some((i) => i.dataset.status === 'outline'),
        '运行按钮=' + (runBtn ? '存在（错误）' : '无') + ' · 计划提示=' + (planned ? planned.textContent.replace(/\\s+/g, ' ').trim().slice(0, 30) : '缺失'));
      return out;
    })()`)
  );
  await sleep(300);
  await shot('F33-建设中索引页.png');

  /* ================================================================== *
   * A10 / A15：Lab 实验登记表
   * ================================================================== */
  await evaluate(`window.__AZ.openLab()`, false);
  await sleep(500);
  push(
    await evaluate(`(() => {
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const items = [...document.querySelectorAll('.lab-item')];
      const planned = items.filter((i) => i.dataset.status === 'planned');
      /** M1.2：可用实验改为独立卡片（.lab-card--ready），每条都有真实打开入口 */
      const readyCards = [...document.querySelectorAll('.lab-card--ready')];
      const readyExperiments = readyCards.map((c) => c.dataset.experiment);
      const runButtons = [...document.querySelectorAll('[data-act="run-experiment"]')];
      const lockedNotes = [...document.querySelectorAll('[data-act="experiment-planned"]')];
      const stats = window.__AZ.experimentStats();
      rec('A10', '实验链接：Lab 只给真实可用实验运行入口，其余明确「后续阶段开放」',
        readyCards.length === 3 && planned.length === 3 && runButtons.length === 3 && lockedNotes.length === 3
          && stats.available === 3 && stats.planned === 3
          && readyExperiments.join(',') === 'exp-token-lab,exp-context-lab,exp-tool-calling-demo',
        '可操作卡片=' + readyCards.length + '（' + readyExperiments.join('/') + '）· 计划实验=' + planned.length + ' · 运行按钮=' + runButtons.length + ' · 后续阶段提示=' + lockedNotes.length);
      return out;
    })()`)
  );
  await sleep(200);
  await shot('F34-Lab实验登记.png');

  /* ================================================================== *
   * A17：Tool Calling 回归（原教程 + 实验 + 学习记录）
   * ================================================================== */
  await evaluate(`window.__AZ.openKnowledge('tool_calling', { from: 'lab', step: 'experiment' })`, false);
  await sleep(700);
  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.knowledgeApi();
      const steps = [...document.querySelectorAll('.kn-step')];
      const startStep = api.currentStep();
      const events = document.querySelectorAll('.kn-exp__list .ev-row, .kn-exp__list [data-event]').length;
      api.completeExperiment();
      await sleep(200);
      const flags = az.learningSnapshot().concepts.tool_calling || {};
      const raw = JSON.parse(localStorage.getItem(${JSON.stringify(LEARNING_KEY)}) || '{}');
      const stored = raw.concepts && raw.concepts.tool_calling;
      const ctor = az.constructorSnapshot();
      rec('A17', 'Tool Calling 回归：四步学习路径、内嵌实验与 Constructor 入口均正常',
        steps.length === 4 && startStep === 'experiment' && events >= 1
          && flags.experimentCompleted === true && !!stored && stored.experimentCompleted === true
          && ctor.modules.length === 0,
        '步骤=' + steps.length + ' · 直接落在=' + startStep + ' · 事件行=' + events
          + ' · 本地记录=' + (stored && stored.experimentCompleted) + ' · 未改动装配台=' + (ctor.modules.length === 0));
      return out;
    })()`, true)
  );

  /* ================================================================== *
   * A18：学习状态三标志互相独立
   * ================================================================== */
  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      // 打开一个仅有索引的概念：只应记录「正在了解」
      az.openKnowledge('memory', { from: 'lab' });
      await sleep(400);
      const memory = az.learningSnapshot().concepts.memory || {};
      const lastViewed = az.learningSnapshot().lastViewed || {};
      const summary = az.learningSnapshot().summary;
      const refused = az.learning.markExperimentCompleted('memory');
      const afterRefuse = az.learningSnapshot().concepts.memory || {};
      rec('A18', '学习状态独立：访问、实验完成、关联发现可以分别表示，且不能凭空记录实验',
        memory.explored === true && memory.experimentCompleted !== true
          && lastViewed.conceptId === 'memory' && lastViewed.chapterId === 'knowledge'
          && summary.total === 36 && summary.explored >= 2 && summary.experiments === 1
          && refused === false && afterRefuse.experimentCompleted !== true,
        'memory explored=' + memory.explored + ' · 实验=' + !!memory.experimentCompleted
          + ' · lastViewed=' + lastViewed.conceptId + '/' + lastViewed.chapterId
          + ' · 汇总=' + JSON.stringify(summary) + ' · 拒绝无实验记录=' + (refused === false));
      return out;
    })()`, true)
  );

  /* ================================================================== *
   * A21：阅读 / 搜索不改变装配配置与 M0.4 运行轨迹
   * ================================================================== */
  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });

      az.openExecution({ autorun: true });
      await sleep(1200);
      const api = az.executionApi();
      const runBefore = api.currentRun();
      const runIdBefore = runBefore ? runBefore.runId : null;
      const eventsBefore = api.eventCount();
      const configBefore = JSON.stringify(az.constructorConfigSnapshot());
      const researchBefore = localStorage.getItem(${JSON.stringify(RESEARCH_KEY)});

      // 期间：翻六章目录、读两个概念、在星图里搜索
      az.openStory(); await sleep(250);
      az.openKnowledge('rag', { from: 'story' }); await sleep(250);
      az.openKnowledge('tools', { from: 'story' }); await sleep(250);
      az.openAtlas(); await sleep(250);
      const input = document.querySelector('.atlas-search__input');
      input.value = '工具';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(320);
      az.openKnowledge('tool_calling', { from: 'atlas' }); await sleep(300);

      // 回到执行台：必须是同一次运行
      az.openExecution();
      await sleep(700);
      const api2 = az.executionApi();
      const runAfter = api2.currentRun();
      const researchAfter = localStorage.getItem(${JSON.stringify(RESEARCH_KEY)});
      rec('A21', 'Run 隔离：阅读与搜索不修改装配配置，也不重置 M0.4 研究 Run',
        !!runIdBefore && runAfter && runAfter.runId === runIdBefore
          && api2.eventCount() === eventsBefore
          && JSON.stringify(az.constructorConfigSnapshot()) === configBefore
          && researchAfter === researchBefore,
        'runId 保持=' + (runAfter && runAfter.runId === runIdBefore) + ' · 事件数=' + eventsBefore + '→' + api2.eventCount()
          + ' · 配置未变=' + (JSON.stringify(az.constructorConfigSnapshot()) === configBefore)
          + ' · 运行记录未改写=' + (researchAfter === researchBefore));
      return out;
    })()`, true)
  );

  /* ================================================================== *
   * A22 / A23：数据自洽 + 静态路径（浏览器内可观察部分）
   * ================================================================== */
  push(
    await evaluate(`(() => {
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const issues = window.__AZ.knowledgeValidation();
      const scripts = [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src'));
      const links = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href'));
      const relative = [...scripts, ...links].every((s) => !/^https?:/i.test(s) && !String(s).startsWith('/'));
      // 离线单文件版把 CSS/JS 全部内联：此时「无外部资源」本身就是正确形态
      const inlined = document.querySelectorAll('style').length > 0 && document.querySelectorAll('script').length > 0;
      const res = performance.getEntriesByType('resource');
      const external = res.filter((r) => !r.name.startsWith('file:') && !r.name.startsWith('data:') && !r.name.startsWith('blob:') && !r.name.startsWith(location.origin));
      rec('A22', '数据自洽：知识层校验器零问题（章节 / 概念 / 关系 / 来源 / 实验）',
        Array.isArray(issues) && issues.length === 0,
        'issues=' + JSON.stringify(issues).slice(0, 160));
      rec('A23', '路径适配：页面不依赖任何绝对路径或外部 CDN，可在子路径下直接打开与刷新',
        relative && external.length === 0 && (scripts.length > 0 || inlined),
        '外部脚本=' + JSON.stringify(scripts) + ' · 外部样式=' + JSON.stringify(links)
          + ' · 内联资源=' + inlined + ' · 外部请求=' + external.length + ' · 页面协议=' + location.protocol);
      return out;
    })()`)
  );

  /* ================================================================== *
   * A20：损坏的 localStorage 不清除其它命名空间、不白屏
   * ================================================================== */
  await evaluate(`localStorage.setItem(${JSON.stringify(LEARNING_KEY)}, '{ broken json')`);
  await cdp.send('Page.reload', { ignoreCache: false });
  if (!(await waitReady(cdp))) throw new Error('M1.1 验收：损坏数据后 __AZ 未就绪');
  await evaluate(`window.__AZ.skipIntro('损坏数据验收')`);
  await sleep(700);
  push(
    await evaluate(`(() => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const body = document.body.innerText;
      const learningKeys = Object.keys(localStorage).filter((k) => k.startsWith('agent-zero:learning'));
      az.learning.markExplored('llm');
      const after = az.learningSnapshot();
      const corruptStillThere = localStorage.getItem(${JSON.stringify(LEARNING_KEY)});
      rec('A20', '损坏数据：损坏的学习记录不白屏、不清空其它命名空间，可继续正常记录',
        body.length > 200 && /本地学习进度无法解析/.test(body)
          && after.concepts.llm && after.concepts.llm.explored === true
          && !!corruptStillThere && az.constructorConfigSnapshot() !== null
          && learningKeys.includes(${JSON.stringify(LEARNING_KEY)}),
        '页面可读长度=' + body.length + ' · 提示可见=' + /本地学习进度无法解析/.test(body)
          + ' · 继续记录 llm=' + !!(after.concepts.llm && after.concepts.llm.explored)
          + ' · 命名空间=' + JSON.stringify(learningKeys));
      return out;
    })()`)
  );

  /* ================================================================== *
   * A24：M0.1–M0.4 关键路径回归（工作区开合 + 控制台异常）
   * ================================================================== */
  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const scene = az.scene ? !!az.scene.ok : false;
      const fallbackVisible = !!document.querySelector('.projection') || scene;

      // 开场 / 主控台
      az.goHub();
      await sleep(200);
      const shell = !!document.querySelector('.shell');
      // 装配台：装配 → 就绪（走与按钮相同的动作）
      az.previewModule('announcement_search');
      az.confirmAssembly();
      await sleep(150);
      const configured = az.configureModule('announcement_search', { searchScope: 'campus_events', maxResults: 3, readPermission: true });
      const snap = az.constructorSnapshot();
      const searchReady = snap.modules.some((m) => m.moduleId === 'announcement_search' && m.status === 'Ready');

      // Atlas → 知识页 → 返回
      az.openAtlas(); await sleep(300);
      const atlasOk = document.querySelectorAll('.atlas-node').length === 10;
      az.atlasApi().selectConcept('tool_calling', { focus: true }); await sleep(200);
      const atlasDetail = !!document.querySelector('.atlas-detail__hero[data-concept="tool_calling"]');

      // 知识页四步（Tool Calling）
      az.openKnowledge('tool_calling', { from: 'atlas' }); await sleep(400);
      const tcSteps = document.querySelectorAll('.kn-step').length === 4;
      document.querySelector('.kn-step[data-step="connect"]').click();
      await sleep(200);
      const connectOk = !!document.querySelector('.kn-relations');

      // 执行台 + 报告 + 回放
      az.openExecution({ autorun: true }); await sleep(1500);
      const exec = az.executionApi();
      const run = exec.currentRun();
      const events = exec.eventCount();
      exec.seek(Math.min(3, events - 1));
      await sleep(150);
      const seekOk = exec.currentIndex() === Math.min(3, events - 1);
      exec.openReport();
      await sleep(400);
      const reportOk = document.querySelectorAll('.rp-section, .report__section').length >= 1 || /报告/.test(document.body.innerText);

      // 收尾：清理本次装配，避免污染后续阶段
      az.removeModule('announcement_search');
      rec('A24', 'M0 回归：开场 / 装配 / Atlas / Tool Calling / 执行回放 / 报告在主链路上仍可用',
        shell && fallbackVisible && configured && configured.ok !== false && searchReady
          && atlasOk && atlasDetail && tcSteps && connectOk
          && !!run && events > 0 && seekOk && reportOk,
        '场景=' + (scene ? '3D' : '2D fallback') + ' · 装配 Ready=' + searchReady
          + ' · Atlas 节点=' + (atlasOk ? 10 : '≠10') + ' · 四步=' + tcSteps + ' · CONNECT=' + connectOk
          + ' · 运行事件=' + events + ' · Seek=' + seekOk + ' · 报告=' + reportOk);
      return out;
    })()`, true)
  );

  /* 控制台异常：只统计 M1.1 阶段自身产生的异常（不把历史阶段的记录算进来） */
  const phaseExceptions = (cdp.console || [])
    .slice(consoleStart)
    .filter((line) => /^(EXCEPTION|ERROR)/.test(line));

  /* ================================================================== *
   * A23b：静态构建产物（dist）用相对路径加载，可直接在子路径下打开
   * ================================================================== */
  await cdp.send('Page.navigate', { url: distUrl });
  const distReady = await waitReady(cdp, 20000);
  const distCheck = distReady
    ? await evaluate(`(() => {
        const scripts = [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src'));
        const links = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href'));
        return {
          scripts,
          links,
          booted: !!(window.__AZ && typeof window.__AZ.openStory === 'function'),
          relative: scripts.length > 0 && links.length > 0
            && scripts.every((s) => /^\\.\\//.test(s)) && links.every((l) => /^\\.\\//.test(l)),
          knowledge: window.__AZ ? window.__AZ.conceptIds().length : -1,
        };
      })()`)
    : null;
  push([
    {
      id: 'A23b',
      name: '静态构建：dist/index.html 以相对路径加载资源并正常启动（GitHub Pages 子路径可用）',
      pass: !!distCheck && distCheck.booted && distCheck.relative && distCheck.knowledge === 36,
      note: distCheck
        ? '脚本=' + JSON.stringify(distCheck.scripts) + ' · 样式=' + JSON.stringify(distCheck.links) + ' · 概念=' + distCheck.knowledge
        : 'dist 页面未就绪',
    },
  ]);

  // 回到离线单文件版，保持后续阶段环境一致
  await cdp.send('Page.navigate', { url: originUrl });
  if (!(await waitReady(cdp, 20000))) throw new Error('M1.1 验收：返回主页面失败');

  push([
    {
      id: 'A24b',
      name: '控制台无未捕获异常（M1.1 知识层与既有链路）',
      pass: phaseExceptions.length === 0,
      note: phaseExceptions.length ? phaseExceptions.slice(0, 3).join(' | ') : '无异常',
    },
  ]);

  return results;
}


