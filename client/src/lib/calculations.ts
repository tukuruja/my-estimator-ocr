import type {
  BlockType,
  CalculationDetailSection,
  CalculationEvidence,
  CalculationLineItem,
  CalculationMetricRow,
  CalculationResult,
  CalculationZoneBreakdown,
  EstimateBlock,
  EstimateZone,
  MasterType,
  PriceMasterItem,
} from './types';
import {
  backhoes,
  concretes,
  crushedStones,
  dumpTrucks,
  productLengths,
  secondaryProducts,
  workabilityFactors,
  getFourHourExcavationCoefficient,
  getPouringWorkers,
  getLooseningFactor,
} from './priceData';
import { createSeedMasterItems, findMasterByName } from './masterData';

const SEED_MASTERS = createSeedMasterItems();
const DEFAULT_EFFECTIVE_DATE = '2026-03-12';

/**
 * 寸法値をメートル単位に正規化する関数
 * ユーザーがmm単位(例: 345)やcm単位(例: 34.5)で入力した場合を自動検出してmに変換
 *
 * 判定基準（二次製品・擁壁等の断面寸法向け）:
 *   - 10以上     → mm入力と判断 → ÷1000
 *   - 1以上10未満 → cm入力と判断 → ÷100（ただし現実的に1〜3m程度はm入力の可能性もあるため閾値は製品タイプに依存）
 *   - 1未満      → m入力と判断  → そのまま
 *
 * contextHint: 'product'(二次製品寸法), 'wall'(擁壁高さ), 'thickness'(厚み)
 */
/**
 * バックホー標準日当たり施工量（地山m³/日）- 国交省土木工事積算基準準拠
 * 普通土・掘削積込み（バケット容量別）
 * ※ 二次製品据付のような小規模掘削は市街地制約で60〜70%に低下
 */
function getStandardDailyExcavation(capacity: number): number {
  if (capacity <= 0.07) return 12;  // 0.07m³級: 12m³/日
  if (capacity <= 0.10) return 18;  // 0.10m³級: 18m³/日
  if (capacity <= 0.12) return 22;  // 0.12m³級: 22m³/日
  if (capacity <= 0.15) return 28;  // 0.15m³級: 28m³/日
  if (capacity <= 0.20) return 38;  // 0.20m³級: 38m³/日
  if (capacity <= 0.25) return 50;  // 0.25m³級: 50m³/日
  if (capacity <= 0.40) return 75;  // 0.40m³級: 75m³/日
  if (capacity <= 0.45) return 85;  // 0.45m³級: 85m³/日
  if (capacity <= 0.70) return 120; // 0.70m³級: 120m³/日
  return 150;
}

function normalizeToMeters(value: number, contextHint: 'product' | 'wall' | 'thickness' = 'product'): number {
  if (value <= 0) return 0;
  if (contextHint === 'product') {
    // 二次製品: 幅・高さは通常0.05m〜2.0m。10以上はmm入力
    if (value >= 10) return value / 1000;
    // 1.0〜9.99はcm入力の可能性が高い（5cmの製品はないが5mの製品もまずない）
    // ただし擁壁等で2.0mはあり得るので、productのみ厳しく判定
    if (value >= 3.0) return value / 100;
    return value;
  }
  if (contextHint === 'wall') {
    // 擁壁: 高さは0.5m〜10m程度。100以上はmm入力
    if (value >= 100) return value / 1000;
    if (value >= 10) return value / 100;
    return value;
  }
  // thickness: 砕石厚・基礎厚。通常0.05m〜1.0m。1以上はcm/mm
  if (value >= 100) return value / 1000;
  if (value >= 1.0) return value / 100;
  return value;
}

type CalculationOptions = {
  masters?: PriceMasterItem[];
  effectiveDate?: string;
};

interface RateContext {
  masters: PriceMasterItem[];
  effectiveDate: string;
  laborCost: number;
  machineUnitPrice: number;
  machineCapacity: number;
  dumpVehicleUnitPrice: number;
  dumpCapacity: number;
  stoneUnitPrice: number;
  concreteUnitPrice: number;
  productUnitPrice: number;
  cementUnitPrice: number;
}

interface ZoneResolvedValues {
  temporaryRestorationRate: number;
  coordinationAdjustmentRate: number;
}

type MachineLike = PriceMasterItem | { price: number; capacity: number } | null;
type PricedLike = PriceMasterItem | { price: number } | null;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function metric(label: string, value: number, unit?: string, valueKind: CalculationMetricRow['valueKind'] = 'number'): CalculationMetricRow {
  return { label, value, unit, valueKind };
}

function createLineItem(input: CalculationLineItem): CalculationLineItem {
  return {
    ...input,
    quantity: round2(input.quantity),
    unitPrice: Math.round(input.unitPrice),
    amount: Math.round(input.amount),
  };
}

function createEvidence(input: CalculationEvidence): CalculationEvidence {
  return input;
}

function emptyResult(workType: BlockType, displayName: string, primaryUnit: string = 'm'): CalculationResult {
  return {
    excavationWidth: 0,
    excavationHeight: 0,
    excavationVolume: 0,
    fourHourExcavation: 0,
    excavationDays: 0,
    excavationDailyWorkers: 0,
    excavationWorkers: 0,
    machineUnitPrice: 0,
    machineAmount: 0,
    excavationConstructionAmount: 0,
    excavationUnitPerM: 0,
    soilRemovalVolume: 0,
    soilRemovalDays: 0,
    dumpCapacity: 0,
    dumpCount: 0,
    dumpVehicleUnitPrice: 0,
    regularDumpCount: 0,
    regularDumpUnitPrice: 0,
    soilRemovalAmount: 0,
    soilRemovalUnitPerM: 0,
    backfillVolume: 0,
    backfillDays: 0,
    backfillWorkers: 0,
    backfillLaborCost: 0,
    crushedStoneVolume: 0,
    crushedStoneWorkers: 0,
    crushedStoneDays: 0,
    crushedStoneLaborCost: 0,
    crushedStoneMachineCost: 0,
    crushedStoneConstructionAmount: 0,
    crushedStoneMaterialCost: 0,
    crushedStoneTotal: 0,
    crushedStoneUnitPerM: 0,
    baseWidth: 0,
    baseConcreteVolume: 0,
    concreteUnitPrice: 0,
    pouringWorkers: 0,
    formworkArea: 0,
    formworkMaterialCost: 0,
    baseTotalAmount: 0,
    baseUnitPerM: 0,
    mortar: 0,
    sand: 0,
    sandAmount: 0,
    cement: 0,
    cementAmount: 0,
    water: 0,
    productUnitPrice: 0,
    productCount: 0,
    materialTotalCost: 0,
    installWorkers: 0,
    secondaryProductTotal: 0,
    secondaryProductUnitPerM: 0,
    workType,
    displayName,
    primaryQuantity: 0,
    primaryUnit,
    totalAmount: 0,
    totalAmountPerPrimaryUnit: 0,
    detailSections: [],
    lineItems: [],
    priceEvidence: [],
    zoneBreakdowns: [],
  };
}

function resolveMasters(input?: PriceMasterItem[]): PriceMasterItem[] {
  return input && input.length > 0 ? input : SEED_MASTERS;
}

function resolvePricedValue(item: PricedLike): number {
  if (!item) return 0;
  if ('unitPrice' in item) {
    return Number(item.unitPrice);
  }
  return Number(item.price);
}

function resolveCapacityValue(item: MachineLike): number {
  if (!item || !('capacity' in item)) {
    return 0;
  }
  return Number(item.capacity);
}

function adoptMaster(masters: PriceMasterItem[], masterType: MasterType, name: string, effectiveDate: string): PriceMasterItem | null {
  if (!name) return null;
  return findMasterByName(masters, masterType, name, effectiveDate);
}

function adoptAcrossMasters(
  masters: PriceMasterItem[],
  masterTypes: MasterType[],
  name: string,
  effectiveDate: string,
): PriceMasterItem | null {
  for (const masterType of masterTypes) {
    const matched = adoptMaster(masters, masterType, name, effectiveDate);
    if (matched) return matched;
  }
  return null;
}

function nearestThicknessMaster(
  masters: PriceMasterItem[],
  masterType: MasterType,
  namePatterns: string[],
  thicknessMeters: number,
  effectiveDate: string,
): PriceMasterItem | null {
  const candidates = masters.filter((item) => (
    item.masterType === masterType
    && item.effectiveFrom <= effectiveDate
    && (!item.effectiveTo || item.effectiveTo >= effectiveDate)
    && namePatterns.some((pattern) => item.name.includes(pattern))
  ));
  if (candidates.length === 0) return null;

  const targetCm = Math.max(1, Math.round(thicknessMeters * 100));
  const withDistance = candidates.map((item) => {
    const match = item.name.match(/t\s*=\s*(\d+(?:\.\d+)?)\s*cm/i);
    const thicknessCm = match ? Number(match[1]) : targetCm;
    return {
      item,
      distance: Math.abs(thicknessCm - targetCm),
    };
  });

  withDistance.sort((a, b) => a.distance - b.distance || a.item.unitPrice - b.item.unitPrice);
  return withDistance[0]?.item ?? null;
}

function roadMasterForSurface(masters: PriceMasterItem[], thicknessMeters: number, effectiveDate: string): PriceMasterItem | null {
  return nearestThicknessMaster(masters, 'road', ['As舗装'], thicknessMeters, effectiveDate);
}

function roadMasterForBase(masters: PriceMasterItem[], thicknessMeters: number, effectiveDate: string): PriceMasterItem | null {
  return nearestThicknessMaster(masters, 'road', ['路盤'], thicknessMeters, effectiveDate);
}

function cutterMasterForThickness(masters: PriceMasterItem[], thicknessMeters: number, target: string, effectiveDate: string): PriceMasterItem | null {
  const pattern = /co|concrete|コン|コンクリ/i.test(target) ? 'Co' : 'As';
  return nearestThicknessMaster(masters, 'cutter', [pattern], thicknessMeters, effectiveDate);
}

function miscMasterByKeyword(masters: PriceMasterItem[], keyword: string, effectiveDate: string): PriceMasterItem | null {
  return masters.find((item) => (
    item.masterType === 'misc'
    && item.effectiveFrom <= effectiveDate
    && (!item.effectiveTo || item.effectiveTo >= effectiveDate)
    && item.name.includes(keyword)
  )) ?? null;
}

function buildRateContext(block: EstimateBlock, options?: CalculationOptions): RateContext {
  const masters = resolveMasters(options?.masters);
  const effectiveDate = options?.effectiveDate ?? DEFAULT_EFFECTIVE_DATE;
  const fallbackMachine = backhoes.find((item) => item.name === block.machine) ?? null;
  const fallbackDump = dumpTrucks.find((item) => item.name === block.dumpTruck) ?? null;
  const fallbackStone = crushedStones.find((item) => item.name === block.crushedStone) ?? null;
  const fallbackConcrete = concretes.find((item) => item.name === block.concrete) ?? null;
  const fallbackProduct = secondaryProducts.find((item) => item.name === block.secondaryProduct) ?? null;

  const selectedMachine = adoptMaster(masters, 'machine', block.machine, effectiveDate)
    ?? fallbackMachine
    ?? null;
  const selectedDump = adoptMaster(masters, 'dump_truck', block.dumpTruck, effectiveDate)
    ?? fallbackDump
    ?? null;
  const selectedStone = adoptMaster(masters, 'crushed_stone', block.crushedStone, effectiveDate)
    ?? fallbackStone
    ?? null;
  const selectedConcrete = adoptMaster(masters, 'concrete', block.concrete, effectiveDate)
    ?? fallbackConcrete
    ?? null;
  const selectedProduct = adoptMaster(masters, 'secondary_product', block.secondaryProduct, effectiveDate)
    ?? fallbackProduct
    ?? null;
  const selectedLabor = adoptMaster(masters, 'labor', '標準労務単価', effectiveDate);
  const selectedCement = adoptMaster(masters, 'misc', 'セメント単価', effectiveDate);

  return {
    masters,
    effectiveDate,
    laborCost: block.laborCost || selectedLabor?.unitPrice || 27500,
    machineUnitPrice: resolvePricedValue(selectedMachine),
    machineCapacity: resolveCapacityValue(selectedMachine) || Number(fallbackMachine?.capacity ?? 0),
    dumpVehicleUnitPrice: resolvePricedValue(selectedDump),
    dumpCapacity: resolveCapacityValue(selectedDump) || Number(fallbackDump?.capacity ?? 0),
    stoneUnitPrice: resolvePricedValue(selectedStone) || Number(fallbackStone?.price ?? 0),
    concreteUnitPrice: resolvePricedValue(selectedConcrete) || Number(fallbackConcrete?.price ?? 0),
    productUnitPrice: resolvePricedValue(selectedProduct) || Number(fallbackProduct?.price ?? 0),
    cementUnitPrice: selectedCement?.unitPrice ?? 600,
  };
}

function createMasterEvidence(
  lineItemKey: string,
  estimateItemName: string,
  master: PriceMasterItem | null,
  fallback: {
    masterType: CalculationEvidence['masterType'];
    masterName: string;
    adoptedUnitPrice: number;
    unit: string;
    reason: string;
    requiresReview?: boolean;
    sourceName?: string;
    sourceVersion?: string;
  },
): CalculationEvidence {
  if (!master) {
    return createEvidence({
      lineItemKey,
      estimateItemName,
      masterType: fallback.masterType,
      masterName: fallback.masterName,
      adoptedUnitPrice: fallback.adoptedUnitPrice,
      unit: fallback.unit,
      sourceName: fallback.sourceName ?? '入力値',
      sourceVersion: fallback.sourceVersion ?? 'manual',
      effectiveFrom: DEFAULT_EFFECTIVE_DATE,
      effectiveTo: null,
      sourcePage: null,
      reason: fallback.reason,
      requiresReview: fallback.requiresReview ?? true,
    });
  }

  return createEvidence({
    lineItemKey,
    estimateItemName,
    masterType: master.masterType,
    masterName: master.name,
    adoptedUnitPrice: master.unitPrice,
    unit: master.unit,
    sourceName: master.sourceName,
    sourceVersion: master.sourceVersion,
    effectiveFrom: master.effectiveFrom,
    effectiveTo: master.effectiveTo,
    sourcePage: master.sourcePage,
    reason: fallback.reason,
    requiresReview: fallback.requiresReview ?? false,
  });
}

function finalizeCommonResult(result: CalculationResult): CalculationResult {
  const totalAmount = result.lineItems.reduce((sum, item) => sum + item.amount, 0);
  return {
    ...result,
    totalAmount: Math.round(totalAmount),
    totalAmountPerPrimaryUnit: result.primaryQuantity > 0 ? Math.round(totalAmount / result.primaryQuantity) : 0,
  };
}

function computeSplitSetupUnitPrice(block: EstimateBlock, context: RateContext): number {
  return Math.round(
    context.laborCost * (block.blockType === 'pavement' ? 1.4 : 1.8)
      + (context.machineUnitPrice > 0 ? context.machineUnitPrice * 0.35 : 0),
  );
}

