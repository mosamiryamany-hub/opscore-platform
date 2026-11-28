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
  let staticContactPage = false;
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push({ message: error.message, stack: error.stack, name: error.name, fileName: error.fileName, lineNumber: error.lineNumber, columnNumber: error.columnNumber }));
    page.on('console', entry => {
      if (entry.type() === 'error') {
        const location = entry.location();
        const expectedStaticApiMiss = /404/.test(entry.text()) && (
          location.url === base + '/api/v1/me' || (staticContactPage && [
            base + '/api/v1/contact-center/status',
            base + '/api/v1/contact-center/handoffs?status=open&limit=50',
            base + '/api/v1/me'
          ].includes(location.url))
        );
        if (!expectedStaticApiMiss) errors.push({ console: entry.text(), location });
      }
    });
    const roomsResponse = await page.goto(base + '/control-rooms.html', { waitUntil: 'networkidle' });
    assert.equal(roomsResponse.status(), 200, 'Control Rooms navigation must load');
    assert.equal(await page.locator('.room').count(), 10, 'ten room cards must be present');
    assert.equal(await page.locator('[data-room="contact"]').count(), 1);
    assert.equal(await page.locator('[data-room="twin"]').count(), 1);
    assert.equal(await page.locator('a[href="/dispatcher-map.html"]').count(), 1);
    const twinNavigation = page.waitForURL(url => url.pathname === '/digital-twin-room.html');
    await page.locator('[data-room="twin"]').click();
    await twinNavigation;
    assert.equal(await page.locator('#twinRefresh').count(), 1, 'Digital Twin route must resolve from Control Rooms');

    await page.goto(base + '/control-rooms.html', { waitUntil: 'networkidle' });
    const contactStatusProbe = page.waitForResponse(response => response.url() === base + '/api/v1/contact-center/status');
    const contactQueueProbe = page.waitForResponse(response => response.url() === base + '/api/v1/contact-center/handoffs?status=open&limit=50');
    const contactMeProbe = page.waitForResponse(response => response.url() === base + '/api/v1/me');
    const contactNavigation = page.waitForURL(url => url.pathname === '/contact-center-room.html');
    staticContactPage = true;
    await page.locator('[data-room="contact"]').click();
    await contactNavigation;
    const staticApiResponses = await Promise.all([contactStatusProbe, contactQueueProbe, contactMeProbe]);
    assert.deepEqual(staticApiResponses.map(response => response.status()), [404, 404, 404],
      'static-only harness must expose unavailable Contact Center APIs as 404, never synthetic success');
    assert.equal(await page.locator('#ccrQueueState').innerText(), 'QUEUE UNAVAILABLE');
    assert.equal(await page.locator('.ccr-shell').count(), 1, 'Contact Center route must resolve from Control Rooms');
    assert.equal(await page.locator('#ccrCrmProfile').count(), 1, 'CRM profile surface must exist');
    assert.equal(await page.locator('#ccrSupervisorActivity').count(), 1, 'Supervisor activity surface must exist');
    for (const viewport of [
      { name: 'small-mobile', width: 320, height: 740 },
      { name: 'mobile', width: 375, height: 812 },
      { name: 'large-mobile', width: 430, height: 932 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1366, height: 900 },
      { name: 'wide-desktop', width: 1920, height: 1080 }
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const metrics = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth
      }));
      assert.ok(metrics.scrollWidth <= viewport.width + 1, 'Contact Center document overflow at ' + viewport.name + ': ' + JSON.stringify(metrics));
      assert.ok(metrics.bodyScrollWidth <= viewport.width + 1, 'Contact Center body overflow at ' + viewport.name + ': ' + JSON.stringify(metrics));
      await page.screenshot({ path: path.join(out, 'contact-center-' + viewport.name + '.png'), fullPage: true });
      results.push({ viewport: 'contact-center-' + viewport.name, ...metrics, status: 'PASS' });
    }
    await page.setViewportSize({ width: 375, height: 812 });
    const contactDirection = page.locator('[data-dir-toggle]');
    await contactDirection.click();
    assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
    assert.equal(await page.locator('html').getAttribute('lang'), 'ar');
    await page.screenshot({ path: path.join(out, 'contact-center-mobile-rtl.png'), fullPage: true });
    await contactDirection.click();
    assert.equal(await page.locator('html').getAttribute('dir'), 'ltr');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    results.push({ contactCenterRtlToggle: 'PASS', status: 'PASS' });

    const apiProbe = page.waitForResponse(response => response.url().endsWith('/api/v1/me'));
    const response = await page.goto(base + '/digital-twin-room.html', { waitUntil: 'networkidle' });
    const apiProbeResponse = await apiProbe;
    assert.equal(apiProbeResponse.status(), 404, 'static-only harness must not pretend an authenticated API exists');
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

    const mapAuthProbe = page.waitForResponse(response => response.url().endsWith('/api/v1/me'));
    const mapResponse = await page.goto(base + '/dispatcher-map.html', { waitUntil: 'networkidle' });
    const mapAuthResponse = await mapAuthProbe;
    assert.equal(mapResponse.status(), 200, 'Dispatcher Map page must load');
    assert.equal(mapAuthResponse.status(), 404, 'static-only harness must not pretend an authenticated map API exists');
    await page.locator('h1').getByText('Dispatcher map').waitFor();
    assert.equal(await page.locator('#dispatcherMap').count(), 1);
    assert.equal(await page.locator('#pointList').count(), 1);
    assert.equal(await page.locator('#pointCount').textContent(), '0');
    for (const viewport of widths) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForTimeout(80);
      const metrics = await page.evaluate(() => {
        const map = document.querySelector('#dispatcherMap').getBoundingClientRect();
        return {
          width: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth,
          mapWidth: Math.round(map.width),
          mapHeight: Math.round(map.height),
          mapVisible: map.width > 0 && map.height >= 260 && map.left >= 0 && map.right <= innerWidth + 1
        };
      });
      assert.ok(metrics.scrollWidth <= viewport.width + 1, viewport.name + ' Dispatcher Map overflow: ' + JSON.stringify(metrics));
      assert.ok(metrics.bodyScrollWidth <= viewport.width + 1, viewport.name + ' Dispatcher Map body overflow: ' + JSON.stringify(metrics));
      assert.ok(metrics.mapVisible, viewport.name + ' Dispatcher Map frame must remain visible: ' + JSON.stringify(metrics));
      await page.screenshot({ path: path.join(out, 'dispatcher-map-' + viewport.name + '.png'), fullPage: true });
      results.push({ viewport: 'dispatcher-' + viewport.name, ...metrics, status: 'PASS' });
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await page.locator('[data-dir-toggle]').click();
    assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
    assert.equal(await page.locator('html').getAttribute('lang'), 'ar');
    await page.screenshot({ path: path.join(out, 'dispatcher-map-mobile-rtl.png'), fullPage: true });
    await page.locator('[data-dir-toggle]').click();
    assert.equal(await page.locator('html').getAttribute('dir'), 'ltr');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.deepEqual(errors, [], 'Twin and Dispatcher Map pages must not emit uncaught page errors');
    results.push({ dispatcherMapRtlToggle: 'PASS', uncaughtPageErrors: errors.length, status: 'PASS' });
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
  } catch (error) {
    fs.writeFileSync(path.join(out, 'twin-browser-report.json'), JSON.stringify({
      schemaVersion: 'opscore.twin-browser-acceptance.v1',
      generatedAt: new Date().toISOString(),
      browser: await browser.version(),
      base,
      results,
      pageErrors: errors,
      failure: { name: error.name, message: error.message, stack: error.stack },
      boundary: 'Static browser layout and direction acceptance only. No authenticated production data or device hardware is claimed.'
    }, null, 2) + '\n');
    throw error;
  } finally {
    await browser.close();
  }
})().catch(error => {
  process.stderr.write((error.stack || error.message) + '\n');
  process.exitCode = 1;
});
