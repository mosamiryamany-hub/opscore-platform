'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const webRoot = path.resolve(__dirname, '..', 'web');
const html = fs.readFileSync(path.join(webRoot, 'contact-center.html'), 'utf8');
const script = fs.readFileSync(path.join(webRoot, 'contact-center.js'), 'utf8');
const roomsHtml = fs.readFileSync(path.join(webRoot, 'control-rooms.html'), 'utf8');
const roomsScript = fs.readFileSync(path.join(webRoot, 'rooms.js'), 'utf8');

test('Contact Center uses shared Command Fabric shell and all runtime selectors exist', () => {
  assert.match(html, /\/styles\.css/);
  assert.match(html, /\/command-fabric-v3\.css/);
  assert.match(html, /\/fabric-core\.js/);
  assert.match(html, /class="shell shell--wide cc-shell"/);
  const htmlIds = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]));
  const scriptIds = new Set([...script.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].map(match => match[1]));
  const missing = [...scriptIds].filter(id => !htmlIds.has(id));
  assert.deepEqual(missing, [], 'every Contact Center JavaScript DOM lookup must resolve');
});

test('Contact Center customer actions remain consented and require real backend configuration', () => {
  assert.match(html, /id="interfaceLanguageSelect"/);
  assert.match(html, /data-i18n-machine-notice/);
  assert.match(html, /data-i18n="customer\.consentText"/);
  assert.match(script, /status\?\.enabled/);
  assert.match(script, /status\?\.encryptionConfigured/);
  assert.match(script, /status\?\.textAssistantConfigured/);
  assert.match(script, /status\?\.realtimeBrowserVoiceConfigured/);
  assert.match(script, /items=Array\.isArray\(result\.items\)\?result\.items:\[\]/);
  assert.match(html, /A queue item means requested, not connected/);
  assert.match(script, /handoffs\?status=open&limit=50/);
});

test('Control Rooms exposes a Contact Center route without inventing operational data', () => {
  assert.match(roomsHtml, /data-room="contact"/);
  assert.match(roomsScript, /contact: \{/);
  assert.match(roomsScript, /path: '\/contact-center-room\.html'/);
  assert.match(roomsScript, /go\.href = m\.path \|\| '\/control-plane\.html'/);
  assert.match(roomsHtml, /Nine rooms\. One command fabric\./);
  assert.match(roomsHtml, /no invented load, risk, queue or integrity values/);
});

test('Agent Control Room uses only existing tenant-scoped APIs for queue, transcript and operator actions', () => {
  const roomHtml = fs.readFileSync(path.join(webRoot, 'contact-center-room.html'), 'utf8');
  const roomScript = fs.readFileSync(path.join(webRoot, 'contact-center-room.js'), 'utf8');
  assert.match(roomHtml, /\/styles\.css/);
  assert.match(roomHtml, /\/command-fabric-v3\.css/);
  assert.match(roomHtml, /class="shell shell--wide ccr-shell"/);
  for (const id of ['ccrTotal','ccrQueued','ccrClaimed','ccrPriority','ccrQueueList','ccrTranscript','ccrReplyForm','ccrResolve']) {
    assert.match(roomHtml, new RegExp('id="' + id + '"'));
  }
  assert.match(roomScript, /\/api\/v1\/contact-center\/handoffs\?status=open&limit=50/);
  assert.match(roomScript, /\/api\/v1\/contact-center\/handoffs\//);
  assert.match(roomScript, /\/human-reply/);
  assert.match(roomScript, /\/resolve/);
  assert.match(roomScript, /credentials: 'same-origin'/);
  assert.match(roomScript, /items\.filter\(item => item\.status === 'queued'\)/);
  assert.match(roomHtml, /A queue row is not a connected phone call/);
  assert.doesNotMatch(roomScript, /Math\.random|setInterval|fake|mock/i);
  const roomIds = new Set([...roomHtml.matchAll(/id="([^"]+)"/g)].map(match => match[1]));
  const roomRefs = new Set([...roomScript.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].map(match => match[1]));
  assert.deepEqual([...roomRefs].filter(id => !roomIds.has(id)), [], 'all Agent Control Room DOM selectors must resolve');
});
