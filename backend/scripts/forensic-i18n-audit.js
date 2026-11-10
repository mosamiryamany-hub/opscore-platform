#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const localeDir = path.join(root, 'web', 'i18n', 'locales');
const loaderPath = path.join(root, 'web', 'i18n', 'i18n-loader.js');
const htmlPath = path.join(root, 'web', 'contact-center.html');
const appPath = path.join(root, 'web', 'contact-center.js');
const manifestPath = path.join(localeDir, 'manifest.json');
const registerPath = path.join(root, 'docs', 'contact-center', 'I18N_COMPLETION_REGISTER.json');
const reportPath = path.join(root, 'docs', 'verification', 'I18N_FORENSIC_AUDIT_RESULT.json');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const { languages } = require(path.join(root, 'src', 'contact-center-languages.js'));

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

function parseWithDuplicateKeyCheck(source, label) {
  const duplicates = [];
  let i = 0;
  const ws = () => { while (/\s/.test(source[i] || '') && i < source.length) i++; };
  function stringToken() {
    const start = i;
    assert(source[i] === '"', label + ':EXPECTED_JSON_STRING');
    i++;
    while (i < source.length) {
      if (source[i] === '\\') { i += 2; continue; }
      if (source[i] === '"') { i++; return JSON.parse(source.slice(start, i)); }
      i++;
    }
    throw new Error(label + ':UNTERMINATED_JSON_STRING');
  }
  function value(objectPath) {
    ws();
    const ch = source[i];
    if (ch === '"') { stringToken(); return; }
    if (ch === '{') {
      i++; ws();
      const seen = new Set();
      if (source[i] === '}') { i++; return; }
      while (i < source.length) {
        ws();
        const key = stringToken();
        if (seen.has(key)) duplicates.push(objectPath + '.' + key);
        seen.add(key);
        ws(); assert(source[i] === ':', label + ':EXPECTED_COLON'); i++;
        value(objectPath + '.' + key);
        ws();
        if (source[i] === '}') { i++; return; }
        assert(source[i] === ',', label + ':EXPECTED_OBJECT_SEPARATOR'); i++;
      }
      throw new Error(label + ':UNTERMINATED_JSON_OBJECT');
    }
    if (ch === '[') {
      i++; ws();
      if (source[i] === ']') { i++; return; }
      let n = 0;
      while (i < source.length) {
        value(objectPath + '[' + n + ']'); n++; ws();
        if (source[i] === ']') { i++; return; }
        assert(source[i] === ',', label + ':EXPECTED_ARRAY_SEPARATOR'); i++;
      }
      throw new Error(label + ':UNTERMINATED_JSON_ARRAY');
    }
    while (i < source.length && !/[\s,\]}]/.test(source[i])) i++;
    assert(i > 0, label + ':INVALID_JSON_TOKEN');
  }
  value('$'); ws();
  assert(i === source.length, label + ':TRAILING_JSON_DATA');
  return { value: JSON.parse(source), duplicates };
}

function flatten(value, prefix = '', out = {}) {
  for (const [key, item] of Object.entries(value)) {
    const full = prefix ? prefix + '.' + key : key;
    if (item && typeof item === 'object' && !Array.isArray(item)) flatten(item, full, out);
    else out[full] = item;
  }
  return out;
}
function placeholders(v) {
  return (String(v).match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g) || []).sort().join('|');
}
function setEqual(a, b) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

const rounds = [];
function round(id, title, fn) {
  try {
    const detail = fn();
    rounds.push({ id, title, status: 'PASS', detail });
    console.log('PASS I18N_FORENSIC_' + id + ' ' + title + ' ' + JSON.stringify(detail));
  } catch (error) {
    rounds.push({ id, title, status: 'FAIL', error: String(error.message || error) });
    console.error('FAIL I18N_FORENSIC_' + id + ' ' + title + ' ' + String(error.message || error));
  }
}

