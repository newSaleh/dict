// طبقة المزامنة السحابية (Firebase Firestore). اختيارية تمامًا: التطبيق يعمل
// بالكامل محليًا بدونها. هذه الوحدة تُحمَّل عند الحاجة فقط (import ديناميكي من
// app.js) حتى لا يتعطل التطبيق الأساسي إذا تعذّر تحميل مكتبة Firebase (لا
// إنترنت مثلًا عند أول زيارة قبل أن يخزّنها Service Worker).
//
// المبدأ: البيانات المحلية (IndexedDB عبر db.js) هي المصدر الذي تُبنى منه
// الواجهة دائمًا. هذه الوحدة فقط "تسحب" آخر نسخة من السحابة و"ترفع" ما تغيّر
// محليًا، عند الطلب (زر تحديث) وليس تلقائيًا باستمرار.
import { firebaseConfig } from './firebase-config.js';

const SDK_VERSION = '12.19.0';
const BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

// Firestore يرفض كتابة أي قيمة undefined في أي مستوى من المستند (مثلًا اسم
// مورد غير معروف محليًا لدى مستخدم عادي)، فنحذفها قبل الإرسال بدل أن يفشل
// الرفع بالكامل بصمت.
function stripUndefinedDeep(value) {
  return JSON.parse(JSON.stringify(value === undefined ? null : value));
}

let appPromise = null;
let dbInstance = null;
let authInstance = null;
let sdk = null; // مراجع لدوال Firestore/Auth المستوردة

async function ensureInit() {
  if (appPromise) return appPromise;
  appPromise = (async () => {
    const [{ initializeApp }, authMod, firestoreMod] = await Promise.all([
      import(/* @vite-ignore */ `${BASE}/firebase-app.js`),
      import(/* @vite-ignore */ `${BASE}/firebase-auth.js`),
      import(/* @vite-ignore */ `${BASE}/firebase-firestore.js`),
    ]);
    sdk = { ...authMod, ...firestoreMod };
    const app = initializeApp(firebaseConfig);
    authInstance = sdk.getAuth(app);
    dbInstance = sdk.getFirestore(app);

    // للتطوير المحلي فقط: يتصل بمحاكي Firebase بدل المشروع الحقيقي، ولا يعمل
    // إطلاقًا إلا على localhost صراحة مع باراميتر ?useEmulator=1 في الرابط.
    const isLocalDev = ['localhost', '127.0.0.1'].includes(location.hostname);
    if (isLocalDev && new URLSearchParams(location.search).get('useEmulator') === '1') {
      sdk.connectAuthEmulator(authInstance, 'http://127.0.0.1:9099', { disableWarnings: true });
      sdk.connectFirestoreEmulator(dbInstance, '127.0.0.1', 8080);
    }

    if (!authInstance.currentUser) {
      await sdk.signInAnonymously(authInstance);
    } else {
      await new Promise((resolve) => {
        const unsub = sdk.onAuthStateChanged(authInstance, (user) => {
          if (user) {
            unsub();
            resolve();
          }
        });
      });
    }
    return true;
  })();
  return appPromise;
}

function uid() {
  return authInstance?.currentUser?.uid || null;
}

export async function isCloudAdmin() {
  await ensureInit();
  const theUid = uid();
  if (!theUid) return false;
  const snap = await sdk.getDoc(sdk.doc(dbInstance, 'admins', theUid));
  return snap.exists();
}

export async function grantCloudAdmin(pin) {
  await ensureInit();
  const theUid = uid();
  try {
    await sdk.setDoc(sdk.doc(dbInstance, 'admins', theUid), {
      pin,
      grantedAt: new Date().toISOString(),
    });
    return true;
  } catch {
    return false; // كلمة مرور خاطئة أو عدم اتصال
  }
}

export async function revokeCloudAdmin() {
  await ensureInit();
  const theUid = uid();
  if (!theUid) return;
  try {
    await sdk.deleteDoc(sdk.doc(dbInstance, 'admins', theUid));
  } catch {
    // تجاهل: قد يكون بلا اتصال، سيبقى المستند وسيُحذف لاحقًا لا بأس بذلك
  }
}

export async function pullFromCloud({ wantNames }) {
  await ensureInit();
  const suppliersSnap = await sdk.getDocs(sdk.collection(dbInstance, 'suppliers'));
  const suppliers = [];
  suppliersSnap.forEach((d) => suppliers.push({ id: d.id, ...d.data() }));

  if (wantNames) {
    try {
      const namesSnap = await sdk.getDocs(sdk.collection(dbInstance, 'supplierNames'));
      const namesById = new Map();
      namesSnap.forEach((d) => namesById.set(d.id, d.data().name));
      for (const s of suppliers) {
        if (namesById.has(s.id)) s.name = namesById.get(s.id);
      }
    } catch {
      // لا صلاحية لرؤية الأسماء حاليًا — البيانات الأخرى تبقى صالحة
    }
  }

  let settings = null;
  try {
    const settingsSnap = await sdk.getDoc(sdk.doc(dbInstance, 'settings', 'global'));
    if (settingsSnap.exists()) settings = settingsSnap.data();
  } catch {
    // تجاهل
  }

  let pendingRequests = null;
  try {
    const reqSnap = await sdk.getDocs(sdk.collection(dbInstance, 'pendingRequests'));
    pendingRequests = [];
    reqSnap.forEach((d) => pendingRequests.push({ id: d.id, ...d.data() }));
  } catch {
    // ليس مسؤولًا، لا صلاحية لقراءة الطلبات
  }

  return { suppliers, settings, pendingRequests };
}

// id وsyncStatus خاصتان بالتخزين المحلي فقط (id مكرر لأنه أصلًا معرّف
// المستند، وsyncStatus لا معنى له في السحابة نفسها) فلا داعي لرفعهما
function splitSupplierForCloud(supplier) {
  const { name, id, syncStatus, ...rest } = supplier;
  return { withoutName: rest, name };
}

export async function pushSuppliers(suppliers) {
  await ensureInit();
  const batch = sdk.writeBatch(dbInstance);
  for (const supplier of suppliers) {
    const { withoutName, name } = splitSupplierForCloud(supplier);
    batch.set(sdk.doc(dbInstance, 'suppliers', supplier.id), stripUndefinedDeep(withoutName));
    batch.set(sdk.doc(dbInstance, 'supplierNames', supplier.id), stripUndefinedDeep({ name }));
  }
  await batch.commit();
}

export async function deleteSupplierFromCloud(id) {
  await ensureInit();
  const batch = sdk.writeBatch(dbInstance);
  batch.delete(sdk.doc(dbInstance, 'suppliers', id));
  batch.delete(sdk.doc(dbInstance, 'supplierNames', id));
  await batch.commit();
}

export async function pushRequests(requests) {
  await ensureInit();
  const batch = sdk.writeBatch(dbInstance);
  for (const request of requests) {
    const { id, syncStatus, ...rest } = request;
    batch.set(sdk.doc(dbInstance, 'pendingRequests', id), stripUndefinedDeep(rest));
  }
  await batch.commit();
}

export async function pushSettings(settings) {
  await ensureInit();
  await sdk.setDoc(sdk.doc(dbInstance, 'settings', 'global'), settings);
}
