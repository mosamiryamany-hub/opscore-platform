'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadWorker() {
  const handlers = new Map();
  const cacheCalls = [];
  const cache = {
    addAll: async urls => cacheCalls.push({ type: 'addAll', urls }),
    put: async (request, response) => cacheCalls.push({ type: 'put', url: request.url || request }),
  };
  const cacheStorage = {
    open: async name => { cacheCalls.push({ type: 'open', name }); return cache; },
    keys: async () => ['opscore-static-v1'],
    delete: async name => { cacheCalls.push({ type: 'delete', name }); return true; },
    match: async request => request === '/offline.html' ? { offline: true } : undefined,
  };
  const self = {
    location: { origin: 'https://app.example.test' },
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
    addEventListener: (name, fn) => handlers.set(name, fn),
  };
  const context = {
    self, caches: cacheStorage, URL,
    fetch: async request => ({ ok: true, type: 'basic', request }),
    Promise,
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../web/sw.js'), 'utf8'), context);
  return { handlers, cacheCalls };
}

function request(url, method = 'GET', mode = 'cors') {
  return { url, method, mode };
}

test('service worker caches only explicitly allowlisted same-origin static assets', async () => {
  const { handlers, cacheCalls } = loadWorker();
  let installWait;
  handlers.get('install')({ waitUntil: promise => { installWait = promise; } });
  await installWait;
  const added = cacheCalls.find(x => x.type === 'addAll');
  assert.ok(added);
  assert.ok(added.urls.includes('/offline.html'));
  assert.ok(added.urls.includes('/styles.css'));
  assert.ok(!added.urls.some(url => url.startsWith('/api/')));
});

test('service worker never intercepts private APIs or cross-origin map tile requests', () => {
  const { handlers } = loadWorker();
  for (const req of [
    request('https://app.example.test/api/v1/map/viewport'),
    request('https://tiles.example.test/12/100/200.pbf'),
  ]) {
    let intercepted = false;
    handlers.get('fetch')({ request: req, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false);
  }
});

test('service worker serves the explicit offline shell for failed navigations only', async () => {
  // Re-evaluate with a failing fetch implementation without changing the global runtime.
  const handlers2 = new Map();
  const self = {
    location: { origin: 'https://app.example.test' },
    addEventListener: (name, fn) => handlers2.set(name, fn),
  };
  const context = {
    self, caches: { match: async key => key === '/offline.html' ? { offline: true } : undefined },
    URL, Promise, fetch: async () => { throw new Error('offline'); },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../web/sw.js'), 'utf8'), context);
  let responsePromise;
  handlers2.get('fetch')({
    request: request('https://app.example.test/control-room', 'GET', 'navigate'),
    respondWith: promise => { responsePromise = promise; },
  });
  assert.deepEqual(await responsePromise, { offline: true });
});
