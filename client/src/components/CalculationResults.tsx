import type { CalculationResult } from '@/lib/types';
import type { EstimateBlock } from '@/lib/types';

interface CalculationResultsProps {
  result: CalculationResult;
  block: EstimateBlock;
}

function formatNumber(num: number): string {
  if (Number.isInteger(num)) return num.toLocaleString('ja-JP');
  return num.toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCurrency(num: number): string {
  if (Number.isInteger(num)) return '¥' + num.toLocaleString('ja-JP');
  return '¥' + num.toLocaleString('ja-JP', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function ResultSection({
  title,
  color,
  children,
}: {
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-gray-200 rounded overflow-hidden shadow-sm">
      <div className={`${color} text-white px-2 py-1 font-bold text-xs`}>
        {title}
      </div>
      <div className="bg-white">
        <table className="w-full text-xs">
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

function ResultRow({ label, value, unit = '' }: { label: string; value: string | number; unit?: string }) {
  return (
    <tr className="border-b border-gray-50 last:border-b-0">
      <td className="px-2 py-0.5 text-gray-600 whitespace-nowrap">{label}</td>
      <td className="px-2 py-0.5 text-right font-medium whitespace-nowrap">
        {value}{unit}
      </td>
    </tr>
  );
}

export default function CalculationResults({ result, block }: CalculationResultsProps) {
  const estimatedTotal =
    result.excavationConstructionAmount
    + result.soilRemovalAmount
    + result.backfillLaborCost
    + result.crushedStoneTotal
    + result.baseTotalAmount
    + result.secondaryProductTotal;
  const estimatedUnitTotal = block.distance > 0 ? Math.round(estimatedTotal / block.distance) : 0;

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
      <div className="bg-gradient-to-r from-gray-700 to-gray-600 text-white px-4 py-2 font-bold text-sm flex items-center gap-2">
        <span>📊</span> 試算結果
      </div>

      <div className="p-2">
        <div className="mb-3 grid gap-2 md:grid-cols-4">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">見積名</div>
            <div className="mt-1 text-sm font-semibold text-slate-800">{block.name}</div>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">対象製品</div>
            <div className="mt-1 text-sm font-semibold text-slate-800">{block.secondaryProduct || '未選択'}</div>
          </div>
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">概算総額</div>
            <div className="mt-1 text-lg font-bold text-emerald-800">{formatCurrency(estimatedTotal)}</div>
          </div>
          <div className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-700">1mあたり概算</div>
            <div className="mt-1 text-lg font-bold text-indigo-800">
              {block.distance > 0 ? formatCurrency(estimatedUnitTotal) : '施工延長を入力してください'}
            </div>
          </div>
        </div>

        <div className="mb-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
          数量と金額は入力内容に応じて自動更新されます。下の表では、工種ごとの数量・人数・単価・金額の内訳を確認できます。
        </div>

        <div className="grid grid-cols-3 gap-2">
          <ResultSection title="🏗 掘削工事" color="bg-blue-600">
            <ResultRow label="掘削幅" value={result.excavationWidth} unit="m" />
            <ResultRow label="掘削高さ" value={result.excavationHeight} unit="m" />
            <ResultRow label="掘削土量" value={formatNumber(result.excavationVolume)} unit="m³" />
            <ResultRow label="4時間当たり掘削量" value={formatNumber(result.fourHourExcavation)} unit="m³" />
            <ResultRow label="掘削日数" value={result.excavationDays} unit="日" />
            <ResultRow label="1日あたり人数" value={result.excavationDailyWorkers} unit="人" />
            <ResultRow label="延べ人数" value={result.excavationWorkers} unit="人" />
            <ResultRow label="機械単価" value={formatCurrency(result.machineUnitPrice)} />
            <ResultRow label="機械費" value={formatCurrency(result.machineAmount)} />
            <ResultRow label="掘削工事費" value={formatCurrency(result.excavationConstructionAmount)} />
            <ResultRow label="1mあたり" value={formatCurrency(result.excavationUnitPerM)} />
          </ResultSection>

          <ResultSection title="🚛 残土搬出" color="bg-orange-500">
            <ResultRow label="搬出土量" value={formatNumber(result.soilRemovalVolume)} unit="m³" />
            <ResultRow label="搬出日数" value={result.soilRemovalDays} unit="日" />
            <ResultRow label="ダンプ容積" value={result.dumpCapacity} unit="m³" />
            <ResultRow label="必要ダンプ台数" value={result.dumpCount} unit="台" />
            <ResultRow label="搬出車両単価" value={formatCurrency(result.dumpVehicleUnitPrice)} />
            <ResultRow label="常用ダンプ台数" value={result.regularDumpCount} unit="台" />
            <ResultRow label="常用ダンプ単価" value={formatCurrency(result.regularDumpUnitPrice)} />
            <ResultRow label="搬出工事費" value={formatCurrency(result.soilRemovalAmount)} />
            <ResultRow label="1mあたり" value={formatCurrency(result.soilRemovalUnitPerM)} />
          </ResultSection>

          <ResultSection title="🔄 埋戻し" color="bg-green-600">
            <ResultRow label="埋戻し量" value={formatNumber(result.backfillVolume)} unit="m³" />
            <ResultRow label="埋戻し日数" value={result.backfillDays} unit="日" />
            <ResultRow label="延べ人数" value={result.backfillWorkers} unit="人" />
            <ResultRow label="埋戻し人件費" value={formatCurrency(result.backfillLaborCost)} />
          </ResultSection>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-2">
          <ResultSection title="🪨 砕石工事" color="bg-yellow-500">
            <ResultRow label="砕石量" value={formatNumber(result.crushedStoneVolume)} unit="m³" />
            <ResultRow label="1日あたり人数" value={result.crushedStoneWorkers} unit="人" />
            <ResultRow label="砕石日数" value={result.crushedStoneDays} unit="日" />
            <ResultRow label="砕石人件費" value={formatCurrency(result.crushedStoneLaborCost)} />
            <ResultRow label="砕石機械費" value={formatCurrency(result.crushedStoneMachineCost)} />
            <ResultRow label="砕石施工費" value={formatCurrency(result.crushedStoneConstructionAmount)} />
            <ResultRow label="砕石資材費" value={formatCurrency(result.crushedStoneMaterialCost)} />
            <ResultRow label="砕石工事合計" value={formatCurrency(result.crushedStoneTotal)} />
            <ResultRow label="1mあたり" value={formatCurrency(result.crushedStoneUnitPerM)} />
          </ResultSection>

          <ResultSection title="🧱 ベース工事" color="bg-purple-600">
            <ResultRow label="ベース幅" value={result.baseWidth} unit="m" />
            <ResultRow label="ベース生コン量" value={formatNumber(result.baseConcreteVolume)} unit="m³" />
            <ResultRow label="生コン単価" value={formatCurrency(result.concreteUnitPrice)} />
            <ResultRow label="打設人数" value={result.pouringWorkers} unit="人" />
            <ResultRow label="型枠面積" value={formatNumber(result.formworkArea)} unit="m²" />
            <ResultRow label="型枠資材費" value={formatCurrency(result.formworkMaterialCost)} />
            <ResultRow label="ベース工事合計" value={formatCurrency(result.baseTotalAmount)} />
            <ResultRow label="1mあたり" value={formatCurrency(result.baseUnitPerM)} />
          </ResultSection>

          <ResultSection title="🔧 二次製品据付" color="bg-pink-500">
            <ResultRow label="必要モルタル量" value={formatNumber(result.mortar)} unit="m³" />
            <ResultRow label="必要砂量" value={formatNumber(result.sand)} unit="m³" />
            <ResultRow label="砂金額" value={formatCurrency(result.sandAmount)} />
            <ResultRow label="セメント袋数" value={result.cement} unit="袋" />
            <ResultRow label="セメント金額" value={formatCurrency(result.cementAmount)} />
            <ResultRow label="必要水量" value={formatNumber(result.water)} unit="L" />
            <ResultRow label="製品単価" value={formatCurrency(result.productUnitPrice)} />
            <ResultRow label="必要本数" value={result.productCount} unit="本" />
            <ResultRow label="製品材料費合計" value={formatCurrency(result.materialTotalCost)} />
            <ResultRow label="据付人数" value={result.installWorkers} unit="人" />
            <ResultRow label="据付工事合計" value={formatCurrency(result.secondaryProductTotal)} />
            <ResultRow label="1mあたり" value={formatCurrency(result.secondaryProductUnitPerM)} />
          </ResultSection>
        </div>
      </div>
    </div>
  );
}
