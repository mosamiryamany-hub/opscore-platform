const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const http=require('node:http');
const {verifyOidcIdToken}=require('../src/security');
const b64=o=>Buffer.from(o).toString('base64url');

test('OIDC verifier validates real RS256 JWT against local discovery/JWKS and nonce',async()=>{
  const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
  const jwk=publicKey.export({format:'jwk'}); jwk.kid='kid-1'; jwk.use='sig'; jwk.alg='RS256';
  const issuerPromise=new Promise(resolve=>{
    const server=http.createServer((req,res)=>{res.setHeader('content-type','application/json');
      if(req.url==='/issuer/.well-known/openid-configuration') return res.end(JSON.stringify({issuer:'http://127.0.0.1:'+server.address().port+'/issuer',jwks_uri:'http://127.0.0.1:'+server.address().port+'/issuer/jwks'}));
      if(req.url==='/issuer/jwks') return res.end(JSON.stringify({keys:[jwk]})); res.statusCode=404;res.end('{}');
    }); server.listen(0,'127.0.0.1',()=>resolve(server));
  });
  const server=await issuerPromise; const issuer='http://127.0.0.1:'+server.address().port+'/issuer';
  const old={iss:process.env.OIDC_ISSUER,aud:process.env.OIDC_AUDIENCE,node:process.env.NODE_ENV}; process.env.OIDC_ISSUER=issuer;process.env.OIDC_AUDIENCE='opscore-test';process.env.NODE_ENV='test';
  try{
    const now=Math.floor(Date.now()/1000); const header=b64(JSON.stringify({alg:'RS256',kid:'kid-1',typ:'JWT'}));
    const payload=b64(JSON.stringify({iss:issuer,sub:'subject-1',aud:'opscore-test',exp:now+120,iat:now,nonce:'nonce-1',email:'owner@oidc.test',email_verified:true}));
    const input=header+'.'+payload; const signature=crypto.sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url');
    const out=await verifyOidcIdToken(input+'.'+signature,'nonce-1'); assert.equal(out.subject,'subject-1'); assert.equal(out.email,'owner@oidc.test');
    await assert.rejects(()=>verifyOidcIdToken(input+'.'+signature,'wrong-nonce'),/OIDC_NONCE_MISMATCH/);
  } finally {server.close(); for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
