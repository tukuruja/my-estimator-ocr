import type {
  BlockType,
  Drawing,
  EstimateBlock,
  GeneratedReportBundle,
  Project,
  ReviewIssue,
} from '../client/src/lib/types';

export interface EstimationLogicExpertRole {
  id: string;
  title: string;
  discipline: string;
  responsibility: string;
  vetoCondition: string;
}

export interface EstimationSkillPack {
  id: string;
  name: string;
  category: 'quantity' | 'execution' | 'governance' | 'structure';
  activationRule: string;
  contribution: string;
  affects: string[];
}

export interface EstimationLogicPhase {
  id: string;
  title: string;
  objective: string;
  operatorAction: string;
  aiResponsibility: string;
  stopCondition: string;
}

export interface EstimationLogicBlueprint {
  title: string;
  rationale: string;
  promise: string[];
  nonNegotiables: string[];
  expertPanel: EstimationLogicExpertRole[];
  skillPacks: EstimationSkillPack[];
  phases: EstimationLogicPhase[];
  operatorChecklist: string[];
  stopRules: string[];
  systemPrompt: string;
  outputSchema: Record<string, unknown>;
}

export interface EstimationLogicContextSnapshot {
  effectiveDate: string;
  project: {
    id: string;
    name: string;
    clientName: string;
    siteName: string;
    status: Project['status'];
  };
  block: {
    id: string;
    name: string;
    blockType: BlockType;
    drawingId: string | null;
    requiresReviewFields: string[];
    appliedCandidateIds: string[];
  };
  drawing: {
    id: string;
    name: string;
    drawingTitle: string;
    drawingNo: string;
    status: Drawing['status'];
    ocrItemCount: number;
    aiCandidateCount: number;
    reviewQueueCount: number;
    sheetTypeName: string | null;
    discipline: string | null;
  } | null;
  reportSummary: GeneratedReportBundle['summary'];
  reportIssueSummary: {
    critical: number;
    warning: number;
    info: number;
  };
  missingQuantityFields: string[];
  selectedSkillPacks: EstimationSkillPack[];
}

export interface EstimationLogicExecution {
  decision: 'stop' | 'review_required' | 'ready_for_estimate';
  stage: 'waiting_for_drawing' | 'ocr_review' | 'quantity_review' | 'ready';
  summary: string;
  operatorMessage: string;
  stopReasons: string[];
  nextActions: string[];
  coachingChecklist: string[];
  quantityGuardrails: string[];
  activatedSkillPacks: Array<{
    id: string;
    name: string;
    reason: string;
  }>;
}

export interface EstimationLogicPreviewInput {
  project: Project;
  block: EstimateBlock;
  drawing: Drawing | null;
  reportBundle: GeneratedReportBundle;
  effectiveDate: string;
}

export interface EstimationLogicPreviewResponse {
  blueprint: EstimationLogicBlueprint;
  context: EstimationLogicContextSnapshot;
  execution: EstimationLogicExecution;
  openAiResponsesRequest: Record<string, unknown>;
}

export interface EstimationLogicAuditRecord {
  id: string;
  workspaceId: string;
  createdAt: string;
  mode: 'openai' | 'fallback';
  model: string | null;
  projectId: string;
  blockId: string;
  drawingId: string | null;
  responseId: string | null;
  refusal: string | null;
  warnings: string[];
}

export interface EstimationLogicRunResponse extends EstimationLogicPreviewResponse {
  audit: EstimationLogicAuditRecord;
}

const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  secondary_product: '二次製品工',
  retaining_wall: '擁壁工',
  pavement: '舗装工',
  demolition: '撤去工',
  count_structure: '街渠桝・接続桝工',
  material_takeoff: '材料数量監査',
  exterior_work: '外構工',
  formwork: '型枠工',
  concrete_slab: 'コンクリート床版工',
  fence: 'フェンス工',
  block_installation: 'ブロック積工',
  formwork_block: '型枠ブロック工',
  structure_installation: '構造物設置工',
  self_funded_work: '自主施工工',
  cut_fill: '切土・盛土工',
};

