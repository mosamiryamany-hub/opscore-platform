'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {timingSafeHexEqual}=require('../src/security');
const {model}=require('../src/ai-embeddings');

const root=path.resolve(__dirname,'..');

test('deep audit: timing-safe hex comparison rejects malformed/non-canonical hex',()=>{
  assert.equal(timingSafeHexEqual('aa','AA'),true);
  assert.equal(timingSafeHexEqual('aa','a'),false);
  assert.equal(timingSafeHexEqual('zz','zz'),false);
  assert.equal(timingSafeHexEqual('aa0','aa0'),false);
  assert.equal(timingSafeHexEqual('',''),false);
});

test('deep audit: embedding model is never guessed',()=>{
  const old=process.env.OPENAI_EMBEDDING_MODEL;
  try {
    delete process.env.OPENAI_EMBEDDING_MODEL;
    assert.throws(()=>model(),/AI_EMBEDDING_MODEL_REQUIRED/);
    process.env.OPENAI_EMBEDDING_MODEL='buyer-selected-embedding-model';
    assert.equal(model(),'buyer-selected-embedding-model');
  } finally {
    if(old===undefined) delete process.env.OPENAI_EMBEDDING_MODEL; else process.env.OPENAI_EMBEDDING_MODEL=old;
  }
});

test('deep audit: postgres knowledge schema is verified, never created at runtime',async()=>{
  const {ensure}=require('../src/postgres-knowledge');
  const calls=[];
  const pool={query:async(sql)=>{calls.push(sql);return {rows:[{table_name:'opscore_knowledge_chunks',vector_installed:true}]};}};
  await ensure(pool);
  assert.equal(calls.length,1);
  assert.match(calls[0],/to_regclass/);
  assert.doesNotMatch(calls[0],/CREATE TABLE|CREATE EXTENSION/i);
});

test('deep audit: postgres RLS covers every organization-scoped canonical table except documented identity/global infrastructure',()=>{
  const schema=fs.readFileSync(path.join(root,'db/postgresql_schema.sql'),'utf8');
  const rls=fs.readFileSync(path.join(root,'db/postgresql_hierarchy_rls.sql'),'utf8');
  const tables=new Set();
  for(const m of schema.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\((.*?)\);/gis)) {
    if(/\borganization_id\b/i.test(m[2])) tables.add(m[1]);
  }
  const arrays=[...rls.matchAll(/ARRAY\[(.*?)\]\s+LOOP/gs)];
  const covered=new Set();
  for(const a of arrays) for(const x of a[1].matchAll(/'([^']+)'/g)) covered.add(x[1]);
  for(const special of ['audit_log','authorization_decisions']) covered.add(special);
  const intentional=new Set(['audit_log','authorization_decisions','memberships','invitations']);
  const missing=[...tables].filter(x=>!covered.has(x)&&!intentional.has(x));
  assert.deepEqual(missing,[]);
});

test('deep audit: mobile fresh install does not require a legacy evidence table',()=>{
  const src=fs.readFileSync(path.join(root,'..','mobile','src','db.js'),'utf8');
  assert.match(src,/let legacyEvidence = \[\];/);
  assert.match(src,/no such table\|does not exist/);
});

test('deep audit: OTLP export throttle is process-wide, not per HTTP response',()=>{
  const src=fs.readFileSync(path.join(root,'src','server.js'),'utf8');
  assert.match(src,/let lastOtelExport = 0;/);
  const handler=src.slice(src.indexOf('http.createServer'));
  assert.doesNotMatch(handler,/let lastOtelExport = 0;/);
});