function resolveZoneRates(zone: EstimateZone, block: EstimateBlock): ZoneResolvedValues {
  return {
    temporaryRestorationRate: Math.max(
      0,
      zone.temporaryRestorationRate > 0 ? zone.temporaryRestorationRate : (block.temporaryRestorationRate || 0),
    ) / 100,
    coordinationAdjustmentRate: Math.max(
      0,
      zone.coordinationAdjustmentRate > 0 ? zone.coordinationAdjustmentRate : (block.coordinationAdjustmentRate || 0),
    ) / 100,
  };
}

function applyPhasedExecutionAdjustments(
  result: CalculationResult,
  block: EstimateBlock,
  context: RateContext,
): CalculationResult {
  const phaseCount = Math.max(1, Math.round(block.splitPhaseCount || 1));
  const remobilizationCount = Math.max(0, Math.round(block.remobilizationCount || 0));
  const temporaryRestorationRate = Math.max(0, block.temporaryRestorationRate || 0) / 100;
  const coordinationAdjustmentRate = Math.max(0, block.coordinationAdjustmentRate || 0) / 100;
  const hasSplitExecution = phaseCount > 1 || remobilizationCount > 0 || temporaryRestorationRate > 0 || coordinationAdjustmentRate > 0;

  if (!hasSplitExecution) {
    return result;
  }

  const averagePhaseQuantity = phaseCount > 0 ? round2(result.primaryQuantity / phaseCount) : 0;
  const setupUnitPrice = computeSplitSetupUnitPrice(block, context);
  const setupAmount = remobilizationCount * setupUnitPrice;
  const temporaryRestorationQuantity = round2(result.primaryQuantity * temporaryRestorationRate);
  const temporaryRestorationUnitPrice = Math.round((result.totalAmountPerPrimaryUnit || 0) * 0.35);
  const temporaryRestorationAmount = Math.round(temporaryRestorationQuantity * temporaryRestorationUnitPrice);
  const coordinationAdjustmentAmount = Math.round(result.totalAmount * coordinationAdjustmentRate);

  const extraLineItems: CalculationLineItem[] = [
    createLineItem({
      key: `${result.workType}.splitSetup`,
      section: '分割施工',
      itemName: '再段取り・再搬入',
      specification: `${phaseCount} 区画施工 / 他工種調整`,
      quantity: remobilizationCount,
      unit: '回',
      unitPrice: setupUnitPrice,
      amount: setupAmount,
      remarks: '区画切替時の再段取り・再搬入を計上',
    }),
    createLineItem({
      key: `${result.workType}.temporaryRestore`,
      section: '分割施工',
      itemName: '仮復旧・仮養生',
      specification: `仮復旧率 ${block.temporaryRestorationRate}%`,
      quantity: temporaryRestorationQuantity,
      unit: result.primaryUnit,
      unitPrice: temporaryRestorationUnitPrice,
      amount: temporaryRestorationAmount,
      remarks: '先行引渡しや他工種開放に伴う仮復旧分',
    }),
    createLineItem({
      key: `${result.workType}.coordination`,
      section: '分割施工',
      itemName: '他工種調整補正',
      specification: `調整率 ${block.coordinationAdjustmentRate}%`,
      quantity: 1,
      unit: '式',
      unitPrice: coordinationAdjustmentAmount,
      amount: coordinationAdjustmentAmount,
      remarks: '住棟・設備・植栽・舗装などの工程干渉を反映',
    }),
  ].filter((item) => item.quantity > 0 || item.amount > 0);

  const extraEvidence: CalculationEvidence[] = [
    createEvidence({
      lineItemKey: `${result.workType}.splitSetup`,
      estimateItemName: '再段取り・再搬入',
      masterType: 'input',
      masterName: '分割施工再段取り',
      adoptedUnitPrice: setupUnitPrice,
      unit: '回',
      sourceName: '画面入力',
      sourceVersion: 'manual',
      effectiveFrom: DEFAULT_EFFECTIVE_DATE,
      effectiveTo: null,
      sourcePage: null,
      reason: '集合住宅外構の分割施工回数から算定',
      requiresReview: remobilizationCount <= 0,
    }),
    createEvidence({
      lineItemKey: `${result.workType}.temporaryRestore`,
      estimateItemName: '仮復旧・仮養生',
      masterType: 'derived',
      masterName: '仮復旧率',
      adoptedUnitPrice: temporaryRestorationUnitPrice,
      unit: result.primaryUnit,
      sourceName: '画面入力',
      sourceVersion: 'manual',
      effectiveFrom: DEFAULT_EFFECTIVE_DATE,
      effectiveTo: null,
      sourcePage: null,
      reason: '主数量 × 仮復旧率で算定',
      requiresReview: temporaryRestorationRate <= 0,
    }),
    createEvidence({
      lineItemKey: `${result.workType}.coordination`,
      estimateItemName: '他工種調整補正',
      masterType: 'derived',
      masterName: '他工種調整率',
      adoptedUnitPrice: coordinationAdjustmentAmount,
      unit: '式',
      sourceName: '画面入力',
      sourceVersion: 'manual',
      effectiveFrom: DEFAULT_EFFECTIVE_DATE,
      effectiveTo: null,
      sourcePage: null,
      reason: '直接工事費 × 他工種調整率で算定',
      requiresReview: coordinationAdjustmentRate <= 0,
    }),
  ].filter((item) => item.adoptedUnitPrice > 0 || item.requiresReview);

  return finalizeCommonResult({
    ...result,
    detailSections: [
      ...result.detailSections,
      {
        id: `${result.workType}-phased-execution`,
        title: '分割施工数量',
        tone: 'bg-violet-600',
        metrics: [
          metric('施工区画数', phaseCount, '区画'),
          metric('1区画平均数量', averagePhaseQuantity, result.primaryUnit),
          metric('再段取り回数', remobilizationCount, '回'),
          metric('仮復旧率', block.temporaryRestorationRate || 0, '%'),
          metric('仮復旧数量', temporaryRestorationQuantity, result.primaryUnit),
          metric('他工種調整率', block.coordinationAdjustmentRate || 0, '%'),
          metric('追加金額', setupAmount + temporaryRestorationAmount + coordinationAdjustmentAmount, '円', 'currency'),
        ],
      },
    ],
    lineItems: [...result.lineItems, ...extraLineItems],
    priceEvidence: [...result.priceEvidence, ...extraEvidence],
  });
}

function applyZoneBreakdowns(
  result: CalculationResult,
  block: EstimateBlock,
  context: RateContext,
): CalculationResult {
  const zones = Array.isArray(block.zones) ? block.zones.filter((zone) => zone.name.trim()) : [];
  if (zones.length === 0) {
    return result;
  }

  const normalizedZones = zones.map((zone) => ({
    ...zone,
    primaryQuantity: Math.max(0, Number(zone.primaryQuantity || 0)),
    remobilizationCount: Math.max(0, Math.round(zone.remobilizationCount || 0)),
  }));
  const totalZoneQuantity = normalizedZones.reduce((sum, zone) => sum + zone.primaryQuantity, 0);
  const hasQuantities = totalZoneQuantity > 0;
  const quantityBase = hasQuantities ? totalZoneQuantity : normalizedZones.length;
  const baseRate = result.primaryQuantity > 0 ? result.totalAmount / result.primaryQuantity : 0;
  const setupUnitPrice = computeSplitSetupUnitPrice(block, context);
  const temporaryRestorationUnitPrice = Math.round((result.totalAmountPerPrimaryUnit || 0) * 0.35);

  let allocatedBaseAmount = 0;
  const zoneBreakdowns: CalculationZoneBreakdown[] = normalizedZones.map((zone, index) => {
    const shareRaw = hasQuantities
      ? zone.primaryQuantity / quantityBase
      : 1 / normalizedZones.length;
    const baseAmount = index === normalizedZones.length - 1
      ? Math.max(0, result.totalAmount - allocatedBaseAmount)
      : Math.round(result.totalAmount * shareRaw);
    allocatedBaseAmount += baseAmount;

    const rates = resolveZoneRates(zone, block);
    const temporaryRestorationQuantity = round2(zone.primaryQuantity * rates.temporaryRestorationRate);
    const temporaryRestorationAmount = Math.round(temporaryRestorationQuantity * temporaryRestorationUnitPrice);
    const remobilizationAmount = Math.round(zone.remobilizationCount * setupUnitPrice);
    const coordinationAdjustmentAmount = Math.round(baseAmount * rates.coordinationAdjustmentRate);
    const totalAmount = baseAmount + remobilizationAmount + temporaryRestorationAmount + coordinationAdjustmentAmount;

    return {
      id: zone.id,
      name: zone.name,
      primaryQuantity: round2(zone.primaryQuantity),
      primaryUnit: result.primaryUnit,
      quantityShare: round2(shareRaw * 100),
      baseAmount,
      remobilizationCount: zone.remobilizationCount,
      remobilizationAmount,
      temporaryRestorationRate: round2(rates.temporaryRestorationRate * 100),
      temporaryRestorationQuantity,
      temporaryRestorationAmount,
      coordinationAdjustmentRate: round2(rates.coordinationAdjustmentRate * 100),
      coordinationAdjustmentAmount,
      totalAmount,
      drawingPageRefs: zone.drawingPageRefs,
      notePhotoUrls: zone.notePhotoUrls,
      relatedTradeNames: zone.relatedTradeNames,
      note: zone.note,
    };
  });

  const coverageRate = result.primaryQuantity > 0 && totalZoneQuantity > 0
    ? round2((totalZoneQuantity / result.primaryQuantity) * 100)
    : 0;

  return {
    ...result,
    detailSections: [
      ...result.detailSections,
      {
        id: `${result.workType}-zone-breakdowns`,
        title: '区画別見積',
        tone: 'bg-cyan-600',
        metrics: [
          metric('区画数', zoneBreakdowns.length, '区画'),
          metric('区画数量合計', totalZoneQuantity, result.primaryUnit),
          metric('総数量に対する配分率', coverageRate, '%'),
          metric('再段取り追加額', zoneBreakdowns.reduce((sum, zone) => sum + zone.remobilizationAmount, 0), '円', 'currency'),
          metric('仮復旧追加額', zoneBreakdowns.reduce((sum, zone) => sum + zone.temporaryRestorationAmount, 0), '円', 'currency'),
          metric('他工種調整追加額', zoneBreakdowns.reduce((sum, zone) => sum + zone.coordinationAdjustmentAmount, 0), '円', 'currency'),
        ],
      },
    ],
    zoneBreakdowns,
  };
}

