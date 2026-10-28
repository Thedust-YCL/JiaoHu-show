import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

test('production build separates noninitial labs while preserving the offline single file', async () => {
  execFileSync(process.execPath, ['tools/build.mjs'], { stdio: 'pipe' });
  const assets = await readdir('dist/assets');
  const chunks = assets.filter(name => name.endsWith('.js') && name !== 'app.js');
  assert.ok(chunks.length > 0, 'production navigation should load separate local JavaScript chunks');
  const entrySize = (await stat('dist/assets/app.js')).size;
  assert.ok(entrySize < 1_700_000, `first JavaScript entry should be smaller than 1.7 MB, got ${entrySize}`);
  const entry = await readFile('dist/assets/app.js', 'utf8');
  assert.match(entry, /import\(["']\.\//, 'chunks must use relative URLs under a project base path');
  const offline = await readFile('index.html', 'utf8');
  assert.doesNotMatch(offline, /<script[^>]+src=|<link[^>]+href=/i, 'offline artifact must inline its code and styles');
  for (const chunk of chunks) assert.ok((await stat(path.join('dist/assets', chunk))).size > 0);
});
