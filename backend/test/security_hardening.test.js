const test=require('node:test');
const assert=require('node:assert/strict');
const {validateWebhookUrl,authProviderGate}=require('../src/security');

test('webhook URL blocks SSRF targets before delivery',()=>{
  for (const url of ['https://127.0.0.1/hook','https://10.0.0.8/hook','https://169.254.169.254/latest/meta-data','https://[::1]/hook']) {
    assert.throws(()=>validateWebhookUrl(url),/WEBHOOK_TARGET_FORBIDDEN/);
  }
  assert.throws(()=>validateWebhookUrl('http://example.com/hook'),/WEBHOOK_URL_INVALID/);
  assert.throws(()=>validateWebhookUrl('https://user:pass@example.com/hook'),/WEBHOOK_URL_INVALID/);
  assert.equal(validateWebhookUrl('https://example.com/hook'),'https://example.com/hook');
});

test('OIDC mode fails closed when no real verifier is present',()=>{
  const old=process.env.AUTH_MODE;
  process.env.AUTH_MODE='oidc';
  try { assert.throws(()=>authProviderGate(),/OIDC_CONFIGURATION_REQUIRED/); }
  finally { if(old===undefined) delete process.env.AUTH_MODE; else process.env.AUTH_MODE=old; }
});