function calculateSecondaryProduct(block: EstimateBlock, options?: CalculationOptions): CalculationResult {
  const context = buildRateContext(block, options);
  const result = emptyResult('secondary_product', block.secondaryProduct || '二次製品工', 'm');
  const distance = block.distance || 0;
  const currentHeight = block.currentHeight || 0;
  const plannedHeight = block.plannedHeight || 0;
  const laborCost = context.laborCost;
  const stages = block.stages || 1;
  // 寸法の単位正規化（ユーザーがmm/cm入力した場合を自動補正）
  const crushedStoneThickness = normalizeToMeters(block.crushedStoneThickness || 0, 'thickness');
  const baseThickness = normalizeToMeters(block.baseThickness || 0, 'thickness');
  const formworkCost = block.formworkCost || 0;
  const productWidth = normalizeToMeters(block.productWidth || 0, 'product');
  const productHeight = normalizeToMeters(block.productHeight || 0, 'product');
  const installLaborCost = block.installLaborCost || laborCost;
  const sandCost = block.sandCost || 0;
  const shippingCost = block.shippingCost || 0;

  const selectedLength = productLengths.find((item) => item.name === block.productLength);
  const productLengthValue = selectedLength?.value || 0;
  const selectedFactor = workabilityFactors.find((item) => item.name === block.workabilityFactor);
  const workabilityFactorValue = selectedFactor?.value || 1;

  // ほぐし係数L: 地盤条件から取得（空文字の場合はデフォルト砂質土 1.25）
  const soilL = getLooseningFactor(block.groundCondition || '');

  // === 掘削断面計算（国交省土木積算基準準拠） ===
  // 掘削幅 = 製品幅 + 両側余裕0.2m×2 = 製品幅 + 0.4m
  const excavationWidth = productWidth + 0.4;
  // 掘削深さ = (現況高−計画高) + 製品高さ + 砕石厚 + ベース厚
  // ※ currentHeight/plannedHeight はGL値。差分が床付けまでの切土量
  const cutDepth = Math.max(currentHeight - plannedHeight, 0);
  const excavationHeight = cutDepth + productHeight + crushedStoneThickness + baseThickness;
  // 地山土量 = 断面積 × 延長（ほぐし係数は掘削後の体積に適用）
  const excavationNaturalVolume = excavationWidth * excavationHeight * distance;
  // ほぐし土量 = 地山土量 × ほぐし係数L（ダンプ積載・搬出はほぐし土量）
  const excavationVolume = excavationNaturalVolume * soilL;

  // === 掘削日数・人工（国交省歩掛準拠） ===
  // 4時間掘削量 = 機械容量ベースの標準掘削量（地山ベース）
  const fourHourExcavation = context.machineCapacity > 0
    ? getStandardDailyExcavation(context.machineCapacity)
    : 0;
  const excavationDays = fourHourExcavation > 0 ? Math.ceil(excavationNaturalVolume / fourHourExcavation) : Math.max(1, Math.ceil(distance / 20));
  // 掘削作業班: 機械オペ1名 + 手元1名（二次製品据付は通常小規模）
  const excavationDailyWorkers = 2;
  const excavationWorkers = excavationDays * excavationDailyWorkers;
  const machineAmount = excavationDays * context.machineUnitPrice;
  const excavationConstructionAmount = (excavationWorkers * laborCost) + machineAmount;

  // === 埋め戻し（国交省基準: 製品周囲を埋め戻す） ===
  // 埋め戻し体積 = (掘削断面 - 製品断面 - 砕石断面 - ベース断面) × 延長
  const productCrossSection = productWidth * productHeight * stages;
  const stoneCrossSection = excavationWidth * crushedStoneThickness;
  const baseCrossSection = (productWidth + 0.1) * baseThickness;
  const backfillNaturalVolume = Math.max(
    (excavationWidth * excavationHeight - productCrossSection - stoneCrossSection - baseCrossSection) * distance,
    0,
  );
  // 埋め戻し時は締固め後の体積なので、ほぐし土量ではなく締固め係数Cを適用
  const compactionFactor = 0.9; // 締固め係数C（砂質土標準）
  const backfillVolume = backfillNaturalVolume * compactionFactor;
  // 埋め戻し歩掛: 人力タンパ 3.5m³/人日（国交省標準）
  const backfillProductivity = 3.5;
  const backfillWorkers = backfillVolume > 0 ? Math.ceil(backfillVolume / backfillProductivity) : 0;
  const backfillLaborCost = backfillWorkers * laborCost;

  // === 残土搬出 ===
  // 残土量 = 掘削ほぐし土量 - 埋め戻し必要量（ほぐし換算）
  const backfillLooseVolume = backfillNaturalVolume * soilL;
  const soilRemovalVolume = Math.max(excavationVolume - backfillLooseVolume, 0);
  // ダンプ延べ台数 = 残土量 ÷ ダンプ積載量
  const dumpCount = context.dumpCapacity > 0 ? Math.ceil(soilRemovalVolume / context.dumpCapacity) : 0;
  // 搬出日数 = 延べ台数 ÷ 1日稼働台数（距離15km往復想定で1日4〜5往復/台）
  const tripsPerDayPerDump = 4;
  const dumpLoadsPerDay = tripsPerDayPerDump; // 1台あたり1日の往復回数
  const soilRemovalDays = dumpCount > 0 ? Math.ceil(dumpCount / dumpLoadsPerDay) : 0;
  // 必要ダンプ台数（1日あたり）
  const regularDumpCount = soilRemovalDays > 0 ? Math.ceil(dumpCount / soilRemovalDays) : 0;
  // 残土搬出金額 = ダンプ費用 + 積込補助労務
  const soilRemovalAmount = (dumpCount * context.dumpVehicleUnitPrice)
    + (soilRemovalDays * laborCost); // 積込補助1名/日

  // === 砕石敷均し・転圧 ===
  // 砕石体積 = 延長 × 砕石厚 × 掘削幅 × ロス係数1.2
  const crushedStoneVolume = distance * crushedStoneThickness * excavationWidth * 1.2;
  // 砕石敷均し歩掛: 8m³/人日（国交省基準、人力タンパ・プレートコンパクタ併用）
  const stoneProductivity = 8;
  const crushedStoneWorkers = crushedStoneVolume > 0 ? Math.ceil(crushedStoneVolume / stoneProductivity) : 0;
  const crushedStoneLaborCost = crushedStoneWorkers * laborCost;
  // 転圧機械（プレートコンパクタ等）: 砕石日数分
  const crushedStoneDays = crushedStoneWorkers > 0 ? Math.ceil(crushedStoneWorkers / 2) : 0; // 2名/日体制
  const crushedStoneMachineCost = crushedStoneDays > 0 ? crushedStoneDays * 5000 : 0; // プレートコンパクタ ¥5,000/日
  const crushedStoneConstructionAmount = crushedStoneLaborCost + crushedStoneMachineCost;
  const crushedStoneMaterialCost = crushedStoneVolume * context.stoneUnitPrice;
  const crushedStoneTotal = crushedStoneConstructionAmount + crushedStoneMaterialCost;

  const baseWidth = productWidth + 0.1;
  const baseConcreteVolume = distance * baseWidth * baseThickness * 1.1;
  const pouringWorkers = getPouringWorkers(baseConcreteVolume);
  const formworkArea = distance * baseThickness * 2;
  const formworkMaterialCost = formworkArea * formworkCost;
  const baseTotalAmount = distance > 0
    ? (baseConcreteVolume * context.concreteUnitPrice) + (pouringWorkers * laborCost) + formworkMaterialCost
    : 0;

  const mortar = baseWidth * distance * 0.02 * stages;
  // 砂量＝モルタル × 0.75（1:3配合でセメント:砂=1:3 → 砂が体積の約75%）
  // ※ mortar × productLengthValue は m³ × m = m⁴ となり次元不整合
  const sand = mortar * 0.75;
  const sandAmount = sand * sandCost;
  const cement = Math.ceil(mortar * 0.3 * 1.6 * 1000 / 25);
  const cementAmount = cement * context.cementUnitPrice;
  const water = mortar * 0.1 * 1000;

  // BUG-4修正: 端数処理ロジックの根拠をコメントで明記
  // 二次製品（側溝・U字溝・管渠等）の本数計算における業界慣行:
  //   - rawCount = (施工延長 ÷ 製品1本の長さ) × 段数
  //   - 端数が0.49以下の場合: 切り捨て + 2本（両端カット代 + 現場合わせ予備）
  //     → 二次製品は現場で両端を切断加工するため、切断ロス分として+2本が標準
  //   - 端数が0.50以上の場合: 切り上げ（ほぼ1本分なのでカット代不要）
  // この端数処理は国交省積算基準における二次製品数量算出の実務慣行に準拠
  let productCount = 0;
  if (productLengthValue > 0) {
    const rawCount = (distance / productLengthValue) * stages;
    const decimal = rawCount - Math.floor(rawCount);
    productCount = decimal <= 0.49 ? Math.floor(rawCount) + 2 : Math.ceil(rawCount);
  }

  const materialTotalCost = (productCount * context.productUnitPrice) + shippingCost;
  // 据付歩掛（国交省基準準拠）:
  // - 地先境界ブロック・縁石類: 30〜40本/人日 → 1本あたり0.03人日
  // - U字溝240〜360: 15〜20本/人日 → 1本あたり0.06人日
  // - 大型側溝・ボックスカルバート: 5〜8本/人日 → 1本あたり0.15人日
  // workabilityFactor で調整（市街地=1.3, 狭隘部=1.5等）
  const baseInstallRate = productHeight <= 0.2 ? 0.03    // 小型製品(地先ブロック等)
    : productHeight <= 0.5 ? 0.06                         // 中型製品(U字溝240等)
    : productHeight <= 1.0 ? 0.10                          // 中大型(U字溝600等)
    : 0.15;                                                 // 大型製品(ボックスカルバート等)
  const installWorkers = Math.ceil(productCount * baseInstallRate * workabilityFactorValue);
  const secondaryProductTotal = sandAmount + cementAmount + materialTotalCost + (installWorkers * installLaborCost);

  const lineItems: CalculationLineItem[] = [
    createLineItem({ key: 'secondary.excavation', section: '土工', itemName: '掘削工事', specification: `${block.machine || '機械未選択'} / 幅${round2(excavationWidth)}m`, quantity: excavationVolume, unit: 'm3', unitPrice: excavationVolume > 0 ? excavationConstructionAmount / excavationVolume : excavationConstructionAmount, amount: excavationConstructionAmount, remarks: '掘削・積込・機械費を含む' }),
    createLineItem({ key: 'secondary.soilRemoval', section: '土工', itemName: '残土搬出', specification: block.dumpTruck || 'ダンプ未選択', quantity: soilRemovalVolume, unit: 'm3', unitPrice: soilRemovalVolume > 0 ? soilRemovalAmount / soilRemovalVolume : soilRemovalAmount, amount: soilRemovalAmount, remarks: 'ダンプ・積込・運搬を含む' }),
    createLineItem({ key: 'secondary.backfill', section: '土工', itemName: '埋戻し', specification: `${block.secondaryProduct || '製品未選択'} 周囲`, quantity: backfillVolume, unit: 'm3', unitPrice: backfillVolume > 0 ? backfillLaborCost / backfillVolume : backfillLaborCost, amount: backfillLaborCost, remarks: '埋戻し人件費' }),
    createLineItem({ key: 'secondary.stone', section: '基礎工', itemName: '砕石工', specification: `${block.crushedStone || '砕石未選択'} / t=${block.crushedStoneThickness}m`, quantity: crushedStoneVolume, unit: 'm3', unitPrice: crushedStoneVolume > 0 ? crushedStoneTotal / crushedStoneVolume : crushedStoneTotal, amount: crushedStoneTotal, remarks: '砕石材料・施工費を含む' }),
    createLineItem({ key: 'secondary.base', section: '基礎工', itemName: 'ベースコンクリート工', specification: `${block.concrete || '生コン未選択'} / t=${block.baseThickness}m`, quantity: baseConcreteVolume, unit: 'm3', unitPrice: baseConcreteVolume > 0 ? baseTotalAmount / baseConcreteVolume : baseTotalAmount, amount: baseTotalAmount, remarks: '生コン・打設・型枠を含む' }),
    createLineItem({ key: 'secondary.install', section: '据付工', itemName: '二次製品据付', specification: `${block.secondaryProduct || '製品未選択'} / ${block.productWidth}x${block.productHeight}x${block.productLength}`, quantity: productCount, unit: '本', unitPrice: productCount > 0 ? secondaryProductTotal / productCount : secondaryProductTotal, amount: secondaryProductTotal, remarks: '材料費・据付費・送料を含む' }),
  ];

  const machineMaster = adoptMaster(context.masters, 'machine', block.machine, context.effectiveDate);
  const dumpMaster = adoptMaster(context.masters, 'dump_truck', block.dumpTruck, context.effectiveDate);
  const stoneMaster = adoptMaster(context.masters, 'crushed_stone', block.crushedStone, context.effectiveDate);
  const concreteMaster = adoptMaster(context.masters, 'concrete', block.concrete, context.effectiveDate);
  const productMaster = adoptMaster(context.masters, 'secondary_product', block.secondaryProduct, context.effectiveDate);
  const laborMaster = adoptMaster(context.masters, 'labor', '標準労務単価', context.effectiveDate);
  const cementMaster = adoptMaster(context.masters, 'misc', 'セメント単価', context.effectiveDate);

  const priceEvidence: CalculationEvidence[] = [
    createMasterEvidence('secondary.excavation', '掘削工事', machineMaster, { masterType: 'input', masterName: block.machine || '掘削機械', adoptedUnitPrice: context.machineUnitPrice, unit: '日', reason: '掘削機械費の根拠', requiresReview: !machineMaster }),
    createMasterEvidence('secondary.excavation', '掘削工事', laborMaster, { masterType: 'input', masterName: '標準労務単価', adoptedUnitPrice: laborCost, unit: '人日', reason: '掘削労務費の根拠', requiresReview: laborCost <= 0 }),
    createMasterEvidence('secondary.soilRemoval', '残土搬出', dumpMaster, { masterType: 'input', masterName: block.dumpTruck || 'ダンプ単価', adoptedUnitPrice: context.dumpVehicleUnitPrice, unit: '台日', reason: '残土搬出ダンプ単価の根拠', requiresReview: !dumpMaster }),
    createMasterEvidence('secondary.stone', '砕石工', stoneMaster, { masterType: 'input', masterName: block.crushedStone || '砕石単価', adoptedUnitPrice: context.stoneUnitPrice, unit: 'm3', reason: '砕石材料単価の根拠', requiresReview: !stoneMaster }),
    createMasterEvidence('secondary.base', 'ベースコンクリート工', concreteMaster, { masterType: 'input', masterName: block.concrete || '生コン単価', adoptedUnitPrice: context.concreteUnitPrice, unit: 'm3', reason: 'ベースコンクリート単価の根拠', requiresReview: !concreteMaster }),
    createMasterEvidence('secondary.install', '二次製品据付', productMaster, { masterType: 'input', masterName: block.secondaryProduct || '二次製品', adoptedUnitPrice: context.productUnitPrice, unit: '本', reason: '二次製品材料単価の根拠', requiresReview: !productMaster }),
    createMasterEvidence('secondary.install', '二次製品据付', cementMaster, { masterType: 'derived', masterName: 'セメント単価', adoptedUnitPrice: context.cementUnitPrice, unit: '袋', reason: 'モルタル用セメント単価の根拠', requiresReview: !cementMaster }),
    createMasterEvidence('secondary.install', '二次製品据付', null, { masterType: 'input', masterName: '砂単価（画面入力）', adoptedUnitPrice: sandCost, unit: 'm3', reason: '砂単価は現場条件依存のため入力値を採用', requiresReview: sandCost <= 0 }),
    createMasterEvidence('secondary.install', '二次製品据付', null, { masterType: 'input', masterName: '送料（画面入力）', adoptedUnitPrice: shippingCost, unit: '式', reason: '運搬費は案件条件依存のため入力値を採用', requiresReview: shippingCost <= 0 }),
  ];

  return applyZoneBreakdowns(applyPhasedExecutionAdjustments(finalizeCommonResult({
    ...result,
    excavationWidth: round2(excavationWidth),
    excavationHeight: round2(excavationHeight),
    excavationVolume: round2(excavationVolume),
    fourHourExcavation: round2(fourHourExcavation),
    excavationDays,
    excavationDailyWorkers,
    excavationWorkers,
    machineUnitPrice: context.machineUnitPrice,
    machineAmount: Math.round(machineAmount),
    excavationConstructionAmount: Math.round(excavationConstructionAmount),
    excavationUnitPerM: distance > 0 ? Math.round(excavationConstructionAmount / distance) : 0,
    soilRemovalVolume: round2(soilRemovalVolume),
    soilRemovalDays,
    dumpCapacity: context.dumpCapacity,
    dumpCount,
    dumpVehicleUnitPrice: context.dumpVehicleUnitPrice,
    regularDumpCount,
    regularDumpUnitPrice: context.dumpVehicleUnitPrice,
    soilRemovalAmount: Math.round(soilRemovalAmount),
    soilRemovalUnitPerM: distance > 0 ? Math.round(soilRemovalAmount / distance) : 0,
    backfillVolume: round2(backfillVolume),
    backfillDays: backfillWorkers > 0 ? Math.ceil(backfillWorkers / 2) : 0,
    backfillWorkers,
    backfillLaborCost: Math.round(backfillLaborCost),
    crushedStoneVolume: round2(crushedStoneVolume),
    crushedStoneWorkers,
    crushedStoneDays,
    crushedStoneLaborCost: Math.round(crushedStoneLaborCost),
    crushedStoneMachineCost: Math.round(crushedStoneMachineCost),
    crushedStoneConstructionAmount: Math.round(crushedStoneConstructionAmount),
    crushedStoneMaterialCost: round2(crushedStoneMaterialCost),
    crushedStoneTotal: Math.round(crushedStoneTotal),
    crushedStoneUnitPerM: distance > 0 ? Math.round(crushedStoneTotal / distance) : 0,
    baseWidth: round2(baseWidth),
    baseConcreteVolume: round2(baseConcreteVolume),
    concreteUnitPrice: context.concreteUnitPrice,
    pouringWorkers,
    formworkArea: round2(formworkArea),
    formworkMaterialCost: round2(formworkMaterialCost),
    baseTotalAmount: Math.round(baseTotalAmount),
    baseUnitPerM: distance > 0 ? Math.round(baseTotalAmount / distance) : 0,
    mortar: round2(mortar),
    sand: round2(sand),
    sandAmount: round2(sandAmount),
    cement,
    cementAmount: Math.round(cementAmount),
    water: round2(water),
    productUnitPrice: context.productUnitPrice,
    productCount,
    materialTotalCost: Math.round(materialTotalCost),
    installWorkers,
    secondaryProductTotal: Math.round(secondaryProductTotal),
    secondaryProductUnitPerM: distance > 0 ? Math.ceil(secondaryProductTotal / distance) : 0,
    displayName: block.secondaryProduct || '二次製品工',
    primaryQuantity: distance,
    primaryUnit: 'm',
    detailSections: [
      { id: 'secondary-overview', title: '基本数量', tone: 'bg-slate-700', metrics: [metric('施工延長', distance, 'm'), metric('製品本数', productCount, '本'), metric('概算総額', secondaryProductTotal + baseTotalAmount + crushedStoneTotal + soilRemovalAmount + excavationConstructionAmount + backfillLaborCost, '円', 'currency')] },
      { id: 'secondary-earth', title: '土工', tone: 'bg-blue-600', metrics: [metric('掘削量', excavationVolume, 'm3'), metric('残土量', soilRemovalVolume, 'm3'), metric('埋戻し量', backfillVolume, 'm3'), metric('土工合計', excavationConstructionAmount + soilRemovalAmount + backfillLaborCost, '円', 'currency')] },
      { id: 'secondary-base', title: '基礎工', tone: 'bg-amber-500', metrics: [metric('砕石量', crushedStoneVolume, 'm3'), metric('ベースコン量', baseConcreteVolume, 'm3'), metric('基礎工合計', crushedStoneTotal + baseTotalAmount, '円', 'currency')] },
      { id: 'secondary-install', title: '据付工', tone: 'bg-pink-500', metrics: [metric('モルタル量', mortar, 'm3'), metric('据付人数', installWorkers, '人'), metric('据付工合計', secondaryProductTotal, '円', 'currency')] },
    ],
    lineItems,
    priceEvidence,
  }), block, context), block, context);
}

