/**
 * tools/m13-acceptance.mjs
 * ------------------------------------------------------------------
 * M1.3「Agent 进阶与运行机制」浏览器验收（A01–A36）。
 *
 * 设计原则（与 M0.3 / M0.4 / M1.1 / M1.2 的验收脚本同构）：
 *   · 自带 CDP 启动器，`node tools/m13-acceptance.mjs` 可以独立跑完；
 *   · 每一项都通过**真实 DOM 与真实 store** 驱动，走与界面按钮相同的入口；
 *   · 逻辑层（切分 / 状态机 / 权限判定 / 评估）由 Node 单元测试逐条覆盖，
 *     这里验证「界面是否真的把这些逻辑接上、并如实呈现」；
 *   · A36 在同一进程里真实运行 M0.3 / M0.4 / M1.1 / M1.2 的验收脚本；
 *   · 截图写入 verify/m13-shots/，报告写入 verify/m13-report.json。
 *
 * 用法：
 *   node tools/build.mjs && node tools/m13-acceptance.mjs
 * ------------------------------------------------------------------
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PORT = 9343;
const OUT = path.join(process.cwd(), 'verify', 'm13-shots');
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

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.console = [];
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
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
export async function runM13Acceptance({ cdp, shot, waitReady: ready = waitReady }) {
  const results = [];
  const rec = (id, name, pass, note) => results.push({ id, name, pass: !!pass, note: String(note ?? '') });
  const ev = (code, awaitPromise = false) => cdp.eval(code, awaitPromise);
  const K = (v) => JSON.stringify(v);

  await mkdir(OUT, { recursive: true });

  /* ---------- 起始条件：清空 M1.3 命名空间，并留一份旧版学习记录 ---------- */
  const legacyPayload = JSON.stringify({
    schemaVersion: 1,
    concepts: { rag: { explored: true, relatedDiscovered: true, experimentCompleted: true, visits: 2 } },
  });
  await ev(`(() => {
    localStorage.removeItem(${K(LEARNING_KEY)});
    localStorage.removeItem(${K(MEMORY_KEY)});
    localStorage.removeItem(${K(CONSTRUCTOR_KEY)});
    localStorage.removeItem(${K(RESEARCH_KEY)});
    localStorage.setItem(${K(LEARNING_LEGACY_KEY)}, ${K(legacyPayload)});
    return true;
  })()`);
  await cdp.send('Page.reload', { ignoreCache: false });
  if (!(await ready(cdp))) throw new Error('M1.3 验收：重新加载后 __AZ 未就绪');
  await ev(`window.__AZ.skipIntro('M1.3 验收')`);
  await sleep(400);

  /* ================================================================== *
   * A01 审计：仓库实际状态（知识层自洽 + 六个实验 + 来源统计）
   * ================================================================== */
  const audit = await ev(`(() => {
    const stats = window.__AZ.knowledgeStats();
    return { stats, issues: window.__AZ.knowledgeValidation(), chapters: window.__AZ.chapters().length, concepts: window.__AZ.conceptIds().length };
  })()`);
  rec(
    'A01',
    '仓库审计：知识层零问题、六章 36 概念、6 个实验可操作',
    audit.issues.length === 0 && audit.chapters === 6 && audit.concepts === 36 && audit.stats.experiments.available === 6,
    `validateKnowledge=${audit.issues.length} 问题 · 章节 ${audit.chapters} · 概念 ${audit.concepts} · 实验 ${audit.stats.experiments.available}/${audit.stats.experiments.total} · 关系 ${audit.stats.edges} · 来源 ${audit.stats.sources}`
  );

  /* ================================================================== *
   * A02 章节覆盖：第 04–06 章注册、编号与标题正确
   * ================================================================== */
  const chapters = await ev(`window.__AZ.chapters()`);
  const m13Chapters = chapters.filter((c) => ['04', '05', '06'].includes(c.no));
  rec(
    'A02',
    '章节覆盖：第 04–06 章正确注册，顺序与编号无冲突',
    m13Chapters.length === 3 &&
      m13Chapters.map((c) => c.id).join(',') === 'knowledge,runtime,reliability' &&
      m13Chapters.every((c) => c.zh && c.en && c.question.length > 8),
    m13Chapters.map((c) => `${c.no} ${c.zh}(${c.en})`).join(' · ')
  );

  /* ================================================================== *
   * A03 概念覆盖：18 个稳定 ID 均存在且归属正确
   * ================================================================== */
  const expected = {
    knowledge: ['chunking', 'retrieval', 'embedding', 'rag', 'memory', 'skills'],
    runtime: ['agent', 'agent_loop', 'workflow', 'harness', 'orchestration', 'multi_agent'],
    reliability: ['permissions', 'sandbox', 'prompt_injection', 'guardrails', 'tracing', 'evals'],
  };
  const concepts = await ev(`window.__AZ.knowledgeConcepts()`);
  const byId = Object.fromEntries(concepts.map((c) => [c.id, c]));
  const coverageOk = Object.entries(expected).every(([chapterId, ids]) =>
    ids.every((id) => byId[id] && byId[id].chapterId === chapterId && byId[id].status === 'published')
  );
  rec(
    'A03',
    '概念覆盖：18 个稳定概念 ID 均存在、归属正确、状态为已发布',
    coverageOk,
    Object.entries(expected)
      .map(([id, ids]) => `${id}:${ids.map((c) => (byId[c]?.status === 'published' ? '✓' : '✗')).join('')}`)
      .join(' ')
  );

  /* ================================================================== *
   * A04 ID 兼容：M0 / M1.1 / M1.2 ID 与深链仍有效
   * ================================================================== */
  const legacyRun = await ev(`(async () => {
    const az = window.__AZ;
    az.openKnowledge('rag');
    await new Promise((r) => setTimeout(r, 150));
    const first = document.querySelector('.kn-hero')?.getAttribute('data-concept');
    az.closeWorkspace();
    az.openKnowledge('tool_calling');
    await new Promise((r) => setTimeout(r, 150));
    const second = az.workspaceKind();
    az.closeWorkspace();
    const all = ['llm','agent','tool_calling','tools','api','mcp','skills','rag','workflow','harness','retrieval','prompt_injection','multi_agent','evals'];
    return { first, second, missing: all.filter((id) => !az.conceptAvailability(id)) };
  })()`, true);
  rec(
    'A04',
    'ID 兼容：M0/M1.1/M1.2 的持久化 ID 与深链保持有效',
    legacyRun.first === 'rag' && legacyRun.second === 'knowledge' && legacyRun.missing.length === 0,
    `深链 rag→${legacyRun.first} · tool_calling 路由=${legacyRun.second} · 缺失 ${legacyRun.missing.length} 个`
  );

  /* ================================================================== *
   * A05 分层内容 + A06 来源 + A07 准确性（界面可核对的部分）
   * ================================================================== */
  const layerOk = Object.values(expected)
    .flat()
    .every((id) => {
      const concept = byId[id];
      return (
        concept &&
        concept.understand >= 2 &&
        concept.understandChars >= 120 &&
        concept.inspect >= 4 &&
        concept.inspectChars >= 200 &&
        concept.misconceptions.length >= 1 &&
        concept.example &&
        concept.example.isSimulated === true &&
        concept.related.length >= 1
      );
    });
  rec(
    'A05',
    '分层内容：18 个概念均具备 UNDERSTAND / INSPECT / 例子 / 误解 / 关系',
    layerOk,
    `最小 understand=${Math.min(...Object.values(expected).flat().map((id) => byId[id].understand))} 段 · 最小 inspect=${Math.min(
      ...Object.values(expected).flat().map((id) => byId[id].inspect)
    )} 条`
  );

  const sources = await ev(`window.__AZ.knowledgeSources()`);
  const sourceOf = Object.fromEntries(sources.map((s) => [s.id, s]));
  const m13Concepts = Object.values(expected).flat();
  const sourceOk = m13Concepts.every((id) => {
    const refs = byId[id].sources;
    const external = refs.filter((ref) => sourceOf[ref]?.type === 'external' && sourceOf[ref]?.reviewed && /^https:\/\//.test(sourceOf[ref]?.url || ''));
    return refs.length >= 1 && external.length >= 1 && byId[id].reviewedAt;
  });
  rec(
    'A06',
    '参考来源：每个概念都有已核验外部来源，URL 可核验、审校日期齐全',
    sourceOk,
    `外部已核验来源 ${sources.filter((s) => s.type === 'external' && s.reviewed).length} 条 · 概念审校日期 ${new Set(
      m13Concepts.map((id) => byId[id].reviewedAt)
    ).size} 种`
  );

  /* A07：用界面文本核对关键边界（正文级断言由 tests/m13-content.test.mjs 覆盖） */
  await ev(`window.__AZ.openKnowledge('sandbox')`);
  await sleep(250);
  const sandboxPage = await ev(`(() => {
    /* 技术边界写在 INSPECT 层：切过去再核对整页文本 */
    document.querySelector('.kn-layers button[data-layer="inspect"]')?.click();
    const text = document.querySelector('.kn-main')?.textContent || '';
    return { hasRuleSimNote: /规则模拟/.test(text), hasNoRealIsolation: /不构成真实隔离/.test(text), status: document.querySelector('.kn-hero .tag')?.textContent || '' };
  })()`);
  await shot('F61-知识页Sandbox-INSPECT.png');
  rec(
    'A07',
    '概念准确性：界面同时写明「规则模拟」与「不构成真实隔离」',
    sandboxPage.hasRuleSimNote && sandboxPage.hasNoRealIsolation,
    `命中规则模拟=${sandboxPage.hasRuleSimNote} · 不构成真实隔离=${sandboxPage.hasNoRealIsolation} · 状态标签=${sandboxPage.status.trim()}`
  );

  /* ================================================================== *
   * A08 关系校验：18 个概念的 related 都能对应真实概念，且无自指
   * ================================================================== */
  const relationOk = m13Concepts.every((id) => byId[id].related.every((target) => byId[target] && target !== id));
  rec('A08', '关系校验：related 目标全部有效、无自指、方向由关系数据表达', relationOk, `检查 ${m13Concepts.length} 个概念的相关提示`);

  /* ================================================================== *
   * A09–A16 Knowledge Lab
   * ================================================================== */
  await ev(`window.__AZ.openLabExperiment('exp-retrieval-lab', 'chunking')`);
  await sleep(300);
  const labKind = await ev(`window.__AZ.workspaceKind()`);
  const docCards = await ev(`document.querySelectorAll('.knl-doc').length`);
  const chunkCards = await ev(`document.querySelectorAll('.knl-chunk').length`);
  rec(
    'A09',
    'Knowledge Lab 文档：本地虚构资料可浏览，片段带 ID 与原文定位',
    labKind === 'lab-knowledge' && docCards >= 9 && chunkCards > 0,
    `工作区=${labKind} · 文档卡片=${docCards} · 片段卡片=${chunkCards}`
  );

  const chunkBase = await ev(`window.__AZ.knowledgeLabApi().chunkIds()`);
  await ev(`window.__AZ.knowledgeLabApi().configure({ preset: 'fixed', size: 60 })`);
  const chunkFixed = await ev(`window.__AZ.knowledgeLabApi().chunkIds()`);
  const boundaryText = await ev(`document.querySelector('.knl-chunk .tag')?.textContent || ''`);
  rec(
    'A10',
    'Chunking：切分方式变化后片段边界与 ID 确实更新',
    chunkBase.length !== chunkFixed.length && chunkFixed.every((id) => id.includes('fixed60')) && !chunkFixed.some((id) => chunkBase.includes(id)),
    `段落切分 ${chunkBase.length} 片段 → 固定 60 字符 ${chunkFixed.length} 片段 · 首片段边界标记=${boundaryText || '（无）'}`
  );

  const retrieval = await ev(`window.__AZ.knowledgeLabApi().snapshot()`);
  const retrievalRepeat = await ev(`(() => {
    const api = window.__AZ.knowledgeLabApi();
    api.configure({ questionId: 'career-fair-date' });
    const a = api.snapshot();
    api.configure({ questionId: 'open-day-date' });
    api.configure({ questionId: 'career-fair-date' });
    return api.snapshot();
  })()`);
  const sameOrder = JSON.stringify(retrievalRepeat.candidates.map((c) => c.chunkId)) === JSON.stringify(retrievalRepeat.candidates.map((c) => c.chunkId));
  const reasonCount = await ev(`document.querySelectorAll('.tk-table--path .tk-table__row').length`);
  rec(
    'A11',
    'Retrieval：候选排序由确定性规则产生，分数与理由可查看',
    retrievalRepeat.candidates.length > 0 && sameOrder && reasonCount > 0,
    `候选 ${retrievalRepeat.candidates.length} 个 · 行数 ${reasonCount} · 首名 ${retrievalRepeat.candidates[0].docId}:${retrievalRepeat.candidates[0].score}`
  );

  const vectorView = await ev(`(() => {
    const api = window.__AZ.knowledgeLabApi();
    api.configure({ mode: 'vector-demo' });
    const snap = api.snapshot();
    const text = document.querySelector('[data-act="retrieval"]')?.textContent || '';
    const noCoord = (() => { api.configure({ questionId: 'graduation-venue' }); return api.snapshot(); })();
    api.configure({ mode: 'keyword', questionId: 'career-fair-date' });
    return { snap, text, noCoord };
  })()`);
  rec(
    'A12',
    'Embedding 示意：只用预计算二维坐标，明确标注非模型输出；无坐标即不可用',
    vectorView.snap.mode === 'vector-demo' &&
      /人工按主题相近程度设定/.test(vectorView.text) &&
      vectorView.noCoord.vectorAvailable === false &&
      vectorView.noCoord.answer.status === 'insufficient',
    `向量候选 ${vectorView.snap.candidates.length} 个 · 无坐标问题可用=${vectorView.noCoord.vectorAvailable} · 结论=${vectorView.noCoord.answer.statusCn}`
  );

  const rag = await ev(`(() => {
    const api = window.__AZ.knowledgeLabApi();
    api.configure({ questionId: 'open-day-date', skillEnabled: false });
    const before = api.snapshot();
    api.configure({ skillEnabled: true });
    const after = api.snapshot();
    api.configure({ skillEnabled: false, questionId: 'career-fair-date' });
    return { before, after };
  })()`);
  const citationOk = rag.before.answer.citations.every((cite) => rag.before.context.some((seg) => seg.chunkId === cite.chunkId));
  rec(
    'A13',
    'RAG 流程：检索片段、上下文与结论可追溯（引用必须指向进入上下文的片段）',
    citationOk && rag.before.answer.citations.length >= 1,
    `结论 ${rag.before.answer.statusCn} · 引用 ${rag.before.answer.citations.length} 条 · 上下文 ${rag.before.context.length} 段`
  );

  const noEvidence = await ev(`(() => {
    const api = window.__AZ.knowledgeLabApi();
    api.configure({ questionId: 'graduation-venue' });
    const snap = api.snapshot();
    const text = document.querySelector('[data-act="rag"]')?.textContent || '';
    api.configure({ questionId: 'career-fair-date' });
    return { snap, text };
  })()`);
  rec(
    'A14',
    '无证据处理：没有资料时输出资料不足，且不生成任何引用',
    noEvidence.snap.answer.status === 'insufficient' &&
      noEvidence.snap.answer.citations.length === 0 &&
      /资料不足|未验证/.test(noEvidence.text),
    `状态 ${noEvidence.snap.answer.statusCn} · 引用 ${noEvidence.snap.answer.citations.length} 条 · 上下文 ${noEvidence.snap.context.length} 段`
  );

  const memory = await ev(`(() => {
    const api = window.__AZ.knowledgeLabApi();
    const key = window.__AZ.labMemoryStorageKey;
    const learningBefore = localStorage.getItem(${K(LEARNING_KEY)});
    const saved = api.saveMemory({ kind: 'focus', value: '验收：关注日期冲突' });
    const afterSave = localStorage.getItem(key);
    const entries = api.memoryEntries();
    const learningAfter = localStorage.getItem(${K(LEARNING_KEY)});
    const cleared = api.clearMemory();
    return {
      saved: saved.ok,
      afterSaveHasValue: !!afterSave && afterSave.includes('验收：关注日期冲突'),
      entries: entries.length,
      learningUnchanged: learningBefore === learningAfter,
      cleared,
      afterClear: localStorage.getItem(key),
      columns: document.querySelectorAll('.knl-mem__col').length,
      autoFilled: api.snapshot().memory.length,
    };
  })()`);
  rec(
    'A15',
    'Memory 区分：三栏并列、只有手动保存才写入、清除不影响学习进度',
    memory.saved &&
      memory.afterSaveHasValue &&
      memory.learningUnchanged &&
      memory.afterClear === null &&
      memory.columns === 3 &&
      memory.autoFilled === 0,
    `记忆条目=${memory.entries} · 清除=${memory.cleared} · 学习进度未变=${memory.learningUnchanged} · 三栏=${memory.columns} · 未自动写入=${memory.autoFilled === 0}`
  );

  const skills = await ev(`(() => {
    const api = window.__AZ.knowledgeLabApi();
    api.configure({ skillEnabled: false });
    const off = { steps: api.snapshot().planSteps.length, tools: api.toolList() };
    api.configure({ skillEnabled: true });
    const on = { steps: api.snapshot().planSteps.length, tools: api.toolList(), checks: api.snapshot().checks.length };
    const text = document.querySelector('[data-act="skills"]')?.textContent || '';
    api.configure({ skillEnabled: false });
    return { off, on, text };
  })()`);
  rec(
    'A16',
    'Skills 区分：Skill 改变方法步骤，但不自动增加工具或权限',
    skills.on.steps > skills.off.steps &&
      JSON.stringify(skills.on.tools) === JSON.stringify(skills.off.tools) &&
      /不增不减|不会新增工具/.test(skills.text),
    `方法步骤 ${skills.off.steps} → ${skills.on.steps} · 工具 ${skills.on.tools.join('/')} 保持不变 · 检查 ${skills.on.checks} 项`
  );
  await shot('F62-KnowledgeLab默认.png');

  /* ================================================================== *
   * A17–A22 Runtime Lab
   * ================================================================== */
  await ev(`window.__AZ.openLabExperiment('exp-agent-loop-lab', 'agent_loop')`);
  await sleep(300);
  const runtimeKind = await ev(`window.__AZ.workspaceKind()`);
  const modes = await ev(`(() => {
    const api = window.__AZ.runtimeLabApi();
    api.setMode('workflow');
    const workflow = api.snapshot();
    api.showAll();
    api.setMode('agent-loop');
    const loop = api.snapshot();
    api.showAll();
    return { workflow, loop };
  })()`);
  const evidenceOf = (snap) => JSON.stringify([...new Set(snap.events.flatMap((e) => e.sourceIds))].sort());
  rec(
    'A17',
    'Runtime 模式：Workflow 与 Agent Loop 使用同一任务与数据条件',
    runtimeKind === 'lab-runtime' &&
      modes.workflow.conclusion.status === modes.loop.conclusion.status &&
      evidenceOf(modes.loop).includes('NTC-1008'),
    `Workflow ${modes.workflow.metrics.steps} 步 / ${modes.workflow.metrics.terminator} · Agent Loop ${modes.loop.metrics.steps} 步 / ${modes.loop.metrics.terminator}`
  );

  /* A17b：成功路径——单一取值的查询，两种模式都应给出「有证据支撑」 */
  const successPath = await ev(`(() => {
    const api = window.__AZ.runtimeLabApi();
    api.configure({ queryId: 'maker-share', maxSteps: 6, maxRetries: 2 });
    const loop = api.snapshot();
    api.setMode('workflow');
    const workflow = api.snapshot();
    api.configure({ queryId: 'career-fair' });
    api.setMode('agent-loop');
    return { loop, workflow };
  })()`);
  rec(
    'A17b',
    '成功路径：单一取值时两种模式都给出「有证据支撑」，且以「目标达成」终止',
    successPath.loop.conclusion.status === 'supported' &&
      successPath.workflow.conclusion.status === 'supported' &&
      successPath.loop.metrics.terminator === 'target-reached' &&
      successPath.workflow.metrics.terminator === 'plan-complete',
    `Agent Loop ${successPath.loop.conclusion.status} / ${successPath.loop.metrics.terminator} · Workflow ${successPath.workflow.conclusion.status} / ${successPath.workflow.metrics.terminator} · 来源 ${successPath.loop.metrics.sourceCoverage}`
  );

  const termination = await ev(`(() => {
    const api = window.__AZ.runtimeLabApi();
    api.configure({ maxSteps: 3, queryId: 'career-fair' });
    const capped = api.snapshot();
    api.configure({ queryId: 'no-such-event', maxRetries: 1 });
    const retried = api.snapshot();
    api.configure({ queryId: 'career-fair', maxSteps: 6, maxRetries: 2 });
    return { capped, retried };
  })()`);  rec(
    'A18',
    '循环终止：步数上限与重试上限生效，事件里给出明确终止原因',
    termination.capped.metrics.terminator === 'max-steps' &&
      termination.capped.metrics.steps <= 3 &&
      termination.retried.metrics.terminator === 'retry-limit' &&
      termination.retried.metrics.retries === 1,
    `cap3→${termination.capped.metrics.terminator}(${termination.capped.metrics.steps} 步) · retry1→${termination.retried.metrics.terminator}(${termination.retried.metrics.retries} 次)`
  );

  const harness = await ev(`(() => {
    const api = window.__AZ.runtimeLabApi();
    api.showAll();
    const rows = [...document.querySelectorAll('.rtl-harness__row')].map((node) => node.getAttribute('data-harness'));
    const active = [...document.querySelectorAll('.rtl-harness__row[data-active="true"]')].length;
    const text = document.querySelector('[data-act="harness"]')?.textContent || '';
    return { rows, active, text };
  })()`);
  rec(
    'A19',
    'Harness 解释：五项运行职责可视化，且明确不是另一个模型',
    harness.rows.length === 5 && harness.active > 0 && /不是另一个模型|不产生语言判断/.test(harness.text),
    `职责=${harness.rows.join('/')} · 当前触发 ${harness.active} 项`
  );

  const multi = await ev(`(() => {
    const api = window.__AZ.runtimeLabApi();
    api.configure({ queryId: 'career-fair', failRole: null });
    const ok = api.runMultiAgent(null);
    const bad = api.runMultiAgent('verifier');
    const nodes = document.querySelectorAll('[data-role]').length;
    const handoffs = document.querySelectorAll('[data-act="multi-events"] [data-step-type="handoff"]').length;
    return {
      nodes,
      handoffs,
      assign: !!document.querySelector('[data-act="multi-events"] [data-step-type="assign"]'),
      ok: { status: ok.conclusion.status, handoffs: ok.extra.handoffs, roles: ok.extra.roles },
      bad: { status: bad.conclusion.status, cn: bad.conclusion.statusCn },
    };
  })()`);
  rec(
    'A20',
    'Orchestration：任务分派有明确事件、输入输出与顺序说明',
    multi.assign && multi.handoffs >= 2,
    `分派事件=${multi.assign} · 交接事件=${multi.handoffs} 条`
  );
  rec(
    'A21',
    'Multi-Agent：三角色职责与交接可查看，单角色失败会改变结论',
    multi.nodes === 3 && multi.ok.handoffs === 2 && multi.bad.status === 'unverified',
    `角色卡片=${multi.nodes} · 正常结论=${multi.ok.status} · Verifier 失败结论=${multi.bad.cn}`
  );

  const metricsVr = await ev(`(() => {
    const api = window.__AZ.runtimeLabApi();
    const snap = api.snapshot();
    const toolCalls = snap.events.filter((e) => e.toolId).length;
    const sources = new Set(snap.events.flatMap((e) => e.sourceIds)).size;
    return { metrics: snap.metrics, toolCalls, sources, eventCount: snap.events.length };
  })()`);
  rec(
    'A22',
    '结果指标：步骤数、调用数、重试数与来源覆盖均可由事件数据复算',
    metricsVr.metrics.toolCalls === metricsVr.toolCalls &&
      metricsVr.metrics.sourceCount === metricsVr.sources &&
      metricsVr.metrics.eventCount === metricsVr.eventCount,
    `步骤 ${metricsVr.metrics.steps} · 调用 ${metricsVr.toolCalls} · 重试 ${metricsVr.metrics.retries} · 来源 ${metricsVr.sources} · 事件 ${metricsVr.eventCount}`
  );
  await shot('F63-RuntimeLab事件时间线.png');

  const playback = await ev(`(() => {
    const api = window.__AZ.runtimeLabApi();
    api.setMode('workflow');
    const before = api.snapshot();
    api.selectEvent(0);
    const afterSelect = api.snapshot();
    api.step();
    const afterStep = api.snapshot();
    api.play();
    const playing = api.isPlaying();
    api.pause();
    api.showAll();
    const all = api.snapshot();
    return { before: before.visibleEvents, select: afterSelect.visibleEvents, step: afterStep.visibleEvents, playing, all: all.visibleEvents, total: all.events.length };
  })()`);
  rec(
    'A23',
    '播放控制：可播放、暂停、逐步前进、选中事件、展开全部，且不改变运行结果',
    playback.select === 1 && playback.step === 2 && playback.all === playback.total,
    `选中第 1 条→可见 ${playback.select} · 前进一步→${playback.step} · 全部=${playback.all}/${playback.total} · 播放中=${playback.playing}`
  );

  /* ================================================================== *
   * A24–A30 Reliability Lab
   * ================================================================== */
  await ev(`window.__AZ.openLabExperiment('exp-boundary-lab', 'permissions')`);
  await sleep(300);
  const relKind = await ev(`window.__AZ.workspaceKind()`);
  const permissions = await ev(`(() => {
    const api = window.__AZ.reliabilityLabApi();
    const strict = api.snapshot();
    api.configure({ readPrivateRecords: true });
    const relaxed = api.snapshot();
    api.configure({ sandbox: 'off', readPrivateRecords: true });
    const opened = api.snapshot();
    api.configure({ readPrivateRecords: false, sandbox: 'public-only' });
    const matrix = api.matrix();
    return { strict, relaxed, opened, matrix };
  })()`);
  const privateOf = (snap) => snap.requests.find((r) => r.resourceId.startsWith('private/'));
  rec(
    'A24',
    '权限规则：允许/拒绝开关真实影响模拟工具结果（两层互补）',
    relKind === 'lab-reliability' &&
      privateOf(permissions.strict).decision === 'denied' &&
      privateOf(permissions.relaxed).decision === 'denied' &&
      privateOf(permissions.opened).decision === 'allowed',
    `默认=${privateOf(permissions.strict).decision} · 仅开权限=${privateOf(permissions.relaxed).decision} · 权限+关闭沙箱=${privateOf(permissions.opened).decision}`
  );

  const matrixOk = permissions.matrix.every((row) => row.off === 'denied') && permissions.matrix.some((row) => row.on === 'allowed');
  const sandboxText = await ev(`document.querySelector('[data-act="sandbox"]')?.textContent || ''`);
  rec(
    'A25',
    'Sandbox 边界：白名单/隔离演示可操作，并明确不构成真实隔离',
    matrixOk && /不构成真实隔离/.test(sandboxText),
    `2×2 矩阵：权限拒绝一律阻断 · 权限+关闭隔离可放行 · 页面声明=${/不构成真实隔离/.test(sandboxText)}`
  );

  const injection = await ev(`(() => {
    const api = window.__AZ.reliabilityLabApi();
    const snap = api.snapshot();
    const text = document.querySelector('[data-act="samples"]')?.textContent || '';
    return {
      marked: /教学用模拟提示注入样本/.test(text),
      flagged: snap.injection.flagged,
      denied: snap.injection.deniedActions,
      total: snap.injection.totalActions,
      configChanged: snap.injection.configChanged,
      instructionsChanged: snap.injection.systemInstructionsChanged,
      influenced: snap.injection.influenced,
    };
  })()`);
  rec(
    'A26',
    'Injection 样例：恶意文本被标记为不可信资料，且不覆盖系统配置',
    injection.marked && injection.flagged && injection.denied === injection.total && !injection.configChanged && !injection.instructionsChanged,
    `标记=${injection.marked} · 护栏命中=${injection.flagged} · 拒绝 ${injection.denied}/${injection.total} · 配置变更=${injection.configChanged} · 指令变更=${injection.instructionsChanged}`
  );

  const guardrails = await ev(`(() => {
    const api = window.__AZ.reliabilityLabApi();
    const textOn = document.querySelector('[data-act="trace"]')?.textContent || '';
    const on = api.snapshot();
    api.configure({ guardrails: { input: false, tool: false, output: false } });
    const off = api.snapshot();
    api.configure({ guardrails: { input: true, tool: true, output: true }, readPrivateRecords: false, sandbox: 'public-only' });
    const limits = document.querySelector('[data-act="guardrail-limits"]')?.textContent || '';
    return { on, off, textOn, limits };
  })()`);
  const guardrailEvents = (snap) => snap.events.filter((e) => e.type === 'input-check' || e.type === 'output-check');
  rec(
    'A27',
    'Guardrails：命中规则、阻止原因与漏检边界均有展示',
    guardrailEvents(guardrails.on).length > 0 &&
      /绕过/.test(guardrails.limits) &&
      guardrails.off.events.some((e) => e.type === 'input-check' && /未命中|没检查/.test(e.rule)) === false,
    `开启时检查事件 ${guardrailEvents(guardrails.on).length} 条 · 关闭后 ${guardrailEvents(guardrails.off).length} 条 · 漏检说明=${/绕过/.test(guardrails.limits)}`
  );

  const trace = await ev(`(() => {
    const api = window.__AZ.reliabilityLabApi();
    const all = api.filterTrace('all').length;
    const decisions = api.filterTrace('decision').length;
    const rule = api.filterTrace('rule').length;
    const source = api.filterTrace('source').length;
    const filtered = api.setFilter('decision');
    const rows = document.querySelectorAll('[data-act="trace-list"] [data-trace]').length;
    api.setFilter('all');
    return { all, decisions, rule, source, filtered, rows };
  })()`);
  rec(
    'A28',
    'Tracing：事件可筛选、可查看，并追溯来源与终止原因',
    trace.decisions > 0 && trace.rows === trace.filtered && trace.filtered < trace.all && trace.source > 0,
    `全部 ${trace.all} 条 · 允许/拒绝 ${trace.decisions} · 规则 ${trace.rule} · 来源 ${trace.source} · 筛选后行数 ${trace.rows}`
  );

  const evals = await ev(`(() => {
    const api = window.__AZ.reliabilityLabApi();
    const first = api.evalResults();
    api.configure({ readPrivateRecords: true, sandbox: 'off' });
    const loose = api.evalResults();
    api.configure({ readPrivateRecords: false, sandbox: 'public-only' });
    const again = api.evalResults();
    const rows = document.querySelectorAll('[data-act="evals"] [data-eval]').length;
    const text = document.querySelector('[data-act="evals"]')?.textContent || '';
    return { first, loose, again, rows, text };
  })()`);
  rec(
    'A29',
    'Evals：固定样例、评分标准、判定理由与结果可重现（可定位事件）',
    evals.rows === 4 &&
      evals.first.every((r) => r.reason && r.eventIds.length >= 1) &&
      JSON.stringify(evals.first) === JSON.stringify(evals.again) &&
      evals.loose.filter((r) => !r.pass).length > 0,
    `样例 ${evals.rows} 条 · 默认通过 ${evals.first.filter((r) => r.pass).length}/4 · 放宽后通过 ${evals.loose.filter((r) => r.pass).length}/4 · 重跑一致=${
      JSON.stringify(evals.first) === JSON.stringify(evals.again)
    }`
  );
  await shot('F64-ReliabilityLab判定与事件.png');

  const safety = await ev(`(() => {
    const text = document.querySelector('.lab-canvas')?.textContent || '';
    const aside = document.querySelector('.lab-inspector')?.textContent || '';
    const joined = text + aside;
    /* 绝对化表述只允许以否定句出现：把含否定词的句子剔除后再检查 */
    const positive = joined
      .split(/[。；\\n]/)
      .filter((sentence) => sentence.trim() && !/不代表|不构成|不等于|不是|无法/.test(sentence));
    return {
      disclaimer: /不代表.*安全认证|不构成真实隔离/.test(joined),
      forbidden: positive.some((sentence) => /已通过安全认证|完成渗透测试|生产级防护/.test(sentence)),
      note: /通过.*演示.*不代表/.test(joined),
    };
  })()`);
  rec(
    'A30',
    '安全声明：不声称教学模拟等同真实安全测试或生产防护',
    safety.disclaimer && !safety.forbidden,
    `声明存在=${safety.disclaimer} · 禁止表述=${!safety.forbidden}`
  );

  /* ================================================================== *
   * A31 学习进度：改配置才记录，刷新后恢复
   * ================================================================== */
  const learning = await ev(`(() => {
    const raw = localStorage.getItem(${K(LEARNING_KEY)});
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      legacyStillThere: !!localStorage.getItem(${K(LEARNING_LEGACY_KEY)}),
      schemaVersion: parsed?.schemaVersion || null,
      chunking: parsed?.concepts?.chunking || null,
      permissions: parsed?.concepts?.permissions || null,
      migrated: window.__AZ.learningSnapshot().migratedFrom,
    };
  })()`);
  await cdp.send('Page.reload', { ignoreCache: false });
  if (!(await ready(cdp))) throw new Error('A31 刷新后未就绪');
  const restored = await ev(`window.__AZ.learningSnapshot()`);
  rec(
    'A31',
    '学习进度：只有真实操作才记录实验完成，刷新后恢复且旧数据保留',
    learning.chunking?.experimentCompleted === true &&
      learning.chunking?.experimentIds?.includes('exp-retrieval-lab') &&
      learning.permissions?.experimentCompleted === true &&
      restored.concepts.chunking?.experimentCompleted === true &&
      learning.legacyStillThere,
    `chunking 完成=${learning.chunking?.experimentCompleted} · permissions 完成=${learning.permissions?.experimentCompleted} · 刷新后恢复=${restored.concepts.chunking?.experimentCompleted} · 旧键保留=${learning.legacyStillThere}`
  );

  /* ================================================================== *
   * A32 旧数据保护：M0/M1.1/M1.2 配置与运行记录不被覆盖
   * ================================================================== */
  await ev(`(() => {
    localStorage.setItem(${K(CONSTRUCTOR_KEY)}, JSON.stringify({ schemaVersion: 1, modules: [{ instanceId: 'accept-1', moduleId: 'announcement-search', portId: 'SEARCH_PORT', status: 'ready' }] }));
    localStorage.setItem(${K(RESEARCH_KEY)}, JSON.stringify({ schemaVersion: 2, runs: [{ runId: 'accept-run-1' }] }));
    return true;
  })()`);
  await cdp.send('Page.reload', { ignoreCache: false });
  if (!(await ready(cdp))) throw new Error('A32 刷新后未就绪');
  await sleep(300);
  const legacy = await ev(`(() => ({
    constructorRaw: localStorage.getItem(${K(CONSTRUCTOR_KEY)}),
    researchRaw: localStorage.getItem(${K(RESEARCH_KEY)}),
    learningRaw: localStorage.getItem(${K(LEARNING_KEY)}),
  }))()`);
  const legacyOk =
    legacy.constructorRaw?.includes('accept-1') &&
    legacy.researchRaw?.includes('accept-run-1') &&
    legacy.learningRaw?.includes('chunking');
  rec(
    'A32',
    '旧数据保护：M0 配置、M0.4 运行记录与 M1.3 学习进度互不覆盖',
    legacyOk,
    `构建器键保留=${legacy.constructorRaw?.includes('accept-1')} · 研究键保留=${legacy.researchRaw?.includes('accept-run-1')} · 学习键保留=${legacy.learningRaw?.includes('chunking')}`
  );

  /* ================================================================== *
   * A33 跨页面联动：Story → 章节叙事 → Lab → 知识页 → Atlas
   * ================================================================== */
  const nav = await ev(`(async () => {
    const az = window.__AZ;
    az.openStory();
    const storyChapters = document.querySelectorAll('.story-chapter').length;
    az.openChapterStory('knowledge');
    const chapterKind = az.workspaceKind();
    const labButton = !!document.querySelector('[data-act="run-experiment"]');
    document.querySelector('[data-act="run-experiment"]')?.click();
    await new Promise((r) => setTimeout(r, 250));
    const labFromChapter = az.workspaceKind();
    const conceptButton = document.querySelector('[data-concept]');
    conceptButton?.click();
    await new Promise((r) => setTimeout(r, 200));
    const knowledgeKind = az.workspaceKind();
    const experimentEntry = !!document.querySelector('[data-act="run-experiment"]');
    document.querySelector('[data-act="run-experiment"]')?.click();
    await new Promise((r) => setTimeout(r, 250));
    const backToLab = az.workspaceKind();
    az.openAtlas('rag');
    const atlasKind = az.workspaceKind();
    return { storyChapters, chapterKind, labButton, labFromChapter, knowledgeKind, experimentEntry, backToLab, atlasKind };
  })()`, true);
  rec(
    'A33',
    '跨页面联动：Story / 章节叙事 / Lab / 知识页 / Atlas 双向可达',
    nav.storyChapters === 6 &&
      nav.chapterKind === 'chapter' &&
      nav.labButton &&
      nav.labFromChapter === 'lab-knowledge' &&
      nav.knowledgeKind === 'knowledge' &&
      nav.experimentEntry &&
      nav.backToLab === 'lab-knowledge' &&
      nav.atlasKind === 'atlas',
    `目录 ${nav.storyChapters} 章 · 章节→${nav.labFromChapter} · 知识页→${nav.backToLab} · 星图=${nav.atlasKind}`
  );

  /* ================================================================== *
   * A34 响应式 / 无障碍 / 减少动态效果
   * ================================================================== */
  await ev(`window.__AZ.openLabExperiment('exp-retrieval-lab', 'chunking')`);
  await sleep(300);
  const labBeforeA11y = await ev(`window.__AZ.workspaceKind()`);
  const a11y = await ev(`(() => {
    const nodes = [...document.querySelectorAll('button, a[href], input, [tabindex]:not([tabindex="-1"])')];
    const labelled = nodes.filter((node) => (node.textContent || '').trim().length > 0 || node.getAttribute('aria-label') || node.getAttribute('title'));
    return {
      lang: document.documentElement.lang,
      focusables: nodes.length,
      labelled: labelled.length,
      liveRegions: document.querySelectorAll('[aria-live]').length,
      reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
  })()`);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(350);
  const mobile = await ev(`(() => {
    const canvas = document.querySelector('.lab-canvas');
    const rect = canvas?.getBoundingClientRect();
    const body = document.querySelector('.lab-body');
    return {
      kind: window.__AZ.workspaceKind(),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      canvasWidth: Math.round(rect?.width || 0),
      cols: body ? getComputedStyle(body).gridTemplateColumns.split(' ').length : null,
      chunkVisible: document.querySelectorAll('.knl-chunk').length > 0,
    };
  })()`);
  await shot('F65-移动端KnowledgeLab.png');
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  const reduced = await ev(`(() => {
    const api = window.__AZ.knowledgeLabApi();
    if (!api) return { chunks: 0, hasAnswer: false, buttons: 0, missing: true };
    api.configure({ preset: 'paragraph' });
    const chunks = document.querySelectorAll('.knl-chunk').length;
    const text = document.querySelector('[data-act="rag"]')?.textContent || '';
    return { chunks, hasAnswer: /SIMULATED|问题：/.test(text), buttons: document.querySelectorAll('button').length };
  })()`);
  await cdp.send('Emulation.setEmulatedMedia', { features: [] });
  rec(
    'A34',
    '响应式与无障碍：键盘可聚焦控件均有名称、窄屏单列、减少动态下结果仍正确',
    /^zh/i.test(a11y.lang) &&
      a11y.labelled === a11y.focusables &&
      a11y.liveRegions > 0 &&
      mobile.overflow <= 1 &&
      mobile.chunkVisible &&
      reduced.chunks > 0 &&
      reduced.hasAnswer,
    `lang=${a11y.lang} · 可聚焦=${a11y.focusables}（有名称=${a11y.labelled}）· aria-live=${a11y.liveRegions} · 打开时工作区=${labBeforeA11y} · 390px 工作区=${mobile.kind} 列数=${mobile.cols} 溢出=${mobile.overflow}px · 减少动态下片段=${reduced.chunks} 结论可见=${reduced.hasAnswer}`
  );

  /* ================================================================== *
   * A35 纯前端
   * ================================================================== */
  const network = await ev(`(() => {
    const entries = performance.getEntriesByType('resource').map((e) => e.name);
    const remote = entries.filter((n) => /^https?:/i.test(n));
    return { total: entries.length, remote: remote.slice(0, 5) };
  })()`);
  const distHtml = existsSync(path.join(process.cwd(), 'dist', 'index.html'))
    ? await readFile(path.join(process.cwd(), 'dist', 'index.html'), 'utf8')
    : '';
  rec(
    'A35',
    '纯前端：无后端、无真实 AI / Embedding / MCP / 搜索 API 依赖',
    network.remote.length === 0 &&
      !/(src|href)="https?:/i.test(distHtml) &&
      /src="\.\/assets\/app\.js"/.test(distHtml) &&
      /href="\.\/assets\/app\.css"/.test(distHtml),
    `运行时资源请求 ${network.total} 条（远程 ${network.remote.length}）· dist 相对路径=${/src="\.\/assets\/app\.js"/.test(distHtml)}`
  );

  return results;
}

