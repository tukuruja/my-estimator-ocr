import type {
  Drawing,
  EstimateBlock,
  GeneratedReportBundle,
  MasterType,
  PriceMasterItem,
  Project,
} from '../client/src/lib/types';

export interface ConstructionExpertRole {
  id: string;
  title: string;
  discipline: string;
  focus: string;
  vetoCondition: string;
}

export interface ConstructionSiteConditions {
  groundCondition: string;
  groundwaterCondition: string;
  trafficCondition: string;
  accessCondition: string;
  yardCondition: string;
  buriedUtilities: string[];
  nearbyStructures: string[];
  disposalCondition: string;
  environmentalRestrictions: string[];
  weatherSeason: string;
  notes: string[];
}

export interface ConstructionConsensusIntegrationPoint {
  phase: string;
  target: string;
  purpose: string;
  implementation: string;
}

export interface ConstructionKnowledgePack {
  id: string;
  name: string;
  purpose: string;
  activationRule: string;
  quantityImpact: string;
  blockTypes: Array<EstimateBlock['blockType'] | 'all'>;
  quantityTargets: string[];
  outputMode: 'direct' | 'guardrail' | 'future_scope';
}

export interface ConstructionKnowledgePackSelection {
  knowledgePackId: string;
  name: string;
  status: 'active' | 'watch' | 'future_scope';
  reason: string;
  quantityTargets: string[];
}

export interface ConstructionConsensusBlueprint {
  title: string;
  rationale: string;
  expertPanel: ConstructionExpertRole[];
  knowledgePacks: ConstructionKnowledgePack[];
  quantityExtractionProtocol: string[];
  nonNegotiables: string[];
  finalPosition: string[];
  systemPrompt: string;
  outputSchema: Record<string, unknown>;
  integrationPoints: ConstructionConsensusIntegrationPoint[];
  defaultSiteConditions: ConstructionSiteConditions;
}

export interface ConstructionConsensusContextSnapshot {
  effectiveDate: string;
  project: {
    id: string;
    name: string;
    clientName: string;
    siteName: string;
    status: Project['status'];
  };
  block: EstimateBlock;
  drawing: {
    id: string;
    name: string;
    fileName: string;
    drawingNo: string;
    drawingTitle: string;
    revision: string;
    status: Drawing['status'];
    pageCount: number;
    ocrItemCount: number;
    aiCandidateCount: number;
    topWorkTypeCandidates: Drawing['workTypeCandidates'];
  } | null;
  reportBundle: GeneratedReportBundle;
  siteConditions: ConstructionSiteConditions;
  relevantMasters: Array<{
    id: string;
    masterType: MasterType;
    code: string;
    name: string;
    aliases: string[];
    unitPrice: number;
    unit: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    sourceName: string;
    sourceVersion: string;
    sourcePage: string | null;
  }>;
  quantityExtractionProtocol: string[];
  selectedKnowledgePacks: ConstructionKnowledgePackSelection[];
}

export interface ConstructionConsensusPreviewInput {
  project: Project;
  block: EstimateBlock;
  drawing: Drawing | null;
  reportBundle: GeneratedReportBundle;
  masters: PriceMasterItem[];
  effectiveDate: string;
  siteConditions?: Partial<ConstructionSiteConditions>;
}

export interface ConstructionConsensusPreviewResponse {
  blueprint: ConstructionConsensusBlueprint;
  context: ConstructionConsensusContextSnapshot;
  openAiResponsesRequest: Record<string, unknown>;
}

export const DEFAULT_SITE_CONDITIONS: ConstructionSiteConditions = {
  groundCondition: '未確認',
  groundwaterCondition: '未確認',
  trafficCondition: '未確認',
  accessCondition: '未確認',
  yardCondition: '未確認',
  buriedUtilities: [],
  nearbyStructures: [],
  disposalCondition: '未確認',
  environmentalRestrictions: [],
  weatherSeason: '通常期想定',
  notes: [],
};

