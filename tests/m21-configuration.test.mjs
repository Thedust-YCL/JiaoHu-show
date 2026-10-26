import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfiguration, createExample, migrateConfiguration, cloneConfiguration, serializeAgentConfiguration, prepareSimulationInput } from '../src/features/constructor/model/configuration.js';
import { preflight } from '../src/features/constructor/model/preflight.js';
import { MODULES } from '../src/features/constructor/model/modules.js';
import { validateModuleConfig } from '../src/features/constructor/model/validation.js';
import { previewRetrieval } from '../src/features/constructor/model/preflight.js';
import { runSimulation } from '../src/simulation/engine/runSimulation.js';
import { MISSION_001 } from '../src/research-packs/mission-001/index.js';
import { legacySimulationProjection } from '../src/features/constructor/model/configuration.js';
import { retrieve } from '../src/features/laboratory/knowledge/retrieval.js';
import { getConcept } from '../src/knowledge/index.js';
import { createConstructorStore } from '../src/features/constructor/state/store.js';
import { memoryStorage } from './helpers.mjs';

const find = (c, id) => c.modules.find(m => m.moduleId === id);
const errors = c => preflight(c).issues.filter(i => i.level === 'error');

test('M21 两个示例合法且十类模块均可序列化', () => {
  for (const kind of ['starter', 'evidence-first']) {
    const c = createExample(kind);
    assert.equal(c.schemaVersion, 2);
    assert.equal(new Set(Object.values(MODULES).map(m => m.moduleType)).size, 10);
    assert.deepEqual(errors(c), []);
    assert.deepEqual(JSON.parse(JSON.stringify(c)), c);
    assert.equal(prepareSimulationInput(c).ready, true);
  }
});
test('M21 v1 迁移不修改旧数据且保留工具参数和未知项', () => {
  const old = { schemaVersion: 1, modules: [{ moduleId:'announcement_search',portId:'SEARCH_PORT',enabled:true,permissions:{read:true},settings:{searchScope:'campus_events',maxResults:3,customHint:'保留'} }, {moduleId:'future-module',enabled:false,settings:{value:42}}] };
  const before=JSON.stringify(old); const result=migrateConfiguration(old);
  assert.equal(result.configuration.schemaVersion,2);
  assert.equal(find(result.configuration,'announcement_search').settings.maxResults,3);
  assert.equal(find(result.configuration,'announcement_search').settings.customHint,'保留');
  assert.ok(find(result.configuration,'future-module'));
  assert.ok(preflight(result.configuration).issues.some(i=>i.code==='UNKNOWN_MODULE'));
  assert.ok(preflight(result.configuration).issues.some(i=>i.code==='UNKNOWN_FIELD'));
  assert.equal(JSON.stringify(old),before);
});
test('M21 复制生成全新 ID 并修复显式连线', () => {
  const c=createExample('starter'); const model=find(c,'model');const context=find(c,'context');
  c.connections=[{id:'edge-original',sourceInstanceId:model.instanceId,targetInstanceId:context.instanceId,type:'provides-context',enabled:true}];
  const copy=cloneConfiguration(c);
  assert.notEqual(copy.configId,c.configId);
  assert.ok(copy.modules.every(m=>!c.modules.some(old=>old.instanceId===m.instanceId)));
  assert.equal(copy.connections[0].sourceInstanceId,find(copy,'model').instanceId);
  assert.notEqual(copy.connections[0].id,'edge-original');
  assert.deepEqual(find(copy,'context').settings,context.settings);
});
test('M21 依赖、权限冲突和审批错误可定位且排序稳定', () => {
  const c=createExample('evidence-first'); c.modules=c.modules.filter(m=>m.moduleId!=='context');
  find(c,'guardrails').settings.allowPublicRead=false;
  c.settings.requireApprovalForRestrictedActions=false;
  find(c,'guardrails').settings.allowPrivateRecords=true;
  const result=preflight(c);
  assert.ok(result.issues.some(i=>i.code==='MISSING_DEPENDENCY'&&i.moduleId==='retrieval'));
  assert.ok(result.issues.some(i=>i.code==='PERMISSION_DENIED'));
  assert.ok(result.issues.some(i=>i.code==='APPROVAL_REQUIRED'));
  assert.ok(result.issues.every(i=>i.id&&i.title&&i.description&&i.suggestion));
  assert.deepEqual(result,preflight(JSON.parse(JSON.stringify(c))));
  assert.equal(result.ready,false);
});
test('M21 未知引用、空检索源和非法预算不被默认为有效', () => {
  const c=createExample('evidence-first');
  find(c,'retrieval').settings.sourceIds=[];
  find(c,'skills').settings.skillIds=['missing-skill'];
  find(c,'memory').settings.entryIds=['journal-entry'];
  find(c,'context').settings.budget=0;
  c.settings.maxSteps=0;c.settings.maxRetries=100;
  const issues=errors(c);
  for(const code of ['NO_SOURCES','UNKNOWN_REFERENCE','INVALID_VALUE'])assert.ok(issues.some(i=>i.code===code),code);
});
test('M21 MCP 静态能力与启用依赖校验，Skill 不提升权限', () => {
  const c=createExample('evidence-first');find(c,'announcement_search').settings.connectionMode='mcp';
  find(c,'mcp').enabled=false;
  assert.ok(errors(c).some(i=>i.code==='MCP_DISABLED'));
  find(c,'mcp').enabled=true;find(c,'mcp').settings.capabilityIds=['unregistered'];
  assert.ok(errors(c).some(i=>i.code==='UNKNOWN_REFERENCE'));
  find(c,'announcement_search').permissions.read=false;
  assert.ok(errors(c).some(i=>i.code==='PERMISSION_REQUIRED'));
  assert.equal(find(c,'announcement_search').permissions.read,false);
});
test('M21 连接不能以无语义边或禁用引用伪装 active', () => {
  const c=createExample('starter');const a=find(c,'model'),b=find(c,'context');
  c.connections=[{id:'edge',sourceInstanceId:a.instanceId,targetInstanceId:b.instanceId,type:'pretty-line',enabled:true}];
  assert.ok(errors(c).some(i=>i.code==='INVALID_CONNECTION'));
  c.connections[0].type='provides-context';b.enabled=false;
  assert.ok(errors(c).some(i=>i.code==='DISABLED_CONNECTION'));
  assert.equal(preflight(c).explicitConnections[0].valid,false);
});
test('M21 序列化拒绝秘密、函数、循环对象及过大输入', () => {
  for(const value of [{apiKey:'secret'}, {callback:()=>{}}, {description:'x'.repeat(300000)}]) {
    assert.throws(()=>serializeAgentConfiguration({...createConfiguration(),...value}));
  }
  const c=createConfiguration();c.loop=c;assert.throws(()=>serializeAgentConfiguration(c));
  assert.throws(()=>migrateConfiguration({schemaVersion:999,modules:[]}));
});
test('M21 同一 store 的安装、修改、禁用与移除更新快照和预检', () => {
  const s=createConstructorStore({storage:memoryStorage()});
  s.actions.commit('model');s.actions.commit('context');
  assert.ok(s.getConfiguration().configId);
  const id=s.getInstalled('context').instanceId;
  s.actions.configure('context',{budget:900});
  assert.equal(find(s.getConfiguration(),'context').settings.budget,900);
  s.actions.configure('context',{budget:-1});
  assert.equal(s.getInstalled('context').settings.budget,900);
  s.actions.setEnabled('context',false);assert.equal(s.statusOf('context'),'Disabled');
  s.actions.remove('context');assert.ok(!s.getConfiguration().modules.some(m=>m.instanceId===id));
});
test('M21 Runtime Inspector 只写根 settings 一份数据', () => {
  const s=createConstructorStore({storage:memoryStorage()});s.actions.commit('runtime');
  s.actions.configure('runtime',{executionMode:'agent-loop',maxSteps:12});
  assert.equal(s.getConfiguration().settings.maxSteps,12);
  assert.equal(s.getConfiguration().settings.executionMode,'agent-loop');
  assert.deepEqual(s.getInstalled('runtime').settings,{});
});
test('M21 保存/加载/复制/重命名/删除与草稿恢复互不污染其他数据', () => {
  const storage=memoryStorage({'agent-zero:journal:v1':'journal','agent-zero:research:v2':'runs'});
  const s=createConstructorStore({storage});s.actions.useExample('starter',true);
  assert.equal(s.actions.save().ok,true);const id=s.getConfiguration().configId;
  s.actions.configure('model',{preset:'careful'});assert.equal(s.isDirty(),true);
  assert.equal(s.actions.load(id).ok,false,'未确认不能丢弃草稿');
  assert.equal(createConstructorStore({storage}).getInstalled('model').settings.preset,'careful');
  s.actions.load(id,true);assert.equal(s.getInstalled('model').settings.preset,'balanced');
  s.actions.copy();const copy=s.getConfiguration().configId;assert.notEqual(copy,id);
  s.actions.rename('副本研究');s.actions.save();assert.equal(s.listConfigurations().length,2);
  assert.equal(s.actions.delete(id).ok,false);s.actions.delete(id,true);
  assert.equal(s.listConfigurations().length,1);assert.equal(s.getConfiguration().name,'副本研究');
  assert.equal(storage.getItem('agent-zero:journal:v1'),'journal');assert.equal(storage.getItem('agent-zero:research:v2'),'runs');
});
test('M21 损坏存储不可被自动覆写且有明确恢复路径', () => {
  const storage=memoryStorage({'agent-zero:constructor:v2':'{broken'});
  const s=createConstructorStore({storage});s.actions.commit('model');
  assert.equal(storage.getItem('agent-zero:constructor:v2'),'{broken');
  assert.equal(s.actions.save().ok,false);
  assert.equal(s.storageStatus().blocked,true);
  assert.equal(s.actions.recoverStorage(true).ok,true);
  assert.equal(s.storageStatus().blocked,false);
  assert.ok(storage.getItem('agent-zero:constructor:v2:recovery'));
});
test('M21 配额失败不会显示保存成功，原快照保持可加载', () => {
  const backing=memoryStorage();let fail=false;
  const storage={getItem:k=>backing.getItem(k),removeItem:k=>backing.removeItem(k),setItem:(k,v)=>{if(fail)throw Error('QuotaExceeded');backing.setItem(k,v)}};
  const s=createConstructorStore({storage});s.actions.useExample('starter',true);s.actions.save();
  fail=true;s.actions.rename('未保存名称');assert.equal(s.actions.save().ok,false);
  assert.equal(s.isDirty(),true);assert.notEqual(s.listConfigurations()[0].name,'未保存名称');
});
test('M21 损坏的内部字段和原型名称模块只产生可定位问题，不使预检崩溃',()=>{
  for(const mutate of [c=>find(c,'context').settings=null,c=>find(c,'retrieval').settings.sourceIds=42,c=>c.connections=[null],c=>c.modules.push({moduleId:'toString',instanceId:'future',enabled:true,settings:{futureField:'保留'}})]) {
    const c=createExample('evidence-first');mutate(c);
    assert.doesNotThrow(()=>preflight(c));
    assert.equal(preflight(c).ready,false);
  }
});
test('M21 未知字段和禁用模块经编辑、保存、刷新仍完整保留',()=>{
  const c=createExample('starter');c.futureFeature={flag:true};find(c,'model').settings.futureParam='保留';
  c.modules.push({moduleId:'future-module',instanceId:'future-1',enabled:false,settings:{nested:{value:'保留'}}});
  const storage=memoryStorage({'agent-zero:constructor:v1':JSON.stringify(c)});
  const s=createConstructorStore({storage});s.actions.configure('model',{preset:'concise'});assert.equal(s.actions.save().ok,true);
  const reloaded=createConstructorStore({storage}).getConfiguration();
  assert.deepEqual(reloaded.futureFeature,{flag:true});assert.equal(find(reloaded,'model').settings.futureParam,'保留');
  assert.equal(find(reloaded,'future-module').settings.nested.value,'保留');assert.equal(JSON.parse(storage.getItem('agent-zero:constructor:v1')).futureFeature.flag,true);
});
test('M21 未来集合版本锁定原始数据，单条未来配置隔离但可加载其他条目',()=>{
  const c=createExample('starter');const future=JSON.stringify({schemaVersion:900,draft:c,configurations:[]});
  const storage=memoryStorage({'agent-zero:constructor:v2':future});const s=createConstructorStore({storage});s.actions.commit('model');
  assert.equal(storage.getItem('agent-zero:constructor:v2'),future);assert.equal(s.storageStatus().blocked,true);
  const mixed=memoryStorage({'agent-zero:constructor:v2':JSON.stringify({schemaVersion:2,draft:c,configurations:[c,{schemaVersion:900,modules:[]}]})});
  const restored=createConstructorStore({storage:mixed});assert.equal(restored.listConfigurations().length,1);assert.equal(restored.storageStatus().quarantined,1);
  restored.actions.configure('model',{preset:'concise'});restored.actions.save(true);
  assert.equal(JSON.parse(mixed.getItem('agent-zero:constructor:v2')).quarantined[0].schemaVersion,900);
});
test('M21 禁用停用显式边、移除清理引用，并保留其他具名配置',()=>{
  const c=createExample('starter'),a=find(c,'model'),b=find(c,'context');
  c.connections=[{id:'edge-1',sourceInstanceId:a.instanceId,targetInstanceId:b.instanceId,type:'provides-context',enabled:true}];
  const storage=memoryStorage({'agent-zero:constructor:v2':JSON.stringify({schemaVersion:2,draft:c,configurations:[c]})});const s=createConstructorStore({storage});
  s.actions.setEnabled('context',false);assert.equal(s.getConfiguration().connections[0].enabled,false);
  s.actions.remove('context');assert.deepEqual(s.getConfiguration().connections,[]);
  s.actions.load(c.configId,true);assert.equal(s.getConfiguration().connections[0].targetInstanceId,b.instanceId);
});
test('M21 Retrieval 直接复用 Knowledge Lab 排序并对非法源安全返回',()=>{
  const c=createExample('evidence-first');find(c,'retrieval').settings.topK=3;
  const preview=previewRetrieval(c);
  const expected=retrieve({chunks:preview.chunking.chunks,questionId:find(c,'retrieval').settings.questionId,mode:'keyword',topK:3});
  assert.deepEqual(preview.retrieval,expected);assert.ok(preview.retrieval.candidates.length<=3);
  find(c,'retrieval').settings.sourceIds=42;assert.equal(previewRetrieval(c),null);
});
test('M21 全部共享字段拒绝错误类型，审批由根字段而非模块副本承载',()=>{
  const c=createExample('evidence-first');
  for(const mod of Object.values(MODULES))for(const field of mod.fields) {
    if(field.scope==='root'&&mod.id!=='runtime')continue;
    const m=find(c,mod.id);const values={...(mod.id==='runtime'?c.settings:m.settings),[field.key]:{bad:true}};
    assert.ok(validateModuleConfig(mod.id,values,{read:true}).errors.some(e=>e.field===field.key),`${mod.id}.${field.key}`);
  }
  assert.equal(find(c,'guardrails').settings.requireApproval,undefined);
});
test('M21 旧研究事件、报告、引用不会被构建器编辑复制删除改写',()=>{
  const storage=memoryStorage();const s=createConstructorStore({storage});s.actions.useExample('starter',true);s.actions.save();
  const id=s.getConfiguration().configId;
  const run=runSimulation(legacySimulationProjection(s.getConfiguration()),MISSION_001);const before=JSON.stringify(run);
  storage.setItem('agent-zero:research:v2',before);s.actions.configure('model',{preset:'concise'});s.actions.copy();s.actions.delete(id,true);s.actions.reset();
  assert.equal(JSON.stringify(run),before);assert.equal(storage.getItem('agent-zero:research:v2'),before);
});
test('M21 原型名称的连接类型不能绕过静态关系白名单',()=>{
  const c=createExample('starter');
  for(const type of ['toString','hasOwnProperty']) {
    c.connections=[{id:'bad-edge',sourceInstanceId:find(c,'model').instanceId,targetInstanceId:find(c,'instructions').instanceId,type,enabled:true}];
    assert.doesNotThrow(()=>preflight(c));assert.ok(errors(c).some(i=>i.code==='INVALID_CONNECTION'));
  }
});
test('M21 v1 非对象模块记录锁定原始旧键，页面仍有安全空草稿',()=>{
  for(const invalid of [null,42,'bad',{missingModuleId:true}]) {
    const raw=JSON.stringify({schemaVersion:1,modules:[invalid]});const storage=memoryStorage({'agent-zero:constructor:v1':raw});
    const s=createConstructorStore({storage});assert.equal(s.storageStatus().blocked,true);
    assert.equal(s.storageStatus().raw,raw,'恢复下载必须能取得原始旧配置');
    assert.doesNotThrow(()=>s.occupantOf('SEARCH_PORT'));assert.doesNotThrow(()=>s.preflight());
    assert.equal(storage.getItem('agent-zero:constructor:v1'),raw);
  }
});
test('M21 注册表知识链接有效、上下文冲突会阻止预检',()=>{
  for(const mod of Object.values(MODULES))for(const id of mod.conceptIds)assert.ok(getConcept(id),`${mod.id} → ${id}`);
  const c=createExample('evidence-first');find(c,'context').settings.mode='task-only';find(c,'context').settings.budget=5000;
  const issues=errors(c);assert.ok(issues.some(i=>i.code==='CONTEXT_CONFLICT'));assert.ok(issues.some(i=>i.code==='BUDGET_CONFLICT'));
});
test('M21 重置当前草稿恢复根运行默认值，保留全部具名快照',()=>{
  const storage=memoryStorage();const s=createConstructorStore({storage});s.actions.useExample('starter',true);s.actions.save();
  s.actions.configure('runtime',{maxSteps:80,maxRetries:5});
  for(const m of [...s.getConfiguration().modules])s.actions.remove(m.moduleId);
  s.actions.reset();
  assert.equal(s.getConfiguration().settings.maxSteps,24);assert.equal(s.getConfiguration().settings.maxRetries,1);assert.equal(s.listConfigurations().length,1);
  assert.deepEqual(createConstructorStore({storage}).getConfiguration().modules,[]);
});
test('M21 v1 首次迁移后的配置和实例 ID 跨刷新稳定，原键仍保留',()=>{
  const old=JSON.stringify({schemaVersion:1,modules:[{moduleId:'announcement_search',portId:'SEARCH_PORT',enabled:true,permissions:{read:true},settings:{searchScope:'all_notices',maxResults:5}}]});
  const storage=memoryStorage({'agent-zero:constructor:v1':old});
  const first=createConstructorStore({storage}).getConfiguration(),second=createConstructorStore({storage}).getConfiguration();
  assert.equal(second.configId,first.configId);assert.equal(second.modules[0].instanceId,first.modules[0].instanceId);
  assert.equal(storage.getItem('agent-zero:constructor:v1'),old);
});
