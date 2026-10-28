/**
 * src/main.js — 入口
 * 纯前端：全部逻辑在浏览器执行，无任何业务网络请求。
 */
import { createApp } from './app.js';

function boot() {
  const root = document.getElementById('app');
  if (!root) throw new Error('#app 容器缺失');
  try {
    root.replaceChildren();
    createApp(root);
    root.removeAttribute('aria-busy');
  } catch (error) {
    root.removeAttribute('aria-busy');
    const box=document.createElement('section');box.className='noscript';box.setAttribute('role','alert');
    const title=document.createElement('h1');title.textContent='AGENT / ZERO';
    const detail=document.createElement('p');detail.textContent=`初始化失败：${String(error && error.message ? error.message : error)}`;
    const retry=document.createElement('button');retry.className='btn btn--primary';retry.textContent='重新载入';retry.onclick=()=>location.reload();
    box.append(title,detail,retry);root.replaceChildren(box);
    throw error;
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
