export interface VacationExcelRow {
  nombre: string;
  correo: string;
  fecha: string;
}

export const MONTH_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: 'Enero' },
  { value: 2, label: 'Febrero' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Mayo' },
  { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },
  { value: 12, label: 'Diciembre' },
];

export function getPreviousMonthAndYear(referenceDate: Date = new Date()): {
  month: number;
  year: number;
} {
  const prev = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
  return {
    month: prev.getMonth() + 1,
    year: prev.getFullYear(),
  };
}

export function getMonthLabel(month: number): string {
  return MONTH_OPTIONS.find((item) => item.value === month)?.label ?? String(month);
}

function escapeXml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildWorksheetXml(rows: VacationExcelRow[]): string {
  const headerCells = [
    `<c r="A1" t="inlineStr" s="1"><is><t>Nombre</t></is></c>`,
    `<c r="B1" t="inlineStr" s="1"><is><t>Correo</t></is></c>`,
    `<c r="C1" t="inlineStr" s="1"><is><t>Día de vacaciones</t></is></c>`,
  ].join('');

  const xmlRows: string[] = [`<row r="1" ht="22" customHeight="1">${headerCells}</row>`];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const cells = [
      `<c r="A${rowNumber}" t="inlineStr" s="2"><is><t>${escapeXml(row.nombre)}</t></is></c>`,
      `<c r="B${rowNumber}" t="inlineStr" s="2"><is><t>${escapeXml(row.correo)}</t></is></c>`,
      `<c r="C${rowNumber}" t="inlineStr" s="3"><is><t>${escapeXml(row.fecha)}</t></is></c>`,
    ].join('');
    xmlRows.push(`<row r="${rowNumber}" ht="19" customHeight="1">${cells}</row>`);
  });

  const lastRow = Math.max(1, rows.length + 1);

  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`,
    `<dimension ref="A1:C${lastRow}"/>`,
    `<sheetViews><sheetView tabSelected="1" workbookViewId="0"/></sheetViews>`,
    `<sheetFormatPr defaultRowHeight="18"/>`,
    `<cols>`,
    `<col min="1" max="1" width="32" customWidth="1"/>`,
    `<col min="2" max="2" width="36" customWidth="1"/>`,
    `<col min="3" max="3" width="20" customWidth="1"/>`,
    `</cols>`,
    `<sheetData>${xmlRows.join('')}</sheetData>`,
    `</worksheet>`,
  ].join('');
}

function buildStylesXml(): string {
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`,
    `<fonts count="2">`,
    `<font><sz val="11"/><color rgb="FF08202C"/><name val="Calibri"/></font>`,
    `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>`,
    `</fonts>`,
    `<fills count="3">`,
    `<fill><patternFill patternType="none"/></fill>`,
    `<fill><patternFill patternType="gray125"/></fill>`,
    `<fill><patternFill patternType="solid"><fgColor rgb="FF0E3345"/><bgColor indexed="64"/></patternFill></fill>`,
    `</fills>`,
    `<borders count="2">`,
    `<border><left/><right/><top/><bottom/><diagonal/></border>`,
    `<border>`,
    `<left style="thin"><color rgb="FFCFCEC4"/></left>`,
    `<right style="thin"><color rgb="FFCFCEC4"/></right>`,
    `<top style="thin"><color rgb="FFCFCEC4"/></top>`,
    `<bottom style="thin"><color rgb="FFCFCEC4"/></bottom>`,
    `<diagonal/>`,
    `</border>`,
    `</borders>`,
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`,
    `<cellXfs count="4">`,
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`,
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>`,
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>`,
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`,
    `</cellXfs>`,
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>`,
    `</styleSheet>`,
  ].join('');
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZipArchive(files: ReadonlyArray<{ path: string; content: string }>): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  // Fixed valid DOS date/time (2026-01-01 00:00:00)
  const dosTime = 0x0000;
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const dataBytes = encoder.encode(file.content);
    const crc = crc32(dataBytes);
    const size = dataBytes.byteLength;

    const localHeader = new Uint8Array(30 + nameBytes.byteLength);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, size, true);
    localView.setUint32(22, size, true);
    localView.setUint16(26, nameBytes.byteLength, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.byteLength);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, size, true);
    centralView.setUint32(24, size, true);
    centralView.setUint16(28, nameBytes.byteLength, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.byteLength + size;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.byteLength, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  const totalSize = offset + centralSize + endRecord.byteLength;
  const output = new Uint8Array(totalSize);
  let cursor = 0;

  for (const part of localParts) {
    output.set(part, cursor);
    cursor += part.byteLength;
  }
  for (const part of centralParts) {
    output.set(part, cursor);
    cursor += part.byteLength;
  }
  output.set(endRecord, cursor);

  return output;
}

export function generateVacationsXlsxBytes(
  rows: VacationExcelRow[],
  sheetName = 'Vacaciones'
): Uint8Array {
  const safeSheetName = escapeXml(sheetName.slice(0, 31) || 'Vacaciones');

  const files = [
    {
      path: '[Content_Types].xml',
      content: [
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`,
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`,
        `<Default Extension="xml" ContentType="application/xml"/>`,
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`,
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`,
        `</Types>`,
      ].join(''),
    },
    {
      path: '_rels/.rels',
      content: [
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`,
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`,
        `</Relationships>`,
      ].join(''),
    },
    {
      path: 'xl/workbook.xml',
      content: [
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`,
        `<sheets><sheet name="${safeSheetName}" sheetId="1" r:id="rId1"/></sheets>`,
        `</workbook>`,
      ].join(''),
    },
    {
      path: 'xl/_rels/workbook.xml.rels',
      content: [
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`,
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>`,
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
        `</Relationships>`,
      ].join(''),
    },
    {
      path: 'xl/styles.xml',
      content: buildStylesXml(),
    },
    {
      path: 'xl/worksheets/sheet1.xml',
      content: buildWorksheetXml(rows),
    },
  ];

  return createZipArchive(files);
}

export function downloadVacationsExcel(
  rows: VacationExcelRow[],
  month: number,
  year: number
): void {
  const monthLabel = getMonthLabel(month);
  const sheetTitle = `Vacaciones ${monthLabel} ${year}`;
  const xlsxBytes = generateVacationsXlsxBytes(rows, sheetTitle);

  const blob = new Blob([xlsxBytes.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const normalizedMonth = monthLabel
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const fileName = `vacaciones_${normalizedMonth}_${year}.xlsx`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
