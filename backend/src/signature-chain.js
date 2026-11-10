'use strict';
const crypto=require('node:crypto');
function canonical(v){return JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(a=>[a,x[a]])):x);}
function appendChain(previousHash,payload){const prev=String(previousHash||'0'.repeat(64));const payloadHash=crypto.createHash('sha256').update(canonical(payload)).digest('hex');const chainHash=crypto.createHash('sha256').update(`${prev}:${payloadHash}`).digest('hex');return {previousHash:prev,payloadHash,chainHash};}
function verifyChain(items){let prev='0'.repeat(64);for(const x of items){const expected=appendChain(prev,x.payload);if(expected.previousHash!==x.previousHash||expected.payloadHash!==x.payloadHash||expected.chainHash!==x.chainHash)return {valid:false,brokenAt:x.level};prev=x.chainHash;}return {valid:true,chainHash:prev};}
module.exports={appendChain,verifyChain};
