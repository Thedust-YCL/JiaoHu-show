/**
 * src/features/reports/state/reportState.js
 * ------------------------------------------------------------------
 * 报告相关的派生状态：
 *   · `reportMetrics(run)` 把「报告里的证据指标」与「当前 Run 的事件统计」
 *     合到一处。工具调用次数、错误次数与回放事件数量**只从 run 的事件
 *     数组计算**，报告里不复制第二份，避免两个数打架（A62）。
 *   · `reportOf(run)` / `legacyNotice(run)` 统一判读「有没有结构化报告」。
 * ------------------------------------------------------------------
 */

export function reportOf(run) {
  const report = run?.artifacts?.report;
  if (!report || !Array.isArray(report.claims) || report.claims.length === 0) return null;
  return report;
}

/** 该 Run 是否只有执行轨迹、没有结构化报告（M0.3 旧记录或阻断运行） */
export function isLegacyRun(run) {
  if (!run) return false;
  if (run.schemaVersion === 1) return true;
  return !reportOf(run);
}

export function legacyNotice(run) {
  if (!run) return '';
  if (run.schemaVersion === 1) return '旧版运行（schemaVersion 1）：只有执行轨迹，尚无结构化报告。历史不会被新资料包补造结论。';
  return '本次运行没有生成结构化报告（运行在取得证据前结束）。';
}

/**
 * 合并后的指标：全部来自当前 Run 的真实产物。
 * @param {object} run
 */
export function reportMetrics(run) {
  const base = run?.artifacts?.report?.metrics || {};
  return {
    ...base,
    toolCalls: run?.stats?.toolCalls ?? 0,
    toolErrors: run?.stats?.toolErrors ?? 0,
    eventCount: run?.events?.length ?? 0,
  };
}

/** 由 runId 找事件下标（找不到返回 -1，绝不猜测到另一个事件） */
export function indexOfEvent(run, eventId) {
  if (!run || !eventId) return -1;
  return run.events.findIndex((e) => e.id === eventId);
}

/** 报告里与某事件关联的 claim（反向定位：Replay → Report） */
export function claimsForEvent(report, eventId) {
  if (!report || !eventId) return [];
  return (report.claims || []).filter((c) => (c.relatedEventIds || []).includes(eventId));
}

/** 报告里与某 source/chunk 关联的引用（Source Inspector 与 Replay 共用） */
export function citationsForSource(report, sourceId, chunkId = null) {
  if (!report) return [];
  return (report.citations || []).filter((c) => c.sourceId === sourceId && (!chunkId || c.chunkId === chunkId));
}
