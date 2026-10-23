/**
 * src/simulation/reports/generateReport.js
 * ------------------------------------------------------------------
 * 结构化研究报告生成器：**纯逻辑 + 本地模板**，不调用任何真实语言模型。
 *
 * 纪律（M0.4_TASK §7）：
 *   · 只消费本次 Run 的结构化证据（claims / conflicts / resolutions / reads），
 *     不从 3D 场景、组件文本或当前可变配置里反推判断；
 *   · 每条重要事实都带 [S1] 形式的引用，引用 = sourceId + chunkId + eventId
 *     + **当时实际可见的文本快照**；
 *   · 引用编号由稳定的排序派生，同一 source/chunk 永远同一个编号；
 *   · claim 的 status 由规则与证据计算，界面无法把它「染绿」；
 *   · 没有证据就不出现引用，也不把未证实结论写成确定事实。
 * ------------------------------------------------------------------
 */
import { COMPARISON_CARDS, COMPARISON_NOTE } from '../../research-packs/mission-001/comparison.js';
import { PREDICATES } from '../rules/evidence/claims.js';
import { REVISION_STATUS } from '../rules/evidence/revision.js';

export const REPORT_SCHEMA_VERSION = 1;

export const REPORT_STATUS = Object.freeze({
  COMPLETE: 'complete',
  PARTIAL: 'partial',
  BLOCKED: 'blocked',
});

/** 引用片段快照最多保留的字符数（与证据层一致的安全阈值） */
const MAX_CITATION_CHARS = 400;

function clip(text, limit = MAX_CITATION_CHARS) {
  const s = String(text ?? '').trim();
  return s.length <= limit ? s : `${s.slice(0, limit)}…`;
}

/** 值的中文展示：活动日期统一显示成「2026 年 10 月 18 日」 */
export function formatDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
  if (!m) return String(value ?? '—');
  return `${m[1]} 年 ${Number(m[2])} 月 ${Number(m[3])} 日`;
}

/**
 * 建立稳定引用表。
 * 排序键 = sourceId + chunkId，因此同一份资料在同一 Run 里永远得到同一个编号。
 */
function buildCitations(claims = []) {
  const seen = new Map();
  for (const claim of claims) {
    if (!claim.sourceId || !claim.chunkId || !claim.eventId) continue;
    const key = `${claim.sourceId}::${claim.chunkId}`;
    if (seen.has(key)) continue;
    seen.set(key, {
      key,
      sourceId: claim.sourceId,
      chunkId: claim.chunkId,
      eventId: claim.eventId,
      excerpt: clip(claim.excerpt),
      anchor: claim.anchor || null,
      textScope: claim.textScope || 'summary',
      chunkKind: claim.chunkKind || 'summary',
    });
  }
  const ordered = [...seen.values()].sort((a, b) => {
    if (a.sourceId !== b.sourceId) return a.sourceId < b.sourceId ? -1 : 1;
    return a.chunkId < b.chunkId ? -1 : a.chunkId > b.chunkId ? 1 : 0;
  });
  return ordered.map((c, i) => ({ ...c, id: `S${i + 1}` }));
}