function calculateRetainingWall(block: EstimateBlock, options?: CalculationOptions): CalculationResult {
  const context = buildRateContext(block, options);
  const result = emptyResult('retaining_wall', block.secondaryProduct || '擁壁工', 'm');
  const length = block.distance || 0;
  const wallHeight = normalizeToMeters(block.productHeight || 0, 'wall');
  const baseWidth = normalizeToMeters(block.productWidth || 0, 'wall');
  const baseThickness = normalizeToMeters(block.baseThickness || 0, 'thickness');
  const stoneThickness = normalizeToMeters(block.crushedStoneThickness || 0, 'thickness');
  const laborCost = context.laborCost;
  const wallTypeFactor = /重力/.test(block.secondaryProduct) ? 0.65 : /逆T/i.test(block.secondaryProduct) ? 0.38 : /L型/i.test(block.secondaryProduct) ? 0.34 : 0.45;

  // BUG-2修正: ほぐし係数Lを常にgetLooseningFactor()経由で取得（統一管理）
  // groundCondition未設定時はgetLooseningFactor内で砂質土標準1.25がデフォルト適用される
  // 以前は未設定時に1.20固定だったが、priceData.tsの基準テーブルと不一致だった
  const soilL = getLooseningFactor(block.groundCondition || '');

  const excavationWidth = baseWidth + 1.0;
  const excavationHeight = wallHeight + baseThickness + stoneThickness;
  const excavationVolume = excavationWidth * excavationHeight * length * soilL;
  const fourHourExcavation = context.machineCapacity > 0 ? getFourHourExcavationCoefficient(context.machineCapacity) * context.machineCapacity : 0;
  const excavationDays = fourHourExcavation > 0 ? Math.ceil(excavationVolume / fourHourExcavation) : 0;
  const excavationDailyWorkers = length > 0 ? Math.ceil(length / 20) + 2 : 0;
  const excavationWorkers = excavationDays * excavationDailyWorkers;
  const machineAmount = excavationDays * context.machineUnitPrice * 2;
  const excavationConstructionAmount = excavationWorkers * laborCost + machineAmount;

  const stoneVolume = length * baseWidth * stoneThickness * 1.1;
  const stoneDays = fourHourExcavation > 0 ? Math.ceil(stoneVolume / fourHourExcavation) : 0;
  const stoneWorkers = length > 0 ? Math.max(1, Math.ceil(length / 25)) : 0;
  const stoneLaborCost = stoneDays * stoneWorkers * laborCost;
  const stoneMachineCost = stoneDays * context.machineUnitPrice;
  const stoneMaterialCost = stoneVolume * context.stoneUnitPrice;
  const stoneTotal = stoneLaborCost + stoneMachineCost + stoneMaterialCost;

  const footingConcreteVolume = length * baseWidth * baseThickness * 1.05;
  const wallConcreteVolume = length * baseWidth * wallHeight * wallTypeFactor;
  const totalConcreteVolume = footingConcreteVolume + wallConcreteVolume;
  const formworkArea = length * wallHeight * (/重力/.test(block.secondaryProduct) ? 2.2 : 1.8);
  const formworkMaterialCost = formworkArea * (block.formworkCost || 0);
  const pouringWorkers = Math.max(1, getPouringWorkers(totalConcreteVolume));
  const structuralConcreteAmount = totalConcreteVolume * context.concreteUnitPrice + (pouringWorkers * laborCost) + formworkMaterialCost;

  const backfillVolume = length * Math.max(baseWidth * 0.45, 0.4) * wallHeight * 1.1;
  const backfillDays = fourHourExcavation > 0 ? Math.ceil(backfillVolume / fourHourExcavation) : 0;
  const backfillWorkers = backfillDays > 0 ? Math.max(1, Math.ceil(backfillVolume / 8)) : 0;
  const backfillLaborCost = backfillWorkers * backfillDays * laborCost;

  const soilRemovalVolume = Math.max(excavationVolume - backfillVolume, 0);
  const soilRemovalDays = fourHourExcavation > 0 ? Math.ceil(soilRemovalVolume / fourHourExcavation) : 0;
  const dumpCount = context.dumpCapacity > 0 ? Math.ceil(soilRemovalVolume / context.dumpCapacity) : 0;
  // 常用ダンプ台数＝1日に必要な台数（延べ台数÷搬出日数）
  const regularDumpCount = soilRemovalDays > 0 && context.dumpCapacity > 0 ? Math.ceil(dumpCount / soilRemovalDays) : 0;
  const regularDumpUnitPrice = context.machineUnitPrice * 2;
  // 残土搬出金額＝常用ダンプ日当 × 台数 × 日数 + 常用ダンプ機械費 + 労務費
  const soilRemovalAmount = (regularDumpCount * context.dumpVehicleUnitPrice * soilRemovalDays)
    + (regularDumpCount * regularDumpUnitPrice)
    + (soilRemovalDays * laborCost);

  const lineItems: CalculationLineItem[] = [
    createLineItem({ key: 'retaining.excavation', section: '土工', itemName: '掘削工', specification: `${block.machine || '機械未選択'} / 床付幅${round2(excavationWidth)}m`, quantity: excavationVolume, unit: 'm3', unitPrice: excavationVolume > 0 ? excavationConstructionAmount / excavationVolume : excavationConstructionAmount, amount: excavationConstructionAmount, remarks: '擁壁基礎掘削・積込・機械費' }),
    createLineItem({ key: 'retaining.disposal', section: '土工', itemName: '残土搬出', specification: block.dumpTruck || 'ダンプ未選択', quantity: soilRemovalVolume, unit: 'm3', unitPrice: soilRemovalVolume > 0 ? soilRemovalAmount / soilRemovalVolume : soilRemovalAmount, amount: soilRemovalAmount, remarks: '場外搬出を含む' }),
    createLineItem({ key: 'retaining.stone', section: '基礎工', itemName: '基礎砕石工', specification: `${block.crushedStone || '砕石未選択'} / t=${stoneThickness}m`, quantity: stoneVolume, unit: 'm3', unitPrice: stoneVolume > 0 ? stoneTotal / stoneVolume : stoneTotal, amount: stoneTotal, remarks: '敷均し・転圧・材料費を含む' }),
    createLineItem({ key: 'retaining.body', section: '躯体工', itemName: '擁壁躯体工', specification: `${block.secondaryProduct || '擁壁'} / H=${wallHeight}m`, quantity: totalConcreteVolume, unit: 'm3', unitPrice: totalConcreteVolume > 0 ? structuralConcreteAmount / totalConcreteVolume : structuralConcreteAmount, amount: structuralConcreteAmount, remarks: '基礎コンクリート・躯体コンクリート・型枠を含む' }),
    createLineItem({ key: 'retaining.backfill', section: '土工', itemName: '背面埋戻し', specification: '転圧仕上げ', quantity: backfillVolume, unit: 'm3', unitPrice: backfillVolume > 0 ? backfillLaborCost / backfillVolume : backfillLaborCost, amount: backfillLaborCost, remarks: '背面土の敷均し・転圧' }),
  ];

  const machineMaster = adoptMaster(context.masters, 'machine', block.machine, context.effectiveDate);
  const dumpMaster = adoptMaster(context.masters, 'dump_truck', block.dumpTruck, context.effectiveDate);
  const stoneMaster = adoptMaster(context.masters, 'crushed_stone', block.crushedStone, context.effectiveDate);
  const concreteMaster = adoptMaster(context.masters, 'concrete', block.concrete, context.effectiveDate);
  const laborMaster = adoptMaster(context.masters, 'labor', '標準労務単価', context.effectiveDate);

  const priceEvidence: CalculationEvidence[] = [
    createMasterEvidence('retaining.excavation', '掘削工', machineMaster, { masterType: 'input', masterName: block.machine || '掘削機械', adoptedUnitPrice: context.machineUnitPrice, unit: '日', reason: '掘削機械費の根拠', requiresReview: !machineMaster }),
    createMasterEvidence('retaining.excavation', '掘削工', laborMaster, { masterType: 'input', masterName: '標準労務単価', adoptedUnitPrice: laborCost, unit: '人日', reason: '掘削労務費の根拠', requiresReview: laborCost <= 0 }),
    createMasterEvidence('retaining.disposal', '残土搬出', dumpMaster, { masterType: 'input', masterName: block.dumpTruck || 'ダンプ単価', adoptedUnitPrice: context.dumpVehicleUnitPrice, unit: '台日', reason: '残土搬出ダンプ単価の根拠', requiresReview: !dumpMaster }),
    createMasterEvidence('retaining.stone', '基礎砕石工', stoneMaster, { masterType: 'input', masterName: block.crushedStone || '砕石単価', adoptedUnitPrice: context.stoneUnitPrice, unit: 'm3', reason: '基礎砕石単価の根拠', requiresReview: !stoneMaster }),
    createMasterEvidence('retaining.body', '擁壁躯体工', concreteMaster, { masterType: 'input', masterName: block.concrete || '生コン単価', adoptedUnitPrice: context.concreteUnitPrice, unit: 'm3', reason: '擁壁躯体コンクリート単価の根拠', requiresReview: !concreteMaster }),
    createMasterEvidence('retaining.body', '擁壁躯体工', null, { masterType: 'input', masterName: '型枠単価（画面入力）', adoptedUnitPrice: block.formworkCost || 0, unit: 'm2', reason: '型枠材は案件条件依存のため入力値を採用', requiresReview: (block.formworkCost || 0) <= 0 }),
  ];

  return applyZoneBreakdowns(applyPhasedExecutionAdjustments(finalizeCommonResult({
    ...result,
    excavationWidth: round2(excavationWidth),
    excavationHeight: round2(excavationHeight),
    excavationVolume: round2(excavationVolume),
    fourHourExcavation: round2(fourHourExcavation),
    excavationDays,
    excavationDailyWorkers,
    excavationWorkers,
    machineUnitPrice: context.machineUnitPrice,
    machineAmount: Math.round(machineAmount),
    excavationConstructionAmount: Math.round(excavationConstructionAmount),
    excavationUnitPerM: length > 0 ? Math.round(excavationConstructionAmount / length) : 0,
    soilRemovalVolume: round2(soilRemovalVolume),
    soilRemovalDays,
    dumpCapacity: context.dumpCapacity,
    dumpCount,
    dumpVehicleUnitPrice: context.dumpVehicleUnitPrice,
    regularDumpCount,
    regularDumpUnitPrice,
    soilRemovalAmount: Math.round(soilRemovalAmount),
    soilRemovalUnitPerM: length > 0 ? Math.round(soilRemovalAmount / length) : 0,
    backfillVolume: round2(backfillVolume),
    backfillDays,
    backfillWorkers,
    backfillLaborCost: Math.round(backfillLaborCost),
    crushedStoneVolume: round2(stoneVolume),
    crushedStoneWorkers: stoneWorkers,
    crushedStoneDays: stoneDays,
    crushedStoneLaborCost: Math.round(stoneLaborCost),
    crushedStoneMachineCost: Math.round(stoneMachineCost),
    crushedStoneConstructionAmount: Math.round(stoneLaborCost + stoneMachineCost),
    crushedStoneMaterialCost: Math.round(stoneMaterialCost),
    crushedStoneTotal: Math.round(stoneTotal),
    crushedStoneUnitPerM: length > 0 ? Math.round(stoneTotal / length) : 0,
    baseWidth: round2(baseWidth),
    baseConcreteVolume: round2(totalConcreteVolume),
    concreteUnitPrice: context.concreteUnitPrice,
    pouringWorkers,
    formworkArea: round2(formworkArea),
    formworkMaterialCost: Math.round(formworkMaterialCost),
    baseTotalAmount: Math.round(structuralConcreteAmount),
    baseUnitPerM: length > 0 ? Math.round(structuralConcreteAmount / length) : 0,
    displayName: block.secondaryProduct || '擁壁工',
    primaryQuantity: length,
    primaryUnit: 'm',
    detailSections: [
      { id: 'retaining-overview', title: '擁壁数量', tone: 'bg-slate-700', metrics: [metric('延長', length, 'm'), metric('擁壁高', wallHeight, 'm'), metric('底版幅', baseWidth, 'm'), metric('総額', lineItems.reduce((sum, item) => sum + item.amount, 0), '円', 'currency')] },
      { id: 'retaining-earth', title: '土工', tone: 'bg-blue-600', metrics: [metric('掘削量', excavationVolume, 'm3'), metric('残土量', soilRemovalVolume, 'm3'), metric('埋戻し量', backfillVolume, 'm3')] },
      { id: 'retaining-body', title: '基礎・躯体', tone: 'bg-emerald-600', metrics: [metric('砕石量', stoneVolume, 'm3'), metric('コンクリート量', totalConcreteVolume, 'm3'), metric('型枠面積', formworkArea, 'm2')] },
    ],
    lineItems,
    priceEvidence,
  }), block, context), block, context);
}

