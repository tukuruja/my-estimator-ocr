import { findMasterByName } from './masterData';
import type {
  CalculationResult,
  Drawing,
  EstimateBlock,
  EstimateReportRow,
  GeneratedReportBundle,
  PriceMasterItem,
  Project,
  ReviewIssue,
  UnitPriceEvidenceRow,
} from './types';

interface ReportContext {
  project: Project;
  block: EstimateBlock;
  drawing: Drawing | null;
  result: CalculationResult;
  masters: PriceMasterItem[];
  effectiveDate?: string;
}

function createEstimateRow(input: Omit<EstimateReportRow, 'id'>): EstimateReportRow {
  return {
    id: crypto.randomUUID(),
    ...input,
  };
}

function createEvidenceRow(input: Omit<UnitPriceEvidenceRow, 'id'>): UnitPriceEvidenceRow {
  return {
    id: crypto.randomUUID(),
    ...input,
  };
}

function createReviewIssue(input: Omit<ReviewIssue, 'id'>): ReviewIssue {
  return {
    id: crypto.randomUUID(),
    ...input,
  };
}

function adoptMaster(
  masters: PriceMasterItem[],
  masterType: PriceMasterItem['masterType'],
  name: string,
  effectiveDate: string,
): PriceMasterItem | null {
  if (!name) return null;
  return findMasterByName(masters, masterType, name, effectiveDate);
}

function resolveSourceSummary(drawing: Drawing | null): string {
  if (!drawing) return '図面未連携';
  return `${drawing.fileName || drawing.name} / OCR確認済み`;
}

