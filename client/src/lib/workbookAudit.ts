import type {
  BlockType,
  CalculationResult,
  EstimateBlock,
  Project,
  WorkbookAuditBundle,
  WorkbookAuditRow,
  WorkbookAuditStatus,
} from './types';

type ProjectBlockResult = {
  block: EstimateBlock;
  result: CalculationResult;
};

type WorkbookAuditReferenceRow = {
  id: string;
  section: string;
  itemName: string;
  specification: string;
  quantity: number;
  unit: string;
  workbookLogic: string;
  blockType?: BlockType;
  matcher?: {
    secondaryProductIncludes?: string[];
    productWidth?: number;
    productHeight?: number;
    surfaceThickness?: number;
    binderThickness?: number;
    baseThickness?: number;
    demolitionWidth?: number;
    demolitionThickness?: number;
  };
};

const SHIROYAMA_KEYWORDS = ['城山', '都井沢', 'クリエイト'];

const SHIROYAMA_WORKBOOK_ROWS: WorkbookAuditReferenceRow[] = [
  {
    id: 'retaining-l600',
    section: '擁壁',
    itemName: 'ＲＣ擁壁（L-600ﾀｲﾌﾟ）',
    specification: 'W150*H950 （L=5ｍ+6ｍ+6ｍ）',
    quantity: 17,
    unit: 'm',
    workbookLogic: 'L を主数量、W/H を断面属性として扱う。5+6+6=17。',
    blockType: 'retaining_wall',
    matcher: {
      productWidth: 0.15,
      productHeight: 0.95,
    },
  },
  {
    id: 'retaining-l800',
    section: '擁壁',
    itemName: 'ＲＣ擁壁（L-800ﾀｲﾌﾟ）',
    specification: 'W200*H1150 （L=35.9ｍ+8.1ｍ+29.5ｍ）',
    quantity: 73.5,
    unit: 'm',
    workbookLogic: 'L を主数量、W/H を断面属性として扱う。35.9+8.1+29.5=73.5。',
    blockType: 'retaining_wall',
    matcher: {
      productWidth: 0.2,
      productHeight: 1.15,
    },
  },
  {
    id: 'retaining-co',
    section: '擁壁',
    itemName: 'Co土留め',
    specification: 'W200*H400 （L=17ｍ+15.6ｍ+6.7ｍ）',
    quantity: 39.3,
    unit: 'm',
    workbookLogic: 'L を主数量、W/H を断面属性として扱う。17+15.6+6.7=39.3。',
    blockType: 'retaining_wall',
    matcher: {
      secondaryProductIncludes: ['CO'],
      productWidth: 0.2,
      productHeight: 0.4,
    },
  },
  {
    id: 'storage-crushed-stone',
    section: '浸透貯留槽',
    itemName: '基礎砕石',
    specification: '255.3ｍ2*0.15',
    quantity: 38.3,
    unit: 'm3',
    workbookLogic: '面積×厚み。255.3×0.15=38.295 → 38.3。',
  },
  {
    id: 'storage-sand',
    section: '浸透貯留槽',
    itemName: '調整砂',
    specification: '255.3ｍ2*0.05',
    quantity: 12.8,
    unit: 'm3',
    workbookLogic: '面積×厚み。255.3×0.05=12.765 → 12.8。',
  },
  {
    id: 'storage-disposal',
    section: '浸透貯留槽',
    itemName: '残土処分',
    specification: '（209.8ｍ3-158.7ｍ3）*1.1＝56.2ｍ3',
    quantity: 56.2,
    unit: 'm3',
    workbookLogic: '差し引き体積に係数 1.1 を乗じる。',
  },
  {
    id: 'pavement-parking',
    section: '舗装',
    itemName: 'アスファルト舗装　駐車場',
    specification: '密粒As50+路盤150（RC40）',
    quantity: 1721,
    unit: 'm2',
    workbookLogic: '主数量は面積。厚みは表層50、路盤150として別属性管理。',
    blockType: 'pavement',
    matcher: {
      secondaryProductIncludes: ['駐車場'],
      surfaceThickness: 0.05,
      baseThickness: 0.15,
    },
  },
  {
    id: 'pavement-improvement',
    section: '舗装',
    itemName: '場内路盤下　地盤改良',
    specification: 'セメント安定処理 50kg/m3 t=300',
    quantity: 1520,
    unit: 'm2',
    workbookLogic: '主数量は面積。改良厚 t=300 を断面属性として分離する。',
    blockType: 'pavement',
    matcher: {
      secondaryProductIncludes: ['地盤改良'],
      baseThickness: 0.3,
    },
  },
  {
    id: 'approval-change-1',
    section: '乗入承認',
    itemName: '舗装変更工事',
    specification: 'AS（ｔ40）+RC40（ｔ100）',
    quantity: 29.9,
    unit: 'm2',
    workbookLogic: '主数量は面積。表層 t40、路盤 t100 を断面属性として扱う。',
    blockType: 'pavement',
    matcher: {
      secondaryProductIncludes: ['乗入', '舗装変更'],
      surfaceThickness: 0.04,
      baseThickness: 0.1,
    },
  },
  {
    id: 'approval-change-2',
    section: '乗入承認',
    itemName: '舗装変更工事',
    specification: 'AS（ｔ50+ｔ50）+RC40（ｔ300）',
    quantity: 26.8,
    unit: 'm2',
    workbookLogic: '主数量は面積。表層50、基層50、路盤300 を層別管理する。',
    blockType: 'pavement',
    matcher: {
      secondaryProductIncludes: ['乗入', '舗装変更'],
      surfaceThickness: 0.05,
      binderThickness: 0.05,
      baseThickness: 0.3,
    },
  },
  {
    id: 'approval-ucover',
    section: '乗入承認',
    itemName: '既設Ｕ型側溝蓋改修工事',
    specification: 'ｔ120、W450　蓋床板化',
    quantity: 8,
    unit: 'm',
    workbookLogic: '主数量は長さ。t120 と W450 は断面属性としてのみ使う。',
    blockType: 'demolition',
    matcher: {
      secondaryProductIncludes: ['側溝', '蓋'],
      demolitionWidth: 0.45,
      demolitionThickness: 0.12,
    },
  },
];

