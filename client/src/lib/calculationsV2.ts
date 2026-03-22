/**
 * calculationsV2.ts
 * 世界標準対応 強化版計算エンジン v2.0
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 【採用国際標準・根拠】
 *  ① 国土交通省「土木工事標準積算基準書」   → 土質区分 L値・C値
 *  ② AACE International (Class 3 Estimate)  → 予備費率・原価分類
 *  ③ FIDIC Rainbow Suite (Silver Book)       → 品質管理費・安全管理費率
 *  ④ AASHTO Transportation Manual            → ダンプサイクルタイム計算
 *  ⑤ ISO 31000 Risk Management               → リスク費用構造
 *  ⑥ Lean Construction Institute             → 施工性補正係数
 *  ⑦ ISO 15686 (Life Cycle Costing)          → 費用比率分析指標
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 【V1からの主要改善点】
 *  1. 固定 ×1.25 → 土質区分に応じた L値（ほぐし係数）に変更
 *  2. ダンプ台数のみ → 処分場距離×往復サイクル時間で稼働台数を精算
 *  3. 市街地・密集市街地の施工条件補正係数を追加
 *  4. 季節・天候による生産性係数を追加
 *  5. 品質管理費・安全管理費・諸経費・予備費を正式計上
 *  6. 労務費比率・材料費比率・機械費比率を出力（国際的原価分析）
 */

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

// ╔══════════════════════════════════════════════════════════════╗
// ║  拡張マスタデータ                                            ║
// ╚══════════════════════════════════════════════════════════════╝

/**
 * 土質区分マスタ
 *
 * L値（ほぐし係数）: ほぐし土量 / 地山土量
 *   掘削・運搬時の実際の体積増加量
 *
 * C値（締固め係数）: 締固め土量 / 地山土量
 *   締固め後の体積（盛土・埋戻の圧縮量）
 *
 * productivityFactor: バックホー生産性低下係数（1.0=基準、大きいほど遅い）
 *
 * 出典: 国土交通省 土木工事標準積算基準書 第1編 土工
 */
export const soilTypesMaster = [
  {
    name: '普通土',
    L: 1.20, C: 0.90,
    productivityFactor: 1.00,
    description: '一般的な盛土・自然地盤（山砂・関東ローム等）',
  },
  {
    name: '砂質土',
    L: 1.15, C: 0.88,
    productivityFactor: 0.95,
    description: '砂・砂礫混じり（崩れやすく掘削は容易）',
  },
  {
    name: '粘性土',
    L: 1.25, C: 0.90,
    productivityFactor: 1.10,
    description: '粘土・シルト（掘削抵抗やや大、締固め良好）',
  },
  {
    name: '礫質土',
    L: 1.20, C: 0.92,
    productivityFactor: 1.05,
    description: '砂礫・礫混じり土（掘削抵抗中程度）',
  },
  {
    name: '軟岩Ⅰ',
    L: 1.35, C: 0.85,
    productivityFactor: 1.80,
    description: '泥岩・砂岩（風化進んだもの）',
  },
  {
    name: '軟岩Ⅱ',
    L: 1.50, C: 0.80,
    productivityFactor: 2.50,
    description: '粘板岩・頁岩（中程度の硬岩）',
  },
  {
    name: '硬岩',
    L: 1.70, C: 0.75,
    productivityFactor: 4.00,
    description: '花崗岩・安山岩（発破が必要な硬岩）',
  },
] as const;

export type SoilTypeName = typeof soilTypesMaster[number]['name'];

/**
 * 施工条件マスタ
 *
 * laborFactor:   労務費に掛ける補正係数
 * machineFactor: 機械費に掛ける補正係数
 *
 * 出典: FIDIC Silver Book / 国交省 施工条件明示マニュアル
 */
export const siteConditionsMaster = [
  {
    name: '一般地',
    laborFactor: 1.00,
    machineFactor: 1.00,
    description: '郊外・交通規制不要・作業スペース十分',
  },
  {
    name: '市街地',
    laborFactor: 1.15,
    machineFactor: 1.20,
    description: '交通量多い道路・片側通行規制・作業スペース制限あり',
  },
  {
    name: '密集市街地',
    laborFactor: 1.30,
    machineFactor: 1.40,
    description: '狭隘路・夜間作業・重機制限・近接施工等',
  },
] as const;

