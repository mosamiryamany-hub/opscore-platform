/*! OpsCore FIELD contact-center localization loader.
 * Loads only supported, package-owned locale codes; updates text through textContent.
 * Browser/provider language quality remains unqualified until native-speaker acceptance.
 */
'use strict';
(() => {
  const SUPPORTED = ['ar','fa','tr','ku','am','sw','om','so','ti','ha','yo','ig','zu','xh','af','ff','wo','bm','mg','rw','rn','st','tn','ss','ts','ve','nr','sn','ny','ln','ktu','sg','tig','din','nus','ber','zh','yue','ja','ko','hi','ur','bn','pa','ta','te','mr','gu','ml','kn','as','or','sat','ks','ne','si','dv','ps','ms','id','th','vi','km','lo','my','tl','az','hy','ka','mn','en','fr','es','ru','de','it','pt','nl','el','sq','sr','hr','bs','mk','bg','ro','hu','cs','sk','pl','uk','be','lt','lv','et','fi','sv','no','da','is','kk','uz','tk','tg','qu','ay','gn','mi','fj','sm','to','bi','pau','ch'];
  const RTL = new Set(['ar','fa','ur','ks','dv','ps']);
  // Localized provenance notice. Machine translation must never look hand-approved.
  const MACHINE_NOTICE = {
    "ar": "ترجمة آلية — لم تُراجع بعد من متحدث أصلي.",
    "fa": "ترجمه ماشینی — هنوز توسط گویشور بومی بازبینی نشده است.",
    "tr": "Makine çevirisi — henüz ana dili konuşuru tarafından incelenmedi.",
    "ku": "Wergera makînê — hêj ji aliyê axêverekî zikmakî ve nehatiye venihêrtin.",
    "am": "የማሽን ትርጉም — እስካሁን በአፍ መፍቻ ተናጋሪ አልተገመገመም።",
    "sw": "Tafsiri ya mashine — bado haijapitiliwa na mzungumzaji asilia.",
    "om": "Hiikkaa makinaa — hamma yeroo ammaa dubbataa dhalootaan hin ilaalamne.",
    "so": "Turjumaad mishiin — wali laguma hubin qof ku hadla afka hooyo.",
    "ti": "ትርጉም መሽን — ክሳብ ሕጂ ብተዛራቢ ወላዲ ኣይተረጋገጸን።",
    "ha": "Fassarar inji — ba a duba ta da mai magana na asali ba tukuna.",
    "yo": "Ìtumọ̀ ẹ̀rọ — a kò tí ì ṣàyẹ̀wò rẹ̀ pẹ̀lú olùsọ̀rọ̀ ìbílẹ̀.",
    "ig": "Nsụgharị igwe — onye na-asụ asụsụ ala ahụ enyochabeghị ya.",
    "zu": "Ukuhumusha komshini — akukahlolwanga ngumkhulumeli womdabu.",
    "xh": "Uguqulelo lomatshini — akukahlolwanga ngumthethi womthonyama.",
    "af": "Masjienvertaling — nog nie deur 'n moedertaalspreker nagegaan nie.",
    "ff": "Firooraandi masiŋ — haa teeŋtinaa e haalooɓe ɗemngal.",
    "wo": "Tekki ci machine — bañu ko seet na wax nit.",
    "bm": "Bayɛlɛmabɔ masin — ma lajɛ ni kumakanfɔla fɔlɔ fɛ.",
    "mg": "Dikantekantem-panjaitra — tsy mbola nohamarinin'ny teratany.",
    "rw": "Guhindura mu buryo bw'ikoranabuhanga — ntibirasuzumwa n'umuvuga kavukire.",
    "rn": "Guhindura ku buryo bw'ubwenge — ntibirasubirwamwo n'umuvuzi w'iryo zina.",
    "st": "Phetolelo ya motšhene — ha e so hlahlobisoe ke sebui sa tlhaho.",
    "tn": "Thanolo ya motšhini — ga e ise e tlhotlhomisiwe ke sebui sa tlholego.",
    "ss": "Kuhumusha kwematshini — akukahlolwanga ngumkhulumi womdabu.",
    "ts": "Muhundzuluxo wa muchini — a wu si kambisisiwa hi muvulavuri wa ndzalo.",
    "ve": "Tshandukiso ya mutshini — a yo senguluswa nga mutambi wa mveledziso.",
    "nr": "Ukuhumusha komtjhini — akukahlolwanga ngumkhulumi womdabu.",
    "sn": "Kushandura kwemuchina — hazvina kuongororwa nemutauri wechivanhu.",
    "ny": "Kumasulira kwa makina — sizinayang'anidwe ndi wolankhula wachibadwa.",
    "ln": "Bɔlɔ́kɔ ya masini — esɛngɛlɛmɛ na mwǎna ya monɔkɔ ya mbóka.",
    "ktu": "Kusoba ya masini — ke yo kufimpa na muntu ya ndinga ya bwala ve.",
    "sg": "Gbëgë ti masini — a bâa na zo ti ndîngo ti kodoro pëpe.",
    "tig": "ትርጉም መሽን — ክሳብ ሕጂ ብተዛራቢ ወላዲ ኣይተረጋገጸን።",
    "din": "Machine translation — not yet reviewed by a native speaker.",
    "nus": "Machine translation — not yet reviewed by a native speaker.",
    "ber": "Tasuqilt n umecṭi — ur tettwasenqed ara s umeslay aneṣli.",
    "zh": "机器翻译 —— 尚未经过母语者审校。",
    "yue": "機器翻譯 —— 未經母語者審核。",
    "ja": "機械翻訳 — ネイティブスピーカーによる確認は未実施です。",
    "ko": "기계 번역 — 아직 원어민 검수를 받지 않았습니다.",
    "hi": "मशीन अनुवाद — अभी मूल वक्ता द्वारा समीक्षा नहीं की गई है।",
    "ur": "مشینی ترجمہ — ابھی تک مقامی بولنے والے نے جائزہ نہیں لیا۔",
    "bn": "মেশিন অনুবাদ — এখনও স্থানীয় ভাষাভাষীর দ্বারা পর্যালোচিত নয়।",
    "pa": "ਮਸ਼ੀਨ ਅਨੁਵਾਦ — ਹਾਲੇ ਮੂਲ ਬੋਲਣ ਵਾਲੇ ਵੱਲੋਂ ਸਮੀਖਿਆ ਨਹੀਂ ਹੋਈ।",
    "ta": "இயந்திர மொழிபெயர்ப்பு — சொந்த மொழி பேசுபவரால் இன்னும் சரிபார்க்கப்படவில்லை.",
    "te": "యంత్ర అనువాదం — స్థానిక మాట్లాడే వారిచే ఇంకా సమీక్షించబడలేదు.",
    "mr": "मशीन भाषांतर — मूळ भाषिकांकडून अद्याप तपासले गेले नाही.",
    "gu": "મશીન અનુવાદ — હજી સ્થાનિક ભાષક દ્વારા સમીક્ષા થઈ નથી.",
    "ml": "യന്ത്ര പരിഭാഷ — തദ്ദേശ ഭാഷക്കാരൻ ഇതുവരെ പരിശോധിച്ചിട്ടില്ല.",
    "kn": "ಯಂತ್ರ ಅನುವಾದ — ಸ್ಥಳೀಯ ಭಾಷಿಗರಿಂದ ಇನ್ನೂ ಪರಿಶೀಲಿಸಲಾಗಿಲ್ಲ.",
    "as": "মেচিন অনুবাদ — স্থানীয় ভাষীৰ দ্বাৰা এতিয়াও পৰ্যালোচনা হোৱা নাই।",
    "or": "ମେସିନ ଅନୁବାଦ — ସ୍ଥାନୀୟ ବକ୍ତାଙ୍କ ଦ୍ୱାରା ଏପର୍ଯ୍ୟନ୍ତ ସମୀକ୍ଷା ହୋଇନାହିଁ।",
    "sat": "ᱢᱮᱥᱤᱱ ᱛᱚᱨᱡᱚᱢᱟ — ᱛᱟᱞᱟ ᱛᱮ ᱟᱹᱫᱤᱵᱟᱹᱥᱤ ᱵᱟᱝ ᱧᱮᱞ ᱟᱠᱟᱱᱟ ᱾",
    "ks": "مشین ترجمہ — از تام مقامی بولن وال تصدیق نہ چھِ۔",
    "ne": "मेसिन अनुवाद — स्थानीय वक्ताद्वारा अझै समीक्षा गरिएको छैन।",
    "si": "යන්ත්‍ර පරිවර්තනය — මව් භාෂකයෙකු විසින් තවම සමාලෝචනය කර නැත.",
    "dv": "މެޝިން ތަރުޖަމާ — ދިވެހި ބަހުން ވާހަކަދައްކާ މީހަކު އަދި ބައެއް ނުލައެވެ.",
    "ps": "ماشیني ژباړه — تر اوسه د اصلي ویونکي لخوا نه ده کتل شوې.",
    "ms": "Terjemahan mesin — belum disemak oleh penutur asli.",
    "id": "Terjemahan mesin — belum ditinjau oleh penutur asli.",
    "th": "การแปลด้วยเครื่อง — ยังไม่ได้รับการตรวจทานโดยเจ้าของภาษา",
    "vi": "Bản dịch máy — chưa được người bản ngữ rà soát.",
    "km": "ការបកប្រែដោយម៉ាស៊ីន — មិនទាន់បានពិនិត្យដោយអ្នកនិយាយដើមភាសាទេ។",
    "lo": "ການແປດ້ວຍເຄື່ອງ — ຍັງບໍ່ໄດ້ກວດສອບໂດຍຜູ້ເວົ້າເດີມ.",
    "my": "စက်ဖြင့်ဘာသာပြန်ခြင်း — မူရင်းဘာသာစကားပြောသူက မစစ်ဆေးရသေးပါ။",
    "tl": "Pagsasaling makina — hindi pa nasusuri ng katutubong tagapagsalita.",
    "az": "Maşın tərcüməsi — hələ ana dili daşıyıcısı tərəfindən yoxlanmayıb.",
    "hy": "Մեքենայական թարգմանություն — դեռ չի ստուգվել մայրենի խոսողի կողմից։",
    "ka": "მანქანური თარგმანი — ჯერ არ შემოწმებულა მშობლიური მოსაუბრეს მიერ.",
    "mn": "Машины орчуулга — төрөлх хэлтэн хянаагүй байна.",
    "en": "Machine translation — not yet reviewed by a native speaker.",
    "fr": "Traduction automatique — pas encore relue par un locuteur natif.",
    "es": "Traducción automática — aún no revisada por un hablante nativo.",
    "ru": "Машинный перевод — ещё не проверен носителем языка.",
    "de": "Maschinenübersetzung — noch nicht von einem Muttersprachler geprüft.",
    "it": "Traduzione automatica — non ancora rivista da un madrelingua.",
    "pt": "Tradução automática — ainda não revista por um falante nativo.",
    "nl": "Machinevertaling — nog niet nagekeken door een moedertaalspreker.",
    "el": "Μηχανική μετάφραση — δεν έχει ακόμη ελεγχθεί από φυσικό ομιλητή.",
    "sq": "Përkthim makine — nuk është rishikuar ende nga një folës amtare.",
    "sr": "Машински превод — још није прегледан од стране изворног говорника.",
    "hr": "Strojni prijevod — još nije pregledao izvorni govornik.",
    "bs": "Mašinski prijevod — još nije pregledao izvorni govornik.",
    "mk": "Машински превод — сè уште не е прегледан од мајчин говорник.",
    "bg": "Машинен превод — все още не е прегледан от носител на езика.",
    "ro": "Traducere automată — încă nerevizuită de un vorbitor nativ.",
    "hu": "Gépi fordítás — még nem ellenőrizte anyanyelvi beszélő.",
    "cs": "Strojový překlad — dosud nezkontroloval rodilý mluvčí.",
    "sk": "Strojový preklad — zatiaľ neskontroloval rodený hovorca.",
    "pl": "Tłumaczenie maszynowe — jeszcze nie sprawdzone przez native speakera.",
    "uk": "Машинний переклад — ще не перевірено носієм мови.",
    "be": "Машынны пераклад — яшчэ не правераны носьбітам мовы.",
    "lt": "Mašininis vertimas — dar neperžiūrėtas gimtakalbio.",
    "lv": "Mašīntulkojums — vēl nav pārbaudījis dzimtās valodas runātājs.",
    "et": "Masintõlge — emakeelekõneleja pole veel üle vaadanud.",
    "fi": "Konekäännös — äidinkielinen puhuja ei ole vielä tarkistanut.",
    "sv": "Maskinöversättning — ännu inte granskad av en modersmålstalare.",
    "no": "Maskinoversettelse — ikke gjennomgått av morsmålstalende ennå.",
    "da": "Maskinoversættelse — endnu ikke gennemgået af en modersmålstalende.",
    "is": "Vélþýðing — ekki enn yfirfarin af móðurmálshöfunda.",
    "kk": "Машиналық аударма — ана тілінде сөйлейтін адам әлі тексермеген.",
    "uz": "Mashina tarjimasi — hali ona tilida so'zlashuvchi tomonidan ko'rib chiqilmagan.",
    "tk": "Maşyn terjime — ene dilinde gürleýän tarapyndan entek barlanmady.",
    "tg": "Тарҷумаи мошинӣ — ҳанӯз аз ҷониби бавуҷудзабон баррасӣ нашудааст.",
    "qu": "Antakuy makina — manaraq yachaq runap qhawasqanchu.",
    "ay": "Qillqawi makina — janiw yaqha arsiri uñakipkiti.",
    "gn": "Ñe'ẽmbohasáva mákina — ndaipóri gueteri ojehecha peteĩ yvypóra ñe'ẽ rehegua.",
    "mi": "Whakamāoritanga mīhini — kāore anō kia arotakengia e tētahi kaikōrero māori.",
    "fj": "Vakadewa ni misini — e se bera ni raica e dua na dauvosavosa dina.",
    "sm": "Faaliliuga faʻamasini — e lei iloiloina e se tagata tautala moni.",
    "to": "Liliu lea ʻaki e misini — ʻoku teʻeki sivi ʻe ha tokotaha lea ʻiloa.",
    "bi": "Masin translesen — i no gat man we i tok long lanwis ya i jekem yet.",
    "pau": "Machine translation — not yet reviewed by a native speaker.",
    "ch": "Machine translation — not yet reviewed by a native speaker."
  };
  const scriptUrl = document.currentScript && document.currentScript.src;
  const LOADER_BASE = new URL('.', scriptUrl || location.href);
  let dict = {};
  let locale = 'en';
  let requestGeneration = 0;
  let manifestPromise;
  let changeListenerAttached = false;

  function lookup(key) {
    if (typeof key !== 'string' || !key || key.length > 180) return undefined;
    return key.split('.').reduce((value, part) => {
      if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, part)) return undefined;
      return value[part];
    }, dict);
  }
  function t(key, params, fallback) {
    let value = lookup(key);
    if (typeof value !== 'string') value = typeof fallback === 'string' ? fallback : key;
    if (params && typeof params === 'object') {
      for (const [name, replacement] of Object.entries(params)) {
        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) continue;
        value = value.split('{' + name + '}').join(String(replacement ?? ''));
      }
    }
    return value;
  }
  function setText(element, key, params, fallback) {
    element.textContent = t(key, params, fallback);
  }
  function apply() {
    document.querySelectorAll('[data-i18n]').forEach(element => {
      setText(element, element.getAttribute('data-i18n'), null, element.getAttribute('data-i18n-fallback'));
    });
    document.querySelectorAll('[data-i18n-dynamic-key]').forEach(element => {
      let params = {};
      try { params = JSON.parse(element.getAttribute('data-i18n-params') || '{}'); } catch { params = {}; }
      setText(element, element.getAttribute('data-i18n-dynamic-key'), params, element.getAttribute('data-i18n-fallback'));
    });
    for (const [selector, attribute] of [['[data-i18n-placeholder]','placeholder'],['[data-i18n-aria-label]','aria-label'],['[data-i18n-title]','title']]) {
      document.querySelectorAll(selector).forEach(element => {
        const attr = attribute === 'placeholder' ? 'data-i18n-placeholder' : attribute === 'aria-label' ? 'data-i18n-aria-label' : 'data-i18n-title';
        const translated = t(element.getAttribute(attr));
        if (translated && translated !== element.getAttribute(attr)) element.setAttribute(attribute, translated);
      });
    }
    document.documentElement.lang = locale;
    document.documentElement.dir = RTL.has(locale) ? 'rtl' : 'ltr';
    applyNotice();
  }
  function detect() {
    let forced = null;
    try { forced = localStorage.getItem('opscore.locale'); } catch { /* storage can be blocked */ }
    const browserCandidates = Array.isArray(navigator.languages) && navigator.languages.length ? navigator.languages : [navigator.language || 'en'];
    const rawCandidates = forced ? [forced, ...browserCandidates] : browserCandidates;
    for (const candidate of rawCandidates) {
      if (typeof candidate !== 'string') continue;
      const normalized = candidate.trim().toLowerCase();
      let code = null;
      // Map BCP-47 browser tags onto the 114 package-owned codes (zh-CN/zh-TW -> zh, yue/zh-HK -> yue, fil -> tl, nb/nn -> no).
      if (normalized.startsWith('yue') || normalized.startsWith('zh-hk')) code = 'yue';
      else if (normalized.startsWith('zh')) code = 'zh';
      else if (normalized.startsWith('fil') || normalized === 'tl' || normalized.startsWith('tl-')) code = 'tl';
      else if (normalized.startsWith('nn') || normalized === 'no' || normalized.startsWith('no-') || normalized.startsWith('nb')) code = 'no';
      else code = SUPPORTED.find(item => item.toLowerCase() === normalized.split('-')[0]) || null;
      if (code && SUPPORTED.includes(code)) return code;
    }
    return 'en';
  }
  async function fetchJson(relativePath) {
    const response = await fetch(new URL(relativePath, LOADER_BASE), { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('I18N_RESOURCE_UNAVAILABLE');
    return response.json();
  }
  function loadManifest() {
    if (!manifestPromise) {
      manifestPromise = fetchJson('locales/manifest.json').then(data => {
        if (!data || !Array.isArray(data.locales)) throw new Error('I18N_MANIFEST_INVALID');
        const entries = data.locales.filter(item => item && typeof item.code === 'string' && SUPPORTED.includes(item.code) && typeof item.nativeName === 'string' && item.nativeName.trim());
        const unique = new Map(entries.map(item => [item.code, item.nativeName.trim()]));
        if (unique.size !== SUPPORTED.length) throw new Error('I18N_MANIFEST_INCOMPLETE');
        return unique;
      }).catch(() => null);
    }
    return manifestPromise;
  }
  function populatePicker(nativeNames) {
    const picker = document.getElementById('interfaceLanguageSelect');
    if (!picker) return;
    const fragment = document.createDocumentFragment();
    for (const code of SUPPORTED) {
      const option = document.createElement('option');
      option.value = code;
      const name = nativeNames && nativeNames.get(code);
      option.textContent = `${name || code} (${code})`;
      fragment.appendChild(option);
    }
    picker.replaceChildren(fragment);
    picker.value = locale;
    if (!changeListenerAttached) {
      picker.addEventListener('change', () => { setLocale(picker.value).catch(() => {}); });
      changeListenerAttached = true;
    }
  }
  async function init(requested, options = {}) {
    const generation = ++requestGeneration;
    const candidate = typeof requested === 'string' && SUPPORTED.includes(requested) ? requested : detect();
    const [nativeNames] = await Promise.all([loadManifest()]);
    let selectedLocale = candidate;
    let selectedDict;
    try {
      selectedDict = await fetchJson('locales/' + candidate + '.json');
      if (!selectedDict || typeof selectedDict !== 'object' || Array.isArray(selectedDict) || typeof selectedDict.nativeName !== 'string') throw new Error('I18N_LOCALE_INVALID');
    } catch {
      selectedLocale = 'en';
      try {
        selectedDict = await fetchJson('locales/en.json');
      } catch {
        selectedDict = {};
      }
    }
    if (generation !== requestGeneration) return locale;
    locale = selectedLocale;
    dict = selectedDict;
    if (options.emit && selectedLocale !== candidate) {
      try { localStorage.setItem('opscore.locale', selectedLocale); } catch { /* storage can be blocked */ }
    }
    apply();
    populatePicker(nativeNames);
    if (options.emit && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('opscore:localechange', { detail: { locale } }));
    }
    return locale;
  }
  async function setLocale(requested) {
    const canonical = typeof requested === 'string' ? SUPPORTED.find(item => item.toLowerCase() === requested.trim().toLowerCase()) : undefined;
    if (!canonical) return locale;
    try { localStorage.setItem('opscore.locale', canonical); } catch { /* selection still applies for this page */ }
    return init(canonical, { emit: true });
  }

  function machineNotice(code) { return MACHINE_NOTICE[code] || MACHINE_NOTICE.en; }
  function applyNotice() {
    document.querySelectorAll('[data-i18n-machine-notice]').forEach(element => {
      element.textContent = machineNotice(locale);
    });
  }
  const api = { get locale() { return locale; }, machineNotice, applyNotice, t, apply, reapply: apply, init, setLocale, supported: SUPPORTED.slice(), get ready() { return initialReady; }, get currentLocale() { return locale; } };
  window.OpsCoreI18n = api;
  const initialReady = init();
})();