export const CONSTRUCTION_EXPERT_PANEL: ConstructionExpertRole[] = [
  {
    id: 'estimation-director',
    title: '積算統括',
    discipline: '公共土木積算',
    focus: '工種分解、数量拾い、単価適用の最終整合',
    vetoCondition: '根拠数量か根拠単価が不足している見積行を確定してはいけない',
  },
  {
    id: 'site-superintendent',
    title: '現場代理人',
    discipline: '施工計画',
    focus: '施工順序、搬入動線、仮設制約、工程上の成立性',
    vetoCondition: '施工ヤードや重機進入条件が不明なまま施工方法を断定してはいけない',
  },
  {
    id: 'geotechnical-lead',
    title: '地質責任者',
    discipline: '地盤・地下水',
    focus: '掘削条件、湧水、根入れ、土質による施工差',
    vetoCondition: '地質が未確認なら掘削難易度や残土条件を推定で固定してはいけない',
  },
  {
    id: 'temporary-works',
    title: '仮設計画',
    discipline: '仮設・安全',
    focus: '土留め、覆工、交通切回し、安全設備',
    vetoCondition: '第三者影響や交通規制が未確認なら仮設費を過少計上してはいけない',
  },
  {
    id: 'survey-cad',
    title: '測量CAD',
    discipline: '図面整合',
    focus: '縮尺、寸法、図郭、座標整合、DXF/JWW初稿化',
    vetoCondition: '図面上の基準が曖昧なら数量の幾何確定を停止する',
  },
  {
    id: 'ocr-evidence',
    title: 'OCR根拠監査',
    discipline: '証拠追跡',
    focus: 'sourceText、sourcePage、sourceBox、confidence、requiresReview の完全性',
    vetoCondition: '根拠bboxが無い候補は自動反映してはいけない',
  },
  {
    id: 'cost-control',
    title: '原価管理',
    discipline: '単価・原価',
    focus: '有効日、仕切、処分単価、地域差、割増',
    vetoCondition: '有効日不一致の単価を採用してはいけない',
  },
  {
    id: 'quality-compliance',
    title: '品質法令',
    discipline: '規格・法令',
    focus: 'JIS、仕様書、監督基準、出来形条件',
    vetoCondition: '規格不明の材料を確定してはいけない',
  },
  {
    id: 'asset-owner',
    title: '発注者視点',
    discipline: '説明責任',
    focus: '見積説明性、監査性、再現性',
    vetoCondition: '第三者が再現できない見積ロジックを採用してはいけない',
  },
  {
    id: 'ai-safety',
    title: 'AI安全統制',
    discipline: 'モデル運用',
    focus: '未確定停止、競合候補、低信頼度候補の隔離',
    vetoCondition: '未知条件をモデルの記憶だけで埋めてはいけない',
  },
];

const ALL_BLOCK_TYPES: Array<EstimateBlock['blockType'] | 'all'> = ['all'];