export type SiteConditionName = typeof siteConditionsMaster[number]['name'];

/**
 * 季節・天候係数マスタ
 *
 * factor: 生産性全体に掛ける係数（1.0=フル稼働）
 *
 * 出典: 国交省 積算基準 気象条件補正
 */
export const seasonFactorsMaster = [
  { name: '通常期（春・秋）', factor: 1.00, description: '3〜5月・9〜11月' },
  { name: '夏季（7〜8月）',   factor: 0.90, description: '熱中症対策で実稼働時間短縮' },
  { name: '冬季（12〜2月）',  factor: 0.85, description: '降雪・凍結・日照時間短縮' },
  { name: '雨天多発時期',     factor: 0.80, description: '梅雨・台風期（稼働日数減少）' },
] as const;

export type SeasonFactorName = typeof seasonFactorsMaster[number]['name'];

// ╔══════════════════════════════════════════════════════════════╗
// ║  拡張入力型・出力型                                          ║
// ╚══════════════════════════════════════════════════════════════╝

/** V2 拡張入力パラメータ（EstimateBlock を継承） */
export interface EstimateBlockV2 extends EstimateBlock {
  /** 土質区分（soilTypesMaster.name） */
  soilType: SoilTypeName;
  /** 施工条件（siteConditionsMaster.name） */
  siteCondition: SiteConditionName;
  /** 季節・天候係数（seasonFactorsMaster.name） */
  seasonFactor: SeasonFactorName;
  /** 残土処分場までの片道距離（km）- 0で距離未考慮（従来通り4往復/日） */
  disposalDistance: number;
  /** 予備費率（%）- AACE Class3 標準: 10% */
  contingencyRate: number;
  /** 諸経費率（%）- 国交省積算基準 標準: 15% */
  overheadRate: number;
  /** 品質管理費率（%）- FIDIC標準: 2% */
  qualityControlRate: number;
  /** 安全管理費率（%）- 労働安全衛生法準拠: 3% */
  safetyRate: number;
}

/** V2 計算結果（CalculationResult を継承） */
export interface CalculationResultV2 extends CalculationResult {
  // ── 土質区分情報 ──────────────────────────────
  soilLValue: number;               // ほぐし係数 L
  soilCValue: number;               // 締固め係数 C
  soilProductivityFactor: number;   // 掘削生産性係数

  // ── 施工条件補正情報 ─────────────────────────
  siteConditionLaborFactor: number;   // 労務費補正係数
  siteConditionMachineFactor: number; // 機械費補正係数
  effectiveWorkingFactor: number;     // 季節・天候係数

  // ── 処分場距離考慮のダンプ稼働 ───────────────
  disposalDistance: number;         // 片道距離（km）
  dumpRoundTripTime: number;        // 1往復あたり時間（時間）
  dumpTripsPerDay: number;          // 1日の往復回数
  adjustedDumpCount: number;        // 距離考慮後の必要稼働台数
  adjustedSoilRemovalAmount: number;// 補正後残土搬出費

  // ── 間接費・管理費（V2新規）─────────────────
  qualityControlCost: number;       // 品質管理費
  safetyCost: number;               // 安全管理費
  directCostSubtotal: number;       // 直接工事費合計
  overheadCost: number;             // 諸経費
  contingencyCost: number;          // 予備費
  grandTotal: number;               // 総工事費
  grandTotalPerM: number;           // 総工事費 m単価

