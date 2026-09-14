// كشف التكرار المحتمل عند إضافة أو تعديل مورد، أو عند استيراد بيانات جماعية
import { normalizeText, similarityRatio } from './utils.js';

const NAME_SIMILARITY_THRESHOLD = 0.82;

export function findDuplicates(existingSuppliers, { codes, name, brands }, excludeId) {
  const codeConflicts = [];
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

  // مقارنة الاسم تُتجاهل إن كان فارغًا (مثلًا أثناء استيراد جماعي لم تُدخَل
  // أسماء الموردين فيه بعد) حتى لا تُعامَل كل السجلات الفارغة كتكرار لبعضها
  const nameConflicts = [];
  const nName = normalizeText(name);
  if (nName) {
    const seenSupplierIds = new Set();
    for (const supplier of existingSuppliers) {
      if (supplier.id === excludeId) continue;
      if (seenSupplierIds.has(supplier.id)) continue;
      const ratio = similarityRatio(nName, normalizeText(supplier.name));
      if (ratio >= NAME_SIMILARITY_THRESHOLD) {
        nameConflicts.push({ supplier, ratio });
        seenSupplierIds.add(supplier.id);
      }
    }
  }

  const brandConflicts = [];
  for (const brand of brands || []) {
    const nBrand = normalizeText(brand);
    if (!nBrand) continue;
    for (const supplier of existingSuppliers) {
      if (supplier.id === excludeId) continue;
      const hasBrand = (supplier.brands || []).some((b) => normalizeText(b) === nBrand);
      if (hasBrand) {
        brandConflicts.push({ brand, supplier });
      }
    }
  }

  return { codeConflicts, nameConflicts, brandConflicts };
}
