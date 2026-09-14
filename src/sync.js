// المنسّق بين التخزين المحلي (db.js) والسحابة (cloud.js). هذا هو ما يستدعيه
// زر "تحديث البيانات" في الواجهة. كل خطوة مستقلة عن الأخرى بأخطائها حتى لا
// يمنع فشل خطوة واحدة (مثلًا محاولة رفع بلا صلاحية) بقية خطوات المزامنة.
import * as db from './db.js';
import * as cloud from './cloud.js';
import { getShowNamesToUsers, isSettingsDirty, markSettingsSynced, applyCloudSettings } from './settings.js';
import { isAdmin } from './auth.js';

export async function syncNow() {
  const result = {
    pushedSuppliers: 0,
    pushedRequests: 0,
    pulledSuppliers: 0,
    pulledRequests: 0,
    deletedRemote: 0,
    errors: [],
  };

  const pendingDeletes = db.getPendingCloudDeletes();
  for (const id of pendingDeletes) {
    try {
      await cloud.deleteSupplierFromCloud(id);
      db.clearPendingCloudDelete(id);
      result.deletedRemote += 1;
    } catch (err) {
      result.errors.push(err);
    }
  }

  try {
    const unsyncedSuppliers = await db.getUnsyncedSuppliers();
    if (unsyncedSuppliers.length) {
      await cloud.pushSuppliers(unsyncedSuppliers);
      await db.markSuppliersSynced(unsyncedSuppliers.map((s) => s.id));
      result.pushedSuppliers = unsyncedSuppliers.length;
    }
  } catch (err) {
    result.errors.push(err);
  }

  try {
    const unsyncedRequests = await db.getUnsyncedRequests();
    if (unsyncedRequests.length) {
      await cloud.pushRequests(unsyncedRequests);
      await db.markRequestsSynced(unsyncedRequests.map((r) => r.id));
      result.pushedRequests = unsyncedRequests.length;
    }
  } catch (err) {
    result.errors.push(err);
  }

  try {
    if (isAdmin() && isSettingsDirty()) {
      await cloud.pushSettings({ showNamesToUsers: getShowNamesToUsers() });
      markSettingsSynced();
    }
  } catch (err) {
    result.errors.push(err);
  }

  try {
    const wantNames = isAdmin() || getShowNamesToUsers();
    const pulled = await cloud.pullFromCloud({ wantNames });
    await db.mergeCloudSuppliers(pulled.suppliers);
    result.pulledSuppliers = pulled.suppliers.length;
    if (pulled.settings) applyCloudSettings(pulled.settings);
    if (pulled.pendingRequests) {
      await db.mergeCloudRequests(pulled.pendingRequests);
      result.pulledRequests = pulled.pendingRequests.length;
    }
  } catch (err) {
    result.errors.push(err);
  }

  return result;
}
