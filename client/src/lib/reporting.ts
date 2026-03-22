import type {
  CalculationResult,
  Drawing,
  EstimateBlock,
  EstimateReportRow,
  GeneratedReportBundle,
  Project,
  ReviewIssue,
  UnitPriceEvidenceRow,
} from './types';

interface ReportContext {
  project: Project;
  block: EstimateBlock;
  drawing: Drawing | null;
  result: CalculationResult;
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

function resolveSourceSummary(drawing: Drawing | null): string {
  if (!drawing) return '図面未連携';
  return `${drawing.fileName || drawing.name} / OCR確認済み`;
}

function buildZoneCoverageIssues(block: EstimateBlock, result: CalculationResult): ReviewIssue[] {
  const zones = Array.isArray(block.zones) ? block.zones.filter((zone) => zone.name.trim()) : [];
  if (zones.length === 0) return [];

  const totalZoneQuantity = zones.reduce((sum, zone) => sum + Math.max(0, Number(zone.primaryQuantity || 0)), 0);
  if (result.primaryQuantity <= 0 || totalZoneQuantity <= 0) {
    return [
      createReviewIssue({
        severity: 'warning',
        title: '区画別数量未設定',
        detail: '区画名はありますが、区画別主数量が未入力です。変更見積に使う数量を入れてください。',
        fieldName: 'zones',
      }),
    ];
  }

  const ratio = totalZoneQuantity / result.primaryQuantity;
  if (Math.abs(1 - ratio) <= 0.05) return [];

  return [
    createReviewIssue({
      severity: 'warning',
      title: '区画別数量と総数量が不一致',
      detail: `区画数量合計 ${totalZoneQuantity.toFixed(2)}${result.primaryUnit} が、総数量 ${result.primaryQuantity.toFixed(2)}${result.primaryUnit} と一致していません。`,
      fieldName: 'zones',
    }),
  ];
}

function buildRequiredFieldIssues(block: EstimateBlock): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  switch (block.blockType) {
    case 'secondary_product':
      if (!block.secondaryProduct) {
        issues.push(createReviewIssue({ severity: 'critical', title: '製品名未設定', detail: '二次製品名が未設定です。', fieldName: 'secondaryProduct' }));
      }
      if (!block.productLength) {
        issues.push(createReviewIssue({ severity: 'critical', title: '製品長さ未設定', detail: '製品長さが未設定のため本数算定ができません。', fieldName: 'productLength' }));
      }
      if (block.productWidth <= 0 || block.productHeight <= 0) {
        issues.push(createReviewIssue({ severity: 'warning', title: '製品寸法要確認', detail: '製品幅または製品高さが未設定です。', fieldName: 'productWidth' }));
      }
      if (!block.currentHeight && !block.plannedHeight) {
        issues.push(createReviewIssue({ severity: 'critical', title: '現況高・計画高未設定', detail: '現況高と計画高が両方空のため確定不可です。', fieldName: 'currentHeight' }));
      }
      break;
    case 'retaining_wall':
      if (!block.secondaryProduct) {
        issues.push(createReviewIssue({ severity: 'critical', title: '擁壁種別未設定', detail: '擁壁種別が未設定です。', fieldName: 'secondaryProduct' }));
      }
      if (block.distance <= 0 || block.productHeight <= 0 || block.productWidth <= 0) {
        issues.push(createReviewIssue({ severity: 'critical', title: '擁壁寸法未設定', detail: '延長・擁壁高・底版幅のいずれかが未設定です。', fieldName: 'distance' }));
      }
      break;
    case 'pavement':
      if (!block.secondaryProduct) {
        issues.push(createReviewIssue({ severity: 'warning', title: '舗装種別未設定', detail: '舗装種別が未設定のため摘要が曖昧です。', fieldName: 'secondaryProduct' }));
      }
      if (block.distance <= 0 || (block.pavementWidth || block.productWidth) <= 0) {
        issues.push(createReviewIssue({ severity: 'critical', title: '舗装範囲未設定', detail: '施工延長または舗装幅が未設定です。', fieldName: 'pavementWidth' }));
      }
      if (block.surfaceThickness <= 0 && block.binderThickness <= 0) {
        issues.push(createReviewIssue({ severity: 'critical', title: '舗装厚未設定', detail: '表層厚または基層厚が必要です。', fieldName: 'surfaceThickness' }));
      }
      break;
    case 'demolition':
      if (!block.secondaryProduct) {
        issues.push(createReviewIssue({ severity: 'critical', title: '撤去対象未設定', detail: '撤去対象が未設定です。', fieldName: 'secondaryProduct' }));
      }
      if (block.distance <= 0 || (block.demolitionWidth || block.pavementWidth || block.productWidth) <= 0 || (block.demolitionThickness || block.surfaceThickness) <= 0) {
        issues.push(createReviewIssue({ severity: 'critical', title: '撤去数量未設定', detail: '延長・幅・厚のいずれかが不足しています。', fieldName: 'demolitionWidth' }));
      }
      break;
    default:
      break;
  }

