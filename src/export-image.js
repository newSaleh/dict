// تصدير بيانات الموردين كصور PNG عالية الوضوح وصغيرة الحجم عبر Canvas API
// (بدون أي مكتبة خارجية حتى يعمل التصدير بدون إنترنت دائمًا)
import { t, getLang } from './i18n.js';

const WIDTH = 1080;
const PADDING = 64;
const ACCENT = '#1d6f5c';
const TEXT_DARK = '#1a1a1a';
const TEXT_MUTED = '#6b6b6b';
const BORDER = '#e2e2e2';
const FONT = 'system-ui, Tahoma, Arial, sans-serif';

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function codesToText(codes) {
  return (codes || []).map((c) => `${c.code}${c.city ? '  —  ' + c.city : ''}`);
}

// ---------------- بطاقة مورد واحد ----------------

export function renderSupplierCardCanvas(supplier, { hideName = false } = {}) {
  const rtl = getLang() !== 'en';
  const align = rtl ? 'right' : 'left';
  const anchorX = rtl ? WIDTH - PADDING : PADDING;

  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');

  let y = PADDING;
  const lineGap = 14;
  const sectionGap = 40;
  const blocks = [];

  mctx.font = `600 30px ${FONT}`;
  blocks.push({ type: 'header', height: 44 });
  y += 44 + sectionGap;

  blocks.push({ type: 'rule' });
  y += 28;

  const codesLabel = t('fieldSupplierCodes');
  mctx.font = `600 24px ${FONT}`;
  blocks.push({ type: 'label', text: codesLabel, height: 32 });
  y += 32 + 10;

  mctx.font = `700 34px ${FONT}`;
  for (const line of codesToText(supplier.codes)) {
    blocks.push({ type: 'code', text: line, height: 42 });
    y += 42 + lineGap;
  }
  y += sectionGap - lineGap;

  if (!hideName) {
    const nameLabel = t('fieldSupplierName');
    mctx.font = `600 24px ${FONT}`;
    blocks.push({ type: 'label', text: nameLabel, height: 32 });
    y += 32 + 10;

    mctx.font = `700 40px ${FONT}`;
    const nameLines = wrapText(mctx, supplier.name || '', WIDTH - PADDING * 2);
    for (const line of nameLines) {
      blocks.push({ type: 'name', text: line, height: 50 });
      y += 50 + 6;
    }
    y += sectionGap - 6;
  }

  const brandsLabel = t('fieldBrands');
  mctx.font = `600 24px ${FONT}`;
  blocks.push({ type: 'label', text: brandsLabel, height: 32 });
  y += 32 + 10;

  mctx.font = `500 30px ${FONT}`;
  for (const brand of supplier.brands || []) {
    blocks.push({ type: 'brand', text: '• ' + brand, height: 40 });
    y += 40 + 6;
  }
  y += PADDING - 6;

  const height = Math.ceil(y);

  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = WIDTH * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, WIDTH - 2, height - 2);

  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.direction = rtl ? 'rtl' : 'ltr';

  let cursorY = PADDING;

  for (const block of blocks) {
    if (block.type === 'header') {
      ctx.font = `600 30px ${FONT}`;
      ctx.fillStyle = ACCENT;
      cursorY += 30;
      ctx.fillText(t('supplierCardHeader'), anchorX, cursorY);
      cursorY += sectionGap;
    } else if (block.type === 'rule') {
      ctx.strokeStyle = BORDER;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(PADDING, cursorY);
      ctx.lineTo(WIDTH - PADDING, cursorY);
      ctx.stroke();
      cursorY += 28;
    } else if (block.type === 'label') {
      ctx.font = `600 24px ${FONT}`;
      ctx.fillStyle = TEXT_MUTED;
      cursorY += 24;
      ctx.fillText(block.text, anchorX, cursorY);
      cursorY += 10;
    } else if (block.type === 'code') {
      ctx.font = `700 34px ${FONT}`;
      ctx.fillStyle = ACCENT;
      cursorY += 30;
      ctx.fillText(block.text, anchorX, cursorY);
      cursorY += 12 + lineGap;
    } else if (block.type === 'name') {
      ctx.font = `700 40px ${FONT}`;
      ctx.fillStyle = TEXT_DARK;
      cursorY += 36;
      ctx.fillText(block.text, anchorX, cursorY);
      cursorY += 14 + 6;
    } else if (block.type === 'brand') {
      ctx.font = `500 30px ${FONT}`;
      ctx.fillStyle = TEXT_DARK;
      cursorY += 26;
      ctx.fillText(block.text, anchorX, cursorY);
      cursorY += 14 + 6;
    }
  }

  return canvas;
}

export function canvasToPngBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

async function shareOrDownloadFiles(files) {
  if (navigator.canShare && navigator.canShare({ files })) {
    try {
      await navigator.share({ files, title: t('appTitle') });
      return;
    } catch {
      // تجاهل الإلغاء والرجوع للتحميل المباشر
    }
  }
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    if (i < files.length - 1) await new Promise((resolve) => setTimeout(resolve, 350));
  }
}

export async function exportSupplierAsImage(supplier, { hideName = false } = {}) {
  const canvas = renderSupplierCardCanvas(supplier, { hideName });
  const blob = await canvasToPngBlob(canvas);
  const fileName = `supplier-${(supplier.codes?.[0]?.code || supplier.id).toString()}.png`;
  await shareOrDownloadFiles([new File([blob], fileName, { type: 'image/png' })]);
}

