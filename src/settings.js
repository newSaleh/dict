// إعدادات عامة يتحكم بها المسؤول. محفوظة محليًا (localStorage) وتُزامَن مع
// السحابة عند توفر الاتصال (انظر cloud.js وsync.js) بحيث تنطبق على الجميع.
const SHOW_NAMES_KEY = 'sdc_show_names_to_users';
const SETTINGS_DIRTY_KEY = 'sdc_settings_dirty';

const listeners = new Set();

export function getShowNamesToUsers() {
  return localStorage.getItem(SHOW_NAMES_KEY) === 'true';
}

export function setShowNamesToUsers(value, { markDirty = true } = {}) {
  localStorage.setItem(SHOW_NAMES_KEY, value ? 'true' : 'false');
  if (markDirty) localStorage.setItem(SETTINGS_DIRTY_KEY, 'true');
  listeners.forEach((fn) => fn(value));
}

export function isSettingsDirty() {
  return localStorage.getItem(SETTINGS_DIRTY_KEY) === 'true';
}

export function markSettingsSynced() {
  localStorage.removeItem(SETTINGS_DIRTY_KEY);
}

// تُستدعى عند سحب الإعدادات من السحابة؛ لا تُعلَّم كـ"تحتاج رفعًا" حتى لا
// ندخل في حلقة رفع/سحب لا فائدة منها لتغيير لم يصدر من هذا الجهاز.
export function applyCloudSettings(cloudSettings) {
  if (!cloudSettings) return;
  if (typeof cloudSettings.showNamesToUsers === 'boolean') {
    setShowNamesToUsers(cloudSettings.showNamesToUsers, { markDirty: false });
  }
}

export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
