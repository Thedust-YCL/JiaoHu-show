/**
 * src/simulation/rules/branches.js
 * ------------------------------------------------------------------
 * M0.3 的执行分支规则：**纯数据 + 纯函数**，不接触 DOM / Three.js。
 *
 * 分支不是装饰：每个分支都由可检查的条件决定，并且决定后续会产生
 * 哪些事件。执行图只把「真正走过的分支」画成实线，未走过的候选分支
 * 一律用虚线并标注「未执行」（M0.3_TASK §8.3）。
 * ------------------------------------------------------------------
 */
import { BLOCK_CODES } from './availability.js';

export const BRANCHES = Object.freeze({
  B01_NORMAL: Object.freeze({
    id: 'B01_NORMAL',
    cn: 'B01 · 正常完成',
    title: '两个工具都就绪',
    condition: 'Announcement Search 与 Document Reader 均为 Ready',
    expect: '检索 → 读取 → 记录样本资料；明确不生成报告',
    tone: 'success',
  }),
  B02_NO_SEARCH: Object.freeze({
    id: 'B02_NO_SEARCH',
    cn: 'B02 · 检索工具不可用',
    title: 'Search 未装配 / 已禁用 / 未授权 / 非法',
    condition: 'Announcement Search 不满足运行条件',
    expect: '在校验阶段阻断，**不产生任何成功的检索或读取事件**',
    tone: 'attention',
  }),
  B03_NO_READER: Object.freeze({
    id: 'B03_NO_READER',
    cn: 'B03 · 读取工具不可用',
    title: 'Search 可用但 Reader 不可用',
    condition: 'Announcement Search Ready，Document Reader 不满足运行条件',
    expect: '检索成功 → Reader 阻断 → 以检索摘要级资料结束，**没有已读全文事件**',
    tone: 'attention',
  }),
  B04_SEARCH_TIMEOUT: Object.freeze({
    id: 'B04_SEARCH_TIMEOUT',
    cn: 'B04 · 模拟检索超时',
    title: '本次运行显式开启 faultMode=search_timeout',
    condition: 'Search Ready 且运行选项开启 search_timeout',
    expect: '检索请求 → 确定性超时事件 → 出错结束；**不伪造成功响应**',
    tone: 'error',
  }),
  B05_NO_RESULTS: Object.freeze({
    id: 'B05_NO_RESULTS',
    cn: 'B05 · 检索无结果',
    title: '检索成功但范围内没有条目',
    condition: 'Search Ready，且当前 searchScope 过滤后候选为 0 条',
    expect: '检索成功但记录为空 → 不调用 Reader → 部分完成',
    tone: 'attention',
  }),
});

export const BRANCH_ORDER = Object.freeze(['B01_NORMAL', 'B02_NO_SEARCH', 'B03_NO_READER', 'B04_SEARCH_TIMEOUT', 'B05_NO_RESULTS']);

export function getBranch(branchId) {
  return BRANCHES[branchId] || null;
}

/**
 * 运行前的分支判定（只看配置与运行选项，不看视觉状态）。
 * B05 需要检索结果才能判定，因此由引擎在检索之后补充记录。
 */
export function selectBranch({ availability, faultMode = 'normal' }) {
  const search = availability.tools.announcement_search;
  const reader = availability.tools.document_reader;

  if (!search.ready) {
    return {
      branchId: 'B02_NO_SEARCH',
      ruleId: 'rule.search.availability',
      reason: `检索工具不可用：${search.blockReason}`,
      blockCode: search.blockCode,
    };
  }
  if (faultMode === 'search_timeout') {
    return {
      branchId: 'B04_SEARCH_TIMEOUT',
      ruleId: 'rule.runOptions.faultMode',
      reason: '本次运行设置了 search_timeout 故障条件：检索请求会确定性地超时',
      blockCode: BLOCK_CODES.OK,
    };
  }
  if (!reader.ready) {
    return {
      branchId: 'B03_NO_READER',
      ruleId: 'rule.reader.availability',
      reason: `读取工具不可用：${reader.blockReason}`,
      blockCode: reader.blockCode,
    };
  }
  return {
    branchId: 'B01_NORMAL',
    ruleId: 'rule.reader.availability',
    reason: '两个工具均为 Ready：允许检索与读取',
    blockCode: BLOCK_CODES.OK,
  };
}

/** 检索之后的分支修正：有结果就走原分支，没有结果则改为 B05 */
export function refineBranchAfterSearch(branchId, searchMeta) {
  if (branchId !== 'B01_NORMAL' && branchId !== 'B03_NO_READER') return branchId;
  if (searchMeta && searchMeta.returned === 0) return 'B05_NO_RESULTS';
  return branchId;
}

/* ================================================================== *
 * M0.4 证据分支：与工具执行分支并列的第二根轴。
 *
 * 执行分支回答「本次走通了哪条工具链」，证据分支回答「本次证据检查
 * 得出了什么结论」。两者都由可检查的条件决定，不互相替代。
 * ================================================================== */

