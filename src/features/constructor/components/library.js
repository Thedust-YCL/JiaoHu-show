/**
 * src/features/constructor/components/library.js
 * ------------------------------------------------------------------
 * 左侧能力架：显示可装配模块、目标接口、实时状态与操作入口。
 *
 * 操作全部经 store.actions，界面不自行改写配置；
 * 拖拽只是额外体验，点击「添加」永远是完整的等价路径（M0.2_TASK §6）。
 * ------------------------------------------------------------------
 */
import { MODULES, getPort } from '../model/modules.js';
import { describeStatus } from '../model/validation.js';
import { esc, h, statusTag } from './dom.js';

export function ModuleLibrary({ store, onDragIntent, onResetRequest }) {
  const el = h('div', { class: 'bay', 'aria-label': '能力架：可装配的工具模块' });
  const head = h('div', { class: 'dock__group-label' }, '<span>能力架 · MODULE BAY</span><span data-el="count">0 / 2</span>');
  const intro = h('div', { class: 'note note--info', style: 'margin:0 4px 8px' }, `
    <span class="note__key">M2.1</span>
    <span>十类模块 · 点击添加并确认装配。所有配置仅用于本地模拟。</span>`);
  const list = h('div', { class: 'bay__list' });
  const foot = h('div', { class: 'bay__foot' });

  const resetBtn = h('button', { class: 'btn btn--sm btn--ghost', type: 'button', 'aria-label': '重置构建器：清空全部已装配模块与接口占用' }, '重置构建器');
  resetBtn.addEventListener('click', () => onResetRequest?.());
  foot.append(
    h('div', { class: 'bay__hint' }, '草稿自动恢复 · 具名配置请点击保存'),
    resetBtn
  );

  el.append(head, intro, list, foot);

  const cards = new Map();

  for (const moduleId of Object.keys(MODULES)) {
    const mod = MODULES[moduleId];
    const port = getPort(mod.portId);

    const card = h('article', {
      class: 'bay-card',
      'data-module': moduleId,
      'data-status': 'Available',
      'aria-label': `${mod.name}（${mod.cn}）模块卡片`,
    });

    const grip = h('div', {
      class: 'bay-card__grip',
      'aria-hidden': 'true',
      title: '按住拖到三维核心的兼容接口（也可直接用「添加」按钮）',
    }, '<span></span><span></span><span></span>');
    grip.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      onDragIntent?.(moduleId, event);
    });

    const body = h('div', { class: 'bay-card__body' });
    body.innerHTML = `
      <div class="bay-card__head">
        <span class="bay-card__idx">${esc(mod.index)}</span>
        <span class="bay-card__name">${esc(mod.name)}</span>
      </div>
      <div class="bay-card__cn">${esc(mod.cn)} · ${esc(mod.kind)}</div>
      <div class="bay-card__port">
        <span class="bay-card__port-k">目标接口</span>
        <b>${esc(port.name)}</b>
        <span class="bay-card__port-cn">${esc(port.cn)}</span>
      </div>
      <div class="bay-card__status" data-el="status"></div>
      <div class="bay-card__actions" data-el="actions"></div>`;

    card.append(grip, body);
    list.append(card);
    cards.set(moduleId, { card, status: body.querySelector('[data-el="status"]'), actions: body.querySelector('[data-el="actions"]') });
  }

  function button(label, act, moduleId, extraClass = '') {
    const b = h('button', { class: `btn btn--sm ${extraClass}`, type: 'button', 'data-act': act, 'data-module': moduleId }, label);
    b.addEventListener('click', () => {
      const { actions } = store;
      if (act === 'add') actions.preview(moduleId);
      else if (act === 'cancel') actions.cancel();
      else if (act === 'inspect') actions.select(moduleId);
      else if (act === 'remove') actions.remove(moduleId);
      else if (act === 'toggle') actions.setEnabled(moduleId, store.getInstalled(moduleId)?.enabled !== true);
    });
    return b;
  }

  function render() {
    const state = store.getState();
    const installedCount = state.modules.length;
    head.querySelector('[data-el="count"]').textContent = `${installedCount} / ${Object.keys(MODULES).length}`;

    for (const [moduleId, refs] of cards) {
      const info = store.describe(moduleId);
      const meta = describeStatus(info.status);
      refs.card.dataset.status = info.status;
      refs.card.dataset.installed = info.installed ? 'true' : 'false';
      refs.status.innerHTML = `${statusTag(meta)}${info.installed ? '' : '<span class="tag tag--muted">未占用接口</span>'}`;

      // 重建前记录焦点位置，避免键盘用户在状态刷新后丢失焦点
      const activeAct = document.activeElement?.dataset?.act && document.activeElement.dataset.module === moduleId
        ? document.activeElement.dataset.act
        : null;

      refs.actions.innerHTML = '';
      if (!info.installed) {
        if (info.status === 'Preview') {
          refs.actions.append(button('取消预览', 'cancel', moduleId, 'btn--ghost'));
        } else {
          refs.actions.append(button('添加', 'add', moduleId, 'btn--primary'));
        }
      } else {
        refs.actions.append(button('查看配置', 'inspect', moduleId, 'btn--primary'));
        refs.actions.append(button(info.installed.enabled ? '禁用' : '重新启用', 'toggle', moduleId, 'btn--ghost'));
        refs.actions.append(button('移除', 'remove', moduleId, 'btn--ghost'));
      }

      if (activeAct) {
        const restored = refs.actions.querySelector(`[data-act="${activeAct}"]`);
        restored?.focus({ preventScroll: true });
      }
    }
  }

  return { el, render };
}
