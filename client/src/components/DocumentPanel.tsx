import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, ShieldAlert } from 'lucide-react';

import type { Drawing, GeneratedReportBundle, WorkTypeCandidate } from '@/lib/types';

interface DocumentPanelProps {
  bundle: GeneratedReportBundle;
  drawing: Drawing | null;
  projectName: string;
  estimateName: string;
}

type TabKey = 'estimate' | 'evidence' | 'review';

function exportCsv(fileName: string, headers: string[], rows: Array<Array<string | number | null>>) {
  const csvRows = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','));
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function WorkTypeBadge({ candidate }: { candidate: WorkTypeCandidate }) {
  return (
    <div className={`rounded-md border px-3 py-2 text-xs ${candidate.requiresReview ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
      <div className="font-semibold">{candidate.label}</div>
      <div className="mt-1">信頼度 {Math.round(candidate.confidence * 100)}%</div>
      <div className="mt-1 text-[11px] leading-4">{candidate.reason}</div>
    </div>
  );
}

export default function DocumentPanel({ bundle, drawing, projectName, estimateName }: DocumentPanelProps) {
  const [tab, setTab] = useState<TabKey>('estimate');
  const workTypeCandidates = drawing?.workTypeCandidates ?? [];

  const filePrefix = useMemo(() => `${projectName || '案件'}_${estimateName || '見積'}`, [estimateName, projectName]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <FileSpreadsheet className="h-4 w-4 text-indigo-600" />
              帳票生成
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              見積書、単価根拠表、要確認一覧を同じ案件データから生成します。
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <div>見積行 {bundle.summary.totalRows} 件</div>
            <div>要確認 {bundle.summary.requiresReviewCount} 件</div>
          </div>
        </div>

        {workTypeCandidates.length > 0 && (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {workTypeCandidates.slice(0, 2).map((candidate) => (
              <WorkTypeBadge key={candidate.id} candidate={candidate} />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2">
        <button
          type="button"
          onClick={() => setTab('estimate')}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold ${tab === 'estimate' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
        >
          見積書
        </button>
        <button
          type="button"
          onClick={() => setTab('evidence')}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold ${tab === 'evidence' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
        >
          単価根拠表
        </button>
        <button
          type="button"
          onClick={() => setTab('review')}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold ${tab === 'review' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
        >
          要確認一覧
        </button>
      </div>

      <div className="max-h-[780px] overflow-auto p-4">
        {tab === 'estimate' && (
          <div>
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => exportCsv(
                  `${filePrefix}_見積書.csv`,
                  ['工種', '品名規格', '仕様', '数量', '単位', '単価', '金額', '摘要', '根拠'],
                  bundle.estimateRows.map((row) => [row.section, row.itemName, row.specification, row.quantity, row.unit, row.unitPrice, row.amount, row.remarks, row.sourceSummary]),
                )}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <Download className="h-4 w-4" /> CSV出力
              </button>
            </div>
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-600">
                <tr className="border-b border-slate-200">
                  <th className="px-2 py-2 text-left">工種</th>
                  <th className="px-2 py-2 text-left">品名規格</th>
                  <th className="px-2 py-2 text-right">数量</th>
                  <th className="px-2 py-2 text-left">単位</th>
                  <th className="px-2 py-2 text-right">単価</th>
                  <th className="px-2 py-2 text-right">金額</th>
                  <th className="px-2 py-2 text-left">摘要</th>
                </tr>
              </thead>
              <tbody>
                {bundle.estimateRows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 align-top">
                    <td className="px-2 py-2">{row.section}</td>
                    <td className="px-2 py-2">
                      <div className="font-semibold text-slate-900">{row.itemName}</div>
                      <div className="mt-1 text-[11px] text-slate-500">{row.specification}</div>
                    </td>
                    <td className="px-2 py-2 text-right">{row.quantity.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}</td>
                    <td className="px-2 py-2">{row.unit}</td>
                    <td className="px-2 py-2 text-right">¥{row.unitPrice.toLocaleString('ja-JP')}</td>
                    <td className="px-2 py-2 text-right font-semibold">¥{row.amount.toLocaleString('ja-JP')}</td>
                    <td className="px-2 py-2">
                      <div>{row.remarks}</div>
                      <div className="mt-1 text-[11px] text-slate-500">{row.sourceSummary}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'evidence' && (
          <div>
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => exportCsv(
                  `${filePrefix}_単価根拠表.csv`,
                  ['対応見積行', '単価項目', '採用単価', '単位', '根拠資料名', '版', '有効開始', '有効終了', '採用理由', '要確認'],
                  bundle.unitPriceEvidenceRows.map((row) => [row.estimateItemName, row.masterName, row.adoptedUnitPrice, row.unit, row.sourceName, row.sourceVersion, row.effectiveFrom, row.effectiveTo, row.reason, row.requiresReview ? '要確認' : 'OK']),
                )}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <Download className="h-4 w-4" /> CSV出力
              </button>
            </div>
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-600">
                <tr className="border-b border-slate-200">
                  <th className="px-2 py-2 text-left">対応見積行</th>
                  <th className="px-2 py-2 text-left">単価項目</th>
                  <th className="px-2 py-2 text-right">採用単価</th>
                  <th className="px-2 py-2 text-left">有効日</th>
                  <th className="px-2 py-2 text-left">根拠</th>
                  <th className="px-2 py-2 text-left">判定</th>
                </tr>
              </thead>
              <tbody>
                {bundle.unitPriceEvidenceRows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 align-top">
                    <td className="px-2 py-2">{row.estimateItemName}</td>
                    <td className="px-2 py-2">
                      <div className="font-semibold text-slate-900">{row.masterName}</div>
                      <div className="mt-1 text-[11px] text-slate-500">{row.masterType}</div>
                    </td>
                    <td className="px-2 py-2 text-right">¥{row.adoptedUnitPrice.toLocaleString('ja-JP')}</td>
                    <td className="px-2 py-2">{row.effectiveFrom}{row.effectiveTo ? ` ～ ${row.effectiveTo}` : ''}</td>
                    <td className="px-2 py-2">
                      <div>{row.sourceName}</div>
                      <div className="mt-1 text-[11px] text-slate-500">版 {row.sourceVersion}{row.sourcePage ? ` / ${row.sourcePage}` : ''}</div>
                      <div className="mt-1 text-[11px] text-slate-500">{row.reason}</div>
                    </td>
                    <td className="px-2 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${row.requiresReview ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                        {row.requiresReview ? '要確認' : 'OK'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'review' && (
          <div>
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => exportCsv(
                  `${filePrefix}_要確認一覧.csv`,
                  ['重要度', 'タイトル', '詳細', '対象項目', 'ページ'],
                  bundle.reviewIssues.map((issue) => [issue.severity, issue.title, issue.detail, issue.fieldName ?? '', issue.sourcePage ?? '']),
                )}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <Download className="h-4 w-4" /> CSV出力
              </button>
            </div>
            {bundle.reviewIssues.length === 0 ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-6 text-sm text-emerald-800">
                現時点で自動停止すべき要確認項目はありません。
              </div>
            ) : (
              <div className="space-y-3">
                {bundle.reviewIssues.map((issue) => (
                  <div key={issue.id} className={`rounded-md border px-4 py-3 ${issue.severity === 'critical' ? 'border-rose-200 bg-rose-50' : issue.severity === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <ShieldAlert className="h-4 w-4" />
                      {issue.title}
                    </div>
                    <div className="mt-1 text-sm text-slate-700">{issue.detail}</div>
                    {(issue.fieldName || issue.sourcePage) && (
                      <div className="mt-2 text-[11px] text-slate-500">
                        {issue.fieldName ? `対象項目: ${issue.fieldName}` : ''}
                        {issue.fieldName && issue.sourcePage ? ' / ' : ''}
                        {issue.sourcePage ? `根拠ページ: ${issue.sourcePage}` : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
