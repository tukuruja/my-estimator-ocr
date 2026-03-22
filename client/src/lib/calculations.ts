import type {
  BlockType,
  CalculationDetailSection,
  CalculationEvidence,
  CalculationLineItem,
  CalculationMetricRow,
  CalculationResult,
  EstimateBlock,
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
} from './priceData';
import { createSeedMasterItems, findMasterByName } from './masterData';

const SEED_MASTERS = createSeedMasterItems();
const DEFAULT_EFFECTIVE_DATE = '2026-03-12';

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
  const setupUnitPrice = Math.round(
    context.laborCost * (block.blockType === 'pavement' ? 1.4 : 1.8)
      + (context.machineUnitPrice > 0 ? context.machineUnitPrice * 0.35 : 0),
  );
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

function calculateSecondaryProduct(block: EstimateBlock, options?: CalculationOptions): CalculationResult {
  const context = buildRateContext(block, options);
  const result = emptyResult('secondary_product', block.secondaryProduct || '二次製品工', 'm');
  const distance = block.distance || 0;
  const currentHeight = block.currentHeight || 0;
  const plannedHeight = block.plannedHeight || 0;
  const laborCost = context.laborCost;
  const stages = block.stages || 1;
  const crushedStoneThickness = block.crushedStoneThickness || 0;
  const baseThickness = block.baseThickness || 0;
  const formworkCost = block.formworkCost || 0;
  const productWidth = block.productWidth || 0;
  const productHeight = block.productHeight || 0;
  const installLaborCost = block.installLaborCost || laborCost;
  const sandCost = block.sandCost || 0;
  const shippingCost = block.shippingCost || 0;

  const selectedLength = productLengths.find((item) => item.name === block.productLength);
  const productLengthValue = selectedLength?.value || 0;
  const selectedFactor = workabilityFactors.find((item) => item.name === block.workabilityFactor);
  const workabilityFactorValue = selectedFactor?.value || 1;

  const excavationWidth = productWidth + 0.4;
  const excavationHeight = currentHeight - plannedHeight + productHeight + crushedStoneThickness + baseThickness;
  const excavationVolume = excavationWidth * excavationHeight * distance * 1.25;
  const fourHourExcavation = context.machineCapacity > 0
    ? getFourHourExcavationCoefficient(context.machineCapacity) * context.machineCapacity
    : 0;
  const excavationDays = fourHourExcavation > 0 ? Math.ceil(excavationVolume / fourHourExcavation) : 0;
  const excavationDailyWorkers = distance > 0 ? Math.ceil(distance / 15) + 2 : 0;
  const excavationWorkers = excavationDays * excavationDailyWorkers;
  const machineAmount = excavationDays * context.machineUnitPrice * 2;
  const excavationConstructionAmount = (excavationWorkers * laborCost) + machineAmount;

  const backfillVolume = distance * productWidth * productHeight * 1.25;
  const backfillDays = fourHourExcavation > 0 ? Math.ceil(backfillVolume / fourHourExcavation) : 0;
  const backfillWorkers = distance > 0 ? 1 + Math.floor(backfillVolume / 2) : 0;
  const backfillLaborCost = distance > 0 ? backfillWorkers * laborCost : 0;

  const soilRemovalVolume = Math.max(excavationVolume - backfillVolume, 0);
  const soilRemovalDays = fourHourExcavation > 0 ? Math.ceil(soilRemovalVolume / fourHourExcavation) : 0;
  const dumpCount = context.dumpCapacity > 0 ? Math.ceil(soilRemovalVolume / context.dumpCapacity) : 0;
  const regularDumpCount = fourHourExcavation > 0 ? Math.ceil(dumpCount / Math.max(fourHourExcavation / 2, 1)) : 0;
  const regularDumpUnitPrice = context.machineUnitPrice * 2;
  const soilRemovalAmount = (soilRemovalDays * dumpCount * context.dumpVehicleUnitPrice)
    + (regularDumpCount * regularDumpUnitPrice)
    + (soilRemovalDays * laborCost);

  const crushedStoneVolume = distance * crushedStoneThickness * excavationWidth * 1.2;
  const crushedStoneWorkers = distance > 0 && excavationWidth > 0 ? Math.ceil((distance * excavationWidth) / 9) : 0;
  const crushedStoneDays = fourHourExcavation > 0 ? Math.ceil(crushedStoneVolume / fourHourExcavation) : 0;
  const crushedStoneLaborCost = crushedStoneDays * crushedStoneWorkers * laborCost;
  const crushedStoneMachineCost = crushedStoneDays * context.machineUnitPrice;
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
  const sand = mortar * productLengthValue;
  const sandAmount = sand * sandCost;
  const cement = Math.ceil(mortar * 0.3 * 1.6 * 1000 / 25);
  const cementAmount = cement * context.cementUnitPrice;
  const water = mortar * 0.1 * 1000;

  let productCount = 0;
  if (productLengthValue > 0) {
    const rawCount = (distance / productLengthValue) * stages;
    const decimal = rawCount - Math.floor(rawCount);
    productCount = decimal <= 0.49 ? Math.floor(rawCount) + 2 : Math.ceil(rawCount);
  }

  const materialTotalCost = (productCount * context.productUnitPrice) + shippingCost;
  const installWorkers = Math.ceil(productCount * 0.03 * workabilityFactorValue);
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

  return applyPhasedExecutionAdjustments(finalizeCommonResult({
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
    regularDumpUnitPrice,
    soilRemovalAmount: Math.round(soilRemovalAmount),
    soilRemovalUnitPerM: distance > 0 ? Math.round(soilRemovalAmount / distance) : 0,
    backfillVolume: round2(backfillVolume),
    backfillDays,
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
  }), block, context);
}

