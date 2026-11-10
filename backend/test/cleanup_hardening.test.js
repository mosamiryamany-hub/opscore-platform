const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('runtime source contains no empty catch blocks', () => {
  const src = path.resolve(__dirname, '../src');
  const files = fs.readdirSync(src).filter(f => f.endsWith('.js'));
  const offenders = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(src, file), 'utf8');
    if (/catch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(text)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

test('public request URL parsing uses trusted configured origin', () => {
  const server = fs.readFileSync(path.resolve(__dirname, '../src/server.js'), 'utf8');
  assert.match(server, /new URL\(req\.url, config\.publicOrigin\)/);
  assert.doesNotMatch(server, /new URL\(req\.url, `http:\/\/\$\{ req\.headers\.host/);
});

test('OpenAI model identifier is explicit and never guessed', () => {
  const ai = fs.readFileSync(path.resolve(__dirname, '../src/ai-copilot.js'), 'utf8');
  assert.match(ai, /process\.env\.OPENAI_MODEL/);
  assert.doesNotMatch(ai, /gpt-5\.6-luna/);
  assert.match(ai, /AI_MODEL_NOT_CONFIGURED/);
});

test('backend package declares its proprietary licensing boundary', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
  assert.equal(pkg.license, 'UNLICENSED');
});

test('OpenAI provider status is disabled when the model id is absent', () => {
  const previous = {
    provider: process.env.AI_PROVIDER,
    key: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL
  };
  process.env.AI_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'test-key';
  delete process.env.OPENAI_MODEL;
  delete require.cache[require.resolve('../src/ai-copilot')];
  const { aiStatus, openaiSummary } = require('../src/ai-copilot');
  assert.equal(aiStatus().enabled, false);
  assert.equal(aiStatus().model, null);
  assert.rejects(() => openaiSummary({}), /AI_MODEL_NOT_CONFIGURED/);
  if (previous.provider === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = previous.provider;
  if (previous.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous.key;
  if (previous.model === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = previous.model;
  delete require.cache[require.resolve('../src/ai-copilot')];
});

test('production password hashing enforces the 2^17 scrypt floor',()=>{
  const cp=require('node:child_process');
  const out=cp.execFileSync(process.execPath,['-e',"const s=require('./src/security'); const h=s.hashPassword('Strong-pass-2026'); console.log(h.split('$')[1]);"],{cwd:path.resolve(__dirname,'..'),env:{...process.env,NODE_ENV:'production',OPSC_TEST_SCRYPT_N:''},encoding:'utf8'}).trim();
  assert.equal(out,'131072');
});
