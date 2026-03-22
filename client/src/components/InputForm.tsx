import { type EstimateBlock, type EstimateZone } from '@/lib/types';
import { getWorkTypeLabel, WORK_TYPE_OPTIONS } from '@/lib/workTypes';
import {
  secondaryProducts,
  backhoes,
  dumpTrucks,
  crushedStones,
  concretes,
  pumpTrucks,
  productLengths,
  workabilityFactors,
} from '@/lib/priceData';

interface InputFormProps {
  block: EstimateBlock;
  onChange: (field: keyof EstimateBlock, value: string | number) => void;
  onZoneChange: (zoneId: string, field: keyof EstimateZone, value: EstimateZone[keyof EstimateZone]) => void;
  onAddZone: () => void;
  onRemoveZone: (zoneId: string) => void;
}

function SectionHeader({ title, color, emoji }: { title: string; color: string; emoji: string }) {
  return (
    <div className={`${color} px-3 py-1.5 text-sm font-semibold text-white`}>
      <span>{emoji}</span> {title}
    </div>
  );
}

function FormField({
  label,
  unit,
  hint,
  className = '',
  children,
}: {
  label: string;
  unit?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1 ${className}`}>
      <div>
        <label className="text-xs font-semibold text-gray-800">{label}</label>
        {hint && <p className="text-[11px] leading-4 text-gray-500">{hint}</p>}
      </div>
      <div className="flex items-center gap-2">
        {children}
        {unit && <span className="whitespace-nowrap text-xs text-gray-500">{unit}</span>}
      </div>
    </div>
  );
}

function NumberInput({ value, onChange, placeholder = '0' }: { value: number; onChange: (val: number) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-right text-sm transition-all focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
      placeholder={placeholder}
      value={value}
      onChange={(event) => {
        const raw = event.target.value;
        if (raw === '' || raw === '-') {
          onChange(0);
          return;
        }
        const next = parseFloat(raw);
        if (!Number.isNaN(next)) {
          onChange(next);
        }
      }}
    />
  );
}

function TextInput({ value, onChange, placeholder = '' }: { value: string; onChange: (val: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm transition-all focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function TextAreaInput({
  value,
  onChange,
  placeholder = '',
  rows = 3,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm transition-all focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
      value={value}
      placeholder={placeholder}
      rows={rows}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function SelectInput({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { name: string }[];
  onChange: (val: string) => void;
}) {
  return (
    <select
      className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm transition-all focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">選んでください</option>
      {options.map((option, index) => (
        <option key={`${option.name}-${index}`} value={option.name}>
          {option.name}
        </option>
      ))}
    </select>
  );
}

function parseStringList(value: string): string[] {
  return value
    .split(/[\n,、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePageRefs(value: string): number[] {
  return value
    .split(/[\n,、\s]+/)
    .flatMap((item) => item.split('-'))
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0)
    .map((item) => Math.round(item));
}

function joinList(value: string[]): string {
  return value.join('\n');
}

function joinPageRefs(value: number[]): string {
  return value.join(', ');
}

function WorkTypeSelect({ block, onChange }: Pick<InputFormProps, 'block' | 'onChange'>) {
  return (
    <FormField label="工種" hint="この見積で扱う工種を選びます。選択に応じて入力項目が切り替わります。" className="col-span-2">
      <select
        className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm transition-all focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
        value={block.blockType}
        onChange={(event) => onChange('blockType', event.target.value)}
      >
        {WORK_TYPE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </FormField>
  );
}

function SecondaryProductFields({ block, onChange }: Pick<InputFormProps, 'block' | 'onChange'>) {
  return (
    <>
      <FormField label="製品名" hint="見積したい二次製品を選びます。" className="col-span-2">
        <SelectInput value={block.secondaryProduct} options={secondaryProducts} onChange={(value) => onChange('secondaryProduct', value)} />
      </FormField>
      <FormField label="施工延長" unit="m" hint="施工する長さです。">
        <NumberInput value={block.distance} onChange={(value) => onChange('distance', value)} />
      </FormField>
      <FormField label="据付段数" unit="段" hint="製品を何段据えるかです。">
        <NumberInput value={block.stages} onChange={(value) => onChange('stages', value)} />
      </FormField>
      <FormField label="現況高" unit="m" hint="現在の地盤や既設の高さです。">
        <NumberInput value={block.currentHeight} onChange={(value) => onChange('currentHeight', value)} />
      </FormField>
      <FormField label="計画高" unit="m" hint="完成時の高さです。">
        <NumberInput value={block.plannedHeight} onChange={(value) => onChange('plannedHeight', value)} />
      </FormField>
      <FormField label="製品幅" unit="m" hint="二次製品の幅です。">
        <NumberInput value={block.productWidth} onChange={(value) => onChange('productWidth', value)} />
      </FormField>
      <FormField label="製品高さ" unit="m" hint="二次製品の高さです。">
        <NumberInput value={block.productHeight} onChange={(value) => onChange('productHeight', value)} />
      </FormField>
      <FormField label="製品長さ" unit="m" hint="1本あたりの長さです。">
        <SelectInput value={block.productLength} options={productLengths} onChange={(value) => onChange('productLength', value)} />
      </FormField>
    </>
  );
}

function RetainingWallFields({ block, onChange }: Pick<InputFormProps, 'block' | 'onChange'>) {
  return (
    <>
      <FormField label="擁壁種別" hint="L型擁壁、逆T式擁壁、重力式擁壁などを入力します。" className="col-span-2">
        <TextInput value={block.secondaryProduct} onChange={(value) => onChange('secondaryProduct', value)} placeholder="例: L型擁壁" />
      </FormField>
      <FormField label="施工延長" unit="m" hint="擁壁の延長です。">
        <NumberInput value={block.distance} onChange={(value) => onChange('distance', value)} />
      </FormField>
      <FormField label="擁壁高" unit="m" hint="平均的な壁高を入力します。">
        <NumberInput value={block.productHeight} onChange={(value) => onChange('productHeight', value)} />
      </FormField>
      <FormField label="底版幅" unit="m" hint="擁壁底版の代表幅です。">
        <NumberInput value={block.productWidth} onChange={(value) => onChange('productWidth', value)} />
      </FormField>
      <FormField label="基礎厚" unit="m" hint="基礎コンクリートの厚みです。">
        <NumberInput value={block.baseThickness} onChange={(value) => onChange('baseThickness', value)} />
      </FormField>
      <FormField label="基礎砕石厚" unit="m" hint="床付け下に入れる砕石厚です。">
        <NumberInput value={block.crushedStoneThickness} onChange={(value) => onChange('crushedStoneThickness', value)} />
      </FormField>
      <FormField label="型枠単価" unit="円/m²" hint="躯体型枠の標準単価です。">
        <NumberInput value={block.formworkCost} onChange={(value) => onChange('formworkCost', value)} />
      </FormField>
    </>
  );
}

function PavementFields({ block, onChange }: Pick<InputFormProps, 'block' | 'onChange'>) {
  return (
    <>
      <FormField label="舗装種別" hint="例: 再生密粒度As舗装、車道舗装など。" className="col-span-2">
        <TextInput value={block.secondaryProduct} onChange={(value) => onChange('secondaryProduct', value)} placeholder="例: As舗装" />
      </FormField>
      <FormField label="施工延長" unit="m" hint="舗装延長です。">
        <NumberInput value={block.distance} onChange={(value) => onChange('distance', value)} />
      </FormField>
      <FormField label="舗装幅" unit="m" hint="施工幅です。">
        <NumberInput value={block.pavementWidth} onChange={(value) => onChange('pavementWidth', value)} />
      </FormField>
      <FormField label="表層厚" unit="m" hint="表層材の厚みです。">
        <NumberInput value={block.surfaceThickness} onChange={(value) => onChange('surfaceThickness', value)} />
      </FormField>
      <FormField label="基層厚" unit="m" hint="基層材の厚みです。">
        <NumberInput value={block.binderThickness} onChange={(value) => onChange('binderThickness', value)} />
      </FormField>
      <FormField label="上層路盤厚" unit="m" hint="粒調砕石や路盤材の厚みです。">
        <NumberInput value={block.baseThickness} onChange={(value) => onChange('baseThickness', value)} />
      </FormField>
      <FormField label="下層路盤厚" unit="m" hint="下層路盤や砕石厚です。">
        <NumberInput value={block.crushedStoneThickness} onChange={(value) => onChange('crushedStoneThickness', value)} />
      </FormField>
    </>
  );
}

function DemolitionFields({ block, onChange }: Pick<InputFormProps, 'block' | 'onChange'>) {
  return (
    <>
      <FormField label="撤去対象" hint="例: As舗装、Co構造物、既設側溝など。" className="col-span-2">
        <TextInput value={block.secondaryProduct} onChange={(value) => onChange('secondaryProduct', value)} placeholder="例: As舗装" />
      </FormField>
      <FormField label="撤去延長" unit="m" hint="撤去する延長です。">
        <NumberInput value={block.distance} onChange={(value) => onChange('distance', value)} />
      </FormField>
      <FormField label="撤去幅" unit="m" hint="撤去する幅です。">
        <NumberInput value={block.demolitionWidth} onChange={(value) => onChange('demolitionWidth', value)} />
      </FormField>
      <FormField label="撤去厚" unit="m" hint="撤去対象の厚みです。">
        <NumberInput value={block.demolitionThickness} onChange={(value) => onChange('demolitionThickness', value)} />
      </FormField>
    </>
  );
}

function CommonPricingFields({ block, onChange }: Pick<InputFormProps, 'block' | 'onChange'>) {
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-md border border-yellow-300">
        <SectionHeader title="施工機械・運搬条件" color="bg-yellow-500" emoji="🏗" />
        <div className="grid grid-cols-2 gap-3 bg-yellow-50 p-3">
          <FormField label="掘削機械" hint="バックホーなど、主要機械です。">
            <SelectInput value={block.machine} options={backhoes} onChange={(value) => onChange('machine', value)} />
          </FormField>
          <FormField label="搬出ダンプ" hint="残土や殻を搬出する車種です。">
            <SelectInput value={block.dumpTruck} options={dumpTrucks} onChange={(value) => onChange('dumpTruck', value)} />
          </FormField>
          <FormField label="標準労務単価" unit="円/人日" hint="全工種で使う標準労務単価です。" className="col-span-2">
            <NumberInput value={block.laborCost} onChange={(value) => onChange('laborCost', value)} />
          </FormField>
        </div>
      </div>

      {(block.blockType === 'secondary_product' || block.blockType === 'retaining_wall' || block.blockType === 'pavement') && (
        <div className="overflow-hidden rounded-md border border-green-300">
          <SectionHeader title="基礎・材料条件" color="bg-green-600" emoji="🧱" />
          <div className="grid grid-cols-2 gap-3 bg-green-50 p-3">
            <FormField label="砕石種類" hint="RC-40 などの材料です。">
              <SelectInput value={block.crushedStone} options={crushedStones} onChange={(value) => onChange('crushedStone', value)} />
            </FormField>
            <FormField label="生コン種別" hint="ベースや躯体に使う生コンです。">
              <SelectInput value={block.concrete} options={concretes} onChange={(value) => onChange('concrete', value)} />
            </FormField>
            {block.blockType === 'secondary_product' && (
              <>
                <FormField label="ポンプ・圧送機" hint="打設や圧送に使う機械です。">
                  <SelectInput value={block.pumpTruck} options={pumpTrucks} onChange={(value) => onChange('pumpTruck', value)} />
                </FormField>
                <FormField label="据付労務単価" unit="円/人日" hint="据付作業の労務単価です。">
                  <NumberInput value={block.installLaborCost} onChange={(value) => onChange('installLaborCost', value)} />
                </FormField>
                <FormField label="施工条件係数" unit="倍" hint="施工しやすさに応じた補正です。">
                  <SelectInput value={block.workabilityFactor} options={workabilityFactors} onChange={(value) => onChange('workabilityFactor', value)} />
                </FormField>
                <FormField label="砂単価" unit="円/m³" hint="モルタル用砂の単価です。">
                  <NumberInput value={block.sandCost} onChange={(value) => onChange('sandCost', value)} />
                </FormField>
                <FormField label="送料" unit="円/式" hint="製品搬入にかかる費用です。" className="col-span-2">
                  <NumberInput value={block.shippingCost} onChange={(value) => onChange('shippingCost', value)} />
                </FormField>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SplitExecutionFields({ block, onChange }: Pick<InputFormProps, 'block' | 'onChange'>) {
  return (
    <div className="overflow-hidden rounded-md border border-violet-300">
      <SectionHeader title="集合住宅外構の分割施工条件" color="bg-violet-600" emoji="🧩" />
      <div className="grid grid-cols-2 gap-3 bg-violet-50 p-3">
        <FormField
          label="施工区画数"
          unit="区画"
          hint="住棟引渡しや他工種調整で分ける施工区画数です。数量は 総数量 ÷ 区画数 で見ます。"
        >
          <NumberInput value={block.splitPhaseCount ?? 1} onChange={(value) => onChange('splitPhaseCount', Math.max(1, Math.round(value)))} />
        </FormField>
        <FormField
          label="再段取り回数"
          unit="回"
          hint="区画切替で発生する再搬入・再段取り回数です。追加変更が出たらここだけ更新します。"
        >
          <NumberInput value={block.remobilizationCount ?? 0} onChange={(value) => onChange('remobilizationCount', Math.max(0, Math.round(value)))} />
        </FormField>
        <FormField
          label="仮復旧率"
          unit="%"
          hint="他者作業のため一時開放・仮復旧が必要な割合です。仮復旧数量 = 主数量 × 仮復旧率。"
        >
          <NumberInput value={block.temporaryRestorationRate ?? 0} onChange={(value) => onChange('temporaryRestorationRate', Math.max(0, value))} />
        </FormField>
        <FormField
          label="他工種調整率"
          unit="%"
          hint="設備・植栽・建築外構・先行引渡しとの工程干渉を見込む補正率です。"
        >
          <NumberInput value={block.coordinationAdjustmentRate ?? 0} onChange={(value) => onChange('coordinationAdjustmentRate', Math.max(0, value))} />
        </FormField>
      </div>
    </div>
  );
}

function ZoneBreakdownFields({ block, onZoneChange, onAddZone, onRemoveZone }: Pick<InputFormProps, 'block' | 'onZoneChange' | 'onAddZone' | 'onRemoveZone'>) {
  return (
    <div className="overflow-hidden rounded-md border border-cyan-300">
      <SectionHeader title="区画別見積" color="bg-cyan-600" emoji="🗂" />
      <div className="space-y-3 bg-cyan-50 p-3">
        <div className="rounded-md border border-cyan-200 bg-white px-3 py-2 text-[11px] leading-5 text-slate-600">
          集合住宅外構では、`A棟前 / 共用通路 / 駐車場` のように区画ごとへ主数量を分けて持つと、他業者都合の追加・変更見積がしやすくなります。ここで入れた図面ページ・写真・他工種名は `変更見積書` の根拠行に出ます。
        </div>

        {block.zones.length === 0 && (
          <div className="rounded-md border border-dashed border-cyan-300 bg-white px-3 py-4 text-sm text-slate-500">
            まだ区画はありません。先行引渡しや分割施工がある場合だけ追加してください。
          </div>
        )}

        {block.zones.map((zone, index) => (
          <div key={zone.id} className="rounded-md border border-cyan-200 bg-white p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-slate-800">区画 {index + 1}</div>
                <div className="text-[11px] text-slate-500">例: A棟前、共用通路、駐車場、ゴミ置場まわり</div>
              </div>
              <button
                type="button"
                onClick={() => onRemoveZone(zone.id)}
                className="rounded-md border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
              >
                区画削除
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="区画名" hint="変更見積でも同じ名前を使います。" className="col-span-2">
                <TextInput value={zone.name} onChange={(value) => onZoneChange(zone.id, 'name', value)} placeholder="例: A棟前" />
              </FormField>
              <FormField label="区画主数量" unit={block.blockType === 'pavement' || block.blockType === 'demolition' ? 'm²' : 'm'} hint="この区画に該当する延長または面積です。">
                <NumberInput value={zone.primaryQuantity} onChange={(value) => onZoneChange(zone.id, 'primaryQuantity', Math.max(0, value))} />
              </FormField>
              <FormField label="再段取り回数" unit="回" hint="この区画で個別に増える再搬入回数です。">
                <NumberInput value={zone.remobilizationCount} onChange={(value) => onZoneChange(zone.id, 'remobilizationCount', Math.max(0, Math.round(value)))} />
              </FormField>
              <FormField label="仮復旧率" unit="%" hint="共用通路などで一時開放が必要な割合です。">
                <NumberInput value={zone.temporaryRestorationRate} onChange={(value) => onZoneChange(zone.id, 'temporaryRestorationRate', Math.max(0, value))} />
              </FormField>
              <FormField label="他工種調整率" unit="%" hint="設備・植栽・建築引渡し待ちの補正です。">
                <NumberInput value={zone.coordinationAdjustmentRate} onChange={(value) => onZoneChange(zone.id, 'coordinationAdjustmentRate', Math.max(0, value))} />
              </FormField>
              <FormField label="図面ページ" hint="変更見積の根拠となる図面ページをカンマ区切りで入れます。例: 1, 2, 5">
                <TextInput
                  value={joinPageRefs(zone.drawingPageRefs)}
                  onChange={(value) => onZoneChange(zone.id, 'drawingPageRefs', parsePageRefs(value))}
                  placeholder="例: 1, 2, 5"
                />
              </FormField>
              <FormField label="他工種名" hint="この区画で干渉する工種名をカンマまたは改行で入れます。">
                <TextInput
                  value={zone.relatedTradeNames.join(', ')}
                  onChange={(value) => onZoneChange(zone.id, 'relatedTradeNames', parseStringList(value))}
                  placeholder="例: 設備配管, 植栽, 建築外構"
                />
              </FormField>
              <FormField label="備考写真URL" hint="写真クラウドや共有リンクを改行ごとに貼ります。" className="col-span-2">
                <TextAreaInput
                  value={joinList(zone.notePhotoUrls)}
                  onChange={(value) => onZoneChange(zone.id, 'notePhotoUrls', parseStringList(value))}
                  placeholder={'例:\nhttps://example.com/photo-1\nhttps://example.com/photo-2'}
                  rows={3}
                />
              </FormField>
              <FormField label="備考" hint="追加変更の理由や他者都合を書き残します。" className="col-span-2">
                <TextAreaInput value={zone.note} onChange={(value) => onZoneChange(zone.id, 'note', value)} placeholder="例: 設備配管先行後に再着手" rows={2} />
              </FormField>
            </div>
          </div>
        ))}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onAddZone}
            className="rounded-md bg-cyan-600 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-700"
          >
            区画を追加
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InputForm({ block, onChange, onZoneChange, onAddZone, onRemoveZone }: InputFormProps) {
  const productName = block.secondaryProduct || 'まだ選択していません';

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-md">
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-4 py-3 text-white">
        <div className="text-sm font-bold">📋 入力条件</div>
        <div className="mt-1 text-xs text-indigo-100">工種: {getWorkTypeLabel(block.blockType)} / 対象: {productName}</div>
        <p className="mt-2 text-xs leading-5 text-indigo-50">
          まず工種を選び、図面や現場条件から分かっている寸法と材料条件を入力してください。右側の試算結果と帳票案が自動更新されます。
        </p>
      </div>

      <div className="space-y-2 p-2">
        <div className="rounded-md border border-gray-200 p-3">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-gray-800">基本条件</h2>
            <p className="text-[11px] leading-4 text-gray-500">工種ごとに必要な寸法と数量項目を入力してください。</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <WorkTypeSelect block={block} onChange={onChange} />
            {block.blockType === 'secondary_product' && <SecondaryProductFields block={block} onChange={onChange} />}
            {block.blockType === 'retaining_wall' && <RetainingWallFields block={block} onChange={onChange} />}
            {block.blockType === 'pavement' && <PavementFields block={block} onChange={onChange} />}
            {block.blockType === 'demolition' && <DemolitionFields block={block} onChange={onChange} />}
          </div>
        </div>

        <SplitExecutionFields block={block} onChange={onChange} />
        <ZoneBreakdownFields block={block} onZoneChange={onZoneChange} onAddZone={onAddZone} onRemoveZone={onRemoveZone} />
        <CommonPricingFields block={block} onChange={onChange} />
      </div>
    </div>
  );
}
