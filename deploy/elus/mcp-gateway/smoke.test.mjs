import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';

const base = 'http://127.0.0.1:18081';
const child = spawn(process.execPath, ['server.mjs'], {
  cwd: new URL('.', import.meta.url).pathname,
  env: { ...process.env, PORT: '18081', HINDSIGHT_API_TENANT_API_KEY: 'local-test-only', ALLOWED_AUTH0_SUBJECTS: 'local-test-operator' },
  stdio: 'ignore',
});
try {
  let ready = false;
  for(let i=0;i<40;i++) {
    if(child.exitCode !== null) throw new Error('Gateway exited unexpectedly');
    try { const r=await fetch(base+'/__elus_gateway_health'); if(r.ok){ready=true;break;} } catch {}
    await delay(100);
  }
  if(!ready) throw new Error('Gateway startup timed out');
  await test('Healthcheck responds without upstream connection', async () => {
    const r=await fetch(base+'/__elus_gateway_health');
    assert.equal(r.status,200);
    assert.equal((await r.json()).status,'ok');
  });
  await test('Protected-resource discovery exposes exact Auth0 API audience', async () => {
    for(const path of ['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp/wandora_memory']) {
      const r=await fetch(base+path);
      assert.equal(r.status,200);
      const j=await r.json();
      assert.equal(j.resource,'https://memo.elus360.com.br/mcp');
      assert.deepEqual(j.authorization_servers,['https://elus360.us.auth0.com/']);
    }
  });
  await test('Missing bearer is rejected with challenge', async () => {
    const r=await fetch(base+'/mcp/wandora_memory/',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
    assert.equal(r.status,401);
    assert.match(r.headers.get('www-authenticate')||'',/oauth-protected-resource/);
  });
  await test('Malformed bearer is rejected', async () => {
    const r=await fetch(base+'/mcp/wandora_memory/',{method:'POST',headers:{authorization:'Bearer invalid'},body:'{}'});
    assert.equal(r.status,401);
    assert.equal((await r.json()).error,'invalid_token');
  });
  await test('Other banks are not routable', async () => {
    const r=await fetch(base+'/mcp/other_bank/');
    assert.equal(r.status,404);
  });
} finally {
  child.kill('SIGTERM');
}