function calculateRetainingWall(block: EstimateBlock, options?: CalculationOptions): CalculationResult {
  const context = buildRateContext(block, options);
  const result = emptyResult('retaining_wall', block.secondaryProduct || '擁壁工', 'm');
  const length = block.distance || 0;
  const wallHeight = block.productHeight || 0;
  const baseWidth = block.productWidth || 0;
  const baseThickness = block.baseThickness || 0;
  const stoneThickness = block.crushedStoneThickness || 0;
  const laborCost = context.laborCost;
  const wallTypeFactor = /重力/.test(block.secondaryProduct) ? 0.65 : /逆T/i.test(block.secondaryProduct) ? 0.38 : /L型/i.test(block.secondaryProduct) ? 0.34 : 0.45;

  const excavationWidth = baseWidth + 1.0;
  const excavationHeight = wallHeight + baseThickness + stoneThickness;
  const excavationVolume = excavationWidth * excavationHeight * length * 1.2;
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
  const regularDumpCount = fourHourExcavation > 0 ? Math.ceil(dumpCount / Math.max(fourHourExcavation / 2, 1)) : 0;
  const regularDumpUnitPrice = context.machineUnitPrice * 2;
  const soilRemovalAmount = (soilRemovalDays * dumpCount * context.dumpVehicleUnitPrice)
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

  return applyPhasedExecutionAdjustments(finalizeCommonResult({
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
  }), block, context);
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
  const subBaseLabor = area > 0 ? Math.ceil(area / 120) * laborCost : 0;
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

  return applyPhasedExecutionAdjustments(finalizeCommonResult({
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
  }), block, context);
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

  return applyPhasedExecutionAdjustments(finalizeCommonResult({
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
  }), block, context);
}

export function calculate(block: EstimateBlock, options?: CalculationOptions): CalculationResult {
  switch (block.blockType) {
    case 'retaining_wall':
      return calculateRetainingWall(block, options);
    case 'pavement':
      return calculatePavement(block, options);
    case 'demolition':
      return calculateDemolition(block, options);
    case 'secondary_product':
    default:
      return calculateSecondaryProduct(block, options);
  }
}
