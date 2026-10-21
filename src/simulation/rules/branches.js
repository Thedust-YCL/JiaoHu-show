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
