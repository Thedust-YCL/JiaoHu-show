/**
 * src/features/reports/export/markdown.js
 * ------------------------------------------------------------------
 * 纯前端 Markdown 导出（M0.4_TASK §10.1）。
 *
 *   · 唯一数据源是**当前选中 Run 的 ResearchReport**，不重新生成结论；
 *   · 核心发现保留 [S1] 形式的引用标识，末尾附参考来源表；
 *   · 文档头部明确写出「虚构教学研究报告」与生成方式；
 *   · 对外部字段做受控转义：数据里的任意文本都不能变成可执行链接或
 *     伪造的结构（不产生 `[](...)` 之外的可点击语义）；
 *   · 全程使用 Blob + URL.createObjectURL + a[download]，无后端。
 * ------------------------------------------------------------------
 */

/** Markdown 语义字符转义：数据文本只作为文字显示，不获得结构含义 */
export function mdEscape(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/([`*_#~|])/g, '\\$1')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 标识符（runId / 策略名 / 数据包版本）用行内代码表示：不转义下划线，保持可检索 */
function mdCode(value) {
  return '`' + String(value ?? '—').replace(/`/g, '') + '`';
}

/** 引用标识：始终由 citationIds 派生，不解析正文里的方括号 */
function cit(ids) {
  return Array.isArray(ids) && ids.length ? ` ${ids.map((id) => `[${id}]`).join('')}` : '';
}

const STATUS_LABEL = {
  supported: '已支持（有引用）',
  unresolved: '未核实 / 未决',
  insufficient: '证据不足',
};

/**
 * 生成 Markdown 文本。
 * @param {object} report ResearchReport
 * @param {object} context `{ run, mission, configSummary }`
 * @returns {string}
 */
export function reportToMarkdown(report, context = {}) {
  /* 没有结构化陈述的「报告」不是报告：不输出只有外壳的文件 */
  if (!report || !Array.isArray(report.claims) || report.claims.length === 0) return '';
  const { run, mission, configSummary } = context;
  const claimsById = new Map(report.claims.map((c) => [c.id, c]));
  const citationsById = new Map((report.citations || []).map((c) => [c.id, c]));
  const lines = [];

  const title = mission?.title || 'MISSION 001 · 校园活动信息整合可行性研究';
  lines.push('# AGENT / ZERO · SIMULATED RESEARCH REPORT / 虚构教学研究报告');
  lines.push('');
  lines.push(`> **${mdEscape(title)}**`);
  lines.push('>');
  lines.push(`> ${mdEscape(report.generatedNote || '本报告由本地结构化证据与固定模板装配，未调用任何真实语言模型。')}`);
  lines.push('>');
  lines.push('> **SIMULATED · 本地教学模拟** — 资料、日期与结论均为虚构教学样本，不代表任何真实学校的公告或事实。');
  lines.push('');

  /* ---------------- 元信息 ---------------- */
  lines.push('## 报告元信息');
  lines.push('');
  lines.push('| 项 | 值 |');
  lines.push('| --- | --- |');
  lines.push(`| 运行 ID | ${mdCode(report.runId)} |`);
  lines.push(`| 任务 | ${mdCode(report.missionId)}@${report.missionVersion} |`);
  lines.push(`| 数据包版本 | ${mdCode(report.corpusVersion || '—')} |`);
  lines.push(`| 报告状态 | ${mdCode(report.status)} |`);
  lines.push(`| 研究策略 | ${mdCode(report.options?.evidencePolicy || '—')} |`);
  lines.push(`| 故障模式 | ${mdCode(report.options?.faultMode || 'normal')} |`);
  if (configSummary) {
    lines.push(`| 装配工具 | ${mdCode(configSummary.tools || '—')} |`);
    lines.push(`| 检索范围 / 上限 | ${mdCode(configSummary.searchScope || '—')} / ${mdCode(String(configSummary.maxResults ?? '—'))} |`);
    lines.push(`| 读取方式 / 元数据 | ${mdCode(configSummary.readMode || '—')} / ${configSummary.includeMetadata ? '开启' : '关闭'} |`);
  }
  lines.push(`| 生成方式 | ${mdEscape('本地规则 + 固定模板（未调用真实语言模型、无网络请求）')} |`);
  if (run) lines.push(`| 事件数量 | ${run.events.length} |`);
  lines.push('');

  /* ---------------- 正文六部分 ---------------- */
  for (const section of report.sections || []) {
    lines.push(`## ${section.id} · ${mdEscape(section.title)}`);
    lines.push('');
    if (section.note) {
      lines.push(`> ${mdEscape(section.note)}`);
      lines.push('');
    }

    if (section.id === 'R4') {
      const list = (section.citationIds || []).map((id) => citationsById.get(id)).filter(Boolean);
      if (list.length === 0) {
        lines.push('本次运行没有可引用的片段。');
        lines.push('');
      } else {
        lines.push('| 引用 | 资料 | 片段 | 进入本次研究的事件 | 可见文本 |');
        lines.push('| --- | --- | --- | --- | --- |');
        for (const c of list) {
          lines.push(
            `| [${mdEscape(c.id)}] | ${mdCode(c.sourceId)} | ${mdCode(c.chunkId)} | ${mdCode(c.eventId)} | ${mdEscape(c.excerpt || '（元数据片段）')} |`
          );
        }
        lines.push('');
      }
      continue;
    }

    if (Array.isArray(section.itemList) && section.itemList.length) {
      for (const item of section.itemList) lines.push(`- ${mdEscape(item.text || item)}`);
      lines.push('');
      continue;
    }

    if (Array.isArray(section.items) && section.items.length) {
      for (const item of section.items) lines.push(`- ${mdEscape(item)}`);
      lines.push('');
      continue;
    }

    for (const claimId of section.claimIds || []) {
      const claim = claimsById.get(claimId);
      if (!claim) continue;
      const statusNote = claim.status === 'supported' ? '' : ` （${STATUS_LABEL[claim.status] || claim.status}）`;
      lines.push(`- ${mdEscape(claim.text)}${cit(claim.citationIds)}${statusNote}`);
    }
    lines.push('');
  }

  /* ---------------- 指标 ---------------- */
  const m = report.metrics || {};
  lines.push('## 可量化指标（来自本次模拟计算）');
  lines.push('');
  lines.push('| 指标 | 值 |');
  lines.push('| --- | --- |');
  lines.push(`| 已检索到的资料数量 | ${m.sourcesFound ?? 0} |`);
  lines.push(`| 已读取的资料数量（其中读全文） | ${m.sourcesRead ?? 0}（${m.fullTextReads ?? 0}） |`);
  lines.push(`| 有引用支持的研究发现 / 需要证据的发现 | ${m.factClaimsSupported ?? 0} / ${m.factClaimsNeeded ?? 0} |`);
  lines.push(`| 发现的冲突 / 处理完成 / 未解决 | ${m.conflictsDetected ?? 0} / ${m.conflictsResolved ?? 0} / ${m.conflictsUnresolved ?? 0} |`);
  lines.push(`| 引用条目 | ${m.citationCount ?? 0} |`);
  if (run) {
    lines.push(`| 工具调用次数 / 错误次数 | ${run.stats?.toolCalls ?? 0} / ${run.stats?.toolErrors ?? 0} |`);
    lines.push(`| 回放事件数量 | ${run.events.length} |`);
  }
  if (m.evidenceCoverage === null || m.evidenceCoverage === undefined) {
    lines.push('| 证据覆盖率 | 无可评估事实（分母为 0，不输出百分比） |');
  } else {
    lines.push(`| 证据覆盖率 | ${m.evidenceCoverage}%（本教学规则内的可追溯比例，不是现实世界准确率） |`);
  }
  lines.push('');

  /* ---------------- 未决事项 ---------------- */
  const unresolved = report.claims.filter((c) => c.status !== 'supported');
  lines.push('## 未解决问题');
  lines.push('');
  if (unresolved.length === 0) {
    lines.push('- 本次运行没有未决冲突（这不等于现实世界已被核实）。');
  } else {
    for (const c of unresolved) lines.push(`- ${mdEscape(c.text)}${cit(c.citationIds)}`);
  }
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('本文件由 AGENT / ZERO 在浏览器本地生成，没有服务端、账号系统、真实检索或真实语言模型参与。');
  lines.push('');

  return lines.join('\n');
}

/** 建议的文件名：稳定、可读、不含用户输入里的路径字符 */
export function markdownFilename(report, suffix = '') {
  const run = String(report?.runId || 'run-unknown').replace(/[^a-zA-Z0-9-]/g, '');
  const mission = String(report?.missionId || 'mission-001').toUpperCase().replace(/[^A-Z0-9-]/g, '-').replace(/-MINI$/, '');
  return `AGENT-ZERO_${mission}_${run}${suffix}.md`;
}

/**
 * 触发浏览器下载（纯前端）。
 * @returns {{ok:boolean, message:string}}
 */
export function downloadMarkdown(filename, text) {
  try {
    if (typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
      return { ok: false, message: '当前浏览器不支持本地文件下载（Blob / createObjectURL 不可用）：可改用「复制 Markdown」' };
    }
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.append(a);
    a.click();
    a.remove();
    // 只撤销 Blob URL，不保留任何额外对象
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { ok: true, message: `已生成 ${filename}（由浏览器本地下载，未上传任何数据）` };
  } catch (error) {
    return { ok: false, message: `下载被浏览器阻止：${error?.message || '未知原因'}。可改用「复制 Markdown」把文本自带出去` };
  }
}



