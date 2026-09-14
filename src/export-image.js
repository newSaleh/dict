// تصدير بيانات الموردين كصور PNG عالية الوضوح وصغيرة الحجم عبر Canvas API
// (بدون أي مكتبة خارجية حتى يعمل التصدير بدون إنترنت دائمًا)
import { t, getLang } from './i18n.js';

const WIDTH = 1080;
const ACCENT = '#000000';
const TEXT_DARK = '#111111';
const TEXT_MUTED = '#6b6b6b';
const BORDER = '#d9d9d9';
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