const REQUIRED_FIELDS_BY_BLOCK_TYPE: Record<BlockType, Array<keyof EstimateBlock>> = {
  secondary_product: ['secondaryProduct', 'distance', 'productWidth', 'productHeight', 'productLength', 'stages'],
  retaining_wall: ['distance', 'currentHeight', 'plannedHeight', 'productWidth'],
  pavement: ['distance', 'pavementWidth', 'baseThickness'],
  demolition: ['distance', 'currentHeight', 'plannedHeight'],
  count_structure: ['secondaryProduct', 'countQuantity', 'countUnit'],
  material_takeoff: ['secondaryProduct', 'materialTakeoffMode'],
  exterior_work: ['distance'],
  formwork: ['distance', 'formworkArea'],
  concrete_slab: ['slabArea', 'slabThickness'],
  fence: ['fenceLength', 'fenceHeight'],
  block_installation: ['blockArea', 'blockHeight'],
  formwork_block: ['distance', 'formworkBlockArea'],
  structure_installation: ['distance'],
  self_funded_work: ['distance'],
  cut_fill: ['distance'],
};

function isEmptyValue(value: unknown): boolean {
  if (typeof value === 'number') return value <= 0;
  if (typeof value === 'string') return value.trim() === '' || value === '選んでください';
  return value == null;
}

function toFieldLabel(fieldName: keyof EstimateBlock): string {
  const labels: Partial<Record<keyof EstimateBlock, string>> = {
    secondaryProduct: '製品名',
    distance: '施工延長',
    currentHeight: '現況高',
    plannedHeight: '計画高',
    productWidth: '製品幅',
    productHeight: '製品高さ',
    productLength: '製品長さ',
    stages: '据付段数',
    pavementWidth: '舗装幅',
    baseThickness: '基層厚',
    countQuantity: 'count数量',
    countUnit: 'count単位',
    materialTakeoffMode: '監査単位',
    materialArea: '基準面積',
    materialThickness: '層厚・改良厚',
    materialDensity: '換算密度',
    materialDirectQuantity: '直接数量',
  };
  return labels[fieldName] ?? fieldName;
}

function summarizeReportIssues(reviewIssues: ReviewIssue[]) {
  return reviewIssues.reduce(
    (acc, issue) => {
      acc[issue.severity] += 1;
      return acc;
    },
    { critical: 0, warning: 0, info: 0 },
  );
}

function getMissingQuantityFields(block: EstimateBlock): string[] {
  return REQUIRED_FIELDS_BY_BLOCK_TYPE[block.blockType]
    .filter((fieldName) => isEmptyValue(block[fieldName]))
    .map(toFieldLabel);
}

export const ESTIMATION_LOGIC_EXPERT_PANEL: EstimationLogicExpertRole[] = [
  {
    id: 'jp-estimator',
    title: '公共土木積算責任者',
    discipline: '積算',
    responsibility: '数量、明細、単価根拠の整合を確定する',
    vetoCondition: '数量根拠か単価根拠が欠けた明細を確定しない',
  },
  {
    id: 'jp-site-manager',
    title: '現場代理人',
    discipline: '施工管理',
    responsibility: '施工順序、搬入、仮設、第三者影響を審査する',
    vetoCondition: '施工動線とヤード条件が不明なまま施工方法を断定しない',
  },
  {
    id: 'jp-cad-reader',
    title: '図面読解責任者',
    discipline: '図面整合',
    responsibility: '表題欄、縮尺、図種、凡例、図面間整合を審査する',
    vetoCondition: '図種不明または尺度不明のまま数量確定しない',
  },
  {
    id: 'jp-quality-safety',
    title: '品質安全統括',
    discipline: '品質・安全',
    responsibility: '仕様、規格、安全条件の見落としを止める',
    vetoCondition: '規格未確認の材料や安全条件を自動確定しない',
  },
  {
    id: 'jp-ai-auditor',
    title: 'AI根拠監査',
    discipline: '監査',
    responsibility: 'OCR根拠、bbox、confidence、review queue を監査する',
    vetoCondition: '根拠bboxのない候補や低信頼候補を一括反映しない',
  },
];

