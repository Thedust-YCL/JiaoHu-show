/**
 * tools/m04-acceptance.mjs
 * ------------------------------------------------------------------
 * M0.4「研究闭环与来源追溯」浏览器验收（A31–A70）+ 高保真验收帧 F23–F30。
 *
 * 纪律（与 M0.3 一致）：
 *   · 全部通过真实 DOM 与真实 store 驱动，走的是与界面按钮完全相同的入口；
 *   · 每一项都给出**证据来源**，不允许用「理论上满足」代替运行结果；
 *   · 无法自动断言的项（真实 GPU 观感、真机帧率、真实浏览器下载对话框）
 *     如实标注，并说明阻断原因。
 * ------------------------------------------------------------------
 */

const CONSTRUCTOR_KEY = 'agent-zero:constructor:v1';
const EXECUTION_KEY = 'agent-zero:execution:v1';
const LEARNING_KEY = 'agent-zero:learning:v2';
const RESEARCH_KEY = 'agent-zero:research:v2';

/** 页面侧安装的公共驱动助手：与界面按钮同一套动作 */
const PAGE_HELPERS = `(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__M04 = {
    sleep,
    async assemble({ searchScope = 'all_notices', maxResults = 5, readMode = 'full_text', includeMetadata = true, enableSearch = true, enableReader = true } = {}) {
      const az = window.__AZ;
      az.closeWorkspace();
      await sleep(120);
      az.resetConstructor();
      await sleep(180);
      az.previewModule('announcement_search');
      await sleep(70);
      az.confirmAssembly();
      await sleep(170);
      az.previewModule('document_reader');
      await sleep(70);
      az.confirmAssembly();
      await sleep(170);
      az.configureModule('announcement_search', { readPermission: true, searchScope, maxResults });
      await sleep(90);
      az.configureModule('document_reader', { readPermission: true, readMode, includeMetadata });
      await sleep(140);
      if (!enableSearch) { az.toggleModule('announcement_search', false); await sleep(120); }
      if (!enableReader) { az.toggleModule('document_reader', false); await sleep(120); }
      return az.constructorSnapshot();
    },
    async run({ policy = 'VERIFY_REVISIONS', fault = 'normal', fresh = false } = {}) {
      const az = window.__AZ;
      let api = az.executionApi();
      if (!api) { az.openExecution(); await sleep(320); api = az.executionApi(); }
      api.setEvidencePolicy(policy);
      api.setFaultMode(fault);
      api.newRun();
      await sleep(420);
      return api;
    },
    events(run) {
      return run.events.map((e) => ({ id: e.id, type: e.type, status: e.status, phase: e.phase, ruleId: e.ruleId, branchId: e.branchId, sourceIds: e.sourceIds, chunkIds: e.chunkIds, claimIds: e.claimIds, message: e.message }));
    },
  };
  return true;
})()`;

const rec = (out, id, name, pass, note) => out.push({ id, name, pass, note });