export const CONSTRUCTION_KNOWLEDGE_PACKS: ConstructionKnowledgePack[] = [
  {
    id: 'civil-engineering-field',
    name: 'Civil Engineering Field',
    purpose: '土木施工の現場判断、出来形、品質、施工性の見方を与える',
    activationRule: '全土木図面で常時有効',
    quantityImpact: '図面数量と現場成立性が矛盾する場合に stop または review_required に倒す',
    blockTypes: ALL_BLOCK_TYPES,
    quantityTargets: ['distance', 'currentHeight', 'plannedHeight', 'productWidth', 'productHeight', 'productLength'],
    outputMode: 'guardrail',
  },
  {
    id: 'construction-estimation-full-pack',
    name: '建設積算フルパック',
    purpose: '工種別の入力整理、数量根拠、概算計算、単価根拠整理を行う',
    activationRule: '見積ブロック生成時に常時有効',
    quantityImpact: '数量拾い -> 明細化 -> 根拠表生成までの整合性を確認する',
    blockTypes: ALL_BLOCK_TYPES,
    quantityTargets: ['distance', 'stages', 'crushedStoneThickness', 'baseThickness', 'productWidth', 'productHeight', 'productLength'],
    outputMode: 'direct',
  },
  {
    id: 'construction-site-integrated',
    name: '建設現場統合',
    purpose: '施工判断、現場管理、工種調整、見積入力を一体で束ねる',
    activationRule: '複数工種が競合する図面、または施工条件が絡む図面で有効',
    quantityImpact: '単独工種として拾えない数量を工種横断で再整理する',
    blockTypes: ALL_BLOCK_TYPES,
    quantityTargets: ['distance', 'currentHeight', 'plannedHeight', 'stages', 'productWidth', 'productHeight'],
    outputMode: 'guardrail',
  },
  {
    id: 'construction-supreme-management',
    name: 'Construction Supreme Management',
    purpose: '全体最適、工程制約、管理目線の最終統合を行う',
    activationRule: '出力前の final decision で常時有効',
    quantityImpact: '数量自体は変えず、採用可否と停止条件の整合性を確定する',
    blockTypes: ALL_BLOCK_TYPES,
    quantityTargets: ['decision'],
    outputMode: 'guardrail',
  },
  {
    id: 'exterior-works-pro',
    name: 'Exterior Works Pro',
    purpose: '外構・仕上げ・納まり・取り合いの判断を行う',
    activationRule: '外構図、仕上げ図、境界周りの図面で有効',
    quantityImpact: '舗装端部、見切り、境界ブロック、排水との取り合い数量を補正する',
    blockTypes: ['secondary_product', 'pavement'],
    quantityTargets: ['distance', 'productWidth', 'baseThickness'],
    outputMode: 'direct',
  },
  {
    id: 'land-development-expert',
    name: 'Land Development Expert',
    purpose: '造成土工、排水、法面、開発造成の読み解きを行う',
    activationRule: '造成計画、排水計画、法面図、宅盤図で有効',
    quantityImpact: '土量、排水延長、法面処理、側溝・集水桝数量の判断に使う',
    blockTypes: ['secondary_product', 'retaining_wall', 'demolition'],
    quantityTargets: ['distance', 'currentHeight', 'plannedHeight'],
    outputMode: 'direct',
  },
  {
    id: 'apartment-estimate-input',
    name: 'マンション工事 見積入力',
    purpose: 'マンション新築の WBS、数量、人員、材料の入力整理を行う',
    activationRule: '建築系住棟図で有効。現行土木工種と不一致なら review_required に倒す',
    quantityImpact: '建築図面を誤って土木工種に流すことを防ぐ',
    blockTypes: ALL_BLOCK_TYPES,
    quantityTargets: ['workTypeCheck'],
    outputMode: 'guardrail',
  },
  {
    id: 'pavement-master',
    name: 'Pavement Master',
    purpose: '舗装の温度、締固め、継目、層構成を判断する',
    activationRule: '舗装図、断面図、路盤・表層記載がある図面で有効',
    quantityImpact: '舗装幅、表層厚、基層厚、施工区分の数量拾いに反映する',
    blockTypes: ['pavement'],
    quantityTargets: ['distance', 'productWidth', 'baseThickness', 'crushedStoneThickness'],
    outputMode: 'direct',
  },
  {
    id: 'rebar-craftsman',
    name: 'Rebar Craftsman',
    purpose: '配筋、定着、組立、検査の視点でRC系図面を読み解く',
    activationRule: 'RC擁壁、基礎、BOX、配筋図で有効',
    quantityImpact: '現行アプリ未対応の配筋数量を future scope として隔離する',
    blockTypes: ['retaining_wall'],
    quantityTargets: ['future_rebar_quantity'],
    outputMode: 'future_scope',
  },
  {
    id: 'retaining-wall-specialist',
    name: 'Retaining Wall Specialist',
    purpose: '擁壁工の形状、底版、控え長、根入れ、水抜き条件を整理する',
    activationRule: '擁壁図で常時有効',
    quantityImpact: '擁壁高、底版幅、延長、水抜き・裏込めの数量判断に使う',
    blockTypes: ['retaining_wall'],
    quantityTargets: ['distance', 'currentHeight', 'plannedHeight', 'productWidth', 'baseThickness'],
    outputMode: 'direct',
  },
  {
    id: 'roadwork-mastery',
    name: 'Roadwork Mastery',
    purpose: '道路工の施工順序と現場制御を判断する',
    activationRule: '道路改良、舗装、側溝、区画線、切削を含む図面で有効',
    quantityImpact: '道路工種の境界と施工区分を整理し、数量の重複を防ぐ',
    blockTypes: ['pavement', 'secondary_product', 'demolition'],
    quantityTargets: ['distance', 'productWidth', 'baseThickness', 'crushedStoneThickness'],
    outputMode: 'guardrail',
  },
  {
    id: 'site-supervision-master',
    name: 'Site Supervision Master',
    purpose: '品質、安全、工程、協力業者調整の観点で監督判断を行う',
    activationRule: '最終レビューで常時有効',
    quantityImpact: '拾った数量が施工監理上成立するかを確認する',
    blockTypes: ALL_BLOCK_TYPES,
    quantityTargets: ['decision', 'reviewIssues'],
    outputMode: 'guardrail',
  },
  {
    id: 'fence-professional',
    name: 'Fence Professional',
    purpose: 'フェンス割付、支柱、基礎、仕上げの判断を行う',
    activationRule: '外構フェンス図、境界柵図で有効',
    quantityImpact: '延長から柱本数や基礎数量への変換に使う',
    blockTypes: ['secondary_product'],
    quantityTargets: ['distance', 'stages'],
    outputMode: 'direct',
  },
  {
    id: 'foreman-expertise',
    name: 'Foreman Expertise',
    purpose: '職長レベルの段取り・歩掛・現場順序の見方を与える',
    activationRule: '最終レビューで常時有効',
    quantityImpact: '数量は維持しつつ施工手順の不整合を検出する',
    blockTypes: ALL_BLOCK_TYPES,
    quantityTargets: ['decision', 'constructionPlan'],
    outputMode: 'guardrail',
  },
  {
    id: 'formwork-precision',
    name: 'Formwork Precision',
    purpose: '型枠精度、側圧、安全の観点を与える',
    activationRule: 'コンクリート打設、基礎、擁壁、BOX 系で有効',
    quantityImpact: '型枠数量や打設補助数量の future scope を切り分ける',
    blockTypes: ['retaining_wall'],
    quantityTargets: ['future_formwork_quantity'],
    outputMode: 'future_scope',
  },
];

