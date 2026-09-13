// نظام صلاحيات بسيط يعمل بالكامل محليًا بدون خادم.
// Admin: يملك كلمة مرور (PIN) مخزّنة كـ hash على هذا الجهاز فقط.
// User: هو الوضع الافتراضي، ولا يحتاج أي تسجيل دخول.
import { sha256Hex } from './utils.js';

const ROLE_KEY = 'sdc_role';
const PIN_HASH_KEY = 'sdc_admin_pin_hash';
const DEFAULT_PIN = '1234';

let currentRole = localStorage.getItem(ROLE_KEY) === 'admin' ? 'admin' : 'user';
const listeners = new Set();

export async function ensurePinInitialized() {
  if (!localStorage.getItem(PIN_HASH_KEY)) {
    const hash = await sha256Hex(DEFAULT_PIN);
    localStorage.setItem(PIN_HASH_KEY, hash);
  }
}

export function getRole() {
  return currentRole;
}

export function isAdmin() {
  return currentRole === 'admin';
}

export function onRoleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setRole(role) {
  currentRole = role;
  localStorage.setItem(ROLE_KEY, role);
  listeners.forEach((fn) => fn(role));
}

export async function loginAsAdmin(pin) {
  await ensurePinInitialized();
  const hash = await sha256Hex(pin || '');
  const stored = localStorage.getItem(PIN_HASH_KEY);
  if (hash === stored) {
    setRole('admin');
    return true;
  }
  return false;
}

export function logout() {
  setRole('user');
}

export async function changeAdminPin(newPin) {
  const hash = await sha256Hex(newPin);
  localStorage.setItem(PIN_HASH_KEY, hash);
}
