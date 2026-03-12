import type { EstimateBlock, CalculationResult } from './types';
import {
  backhoes,
  dumpTrucks,
  crushedStones,
  concretes,
  secondaryProducts,
  productLengths,
  workabilityFactors,
  getFourHourExcavationCoefficient,
  getPouringWorkers,
} from './priceData';

export function calculate(block: EstimateBlock): CalculationResult {
  const distance = block.distance || 0;
  const currentHeight = block.currentHeight || 0;
  const plannedHeight = block.plannedHeight || 0;
  const laborCost = block.laborCost || 27500;
  const stages = block.stages || 1;
  const crushedStoneThickness = block.crushedStoneThickness || 0;
  const baseThickness = block.baseThickness || 0;
  const formworkCost = block.formworkCost || 0;
  const productWidth = block.productWidth || 0;
  const productHeight = block.productHeight || 0;
  const installLaborCost = block.installLaborCost || 27500;
  const sandCost = block.sandCost || 0;
  const shippingCost = block.shippingCost || 0;

  // 機械情報取得
  const selectedMachine = backhoes.find(m => m.name === block.machine);
  const machineUnitPrice = selectedMachine?.price || 0;
  const machineCapacity = selectedMachine?.capacity || 0;

  // ダンプ情報取得
  const selectedDump = dumpTrucks.find(d => d.name === block.dumpTruck);
  const dumpVehicleUnitPrice = selectedDump?.price || 0;
  const dumpCapacity = selectedDump?.capacity || 0;

  // 砕石情報取得
  const selectedStone = crushedStones.find(s => s.name === block.crushedStone);
  const stoneUnitPrice = selectedStone?.price || 0;

  // 生コン情報取得
  const selectedConcrete = concretes.find(c => c.name === block.concrete);
  const concreteUnitPrice = selectedConcrete?.price || 0;

  // 二次製品情報取得
  const selectedProduct = secondaryProducts.find(p => p.name === block.secondaryProduct);
  const productUnitPrice = selectedProduct?.price || 0;

  // 製品長さ取得
  const selectedLength = productLengths.find(l => l.name === block.productLength);
  const productLengthValue = selectedLength?.value || 0;

  // 施工性係数取得
  const selectedFactor = workabilityFactors.find(f => f.name === block.workabilityFactor);
  const workabilityFactorValue = selectedFactor?.value || 0;

  // === 掘削計算 ===
  const excavationWidth = productWidth + 0.4;
  const excavationHeight = currentHeight - plannedHeight + productHeight + crushedStoneThickness + baseThickness;
  const excavationVolume = excavationWidth * excavationHeight * distance * 1.25;
  const fourHourExcavation = machineCapacity > 0
    ? getFourHourExcavationCoefficient(machineCapacity) * machineCapacity
    : 0;
  const excavationDays = fourHourExcavation > 0
    ? Math.ceil(excavationVolume / fourHourExcavation)
    : 0;
  const excavationDailyWorkers = distance > 0
    ? Math.ceil(distance / 15) + 2
    : 0;
  const excavationWorkers = excavationDays * excavationDailyWorkers;
  // 機械金額 = 掘削日数 × 機械単価 × 2（元サイトの計算に合わせる）
  const machineAmount = excavationDays * machineUnitPrice * 2;
  const excavationConstructionAmount = (excavationWorkers * laborCost) + machineAmount;
  const excavationUnitPerM = distance > 0
    ? Math.round(excavationConstructionAmount / distance)
    : 0;

  // === 埋め戻し計算 ===
  const backfillVolume = distance * productWidth * productHeight * 1.25;
  const backfillDays = fourHourExcavation > 0
    ? Math.ceil(backfillVolume / fourHourExcavation)
    : 0;
  const backfillWorkers = distance > 0 ? 1 + Math.floor(backfillVolume / 2) : 0;
  const backfillLaborCost = distance > 0 ? backfillWorkers * laborCost : 0;

  // === 残土搬出計算 ===
  const soilRemovalVolume = excavationVolume - backfillVolume;
  const soilRemovalDays = fourHourExcavation > 0
    ? Math.ceil(soilRemovalVolume / fourHourExcavation)
    : 0;
  const dumpCount = dumpCapacity > 0
    ? Math.ceil(soilRemovalVolume / dumpCapacity)
    : 0;
  // 常用ダンプ台数 = ceil(搬出台数 / (4時間掘削量 / 2))
  const regularDumpCount = fourHourExcavation > 0
    ? Math.ceil(dumpCount / (fourHourExcavation / 2))
    : 0;
  // 常用ダンプ単価 = 機械単価 × 2
  const regularDumpUnitPrice = machineUnitPrice * 2;
  const soilRemovalAmount = (soilRemovalDays * dumpCount * dumpVehicleUnitPrice)
    + (regularDumpCount * regularDumpUnitPrice)
    + (soilRemovalDays * laborCost);
  const soilRemovalUnitPerM = distance > 0
    ? Math.round(soilRemovalAmount / distance)
    : 0;

  // === 砕石計算 ===
  const crushedStoneVolume = distance * crushedStoneThickness * excavationWidth * 1.2;
  const crushedStoneWorkers = distance > 0 && excavationWidth > 0
    ? Math.ceil((distance * excavationWidth) / 9)
    : 0;
  // 砕石日数 = ceil(砕石量 / 4時間掘削量)
  const crushedStoneDays = fourHourExcavation > 0
    ? Math.ceil(crushedStoneVolume / fourHourExcavation)
    : 0;
  const crushedStoneLaborCost = crushedStoneDays * crushedStoneWorkers * laborCost;
  // 砕石機械費 = 砕石日数 × 機械単価（×1、掘削の×2とは異なる）
  const crushedStoneMachineCost = crushedStoneDays * machineUnitPrice;
  const crushedStoneConstructionAmount = crushedStoneLaborCost + crushedStoneMachineCost;
  const crushedStoneMaterialCost = crushedStoneVolume * stoneUnitPrice;
  const crushedStoneTotal = crushedStoneConstructionAmount + crushedStoneMaterialCost;
  const crushedStoneUnitPerM = distance > 0
    ? Math.round(crushedStoneTotal / distance)
    : 0;

  // === ベース計算 ===
  const baseWidth = productWidth + 0.1;
  const baseConcreteVolume = distance * baseWidth * baseThickness * 1.1;
  const pouringWorkers = getPouringWorkers(baseConcreteVolume);
  const formworkArea = distance * baseThickness * 2;
  const formworkMaterialCost = formworkArea * formworkCost;
  const baseTotalAmount = distance > 0
    ? (baseConcreteVolume * concreteUnitPrice)
      + (pouringWorkers * laborCost)
      + formworkMaterialCost
    : 0;
  const baseUnitPerM = distance > 0
    ? Math.round(baseTotalAmount / distance)
    : 0;

  // === 二次製品計算 ===
  const mortar = baseWidth * distance * 0.02 * stages;
  const sand = mortar * productLengthValue;
  const sandAmount = sand * sandCost;
  const cement = Math.ceil(mortar * 0.3 * 1.6 * 1000 / 25);
  const cementAmount = cement * 600;
  const water = mortar * 0.1 * 1000;

  // 本数計算
  let productCount = 0;
  if (productLengthValue > 0) {
    const rawCount = (distance / productLengthValue) * stages;
    const decimal = rawCount - Math.floor(rawCount);
    if (decimal <= 0.49) {
      productCount = Math.floor(rawCount) + 2;
    } else {
      productCount = Math.ceil(rawCount);
    }
  }

  const materialTotalCost = (productCount * productUnitPrice) + shippingCost;
  const installWorkers = Math.ceil(productCount * 0.03 * workabilityFactorValue);
  const secondaryProductTotal = sandAmount + cementAmount + materialTotalCost
    + (installWorkers * installLaborCost);
  const secondaryProductUnitPerM = distance > 0
    ? Math.ceil(secondaryProductTotal / distance)
    : 0;

  return {
    excavationWidth: Math.round(excavationWidth * 100) / 100,
    excavationHeight: Math.round(excavationHeight * 100) / 100,
    excavationVolume: Math.round(excavationVolume * 100) / 100,
    fourHourExcavation: Math.round(fourHourExcavation * 100) / 100,
    excavationDays,
    excavationDailyWorkers,
    excavationWorkers,
    machineUnitPrice,
    machineAmount,
    excavationConstructionAmount,
    excavationUnitPerM,
    soilRemovalVolume: Math.round(soilRemovalVolume * 100) / 100,
    soilRemovalDays,
    dumpCapacity,
    dumpCount,
    dumpVehicleUnitPrice,
    regularDumpCount,
    regularDumpUnitPrice,
    soilRemovalAmount,
    soilRemovalUnitPerM,
    backfillVolume: Math.round(backfillVolume * 100) / 100,
    backfillDays,
    backfillWorkers,
    backfillLaborCost,
    crushedStoneVolume: Math.round(crushedStoneVolume * 100) / 100,
    crushedStoneWorkers,
    crushedStoneDays,
    crushedStoneLaborCost,
    crushedStoneMachineCost,
    crushedStoneConstructionAmount,
    crushedStoneMaterialCost: Math.round(crushedStoneMaterialCost * 100) / 100,
    crushedStoneTotal: Math.round(crushedStoneTotal * 100) / 100,
    crushedStoneUnitPerM,
    baseWidth: Math.round(baseWidth * 100) / 100,
    baseConcreteVolume: Math.round(baseConcreteVolume * 100) / 100,
    concreteUnitPrice,
    pouringWorkers,
    formworkArea: Math.round(formworkArea * 100) / 100,
    formworkMaterialCost: Math.round(formworkMaterialCost * 100) / 100,
    baseTotalAmount: Math.ceil(baseTotalAmount),
    baseUnitPerM,
    mortar: Math.round(mortar * 100) / 100,
    sand: Math.round(sand * 100) / 100,
    sandAmount: Math.round(sandAmount * 100) / 100,
    cement,
    cementAmount,
    water: Math.round(water * 100) / 100,
    productUnitPrice,
    productCount,
    materialTotalCost,
    installWorkers,
    secondaryProductTotal: Math.ceil(secondaryProductTotal),
    secondaryProductUnitPerM,
  };
}
