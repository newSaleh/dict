// كشف التكرار المحتمل عند إضافة أو تعديل مورد
import { normalizeText, similarityRatio } from './utils.js';

const NAME_SIMILARITY_THRESHOLD = 0.82;

export function findDuplicates(existingSuppliers, { codes, name }, excludeId) {
  const codeConflicts = [];
  const seenSupplierIds = new Set();
  for (const c of codes || []) {
    const normalizedCode = (c.code || '').trim();
    if (!normalizedCode) continue;
    for (const supplier of existingSuppliers) {
      if (supplier.id === excludeId) continue;
      const hasCode = (supplier.codes || []).some((sc) => sc.code.trim() === normalizedCode);
      if (hasCode) {
        codeConflicts.push({ code: normalizedCode, supplier });
      }
    }
  }

  const nameConflicts = [];
  const nName = normalizeText(name);
  for (const supplier of existingSuppliers) {
    if (supplier.id === excludeId) continue;
    if (seenSupplierIds.has(supplier.id)) continue;
    const ratio = similarityRatio(nName, normalizeText(supplier.name));
    if (ratio >= NAME_SIMILARITY_THRESHOLD) {
      nameConflicts.push({ supplier, ratio });
      seenSupplierIds.add(supplier.id);
    }
  }

  return { codeConflicts, nameConflicts };
}
