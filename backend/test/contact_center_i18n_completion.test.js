'use strict';
// Completion gate for the 114-locale pack: fails if UI copy is hardcoded again,
// if a locale drifts from the source key set, or if the coverage register lies.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');

const backendRoot = path.resolve(__dirname, '..');
const webRoot = path.join(backendRoot, 'web');
const localeRoot = path.join(webRoot, 'i18n', 'locales');
const registerPath = path.join(backendRoot, 'docs', 'contact-center', 'I18N_COMPLETION_REGISTER.json');

function flatten(value, prefix = '', out = {}) {
  for (const [key, item] of Object.entries(value)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (item && typeof item === 'object' && !Array.isArray(item)) flatten(item, full, out);
    else out[full] = item;
  }
  return out;
}
const localeFiles = fs.readdirSync(localeRoot).filter(name => name.endsWith('.json') && name !== 'manifest.json').sort();
const read = name => JSON.parse(fs.readFileSync(path.join(localeRoot, name), 'utf8'));
const source = flatten(read('en.json'));
const sourceKeys = Object.keys(source).sort();

test('all 114 locales carry the full source key set with non-empty values and no raw English leakage in Arabic', () => {
  assert.equal(localeFiles.length, 114);
  assert.equal(sourceKeys.length, 89, 'source key count must be 89 after the completion pass');
  for (const file of localeFiles) {
    const flat = flatten(read(file));
    assert.deepEqual(Object.keys(flat).sort(), sourceKeys, `${file}: key set differs from en.json`);
    for (const key of sourceKeys) {
      assert.equal(typeof flat[key], 'string', `${file}.${key}: not a string`);
      assert.ok(flat[key].trim().length > 0, `${file}.${key}: empty value`);
    }
  }
  const ar = flatten(read('ar.json'));
  for (const key of ['nav.interfaceLanguage', 'customer.voiceRequirement', 'messages.voiceActive', 'queue.replyStorageNote', 'errors.HANDOFF_NOT_CLAIMED']) {
    assert.match(ar[key], /[\u0600-\u06FF]/, `ar.json ${key} must be Arabic text, not an English fallback`);
  }
  const en = read('en.json');
  assert.equal(en.errors.CONTACT_CENTER_CONSENT_REQUIRED, 'Consent is required before a conversation can start.');
});

test('no user-visible English copy remains hardcoded in contact-center.html', () => {
  const html = fs.readFileSync(path.join(webRoot, 'contact-center.html'), 'utf8');
  const brandAllowList = ['OPSCORE FIELD', 'OpsCore FIELD ·'];
  const findings = [];
  for (const match of html.matchAll(/>([^<>]*[A-Za-z]{3}[^<>]*)</g)) {
    const text = match[1].trim();
    if (!text || brandAllowList.includes(text) || !/[A-Za-z]/.test(text)) continue;
    const openTagStart = html.lastIndexOf('<', match.index);
    const openTag = html.slice(openTagStart, match.index + 1);
    // <option> content is replaced at runtime by the locale loader from manifest.json.
    if (/<option\b/.test(openTag)) continue;
    if (!/data-i18n(-placeholder|-aria-label|-title|-dynamic-key|-machine-notice)?=/.test(openTag)) findings.push(`${text.slice(0, 60)}`);
  }
  assert.deepEqual(findings, [], `unkeyed English copy in contact-center.html: ${findings.join(' | ')}`);
});

