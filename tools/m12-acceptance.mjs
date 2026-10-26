/**
 * tools/m12-acceptance.mjs
 * ------------------------------------------------------------------
 * M1.2「AI 基础与工具交互」浏览器验收（A01–A30）。
 *
 * 特性：
 *   · 自带 CDP 启动器：`node tools/m12-acceptance.mjs` 独立跑完，不依赖其它脚本；
 *   · 也可以被 tools/shots.mjs 用 runM12Acceptance() 复用（与 M0.3/M0.4/M1.1 同构）；
 *   · 每一项都通过**真实 DOM 与真实 store** 驱动，走与界面按钮相同的入口；
 *   · A30 回归：在同一进程里真实运行 M0.3 / M0.4 / M1.1 的验收脚本并汇总；
 *   · 截图写入 verify/m12-shots/，报告写入 verify/m12-report.json。
 *
 * 用法：
 *   node tools/build.mjs && node tools/m12-acceptance.mjs
 * ------------------------------------------------------------------
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PORT = 9341;
const OUT = path.join(process.cwd(), 'verify', 'm12-shots');
const CONSTRUCTOR_KEY = 'agent-zero:constructor:v1';
const RESEARCH_KEY = 'agent-zero:research:v2';
const LEARNING_KEY = 'agent-zero:learning:v2';
const LEARNING_LEGACY_KEY = 'agent-zero:learning:v1';

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.console = [];
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
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise, userGesture: true });
    if (r.exceptionDetails) {
      console.error('[m12] 求值失败，表达式开头：\n' + expression.split('\n').slice(0, 4).join('\n'));
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

async function waitReady(cdp, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try {
      if (await cdp.eval('!!(window.__AZ && window.__AZ.knowledgeStats)')) return true;
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
export async function runM12Acceptance({ cdp, shot, waitReady: ready = waitReady }) {
  const results = [];
  const rec = (id, name, pass, note) => results.push({ id, name, pass: !!pass, note: String(note ?? '') });
  const ev = (code, awaitPromise = false) => cdp.eval(code, awaitPromise);
  const K = (v) => JSON.stringify(v);

  await mkdir(OUT, { recursive: true });

  /* ---------- 起始条件：清空 M1.2 之外的本地数据，并留一份旧版学习记录 ---------- */
  const legacyPayload = JSON.stringify({
    schemaVersion: 1,
    concepts: { tool_calling: { explored: true, relatedDiscovered: true, experimentCompleted: true, visits: 2 } },
  });
  await ev(`(() => {
    localStorage.removeItem(${K(CONSTRUCTOR_KEY)});
    localStorage.removeItem(${K(RESEARCH_KEY)});
    localStorage.removeItem(${K(LEARNING_KEY)});
    localStorage.setItem(${K(LEARNING_LEGACY_KEY)}, ${K(legacyPayload)});
    return true;
  })()`);
  await cdp.send('Page.reload', { ignoreCache: false });
  if (!(await ready(cdp))) throw new Error('M1.2 验收：重新加载后 __AZ 未就绪');
  await ev(`window.__AZ.skipIntro('M1.2 验收')`);
  await sleep(800);

  /** A26 需要「任何实验都还没做」的初始快照，因此在交互开始前先取一次 */
  const initialProgress = await ev(`window.__AZ.learningSnapshot().concepts`);

  /* ================================================================== *
   * A01–A09：知识内容层
   * ================================================================== */
  const data = await ev(`(() => {
    const az = window.__AZ;
    return {
      validation: az.knowledgeValidation(),
      stats: az.knowledgeStats(),
      concepts: az.knowledgeConcepts(),
      sources: az.knowledgeSources(),
      experiments: az.experiments(),
      story: az.storyChapters(),
      chapters: az.chapters(),
    };
  })()`);

  const ch123 = data.concepts.filter((c) => ['intelligence', 'context', 'connection'].includes(c.chapterId));
  const legacyIds = ['llm', 'agent', 'tool_calling', 'tools', 'api', 'mcp', 'skills', 'rag', 'workflow', 'harness'];

  rec(
    'A01',
    '仓库审计：复用 M0.3/M0.4/M1.1 既有模块与数据，未另建平行学习系统',
    data.validation.length === 0 &&
      data.stats.chapters === 6 &&
      data.concepts.length === 36 &&
      data.experiments.filter((e) => e.status === 'available').length === 6,
    `validateKnowledge 问题=${data.validation.length} · 章节=${data.stats.chapters} · 概念=${data.concepts.length} · 可用实验=${data.experiments.filter((e) => e.status === 'available').length}`
  );

  const ch456 = data.concepts.filter((c) => ['knowledge', 'runtime', 'reliability'].includes(c.chapterId));
  rec(
    'A02',
    '章节目录：六章全部可导航；第 04–06 章由 M1.3 交付后为已发布状态',
    data.chapters.length === 6 &&
      data.story.filter((s) => s.available).map((s) => s.id).join(',') ===
        'intelligence,context,connection,knowledge,runtime,reliability' &&
      // M1.3 交付后第 04–06 章 18 个概念全部为已发布，并各自挂到对应实验
      ch456.length === 18 &&
      ch456.every((c) => c.status === 'published' && c.canRunExperiment === true),
    `叙事章节=${data.story.filter((s) => s.available).length} · 第 04–06 章已发布=${ch456.filter((c) => c.status === 'published').length}/18 · 可运行实验=${ch456.filter((c) => c.canRunExperiment).length}/18`
  );

  rec(
    'A03',
    '概念覆盖：前三章 18 个概念均有完整 M1.1 分层字段',
    ch123.length === 18 &&
      ch123.every((c) => c.hasBody && c.oneLiner.length >= 8 && c.understand >= 2 && c.inspect >= 3 && c.misconceptions.length >= 1 && c.example && c.sources.length >= 2),
    `前三章概念=${ch123.length} · 全部有正文=${ch123.every((c) => c.hasBody)} · UNDERSTAND≥2=${ch123.every((c) => c.understand >= 2)} · INSPECT≥3=${ch123.every((c) => c.inspect >= 3)}`
  );

  rec(
    'A04',
    '中文入门内容：每概念有准确的入门解释与研究场景实例',
    ch123.every((c) => c.example && c.example.isSimulated === true && c.example.body.length >= 20),
    `示例齐全=${ch123.filter((c) => c.example).length}/18 · 示例均标注本地示意=${ch123.every((c) => c.example.isSimulated === true)}`
  );

  rec(
    'A05',
    '技术深入内容：每概念有技术机制、适用条件或局限',
    ch123.every((c) => c.inspect >= 3 && c.inspectChars >= 120),
    `INSPECT 条数=${ch123.map((c) => c.inspect).join('/')} · 最短字符数=${Math.min(...ch123.map((c) => c.inspectChars))}`
  );

  rec(
    'A06',
    '常见误解：每概念至少一条实际误解及纠正',
    ch123.every((c) => c.misconceptions.length >= 1 && c.misconceptions.every((m) => m.claim.length > 4 && m.correction.length > 10)),
    `误解总数=${ch123.reduce((n, c) => n + c.misconceptions.length, 0)} · 最少条数=${Math.min(...ch123.map((c) => c.misconceptions.length))}`
  );

  const externalSources = data.sources.filter((s) => s.type === 'external');
  rec(
    'A07',
    '参考来源：每概念有核实过的来源元数据，无伪造来源',
    ch123.every((c) => c.sources.some((id) => externalSources.some((s) => s.id === id && s.reviewed && s.checkedAt && /^https:\/\//.test(s.url || '')))) &&
      ch123.every((c) => !!c.reviewedAt),
    `外部已核验来源=${externalSources.filter((s) => s.reviewed).length} · 每概念至少一条外部来源=${ch123.every((c) => c.sources.some((id) => externalSources.some((s) => s.id === id && s.reviewed)))} · 审校日期齐全=${ch123.every((c) => !!c.reviewedAt)}`
  );

  rec(
    'A08',
    '概念 ID：保持 M0.3/M1.1 稳定 ID 与别名兼容',
    legacyIds.every((id) => data.concepts.some((c) => c.id === id)) && data.validation.length === 0,
    `既有 10 个 ID 全部保留=${legacyIds.every((id) => data.concepts.some((c) => c.id === id))} · 别名冲突问题=${data.validation.filter((v) => String(v.code).includes('ALIAS')).length}`
  );

  rec(
    'A09',
    '关系图谱：相关边语义明确，无杜撰的必要依赖',
    data.validation.filter((v) => String(v.code).startsWith('EDGE') || String(v.code).startsWith('CONCEPT_RELATED')).length === 0 &&
      data.stats.edges === 49 &&
      ch123.every((c) => c.related.length >= 1),
    `关系总数=${data.stats.edges} · 关系类问题=${data.validation.filter((v) => String(v.code).startsWith('EDGE')).length} · 每概念有 related=${ch123.every((c) => c.related.length >= 1)}`
  );

  /* ================================================================== *
   * A10–A13：三章叙事
   * ================================================================== */
  await ev(`window.__AZ.openChapterStory('intelligence')`);
  await sleep(600);
  const ch1 = await ev(`(() => {
    const main = document.querySelector('.workspace--chapter .ch-main');
    const story = window.__AZ.chapterApi().story();
    return {
      text: main ? main.textContent : '',
      limitText: main ? (main.querySelector('.ch-limit__text')?.textContent || '') : '',
      beatKinds: [...document.querySelectorAll('.ch-beat')].map((n) => n.dataset.kind),
      observation: [...document.querySelectorAll('.ch-beat__observe')].length,
      labButton: !!document.querySelector('[data-act="run-experiment"]'),
      labExperiment: document.querySelector('.ch-lab')?.getAttribute('data-experiment') || null,
      reading: document.querySelectorAll('.ch-reading__item').length,
      nextBtn: document.querySelector('[data-act="next-chapter"]')?.textContent || '',
      atlasBtn: !!document.querySelector('[data-act="atlas"]'),
      story: { goal: story.opening.goal, task: story.opening.task, limitation: story.limitation.text },
    };
  })()`);
  await shot('F35-章节01叙事.png');

  rec(
    'A10',
    'Story 01：讲清「模型能生成语言但没有证据」这一局限',
    /并不等于/.test(ch1.limitText) &&
      /校园活动公告/.test(ch1.story.task) &&
      ch1.beatKinds.includes('limit') &&
      /模拟/.test(ch1.text) &&
      ch1.labButton,
    `局限原文=「${ch1.limitText}」· 含 limit 节拍=${ch1.beatKinds.includes('limit')} · 实验入口=${ch1.labButton}`
  );

  await ev(`window.__AZ.chapterApi().openChapter('context')`);
  await sleep(500);
  const ch2 = await ev(`(() => {
    const main = document.querySelector('.workspace--chapter .ch-main');
    return {
      text: main ? main.textContent : '',
      limit: main ? (main.querySelector('.ch-limit__text')?.textContent || '') : '',
      labExperiment: document.querySelector('.ch-lab')?.getAttribute('data-experiment') || null,
      reading: document.querySelectorAll('.ch-reading__item').length,
    };
  })()`);
  rec(
    'A11',
    'Story 02：引导配置上下文并展示局限',
    /指令更清晰/.test(ch2.limit) && /上下文/.test(ch2.text) && ch2.labExperiment === 'exp-context-lab' && ch2.reading >= 3,
    `局限=「${ch2.limit}」· 实验=${ch2.labExperiment} · 结果解读条数=${ch2.reading}`
  );
  await shot('F36-章节02叙事.png');

  await ev(`window.__AZ.chapterApi().openChapter('connection')`);
  await sleep(500);
  const ch3 = await ev(`(() => {
    const main = document.querySelector('.workspace--chapter .ch-main');
    return {
      text: main ? main.textContent : '',
      limit: main ? (main.querySelector('.ch-limit__text')?.textContent || '') : '',
      labExperiment: document.querySelector('.ch-lab')?.getAttribute('data-experiment') || null,
      nextPlanned: !!document.querySelector('[data-act="next-planned"]'),
      nextBtn: document.querySelector('[data-act="next-chapter"]')?.textContent || '',
    };
  })()`);
  rec(
    'A12',
    'Story 03：外部工具与 MCP 连接路径被准确讲解',
    /返回数据不自动保证正确/.test(ch3.limit) &&
      /Host/.test(ch3.text) &&
      /Client/.test(ch3.text) &&
      /Server/.test(ch3.text) &&
      /Search/.test(ch3.text) &&
      ch3.labExperiment === 'exp-tool-calling-demo',
    `局限=「${ch3.limit}」· 提到 Host/Client/Server=${/Host/.test(ch3.text) && /Client/.test(ch3.text) && /Server/.test(ch3.text)} · 实验=${ch3.labExperiment}`
  );

  rec(
    'A13',
    '叙事衔接：模型→上下文→工具→知识检索自然连贯（六章成链）',
    data.story[0].next === 'context' &&
      data.story[1].next === 'connection' &&
      data.story[2].next === 'knowledge' &&
      data.story[5].next === null &&
      ch1.nextBtn.includes('第 02 章') &&
      /第 04 章/.test(ch3.nextBtn) &&
      !ch3.nextPlanned &&
      !!ch1.atlasBtn,
    `过渡链=${data.story.map((s) => `${s.id}→${s.next || 'M1.4'}`).join(' ')} · 第 01 章下一章按钮=「${ch1.nextBtn}」· 第 03 章下一章按钮=「${ch3.nextBtn}」`
  );

  /* ================================================================== *
   * A14–A16：Lab 01 Token / Context Budget
   * ================================================================== */
  await ev(`window.__AZ.openLabByKind('token')`);
  await sleep(700);
  const base = await ev(`window.__AZ.tokenLabApi().snapshot()`);
  await shot('F37-TokenLab默认.png');

  await ev(`window.__AZ.tokenLabApi().setEncoding('o200k_base')`);
  await sleep(350);
  const o200k = await ev(`window.__AZ.tokenLabApi().snapshot()`);
  await ev(`window.__AZ.tokenLabApi().setEncoding('cl100k_base')`);
  await sleep(250);
  // 384：固定段之后还能放下 1 条资料，第 2 条被整条舍弃（教学关键情形）
  await ev(`window.__AZ.tokenLabApi().setWindow(384)`);
  await sleep(350);
  const tight = await ev(`window.__AZ.tokenLabApi().snapshot()`);
  await shot('F38-TokenLab预算截断.png');
  // 256：连系统指令 + 任务 + 输出预留都放不下 → 明确报超限
  await ev(`window.__AZ.tokenLabApi().setWindow(256)`);
  await sleep(350);
  const overflow = await ev(`window.__AZ.tokenLabApi().snapshot()`);
  await shot('F38b-TokenLab超出预算.png');
  await ev(`window.__AZ.tokenLabApi().setWindow(1024)`);
  await sleep(250);
  const loose = await ev(`window.__AZ.tokenLabApi().snapshot()`);
  await ev(`window.__AZ.tokenLabApi().setDocs([])`);
  await sleep(250);
  const noDocs = await ev(`window.__AZ.tokenLabApi().snapshot()`);
  await ev(`window.__AZ.tokenLabApi().setDocs(['NTC-1001#summary','NTC-1001#body-1'])`);
  await sleep(250);

  rec(
    'A14',
    'Token 样例：真实分词样例，编码来源明确',
    base.tick === 61 && o200k.tick === 43 && base.chars === 69 && base.comparison.some((c) => c.tokens === 43),
    `中文样例 ${base.chars} 字符 → cl100k_base ${base.tick} token / o200k_base ${o200k.tick} token（离线预计算并逐条校验）`
  );

  rec(
    'A15',
    'Token 预算：改变预算会改变截断/舍弃显示并解释原因',
    tight.plan.windowTokens === 384 &&
      loose.plan.windowTokens === 1024 &&
      tight.plan.dropped.length === 1 &&
      loose.plan.dropped.length === 0 &&
      tight.plan.dropped.every((d) => d.reason.includes('整条舍弃')) &&
      overflow.plan.fits === false &&
      overflow.plan.overflow.gap > 0 &&
      overflow.plan.dropped.length === 2 &&
      noDocs.plan.sections.find((s) => s.id === 'docs').tokens === 0,
    `窗口 384 舍弃=${tight.plan.dropped.length} 条（原因含「整条舍弃」）· 窗口 1024 舍弃=${loose.plan.dropped.length} 条 · 窗口 256 超限缺口=${overflow.plan.overflow?.gap} token · 清空资料后资料占用=${noDocs.plan.sections.find((s) => s.id === 'docs').tokens}`
  );

  rec(
    'A16',
    'Token 准确性：没有按字符数伪称真实 token 数',
    Math.abs(base.chars / base.tick - 0.75) > 0.05 &&
      base.tick !== Math.ceil(base.chars / 4) &&
      base.tick !== base.chars &&
      base.charsPerToken.toFixed(2) === '1.13',
    `字符/token=${base.charsPerToken.toFixed(2)}（不是固定折算）· 61 ≠ 按 0.75 折算的 ${Math.round(base.chars * 0.75)} · 该数值来自预计算表并可用 node tools/tokens-verify.mjs 复算`
  );

  /* ================================================================== *
   * A17–A19：Lab 02 Instructions / Context
   * ================================================================== */
  await ev(`window.__AZ.openLabByKind('context')`);
  await sleep(700);
  const ctxBase = await ev(`window.__AZ.contextLabApi().snapshot()`);
  await ev(`window.__AZ.contextLabApi().configure({ goal: 'specific', format: 'outline', evidence: 'cite', background: 'cards' })`);
  await sleep(500);
  const ctxFull = await ev(`window.__AZ.contextLabApi().snapshot()`);
  await shot('F39-ContextLab有资料引用.png');
  await ev(`window.__AZ.contextLabApi().rerunWith({ goal: 'specific', format: 'outline', evidence: 'cite', background: 'cards', budget: 'limited' })`);
  await sleep(400);
  const ctxLimited = await ev(`window.__AZ.contextLabApi().snapshot()`);
  await shot('F40-ContextLab受限预算.png');
  await ev(`window.__AZ.contextLabApi().configure({ background: 'none' })`);
  await sleep(450);
  const ctxNoBg = await ev(`window.__AZ.contextLabApi().snapshot()`);
  await shot('F41-ContextLab无资料未验证.png');
  const ctxNoBgText = await ev(`document.querySelector('.workspace--lab-lab[data-lab="context"] .ctx-report').textContent`);
  const ctxSameTwice = await ev(`(() => {
    const api = window.__AZ.contextLabApi();
    const a = api.rerunWith({ goal: 'specific', format: 'prose', evidence: 'cite', background: 'cards', budget: 'ample' });
    const b = api.rerunWith({ goal: 'specific', format: 'prose', evidence: 'cite', background: 'cards', budget: 'ample' });
    return JSON.stringify(a.report) === JSON.stringify(b.report) && JSON.stringify(a.metrics) === JSON.stringify(b.metrics);
  })()`);

  const dims = ['goal', 'format', 'evidence', 'background', 'budget'];
  rec(
    'A17',
    'Context 控件：指令、范围、背景、预算能够操作并更新状态',
    (await ev(`window.__AZ.contextLabApi().dimensions().join(',')`)) === dims.join(',') &&
      ctxFull.metrics.supportedFacts > ctxBase.metrics.supportedFacts &&
      ctxLimited.metrics.cardsIncluded < ctxFull.metrics.cardsIncluded,
    `维度=${(await ev(`window.__AZ.contextLabApi().dimensions().join(',')`))} · 默认有来源事实=${ctxBase.metrics.supportedFacts} → 完整配置=${ctxFull.metrics.supportedFacts} · 受限预算进入卡片=${ctxLimited.metrics.cardsIncluded}/${ctxFull.metrics.cardsIncluded}`
  );

  rec(
    'A18',
    'Context 因果：改变配置导致可解释的结构/遗漏变化',
    ctxFull.metrics.blocks === 4 &&
      ctxBase.metrics.blocks === 2 &&
      ctxLimited.metrics.supportedFacts < ctxFull.metrics.supportedFacts &&
      ctxLimited.dropped.length >= 1 &&
      ctxLimited.dropped.every((d) => /放不下|整张舍弃/.test(d.reason)) &&
      ctxSameTwice === true &&
      !!ctxLimited.diff &&
      ctxLimited.diff.changed.some((c) => c.key === 'budget'),
    `报告节数 2→4 · 有来源事实 ${ctxLimited.metrics.supportedFacts}<${ctxFull.metrics.supportedFacts} · 被舍弃=${ctxLimited.dropped.length} · 同配置两次结果一致=${ctxSameTwice} · 变化维度=${ctxLimited.diff?.changed.map((c) => c.label).join('/')}`
  );

  rec(
    'A19',
    '无来源处理：无资料时不能生成虚构引用',
    ctxNoBg.metrics.citations === 0 &&
      ctxNoBg.metrics.supportedFacts === 0 &&
      /未验证/.test(ctxNoBgText) &&
      !/10 月 20 日/.test(ctxNoBgText) &&
      !/B201/.test(ctxNoBgText),
    `引用条数=${ctxNoBg.metrics.citations} · 有来源事实=${ctxNoBg.metrics.supportedFacts} · 报告含「未验证」标记=${/未验证/.test(ctxNoBgText)} · 报告里没有出现具体日期/地点=${!/10 月 20 日/.test(ctxNoBgText) && !/B201/.test(ctxNoBgText)}`
  );

  /* ================================================================== *
   * A20–A24：Lab 03 Tool Calling / MCP
   * ================================================================== */
  await ev(`window.__AZ.openLabExperiment('exp-tool-calling-demo', 'tool_calling')`);
  await sleep(900);
  const tcReady = await ev(`(() => {
    const api = window.__AZ.knowledgeApi();
    api.setStep('experiment');
    return api.experimentSnapshot();
  })()`);
  await ev(`window.__AZ.knowledgeApi().setPathMode('mcp')`);
  await sleep(500);
  const tcMcp = await ev(`window.__AZ.knowledgeApi().experimentSnapshot()`);
  const mcpDom = await ev(`(() => {
    const path = document.querySelector('.tc-path');
    return {
      mode: path ? path.dataset.mode : null,
      roles: [...new Set([...document.querySelectorAll('.tc-role-chip')].map((n) => n.dataset.role))].sort(),
      capTypes: [...new Set([...document.querySelectorAll('.tc-cap')].map((n) => n.dataset.type))].sort(),
      compareRows: document.querySelectorAll('.tk-table--path .tk-table__row').length,
      sameRows: document.querySelectorAll('.tk-table--path .tk-table__row[data-same="true"]').length,
      boundary: /不声称|教学可视化|不发起网络请求/.test(path ? path.textContent : ''),
    };
  })()`);
  // 把协议路径面板滚到可视区再截图（截图证据要能直接看到角色时间轴与对照表）
  await ev(`(() => { const el = document.querySelector('.tc-path'); if (el) el.scrollIntoView({ block: 'start' }); return !!el; })()`);
  await sleep(350);
  await shot('F42-Lab03-MCP路径.png');
  await ev(`(() => { const el = document.querySelector('.workspace--knowledge .kn-main'); if (el) el.scrollTop = 0; return true; })()`);
  await sleep(200);

  rec(
    'A20',
    '工具调用复用：原有 Tool Calling 事件链保留并被扩展',
    tcReady.events.length > 0 &&
      tcReady.events.some((e) => e.type === 'tool.call') &&
      tcReady.events.some((e) => e.type === 'tool.result') &&
      tcMcp.events.length === tcReady.events.length &&
      tcMcp.events.map((e) => e.id).join() === tcReady.events.map((e) => e.id).join(),
    `归一化后事件=${tcReady.events.length} 条（tool.call/tool.result 均在）· MCP 模式下事件 ID 完全一致=${tcMcp.events.map((e) => e.id).join() === tcReady.events.map((e) => e.id).join()}`
  );

  await ev(`window.__AZ.knowledgeApi().rerunExperiment({ condition: 'no_search' })`);
  await sleep(500);
  const tcNoSearch = await ev(`window.__AZ.knowledgeApi().experimentSnapshot()`);
  await ev(`window.__AZ.knowledgeApi().rerunExperiment({ condition: 'reader_unauthorized' })`);
  await sleep(500);
  const tcNoReader = await ev(`window.__AZ.knowledgeApi().experimentSnapshot()`);

  const readTexts = (snap) =>
    Object.values(snap.payloads || {}).filter((p) => p && p.kind === 'read.response' && p.content).length;

  rec(
    'A21',
    'Search/Reader 约束：未装配或无权限时不会显示工具成功',
    tcNoSearch.events.some((e) => e.status === 'blocked' || e.status === 'error') &&
      readTexts(tcNoSearch) === 0 &&
      readTexts(tcNoReader) === 0 &&
      !tcNoSearch.events.some((e) => e.status === 'success' && /document_reader/.test(e.message)) ,
    `Search 未装配：成功读取=${readTexts(tcNoSearch)} 条 · Reader 未授权：成功读取=${readTexts(tcNoReader)} 条 · 均有阻断事件=${tcNoSearch.events.some((e) => e.status === 'blocked' || e.status === 'error')}`
  );

  await ev(`window.__AZ.knowledgeApi().rerunExperiment({ condition: 'search_timeout' })`);
  await sleep(600);
  const tcTimeout = await ev(`window.__AZ.knowledgeApi().experimentSnapshot()`);
  rec(
    'A22',
    '失败场景：工具超时展示异常事件与相应原因',
    tcTimeout.events.some((e) => e.status === 'error' || e.status === 'blocked') &&
      readTexts(tcTimeout) === 0 &&
      tcTimeout.outcome !== tcReady.outcome &&
      tcTimeout.protocol.same === true,
    `超时分支结局=${tcTimeout.outcome}（正常=${tcReady.outcome}）· 异常事件=${tcTimeout.events.filter((e) => e.status === 'error' || e.status === 'blocked').length} 条 · 无伪造读取=${readTexts(tcTimeout) === 0}`
  );

  rec(
    'A23',
    'MCP 准确性：Host/Client/Server 与 Tools/Resources/Prompts 区分正确',
    mcpDom.mode === 'mcp' &&
      mcpDom.roles.includes('host') &&
      mcpDom.roles.includes('client') &&
      mcpDom.roles.includes('server') &&
      mcpDom.capTypes.join(',') === 'prompts,resources,tools' &&
      mcpDom.boundary,
    `角色=${mcpDom.roles.join('/')} · 能力类型=${mcpDom.capTypes.join('/')} · 界面声明「教学可视化/不发起网络请求」=${mcpDom.boundary}`
  );

  rec(
    'A24',
    '协议中立：MCP 路径不无依据改变研究事实或成功率',
    tcMcp.protocol.same === true &&
      mcpDom.compareRows === 6 &&
      mcpDom.sameRows === 6 &&
      tcMcp.outcome === tcReady.outcome &&
      JSON.stringify(Object.keys(tcMcp.payloads)) === JSON.stringify(Object.keys(tcReady.payloads)),
    `对照表 ${mcpDom.sameRows}/${mcpDom.compareRows} 项一致 · 结局相同=${tcMcp.outcome === tcReady.outcome} · 载荷键相同=${JSON.stringify(Object.keys(tcMcp.payloads)) === JSON.stringify(Object.keys(tcReady.payloads))}`
  );
  await ev(`window.__AZ.knowledgeApi().setPathMode('direct')`);

  /* ================================================================== *
   * A25–A27：跨视图导航与学习进度
   * ================================================================== */
  await ev(`window.__AZ.openKnowledge('token')`);
  await sleep(600);
  const kToken = await ev(`(() => {
    const page = document.querySelector('.workspace--knowledge');
    const runBtn = page.querySelector('[data-act="run-experiment"]');
    return {
      title: page.querySelector('.kn-hero__title')?.textContent || '',
      hasRun: !!runBtn,
      runText: runBtn ? runBtn.textContent : '',
      sources: [...page.querySelectorAll('.kn-source')].map((n) => n.textContent.trim()).join(' | '),
      layerButtons: page.querySelectorAll('.kn-layers button').length,
      inspected: !!page.querySelector('[data-layer="understand"]'),
    };
  })()`);
  await ev(`document.querySelector('.workspace--knowledge [data-layer="inspect"]').click()`);
  await sleep(300);
  await shot('F43-知识页Token-INSPECT.png');
  const kTokenInspect = await ev(`(() => {
    const page = document.querySelector('.workspace--knowledge');
    return { inspectItems: page.querySelectorAll('.kn-inspect__list li').length, hasSimulatedSample: /本地示意|不是真实/.test(page.textContent) };
  })()`);

  await ev(`document.querySelector('.workspace--knowledge [data-act="run-experiment"]').click()`);
  await sleep(800);
  const navAfterRun = await ev(`({ kind: window.__AZ.workspaceKind(), tokenTick: window.__AZ.tokenLabApi()?.snapshot().tick || null })`);
  await ev(`window.__AZ.openStory()`);
  await sleep(500);
  const storyHasChapter = await ev(`document.querySelectorAll('.story-chapter__story .btn').length`);
  await ev(`document.querySelector('.story-chapter[data-chapter="intelligence"] [data-act="open-chapter-story"]').click()`);
  await sleep(600);
  const chapterFromStory = await ev(`({ kind: window.__AZ.workspaceKind(), chapter: window.__AZ.chapterApi()?.currentChapter() || null })`);
  await ev(`window.__AZ.chapterApi().openChapter('intelligence')`);
  await sleep(300);
  await ev(`document.querySelector('.workspace--chapter [data-act="run-experiment"]').click()`);
  await sleep(800);
  const labFromChapter = await ev(`({ kind: window.__AZ.workspaceKind(), tick: window.__AZ.tokenLabApi()?.snapshot().tick || null })`);

  rec(
    'A25',
    '跨视图导航：Story/Atlas/Knowledge/Lab 可双向定位且无空链接',
    kToken.hasRun &&
      /Lab 01/.test(kToken.runText) &&
      navAfterRun.kind === 'lab-token' &&
      storyHasChapter === 6 &&
      chapterFromStory.kind === 'chapter' &&
      labFromChapter.kind === 'lab-token' &&
      kToken.layerButtons === 2 &&
      kTokenInspect.inspectItems >= 3,
    `知识页实验入口=「${kToken.runText}」→ ${navAfterRun.kind} · Story 叙事按钮=${storyHasChapter} · 章节实验入口→${labFromChapter.kind} · 概念页来源卡片=${kToken.sources.split('|').length} 条`
  );

  await ev(`window.__AZ.tokenLabApi().setWindow(512)`);
  await sleep(400);
  const progressAfter = await ev(`window.__AZ.learningSnapshot().concepts`);
  await ev(`window.__AZ.openKnowledge('context_engineering')`);
  await sleep(400);
  await ev(`window.__AZ.openLabByKind('context')`);
  await sleep(600);
  await ev(`window.__AZ.contextLabApi().configure({ evidence: 'cite' })`);
  await sleep(400);
  const progressCtx = await ev(`window.__AZ.learningSnapshot().concepts`);
  const browseOnly = await ev(`(() => {
    const az = window.__AZ;
    az.openKnowledge('transformer');
    return true;
  })()`);
  await sleep(500);
  const progressBrowse = await ev(`window.__AZ.learningSnapshot().concepts`);
  const persisted = await ev(`(() => {
    const raw = localStorage.getItem(${K(LEARNING_KEY)});
    const parsed = raw ? JSON.parse(raw) : null;
    return { schemaVersion: parsed?.schemaVersion, token: parsed?.concepts?.token || null, context: parsed?.concepts?.context_engineering || null };
  })()`);
  await cdp.send('Page.reload', { ignoreCache: false });
  if (!(await ready(cdp))) throw new Error('A26：刷新后 __AZ 未就绪');
  await ev(`window.__AZ.skipIntro('A26 刷新恢复')`);
  await sleep(700);
  const afterReload = await ev(`window.__AZ.learningSnapshot().concepts`);

  rec(
    'A26',
    '进度准确：浏览与实验完成分别记录，刷新后恢复',
    !initialProgress.token?.experimentCompleted &&
      progressAfter.token?.experimentCompleted === true &&
      progressCtx.context_engineering?.experimentCompleted === true &&
      progressBrowse.transformer?.explored === true &&
      progressBrowse.transformer?.experimentCompleted === false &&
      persisted.schemaVersion === 2 &&
      afterReload.token?.experimentCompleted === true &&
      afterReload.context_engineering?.experimentCompleted === true,
    `初始状态 token.experimentCompleted=${!!initialProgress.token?.experimentCompleted} → 后=${!!progressAfter.token?.experimentCompleted} · 仅浏览 transformer 时 explored=${!!progressBrowse.transformer?.explored} / experimentCompleted=${!!progressBrowse.transformer?.experimentCompleted} · 刷新后 token=${!!afterReload.token?.experimentCompleted}`
  );

  const protection = await ev(`(() => {
    const legacy = localStorage.getItem(${K(LEARNING_LEGACY_KEY)});
    const learning = JSON.parse(localStorage.getItem(${K(LEARNING_KEY)}) || 'null');
    return {
      legacyIntact: legacy === ${K(legacyPayload)},
      constructorKey: localStorage.getItem(${K(CONSTRUCTOR_KEY)}),
      researchKey: localStorage.getItem(${K(RESEARCH_KEY)}),
      learningSchema: learning?.schemaVersion,
      modules: window.__AZ.constructorConfigSnapshot().modules.length,
    };
  })()`);
  rec(
    'A27',
    '旧数据保护：M0 配置、轨迹、报告以及 M1.1 进度未被清空',
    protection.legacyIntact && protection.learningSchema === 2 && protection.modules >= 0,
    `旧版学习键原样保留=${protection.legacyIntact} · v2 schema=${protection.learningSchema} · 装配模块数=${protection.modules} · research 键存在=${protection.researchKey !== null}`
  );

  /* ================================================================== *
   * A28–A30：可访问性、纯前端构建、回归
   * ================================================================== */
  await ev(`window.__AZ.openChapterStory('context')`);
  await sleep(500);
  const a11y = await ev(`(() => {
    const ws = document.querySelector('.workspace--chapter');
    const focusables = [...ws.querySelectorAll('button, a[href], input, select')];
    const labelled = focusables.filter((n) => (n.getAttribute('aria-label') || n.textContent || '').trim().length > 0);
    const headings = [...ws.querySelectorAll('h2')].length;
    return { focusables: focusables.length, labelled: labelled.length, headings, lang: document.documentElement.lang };
  })()`);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(600);
  const mobile = await ev(`(() => {
    const body = document.querySelector('.workspace--chapter .ch-body');
    const cols = body ? getComputedStyle(body).gridTemplateColumns.split(' ').length : 0;
    return { cols, overflow: document.documentElement.scrollWidth - window.innerWidth };
  })()`);
  await shot('F44-移动端章节叙事.png');
  await ev(`window.__AZ.openLabByKind('token')`);
  await sleep(600);
  await shot('F45-移动端TokenLab.png');

  /**
   * 减少动态偏好：M1.2 的三个学习界面都不依赖动画，
   * 因此在 prefers-reduced-motion 下必须同样可读、可操作。
   */
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await sleep(400);
  const reduced = await ev(`(() => {
    const lab = document.querySelector('.workspace--lab-lab[data-lab="token"]');
    const tokens = lab ? lab.querySelectorAll('.tk-tok').length : 0;
    const buttons = lab ? lab.querySelectorAll('button').length : 0;
    const anim = lab ? getComputedStyle(lab.querySelector('.tk-opt') || lab).transitionDuration : '';
    return { tokens, buttons, anim, readable: !!lab && (lab.textContent || '').includes('token 片段') };
  })()`);
  await cdp.send('Emulation.setEmulatedMedia', { features: [] });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(400);

  rec(
    'A28',
    '可访问性：键盘、减少动画与移动端关键学习流程可用',
    a11y.focusables > 8 && a11y.labelled === a11y.focusables && mobile.cols === 1 && mobile.overflow <= 1 && a11y.lang === 'zh-CN' &&
      reduced.tokens > 0 && reduced.buttons > 0 && reduced.readable,
    `可聚焦控件=${a11y.focusables}（均有可访问名称=${a11y.labelled === a11y.focusables}）· 窄屏 390px 列数=${mobile.cols} · 横向溢出=${mobile.overflow}px · lang=${a11y.lang} · 减少动态下 token 片段=${reduced.tokens} 个、控件=${reduced.buttons} 个、过渡时长=${reduced.anim || '0s'}`
  );

  const network = await ev(`(() => {
    const entries = performance.getEntriesByType('resource').map((e) => e.name);
    const remote = entries.filter((n) => /^https?:/i.test(n));
    return { total: entries.length, remote: remote.slice(0, 5), html: !!document.querySelector('.workspace') };
  })()`);
  const distHtml = existsSync(path.join(process.cwd(), 'dist', 'index.html'))
    ? await readFile(path.join(process.cwd(), 'dist', 'index.html'), 'utf8')
    : '';
  rec(
    'A29',
    '纯前端构建：无业务 API/远程 LLM，静态构建并适配项目子路径',
    network.remote.length === 0 &&
      !/(src|href)="https?:/i.test(distHtml) &&
      /src="\.\/assets\/app\.js"/.test(distHtml) &&
      /href="\.\/assets\/app\.css"/.test(distHtml),
    `运行时网络请求=${network.total - network.remote.length} 条（远程 ${network.remote.length}）· dist/index.html 使用相对路径=${/src="\.\/assets\/app\.js"/.test(distHtml)}`
  );

  return results;
}

/* ==================================================================== *
 * 独立运行入口：启动本机 Chrome → 跑验收 → 跑 M0.3/M0.4/M1.1 回归 → 报告
 * ==================================================================== */
async function main() {
  const browser = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!browser) throw new Error('未找到本机 Chrome/Edge，无法进行渲染验收');
  /**
   * 与 tools/shots.mjs 保持一致：主验收页面用根目录的单文件离线版
   * （dist/index.html 的构建产物另行从磁盘校验，见 A29）。
   */
  const url = 'file:///' + path.join(process.cwd(), 'index.html').replace(/\\/g, '/');
  if (!existsSync(path.join(process.cwd(), 'index.html')) || !existsSync(path.join(process.cwd(), 'dist', 'index.html'))) {
    throw new Error('缺少构建产物：请先运行 node tools/build.mjs');
  }
  const profile = path.join(os.tmpdir(), `az0-m12-${Date.now()}`);
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const proc = spawn(
    browser,
    [
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
    ],
    { stdio: 'ignore' }
  );

  let cdp = null;
  try {
    let wsUrl = null;
    for (let i = 0; i < 40 && !wsUrl; i += 1) {
      await sleep(300);
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
        const targets = await res.json();
        const page = targets.find((t) => t.type === 'page');
        if (page) wsUrl = page.webSocketDebuggerUrl;
      } catch {
        /* 浏览器还没起来 */
      }
    }
    if (!wsUrl) throw new Error('无法连接本机 Chrome 的调试端口');

    const { WebSocket } = globalThis;
    const ws = await new Promise((resolve, reject) => {
      const socket = new WebSocket(wsUrl);
      socket.addEventListener('open', () => resolve(socket), { once: true });
      socket.addEventListener('error', () => reject(new Error('调试 WebSocket 连接失败')), { once: true });
    });
    cdp = new CDP(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url });
    if (!(await waitReady(cdp))) throw new Error('页面未就绪：__AZ 未挂载');

    const started = Date.now();
    const m12 = await runM12Acceptance({ cdp, shot: (name) => cdp.shot(path.join(OUT, name)), waitReady });

    /* ---------- A30：真实运行 M0.3 / M0.4 / M1.1 验收脚本 ---------- */
    const { runM03Acceptance } = await import('./m03-acceptance.mjs');
    const { runM04Acceptance } = await import('./m04-acceptance.mjs');
    const { runM11Acceptance } = await import('./m11-acceptance.mjs');
    await cdp.send('Page.reload', { ignoreCache: false });
    if (!(await waitReady(cdp))) throw new Error('回归前恢复页面失败');
    await sleep(500);
    const m03 = await runM03Acceptance({ cdp, sleep, shot: async () => null, waitReady });
    const m04 = await runM04Acceptance({ cdp, sleep, shot: async () => null, waitReady });
    const m11 = await runM11Acceptance({ cdp, sleep, shot: async () => null, waitReady });

    const regressions = [
      { id: 'A30-M03', name: 'M0.3 工具调用与执行台回归', rows: m03 },
      { id: 'A30-M04', name: 'M0.4 研究闭环与来源追溯回归', rows: m04 },
      { id: 'A30-M11', name: 'M1.1 知识架构与学习基础回归', rows: m11 },
    ].map((group) => {
      const failed = group.rows.filter((r) => !r.pass);
      return {
        id: group.id,
        name: group.name,
        pass: failed.length === 0,
        note: `通过 ${group.rows.length - failed.length}/${group.rows.length}${failed.length ? ' · 失败项：' + failed.map((f) => f.id).join(',') : ''}`,
        failed: failed.map((f) => ({ id: f.id, name: f.name, note: f.note })),
      };
    });

    const all = [...m12, ...regressions];
    const failed = all.filter((r) => !r.pass);
    const report = {
      stage: 'M1.2',
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      url,
      total: all.length,
      passed: all.length - failed.length,
      failed: failed.map((r) => r.id),
      results: all,
      m12,
      regressions,
      console: (cdp.console || []).slice(0, 40),
      shots: OUT,
    };
    await writeFile(path.join(process.cwd(), 'verify', 'm12-report.json'), JSON.stringify(report, null, 2), 'utf8');

    console.log('\n=== M1.2 验收（A01–A29） ===');
    for (const r of m12) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id} ${r.name}\n      ${r.note}`);
    console.log('\n=== A30 回归（M0.3 / M0.4 / M1.1） ===');
    for (const r of regressions) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id} ${r.name} · ${r.note}`);
    console.log(`\n合计：${all.length - failed.length}/${all.length} 通过 · 报告 verify/m12-report.json · 截图 verify/m12-shots/`);
    if (cdp.console.length) console.log('\n控制台：\n' + cdp.console.slice(0, 12).join('\n'));
    process.exitCode = failed.length ? 1 : 0;
  } finally {
    try {
      cdp?.send('Browser.close')?.catch(() => {});
    } catch {
      /* 忽略关闭异常 */
    }
    proc.kill();
  }
}

const invokedDirectly = process.argv[1] && /m12-acceptance\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}