export const EVIDENCE_BRANCHES = Object.freeze({
  E00_NO_CONFLICT: Object.freeze({
    id: 'E00_NO_CONFLICT',
    cn: 'E00 · 未发现冲突',
    title: '本次可见资料之间没有同字段分歧',
    condition: '可见证据中不存在「同一事项 + 同一字段 + 不同取值」',
    expect: '报告只陈述可追溯的单一取值，并说明未做更正核验',
    tone: 'muted',
  }),
  E01_REVISION_CONFIRMED: Object.freeze({
    id: 'E01_REVISION_CONFIRMED',
    cn: 'E01 · 更正关系核验成立',
    title: '存在明确更正链且必要条件全部满足',
    condition: 'VERIFY_REVISIONS + 可见的正文更正说明 + 发布关系元数据 + 同一授权机构 + 时间顺序成立',
    expect: '旧信息标记为「已被更正」但保留可追踪；报告引用旧/新两方片段',
    tone: 'success',
  }),
  E02_CONFLICT_UNRESOLVED: Object.freeze({
    id: 'E02_CONFLICT_UNRESOLVED',
    cn: 'E02 · 冲突未决',
    title: '存在冲突但没有可靠更正链',
    condition: '不同渠道给出不同取值，且缺少可核实的 supersedes 关系',
    expect: '保留双方资料与未决状态，不裁决、不删除矛盾节点',
    tone: 'attention',
  }),
  E03_VERIFICATION_SKIPPED: Object.freeze({
    id: 'E03_VERIFICATION_SKIPPED',
    cn: 'E03 · 按策略跳过核验',
    title: '本次策略为 COLLECT_ONLY',
    condition: '运行选项 evidencePolicy = COLLECT_ONLY',
    expect: '只收集并呈现冲突，不宣布任何更正成立',
    tone: 'muted',
  }),
  E04_INSUFFICIENT_DETAIL: Object.freeze({
    id: 'E04_INSUFFICIENT_DETAIL',
    cn: 'E04 · 证据不足',
    title: '只有摘要级线索，没有读到正文更正说明',
    condition: '读取模式为 summary，或读取工具不可用',
    expect: '报告保留有限线索并明确标注「未核实」',
    tone: 'attention',
  }),
  E05_METADATA_MISSING: Object.freeze({
    id: 'E05_METADATA_MISSING',
    cn: 'E05 · 缺少发布关系元数据',
    title: '发布主体 / 发布时间 / 更正关系不可见',
    condition: 'includeMetadata = false，或工具没有返回这些字段',
    expect: '涉及发布关系的核验降级为未决，并说明缺什么',
    tone: 'attention',
  }),
});

export const EVIDENCE_BRANCH_ORDER = Object.freeze([
  'E00_NO_CONFLICT',
  'E01_REVISION_CONFIRMED',
  'E02_CONFLICT_UNRESOLVED',
  'E03_VERIFICATION_SKIPPED',
  'E04_INSUFFICIENT_DETAIL',
  'E05_METADATA_MISSING',
]);

export function getEvidenceBranch(branchId) {
  return EVIDENCE_BRANCHES[branchId] || null;
}

/**
 * 由证据判定结果选出一个可检查的证据分支（优先级从高到低）。
 * 只看 resolutions 的 status，不看任何界面状态。
 */
export function selectEvidenceBranch(resolutions = []) {
  const has = (status) => resolutions.some((r) => r.status === status);
  if (resolutions.length === 0) return { branchId: 'E00_NO_CONFLICT', ruleId: 'rule.evidence.branch.none', reason: '本次可见资料之间没有同字段分歧' };
  if (has('revision_confirmed')) return { branchId: 'E01_REVISION_CONFIRMED', ruleId: 'rule.evidence.branch.confirmed', reason: '至少一组更正关系在本次规则下成立' };
  if (has('unresolved')) return { branchId: 'E02_CONFLICT_UNRESOLVED', ruleId: 'rule.evidence.branch.unresolved', reason: '存在冲突但缺少可靠更正链' };
  if (has('verification_skipped')) return { branchId: 'E03_VERIFICATION_SKIPPED', ruleId: 'rule.evidence.branch.skipped', reason: '本次策略为 COLLECT_ONLY，只收集不核验' };
  if (has('insufficient_detail')) return { branchId: 'E04_INSUFFICIENT_DETAIL', ruleId: 'rule.evidence.branch.insufficient', reason: '只有摘要级线索，正文更正说明未被读取' };
  if (has('metadata_missing')) return { branchId: 'E05_METADATA_MISSING', ruleId: 'rule.evidence.branch.metadata', reason: '发布关系元数据未返回，核验降级为未决' };
  return { branchId: 'E00_NO_CONFLICT', ruleId: 'rule.evidence.branch.none', reason: '本次可见资料之间没有同字段分歧' };
}

/**
 * 本次 Run **真正走过**的全部证据分支（可能不止一条）：
 * 一次运行里可能同时出现「一组更正成立」和「一组未决」，执行图必须
 * 如实标出两条，而不是为了好看只留一条。
 */
export function evidenceBranchesFor(resolutions = []) {
  const found = new Set();
  for (const r of resolutions) {
    if (r.status === 'revision_confirmed') found.add('E01_REVISION_CONFIRMED');
    else if (r.status === 'unresolved') found.add('E02_CONFLICT_UNRESOLVED');
    else if (r.status === 'verification_skipped') found.add('E03_VERIFICATION_SKIPPED');
    else if (r.status === 'insufficient_detail') found.add('E04_INSUFFICIENT_DETAIL');
    else if (r.status === 'metadata_missing') found.add('E05_METADATA_MISSING');
  }
  if (found.size === 0) found.add('E00_NO_CONFLICT');
  return EVIDENCE_BRANCH_ORDER.filter((id) => found.has(id));
}
