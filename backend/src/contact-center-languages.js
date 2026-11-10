'use strict';

/**
 * OpsCore FIELD contact-centre language catalogue.
 *
 * 114 launch languages, sector-neutral field operations (utilities, facilities,
 * logistics, maintenance, telecom, construction - not one vertical only).
 * Registration in this catalogue is a *rollout target*, NOT provider
 * certification: every locale stays machine-assisted and unverified until text,
 * ASR, TTS, accent and escalation acceptance tests pass with a native reviewer.
 *
 * Codes that are not ISO 639-1 keep their ISO 639-3 / BCP-47 subtags and are
 * used verbatim by the loader, the manifest and the locale files:
 *   ktu (Kituba), tig (Tigre), din (Dinka), nus (Nuer), ber (Tamazight),
 *   sat (Santali), pau (Palauan), yue (Cantonese).
 * 'no' is Norwegian (covers nb/nn at the UI level), 'tl' is Tagalog.
 */
const CATALOGUE = [
  { code: 'ar', name: "Arabic", nativeName: "العربية", dir: 'rtl' },
  { code: 'fa', name: "Persian", nativeName: "فارسی", dir: 'rtl' },
  { code: 'tr', name: "Turkish", nativeName: "Türkçe", dir: 'ltr' },
  { code: 'ku', name: "Kurdish (Kurmanji)", nativeName: "Kurdî (Kurmancî)", dir: 'ltr' },
  { code: 'am', name: "Amharic", nativeName: "አማርኛ", dir: 'ltr' },
  { code: 'sw', name: "Swahili", nativeName: "Kiswahili", dir: 'ltr' },
  { code: 'om', name: "Oromo", nativeName: "Afaan Oromoo", dir: 'ltr' },
  { code: 'so', name: "Somali", nativeName: "Soomaali", dir: 'ltr' },
  { code: 'ti', name: "Tigrinya", nativeName: "ትግርኛ", dir: 'ltr' },
  { code: 'ha', name: "Hausa", nativeName: "Hausa", dir: 'ltr' },
  { code: 'yo', name: "Yoruba", nativeName: "Yorùbá", dir: 'ltr' },
  { code: 'ig', name: "Igbo", nativeName: "Igbo", dir: 'ltr' },
  { code: 'zu', name: "Zulu", nativeName: "isiZulu", dir: 'ltr' },
  { code: 'xh', name: "Xhosa", nativeName: "isiXhosa", dir: 'ltr' },
  { code: 'af', name: "Afrikaans", nativeName: "Afrikaans", dir: 'ltr' },
  { code: 'ff', name: "Fula", nativeName: "Fulfulde", dir: 'ltr' },
  { code: 'wo', name: "Wolof", nativeName: "Wolof", dir: 'ltr' },
  { code: 'bm', name: "Bambara", nativeName: "Bamanankan", dir: 'ltr' },
  { code: 'mg', name: "Malagasy", nativeName: "Malagasy", dir: 'ltr' },
  { code: 'rw', name: "Kinyarwanda", nativeName: "Ikinyarwanda", dir: 'ltr' },
  { code: 'rn', name: "Kirundi", nativeName: "Ikirundi", dir: 'ltr' },
  { code: 'st', name: "Sesotho", nativeName: "Sesotho", dir: 'ltr' },
  { code: 'tn', name: "Tswana", nativeName: "Setswana", dir: 'ltr' },
  { code: 'ss', name: "Swazi", nativeName: "siSwati", dir: 'ltr' },
  { code: 'ts', name: "Tsonga", nativeName: "Xitsonga", dir: 'ltr' },
  { code: 've', name: "Venda", nativeName: "Tshivenda", dir: 'ltr' },
  { code: 'nr', name: "Ndebele", nativeName: "isiNdebele", dir: 'ltr' },
  { code: 'sn', name: "Shona", nativeName: "chiShona", dir: 'ltr' },
  { code: 'ny', name: "Chichewa", nativeName: "Chichewa", dir: 'ltr' },
  { code: 'ln', name: "Lingala", nativeName: "Lingála", dir: 'ltr' },
  { code: 'ktu', name: "Kituba", nativeName: "Kituba", dir: 'ltr' },
  { code: 'sg', name: "Sango", nativeName: "Sängö", dir: 'ltr' },
  { code: 'tig', name: "Tigre", nativeName: "ትግረ", dir: 'ltr' },
  { code: 'din', name: "Dinka", nativeName: "Thuɔŋjäŋ", dir: 'ltr' },
  { code: 'nus', name: "Nuer", nativeName: "Thok Naath", dir: 'ltr' },
  { code: 'ber', name: "Tamazight", nativeName: "ⵜⴰⵎⴰⵣⵉⵖⵜ", dir: 'ltr' },
  { code: 'zh', name: "Mandarin Chinese", nativeName: "简体中文", dir: 'ltr' },
  { code: 'yue', name: "Cantonese", nativeName: "粵語", dir: 'ltr' },
  { code: 'ja', name: "Japanese", nativeName: "日本語", dir: 'ltr' },
  { code: 'ko', name: "Korean", nativeName: "한국어", dir: 'ltr' },
  { code: 'hi', name: "Hindi", nativeName: "हिन्दी", dir: 'ltr' },
  { code: 'ur', name: "Urdu", nativeName: "اردو", dir: 'rtl' },
  { code: 'bn', name: "Bengali", nativeName: "বাংলা", dir: 'ltr' },
  { code: 'pa', name: "Punjabi", nativeName: "ਪੰਜਾਬੀ", dir: 'ltr' },
  { code: 'ta', name: "Tamil", nativeName: "தமிழ்", dir: 'ltr' },
  { code: 'te', name: "Telugu", nativeName: "తెలుగు", dir: 'ltr' },
  { code: 'mr', name: "Marathi", nativeName: "मराठी", dir: 'ltr' },
  { code: 'gu', name: "Gujarati", nativeName: "ગુજરાતી", dir: 'ltr' },
  { code: 'ml', name: "Malayalam", nativeName: "മലയാളം", dir: 'ltr' },
  { code: 'kn', name: "Kannada", nativeName: "ಕನ್ನಡ", dir: 'ltr' },
  { code: 'as', name: "Assamese", nativeName: "অসমীয়া", dir: 'ltr' },
  { code: 'or', name: "Odia", nativeName: "ଓଡ଼ିଆ", dir: 'ltr' },
  { code: 'sat', name: "Santali", nativeName: "ᱥᱟᱱᱛᱟᱲᱤ", dir: 'ltr' },
  { code: 'ks', name: "Kashmiri", nativeName: "کٲشُر", dir: 'rtl' },
  { code: 'ne', name: "Nepali", nativeName: "नेपाली", dir: 'ltr' },
  { code: 'si', name: "Sinhala", nativeName: "සිංහල", dir: 'ltr' },
  { code: 'dv', name: "Dhivehi", nativeName: "ދިވެހި", dir: 'rtl' },
  { code: 'ps', name: "Pashto", nativeName: "پښتو", dir: 'rtl' },
  { code: 'ms', name: "Malay", nativeName: "Bahasa Melayu", dir: 'ltr' },
  { code: 'id', name: "Indonesian", nativeName: "Bahasa Indonesia", dir: 'ltr' },
  { code: 'th', name: "Thai", nativeName: "ไทย", dir: 'ltr' },
  { code: 'vi', name: "Vietnamese", nativeName: "Tiếng Việt", dir: 'ltr' },
  { code: 'km', name: "Khmer", nativeName: "ខ្មែរ", dir: 'ltr' },
  { code: 'lo', name: "Lao", nativeName: "ລາວ", dir: 'ltr' },
  { code: 'my', name: "Burmese", nativeName: "မြန်မာ", dir: 'ltr' },
  { code: 'tl', name: "Tagalog", nativeName: "Filipino", dir: 'ltr' },
  { code: 'az', name: "Azerbaijani", nativeName: "Azərbaycan dili", dir: 'ltr' },
  { code: 'hy', name: "Armenian", nativeName: "Հայերեն", dir: 'ltr' },
  { code: 'ka', name: "Georgian", nativeName: "ქართული", dir: 'ltr' },
  { code: 'mn', name: "Mongolian", nativeName: "Монгол", dir: 'ltr' },
  { code: 'en', name: "English", nativeName: "English", dir: 'ltr' },
  { code: 'fr', name: "French", nativeName: "Français", dir: 'ltr' },
  { code: 'es', name: "Spanish", nativeName: "Español", dir: 'ltr' },
  { code: 'ru', name: "Russian", nativeName: "Русский", dir: 'ltr' },
  { code: 'de', name: "German", nativeName: "Deutsch", dir: 'ltr' },
  { code: 'it', name: "Italian", nativeName: "Italiano", dir: 'ltr' },
  { code: 'pt', name: "Portuguese", nativeName: "Português", dir: 'ltr' },
  { code: 'nl', name: "Dutch", nativeName: "Nederlands", dir: 'ltr' },
  { code: 'el', name: "Greek", nativeName: "Ελληνικά", dir: 'ltr' },
  { code: 'sq', name: "Albanian", nativeName: "Shqip", dir: 'ltr' },
  { code: 'sr', name: "Serbian", nativeName: "Српски", dir: 'ltr' },
  { code: 'hr', name: "Croatian", nativeName: "Hrvatski", dir: 'ltr' },
  { code: 'bs', name: "Bosnian", nativeName: "Bosanski", dir: 'ltr' },
  { code: 'mk', name: "Macedonian", nativeName: "Македонски", dir: 'ltr' },
  { code: 'bg', name: "Bulgarian", nativeName: "Български", dir: 'ltr' },
  { code: 'ro', name: "Romanian", nativeName: "Română", dir: 'ltr' },
  { code: 'hu', name: "Hungarian", nativeName: "Magyar", dir: 'ltr' },
  { code: 'cs', name: "Czech", nativeName: "Čeština", dir: 'ltr' },
  { code: 'sk', name: "Slovak", nativeName: "Slovenčina", dir: 'ltr' },
  { code: 'pl', name: "Polish", nativeName: "Polski", dir: 'ltr' },
  { code: 'uk', name: "Ukrainian", nativeName: "Українська", dir: 'ltr' },
  { code: 'be', name: "Belarusian", nativeName: "Беларуская", dir: 'ltr' },
  { code: 'lt', name: "Lithuanian", nativeName: "Lietuvių", dir: 'ltr' },
  { code: 'lv', name: "Latvian", nativeName: "Latviešu", dir: 'ltr' },
  { code: 'et', name: "Estonian", nativeName: "Eesti", dir: 'ltr' },
  { code: 'fi', name: "Finnish", nativeName: "Suomi", dir: 'ltr' },
  { code: 'sv', name: "Swedish", nativeName: "Svenska", dir: 'ltr' },
  { code: 'no', name: "Norwegian", nativeName: "Norsk", dir: 'ltr' },
  { code: 'da', name: "Danish", nativeName: "Dansk", dir: 'ltr' },
  { code: 'is', name: "Icelandic", nativeName: "Íslenska", dir: 'ltr' },
  { code: 'kk', name: "Kazakh", nativeName: "Қазақ тілі", dir: 'ltr' },
  { code: 'uz', name: "Uzbek", nativeName: "Oʻzbekcha", dir: 'ltr' },
  { code: 'tk', name: "Turkmen", nativeName: "Türkmençe", dir: 'ltr' },
  { code: 'tg', name: "Tajik", nativeName: "Тоҷикӣ", dir: 'ltr' },
  { code: 'qu', name: "Quechua", nativeName: "Runasimi", dir: 'ltr' },
  { code: 'ay', name: "Aymara", nativeName: "Aymar aru", dir: 'ltr' },
  { code: 'gn', name: "Guarani", nativeName: "Avañeʼẽ", dir: 'ltr' },
  { code: 'mi', name: "Maori", nativeName: "Te Reo Māori", dir: 'ltr' },
  { code: 'fj', name: "Fijian", nativeName: "Na Vosa Vakaviti", dir: 'ltr' },
  { code: 'sm', name: "Samoan", nativeName: "Gagana Sāmoa", dir: 'ltr' },
  { code: 'to', name: "Tongan", nativeName: "Lea Faka-Tonga", dir: 'ltr' },
  { code: 'bi', name: "Bislama", nativeName: "Bislama", dir: 'ltr' },
  { code: 'pau', name: "Palauan", nativeName: "Tekoi er a Belau", dir: 'ltr' },
  { code: 'ch', name: "Chamorro", nativeName: "Chamoru", dir: 'ltr' }
];