export const ESTIMATION_LOGIC_SKILL_PACKS: EstimationSkillPack[] = [
  { id: 'civil-engineering-field', name: 'Civil Engineering Field', category: 'execution', activationRule: '全土木案件で常時有効', contribution: '施工性と現場判断で過小見積を止める', affects: ['施工性', '土工条件', '搬入条件'] },
  { id: 'construction-estimation-full-pack', name: '建設積算フルパック', category: 'quantity', activationRule: '見積ブロック生成時に常時有効', contribution: '数量整理、概算計算、根拠表整理を統合する', affects: ['数量', '明細', '単価根拠'] },
  { id: 'construction-site-integrated', name: '建設現場統合', category: 'execution', activationRule: '複数工種や施工条件の競合時に有効', contribution: '現場判断と見積入力を一体化する', affects: ['工種調整', '工程', '拾い漏れ防止'] },
  { id: 'construction-supreme-management', name: 'Construction Supreme Management', category: 'governance', activationRule: '最終判定で常時有効', contribution: '確定可否を止める最終ガードレールになる', affects: ['最終承認', '停止条件'] },
  { id: 'exterior-works-pro', name: 'Exterior Works Pro', category: 'quantity', activationRule: '外構図、舗装、排水、境界関連で有効', contribution: '外構仕上げと取り合い数量を補正する', affects: ['外構', '排水', '取り合い'] },
  { id: 'land-development-expert', name: 'Land Development Expert', category: 'quantity', activationRule: '造成、排水、法面、土工で有効', contribution: '造成土工と排水計画の数量補正をかける', affects: ['土工', '排水', '法面'] },
  { id: 'mansion-estimate-input', name: 'マンション工事 見積入力', category: 'structure', activationRule: '建築系明細化ルールが必要な場合に有効', contribution: 'WBS的な入力整理を行い、初心者の入力漏れを減らす', affects: ['入力順序', '見積項目構造'] },
  { id: 'openai-docs', name: 'OpenAI Docs', category: 'governance', activationRule: 'API 出力を厳密 schema に固定する時に有効', contribution: 'prompt と structured output の形式崩れを防ぐ', affects: ['出力仕様', 'schema'] },
  { id: 'pavement-master', name: 'Pavement Master', category: 'quantity', activationRule: '舗装工で常時有効', contribution: '舗装厚、温度、締固め、目地条件を guardrail 化する', affects: ['舗装厚', '層構成', '施工条件'] },
  { id: 'rebar-craftsman', name: 'Rebar Craftsman', category: 'quantity', activationRule: '鉄筋・RC詳細が図面に出る場合に有効', contribution: '配筋関連を future scope として誤集計から隔離する', affects: ['鉄筋', 'RC詳細'] },
  { id: 'retaining-wall-specialist', name: 'Retaining Wall Specialist', category: 'quantity', activationRule: '擁壁工で常時有効', contribution: '擁壁高、延長、基礎条件、背面条件を点検する', affects: ['擁壁高', '延長', '基礎'] },
  { id: 'roadwork-mastery', name: 'Roadwork Mastery', category: 'quantity', activationRule: '道路・舗装・交通影響案件で有効', contribution: '道路施工順序と交通影響を guardrail 化する', affects: ['道路工', '交通規制', '工程'] },
  { id: 'security-best-practices', name: 'Security Best Practices', category: 'governance', activationRule: '公開API・保存機能が動く環境で常時有効', contribution: '監査証跡と保存処理の安全側制御を維持する', affects: ['監査', '保存', 'API運用'] },
  { id: 'site-supervision-master', name: 'Site Supervision Master', category: 'execution', activationRule: '現場条件の確認が必要な案件で常時有効', contribution: '現場確認事項をレビューキューへ送る', affects: ['現場確認', '是正'] },
  { id: 'fence-professional', name: 'Fence Professional', category: 'quantity', activationRule: '柵渠、フェンス、境界構造で有効', contribution: '境界延長と基礎数量の見落としを防ぐ', affects: ['境界工', '基礎', '延長'] },
  { id: 'foreman-expertise', name: 'Foreman Expertise', category: 'execution', activationRule: '初心者オペレータ支援時に常時有効', contribution: '現場監督目線の作業順をそのまま指示化する', affects: ['教育', '作業順序'] },
  { id: 'formwork-precision', name: 'Formwork Precision', category: 'quantity', activationRule: '型枠・コンクリート精度が支配的な案件で有効', contribution: '型枠由来の拾い漏れを future scope として管理する', affects: ['型枠', '打設精度'] },
];

