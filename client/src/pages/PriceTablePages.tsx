import PriceTable from './PriceTable';
import { secondaryProducts, concretes, backhoes, dumpTrucks, crushedStones, pumpTrucks } from '@/lib/priceData';

// 生コン・廃材処理単価表
export function ConcretePriceTable() {
  return (
    <PriceTable
      title="生コン・廃材処理単価表"
      storageKey="price-table-concrete"
      defaultData={concretes}
    />
  );
}

// 道路単価表
export function RoadPriceTable() {
  const roadItems = [
    { name: 'As舗装 t=5cm', price: 3500 },
    { name: 'As舗装 t=4cm', price: 3000 },
    { name: 'As舗装 t=3cm', price: 2500 },
    { name: '路盤 t=15cm', price: 2000 },
    { name: '路盤 t=10cm', price: 1500 },
    { name: 'カッター入れ', price: 500 },
    { name: '舗装撤去 t=5cm', price: 1200 },
    { name: '舗装撤去 t=10cm', price: 1800 },
  ];
  return (
    <PriceTable
      title="道路単価表"
      storageKey="price-table-road"
      defaultData={roadItems}
    />
  );
}

// 二次製品単価表
export function SecondaryPriceTable() {
  return (
    <PriceTable
      title="二次製品単価表"
      storageKey="price-table-secondary"
      defaultData={secondaryProducts}
    />
  );
}

// 機械単価表ページ（特殊レイアウト）
export function MachinesPriceTable() {
  const machineItems = [
    ...backhoes.map(b => ({ name: b.name, price: b.price })),
    ...dumpTrucks.map(d => ({ name: d.name, price: d.price })),
    ...pumpTrucks.map(p => ({ name: p.name, price: p.price })),
  ];
  return (
    <PriceTable
      title="機械単価表"
      storageKey="price-table-machines"
      defaultData={machineItems}
    />
  );
}

// カッター単価表
export function CutterPriceTable() {
  const cutterItems = [
    { name: 'カッター入れ As t=5cm', price: 500 },
    { name: 'カッター入れ As t=10cm', price: 800 },
    { name: 'カッター入れ Co t=15cm', price: 1200 },
    { name: 'カッター入れ Co t=20cm', price: 1500 },
  ];
  return (
    <PriceTable
      title="カッター単価表"
      storageKey="price-table-cutter"
      defaultData={cutterItems}
    />
  );
}
