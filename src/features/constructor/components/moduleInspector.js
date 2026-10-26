/**
 * src/features/constructor/components/moduleInspector.js
 * ------------------------------------------------------------------
 * Inspector 的模块视图：真实可访问的表单控件 + 字段级校验提示 + 编辑与移除。
 *
 * 保存策略统一为「字段即改即存」：每次控件 change 立即写入唯一 store，
 * 因此切换模块、切换视图、刷新页面都不会丢失用户输入（M0.2_TASK §5.2 / §7）。
 * ------------------------------------------------------------------
 */
import { PERMISSION_FIELD, defaultSettings, fieldsOf, getModule, getPort } from '../model/modules.js';
import { configSummary, describeStatus, fieldValue, isStructuralError, validateModuleConfig } from '../model/validation.js';
import { esc, h, md, statusTag } from './dom.js';
import { previewRetrieval } from '../model/preflight.js';
import { MCP_CAPABILITIES, MEMORY_ENTRIES, LOCAL_SKILLS } from '../model/catalog.js';

const SIMULATED_NOTE = 'SIMULATED · 本地教学模拟：这里保存的只是配置，不触发真实检索、读取或联网。';

export function buildModulePanel(store, moduleId, { onOpenKnowledge = null, onConfirm = (title,message,fn)=>{if(window.confirm(message))fn();} } = {}) {
  const mod = getModule(moduleId);
  const frag = document.createDocumentFragment();
  if (!mod) {
    frag.append(h('p',{},`未知模块 ${esc(moduleId)} 已保留。可下载配置，或主动移除该实例。`));
    const remove=h('button',{type:'button',class:'btn'},'移除未知模块');remove.onclick=()=>store.actions.remove(moduleId);frag.append(remove);return frag;
  }

  const info = store.describe(moduleId);
  const installed = info.installed;
  const port = getPort(mod.portId);
  const meta = describeStatus(info.status);
  const check = installed
    ? validateModuleConfig(moduleId, moduleId==='runtime'?store.getState().settings:installed.settings, installed.permissions)
    : { ok: false, errors: [] };

  /* ---------------- 顶部：身份与状态 ---------------- */
  frag.append(
    h('div', { class: 'inspector__hero', 'data-module': moduleId }, `
      <div class="inspector__eyebrow">
        <span>${esc(mod.index)}</span><span aria-hidden="true">/</span><span>已选模块</span>
      </div>
      <h2 class="inspector__title">${esc(mod.cn)}</h2>
      <div class="inspector__sub">${esc(mod.name)} · ${esc(mod.kindEn)}</div>
      <div class="chips">
        ${statusTag(meta)}
        <span class="tag tag--muted">${esc(port.name)} · ${esc(port.cn)}</span>
        ${installed ? `<span class="tag tag--muted">${installed.enabled ? '已启用' : '已禁用'}</span>` : '<span class="tag tag--muted">未装配</span>'}
      </div>
      <p class="explain" style="margin-top:9px">${esc(meta.desc)}</p>`)
  );

  /* ---------------- 预览态：确认 / 取消 ---------------- */
  if (!installed) {
    const previewing = !!info.preview;
    const section = h('div', { class: 'section' }, `
      <div class="section__label"><span>${previewing ? '装配预览' : '装配说明'}</span><span>PREVIEW</span></div>
      <p class="explain">${previewing
        ? `已选定兼容接口 <b>${esc(port.name)}</b>（${esc(port.cn)}）。确认后将写入权威配置并播放装配动画；取消则不会留下任何残余模块或已占用接口。`
        : '点击能力架上的「添加」按钮进入装配预览；也可以按住模块卡片直接拖到三维核心的兼容接口。两条路径使用同一套校验。'}</p>`);

    if (previewing) {
      const row = h('div', { class: 'field-actions' });
      const ok = h('button', { class: 'btn btn--primary', type: 'button' }, '确认装配');
      ok.addEventListener('click', () => store.actions.commit(moduleId, mod.portId));
      const cancel = h('button', { class: 'btn btn--ghost', type: 'button' }, '取消');
      cancel.addEventListener('click', () => store.actions.cancel());
      row.append(ok, cancel);
      section.append(row);
    } else {
      const row = h('div', { class: 'field-actions' });
      const add = h('button', { class: 'btn btn--primary', type: 'button' }, '添加并预览装配');
      add.addEventListener('click', () => store.actions.preview(moduleId));
      row.append(add);
      section.append(row);
    }

    const occupied = info.occupiedBy && info.occupiedBy !== moduleId ? store.getInstalled(info.occupiedBy) : null;
    if (occupied) {
      section.append(h('div', { class: 'note', style: 'margin-top:9px' }, `
        <span class="note__key">占用</span>
        <span>接口已被 ${esc(getModule(info.occupiedBy)?.cn || info.occupiedBy)} 占用，需先移除后再装配。</span>`));
    }
    frag.append(section);
  }

  /* ---------------- 已装配：配置表单 ---------------- */
  if (installed) {
    const form = h('div', { class: 'section' });
    form.append(
      h('div', { class: 'section__label' }, '<span>模块配置</span><span>即时更新草稿</span>')
    );

    const errorsByField = new Map();
    for (const error of check.errors) {
      if (!errorsByField.has(error.field)) errorsByField.set(error.field, error);
    }
    for(const issue of store.preflight().issues.filter(i=>i.moduleId===moduleId&&i.level==='error'))if(!errorsByField.has(issue.field))errorsByField.set(issue.field,{...issue,message:issue.description,fix:issue.suggestion});
    const rejected=store.getState().ui.notice;
    if(rejected?.code==='INVALID_CONFIG'&&rejected.moduleId===moduleId)for(const error of rejected.errors||[])errorsByField.set(error.field,{...error,message:`${error.message}；已保留原值`});

    const formId = `azf-${moduleId}`;
    for (const field of fieldsOf(moduleId)) {
      form.append(buildField({ store, moduleId, field, installed, error: errorsByField.get(field.key), formId }));
    }

    const actions = h('div', { class: 'field-actions', style: 'margin-top:10px' });
    const toggle = h('button', { class: 'btn btn--sm', type: 'button' }, installed.enabled ? '禁用模块' : '重新启用');
    toggle.addEventListener('click', () => store.actions.setEnabled(moduleId, installed.enabled !== true));
    const reset = h('button', { class: 'btn btn--sm btn--ghost', type: 'button' }, '重置本模块参数');
    reset.addEventListener('click', () => onConfirm('重置模块参数','将恢复当前模块的默认参数；共享的审批设置也可能改变。',()=>store.actions.configure(moduleId, { ...Object.fromEntries(fieldsOf(moduleId).map(f=>[f.key,f.default])), readPermission: false })));
    const remove = h('button', { class: 'btn btn--sm btn--ghost', type: 'button' }, '移除模块');
    remove.addEventListener('click', () => store.actions.remove(moduleId));
    actions.append(toggle, reset, remove);
    form.append(actions);
    form.append(h('div', { class: 'mono', style: 'margin-top:8px;color:var(--text-3);font-size:10.5px' }, SIMULATED_NOTE));
    frag.append(form);

    // 字段级错误的汇总说明：指出缺什么、怎么修
    if (check.errors.length > 0) {
      const box = h('div', { class: 'section' });
      box.append(h('div', { class: 'section__label' }, `<span>待修复项</span><span>${check.errors.length} 项</span>`));
      for (const error of check.errors) {
        box.append(h('div', { class: `field-error-note${isStructuralError(error) ? ' field-error-note--error' : ''}` }, `
          <b>${esc(error.label || error.field)}</b>
          <span>${esc(error.message)}</span>
          <em>修复：${esc(error.fix)}</em>`));
      }
      frag.append(box);
    }

    /* ---------------- 摘要与说明 ---------------- */
    frag.append(
      h('div', { class: 'section' }, `
        <div class="section__label"><span>权威配置摘要</span><span>唯一数据源</span></div>
        <dl class="kv">${configSummary(installed,store.getState()).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        <div class="note note--info" style="margin-top:9px">
          <span class="note__key">同步</span>
          <span>这份配置同时驱动三维装配视图与二维系统视图；切换视图不会复制数据。</span>
        </div>`)
    );
  }

  /* ---------------- 知识解释与边界 ---------------- */
  frag.append(
    h('div', { class: 'section' }, `
      <div class="section__label"><span>模块职责</span><span>概念</span></div>
      <p class="explain">${md(mod.knowledge)}</p>`)
  );

  const limits = h('div', { class: 'section' });
  limits.append(h('div', { class: 'section__label' }, '<span>能力边界</span><span>诚实声明</span>'));
  const ul = h('div', { class: 'bullets' });
  for (const line of mod.limits) ul.append(h('li', {}, `<span>${esc(line)}</span>`));
  if(mod.moduleType==='tools')ul.append(h('li', {}, '<span>输入：本地查询或 sourceId；输出：公告清单或摘要/正文。权限：只读；失败：缺权限、超时、未知资料。禁止远程 URL。</span>'));
  limits.append(ul);
  frag.append(limits);

  const nav = h('div', { class: 'section' }, `
    <div class="section__label"><span>继续阅读</span><span>知识节点</span></div>
    <div class="note note--info" data-act="knowledge-note">
      <span class="note__key">Tool Calling</span>
      <span>${esc(mod.cn)}是 Tool Calling 的一个具体工具实例：模型只提出结构化调用请求，真正的执行由运行环境完成，再把结果交回上下文。知识页里有完整的三段职责解释与内嵌实验。</span>
    </div>`);
  nav.querySelector('[data-act="knowledge-note"]').remove();
  for(const conceptId of mod.conceptIds||['tool_calling']) {
    const learnBtn = h('button', { class: 'btn btn--sm btn--ghost', type: 'button', 'data-act': 'open-knowledge', 'data-concept':conceptId, style: 'margin:4px' }, esc(conceptId));
    learnBtn.addEventListener('click', () => onOpenKnowledge?.(conceptId));nav.append(learnBtn);
  }
  frag.append(nav);

  if(installed&&moduleId==='retrieval') {
    const result=previewRetrieval(store.getState());
    if(result)frag.append(h('div',{class:'section'},`<h3>本地检索预览</h3><p class="explain">${result.chunking.chunks.length} 个片段 · ${esc(installed.settings.mode)} · 复用 Knowledge Lab。向量为人工坐标示意。</p><pre>${esc(JSON.stringify(result.retrieval.selected||result.retrieval.candidates?.slice(0,installed.settings.topK),null,2))}</pre>`));
  }
  if(moduleId==='mcp')frag.append(h('div',{class:'section'},`<h3>静态能力目录</h3>${MCP_CAPABILITIES.map(c=>`<p>${esc(c.type)} / ${esc(c.cn)} · ${esc(c.id)}</p>`).join('')}<p>离线模拟发现；未连接任何 Server。</p>`));
  if(moduleId==='memory')frag.append(h('div',{class:'section'},`<h3>可复用条目</h3>${MEMORY_ENTRIES.map(e=>`<p>${esc(e.label)} · ${esc(e.origin)}</p>`).join('')}<p>仅显式选中的偏好可复用，Journal 和历史 Run 不属于 Memory。</p>`));
  if(moduleId==='skills')frag.append(h('div',{class:'section'},`${LOCAL_SKILLS.map(s=>`<h3>${esc(s.cn)}</h3><p>${esc(s.summary)}</p>`).join('')}<p>方法卡不改变工具权限。</p>`));

  return frag;
}