export async function runM04Acceptance({ cdp, sleep, shot, waitReady }) {
  const results = [];
  const push = (rows) => {
    if (Array.isArray(rows)) results.push(...rows);
  };
  const evaluate = async (code, awaitPromise = true) => cdp.eval(code, awaitPromise);

  /* ================================================================== *
   * 起始条件：清空四个业务命名空间（保留 M0.1 偏好）
   * ================================================================== */
  await evaluate(`(() => {
    localStorage.removeItem(${JSON.stringify(CONSTRUCTOR_KEY)});
    localStorage.removeItem(${JSON.stringify(EXECUTION_KEY)});
    localStorage.removeItem(${JSON.stringify(LEARNING_KEY)});
    localStorage.removeItem(${JSON.stringify(RESEARCH_KEY)});
    return true;
  })()`);
  await cdp.send('Page.reload', { ignoreCache: false });
  if (!(await waitReady(cdp))) throw new Error('M0.4 验收：重新加载后 __AZ 未就绪');
  await evaluate(`window.__AZ.skipIntro('M0.4 验收')`);
  await evaluate(PAGE_HELPERS);
  await sleep(700);

  /* ================================================================== *
   * A31–A34 研究包：版本、ID、更正对、不可消解冲突、旧 ID 兼容
   * ================================================================== */
  push(
    await evaluate(`(() => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const pack = az.mission001;
      const notices = pack.notices;
      const ids = notices.map((n) => n.sourceId);
      const chunkIds = notices.flatMap((n) => (n.chunks || []).map((c) => c.chunkId));
      const uniqueIds = new Set(ids).size === ids.length;
      const uniqueChunks = new Set(chunkIds).size === chunkIds.length;
      const allFictional = notices.every((n) => n.isFictional === true);
      const checked = az.validateMissionPack(notices);
      const withClaims = notices.filter((n) => Array.isArray(n.claims) && n.claims.length > 0).length;
      const mini = az.mission001Mini.notices;
      /* 逐字比对：原文（summary / body）不得改动；M0.3 的每个 chunkId 必须仍然存在 */
      const miniSame = mini.every((m) => {
        const n = notices.find((x) => x.sourceId === m.sourceId);
        if (!n) return false;
        const chunkSet = new Set((n.chunks || []).map((c) => c.chunkId));
        return n.summary === m.summary && JSON.stringify(n.body) === JSON.stringify(m.body) && m.chunkIds.every((cid) => chunkSet.has(cid));
      });
      rec('A31', '数据集版本与稳定 ID：资料/片段 ID 唯一，虚构标识完整，数据校验通过',
        ids.length >= 8 && uniqueIds && uniqueChunks && allFictional && checked.ok && withClaims === notices.length,
        '资料=' + ids.length + ' · 片段=' + chunkIds.length + ' · 校验问题=' + JSON.stringify(checked.problems.slice(0, 2)) + ' · 虚构标记=' + allFictional);
      rec('A34', '保持 M0.3 的 sourceId/chunkId 与工具 schema 不变',
        miniSame && az.simulationToolIds.length === 2 && az.simulationToolIds.join(',') === 'announcement_search,document_reader',
        'mini 资料逐字保留=' + miniSame + ' · 可装配工具=' + az.simulationToolIds.join(','));

      const older = notices.find((n) => n.sourceId === 'NTC-1006');
      const newer = notices.find((n) => n.sourceId === 'NTC-1007');
      const revision = !!older && !!newer && older.eventKey === newer.eventKey
        && older.eventDate === '2026-10-18' && newer.eventDate === '2026-10-20'
        && Array.isArray(newer.supersedes) && newer.supersedes.includes('NTC-1006')
        && newer.publishedAt > older.publishedAt
        && /予以更正/.test(newer.body.join(''));
      rec('A32', '更正对 10/18 → 10/20：同一事项、明确更正关系、发布时间更晚',
        revision,
        'eventKey=' + (older && newer ? older.eventKey : '—') + ' · ' + (older && older.eventDate) + ' → ' + (newer && newer.eventDate) + ' · supersedes=' + JSON.stringify(newer && newer.supersedes));

      const c1 = notices.find((n) => n.sourceId === 'NTC-1008');
      const c2 = notices.find((n) => n.sourceId === 'NTC-1009');
      const unresolvedPair = !!c1 && !!c2 && c1.eventKey === c2.eventKey
        && c1.eventDate !== c2.eventDate
        && (c1.supersedes || []).length === 0 && (c2.supersedes || []).length === 0;
      rec('A33', '不可消解冲突：同事项两个不同取值，且没有可核实的 supersedes 关系',
        unresolvedPair,
        'eventKey=' + (c1 && c1.eventKey) + ' · ' + (c1 && c1.eventDate) + ' / ' + (c2 && c2.eventDate) + ' · supersedes 均为空');
      return out;
    })()`)
  );

  /* ================================================================== *
   * A35–A37 / A47 / A41 Golden Path：检索过滤、读取模式、元数据、只含旧公告
   * ================================================================== */
  const golden = await evaluate(`(async () => {
    const az = window.__AZ;
    const out = [];
    const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
    await __M04.assemble({ searchScope: 'all_notices', maxResults: 5, readMode: 'full_text', includeMetadata: true });
    const api = await __M04.run({ policy: 'VERIFY_REVISIONS' });
    const run = api.currentRun();
    const searchEvent = run.events.find((e) => e.type === 'tool.result' && e.toolId === 'announcement_search');
    const readResults = run.events.filter((e) => e.type === 'tool.result' && e.toolId === 'document_reader');
    const readIds = readResults.flatMap((e) => e.sourceIds);
    const returned = searchEvent ? searchEvent.sourceIds : [];

    rec('A35', 'searchScope / maxResults 决定实际可见来源，不越权补资料',
      returned.length === 5 && readIds.every((id) => returned.includes(id)) && readIds.length === returned.length,
      '检索返回=' + returned.length + ' 条 → 读取=' + readIds.length + ' 份 · 读到未返回资料=' + readIds.filter((id) => !returned.includes(id)).length);

    const payloads = Object.values(run.artifacts.payloads).filter((p) => p && p.kind === 'read.response');
    rec('A36', 'readMode=full_text 才返回正文片段；摘要模式不能冒充全文',
      payloads.length === 5 && payloads.every((p) => p.textScope === 'full_text' && Array.isArray(p.chunks) && p.chunks.every((c) => c.kind === 'body')),
      '读取响应=' + payloads.length + ' · 全部 textScope=full_text · 片段均为正文片段');

    const metaClaims = (run.artifacts.evidence.claims || []).filter((c) => c.fromMetadata);
    const hasPublication = metaClaims.some((c) => c.predicate === 'published_at') && metaClaims.some((c) => c.predicate === 'publisher_id');
    rec('A37', 'includeMetadata=true 时发布主体 / 发布时间由工具真实返回',
      hasPublication,
      '元数据声明=' + metaClaims.length + ' 条 · 含 published_at=' + metaClaims.some((c) => c.predicate === 'published_at'));

    const confirmed = run.events.filter((e) => e.type === 'evidence.revision_confirmed');
    const conflict = run.events.filter((e) => e.type === 'evidence.conflict_detected');
    rec('A40', '可见冲突被识别为独立事件，且引用了正确的资料与声明',
      conflict.length === 2 && conflict.every((e) => e.sourceIds.length === 2 && e.claimIds.length >= 2),
      '冲突事件=' + conflict.length + ' · 首个冲突 sourceIds=' + JSON.stringify(conflict[0] && conflict[0].sourceIds));

    const confirmedEvent = confirmed[0];
    const resolution = (run.artifacts.evidence.resolutions || []).find((r) => r.status === 'revision_confirmed');
    rec('A41', 'VERIFY 且条件充分时标注更正成立，旧信息保留可追踪',
      confirmed.length === 1 && !!resolution && resolution.oldSourceId === 'NTC-1006' && resolution.newSourceId === 'NTC-1007'
        && run.artifacts.evidence.sourceIds.includes('NTC-1006') && run.artifacts.evidence.sourceIds.includes('NTC-1007'),
      '规则=' + (confirmedEvent && confirmedEvent.ruleId) + ' · ' + (resolution && resolution.oldSourceId) + ' → ' + (resolution && resolution.newSourceId) + ' · 旧资料仍在证据集中');

    const reqs = (confirmedEvent && confirmedEvent.outputRef) ? run.artifacts.payloads[confirmedEvent.outputRef].requirements : [];
    rec('D06', '决策可解释：显示必要条件、使用资料与规则依据',
      reqs.length >= 6 && reqs.every((r) => r.pass === true) && !!confirmedEvent.ruleId,
      '必要条件=' + reqs.length + ' 条全部通过 · ruleId=' + (confirmedEvent && confirmedEvent.ruleId));
    return { out, runId: run.runId, events: run.events.length, outcome: run.outcome, reportStatus: run.artifacts.report.status };
  })()`);
  push(golden.out);
  await sleep(500);
  await shot('F25-更正链核验成立.png');

  /* ================================================================== *
   * F23 / F24：启动界面与冲突显现（执行视图 + 冲突事件）
   * ================================================================== */
  await evaluate(`(async () => {
    const az = window.__AZ;
    const api = az.executionApi();
    api.setRunView('execution');
    const idx = api.currentRun().events.findIndex((e) => e.type === 'evidence.conflict_detected');
    api.seek(idx);
    await __M04.sleep(300);
    return true;
  })()`);
  await sleep(400);
  await shot('F24-两份公告冲突显现.png');
  await evaluate(`(async () => {
    const api = window.__AZ.executionApi();
    const idx = api.currentRun().events.findIndex((e) => e.type === 'evidence.revision_confirmed');
    api.seek(idx);
    await __M04.sleep(250);
    return true;
  })()`);
  await sleep(300);
  await shot('F23-MISSION001启动界面.png');

  /* ================================================================== *
   * A39 / A42 / A43 / A56：claim 来源、无法核验、COLLECT_ONLY、未决报告
   * ================================================================== */
  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.executionApi();
      const run = api.currentRun();
      const events = run.events;
      const claims = run.artifacts.evidence.claims || [];
      const facts = claims.filter((c) => !c.fromMetadata);
      const anchorOk = facts.every((c) => !!c.sourceId && !!c.chunkId && !!c.eventId && events.some((e) => e.id === c.eventId));
      rec('A39', '每条事实声明都有本次 Run 真正可见的 sourceId / chunkId / eventId',
        facts.length > 0 && anchorOk,
        '文本级声明=' + facts.length + ' 条 · 全部可追溯到事件=' + anchorOk);

      /* ---- A42：campus_events 范围只看到旧公告 → 更正无法核验 ---- */
      await __M04.assemble({ searchScope: 'campus_events', maxResults: 5, readMode: 'full_text', includeMetadata: true });
      const api2 = await __M04.run({ policy: 'VERIFY_REVISIONS' });
      const run2 = api2.currentRun();
      const returned2 = run2.events.find((e) => e.type === 'tool.result' && e.toolId === 'announcement_search').sourceIds;
      const confirmed2 = run2.events.filter((e) => e.type === 'evidence.revision_confirmed');
      const campusHasCorrection = returned2.includes('NTC-1007');
      const claimDates = (run2.artifacts.evidence.claims || []).filter((c) => c.predicate === 'event_date' && c.subject === 'evt-open-campus');
      const onlyOld = claimDates.length === 1 && claimDates[0].value === '2026-10-18';
      rec('A47', 'maxResults / searchScope 只含旧公告时，不利用隐藏的新公告宣布更正成立',
        !campusHasCorrection && confirmed2.length === 0 && onlyOld,
        'campus_events 可见=' + JSON.stringify(returned2) + ' · 更正事件=' + confirmed2.length + ' · 开放日可见取值=' + JSON.stringify(claimDates.map((c) => c.value)));

      const unresolved = run2.events.find((e) => e.type === 'evidence.conflict_unresolved');
      const unresolvedRes = (run2.artifacts.evidence.resolutions || []).find((r) => r.status === 'unresolved');
      rec('A42', '缺关系 / 缺正文时保持 unresolved 并解释缺什么',
        !!unresolved && !!unresolvedRes && unresolvedRes.missing.length > 0,
        '缺失原因=' + JSON.stringify(unresolvedRes && unresolvedRes.missing.map((m) => m.code)));

      /* ---- A43 / A56：COLLECT_ONLY ---- */
      await __M04.assemble({ searchScope: 'all_notices', maxResults: 5, readMode: 'full_text', includeMetadata: true });
      const api3 = await __M04.run({ policy: 'COLLECT_ONLY' });
      const run3 = api3.currentRun();
      const skipped = run3.events.filter((e) => e.type === 'evidence.verification_skipped');
      const confirmed3 = run3.events.filter((e) => e.type === 'evidence.revision_confirmed');
      const report3 = run3.artifacts.report;
      const hasSkippedClaim = report3.claims.some((c) => /尚未进行更正关系核验|COLLECT_ONLY/.test(c.text) && c.status === 'unresolved');
      rec('A43', 'COLLECT_ONLY：相同来源出现冲突但无 revision_confirmed，报告保留未核验状态',
        skipped.length === 2 && confirmed3.length === 0 && hasSkippedClaim && report3.status === 'partial',
        '跳过事件=' + skipped.length + ' · 更正成立=' + confirmed3.length + ' · 报告状态=' + report3.status);
      rec('A56', '未决报告：不把冲突伪装成核验通过',
        report3.claims.some((c) => c.status === 'unresolved') && report3.metrics.conflictsResolved === 0,
        '未决陈述=' + report3.claims.filter((c) => c.status !== 'supported').length + ' · conflictsResolved=' + report3.metrics.conflictsResolved);
      return out;
    })()`, true)
  );

  /* F26：未决冲突状态（COLLECT_ONLY 的同一份资料，双来源保留、没有绿光成功） */
  await evaluate(`(async () => {
    const api = window.__AZ.executionApi();
    api.setRunView('report');
    await __M04.sleep(400);
    const first = document.querySelector('.rp-claim[data-status="unresolved"] .rp-cite');
    if (first) first.click();
    await __M04.sleep(250);
    return true;
  })()`);
  await sleep(450);
  await shot('F26-未决冲突状态.png');

  /* ================================================================== *
   * A44–A46 / A45 工具不可用与故障分支
   * ================================================================== */
  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });

      await __M04.assemble({ enableSearch: false });
      const api1 = await __M04.run({ policy: 'VERIFY_REVISIONS' });
      const run1 = api1.currentRun();
      const successfulSearch1 = run1.events.filter((e) => e.type === 'tool.result' && e.toolId === 'announcement_search');
      const report1 = run1.artifacts.report;
      rec('A44', 'Search 不可用：没有成功检索或正文事实，报告为阻断说明',
        run1.branchId === 'B02_NO_SEARCH' && successfulSearch1.length === 0 && report1.status === 'blocked'
          && !report1.claims.some((c) => c.citationIds.length > 0),
        '分支=' + run1.branchId + ' · 成功检索=' + successfulSearch1.length + ' · 报告=' + report1.status + ' · 引用=' + report1.citations.length);

      await __M04.assemble({ enableReader: false, searchScope: 'all_notices', maxResults: 5 });
      const api2 = await __M04.run({ policy: 'VERIFY_REVISIONS' });
      const run2 = api2.currentRun();
      const readerSuccess = run2.events.filter((e) => e.type === 'tool.result' && e.toolId === 'document_reader');
      const confirmed2 = run2.events.filter((e) => e.type === 'evidence.revision_confirmed');
      const report2 = run2.artifacts.report;
      rec('A45', 'Reader 不可用：保留检索摘要级线索，不出现已读正文或核验成功',
        run2.branchId === 'B03_NO_READER' && readerSuccess.length === 0 && confirmed2.length === 0
          && report2.citations.length > 0 && report2.citations.every((c) => c.textScope === 'search_excerpt'),
        '分支=' + run2.branchId + ' · 读取成功=' + readerSuccess.length + ' · 更正成立=' + confirmed2.length + ' · 引用级别=' + [...new Set(report2.citations.map((c) => c.textScope))].join(','));

      await __M04.assemble({});
      const api3 = await __M04.run({ policy: 'VERIFY_REVISIONS', fault: 'search_timeout' });
      const run3 = api3.currentRun();
      const err = run3.events.filter((e) => e.type === 'tool.error');
      rec('A46', 'faultMode=search_timeout：确定性错误分支，无假检索成功，报告说明受限',
        run3.branchId === 'B04_SEARCH_TIMEOUT' && err.length === 1 && run3.artifacts.report.status === 'blocked',
        '分支=' + run3.branchId + ' · 错误事件=' + err.length + ' · 报告=' + run3.artifacts.report.status);
      return out;
    })()`, true)
  );

  /* ================================================================== *
   * A38 非法资料：重复 / 循环 supersedes / 非法日期
   * ================================================================== */
  push(
    await evaluate(`(() => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const base = az.mission001.notices;
      const dup = az.validateMissionPack([...base, base[0]]);
      const badDate = az.validateMissionPack(base.map((n, i) => (i === 0 ? { ...n, publishedAt: '2026-02-31' } : n)));
      const cycleDocs = [
        { ...base[0], sourceId: 'CYC-001', supersedes: ['CYC-002'], eventKey: 'evt-cyc', publishedAt: '2026-10-01' },
        { ...base[0], sourceId: 'CYC-002', supersedes: ['CYC-001'], eventKey: 'evt-cyc', publishedAt: '2026-10-05' },
      ];
      const cycle = az.validateMissionPack([...base, ...cycleDocs]);
      const codes = new Set([...dup.problems, ...badDate.problems, ...cycle.problems].map((p) => p.code));
      const prepared = az.prepareCorpus([...base, { sourceId: 'NTC-1006', summary: '重复 ID', body: ['x'], publishedAt: '2026-10-12' }, { sourceId: 'BAD-1', summary: '', body: [], publishedAt: 'nope' }]);
      rec('A38', '重复资料 / 非法日期 / 循环 supersedes 被校验发现，坏资料不进入语料',
        codes.has('DUPLICATE_SOURCE_ID') && codes.has('INVALID_DATE') && codes.has('SUPERSEDES_CYCLE')
          && prepared.notices.length === base.length && prepared.dropped.length === 2,
        '发现的问题码=' + [...codes].join(',') + ' · 剔除=' + prepared.dropped.length + ' 条');
      return out;
    })()`)
  );

  /* ================================================================== *
   * A49 / A50 确定性与快照隔离
   * ================================================================== */
  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      await __M04.assemble({ searchScope: 'all_notices', maxResults: 5, readMode: 'full_text', includeMetadata: true });
      const api = await __M04.run({ policy: 'VERIFY_REVISIONS' });
      const a = api.currentRun();
      const canonA = JSON.stringify(a);
      const apiAgain = await __M04.run({ policy: 'VERIFY_REVISIONS' });
      const b = apiAgain.currentRun();
      rec('A49', '固定输入可复现：同配置 + 同策略 + 同故障条件 → 同 runId 与同一份事件 / 报告',
        a.runId === b.runId && JSON.stringify(b) === canonA,
        'runId=' + a.runId + ' / ' + b.runId + ' · 完全一致=' + (JSON.stringify(b) === canonA));

      az.configureModule('document_reader', { readMode: 'summary', includeMetadata: false });
      await __M04.sleep(160);
      const untouched = JSON.stringify(api.currentRun()) === canonA;
      const apiNew = await __M04.run({ policy: 'VERIFY_REVISIONS' });
      const c = apiNew.currentRun();
      rec('A50', '快照隔离：修改当前配置后旧 Run 的事件与报告内容不改变；新 Run 才使用新配置',
        untouched && c.runId !== a.runId && c.artifacts.report.metrics.fullTextReads === 0,
        '旧 Run 未被改写=' + untouched + ' · 新 runId 不同=' + (c.runId !== a.runId) + ' · 新 Run 读全文数=' + c.artifacts.report.metrics.fullTextReads);
      rec('A48', '研究策略是本次 Run 的本地规则选项，不是第三个可装配工具',
        az.simulationToolIds.length === 2 && a.options.evidencePolicy === 'VERIFY_REVISIONS'
          && a.configSnapshot.modules.every((m) => ['announcement_search', 'document_reader'].includes(m.moduleId)),
        '装配模块=' + a.configSnapshot.modules.map((m) => m.moduleId).join(',') + ' · RunOptions=' + JSON.stringify(a.options));
      return out;
    })()`, true)
  );

  /* ================================================================== *
   * A36 / A37 负向：summary + includeMetadata=false
   * ================================================================== */
  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      await __M04.assemble({ searchScope: 'all_notices', maxResults: 5, readMode: 'summary', includeMetadata: true });
      const api = await __M04.run({ policy: 'VERIFY_REVISIONS' });
      const run = api.currentRun();
      const reads = Object.values(run.artifacts.payloads).filter((p) => p && p.kind === 'read.response');
      const confirmed = run.events.filter((e) => e.type === 'evidence.revision_confirmed');
      const insufficient = run.events.filter((e) => e.type === 'evidence.insufficient_detail');
      rec('A36', 'summary 模式不能冒充全文：没有正文片段，也没有「已读全文」结论',
        reads.every((p) => p.textScope === 'summary' && p.content === null && p.chunks.every((c) => c.kind === 'summary'))
          && confirmed.length === 0 && insufficient.length >= 1,
        '读取响应 textScope=' + [...new Set(reads.map((p) => p.textScope))].join(',') + ' · 更正成立=' + confirmed.length + ' · 证据不足事件=' + insufficient.length);

      await __M04.assemble({ searchScope: 'all_notices', maxResults: 5, readMode: 'full_text', includeMetadata: false });
      const api2 = await __M04.run({ policy: 'VERIFY_REVISIONS' });
      const run2 = api2.currentRun();
      const payloads = Object.values(run2.artifacts.payloads).filter((p) => p && p.kind === 'read.response');
      const metaClaims = (run2.artifacts.evidence.claims || []).filter((c) => c.fromMetadata);
      const metaMissing = run2.events.filter((e) => e.type === 'evidence.metadata_missing');
      const confirmed2 = run2.events.filter((e) => e.type === 'evidence.revision_confirmed');
      rec('A37', 'includeMetadata=false：核验无法偷偷使用被关闭的发布主体 / 时间 / 更正关系',
        payloads.every((p) => p.metadata === null) && metaClaims.length === 0 && metaMissing.length >= 1
          && confirmed2.length === 0 && !/publisher|publishedAt/.test(JSON.stringify(payloads)),
        '元数据声明=' + metaClaims.length + ' · metadata_missing 事件=' + metaMissing.length + ' · 更正成立=' + confirmed2.length);
      return out;
    })()`, true)
  );

  /* ================================================================== *
   * A53–A55 / A57 / A58 / A62 报告与引用
   * ================================================================== */
  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      await __M04.assemble({ searchScope: 'all_notices', maxResults: 5, readMode: 'full_text', includeMetadata: true });
      const api = await __M04.run({ policy: 'VERIFY_REVISIONS' });
      const run = api.currentRun();
      const report = run.artifacts.report;
      const titles = report.sections.map((s) => s.id + '·' + s.title);
      rec('A53', '六部分报告：范围 / 发现 / 概念方案比较 / 引用 / 局限 / 建议完整',
        report.sections.length >= 6 && ['R1','R2','R3','R4','R5','R6'].every((id) => report.sections.some((s) => s.id === id))
          && report.limitations.length >= 3 && report.recommendations.length >= 2,
        titles.join(' | ') + ' · 局限=' + report.limitations.length + ' · 建议=' + report.recommendations.length);

      const agentOnly = report.recommendations.some((r) => /Agent 一定|只有 Agent|唯一正确/.test(r.text));
      const hasRuleAutomation = report.recommendations.some((r) => /规则自动化/.test(r.text));
      const comparison = report.comparison.map((c) => c.name);
      rec('A54', '条件性建议：不把 Agent 定为唯一正确方案，明确规则自动化的适用条件',
        !agentOnly && hasRuleAutomation && comparison.length === 3 && report.comparison.some((c) => c.cardId === 'card-rule-automation' && c.fitsWhen.length > 0),
        '方案卡=' + comparison.join(',') + ' · 提到规则自动化=' + hasRuleAutomation);

      const dateClaims = report.claims.filter((c) => /2026 年 10 月 (18|20) 日/.test(c.text));
      const citesOld = dateClaims.some((c) => /10 月 18 日/.test(c.text) && c.citationIds.some((id) => (report.citations.find((x) => x.id === id) || {}).sourceId === 'NTC-1006'));
      const citesNew = dateClaims.some((c) => /10 月 20 日/.test(c.text) && c.citationIds.some((id) => (report.citations.find((x) => x.id === id) || {}).sourceId === 'NTC-1007'));
      rec('A55', '更正报告同时保留 10/18 旧事实与 10/20 更正结论的引用',
        citesOld && citesNew,
        '旧事实引用 NTC-1006=' + citesOld + ' · 更正引用 NTC-1007=' + citesNew + ' · 相关陈述=' + dateClaims.length);

      const eventIds = new Set(run.events.map((e) => e.id));
      const chunkIds = new Set(run.events.flatMap((e) => e.chunkIds));
      const bad = report.citations.filter((c) => !eventIds.has(c.eventId) || !c.sourceId || !c.chunkId);
      const claimCiteOk = report.claims.every((c) => (c.citationIds || []).every((id) => report.citations.some((x) => x.id === id)));
      rec('A57', '引用完整性：每条引用都能解析到本次 Run 的 sourceId / chunkId / eventId',
        report.citations.length > 0 && bad.length === 0 && claimCiteOk,
        '引用=' + report.citations.length + ' 条 · 无法解析=' + bad.length + ' · 陈述引用均存在=' + claimCiteOk);

      const reads = Object.values(run.artifacts.payloads).filter((p) => p && p.kind === 'read.response');
      const excerptOk = report.citations.every((c) => {
        const read = reads.find((p) => p.sourceId === c.sourceId);
        if (!read) return false;
        const chunk = (read.chunks || []).find((x) => x.chunkId === c.chunkId);
        if (!chunk) return false;
        return chunk.text.startsWith(c.excerpt.replace(/…$/, '').slice(0, 60));
      });
      rec('A58', '引用文本范围：查看的就是本次真正拿到的片段，不暗中用完整资料代替',
        excerptOk,
        '引用片段与本次读取响应逐条比对=' + excerptOk);

      const m = report.metrics;
      const readResults = run.events.filter((e) => e.type === 'tool.result' && e.toolId === 'document_reader').length;
      api.setRunView('report');
      await __M04.sleep(320);
      const uiMetrics = api.reportMetrics();
      const panelText = (document.getElementById('rp-METRICS') || {}).textContent || '';
      const panelOk = panelText.includes('全文 ' + m.fullTextReads) && panelText.includes(String(run.events.length));
      rec('A62', '指标准确：已读全文数 / 支持事实数 / 冲突数 / 工具调用与错误来自真实运行',
        m.sourcesRead === readResults && m.fullTextReads === readResults
          && m.conflictsDetected === (run.artifacts.evidence.conflicts || []).length
          && uiMetrics.toolCalls === run.stats.toolCalls && uiMetrics.toolErrors === run.stats.toolErrors
          && uiMetrics.eventCount === run.events.length && panelOk,
        '读取=' + m.sourcesRead + '/' + readResults + ' · 全文=' + m.fullTextReads + ' · 冲突=' + m.conflictsDetected + ' · 调用=' + uiMetrics.toolCalls + '/' + run.stats.toolCalls + ' · 事件=' + uiMetrics.eventCount + ' · 面板一致=' + panelOk);
      api.setRunView('execution');
      await __M04.sleep(200);
      return out;
    })()`, true)
  );

  /* ================================================================== *
   * A59 / A60 / A61 / F27–F29 报告阅读、来源检视、双向跳转
   * ================================================================== */
  await evaluate(`(async () => {
    const az = window.__AZ;
    const api = az.executionApi();
    api.setRunView('report');
    await __M04.sleep(350);
    return true;
  })()`);
  await sleep(500);
  await shot('F27-Report全景.png');

  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.executionApi();
      const run = api.currentRun();
      const report = run.artifacts.report;

      const sections = [...document.querySelectorAll('.rp-section')].map((s) => s.dataset.section);
      rec('A53b', '报告阅读视图：六个部分 + 指标 + 未决项都能在正文中定位',
        ['R1','R2','R3','R4','R5','R6','METRICS','UNRESOLVED'].every((s) => sections.includes(s)),
        '正文区块=' + sections.join(','));

      /* ---- A59：Source Inspector ---- */
      const citeBtn = document.querySelector('.rp-claim .rp-cite');
      const citeId = citeBtn && citeBtn.dataset.cite;
      citeBtn.click();
      await __M04.sleep(260);
      const citation = report.citations.find((c) => c.id === citeId);
      const srcTitle = document.querySelector('.rp-source__title')?.textContent || '';
      const srcBody = document.querySelector('.rp-source__body')?.textContent || '';
      const marks = document.querySelectorAll('.rp-source .rp-hit').length;
      rec('A59', 'Source Inspector：来源名称、可见元数据、虚构标识与引用高亮',
        !!citation && srcTitle.length > 0 && /虚构教学资料/.test(srcBody) && srcBody.includes(citation.sourceId)
          && srcBody.includes(citation.chunkId) && srcBody.includes(citation.eventId) && marks >= 1,
        '引用=' + citeId + ' · 标题=' + srcTitle + ' · 高亮=' + marks + ' 处 · 含 sourceId/chunkId/eventId=' + (srcBody.includes(citation.sourceId) && srcBody.includes(citation.chunkId) && srcBody.includes(citation.eventId)));
      return out;
    })()`, true)
  );
  await sleep(300);
  await shot('F28-Citation-SourceInspector.png');

  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.executionApi();
      const run = api.currentRun();
      const report = run.artifacts.report;
      const citeId = document.querySelector('.rp-source [data-el="source-pos"]').textContent.trim();
      const citation = report.citations.find((c) => c.id === citeId);

      const scrollEl = document.querySelector('.rp-doc__scroll');
      scrollEl.scrollTop = 120;
      const scrolled = scrollEl.scrollTop;

      document.querySelector('.rp-source [data-act="view-in-execution"]').click();
      await __M04.sleep(420);
      const ev = api.currentEvent();
      const graphCurrent = document.querySelector('.ex-node[data-current="true"]');
      const inspectorId = document.querySelector('.ev-detail__hero')?.dataset.event;
      rec('A60', 'Report → Replay：引用事件在三处观察区同步定位到同一个 eventId',
        api.currentRunView() === 'execution' && ev && ev.id === citation.eventId
          && graphCurrent && graphCurrent.dataset.event === citation.eventId && inspectorId === citation.eventId,
        'citation=' + citeId + ' → event=' + (ev && ev.id) + ' · 执行图当前节点=' + (graphCurrent && graphCurrent.dataset.event) + ' · Inspector=' + inspectorId);
      return out;
    })()`, true)
  );
  await sleep(300);
  await shot('F29-Report与Execution联动.png');

  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.executionApi();
      const backBtn = document.querySelector('[data-act="back-to-report"]');
      const visibleBefore = !backBtn.hidden;
      backBtn.click();
      await __M04.sleep(420);
      const activeClaims = document.querySelectorAll('.rp-claim.is-active').length;
      rec('A61', 'Replay → Report：回到原段落与阅读上下文，而非报告顶部',
        visibleBefore && api.currentRunView() === 'report' && activeClaims >= 1,
        '返回入口可见=' + visibleBefore + ' · 视图=' + api.currentRunView() + ' · 高亮段落=' + activeClaims);

      /* ---- A51：回放扩展事件 ---- */
      api.setRunView('execution');
      await __M04.sleep(200);
      const run = api.currentRun();
      const conflictIdx = run.events.findIndex((e) => e.type === 'evidence.conflict_detected');
      api.seek(conflictIdx);
      await __M04.sleep(180);
      const atConflict = api.currentEvent();
      api.play();
      await __M04.sleep(260);
      const playing = api.isPlaying();
      api.play();
      await __M04.sleep(120);
      const paused = !api.isPlaying();
      api.next();
      await __M04.sleep(120);
      const stepped = api.currentIndex() === conflictIdx + 1;
      api.seek(run.events.length - 1);
      await __M04.sleep(120);
      const atEnd = api.currentIndex() === run.events.length - 1;
      api.setSpeed(4);
      const speedOk = document.querySelector('.ex-timeline select') && document.querySelector('.ex-timeline select').value === '4';
      rec('A51', 'Replay 扩展：conflict / revision / report 事件可播放、暂停、单步与 Seek',
        atConflict && ['evidence.conflict_detected','evidence.revision_confirmed','report.generated'].includes(atConflict.type)
          && playing && paused && stepped && atEnd && speedOk,
        '冲突事件=' + (atConflict && atConflict.type) + ' · 播放/暂停=' + playing + '/' + paused + ' · 单步=' + stepped + ' · Seek 末尾=' + atEnd);

      /* ---- A52：3D/2D 同步 ---- */
      const tone = api.setView('2d');
      const coreView2d = api.currentView();
      const se = run.events.find((e) => e.type === 'evidence.revision_confirmed');
      api.seek(se.sequence);
      await __M04.sleep(200);
      const node = document.querySelector('.ex-node[data-current="true"]');
      const heroId = document.querySelector('.ev-detail__hero')?.dataset.event;
      rec('A52', '2D/3D 与 Inspector 使用同一 eventId，暂停时数据流冻结',
        coreView2d === '2d' && node && node.dataset.event === se.id && heroId === se.id && !api.isPlaying(),
        '视图=' + coreView2d + ' · 节点=' + (node && node.dataset.event) + ' · Inspector=' + heroId + ' · 播放中=' + api.isPlaying());
      return out;
    })()`, true)
  );

  /* ================================================================== *
   * A63 Markdown 导出
   * ================================================================== */
  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const api = az.executionApi();
      api.setRunView('report');
      await __M04.sleep(300);
      const reportApi = api.reportApi();
      const md = reportApi.markdown();
      const filename = reportApi.filename();
      const run = api.currentRun();
      const report = run.artifacts.report;
      const headOk = /AGENT \\/ ZERO · SIMULATED RESEARCH REPORT/.test(md) && /虚构教学研究报告/.test(md);
      const citeOk = (report.citations || []).every((c) => md.includes('[' + c.id + ']'));
      const unresolvedOk = /## 未解决问题/.test(md);
      const limitOk = /## R5 · 局限与风险/.test(md) && /虚构教学样本/.test(md);
      const metaOk = md.includes(run.runId) && md.includes(run.options.evidencePolicy);
      let clicked = false;
      const btn = document.querySelector('[data-act="download"]');
      if (btn) { btn.click(); clicked = true; }
      await __M04.sleep(200);
      rec('A63', 'Markdown 导出：标题、模拟声明、引用列表、未决事项与 UI 报告一致',
        headOk && citeOk && unresolvedOk && limitOk && metaOk && clicked && /^AGENT-ZERO_MISSION-001_run-/.test(filename),
        '长度=' + md.length + ' · 标题=' + headOk + ' · 引用齐全=' + citeOk + ' · 未决段=' + unresolvedOk + ' · 局限段=' + limitOk + ' · 元信息=' + metaOk + ' · 下载按钮=' + clicked + ' · 文件名=' + filename);
      return out;
    })()`, true)
  );

  /* ================================================================== *
   * A65 / A66 持久化恢复与损坏降级
   * ================================================================== */
  const beforeReload = await evaluate(`(() => {
    const az = window.__AZ;
    const api = az.executionApi();
    const run = api.currentRun();
    return { runId: run.runId, eventCount: run.events.length, claims: run.artifacts.report.claims.length, citations: run.artifacts.report.citations.length, config: JSON.stringify(az.constructorSnapshotOnly()) };
  })()`);
  await cdp.send('Page.reload', { ignoreCache: false });
  if (!(await waitReady(cdp))) throw new Error('M0.4 验收：刷新后 __AZ 未就绪');
  await evaluate(`window.__AZ.skipIntro('A65')`);
  await evaluate(PAGE_HELPERS);
  await sleep(600);
  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      az.openExecution({ view: 'report' });
      await __M04.sleep(500);
      const api = az.executionApi();
      const run = api.currentRun();
      const citations = run && run.artifacts.report.citations || [];
      const resolveOk = citations.every((c) => document.getElementById('rp-R4') && run.events.some((e) => e.id === c.eventId));
      const config = JSON.stringify(az.constructorSnapshotOnly());
      rec('A65', '新版恢复：刷新后当前 Run 的来源引用与报告仍可检查，配置不丢失',
        !!run && run.events.length === ${beforeReload.eventCount} && run.artifacts.report.claims.length === ${beforeReload.claims}
          && citations.length === ${beforeReload.citations} && resolveOk && api.currentRunView() === 'report',
        '事件=' + (run && run.events.length) + ' · 陈述=' + (run && run.artifacts.report.claims.length) + ' · 引用=' + citations.length + ' · 配置保留=' + (config === ${JSON.stringify(beforeReload.config)}));
      return out;
    })()`, true)
  );

  /* ---------------- A64：M0.3 旧记录只读兼容 ---------------- */
  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      /* 构造一条合法的 M0.3（schemaVersion 1）轨迹，写入旧命名空间 */
      const legacyRun = {
        schemaVersion: 1,
        runId: 'run-legacy0001',
        missionId: 'mission-001-mini',
        missionVersion: 1,
        corpusVersion: 'mission-001-mini@1',
        configSnapshot: { schemaVersion: 1, modules: [] },
        options: { faultMode: 'normal' },
        outcome: 'blocked',
        branchId: 'B02_NO_SEARCH',
        events: [
          { id: 'run-legacy0001#e00', sequence: 0, phase: 'VALIDATION', type: 'run.started', status: 'info', actorId: 'system', toolId: null, message: '旧版运行开始', inputRef: null, outputRef: null, sourceIds: [], chunkIds: [], branchId: null, ruleId: null },
          { id: 'run-legacy0001#e01', sequence: 1, phase: 'END', type: 'run.completed', status: 'blocked', actorId: 'system', toolId: null, message: '旧版运行结束', inputRef: null, outputRef: null, sourceIds: [], chunkIds: [], branchId: 'B02_NO_SEARCH', ruleId: null },
        ],
        artifacts: { payloads: {}, internal: {}, evidence: { level: null, sourceIds: [], chunkIds: [], note: '旧版无证据' }, report: { status: 'not_generated', note: 'M0.3 不生成报告' }, plan: [] },
        stats: { eventCount: 2, toolsInvoked: [], searches: 0, reads: 0 },
        notes: ['旧版记录'],
      };
      localStorage.removeItem(az.researchStorageKey);
      localStorage.setItem(az.executionStorageKey, JSON.stringify({ schemaVersion: 1, savedAt: '2026-10-01T00:00:00.000Z', run: legacyRun }));
      return true;
    })()`, false)
  );
  await cdp.send('Page.reload', { ignoreCache: false });
  if (!(await waitReady(cdp))) throw new Error('M0.4 验收：A64 刷新后 __AZ 未就绪');
  await evaluate(`window.__AZ.skipIntro('A64')`);
  await evaluate(PAGE_HELPERS);
  await sleep(600);
  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      az.openExecution({ view: 'report' });
      await __M04.sleep(600);
      const api = az.executionApi();
      const run = api.currentRun();
      const heading = document.querySelector('.rp-doc__title')?.textContent || '';
      const hasLegacyChip = /无结构化报告/.test(document.body.textContent);
      const claims = document.querySelectorAll('.rp-claim').length;
      rec('A64', '旧版 Run 兼容：仅轨迹时显示无报告状态，不补造历史结论',
        !!run && run.schemaVersion === 1 && claims === 0 && hasLegacyChip,
        '恢复的 run=' + (run && run.runId) + ' · schemaVersion=' + (run && run.schemaVersion) + ' · 报告标题=' + heading + ' · 陈述数=' + claims);
      return out;
    })()`, true)
  );

  /* ---------------- A66：损坏数据安全降级 ---------------- */
  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      localStorage.setItem(az.researchStorageKey, '{ broken json');
      return true;
    })()`, false)
  );
  await cdp.send('Page.reload', { ignoreCache: false });
  if (!(await waitReady(cdp))) throw new Error('M0.4 验收：A66 刷新后 __AZ 未就绪');
  await evaluate(`window.__AZ.skipIntro('A66')`);
  await evaluate(PAGE_HELPERS);
  await sleep(600);
  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      az.openExecution();
      await __M04.sleep(500);
      const api = az.executionApi();
      const reportView = document.body.textContent;
      const noticeOk = /无法解析|已忽略/.test(document.querySelector('.status') ? document.querySelector('.status').textContent : '');
      const runOk = (() => { api.setEvidencePolicy('VERIFY_REVISIONS'); return true; })();
      api.newRun();
      await __M04.sleep(400);
      const fresh = api.currentRun();
      rec('A66', '损坏数据：失效 / 坏 schema 的本地记录安全降级，不白屏也不错误宣称已核验',
        noticeOk && !!fresh && fresh.artifacts.report.status !== undefined && !!document.querySelector('.ex-grid'),
        '降级提示=' + noticeOk + ' · 新运行=' + (fresh && fresh.outcome) + ' · 页面可用=' + !!document.querySelector('.ex-grid'));
      return out;
    })()`, true)
  );

  /* ================================================================== *
   * A67 窄屏与键盘
   * ================================================================== */
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(600);
  await evaluate(`(async () => {
    const az = window.__AZ;
    const api = az.executionApi();
    api.setRunView('report');
    await __M04.sleep(500);
    return true;
  })()`);
  await sleep(500);
  await shot('F30-移动端与2DFallback.png');
  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const overflow = document.documentElement.scrollWidth - window.innerWidth;
      const cite = document.querySelector('.rp-claim .rp-cite');
      cite.focus();
      const focused = document.activeElement === cite;
      cite.click();
      await __M04.sleep(300);
      const sourceVisible = !!document.querySelector('.rp-source__title');
      const docScroll = document.querySelector('.rp-doc__scroll');
      rec('A67', '窄屏与键盘：可阅读报告、打开来源、返回原段落，无横向溢出',
        overflow <= 1 && focused && sourceVisible && !!docScroll,
        '横向溢出=' + overflow + 'px · 引用可聚焦=' + focused + ' · 来源面板可见=' + sourceVisible);
      return out;
    })()`, true)
  );

  /* ================================================================== *
   * A68 减少动态 + 无 WebGL（二维兜底）
   * ================================================================== */
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const noGl = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...args) { if (String(type).includes('webgl')) return null; return get.call(this, type, ...args); }; })();`,
  });
  await cdp.send('Page.reload', { ignoreCache: false });
  if (!(await waitReady(cdp))) throw new Error('M0.4 验收：无 WebGL 下 __AZ 未就绪');
  await evaluate(`window.__AZ.skipIntro('A68')`);
  await evaluate(PAGE_HELPERS);
  await sleep(700);
  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });
      const assembled = await __M04.assemble({ searchScope: 'all_notices', maxResults: 5, readMode: 'full_text', includeMetadata: true });
      const api = await __M04.run({ policy: 'VERIFY_REVISIONS' });
      const run = api.currentRun();
      api.setView('2d');
      api.setRunView('report');
      await __M04.sleep(400);
      const md = api.reportApi().markdown();
      const cite = document.querySelector('.rp-claim .rp-cite');
      cite.click();
      await __M04.sleep(250);
      const sourceOk = !!document.querySelector('.rp-source__title');
      rec('A68', 'WebGL 不可用 + 减少动态：二维兜底仍可完成核验阅读、回放、报告与导出',
        !(az.scene && az.scene.ok) && az.state.reducedMotion === true && !!run && run.artifacts.report.status
          && /SIMULATED RESEARCH REPORT/.test(md) && sourceOk && api.currentView() === '2d',
        'WebGL=' + !!(az.scene && az.scene.ok) + ' · reducedMotion=' + az.state.reducedMotion + ' · 报告=' + (run && run.artifacts.report.status) + ' · 引用可打开=' + sourceOk);
      return out;
    })()`, true)
  );
  await sleep(400);
  await shot('F30b-无WebGL二维降级报告.png');

  /* ================================================================== *
   * A69 / A70 前三阶段回归冒烟 + 纯静态部署
   * （完整的 T01–T13 / A01–A23 / A01–A30 在同一 npm run shots 中另跑）
   * ================================================================== */
  push(
    await evaluate(`(async () => {
      const az = window.__AZ;
      const out = [];
      const rec = (id, name, pass, note) => out.push({ id, name, pass, note });

      /* A69：M0.1–M0.3 关键入口仍然可用（无 WebGL + 减少动态 + 窄屏下） */
      az.closeWorkspace();
      az.goHub();
      await __M04.sleep(200);
      const hubOk = !!document.querySelector('.shell') && az.state.phase === 'hub';
      az.openAtlas();
      await __M04.sleep(320);
      // M1.1 起画布保持 10 个已开放节点；M1.2 起边数为 13（新增 tool_calling–mcp 这条真实关系）
      const atlasOk = document.querySelectorAll('.atlas-node').length === 36 && document.querySelectorAll('.atlas-edge').length === 49;
      az.openKnowledge('tool_calling');
      await __M04.sleep(320);
      const stepCount = document.querySelectorAll('.kn-step').length;
      document.querySelector('.kn-steps [data-step=' + "'experiment'" + ']')?.click();
      await __M04.sleep(280);
      const knowledgeOk = stepCount >= 4 && !!document.querySelector('.kn-exp__controls');
      az.closeWorkspace();
      await __M04.sleep(150);
      const snap = await __M04.assemble({ searchScope: 'all_notices', maxResults: 5, readMode: 'full_text', includeMetadata: true });
      const constructorOk = snap.modules.length === 2 && snap.modules.every((m) => m.status === 'Ready');
      const api = await __M04.run({ policy: 'VERIFY_REVISIONS' });
      const run = api.currentRun();
      api.seek(1);
      await __M04.sleep(160);
      const replayOk = api.currentIndex() === 1 && document.querySelectorAll('.ex-tick').length === run.events.length;
      rec('A69', '前三阶段回归：Boot / Hub / 装配 / Atlas / Tool Calling / Replay 无明显退化',
        hubOk && atlasOk && knowledgeOk && constructorOk && replayOk,
        'Hub=' + hubOk + ' · Atlas 节点/边=' + atlasOk + ' · 知识页=' + knowledgeOk + ' · 装配=' + constructorOk + ' · 回放=' + replayOk);

      /* A70：纯静态部署 — 全部资源本地、无绝对 URL、无路由深链依赖 */
      const res = performance.getEntriesByType('resource');
      const external = res.filter((r) => !/^(file|data|blob):/.test(r.name));
      const absoluteRefs = [...document.querySelectorAll('script[src], link[href], img[src]')]
        .map((el) => el.getAttribute('src') || el.getAttribute('href') || '')
        .filter((v) => /^https?:/.test(v) || v.startsWith('//'));
      const inlineOnly = [...document.querySelectorAll('script[src], link[href=""]')].length === 0;
      const noBackend = !res.some((r) => r.name.includes('/api/') || r.name.includes('graphql'));
      rec('A70', '纯静态部署：构建产物相对路径、无业务 API、无 CDN 依赖',
        external.length === 0 && absoluteRefs.length === 0 && inlineOnly && noBackend,
        '外部资源=' + external.length + ' · 绝对 URL 引用=' + absoluteRefs.length + ' · 单文件内联=' + inlineOnly + ' · 业务 API 请求=' + noBackend);
      return out;
    })()`, true)
  );

  await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: noGl.identifier });
  await cdp.send('Emulation.setEmulatedMedia', { features: [] });

  return results;
}