function selectSkillPacks(block: EstimateBlock, drawing: Drawing | null): EstimationSkillPack[] {
  return ESTIMATION_LOGIC_SKILL_PACKS.filter((pack) => {
    if (pack.id === 'pavement-master') return block.blockType === 'pavement';
    if (pack.id === 'retaining-wall-specialist') return block.blockType === 'retaining_wall';
    if (pack.id === 'fence-professional') return drawing?.sheetClassification?.sheetTypeName?.includes('柵') ?? false;
    if (pack.id === 'rebar-craftsman') {
      return drawing?.titleBlockMeta?.discipline === 'structural' || drawing?.reviewQueue.some((item) => item.title.includes('配筋')) || false;
    }
    if (pack.id === 'formwork-precision') return block.blockType === 'retaining_wall' || block.concrete.trim() !== '';
    if (pack.id === 'land-development-expert') return block.blockType !== 'demolition';
    return true;
  });
}

function getStage(context: EstimationLogicContextSnapshot, drawing: Drawing | null): EstimationLogicExecution['stage'] {
  if (!drawing) return 'waiting_for_drawing';
  if (drawing.ocrItems.length === 0 && drawing.aiCandidates.length === 0) return 'ocr_review';
  if (context.missingQuantityFields.length > 0 || context.reportIssueSummary.critical > 0 || drawing.reviewQueue.length > 0) return 'quantity_review';
  return 'ready';
}

function getDecision(context: EstimationLogicContextSnapshot, drawing: Drawing | null): EstimationLogicExecution['decision'] {
  if (!drawing) return 'stop';
  if (context.reportIssueSummary.critical > 0 || context.missingQuantityFields.length > 0) return 'stop';
  if (drawing.reviewQueue.length > 0 || context.reportIssueSummary.warning > 0 || context.block.requiresReviewFields.length > 0) return 'review_required';
  return 'ready_for_estimate';
}

function buildExecution(context: EstimationLogicContextSnapshot, drawing: Drawing | null): EstimationLogicExecution {
  const stage = getStage(context, drawing);
  const decision = getDecision(context, drawing);
  const stopReasons: string[] = [];

  if (!drawing) {
    stopReasons.push('図面が未登録のため、OCR と数量根拠の生成を開始できません。');
  }
  if (context.missingQuantityFields.length > 0) {
    stopReasons.push(`数量確定に必要な入力が不足しています: ${context.missingQuantityFields.join(' / ')}`);
  }
  if (context.reportIssueSummary.critical > 0) {
    stopReasons.push(`帳票レビューに critical が ${context.reportIssueSummary.critical} 件あります。`);
  }
  if (drawing && drawing.reviewQueue.length > 0) {
    stopReasons.push(`OCR review queue が ${drawing.reviewQueue.length} 件あり、候補根拠の確認が必要です。`);
  }

  const stageLabelMap: Record<EstimationLogicExecution['stage'], string> = {
    waiting_for_drawing: '図面待ち',
    ocr_review: 'OCR確認',
    quantity_review: '数量確認',
    ready: '見積準備完了',
  };

  const summary = `${BLOCK_TYPE_LABELS[context.block.blockType]}の現在段階は「${stageLabelMap[stage]}」です。判定は ${decision} です。`;
  const nextActions = [
    'STEP 1 で工種を選択する',
    'STEP 2 で図面をアップロードして OCR を完了させる',
    'review queue と AI候補を確認し、根拠が薄い候補は反映しない',
    '不足している数量入力を埋める',
    'STEP 3 で見積書・単価根拠表・要確認一覧を生成する',
  ];

  const coachingChecklist = [
    '図面が無ければ推測で見積しない',
    '表題欄の図面番号・図名・改訂を先に確認する',
    '縮尺、単位、断面か平面かを先に確定する',
    'OCR候補は bbox と sourceText を見てから反映する',
    'review queue が残っている間は確定に進まない',
    '単価は根拠資料名と有効日が一致するものだけを採用する',
  ];

  const quantityGuardrails = [
    '未確認の地質・地下水・搬入条件は数量や単価に直結させない',
    '図面だけで確定できない条件は要確認一覧に送る',
    'OCR の低信頼候補、競合候補、凡例未解決語は自動反映しない',
    'future scope の技能パック領域は誤って数量化しない',
  ];

  return {
    decision,
    stage,
    summary,
    operatorMessage: decision === 'ready_for_estimate'
      ? 'この案件は見積入力を進められます。根拠行を確認したうえで帳票生成に進んでください。'
      : 'この案件はまだ自動確定に進めません。画面の不足項目と review queue を先に潰してください。',
    stopReasons,
    nextActions,
    coachingChecklist,
    quantityGuardrails,
    activatedSkillPacks: context.selectedSkillPacks.map((pack) => ({
      id: pack.id,
      name: pack.name,
      reason: pack.contribution,
    })),
  };
}

