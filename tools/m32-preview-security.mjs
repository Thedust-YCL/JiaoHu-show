import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';

for (const script of ['tools/preview.mjs', 'tools/dev.mjs']) test(`${script} rejects encoded traversal outside its root`, async () => {
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, [script], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('preview did not start')), 5000);
      child.stdout.once('data', () => { clearTimeout(timer); resolve(); });
      child.once('error', reject);
      child.once('exit', code => reject(Error(`preview exited ${code}`)));
    });
    const request = path => new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port, path }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); }).on('error', reject);
    });
    assert.equal(await request('/'), 200);
    assert.equal(await request('/%2e%2e%2fpackage.json'), 403);
    assert.equal(await request('/%2e%2e%5cpackage.json'), 403);
  } finally { child.kill(); }
});
