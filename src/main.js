/**
 * src/main.js — 入口
 * 纯前端：全部逻辑在浏览器执行，无任何业务网络请求。
 */
import { createApp } from './app.js';

function boot() {
  const root = document.getElementById('app');
  if (!root) throw new Error('#app 容器缺失');
  root.removeAttribute('aria-busy');
  try {
    createApp(root);
  } catch (error) {
    root.innerHTML = `
      <div class="noscript" style="padding:48px">
        <h1>AGENT / ZERO</h1>
        <p>初始化失败：${String(error && error.message ? error.message : error)}</p>
        <p style="color:var(--text-3)">本页面为纯前端静态演示，不依赖任何后端服务；请刷新重试。</p>
      </div>`;
    throw error;
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
