// نظام صلاحيات بسيط. لا توجد كلمة مرور افتراضية مضمَّنة في الكود (لأن الكود
// نفسه علني، وأي قيمة هنا ستكون معروفة لأي شخص يقرأ المستودع أو ملفات
// الموقع). بدل ذلك: أول دخول لأي جهاز يجب أن يتحقق أونلاين من كلمة المرور
// الحقيقية المحفوظة سرًا في Firestore (adminSecret/config، لا تُقرأ من أي
// عميل إطلاقًا)، عبر محاولة إنشاء admins/{uid} بنفس كلمة المرور المُدخلة —
// إن قبلتها قواعد الحماية، يُحفظ hash محليًا على هذا الجهاز فقط، ليعمل الدخول
// بعدها بلا إنترنت من نفس الجهاز.
import { sha256Hex } from './utils.js';

const ROLE_KEY = 'sdc_role';
const PIN_HASH_KEY = 'sdc_admin_pin_hash';
const CLOUD_GRANTED_KEY = 'sdc_cloud_admin_granted';

let currentRole = localStorage.getItem(ROLE_KEY) === 'admin' ? 'admin' : 'user';
const listeners = new Set();

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

// يفيد في تمييز "كلمة مرور خاطئة" عن "هذا الجهاز يحتاج إنترنت للتحقق أول
// مرة" في رسالة الخطأ عند فشل تسجيل الدخول
export function hasLocalPin() {
  return !!localStorage.getItem(PIN_HASH_KEY);
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
  const hash = await sha256Hex(pin || '');
  const stored = localStorage.getItem(PIN_HASH_KEY);
  if (stored) {
    if (hash !== stored) return false;
    setRole('admin');
    return true;
  }

  // لم يسبق لهذا الجهاز الدخول كمسؤول من قبل، فلا يوجد hash محلي بعد للمقارنة
  // به — يجب التحقق أونلاين من كلمة المرور الحقيقية في Firestore أولًا
  try {
    const cloud = await import('./cloud.js');
    const ok = await cloud.grantCloudAdmin(pin);
    if (!ok) return false;
    localStorage.setItem(PIN_HASH_KEY, hash);
    localStorage.setItem(CLOUD_GRANTED_KEY, 'true');
    setRole('admin');
    return true;
  } catch {
    return false; // بلا إنترنت، ولا يمكن التحقق من أول دخول لهذا الجهاز بدونه
  }
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

// تغيير كلمة المرور محليًا وحده لا يكفي لو كانت كلمة المرور الحقيقية في
// Firestore قد تغيّرت أيضًا (تدوير كلمة المرور بعد تسريبها مثلًا): بدون هذه
// المحاولة الفورية، يبقى الجهاز "مسؤولًا محليًا" فقط بلا صلاحية كتابة حقيقية
// في السحابة إلى أن يسجّل خروجًا ثم دخولًا من جديد — وأي تعديل يجريه في هذه
// الأثناء يظهر عنده لكن لا يصل لبقية المستخدمين إطلاقًا بصمت.
export async function changeAdminPin(newPin) {
  const hash = await sha256Hex(newPin);
  localStorage.setItem(PIN_HASH_KEY, hash);
  try {
    const cloud = await import('./cloud.js');
    const ok = await cloud.grantCloudAdmin(newPin);
    if (ok) localStorage.setItem(CLOUD_GRANTED_KEY, 'true');
  } catch {
    // بلا إنترنت الآن — سيُعاد المحاولة لاحقًا عبر ensureCloudAdminGrant
  }
}