export function generateReportBundle({ project, block, drawing, result, masters, effectiveDate }: ReportContext): GeneratedReportBundle {
  const reportDate = effectiveDate ?? new Date().toISOString().slice(0, 10);
  const sourceSummary = resolveSourceSummary(drawing);

  const rows: EstimateReportRow[] = [
    createEstimateRow({
      section: '土工',
      itemName: '掘削工事',
      specification: `${block.machine || '機械未選択'} / 幅${result.excavationWidth}m`,
      quantity: result.excavationVolume,
      unit: 'm3',
      unitPrice: result.excavationVolume > 0 ? Math.round(result.excavationConstructionAmount / result.excavationVolume) : result.excavationConstructionAmount,
      amount: result.excavationConstructionAmount,
      remarks: '掘削・積込・機械費を含む',
      sourceSummary,
    }),
    createEstimateRow({
      section: '土工',
      itemName: '残土搬出',
      specification: `${block.dumpTruck || 'ダンプ未選択'}`,
      quantity: result.soilRemovalVolume,
      unit: 'm3',
      unitPrice: result.soilRemovalVolume > 0 ? Math.round(result.soilRemovalAmount / result.soilRemovalVolume) : result.soilRemovalAmount,
      amount: result.soilRemovalAmount,
      remarks: 'ダンプ・積込・運搬を含む',
      sourceSummary,
    }),
    createEstimateRow({
      section: '土工',
      itemName: '埋戻し',
      specification: `${block.secondaryProduct || '製品未選択'} 周囲`,
      quantity: result.backfillVolume,
      unit: 'm3',
      unitPrice: result.backfillVolume > 0 ? Math.round(result.backfillLaborCost / result.backfillVolume) : result.backfillLaborCost,
      amount: result.backfillLaborCost,
      remarks: '埋戻し人件費',
      sourceSummary,
    }),
    createEstimateRow({
      section: '基礎工',
      itemName: '砕石工',
      specification: `${block.crushedStone || '砕石未選択'} / t=${block.crushedStoneThickness}m`,
      quantity: result.crushedStoneVolume,
      unit: 'm3',
      unitPrice: result.crushedStoneVolume > 0 ? Math.round(result.crushedStoneTotal / result.crushedStoneVolume) : result.crushedStoneTotal,
      amount: result.crushedStoneTotal,
      remarks: '砕石材料・施工費を含む',
      sourceSummary,
    }),
    createEstimateRow({
      section: '基礎工',
      itemName: 'ベースコンクリート工',
      specification: `${block.concrete || '生コン未選択'} / t=${block.baseThickness}m`,
      quantity: result.baseConcreteVolume,
      unit: 'm3',
      unitPrice: result.baseConcreteVolume > 0 ? Math.round(result.baseTotalAmount / result.baseConcreteVolume) : result.baseTotalAmount,
      amount: result.baseTotalAmount,
      remarks: '生コン・打設・型枠を含む',
      sourceSummary,
    }),
    createEstimateRow({
      section: '据付工',
      itemName: '二次製品据付',
      specification: `${block.secondaryProduct || '製品未選択'} / ${block.productWidth}x${block.productHeight}x${block.productLength}`,
      quantity: result.productCount,
      unit: '本',
      unitPrice: result.productCount > 0 ? Math.round(result.secondaryProductTotal / result.productCount) : result.secondaryProductTotal,
      amount: result.secondaryProductTotal,
      remarks: '材料費・据付費・送料を含む',
      sourceSummary,
    }),
  ];

  const machineMaster = adoptMaster(masters, 'machine', block.machine, reportDate);
  const dumpMaster = adoptMaster(masters, 'dump_truck', block.dumpTruck, reportDate);
  const stoneMaster = adoptMaster(masters, 'crushed_stone', block.crushedStone, reportDate);
  const concreteMaster = adoptMaster(masters, 'concrete', block.concrete, reportDate);
  const productMaster = adoptMaster(masters, 'secondary_product', block.secondaryProduct, reportDate);
  const laborMaster = adoptMaster(masters, 'labor', '標準労務単価', reportDate);
  const cementMaster = adoptMaster(masters, 'misc', 'セメント単価', reportDate);

  const evidenceRows: UnitPriceEvidenceRow[] = [
    createEvidenceRow({
      estimateRowId: rows[0].id,
      estimateItemName: rows[0].itemName,
      masterType: machineMaster ? machineMaster.masterType : 'input',
      masterName: machineMaster?.name ?? (block.machine || '未選択'),
      adoptedUnitPrice: machineMaster?.unitPrice ?? 0,
      unit: machineMaster?.unit ?? '日',
      sourceName: machineMaster?.sourceName ?? '画面入力',
      sourceVersion: machineMaster?.sourceVersion ?? 'manual',
      effectiveFrom: machineMaster?.effectiveFrom ?? reportDate,
      effectiveTo: machineMaster?.effectiveTo ?? null,
      sourcePage: machineMaster?.sourcePage ?? null,
      reason: '掘削機械費の根拠',
      requiresReview: !machineMaster,
    }),
    createEvidenceRow({
      estimateRowId: rows[0].id,
      estimateItemName: rows[0].itemName,
      masterType: laborMaster ? laborMaster.masterType : 'input',
      masterName: laborMaster?.name ?? '労務単価（入力値）',
      adoptedUnitPrice: block.laborCost,
      unit: laborMaster?.unit ?? '人日',
      sourceName: laborMaster?.sourceName ?? '画面入力',
      sourceVersion: laborMaster?.sourceVersion ?? 'manual',
      effectiveFrom: laborMaster?.effectiveFrom ?? reportDate,
      effectiveTo: laborMaster?.effectiveTo ?? null,
      sourcePage: laborMaster?.sourcePage ?? null,
      reason: '掘削労務費の根拠',
      requiresReview: block.laborCost <= 0,
    }),
    createEvidenceRow({
      estimateRowId: rows[1].id,
      estimateItemName: rows[1].itemName,
      masterType: dumpMaster ? dumpMaster.masterType : 'input',
      masterName: dumpMaster?.name ?? (block.dumpTruck || '未選択'),
      adoptedUnitPrice: dumpMaster?.unitPrice ?? 0,
      unit: dumpMaster?.unit ?? '台日',
      sourceName: dumpMaster?.sourceName ?? '画面入力',
      sourceVersion: dumpMaster?.sourceVersion ?? 'manual',
      effectiveFrom: dumpMaster?.effectiveFrom ?? reportDate,
      effectiveTo: dumpMaster?.effectiveTo ?? null,
      sourcePage: dumpMaster?.sourcePage ?? null,
      reason: '残土搬出ダンプ単価の根拠',
      requiresReview: !dumpMaster,
    }),
    createEvidenceRow({
      estimateRowId: rows[3].id,
      estimateItemName: rows[3].itemName,
      masterType: stoneMaster ? stoneMaster.masterType : 'input',
      masterName: stoneMaster?.name ?? (block.crushedStone || '未選択'),
      adoptedUnitPrice: stoneMaster?.unitPrice ?? 0,
      unit: stoneMaster?.unit ?? 'm3',
      sourceName: stoneMaster?.sourceName ?? '画面入力',
      sourceVersion: stoneMaster?.sourceVersion ?? 'manual',
      effectiveFrom: stoneMaster?.effectiveFrom ?? reportDate,
      effectiveTo: stoneMaster?.effectiveTo ?? null,
      sourcePage: stoneMaster?.sourcePage ?? null,
      reason: '砕石材料単価の根拠',
      requiresReview: !stoneMaster,
    }),
    createEvidenceRow({
      estimateRowId: rows[4].id,
      estimateItemName: rows[4].itemName,
      masterType: concreteMaster ? concreteMaster.masterType : 'input',
      masterName: concreteMaster?.name ?? (block.concrete || '未選択'),
      adoptedUnitPrice: concreteMaster?.unitPrice ?? 0,
      unit: concreteMaster?.unit ?? 'm3',
      sourceName: concreteMaster?.sourceName ?? '画面入力',
      sourceVersion: concreteMaster?.sourceVersion ?? 'manual',
      effectiveFrom: concreteMaster?.effectiveFrom ?? reportDate,
      effectiveTo: concreteMaster?.effectiveTo ?? null,
      sourcePage: concreteMaster?.sourcePage ?? null,
      reason: 'ベースコンクリート単価の根拠',
      requiresReview: !concreteMaster,
    }),
    createEvidenceRow({
      estimateRowId: rows[5].id,
      estimateItemName: rows[5].itemName,
      masterType: productMaster ? productMaster.masterType : 'input',
      masterName: productMaster?.name ?? (block.secondaryProduct || '未選択'),
      adoptedUnitPrice: productMaster?.unitPrice ?? 0,
      unit: productMaster?.unit ?? '本',
      sourceName: productMaster?.sourceName ?? '画面入力',
      sourceVersion: productMaster?.sourceVersion ?? 'manual',
      effectiveFrom: productMaster?.effectiveFrom ?? reportDate,
      effectiveTo: productMaster?.effectiveTo ?? null,
      sourcePage: productMaster?.sourcePage ?? null,
      reason: '二次製品材料単価の根拠',
      requiresReview: !productMaster,
    }),
    createEvidenceRow({
      estimateRowId: rows[5].id,
      estimateItemName: rows[5].itemName,
      masterType: cementMaster ? cementMaster.masterType : 'input',
      masterName: cementMaster?.name ?? 'セメント単価',
      adoptedUnitPrice: cementMaster?.unitPrice ?? 600,
      unit: cementMaster?.unit ?? '袋',
      sourceName: cementMaster?.sourceName ?? '初期設定',
      sourceVersion: cementMaster?.sourceVersion ?? 'default',
      effectiveFrom: cementMaster?.effectiveFrom ?? reportDate,
      effectiveTo: cementMaster?.effectiveTo ?? null,
      sourcePage: cementMaster?.sourcePage ?? null,
      reason: 'モルタル用セメント単価の根拠',
      requiresReview: false,
    }),
    createEvidenceRow({
      estimateRowId: rows[5].id,
      estimateItemName: rows[5].itemName,
      masterType: 'input',
      masterName: '砂単価（画面入力）',
      adoptedUnitPrice: block.sandCost,
      unit: 'm3',
      sourceName: '画面入力',
      sourceVersion: 'manual',
      effectiveFrom: reportDate,
      effectiveTo: null,
      sourcePage: null,
      reason: '砂単価は現場条件依存のため入力値を採用',
      requiresReview: block.sandCost <= 0,
    }),
    createEvidenceRow({
      estimateRowId: rows[5].id,
      estimateItemName: rows[5].itemName,
      masterType: 'input',
      masterName: '送料（画面入力）',
      adoptedUnitPrice: block.shippingCost,
      unit: '式',
      sourceName: '画面入力',
      sourceVersion: 'manual',
      effectiveFrom: reportDate,
      effectiveTo: null,
      sourcePage: null,
      reason: '運搬費は案件条件依存のため入力値を採用',
      requiresReview: block.shippingCost <= 0,
    }),
  ];

  const reviewIssues: ReviewIssue[] = [];
  if (!drawing) {
    reviewIssues.push(createReviewIssue({ severity: 'critical', title: '図面未連携', detail: '図面が紐づいていないため根拠追跡ができません。' }));
  }
  if (!block.secondaryProduct) {
    reviewIssues.push(createReviewIssue({ severity: 'critical', title: '製品名未設定', detail: '二次製品名が未設定です。' }));
  }
  if (!block.productLength) {
    reviewIssues.push(createReviewIssue({ severity: 'critical', title: '製品長さ未設定', detail: 'productLength 必須のため確定できません。', fieldName: 'productLength' }));
  }
  if (block.productWidth <= 0 || block.productHeight <= 0) {
    reviewIssues.push(createReviewIssue({ severity: 'warning', title: '製品寸法要確認', detail: '製品幅または製品高が未設定です。', fieldName: 'productWidth' }));
  }
  if (!block.currentHeight && !block.plannedHeight) {
    reviewIssues.push(createReviewIssue({ severity: 'critical', title: '現況高・計画高未設定', detail: '現況高と計画高が両方空のため確定不可です。', fieldName: 'currentHeight' }));
  }
  for (const fieldName of block.requiresReviewFields) {
    reviewIssues.push(createReviewIssue({
      severity: 'warning',
      title: 'AI候補が要確認',
      detail: `${fieldName} は根拠不足または競合候補ありのため要確認です。`,
      fieldName,
    }));
  }
  for (const evidence of evidenceRows.filter((item) => item.requiresReview)) {
    reviewIssues.push(createReviewIssue({
      severity: 'warning',
      title: '単価根拠要確認',
      detail: `${evidence.estimateItemName} の根拠単価「${evidence.masterName}」を確認してください。`,
    }));
  }
  if (drawing?.workTypeCandidates?.[0]?.blockType && drawing.workTypeCandidates[0].blockType !== block.blockType) {
    reviewIssues.push(createReviewIssue({
      severity: 'critical',
      title: '工種判定不一致',
      detail: `図面の工種候補は ${drawing.workTypeCandidates[0].label} ですが、見積ブロックは ${block.blockType} です。`,
      sourcePage: drawing.aiCandidates[0]?.sourcePage,
    }));
  }

  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);

  return {
    estimateRows: rows,
    unitPriceEvidenceRows: evidenceRows,
    reviewIssues,
    summary: {
      totalAmount,
      totalRows: rows.length,
      requiresReviewCount: reviewIssues.length,
    },
  };
}