function calculatePavement(block: EstimateBlock, options?: CalculationOptions): CalculationResult {
  const context = buildRateContext(block, options);
  const result = emptyResult('pavement', block.secondaryProduct || '舗装工', 'm2');
  const length = block.distance || 0;
  const width = block.pavementWidth || block.productWidth || 0;
  const area = length * width;
  const surfaceThickness = block.surfaceThickness || 0;
  const binderThickness = block.binderThickness || 0;
  const baseThickness = block.baseThickness || 0;
  const subBaseThickness = block.crushedStoneThickness || 0;
  const surfaceVolume = area * surfaceThickness;
  const binderVolume = area * binderThickness;
  const roadBaseVolume = area * baseThickness;
  const subBaseVolume = area * subBaseThickness;
  const cutterLength = length > 0 ? length * 2 : 0;

  const surfaceMaster = roadMasterForSurface(context.masters, surfaceThickness, context.effectiveDate);
  const binderMaster = binderThickness > 0 ? roadMasterForSurface(context.masters, binderThickness, context.effectiveDate) : null;
  const roadBaseMaster = baseThickness > 0 ? roadMasterForBase(context.masters, baseThickness, context.effectiveDate) : null;
  const subBaseMaster = adoptMaster(context.masters, 'crushed_stone', block.crushedStone, context.effectiveDate);
  const cutterMaster = cutterMasterForThickness(context.masters, surfaceThickness + binderThickness, block.secondaryProduct || '舗装', context.effectiveDate);
  const laborMaster = adoptMaster(context.masters, 'labor', '標準労務単価', context.effectiveDate);

  const surfaceUnitPrice = surfaceMaster?.unitPrice ?? 3500;
  const binderUnitPrice = binderMaster?.unitPrice ?? (binderThickness > 0 ? 3000 : 0);
  const roadBaseUnitPrice = roadBaseMaster?.unitPrice ?? 2000;
  const subBaseUnitPrice = subBaseMaster?.unitPrice ?? 0;
  const cutterUnitPrice = cutterMaster?.unitPrice ?? 500;
  const laborCost = context.laborCost;

  const surfaceAmount = area * surfaceUnitPrice;
  const binderAmount = area * binderUnitPrice;
  const roadBaseAmount = area * roadBaseUnitPrice;
  // BUG-1修正: 下層路盤の敷均し・転圧歩掛を舗装種別ごとに設定（国交省土木積算基準準拠）
  // アスファルト舗装: 120m²/人日, コンクリート舗装: 80m²/人日, 簡易舗装: 150m²/人日
  const pavementType = (block.secondaryProduct || '').toLowerCase();
  const subBaseWorkerCapacity = /コンクリート|con/i.test(pavementType) ? 80
    : /簡易|砂利|gravel/i.test(pavementType) ? 150
    : 120; // アスファルト舗装（デフォルト）
  const subBaseLabor = area > 0 ? Math.ceil(area / subBaseWorkerCapacity) * laborCost : 0;
  const subBaseAmount = subBaseVolume * subBaseUnitPrice + subBaseLabor;
  const cutterAmount = cutterLength * cutterUnitPrice;

  const lineItems = [
    createLineItem({ key: 'pavement.cutter', section: '舗装準備', itemName: 'カッター工', specification: `${block.secondaryProduct || '舗装'} 外周`, quantity: cutterLength, unit: 'm', unitPrice: cutterUnitPrice, amount: cutterAmount, remarks: '舗装端部の切断' }),
    createLineItem({ key: 'pavement.surface', section: '舗装工', itemName: '表層工', specification: `表層 t=${surfaceThickness}m`, quantity: area, unit: 'm2', unitPrice: surfaceUnitPrice, amount: surfaceAmount, remarks: '表層材敷均し・転圧' }),
    createLineItem({ key: 'pavement.binder', section: '舗装工', itemName: '基層工', specification: `基層 t=${binderThickness}m`, quantity: area, unit: 'm2', unitPrice: binderUnitPrice, amount: binderAmount, remarks: '基層材敷均し・転圧' }),
    createLineItem({ key: 'pavement.roadbase', section: '路盤工', itemName: '上層路盤工', specification: `路盤 t=${baseThickness}m`, quantity: area, unit: 'm2', unitPrice: roadBaseUnitPrice, amount: roadBaseAmount, remarks: '上層路盤整正' }),
    createLineItem({ key: 'pavement.subbase', section: '路盤工', itemName: '下層路盤工', specification: `${block.crushedStone || '砕石'} / t=${subBaseThickness}m`, quantity: subBaseVolume, unit: 'm3', unitPrice: subBaseVolume > 0 ? subBaseAmount / subBaseVolume : subBaseAmount, amount: subBaseAmount, remarks: '材料費・敷均し・転圧を含む' }),
  ].filter((item) => item.quantity > 0 || item.amount > 0);

  const priceEvidence: CalculationEvidence[] = [
    createMasterEvidence('pavement.cutter', 'カッター工', cutterMaster, { masterType: 'input', masterName: 'カッター工', adoptedUnitPrice: cutterUnitPrice, unit: 'm', reason: '舗装端部カッター単価の根拠', requiresReview: !cutterMaster }),
    createMasterEvidence('pavement.surface', '表層工', surfaceMaster, { masterType: 'input', masterName: `表層 t=${Math.round(surfaceThickness * 100)}cm`, adoptedUnitPrice: surfaceUnitPrice, unit: 'm2', reason: '表層単価の根拠', requiresReview: !surfaceMaster }),
    createMasterEvidence('pavement.binder', '基層工', binderMaster, { masterType: 'input', masterName: `基層 t=${Math.round(binderThickness * 100)}cm`, adoptedUnitPrice: binderUnitPrice, unit: 'm2', reason: '基層単価の根拠', requiresReview: binderThickness > 0 && !binderMaster }),
    createMasterEvidence('pavement.roadbase', '上層路盤工', roadBaseMaster, { masterType: 'input', masterName: `路盤 t=${Math.round(baseThickness * 100)}cm`, adoptedUnitPrice: roadBaseUnitPrice, unit: 'm2', reason: '上層路盤単価の根拠', requiresReview: baseThickness > 0 && !roadBaseMaster }),
    createMasterEvidence('pavement.subbase', '下層路盤工', subBaseMaster, { masterType: 'input', masterName: block.crushedStone || '砕石', adoptedUnitPrice: subBaseUnitPrice, unit: 'm3', reason: '下層路盤材料単価の根拠', requiresReview: subBaseThickness > 0 && !subBaseMaster }),
    createMasterEvidence('pavement.subbase', '下層路盤工', laborMaster, { masterType: 'input', masterName: '標準労務単価', adoptedUnitPrice: laborCost, unit: '人日', reason: '転圧・敷均し労務費の根拠', requiresReview: laborCost <= 0 }),
  ].filter((item) => item.adoptedUnitPrice > 0 || item.requiresReview);

  return applyZoneBreakdowns(applyPhasedExecutionAdjustments(finalizeCommonResult({
    ...result,
    excavationWidth: round2(width),
    excavationHeight: round2(surfaceThickness + binderThickness + baseThickness + subBaseThickness),
    excavationVolume: round2(area * (surfaceThickness + binderThickness + baseThickness + subBaseThickness)),
    crushedStoneVolume: round2(subBaseVolume),
    crushedStoneMaterialCost: Math.round(subBaseVolume * subBaseUnitPrice),
    crushedStoneTotal: Math.round(subBaseAmount),
    baseConcreteVolume: round2(surfaceVolume + binderVolume),
    baseWidth: round2(width),
    displayName: block.secondaryProduct || '舗装工',
    primaryQuantity: area,
    primaryUnit: 'm2',
    detailSections: [
      { id: 'pavement-overview', title: '舗装数量', tone: 'bg-slate-700', metrics: [metric('施工延長', length, 'm'), metric('舗装幅', width, 'm'), metric('施工面積', area, 'm2'), metric('総額', lineItems.reduce((sum, item) => sum + item.amount, 0), '円', 'currency')] },
      { id: 'pavement-layers', title: '舗装厚', tone: 'bg-indigo-600', metrics: [metric('表層厚', surfaceThickness, 'm'), metric('基層厚', binderThickness, 'm'), metric('上層路盤厚', baseThickness, 'm'), metric('下層路盤厚', subBaseThickness, 'm')] },
      { id: 'pavement-quantities', title: '出来形数量', tone: 'bg-emerald-600', metrics: [metric('表層材量', surfaceVolume, 'm3'), metric('基層材量', binderVolume, 'm3'), metric('路盤量', roadBaseVolume, 'm3'), metric('砕石量', subBaseVolume, 'm3')] },
    ],
    lineItems,
    priceEvidence,
  }), block, context), block, context);
}

function calculateDemolition(block: EstimateBlock, options?: CalculationOptions): CalculationResult {
  const context = buildRateContext(block, options);
  const result = emptyResult('demolition', block.secondaryProduct || '撤去工', 'm2');
  const length = block.distance || 0;
  const width = block.demolitionWidth || block.pavementWidth || block.productWidth || 0;
  const thickness = block.demolitionThickness || block.surfaceThickness || 0;
  const area = length * width;
  const volume = area * thickness;
  const cutterLength = length > 0 ? length * 2 : 0;
  const target = block.secondaryProduct || '舗装撤去';
  const isConcrete = /co|コンクリ|側溝|擁壁/i.test(target);
  const demolitionMaster = isConcrete
    ? miscMasterByKeyword(context.masters, 'コンクリート撤去', context.effectiveDate)
    : nearestThicknessMaster(context.masters, 'road', ['舗装撤去'], thickness, context.effectiveDate);
  const disposalMaster = isConcrete
    ? miscMasterByKeyword(context.masters, 'Co殻処分', context.effectiveDate)
    : miscMasterByKeyword(context.masters, 'As殻処分', context.effectiveDate);
  const cutterMaster = cutterMasterForThickness(context.masters, thickness, target, context.effectiveDate);

  const demolitionUnitPrice = demolitionMaster?.unitPrice ?? (isConcrete ? 9500 : 1200);
  const disposalUnitPrice = disposalMaster?.unitPrice ?? (isConcrete ? 12000 : 7000);
  const cutterUnitPrice = cutterMaster?.unitPrice ?? 500;
  const demolitionAmount = (demolitionMaster?.unit ?? 'm2') === 'm3' ? volume * demolitionUnitPrice : area * demolitionUnitPrice;
  const disposalVolume = volume * 1.2;
  const disposalAmount = disposalVolume * disposalUnitPrice;
  const cutterAmount = cutterLength * cutterUnitPrice;

  const lineItems = [
    createLineItem({ key: 'demolition.cutter', section: '撤去準備', itemName: 'カッター工', specification: `${target} 周囲`, quantity: cutterLength, unit: 'm', unitPrice: cutterUnitPrice, amount: cutterAmount, remarks: '切断線が必要な場合のみ計上' }),
    createLineItem({ key: 'demolition.body', section: '撤去工', itemName: `${target}撤去`, specification: `t=${thickness}m`, quantity: demolitionMaster?.unit === 'm3' ? volume : area, unit: demolitionMaster?.unit ?? 'm2', unitPrice: demolitionUnitPrice, amount: demolitionAmount, remarks: 'はつり・積込を含む' }),
    createLineItem({ key: 'demolition.disposal', section: '処分工', itemName: '殻運搬・処分', specification: isConcrete ? 'Co殻' : 'As殻', quantity: disposalVolume, unit: 'm3', unitPrice: disposalUnitPrice, amount: disposalAmount, remarks: '産業廃棄物処分費を含む' }),
  ].filter((item) => item.quantity > 0 || item.amount > 0);

  const priceEvidence: CalculationEvidence[] = [
    createMasterEvidence('demolition.cutter', 'カッター工', cutterMaster, { masterType: 'input', masterName: 'カッター工', adoptedUnitPrice: cutterUnitPrice, unit: 'm', reason: '撤去端部カッター単価の根拠', requiresReview: !cutterMaster }),
    createMasterEvidence('demolition.body', `${target}撤去`, demolitionMaster, { masterType: 'input', masterName: `${target}撤去`, adoptedUnitPrice: demolitionUnitPrice, unit: demolitionMaster?.unit ?? 'm2', reason: '撤去単価の根拠', requiresReview: !demolitionMaster }),
    createMasterEvidence('demolition.disposal', '殻運搬・処分', disposalMaster, { masterType: 'input', masterName: isConcrete ? 'Co殻処分' : 'As殻処分', adoptedUnitPrice: disposalUnitPrice, unit: 'm3', reason: '産廃処分単価の根拠', requiresReview: !disposalMaster }),
  ];

  return applyZoneBreakdowns(applyPhasedExecutionAdjustments(finalizeCommonResult({
    ...result,
    excavationWidth: round2(width),
    excavationHeight: round2(thickness),
    excavationVolume: round2(volume),
    soilRemovalVolume: round2(disposalVolume),
    displayName: target,
    primaryQuantity: area,
    primaryUnit: 'm2',
    detailSections: [
      { id: 'demolition-overview', title: '撤去数量', tone: 'bg-slate-700', metrics: [metric('撤去延長', length, 'm'), metric('撤去幅', width, 'm'), metric('撤去面積', area, 'm2'), metric('総額', lineItems.reduce((sum, item) => sum + item.amount, 0), '円', 'currency')] },
      { id: 'demolition-geometry', title: '体積算定', tone: 'bg-rose-600', metrics: [metric('撤去厚', thickness, 'm'), metric('撤去体積', volume, 'm3'), metric('処分体積', disposalVolume, 'm3')] },
    ],
    lineItems,
    priceEvidence,
  }), block, context), block, context);
}

function calculateCountStructure(block: EstimateBlock, options?: CalculationOptions): CalculationResult {
  const context = buildRateContext(block, options);
  const primaryUnit = (block.countUnit || '箇所').trim() || '箇所';
  const quantity = Math.max(0, Math.round(block.countQuantity || 0));
  const matchedMaster = adoptAcrossMasters(
    context.masters,
    ['secondary_product', 'misc'],
    block.secondaryProduct,
    context.effectiveDate,
  );
  const unitPrice = matchedMaster?.unitPrice ?? Math.max(0, block.customUnitPrice || 0);
  const amount = Math.round(quantity * unitPrice);
  const displayName = block.secondaryProduct || '街渠桝・接続桝工';
  const result = emptyResult('count_structure', displayName, primaryUnit);

  const lineItems = [
    createLineItem({
      key: 'count-structure.install',
      section: '構造物工',
      itemName: displayName,
      specification: `${primaryUnit} root / count 監査`,
      quantity,
      unit: primaryUnit,
      unitPrice,
      amount,
      remarks: '街渠桝・接続桝・側溝桝などの count 系数量',
    }),
  ].filter((item) => item.quantity > 0 || item.amount > 0);

  const priceEvidence = [
    createMasterEvidence('count-structure.install', displayName, matchedMaster, {
      masterType: 'input',
      masterName: matchedMaster?.name ?? '数量単価（画面入力）',
      adoptedUnitPrice: unitPrice,
      unit: primaryUnit,
      reason: 'count 系構造物の数量単価',
      requiresReview: !matchedMaster && unitPrice <= 0,
    }),
  ];

  return applyZoneBreakdowns(applyPhasedExecutionAdjustments(finalizeCommonResult({
    ...result,
    displayName,
    productCount: quantity,
    materialTotalCost: amount,
    primaryQuantity: quantity,
    primaryUnit,
    detailSections: [
      {
        id: 'count-structure-overview',
        title: 'count 系数量',
        tone: 'bg-slate-700',
        metrics: [
          metric('数量対象', quantity, primaryUnit),
          metric('数量単価', unitPrice, `円/${primaryUnit}`, 'currency'),
          metric('小計', amount, '円', 'currency'),
        ],
      },
      {
        id: 'count-structure-audit',
        title: '監査ロジック',
        tone: 'bg-cyan-600',
        metrics: [
          metric('主数量', quantity, primaryUnit),
          metric('延長換算', 0, 'm'),
          metric('面積換算', 0, 'm2'),
        ],
      },
    ],
    lineItems,
    priceEvidence,
  }), block, context), block, context);
}