export const ESTIMATION_LOGIC_BLUEPRINT: EstimationLogicBlueprint = {
  title: '見積支援ロジック確立プロトコル',
  rationale: '頼りない従業員でも、図面根拠と停止条件を守れば一定品質の見積へ到達できるように、施工・積算・図面読解・AI監査を一つの手順に固定化する。',
  promise: [
    '図面を読めない担当でも、何を確認して何で止まるかが分かる',
    'AI候補は根拠付きでしか反映しない',
    '不足情報を埋めずに停止するため、暴走した概算を防げる',
  ],
  nonNegotiables: [
    '図面が無い状態で見積を確定しない',
    'root cause が review queue に残る間は自動確定しない',
    '単価根拠の有効日と資料名が無い行を確定しない',
    '現場条件の未確認事項は要確認一覧へ送る',
  ],
  expertPanel: ESTIMATION_LOGIC_EXPERT_PANEL,
  skillPacks: ESTIMATION_LOGIC_SKILL_PACKS,
  phases: [
    {
      id: 'phase-1',
      title: '工種選択',
      objective: '見積対象工種を一つに固定する',
      operatorAction: 'STEP 1 で工種を選ぶ',
      aiResponsibility: '必要入力項目と技能パックの初期セットを切り替える',
      stopCondition: '工種未選択',
    },
    {
      id: 'phase-2',
      title: '図面取込と OCR',
      objective: '図面を OCR と review queue 付きで構造化する',
      operatorAction: 'STEP 2 で PDF を投入し、OCR結果を確認する',
      aiResponsibility: 'media router, titleblock, sheet classification, legend resolver を実行する',
      stopCondition: '図面未登録 / OCR未完了',
    },
    {
      id: 'phase-3',
      title: '数量仮決め',
      objective: 'AI候補と入力値を揃え、不足項目を明示する',
      operatorAction: 'bbox と sourceText を見て候補を採否する',
      aiResponsibility: '不足項目、競合候補、要確認項目を可視化する',
      stopCondition: '必須数量が未入力 / critical issue あり',
    },
    {
      id: 'phase-4',
      title: '帳票化',
      objective: '見積書、単価根拠表、要確認一覧を生成する',
      operatorAction: 'STEP 3 で帳票生成を実行する',
      aiResponsibility: '根拠不足の明細は review_required として出力する',
      stopCondition: '根拠不足明細が確定扱いになっている',
    },
  ],
  operatorChecklist: [
    '工種を選ぶ',
    '図面を入れる',
    'OCR候補の根拠を確認する',
    '不足数量を埋める',
    '帳票を出す',
    '要確認一覧を残したまま提出しない',
  ],
  stopRules: [
    '図面未登録なら stop',
    'OCR根拠なし候補は stop',
    '必須数量欠落なら stop',
    'warning は supervisor review、critical は stop',
  ],
  systemPrompt: [
    'Σ-ESTIMATION-LOGIC-JP',
    'role: SyntheticConsensusEstimator',
    'mission: 図面根拠、施工条件、単価根拠が揃った範囲だけで見積を前進させ、初心者オペレータに次の一手を指示する。',
    'absolute_rules:',
    '- 推測で埋めない',
    '- sourceText, sourcePage, sourceBox が無い候補を反映しない',
    '- stop / review_required / ready_for_estimate の 3 値で必ず判定する',
    '- review queue と帳票レビューの両方を参照する',
    '- 技能パックを全件評価し、発火理由を出力する',
    'required_output:',
    '- decision',
    '- stage',
    '- summary',
    '- operatorMessage',
    '- stopReasons',
    '- nextActions',
    '- coachingChecklist',
    '- quantityGuardrails',
    '- activatedSkillPacks',
  ].join('\n'),
  outputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['decision', 'stage', 'summary', 'operatorMessage', 'stopReasons', 'nextActions', 'coachingChecklist', 'quantityGuardrails', 'activatedSkillPacks'],
    properties: {
      decision: { type: 'string', enum: ['stop', 'review_required', 'ready_for_estimate'] },
      stage: { type: 'string', enum: ['waiting_for_drawing', 'ocr_review', 'quantity_review', 'ready'] },
      summary: { type: 'string' },
      operatorMessage: { type: 'string' },
      stopReasons: { type: 'array', items: { type: 'string' } },
      nextActions: { type: 'array', items: { type: 'string' } },
      coachingChecklist: { type: 'array', items: { type: 'string' } },
      quantityGuardrails: { type: 'array', items: { type: 'string' } },
      activatedSkillPacks: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'name', 'reason'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            reason: { type: 'string' },
          },
        },
      },
    },
  },
};

