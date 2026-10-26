// @ts-check
/** Read-only bridge to the M0.4 report/citation system. No rule execution here. */
import {generateReport} from '../../../simulation/reports/generateReport.js';
import {MISSION_001} from '../../../research-packs/mission-001/index.js';
import {deepClone} from '../../../simulation/events/serializer.js';

export function runtimeReport(run) {
  if(!run)return {report:null,reads:[],evidence:null};
  const reads=run.events.filter(e=>e.type==='tool.result'&&e.toolId==='document_reader'&&e.output?.chunks?.length).map(e=>({...deepClone(e.output),eventId:e.eventId}));
  const checked=[...run.events].reverse().find(e=>e.type==='evidence.claims_extracted');
  const evidence=checked?deepClone(checked.output):null;
  if(evidence){
    // Both conflict and resolution happened at this saved check, not in a new run.
    for(const x of [...evidence.conflicts,...evidence.resolutions])x.eventId=checked.eventId;
  }
  const mod=id=>run.configSnapshot.modules.find(m=>m.moduleId===id&&m.enabled);
  const plan=run.steps.find(s=>s.action==='PLAN')?.output;
  const report=generateReport({runId:run.runId,mission:{missionId:run.missionId,missionVersion:run.missionVersion,corpusVersion:run.corpusVersion,title:run.result?.objective||'校园活动研究'},evidence,reads,
    options:{evidencePolicy:plan?.policy||'COLLECT_ONLY'},
    config:{...mod('announcement_search')?.settings,...mod('document_reader')?.settings,tools:run.configSnapshot.modules.filter(m=>m.moduleType==='tools'&&m.enabled).map(m=>m.moduleId).join(', ')},
    blocked:!checked?{reason:run.result?.terminationReason||'尚未执行证据检查'}:null,stats:run.summary});
  const insufficient=run.result?.evidenceStatus!=='sufficient';
  if(insufficient)for(const claim of report.claims)if(claim.kind==='finding'&&claim.status==='supported')claim.status='insufficient';
  if(run.status!=='completed'||insufficient)report.status=checked?'partial':'blocked';
  const facts=report.claims.filter(c=>c.kind==='finding');
  report.metrics.sourcesFound=new Set(run.events.filter(e=>e.type==='tool.result'&&e.toolId==='announcement_search').flatMap(e=>(e.output.items||[]).map(x=>x.sourceId))).size;
  report.metrics.factClaimsNeeded=facts.length;
  report.metrics.factClaimsSupported=facts.filter(c=>c.status==='supported'&&c.citationIds.length&&c.citationIds.every(id=>resolveCitation(run,report,id).valid)).length;
  report.metrics.evidenceCoverage=facts.length?Math.round(report.metrics.factClaimsSupported/facts.length*100):null;
  report.limitations=[...new Set([...report.limitations,...(run.result?.limitations||[]),`运行终态 ${run.status}；终止原因 ${run.result?.terminationReason||'未终止'}`])];
  return {report,reads,evidence};
}

/** Resolve only against that Run's visible tool output, including old corpus versions. */
export function resolveCitation(run,report,id) {
  const citation=report?.citations?.find(c=>c.id===id);
  const event=run?.events?.find(e=>e.eventId===citation?.eventId&&e.type==='tool.result'&&e.toolId==='document_reader');
  const chunk=event?.output?.sourceId===citation?.sourceId?event.output.chunks?.find(c=>c.chunkId===citation?.chunkId):null;
  const excerpt=citation?.excerpt?.replace(/…$/,'');
  const valid=!!(citation&&chunk&&excerpt&&chunk.text.includes(excerpt)&&(!citation.anchor||chunk.text.includes(citation.anchor)));
  return {valid,citation,event,chunk,reason:valid?'本次工具返回片段与引用相符':'历史引用缺失或片段不支持此引用；不认定已核验'};
}
export const currentDataset=()=>({taskId:MISSION_001.missionId,datasetId:MISSION_001.missionId,datasetVersion:MISSION_001.corpusVersion,missionVersion:MISSION_001.missionVersion});
