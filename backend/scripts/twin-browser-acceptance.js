'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const base = process.env.OPSC_UI_BASE_URL || 'http://127.0.0.1:4173';
  const out = process.env.OPSC_UI_ARTIFACT_DIR || path.join(process.cwd(), 'twin-browser-artifacts');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const results = [];
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(base + '/digital-twin-room.html', { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200, 'Twin command room must load');
    await page.locator('h1').getByText('Digital Twin Command Room').waitFor();
    assert.equal(await page.locator('#twinRefresh').count(), 1);
    assert.equal(await page.locator('#twinCapture').isDisabled(), true,
      'snapshot capture must remain disabled until authenticated API state is confirmed');
    const widths = [
      { name: 'small-mobile', width: 320, height: 740 },
      { name: 'mobile', width: 375, height: 812 },
      { name: 'large-mobile', width: 430, height: 932 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1366, height: 900 },
      { name: 'wide-desktop', width: 1920, height: 1080 }
    ];
    for (const viewport of widths) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForTimeout(80);
      const metrics = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        h1Visible: (() => {
          const r = document.querySelector('h1').getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth + 1;
        })()
      }));
      assert.ok(metrics.scrollWidth <= viewport.width + 1,
        viewport.name + ' viewport horizontal overflow: ' + JSON.stringify(metrics));
      assert.ok(metrics.bodyScrollWidth <= viewport.width + 1,
        viewport.name + ' body horizontal overflow: ' + JSON.stringify(metrics));
      assert.ok(metrics.h1Visible, viewport.name + ' heading must remain visible');
      await page.screenshot({ path: path.join(out, 'twin-' + viewport.name + '.png'), fullPage: true });
      results.push({ viewport: viewport.name, ...metrics, status: 'PASS' });
    }
    await page.setViewportSize({ width: 375, height: 812 });
    const toggle = page.locator('[data-dir-toggle]');
    assert.equal(await toggle.count(), 1, 'RTL direction control must exist');
    await toggle.click();
    assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
    assert.equal(await page.locator('html').getAttribute('lang'), 'ar');
    await page.screenshot({ path: path.join(out, 'twin-mobile-rtl.png'), fullPage: true });
    await toggle.click();
    assert.equal(await page.locator('html').getAttribute('dir'), 'ltr');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.deepEqual(errors, [], 'browser must not emit uncaught page errors');
    results.push({ rtlToggle: 'PASS', uncaughtPageErrors: errors.length, status: 'PASS' });
    fs.writeFileSync(path.join(out, 'twin-browser-report.json'), JSON.stringify({
      schemaVersion: 'opscore.twin-browser-acceptance.v1',
      generatedAt: new Date().toISOString(),
      browser: await browser.version(),
      base,
      results,
      pageErrors: errors,
      boundary: 'Static browser layout and direction acceptance only. No authenticated production data or device hardware is claimed.'
    }, null, 2) + '\n');
    process.stdout.write(JSON.stringify(results, null, 2) + '\n');
  } finally {
    await browser.close();
  }
})().catch(error => {
  process.stderr.write((error.stack || error.message) + '\n');
  process.exitCode = 1;
});