export const CONSTRUCTION_QUANTITY_EXTRACTION_PROTOCOL = [
  'Step 1: OCR候補、図面候補、工種候補を集約し、数量対象フィールドごとに一次候補を列挙する。',
  'Step 2: 知識パックを全件走査し、各フィールドに direct / guardrail / future_scope のどれで効くかを決める。',
  'Step 3: direct の知識パックで adoptedValue 候補を絞り、guardrail の知識パックで停止条件と review を判定する。',
  'Step 4: future_scope の知識パックは数量を勝手に埋めず futureScopeIsolation に隔離する。',
  'Step 5: field ごとに quantityReviewMatrix を残し、どの pack がどう効いたかを監査可能にする。',
  'Step 6: 施工判断と単価適用は数量採用後に行い、blockingQuestions が残る場合は ready にしない。',
];

export const CONSTRUCTION_NON_NEGOTIABLES = [
  '図面から読めた事実、単価マスタ、明示的な現場条件だけを使う',
  '地質、交通規制、埋設物、搬入条件、処分条件は未確認なら停止する',
  '各判断には sourceText, sourcePage, sourceBox, confidence, reason, requiresReview を残す',
  '単価は必ず sourceName, sourceVersion, effectiveFrom, effectiveTo を伴う',
  '結果は 確定可能 / 条件付き確定 / 要確認 / 作成停止 のいずれかで終了する',
];

export const CONSTRUCTION_FINAL_POSITION = [
  '数量拾いと施工判断は分離する。先に数量、次に施工方法、最後に単価適用で統合する',
  'PDFだけで確定できない条件は要確認として残し、推定で埋めない',
  'OCR単独ではなく、図面根拠・単価根拠・現場条件を同一の監査列に集約する',
  '見積書、単価根拠表、要確認一覧を同時生成し、説明責任を担保する',
  '完全自動確定を目的にせず、人が確認すべき箇所を狭く正確に提示する',
];

