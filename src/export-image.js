// تصدير بطاقة المورد كصورة PNG عالية الوضوح وصغيرة الحجم عبر Canvas API
// (بدون أي مكتبة خارجية حتى يعمل التصدير بدون إنترنت دائمًا)
import { t, getLang } from './i18n.js';

const WIDTH = 1080;
const PADDING = 64;
const ACCENT = '#1d6f5c';
const TEXT_DARK = '#1a1a1a';
const TEXT_MUTED = '#6b6b6b';
const BORDER = '#e2e2e2';

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

export function renderSupplierCardCanvas(supplier) {
  const rtl = getLang() !== 'en';
  const align = rtl ? 'right' : 'left';
  const anchorX = rtl ? WIDTH - PADDING : PADDING;

  // قياس الارتفاع أولًا عبر تمرير رسم تجريبي بدون رسم فعلي (canvas مؤقت لقياس النص)
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d');

  let y = PADDING;
  const lineGap = 14;
  const sectionGap = 40;
  const blocks = [];

  // العنوان
  mctx.font = '600 30px system-ui, Tahoma, Arial, sans-serif';
  blocks.push({ type: 'header', height: 44 });
  y += 44 + sectionGap;

  // خط فاصل
  blocks.push({ type: 'rule' });
  y += 28;

  const codesLabel = t('fieldSupplierCodes');
  mctx.font = '600 24px system-ui, Tahoma, Arial, sans-serif';
  blocks.push({ type: 'label', text: codesLabel, height: 32 });
  y += 32 + 10;

  mctx.font = '700 34px system-ui, Tahoma, Arial, sans-serif';
  const codeLines = (supplier.codes || []).map(
    (c) => `${c.code}${c.city ? '  —  ' + c.city : ''}`
  );
  for (const line of codeLines) {
    blocks.push({ type: 'code', text: line, height: 42 });
    y += 42 + lineGap;
  }
  y += sectionGap - lineGap;

  const nameLabel = t('fieldSupplierName');
  mctx.font = '600 24px system-ui, Tahoma, Arial, sans-serif';
  blocks.push({ type: 'label', text: nameLabel, height: 32 });
  y += 32 + 10;

  mctx.font = '700 40px system-ui, Tahoma, Arial, sans-serif';
  const nameLines = wrapText(mctx, supplier.name || '', WIDTH - PADDING * 2);
  for (const line of nameLines) {
    blocks.push({ type: 'name', text: line, height: 50 });
    y += 50 + 6;
  }
  y += sectionGap - 6;

  const brandsLabel = t('fieldBrands');
  mctx.font = '600 24px system-ui, Tahoma, Arial, sans-serif';
  blocks.push({ type: 'label', text: brandsLabel, height: 32 });
  y += 32 + 10;

  mctx.font = '500 30px system-ui, Tahoma, Arial, sans-serif';
  for (const brand of supplier.brands || []) {
    blocks.push({ type: 'brand', text: '• ' + brand, height: 40 });
    y += 40 + 6;
  }
  y += PADDING - 6;

  const height = Math.ceil(y);

  const canvas = document.createElement('canvas');
  const scale = 2; // دقة أعلى (Retina) مع بقاء الحجم النهائي صغيرًا لأن الرسم مسطح بدون صور
  canvas.width = WIDTH * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  // خلفية بيضاء نظيفة
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
      ctx.font = '600 30px system-ui, Tahoma, Arial, sans-serif';
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
      ctx.font = '600 24px system-ui, Tahoma, Arial, sans-serif';
      ctx.fillStyle = TEXT_MUTED;
      cursorY += 24;
      ctx.fillText(block.text, anchorX, cursorY);
      cursorY += 10;
    } else if (block.type === 'code') {
      ctx.font = '700 34px system-ui, Tahoma, Arial, sans-serif';
      ctx.fillStyle = ACCENT;
      cursorY += 30;
      ctx.fillText(block.text, anchorX, cursorY);
      cursorY += 12 + lineGap;
    } else if (block.type === 'name') {
      ctx.font = '700 40px system-ui, Tahoma, Arial, sans-serif';
      ctx.fillStyle = TEXT_DARK;
      cursorY += 36;
      ctx.fillText(block.text, anchorX, cursorY);
      cursorY += 14 + 6;
    } else if (block.type === 'brand') {
      ctx.font = '500 30px system-ui, Tahoma, Arial, sans-serif';
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

export async function exportSupplierAsImage(supplier) {
  const canvas = renderSupplierCardCanvas(supplier);
  const blob = await canvasToPngBlob(canvas);
  const fileName = `supplier-${(supplier.codes?.[0]?.code || supplier.id).toString()}.png`;
  const file = new File([blob], fileName, { type: 'image/png' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: t('appTitle') });
      return;
    } catch {
      // تجاهل الإلغاء والرجوع للتحميل المباشر
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
