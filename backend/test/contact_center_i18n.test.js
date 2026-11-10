'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');

const backendRoot = path.resolve(__dirname, '..');
const webRoot = path.join(backendRoot, 'web');
const loaderSource = fs.readFileSync(path.join(webRoot, 'i18n', 'i18n-loader.js'), 'utf8');
const localeRoot = path.join(webRoot, 'i18n', 'locales');

function makeElement(initialAttributes = {}) {
  const attributes = new Map(Object.entries(initialAttributes));
  const element = {
    textContent: '', value: '', children: [], listeners: Object.create(null), dataset: null,
    getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null; },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
    appendChild(child) { if (child && Array.isArray(child.children)) this.children.push(...child.children); else this.children.push(child); return child; },
    replaceChildren(...children) { this.children = []; for (const child of children) { if (child && Array.isArray(child.children)) this.children.push(...child.children); else this.children.push(child); } },
    addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); },
    dispatch(name) { for (const callback of this.listeners[name] || []) callback({ target: this }); }
  };
  const camelToKebab = value => value.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
  element.dataset = new Proxy({}, {
    get(_target, property) { return attributes.get(`data-${camelToKebab(String(property))}`); },
    set(_target, property, value) { attributes.set(`data-${camelToKebab(String(property))}`, String(value)); return true; },
    deleteProperty(_target, property) { attributes.delete(`data-${camelToKebab(String(property))}`); return true; }
  });
  return element;
}

function makeHarness({languages=['ar-EG','en-US'], unavailableLocales=[], storedLocale=null}={}) {
  const html = { lang:'en', dir:'ltr' };
  const staticNode = makeElement({'data-i18n':'nav.title'});
  staticNode.textContent='AI Contact Center';
  const dynamicNode = makeElement({'data-i18n-dynamic-key':'messages.configNeeded','data-i18n-params':'{"missing":"MISSING_KEY"}','data-i18n-fallback':'Fallback: {missing}'});
  const placeholderNode = makeElement({'data-i18n-placeholder':'customer.messagePlaceholder'});
  placeholderNode.setAttribute('placeholder','Write a message…');
  const ariaNode = makeElement({'data-i18n-aria-label':'customer.preferredLanguage'});
  ariaNode.setAttribute('aria-label','Preferred language');
  const picker = makeElement();
  const allNodes = [staticNode,dynamicNode,placeholderNode,ariaNode];
  const document = {
    currentScript:{src:'https://unit.test/i18n/i18n-loader.js'},
    documentElement:html,
    readyState:'complete',
    querySelectorAll(selector) {
      if (selector === '[data-i18n]') return allNodes.filter(node => node.getAttribute('data-i18n'));
      if (selector === '[data-i18n-dynamic-key]') return allNodes.filter(node => node.getAttribute('data-i18n-dynamic-key'));
      if (selector === '[data-i18n-placeholder]') return allNodes.filter(node => node.getAttribute('data-i18n-placeholder'));
      if (selector === '[data-i18n-aria-label]') return allNodes.filter(node => node.getAttribute('data-i18n-aria-label'));
      if (selector === '[data-i18n-title]') return allNodes.filter(node => node.getAttribute('data-i18n-title'));
      return [];
    },
    getElementById(id) { return id === 'interfaceLanguageSelect' ? picker : null; },
    createDocumentFragment() { return {children:[],appendChild(child) {this.children.push(child); return child;}}; },
    createElement() { return makeElement(); }
  };
  const storage = new Map();
  if (storedLocale !== null) storage.set('opscore.locale', storedLocale);
  const localStorage = { getItem:key=>storage.has(key)?storage.get(key):null, setItem:(key,value)=>storage.set(key,String(value)) };
  const dispatched = [];
  const window = {dispatchEvent:event=>{dispatched.push(event);return true;}};
  const fetch = async url => {
    const parsed = new URL(url);
    const match = /\/i18n\/locales\/([^/]+\.json)$/.exec(parsed.pathname);
    if (!match) return {ok:false,status:404,json:async()=>({})};
    const filename = match[1];
    if (unavailableLocales.includes(filename.slice(0,-5))) return {ok:false,status:503,json:async()=>({})};
    const file = path.join(localeRoot, filename);
    if (!fs.existsSync(file)) return {ok:false,status:404,json:async()=>({})};
    const value = JSON.parse(fs.readFileSync(file,'utf8'));
    return {ok:true,status:200,json:async()=>value};
  };
  const context = {window,document,navigator:{languages,language:languages[0]||'en'},localStorage,location:{href:'https://unit.test/contact-center.html'},URL,fetch,CustomEvent:class CustomEvent {constructor(type,options={}){this.type=type;this.detail=options.detail;}},console};
  vm.runInNewContext(loaderSource, context, {filename:'i18n-loader.js'});
  return {window,document,html,staticNode,dynamicNode,placeholderNode,ariaNode,picker,storage,dispatched};
}