function calculateMaterialTakeoff(block: EstimateBlock, options?: CalculationOptions): CalculationResult {
  const context = buildRateContext(block, options);
  const mode = block.materialTakeoffMode;
  const displayName = block.secondaryProduct || '材料数量監査';
  const result = emptyResult('material_takeoff', displayName, mode);
  const area = Math.max(0, block.materialArea || 0);
  const thickness = Math.max(0, block.materialThickness || 0);
  const factor = block.materialVolumeFactor > 0 ? block.materialVolumeFactor : 1;
  // BUG-3修正: density=0のときmode='t'で数量が0になる問題
  // デフォルト2.3t/m³（コンクリート標準密度）を適用し、警告用フラグも設定
  const rawDensity = Math.max(0, block.materialDensity || 0);
  const densityDefaultApplied = mode === 't' && rawDensity === 0;
  const density = densityDefaultApplied ? 2.3 : rawDensity; // 2.3t/m³ = コンクリート標準密度
  const directQuantity = Math.max(0, block.materialDirectQuantity || 0);
  const rawVolume = area > 0 && thickness > 0 ? area * thickness : 0;
  const adjustedVolume = rawVolume * factor;
  const theoreticalTonnage = adjustedVolume * density;
  const primaryQuantity = directQuantity > 0
    ? directQuantity
    : mode === 't'
      ? theoreticalTonnage
      : adjustedVolume;

  const matchedMaster = adoptAcrossMasters(
    context.masters,
    ['crushed_stone', 'road', 'misc'],
    block.secondaryProduct,
    context.effectiveDate,
  );
  const unitPrice = matchedMaster?.unitPrice ?? Math.max(0, block.customUnitPrice || 0);
  const amount = Math.round(primaryQuantity * unitPrice);

  const lineItems = [
    createLineItem({
      key: 'material-takeoff.quantity',
      section: '材料数量監査',
      itemName: displayName,
      specification: directQuantity > 0
        ? `直接数量 ${directQuantity}${mode}`
        : `面積${round2(area)}m2 × 厚み${round2(thickness)}m × 係数${round2(factor)}${mode === 't' ? ` × 密度${round2(density)}t/m3${densityDefaultApplied ? '【※密度未設定のためコンクリート標準2.3t/m³を適用】' : ''}` : ''}`,
      quantity: primaryQuantity,
      unit: mode,
      unitPrice,
      amount,
      remarks: mode === 't' ? 't 監査 root。密度を使って換算。' : 'm3 監査 root。面積×厚みまたは直接数量を採用。',
    }),
  ].filter((item) => item.quantity > 0 || item.amount > 0);

  const priceEvidence = [
    createMasterEvidence('material-takeoff.quantity', displayName, matchedMaster, {
      masterType: 'input',
      masterName: matchedMaster?.name ?? '数量単価（画面入力）',
      adoptedUnitPrice: unitPrice,
      unit: mode,
      reason: '材料数量監査の単価',
      requiresReview: !matchedMaster && unitPrice <= 0,
    }),
  ];

  return applyZoneBreakdowns(applyPhasedExecutionAdjustments(finalizeCommonResult({
    ...result,
    displayName,
    crushedStoneVolume: round2(adjustedVolume),
    soilRemovalVolume: mode === 't' ? round2(theoreticalTonnage) : 0,
    materialTotalCost: amount,
    primaryQuantity: round2(primaryQuantity),
    primaryUnit: mode,
    detailSections: [
      {
        id: 'material-takeoff-overview',
        title: '材料数量',
        tone: 'bg-slate-700',
        metrics: [
          metric('監査数量', primaryQuantity, mode),
          metric('直接数量', directQuantity, mode),
          metric('数量単価', unitPrice, `円/${mode}`, 'currency'),
          metric('小計', amount, '円', 'currency'),
        ],
      },
      {
        id: 'material-takeoff-formula',
        title: '計算式',
        tone: 'bg-emerald-600',
        metrics: [
          metric('面積', area, 'm2'),
          metric('厚み', thickness, 'm'),
          metric('体積係数', factor, '倍'),
          metric('補正後体積', adjustedVolume, 'm3'),
          metric('換算密度', density, 't/m3'),
          metric('理論重量', theoreticalTonnage, 't'),
        ],
      },
    ],
    lineItems,
    priceEvidence,
  }), block, context), block, context);
}

// ═══════════════════════════════════════════════════
// §NEW-1: 外構工 (exterior_work)
// ═══════════════════════════════════════════════════
function calculateExteriorWork(block: EstimateBlock, options?: CalculationOptions): CalculationResult {
  const context = buildRateContext(block, options);
  const result = emptyResult('exterior_work', block.name || '外構工', 'm2');
  const area = Math.max(0, block.exteriorArea || 0);
  const depth = Math.max(0, block.exteriorDepth || 0);
  const stoneThickness = Math.max(0, block.crushedStoneThickness || 0);
  const concreteThickness = Math.max(0, block.baseThickness || 0);
  const laborCost = context.laborCost;
  const soilL = getLooseningFactor(block.groundCondition || '');
  const finishUnitPrice = Math.max(0, block.exteriorFinishUnitPrice || 0);

  // 掘削
  const excDepth = depth > 0 ? depth : (stoneThickness + concreteThickness + 0.1);
  const excavationVolume = area * excDepth * soilL;
  const fourHourExc = context.machineCapacity > 0
    ? getFourHourExcavationCoefficient(context.machineCapacity) * context.machineCapacity : 0;
  const excavationDays = fourHourExc > 0 ? Math.ceil(excavationVolume / fourHourExc) : 0;
  const excavationWorkers = excavationDays > 0 ? Math.ceil(Math.sqrt(area) / 10) + 2 : 0;
  const machineAmount = excavationDays * context.machineUnitPrice * 2;
  const excavationLabor = excavationDays * excavationWorkers * laborCost;
  const excavationCost = excavationLabor + machineAmount;

  // 砕石
  const stoneVolume = area * stoneThickness * 1.2;
  const stoneDays = fourHourExc > 0 ? Math.ceil(stoneVolume / fourHourExc) : 0;
  const stoneWorkers = stoneDays > 0 ? Math.ceil(area / 50) : 0;
  const stoneLaborCost = stoneDays * stoneWorkers * laborCost;
  const stoneMachineCost = stoneDays * context.machineUnitPrice;
  const stoneMaterialCost = stoneVolume * context.stoneUnitPrice;
  const stoneTotal = stoneLaborCost + stoneMachineCost + stoneMaterialCost;

  // コンクリート
  const concreteVolume = area * concreteThickness * 1.1;
  const pouringW = getPouringWorkers(concreteVolume);
  const concreteMaterialCost = concreteVolume * context.concreteUnitPrice;
  const concreteLaborCost = pouringW * laborCost;
  const concreteTotal = concreteMaterialCost + concreteLaborCost;

  // 仕上げ
  const finishCost = area * finishUnitPrice;

  // 残土
  const backfillVolume = area * (excDepth - stoneThickness - concreteThickness) * soilL;
  const soilRemovalVolume = Math.max(excavationVolume - Math.max(backfillVolume, 0), 0);
  const dumpCount = context.dumpCapacity > 0 ? Math.ceil(soilRemovalVolume / context.dumpCapacity) : 0;
  const soilRemovalDays = fourHourExc > 0 ? Math.ceil(soilRemovalVolume / fourHourExc) : 0;
  const regularDumpCount = soilRemovalDays > 0 ? Math.ceil(dumpCount / soilRemovalDays) : 0;
  const soilRemovalAmount = (regularDumpCount * context.dumpVehicleUnitPrice * soilRemovalDays)
    + (soilRemovalDays * laborCost);

  const lineItems = [
    createLineItem({ key: 'ext.excavation', section: '土工', itemName: '掘削工', specification: block.machine || '', quantity: excavationVolume, unit: 'm3', unitPrice: excavationVolume > 0 ? excavationCost / excavationVolume : 0, amount: excavationCost, remarks: '' }),
    createLineItem({ key: 'ext.soilRemoval', section: '土工', itemName: '残土搬出', specification: block.dumpTruck || '', quantity: soilRemovalVolume, unit: 'm3', unitPrice: soilRemovalVolume > 0 ? soilRemovalAmount / soilRemovalVolume : 0, amount: soilRemovalAmount, remarks: '' }),
    createLineItem({ key: 'ext.stone', section: '基礎工', itemName: '砕石工', specification: block.crushedStone || '', quantity: stoneVolume, unit: 'm3', unitPrice: stoneVolume > 0 ? stoneTotal / stoneVolume : 0, amount: stoneTotal, remarks: '' }),
    createLineItem({ key: 'ext.concrete', section: '基礎工', itemName: 'コンクリート工', specification: block.concrete || '', quantity: concreteVolume, unit: 'm3', unitPrice: concreteVolume > 0 ? concreteTotal / concreteVolume : 0, amount: concreteTotal, remarks: '' }),
    createLineItem({ key: 'ext.finish', section: '仕上工', itemName: '仕上げ工', specification: '', quantity: area, unit: 'm2', unitPrice: finishUnitPrice, amount: finishCost, remarks: '' }),
  ];

  return applyZoneBreakdowns(applyPhasedExecutionAdjustments(finalizeCommonResult({
    ...result,
    excavationVolume: round2(excavationVolume), excavationDays, machineAmount: Math.round(machineAmount),
    excavationConstructionAmount: Math.round(excavationCost),
    soilRemovalVolume: round2(soilRemovalVolume), soilRemovalAmount: Math.round(soilRemovalAmount),
    crushedStoneVolume: round2(stoneVolume), crushedStoneTotal: Math.round(stoneTotal),
    baseConcreteVolume: round2(concreteVolume), baseTotalAmount: Math.round(concreteTotal),
    materialTotalCost: Math.round(finishCost),
    displayName: block.name || '外構工', primaryQuantity: area, primaryUnit: 'm2',
    detailSections: [
      { id: 'ext-overview', title: '基本数量', tone: 'bg-slate-700', metrics: [metric('施工面積', area, 'm2'), metric('概算総額', excavationCost + soilRemovalAmount + stoneTotal + concreteTotal + finishCost, '円', 'currency')] },
      { id: 'ext-earth', title: '土工', tone: 'bg-blue-600', metrics: [metric('掘削量', excavationVolume, 'm3'), metric('残土量', soilRemovalVolume, 'm3')] },
      { id: 'ext-base', title: '基礎工', tone: 'bg-amber-500', metrics: [metric('砕石量', stoneVolume, 'm3'), metric('コンクリート量', concreteVolume, 'm3')] },
    ],
    lineItems,
    priceEvidence: [],
  }), block, context), block, context);
}

// ═══════════════════════════════════════════════════
// §NEW-2: 型枠工 (formwork) — 国交省土木積算基準準拠
// ═══════════════════════════════════════════════════
function calculateFormwork(block: EstimateBlock, options?: CalculationOptions): CalculationResult {
  const context = buildRateContext(block, options);
  const result = emptyResult('formwork', block.name || '型枠工', 'm2');
  const area = Math.max(0, block.formworkArea || 0);
  const laborCost = context.laborCost;
  const formworkType = block.formworkType || 'foundation';
  const formworkUnitPrice = block.formworkCost || 3500;

  // 国交省基準歩掛: 基礎=5.0m²/人日, 壁=4.5m²/人日, スラブ=6.0m²/人日
  const productivityMap: Record<string, number> = { foundation: 5.0, wall: 4.5, slab: 6.0 };
  const productivity = productivityMap[formworkType] ?? 5.0;

  const assemblyWorkers = area > 0 ? Math.ceil(area / productivity) : 0;
  const disassemblyWorkers = Math.ceil(assemblyWorkers * 0.4); // 解体は組立の40%
  const materialCost = area * formworkUnitPrice;
  const assemblyLabor = assemblyWorkers * laborCost;
  const disassemblyLabor = disassemblyWorkers * laborCost;
  const totalCost = materialCost + assemblyLabor + disassemblyLabor;

  const lineItems = [
    createLineItem({ key: 'fw.material', section: '型枠工', itemName: '型枠材料', specification: `${formworkType === 'foundation' ? '基礎' : formworkType === 'wall' ? '壁' : 'スラブ'}型枠`, quantity: area, unit: 'm2', unitPrice: formworkUnitPrice, amount: materialCost, remarks: '' }),
    createLineItem({ key: 'fw.assembly', section: '型枠工', itemName: '型枠組立', specification: `歩掛${productivity}m2/人日`, quantity: assemblyWorkers, unit: '人', unitPrice: laborCost, amount: assemblyLabor, remarks: '' }),
    createLineItem({ key: 'fw.disassembly', section: '型枠工', itemName: '型枠解体', specification: '組立の40%', quantity: disassemblyWorkers, unit: '人', unitPrice: laborCost, amount: disassemblyLabor, remarks: '' }),
  ];

  return applyZoneBreakdowns(applyPhasedExecutionAdjustments(finalizeCommonResult({
    ...result,
    formworkArea: round2(area), formworkMaterialCost: round2(materialCost),
    displayName: block.name || '型枠工', primaryQuantity: area, primaryUnit: 'm2',
    detailSections: [
      { id: 'fw-overview', title: '型枠数量', tone: 'bg-slate-700', metrics: [metric('型枠面積', area, 'm2'), metric('組立人工', assemblyWorkers, '人'), metric('解体人工', disassemblyWorkers, '人'), metric('合計', totalCost, '円', 'currency')] },
    ],
    lineItems,
    priceEvidence: [],
  }), block, context), block, context);
}

