// بحث شامل (Global Search) في كل حقول المورد: الأرقام، المدن، الاسم، الماركات
import { normalizeText, naturalCompare } from './utils.js';

export function buildHaystack(supplier) {
  const parts = [];
  for (const c of supplier.codes || []) {
    parts.push(c.code);
    if (c.city) parts.push(c.city);
  }
  parts.push(supplier.name);
  for (const b of supplier.brands || []) parts.push(b);
  return normalizeText(parts.join(' '));
}

export function searchSuppliers(suppliers, query) {
  const q = normalizeText(query || '');
  if (!q) {
    return [...suppliers].sort((a, b) => naturalCompare(firstCode(a), firstCode(b)));
  }
  const words = q.split(' ').filter(Boolean);
  const scored = [];
  for (const supplier of suppliers) {
    const haystack = buildHaystack(supplier);
    const matchesAll = words.every((w) => haystack.includes(w));
    if (!matchesAll) continue;
    let score = 0;
    if (haystack.startsWith(q)) score += 100;
    for (const code of supplier.codes || []) {
      const nc = normalizeText(code.code);
      if (nc === q) score += 200;
      else if (nc.startsWith(q)) score += 60;
    }
    const nName = normalizeText(supplier.name);
    if (nName === q) score += 150;
    else if (nName.startsWith(q)) score += 40;
    score += Math.max(0, 20 - (haystack.length - q.length));
    scored.push({ supplier, score });
  }
  scored.sort((a, b) => b.score - a.score || naturalCompare(firstCode(a.supplier), firstCode(b.supplier)));
  return scored.map((s) => s.supplier);
}

function firstCode(supplier) {
  return supplier.codes && supplier.codes[0] ? supplier.codes[0].code : '';
}
