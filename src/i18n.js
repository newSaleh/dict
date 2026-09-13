import ar from './i18n/ar.js';
import en from './i18n/en.js';
import ur from './i18n/ur.js';

export const DICTS = { ar, en, ur };
export const SUPPORTED_LANGS = ['ar', 'en', 'ur'];
const STORAGE_KEY = 'sdc_lang';

let currentLang = 'ar';
const listeners = new Set();

export function detectInitialLang() {
  // العربية هي اللغة الافتراضية دائمًا؛ لا نعتمد على لغة المتصفح حتى لا يفاجأ
  // المستخدم بلغة غير متوقعة. يمكنه تغييرها بنفسه وسيتم تذكّر اختياره لاحقًا.
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && DICTS[saved]) return saved;
  return 'ar';
}

export function getLang() {
  return currentLang;
}

export function t(key, params) {
  const dict = DICTS[currentLang] || DICTS.ar;
  let str = dict[key] ?? DICTS.ar[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replaceAll(`{${k}}`, v);
    }
  }
  return str;
}

export function setLang(lang) {
  if (!DICTS[lang]) return;
  currentLang = lang;
  localStorage.setItem(STORAGE_KEY, lang);
  applyDocumentDirection();
  listeners.forEach((fn) => fn(lang));
}

export function applyDocumentDirection() {
  const dict = DICTS[currentLang];
  document.documentElement.lang = currentLang;
  document.documentElement.dir = dict.dir;
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function initI18n() {
  currentLang = detectInitialLang();
  applyDocumentDirection();
}
