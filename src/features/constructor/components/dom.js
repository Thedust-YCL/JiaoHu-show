/**
 * src/features/constructor/components/dom.js
 * ------------------------------------------------------------------
 * 装配界面共用的极简 DOM 工厂。
 * 只拼接受控字符串，避免把用户可控内容直接塞进 innerHTML。
 * ------------------------------------------------------------------
 */

/**
 * 极简 DOM 工厂。
 * 第 3 个参数是**受信任的 HTML 字符串**（沿用 M0.1/M0.2 的用法，保持不变）；
 * 之后的参数可以是 DOM 节点、节点数组或纯文本，用于组合子视图，
 * 避免到处写 append。用户可控内容仍然只通过 textContent / esc() 写入。
 */
export function h(tag, attrs = {}, html, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, String(v));
  }
  if (html !== undefined && html !== null) {
    if (typeof html === 'string') el.innerHTML = html;
    else appendNode(el, html);
  }
  for (const child of children) appendNode(el, child);
  return el;
}

function appendNode(el, child) {
  if (child === undefined || child === null || child === false) return;
  if (typeof child === 'string') {
    el.append(document.createTextNode(child));
    return;
  }
  if (Array.isArray(child)) {
    for (const item of child) appendNode(el, item);
    return;
  }
  if (child instanceof Node) el.append(child);
}

/** 极简 Markdown 强调：仅支持 **加粗**，避免注入 */
export function md(text) {
  return String(text ?? '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

/** HTML 转义：所有来自数据层的文本都必须经过它 */
export function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 状态标签：英文状态名是专有名词，必须同时给出中文解释（不依赖颜色传达） */
export function statusTag(meta) {
  return `<span class="tag tag--${esc(meta.tone)}" data-status="${esc(meta.en)}">
    <i class="dot ${meta.tone === 'signal' || meta.tone === 'success' ? 'dot--round dot--fill' : meta.tone === 'error' ? 'dot--round' : ''}" aria-hidden="true"></i>
    ${esc(meta.en)} · ${esc(meta.cn)}</span>`;
}