function citationIdsFor(citations, { chunkIds = [], sourceIds = [] } = {}) {
  const ids = new Set();
  for (const c of citations) {
    if (chunkIds.includes(c.chunkId)) ids.add(c.id);
    else if (sourceIds.includes(c.sourceId) && chunkIds.length === 0) ids.add(c.id);
  }
  return [...ids].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

function citationsForClaim(citations, claim) {
  return citations.filter((c) => c.sourceId === claim.sourceId && c.chunkId === claim.chunkId).map((c) => c.id);
}

/**
 * 生成报告。
 *
 * @param {object} input
 * @param {string} input.runId
 * @param {object} input.mission
 * @param {object} input.evidence  `evaluateEvidence()` 的结果
 * @param {Array}  input.reads    本次实际读取记录（含真实返回的片段与元数据）
 * @param {object} input.options   `{ evidencePolicy, faultMode }`
 * @param {object} input.config    本次运行的配置摘要（只用于 R1 说明）
 * @param {object} input.blocked   若运行在取得证据前被阻断：`{ reason, detail }`
 * @param {object} input.stats     事件统计 `{ eventCount, toolCalls, toolErrors }`
 * @returns {object} ResearchReport
 */
export function generateReport({ runId, mission, evidence, reads = [], options = {}, config = {}, blocked = null, stats = {} } = {}) {
  const policy = options.evidencePolicy || 'VERIFY_REVISIONS';
  const claims = evidence?.claims || [];
  const resolutions = evidence?.resolutions || [];
  const conflicts = evidence?.conflicts || [];
  const citations = buildCitations(claims);
  const titleOf = (sourceId) => mission?.getNotice?.(sourceId)?.title || evidence?.titles?.[sourceId] || sourceId;

  const reportClaims = [];
  let claimSeq = 0;
  const pushClaim = (claim) => {
    claimSeq += 1;
    const item = {
      id: `RC${String(claimSeq).padStart(2, '0')}`,
      kind: 'finding',
      status: 'supported',
      citationIds: [],
      relatedEventIds: [],
      basisRuleId: null,
      ...claim,
    };
    reportClaims.push(item);
    return item;
  };

  /* ================= R1 · 研究任务与范围 ================= */
  const scopeClaims = [];
  scopeClaims.push(
    pushClaim({
      kind: 'scope',
      text: `研究任务：${mission?.title || '校园活动信息整合可行性研究'}（${mission?.missionId || 'mission-001'}@${mission?.missionVersion ?? 1}，数据包 ${mission?.corpusVersion || '—'}）。这是一个虚构教学任务：资料、规则与结论都来自本地打包样本。`,
    })
  );
  scopeClaims.push(
    pushClaim({
      kind: 'scope',
      text: `本次运行策略：${policy === 'COLLECT_ONLY' ? 'COLLECT_ONLY · 只收集证据' : 'VERIFY_REVISIONS · 核验更正关系'}；故障模式 ${options.faultMode || 'normal'}；实际装配 ${config.tools || '—'}。`,
    })
  );
  scopeClaims.push(
    pushClaim({
      kind: 'scope',
      text: `检索范围 ${config.searchScope || '—'} / 结果上限 ${config.maxResults ?? '—'}；读取方式 ${config.readMode || '—'}；元数据 ${config.includeMetadata ? '开启' : '关闭'}。以上参数取自本次 Run 冻结的配置快照。`,
    })
  );

  /* ================= R2 · 核心发现 ================= */
  const findingClaims = [];

  if (blocked) {
    findingClaims.push(
      pushClaim({
        kind: 'finding',
        status: 'insufficient',
        text: `本次运行没有取得可用资料：${blocked.reason}。因此本报告不包含任何事实性结论，也不生成引用。`,
        basisRuleId: blocked.ruleId || 'rule.report.blocked',
      })
    );
  } else {
    /* ---- 逐条冲突 ---- */
    for (const resolution of resolutions) {
      const conflict = conflicts.find((c) => c.conflictId === resolution.conflictId);
      if (!conflict) continue;
      const relatedEvents = [resolution.eventId, conflict.eventId].filter(Boolean);
      const valueEntries = conflict.values.map((v) => {
        const claim = claims.find((c) => c.claimId === v.claimIds[0]);
        return { value: v.value, sourceId: v.sourceIds[0], claim };
      });

      if (resolution.status === REVISION_STATUS.CONFIRMED) {
        const oldEntry = valueEntries.find((v) => v.sourceId === resolution.oldSourceId) || valueEntries[0];
        const newEntry = valueEntries.find((v) => v.sourceId === resolution.newSourceId) || valueEntries[1];
        findingClaims.push(
          pushClaim({
            text: `《${titleOf(oldEntry.sourceId)}》写明该事项的${conflict.predicateLabel}为 ${formatDate(oldEntry.value || resolution.oldValue)}。`,
            status: 'supported',
            citationIds: oldEntry.claim ? citationsForClaim(citations, oldEntry.claim) : citationIdsFor(citations, { sourceIds: [oldEntry.sourceId] }),
            relatedEventIds: [...relatedEvents, oldEntry.claim?.eventId].filter(Boolean),
            basisRuleId: 'rule.report.factFromClaim',
          })
        );
        findingClaims.push(
          pushClaim({
            text: `更正公告《${titleOf(newEntry.sourceId)}》（${resolution.newPublishedAt} 发布）明确说明该日期予以更正，调整为 ${formatDate(newEntry.value || resolution.newValue)}；发布方与被更正公告为同一授权机构。`,
            status: 'supported',
            citationIds: newEntry.claim ? citationsForClaim(citations, newEntry.claim) : citationIdsFor(citations, { sourceIds: [newEntry.sourceId] }),
            relatedEventIds: [...relatedEvents, newEntry.claim?.eventId].filter(Boolean),
            basisRuleId: resolution.ruleId,
          })
        );
        findingClaims.push(
          pushClaim({
            text: `按本次核验规则，旧公告在本报告中标记为「已被更正」，但**不会被删除**：仍可作为历史记录追溯，且${formatDate(oldEntry.value || resolution.oldValue)}这一旧取值仍可核对。`,
            status: 'supported',
            citationIds: [...new Set([
              ...(oldEntry.claim ? citationsForClaim(citations, oldEntry.claim) : []),
              ...(newEntry.claim ? citationsForClaim(citations, newEntry.claim) : []),
            ])].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))),
            relatedEventIds: relatedEvents,
            basisRuleId: resolution.ruleId,
          })
        );
      } else if (resolution.status === REVISION_STATUS.SKIPPED) {
        findingClaims.push(
          pushClaim({
            text: `本次可见资料对「${conflict.predicateLabel}」给出了 ${valueEntries.length} 种不同取值（${valueEntries.map((v) => formatDate(v.value)).join(' / ')}）。本次运行策略为 COLLECT_ONLY：只收集并呈现冲突，**尚未进行更正关系核验**。`,
            status: 'unresolved',
            citationIds: [...new Set(valueEntries.flatMap((v) => (v.claim ? citationsForClaim(citations, v.claim) : [])))].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))),
            relatedEventIds: relatedEvents,
            basisRuleId: resolution.ruleId,
          })
        );
      } else {
        const status = resolution.status === REVISION_STATUS.INSUFFICIENT ? 'insufficient' : 'unresolved';
        const missingText = (resolution.missing || []).map((m) => m.message).join('；') || '缺少必要条件';
        findingClaims.push(
          pushClaim({
            text: `本次可见资料对「${conflict.predicateLabel}」存在分歧（${valueEntries.map((v) => `${titleOf(v.sourceId)} → ${formatDate(v.value)}`).join('；')}）。缺失的依据：${missingText}。因此**未核实**，不作裁决。`,
            status,
            citationIds: [...new Set(valueEntries.flatMap((v) => (v.claim ? citationsForClaim(citations, v.claim) : [])))].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))),
            relatedEventIds: relatedEvents,
            basisRuleId: resolution.ruleId,
          })
        );
      }
    }

    /* ---- 未参与冲突的事实 ---- */
    const groupedSources = new Set(conflicts.flatMap((c) => c.sourceIds));
    const plainClaims = claims.filter(
      (c) => !c.fromMetadata && c.predicate === PREDICATES.EVENT_DATE && !groupedSources.has(c.sourceId) && c.subject
    );
    for (const claim of plainClaims) {
      findingClaims.push(
        pushClaim({
          text: `《${titleOf(claim.sourceId)}》称活动日期为 ${formatDate(claim.value)}。本次可见资料中没有其他取值与之冲突；这不等于该日期已被核验为现实世界的最新有效日期。`,
          status: 'supported',
          citationIds: citationsForClaim(citations, claim),
          relatedEventIds: [claim.eventId].filter(Boolean),
          basisRuleId: 'rule.report.factFromClaim',
        })
      );
    }

    /* ---- 背景事实（非日期字段） ---- */
    const facts = claims.filter((c) => !c.fromMetadata && c.predicate === PREDICATES.KEY_FACT);
    if (facts.length > 0) {
      findingClaims.push(
        pushClaim({
          text: `本次可见资料还包含以下背景事实：${facts.map((f) => `${titleOf(f.sourceId)}——${f.value}`).join('；')}。`,
          status: 'supported',
          citationIds: [...new Set(facts.flatMap((f) => citationsForClaim(citations, f)))].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))),
          relatedEventIds: [...new Set(facts.map((f) => f.eventId).filter(Boolean))],
          basisRuleId: 'rule.report.backgroundFacts',
        })
      );
    }

    if (findingClaims.length === 0) {
      findingClaims.push(
        pushClaim({
          kind: 'finding',
          status: 'insufficient',
          text: '本次可见资料中没有可抽取的事实声明，无法形成研究发现。',
          basisRuleId: 'rule.report.noEvidence',
        })
      );
    }
  }

  /* ================= R3 · 方案比较（概念性） ================= */
  const comparisonClaims = COMPARISON_CARDS.map((card) =>
    pushClaim({
      kind: 'comparison',
      text: `${card.name}：${card.premise}适用条件 —— ${card.fitsWhen[0]}主要代价 —— ${card.limits[0]}`,
      status: 'supported',
      citationIds: [],
      relatedEventIds: [],
      basisRuleId: 'rule.report.comparisonCard',
    })
  );

  /* ================= R5 · 局限与风险 ================= */
  const limitations = [];
  limitations.push('本报告的全部资料、规则与结论均为**虚构教学样本**，不代表任何真实学校的公告、日期或事实。');
  if (mission?.simulatedNote) limitations.push(mission.simulatedNote);
  limitations.push('报告由本地结构化模板装配，**没有**调用真实语言模型自由撰写；「更正成立」只在本教学数据与模拟核验规则内成立。');
  for (const item of evidence?.limitations || []) limitations.push(item);
  if (blocked) limitations.push(`本次运行在取得证据前结束：${blocked.reason}。`);
  if (config.includeMetadata === false) limitations.push('本次关闭了元数据返回：报告无法展示发布主体与发布时间，也无法核对发布关系。');
  if (config.readMode === 'summary') limitations.push('本次读取方式为摘要：报告中的事实只来自预定义摘要，不能代表原文全文。');
  limitations.push('未覆盖：真实联网检索、真实来源可信度评估、正文语义模型抽取、跨设备账户同步。');

  /* ================= R6 · 研究建议与待验证 ================= */
  const recommendations = [];
  const hasUnresolved = resolutions.some((r) => r.status === REVISION_STATUS.UNRESOLVED);
  const hasInsufficient = resolutions.some((r) => [REVISION_STATUS.INSUFFICIENT, REVISION_STATUS.METADATA_MISSING].includes(r.status));
  const hasConfirmed = resolutions.some((r) => r.status === REVISION_STATUS.CONFIRMED);

  if (blocked) {
    recommendations.push('本次没有取得可用资料：应先满足工具装配、只读权限与检索条件，再讨论三类流程的优劣。');
  }
  if (hasConfirmed) {
    recommendations.push('本次任务已验证「规则自动化」足以处理**单一事项的明确更正**：字段固定、更正关系有元数据可查时，显式规则加上引用溯源即可满足可审计要求。');
  }
  if (hasUnresolved) {
    recommendations.push('出现跨渠道冲突时，先补齐「来源识别 + 更正关系元数据 + 正文核验」三项基础能力；在这些基础缺失时直接引入更自主的流程，只会更快地产出无法追溯的结论。');
  }
  if (hasInsufficient) {
    recommendations.push('证据不足时不要用「日期更晚」或「发布时间更晚」代替更正关系：先把读取模式提升到全文并开启元数据，再重新核验。');
  }
  if (config.readMode === 'summary' || config.includeMetadata === false) {
    recommendations.push('待验证：把 readMode 改为 full_text 并开启 includeMetadata 后重跑，观察冲突状态是否从「证据不足」变为「核验成立 / 仍然未决」。');
  }
  recommendations.push('本报告的建议是**条件性**的：Agent 式流程在来源不稳定、需要自行决定补证顺序时才有优势，代价是路径不确定与审计成本上升。');
  recommendations.push('待验证：真实联网检索、真实来源可信度与真实语言模型抽取都不在本次模拟范围内。');

  /* ================= 指标 ================= */
  const factClaimsNeeded = findingClaims.filter((c) => c.kind === 'finding' && c.citationIds.length > 0).length;
  const factClaimsSupported = findingClaims.filter((c) => c.kind === 'finding' && c.citationIds.length > 0 && c.status === 'supported').length;
  const metrics = {
    sourcesFound: evidence?.counts?.searchReturned ?? 0,
    sourcesRead: evidence?.counts?.sourcesRead ?? 0,
    fullTextReads: evidence?.counts?.fullTextReads ?? 0,
    summaryReads: evidence?.counts?.summaryReads ?? 0,
    claimCount: claims.length,
    factClaimsNeeded,
    factClaimsSupported,
    conflictsDetected: conflicts.length,
    conflictsResolved: resolutions.filter((r) => r.status === REVISION_STATUS.CONFIRMED).length,
    conflictsUnresolved: resolutions.filter((r) => [REVISION_STATUS.UNRESOLVED, REVISION_STATUS.INSUFFICIENT, REVISION_STATUS.METADATA_MISSING].includes(r.status)).length,
    conflictsSkipped: resolutions.filter((r) => r.status === REVISION_STATUS.SKIPPED).length,
    citationCount: citations.length,
    /* 工具调用次数 / 错误次数 / 回放事件数量由 UI 从**当前 Run 的事件数组**实时计算，
       不在这里复制一份，避免「报告指标」与「轨迹事实」出现两个数（A62）。 */
    /** 分母为零时必须显示「无可评估事实」，不允许输出误导性的 100% */
    evidenceCoverage: factClaimsNeeded === 0 ? null : Math.round((factClaimsSupported / factClaimsNeeded) * 100),
  };

  const status = blocked
    ? REPORT_STATUS.BLOCKED
    : metrics.conflictsUnresolved > 0 || metrics.conflictsSkipped > 0 || factClaimsNeeded === 0
      ? REPORT_STATUS.PARTIAL
      : REPORT_STATUS.COMPLETE;

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    runId,
    missionId: mission?.missionId || 'mission-001',
    missionVersion: mission?.missionVersion ?? 1,
    corpusVersion: mission?.corpusVersion || null,
    status,
    generatedFrom: 'local-template',
    generatedNote: '本报告由本地结构化证据与固定模板装配，未调用任何真实语言模型，也不是真实联网研究的结论。',
    sections: [
      { id: 'R1', title: '研究任务与范围', claimIds: scopeClaims.map((c) => c.id) },
      { id: 'R2', title: '核心发现', claimIds: findingClaims.map((c) => c.id) },
      { id: 'R3', title: '方案比较（概念性）', claimIds: comparisonClaims.map((c) => c.id), note: COMPARISON_NOTE },
      { id: 'R4', title: '证据引用', claimIds: [], citationIds: citations.map((c) => c.id) },
      { id: 'R5', title: '局限与风险', claimIds: [], items: limitations },
      { id: 'R6', title: '研究建议与待验证', claimIds: [], itemList: recommendations },
    ],
    claims: reportClaims,
    citations,
    limitations,
    recommendations: recommendations.map((text, i) => ({ id: `RR${String(i + 1).padStart(2, '0')}`, text })),
    metrics,
    comparison: COMPARISON_CARDS.map((c) => ({
      cardId: c.cardId,
      name: c.name,
      en: c.en,
      premise: c.premise,
      fitsWhen: c.fitsWhen,
      limits: c.limits,
      note: c.note,
    })),
    policy,
    options: { evidencePolicy: policy, faultMode: options.faultMode || 'normal' },
  };
}

/** 报告是否可导出 / 可阅读（阻断态也允许阅读说明，但不允许导出「研究结论」） */
export function reportReadable(report) {
  return !!report && Array.isArray(report.claims) && report.claims.length > 0;
}
