// @ts-check
import {mdEscape,downloadMarkdown} from '../../reports/export/markdown.js';
import {configurationDiff,reproducibility,APPROVAL_POLICIES} from '../model/experiment.js';
export const valueText=v=>v===null||v===undefined?'N/A':typeof v==='object'?JSON.stringify(v):String(v);
const safe=v=>mdEscape(valueText(v)).replace(/\r?\n/g,' / ').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
export function experimentToMarkdown(e){
  const lines=[`# AGENT / ZERO · ${safe(e.title)}`,'','SIMULATION / 本地模拟 · 虚构教学资料；浏览器本地规则与模板，不是实际模型评测。','',`生成日期：${safe(e.updatedAt)}`,`实验：${safe(e.experimentId)} · schema ${e.schemaVersion} · 算法 ${safe(e.comparisonAlgorithmVersion)}`,'','## 共同条件',''];
  for(const [k,v] of Object.entries(e.controls))lines.push(`- ${safe(k)}: ${safe(v)}`);
  lines.push(`- 审批脚本：${safe(APPROVAL_POLICIES[e.controls.approvalPolicyId])}`,'','## 配置差异','','| 字段 | A | B |','| --- | --- | --- |');
  const diffs=configurationDiff(e.A.configSnapshot,e.B.configSnapshot).filter(d=>!d.equal);
  if(!diffs.length)lines.push('| 无语义差异 | 相同 | 相同 |');
  for(const d of diffs)lines.push(`| ${safe(d.field)} | ${safe(d.A)} | ${safe(d.B)} |`);
  lines.push('','## 运行指标','','| 定义 / 算法 | A | B | 差异状态 |','| --- | --- | --- | --- |');
  for(const m of e.comparison?.metrics||[])lines.push(`| ${safe(m.definition)} / ${safe(m.algorithm)} | ${safe(m.A.value)} | ${safe(m.B.value)} | ${safe(m.status)} |`);
  for(const w of e.comparison?.warnings||[])lines.push(`警告：${safe(w)}`);
  lines.push('','## 关键不同路径（真实事件）','');
  for(const row of e.alignment||[])if(row.status!=='equal')lines.push(`- ${safe(row.status)}: A ${safe(row.A)} / B ${safe(row.B)} · ${safe(row.reason)}`);
  if(!(e.alignment||[]).some(x=>x.status!=='equal'))lines.push('- 没有不同路径；不强行制造差异。');
  for(const side of ['A','B']){
    const s=e[side];lines.push('',`## ${side} · ${safe(s.configSnapshot.name)}`,'',`Run: ${safe(s.run?.runId)} · 状态 ${safe(s.run?.status)} · 终止 ${safe(s.run?.result?.terminationReason)}`,`结论：${safe(s.run?.result?.conclusion||'未生成研究结论')}`,'','### 研究发现','');
    for(const c of s.report?.claims.filter(c=>c.kind==='finding')||[])lines.push(`- ${safe(c.text)}（${safe(c.status)}）${c.citationIds.map(id=>` [${side}-${safe(id)}]`).join('')}`);
    lines.push('','### 来源 / sourceId → chunkId → eventId','');
    for(const c of s.report?.citations||[])lines.push(`- [${side}-${safe(c.id)}] ${safe(c.sourceId)} → ${safe(c.chunkId)} → ${safe(c.eventId)}：${safe(c.excerpt)}`);
    lines.push('','### 审批输入','');for(const a of s.approvalInputs)lines.push(`- ${safe(a.requestEventId)} → ${safe(a.decision)}（${safe(a.policyId)}）`);
    lines.push('','### 局限 / 未解决项','');for(const x of s.report?.limitations||[])lines.push(`- ${safe(x)}`);
    if(!s.run)lines.push('- 未运行：预检失败；所有运行指标为 N/A。');
  }
  const exact=reproducibility(e);lines.push('','## 复现与比较边界','',exact.exact?'当前打包版本可按原快照与条件精确重跑。':`不可精确复现：${safe(exact.reasons.join('；'))}`,'步骤较少不等于更好；没有真实 Token、费用、网络延迟、模型准确率或性能提升推断。','');return lines.join('\n');
}
export function downloadExperiment(e){return downloadMarkdown(`AGENT-ZERO_AB_${e.experimentId.replace(/[^a-zA-Z0-9-]/g,'')}.md`,experimentToMarkdown(e));}
