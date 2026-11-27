'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseURL = process.env.OPSC_UI_BASE_URL || 'http://127.0.0.1:4173';
const outputDir = path.resolve(process.env.OPSC_UI_ARTIFACT_DIR || 'ui-browser-artifacts');
const report = { schemaVersion: 'opscore.pwa-map-browser.v1', checks: [], failures: [], axe: null };
const check = (name, ok, details = null) => {
  report.checks.push({ name, ok, details });
  if (!ok) report.failures.push({ name, details });
};

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    const response = await page.goto(baseURL + '/dispatcher-map.html', { waitUntil: 'networkidle' });
    check('dispatcher map route responds', Boolean(response && response.ok()), response && response.status());
    check('manifest link exists', await page.locator('link[rel="manifest"][href="/manifest.webmanifest"]').count() === 1);
    check('MapLibre dependency is exact-version pinned', (await page.locator('link[href*="maplibre-gl@6.20.0"]').count()) === 1);
    check('map page describes last check-in semantics', (await page.locator('body').innerText()).includes('not continuous GPS tracking'));
    check('map list begins without fabricated pins', await page.locator('#pointCount').innerText() === '—' || await page.locator('#pointCount').innerText() === '0');
    check('no map markers are hardcoded in initial document', await page.locator('.maplibregl-marker').count() === 0);
    await page.keyboard.press('Tab');
    check('first keyboard focus is skip link', await page.evaluate(() => document.activeElement?.matches('a.skip') === true));

    const registration = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { supported: false };
      const reg = await navigator.serviceWorker.getRegistration('/');
      return { supported: true, registered: Boolean(reg), scope: reg?.scope || null };
    });
    check('PWA service worker is registered for root scope', registration.registered === true && registration.scope === new URL('/', baseURL).toString(), registration);
    const cachedApi = await page.evaluate(async () => {
      const keys = await caches.keys();
      const requests = [];
      for (const key of keys) {
        const cache = await caches.open(key);
        for (const request of await cache.keys()) if (new URL(request.url).pathname.startsWith('/api/')) requests.push(request.url);
      }
      return requests;
    });
    check('no API paths are present in Cache Storage', cachedApi.length === 0, cachedApi);

    for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      const layout = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      check('no horizontal overflow at ' + viewport.width, Math.max(layout.document, layout.body) <= layout.viewport + 1, layout);
      await page.screenshot({ path: path.join(outputDir, 'dispatcher-map-' + viewport.width + '.png'), fullPage: true });
    }

    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    report.axe = await page.evaluate(async () => {
      const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
      return {
        passes: result.passes.length,
        incomplete: result.incomplete.length,
        violations: result.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length }))
      };
    });
    check('no critical axe violations', !report.axe.violations.some(v => v.impact === 'critical'), report.axe.violations);
    check('no uncaught page errors', pageErrors.length === 0, pageErrors);
    fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ checks: report.checks.length, failed: report.failures.length, axeViolations: report.axe.violations.length }, null, 2));
    if (report.failures.length) {
      console.error(JSON.stringify(report.failures, null, 2));
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
