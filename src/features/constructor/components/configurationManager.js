import { h, esc } from './dom.js';

export function ConfigurationManager({store,onConfirm,onPreflight}) {
  const el=h('section',{class:'config-manager','aria-label':'本地 Agent 配置管理'});
  const name=h('input',{id:'agent-config-name',class:'field__control',maxlength:80,'aria-label':'配置名称'});
  const status=h('p',{class:'config-manager__status','aria-live':'polite'});
  const controls=h('div',{class:'field-actions'});
  const saved=h('select',{class:'field__control','aria-label':'已保存的本地配置'});
  const notes=h('div',{class:'config-manager__notes'});
  const button=(label,act,fn,primary=false)=>{const b=h('button',{type:'button',class:`btn btn--sm ${primary?'btn--primary':'btn--ghost'}`,'data-config-act':act},label);b.onclick=fn;return b;};
  const confirmSwitch=fn=>store.isDirty()?onConfirm('切换配置','当前草稿有未保存修改。确认切换将替换当前草稿，请先保存需要的配置。',fn):fn();
  name.addEventListener('change',()=>store.actions.rename(name.value));
  controls.append(button('保存','save',()=>{
    const result=store.actions.save();
    if(result.notice?.code==='OVERWRITE_CONFIRM')onConfirm('覆盖保存','将用当前草稿覆盖已保存快照。',()=>store.actions.save(true));
    if(result.notice?.code==='PREFLIGHT_FAILED')onPreflight();
  },true),button('复制','copy',()=>store.actions.copy()),button('配置预检','preflight',onPreflight,true));
  const more=h('details',{});more.append(h('summary',{},'本地配置与示例'));
  const savedActions=h('div',{class:'field-actions'});
  savedActions.append(button('加载','load',()=>{if(saved.value)confirmSwitch(()=>store.actions.load(saved.value,true));}),button('删除快照','delete',()=>{if(saved.value){const id=saved.value;onConfirm('删除本地快照','只删除选中的配置快照；当前草稿与历史研究记录保留。',()=>store.actions.delete(id,true));}}));
  const examples=h('div',{class:'field-actions'});
  examples.append(button('Starter 示例','starter',()=>confirmSwitch(()=>store.actions.useExample('starter',true))),button('Evidence First 示例','evidence-first',()=>confirmSwitch(()=>store.actions.useExample('evidence-first',true))));
  more.append(h('label',{},'已保存配置'),saved,savedActions,examples,h('p',{class:'field__hint'},'最多 20 套，保存在此浏览器。两套示例仅展示不同配置取舍。'));
  const recovery=h('div',{class:'config-recovery'});
  function download(value,filename) {
    const url=URL.createObjectURL(new Blob([value],{type:'application/json;charset=utf-8'}));const a=h('a',{href:url,download:filename});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  more.append(button('下载当前配置','export',()=>download(JSON.stringify(store.getConfiguration(),null,2),'agent-zero-configuration.json')),recovery);
  el.append(h('div',{class:'section__label'},'<span>研究 Agent</span><span>CONFIGURATION v2</span>'),name,status,controls,more,notes);
  function render() {
    const config=store.getConfiguration(),storage=store.storageStatus();
    if(document.activeElement!==name)name.value=config.name;
    status.textContent=`${store.isDirty()?'● 草稿未保存':'✓ 已保存快照'} · ${config.modules.length} 个模块${storage.writeFailed?' · 本地写入失败，刷新可能丢失':''}`;
    const chosen=saved.value;saved.replaceChildren(h('option',{value:''},'选择本地快照'));
    for(const c of store.listConfigurations())saved.append(h('option',{value:c.configId},`${esc(c.name)} · ${c.moduleCount} 模块`));
    saved.value=store.listConfigurations().some(c=>c.configId===chosen)?chosen:config.configId;
    recovery.replaceChildren();
    if(storage.blocked||storage.quarantined) {
      recovery.append(h('p',{role:'alert'},storage.blocked?'原存储无法读取，已锁定保留。编辑仅在会话中生效。':`${storage.quarantined} 条不兼容配置已隔离保留。`),button('下载恢复数据','download-recovery',()=>download(storage.raw,'agent-zero-recovery.json')),button('备份并恢复存储','recover',()=>onConfirm('恢复构建器存储','原始数据将备份到构建器专用恢复键。保留可用快照及隔离数据，使用当前会话草稿恢复写入；不影响其他记录。',()=>store.actions.recoverStorage(true))));
    }
    const notice=store.getState().ui.notice;notes.textContent=notice?.message||'';
  }
  render();return {el,render};
}
