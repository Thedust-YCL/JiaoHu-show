/**
 * tools/check.mjs
 * ------------------------------------------------------------------
 * 静态检查（M1.1_TASK A22 的可执行替代方案）。
 *
 * 说明：本仓库是原生 ES Module + esbuild 的纯前端项目，**没有 TypeScript**，
 * 因此这里提供实际可执行的静态检查，而不是伪造一个 `tsc` 结果：
 *   1. 语法检查：对 src 下每个 .js 执行 `node --check`（ESM 解析）；
 *   2. 数据契约检查：运行统一知识层的 validateKnowledge()，零问题才通过；
 *   3. 产物检查：确认 dist/index.html 使用相对路径引用资源。
 *
 * 用法：node tools/check.mjs
 * ------------------------------------------------------------------
 */
import { readdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { validateKnowledge, knowledgeStats } from '../src/knowledge/index.js';
import { sourceStats } from '../src/knowledge/sources.js';
import { createExample } from '../src/features/constructor/model/configuration.js';
import { preflight } from '../src/features/constructor/model/preflight.js';

const root = process.cwd();

async function collectJs(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectJs(full)));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out.sort();
}

function checkSyntax(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--check', file], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (code) => resolve({ file, ok: code === 0, stderr: stderr.trim() }));
  });
}

async function main() {
  const files = await collectJs(path.join(root, 'src'));
  const results = [];
  for (const file of files) results.push(await checkSyntax(file));
  const failed = results.filter((r) => !r.ok);

  const issues = validateKnowledge();
  const stats = knowledgeStats();
  const sources = sourceStats();

  const distIndex = path.join(root, 'dist', 'index.html');
  let distOk = null;
  let distNote = '未构建（跳过）';
  if (existsSync(distIndex)) {
    const html = await readFile(distIndex, 'utf8');
    const abs = /(src|href)="\/(?!\/)/.test(html) || /(src|href)="https?:/.test(html);
    const relative = /src="\.\/assets\/app\.js"/.test(html) && /href="\.\/assets\/app\.css"/.test(html);
    distOk = !abs && relative;
    distNote = `相对引用=${relative} · 绝对/CDN 引用=${abs}`;
  }

  console.log('=== 1. 语法检查（node --check · ESM） ===');
  console.log(`文件数 ${results.length} · 通过 ${results.length - failed.length} · 失败 ${failed.length}`);
  for (const f of failed) console.log(`FAIL ${path.relative(root, f.file)}\n${f.stderr}`);

  console.log('\n=== 2. 知识层数据契约（validateKnowledge） ===');
  console.log(`章节 ${stats.chapters} · 概念 ${stats.concepts} · 关系 ${stats.edges} · 问题 ${issues.length}`);
  console.log(`状态分布 outline=${stats.byStatus.outline} reviewed=${stats.byStatus.reviewed} published=${stats.byStatus.published} draft=${stats.byStatus.draft}`);
  console.log(
    `来源 ${sources.total} 条（外部 ${sources.external} · 已核验 ${sources.reviewed}）· 实验 ${stats.experiments.available}/${stats.experiments.total} 可操作`
  );
  for (const issue of issues) console.log('FAIL ' + JSON.stringify(issue));

  console.log('\n=== 3. 静态产物路径（dist/index.html） ===');
  console.log(distNote);

  console.log('\n=== 4. Agent Configuration v2 契约 ===');
  const configChecks=['starter','evidence-first'].map(kind=>({kind,result:preflight(createExample(kind))}));
  for(const {kind,result} of configChecks)console.log(`${kind}: errors=${result.counts.error}, warnings=${result.counts.warning}, ready=${result.ready}`);
  const ok = failed.length === 0 && issues.length === 0 && distOk !== false && configChecks.every(c=>c.result.ready);
  console.log(`\n结论：${ok ? '通过' : '未通过'}`);
  if (!ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