export const CONSTRUCTION_CONSENSUS_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'decision',
    'workInterpretation',
    'activatedKnowledgePacks',
    'constructionPlan',
    'quantityAdjustments',
    'quantityReviewMatrix',
    'priceAdjustments',
    'riskFlags',
    'blockingQuestions',
    'futureScopeIsolation',
    'executableNextActions',
    'auditTrail',
    'summary',
  ],
  properties: {
    decision: {
      type: 'string',
      enum: ['ready', 'conditional', 'review_required', 'stop'],
    },
    workInterpretation: {
      type: 'object',
      additionalProperties: false,
      required: ['adoptedBlockType', 'confidence', 'reason', 'scopeSummary'],
      properties: {
        adoptedBlockType: {
          type: 'string',
          enum: ['secondary_product', 'retaining_wall', 'pavement', 'demolition'],
        },
        confidence: { type: 'number' },
        reason: { type: 'string' },
        scopeSummary: { type: 'string' },
      },
    },
    activatedKnowledgePacks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['knowledgePackId', 'name', 'status', 'reason', 'quantityTargets'],
        properties: {
          knowledgePackId: { type: 'string' },
          name: { type: 'string' },
          status: { type: 'string', enum: ['active', 'watch', 'future_scope'] },
          reason: { type: 'string' },
          quantityTargets: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    constructionPlan: {
      type: 'object',
      additionalProperties: false,
      required: ['methodStatement', 'temporaryWorks', 'accessPlan', 'disposalPlan', 'assumptions'],
      properties: {
        methodStatement: { type: 'string' },
        temporaryWorks: { type: 'array', items: { type: 'string' } },
        accessPlan: { type: 'array', items: { type: 'string' } },
        disposalPlan: { type: 'array', items: { type: 'string' } },
        assumptions: { type: 'array', items: { type: 'string' } },
      },
    },
    quantityAdjustments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['fieldName', 'adoptedValue', 'reason', 'requiresReview'],
        properties: {
          fieldName: { type: 'string' },
          adoptedValue: {},
          reason: { type: 'string' },
          requiresReview: { type: 'boolean' },
        },
      },
    },
    quantityReviewMatrix: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['fieldName', 'evidenceSummary', 'appliedKnowledgePacks', 'decision', 'requiresReview'],
        properties: {
          fieldName: { type: 'string' },
          evidenceSummary: { type: 'string' },
          appliedKnowledgePacks: { type: 'array', items: { type: 'string' } },
          decision: { type: 'string', enum: ['adopt', 'review', 'stop', 'future_scope'] },
          requiresReview: { type: 'boolean' },
        },
      },
    },
    priceAdjustments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['estimateItemName', 'adoptedMasterName', 'adoptedUnitPrice', 'reason', 'requiresReview'],
        properties: {
          estimateItemName: { type: 'string' },
          adoptedMasterName: { type: 'string' },
          adoptedUnitPrice: { type: 'number' },
          reason: { type: 'string' },
          requiresReview: { type: 'boolean' },
        },
      },
    },
    riskFlags: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'title', 'detail'],
        properties: {
          severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
          title: { type: 'string' },
          detail: { type: 'string' },
        },
      },
    },
    blockingQuestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'question', 'whyItBlocks'],
        properties: {
          field: { type: 'string' },
          question: { type: 'string' },
          whyItBlocks: { type: 'string' },
        },
      },
    },
    futureScopeIsolation: {
      type: 'array',
      items: { type: 'string' },
    },
    executableNextActions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['owner', 'action', 'expectedOutput'],
        properties: {
          owner: { type: 'string' },
          action: { type: 'string' },
          expectedOutput: { type: 'string' },
        },
      },
    },
    auditTrail: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['step', 'evidence', 'conclusion'],
        properties: {
          step: { type: 'string' },
          evidence: { type: 'string' },
          conclusion: { type: 'string' },
        },
      },
    },
    summary: {
      type: 'object',
      additionalProperties: false,
      required: ['estimateReadiness', 'humanReviewFocus'],
      properties: {
        estimateReadiness: { type: 'string' },
        humanReviewFocus: { type: 'array', items: { type: 'string' } },
      },
    },
  },
};

