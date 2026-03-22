import type { BlockType } from '../client/src/lib/types';

export interface ExteriorEstimateLogicRule {
  id: string;
  title: string;
  interpretation: string;
  formula: string;
  workbookExamples: string[];
}

export interface ExteriorEstimateLogicProfile {
  projectLabel: string;
  sourceWorkbook: string;
  sourceDrawings: string[];
  commonRules: ExteriorEstimateLogicRule[];
  byBlockType: Record<BlockType, ExteriorEstimateLogicRule[]>;
}

export const SHIROYAMA_EXTERIOR_ESTIMATE_LOGIC: ExteriorEstimateLogicProfile = {
  projectLabel: '城山都井沢 外構造成見積ロジック',
  sourceWorkbook: '●外構内訳書（城山都井沢）.xlsm',
  sourceDrawings: [
    '03.開発協議最新図2026.01.22.pdf',
    '05.クリエイト城山都井沢構造図1215（0122訂正）.pdf',
  ],
  commonRules: [
    {
      id: 'length-sum',
      title: '延長は部分延長の加算で出す',
      interpretation: '括弧内の L=...+...+... は同一工事項目の連続区間として合算し、最終数量は m で持つ。',
      formula: 'total_length = sum(segment_lengths)',
      workbookExamples: ['W150*H950（L=5m+6m+6m）= 17m', 'W200*H400（L=17m+15.6m+6.7m）= 39.3m'],
    },
    {
      id: 'area-thickness-volume',
      title: '面積×厚みで体積を出す',
      interpretation: 't=150, t=50 のような層厚は mm として読み、m に変換した上で面積へ乗じる。',
      formula: 'volume_m3 = area_m2 × thickness_m',
      workbookExamples: ['255.3m2 × 0.15m = 38.3m3', '255.3m2 × 0.05m = 12.8m3'],
    },
    {
      id: 'difference-disposal',
      title: '残土・埋戻しは差し引きで出す',
      interpretation: '根切・埋戻し・砕石・調整砂の関係がある場合は、残土処分を差し引きで計算する。',
      formula: 'disposal = (excavation - backfill - bedding) × swell_factor',
      workbookExamples: ['(209.8-158.7)×1.1 = 56.2m3'],
    },
  ],
  byBlockType: {
    secondary_product: [
      {
        id: 'drainage-structure-length',
        title: '外構構造物は延長・箇所で持つ',
        interpretation: '側溝・桝・地先ブロック・集水桝は m または 箇所 で分けて持つ。',
        formula: 'quantity = length_m or count',
        workbookExamples: ['イージースリット側溝 53m', '集水桝 1箇所 / 管理桝 5箇所'],
      },
    ],
    retaining_wall: [
      {
        id: 'wall-wh-length',
        title: '擁壁は W/H と延長を分離する',
        interpretation: 'W150, H950 は形状条件、数量本体は L 加算後の延長。幅と高さは単価選定や断面判定に使う。',
        formula: 'quantity = wall_length_m ; width/height = section attributes',
        workbookExamples: ['RC擁壁 W150*H950 L=17m', 'CB土留 W150 L=45.6m'],
      },
      {
        id: 'retaining-thickness',
        title: '基礎厚・砕石厚は断面から拾う',
        interpretation: '均し、基礎コンクリート、砕石は断面 t 値を優先し、plan だけでは確定しない。',
        formula: 'base_volume = width × thickness × length',
        workbookExamples: ['基礎砕石 t=150', '均し/ベース厚は断面 detail 依存'],
      },
    ],
    pavement: [
      {
        id: 'paving-area',
        title: '舗装数量は面積優先',
        interpretation: '駐車場舗装は面積 m2 を主数量とし、As・基層・路盤厚は断面の t 値から層別に持つ。',
        formula: 'surface_volume = area × surface_thickness',
        workbookExamples: ['駐車場舗装 1721m2', 'As50 + 路盤150'],
      },
      {
        id: 'multi-layer-thickness',
        title: 'As50+50+RC40 300 は層を分ける',
        interpretation: '最初の As t を表層、次の As t を基層、RC40 や路盤 t を路盤厚として読む。',
        formula: 'surface=t1 ; binder=t2 ; base=t3',
        workbookExamples: ['AS(t50+t50)+RC40(t300)', 'セメント安定処理 t=300'],
      },
    ],
    demolition: [
      {
        id: 'demolition-length-area',
        title: '撤去は対象によって m と m2 を分ける',
        interpretation: '擁壁撤去や地先ブロック撤去は延長、舗装変更は面積、側溝蓋改修は長さ×幅×厚の断面条件で読む。',
        formula: 'quantity = length_m or area_m2 depending object type',
        workbookExamples: ['既存南側擁壁撤去 33.6m', '舗装変更 29.9m2 / 26.8m2 / 20.7m2'],
      },
    ],
  },
};

export function getShiroyamaLogicForBlockType(blockType: BlockType): ExteriorEstimateLogicRule[] {
  return [
    ...SHIROYAMA_EXTERIOR_ESTIMATE_LOGIC.commonRules,
    ...(SHIROYAMA_EXTERIOR_ESTIMATE_LOGIC.byBlockType[blockType] ?? []),
  ];
}
