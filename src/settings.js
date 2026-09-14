// إعدادات عامة يتحكم بها المسؤول. محفوظة محليًا حاليًا (localStorage)؛
// عند إضافة المزامنة السحابية مستقبلًا (انظر ملاحظات المزامنة في المحادثة)
// ستنتقل هذه القيم لتكون جزءًا من مستند إعدادات مشترك بين كل الأجهزة
// دون الحاجة لتغيير الواجهة التي تستدعي هذه الدوال.
const SHOW_NAMES_KEY = 'sdc_show_names_to_users';

const listeners = new Set();

export function getShowNamesToUsers() {
  return localStorage.getItem(SHOW_NAMES_KEY) === 'true';
}

export function setShowNamesToUsers(value) {
  localStorage.setItem(SHOW_NAMES_KEY, value ? 'true' : 'false');
  listeners.forEach((fn) => fn(value));
}

export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
