'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { languages, summary } = require('../src/contact-center-languages');

const root = path.resolve(__dirname, '..');
const localesDir = path.join(root, 'web', 'i18n', 'locales');
const loaderPath = path.join(root, 'web', 'i18n', 'i18n-loader.js');
const htmlPath = path.join(root, 'web', 'contact-center.html');
const appPath = path.join(root, 'web', 'contact-center.js');
const errors = [];
const sourceCodeSet = new Set(languages.map(item => item.code));

function fail(message) { errors.push(message); }
function flatten(value, prefix = '', output = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected object at ${prefix || '<root>'}`);
  }
  for (const [key, item] of Object.entries(value)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (!key || key.includes('.') || key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new Error(`Unsafe/ambiguous key ${fullKey}`);
    }
    if (item && typeof item === 'object' && !Array.isArray(item)) flatten(item, fullKey, output);
    else output[fullKey] = item;
  }
  return output;
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`${path.relative(root, file)}: ${error.message}`); }
}
function placeholderTokens(value) {
  return typeof value === 'string' ? (value.match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g) || []).sort() : [];
}

try {
  if (!fs.existsSync(localesDir)) throw new Error('LOCALE_DIRECTORY_MISSING');
  if (!fs.existsSync(loaderPath)) throw new Error('LOCALE_LOADER_MISSING');
  const files = fs.readdirSync(localesDir).filter(name => name.endsWith('.json') && name !== 'manifest.json').sort();
  const codes = files.map(name => name.slice(0, -5));
  if (files.length !== 114) fail(`Expected 114 locale JSON files; found ${files.length}`);
  if (new Set(codes).size !== codes.length) fail('Duplicate locale filenames detected');
  for (const code of sourceCodeSet) if (!codes.includes(code)) fail(`Missing locale file for catalog code ${code}`);
  for (const code of codes) if (!sourceCodeSet.has(code)) fail(`Locale ${code} is not in the server language catalog`);
  if (summary().uniqueLanguageCodes !== sourceCodeSet.size || languages.length !== sourceCodeSet.size) {
    fail(`Server catalog not unique: ${languages.length} rows / ${sourceCodeSet.size} unique codes`);
  }

  const registerPath = path.join(root, 'docs', 'contact-center', 'I18N_COMPLETION_REGISTER.json');
  let completionRegister = null;
  try { completionRegister = JSON.parse(fs.readFileSync(registerPath, 'utf8')); }
  catch { fail('I18N_COMPLETION_REGISTER.json is missing or unreadable'); }

  const source = readJson(path.join(localesDir, 'en.json'));
  const sourceFlat = flatten(source);
  const sourceKeys = Object.keys(sourceFlat).sort();
  if (sourceFlat.nativeName !== 'English') fail('en.json nativeName must be English');
  const manifest = readJson(path.join(localesDir, 'manifest.json'));
  if (manifest.schemaVersion !== 'opscore.contact-center-i18n-manifest.v1') fail('Locale manifest schema version is invalid');
  if (manifest.localeCount !== 114 || !Array.isArray(manifest.locales) || manifest.locales.length !== 114) fail('Locale manifest must enumerate exactly 114 locales');
  const manifestCodes = manifest.locales.map(item => item && item.code);
  if (new Set(manifestCodes).size !== manifestCodes.length) fail('Locale manifest contains duplicate language codes');
  for (const code of codes) if (!manifestCodes.includes(code)) fail(`Locale manifest misses ${code}`);
  for (const entry of manifest.locales) {
    if (!entry || typeof entry.code !== 'string' || !sourceCodeSet.has(entry.code) || typeof entry.nativeName !== 'string' || !entry.nativeName.trim()) {
      fail('Locale manifest contains an invalid code/nativeName entry');
      continue;
    }
    const data = readJson(path.join(localesDir, `${entry.code}.json`));
    if (data.nativeName !== entry.nativeName) fail(`Manifest nativeName mismatch for ${entry.code}`);
  }

  let checkedFiles = 0;
  const englishMatches = {};
  for (const filename of files) {
    const code = filename.slice(0, -5);
    let flat;
    try { flat = flatten(readJson(path.join(localesDir, filename))); }
    catch (error) { fail(error.message); continue; }
    const currentKeys = Object.keys(flat).sort();
    if (currentKeys.join('\n') !== sourceKeys.join('\n')) {
      const missing = sourceKeys.filter(key => !Object.hasOwn(flat, key));
      const extra = currentKeys.filter(key => !Object.hasOwn(sourceFlat, key));
      fail(`${code}: key mismatch (missing: ${missing.slice(0, 6).join(', ') || 'none'}; extra: ${extra.slice(0, 6).join(', ') || 'none'})`);
      continue;
    }
    for (const key of sourceKeys) {
      const value = flat[key];
      if (typeof value !== 'string' || !value.trim()) {
        fail(`${code}.${key}: value must be a non-empty string`);
        continue;
      }
      if (placeholderTokens(value).join('|') !== placeholderTokens(sourceFlat[key]).join('|')) {
        fail(`${code}.${key}: placeholder token mismatch`);
      }
      if (code !== 'en' && value.trim().toLocaleLowerCase() === String(sourceFlat[key]).trim().toLocaleLowerCase()) {
        (englishMatches[code] ||= []).push(key);
      }
    }
    checkedFiles++;
  }

  if (completionRegister) {
    let fallbackLocales = 0, completedLocales = 0;
    for (const code of codes) {
      const declared = new Set((completionRegister.locales && completionRegister.locales[code] && completionRegister.locales[code].englishFallbackKeys) || []);
      const actual = (englishMatches[code] || []).slice().sort();
      const undeclared = actual.filter(key => !declared.has(key));
      const stale = [...declared].filter(key => !actual.includes(key));
      if (undeclared.length) fail(`${code}: undeclared English source value (${undeclared.slice(0, 6).join(', ')}) - translate it or declare it in the coverage register`);
      if (stale.length) fail(`${code}: coverage register lists stale fallback keys (${stale.slice(0, 6).join(', ')}) - regenerate the register`);
      if (declared.size) fallbackLocales++; else completedLocales++;
    }
    console.log(`PASS declared-coverage gate: ${completedLocales} locale(s) carry no English fallback, ${fallbackLocales} locale(s) declare their English fallback keys in the register`);
  }

  const loader = fs.readFileSync(loaderPath, 'utf8');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const app = fs.readFileSync(appPath, 'utf8');
  const supportedMatch = /const SUPPORTED = \[([^\]]+)\]/.exec(loader);
  if (!supportedMatch) fail('Locale loader supported-code table was not found');
  else {
    const loaderCodes = [...supportedMatch[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
    if (loaderCodes.length !== 114 || new Set(loaderCodes).size !== 114) fail('Loader must list exactly 114 unique locales');
    for (const code of sourceCodeSet) if (!loaderCodes.includes(code)) fail(`Loader does not support catalog code ${code}`);
    for (const code of loaderCodes) if (!sourceCodeSet.has(code)) fail(`Loader supports unknown locale ${code}`);
  }
  const loaderIndex = html.indexOf('/i18n/i18n-loader.js');
  const appIndex = html.indexOf('/contact-center.js');
  if (loaderIndex < 0 || appIndex < 0 || loaderIndex > appIndex) fail('i18n loader must be loaded before contact-center.js');
  if (!html.includes('id="interfaceLanguageSelect"')) fail('User-facing interface-language selector is missing');
  if (!html.includes('id="languageSelect"')) fail('Conversation-language selector is missing');
  if (!app.includes("window.addEventListener('opscore:localechange'")) fail('Application locale-change listener is missing');
  for (const match of html.matchAll(/data-i18n(?:-placeholder|-aria-label|-title)?="([^"]+)"/g)) {
    if (!Object.hasOwn(sourceFlat, match[1])) fail(`HTML references unknown translation key ${match[1]}`);
  }
  for (const match of app.matchAll(/(?:setTranslation\([^,]+,\s*|setStatusKey\()'([^']+)'/g)) {
    const key = match[1];
    if (key.includes('${')) continue;
    if (!Object.hasOwn(sourceFlat, key) && !key.startsWith('handoffReasons.') && !key.startsWith('roles.')) {
      fail(`Application references unknown translation key ${key}`);
    }
  }

  if (errors.length) {
    console.error(`FAIL i18n validation: ${errors.length} finding(s)`);
    for (const item of errors) console.error(`- ${item}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS locale count: ${files.length} locale files + manifest`);
    console.log(`PASS catalog alignment: ${sourceCodeSet.size} unique server codes = loader codes = locale files`);
    console.log(`PASS structural translation validation: ${checkedFiles} files × ${sourceKeys.length} keys; exact keys, non-empty values and placeholders`);
    console.log('PASS UI integration: loader order, independent interface/conversation selectors, referenced translation keys');
    console.log('NOTE: structural tests do not certify native-speaker quality, dialect, ASR, or TTS.');
  }
} catch (error) {
  console.error(`FAIL i18n validation: ${error.message}`);
  process.exitCode = 1;
}
