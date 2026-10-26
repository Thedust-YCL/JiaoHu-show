// @ts-check
/** Bounded, isolated v3 runs. Keep damaged rows until an explicit, scoped delete. */
import { restoreRuntime } from '../../../simulation/engine/runtime.js';
export const RUNTIME_HISTORY_KEY='agent-zero:runtime:v1';
export const MAX_RUNTIME_HISTORY=5;
const MAX_HISTORY_CHARS=2400000;
function envelope(storage) {
  const raw=storage?.getItem(RUNTIME_HISTORY_KEY);
  if(raw===null||raw===undefined)return {schemaVersion:1,runs:[]};
  if(raw.length>MAX_HISTORY_CHARS)throw Error('运行历史超过本地容量限制');
  const e=JSON.parse(raw);
  if(e?.schemaVersion!==1||!Array.isArray(e.runs)||e.runs.length>30)throw Error('运行历史版本或结构损坏');
  return e;
}
export function readRuntimeHistory(storage) {
  const runs=[],corrupt=[];
  try {
    const e=envelope(storage),ids=new Set();
    for(const [index,row] of e.runs.entries()) {
      try {
        if(typeof row?.runId!=='string'||ids.has(row.runId))throw Error('运行 ID 缺失或重复');
        restoreRuntime(row,{pauseRunning:false});ids.add(row.runId);runs.push(row);
      } catch(error) {corrupt.push({key:`corrupt:${index}`,reason:error.message});}
    }
    return {runs,corrupt,locked:false,notice:corrupt.length?`${corrupt.length} 条运行记录损坏或版本不兼容，原始条目已保留，可单独移除。`:null};
  } catch(error) {return {runs,corrupt:[{key:'corrupt-envelope',reason:error.message}],locked:true,notice:'运行历史损坏，已保护原始数据；可明确移除损坏的历史集合。'};}
}
export function saveRuntimeRun(storage,run) {
  if(!storage)return {ok:false,notice:'本地存储不可用；当前运行仍可检查。'};
  try {
    restoreRuntime(run,{pauseRunning:false});
    const e=envelope(storage),read=readRuntimeHistory(storage);
    const valid=new Set(read.runs.map(r=>r.runId));
    const damaged=new Set(read.corrupt.map(c=>Number(c.key.split(':')[1])));
    const recent=[run,...e.runs.filter((r,i)=>!damaged.has(i)&&valid.has(r.runId)&&r.runId!==run.runId)].slice(0,MAX_RUNTIME_HISTORY);
    const kept=[...recent,...e.runs.filter((r,i)=>damaged.has(i))];
    const raw=JSON.stringify({schemaVersion:1,runs:kept});
    if(raw.length>MAX_HISTORY_CHARS)throw Error('运行历史容量不足；请单独删除旧记录');
    storage.setItem(RUNTIME_HISTORY_KEY,raw);
    return {ok:true,notice:read.notice,evicted:Math.max(0,read.runs.length+(valid.has(run.runId)?0:1)-MAX_RUNTIME_HISTORY)};
  } catch(error) {return {ok:false,notice:`未保存运行：${error.message}；现有记录未被清空。`};}
}
export function deleteRuntimeRun(storage,key) {
  try {
    if(key==='corrupt-envelope') {
      if(!readRuntimeHistory(storage).locked)throw Error('历史结构已恢复，请重新选择条目');
      storage.removeItem(RUNTIME_HISTORY_KEY);return {ok:true};
    }
    const e=envelope(storage);
    if(key.startsWith('corrupt:')) {
      const target=readRuntimeHistory(storage).corrupt.find(c=>c.key===key);
      if(!target)throw Error('损坏条目已变化，请重新选择');
      e.runs.splice(Number(key.split(':')[1]),1);
    } else e.runs=e.runs.filter(r=>r?.runId!==key);
    storage.setItem(RUNTIME_HISTORY_KEY,JSON.stringify(e));return {ok:true};
  } catch(error){return {ok:false,notice:`删除未完成：${error.message}`};}
}
