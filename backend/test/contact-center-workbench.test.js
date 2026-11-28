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
  assert.match(script, /qualifiedForProduction===true/);
  assert.match(script, /dataset\.qualification/);
});

test('Control Rooms exposes a Contact Center route and real operational workspaces', () => {
  assert.match(roomsHtml, /data-room="contact"/);
  assert.match(roomsHtml, /data-room="twin"/);
  assert.match(roomsHtml, /href="\/dispatcher-map\.html"/);
  assert.ok(roomsScript.includes("key === 'contact'"));
  assert.ok(roomsScript.includes("'/contact-center-room.html'"));
  assert.ok(roomsScript.includes("key === 'twin'"));
  assert.ok(roomsScript.includes("'/digital-twin-room.html'"));
  assert.ok(roomsScript.includes("'/control-room.html?room=' + encodeURIComponent(key || '')"));
  assert.match(roomsHtml, /Ten rooms\. One command fabric\./);
  assert.match(roomsHtml, /no invented load, risk, queue or integrity values/);
});

test('Agent Control Room uses tenant-scoped APIs, assignment checks and visibility-aware refresh', () => {
  const roomHtml = fs.readFileSync(path.join(webRoot, 'contact-center-room.html'), 'utf8');
  const roomScript = fs.readFileSync(path.join(webRoot, 'contact-center-room.js'), 'utf8');
  assert.match(roomHtml, /\/styles\.css/);
  assert.match(roomHtml, /\/command-fabric-v3\.css/);
  assert.match(roomHtml, /class="shell shell--wide ccr-shell"/);
  for (const id of ['ccrTotal','ccrQueued','ccrClaimed','ccrPriority','ccrQueueList','ccrTranscript','ccrReplyForm','ccrResolve','ccrPriorityFilter','ccrSort','ccrEventTimeline','ccrWaitClock','ccrSupervisorPanel','ccrAgentDistribution','ccrAgentFilter']) {
    assert.match(roomHtml, new RegExp('id="' + id + '"'));
  }
  assert.match(roomScript, /\/api\/v1\/contact-center\/handoffs\?status=open&limit=50/);
  assert.match(roomScript, /\/api\/v1\/contact-center\/handoffs\//);
  assert.match(roomScript, /\/human-reply/);
  assert.match(roomScript, /\/resolve/);
  assert.match(roomScript, /credentials: 'same-origin'/);
  assert.match(roomScript, /api\('\/api\/v1\/me'\)/);
  assert.match(roomScript, /state\.selected\.assignedTo === state\.currentUserId/);
  assert.match(roomScript, /resolutionNote\.disabled = state\.busy \|\| !permitted/);
  assert.match(roomScript, /if \(!canOperateSelected\(\)\) throw new Error/);
  assert.match(roomScript, /body:\{note\}/);
  assert.match(roomHtml, /id="ccrResolutionNote"/);
  assert.match(roomHtml, /id="ccrAssignmentGuard"/);
  assert.match(roomScript, /items\.filter\(item => item\.status === 'queued'\)/);
  assert.match(roomScript, /aggregate\('reasonCode'\)/);
  assert.match(roomScript, /aggregate\('channel'\)/);
  assert.match(roomScript, /aggregate\('languageCode'\)/);
  assert.match(roomScript, /Maximum request size: 50 rows/);
  assert.match(roomScript, /loadCaseEvents/);
  assert.match(roomScript, /currentUserRole/);
  assert.match(roomScript, /renderAgentDistribution/);
  assert.match(roomScript, /\['owner','admin','manager'\]/);
  assert.match(roomScript, /updateElapsedClock\(item\.createdAt\)/);
  assert.doesNotMatch(roomScript, /Math[.]random|fake|mock/i);
  assert.ok(roomScript.includes('if (!document.hidden && !state.busy) refreshQueue();'));
  assert.ok(roomScript.includes('}, 30000);'));
  assert.ok(roomScript.includes('}, 60000);'));
  assert.match(roomHtml, /A queue row is not a connected phone call/);
});
