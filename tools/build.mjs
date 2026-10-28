/**
 * tools/build.mjs
 * ------------------------------------------------------------------
 * 构建 P0 契约要求的静态产物：
 *   1. 合并 src/styles/*.css -> dist/assets/app.css
 *   2. esbuild 打包静态站并按需拆分 Lab（所有代码块均为同源资源）
 *   3. 产出 dist/index.html（引用相对路径，可直接部署到 GitHub Pages 子路径）
 *   4. 单独构建离线演示版 index.html（CSS/JS 全内联，file:// 双击可用）
 * ------------------------------------------------------------------
 */
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const assets = path.join(dist, 'assets');

async function collectCss(dir) {
  const out = [];
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectCss(full)));
    else if (entry.name.endsWith('.css')) out.push(await readFile(full, 'utf8'));
  }
  return out;
}

function shellHtml({ cssHref, jsHref, inlineCss, inlineJs }) {
  const css = inlineCss ? `<style>\n${inlineCss}\n</style>` : `<link rel="stylesheet" href="${cssHref}" />`;
  const js = inlineJs
    ? `<script type="module">\n${inlineJs}\n</script>`
    : `<script type="module" src="${jsHref}"></script>`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="color-scheme" content="dark" />
<meta name="description" content="AGENT / ZERO — 从语言到行动的交互式 AI 知识实验室。探索六章、36 个概念与六个实验，在本机学习日志中续学。纯前端本地教学模拟。" />
<title>AGENT / ZERO — FROM LANGUAGE TO ACTION.</title>
${css}
</head>
<body>
<div id="app" aria-busy="true">
  <div class="initializing" role="status">正在准备本地实验室…<p>正在加载随页面打包的界面与教学资料。若页面未出现，可重新载入。</p><button type="button" class="btn" onclick="location.reload()">重新载入</button></div>
  <noscript>
    <div class="noscript">
      <h1>AGENT / ZERO</h1>
      <p>本页面的交互式 3D 演示需要 JavaScript。请启用 JavaScript 后重新载入；<br />静态说明与术语信息不依赖网络请求，全部随页面本地打包。</p>
    </div>
  </noscript>
</div>
${js}
</body>
</html>
`;
}

async function main() {
  const t0 = Date.now();
  const debug = process.env.AZ_DEBUG === '1';
  if (existsSync(dist)) await rm(dist, { recursive: true, force: true });
  await mkdir(assets, { recursive: true });

  const css = (await collectCss(path.join(root, 'src', 'styles'))).join('\n');
  await writeFile(path.join(assets, 'app.css'), css, 'utf8');

  const common = {
    entryPoints: [path.join(root, 'src', 'main.js')],
    bundle: true,
    format: 'esm',
    target: ['chrome110', 'firefox110', 'safari16'],
    minify: !debug,
    sourcemap: debug ? 'inline' : false,
    keepNames: debug,
    legalComments: 'inline',
    logLevel: 'warning',
  };
  await build({ ...common, outdir: assets, entryNames: 'app', chunkNames: 'chunk-[hash]',
    splitting: true, define: { __AZ_OFFLINE__: 'false' } });
  const offlineResult = await build({ ...common, write: false, define: { __AZ_OFFLINE__: 'true' } });
  const js = offlineResult.outputFiles[0].text;

  // 标准静态产物（相对路径，适配 GitHub Pages 子路径）
  await writeFile(
    path.join(dist, 'index.html'),
    shellHtml({ cssHref: './assets/app.css', jsHref: './assets/app.js' }),
    'utf8'
  );
  // 单文件离线版：用于直接双击 / 无服务器演示
  await writeFile(
    path.join(root, 'index.html'),
    shellHtml({ inlineCss: css, inlineJs: js }),
    'utf8'
  );

  const kb = (s) => (Buffer.byteLength(s, 'utf8') / 1024).toFixed(1) + ' KB';
  console.log(`[build] mode                ${debug ? 'DEBUG (unminified + inline sourcemap)' : 'release (minified)'}`);
  console.log('[build] dist/assets/app.css  ' + kb(css));
  const builtAssets = await readdir(assets);
  for (const file of builtAssets.filter(name => name.endsWith('.js'))) {
    console.log(`[build] dist/assets/${file}  ${kb(await readFile(path.join(assets, file), 'utf8'))}`);
  }
  console.log('[build] dist/index.html      ' + kb(await readFile(path.join(dist, 'index.html'), 'utf8')));
  console.log('[build] index.html (offline) ' + kb(await readFile(path.join(root, 'index.html'), 'utf8')));
  console.log(`[build] done in ${Date.now() - t0}ms — 零外部 CDN 依赖`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
