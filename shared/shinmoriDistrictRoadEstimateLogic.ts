import type { BlockType } from '../client/src/lib/types';

export interface DistrictRoadEstimateLogicRule {
  id: string;
  title: string;
  interpretation: string;
  formula: string;
  workbookExamples: string[];
}

export interface DistrictRoadEstimateLogicProfile {
  projectLabel: string;
  sourceWorkbook: string;
  sourceSheet: string;
  sourceDrawings: string[];
  commonRules: DistrictRoadEstimateLogicRule[];
  byBlockType: Record<BlockType, DistrictRoadEstimateLogicRule[]>;
}

export const SHINMORI_DISTRICT_ROAD_ESTIMATE_LOGIC: DistrictRoadEstimateLogicProfile = {
  projectLabel: '新産業の森 その2工事 数量一致ロジック',
  sourceWorkbook: '藤沢市新産業の森第二地区土地区画整理事業 造成工事（その２）設計書.xlsm',
  sourceSheet: '１次見積もり',
  sourceDrawings: [
    '設計図＋数量計算書（地区画道路築造工）.pdf',
    '20250523_藤沢市新産業の森第二地区土地区画整理事業　工事概要　第二版-2.pdf',
    '01.造成工事（その２）20250616設計書-6 (1).pdf',
  ],
  commonRules: [
    {
      id: 'workbook-source-sheet',
      title: '真の数量表は １次見積もり を使う',
      interpretation: '見積もり数量計算表はテンプレ計算表で、この案件の正本数量ではない。案件一致監査は １次見積もり sheet の行数量を基準にする。',
      formula: 'reference_quantity = workbook["１次見積もり"].row.quantity',
      workbookExamples: [
        '路面排水溝側溝工 → 559m',
        'Ｌ形側溝（300B）一般部 → 566m',
        '地先境界ﾌﾞﾛｯｸＢ → 681m',
      ],
    },
    {
      id: 'length-vs-attributes',
      title: '主数量と断面条件を分離する',
      interpretation: 'L、m、箇所が主数量で、W・H・t・材料名は断面条件または単価条件として別に扱う。',
      formula: 'quantity_root = length_m | count | area_m2 ; section = width/height/thickness',
      workbookExamples: [
        'Ｌ形側溝（300B）一般部 → 数量 566m',
        '地盤改良 t=850 → 数量 root は砕石 ton、t=850 は条件',
      ],
    },
    {
      id: 'material-layer-separation',
      title: '舗装は面積 root と材料層を分離する',
      interpretation: 'RC-40、RM-40、As、コンクリートは材料層であり、面積や体積 root と直接同一視しない。材料数量だけの行は材料監査に回す。',
      formula: 'surface_area -> layer_thickness -> volume/tonnage',
      workbookExamples: [
        '車道アスファルト舗装工 下層路盤 RC-40 t=15cm → 材料数量 663.13',
        '再生粒度調整砕石 RM-40 t=15cm → 材料数量 656',
      ],
    },
  ],
  byBlockType: {
    secondary_product: [
      {
        id: 'drainage-length-root',
        title: '側溝・境界ブロック・トレンチは延長 root で持つ',
        interpretation: '道路付帯の側溝、境界ブロック、浸透トレンチはまず延長 m を合わせる。桝や付属部材は別行に切る。',
        formula: 'quantity = length_m',
        workbookExamples: [
          '組合せＬ型側溝Ｃ 一般部（両Ｒ） → 559m',
          '浸透ﾄﾚﾝﾁ φ250-2段 → 714m',
          '地先境界ﾌﾞﾛｯｸＢ → 681m',
        ],
      },
      {
        id: 'count-items-separated',
        title: '桝・標識・車止めは数量 count として別監査する',
        interpretation: '街渠桝、接続桝、標識、車止めは m ではなく箇所/本/基の count なので、現行の延長系 block には混ぜない。',
        formula: 'quantity = count',
        workbookExamples: [
          '街渠桝Ａ 一般部 → 38箇所',
          '警戒標識 400×600 → 2基',
        ],
      },
    ],
    retaining_wall: [
      {
        id: 'no-retaining-reference',
        title: 'この案件の一次見積に擁壁 root は少ない',
        interpretation: '今回の主要監査対象は地区画道路築造工、路面排水、舗装、境界で、擁壁は主対象外として扱う。',
        formula: 'n/a',
        workbookExamples: ['擁壁 root は別案件扱い'],
      },
    ],
    pavement: [
      {
        id: 'material-rows-need-area-root',
        title: '舗装材行だけでは面積一致にならない',
        interpretation: '下層路盤、フィルター層、表層の行は材料数量であり、面積 root や厚みが揃わないと app quantity と一致しない。',
        formula: 'area_m2 × thickness_m = volume_m3',
        workbookExamples: [
          '車道アスファルト舗装工 下層路盤 RC-40 t=15cm → 663.13',
          '再生クラッシャラン RC-40 t=30cm → 55',
        ],
      },
    ],
    demolition: [
      {
        id: 'demolition-not-primary',
        title: 'この案件の主要 root は撤去ではない',
        interpretation: '工事概要に撤去語が出ても、主数量監査は道路築造・排水・舗装・境界を優先する。',
        formula: 'prefer road/drainage/pavement roots over demolition keywords',
        workbookExamples: ['工事概要 PDF に撤去工が出ても、数量表正本は １次見積もりを優先'],
      },
    ],
  },
};

export function getShinmoriLogicForBlockType(blockType: BlockType): DistrictRoadEstimateLogicRule[] {
  return [
    ...SHINMORI_DISTRICT_ROAD_ESTIMATE_LOGIC.commonRules,
    ...(SHINMORI_DISTRICT_ROAD_ESTIMATE_LOGIC.byBlockType[blockType] ?? []),
  ];
}