function includesAllTokens(source: string, tokens: string[]): boolean {
  const normalized = source.normalize('NFKC').toUpperCase();
  return tokens.every((token) => normalized.includes(token.normalize('NFKC').toUpperCase()));
}

function closeEnough(actual: number, expected: number, tolerance = 0.02): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

function diffValue(actual: number, expected: number): number {
  return Math.round((actual - expected) * 100) / 100;
}

function isShiroyamaProject(project: Project): boolean {
  const text = [
    project.name,
    project.siteName,
    project.clientName,
    ...project.drawings.map((drawing) => `${drawing.name} ${drawing.fileName} ${drawing.drawingTitle}`),
  ].join(' ');
  return SHIROYAMA_KEYWORDS.some((keyword) => text.includes(keyword));
}

function describeAppLogic(block: EstimateBlock, result: CalculationResult): string {
  const details = [
    `工種 ${block.blockType}`,
    `主数量 ${result.primaryQuantity}${result.primaryUnit}`,
  ];
  if (block.blockType === 'retaining_wall') {
    details.push(`W=${block.productWidth}m`);
    details.push(`H=${block.productHeight}m`);
  }
  if (block.blockType === 'pavement') {
    details.push(`表層=${block.surfaceThickness}m`);
    if (block.binderThickness > 0) details.push(`基層=${block.binderThickness}m`);
    if (block.baseThickness > 0) details.push(`路盤=${block.baseThickness}m`);
  }
  if (block.blockType === 'demolition') {
    details.push(`W=${block.demolitionWidth || block.pavementWidth || block.productWidth}m`);
    details.push(`t=${block.demolitionThickness || block.surfaceThickness}m`);
  }
  return details.join(' / ');
}