export function buildEstimationLogicContext(input: EstimationLogicPreviewInput): EstimationLogicContextSnapshot {
  const selectedSkillPacks = selectSkillPacks(input.block, input.drawing);
  const reportIssueSummary = summarizeReportIssues(input.reportBundle.reviewIssues);
  const missingQuantityFields = getMissingQuantityFields(input.block);

  return {
    effectiveDate: input.effectiveDate,
    project: {
      id: input.project.id,
      name: input.project.name,
      clientName: input.project.clientName,
      siteName: input.project.siteName,
      status: input.project.status,
    },
    block: {
      id: input.block.id,
      name: input.block.name,
      blockType: input.block.blockType,
      drawingId: input.block.drawingId,
      requiresReviewFields: input.block.requiresReviewFields,
      appliedCandidateIds: input.block.appliedCandidateIds,
    },
    drawing: input.drawing ? {
      id: input.drawing.id,
      name: input.drawing.name,
      drawingTitle: input.drawing.drawingTitle,
      drawingNo: input.drawing.drawingNo,
      status: input.drawing.status,
      ocrItemCount: input.drawing.ocrItems.length,
      aiCandidateCount: input.drawing.aiCandidates.length,
      reviewQueueCount: input.drawing.reviewQueue.length,
      sheetTypeName: input.drawing.sheetClassification?.sheetTypeName ?? null,
      discipline: input.drawing.titleBlockMeta?.discipline ?? null,
    } : null,
    reportSummary: input.reportBundle.summary,
    reportIssueSummary,
    missingQuantityFields,
    selectedSkillPacks,
  };
}

export function buildEstimationLogicOpenAiRequest(input: EstimationLogicPreviewInput): Record<string, unknown> {
  const context = buildEstimationLogicContext(input);
  return {
    model: 'gpt-4.1-mini',
    text: {
      format: {
        type: 'json_schema',
        name: 'estimation_logic_execution',
        strict: true,
        schema: ESTIMATION_LOGIC_BLUEPRINT.outputSchema,
      },
    },
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: ESTIMATION_LOGIC_BLUEPRINT.systemPrompt,
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: JSON.stringify(context, null, 2),
          },
        ],
      },
    ],
  };
}

export function buildEstimationLogicPreview(input: EstimationLogicPreviewInput): EstimationLogicPreviewResponse {
  const context = buildEstimationLogicContext(input);
  const execution = buildExecution(context, input.drawing);

  return {
    blueprint: ESTIMATION_LOGIC_BLUEPRINT,
    context,
    execution,
    openAiResponsesRequest: buildEstimationLogicOpenAiRequest(input),
  };
}
