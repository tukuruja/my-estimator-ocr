import type { CalculationResult, EstimateBlock } from '@/lib/types';
import { getWorkTypeLabel } from '@/lib/workTypes';

interface CalculationResultsProps {
  result: CalculationResult;
  block: EstimateBlock;
}

function formatNumber(num: number): string {
  if (Number.isInteger(num)) return num.toLocaleString('ja-JP');
  return num.toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCurrency(num: number): string {
  if (Number.isInteger(num)) return `¥${num.toLocaleString('ja-JP')}`;
  return `¥${num.toLocaleString('ja-JP', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function ResultSection({
  title,
  tone,
  rows,
}: {
  title: string;
  tone: string;
  rows: CalculationResult['detailSections'][number]['metrics'];
}) {
  return (
    <div className="overflow-hidden rounded border border-gray-200 shadow-sm">
      <div className={`${tone} px-2 py-1 text-xs font-bold text-white`}>{title}</div>
      <div className="bg-white">
        <table className="w-full text-xs">
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-gray-50 last:border-b-0">
                <td className="whitespace-nowrap px-2 py-1 text-gray-600">{row.label}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right font-medium">
                  {row.valueKind === 'currency' ? formatCurrency(row.value) : formatNumber(row.value)}
                  {row.unit && row.valueKind !== 'currency' ? row.unit : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CalculationResults({ result, block }: CalculationResultsProps) {
  const targetName = block.secondaryProduct || result.displayName || '未設定';

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-md">
      <div className="bg-gradient-to-r from-gray-700 to-gray-600 px-4 py-2 text-sm font-bold text-white">
        📊 試算結果
      </div>

      <div className="p-2">
        <div className="mb-3 grid gap-2 md:grid-cols-4">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">見積名</div>
            <div className="mt-1 text-sm font-semibold text-slate-800">{block.name}</div>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">工種 / 対象</div>
            <div className="mt-1 text-sm font-semibold text-slate-800">{getWorkTypeLabel(block.blockType)} / {targetName}</div>
          </div>
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">概算総額</div>
            <div className="mt-1 text-lg font-bold text-emerald-800">{formatCurrency(result.totalAmount)}</div>
          </div>
          <div className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-700">代表単価</div>
            <div className="mt-1 text-lg font-bold text-indigo-800">
              {result.primaryQuantity > 0 ? `${formatCurrency(result.totalAmountPerPrimaryUnit)} / ${result.primaryUnit}` : '数量入力待ち'}
            </div>
          </div>
        </div>

        <div className="mb-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
          下の表では、工種ごとの主要数量と金額内訳を確認できます。集合住宅外構で分割施工する場合は「分割施工数量」に区画数・仮復旧・他工種調整が別立てで出ます。帳票の明細はこの試算結果をもとにサーバ側で生成します。
        </div>

        <div className="grid gap-2 xl:grid-cols-2">
          {result.detailSections.map((section) => (
            <ResultSection key={section.id} title={section.title} tone={section.tone} rows={section.metrics} />
          ))}
        </div>

        {result.zoneBreakdowns.length > 0 && (
          <div className="mt-3 overflow-hidden rounded border border-cyan-200 shadow-sm">
            <div className="bg-cyan-600 px-2 py-1 text-xs font-bold text-white">区画別配賦</div>
            <div className="bg-white">
              <table className="w-full text-xs">
                <thead className="bg-cyan-50 text-slate-600">
                  <tr className="border-b border-cyan-100">
                    <th className="px-2 py-2 text-left">区画名</th>
                    <th className="px-2 py-2 text-right">数量</th>
                    <th className="px-2 py-2 text-right">配賦率</th>
                    <th className="px-2 py-2 text-right">再段取り</th>
                    <th className="px-2 py-2 text-right">追加額</th>
                    <th className="px-2 py-2 text-right">区画金額</th>
                  </tr>
                </thead>
                <tbody>
                  {result.zoneBreakdowns.map((zone) => (
                    <tr key={zone.id} className="border-b border-slate-100 align-top last:border-b-0">
                      <td className="px-2 py-2">
                        <div className="font-semibold text-slate-900">{zone.name}</div>
                        {zone.note && <div className="mt-1 text-[11px] text-slate-500">{zone.note}</div>}
                      </td>
                      <td className="px-2 py-2 text-right">{formatNumber(zone.primaryQuantity)}{zone.primaryUnit}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(zone.quantityShare)}%</td>
                      <td className="px-2 py-2 text-right">{zone.remobilizationCount}回</td>
                      <td className="px-2 py-2 text-right">{formatCurrency(zone.remobilizationAmount + zone.temporaryRestorationAmount + zone.coordinationAdjustmentAmount)}</td>
                      <td className="px-2 py-2 text-right font-semibold">{formatCurrency(zone.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
