/**
 * src/research-packs/mission-001/index.js
 * ------------------------------------------------------------------
 * M0.4 MISSION 001 版本化研究包入口。
 *
 * 引擎只通过「稳定 missionId + missionVersion」读取它，不依赖 DOM、
 * 文件系统或网络。资料本身在 `notices.js`，方案比较卡在 `comparison.js`，
 * 数据校验在 `validate.js`。
 * ------------------------------------------------------------------
 */
import { COMPARISON_CARDS, COMPARISON_NOTE } from './comparison.js';
import { CORPUS_VERSION, NOTICES, PUBLISHERS, SEARCH_SCOPES, getNotice, noticesForScope, sortNotices } from './notices.js';
import { prepareCorpus, validateMissionPack } from './validate.js';

export const MISSION_ID = 'mission-001';
export const MISSION_VERSION = 2;

/** 单次运行最多读取多少条可见结果（防止事件数组失控，不改写任何配置） */
export const MAX_READS_PER_RUN = 10;

export const MISSION_001 = Object.freeze({
  missionId: MISSION_ID,
  missionVersion: MISSION_VERSION,
  corpusVersion: CORPUS_VERSION,
  title: '校园活动信息整合可行性研究',
  subtitle: '在虚构校园公告中查找活动信息、识别冲突、核验更正关系，并产出可追溯的研究报告',
  /** 面向用户的模拟声明：报告不是真实模型写的 */
  simulatedNote:
    '本次研究的资料、规则与结论全部来自本地打包的教学样本与显式规则，不是真实联网检索，也不是真实语言模型生成的判断。',
  /** 固定演示规划（不是真实模型推理，只是本阶段写死的简化步骤） */
  plan: Object.freeze([
    { step: 1, cn: '校验已确认装配配置与本次研究策略', toolId: null },
    { step: 2, cn: '在本地语料中检索符合条件的公告', toolId: 'announcement_search' },
    { step: 3, cn: '逐条读取本次可见公告', toolId: 'document_reader' },
    { step: 4, cn: '从实际返回的文本抽取事实声明', toolId: null },
    { step: 5, cn: '按事项与字段分组，识别冲突', toolId: null },
    { step: 6, cn: '核验更正关系（仅在 VERIFY_REVISIONS 策略下）', toolId: null },
    { step: 7, cn: '由结构化证据装配研究报告', toolId: null },
  ]),
  query: Object.freeze({
    keywords: ['活动日期', '更正', '招聘会', '开放日'],
    note: '预置查询意图：本阶段不做真实语义检索，只按发布栏目标签过滤本地语料。',
  }),
  /** 研究能力声明：引擎据此决定读取条数与是否进入证据 / 报告阶段 */
  research: Object.freeze({
    evidence: true,
    report: true,
    readLimit: MAX_READS_PER_RUN,
    /** 更正核验必须读到正文（摘要不足以确认更正关系） */
    revisionRequiresBody: true,
    /** 更正核验必须拿到发布主体 / 发布时间 / supersedes 元数据 */
    revisionRequiresMetadata: true,
  }),
  reportsAvailable: true,
  reportNote: '报告由本次 Run 的结构化证据按模板装配，不是真实模型自由撰写。',
  dataNote: '语料全部为虚构教学数据（isFictional: true），不含真实学校公告、真实日期与真实个人信息。',
  notices: NOTICES,
  publishers: PUBLISHERS,
  searchScopes: SEARCH_SCOPES,
  comparisonCards: COMPARISON_CARDS,
  comparisonNote: COMPARISON_NOTE,
  getNotice,
  noticesForScope,
  sortNotices,
  validate: () => validateMissionPack(NOTICES),
  prepareCorpus: (list = NOTICES) => prepareCorpus(list),
});

export function loadMission(missionId = MISSION_ID, missionVersion = MISSION_VERSION) {
  if (missionId !== MISSION_ID) return null;
  if (missionVersion !== undefined && missionVersion !== null && Number(missionVersion) !== MISSION_VERSION) return null;
  return MISSION_001;
}

export { NOTICES, PUBLISHERS, SEARCH_SCOPES, CORPUS_VERSION, COMPARISON_CARDS, getNotice, sortNotices, validateMissionPack, prepareCorpus };