let localeFiles = [];
let parsedLocales = {};
let baseFlat = {};
let manifest = {};
let register = {};
let loader = '';
let html = '';
let app = '';
let supportedCodes = [];
let registryCodes = [];
let localeCodes = [];

round('01_INVENTORY_AND_JSON_INTEGRITY', '114 locale files parse without duplicate keys', () => {
  localeFiles = fs.readdirSync(localeDir).filter(x => x.endsWith('.json') && x !== 'manifest.json').sort();
  localeCodes = localeFiles.map(x => x.slice(0, -5)).sort();
  assert(localeFiles.length === 114, 'LOCALE_FILE_COUNT=' + localeFiles.length);
  assert(new Set(localeCodes).size === localeCodes.length, 'DUPLICATE_LOCALE_FILENAME');
  const duplicateKeys = [];
  for (const file of localeFiles) {
    const raw = fs.readFileSync(path.join(localeDir, file), 'utf8');
    const parsed = parseWithDuplicateKeyCheck(raw, file);
    if (parsed.duplicates.length) duplicateKeys.push({ file, keys: parsed.duplicates });
    parsedLocales[file.slice(0, -5)] = parsed.value;
  }
  assert(!duplicateKeys.length, 'DUPLICATE_JSON_KEYS=' + JSON.stringify(duplicateKeys.slice(0, 10)));
  assert(parsedLocales.en, 'ENGLISH_BASE_LOCALE_MISSING');
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  register = JSON.parse(fs.readFileSync(registerPath, 'utf8'));
  return { localeFiles: localeFiles.length, validJson: localeFiles.length, duplicateKeyCount: 0, manifestLocaleCount: manifest.localeCount };
});

round('02_KEY_AND_PLACEHOLDER_PARITY', 'All locale keys, values, and placeholders are structurally complete', () => {
  baseFlat = flatten(parsedLocales.en);
  assert(Object.keys(baseFlat).length === 89, 'ENGLISH_KEY_COUNT=' + Object.keys(baseFlat).length);
  const mismatches = [];
  let emptyCount = 0;
  let placeholderMismatches = 0;
  for (const [code, data] of Object.entries(parsedLocales)) {
    const flat = flatten(data);
    const got = Object.keys(flat).sort();
    const expected = Object.keys(baseFlat).sort();
    if (!setEqual(got, expected)) mismatches.push({ code, missing: expected.filter(k => !got.includes(k)), extra: got.filter(k => !expected.includes(k)) });
    for (const key of expected) {
      if (typeof flat[key] !== 'string' || !flat[key].trim()) emptyCount++;
      if (placeholders(flat[key]) !== placeholders(baseFlat[key])) placeholderMismatches++;
    }
  }
  assert(!mismatches.length, 'KEY_SET_MISMATCHES=' + JSON.stringify(mismatches.slice(0, 5)));
  assert(emptyCount === 0, 'EMPTY_OR_NON_STRING_VALUES=' + emptyCount);
  assert(placeholderMismatches === 0, 'PLACEHOLDER_MISMATCHES=' + placeholderMismatches);
  return { keysPerLocale: Object.keys(baseFlat).length, localesChecked: Object.keys(parsedLocales).length, keySetMismatches: 0, emptyOrNonStringValues: 0, placeholderMismatches: 0 };
});