const RTL_CODES = new Set(CATALOGUE.filter(item => item.dir === 'rtl').map(item => item.code));
const languages = CATALOGUE.map((item, index) => Object.freeze({
  listNumber: index + 1,
  name: item.name,
  nativeName: item.nativeName,
  code: item.code,
  dir: item.dir,
  duplicateOf: null,
  catalogStatus: 'registered_machine_draft',
  textQualityVerified: false,
  speechRecognitionVerified: false,
  speechSynthesisVerified: false,
  humanReviewCompleted: false
}));

const unique = languages;
// Resolve from the same canonical records returned by the public catalogue so
// callers always receive duplicateOf and verification-state fields consistently.
const BY_CODE = new Map(languages.map(item => [item.code, item]));

function getLanguage(code) {
  return BY_CODE.get(String(code || '').trim()) || null;
}

function summary() {
  return {
    schemaVersion: 'opscore.contact-center-language-catalog.v2',
    sourceRows: CATALOGUE.length,
    uniqueLanguageCodes: unique.length,
    duplicateRows: [],
    rtlLanguageCodes: [...RTL_CODES],
    qualifiedForProduction: 0,
    translationProvenance: 'machine_assisted_draft',
    nativeReviewStatus: 'not_native_reviewed',
    note: 'Catalogue registration is not proof of ASR, TTS, dialect, accent or intent-detection quality. Every language is a machine-assisted draft and must pass provider-specific acceptance tests with a native reviewer before being advertised as production-supported.'
  };
}

module.exports = { languages, getLanguage, summary, CATALOGUE, RTL_CODES };