  return issues;
}

export function generateReportBundle({ project, block, drawing, result }: ReportContext): GeneratedReportBundle {
  const sourceSummary = resolveSourceSummary(drawing);

  const estimateRows = result.lineItems.map((lineItem) => createEstimateRow({
    section: lineItem.section,
    itemName: lineItem.itemName,
    specification: lineItem.specification,
    quantity: lineItem.quantity,
    unit: lineItem.unit,
    unitPrice: lineItem.unitPrice,
    amount: lineItem.amount,
    remarks: lineItem.remarks,
    sourceSummary,
  }));

  const zoneRows = result.zoneBreakdowns.map((zone) => createEstimateRow({
    section: '区画別配賦',
    itemName: zone.name,
    specification: `${result.displayName} / ${zone.primaryQuantity}${zone.primaryUnit} / 配賦${zone.quantityShare}%`,
    quantity: zone.primaryQuantity,
    unit: zone.primaryUnit,
    unitPrice: zone.primaryQuantity > 0 ? Math.round(zone.totalAmount / zone.primaryQuantity) : zone.totalAmount,
    amount: zone.totalAmount,
    remarks: `参考配賦。再段取り${zone.remobilizationCount}回 / 仮復旧${zone.temporaryRestorationRate}% / 他工種調整${zone.coordinationAdjustmentRate}%${zone.note ? ` / ${zone.note}` : ''}`,
    sourceSummary,
  }));

  const allEstimateRows = [...estimateRows, ...zoneRows];
  const estimateRowByKey = new Map(result.lineItems.map((lineItem, index) => [lineItem.key, estimateRows[index]]));

  const evidenceRows = result.priceEvidence.map((evidence) => {
    const estimateRow = estimateRowByKey.get(evidence.lineItemKey);
    return createEvidenceRow({
      estimateRowId: estimateRow?.id ?? crypto.randomUUID(),
      estimateItemName: evidence.estimateItemName,
      masterType: evidence.masterType,
      masterName: evidence.masterName,
      adoptedUnitPrice: evidence.adoptedUnitPrice,
      unit: evidence.unit,
      sourceName: evidence.sourceName,
      sourceVersion: evidence.sourceVersion,
      effectiveFrom: evidence.effectiveFrom,
      effectiveTo: evidence.effectiveTo,
      sourcePage: evidence.sourcePage,
      reason: evidence.reason,
      requiresReview: evidence.requiresReview,
    });
  });

  const reviewIssues: ReviewIssue[] = [];

  if (!drawing) {
    reviewIssues.push(createReviewIssue({ severity: 'critical', title: '図面未連携', detail: '図面が紐づいていないため根拠追跡ができません。' }));
  }

  reviewIssues.push(...buildRequiredFieldIssues(block));
  reviewIssues.push(...buildZoneCoverageIssues(block, result));

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

  return {
    estimateRows: allEstimateRows,
    unitPriceEvidenceRows: evidenceRows,
    reviewIssues,
    summary: {
      totalAmount: Math.round(result.totalAmount),
      totalRows: allEstimateRows.length,
      requiresReviewCount: reviewIssues.length,
    },
  };
}
