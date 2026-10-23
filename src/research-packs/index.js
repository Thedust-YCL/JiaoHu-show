/**
 * src/research-packs/index.js
 * ------------------------------------------------------------------
 * 研究包注册表：引擎与界面只通过这里取任务包，不直接引用具体目录。
 *
 *   mission-001      M0.4 研究闭环（10 份虚构资料 + 更正链 + 未决冲突）
 *   mission-001-mini M0.3 样本（5 份资料，只做检索与读取，不生成报告）
 *
 * 两个包都保留：旧包的 sourceId / chunkId 一字不改，M0.3 的历史 Run 与
 * Tool Calling 知识页的内嵌实验继续可用（A34 / A64）。
 * ------------------------------------------------------------------
 */
import { MISSION_001, MISSION_ID as MISSION_001_ID, MISSION_VERSION as MISSION_001_VERSION, loadMission as load001 } from './mission-001/index.js';
import { MISSION_001_MINI, MISSION_ID as MISSION_MINI_ID, loadMission as loadMini } from './mission-001-mini/index.js';

export { MISSION_001, MISSION_001_MINI };

/** 默认（当前阶段主打）研究任务 */
export const DEFAULT_MISSION_ID = MISSION_001_ID;

export const MISSION_IDS = Object.freeze([MISSION_001_ID, MISSION_MINI_ID]);

/**
 * 读取任务包。
 * @param {string} missionId
 * @param {number} [missionVersion] 传 undefined 表示取当前版本
 * @returns {object|null} 找不到返回 null（调用方必须显式降级）
 */
export function loadMission(missionId = DEFAULT_MISSION_ID, missionVersion) {
  if (typeof missionId !== 'string') return null;
  if (missionId === MISSION_001_ID) return load001(missionId, missionVersion ?? MISSION_001_VERSION);
  if (missionId === MISSION_MINI_ID) return loadMini(missionId, missionVersion);
  return null;
}

/** 任务包是否具备 M0.4 的研究能力（证据链 + 报告） */
export function missionSupportsResearch(mission) {
  return !!(mission && mission.research && mission.research.evidence === true && mission.research.report === true);
}

export { MISSION_001_ID };
