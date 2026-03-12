import { type EstimateBlock } from '@/lib/types';
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
}

function SectionHeader({ title, color, emoji }: { title: string; color: string; emoji: string }) {
  return (
    <div className={`${color} text-white px-3 py-1.5 rounded-t-md font-semibold text-sm flex items-center gap-1.5`}>
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
        {unit && <span className="text-xs text-gray-500 whitespace-nowrap">{unit}</span>}
      </div>
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  placeholder = '0',
}: {
  value: number;
  onChange: (val: number) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      className="w-full px-2 py-1.5 border border-gray-300 rounded text-right text-sm bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all"
      placeholder={placeholder}
      value={value}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '' || raw === '-') {
          onChange(0);
          return;
        }
        const val = parseFloat(raw);
        if (!isNaN(val)) {
          onChange(val);
        }
      }}
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
      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">選んでください</option>
      {options.map((opt, i) => (
        <option key={`${opt.name}-${i}`} value={opt.name}>
          {opt.name}
        </option>
      ))}
    </select>
  );
}

export default function InputForm({ block, onChange }: InputFormProps) {
  const productName = block.secondaryProduct || 'まだ選択していません';

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-4 py-3 text-white">
        <div className="text-sm font-bold">📋 入力条件</div>
        <div className="mt-1 text-xs text-indigo-100">対象製品: {productName}</div>
        <p className="mt-2 text-xs leading-5 text-indigo-50">
          上から順に入力すると、右側の試算結果がすぐ更新されます。数値が未入力の項目は 0 として計算します。
        </p>
      </div>

      <div className="p-2 space-y-2">
        <div className="border border-gray-200 rounded-md p-3">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-gray-800">基本条件</h2>
            <p className="text-[11px] leading-4 text-gray-500">
              まずは見積の対象となる製品と、施工の基本条件を入力してください。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="製品名"
              hint="見積したい二次製品を選びます。"
              className="col-span-2"
            >
              <SelectInput
                value={block.secondaryProduct}
                options={secondaryProducts}
                onChange={(v) => onChange('secondaryProduct', v)}
              />
            </FormField>
            <FormField label="施工延長" unit="m" hint="施工する長さです。">
              <NumberInput value={block.distance} onChange={(v) => onChange('distance', v)} />
            </FormField>
            <FormField label="現況高" unit="m" hint="現在の地盤や既設の高さです。">
              <NumberInput value={block.currentHeight} onChange={(v) => onChange('currentHeight', v)} />
            </FormField>
            <FormField label="計画高" unit="m" hint="完成時に合わせる高さです。">
              <NumberInput value={block.plannedHeight} onChange={(v) => onChange('plannedHeight', v)} />
            </FormField>
            <FormField label="労務単価" unit="円/人日" hint="1人1日あたりの基準単価です。">
              <NumberInput value={block.laborCost} onChange={(v) => onChange('laborCost', v)} />
            </FormField>
            <FormField label="据付段数" unit="段" hint="製品を何段積むか入力します。" className="col-span-2">
              <NumberInput value={block.stages} onChange={(v) => onChange('stages', v)} />
            </FormField>
          </div>
        </div>

        <div className="border border-yellow-300 rounded-md overflow-hidden">
          <SectionHeader title="掘削・残土搬出条件" color="bg-yellow-500" emoji="🏗" />
          <div className="p-3 bg-yellow-50">
            <p className="mb-3 text-[11px] leading-4 text-yellow-900/75">
              掘削に使う機械と、残土を搬出するダンプ車種を選びます。
            </p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="掘削機械" hint="バックホーなど、掘削に使う機械です。">
                <SelectInput
                  value={block.machine}
                  options={backhoes}
                  onChange={(v) => onChange('machine', v)}
                />
              </FormField>
              <FormField label="搬出ダンプ" hint="残土を運ぶダンプ車種です。">
                <SelectInput
                  value={block.dumpTruck}
                  options={dumpTrucks}
                  onChange={(v) => onChange('dumpTruck', v)}
                />
              </FormField>
            </div>
          </div>
        </div>

        <div className="border border-orange-300 rounded-md overflow-hidden">
          <SectionHeader title="砕石条件" color="bg-orange-500" emoji="🪨" />
          <div className="p-3 bg-orange-50">
            <p className="mb-3 text-[11px] leading-4 text-orange-900/75">
              ベース下に敷く砕石の種類と厚みを設定します。
            </p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="砕石の種類" hint="RC-40 などの砕石種類です。">
                <SelectInput
                  value={block.crushedStone}
                  options={crushedStones}
                  onChange={(v) => onChange('crushedStone', v)}
                />
              </FormField>
              <FormField label="砕石厚" unit="m" hint="敷きならす厚みです。">
                <NumberInput value={block.crushedStoneThickness} onChange={(v) => onChange('crushedStoneThickness', v)} />
              </FormField>
            </div>
          </div>
        </div>

        <div className="border border-green-300 rounded-md overflow-hidden">
          <SectionHeader title="ベースコンクリート条件" color="bg-green-600" emoji="🧱" />
          <div className="p-3 bg-green-50">
            <p className="mb-3 text-[11px] leading-4 text-green-900/75">
              ベース生コン、圧送機械、型枠に関する条件を入力します。
            </p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="ベース用生コン" hint="使用する生コン種別です。">
                <SelectInput
                  value={block.concrete}
                  options={concretes}
                  onChange={(v) => onChange('concrete', v)}
                />
              </FormField>
              <FormField label="ポンプ・圧送機" hint="打設や圧送に使う機械です。">
                <SelectInput
                  value={block.pumpTruck}
                  options={pumpTrucks}
                  onChange={(v) => onChange('pumpTruck', v)}
                />
              </FormField>
              <FormField label="ベース厚" unit="m" hint="ベースコンクリートの厚みです。">
                <NumberInput value={block.baseThickness} onChange={(v) => onChange('baseThickness', v)} />
              </FormField>
              <FormField label="型枠単価" unit="円/m²" hint="型枠の単価を入力します。">
                <NumberInput value={block.formworkCost} onChange={(v) => onChange('formworkCost', v)} />
              </FormField>
            </div>
          </div>
        </div>

        <div className="border border-pink-300 rounded-md overflow-hidden">
          <SectionHeader title="二次製品据付条件" color="bg-pink-500" emoji="🔧" />
          <div className="p-3 bg-pink-50">
            <p className="mb-3 text-[11px] leading-4 text-pink-900/75">
              製品寸法、据付条件、砂や運搬費などの材料条件を設定します。
            </p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="製品幅" unit="m" hint="二次製品の幅です。">
                <NumberInput value={block.productWidth} onChange={(v) => onChange('productWidth', v)} />
              </FormField>
              <FormField label="製品高さ" unit="m" hint="二次製品の高さです。">
                <NumberInput value={block.productHeight} onChange={(v) => onChange('productHeight', v)} />
              </FormField>
              <FormField label="製品長さ" unit="m" hint="1本あたりの長さです。">
                <SelectInput
                  value={block.productLength}
                  options={productLengths}
                  onChange={(v) => onChange('productLength', v)}
                />
              </FormField>
              <FormField label="据付労務単価" unit="円/人日" hint="据付作業の労務単価です。">
                <NumberInput value={block.installLaborCost} onChange={(v) => onChange('installLaborCost', v)} />
              </FormField>
              <FormField label="施工条件係数" unit="倍" hint="施工しやすさに応じて補正します。">
                <SelectInput
                  value={block.workabilityFactor}
                  options={workabilityFactors}
                  onChange={(v) => onChange('workabilityFactor', v)}
                />
              </FormField>
              <FormField label="砂単価" unit="円/m³" hint="モルタル用の砂単価です。">
                <NumberInput value={block.sandCost} onChange={(v) => onChange('sandCost', v)} />
              </FormField>
              <FormField label="運搬費" unit="円" hint="製品の送料や搬入費です。" className="col-span-2">
                <NumberInput value={block.shippingCost} onChange={(v) => onChange('shippingCost', v)} />
              </FormField>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
