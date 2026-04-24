import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

import type { ChangeEstimateReportHeader, GeneratedReportBundle } from '../client/src/lib/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 32;
const MARGIN_TOP = 36;
const MARGIN_BOTTOM = 34;
const FONT_SIZE = 9;
const HEADER_FONT_SIZE = 18;
const LINE_HEIGHT = 13;

const COLUMN_WIDTHS = {
  zone: 58,
  item: 88,
  quantity: 56,
  baseAmount: 64,
  addAmount: 64,
  totalAmount: 64,
  evidence: 165,
};

async function loadJapaneseFont(): Promise<Uint8Array> {
  const candidates = [
    path.resolve(process.cwd(), 'server/assets/fonts/NotoSansCJKjp-Regular.otf'),
    path.resolve(process.cwd(), 'server-assets/fonts/NotoSansCJKjp-Regular.otf'),
    path.resolve(__dirname, '../server/assets/fonts/NotoSansCJKjp-Regular.otf'),
    path.resolve(__dirname, '../server-assets/fonts/NotoSansCJKjp-Regular.otf'),
  ];

  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate);
    } catch {
      // continue
    }
  }

  throw new Error('日本語PDFフォントが見つかりません。');
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const source = text.trim();
  if (!source) return [''];

  const lines: string[] = [];
  let current = '';

  for (const char of source) {
    if (char === '\n') {
      lines.push(current || '');
      current = '';
      continue;
    }

    const next = `${current}${char}`;
    if (font.widthOfTextAtSize(next, fontSize) > maxWidth && current) {
      lines.push(current);
      current = char;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [''];
}

function drawWrappedText(page: PDFPage, text: string, x: number, yTop: number, width: number, font: PDFFont, fontSize: number, color = rgb(0.15, 0.23, 0.33)) {
  const lines = wrapText(text, font, fontSize, width);
  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: yTop - fontSize - (index * LINE_HEIGHT),
      font,
      size: fontSize,
      color,
    });
  });
  return lines.length;
}

function drawCellBorder(page: PDFPage, x: number, yTop: number, width: number, height: number, fillColor?: ReturnType<typeof rgb>) {
  if (fillColor) {
    page.drawRectangle({
      x,
      y: yTop - height,
      width,
      height,
      color: fillColor,
      borderColor: rgb(0.78, 0.84, 0.9),
      borderWidth: 0.6,
    });
    return;
  }

  page.drawRectangle({
    x,
    y: yTop - height,
    width,
    height,
    borderColor: rgb(0.82, 0.86, 0.91),
    borderWidth: 0.6,
  });
}

function formatCurrency(value: number): string {
  return `¥${value.toLocaleString('ja-JP')}`;
}

function formatPages(pageRefs: number[]): string {
  return pageRefs.length > 0 ? pageRefs.map((pageNo) => `p.${pageNo}`).join(', ') : '未設定';
}

function buildEvidenceText(row: GeneratedReportBundle['changeEstimateRows'][number]): string {
  const parts = [
    `図面: ${formatPages(row.drawingPageRefs)}`,
    `他工種: ${row.relatedTradeNames.length > 0 ? row.relatedTradeNames.join(', ') : '未設定'}`,
    `備考写真: ${row.notePhotoUrls.length > 0 ? `${row.notePhotoUrls.length}枚` : '未登録'}`,
    row.remarks,
  ].filter(Boolean);
  return parts.join('\n');
}

function drawTableHeader(page: PDFPage, yTop: number, font: PDFFont): number {
  const entries: Array<[string, number]> = [
    ['区画', COLUMN_WIDTHS.zone],
    ['工事項目', COLUMN_WIDTHS.item],
    ['数量', COLUMN_WIDTHS.quantity],
    ['基本額', COLUMN_WIDTHS.baseAmount],
    ['追加額', COLUMN_WIDTHS.addAmount],
    ['区画金額', COLUMN_WIDTHS.totalAmount],
    ['根拠情報', COLUMN_WIDTHS.evidence],
  ];

  let x = MARGIN_X;
  const headerHeight = 24;
  for (const [label, width] of entries) {
    drawCellBorder(page, x, yTop, width, headerHeight, rgb(0.88, 0.96, 0.99));
    page.drawText(label, {
      x: x + 4,
      y: yTop - 16,
      font,
      size: 9,
      color: rgb(0.17, 0.24, 0.39),
    });
    x += width;
  }

  return yTop - headerHeight;
}

function rowHeight(row: GeneratedReportBundle['changeEstimateRows'][number], font: PDFFont): number {
  const zoneLines = wrapText(`${row.zoneName}\n配賦率 ${row.quantityShare.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}%`, font, FONT_SIZE, COLUMN_WIDTHS.zone - 8).length;
  const itemLines = wrapText(`${row.itemName}\n${row.specification}`, font, FONT_SIZE, COLUMN_WIDTHS.item - 8).length;
  const evidenceLines = wrapText(buildEvidenceText(row), font, FONT_SIZE, COLUMN_WIDTHS.evidence - 8).length;
  const maxLines = Math.max(zoneLines, itemLines, evidenceLines, 1);
  return Math.max(38, (maxLines * LINE_HEIGHT) + 12);
}