// ---------------- قائمة كل الموردين (صورة واحدة أو أكثر) ----------------

const LIST_PADDING = 48;
const LIST_MAX_CONTENT_HEIGHT = 1500; // الحد الأقصى لارتفاع محتوى كل صفحة (بدون الترويسة)

function buildSupplierRowLines(mctx, supplier, hideName) {
  const maxWidth = WIDTH - LIST_PADDING * 2;
  const lines = [];

  // كل رقم مورد على سطر مستقل حتى لا يتداخل ترتيب النص عند خلط أرقام لاتينية
  // بمدن عربية على نفس السطر (مشكلة اتجاه نص Bidi عند الدمج)
  mctx.font = `700 26px ${FONT}`;
  for (const codeLine of codesToText(supplier.codes)) {
    lines.push({ type: 'row-codes', text: codeLine, h: 32 });
  }

  if (!hideName) {
    mctx.font = `700 28px ${FONT}`;
    for (const t2 of wrapText(mctx, supplier.name || '', maxWidth)) {
      lines.push({ type: 'row-name', text: t2, h: 34 });
    }
  } else {
    lines.push({ type: 'row-name-hidden', text: t('nameHiddenLabel'), h: 30 });
  }

  mctx.font = `500 22px ${FONT}`;
  const brandsText = (supplier.brands || []).join('،  ');
  for (const t3 of wrapText(mctx, brandsText, maxWidth)) {
    lines.push({ type: 'row-brands', text: t3, h: 28 });
  }

  const gap = 4;
  const blockHeight = lines.reduce((sum, l) => sum + l.h + gap, 0) + 22; // + فاصل سفلي بين الموردين
  return { lines, blockHeight };
}

function paginateSuppliers(mctx, suppliers, hideName) {
  const pages = [];
  let currentPage = [];
  let currentHeight = 0;

  for (const supplier of suppliers) {
    const block = buildSupplierRowLines(mctx, supplier, hideName);
    if (currentPage.length && currentHeight + block.blockHeight > LIST_MAX_CONTENT_HEIGHT) {
      pages.push(currentPage);
      currentPage = [];
      currentHeight = 0;
    }
    currentPage.push({ supplier, ...block });
    currentHeight += block.blockHeight;
  }
  if (currentPage.length) pages.push(currentPage);
  return pages;
}

function renderSuppliersListPageCanvas(pageBlocks, pageIndex, totalPages, totalCount) {
  const rtl = getLang() !== 'en';
  const align = rtl ? 'right' : 'left';
  const anchorX = rtl ? WIDTH - LIST_PADDING : LIST_PADDING;

  const headerHeight = 96;
  const contentHeight = pageBlocks.reduce((sum, b) => sum + b.blockHeight, 0);
  const height = Math.ceil(LIST_PADDING + headerHeight + contentHeight + LIST_PADDING);

  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = WIDTH * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, WIDTH - 2, height - 2);

  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.direction = rtl ? 'rtl' : 'ltr';

  let cursorY = LIST_PADDING;

  ctx.font = `700 32px ${FONT}`;
  ctx.fillStyle = ACCENT;
  cursorY += 32;
  ctx.fillText(t('suppliersListTitle'), anchorX, cursorY);

  ctx.font = `500 20px ${FONT}`;
  ctx.fillStyle = TEXT_MUTED;
  cursorY += 28;
  const subtitle =
    totalPages > 1
      ? `${t('pageOf', { current: pageIndex + 1, total: totalPages })}   ·   ${t('resultsCount', { count: totalCount })}`
      : t('resultsCount', { count: totalCount });
  ctx.fillText(subtitle, anchorX, cursorY);

  cursorY += 20;
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(LIST_PADDING, cursorY);
  ctx.lineTo(WIDTH - LIST_PADDING, cursorY);
  ctx.stroke();
  cursorY += 30;

  for (const block of pageBlocks) {
    for (const line of block.lines) {
      cursorY += line.h - 8;
      if (line.type === 'row-codes') {
        ctx.font = `700 26px ${FONT}`;
        ctx.fillStyle = ACCENT;
      } else if (line.type === 'row-name') {
        ctx.font = `700 28px ${FONT}`;
        ctx.fillStyle = TEXT_DARK;
      } else if (line.type === 'row-name-hidden') {
        ctx.font = `italic 500 24px ${FONT}`;
        ctx.fillStyle = TEXT_MUTED;
      } else if (line.type === 'row-brands') {
        ctx.font = `500 22px ${FONT}`;
        ctx.fillStyle = TEXT_DARK;
      }
      ctx.fillText(line.text, anchorX, cursorY);
      cursorY += 8 + 4;
    }
    cursorY += 14;
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LIST_PADDING, cursorY);
    ctx.lineTo(WIDTH - LIST_PADDING, cursorY);
    ctx.stroke();
    cursorY += 4;
  }

  return canvas;
}

export async function exportSuppliersListAsImages(suppliers, { hideName = false } = {}) {
  if (!suppliers.length) return;
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');
  const pages = paginateSuppliers(mctx, suppliers, hideName);

  const files = [];
  for (let i = 0; i < pages.length; i++) {
    const canvas = renderSuppliersListPageCanvas(pages[i], i, pages.length, suppliers.length);
    const blob = await canvasToPngBlob(canvas);
    const fileName = pages.length > 1 ? `suppliers-list-${i + 1}-of-${pages.length}.png` : 'suppliers-list.png';
    files.push(new File([blob], fileName, { type: 'image/png' }));
  }

  await shareOrDownloadFiles(files);
}
