import PriceTable from './PriceTable';

// 生コン・廃材処理単価表
export function ConcretePriceTable() {
  return (
    <PriceTable
      title="生コン・廃材処理単価表"
      masterTypes={['concrete', 'misc']}
      description="生コン、モルタル、産廃処分、補助材料などの単価を管理します。擁壁工・撤去工・二次製品工の根拠として利用されます。"
    />
  );
}

// 道路単価表
export function RoadPriceTable() {
  return (
    <PriceTable
      title="道路単価表"
      masterTypes={['road']}
      description="舗装・路盤など道路工の標準単価を管理します。"
    />
  );
}

// 二次製品単価表
export function SecondaryPriceTable() {
  return (
    <PriceTable
      title="二次製品単価表"
      masterTypes={['secondary_product']}
      description="二次製品の材料単価を有効日付きで管理します。AI候補で拾った製品名との照合にも使います。"
    />
  );
}

// 機械単価表ページ（特殊レイアウト）
export function MachinesPriceTable() {
  return (
    <PriceTable
      title="機械単価表"
      masterTypes={['machine', 'dump_truck', 'pump_truck', 'labor']}
      description="重機、ダンプ、ポンプ、労務など施工単価の根拠マスタを管理します。"
    />
  );
}

// カッター単価表
export function CutterPriceTable() {
  return (
    <PriceTable
      title="カッター単価表"
      masterTypes={['cutter']}
      description="カッター工の単価を管理します。"
    />
  );
}
