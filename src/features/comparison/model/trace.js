// @ts-check
import {canonicalize} from '../../../simulation/events/serializer.js';
const excluded=new Set(['runtime.control']);
function stableKey(run,e){
  const step=run.steps?.find(s=>s.stepId===e.stepId);
  const source=e.input?.sourceId||e.output?.sourceId||step?.output?.sourceId||'';
  return canonicalize([step?.action||e.phase,e.type,e.toolId||step?.moduleId||'',e.roleId||'',source]);
}
function semanticEvent(e){
  if(!e)return null;
  const clean=v=>{
    if(typeof v==='string')return v.replaceAll(e.runId||'__no_run__','$RUN').replace(/\$RUN#e\d+/g,'$EVENT');
    if(Array.isArray(v))return v.map(clean);
    if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!['instanceId','moduleInstanceId'].includes(k)).map(([k,x])=>[k,clean(x)]));
    return v;
  };
  return clean({type:e.type,status:e.status,input:e.input,output:e.output,reason:e.reason,branchId:e.branchId});
}
/** Sequence alignment by action/type/tool/role/source. LCS keeps repetitions unmatched. */
export function alignEvents(A,B){
  const a=(A?.events||[]).filter(e=>!excluded.has(e.type)),b=(B?.events||[]).filter(e=>!excluded.has(e.type));
  const ka=a.map(e=>stableKey(A,e)),kb=b.map(e=>stableKey(B,e));
  const dp=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
  for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)dp[i][j]=ka[i]===kb[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  const rows=[];let i=0,j=0;
  function push(x,y){const status=!x?'added':!y?'missing':canonicalize(semanticEvent(x))===canonicalize(semanticEvent(y))?'equal':'changed';rows.push({A:x?.eventId||null,B:y?.eventId||null,status,key:x?stableKey(A,x):stableKey(B,y),reason:x&&y?'按动作 / 类型 / 工具 / 角色 / 资料对齐':'未执行该步骤：另一侧没有同键事件，保留未匹配路径'});}
  while(i<a.length||j<b.length){if(i<a.length&&j<b.length&&ka[i]===kb[j])push(a[i++],b[j++]);else if(j<b.length&&(i===a.length||dp[i][j+1]>dp[i+1][j]))push(null,b[j++]);else push(a[i++],null);}
  return rows;
}