export const CONSTRUCTION_CONSENSUS_SYSTEM_PROMPT = [
  'あなたは「建設現場合意エンジン」である。',
  'これは、1億人規模の関係者を直接集める代わりに、世界トップクラスの専門家集団が反証し続ける状況を模した synthetic consensus council である。',
  '数量拾いでは、ユーザーが指定した現場系知識パックを全件評価し、採用・監視・将来対応を明示しなければならない。',
  '以下の expert panel を必ず順番に通し、反証不能な部分だけを採用すること。',
  '',
  ...CONSTRUCTION_EXPERT_PANEL.map((role, index) => `${index + 1}. ${role.title} / ${role.discipline} / 焦点: ${role.focus} / 拒否条件: ${role.vetoCondition}`),
  '',
  '以下の knowledge pack は必ず全件評価し、activatedKnowledgePacks と quantityReviewMatrix に痕跡を残すこと。',
  ...CONSTRUCTION_KNOWLEDGE_PACKS.map((pack, index) => `${index + 1}. ${pack.name} / 役割: ${pack.purpose} / 発火条件: ${pack.activationRule} / 数量影響: ${pack.quantityImpact}`),
  '',
  '数量拾いプロトコル:',
  ...CONSTRUCTION_QUANTITY_EXTRACTION_PROTOCOL.map((item, index) => `${index + 1}. ${item}`),
  '',
  '絶対ルール:',
  ...CONSTRUCTION_NON_NEGOTIABLES.map((item, index) => `${index + 1}. ${item}`),
  '',
  '実行順序:',
  'A. 図面とOCRから工種候補・数量候補・規格候補を抽出する',
  'B. 知識パックを direct / guardrail / future_scope のいずれかで field ごとに割り当てる',
  'C. 現場条件が無いと断定できないものを blockingQuestions に回す',
  'D. 施工方法は、現場条件が不足する箇所を assumptions ではなく未確定として扱う',
  'E. 単価は relevantMasters と reportBundle の evidence だけで再点検する',
  'F. 最後に decision を ready / conditional / review_required / stop のいずれかで返す',
  '',
  '禁止事項:',
  '- 未確認の地質や周辺条件を推測で埋めること',
  '- 図面根拠のない値を adoptedValue にすること',
  '- 単価根拠のない値を adoptedUnitPrice にすること',
  '- active な knowledge pack を無視すること',
  '- JSON schema 以外の文章を返すこと',
].join('\n');

export const CONSTRUCTION_INTEGRATION_POINTS: ConstructionConsensusIntegrationPoint[] = [
  {
    phase: 'OCR後',
    target: 'client/src/pages/Home.tsx',
    purpose: 'OCR候補と工種候補が揃った直後に合意エンジンへ渡す',
    implementation: 'parseDrawing の結果、active block、drawing、effectiveDate を app-api の preview-request へ送る',
  },
  {
    phase: '帳票生成前',
    target: 'server/reportApi.ts',
    purpose: '見積書生成直前にリスクと blocking question を再計算する',
    implementation: 'generateReportBundle の直前で consensus を呼び、reviewIssues と executableNextActions を束ねる',
  },
  {
    phase: '単価根拠監査',
    target: 'server/masterStore.ts',
    purpose: '採用マスタの有効日と alias 正規化結果を合意エンジンに渡す',
    implementation: 'relevantMasters に sourceName, sourceVersion, effectiveFrom, effectiveTo を含める',
  },
  {
    phase: '公開UI',
    target: 'client/src/pages/ConsensusBlueprintPage.tsx',
    purpose: '設計思想、prompt、schema、統合ポイントをサイト内で確認できるようにする',
    implementation: 'GET blueprint と POST preview-request の結果をそのまま表示する',
  },
];

const BLOCK_MASTER_TYPES: Record<EstimateBlock['blockType'], MasterType[]> = {
  secondary_product: ['secondary_product', 'machine', 'dump_truck', 'crushed_stone', 'concrete', 'pump_truck', 'labor', 'misc'],
  retaining_wall: ['secondary_product', 'machine', 'dump_truck', 'crushed_stone', 'concrete', 'pump_truck', 'labor', 'misc'],
  pavement: ['road', 'machine', 'dump_truck', 'crushed_stone', 'concrete', 'labor', 'misc'],
  demolition: ['road', 'machine', 'dump_truck', 'cutter', 'labor', 'misc'],
};