/* ------------------------------------------------------------------ *
 * 单个字段控件：真实 select / checkbox，带标签、说明与字段级错误
 * ------------------------------------------------------------------ */
function buildField({ store, moduleId, field, installed, error, formId }) {
  const id = `${formId}-${field.key}`;
  const wrap = h('div', { class: 'field', 'data-field': field.key, 'data-error': error ? 'true' : 'false' });
  const isPermission = field.key === PERMISSION_FIELD.key;
  const value = fieldValue(installed, field, store.getState());

  const label = h('label', { class: 'field__label', for: id }, `
    <span>${esc(field.label)}</span>
    <span class="field__en">${esc(field.en || '')}</span>`);
  wrap.append(label);
  if(field.required)label.append(h('span',{class:'field__hint'},'必填'));

  if (field.type === 'select') {
    const select = h('select', { id, class: 'field__control', name: field.key,'aria-invalid':error?'true':'false','aria-describedby':error?`${id}-error`:null });
    const known = field.options.some((o) => (field.numeric ? Number(o.value) : String(o.value)) === (field.numeric ? Number(value) : String(value)));
    if (!known) {
      // 损坏或旧版本数据：显示当前非法值，让用户看得见并主动修复，而不是被静默改写
      select.append(h('option', { value: String(value ?? ''), selected: true }, `${esc(value ?? '（空）')}（当前值 · 非法）`));
    }
    for (const option of field.options) {
      const opt = h('option', { value: String(option.value) }, option.label);
      if ((field.numeric ? Number(option.value) : String(option.value)) === (field.numeric ? Number(value) : String(value))) opt.selected = true;
      select.append(opt);
    }
    select.addEventListener('change', () => {
      store.actions.configure(moduleId, { [field.key]: select.value });
    });
    wrap.append(select);

    const chosen = field.options.find((o) => (field.numeric ? Number(o.value) : String(o.value)) === (field.numeric ? Number(select.value) : String(select.value)));
    if (chosen?.note) wrap.append(h('div', { class: 'field__hint' }, esc(chosen.note)));
  } else if(field.type==='textarea'||field.type==='text'||field.type==='number') {
    const input=h(field.type==='textarea'?'textarea':'input',{id,class:'field__control',name:field.key,type:field.type==='number'?'number':'text',min:field.min,max:field.max,maxlength:field.maxLength,rows:field.type==='textarea'?3:null,'aria-invalid':error?'true':'false','aria-describedby':error?`${id}-error`:null});
    input.value=value??'';
    input.addEventListener('change',()=>store.actions.configure(moduleId,{[field.key]:field.numeric?Number(input.value):input.value}));
    wrap.append(input,h('div',{class:'field__hint'},field.type==='number'?`${field.min}–${field.max} · 默认 ${field.default}`:`最多 ${field.maxLength} 字符`));
  } else if(field.type==='multiselect') {
    const group=h('div',{class:'field__choices',role:'group','aria-labelledby':`${id}-label`});label.id=`${id}-label`;
    const values=Array.isArray(value)?value:[];
    const choices=[...field.options,...values.filter(v=>!field.options.some(o=>o.value===v)).map(v=>({value:v,label:`未知引用：${v}`}))];
    for(const [index,option] of choices.entries()) {
      const item=h('label',{class:'field__check'});const input=h('input',{type:'checkbox',id:`${id}-${index}`,name:field.key,value:option.value});input.checked=values.includes(option.value);
      input.addEventListener('change',()=>{const next=input.checked?[...values,option.value]:values.filter(v=>v!==option.value);store.actions.configure(moduleId,{[field.key]:next});});
      item.append(input,h('span',{},esc(option.label)));group.append(item);
    }wrap.append(group);
  } else {
    const box = h('label', { class: 'field__check', for: id });
    const input = h('input', { type: 'checkbox', id, name: field.key });
    input.checked = value === true;
    input.addEventListener('change', () => {
      store.actions.configure(moduleId, { [field.key]: input.checked });
    });
    box.append(input, h('span', {}, isPermission ? '允许读取本地教学模拟资料' : '开启'));
    wrap.append(box);
    if (field.hint) wrap.append(h('div', { class: 'field__hint' }, esc(field.hint)));
  }

  if (error) {
    wrap.append(h('div', { class: 'field__error', role: 'alert',id:`${id}-error` }, `
      <b>${esc(error.message)}</b><span>修复：${esc(error.fix)}</span>`));
  }
  return wrap;
}
