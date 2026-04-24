import { useState, useMemo } from 'react';
import { CheckCircle2, AlertTriangle, Download, FileSpreadsheet, FileText, ListChecks, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

import type { ChangeEstimateReportHeader, Drawing, GeneratedReportBundle, ReportGenerationRequest, WorkTypeCandidate, WorkbookAuditBundle } from '@/lib/types';
import { generateChangeEstimatePdf } from '@/lib/api';

interface DocumentPanelProps {
  bundle: GeneratedReportBundle;
  drawing: Drawing | null;
  projectName: string;
  estimateName: string;
  reportRequest: ReportGenerationRequest;
  workbookAudit: WorkbookAuditBundle | null;
}

type TabKey = 'estimate' | 'change' | 'evidence' | 'review' | 'workbook-audit';

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

export default function DocumentPanel({ bundle, drawing, projectName, estimateName, reportRequest, workbookAudit }: DocumentPanelProps) {
  const [tab, setTab] = useState<TabKey>('estimate');
  const [header, setHeader] = useState<ChangeEstimateReportHeader>(() => ({
    issueDate: new Date().toISOString().slice(0, 10),
    recipientName: '',
    constructionName: projectName,
    changeReason: '',
  }));
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const workTypeCandidates = drawing?.workTypeCandidates ?? [];

  const filePrefix = useMemo(() => `${projectName || '案件'}_${estimateName || '見積'}`, [estimateName, projectName]);

  function updateHeader(field: keyof ChangeEstimateReportHeader, value: string) {
    setHeader((prev) => ({ ...prev, [field]: value }));
  }

  async function handleGenerateChangeEstimatePdf() {
    if (!header.issueDate.trim() || !header.recipientName.trim() || !header.constructionName.trim() || !header.changeReason.trim()) {
      toast.error('発行日・宛名・工事名・変更理由を入力してください。');
      return;
    }

    setIsPdfGenerating(true);
    try {
      const blob = await generateChangeEstimatePdf({
        ...reportRequest,
        header,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filePrefix}_変更見積書.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '変更見積書PDFの生成に失敗しました。');
    } finally {
      setIsPdfGenerating(false);
    }
  }

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
          <div className="flex flex-col items-end gap-1">
            {/* 出力モードバッジ */}
            {bundle.outputMode && (
              <div className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                bundle.outputMode === 'confirmed' ? 'bg-emerald-100 text-emerald-800'
                : bundle.outputMode === 'pending' ? 'bg-amber-100 text-amber-800'
                : 'bg-violet-100 text-violet-800'
              }`}>
                {bundle.outputMode === 'confirmed' && <CheckCircle2 className="h-3 w-3" />}
                {bundle.outputMode === 'pending' && <AlertTriangle className="h-3 w-3" />}
                {bundle.outputMode === 'full' && <ListChecks className="h-3 w-3" />}
                {bundle.outputMode === 'confirmed' ? '確定版' : bundle.outputMode === 'pending' ? '保留版' : '全出力版'}
              </div>
            )}
            <div className="text-right text-xs text-slate-500">
              <div>見積行 {bundle.summary.totalRows} 件</div>
              <div>変更行 {bundle.summary.changeEstimateRowCount} 件</div>
              <div>要確認 {bundle.summary.requiresReviewCount} 件</div>
            </div>
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
          onClick={() => setTab('change')}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold ${tab === 'change' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
        >
          変更見積書
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
        {workbookAudit && (
          <button
            type="button"
            onClick={() => setTab('workbook-audit')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${tab === 'workbook-audit' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            内訳監査
          </button>
        )}
      </div>

      <div className="max-h-[780px] overflow-auto p-4">
        {tab === 'estimate' && (
          <div>
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => exportCsv(
                  `${filePrefix}_見積書_${bundle.outputMode ?? 'confirmed'}.csv`,
                  ['工種', '品名規格', '仕様', '数量', '単位', '単価', '金額', '摘要', '根拠', '信頼度', '保留', '要確認'],
                  bundle.estimateRows.map((row) => [
                    row.section,
                    row.itemName,
                    row.specification,
                    row.quantity,
                    row.unit,
                    row.unitPrice,
                    row.amount,
                    row.remarks,
                    row.sourceSummary,
                    row.confidenceLevel !== undefined ? `${Math.round((row.confidenceLevel ?? 1) * 100)}%` : '',
                    row.isPending ? '保留' : '',
                    row.requiresReview ? '要確認' : '',
                  ]),
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
                  <tr key={row.id} className={`border-b border-slate-100 align-top ${
                    row.requiresReview ? 'bg-rose-50/40' : row.isPending ? 'bg-amber-50/40' : ''
                  }`}>
                    <td className="px-2 py-2">{row.section}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-900">{row.itemName}</span>
                        {row.isPending && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">保留</span>
                        )}
                        {row.requiresReview && (
                          <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-700">要確認</span>
                        )}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">{row.specification}</div>
                      {row.confidenceLevel !== undefined && (
                        <div className="mt-1">
                          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                            (row.confidenceLevel ?? 1) >= 0.8 ? 'bg-emerald-100 text-emerald-700'
                            : (row.confidenceLevel ?? 1) >= 0.5 ? 'bg-amber-100 text-amber-700'
                            : 'bg-rose-100 text-rose-700'
                          }`}>
                            信頼度 {Math.round((row.confidenceLevel ?? 1) * 100)}%
                          </span>
                        </div>
                      )}
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

        {tab === 'change' && (
          <div>
            <div className="mb-3 grid gap-3 rounded-md border border-cyan-200 bg-cyan-50 p-3 md:grid-cols-2">
              <label className="space-y-1">
                <div className="text-xs font-semibold text-slate-700">発行日</div>
                <input
                  type="date"
                  value={header.issueDate}
                  onChange={(event) => updateHeader('issueDate', event.target.value)}
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                />
              </label>
              <label className="space-y-1">
                <div className="text-xs font-semibold text-slate-700">宛名</div>
                <input
                  type="text"
                  value={header.recipientName}
                  onChange={(event) => updateHeader('recipientName', event.target.value)}
                  placeholder="例: 株式会社〇〇 御中"
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <div className="text-xs font-semibold text-slate-700">工事名</div>
                <input
                  type="text"
                  value={header.constructionName}
                  onChange={(event) => updateHeader('constructionName', event.target.value)}
                  placeholder="例: D街区外構工事 変更見積"
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                />
              </label>
              <label className="space-y-1 md:col-span-2">
                <div className="text-xs font-semibold text-slate-700">変更理由</div>
                <textarea
                  value={header.changeReason}
                  onChange={(event) => updateHeader('changeReason', event.target.value)}
                  placeholder="例: 他工種先行と仮復旧対応により、A棟前・共用通路の再段取りと追加数量が発生"
                  rows={3}
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
                />
              </label>
            </div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-xs leading-5 text-slate-600">
                区画ごとの変更数量、再段取り、仮復旧、他工種調整、図面根拠、備考写真をまとめた専用帳票です。PDF はサーバ側で固定レイアウト生成します。
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleGenerateChangeEstimatePdf()}
                  disabled={isPdfGenerating || bundle.changeEstimateRows.length === 0}
                  className="inline-flex items-center gap-2 rounded-md bg-slate-700 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  <FileText className="h-4 w-4" /> {isPdfGenerating ? 'PDF生成中...' : 'PDF出力'}
                </button>
                <button
                  type="button"
                  onClick={() => exportCsv(
                    `${filePrefix}_変更見積書.csv`,
                    ['区画', '工事項目', '仕様', '数量', '単位', '配賦率', '基本額', '再段取り回数', '再段取り額', '仮復旧率', '仮復旧数量', '仮復旧額', '他工種調整率', '他工種調整額', '区画金額', '図面ページ', '他工種名', '備考写真', '備考', '根拠'],
                    bundle.changeEstimateRows.map((row) => [
                      row.zoneName,
                      row.itemName,
                      row.specification,
                      row.quantity,
                      row.unit,
                      row.quantityShare,
                      row.baseAmount,
                      row.remobilizationCount,
                      row.remobilizationAmount,
                      row.temporaryRestorationRate,
                      row.temporaryRestorationQuantity,
                      row.temporaryRestorationAmount,
                      row.coordinationAdjustmentRate,
                      row.coordinationAdjustmentAmount,
                      row.totalAmount,
                      row.drawingPageRefs.map((pageNo) => `p.${pageNo}`).join(', '),
                      row.relatedTradeNames.join(', '),
                      row.notePhotoUrls.join('\n'),
                      row.remarks,
                      row.sourceSummary,
                    ]),
                  )}
                  className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <Download className="h-4 w-4" /> CSV出力
                </button>
              </div>
            </div>
            {bundle.changeEstimateRows.length === 0 ? (
              <div className="rounded-md border border-dashed border-cyan-300 bg-cyan-50 px-4 py-6 text-sm text-slate-600">
                変更見積に使う区画行はまだありません。区画別見積に数量と根拠ページを入れると、ここに専用帳票が出ます。
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-cyan-50 text-slate-600">
                  <tr className="border-b border-cyan-100">
                    <th className="px-2 py-2 text-left">区画</th>
                    <th className="px-2 py-2 text-left">工事項目</th>
                    <th className="px-2 py-2 text-right">数量</th>
                    <th className="px-2 py-2 text-right">基本額</th>
                    <th className="px-2 py-2 text-right">追加額</th>
                    <th className="px-2 py-2 text-right">区画金額</th>
                    <th className="px-2 py-2 text-left">根拠情報</th>
                  </tr>
                </thead>
                <tbody>
                  {bundle.changeEstimateRows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 align-top">
                      <td className="px-2 py-2">
                        <div className="font-semibold text-slate-900">{row.zoneName}</div>
                        <div className="mt-1 text-[11px] text-slate-500">配賦率 {row.quantityShare.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}%</div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="font-semibold text-slate-900">{row.itemName}</div>
                        <div className="mt-1 text-[11px] text-slate-500">{row.specification}</div>
                      </td>
                      <td className="px-2 py-2 text-right">{row.quantity.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}{row.unit}</td>
                      <td className="px-2 py-2 text-right">¥{row.baseAmount.toLocaleString('ja-JP')}</td>
                      <td className="px-2 py-2 text-right">
                        <div>¥{(row.remobilizationAmount + row.temporaryRestorationAmount + row.coordinationAdjustmentAmount).toLocaleString('ja-JP')}</div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          再段取り {row.remobilizationCount}回 / 仮復旧 {row.temporaryRestorationRate}% / 他工種調整 {row.coordinationAdjustmentRate}%
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right font-semibold">¥{row.totalAmount.toLocaleString('ja-JP')}</td>
                      <td className="px-2 py-2">
                        <div>図面: {row.drawingPageRefs.length > 0 ? row.drawingPageRefs.map((pageNo) => `p.${pageNo}`).join(', ') : '未設定'}</div>
                        <div className="mt-1">他工種: {row.relatedTradeNames.length > 0 ? row.relatedTradeNames.join(', ') : '未設定'}</div>
                        <div className="mt-1">備考写真: {row.notePhotoUrls.length > 0 ? `${row.notePhotoUrls.length}枚` : '未登録'}</div>
                        <div className="mt-1 text-[11px] text-slate-500">{row.remarks}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
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

        {tab === 'workbook-audit' && workbookAudit && (
          <div>
            <div className="mb-3 flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs leading-5 text-slate-600">
                <div className="font-semibold text-slate-800">{workbookAudit.projectLabel}</div>
                <div className="mt-1">基準内訳書: {workbookAudit.sourceWorkbook}</div>
                <div className="mt-1">
                  一致 {workbookAudit.summary.matchedRows} 件 / 差分 {workbookAudit.summary.mismatchRows} 件 / 未作成 {workbookAudit.summary.missingRows} 件 / 未対応 {workbookAudit.summary.unsupportedRows} 件
                </div>
              </div>
              <button
                type="button"
                onClick={() => exportCsv(
                  `${filePrefix}_内訳監査.csv`,
                  ['区分', '項目', '仕様', '内訳書数量', '単位', 'アプリ数量', 'アプリ単位', '差分', '判定', '内訳書ロジック', 'アプリロジック', 'メモ'],
                  workbookAudit.rows.map((row) => [
                    row.section,
                    row.itemName,
                    row.specification,
                    row.workbookQuantity,
                    row.workbookUnit,
                    row.appQuantity ?? '',
                    row.appUnit ?? '',
                    row.difference ?? '',
                    row.status,
                    row.workbookLogic,
                    row.appLogic,
                    row.notes.join(' / '),
                  ]),
                )}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <Download className="h-4 w-4" /> CSV出力
              </button>
            </div>
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-600">
                <tr className="border-b border-slate-200">
                  <th className="px-2 py-2 text-left">区分</th>
                  <th className="px-2 py-2 text-left">項目</th>
                  <th className="px-2 py-2 text-right">内訳書</th>
                  <th className="px-2 py-2 text-right">アプリ</th>
                  <th className="px-2 py-2 text-right">差分</th>
                  <th className="px-2 py-2 text-left">判定</th>
                  <th className="px-2 py-2 text-left">式の解釈</th>
                </tr>
              </thead>
              <tbody>
                {workbookAudit.rows.map((row) => {
                  const tone = row.status === 'matched'
                    ? 'bg-emerald-50'
                    : row.status === 'mismatch'
                      ? 'bg-amber-50'
                      : row.status === 'missing_block'
                        ? 'bg-rose-50'
                        : 'bg-slate-50';
                  return (
                    <tr key={row.id} className={`border-b border-slate-100 align-top ${tone}`}>
                      <td className="px-2 py-2">{row.section}</td>
                      <td className="px-2 py-2">
                        <div className="font-semibold text-slate-900">{row.itemName}</div>
                        <div className="mt-1 text-[11px] text-slate-500">{row.specification}</div>
                      </td>
                      <td className="px-2 py-2 text-right">{row.workbookQuantity.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}{row.workbookUnit}</td>
                      <td className="px-2 py-2 text-right">{row.appQuantity !== null ? `${row.appQuantity.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}${row.appUnit ?? ''}` : '未算定'}</td>
                      <td className="px-2 py-2 text-right">{row.difference !== null ? `${row.difference > 0 ? '+' : ''}${row.difference.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}${row.workbookUnit}` : '-'}</td>
                      <td className="px-2 py-2">
                        <span className="rounded-full bg-white/80 px-2 py-1 text-[11px] font-semibold text-slate-700">
                          {row.status === 'matched' ? '一致' : row.status === 'mismatch' ? '差分あり' : row.status === 'missing_block' ? 'block未作成' : 'モデル未対応'}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <div className="font-medium text-slate-800">{row.workbookLogic}</div>
                        <div className="mt-1 text-[11px] text-slate-500">{row.appLogic}</div>
                        {row.notes.length > 0 && (
                          <div className="mt-1 text-[11px] text-slate-500">{row.notes.join(' / ')}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
