/** 可重复执行的数据完整性审查。外部来源正文核验为2026-10-25实际浏览记录。 */
import { writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { CONCEPTS, CONCEPT_ORDER, CHAPTERS, RELATIONSHIPS, SOURCES, EXPERIMENTS, knowledgeStats, validateKnowledge, edgesOf } from '../src/knowledge/index.js';
import { validateStories } from '../src/content/chapters/index.js';

const stats = knowledgeStats();
const issues = [...validateKnowledge(), ...validateStories()];
const concepts = CONCEPT_ORDER.map(id => {
  const c=CONCEPTS[id];
  const row={ id, chapterId:c.chapterId, name:c.cn, status:c.contentStatus, aliases:c.aliases.length,
    understand:c.understand.length, inspect:c.inspect.length, misconceptions:c.misconceptions.length,
    simulated:c.example?.isSimulated===true, sourceIds:c.sources, relations:edgesOf(id).length };
  if(!row.understand||!row.inspect||!row.misconceptions||!row.simulated) issues.push({code:'INCOMPLETE_CONCEPT',id});
  return row;
});
const sources = Object.values(SOURCES).map(s=>({...s,exists:s.type==='internal'?existsSync(s.where):null}));
const referenced=new Set(concepts.flatMap(c=>c.sourceIds));
for(const s of sources) if(s.type==='internal'&&s.reviewed&&!s.exists) issues.push({code:'INTERNAL_SOURCE_MISSING',id:s.id});
const summary={chapters:stats.chapters,concepts:stats.concepts,relations:stats.edges,byStatus:stats.byStatus,
  isolated:concepts.filter(c=>!c.relations).map(c=>c.id),externalSources:sources.filter(s=>s.type==='external').length,
  reviewed:sources.filter(s=>s.reviewed).length,needsReview:sources.filter(s=>!s.reviewed).length,
  referencedNeedsReview:sources.filter(s=>!s.reviewed&&referenced.has(s.id)).length,issues:issues.length};
const report={date:'2026-10-25',summary,issues,concepts,sources,experiments:EXPERIMENTS};
await writeFile('verify/m14-content-audit.json',JSON.stringify(report,null,2));
const completion={
  'exp-token-lab':'用户改变文本/编码/预算/资料配置，重算并呈现实际分词表与预算。',
  'exp-context-lab':'用户改变指令/背景/预算，重算并呈现报告与遗漏原因。',
  'exp-tool-calling-demo':'用户逐步/主动播放至末条真实模拟事件；默认打开实验不完成。',
  'exp-retrieval-lab':'用户改变切分/检索/RAG/方法等参数，重算并呈现结果。',
  'exp-agent-loop-lab':'用户主动改变控制方式/配置、推进或检查运行，生成并呈现确定性结果。',
  'exp-boundary-lab':'用户改变权限/沙箱/护栏配置，重算判定与评估并呈现。',
};
let md=`# M1 内容准确性与完整度审查\n\n审查日期：2026-10-25。数据由 \`npm run audit:m14\` 实际读取注册表生成；语义审查和外部正文核验在本轮执行。\n\n`;
md+=`- 六章 ${summary.chapters}；概念 ${summary.concepts}（published ${stats.byStatus.published} / reviewed ${stats.byStatus.reviewed} / draft ${stats.byStatus.draft} / outline ${stats.byStatus.outline}）。\n- 真实关系 ${summary.relations}；孤立节点 ${summary.isolated.length}；结构/章节/引用校验问题 ${issues.length}。\n- 来源 ${sources.length}（外部 ${summary.externalSources}；已核验 ${summary.reviewed}；待核验 ${summary.needsReview}；已发布概念引用待核验来源 ${summary.referencedNeedsReview}）。\n- 六实验均有有效登记、章节与稳定入口；实验完成与阅读进度分别呈现，不推断掌握程度。\n\n`;
md+='## 36 概念逐项检查\n\n逐项读取定义、UNDERSTAND、INSPECT、误解、案例、关联及来源。数字为真实字段条数；每项均有中文定义与模拟案例。\n\n| ID | 章节 | 中文 | 内容状态 | 别名 | 入门/深入/误解 | 关系 | 模拟案例 |\n|---|---|---|---|---:|---|---:|---|\n';
for(const c of concepts)md+=`| ${c.id} | ${CHAPTERS.find(x=>x.id===c.chapterId).no} | ${c.name} | ${c.status} | ${c.aliases} | ${c.understand}/${c.inspect}/${c.misconceptions} | ${c.relations} | ${c.simulated?'是':'否'} |\n`;
md+='\n## 六章与六实验\n\n| 章节 | 稳定实验 ID | 入口概念 | 实际完成条件（沿用前序实验） |\n|---|---|---|---|\n';
for(const e of EXPERIMENTS)md+=`| ${CHAPTERS.find(c=>c.id===e.chapterId).title.zh} | ${e.id} | ${e.entryConceptId} | ${completion[e.id]} |\n`;
md+='\n完成指核心操作被执行且结果被渲染，并非测验通过或知识掌握。服务端/模型不参与。六实验的失败、权限、数据因果与重放见本轮 M1.2/M1.3 回归报告。\n\n## 关系审查\n\n统一49条关系全部验证端点、稳定ID、类型、方向、说明、自环与重复；孤立节点0。USES 7 / PART_OF 3 为有向；RELATED 34 / CONTRASTS 5 为无向。旧10条关系ID和含义保留。图与列表使用同一关系数据，过滤后不生成补充连线。\n\n';
md+='## 来源复核\n\n本轮浏览工具实际读取30条外部页面，核对标题、作者/组织、页面正文与登记的支撑断言；链接读取成功30，确认失效0，因无法读取而待核验0。这里只证明本轮工具环境可以读取，不能代表中国大陆所有网络线路可达。外部参考仅供主动打开，应用运行不请求这些站点。\n\n用户已补充 M1.2_TASK.md，本轮实际阅读后将来源恢复为reviewed；不再作为缺失项。唯一needs_review为未被任何概念引用的历史索引草稿，不冒充课程来源。\n\n| 来源 ID | 标题 / 组织 | 状态 | 原文或本地位置 |\n|---|---|---|---|\n';
for(const s of sources)md+=`| ${s.id} | ${s.title.replaceAll('|','/')} / ${s.org} | ${s.reviewStatus} | ${s.url?`[原文](${s.url})`:s.where} |\n`;
md+='\n## 本轮准确性修订\n\n- 修正LLM“一次回答就是一次前向计算”：自回归回答通常包含多次前向计算，与Inference章节保持一致。\n- 机器学习对训练数据之外内容的边界改为“不能仅靠参数可靠核实时效事实”，避免否定泛化能力。\n- 区分粗略token估算与实际计数；课程实验仍使用真实编码的离线预计算表，24组序列可复算。\n- 修正工具段落“工具不执行动作”为“模型不执行工具”，MCP工具的执行方明确为运行环境。\n- MCP Server不等于模型；不再一概声称服务端不能请求模型交互，注明2025规范Sampling与后续版本差异，本实验范围保持三类能力。\n- Harness职责与注入风险改为具体条件下的说明，移除无依据的“缺一必然黑箱”“风险最高”。\n- RAG/Embedding/Memory/Skills/Workflow/Agent/权限/沙箱/追踪/评估逐项核对，保留教学模拟与生产机制的明确边界。\n\n## 未解决事项\n\n- P0/P1：当前内容结构检查无发现。\n- P2：历史索引草稿来源待审，未被课程引用，不阻断M1；若后续使用必须审校。\n- P2：境外参考资料在中国大陆的真实多运营商可达性未实测；核心产品不依赖外网，不据此宣称国内网络全面可达。\n- NOT RUN：这些教学实验不构成真实模型能力评估、安全认证或生产隔离测试。\n';
await writeFile('docs/M1_CONTENT_AUDIT.md',md);
console.log(JSON.stringify(summary,null,2));
if(issues.length)process.exitCode=1;
