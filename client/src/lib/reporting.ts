import {
  CalculationResult,
  ChangeEstimateRow,
  Drawing,
  EstimateBlock,
  EstimateOutputMode,
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
  /** 見積出力モード（3択） */
  outputMode?: EstimateOutputMode;
}

/** モード別の確信度閾値 */
const MODE_CONFIDENCE_THRESHOLD: Record<EstimateOutputMode, number> = {
  confirmed: 0.8,
  pending: 0.5,
  full: 0.0,
};

/** 確信度に基づくフラグ判定 */
function classifyByConfidence(confidence: number): { isPending: boolean; requiresReview: boolean } {
  return {
    isPending: confidence >= 0.5 && confidence < 0.8,
    requiresReview: confidence < 0.5,
  };
}

function createEstimateRow(input: Omit<EstimateReportRow, 'id'>): EstimateReportRow {
  return {
    id: crypto.randomUUID(),
    ...input,
  };
}

function createChangeEstimateRow(input: Omit<ChangeEstimateRow, 'id'>): ChangeEstimateRow {
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

function formatPageRefs(pageRefs: number[]): string {
  if (pageRefs.length === 0) return '未設定';
  return pageRefs.map((pageNo) => `p.${pageNo}`).join(', ');
}

function formatTradeNames(tradeNames: string[]): string {
  return tradeNames.length > 0 ? tradeNames.join(', ') : '未設定';
}

function formatPhotoSummary(photoUrls: string[]): string {
  if (photoUrls.length === 0) return '未登録';
  return `${photoUrls.length}枚`;
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

function buildZoneMetadataIssues(block: EstimateBlock): ReviewIssue[] {
  const zones = Array.isArray(block.zones) ? block.zones.filter((zone) => zone.name.trim()) : [];
  const issues: ReviewIssue[] = [];

  for (const zone of zones) {
    if (zone.primaryQuantity > 0 && zone.drawingPageRefs.length === 0) {
      issues.push(createReviewIssue({
        severity: 'warning',
        title: `区画「${zone.name}」の図面根拠未設定`,
        detail: '変更見積に使う図面ページが未設定です。区画ごとの根拠ページを入れてください。',
        fieldName: 'zones',
      }));
    }

    if (zone.coordinationAdjustmentRate > 0 && zone.relatedTradeNames.length === 0) {
      issues.push(createReviewIssue({
        severity: 'warning',
        title: `区画「${zone.name}」の干渉工種未設定`,
        detail: '他工種調整率を計上していますが、対象工種名が未設定です。設備・植栽・建築外構などの相手工種を入れてください。',
        fieldName: 'zones',
      }));
    }

    if ((zone.temporaryRestorationRate > 0 || zone.note.trim()) && zone.notePhotoUrls.length === 0) {
      issues.push(createReviewIssue({
        severity: 'info',
        title: `区画「${zone.name}」の備考写真未設定`,
        detail: '仮復旧や施工干渉の説明はありますが、備考写真が未設定です。変更見積の根拠写真があれば紐づけてください。',
        fieldName: 'zones',
      }));
    }
  }

  return issues;
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
    case 'count_structure':
      if (!block.secondaryProduct) {
        issues.push(createReviewIssue({ severity: 'critical', title: '数量対象名未設定', detail: '街渠桝・接続桝などの名称が未設定です。', fieldName: 'secondaryProduct' }));
      }
      if (block.countQuantity <= 0) {
        issues.push(createReviewIssue({ severity: 'critical', title: 'count 数量未設定', detail: '箇所・基・本などの主数量が未設定です。', fieldName: 'countQuantity' }));
      }
      if (!block.countUnit.trim()) {
        issues.push(createReviewIssue({ severity: 'warning', title: 'count 単位未設定', detail: '箇所・基・本などの数量単位が空です。', fieldName: 'countUnit' }));
      }
      break;
    case 'material_takeoff':
      if (!block.secondaryProduct) {
        issues.push(createReviewIssue({ severity: 'critical', title: '材料名未設定', detail: '材料層または地盤改良名が未設定です。', fieldName: 'secondaryProduct' }));
      }
      if (block.materialDirectQuantity <= 0 && (block.materialArea <= 0 || block.materialThickness <= 0)) {
        issues.push(createReviewIssue({
          severity: 'critical',
          title: '材料数量 root 未設定',
          detail: '直接数量、または 面積×厚み のどちらかが必要です。',
          fieldName: 'materialDirectQuantity',
        }));
      }
      if (block.materialTakeoffMode === 't' && block.materialDirectQuantity <= 0 && block.materialDensity <= 0) {
        issues.push(createReviewIssue({
          severity: 'critical',
          title: 't 監査の換算密度未設定',
          detail: 't 監査で直接数量が無い場合は、t/m3 の換算密度が必要です。',
          fieldName: 'materialDensity',
        }));
      }
      break;
    default:
      break;
  }

  return issues;
}

export function generateReportBundle({ project, block, drawing, result, outputMode = 'confirmed' }: ReportContext): GeneratedReportBundle {
  const sourceSummary = resolveSourceSummary(drawing);

  // 図面候補の平均確信度を算出
  const avgConfidence = drawing && drawing.aiCandidates.length > 0
    ? drawing.aiCandidates.reduce((sum, c) => sum + c.confidence, 0) / drawing.aiCandidates.length
    : 0.85; // 図面なしの場合は手入力とみなして高信頼度

  const threshold = MODE_CONFIDENCE_THRESHOLD[outputMode];
  const flags = classifyByConfidence(avgConfidence);

  // 全行を生成（確信度・フラグ付き）
  const allEstimateRows = result.lineItems.map((lineItem) => createEstimateRow({
    section: lineItem.section,
    itemName: lineItem.itemName,
    specification: lineItem.specification,
    quantity: lineItem.quantity,
    unit: lineItem.unit,
    unitPrice: lineItem.unitPrice,
    amount: lineItem.amount,
    remarks: lineItem.remarks,
    sourceSummary,
    confidenceLevel: avgConfidence,
    isPending: flags.isPending,
    requiresReview: flags.requiresReview,
  }));

  // モード別フィルタリング
  const estimateRows = outputMode === 'full'
    ? allEstimateRows
    : allEstimateRows.filter((row) => (row.confidenceLevel ?? 1) >= threshold);

  // モード別サマリ算出
  const confirmedRows = allEstimateRows.filter((row) => (row.confidenceLevel ?? 1) >= 0.8);
  const pendingRows = allEstimateRows.filter((row) => {
    const c = row.confidenceLevel ?? 1;
    return c >= 0.5 && c < 0.8;
  });
  const modeSummary = {
    confirmedCount: confirmedRows.length,
    pendingCount: pendingRows.length,
    fullCount: allEstimateRows.length,
    confirmedAmount: confirmedRows.reduce((sum, r) => sum + r.amount, 0),
    pendingAmount: pendingRows.reduce((sum, r) => sum + r.amount, 0),
    fullAmount: allEstimateRows.reduce((sum, r) => sum + r.amount, 0),
  };

  const estimateRowByKey = new Map(result.lineItems.map((lineItem, index) => [lineItem.key, allEstimateRows[index]]));
  const changeEstimateRows = result.zoneBreakdowns.map((zone) => createChangeEstimateRow({
    zoneName: zone.name,
    itemName: result.displayName,
    specification: `${result.displayName} / ${zone.primaryQuantity}${zone.primaryUnit} / 配賦${zone.quantityShare}%`,
    quantity: zone.primaryQuantity,
    unit: zone.primaryUnit,
    quantityShare: zone.quantityShare,
    baseAmount: zone.baseAmount,
    remobilizationCount: zone.remobilizationCount,
    remobilizationAmount: zone.remobilizationAmount,
    temporaryRestorationRate: zone.temporaryRestorationRate,
    temporaryRestorationQuantity: zone.temporaryRestorationQuantity,
    temporaryRestorationAmount: zone.temporaryRestorationAmount,
    coordinationAdjustmentRate: zone.coordinationAdjustmentRate,
    coordinationAdjustmentAmount: zone.coordinationAdjustmentAmount,
    totalAmount: zone.totalAmount,
    drawingPageRefs: zone.drawingPageRefs,
    notePhotoUrls: zone.notePhotoUrls,
    relatedTradeNames: zone.relatedTradeNames,
    remarks: [
      `図面 ${formatPageRefs(zone.drawingPageRefs)}`,
      `他工種 ${formatTradeNames(zone.relatedTradeNames)}`,
      `備考写真 ${formatPhotoSummary(zone.notePhotoUrls)}`,
      zone.note || null,
    ].filter(Boolean).join(' / '),
    sourceSummary,
  }));

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
  reviewIssues.push(...buildZoneMetadataIssues(block));

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
    estimateRows,
    changeEstimateRows,
    unitPriceEvidenceRows: evidenceRows,
    reviewIssues,
    outputMode,
    modeSummary,
    summary: {
      totalAmount: Math.round(estimateRows.reduce((sum, r) => sum + r.amount, 0)),
      totalRows: estimateRows.length,
      changeEstimateRowCount: changeEstimateRows.length,
      changeEstimateTotalAmount: changeEstimateRows.reduce((sum, row) => sum + row.totalAmount, 0),
      requiresReviewCount: reviewIssues.length,
    },
  };
}