// ═══════════════════════════════════════════════════
// §NEW-3: 土間コンクリート工 (concrete_slab)
// ═══════════════════════════════════════════════════
function calculateConcreteSlab(block: EstimateBlock, options?: CalculationOptions): CalculationResult {
  const context = buildRateContext(block, options);
  const result = emptyResult('concrete_slab', block.name || '土間コンクリート工', 'm2');
  const area = Math.max(0, block.slabArea || 0);
  const slabThickness = Math.max(0, block.slabThickness || 0.15);
  const stoneThickness = Math.max(0, block.slabStoneThickness || 0.10);
  const hasWireMesh = block.slabHasWireMesh !== false;
  const laborCost = context.laborCost;
  const soilL = getLooseningFactor(block.groundCondition || '');

  // 掘削
  const excDepth = stoneThickness + slabThickness + 0.1;
  const excavationVolume = area * excDepth * soilL;
  const fourHourExc = context.machineCapacity > 0
    ? getFourHourExcavationCoefficient(context.machineCapacity) * context.machineCapacity : 0;
  const excavationDays = fourHourExc > 0 ? Math.ceil(excavationVolume / fourHourExc) : 0;
  const machineAmount = excavationDays * context.machineUnitPrice * 2;
  const excavationLabor = excavationDays * (Math.ceil(Math.sqrt(area) / 10) + 2) * laborCost;
  const excavationCost = excavationLabor + machineAmount;

  // 砕石
  const stoneVolume = area * stoneThickness * 1.2;
  const stoneCost = stoneVolume * context.stoneUnitPrice;
  const stoneLaborDays = fourHourExc > 0 ? Math.ceil(stoneVolume / fourHourExc) : 0;
  const stoneLabor = stoneLaborDays * Math.ceil(area / 50) * laborCost;
  const stoneTotal = stoneCost + stoneLabor;

  // コンクリート
  const concreteVolume = area * slabThickness * 1.1;
  const pouringW = getPouringWorkers(concreteVolume);
  const concreteCost = concreteVolume * context.concreteUnitPrice;
  const pouringLabor = pouringW * laborCost;
  // 左官仕上げ: 30m²/人日
  const plastererWorkers = area > 0 ? Math.ceil(area / 30) : 0;
  const plastererLabor = plastererWorkers * laborCost;
  const concreteTotal = concreteCost + pouringLabor + plastererLabor;

  // ワイヤーメッシュ
  const wireMeshArea = hasWireMesh ? area * 1.1 : 0; // ラップ代10%
  const wireMeshUnitPrice = 550; // 標準6-150 ¥550/m²
  const wireMeshCost = wireMeshArea * wireMeshUnitPrice;

  // 型枠 (外周)
  const perimeter = area > 0 ? Math.sqrt(area) * 4 : 0; // 近似正方形
  const formworkArea2 = perimeter * slabThickness;
  const formworkCost = formworkArea2 * (block.formworkCost || 3500);

  // 残土
  const soilRemovalVolume = Math.max(excavationVolume - area * (excDepth - stoneThickness - slabThickness) * soilL, 0);
  const soilRemovalAmount = soilRemovalVolume > 0 && context.dumpCapacity > 0
    ? Math.ceil(soilRemovalVolume / context.dumpCapacity) * context.dumpVehicleUnitPrice + laborCost : 0;

  const lineItems = [
    createLineItem({ key: 'slab.excavation', section: '土工', itemName: '掘削工', specification: block.machine || '', quantity: excavationVolume, unit: 'm3', unitPrice: excavationVolume > 0 ? excavationCost / excavationVolume : 0, amount: excavationCost, remarks: '' }),
    createLineItem({ key: 'slab.soilRemoval', section: '土工', itemName: '残土搬出', specification: '', quantity: soilRemovalVolume, unit: 'm3', unitPrice: soilRemovalVolume > 0 ? soilRemovalAmount / soilRemovalVolume : 0, amount: soilRemovalAmount, remarks: '' }),
    createLineItem({ key: 'slab.stone', section: '基礎工', itemName: '砕石工', specification: block.crushedStone || '', quantity: stoneVolume, unit: 'm3', unitPrice: stoneVolume > 0 ? stoneTotal / stoneVolume : 0, amount: stoneTotal, remarks: '' }),
    createLineItem({ key: 'slab.concrete', section: 'コンクリート工', itemName: '土間コンクリート', specification: `${block.concrete || ''} t=${slabThickness}m`, quantity: concreteVolume, unit: 'm3', unitPrice: concreteVolume > 0 ? concreteTotal / concreteVolume : 0, amount: concreteTotal, remarks: '打設+左官含む' }),
    ...(hasWireMesh ? [createLineItem({ key: 'slab.wiremesh', section: 'コンクリート工', itemName: 'ワイヤーメッシュ', specification: '6-150', quantity: wireMeshArea, unit: 'm2', unitPrice: wireMeshUnitPrice, amount: wireMeshCost, remarks: 'ラップ10%増' })] : []),
    createLineItem({ key: 'slab.formwork', section: 'コンクリート工', itemName: '型枠', specification: '外周', quantity: formworkArea2, unit: 'm2', unitPrice: formworkArea2 > 0 ? formworkCost / formworkArea2 : 0, amount: formworkCost, remarks: '' }),
  ];

  return applyZoneBreakdowns(applyPhasedExecutionAdjustments(finalizeCommonResult({
    ...result,
    excavationVolume: round2(excavationVolume), crushedStoneVolume: round2(stoneVolume),
    baseConcreteVolume: round2(concreteVolume), formworkArea: round2(formworkArea2),
    displayName: block.name || '土間コンクリート工', primaryQuantity: area, primaryUnit: 'm2',
    detailSections: [
      { id: 'slab-overview', title: '基本数量', tone: 'bg-slate-700', metrics: [metric('施工面積', area, 'm2'), metric('コンクリート量', concreteVolume, 'm3'), metric('概算総額', excavationCost + soilRemovalAmount + stoneTotal + concreteTotal + wireMeshCost + formworkCost, '円', 'currency')] },
    ],
    lineItems,
    priceEvidence: [],
  }), block, context), block, context);
}

// ═══════════════════════════════════════════════════
// §NEW-4: フェンス工 (fence)
// ═══════════════════════════════════════════════════
function calculateFence(block: EstimateBlock, options?: CalculationOptions): CalculationResult {
  const context = buildRateContext(block, options);
  const result = emptyResult('fence', block.name || 'フェンス工', 'm');
  const length = Math.max(0, block.fenceLength || 0);
  const height = Math.max(0, block.fenceHeight || 1.0);
  const postInterval = Math.max(0.5, block.fencePostInterval || 2.0);
  const laborCost = context.laborCost;
  const soilL = getLooseningFactor(block.groundCondition || '');

  const postCount = length > 0 ? Math.ceil(length / postInterval) + 1 : 0;
  const panelCount = length > 0 ? Math.ceil(length / postInterval) : 0;
  const postUnitPrice = block.fencePostUnitPrice || 3500;
  const panelUnitPrice = block.fencePanelUnitPrice || 5000;

  // 支柱基礎 (独立基礎: 0.3×0.3×0.5m)
  const foundationVolume = postCount * 0.3 * 0.3 * 0.5;
  const foundationExcavation = postCount * 0.4 * 0.4 * 0.6 * soilL;
  const foundationConcreteCost = foundationVolume * 1.1 * context.concreteUnitPrice;

  // 材料
  const postMaterialCost = postCount * postUnitPrice;
  const panelMaterialCost = panelCount * panelUnitPrice;

  // 労務: 15m/人日
  const installWorkers = length > 0 ? Math.ceil(length / 15) : 0;
  const installLabor = installWorkers * laborCost;

  const totalCost = foundationConcreteCost + postMaterialCost + panelMaterialCost + installLabor;

  const lineItems = [
    createLineItem({ key: 'fence.foundation', section: '基礎工', itemName: '支柱基礎', specification: `独立基礎 ${postCount}箇所`, quantity: foundationVolume, unit: 'm3', unitPrice: foundationVolume > 0 ? foundationConcreteCost / foundationVolume : 0, amount: foundationConcreteCost, remarks: '' }),
    createLineItem({ key: 'fence.post', section: 'フェンス工', itemName: '支柱', specification: `H=${height}m`, quantity: postCount, unit: '本', unitPrice: postUnitPrice, amount: postMaterialCost, remarks: '' }),
    createLineItem({ key: 'fence.panel', section: 'フェンス工', itemName: 'パネル', specification: block.fenceType || 'メッシュ', quantity: panelCount, unit: '枚', unitPrice: panelUnitPrice, amount: panelMaterialCost, remarks: '' }),
    createLineItem({ key: 'fence.install', section: 'フェンス工', itemName: '施工費', specification: '15m/人日', quantity: installWorkers, unit: '人', unitPrice: laborCost, amount: installLabor, remarks: '' }),
  ];

  return applyZoneBreakdowns(applyPhasedExecutionAdjustments(finalizeCommonResult({
    ...result,
    productCount: postCount, installWorkers,
    displayName: block.name || 'フェンス工', primaryQuantity: length, primaryUnit: 'm',
    detailSections: [
      { id: 'fence-overview', title: 'フェンス数量', tone: 'bg-slate-700', metrics: [metric('施工延長', length, 'm'), metric('支柱本数', postCount, '本'), metric('パネル枚数', panelCount, '枚'), metric('合計', totalCost, '円', 'currency')] },
    ],
    lineItems,
    priceEvidence: [],
  }), block, context), block, context);
}

// ═══════════════════════════════════════════════════
// §NEW-5: ブロック積工 (block_installation) — 国交省基準
// ═══════════════════════════════════════════════════
function calculateBlockInstallation(block: EstimateBlock, options?: CalculationOptions): CalculationResult {
  const context = buildRateContext(block, options);
  const result = emptyResult('block_installation', block.name || 'ブロック積工', 'm2');
  const blockLength = Math.max(0, block.blockLength || 0);
  const blockHeight = Math.max(0, block.blockHeight || 0);
  const area = Math.max(0, block.blockArea || (blockLength * blockHeight));
  const thickness = block.blockThickness || 0.12; // CB120
  const laborCost = context.laborCost;
  const soilL = getLooseningFactor(block.groundCondition || '');

  // ブロック数: 標準CB 390×190mm → 0.39×0.19 = 0.0741m²/個
  const blockCount = area > 0 ? Math.ceil(area / 0.0741) : 0;
  const blockUnitPrice = block.customUnitPrice || 250; // CB120 標準 ¥250/個

  // 基礎: 幅=ブロック厚+0.1m, 厚=0.15m
  const foundationWidth = thickness + 0.1;
  const foundationThickness = 0.15;
  const foundationConcreteVol = blockLength * foundationWidth * foundationThickness * 1.1;
  const foundationFormwork = blockLength * foundationThickness * 2;
  const stoneVolume = blockLength * foundationWidth * 0.1 * 1.2;

  // 鉄筋: 縦筋D10@800, 横筋D10@400
  const verticalBars = blockLength > 0 ? Math.ceil(blockLength / 0.8) : 0;
  const horizontalBars = blockHeight > 0 ? Math.ceil(blockHeight / 0.4) : 0;
  const rebarWeight = (verticalBars * blockHeight * 0.56) + (horizontalBars * blockLength * 0.56); // D10=0.56kg/m
  const rebarUnitPrice = 150; // ¥/kg

  // モルタル: 充填0.003m³/個 + 目地0.005m³/m²
  const mortarVolume = (blockCount * 0.003) + (area * 0.005);

  // 施工人工: 4.5m²/人日
  const installWorkers = area > 0 ? Math.ceil(area / 4.5) : 0;
  const installLabor = installWorkers * laborCost;

  // 掘削(基礎部分)
  const excavationVolume = blockLength * (foundationWidth + 0.2) * (foundationThickness + 0.1 + 0.1) * soilL;
  const fourHourExc = context.machineCapacity > 0
    ? getFourHourExcavationCoefficient(context.machineCapacity) * context.machineCapacity : 0;
  const excavationDays = fourHourExc > 0 ? Math.ceil(excavationVolume / fourHourExc) : 0;
  const excavationCost = (excavationDays * context.machineUnitPrice * 2) + (excavationDays * 3 * laborCost);

  const blockMaterialCost = blockCount * blockUnitPrice;
  const foundationConcreteCost = foundationConcreteVol * context.concreteUnitPrice;
  const foundationFormworkCost = foundationFormwork * (block.formworkCost || 3500);
  const stoneCost = stoneVolume * context.stoneUnitPrice;
  const rebarCost = rebarWeight * rebarUnitPrice;
  const mortarCost = mortarVolume * 26000; // モルタル1:3 ¥26,000/m³

  const lineItems = [
    createLineItem({ key: 'blk.excavation', section: '土工', itemName: '掘削工', specification: '', quantity: excavationVolume, unit: 'm3', unitPrice: excavationVolume > 0 ? excavationCost / excavationVolume : 0, amount: excavationCost, remarks: '' }),
    createLineItem({ key: 'blk.stone', section: '基礎工', itemName: '砕石基礎', specification: '', quantity: stoneVolume, unit: 'm3', unitPrice: context.stoneUnitPrice, amount: stoneCost, remarks: '' }),
    createLineItem({ key: 'blk.foundation', section: '基礎工', itemName: '基礎コンクリート', specification: '', quantity: foundationConcreteVol, unit: 'm3', unitPrice: context.concreteUnitPrice, amount: foundationConcreteCost, remarks: '' }),
    createLineItem({ key: 'blk.formwork', section: '基礎工', itemName: '基礎型枠', specification: '', quantity: foundationFormwork, unit: 'm2', unitPrice: block.formworkCost || 3500, amount: foundationFormworkCost, remarks: '' }),
    createLineItem({ key: 'blk.rebar', section: 'ブロック工', itemName: '鉄筋', specification: 'D10', quantity: rebarWeight, unit: 'kg', unitPrice: rebarUnitPrice, amount: rebarCost, remarks: '' }),
    createLineItem({ key: 'blk.block', section: 'ブロック工', itemName: 'CBブロック', specification: `厚${thickness * 1000}mm`, quantity: blockCount, unit: '個', unitPrice: blockUnitPrice, amount: blockMaterialCost, remarks: '' }),
    createLineItem({ key: 'blk.mortar', section: 'ブロック工', itemName: 'モルタル', specification: '1:3', quantity: mortarVolume, unit: 'm3', unitPrice: 26000, amount: mortarCost, remarks: '' }),
    createLineItem({ key: 'blk.install', section: 'ブロック工', itemName: '積み施工', specification: '4.5m2/人日', quantity: installWorkers, unit: '人', unitPrice: laborCost, amount: installLabor, remarks: '' }),
  ];

  return applyZoneBreakdowns(applyPhasedExecutionAdjustments(finalizeCommonResult({
    ...result,
    excavationVolume: round2(excavationVolume), crushedStoneVolume: round2(stoneVolume),
    baseConcreteVolume: round2(foundationConcreteVol), productCount: blockCount,
    displayName: block.name || 'ブロック積工', primaryQuantity: area, primaryUnit: 'm2',
    detailSections: [
      { id: 'blk-overview', title: 'ブロック数量', tone: 'bg-slate-700', metrics: [metric('施工面積', area, 'm2'), metric('ブロック数', blockCount, '個'), metric('鉄筋量', rebarWeight, 'kg'), metric('合計', excavationCost + stoneCost + foundationConcreteCost + foundationFormworkCost + rebarCost + blockMaterialCost + mortarCost + installLabor, '円', 'currency')] },
    ],
    lineItems,
    priceEvidence: [],
  }), block, context), block, context);
}