function drawRow(page: PDFPage, yTop: number, row: GeneratedReportBundle['changeEstimateRows'][number], font: PDFFont): number {
  const height = rowHeight(row, font);
  const values = [
    `${row.zoneName}\n配賦率 ${row.quantityShare.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}%`,
    `${row.itemName}\n${row.specification}`,
    `${row.quantity.toLocaleString('ja-JP', { maximumFractionDigits: 2 })} ${row.unit}`,
    formatCurrency(row.baseAmount),
    formatCurrency(row.remobilizationAmount + row.temporaryRestorationAmount + row.coordinationAdjustmentAmount),
    formatCurrency(row.totalAmount),
    buildEvidenceText(row),
  ];

  const widths = [
    COLUMN_WIDTHS.zone,
    COLUMN_WIDTHS.item,
    COLUMN_WIDTHS.quantity,
    COLUMN_WIDTHS.baseAmount,
    COLUMN_WIDTHS.addAmount,
    COLUMN_WIDTHS.totalAmount,
    COLUMN_WIDTHS.evidence,
  ];

  let x = MARGIN_X;
  values.forEach((value, index) => {
    drawCellBorder(page, x, yTop, widths[index], height);
    const alignRight = index >= 2 && index <= 5;
    if (alignRight) {
      page.drawText(value, {
        x: x + widths[index] - font.widthOfTextAtSize(value, FONT_SIZE) - 4,
        y: yTop - 16,
        font,
        size: FONT_SIZE,
        color: rgb(0.15, 0.23, 0.33),
      });
    } else {
      drawWrappedText(page, value, x + 4, yTop - 2, widths[index] - 8, font, FONT_SIZE);
    }
    x += widths[index];
  });

  return yTop - height;
}

function drawPageHeader(page: PDFPage, font: PDFFont, header: ChangeEstimateReportHeader, estimateName: string, rows: GeneratedReportBundle['changeEstimateRows'], totalAmount: number, pageNumber: number) {
  page.drawText('変更見積書', {
    x: MARGIN_X,
    y: PAGE_HEIGHT - MARGIN_TOP,
    font,
    size: HEADER_FONT_SIZE,
    color: rgb(0.1, 0.18, 0.34),
  });

  const metaLines = [
    `発行日: ${header.issueDate}`,
    `宛名: ${header.recipientName}`,
    `工事名: ${header.constructionName}`,
    `見積名: ${estimateName}`,
    `変更理由: ${header.changeReason}`,
  ];
  metaLines.forEach((line, index) => {
    page.drawText(line, {
      x: MARGIN_X,
      y: PAGE_HEIGHT - MARGIN_TOP - 28 - (index * 14),
      font,
      size: 10,
      color: rgb(0.22, 0.29, 0.39),
    });
  });

  const summaryX = PAGE_WIDTH - 220;
  const summaryY = PAGE_HEIGHT - MARGIN_TOP - 10;
  const summaryLines = [
    `変更行数: ${rows.length}件`,
    `変更見積合計: ${formatCurrency(totalAmount)}`,
    `ページ: ${pageNumber}`,
  ];
  summaryLines.forEach((line, index) => {
    page.drawText(line, {
      x: summaryX,
      y: summaryY - (index * 14),
      font,
      size: 10,
      color: rgb(0.22, 0.29, 0.39),
    });
  });
}

export async function generateChangeEstimatePdfDocument(input: {
  bundle: GeneratedReportBundle;
  header: ChangeEstimateReportHeader;
  projectName: string;
  estimateName: string;
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const fontBytes = await loadJapaneseFont();
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });

  const rows = input.bundle.changeEstimateRows;
  let pageNumber = 1;
  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawPageHeader(page, font, input.header, input.estimateName, rows, input.bundle.summary.changeEstimateTotalAmount, pageNumber);
  let y = drawTableHeader(page, PAGE_HEIGHT - 150, font);

  for (const row of rows) {
    const neededHeight = rowHeight(row, font);
    if (y - neededHeight < MARGIN_BOTTOM) {
      pageNumber += 1;
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      drawPageHeader(page, font, input.header, input.estimateName, rows, input.bundle.summary.changeEstimateTotalAmount, pageNumber);
      y = drawTableHeader(page, PAGE_HEIGHT - 150, font);
    }
    y = drawRow(page, y, row, font);
  }

  page.drawText(`案件: ${input.projectName}`, {
    x: MARGIN_X,
    y: 18,
    font,
    size: 9,
    color: rgb(0.35, 0.43, 0.52),
  });

  return await pdfDoc.save();
}
