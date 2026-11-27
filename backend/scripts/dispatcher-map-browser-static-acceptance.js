'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const base = process.env.OPSC_UI_BASE_URL || 'http://127.0.0.1:4174';
  const out = process.env.OPSC_UI_ARTIFACT_DIR || path.join(process.cwd(), 'dispatcher-map-browser-artifacts');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const results = [];
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push({ message: error.message, stack: error.stack }));
    page.on('console', entry => {
      if (entry.type() !== 'error') return;
      const location = entry.location();
      const expectedAuthMiss = location.url === base + '/api/v1/me' && /404/.test(entry.text());
      if (!expectedAuthMiss) errors.push({ console: entry.text(), location });
    });
    const authProbe = page.waitForResponse(response => response.url().endsWith('/api/v1/me'));
    const response = await page.goto(base + '/dispatcher-map.html', { waitUntil: 'networkidle' });
    const authResponse = await authProbe;
    assert.equal(response.status(), 200);
    assert.equal(authResponse.status(), 404, 'static-only acceptance must not pretend an authenticated API exists');
    await page.getByRole('heading', { name: 'Dispatcher map' }).waitFor();
    assert.equal(await page.locator('#dispatcherMap').count(), 1);
    assert.equal(await page.locator('#pointList').count(), 1);
    assert.equal(await page.locator('#pointCount').textContent(), '0');

    for (const viewport of [
      { name: 'small-mobile', width: 320, height: 740 },
      { name: 'mobile', width: 375, height: 812 },
      { name: 'large-mobile', width: 430, height: 932 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1366, height: 900 },
      { name: 'wide-desktop', width: 1920, height: 1080 }
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const metrics = await page.evaluate(() => {
        const map = document.querySelector('#dispatcherMap').getBoundingClientRect();
        return {
          documentWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth,
          mapWidth: Math.round(map.width),
          mapHeight: Math.round(map.height),
          mapVisible: map.width > 0 && map.height >= 260 && map.left >= 0 && map.right <= innerWidth + 1
        };
      });
      assert.ok(metrics.scrollWidth <= viewport.width + 1, viewport.name + ' document overflow: ' + JSON.stringify(metrics));
      assert.ok(metrics.bodyScrollWidth <= viewport.width + 1, viewport.name + ' body overflow: ' + JSON.stringify(metrics));
      assert.ok(metrics.mapVisible, viewport.name + ' map frame must remain visible: ' + JSON.stringify(metrics));
      await page.screenshot({ path: path.join(out, 'dispatcher-map-' + viewport.name + '.png'), fullPage: true });
      results.push({ viewport: viewport.name, ...metrics, status: 'PASS' });
    }

    await page.setViewportSize({ width: 375, height: 812 });
    await page.locator('[data-dir-toggle]').click();
    assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
    assert.equal(await page.locator('html').getAttribute('lang'), 'ar');
    await page.screenshot({ path: path.join(out, 'dispatcher-map-mobile-rtl.png'), fullPage: true });
    await page.locator('[data-dir-toggle]').click();
    assert.equal(await page.locator('html').getAttribute('dir'), 'ltr');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.deepEqual(errors, []);
    results.push({ rtlToggle: 'PASS', uncaughtPageErrors: errors.length, status: 'PASS' });
    fs.writeFileSync(path.join(out, 'dispatcher-map-browser-report.json'), JSON.stringify({
      schemaVersion: 'opscore.dispatcher-map-static-browser-acceptance.v1',
      generatedAt: new Date().toISOString(),
      browser: await browser.version(),
      base,
      results,
      pageErrors: errors,
      boundary: 'Static layout and direction acceptance only. API authentication intentionally returned 404; no live map tiles, authenticated records, or GIS rendering are claimed.'
    }, null, 2) + '\n');
    process.stdout.write(JSON.stringify(results, null, 2) + '\n');
  } finally {
    await browser.close();
  }
})().catch(error => {
  process.stderr.write((error.stack || error.message) + '\n');
  process.exitCode = 1;
});