// ═══════════════════════════════════════════════════
// §NEW-6: 型枠ブロック工 (formwork_block)
// ═══════════════════════════════════════════════════
function calculateFormworkBlock(block: EstimateBlock, options?: CalculationOptions): CalculationResult {
  const context = buildRateContext(block, options);
  const result = emptyResult('formwork_block', block.name || '型枠ブロック工', 'm2');
  const fbLength = Math.max(0, block.formworkBlockLength || 0);
  const fbHeight = Math.max(0, block.formworkBlockHeight || 0);
  const area = Math.max(0, block.formworkBlockArea || (fbLength * fbHeight));
  const thickness = block.formworkBlockThickness || 0.15;
  const laborCost = context.laborCost;
  const soilL = getLooseningFactor(block.groundCondition || '');

  // ブロック数
  const blockCount = area > 0 ? Math.ceil(area / 0.0741) : 0;
  const blockUnitPrice = block.customUnitPrice || 450; // CP型枠ブロック ¥450/個

  // コンクリート充填: 面積×厚×充填率0.65
  const concreteFillVolume = area * thickness * 0.65;

  // 鉄筋: 縦D13@400, 横D10@200 (CBより密)
  const vertBars = fbLength > 0 ? Math.ceil(fbLength / 0.4) : 0;
  const horizBars = fbHeight > 0 ? Math.ceil(fbHeight / 0.2) : 0;
  const rebarWeight = (vertBars * fbHeight * 0.995) + (horizBars * fbLength * 0.56); // D13=0.995, D10=0.56
  const rebarUnitPrice = 150;

  // 基礎
  const foundationWidth = thickness + 0.15;
  const foundationVol = fbLength * foundationWidth * 0.2 * 1.1;
  const stoneVolume = fbLength * foundationWidth * 0.1 * 1.2;

  // 施工: 3.5m²/人日 (CBより低い歩掛)
  const installWorkers = area > 0 ? Math.ceil(area / 3.5) : 0;
  const installLabor = installWorkers * laborCost;

  // 掘削
  const excavationVolume = fbLength * (foundationWidth + 0.2) * 0.4 * soilL;

  const blockMaterialCost = blockCount * blockUnitPrice;
  const concreteFillCost = concreteFillVolume * context.concreteUnitPrice;
  const rebarCost = rebarWeight * rebarUnitPrice;
  const foundationCost = foundationVol * context.concreteUnitPrice;
  const stoneCost = stoneVolume * context.stoneUnitPrice;

  const lineItems = [
    createLineItem({ key: 'fblk.stone', section: '基礎工', itemName: '砕石基礎', specification: '', quantity: stoneVolume, unit: 'm3', unitPrice: context.stoneUnitPrice, amount: stoneCost, remarks: '' }),
    createLineItem({ key: 'fblk.foundation', section: '基礎工', itemName: '基礎コンクリート', specification: '', quantity: foundationVol, unit: 'm3', unitPrice: context.concreteUnitPrice, amount: foundationCost, remarks: '' }),
    createLineItem({ key: 'fblk.rebar', section: '型枠ブロック工', itemName: '鉄筋', specification: 'D13+D10', quantity: rebarWeight, unit: 'kg', unitPrice: rebarUnitPrice, amount: rebarCost, remarks: '' }),
    createLineItem({ key: 'fblk.block', section: '型枠ブロック工', itemName: 'CP型枠ブロック', specification: `厚${thickness * 1000}mm`, quantity: blockCount, unit: '個', unitPrice: blockUnitPrice, amount: blockMaterialCost, remarks: '' }),
    createLineItem({ key: 'fblk.fill', section: '型枠ブロック工', itemName: 'コンクリート充填', specification: '充填率65%', quantity: concreteFillVolume, unit: 'm3', unitPrice: context.concreteUnitPrice, amount: concreteFillCost, remarks: '' }),
    createLineItem({ key: 'fblk.install', section: '型枠ブロック工', itemName: '積み施工', specification: '3.5m2/人日', quantity: installWorkers, unit: '人', unitPrice: laborCost, amount: installLabor, remarks: '' }),
  ];

  return applyZoneBreakdowns(applyPhasedExecutionAdjustments(finalizeCommonResult({
    ...result,
    excavationVolume: round2(excavationVolume), crushedStoneVolume: round2(stoneVolume),
    baseConcreteVolume: round2(foundationVol + concreteFillVolume), productCount: blockCount,
    displayName: block.name || '型枠ブロック工', primaryQuantity: area, primaryUnit: 'm2',
    detailSections: [
      { id: 'fblk-overview', title: '型枠ブロック数量', tone: 'bg-slate-700', metrics: [metric('施工面積', area, 'm2'), metric('ブロック数', blockCount, '個'), metric('充填Con量', concreteFillVolume, 'm3'), metric('鉄筋量', rebarWeight, 'kg'), metric('合計', stoneCost + foundationCost + rebarCost + blockMaterialCost + concreteFillCost + installLabor, '円', 'currency')] },
    ],
    lineItems,
    priceEvidence: [],
  }), block, context), block, context);
}

// ═══════════════════════════════════════════════════
// §NEW-7: 構造物設置工 (structure_installation)
// ═══════════════════════════════════════════════════
function calculateStructureInstallation(block: EstimateBlock, options?: CalculationOptions): CalculationResult {
  const context = buildRateContext(block, options);
  const result = emptyResult('structure_installation', block.name || '構造物設置工', '箇所');
  const structureName = block.structureName || block.secondaryProduct || '構造物';
  const quantity = Math.max(0, block.structureQuantity || block.countQuantity || 0);
  const unit = block.structureUnit || block.countUnit || '箇所';
  const unitPrice = block.structureUnitPrice || block.customUnitPrice || 0;
  const laborCost = context.laborCost;

  const materialCost = quantity * unitPrice;
  // 設置労務: 構造物1箇所あたり0.5人日
  const installWorkers = quantity > 0 ? Math.ceil(quantity * 0.5) : 0;
  const installLabor = installWorkers * laborCost;

  const lineItems = [
    createLineItem({ key: 'struct.material', section: '構造物設置工', itemName: structureName, specification: '', quantity, unit, unitPrice, amount: materialCost, remarks: '' }),
    createLineItem({ key: 'struct.install', section: '構造物設置工', itemName: '設置施工', specification: '0.5人/箇所', quantity: installWorkers, unit: '人', unitPrice: laborCost, amount: installLabor, remarks: '' }),
  ];

  return applyZoneBreakdowns(applyPhasedExecutionAdjustments(finalizeCommonResult({
    ...result,
    productCount: quantity, materialTotalCost: Math.round(materialCost), installWorkers,
    displayName: structureName, primaryQuantity: quantity, primaryUnit: unit,
    detailSections: [
      { id: 'struct-overview', title: '構造物設置', tone: 'bg-slate-700', metrics: [metric('数量', quantity, unit), metric('材料費', materialCost, '円', 'currency'), metric('施工費', installLabor, '円', 'currency'), metric('合計', materialCost + installLabor, '円', 'currency')] },
    ],
    lineItems,
    priceEvidence: [],
  }), block, context), block, context);
}

// ═══════════════════════════════════════════════════
// §NEW-8: 自費工事 (self_funded_work)
// ═══════════════════════════════════════════════════
function calculateSelfFundedWork(block: EstimateBlock, options?: CalculationOptions): CalculationResult {
  const context = buildRateContext(block, options);
  const result = emptyResult('self_funded_work', block.name || '自費工事', '式');
  const itemName = block.selfFundedName || block.name || '自費工事';
  const quantity = Math.max(0, block.selfFundedQuantity || 0);
  const unit = block.selfFundedUnit || '式';
  const unitPrice = Math.max(0, block.selfFundedUnitPrice || 0);
  const amount = Math.round(quantity * unitPrice);

  const lineItems = [
    createLineItem({ key: 'self.work', section: '自費工事', itemName, specification: '', quantity, unit, unitPrice, amount, remarks: '自費（実費）工事' }),
  ];

  return applyZoneBreakdowns(applyPhasedExecutionAdjustments(finalizeCommonResult({
    ...result,
    materialTotalCost: amount,
    displayName: itemName, primaryQuantity: quantity, primaryUnit: unit,
    detailSections: [
      { id: 'self-overview', title: '自費工事', tone: 'bg-slate-700', metrics: [metric('数量', quantity, unit), metric('単価', unitPrice, '円', 'currency'), metric('合計', amount, '円', 'currency')] },
    ],
    lineItems,
    priceEvidence: [],
  }), block, context), block, context);
}

// ═══════════════════════════════════════════════════
// §NEW-9: 切盛土工 (cut_fill) — 国交省土木積算基準準拠
// ═══════════════════════════════════════════════════
function calculateCutFill(block: EstimateBlock, options?: CalculationOptions): CalculationResult {
  const context = buildRateContext(block, options);
  const result = emptyResult('cut_fill', block.name || '切盛土工', 'm3');
  const cutVol = Math.max(0, block.cutVolume || 0);
  const fillVol = Math.max(0, block.fillVolume || 0);
  const laborCost = context.laborCost;
  const soilL = getLooseningFactor(block.cutFillSoilType || block.groundCondition || '');
  // 締固め係数C (国交省基準)
  const soilCMap: Record<string, number> = { '砂質土': 0.88, '普通土': 0.90, '粘性土': 0.90, '礫質土': 0.92, '軟岩': 0.85 };
  const soilC = soilCMap[block.cutFillSoilType || ''] || 0.90;

  // 切土
  const cutVolumeLoose = cutVol * soilL;
  const fourHourExc = context.machineCapacity > 0
    ? getFourHourExcavationCoefficient(context.machineCapacity) * context.machineCapacity : 0;
  const cutDays = fourHourExc > 0 ? Math.ceil(cutVolumeLoose / fourHourExc) : 0;
  const cutMachineCost = cutDays * context.machineUnitPrice * 2;
  const cutWorkers = cutDays > 0 ? cutDays * 3 : 0;
  const cutLaborCost = cutWorkers * laborCost;
  const cutTotalCost = cutMachineCost + cutLaborCost;

  // 盛土に流用可能量
  const reuseVolume = Math.min(cutVolumeLoose, fillVol / soilC);
  // 残土搬出量
  const disposalVolume = Math.max(cutVolumeLoose - reuseVolume, 0);
  const disposalDays = fourHourExc > 0 ? Math.ceil(disposalVolume / fourHourExc) : 0;
  const dumpCount = context.dumpCapacity > 0 ? Math.ceil(disposalVolume / context.dumpCapacity) : 0;
  const regularDumpCount = disposalDays > 0 ? Math.ceil(dumpCount / disposalDays) : 0;
  const disposalCost = (regularDumpCount * context.dumpVehicleUnitPrice * disposalDays) + (disposalDays * laborCost);

  // 盛土
  const fillNeeded = fillVol / soilC; // 必要ほぐし土量
  const importVolume = Math.max(fillNeeded - reuseVolume, 0); // 外部搬入量
  const fillDays = fourHourExc > 0 ? Math.ceil(fillVol / fourHourExc) : 0;
  const fillMachineCost = fillDays * context.machineUnitPrice * 2;
  const fillWorkers = fillDays > 0 ? fillDays * 3 : 0;
  const fillLaborCost = fillWorkers * laborCost;
  // 転圧: 1層30cm
  const compactionLayers = fillVol > 0 ? Math.ceil((fillVol / (fillVol > 0 ? Math.cbrt(fillVol * fillVol) : 1)) / 0.3) : 0;
  const compactionCost = compactionLayers > 0 ? compactionLayers * context.machineUnitPrice : 0;
  const fillTotalCost = fillMachineCost + fillLaborCost + compactionCost;

  // 法面 (オプション)
  const slopeHeight = Math.max(0, block.cutFillSlopeHeight || 0);
  const slopeGradient = block.cutFillSlopeGradient || 1.5;
  const slopeLength = slopeHeight > 0 ? Math.sqrt(slopeHeight * slopeHeight + (slopeHeight * slopeGradient) * (slopeHeight * slopeGradient)) : 0;
  const slopeArea = slopeLength * (cutVol > 0 ? Math.cbrt(cutVol) : 0);
  const slopeProtectionCost = slopeArea * 2500; // 法面保護 ¥2,500/m²

  const lineItems = [
    createLineItem({ key: 'cf.cut', section: '切土工', itemName: '掘削・積込', specification: block.machine || '', quantity: cutVolumeLoose, unit: 'm3', unitPrice: cutVolumeLoose > 0 ? cutTotalCost / cutVolumeLoose : 0, amount: cutTotalCost, remarks: `L=${soilL}` }),
    createLineItem({ key: 'cf.disposal', section: '切土工', itemName: '残土搬出', specification: block.dumpTruck || '', quantity: disposalVolume, unit: 'm3', unitPrice: disposalVolume > 0 ? disposalCost / disposalVolume : 0, amount: disposalCost, remarks: '' }),
    createLineItem({ key: 'cf.fill', section: '盛土工', itemName: '盛土・転圧', specification: `C=${soilC}`, quantity: fillVol, unit: 'm3', unitPrice: fillVol > 0 ? fillTotalCost / fillVol : 0, amount: fillTotalCost, remarks: '' }),
    ...(slopeArea > 0 ? [createLineItem({ key: 'cf.slope', section: '法面工', itemName: '法面保護', specification: `勾配1:${slopeGradient}`, quantity: slopeArea, unit: 'm2', unitPrice: 2500, amount: slopeProtectionCost, remarks: '' })] : []),
  ];

  const totalQuantity = cutVol + fillVol;

  return applyZoneBreakdowns(applyPhasedExecutionAdjustments(finalizeCommonResult({
    ...result,
    excavationVolume: round2(cutVolumeLoose), soilRemovalVolume: round2(disposalVolume),
    soilRemovalAmount: Math.round(disposalCost), backfillVolume: round2(fillVol),
    displayName: block.name || '切盛土工', primaryQuantity: totalQuantity, primaryUnit: 'm3',
    detailSections: [
      { id: 'cf-overview', title: '土量', tone: 'bg-slate-700', metrics: [metric('切土(地山)', cutVol, 'm3'), metric('切土(ほぐし)', cutVolumeLoose, 'm3'), metric('盛土(締固め後)', fillVol, 'm3'), metric('流用土量', reuseVolume, 'm3'), metric('残土搬出', disposalVolume, 'm3'), metric('外部搬入', importVolume, 'm3')] },
      { id: 'cf-cost', title: '費用', tone: 'bg-blue-600', metrics: [metric('切土費', cutTotalCost, '円', 'currency'), metric('搬出費', disposalCost, '円', 'currency'), metric('盛土費', fillTotalCost, '円', 'currency'), metric('法面保護費', slopeProtectionCost, '円', 'currency'), metric('合計', cutTotalCost + disposalCost + fillTotalCost + slopeProtectionCost, '円', 'currency')] },
    ],
    lineItems,
    priceEvidence: [],
  }), block, context), block, context);
}

export function calculate(block: EstimateBlock, options?: CalculationOptions): CalculationResult {
  switch (block.blockType) {
    case 'retaining_wall':
      return calculateRetainingWall(block, options);
    case 'exterior_work':
      return calculateExteriorWork(block, options);
    case 'formwork':
      return calculateFormwork(block, options);
    case 'concrete_slab':
      return calculateConcreteSlab(block, options);
    case 'fence':
      return calculateFence(block, options);
    case 'block_installation':
      return calculateBlockInstallation(block, options);
    case 'formwork_block':
      return calculateFormworkBlock(block, options);
    case 'structure_installation':
      return calculateStructureInstallation(block, options);
    case 'self_funded_work':
      return calculateSelfFundedWork(block, options);
    case 'cut_fill':
      return calculateCutFill(block, options);
    case 'pavement':
      return calculatePavement(block, options);
    case 'demolition':
      return calculateDemolition(block, options);
    case 'count_structure':
      return calculateCountStructure(block, options);
    case 'material_takeoff':
      return calculateMaterialTakeoff(block, options);
    case 'secondary_product':
    default:
      return calculateSecondaryProduct(block, options);
  }
}
