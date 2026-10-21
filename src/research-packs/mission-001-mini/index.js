/**
 * src/research-packs/mission-001-mini/index.js
 * ------------------------------------------------------------------
 * 版本化研究样本包入口。模拟引擎只通过「稳定 ID + 版本」读取它，
 * 不依赖 DOM、文件系统或网络（M0.3_TASK §6.1 / §7.1）。
 * ------------------------------------------------------------------
 */
import { CORPUS_VERSION, NOTICES, SEARCH_SCOPES, getNotice, sortNotices } from './notices.js';

export const MISSION_ID = 'mission-001-mini';
export const MISSION_VERSION = 1;

/** 面向用户的任务卡：模拟引擎里 task.plan_created 事件的输入就是它 */
export const MISSION_001_MINI = Object.freeze({
  missionId: MISSION_ID,
  missionVersion: MISSION_VERSION,
  corpusVersion: CORPUS_VERSION,
  title: '校园公告检索与读取',
  subtitle: '读一条虚构公告，确认拿得到哪些资料',
  /** 固定演示规划（不是真实模型推理，只是本阶段写死的简化步骤） */
  plan: Object.freeze([
    { step: 1, cn: '检索校园公告条目', toolId: 'announcement_search' },
    { step: 2, cn: '读取首条命中的公告内容', toolId: 'document_reader' },
    { step: 3, cn: '把读到的片段记录为样本资料', toolId: null },
  ]),
  query: Object.freeze({
    keywords: ['校园', '公告', '活动'],
    note: '预置查询关键词：本阶段不做真实语义检索，只按范围标签过滤本地语料。',
  }),
  reportsAvailable: false,
  reportNote: '本阶段不生成研究报告：只保留模拟轨迹摘要与已取得的样本资料，报告功能在下一阶段开放。',
  dataNote: '语料全部为虚构教学数据（isFictional: true），不含真实学校公告与真实个人信息。',
  notices: NOTICES,
  searchScopes: SEARCH_SCOPES,
  sortNotices,
  getNotice,
});

export function loadMission(missionId = MISSION_ID, missionVersion = MISSION_VERSION) {
  if (missionId !== MISSION_ID || Number(missionVersion) !== MISSION_VERSION) return null;
  return MISSION_001_MINI;
}

export { NOTICES, SEARCH_SCOPES, getNotice, sortNotices, CORPUS_VERSION };
