import {
  backhoes,
  concretes,
  crushedStones,
  dumpTrucks,
  pumpTrucks,
  secondaryProducts,
} from './priceData';
import type { MasterType, PriceMasterItem } from './types';

const DEFAULT_EFFECTIVE_FROM = '2026-01-01';
const DEFAULT_SOURCE_NAME = '初期単価マスタ';
const DEFAULT_SOURCE_VERSION = 'v1.0';
const DEFAULT_REGION = '未設定';
const DEFAULT_VENDOR = '共通';

const roadMasterSeeds = [
  { name: 'As舗装 t=5cm', price: 3500 },
  { name: 'As舗装 t=4cm', price: 3000 },
  { name: 'As舗装 t=3cm', price: 2500 },
  { name: '路盤 t=15cm', price: 2000 },
  { name: '路盤 t=10cm', price: 1500 },
  { name: 'カッター入れ', price: 500 },
  { name: '舗装撤去 t=5cm', price: 1200 },
  { name: '舗装撤去 t=10cm', price: 1800 },
];

const cutterMasterSeeds = [
  { name: 'カッター入れ As t=5cm', price: 500 },
  { name: 'カッター入れ As t=10cm', price: 800 },
  { name: 'カッター入れ Co t=15cm', price: 1200 },
  { name: 'カッター入れ Co t=20cm', price: 1500 },
];

const miscMasterSeeds = [
  { name: 'セメント単価', price: 600, unit: '袋', notes: 'モルタル用セメント袋単価', code: 'MISC-CEMENT-BAG' },
  { name: '砂単価（初期値）', price: 0, unit: 'm3', notes: '画面入力で上書きする初期値', code: 'MISC-SAND-INPUT' },
  { name: 'As殻処分', price: 7000, unit: 'm3', notes: 'アスファルト殻の運搬・処分単価', code: 'MISC-AS-DISPOSAL' },
  { name: 'Co殻処分', price: 12000, unit: 'm3', notes: 'コンクリート殻の運搬・処分単価', code: 'MISC-CO-DISPOSAL' },
  { name: 'コンクリート撤去 t=15cm', price: 9500, unit: 'm2', notes: '無筋コンクリート撤去単価', code: 'MISC-CO-DEMO-15' },
  { name: 'コンクリート撤去 t=20cm', price: 12500, unit: 'm2', notes: 'コンクリート構造物撤去単価', code: 'MISC-CO-DEMO-20' },
];

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9一-龯ぁ-んァ-ヶ]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'master-item';
}

function normalizeAliasSeed(name: string): string[] {
  const compact = name.replace(/[\s　]+/g, '');
  const normalized = compact
    .replace(/ｺ/g, 'コ')
    .replace(/ﾎ/g, 'ホ')
    .replace(/ｰ/g, 'ー')
    .replace(/ﾄ/g, 'ト')
    .replace(/ﾙ/g, 'ル');
  return Array.from(new Set([name, compact, normalized])).filter(Boolean);
}

function createMasterItem(
  masterType: MasterType,
  name: string,
  unitPrice: number,
  unit: string,
  options?: Partial<Pick<PriceMasterItem, 'aliases' | 'notes' | 'sourceName' | 'sourceVersion' | 'effectiveFrom' | 'effectiveTo' | 'vendor' | 'region' | 'sourcePage' | 'code'>>,
): PriceMasterItem {
  return {
    id: `${masterType}:${slugify(name)}`,
    masterType,
    code: options?.code ?? `${masterType.toUpperCase()}-${slugify(name)}`,
    name,
    aliases: options?.aliases ?? normalizeAliasSeed(name),
    unitPrice,
    unit,
    effectiveFrom: options?.effectiveFrom ?? DEFAULT_EFFECTIVE_FROM,
    effectiveTo: options?.effectiveTo ?? null,
    sourceName: options?.sourceName ?? DEFAULT_SOURCE_NAME,
    sourceVersion: options?.sourceVersion ?? DEFAULT_SOURCE_VERSION,
    sourcePage: options?.sourcePage ?? null,
    vendor: options?.vendor ?? DEFAULT_VENDOR,
    region: options?.region ?? DEFAULT_REGION,
    notes: options?.notes ?? '',
  };
}

export function createSeedMasterItems(): PriceMasterItem[] {
  const items: PriceMasterItem[] = [];

  for (const item of secondaryProducts) {
    items.push(createMasterItem('secondary_product', item.name, item.price, '本', { notes: '二次製品単価' }));
  }
  for (const item of backhoes) {
    items.push(createMasterItem('machine', item.name, item.price, '日', { notes: `機械容量:${item.capacity}m3` }));
  }
  for (const item of dumpTrucks) {
    items.push(createMasterItem('dump_truck', item.name, item.price, '台日', { notes: `積載容量:${item.capacity}m3` }));
  }
  for (const item of crushedStones) {
    items.push(createMasterItem('crushed_stone', item.name, item.price, 'm3', { notes: '砕石材料単価' }));
  }
  for (const item of concretes) {
    items.push(createMasterItem('concrete', item.name, item.price, 'm3', { notes: '生コン・モルタル単価' }));
  }
  for (const item of pumpTrucks) {
    items.push(createMasterItem('pump_truck', item.name, item.price, '回', { notes: 'ポンプ・圧送単価' }));
  }
  for (const item of roadMasterSeeds) {
    items.push(createMasterItem('road', item.name, item.price, 'm2', { notes: '道路工単価' }));
  }
  for (const item of cutterMasterSeeds) {
    items.push(createMasterItem('cutter', item.name, item.price, 'm', { notes: 'カッター単価' }));
  }

  items.push(createMasterItem('labor', '標準労務単価', 27500, '人日', {
    code: 'LABOR-STANDARD',
    notes: '既定の標準労務単価',
  }));
  for (const item of miscMasterSeeds) {
    items.push(createMasterItem('misc', item.name, item.price, item.unit, {
      code: item.code,
      notes: item.notes,
    }));
  }

  return items;
}

export function isMasterEffective(item: PriceMasterItem, effectiveDate: string): boolean {
  if (item.effectiveFrom > effectiveDate) {
    return false;
  }
  if (item.effectiveTo && item.effectiveTo < effectiveDate) {
    return false;
  }
  return true;
}

export function filterMasterItems(
  items: PriceMasterItem[],
  query: { masterType?: string | null; keyword?: string | null; effectiveDate?: string | null },
): PriceMasterItem[] {
  const keyword = query.keyword?.trim().toLowerCase() ?? '';
  const effectiveDate = query.effectiveDate?.trim() ?? '';

  return items.filter((item) => {
    if (query.masterType && item.masterType !== query.masterType) {
      return false;
    }
    if (keyword) {
      const haystack = [item.name, item.code, ...item.aliases].join(' ').toLowerCase();
      if (!haystack.includes(keyword)) {
        return false;
      }
    }
    if (effectiveDate && !isMasterEffective(item, effectiveDate)) {
      return false;
    }
    return true;
  });
}

export function findMasterByName(
  items: PriceMasterItem[],
  masterType: MasterType,
  name: string,
  effectiveDate: string,
): PriceMasterItem | null {
  const matched = items.find((item) => (
    item.masterType === masterType
    && item.name === name
    && isMasterEffective(item, effectiveDate)
  ));

  return matched ?? null;
}