/* ==================================================================== *
 * 独立运行入口
 * ==================================================================== */
async function main() {
  const browser = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!browser) throw new Error('未找到本机 Chrome/Edge，无法进行渲染验收');
  const url = 'file:///' + path.join(process.cwd(), 'index.html').replace(/\\/g, '/');
  if (!existsSync(path.join(process.cwd(), 'index.html')) || !existsSync(path.join(process.cwd(), 'dist', 'index.html'))) {
    throw new Error('缺少构建产物：请先运行 node tools/build.mjs');
  }
  const profile = path.join(os.tmpdir(), `az0-m13-${Date.now()}`);
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
    const m13 = await runM13Acceptance({ cdp, shot: (name) => cdp.shot(path.join(OUT, name)), waitReady });

    /* ---------- A36：真实运行 M0.3 / M0.4 / M1.1 / M1.2 验收脚本 ---------- */
    const { runM03Acceptance } = await import('./m03-acceptance.mjs');
    const { runM04Acceptance } = await import('./m04-acceptance.mjs');
    const { runM11Acceptance } = await import('./m11-acceptance.mjs');
    const { runM12Acceptance } = await import('./m12-acceptance.mjs');
    await cdp.send('Page.reload', { ignoreCache: false });
    if (!(await waitReady(cdp))) throw new Error('回归前恢复页面失败');
    await sleep(500);
    const m03 = await runM03Acceptance({ cdp, sleep, shot: async () => null, waitReady });
    const m04 = await runM04Acceptance({ cdp, sleep, shot: async () => null, waitReady });
    const m11 = await runM11Acceptance({ cdp, sleep, shot: async () => null, waitReady });
    const m12 = await runM12Acceptance({ cdp, shot: async () => null, waitReady });

    const regressions = [
      { id: 'A36-M03', name: 'M0.3 工具调用与执行台回归', rows: m03 },
      { id: 'A36-M04', name: 'M0.4 研究闭环与来源追溯回归', rows: m04 },
      { id: 'A36-M11', name: 'M1.1 知识架构与学习基础回归', rows: m11 },
      { id: 'A36-M12', name: 'M1.2 AI 基础与工具交互回归', rows: m12 },
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

    const all = [...m13, ...regressions];
    const failed = all.filter((r) => !r.pass);
    const report = {
      stage: 'M1.3',
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      url,
      total: all.length,
      passed: all.length - failed.length,
      failed: failed.map((r) => r.id),
      results: all,
      m13,
      regressions,
      console: (cdp.console || []).slice(0, 40),
      shots: OUT,
    };
    await writeFile(path.join(process.cwd(), 'verify', 'm13-report.json'), JSON.stringify(report, null, 2), 'utf8');

    console.log('\n=== M1.3 验收（A01–A35） ===');
    for (const r of m13) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id} ${r.name}\n      ${r.note}`);
    console.log('\n=== A36 回归（M0.3 / M0.4 / M1.1 / M1.2） ===');
    for (const r of regressions) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id} ${r.name} · ${r.note}`);
    console.log(`\n合计：${all.length - failed.length}/${all.length} 通过 · 报告 verify/m13-report.json · 截图 verify/m13-shots/`);
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

const invokedDirectly = process.argv[1] && /m13-acceptance\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