test('no English sentence literals are written straight into the UI by contact-center.js', () => {
  const app = fs.readFileSync(path.join(webRoot, 'contact-center.js'), 'utf8');
  const offenders = [];
  for (const match of app.matchAll(/set(?:StatusLiteral|Literal)\([^)'"`]*?(['"`])((?:[^'"`\\]|\\.){25,})\1/g)) {
    if (/\$\{/.test(match[2])) continue;
    offenders.push(match[2].slice(0, 60));
  }
  for (const match of app.matchAll(/\.textContent\s*=\s*(['"`])((?:[^'"`\\]|\\.){25,})\1/g)) {
    offenders.push(match[2].slice(0, 60));
  }
  assert.deepEqual(offenders, [], `hardcoded UI copy in contact-center.js: ${offenders.join(' | ')}`);
  assert.match(app, /setTranslation\(\$\('languageWarning'\), 'messages\.apiUnavailable'/);
  assert.match(app, /tx\(`errors\.\$\{String\(code\)\.trim\(\)\}`/);
  assert.match(app, /tx\('queue\.resolveNote'/);
});

test('per-locale coverage register matches the real English-fallback key set on disk', () => {
  const register = JSON.parse(fs.readFileSync(registerPath, 'utf8'));
  assert.equal(register.schemaVersion, 'opscore.i18n-completion-register.v2');
  assert.equal(register.keyCount, 89);
  assert.equal(Object.keys(register.locales).length, 114);
  assert.equal(register.locales.en.status, 'source');
  assert.equal(register.locales.ar.status, 'draft_translation_pending_native_review');
  assert.equal(register.locales.ff.status, 'draft_translation_pending_native_review');
  assert.equal(register.locales.din.status, 'english_fallback_pending');
  assert.deepEqual(register.locales.ar.englishFallbackKeys, []);
  for (const file of localeFiles) {
    const code = file.slice(0, -5);
    const flat = flatten(read(file));
    // `en` is the source: every key trivially equals itself, so it is asserted as the source locale instead.
    if (code === 'en') {
      assert.equal(register.locales.en.status, 'source');
      assert.deepEqual(register.locales.en.englishFallbackKeys, []);
      continue;
    }
    const actual = sourceKeys.filter(key => key !== 'nativeName' && flat[key] === source[key]);
    assert.deepEqual(register.locales[code].englishFallbackKeys, actual, `${code}: register fallback list is stale`);
    assert.equal(register.locales[code].englishFallbackCount, actual.length);
  }
  assert.deepEqual(register.summary.rtlLocales, ['ar', 'dv', 'fa', 'ks', 'ps', 'ur'].sort());
  const expectedFallback = Object.values(register.locales).filter(item => item.status === 'english_fallback_pending').length;
  assert.equal(register.summary.englishFallbackLocales, expectedFallback);
  assert.equal(register.summary.draftTranslationLocales + expectedFallback + 1, 114);
  assert.equal(register.summary.catalogue, 114);
  assert.ok(register.summary.draftTranslationLocaleCodes.length === register.summary.draftTranslationLocales);
});

test('loader canonicalises requested locale case and still resolves RTL direction', async () => {
  const loaderSource = fs.readFileSync(path.join(webRoot, 'i18n', 'i18n-loader.js'), 'utf8');
  const element = () => ({
    textContent: '', value: '', children: [], listeners: {}, dataset: {},
    getAttribute() { return null; }, setAttribute() {}, removeAttribute() {},
    addEventListener() {}, appendChild(c) { this.children.push(c); return c; }, replaceChildren() {}
  });
  const html = { lang: 'en', dir: 'ltr' };
  const document = {
    currentScript: { src: 'https://unit.test/i18n/i18n-loader.js' },
    documentElement: html,
    querySelectorAll() { return []; },
    getElementById() { return null; },
    createElement: element,
    createDocumentFragment() { return { children: [], appendChild(c) { this.children.push(c); return c; } }; }
  };
  const fetch = async url => {
    const match = /\/i18n\/locales\/([^/]+\.json)$/.exec(new URL(url).pathname);
    const file = match && path.join(localeRoot, match[1]);
    if (!file || !fs.existsSync(file)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) };
  };
  const context = {
    window: { dispatchEvent: () => true }, document, URL, fetch, console,
    navigator: { languages: ['en-US'], language: 'en-US' },
    localStorage: { getItem: () => null, setItem: () => {} },
    location: { href: 'https://unit.test/contact-center.html' },
    CustomEvent: class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } }
  };
  vm.runInNewContext(loaderSource, context, { filename: 'i18n-loader.js' });
  await context.window.OpsCoreI18n.ready;
  assert.equal(await context.window.OpsCoreI18n.setLocale('AR'), 'ar');
  assert.equal(context.window.OpsCoreI18n.locale, 'ar');
  assert.equal(html.dir, 'rtl');
  assert.equal(html.lang, 'ar');
  assert.equal(await context.window.OpsCoreI18n.setLocale('zz-not-a-locale'), 'ar');
});

test('package i18n validator passes on the completed pack', () => {
  const result = cp.spawnSync(process.execPath, ['scripts/validate-i18n.js'], { cwd: backendRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /PASS locale count: 114/);
});
