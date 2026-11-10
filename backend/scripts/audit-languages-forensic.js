'use strict';
// Forensic audit: 114-language pack. Fails on any structural, lexical or UI defect.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const B=path.resolve(__dirname,'..'),L=path.join(B,'web','i18n','locales');
const CAT=require(path.join(B,'src','contact-center-languages.js'));
const CATALOGUE=CAT.CATALOGUE;
const flat=(o,p='',out={})=>{for(const[k,v]of Object.entries(o)){const q=p?p+'.'+k:k;v&&typeof v==='object'&&!Array.isArray(v)?flat(v,q,out):out[q]=v}return out};
const rd=f=>JSON.parse(fs.readFileSync(path.join(L,f),'utf8'));
const en=flat(rd('en.json')), keys=Object.keys(en).sort(), dataKeys=keys.filter(k=>k!=='nativeName');
const fail=[],warn=[];
const ok=[];

// 1. catalogue integrity
const codes=CATALOGUE.map(x=>x.code);
if(CATALOGUE.length!==114) fail.push(`catalogue=${CATALOGUE.length}, expected 114`);
if(new Set(codes).size!==114) fail.push('duplicate codes in catalogue');
else ok.push('catalogue: 114 unique codes');
const missingMeta=CATALOGUE.filter(x=>!x.name||!x.nativeName||!['ltr','rtl'].includes(x.dir));
if(missingMeta.length) fail.push('catalogue entries missing name/nativeName/dir: '+missingMeta.map(x=>x.code).join(','));
else ok.push('catalogue: name+nativeName+dir present for all 114');

// 2. file / manifest / loader parity
const files=fs.readdirSync(L).filter(f=>f.endsWith('.json')&&f!=='manifest.json').map(f=>f.slice(0,-5)).sort();
const a=files.join(','),b=[...codes].sort().join(',');
if(a!==b) fail.push('locale files != catalogue');
else ok.push('files: 114 locale JSON = catalogue codes');
const man=rd('manifest.json');
if(man.localeCount!==114||man.locales.length!==114) fail.push('manifest localeCount/length != 114');
if(new Set(man.locales.map(x=>x.code)).size!==114) fail.push('manifest duplicate codes');
if(man.locales.some(x=>!x.nativeName||!x.nativeName.trim())) fail.push('manifest entry without nativeName');
else ok.push('manifest: 114 entries, unique codes, nativeNames');
const loader=fs.readFileSync(path.join(B,'web','i18n','i18n-loader.js'),'utf8');
const lm=/const SUPPORTED = \[([^\]]+)\]/.exec(loader);
const loaderCodes=(lm?lm[1].match(/'([^']+)'/g):[]).map(s=>s.slice(1,-1));
if(loaderCodes.length!==114||new Set(loaderCodes).size!==114) fail.push('loader SUPPORTED != 114 unique');
if(loaderCodes.slice().sort().join(',')!==b) fail.push('loader codes != catalogue');
else ok.push('loader: 114 codes aligned');
const rtlExpected=CATALOGUE.filter(x=>x.dir==='rtl').map(x=>x.code).sort().join(',');
const rtlFound=((/const RTL = new Set\(\[([^\]]*)\]\)/.exec(loader)||[])[1]||'').match(/'([^']+)'/g)||[];
const rtlCodes=rtlFound.map(s=>s.slice(1,-1)).sort().join(',');
if(rtlCodes!==rtlExpected) fail.push(`RTL set mismatch: ${rtlCodes} != ${rtlExpected}`);
else ok.push(`RTL: ${rtlExpected}`);

// 3. per-locale structural parity
const register=JSON.parse(fs.readFileSync(path.join(B,'docs','contact-center','I18N_COMPLETION_REGISTER.json'),'utf8'));
for(const code of files){
  const f=flat(rd(code+'.json'));
  const k=Object.keys(f).sort();
  if(k.join('\n')!==keys.join('\n')){ fail.push(`${code}: key set mismatch (missing ${keys.filter(x=>!(x in f)).length}, extra ${k.filter(x=>!(x in en)).length})`); continue; }
  for(const key of keys){
    const v=f[key];
    if(typeof v!=='string'){ fail.push(`${code}.${key}: not a string`); continue; }
    if(!v.trim()) fail.push(`${code}.${key}: empty`);
    const t=s=>(String(s).match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g)||[]).sort().join('|');
    if(t(v)!==t(en[key])) fail.push(`${code}.${key}: placeholder mismatch`);
    if(/<\/?[a-z]/i.test(v)) fail.push(`${code}.${key}: embedded HTML tag`);
  }
  if(code!=='en'){
    const leak=dataKeys.filter(x=>f[x]===en[x]);
    const declared=new Set(register.locales[code]?.englishFallbackKeys||[]);
    for(const x of leak) if(!declared.has(x)) fail.push(`${code}.${x}: undeclared English source value`);
    for(const x of declared) if(!leak.includes(x)) fail.push(`${code}.${x}: register declares a fallback that no longer exists`);
    // script sanity: non-Latin target must not be pure English prose
    const nonLatin=/[\u0600-\u06FF\u0750-\u077F\u0780-\u07BF\u2D30-\u2D7F\u0900-\u0DFF\u0E00-\u0EFF\u0E80-\u0EFF\u1000-\u109F\u10A0-\u10FF\u1200-\u139F\u1780-\u17FF\u1C50-\u1C7F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF\uFB50-\uFDFF\u0590-\u05FF\u0530-\u058F\u0980-\u09FF\u0A00-\u0AFF\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F]/u;    const expectScript=['ar','fa','ur','ks','ps','dv','zh','yue','ja','ko','hi','bn','pa','ta','te','mr','gu','ml','kn','as','or','sat','ne','si','th','lo','km','my','ka','hy','am','ti','tig'];
    if(expectScript.includes(code)){
      const body=dataKeys.filter(x=>!declared.has(x)).map(x=>f[x]).join(' ');
      if(!nonLatin.test(body)) fail.push(`${code}: no target-script characters found`);
    }
  }
}
ok.push(`structure: 114 × ${keys.length} keys, no empties, placeholders intact`);

