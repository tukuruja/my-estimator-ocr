import type { ChangeEstimateRow } from './types';

interface ChangeEstimatePrintInput {
  projectName: string;
  estimateName: string;
  generatedAt: string;
  rows: ChangeEstimateRow[];
  totalAmount: number;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return value.toLocaleString('ja-JP', { maximumFractionDigits });
}

function formatCurrency(value: number): string {
  return `¥${value.toLocaleString('ja-JP')}`;
}

function formatPages(pageRefs: number[]): string {
  return pageRefs.length > 0 ? pageRefs.map((pageNo) => `p.${pageNo}`).join(', ') : '未設定';
}

function buildPrintHtml(input: ChangeEstimatePrintInput): string {
  const rowsHtml = input.rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.zoneName)}</td>
      <td>
        <div class="strong">${escapeHtml(row.itemName)}</div>
        <div class="sub">${escapeHtml(row.specification)}</div>
      </td>
      <td class="num">${formatNumber(row.quantity)} ${escapeHtml(row.unit)}</td>
      <td class="num">${formatCurrency(row.baseAmount)}</td>
      <td class="num">${formatCurrency(row.remobilizationAmount + row.temporaryRestorationAmount + row.coordinationAdjustmentAmount)}</td>
      <td class="num strong">${formatCurrency(row.totalAmount)}</td>
      <td>
        <div>図面: ${escapeHtml(formatPages(row.drawingPageRefs))}</div>
        <div>他工種: ${escapeHtml(row.relatedTradeNames.length > 0 ? row.relatedTradeNames.join(', ') : '未設定')}</div>
        <div>写真: ${escapeHtml(row.notePhotoUrls.length > 0 ? `${row.notePhotoUrls.length}枚` : '未登録')}</div>
        <div class="sub">${escapeHtml(row.remarks)}</div>
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(input.projectName)}_${escapeHtml(input.estimateName)}_変更見積書</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif;
        margin: 24px;
        color: #0f172a;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 24px;
      }
      .meta {
        margin-bottom: 18px;
        font-size: 12px;
        color: #475569;
      }
      .summary {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 18px;
      }
      .summary-card {
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 12px;
      }
      .summary-label {
        font-size: 11px;
        color: #64748b;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .summary-value {
        margin-top: 6px;
        font-size: 18px;
        font-weight: 700;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
      }
      thead th {
        background: #e0f2fe;
      }
      th, td {
        border: 1px solid #cbd5e1;
        padding: 8px;
        vertical-align: top;
        text-align: left;
      }
      .num {
        text-align: right;
        white-space: nowrap;
      }
      .strong {
        font-weight: 700;
      }
      .sub {
        margin-top: 4px;
        color: #475569;
        font-size: 10px;
        line-height: 1.5;
      }
      @media print {
        body {
          margin: 10mm;
        }
      }
    </style>
  </head>
  <body>
    <h1>変更見積書</h1>
    <div class="meta">
      案件: ${escapeHtml(input.projectName)}<br />
      見積: ${escapeHtml(input.estimateName)}<br />
      出力日: ${escapeHtml(input.generatedAt)}
    </div>
    <div class="summary">
      <div class="summary-card">
        <div class="summary-label">変更行数</div>
        <div class="summary-value">${formatNumber(input.rows.length, 0)} 件</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">変更見積合計</div>
        <div class="summary-value">${formatCurrency(input.totalAmount)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">根拠整理</div>
        <div class="summary-value">${formatNumber(input.rows.filter((row) => row.drawingPageRefs.length > 0).length, 0)} / ${formatNumber(input.rows.length, 0)}</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>区画</th>
          <th>工事項目</th>
          <th>数量</th>
          <th>基本額</th>
          <th>追加額</th>
          <th>区画金額</th>
          <th>根拠情報</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </body>
</html>`;
}

export function openChangeEstimatePrintView(input: ChangeEstimatePrintInput): void {
  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) {
    throw new Error('PDF出力ウィンドウを開けませんでした。ポップアップブロックを解除してください。');
  }

  popup.document.open();
  popup.document.write(buildPrintHtml(input));
  popup.document.close();
  popup.focus();
  window.setTimeout(() => {
    popup.print();
  }, 300);
}
