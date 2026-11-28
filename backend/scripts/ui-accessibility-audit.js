'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseURL = process.env.OPSC_UI_BASE_URL || 'http://127.0.0.1:4173';
const pages = [
  'index.html', 'portal.html', 'control-plane.html', 'control-rooms.html',
  'contact-center.html', 'contact-center-room.html', 'pricing.html', 'legal.html',
  'privacy.html', 'refund.html', 'security.html', 'terms.html',
  'verify/database.html', 'verify/deployment.html', 'verify/release.html'
];
const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 }
];
const screenshotPages = new Set(['index.html', 'control-rooms.html', 'contact-center.html', 'contact-center-room.html']);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const report = { schemaVersion: 'opscore.ui-accessibility-audit.v1', baseURL, pages: [], axe: [], failures: [] };
  const outputDir = path.resolve(process.env.OPSC_UI_ARTIFACT_DIR || 'ui-browser-artifacts');
  fs.mkdirSync(outputDir, { recursive: true });
  try {
    for (const file of pages) {
      const page = await browser.newPage({ viewport: viewports[0] });
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(String(error)));
      const response = await page.goto(new URL(file, baseURL + '/').toString(), { waitUntil: 'networkidle', timeout: 30000 });
      if (!response || !response.ok()) report.failures.push({ file, kind: 'http', status: response && response.status() });
      for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const layout = await page.evaluate(() => ({
          viewportWidth: document.documentElement.clientWidth,
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth
        }));
        const overflow = Math.max(layout.documentWidth, layout.bodyWidth) > layout.viewportWidth + 1;
        if (overflow) report.failures.push({ file, kind: 'horizontal-overflow', viewport: viewport.name, layout });
        if (screenshotPages.has(file)) await page.screenshot({ path: path.join(outputDir, file.replaceAll('/', '_') + '-' + viewport.name + '.png'), fullPage: true });
        report.pages.push({ file, viewport: viewport.name, ...layout, overflow });
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      if (file === 'contact-center.html') {
        await page.evaluate(async () => {
          if (window.OpsCoreI18n && typeof window.OpsCoreI18n.setLocale === 'function') await window.OpsCoreI18n.setLocale('ar');
          else document.documentElement.dir = 'rtl';
        });
        const rtl = await page.evaluate(() => ({
          lang: document.documentElement.lang, dir: document.documentElement.dir,
          viewportWidth: document.documentElement.clientWidth, documentWidth: document.documentElement.scrollWidth
        }));
        report.pages.push({ file, viewport: 'rtl-desktop', ...rtl, overflow: rtl.documentWidth > rtl.viewportWidth + 1 });
        if (rtl.dir !== 'rtl' || rtl.documentWidth > rtl.viewportWidth + 1) report.failures.push({ file, kind: 'rtl-layout', rtl });
      }
      await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
      const axe = await page.evaluate(async () => {
        const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
        return {
          violations: result.violations.map(v => ({
            id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length,
            examples: v.nodes.slice(0, 3).map(n => ({ target: n.target, summary: n.failureSummary }))
          })),
          passes: result.passes.length, incomplete: result.incomplete.length
        };
      });
      report.axe.push({ file, ...axe });
      for (const violation of axe.violations.filter(v => ['critical', 'serious'].includes(v.impact))) report.failures.push({ file, kind: 'axe-' + violation.impact, violation: violation.id, nodes: violation.nodes });
      if (pageErrors.length) report.failures.push({ file, kind: 'page-errors', errors: pageErrors });
      await page.close();
    }
  } finally { await browser.close(); }
  const out = path.join(outputDir, 'report.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    schemaVersion: report.schemaVersion, pages: pages.length, viewportChecks: report.pages.length,
    axeScans: report.axe.length, axeViolations: report.axe.reduce((sum, item) => sum + item.violations.length, 0),
    failures: report.failures.length, report: out
  }, null, 2));
  if (report.failures.length) { console.error(JSON.stringify(report.failures, null, 2)); process.exitCode = 1; }
})().catch(error => { console.error(error); process.exitCode = 1; });
