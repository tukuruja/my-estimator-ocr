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
    countUnit?: string;
    materialTakeoffMode?: 'm3' | 't';
    materialThickness?: number;
  };
};

const SHIROYAMA_KEYWORDS = ['城山', '都井沢', 'クリエイト'];
const SHINMORI_KEYWORDS = ['新産業の森', '藤沢市', '地区画道路', '造成工事その２'];

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
    blockType: 'material_takeoff',
    matcher: {
      secondaryProductIncludes: ['基礎砕石'],
      materialTakeoffMode: 'm3',
      materialThickness: 0.15,
    },
  },
  {
    id: 'storage-sand',
    section: '浸透貯留槽',
    itemName: '調整砂',
    specification: '255.3ｍ2*0.05',
    quantity: 12.8,
    unit: 'm3',
    workbookLogic: '面積×厚み。255.3×0.05=12.765 → 12.8。',
    blockType: 'material_takeoff',
    matcher: {
      secondaryProductIncludes: ['調整砂'],
      materialTakeoffMode: 'm3',
      materialThickness: 0.05,
    },
  },
  {
    id: 'storage-disposal',
    section: '浸透貯留槽',
    itemName: '残土処分',
    specification: '（209.8ｍ3-158.7ｍ3）*1.1＝56.2ｍ3',
    quantity: 56.2,
    unit: 'm3',
    workbookLogic: '差し引き体積に係数 1.1 を乗じる。',
    blockType: 'material_takeoff',
    matcher: {
      secondaryProductIncludes: ['残土処分'],
      materialTakeoffMode: 'm3',
    },
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

const SHINMORI_WORKBOOK_ROWS: WorkbookAuditReferenceRow[] = [
  {
    id: 'shinmori-combo-l',
    section: '路面排水工',
    itemName: '組合せＬ型側溝Ｃ 一般部（両Ｒ）',
    specification: '１次見積もり!3 / 数量 559m',
    quantity: 559,
    unit: 'm',
    workbookLogic: '真の数量表は １次見積もり。側溝は延長 m を主数量にする。',
    blockType: 'secondary_product',
    matcher: { secondaryProductIncludes: ['組合せ', '側溝'] },
  },
  {
    id: 'shinmori-l300-general',
    section: '路面排水工',
    itemName: 'Ｌ形側溝（300B）一般部',
    specification: '１次見積もり!7 / 数量 566m',
    quantity: 566,
    unit: 'm',
    workbookLogic: 'L形側溝一般部は延長 root。W/H や付属材料は別管理。',
    blockType: 'secondary_product',
    matcher: { secondaryProductIncludes: ['L形側溝', '一般部'] },
  },
  {
    id: 'shinmori-l300-flat',
    section: '路面排水工',
    itemName: 'Ｌ形側溝（300B）平坦部',
    specification: '１次見積もり!8 / 数量 12m',
    quantity: 12,
    unit: 'm',
    workbookLogic: '平坦部も延長 root。乗入部・一般部と別行で保持する。',
    blockType: 'secondary_product',
    matcher: { secondaryProductIncludes: ['L形側溝', '平坦部'] },
  },
  {
    id: 'shinmori-l300-entrance',
    section: '路面排水工',
    itemName: 'Ｌ形側溝（300B）乗入部',
    specification: '１次見積もり!9 / 数量 24m',
    quantity: 24,
    unit: 'm',
    workbookLogic: '乗入部は別延長として持ち、一般部と混算しない。',
    blockType: 'secondary_product',
    matcher: { secondaryProductIncludes: ['L形側溝', '乗入部'] },
  },
  {
    id: 'shinmori-trench-1',
    section: '排水工',
    itemName: '浸透ﾄﾚﾝﾁ φ250-1段',
    specification: '１次見積もり!11 / 数量 359m',
    quantity: 359,
    unit: 'm',
    workbookLogic: '浸透トレンチは段数を属性、延長を主数量とする。',
    blockType: 'secondary_product',
    matcher: { secondaryProductIncludes: ['浸透', 'ﾄﾚﾝﾁ', '1段'] },
  },
  {
    id: 'shinmori-trench-2',
    section: '排水工',
    itemName: '浸透ﾄﾚﾝﾁ φ250-2段',
    specification: '１次見積もり!12 / 数量 714m',
    quantity: 714,
    unit: 'm',
    workbookLogic: '2段トレンチも延長 root。段数は数量ではなく仕様条件。',
    blockType: 'secondary_product',
    matcher: { secondaryProductIncludes: ['浸透', 'ﾄﾚﾝﾁ', '2段'] },
  },
  {
    id: 'shinmori-curb-a',
    section: '境界工',
    itemName: '歩車道境界ﾌﾞﾛｯｸ 一般部Ａ（両Ｒ）',
    specification: '１次見積もり!20 / 数量 40m',
    quantity: 40,
    unit: 'm',
    workbookLogic: '歩車道境界ブロックは延長 m を主数量とする。',
    blockType: 'secondary_product',
    matcher: { secondaryProductIncludes: ['歩車道', '境界', '一般部'] },
  },
  {
    id: 'shinmori-curb-flat',
    section: '境界工',
    itemName: '歩車道境界ﾌﾞﾛｯｸ 平坦部（ｾｲﾌﾃｨﾌﾞﾛｯｸ）',
    specification: '１次見積もり!21 / 数量 2m',
    quantity: 2,
    unit: 'm',
    workbookLogic: '平坦部は別延長で保持する。',
    blockType: 'secondary_product',
    matcher: { secondaryProductIncludes: ['歩車道', '境界', '平坦部'] },
  },
  {
    id: 'shinmori-curb-slope',
    section: '境界工',
    itemName: '歩車道境界ﾌﾞﾛｯｸ 摺付部Ｃ（乗入用斜1本）',
    specification: '１次見積もり!22 / 数量 4m',
    quantity: 4,
    unit: 'm',
    workbookLogic: '摺付部は別延長として監査する。',
    blockType: 'secondary_product',
    matcher: { secondaryProductIncludes: ['歩車道', '境界', '摺付部'] },
  },
  {
    id: 'shinmori-site-boundary',
    section: '境界工',
    itemName: '地先境界ﾌﾞﾛｯｸ Ｂ（W=9.5m）',
    specification: '１次見積もり!23 / 数量 681m',
    quantity: 681,
    unit: 'm',
    workbookLogic: '地先境界ブロックは W=9.5m を断面条件とし、数量本体は 681m。',
    blockType: 'secondary_product',
    matcher: { secondaryProductIncludes: ['地先', '境界', 'ﾌﾞﾛｯｸ'] },
  },
  {
    id: 'shinmori-manhole-a',
    section: '排水工',
    itemName: '街渠桝Ａ 一般部（ｾﾐﾌﾗｯﾄ）',
    specification: '１次見積もり!13 / 数量 38箇所',
    quantity: 38,
    unit: '箇所',
    workbookLogic: '桝は count root。現行 block は延長系なので別モデルが必要。',
    blockType: 'count_structure',
    matcher: {
      secondaryProductIncludes: ['街渠桝'],
      countUnit: '箇所',
    },
  },
  {
    id: 'shinmori-connection-a',
    section: '排水工',
    itemName: '接続桝Ａ 一般部（ｾﾐﾌﾗｯﾄ）',
    specification: '１次見積もり!14 / 数量 2箇所',
    quantity: 2,
    unit: '箇所',
    workbookLogic: '接続桝は count root。現行 block では直接比較しない。',
    blockType: 'count_structure',
    matcher: {
      secondaryProductIncludes: ['接続桝'],
      countUnit: '箇所',
    },
  },
  {
    id: 'shinmori-lmanhole-general',
    section: '排水工',
    itemName: 'Ｌ形側溝桝 一般部 藤沢市Ｂ型',
    specification: '１次見積もり!15 / 数量 32箇所',
    quantity: 32,
    unit: '箇所',
    workbookLogic: 'L形側溝桝は count root。延長系 block とは分けて監査する。',
    blockType: 'count_structure',
    matcher: {
      secondaryProductIncludes: ['側溝桝'],
      countUnit: '箇所',
    },
  },
  {
    id: 'shinmori-roadbed-rc40',
    section: '舗装工',
    itemName: '車道アスファルト舗装工 下層路盤 RC-40 t=15cm',
    specification: '１次見積もり!32 / 材料数量 663.13',
    quantity: 663.13,
    unit: 'm3',
    workbookLogic: 'この行は面積 root ではなく材料数量。面積×厚みが未確定だと一致監査できない。',
    blockType: 'material_takeoff',
    matcher: {
      secondaryProductIncludes: ['RC-40', '下層路盤'],
      materialTakeoffMode: 'm3',
      materialThickness: 0.15,
    },
  },
  {
    id: 'shinmori-rm40-15',
    section: '舗装工',
    itemName: '再生粒度調整砕石 RM-40 t=15cm',
    specification: '１次見積もり!34 / 材料数量 656',
    quantity: 656,
    unit: 'm3',
    workbookLogic: '材料層の数量。舗装面積 root と分けて扱う必要がある。',
    blockType: 'material_takeoff',
    matcher: {
      secondaryProductIncludes: ['RM-40'],
      materialTakeoffMode: 'm3',
      materialThickness: 0.15,
    },
  },
  {
    id: 'shinmori-ground-improvement',
    section: '路床工',
    itemName: '地盤改良 置き換え工 t=850',
    specification: '１次見積もり!25 / RC40 3,283t',
    quantity: 3283,
    unit: 't',
    workbookLogic: '置換工は tonnage root。現行アプリは ton 直算モデルを持たない。',
    blockType: 'material_takeoff',
    matcher: {
      secondaryProductIncludes: ['地盤改良', '置き換え工'],
      materialTakeoffMode: 't',
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

function isShinmoriProject(project: Project): boolean {
  const text = [
    project.name,
    project.siteName,
    project.clientName,
    ...project.drawings.map((drawing) => `${drawing.name} ${drawing.fileName} ${drawing.drawingTitle}`),
  ].join(' ');
  return SHINMORI_KEYWORDS.some((keyword) => text.includes(keyword));
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
  if (block.blockType === 'count_structure') {
    details.push(`数量=${block.countQuantity}${block.countUnit || '箇所'}`);
  }
  if (block.blockType === 'material_takeoff') {
    details.push(`監査=${block.materialTakeoffMode}`);
    if (block.materialDirectQuantity > 0) {
      details.push(`直接数量=${block.materialDirectQuantity}${block.materialTakeoffMode}`);
    } else {
      details.push(`面積=${block.materialArea}m2`);
      details.push(`厚み=${block.materialThickness}m`);
    }
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
  if (matcher.countUnit !== undefined && (block.countUnit || '').trim() !== matcher.countUnit) {
    return false;
  }
  if (matcher.materialTakeoffMode !== undefined && block.materialTakeoffMode !== matcher.materialTakeoffMode) {
    return false;
  }
  if (matcher.materialThickness !== undefined && !closeEnough(block.materialThickness, matcher.materialThickness)) {
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

function buildWorkbookAuditBundle({
  projectLabel,
  sourceWorkbook,
  referenceRows,
  blockResults,
}: {
  projectLabel: string;
  sourceWorkbook: string;
  referenceRows: WorkbookAuditReferenceRow[];
  blockResults: ProjectBlockResult[];
}): WorkbookAuditBundle {
  const usedBlockIds = new Set<string>();
  const rows = referenceRows.map((reference) => {
    if (!reference.blockType) {
      return buildUnsupportedRow(reference, '現行アプリの block モデルでは、この数量 root を直接算定しません。');
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
        appLogic: '一致する block が未作成、または名称/断面条件が未入力です。',
        notes: ['該当 block を作成し、名称と数量 root を workbook 条件へ合わせる必要があります。'],
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
    projectLabel,
    sourceWorkbook,
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

export function buildProjectWorkbookAudit(project: Project, blockResults: ProjectBlockResult[]): WorkbookAuditBundle | null {
  if (isShiroyamaProject(project)) {
    return buildWorkbookAuditBundle({
      projectLabel: '城山都井沢 外構造成見積監査',
      sourceWorkbook: '●外構内訳書（城山都井沢）.xlsm',
      referenceRows: SHIROYAMA_WORKBOOK_ROWS,
      blockResults,
    });
  }

  if (isShinmoriProject(project)) {
    return buildWorkbookAuditBundle({
      projectLabel: '新産業の森 その2工事 数量監査',
      sourceWorkbook: '藤沢市新産業の森第二地区土地区画整理事業 造成工事（その２）設計書.xlsm / １次見積もり',
      referenceRows: SHINMORI_WORKBOOK_ROWS,
      blockResults,
    });
  }

  return null;
}
