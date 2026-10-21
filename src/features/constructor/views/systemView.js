/**
 * src/features/constructor/views/systemView.js
 * ------------------------------------------------------------------
 * 二维系统视图：由**同一份权威配置**派生当前结构与连接，不再是一张静态预览。
 *
 * 它不持有任何自己的模块状态：节点是否存在、连线样式、状态文本全部来自
 * constructor store；在此处执行的添加 / 配置 / 禁用 / 移除也走同一套动作，
 * 因此切回三维后立即映射为真实装配结构（M0.2_TASK §8）。
 * ------------------------------------------------------------------
 */
import { MODULES, PORTS, getModule, getPort } from '../model/modules.js';
import { describeStatus } from '../model/validation.js';
import { esc, h, statusTag } from '../components/dom.js';

const VIEW_W = 392;
const VIEW_H = 212;
const CORE = { x: 196, y: 118, r: 34 };
const SLOT_X = { SEARCH_PORT: 72, READER_PORT: 320 };

export function SystemGraph({ store }) {
  const el = h('div', { class: 'surface sg-panel' });
  const head = h('div', { class: 'panel-head' }, `
    <span class="panel-head__title">系统图 · 二维投影</span>
    <span class="tag tag--muted" data-el="mode">由当前配置派生</span>`);
  const body = h('div', { class: 'sg-panel__body' });
  const svgWrap = h('div', { class: 'sg-panel__svg' });
  const slots = h('div', { class: 'sg-panel__slots' });
  const legend = h('div', { class: 'sg-key' });
  const notes = h('div', { class: 'sg-panel__notes' });
  body.append(svgWrap, slots, legend, notes);
  el.append(head, body);

  const nodeRefs = new Map();

  /** 状态 → 连线样式；颜色不是唯一线索，图例与文字同步说明 */
  function edgeStyle(status) {
    if (status === 'Ready') return { stroke: 'rgba(119,216,236,.85)', dash: '', label: '已接入 · 连接活跃' };
    if (status === 'Unconfigured') return { stroke: 'rgba(240,189,120,.8)', dash: '5 4', label: '已装配 · 未配置' };
    if (status === 'Disabled') return { stroke: 'rgba(140,160,176,.42)', dash: '3 5', label: '已禁用 · 线路不活跃' };
    if (status === 'Invalid') return { stroke: 'rgba(255,133,133,.85)', dash: '2 3', label: '配置非法' };
    if (status === 'Preview') return { stroke: 'rgba(240,189,120,.6)', dash: '5 4', label: '预览中 · 未提交' };
    return { stroke: 'rgba(120,140,158,.28)', dash: '2 5', label: '接口空闲' };
  }

  function render() {
    const state = store.getState();
    const preview = state.ui.preview;

    /* ---------------- SVG 结构投影 ---------------- */
    const edges = [];
    const nodes = [];

    nodes.push(`
      <g class="sg-node sg-node--core" data-node="core" tabindex="0" role="button" aria-label="Model Core 模型核心，运行状态 ${esc(state.modules.length)} 个模块已装配">
        <circle cx="${CORE.x}" cy="${CORE.y}" r="${CORE.r + 8}" class="sg-halo" />
        <circle cx="${CORE.x}" cy="${CORE.y}" r="${CORE.r}" class="sg-disc" />
        <text x="${CORE.x}" y="${CORE.y - 2}" class="sg-title">Model Core</text>
        <text x="${CORE.x}" y="${CORE.y + 12}" class="sg-cn">模型核心</text>
      </g>`);

    for (const port of Object.values(PORTS)) {
      const mod = getModule(port.accepts[0]);
      const installed = state.modules.find((m) => m.moduleId === mod.id) || null;
      const status = installed ? store.statusOf(mod.id) : preview?.moduleId === mod.id ? 'Preview' : 'Available';
      const style = edgeStyle(status);
      const x = SLOT_X[port.id];
      const y = CORE.y;
      const meta = describeStatus(status);

      edges.push(`<line x1="${CORE.x}" y1="${y}" x2="${x}" y2="${y}" class="sg-edge" data-status="${esc(status)}" stroke="${style.stroke}" ${style.dash ? `stroke-dasharray="${style.dash}"` : ''} />`);

      // 圆内只放中文状态（英文状态名太长会溢出圆），英文完整状态放在节点外的标签行
      nodes.push(`
        <g class="sg-node" data-node="${esc(mod.id)}" data-status="${esc(status)}" tabindex="0" role="button"
           aria-label="${esc(mod.name)}，中文：${esc(mod.cn)}，目标接口 ${esc(port.name)}，当前状态 ${esc(meta.en)}（${esc(meta.cn)}）">
          <circle cx="${x}" cy="${y}" r="${installed ? 30 : 24}" class="sg-halo" />
          <circle cx="${x}" cy="${y}" r="${installed ? 25 : 20}" class="sg-disc" />
          <text x="${x}" y="${y - 1}" class="sg-title">${esc(status === 'Available' ? '空置' : meta.cn)}</text>
          <text x="${x}" y="${y + 11}" class="sg-cn">${esc(meta.en)}</text>
          <text x="${x}" y="${y + 48}" class="sg-cn sg-cn--name">${esc(port.name)}</text>
          <text x="${x}" y="${y + 60}" class="sg-cn">${esc(mod.name)}</text>
          <text x="${x}" y="${y + 71}" class="sg-cn">${esc(mod.cn)}</text>
        </g>`);
    }

    svgWrap.innerHTML = `
      <svg viewBox="0 0 ${VIEW_W} ${VIEW_H}" class="sg" role="img" aria-label="二维系统图：模型核心与两个兼容接口的当前装配关系">
        <g class="sg-edges">${edges.join('')}</g>
        <g class="sg-nodes">${nodes.join('')}</g>
      </svg>`;

    svgWrap.querySelectorAll('.sg-node').forEach((node) => {
      const moduleId = node.dataset.node;
      if (!moduleId || moduleId === 'core') {
        node.addEventListener('click', () => store.actions.select(null));
        return;
      }
      const activate = () => store.actions.select(moduleId);
      node.addEventListener('click', activate);
      node.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      });
    });

    /* ---------------- 槽位卡片：2D 中完整可操作 ---------------- */
    slots.innerHTML = '';
    for (const port of Object.values(PORTS)) {
      const mod = getModule(port.accepts[0]);
      const installed = store.getInstalled(mod.id);
      const status = installed ? store.statusOf(mod.id) : preview?.moduleId === mod.id ? 'Preview' : 'Available';
      const meta = describeStatus(status);
      const style = edgeStyle(status);

      const card = h('div', { class: 'slot-card', 'data-status': status, 'data-module': mod.id });
      card.append(
        h('div', { class: 'slot-card__head' }, `
          <span class="slot-card__port">${esc(port.name)} · ${esc(port.cn)}</span>
          ${statusTag(meta)}`),
        h('div', { class: 'slot-card__name' }, `${esc(mod.name)} · ${esc(mod.cn)}`),
        h('div', { class: 'slot-card__link' }, style.label)
      );

      const actions = h('div', { class: 'slot-card__actions' });
      const mk = (label, fn, cls = 'btn btn--sm btn--ghost') => {
        const b = h('button', { class: cls, type: 'button' }, label);
        b.addEventListener('click', fn);
        return b;
      };
      if (!installed) {
        if (status === 'Preview') {
          // 二维视图自带完整路径：确认与取消都能在此处完成，不依赖三维交互
          actions.append(mk('确认装配', () => store.actions.commit(mod.id), 'btn btn--sm btn--primary'));
          actions.append(mk('取消', () => store.actions.cancel()));
        } else {
          actions.append(mk('添加', () => store.actions.preview(mod.id), 'btn btn--sm btn--primary'));
        }
      } else {
        actions.append(mk('查看配置', () => store.actions.select(mod.id), 'btn btn--sm btn--primary'));
        actions.append(mk(installed.enabled ? '禁用' : '重新启用', () => store.actions.setEnabled(mod.id, installed.enabled !== true)));
        actions.append(mk('移除', () => store.actions.remove(mod.id)));
      }
      card.append(actions);
      slots.append(card);
    }

    /* ---------------- 图例与说明 ---------------- */
    legend.innerHTML = `
      <div class="sg-key__row">
        <span class="sg-key__label">连线含义</span>
        <span class="sg-key__item"><i class="sg-line" data-type="USES"></i>Ready · 连接活跃</span>
        <span class="sg-key__item"><i class="sg-line" data-type="RELATED"></i>Unconfigured · 未配置</span>
        <span class="sg-key__item"><i class="sg-line" data-type="PART_OF"></i>Disabled · 线路不活跃</span>
        <span class="sg-key__item"><i class="sg-line" data-type="CONTRASTS"></i>Invalid · 配置非法</span>
      </div>
      <div class="sg-key__row" style="margin-top:6px">
        <span class="sg-key__label">规模</span>
        <span>已装配 ${state.modules.length} / ${Object.keys(MODULES).length} 个模块 · 接口 ${Object.keys(PORTS).length} 个</span>
      </div>`;

    notes.innerHTML = `
      <div class="note note--info">
        <span class="note__key">读法</span>
        <span>连线表示「该工具已加入本地的模拟研究系统」，不代表 MCP 连接、真实 API 会话或 Agent 执行事件。点击任一节点会同步选中对应模块，并显示与三维视图完全相同的检视内容。</span>
      </div>`;

    applySelection(state.ui.selectedModuleId);
  }

  function applySelection(moduleId) {
    svgWrap.querySelectorAll('.sg-node').forEach((node) => {
      const id = node.dataset.node;
      const sel = !!moduleId && id === moduleId;
      node.classList.toggle('is-selected', sel);
      node.classList.toggle('is-dim', !!moduleId && !sel);
    });
  }

  function setSelection(moduleId) {
    applySelection(moduleId);
  }

  return { el, render, setSelection };
}
