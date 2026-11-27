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

test('Contact Center readiness and queue counters are derived from server response fields', () => {
  for (const id of ['aiReadiness', 'encryptionReadiness', 'voiceReadiness', 'queueReadiness', 'queuedCount', 'claimedCount', 'priorityCount']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(script, /status\?\.textAssistantConfigured/);
  assert.match(script, /status\?\.encryptionConfigured/);
  assert.match(script, /status\?\.realtimeBrowserVoiceConfigured/);
  assert.match(script, /items\.filter\(item=>String\(item\.status/);
  assert.match(script, /items\.filter\(item=>\['high','urgent','critical'\]/);
  assert.match(html, /maximum 50 rows/);
  assert.match(html, /not a phone-network call/);
});

test('Control Rooms exposes a Contact Center route without inventing operational data', () => {
  assert.match(roomsHtml, /data-room="contact"/);
  assert.match(roomsScript, /contact: \{/);
  assert.match(roomsScript, /path: '\/contact-center\.html'/);
  assert.match(roomsScript, /go\.href = m\.path \|\| '\/control-plane\.html'/);
  assert.match(roomsHtml, /Nine rooms\. One command fabric\./);
  assert.match(roomsHtml, /no invented load, risk, queue or integrity values/);
});