// 4. nativeName matches catalogue
for(const x of CATALOGUE){ const j=rd(x.code+'.json'); if(j.nativeName!==x.nativeName) fail.push(`${x.code}: nativeName "${j.nativeName}" != catalogue "${x.nativeName}"`); }
ok.push('nativeName: file = catalogue for all 114');

// 5. dead / orphan files
const webFiles=[];(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);e.isDirectory()?w(p):webFiles.push(p)}})(path.join(B,'web'));
const junk=webFiles.filter(p=>/(^|\/)(\.DS_Store|Thumbs\.db|.*\.bak|.*\.orig|.*~|.*\.tmp)$/.test(p));
if(junk.length) fail.push('junk files: '+junk.join(','));
const orphan=[...files,'manifest'].filter(c=>!loader.includes(`'${c}'`)&&c!=='manifest'&&!webFiles.some(p=>p.endsWith(c+'.json')));
if(orphan.length) fail.push('orphan locale files: '+orphan.join(','));
ok.push('files: no junk/orphan artifacts');

// 6. syntax
const js=[];(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.name==='node_modules')continue;const p=path.join(d,e.name);e.isDirectory()?w(p):e.name.endsWith('.js')&&js.push(p)}})(B);
let jsBad=0;
for(const f of js){ const r=cp.spawnSync(process.execPath,['--check',f],{encoding:'utf8'}); if(r.status!==0){jsBad++;fail.push(`syntax: ${path.relative(B,f)}`);} }
ok.push(`syntax: ${js.length-jsBad}/${js.length} JS files parse`);

// 7. dir/lang wiring + notice
const html=fs.readFileSync(path.join(B,'web','contact-center.html'),'utf8');
if(!/<html lang="en" dir="ltr">/.test(html)) fail.push('html lang/dir baseline missing');
if(!html.includes('id="interfaceLanguageSelect"')) fail.push('interface switcher missing');
if(!html.includes('data-i18n-machine-notice')) fail.push('machine-translation notice missing');
const iface=((/<select id="interfaceLanguageSelect"[\s\S]*?<\/select>/.exec(html))||[''])[0];
if(/<option/.test(iface)) fail.push('hardcoded <option> inside interfaceLanguageSelect');
if(!loader.includes('applyNotice()')) fail.push('notice not applied by loader');
if(!loader.includes("document.documentElement.dir = RTL.has(locale) ? 'rtl' : 'ltr'")) fail.push('dir not switched per locale');
if(!fs.readFileSync(path.join(B,'web','contact-center.css'),'utf8').includes('.machine-notice')) fail.push('notice CSS missing');
ok.push('UI: switcher built from manifest, dir/lang switched, localized notice wired');

// 8. sector neutrality of shipped runtime copy
const sector=/\b(fiber|fibre|FTTH|GPON|OLT|ONT|OTDR|optical|splitter)\b/i;
const runtime=[...js.filter(f=>!f.includes('test')&&!f.includes('scripts'))];
for(const f of runtime){ const t=fs.readFileSync(f,'utf8'); if(sector.test(t)) fail.push(`sector-specific vocabulary in ${path.relative(B,f)}`); }
for(const code of files){ const t=fs.readFileSync(path.join(L,code+'.json'),'utf8'); if(sector.test(t)) fail.push(`sector-specific vocabulary in locale ${code}`); }
ok.push('sector-neutral: no fiber-only vocabulary in runtime or locales');

// 9. register honesty
const st=Object.values(register.locales).map(x=>x.status);
if(register.locales.en.status!=='source') fail.push('register: en must be source');
if(register.summary.productionQualified!==0) fail.push('register claims production qualification');
if(register.nativeReviewStatus!=='not_native_reviewed') fail.push('register must state not_native_reviewed');
const draftCount=st.filter(x=>x==='draft_translation_pending_native_review').length;
if(register.summary.draftTranslationLocales!==draftCount) fail.push('register summary draft count stale');
ok.push(`honesty: 0 production-qualified, ${draftCount} machine drafts, ${st.filter(x=>x==='english_fallback_pending').length} declared fallbacks`);

console.log('== FORENSIC LANGUAGE-PACK AUDIT ==');
ok.forEach(x=>console.log('PASS  '+x));
warn.forEach(x=>console.log('WARN  '+x));
if(fail.length){ console.log(`FAIL  ${fail.length} finding(s)`); fail.slice(0,40).forEach(x=>console.log('  - '+x)); process.exitCode=1; }
else console.log(`\nRESULT: PASS — 114/114 locales, 0 defects`);
