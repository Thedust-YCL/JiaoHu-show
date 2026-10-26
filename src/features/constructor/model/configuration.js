import { MODULES, getModule, defaultSettings, defaultPermissions } from './modules.js';
import { preflight } from './preflight.js';

export const AGENT_SCHEMA_VERSION = 2;
export const MAX_CONFIG_BYTES = 240000;
export const DEFAULT_RUNTIME = Object.freeze({executionMode:'workflow',maxSteps:24,maxRetries:1,stopWhenInsufficient:true,requireApprovalForRestrictedActions:true});
export function newId(prefix='id') { return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`; }
const copy = value => JSON.parse(JSON.stringify(value));

/** Validate serializable JSON before copying. Never silently strip a function/secret. */
export function serializeAgentConfiguration(value) {
  const seen=new Set();
  function visit(v,depth=0) {
    if(depth>24)throw Error('配置嵌套过深');
    if(v===null||typeof v==='boolean'||typeof v==='string')return;
    if(typeof v==='number'&&Number.isFinite(v))return;
    if(typeof v!=='object')throw Error('配置必须只包含 JSON 数据');
    if(seen.has(v))throw Error('配置含循环引用');
    if(!Array.isArray(v)&&Object.getPrototypeOf(v)!==Object.prototype&&Object.getPrototypeOf(v)!==null)throw Error('配置不能包含 DOM 或运行时对象');
    seen.add(v);
    if(Array.isArray(v)&&v.length>200)throw Error('数组过长');
    for(const [key,child] of Object.entries(v)) {
      if(['__proto__','prototype','constructor'].includes(key)||/^(api[_-]?key|password|cookie|secret|access[_-]?token|authorization)$/i.test(key))throw Error('配置不能包含秘密或危险字段');
      visit(child,depth+1);
    }
    seen.delete(v);
  }
  visit(value);
  const raw=JSON.stringify(value);
  if(new TextEncoder().encode(raw).length>MAX_CONFIG_BYTES)throw Error('配置超过 240 KB 限制');
  return JSON.parse(raw);
}

export function createConfiguration({name='Untitled Research Agent',configId=newId('agent'),now=new Date().toISOString()}={}) {
  return {schemaVersion:2,configId,name,description:'本地模拟研究 Agent',createdAt:now,updatedAt:now,modules:[],connections:[],settings:{...DEFAULT_RUNTIME}};
}
export function createInstance(moduleId,order=0,id=newId('module')) {
  const mod=getModule(moduleId);if(!mod)throw Error('未知模块');
  return {instanceId:id,moduleId,moduleType:mod.moduleType,portId:mod.portId,enabled:true,order,settings:defaultSettings(moduleId),permissions:defaultPermissions()};
}
export function createExample(kind='starter') {
  const c=createConfiguration({name:kind==='evidence-first'?'Research Assistant — Evidence First':'Research Assistant — Starter'});
  const ids=kind==='evidence-first'?Object.keys(MODULES):['model','instructions','context','announcement_search','document_reader','runtime','guardrails'];
  c.modules=ids.map((id,i)=>createInstance(id,i));
  for(const m of c.modules)if(m.moduleType==='tools')m.permissions.read=true;
  if(kind==='evidence-first') {
    c.settings.executionMode='agent-loop';
    c.modules.find(m=>m.moduleId==='context').settings.includeRetrieval=true;
    c.modules.find(m=>m.moduleId==='model').settings.preset='careful';
    c.modules.find(m=>m.moduleId==='document_reader').settings.readMode='full_text';
  }
  return c;
}

/** Raw v1 JSON is migrated directly; unknown data is preserved, never normalized away. */
export function migrateConfiguration(raw) {
  const data=serializeAgentConfiguration(typeof raw==='string'?JSON.parse(raw):raw);
  if(!data||Array.isArray(data)||typeof data!=='object'||!Array.isArray(data.modules))throw Error('配置结构不正确');
  if(data.modules.some(m=>!m||typeof m!=='object'||Array.isArray(m)||typeof m.moduleId!=='string'))throw Error('模块记录结构损坏，原始配置需要恢复');
  if(data.connections!==undefined&&!Array.isArray(data.connections))throw Error('连接集合结构损坏');
  if(data.settings!==undefined&&(!data.settings||typeof data.settings!=='object'||Array.isArray(data.settings)))throw Error('运行设置结构损坏');
  if(!Number.isInteger(data.schemaVersion)||data.schemaVersion>2||data.schemaVersion<0)throw Error('暂不支持此配置版本，请保留原始数据');
  if(data.schemaVersion===2) {
    if(typeof data.configId!=='string'||!data.configId||typeof data.name!=='string'||!data.settings||typeof data.settings!=='object'||Array.isArray(data.settings)||!Array.isArray(data.connections)||data.modules.some(m=>!m||typeof m!=='object'||Array.isArray(m)||typeof m.moduleId!=='string'))throw Error('配置必要字段结构损坏');
    return {configuration:data,migrated:false};
  }
  const c={...createConfiguration({name:'Migrated M0.2 Research Agent'}),...data,schemaVersion:2,settings:{...DEFAULT_RUNTIME,...(data.settings||{})},connections:data.connections||[]};
  c.modules=data.modules.map((m,i)=>{
    const mod=getModule(m.moduleId);
    return {...m,instanceId:m.instanceId||`legacy-${c.configId}-${i}`,moduleType:m.moduleType||mod?.moduleType||'unknown',order:m.order??i,
      settings:m.settings===undefined?(mod?defaultSettings(m.moduleId):{}):(mod&&m.settings&&typeof m.settings==='object'&&!Array.isArray(m.settings)?{...defaultSettings(m.moduleId),...m.settings}:m.settings)};
  });
  c.compatibility={...(data.compatibility||{}),migratedFrom:data.schemaVersion};
  return {configuration:c,migrated:true};
}
export function cloneConfiguration(input) {
  const c=serializeAgentConfiguration(input);const ids=new Map();
  c.configId=newId('agent');c.name=`${c.name} · 副本`.slice(0,80);c.createdAt=c.updatedAt=new Date().toISOString();
  c.modules=c.modules.map(m=>{const instanceId=newId('module');ids.set(m.instanceId,instanceId);return {...m,instanceId};});
  c.connections=(c.connections||[]).map(e=>({...e,id:newId('connection'),sourceInstanceId:ids.get(e.sourceInstanceId)||e.sourceInstanceId,targetInstanceId:ids.get(e.targetInstanceId)||e.targetInstanceId}));
  return c;
}
export function configurationFingerprint(c) { const safe=serializeAgentConfiguration(c);delete safe.updatedAt;return JSON.stringify(safe); }
/** M2.2 contract. Validation and snapshot are independent of rendering and storage. */
export function prepareSimulationInput(configuration) {
  const snapshot=serializeAgentConfiguration(configuration);const validation=preflight(snapshot);
  return {interfaceVersion:1,simulationOnly:true,ready:validation.ready,configuration:snapshot,preflight:validation};
}
/** Existing M0 experiments consume only their two-tool contract; historical runs remain untouched. */
export function legacySimulationProjection(c) {
  const guard=c.modules.find(m=>m.moduleId==='guardrails'&&m.enabled);
  return {schemaVersion:1,modules:c.modules.filter(m=>['announcement_search','document_reader'].includes(m?.moduleId)).map(m=>({moduleId:m.moduleId,portId:m.portId,enabled:m.enabled,permissions:{read:m.permissions?.read===true&&m.settings?.resourceScope!=='private'&&guard?.settings?.allowPublicRead!==false},settings:Object.fromEntries(Object.entries(m.settings||{}).filter(([key])=>['searchScope','maxResults','readMode','includeMetadata'].includes(key)))}))};
}
