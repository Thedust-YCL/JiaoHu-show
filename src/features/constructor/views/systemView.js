/** Current configuration projection. Edges express declared dependencies or explicit relations. */
import { MODULES, getModule } from '../model/modules.js';
import { describeStatus } from '../model/validation.js';
import { h, esc, statusTag } from '../components/dom.js';

export function SystemGraph({store,readOnly=false}) {
  const el=h('div',{class:'surface sg-panel'});
  const graph=h('div',{class:'sg-panel__svg'}),slots=h('div',{class:'sg-panel__slots'}),notes=h('div',{class:'sg-panel__notes'});
  const list=h('details',{class:'sg-list-alternative'});list.append(h('summary',{},'模块列表与操作（替代图视图）'),slots);
  const body=h('div',{class:'sg-panel__body'});body.append(graph,list,notes);
  el.append(h('div',{class:'panel-head'},'<span class="panel-head__title">系统图 · 当前配置</span><span class="tag tag--muted">本地模拟</span>'),body);
  function activate(id){store.actions.select(id);}
  function render() {
    const state=store.getState(),result=store.preflight();
    const positions=new Map(state.modules.map((m,i)=>[m.instanceId,{x:90+(i%2)*180,y:45+Math.floor(i/2)*80}]));
    const height=Math.max(200,Math.ceil(state.modules.length/2)*80+30);
    const dependencyEdges=result.connections.map(e=>({...e,source:positions.get(e.sourceInstanceId),target:positions.get(e.targetInstanceId)}));
    const explicit=result.explicitConnections.map(e=>({...e,source:positions.get(e.sourceInstanceId),target:positions.get(e.targetInstanceId)}));
    const lines=[...dependencyEdges,...explicit].filter(e=>e.source&&e.target).map(e=>`<path class="sg-edge" d="M ${e.source.x} ${e.source.y} L ${e.target.x} ${e.target.y}" fill="none" stroke="${e.valid?'#77D8EC':'#FF8585'}" opacity=".45" ${e.derived?'stroke-dasharray="4 4"':''}><title>${esc(e.derived?'推导依赖':'显式关系')} · ${esc(e.type)} · ${e.valid?'有效':'无效或停用'}</title></path>`).join('');
    const nodes=state.modules.map(m=>{const p=positions.get(m.instanceId),meta=describeStatus(store.statusOf(m.moduleId));return `<g class="sg-node" data-node="${esc(m.moduleId)}" data-status="${meta.en}" role="button" tabindex="0" aria-label="${esc(getModule(m.moduleId)?.name||m.moduleId)} ${meta.cn}"><rect x="${p.x-76}" y="${p.y-24}" width="152" height="48" rx="5" class="sg-disc"/><text x="${p.x}" y="${p.y-3}" class="sg-title">${esc(getModule(m.moduleId)?.cn||m.moduleId)}</text><text x="${p.x}" y="${p.y+13}" class="sg-cn">${esc(meta.cn)}</text></g>`;}).join('');
    graph.innerHTML=`<svg class="sg sg-complete" viewBox="0 0 360 ${height}" role="group" aria-label="当前 Agent 模块与依赖关系">${lines}${nodes||'<text x="180" y="100" class="sg-title">尚未装配模块，从能力架开始</text>'}</svg><div class="sg-key">虚线：自动推导依赖与工具接入 · 实线：显式关系 · 禁用模块不参与依赖</div>`;
    graph.querySelectorAll('[data-node]').forEach(node=>{const go=()=>activate(node.dataset.node);node.onclick=go;node.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}};});
    slots.replaceChildren();
    const known=Object.values(MODULES);const unknown=state.modules.filter(m=>m&&!getModule(m.moduleId)).map(m=>({id:m.moduleId,name:m.moduleId,cn:'未知模块'}));
    for(const mod of [...known,...unknown]) {
      const m=store.getInstalled(mod.id),status=store.statusOf(mod.id),meta=describeStatus(status);
      const card=h('div',{class:'slot-card','data-module':mod.id,'data-status':status},`<div class="slot-card__head"><b>${esc(mod.name)}</b>${statusTag(meta)}</div>`);
      const buttons=h('div',{class:'slot-card__actions'});
      const button=(label,fn)=>{const b=h('button',{class:'btn btn--sm btn--ghost',type:'button'},label);b.onclick=fn;buttons.append(b);};
      if(readOnly){if(m)button('查看快照',()=>activate(mod.id));}
      else if(m){button('查看配置',()=>activate(mod.id));button(m.enabled?'禁用':'重新启用',()=>store.actions.setEnabled(mod.id,!m.enabled));button('移除',()=>store.actions.remove(mod.id));}
      else if(status==='Preview'){button('确认装配',()=>store.actions.commit(mod.id));button('取消',()=>store.actions.cancel());}
      else button('添加',()=>store.actions.preview(mod.id));
      card.append(buttons);slots.append(card);
    }
    notes.replaceChildren();
    for(const issue of result.issues.filter(i=>i.level==='error')) {
      const b=h('button',{type:'button',class:'preflight-issue preflight-issue--error'},esc(issue.description));b.onclick=()=>activate(issue.moduleId);notes.append(b);
    }
    if(state.connections?.length)notes.append(h('p',{class:'explain'},`${state.connections.length} 条显式关系；${result.connections.length} 条自动依赖。连线不代表真实网络或执行事件。`));
    setSelection(state.ui.selectedModuleId);
  }
  function setSelection(id){graph.querySelectorAll('[data-node]').forEach(node=>node.classList.toggle('is-selected',node.dataset.node===id));}
  return {el,render,setSelection};
}
