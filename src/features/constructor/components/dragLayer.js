/**
 * src/features/constructor/components/dragLayer.js
 * ------------------------------------------------------------------
 * 引导式拖拽的可见反馈层：跟随指针的模块轮廓 + 明确的兼容性文字。
 *
 * 兼容性绝不只用颜色表达（M0.2_TASK §6）：图层的文字说明由调用方按
 * validateConnection 的结果给出，例如「文档读取器不能连接到检索接口」。
 * ------------------------------------------------------------------
 */
import { esc, h } from './dom.js';

export function DragLayer() {
  const el = h('div', { class: 'drag-layer', 'data-open': 'false', 'aria-hidden': 'true' });
  const ghost = h('div', { class: 'drag-ghost' });
  const hint = h('div', { class: 'drag-hint' });
  el.append(ghost, hint);

  function show({ x, y, name, cn, message, tone = 'idle', label = '' }) {
    el.dataset.open = 'true';
    el.dataset.tone = tone;
    ghost.dataset.tone = tone;
    ghost.innerHTML = `
      <span class="drag-ghost__idx">${esc(label)}</span>
      <span class="drag-ghost__name">${esc(name)}</span>
      <span class="drag-ghost__cn">${esc(cn)}</span>`;
    ghost.style.transform = `translate(${x}px, ${y}px)`;
    hint.dataset.tone = tone;
    hint.textContent = message || '';
  }

  function hide() {
    el.dataset.open = 'false';
    el.dataset.tone = 'idle';
  }

  return { el, show, hide };
}
