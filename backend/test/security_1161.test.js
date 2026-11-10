const test=require('node:test');
const http=require('node:http');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {openDb}=require('../src/db');
const {Store}=require('../src/store');
const {authProviderGate,verifyOidcIdToken}=require('../src/security');
const root=path.resolve(__dirname,'..');
const b64=o=>Buffer.from(o).toString('base64url');

test('OIDC auth gate requires issuer and audience and permits configured mode',()=>{
  const old={mode:process.env.AUTH_MODE,issuer:process.env.OIDC_ISSUER,aud:process.env.OIDC_AUDIENCE};
  try{process.env.AUTH_MODE='oidc';delete process.env.OIDC_ISSUER;delete process.env.OIDC_AUDIENCE;assert.throws(()=>authProviderGate(),/OIDC_CONFIGURATION_REQUIRED/);process.env.OIDC_ISSUER='https://idp.example.test';process.env.OIDC_AUDIENCE='opscore';assert.equal(authProviderGate(),'oidc');}
  finally{for(const[k,v]of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

test('OIDC identity binds by issuer+subject and prevents silent email takeover',()=>{
  const db=openDb(':memory:'),s=new Store(db,{sessionTtlHours:1});
  const old=process.env.OIDC_AUTO_LINK_EMAIL; process.env.OIDC_AUTO_LINK_EMAIL='true';
  try{s.bootstrap({orgName:'OIDC Ops',email:'owner@oidc.test',password:'Owner-strong-pass-2026'});const id={issuer:'https://idp.example.test',subject:'sub-1',email:'owner@oidc.test',emailVerified:true};const out=s.loginOidc(id);assert.equal(out.organization.name,'OIDC Ops');assert.throws(()=>s.loginOidc({...id,subject:'sub-2',email:'other@oidc.test'}),/OIDC_USER_NOT_PROVISIONED/);assert.throws(()=>s.loginOidc({...id,subject:'sub-1',email:'different@oidc.test'}),/OIDC_EMAIL_CHANGED_REQUIRES_RELINK/);}
  finally{if(old===undefined)delete process.env.OIDC_AUTO_LINK_EMAIL;else process.env.OIDC_AUTO_LINK_EMAIL=old;db.close();}
});

test('field signoff challenge is tenant/user/document bound and single-use',()=>{
  const db=openDb(':memory:'),s=new Store(db,{sessionTtlHours:1});
  try{s.bootstrap({orgName:'Sign Ops',email:'owner@sign.test',password:'Owner-strong-pass-2026'});const c=s.login('owner@sign.test','Owner-strong-pass-2026');const w=s.createWorkOrder(c,{title:'Signoff'});const doc=crypto.createHash('sha256').update('document-v1').digest('hex');const issued=s.issueFieldSignoffChallenge(c,{workOrderId:w.id,documentSha256:doc});assert.equal(issued.schemaVersion,'opscore.field-signoff-challenge.v1');const consumed=s.consumeFieldSignoffChallenge(c,{workOrderId:w.id,challenge:issued.challenge,documentSha256:doc,assuranceMode:'os_local_biometric_gate'});assert.equal(consumed.serverVerified,false);assert.equal(consumed.assuranceMode,'os_local_biometric_gate');assert.throws(()=>s.consumeFieldSignoffChallenge(c,{workOrderId:w.id,challenge:issued.challenge,documentSha256:doc,assuranceMode:'os_local_biometric_gate'}),/SIGNOFF_CHALLENGE_INVALID_OR_REPLAYED/);}
  finally{db.close();}
});

test('mobile source enforces encrypted evidence and deferred retry scheduling',()=>{
  const dbsrc=fs.readFileSync(path.join(__dirname,'../../mobile/src/db.js'),'utf8');
  const sync=fs.readFileSync(path.join(__dirname,'../../mobile/src/sync.js'),'utf8');
  const sig=fs.readFileSync(path.join(__dirname,'../../mobile/src/signoff-assurance.js'),'utf8');
  assert.match(dbsrc,/content_ciphertext/);assert.match(dbsrc,/encryptLocalEvidence/);assert.match(dbsrc,/operation\(await getDb\(\)\)/);assert.match(dbsrc,/next_attempt_at/);assert.doesNotMatch(sync,/setTimeout\(/);assert.match(sync,/flushInFlight/);assert.match(sig,/SERVER_SIGNOFF_CHALLENGE_REQUIRED/);
});


test('server exposes server-bound field signoff challenge lifecycle',()=>{
  const server=fs.readFileSync(path.join(root,'src','server.js'),'utf8');
  assert.ok(server.includes('signoff-assurance\\/challenge'));
  assert.ok(server.includes('signoff-assurance\\/complete'));
  assert.match(server,/SIGNOFF_CHALLENGE_REQUIRED/);
});


test('legacy evidence is migrated before v2 is dropped',()=>{
  const dbsrc=fs.readFileSync(path.join(root,'..','mobile','src','db.js'),'utf8');
  assert.ok(dbsrc.indexOf('SELECT id,scope,work_order_id,file_name,media_type,content_base64') < dbsrc.indexOf('DROP TABLE IF EXISTS evidence_local_v2'));
  assert.match(dbsrc,/encryptLocalEvidence\(row\.content_base64/);
});


test('OIDC verifier rejects undersized RSA signing keys', async () => {
  const {publicKey} = crypto.generateKeyPairSync('rsa',{modulusLength:1024});
  const jwk=publicKey.export({format:'jwk'}); jwk.kid='weak-kid'; jwk.use='sig'; jwk.alg='RS256';
  const server=await new Promise(resolve=>{const srv=http.createServer((req,res)=>{res.setHeader('content-type','application/json'); if(req.url==='/issuer/.well-known/openid-configuration') return res.end(JSON.stringify({issuer:'http://127.0.0.1:'+srv.address().port+'/issuer',jwks_uri:'http://127.0.0.1:'+srv.address().port+'/issuer/jwks'})); if(req.url==='/issuer/jwks') return res.end(JSON.stringify({keys:[jwk]})); res.statusCode=404;res.end('{}');}); srv.listen(0,'127.0.0.1',()=>resolve(srv));});
  const old={iss:process.env.OIDC_ISSUER,aud:process.env.OIDC_AUDIENCE,node:process.env.NODE_ENV}; process.env.OIDC_ISSUER='http://127.0.0.1:'+server.address().port+'/issuer'; process.env.OIDC_AUDIENCE='opscore-test'; process.env.NODE_ENV='test';
  try { const now=Math.floor(Date.now()/1000); const header=b64(JSON.stringify({alg:'RS256',kid:'weak-kid',typ:'JWT'})); const payload=b64(JSON.stringify({iss:process.env.OIDC_ISSUER,sub:'weak',aud:'opscore-test',exp:now+120,iat:now,email:'unknown@example.test',email_verified:true})); const input=header+'.'+payload; const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:1024}); const sig=crypto.sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url'); await assert.rejects(()=>verifyOidcIdToken(input+'.'+sig),/OIDC_SIGNING_KEY_NOT_FOUND|OIDC_RSA_KEY_TOO_WEAK/); }
  finally {server.close(); for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

test('OIDC unknown-key refresh is coalesced and cooldown-limited', async()=>{
  const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048}); const jwk=publicKey.export({format:'jwk'}); jwk.kid='known-kid'; jwk.use='sig'; jwk.alg='RS256';
  let discoveryCount=0,jwksCount=0;
  const server=await new Promise(resolve=>{const srv=http.createServer((req,res)=>{res.setHeader('content-type','application/json'); if(req.url==='/issuer/.well-known/openid-configuration'){discoveryCount++;return res.end(JSON.stringify({issuer:'http://127.0.0.1:'+srv.address().port+'/issuer',jwks_uri:'http://127.0.0.1:'+srv.address().port+'/issuer/jwks'}));} if(req.url==='/issuer/jwks'){jwksCount++;return res.end(JSON.stringify({keys:[jwk]}));} res.statusCode=404;res.end('{}');}); srv.listen(0,'127.0.0.1',()=>resolve(srv));});
  const old={iss:process.env.OIDC_ISSUER,aud:process.env.OIDC_AUDIENCE,node:process.env.NODE_ENV}; process.env.OIDC_ISSUER='http://127.0.0.1:'+server.address().port+'/issuer'; process.env.OIDC_AUDIENCE='opscore-test'; process.env.NODE_ENV='test';
  try { const now=Math.floor(Date.now()/1000); const make=(kid)=>{const header=b64(JSON.stringify({alg:'RS256',kid,typ:'JWT'})); const payload=b64(JSON.stringify({iss:process.env.OIDC_ISSUER,sub:'unknown-'+kid,aud:'opscore-test',exp:now+120,iat:now,email:'unknown@example.test',email_verified:true})); const input=header+'.'+payload; return input+'.'+crypto.sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url');}; const good=make('known-kid'); await verifyOidcIdToken(good); await assert.rejects(()=>verifyOidcIdToken(make('random-kid-1')),/OIDC_SIGNING_KEY_NOT_FOUND/); await assert.rejects(()=>verifyOidcIdToken(make('random-kid-2')),/OIDC_SIGNING_KEY_NOT_FOUND/); assert.equal(discoveryCount,2); assert.equal(jwksCount,2); }
  finally {server.close(); for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
