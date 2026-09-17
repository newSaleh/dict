// تصدير بيانات الموردين كملف Excel (.xlsx) حقيقي، بدون أي مكتبة خارجية
// حتى يعمل التصدير بدون إنترنت دائمًا. نبني حزمة XLSX (وهي أرشيف ZIP
// يحوي ملفات XML) يدويًا باستخدام طريقة التخزين غير المضغوطة (Stored)
// في ZIP، وهي طريقة صالحة رسميًا وتُغنينا عن كتابة خوارزمية ضغط كاملة.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime() {
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  return { time, date };
}

function writeUint16LE(view, offset, value) {
  view.setUint16(offset, value, true);
}
function writeUint32LE(view, offset, value) {
  view.setUint32(offset, value, true);
}

// يبني أرشيف ZIP بسيط (تخزين بدون ضغط) من قائمة ملفات {name, data(Uint8Array)}.
function buildZip(files) {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = file.data;
    const crc = crc32(data);

    const local = new ArrayBuffer(30 + nameBytes.length);
    const lv = new DataView(local);
    writeUint32LE(lv, 0, 0x04034b50);
    writeUint16LE(lv, 4, 20);
    writeUint16LE(lv, 6, 0);
    writeUint16LE(lv, 8, 0); // بدون ضغط (Stored)
    writeUint16LE(lv, 10, time);
    writeUint16LE(lv, 12, date);
    writeUint32LE(lv, 14, crc);
    writeUint32LE(lv, 18, data.length);
    writeUint32LE(lv, 22, data.length);
    writeUint16LE(lv, 26, nameBytes.length);
    writeUint16LE(lv, 28, 0);
    new Uint8Array(local, 30).set(nameBytes);

    localParts.push(new Uint8Array(local), data);

    const central = new ArrayBuffer(46 + nameBytes.length);
    const cv = new DataView(central);
    writeUint32LE(cv, 0, 0x02014b50);
    writeUint16LE(cv, 4, 20);
    writeUint16LE(cv, 6, 20);
    writeUint16LE(cv, 8, 0);
    writeUint16LE(cv, 10, 0);
    writeUint16LE(cv, 12, time);
    writeUint16LE(cv, 14, date);
    writeUint32LE(cv, 16, crc);
    writeUint32LE(cv, 20, data.length);
    writeUint32LE(cv, 24, data.length);
    writeUint16LE(cv, 28, nameBytes.length);
    writeUint16LE(cv, 30, 0);
    writeUint16LE(cv, 32, 0);
    writeUint16LE(cv, 34, 0);
    writeUint16LE(cv, 36, 0);
    writeUint32LE(cv, 38, 0);
    writeUint32LE(cv, 42, offset);
    new Uint8Array(central, 46).set(nameBytes);

    centralParts.push(new Uint8Array(central));
    offset += local.byteLength + data.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const part of centralParts) centralSize += part.length;

  const end = new ArrayBuffer(22);
  const ev = new DataView(end);
  writeUint32LE(ev, 0, 0x06054b50);
  writeUint16LE(ev, 4, 0);
  writeUint16LE(ev, 6, 0);
  writeUint16LE(ev, 8, files.length);
  writeUint16LE(ev, 10, files.length);
  writeUint32LE(ev, 12, centralSize);
  writeUint32LE(ev, 16, centralStart);
  writeUint16LE(ev, 20, 0);

  return new Blob([...localParts, ...centralParts, new Uint8Array(end)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function xmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });
}

function inlineCell(colLetter, rowIndex, value) {
  return `<c r="${colLetter}${rowIndex}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

const COLUMN_LETTERS = ['A', 'B', 'C', 'D'];

function buildSheetXml(headerRow, rows) {
  const allRows = [headerRow, ...rows];
  const rowsXml = allRows
    .map((row, i) => {
      const rowIndex = i + 1;
      const cells = row.map((value, colIdx) => inlineCell(COLUMN_LETTERS[colIdx], rowIndex, value)).join('');
      return `<row r="${rowIndex}">${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><outlinePr summaryBelow="1" summaryRight="1"/></sheetPr><dimension ref="A1"/><sheetViews><sheetView tabSelected="1" rightToLeft="1" workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols><col min="1" max="4" width="26" customWidth="1"/></cols><sheetData>${rowsXml}</sheetData></worksheet>`;
}

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

function buildWorkbookXml(sheetName) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

const WORKBOOK_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

export function buildXlsxBlob({ sheetName, headerRow, rows }) {
  const encoder = new TextEncoder();
  const files = [
    { name: '[Content_Types].xml', data: encoder.encode(CONTENT_TYPES_XML) },
    { name: '_rels/.rels', data: encoder.encode(ROOT_RELS_XML) },
    { name: 'xl/workbook.xml', data: encoder.encode(buildWorkbookXml(sheetName)) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(WORKBOOK_RELS_XML) },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(buildSheetXml(headerRow, rows)) },
  ];
  return buildZip(files);
}

export function suppliersToExcelBlob(suppliers, { sheetName = 'الموردون' } = {}) {
  const headerRow = ['الكود', 'المدينة', 'اسم المورد', 'العلامات التجارية'];
  const rows = [];
  for (const supplier of suppliers) {
    const brands = (supplier.brands || []).join('، ');
    const codes = supplier.codes && supplier.codes.length ? supplier.codes : [{ code: '', city: '' }];
    for (const c of codes) {
      rows.push([c.code || '', c.city || '', supplier.name || '', brands]);
    }
  }
  return buildXlsxBlob({ sheetName, headerRow, rows });
}
