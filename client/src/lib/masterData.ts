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

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function compactText(value: string): string {
  return value.normalize('NFKC').replace(/[\s　]+/g, '');
}

export function normalizeLookupText(value: string): string {
  return compactText(value)
    .toUpperCase()
    .replace(/[‐‑‒–—―ーｰ－]/g, '-')
    .replace(/[×✕╳＊*]/g, 'X')
    .replace(/M\^?3|㎥/g, 'M3')
    .replace(/バックホウ|バックホー/g, 'BH')
    .replace(/ダンプトラック/g, 'ダンプ')
    .replace(/NO\./g, 'NO')
    .replace(/№/g, 'NO')
    .replace(/φ/g, '')
    .replace(/[^A-Z0-9一-龯ぁ-んァ-ヶ]/g, '');
}

function capacityVariants(capacity: number): string[] {
  if (!Number.isFinite(capacity) || capacity <= 0) return [];
  return uniqueStrings([
    capacity.toFixed(2),
    String(Number(capacity.toFixed(2))),
    capacity.toFixed(1),
  ]);
}

function tonnageVariants(value: string): string[] {
  const match = value.normalize('NFKC').match(/(\d+(?:\.\d+)?)\s*Tダンプ/i);
  if (!match) return [];
  return uniqueStrings([
    match[1],
    String(Number(match[1])),
  ]);
}

function normalizeAliasSeed(name: string): string[] {
  return uniqueStrings([name, compactText(name), normalizeLookupText(name)]);
}

function buildMachineAliases(name: string, capacity: number): string[] {
  const values = [...normalizeAliasSeed(name)];
  for (const variant of capacityVariants(capacity)) {
    values.push(
      `${variant}BH`,
      `BH${variant}`,
      `バックホウ ${variant}m3`,
      `バックホウ${variant}m3`,
      `バックホー ${variant}m3`,
      `バックホー${variant}m3`,
    );
  }
  return uniqueStrings(values);
}

function buildDumpAliases(name: string, capacity: number): string[] {
  const values = [...normalizeAliasSeed(name)];
  const tonnages = tonnageVariants(name);
  const capacities = capacityVariants(capacity);
  for (const tonnage of tonnages) {
    values.push(`${tonnage}Tダンプ`, `${tonnage}tダンプ`, `${tonnage}tダンプトラック`);
    for (const volume of capacities) {
      values.push(`${tonnage}Tダンプ ${volume}m3`, `${tonnage}tダンプ ${volume}m3`, `${tonnage}Tダンプ${volume}m3`);
    }
  }
  return uniqueStrings(values);
}

function buildStoneAliases(name: string): string[] {
  const normalized = name.normalize('NFKC').toUpperCase();
  const values = [...normalizeAliasSeed(name)];
  if (normalized.includes('RC-40') || normalized.includes('RC40')) {
    values.push('RC-40', 'RC40', '再生砕石 RC-40', '再生砕石RC-40');
  }
  if (normalized.includes('C-40') || normalized.includes('C40')) {
    values.push('C-40', 'C40', '砕石 C-40', '砕石C-40');
  }
  return uniqueStrings(values);
}

function buildConcreteAliases(name: string): string[] {
  const compact = compactText(name);
  const values = [...normalizeAliasSeed(name)];
  const mixMatch = compact.match(/(\d{2})-(\d{1,2})-(\d{2})([A-Z]{0,3})/i);
  if (mixMatch) {
    const canonical = `${mixMatch[1]}-${mixMatch[2]}-${mixMatch[3]}${mixMatch[4] ?? ''}`;
    const padded = `${mixMatch[1]}-${mixMatch[2].padStart(2, '0')}-${mixMatch[3]}${mixMatch[4] ?? ''}`;
    values.push(canonical, padded, `生コン ${canonical}`, `生コン${canonical}`, `生コン ${padded}`, `生コン${padded}`);
  }
  return uniqueStrings(values);
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
    items.push(createMasterItem('machine', item.name, item.price, '日', {
      aliases: buildMachineAliases(item.name, item.capacity),
      notes: `機械容量:${item.capacity}m3`,
    }));
  }
  for (const item of dumpTrucks) {
    items.push(createMasterItem('dump_truck', item.name, item.price, '台日', {
      aliases: buildDumpAliases(item.name, item.capacity),
      notes: `積載容量:${item.capacity}m3`,
    }));
  }
  for (const item of crushedStones) {
    items.push(createMasterItem('crushed_stone', item.name, item.price, 'm3', {
      aliases: buildStoneAliases(item.name),
      notes: '砕石材料単価',
    }));
  }
  for (const item of concretes) {
    items.push(createMasterItem('concrete', item.name, item.price, 'm3', {
      aliases: buildConcreteAliases(item.name),
      notes: '生コン・モルタル単価',
    }));
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
  const keyword = query.keyword?.trim() ?? '';
  const normalizedKeyword = keyword ? normalizeLookupText(keyword) : '';
  const effectiveDate = query.effectiveDate?.trim() ?? '';

  return items.filter((item) => {
    if (query.masterType && item.masterType !== query.masterType) {
      return false;
    }
    if (keyword) {
      const haystack = uniqueStrings([item.name, item.code, ...item.aliases]);
      const matched = haystack.some((value) => (
        value.toLowerCase().includes(keyword.toLowerCase())
        || normalizeLookupText(value).includes(normalizedKeyword)
      ));
      if (!matched) {
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
  const activeItems = items.filter((item) => item.masterType === masterType && isMasterEffective(item, effectiveDate));
  if (activeItems.length === 0 || !name.trim()) {
    return null;
  }

  const exactNameMatches = activeItems.filter((item) => item.name === name);
  if (exactNameMatches.length === 1) {
    return exactNameMatches[0];
  }

  const exactAliasMatches = activeItems.filter((item) => item.aliases.includes(name));
  if (exactAliasMatches.length === 1) {
    return exactAliasMatches[0];
  }

  const normalizedTarget = normalizeLookupText(name);
  if (!normalizedTarget) {
    return null;
  }

  const normalizedMatches = activeItems.filter((item) => {
    const lookupValues = uniqueStrings([item.name, item.code, ...item.aliases]).map(normalizeLookupText);
    return lookupValues.includes(normalizedTarget);
  });

  return normalizedMatches.length === 1 ? normalizedMatches[0] : null;
}

export function canonicalizeMasterName(
  items: PriceMasterItem[],
  masterType: MasterType,
  rawName: string,
  effectiveDate: string,
): { value: string; matched: boolean } {
  const matched = findMasterByName(items, masterType, rawName, effectiveDate);
  if (!matched) {
    return { value: rawName, matched: false };
  }
  return { value: matched.name, matched: true };
}