export const CONSTRUCTION_CONSENSUS_BLUEPRINT: ConstructionConsensusBlueprint = {
  title: '建設現場合意エンジン',
  rationale: '積算、施工、地質、仮設、図面、単価、監査の観点を synthetic consensus として統合し、未確定は停止、確定可能な部分だけを構造化出力する。',
  expertPanel: CONSTRUCTION_EXPERT_PANEL,
  knowledgePacks: CONSTRUCTION_KNOWLEDGE_PACKS,
  quantityExtractionProtocol: CONSTRUCTION_QUANTITY_EXTRACTION_PROTOCOL,
  nonNegotiables: CONSTRUCTION_NON_NEGOTIABLES,
  finalPosition: CONSTRUCTION_FINAL_POSITION,
  systemPrompt: CONSTRUCTION_CONSENSUS_SYSTEM_PROMPT,
  outputSchema: CONSTRUCTION_CONSENSUS_OUTPUT_SCHEMA,
  integrationPoints: CONSTRUCTION_INTEGRATION_POINTS,
  defaultSiteConditions: DEFAULT_SITE_CONDITIONS,
};

function mergeSiteConditions(siteConditions?: Partial<ConstructionSiteConditions>): ConstructionSiteConditions {
  return {
    ...DEFAULT_SITE_CONDITIONS,
    ...siteConditions,
    buriedUtilities: Array.isArray(siteConditions?.buriedUtilities) ? siteConditions!.buriedUtilities : DEFAULT_SITE_CONDITIONS.buriedUtilities,
    nearbyStructures: Array.isArray(siteConditions?.nearbyStructures) ? siteConditions!.nearbyStructures : DEFAULT_SITE_CONDITIONS.nearbyStructures,
    environmentalRestrictions: Array.isArray(siteConditions?.environmentalRestrictions) ? siteConditions!.environmentalRestrictions : DEFAULT_SITE_CONDITIONS.environmentalRestrictions,
    notes: Array.isArray(siteConditions?.notes) ? siteConditions!.notes : DEFAULT_SITE_CONDITIONS.notes,
  };
}

function pickRelevantMasters(block: EstimateBlock, masters: PriceMasterItem[]): ConstructionConsensusContextSnapshot['relevantMasters'] {
  const selectedTextValues = [
    block.secondaryProduct,
    block.machine,
    block.dumpTruck,
    block.crushedStone,
    block.concrete,
    block.pumpTruck,
  ].filter(Boolean);

  const allowedMasterTypes = new Set(BLOCK_MASTER_TYPES[block.blockType]);
  const prioritized = masters.filter((item) => (
    allowedMasterTypes.has(item.masterType)
    && (
      selectedTextValues.includes(item.name)
      || item.aliases.some((alias) => selectedTextValues.includes(alias))
    )
  ));

  const fallback = masters.filter((item) => allowedMasterTypes.has(item.masterType)).slice(0, 20);
  const chosen = prioritized.length > 0 ? prioritized : fallback;

  return chosen.slice(0, 30).map((item) => ({
    id: item.id,
    masterType: item.masterType,
    code: item.code,
    name: item.name,
    aliases: item.aliases,
    unitPrice: item.unitPrice,
    unit: item.unit,
    effectiveFrom: item.effectiveFrom,
    effectiveTo: item.effectiveTo,
    sourceName: item.sourceName,
    sourceVersion: item.sourceVersion,
    sourcePage: item.sourcePage,
  }));
}