round('03_REGISTRY_AND_PROVENANCE_ALIGNMENT', 'Server catalogue, loader, manifest and review register agree', () => {
  loader = fs.readFileSync(loaderPath, 'utf8');
  html = fs.readFileSync(htmlPath, 'utf8');
  app = fs.readFileSync(appPath, 'utf8');
  const supportMatch = loader.match(/const SUPPORTED = \[([^\]]+)\]/);
  assert(supportMatch, 'LOADER_SUPPORTED_TABLE_MISSING');
  supportedCodes = [...supportMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1]).sort();
  registryCodes = languages.map(x => x.code).sort();
  const manifestCodes = (manifest.locales || []).map(x => x.code).sort();
  assert(setEqual(localeCodes, supportedCodes), 'LOCALE_FILES_VS_LOADER_MISMATCH');
  assert(setEqual(localeCodes, registryCodes), 'LOCALE_FILES_VS_SERVER_CATALOGUE_MISMATCH');
  assert(setEqual(localeCodes, manifestCodes), 'LOCALE_FILES_VS_MANIFEST_MISMATCH');
  const counts = Object.entries(register.locales || {}).reduce((acc, [code, locale]) => {
    acc[locale.status] = (acc[locale.status] || 0) + 1;
    if (!localeCodes.includes(code)) acc.unknownCodes = (acc.unknownCodes || 0) + 1;
    return acc;
  }, {});
  assert(Object.keys(register.locales || {}).length === 114, 'REGISTER_LOCALE_COUNT_MISMATCH');
  assert(counts.source === 1 && counts.draft_translation_pending_native_review === 109 && counts.english_fallback_pending === 4, 'PROVENANCE_COUNTS_MISMATCH=' + JSON.stringify(counts));
  assert(manifest.keyCount === 89, 'MANIFEST_KEY_COUNT=' + manifest.keyCount);
  const expectedMachine=109;
  return { catalogueCodes: registryCodes.length, manifestCodes: manifestCodes.length, sourceLocales: counts.source, machineDrafts: counts.draft_translation_pending_native_review, englishFallbacks: counts.english_fallback_pending, nativeSpeakerReviewedLocales: 0, productionQualifiedLocales: 0 };
});

round('04_RUNTIME_NOTICE_AND_SAFE_INTEGRATION', 'Machine-translation notice is wired into the contact-center runtime safely', () => {
  assert(html.includes('data-i18n-machine-notice'), 'VISIBLE_MACHINE_TRANSLATION_NOTICE_MISSING');
  assert(html.indexOf('/i18n/i18n-loader.js') >= 0 && html.indexOf('/i18n/i18n-loader.js') < html.indexOf('/contact-center.js'), 'I18N_LOADER_SCRIPT_ORDER_INVALID');
  assert(loader.includes('const MACHINE_NOTICE =') && loader.includes('machineNotice(locale)'), 'MACHINE_NOTICE_MAP_OR_APPLY_FUNCTION_MISSING');
  assert(loader.includes('element.textContent = machineNotice(locale)'), 'MACHINE_NOTICE_NOT_RENDERED_AS_TEXT');
  assert(!/\binnerHTML\s*=/.test(loader), 'UNSAFE_INNERHTML_ASSIGNMENT_IN_LOADER');
  assert(fs.existsSync(path.join(root, 'test', 'contact_center_i18n.test.js')), 'I18N_RUNTIME_TEST_MISSING');
  assert(fs.existsSync(path.join(root, 'test', 'contact_center_i18n_completion.test.js')), 'I18N_COMPLETION_TEST_MISSING');
  return { localizedNoticeSelector: true, scriptOrder: 'loader-before-contact-center', textContentRendering: true, unsafeInnerHtmlAssignment: false, testFilesPresent: 2 };
});

const report = {
  schemaVersion: 'opscore.i18n-forensic-audit.v1',
  generatedAt: new Date().toISOString(),
  release: pkg.version,
  auditScope: 'locale file integrity, structural completeness, registry alignment, and runtime-safe notice wiring',
  explicitNonClaims: ['No native-speaker linguistic approval is asserted.', 'No ASR/TTS or live provider quality is asserted.', 'This report is not a production certification.'],
  totalRounds: 4,
  passedRounds: rounds.filter(x => x.status === 'PASS').length,
  failedRounds: rounds.filter(x => x.status === 'FAIL').length,
  status: rounds.length === 4 && rounds.every(x => x.status === 'PASS') ? 'PASS' : 'FAIL',
  localeFiles: 114,
  productionQualifiedLocales: 0,
  rounds
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log('I18N_FORENSIC_AUDIT_STATUS=' + report.status + ' ROUNDS=' + report.passedRounds + '/4 REPORT=' + path.relative(root, reportPath));
process.exitCode = report.status === 'PASS' ? 0 : 1;