  // ── 国際標準 原価比率分析 ─────────────────
  laborCostTotal: number;           // 労務費合計
  materialCostTotal: number;        // 材料費合計
  machineCostTotal: number;         // 機械費合計
  laborRatio: number;               // 労務費比率（%）
  materialRatio: number;            // 材料費比率（%）
  machineRatio: number;             // 機械費比率（%）
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  補助関数                                                    ║
// ╚══════════════════════════════════════════════════════════════╝

/**
 * ダンプトラック 1往復サイクルタイム計算
 *
 * 計算式（AASHTO Transportation Manual 準拠）:
 *   往復移動時間 = 片道距離 × 2 ÷ 平均速度 × 60 (分)
 *   1サイクル   = 往復移動 + 積込時間 + 荷下ろし時間 + 待機時間
 *   1日往復回数 = floor(実稼働時間 ÷ 1サイクル)
 *
 * @param disposalDistance 処分場までの片道距離（km）
 * @param _dumpCapacity    積載量（将来的な重量制限への拡張用）
 */
export function calculateDumpCycleTime(
  disposalDistance: number,
  _dumpCapacity: number = 0,
): { roundTripTime: number; tripsPerDay: number } {
  if (disposalDistance <= 0) {
    // 距離未入力: デフォルト4往復/日（従来値と整合）
    return { roundTripTime: 0, tripsPerDay: 4 };
  }

  const avgSpeed_kmh    = 40; // 市街地ダンプ平均速度 40km/h
  const loadTime_min    = 15; // バックホー積込時間
  const unloadTime_min  = 10; // 処分場での荷下ろし時間
  const waitTime_min    =  5; // 信号待ち・入場待ち等
  const workingTime_min = 360; // 実稼働 6時間/日（8時間 - 休憩・点検等）

  const travelTime_min = (disposalDistance * 2 / avgSpeed_kmh) * 60;
  const cycleTime_min  = travelTime_min + loadTime_min + unloadTime_min + waitTime_min;
  const tripsPerDay    = Math.max(1, Math.floor(workingTime_min / cycleTime_min));

  return {
    roundTripTime: Math.round((cycleTime_min / 60) * 100) / 100,
    tripsPerDay,
  };
}

/**
 * V2用デフォルト入力値を返す
 * （EstimateBlockV2 の追加フィールドに適切な初期値を設定）
 */
export function getDefaultV2Params(): Omit<EstimateBlockV2, keyof EstimateBlock> {
  return {
    soilType:            '普通土',
    siteCondition:       '一般地',
    seasonFactor:        '通常期（春・秋）',
    disposalDistance:    0,
    contingencyRate:     10,  // AACE Class 3 標準
    overheadRate:        15,  // 国交省積算基準 標準
    qualityControlRate:  2,   // FIDIC 標準
    safetyRate:          3,   // 労働安全衛生法準拠
  };
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  メイン計算関数 V2                                           ║
// ╚══════════════════════════════════════════════════════════════╝

export function calculateV2(block: EstimateBlockV2): CalculationResultV2 {

  // ── 基本入力値取得 ──────────────────────────────────────────
  const distance              = block.distance              || 0;
  const currentHeight         = block.currentHeight         || 0;
  const plannedHeight         = block.plannedHeight         || 0;
  const laborCost             = block.laborCost             || 27500;
  const stages                = block.stages                || 1;
  const crushedStoneThickness = block.crushedStoneThickness || 0;
  const baseThickness         = block.baseThickness         || 0;
  const formworkCost          = block.formworkCost          || 0;
  const productWidth          = block.productWidth          || 0;
  const productHeight         = block.productHeight         || 0;
  const installLaborCost      = block.installLaborCost      || 27500;
  const sandCost              = block.sandCost              || 0;
  const shippingCost          = block.shippingCost          || 0;

  // ── マスタ参照 ──────────────────────────────────────────────
  const selectedMachine       = backhoes.find(m => m.name === block.machine);
  const machineUnitPrice      = selectedMachine?.price    || 0;
  const machineCapacity       = selectedMachine?.capacity || 0;

  const selectedDump          = dumpTrucks.find(d => d.name === block.dumpTruck);
  const dumpVehicleUnitPrice  = selectedDump?.price    || 0;
  const dumpCapacity          = selectedDump?.capacity || 0;

  const selectedStone         = crushedStones.find(s => s.name === block.crushedStone);
  const stoneUnitPrice        = selectedStone?.price || 0;

  const selectedConcrete      = concretes.find(c => c.name === block.concrete);
  const concreteUnitPrice     = selectedConcrete?.price || 0;

  const selectedProduct       = secondaryProducts.find(p => p.name === block.secondaryProduct);
  const productUnitPrice      = selectedProduct?.price || 0;

  const selectedLength        = productLengths.find(l => l.name === block.productLength);
  const productLengthValue    = selectedLength?.value || 0;

  const selectedFactor        = workabilityFactors.find(f => f.name === block.workabilityFactor);
  const workabilityFactorValue= selectedFactor?.value || 0;

  // ── V2拡張マスタ参照 ────────────────────────────────────────
  const selectedSoil   = soilTypesMaster.find(s => s.name === block.soilType)
                       ?? soilTypesMaster[0]; // デフォルト: 普通土
  const soilL          = selectedSoil.L;
  const soilC          = selectedSoil.C;
  const soilProdFactor = selectedSoil.productivityFactor;

  const selectedSite            = siteConditionsMaster.find(s => s.name === block.siteCondition)
                                ?? siteConditionsMaster[0];
  const siteConditionLaborFactor   = selectedSite.laborFactor;
  const siteConditionMachineFactor = selectedSite.machineFactor;

  const selectedSeason        = seasonFactorsMaster.find(s => s.name === block.seasonFactor)
                              ?? seasonFactorsMaster[0];
  const effectiveWorkingFactor = selectedSeason.factor;

  const disposalDistance   = block.disposalDistance    || 0;
  const contingencyRate    = (block.contingencyRate    ?? 10) / 100;
  const overheadRate       = (block.overheadRate       ?? 15) / 100;
  const qualityControlRate = (block.qualityControlRate ??  2) / 100;
  const safetyRate         = (block.safetyRate         ??  3) / 100;

  // ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
  // 4時間掘削量（施工条件・土質・季節を複合補正）
  //
  //  補正後 = 基準値 ÷ (機械条件係数 × 土質生産性) × 季節係数
  //   例) 市街地(×1.2) × 粘性土(×1.1) → 実質32%生産性低下
  // ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
  const baseFourHourExcavation = machineCapacity > 0
    ? getFourHourExcavationCoefficient(machineCapacity) * machineCapacity
    : 0;

  const fourHourExcavation = baseFourHourExcavation > 0
    ? (baseFourHourExcavation / (siteConditionMachineFactor * soilProdFactor)) * effectiveWorkingFactor
    : 0;

  // ══════════════════════════════════════════════════════════
  // 1. 掘削計算
  // ══════════════════════════════════════════════════════════

  const excavationWidth  = productWidth + 0.4;
  const excavationHeight = currentHeight - plannedHeight + productHeight
                         + crushedStoneThickness + baseThickness;

  // V2改善: 固定 1.25 → 土質 L値（ほぐし係数）
  const excavationVolumeNative = excavationWidth * excavationHeight * distance;
  const excavationVolume       = excavationVolumeNative * soilL;

  const excavationDays = fourHourExcavation > 0
    ? Math.ceil(excavationVolume / fourHourExcavation)
    : 0;

  const excavationDailyWorkers = distance > 0
    ? Math.ceil(distance / 15) + 2
    : 0;
  const excavationWorkers = excavationDays * excavationDailyWorkers;

  // 機械費に施工条件補正を適用（市街地では重機稼働コスト増）
  const machineAmount = excavationDays * machineUnitPrice * 2 * siteConditionMachineFactor;

  // 労務費に施工条件補正を適用
  const excavationLaborAmount = excavationWorkers * laborCost * siteConditionLaborFactor;
  const excavationConstructionAmount = excavationLaborAmount + machineAmount;

  const excavationUnitPerM = distance > 0
    ? Math.round(excavationConstructionAmount / distance)
    : 0;

  // ══════════════════════════════════════════════════════════
  // 2. 埋め戻し計算
  // ══════════════════════════════════════════════════════════

  // V2改善: 埋戻体積も土質 L値（運搬のほぐし量）で算出
  const backfillVolume = distance * productWidth * productHeight * soilL;

  const backfillDays = fourHourExcavation > 0
    ? Math.ceil(backfillVolume / fourHourExcavation)
    : 0;

  const backfillWorkers  = distance > 0 ? 1 + Math.floor(backfillVolume / 2) : 0;
  const backfillLaborCost = distance > 0
    ? backfillWorkers * laborCost * siteConditionLaborFactor
    : 0;

  // ══════════════════════════════════════════════════════════
  // 3. 残土搬出計算（V2: 処分場距離 サイクルタイム計算）
  // ══════════════════════════════════════════════════════════

  const soilRemovalVolume = excavationVolume - backfillVolume;

  const soilRemovalDays = fourHourExcavation > 0
    ? Math.ceil(soilRemovalVolume / fourHourExcavation)
    : 0;

  // V2改善: AASHTO準拠のサイクルタイム計算
  const { roundTripTime: dumpRoundTripTime, tripsPerDay: dumpTripsPerDay } =
    calculateDumpCycleTime(disposalDistance, dumpCapacity);

  // 総搬出必要台数（回転数ベース）
  const dumpCount = dumpCapacity > 0
    ? Math.ceil(soilRemovalVolume / dumpCapacity)
    : 0;

  // 距離考慮後: 1日に必要な稼働台数
  // = 総台数 ÷ (1日往復数 × 日数)
  const adjustedDumpCount = dumpCapacity > 0 && dumpTripsPerDay > 0 && soilRemovalDays > 0
    ? Math.ceil(dumpCount / (dumpTripsPerDay * soilRemovalDays))
    : dumpCount;

  const regularDumpCount    = fourHourExcavation > 0
    ? Math.ceil(dumpCount / (fourHourExcavation / 2))
    : 0;
  const regularDumpUnitPrice = machineUnitPrice * 2;

  // V2改善: adjustedDumpCount（距離考慮）を使用
  const adjustedSoilRemovalAmount =
      soilRemovalDays * adjustedDumpCount * dumpVehicleUnitPrice
    + regularDumpCount * regularDumpUnitPrice
    + soilRemovalDays * laborCost * siteConditionLaborFactor;

  const soilRemovalAmount  = adjustedSoilRemovalAmount;
  const soilRemovalUnitPerM = distance > 0
    ? Math.round(soilRemovalAmount / distance)
    : 0;

  // ══════════════════════════════════════════════════════════
  // 4. 砕石計算
  // ══════════════════════════════════════════════════════════

  const crushedStoneVolume = distance * crushedStoneThickness * excavationWidth * 1.2;

  const crushedStoneWorkers = distance > 0 && excavationWidth > 0
    ? Math.ceil((distance * excavationWidth) / 9)
    : 0;

  const crushedStoneDays = fourHourExcavation > 0
    ? Math.ceil(crushedStoneVolume / fourHourExcavation)
    : 0;

  const crushedStoneLaborCost = crushedStoneDays * crushedStoneWorkers * laborCost * siteConditionLaborFactor;
  // 砕石機械費: ×1（掘削の×2とは異なる）に施工条件補正を追加
  const crushedStoneMachineCost = crushedStoneDays * machineUnitPrice * siteConditionMachineFactor;
  const crushedStoneConstructionAmount = crushedStoneLaborCost + crushedStoneMachineCost;
  const crushedStoneMaterialCost       = crushedStoneVolume * stoneUnitPrice;
  const crushedStoneTotal              = crushedStoneConstructionAmount + crushedStoneMaterialCost;
  const crushedStoneUnitPerM = distance > 0
    ? Math.round(crushedStoneTotal / distance)
    : 0;

  // ══════════════════════════════════════════════════════════
  // 5. ベース計算
  // ══════════════════════════════════════════════════════════

  const baseWidth           = productWidth + 0.1;
  const baseConcreteVolume  = distance * baseWidth * baseThickness * 1.1;
  const pouringWorkers      = getPouringWorkers(baseConcreteVolume);
  const formworkArea        = distance * baseThickness * 2;
  const formworkMaterialCost= formworkArea * formworkCost;

  const baseTotalAmount = distance > 0
    ? baseConcreteVolume * concreteUnitPrice
      + pouringWorkers * laborCost * siteConditionLaborFactor
      + formworkMaterialCost
    : 0;

  const baseUnitPerM = distance > 0
    ? Math.round(baseTotalAmount / distance)
    : 0;

  // ══════════════════════════════════════════════════════════
  // 6. 二次製品計算
  // ══════════════════════════════════════════════════════════

  const mortar = baseWidth * distance * 0.02 * stages;
  const sand   = mortar * productLengthValue;
  const sandAmount   = sand * sandCost;
  const cement       = Math.ceil(mortar * 0.3 * 1.6 * 1000 / 25);
  const cementAmount = cement * 600;
  const water        = mortar * 0.1 * 1000;

  let productCount = 0;
  if (productLengthValue > 0) {
    const rawCount = (distance / productLengthValue) * stages;
    const decimal  = rawCount - Math.floor(rawCount);
    productCount   = decimal <= 0.49
      ? Math.floor(rawCount) + 2
      : Math.ceil(rawCount);
  }

  const materialTotalCost  = productCount * productUnitPrice + shippingCost;
  const installWorkers     = Math.ceil(productCount * 0.03 * workabilityFactorValue);
  const secondaryProductTotal =
      sandAmount
    + cementAmount
    + materialTotalCost
    + installWorkers * installLaborCost * siteConditionLaborFactor;

  const secondaryProductUnitPerM = distance > 0
    ? Math.ceil(secondaryProductTotal / distance)
    : 0;

  // ══════════════════════════════════════════════════════════
  // 7. 集計・間接費計算（V2新規）
  //
  //  費用構造（国交省積算体系 + AACE International）:
  //    直接工事費
  //    + 品質管理費 （直接工事費 × 2%）
  //    + 安全管理費 （直接工事費 × 3%）
  //    ──────────────────
  //    工事原価
  //    + 諸経費   （工事原価 × 15%）
  //    ──────────────────
  //    工事費計
  //    + 予備費   （工事費計 × 10%）
  //    ══════════════════
  //    総工事費
  // ══════════════════════════════════════════════════════════

  const directCostSubtotal =
      excavationConstructionAmount
    + soilRemovalAmount
    + backfillLaborCost
    + crushedStoneTotal
    + baseTotalAmount
    + secondaryProductTotal;

  const qualityControlCost = Math.ceil(directCostSubtotal * qualityControlRate);
  const safetyCost         = Math.ceil(directCostSubtotal * safetyRate);

  const constructionCost   = directCostSubtotal + qualityControlCost + safetyCost;
  const overheadCost       = Math.ceil(constructionCost * overheadRate);

  const beforeContingency  = constructionCost + overheadCost;
  const contingencyCost    = Math.ceil(beforeContingency * contingencyRate);

  const grandTotal    = beforeContingency + contingencyCost;
  const grandTotalPerM = distance > 0 ? Math.ceil(grandTotal / distance) : 0;

  // ── 原価比率分析（ISO 15686 / AACE 準拠）───────────────────
  const laborCostTotal =
      excavationLaborAmount
    + backfillLaborCost
    + crushedStoneLaborCost
    + pouringWorkers * laborCost * siteConditionLaborFactor
    + installWorkers * installLaborCost * siteConditionLaborFactor;

  const materialCostTotal =
      crushedStoneMaterialCost
    + baseConcreteVolume * concreteUnitPrice
    + materialTotalCost
    + sandAmount
    + cementAmount;

  const machineCostTotal =
      machineAmount
    + soilRemovalDays * adjustedDumpCount * dumpVehicleUnitPrice;

  const laborRatio    = directCostSubtotal > 0 ? Math.round(laborCostTotal    / directCostSubtotal * 100) : 0;
  const materialRatio = directCostSubtotal > 0 ? Math.round(materialCostTotal / directCostSubtotal * 100) : 0;
  const machineRatio  = directCostSubtotal > 0 ? Math.round(machineCostTotal  / directCostSubtotal * 100) : 0;

  // ── 戻り値 ──────────────────────────────────────────────────
  return {
    // ── V1互換フィールド（CalculationResult） ──────────────
    excavationWidth:               Math.round(excavationWidth * 100) / 100,
    excavationHeight:              Math.round(excavationHeight * 100) / 100,
    excavationVolume:              Math.round(excavationVolume * 100) / 100,
    fourHourExcavation:            Math.round(fourHourExcavation * 100) / 100,
    excavationDays,
    excavationDailyWorkers,
    excavationWorkers,
    machineUnitPrice,
    machineAmount,
    excavationConstructionAmount,
    excavationUnitPerM,

    soilRemovalVolume:             Math.round(soilRemovalVolume * 100) / 100,
    soilRemovalDays,
    dumpCapacity,
    dumpCount,
    dumpVehicleUnitPrice,
    regularDumpCount,
    regularDumpUnitPrice,
    soilRemovalAmount,
    soilRemovalUnitPerM,

    backfillVolume:                Math.round(backfillVolume * 100) / 100,
    backfillDays,
    backfillWorkers,
    backfillLaborCost,

    crushedStoneVolume:            Math.round(crushedStoneVolume * 100) / 100,
    crushedStoneWorkers,
    crushedStoneDays,
    crushedStoneLaborCost,
    crushedStoneMachineCost,
    crushedStoneConstructionAmount,
    crushedStoneMaterialCost:      Math.round(crushedStoneMaterialCost * 100) / 100,
    crushedStoneTotal:             Math.round(crushedStoneTotal * 100) / 100,
    crushedStoneUnitPerM,

    baseWidth:                     Math.round(baseWidth * 100) / 100,
    baseConcreteVolume:            Math.round(baseConcreteVolume * 100) / 100,
    concreteUnitPrice,
    pouringWorkers,
    formworkArea:                  Math.round(formworkArea * 100) / 100,
    formworkMaterialCost:          Math.round(formworkMaterialCost * 100) / 100,
    baseTotalAmount:               Math.ceil(baseTotalAmount),
    baseUnitPerM,

    mortar:                        Math.round(mortar * 100) / 100,
    sand:                          Math.round(sand * 100) / 100,
    sandAmount:                    Math.round(sandAmount * 100) / 100,
    cement,
    cementAmount,
    water:                         Math.round(water * 100) / 100,
    productUnitPrice,
    productCount,
    materialTotalCost,
    installWorkers,
    secondaryProductTotal:         Math.ceil(secondaryProductTotal),
    secondaryProductUnitPerM,

    // ── V2拡張フィールド ───────────────────────────────────
    soilLValue:                    soilL,
    soilCValue:                    soilC,
    soilProductivityFactor:        soilProdFactor,

    siteConditionLaborFactor,
    siteConditionMachineFactor,
    effectiveWorkingFactor,

    disposalDistance,
    dumpRoundTripTime:             Math.round(dumpRoundTripTime * 100) / 100,
    dumpTripsPerDay,
    adjustedDumpCount,
    adjustedSoilRemovalAmount:     Math.ceil(adjustedSoilRemovalAmount),

    qualityControlCost,
    safetyCost,
    directCostSubtotal:            Math.ceil(directCostSubtotal),
    overheadCost,
    contingencyCost,
    grandTotal:                    Math.ceil(grandTotal),
    grandTotalPerM,

    laborCostTotal:                Math.ceil(laborCostTotal),
    materialCostTotal:             Math.ceil(materialCostTotal),
    machineCostTotal:              Math.ceil(machineCostTotal),
    laborRatio,
    materialRatio,
    machineRatio,
    workType:                      'secondary_product',
    displayName:                   block.secondaryProduct || '二次製品工',
    primaryQuantity:               distance,
    primaryUnit:                   'm',
    totalAmount:                   Math.ceil(grandTotal),
    totalAmountPerPrimaryUnit:     grandTotalPerM,
    detailSections:                [],
    lineItems:                     [],
    priceEvidence:                 [],
    zoneBreakdowns:                [],
  };
}