function selectKnowledgePacks(block: EstimateBlock, drawing: Drawing | null): ConstructionKnowledgePackSelection[] {
  const workTypeCandidates = drawing?.workTypeCandidates ?? [];
  const strongestCandidate = workTypeCandidates[0]?.blockType ?? null;

  return CONSTRUCTION_KNOWLEDGE_PACKS.map((pack) => {
    const matchesBlockType = pack.blockTypes.includes('all') || pack.blockTypes.includes(block.blockType);
    const isBuildingWatchPack = pack.id === 'apartment-estimate-input';
    const buildingSignal = strongestCandidate && !['secondary_product', 'retaining_wall', 'pavement', 'demolition'].includes(strongestCandidate);

    if (pack.outputMode === 'future_scope') {
      return {
        knowledgePackId: pack.id,
        name: pack.name,
        status: matchesBlockType ? 'future_scope' : 'watch',
        reason: matchesBlockType
          ? '現行アプリの数量計算対象外だが、図面を読み違えないため future scope として隔離する'
          : '現工種には直接適用しないが、将来対応や誤判定検出の監視として残す',
        quantityTargets: pack.quantityTargets,
      };
    }

    if (matchesBlockType) {
      return {
        knowledgePackId: pack.id,
        name: pack.name,
        status: 'active',
        reason: `${block.blockType} の数量拾い対象に一致するため有効化する`,
        quantityTargets: pack.quantityTargets,
      };
    }

    if (isBuildingWatchPack || buildingSignal) {
      return {
        knowledgePackId: pack.id,
        name: pack.name,
        status: 'watch',
        reason: '現工種への直接適用はしないが、図面種別の誤判定や混在を監視するため保持する',
        quantityTargets: pack.quantityTargets,
      };
    }

    return {
      knowledgePackId: pack.id,
      name: pack.name,
      status: 'watch',
      reason: '現工種には直接効かないが、横断レビュー用の監視レンズとして残す',
      quantityTargets: pack.quantityTargets,
    };
  });
}

export function buildConstructionConsensusContext(input: ConstructionConsensusPreviewInput): ConstructionConsensusContextSnapshot {
  const siteConditions = mergeSiteConditions(input.siteConditions);
  const drawing = input.drawing
    ? {
        id: input.drawing.id,
        name: input.drawing.name,
        fileName: input.drawing.fileName,
        drawingNo: input.drawing.drawingNo,
        drawingTitle: input.drawing.drawingTitle,
        revision: input.drawing.revision,
        status: input.drawing.status,
        pageCount: input.drawing.pageCount,
        ocrItemCount: input.drawing.ocrItems.length,
        aiCandidateCount: input.drawing.aiCandidates.length,
        topWorkTypeCandidates: input.drawing.workTypeCandidates.slice(0, 3),
      }
    : null;

  return {
    effectiveDate: input.effectiveDate,
    project: {
      id: input.project.id,
      name: input.project.name,
      clientName: input.project.clientName,
      siteName: input.project.siteName,
      status: input.project.status,
    },
    block: input.block,
    drawing,
    reportBundle: input.reportBundle,
    siteConditions,
    relevantMasters: pickRelevantMasters(input.block, input.masters),
    quantityExtractionProtocol: CONSTRUCTION_QUANTITY_EXTRACTION_PROTOCOL,
    selectedKnowledgePacks: selectKnowledgePacks(input.block, input.drawing ?? null),
  };
}

export function buildConstructionConsensusUserInput(snapshot: ConstructionConsensusContextSnapshot): string {
  return [
    '以下は建設見積強化の入力データである。',
    '推測ではなく、根拠と停止条件を優先して structured output を返すこと。',
    'selectedKnowledgePacks を全件処理し、quantityReviewMatrix に各 field の判定痕跡を必ず残すこと。',
    '',
    '入力JSON:',
    JSON.stringify(snapshot, null, 2),
  ].join('\n');
}

export function buildConstructionConsensusOpenAiRequest(input: ConstructionConsensusPreviewInput): Record<string, unknown> {
  const snapshot = buildConstructionConsensusContext(input);

  return {
    model: 'gpt-4.1-mini',
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: CONSTRUCTION_CONSENSUS_SYSTEM_PROMPT,
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: buildConstructionConsensusUserInput(snapshot),
          },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'construction_consensus_result',
        schema: CONSTRUCTION_CONSENSUS_OUTPUT_SCHEMA,
        strict: true,
      },
    },
    metadata: {
      workflow: 'construction_consensus_blueprint',
      effectiveDate: input.effectiveDate,
      blockType: input.block.blockType,
      knowledgePackCount: snapshot.selectedKnowledgePacks.length,
    },
  };
}