test('locale package validator passes exact catalog, key, placeholder and UI wiring checks', () => {
  const result = cp.spawnSync(process.execPath,['scripts/validate-i18n.js'],{cwd:backendRoot,encoding:'utf8'});
  assert.equal(result.status,0,`${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout,/PASS catalog alignment/);
});

test('browser locale detection, RTL, translations, placeholder substitution and native-name picker work', async () => {
  const harness = makeHarness({languages:['ar-EG','en-US']});
  await harness.window.OpsCoreI18n.ready;
  assert.equal(harness.window.OpsCoreI18n.locale,'ar');
  assert.equal(harness.html.lang,'ar');
  assert.equal(harness.html.dir,'rtl');
  assert.equal(harness.staticNode.textContent,'مركز الاتصال بالذكاء الاصطناعي');
  assert.match(harness.dynamicNode.textContent,/MISSING_KEY/);
  assert.equal(harness.placeholderNode.getAttribute('placeholder'),'اكتب رسالة…');
  assert.equal(harness.picker.children.length,114);
  assert.equal(harness.picker.value,'ar');
  assert.ok(harness.picker.children.some(option=>option.value==='ar' && option.textContent.includes('العربية')));
});

test('manual locale selection persists and updates static UI, direction and a11y label', async () => {
  const harness = makeHarness({languages:['en-US']});
  await harness.window.OpsCoreI18n.ready;
  const active = await harness.window.OpsCoreI18n.setLocale('fr');
  assert.equal(active,'fr');
  assert.equal(harness.window.OpsCoreI18n.locale,'fr');
  assert.equal(harness.html.lang,'fr');
  assert.equal(harness.html.dir,'ltr');
  assert.equal(harness.staticNode.textContent,'Centre de contact IA');
  assert.equal(harness.ariaNode.getAttribute('aria-label'),'Langue préférée');
  assert.equal(harness.picker.value,'fr');
  assert.equal(harness.storage.get('opscore.locale'),'fr');
  assert.equal(harness.dispatched.at(-1).type,'opscore:localechange');
  assert.match(harness.dynamicNode.textContent,/Configuration still needed|Configuration/);
});

test('unsupported locale cannot become a resource path and unavailable locale fails back to English', async () => {
  const harness = makeHarness({languages:['en'],unavailableLocales:['fa']});
  await harness.window.OpsCoreI18n.ready;
  assert.equal(await harness.window.OpsCoreI18n.setLocale('../../etc/passwd'),'en');
  assert.equal(await harness.window.OpsCoreI18n.setLocale('fa'),'en');
  assert.equal(harness.html.lang,'en');
  assert.equal(harness.html.dir,'ltr');
  assert.equal(harness.storage.get('opscore.locale'),'en');
  assert.equal(harness.staticNode.textContent,'AI Contact Center');
});

test('malformed translation lookup uses literal fallback and parameter values stay text-only', async () => {
  const harness = makeHarness({languages:['en']});
  await harness.window.OpsCoreI18n.ready;
  assert.equal(harness.window.OpsCoreI18n.t('__proto__.polluted',{},'safe fallback'),'safe fallback');
  const value = harness.window.OpsCoreI18n.t('messages.actionNotCompleted',{reason:'<img src=x onerror=alert(1)>'});
  assert.equal(value,'Action not completed: <img src=x onerror=alert(1)>.');
  assert.equal(harness.dynamicNode.textContent.includes('<img'),false);
});


test('invalid persisted locale falls through to browser locale instead of forcing English', async () => {
  const harness = makeHarness({languages:['ar-EG','en-US'],storedLocale:'../../invalid'});
  await harness.window.OpsCoreI18n.ready;
  assert.equal(harness.window.OpsCoreI18n.locale,'ar');
  assert.equal(harness.html.dir,'rtl');
});

test('BCP-47 browser tags map onto package locale codes (zh-CN, zh-TW, fil, nb, yue)', async () => {
  const expected = { 'zh-CN': 'zh', 'zh-TW': 'zh', 'zh-HK': 'yue', 'yue': 'yue', 'fil-PH': 'tl', 'nb-NO': 'no', 'nn-NO': 'no', 'bi': 'bi' };
  for (const [tag, code] of Object.entries(expected)) {
    const harness = makeHarness({ languages: [tag] });
    await harness.window.OpsCoreI18n.ready;
    assert.equal(harness.window.OpsCoreI18n.locale, code, `${tag} should resolve to ${code}`);
  }
});

test('every one of the 114 locales loads, carries a localized machine notice or declared English notice, and sets direction', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(localeRoot, 'manifest.json'), 'utf8'));
  assert.equal(manifest.locales.length, 114);
  for (const entry of manifest.locales) {
    const harness = makeHarness({ languages: ['en-US'] });
    await harness.window.OpsCoreI18n.ready;
    const active = await harness.window.OpsCoreI18n.setLocale(entry.code);
    assert.equal(active, entry.code);
    assert.equal(harness.html.dir, entry.dir, `${entry.code} direction`);
    assert.ok(harness.window.OpsCoreI18n.machineNotice(entry.code).length > 10, `${entry.code} notice`);
  }
});
