// طبقة التخزين المحلي (IndexedDB). التطبيق يعمل بالكامل بدون إنترنت:
// كل القراءة والكتابة هنا محلية على الجهاز. حقل syncStatus موجود مسبقًا
// في كل سجل تجهيزًا لإضافة مزامنة بين الأجهزة مستقبلًا دون تغيير البنية.
import { uuid, nowIso } from './utils.js';

const DB_NAME = 'supplier_data_center';
const DB_VERSION = 1;
const STORE_SUPPLIERS = 'suppliers';
const STORE_REQUESTS = 'pendingRequests';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SUPPLIERS)) {
        db.createObjectStore(STORE_SUPPLIERS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_REQUESTS)) {
        const store = db.createObjectStore(STORE_REQUESTS, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDb().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllSuppliers() {
  const store = await tx(STORE_SUPPLIERS, 'readonly');
  return reqToPromise(store.getAll());
}

export async function getSupplier(id) {
  const store = await tx(STORE_SUPPLIERS, 'readonly');
  return reqToPromise(store.get(id));
}

export async function putSupplier(supplier) {
  const store = await tx(STORE_SUPPLIERS, 'readwrite');
  await reqToPromise(store.put(supplier));
  return supplier;
}

export async function deleteSupplier(id) {
  const existing = await getSupplier(id);
  const store = await tx(STORE_SUPPLIERS, 'readwrite');
  await reqToPromise(store.delete(id));
  // إذا كان هذا السجل موجودًا في السحابة، يجب حذفه هناك أيضًا عند المزامنة القادمة
  if (existing?.syncStatus === 'synced') queuePendingCloudDelete(id);
}

export async function createSupplierApproved({ codes, name, brands, actor }) {
  const supplier = {
    id: uuid(),
    codes,
    name,
    brands,
    status: 'active',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdBy: actor || 'admin',
    updatedBy: actor || 'admin',
    syncStatus: 'local',
  };
  await putSupplier(supplier);
  return supplier;
}

export async function updateSupplierApproved(id, patch, actor) {
  const existing = await getSupplier(id);
  if (!existing) throw new Error('Supplier not found');
  const updated = {
    ...existing,
    ...patch,
    updatedAt: nowIso(),
    updatedBy: actor || 'admin',
    syncStatus: 'local',
  };
  await putSupplier(updated);
  return updated;
}

export async function getAllRequests() {
  const store = await tx(STORE_REQUESTS, 'readonly');
  return reqToPromise(store.getAll());
}

export async function getPendingRequests() {
  const all = await getAllRequests();
  return all.filter((r) => r.status === 'pending');
}

export async function putRequest(request) {
  const store = await tx(STORE_REQUESTS, 'readwrite');
  await reqToPromise(store.put(request));
  return request;
}

export async function createRequest({ type, targetSupplierId, proposedData, originalData, actor }) {
  const request = {
    id: uuid(),
    type,
    targetSupplierId: targetSupplierId || null,
    proposedData,
    originalData: originalData || null,
    status: 'pending',
    createdAt: nowIso(),
    createdBy: actor || '',
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: '',
    syncStatus: 'local',
  };
  await putRequest(request);
  return request;
}

export async function reviewRequest(id, { approve, reviewer, note }) {
  const store = await tx(STORE_REQUESTS, 'readwrite');
  const request = await reqToPromise(store.get(id));
  if (!request) throw new Error('Request not found');
  request.status = approve ? 'approved' : 'rejected';
  request.reviewedAt = nowIso();
  request.reviewedBy = reviewer || 'admin';
  request.reviewNote = note || '';
  request.syncStatus = 'local';
  await reqToPromise(store.put(request));

  if (approve) {
    if (request.type === 'add') {
      await createSupplierApproved({
        codes: request.proposedData.codes,
        name: request.proposedData.name,
        brands: request.proposedData.brands,
        actor: reviewer || 'admin',
      });
    } else if (request.type === 'edit' && request.targetSupplierId) {
      await updateSupplierApproved(
        request.targetSupplierId,
        {
          codes: request.proposedData.codes,
          name: request.proposedData.name,
          brands: request.proposedData.brands,
        },
        reviewer || 'admin'
      );
    }
  }
  return request;
}

export async function exportAllData() {
  const [suppliers, requests] = await Promise.all([getAllSuppliers(), getAllRequests()]);
  return { suppliers, requests, exportedAt: nowIso(), version: DB_VERSION };
}

export async function importAllData(data) {
  if (!data || !Array.isArray(data.suppliers)) throw new Error('Invalid data file');
  const supplierStore = await tx(STORE_SUPPLIERS, 'readwrite');
  for (const s of data.suppliers) await reqToPromise(supplierStore.put(s));
  if (Array.isArray(data.requests)) {
    const requestStore = await tx(STORE_REQUESTS, 'readwrite');
    for (const r of data.requests) await reqToPromise(requestStore.put(r));
  }
}

export async function clearAllSuppliersAndRequests() {
  const supplierStore = await tx(STORE_SUPPLIERS, 'readwrite');
  await reqToPromise(supplierStore.clear());
  const requestStore = await tx(STORE_REQUESTS, 'readwrite');
  await reqToPromise(requestStore.clear());
}

export function seedData(actor = 'admin') {
  const base = nowIso();
  const suppliers = [
    {
      id: uuid(),
      codes: [{ code: '0232', city: 'جدة' }, { code: '0781', city: 'الرياض' }],
      name: 'محمد صالح بن بشر',
      brands: ['MSBB', 'Laleena'],
      status: 'active',
      createdAt: base,
      updatedAt: base,
      createdBy: actor,
      updatedBy: actor,
      syncStatus: 'local',
    },
    {
      id: uuid(),
      codes: [{ code: '0001', city: 'جدة' }],
      name: 'شركة الأمانة للتوريدات',
      brands: ['Al Amana'],
      status: 'active',
      createdAt: base,
      updatedAt: base,
      createdBy: actor,
      updatedBy: actor,
      syncStatus: 'local',
    },
    {
      id: uuid(),
      codes: [{ code: '0010', city: 'الدمام' }],
      name: 'مؤسسة النور التجارية',
      brands: ['Al Noor', 'Star Line'],
      status: 'active',
      createdAt: base,
      updatedAt: base,
      createdBy: actor,
      updatedBy: actor,
      syncStatus: 'local',
    },
    {
      id: uuid(),
      codes: [{ code: '0023', city: 'مكة المكرمة' }],
      name: 'عبدالله أحمد الشمري',
      brands: ['Shamri Group'],
      status: 'active',
      createdAt: base,
      updatedAt: base,
      createdBy: actor,
      updatedBy: actor,
      syncStatus: 'local',
    },
    {
      id: uuid(),
      codes: [{ code: '0100', city: 'جدة' }],
      name: 'مصنع الوفاء للبلاستيك',
      brands: ['Al Wafa Plastic'],
      status: 'active',
      createdAt: base,
      updatedAt: base,
      createdBy: actor,
      updatedBy: actor,
      syncStatus: 'local',
    },
    {
      id: uuid(),
      codes: [{ code: '0305', city: 'المدينة المنورة' }],
      name: 'مؤسسة سيف الدين للمواد الغذائية',
      brands: ['Saifco'],
      status: 'active',
      createdAt: base,
      updatedAt: base,
      createdBy: actor,
      updatedBy: actor,
      syncStatus: 'local',
    },
    {
      id: uuid(),
      codes: [{ code: '0850', city: 'الرياض' }],
      name: 'Example Supplier',
      brands: ['Brand A', 'Brand B'],
      status: 'active',
      createdAt: base,
      updatedAt: base,
      createdBy: actor,
      updatedBy: actor,
      syncStatus: 'local',
    },
  ];
  return suppliers;
}

export async function resetToSeed() {
  await clearAllSuppliersAndRequests();
  const store = await tx(STORE_SUPPLIERS, 'readwrite');
  for (const s of seedData()) await reqToPromise(store.put(s));
}

// ---------------- المزامنة السحابية (اختيارية) ----------------
// كل الدوال هنا تتعامل مع IndexedDB المحلي فقط؛ الاتصال الفعلي بالسحابة
// موجود في cloud.js وسينادي هذه الدوال قبل/بعد الرفع والسحب.

export async function getUnsyncedSuppliers() {
  const all = await getAllSuppliers();
  return all.filter((s) => s.syncStatus !== 'synced');
}

export async function markSuppliersSynced(ids) {
  const store = await tx(STORE_SUPPLIERS, 'readwrite');
  for (const id of ids) {
    const supplier = await reqToPromise(store.get(id));
    if (supplier) {
      supplier.syncStatus = 'synced';
      await reqToPromise(store.put(supplier));
    }
  }
}

export async function getUnsyncedRequests() {
  const all = await getAllRequests();
  return all.filter((r) => r.syncStatus !== 'synced');
}

export async function markRequestsSynced(ids) {
  const store = await tx(STORE_REQUESTS, 'readwrite');
  for (const id of ids) {
    const request = await reqToPromise(store.get(id));
    if (request) {
      request.syncStatus = 'synced';
      await reqToPromise(store.put(request));
    }
  }
}

// دمج بيانات الموردين القادمة من السحابة مع المحلية: تحديث/إضافة، وحذف أي
// سجل محلي كان معروفًا أنه متزامن (synced) واختفى الآن من السحابة (يعني أن
// مسؤولًا آخر حذفه من جهاز آخر). السجلات المحلية غير المتزامنة بعد لا تُمس.
export async function mergeCloudSuppliers(cloudSuppliers) {
  const store = await tx(STORE_SUPPLIERS, 'readwrite');
  const local = await reqToPromise(store.getAll());
  const cloudIds = new Set(cloudSuppliers.map((s) => s.id));

  for (const cloudSupplier of cloudSuppliers) {
    const existing = local.find((s) => s.id === cloudSupplier.id);
    const merged = { ...existing, ...cloudSupplier, syncStatus: 'synced' };
    await reqToPromise(store.put(merged));
  }
  for (const localSupplier of local) {
    if (localSupplier.syncStatus === 'synced' && !cloudIds.has(localSupplier.id)) {
      await reqToPromise(store.delete(localSupplier.id));
    }
  }
}

export async function mergeCloudRequests(cloudRequests) {
  const store = await tx(STORE_REQUESTS, 'readwrite');
  for (const cloudRequest of cloudRequests) {
    await reqToPromise(store.put({ ...cloudRequest, syncStatus: 'synced' }));
  }
}

const PENDING_DELETES_KEY = 'sdc_pending_cloud_deletes';

export function queuePendingCloudDelete(id) {
  const list = getPendingCloudDeletes();
  if (!list.includes(id)) {
    list.push(id);
    localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(list));
  }
}

export function getPendingCloudDeletes() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_DELETES_KEY) || '[]');
  } catch {
    return [];
  }
}

export function clearPendingCloudDelete(id) {
  const list = getPendingCloudDeletes().filter((x) => x !== id);
  localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(list));
}
