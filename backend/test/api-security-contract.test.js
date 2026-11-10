'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {sanitize,safeError,redactString}=require('../src/egress-guard');

test('egress guard redacts credential-shaped fields and common PII',()=>{
  const out=sanitize({authorization:'Bearer super-secret',password:'x',email:'owner@example.com',nested:{apiKey:'abc'}});
  assert.equal(out.authorization,'[redacted-sensitive-field]');
  assert.equal(out.password,'[redacted-sensitive-field]');
  assert.equal(out.email,'[redacted-email]');
  assert.equal(out.nested.apiKey,'[redacted-sensitive-field]');
});

test('egress guard sanitizes arbitrary provider error details',()=>{
  const e=new Error('UPSTREAM: Bearer very-secret-token');
  const out=safeError(e);
  assert.deepEqual(out,{code:'UPSTREAM',name:'Error'});
});

test('redactString removes bearer tokens without altering ordinary text',()=>{
  assert.equal(redactString('Authorization Bearer abc.def.ghi'), 'Authorization Bearer [redacted-token]');
  assert.equal(redactString('ordinary message'), 'ordinary message');
});
