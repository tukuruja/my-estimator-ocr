// 見積ブロック（1つの見積項目）
export interface EstimateBlock {
  id: string;
  name: string;
  // 二次製品入力
  secondaryProduct: string;
  distance: number;
  currentHeight: number;
  plannedHeight: number;
  laborCost: number;
  stages: number;
  // 土工事関連
  machine: string;
  dumpTruck: string;
  // 砕石関連
  crushedStone: string;
  crushedStoneThickness: number;
  // ベース関連
  concrete: string;
  pumpTruck: string;
  baseThickness: number;
  formworkCost: number;
  // 二次製品関連
  productWidth: number;
  productHeight: number;
  productLength: string;
  installLaborCost: number;
  workabilityFactor: string;
  sandCost: number;
  shippingCost: number;
}

// 単価表アイテム
export interface PriceItem {
  id: string;
  name: string;
  price: number;
}

// 機械単価表
export interface MachinePrice {
  id: string;
  name: string;
  price: number;
}

// 計算結果
export interface CalculationResult {
  // 掘削
  excavationWidth: number;
  excavationHeight: number;
  excavationVolume: number;
  fourHourExcavation: number;
  excavationDays: number;
  excavationDailyWorkers: number;
  excavationWorkers: number;
  machineUnitPrice: number;
  machineAmount: number;
  excavationConstructionAmount: number;
  excavationUnitPerM: number;
  // 残土搬出
  soilRemovalVolume: number;
  soilRemovalDays: number;
  dumpCapacity: number;
  dumpCount: number;
  dumpVehicleUnitPrice: number;
  regularDumpCount: number;
  regularDumpUnitPrice: number;
  soilRemovalAmount: number;
  soilRemovalUnitPerM: number;
  // 埋め戻し
  backfillVolume: number;
  backfillDays: number;
  backfillWorkers: number;
  backfillLaborCost: number;
  // 砕石関連
  crushedStoneVolume: number;
  crushedStoneWorkers: number;
  crushedStoneDays: number;
  crushedStoneLaborCost: number;
  crushedStoneMachineCost: number;
  crushedStoneConstructionAmount: number;
  crushedStoneMaterialCost: number;
  crushedStoneTotal: number;
  crushedStoneUnitPerM: number;
  // ベース関連
  baseWidth: number;
  baseConcreteVolume: number;
  concreteUnitPrice: number;
  pouringWorkers: number;
  formworkArea: number;
  formworkMaterialCost: number;
  baseTotalAmount: number;
  baseUnitPerM: number;
  // 二次製品関連
  mortar: number;
  sand: number;
  sandAmount: number;
  cement: number;
  cementAmount: number;
  water: number;
  productUnitPrice: number;
  productCount: number;
  materialTotalCost: number;
  installWorkers: number;
  secondaryProductTotal: number;
  secondaryProductUnitPerM: number;
}

// アプリ全体の状態
export interface AppState {
  blocks: EstimateBlock[];
  activeBlockIndex: number;
  autoSave: boolean;
}

// デフォルトの見積ブロック
export function createDefaultBlock(name: string = '新規見積'): EstimateBlock {
  return {
    id: crypto.randomUUID(),
    name,
    secondaryProduct: '',
    distance: 0,
    currentHeight: 0,
    plannedHeight: 0,
    laborCost: 27500,
    stages: 1,
    machine: '',
    dumpTruck: '',
    crushedStone: '',
    crushedStoneThickness: 0,
    concrete: '',
    pumpTruck: '',
    baseThickness: 0,
    formworkCost: 0,
    productWidth: 0,
    productHeight: 0,
    productLength: '',
    installLaborCost: 27500,
    workabilityFactor: '',
    sandCost: 0,
    shippingCost: 0,
  };
}