function blockMatchesReference(reference: WorkbookAuditReferenceRow, block: EstimateBlock): boolean {
  if (!reference.blockType || block.blockType !== reference.blockType) return false;

  const matcher = reference.matcher;
  if (!matcher) return true;

  const haystack = `${block.secondaryProduct} ${block.name}`;
  if (matcher.secondaryProductIncludes && !includesAllTokens(haystack, matcher.secondaryProductIncludes)) {
    return false;
  }
  if (matcher.productWidth !== undefined && !closeEnough(block.productWidth, matcher.productWidth)) {
    return false;
  }
  if (matcher.productHeight !== undefined && !closeEnough(block.productHeight, matcher.productHeight)) {
    return false;
  }
  if (matcher.surfaceThickness !== undefined && !closeEnough(block.surfaceThickness, matcher.surfaceThickness)) {
    return false;
  }
  if (matcher.binderThickness !== undefined && !closeEnough(block.binderThickness, matcher.binderThickness)) {
    return false;
  }
  if (matcher.baseThickness !== undefined && !closeEnough(block.baseThickness, matcher.baseThickness)) {
    return false;
  }
  if (matcher.demolitionWidth !== undefined && !closeEnough(block.demolitionWidth || block.pavementWidth || block.productWidth, matcher.demolitionWidth)) {
    return false;
  }
  if (matcher.demolitionThickness !== undefined && !closeEnough(block.demolitionThickness || block.surfaceThickness, matcher.demolitionThickness)) {
    return false;
  }

  return true;
}

function buildUnsupportedRow(reference: WorkbookAuditReferenceRow, note: string): WorkbookAuditRow {
  return {
    id: reference.id,
    section: reference.section,
    itemName: reference.itemName,
    specification: reference.specification,
    workbookQuantity: reference.quantity,
    workbookUnit: reference.unit,
    appQuantity: null,
    appUnit: null,
    difference: null,
    status: 'unsupported_logic',
    workbookLogic: reference.workbookLogic,
    appLogic: '現行アプリの工種モデルでは直接算定しません。',
    notes: [note],
  };
}

export function buildProjectWorkbookAudit(project: Project, blockResults: ProjectBlockResult[]): WorkbookAuditBundle | null {
  if (!isShiroyamaProject(project)) return null;

  const usedBlockIds = new Set<string>();
  const rows = SHIROYAMA_WORKBOOK_ROWS.map((reference) => {
    if (!reference.blockType) {
      return buildUnsupportedRow(reference, '浸透貯留槽や差し引き体積は現行 block モデル外のため、式だけ監査対象に残しています。');
    }

    const matched = blockResults.find(({ block }) => (
      !usedBlockIds.has(block.id) && blockMatchesReference(reference, block)
    ));

    if (!matched) {
      return {
        id: reference.id,
        section: reference.section,
        itemName: reference.itemName,
        specification: reference.specification,
        workbookQuantity: reference.quantity,
        workbookUnit: reference.unit,
        appQuantity: null,
        appUnit: null,
        difference: null,
        status: 'missing_block' as WorkbookAuditStatus,
        workbookLogic: reference.workbookLogic,
        appLogic: '一致する block が未作成、または断面条件が未入力です。',
        notes: ['該当 block を作成し、W/H/t/名称を workbook 条件へ合わせる必要があります。'],
      };
    }

    usedBlockIds.add(matched.block.id);
    const appQuantity = matched.result.primaryQuantity;
    const difference = diffValue(appQuantity, reference.quantity);
    const tolerance = Math.max(0.1, reference.quantity * 0.01);
    const status: WorkbookAuditStatus = Math.abs(difference) <= tolerance ? 'matched' : 'mismatch';

    return {
      id: reference.id,
      section: reference.section,
      itemName: reference.itemName,
      specification: reference.specification,
      workbookQuantity: reference.quantity,
      workbookUnit: reference.unit,
      appQuantity,
      appUnit: matched.result.primaryUnit,
      difference,
      status,
      workbookLogic: reference.workbookLogic,
      appLogic: describeAppLogic(matched.block, matched.result),
      notes: status === 'matched'
        ? ['workbook 数量と許容差内です。']
        : [`差分 ${difference > 0 ? '+' : ''}${difference}${reference.unit}`],
    };
  });

  return {
    projectLabel: '城山都井沢 外構造成見積監査',
    sourceWorkbook: '●外構内訳書（城山都井沢）.xlsm',
    rows,
    summary: {
      totalRows: rows.length,
      matchedRows: rows.filter((row) => row.status === 'matched').length,
      mismatchRows: rows.filter((row) => row.status === 'mismatch').length,
      missingRows: rows.filter((row) => row.status === 'missing_block').length,
      unsupportedRows: rows.filter((row) => row.status === 'unsupported_logic').length,
    },
  };
}
