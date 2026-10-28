import test from 'node:test';
import assert from 'node:assert/strict';

// Removing the guarded download API would lose the recoverable error result.
test('M3.1 本地下载不可用时返回实际原因，且不虚报成功',async()=>{
  const api=await import('../src/components/ui/download.js').catch(()=>({}));
  assert.equal(typeof api.downloadLocalFile,'function');
  const result=api.downloadLocalFile({content:'报告',filename:'report.md',type:'text/markdown'});
  assert.equal(result.ok,false);
  assert.match(result.message,/无法|不可用/);
});
