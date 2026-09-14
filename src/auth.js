// نظام صلاحيات بسيط. الدخول كمسؤول يعمل محليًا فورًا وبدون إنترنت (hash
// مخزّن على الجهاز)، حتى لا يعتمد شيء أساسي في التطبيق على وجود اتصال.
// بالتوازي، وإذا توفر إنترنت، يحاول التطبيق إثبات نفس كلمة المرور للسحابة
// (Firestore) عبر cloud.js حتى تُمنح هذه الجلسة صلاحيات القراءة/الكتابة
// المشتركة هناك أيضًا — دون أن يمنع ذلك تسجيل الدخول المحلي إن تعذّر.
import { sha256Hex } from './utils.js';

const ROLE_KEY = 'sdc_role';
const PIN_HASH_KEY = 'sdc_admin_pin_hash';
const CLOUD_GRANTED_KEY = 'sdc_cloud_admin_granted';
const DEFAULT_PIN = '1510';

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

export function hasCloudAdminGrant() {
  return localStorage.getItem(CLOUD_GRANTED_KEY) === 'true';
}

// تُستدعى بعد نجاح الدخول المحلي، وأيضًا يمكن إعادة محاولتها لاحقًا (مثلًا
// عند الضغط على "تحديث البيانات") إن كان الجهاز أدمن محليًا لكن لم يثبت ذلك
// للسحابة بعد (كان بلا إنترنت وقت الدخول).
export async function ensureCloudAdminGrant(pin) {
  if (!isAdmin() || hasCloudAdminGrant()) return;
  try {
    const cloud = await import('./cloud.js');
    const ok = await cloud.grantCloudAdmin(pin);
    if (ok) localStorage.setItem(CLOUD_GRANTED_KEY, 'true');
  } catch {
    // لا إنترنت أو تعذّر تحميل مكتبة السحابة — لا بأس، سيُعاد المحاولة لاحقًا
  }
}

export async function loginAsAdmin(pin) {
  await ensurePinInitialized();
  const hash = await sha256Hex(pin || '');
  const stored = localStorage.getItem(PIN_HASH_KEY);
  if (hash !== stored) return false;
  setRole('admin');
  return true;
}

export async function logout() {
  setRole('user');
  localStorage.removeItem(CLOUD_GRANTED_KEY);
  try {
    const cloud = await import('./cloud.js');
    await cloud.revokeCloudAdmin();
  } catch {
    // لا بأس، الجلسة المحلية خرجت على أي حال
  }
}

export async function changeAdminPin(newPin) {
  const hash = await sha256Hex(newPin);
  localStorage.setItem(PIN_HASH_KEY, hash);
}
