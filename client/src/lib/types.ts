export type BoundingBox = [number, number, number, number, number, number, number, number];

export type BlockType = 'secondary_product' | 'retaining_wall' | 'pavement' | 'demolition';
export type ProjectStatus = 'draft' | 'active' | 'approved' | 'archived';
export type DrawingStatus = 'idle' | 'uploaded' | 'processing' | 'ready' | 'error';
export type DrawingFileType = 'pdf' | 'image';
export type CandidateValueType = 'string' | 'number';
export type MasterType =
  | 'secondary_product'
  | 'machine'
  | 'dump_truck'
  | 'crushed_stone'
  | 'concrete'
  | 'pump_truck'
  | 'road'
  | 'cutter'
  | 'labor'
  | 'misc';
export type ReportSeverity = 'info' | 'warning' | 'critical';
export type MetricValueKind = 'number' | 'currency';

export interface OcrItem {
  id: string;
  pageNo: number;
  text: string;
  score: number;
  box: BoundingBox;
}

export interface DrawingPage {
  id: string;
  pageNo: number;
  imageUrl: string;
  width: number;
  height: number;
  physicalWidthMm?: number | null;
  physicalHeightMm?: number | null;
}

export interface DrawingMeasurementPoint {
  x: number;
  y: number;
}

export type DrawingMeasurementMode = 'idle' | 'distance' | 'polygon';

export interface DrawingDistanceMeasurement {
  id: string;
  measurementType: 'distance';
  pageNo: number;
  name: string;
  points: [DrawingMeasurementPoint, DrawingMeasurementPoint];
  pixelLength: number;
  realLength?: number | null;
  unit: 'px' | 'm';
  createdAt: string;
}

export interface DrawingPolygonMeasurement {
  id: string;
  measurementType: 'polygon';
  pageNo: number;
  name: string;
  points: DrawingMeasurementPoint[];
  pixelArea: number;
  realArea?: number | null;
  unit: 'px2' | 'm2';
  createdAt: string;
}

export type DrawingManualMeasurement = DrawingDistanceMeasurement | DrawingPolygonMeasurement;

export interface AICandidate {
  id: string;
  fieldName: string;
  label: string;
  valueType: CandidateValueType;
  valueText?: string;
  valueNumber?: number;
  confidence: number;
  sourceText: string;
  sourcePage: number;
  sourceBox: BoundingBox;
  reason: string;
  requiresReview: boolean;
}

export interface WorkTypeCandidate {
  id: string;
  blockType: BlockType;
  label: string;
  confidence: number;
  reason: string;
  sourceTexts: string[];
  requiresReview: boolean;
}

export type OcrReviewQueueSeverity = 'info' | 'warning' | 'critical';

export interface OcrReviewQueueItem {
  id: string;
  queue: string;
  severity: OcrReviewQueueSeverity;
  title: string;
  detail: string;
  sourceText?: string;
  sourcePage?: number;
  fieldName?: string;
}

export interface DrawingManualResolution {
  id: string;
  resolutionType: 'level_conflict' | 'plan_section_link';
  resolutionKey: string;
  title: string;
  selectedText: string;
  selectedPageNo: number;
  selectedBox: BoundingBox;
  appliedFieldName?: string;
  appliedValue?: string | number | null;
  note?: string;
  resolvedAt: string;
}

export interface OcrLearningEntry {
  id: string;
  projectId?: string;
  learningType: 'plan_section_link';
  callout: string;
  normalizedCallout: string;
  sourceRole: string;
  targetRole: string;
  sourceText: string;
  targetText: string;
  sourcePageNo: number;
  targetPageNo: number;
  drawingNo?: string;
  drawingTitle?: string;
  adoptionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DrawingMediaRoute {
  sourceMediaType: 'cad' | 'ifc' | 'vector_pdf' | 'raster_pdf' | 'image' | 'unknown';
  preferredPipeline: 'direct_text' | 'vector_parse' | 'ocr_cv' | 'manual_review';
  pageRotationDeg: 0 | 90 | 180 | 270;
  sheetSplitRequired: boolean;
  preprocessFlags: string[];
  confidence: number;
}

export interface DrawingTitleBlockMeta {
  drawingNo: string | null;
  drawingTitle: string | null;
  sheetScale: string | null;
  revision: string | null;
  projectName: string | null;
  buildingName: string | null;
  zoneName: string | null;
  discipline: 'common' | 'architectural' | 'structural' | 'electrical' | 'mechanical' | 'civil' | 'unknown';
  confidence: number;
}

export interface DrawingSheetClassification {
  sheetTypeId: string;
  sheetTypeName: string;
  discipline: string;
  classificationReasons: string[];
  confidence: number;
}

export interface DrawingResolvedUnits {
  lengthUnit: 'mm' | 'm' | 'unknown';
  elevationUnit: 'mm' | 'm' | 'unknown';
  sheetScaleRatio: number | null;
  viewDirection: 'top_down' | 'bottom_up' | 'elevation' | 'sectional' | 'profile' | 'cross_section' | 'unknown';
  readingOrder: 'left_to_right' | 'top_to_bottom' | 'custom';
}

export interface DrawingLegendResolution {
  legendDictionary: Array<{
    raw: string;
    canonical: string;
    domain: string;
  }>;
  normalizedTerms: Array<{
    raw: string;
    canonical: string;
    type: 'abbr' | 'material' | 'finish' | 'symbol';
  }>;
  unknownTerms: string[];
}

export interface DrawingOcrStructuredCandidate {
  pageNo: number;
  text: string;
  bbox: BoundingBox;
  confidence: number;
}

export interface DrawingOcrStructured {
  parsedTextBlocks: Array<DrawingOcrStructuredCandidate & {
    normalizedText: string;
  }>;
  numericCandidates: Array<DrawingOcrStructuredCandidate & {
    value: string;
  }>;
  unitCandidates: Array<DrawingOcrStructuredCandidate & {
    unit: string;
    matchedPattern: string;
  }>;
  levelCandidates: Array<DrawingOcrStructuredCandidate & {
    token: string;
    value: string | null;
  }>;
  dimensionCandidates: Array<DrawingOcrStructuredCandidate & {
    values: string[];
  }>;
  tableCandidates: DrawingOcrStructuredCandidate[];
  lowConfidenceCandidates: DrawingOcrStructuredCandidate[];
  ambiguousCandidates: Array<DrawingOcrStructuredCandidate & {
    watchGroup: string[];
  }>;
  pageRoles: Array<{
    pageNo: number;
    roles: Array<{
      role: string;
      keywords: string[];
      confidence: number;
    }>;
  }>;
  planSectionLinks: Array<{
    id: string;
    callout: string;
    sourcePageNo: number;
    sourceRole: string;
    sourceText: string;
    sourceBox: BoundingBox;
    targetPageNo: number;
    targetRole: string;
    targetText: string;
    targetBox: BoundingBox;
    confidence: number;
    reasons: string[];
  }>;
  learningMatches: Array<{
    callout: string;
    adoptionCount: number;
    matchedLinks: number;
  }>;
  unresolvedItems: Array<{
    target: string;
    reason: string;
    recommendedCheck: string;
  }>;
  skillSources: string[];
}

export interface DrawingCadStructuredPageAnalysis {
  pageNo: number;
  sourceMediaType: string;
  preferredPipeline: string;
  roles: string[];
  callouts: string[];
  dimensionCount: number;
  levelCount: number;
  physicalWidthMm?: number | null;
  physicalHeightMm?: number | null;
}

export interface DrawingCadStructuredClassification {
  pageNo: number;
  discipline: string;
  sheetTypeName: string;
  workTypeCandidates: Array<{
    blockType: BlockType;
    label: string;
    confidence: number;
  }>;
}

export interface DrawingCadStructuredEntity {
  id: string;
  pageNo: number;
  entityType: 'dimension' | 'level' | 'callout' | 'table' | 'ocr_note';
  sourceText: string;
  bbox: BoundingBox;
  confidence: number;
}

export interface DrawingCadStructuredObject {
  id: string;
  pageNo: number;
  objectType: 'legend_term' | 'normalized_term' | 'sheet_link' | 'business_document';
  label: string;
  canonical?: string | null;
  confidence: number;
}

export interface DrawingCadStructuredDimension {
  id: string;
  pageNo: number;
  label: string;
  sourceText: string;
  bbox: BoundingBox;
  values: string[];
  unit: string;
  status: 'confirmed' | 'estimated' | 'blocked';
  confidence: number;
}

export interface DrawingCadStructuredQuantity {
  fieldName: string;
  label: string;
  value?: string | number;
  confidence: number;
  sourceText: string;
  sourcePage: number;
  sourceBox: BoundingBox;
  requiresReview: boolean;
}

export interface DrawingCadStructuredCondition {
  id: string;
  severity: OcrReviewQueueSeverity;
  title: string;
  detail: string;
}

export interface DrawingCadStructuredOutput {
  documentSummary: {
    fileName: string;
    fileType: DrawingFileType;
    pageCount: number;
    drawingNo?: string | null;
    drawingTitle?: string | null;
    businessDocument: boolean;
  };
  pageAnalysis: DrawingCadStructuredPageAnalysis[];
  drawingClassification: DrawingCadStructuredClassification[];
  scaleAndUnits: {
    sheetScale?: string | null;
    sheetScaleRatio?: number | null;
    lengthUnit: string;
    elevationUnit: string;
    viewDirection: string;
  };
  cadEntities: DrawingCadStructuredEntity[];
  objects: DrawingCadStructuredObject[];
  dimensions: DrawingCadStructuredDimension[];
  quantities: DrawingCadStructuredQuantity[];
  constructionConditions: DrawingCadStructuredCondition[];
  warnings: string[];
  stopReasons: string[];
  confidenceReview: {
    reviewRequired: boolean;
    unresolvedCount: number;
    ambiguousCount: number;
    lowConfidenceCount: number;
  };
  missingInformation: string[];
  recommendedNextInputs: string[];
  humanSummary: string;
}

export interface PriceMasterItem {
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
  vendor: string;
  region: string;
  notes: string;
}

export interface EstimateReportRow {
  id: string;
  section: string;
  itemName: string;
  specification: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  remarks: string;
  sourceSummary: string;
}

export interface ChangeEstimateRow {
  id: string;
  zoneName: string;
  itemName: string;
  specification: string;
  quantity: number;
  unit: string;
  quantityShare: number;
  baseAmount: number;
  remobilizationCount: number;
  remobilizationAmount: number;
  temporaryRestorationRate: number;
  temporaryRestorationQuantity: number;
  temporaryRestorationAmount: number;
  coordinationAdjustmentRate: number;
  coordinationAdjustmentAmount: number;
  totalAmount: number;
  drawingPageRefs: number[];
  notePhotoUrls: string[];
  relatedTradeNames: string[];
  remarks: string;
  sourceSummary: string;
}

export interface UnitPriceEvidenceRow {
  id: string;
  estimateRowId: string;
  estimateItemName: string;
  masterType: MasterType | 'input' | 'derived';
  masterName: string;
  adoptedUnitPrice: number;
  unit: string;
  sourceName: string;
  sourceVersion: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  sourcePage: string | null;
  reason: string;
  requiresReview: boolean;
}

export interface ReviewIssue {
  id: string;
  severity: ReportSeverity;
  title: string;
  detail: string;
  fieldName?: string;
  sourcePage?: number;
}

export interface GeneratedReportBundle {
  estimateRows: EstimateReportRow[];
  changeEstimateRows: ChangeEstimateRow[];
  unitPriceEvidenceRows: UnitPriceEvidenceRow[];
  reviewIssues: ReviewIssue[];
  summary: {
    totalAmount: number;
    totalRows: number;
    changeEstimateRowCount: number;
    changeEstimateTotalAmount: number;
    requiresReviewCount: number;
  };
}

export interface Drawing {
  id: string;
  projectId: string;
  name: string;
  drawingNo: string;
  drawingTitle: string;
  revision: string;
  fileName: string;
  fileType: DrawingFileType;
  status: DrawingStatus;
  pageCount: number;
  pages: DrawingPage[];
  ocrItems: OcrItem[];
  aiCandidates: AICandidate[];
  workTypeCandidates: WorkTypeCandidate[];
  mediaRoute?: DrawingMediaRoute;
  titleBlockMeta?: DrawingTitleBlockMeta;
  sheetClassification?: DrawingSheetClassification;
  resolvedUnits?: DrawingResolvedUnits;
  legendResolution?: DrawingLegendResolution;
  ocrStructured?: DrawingOcrStructured;
  cadStructured?: DrawingCadStructuredOutput;
  reviewQueue: OcrReviewQueueItem[];
  manualResolutions: DrawingManualResolution[];
  manualMeasurements: DrawingManualMeasurement[];
  uploadedAt: string;
  lastParsedAt?: string;
  lastError?: string;
}

export interface Project {
  id: string;
  name: string;
  clientName: string;
  siteName: string;
  status: ProjectStatus;
  drawings: Drawing[];
  blocks: EstimateBlock[];
  createdAt: string;
  updatedAt: string;
}

export interface EstimateZone {
  id: string;
  name: string;
  primaryQuantity: number;
  drawingPageRefs: number[];
  notePhotoUrls: string[];
  relatedTradeNames: string[];
  remobilizationCount: number;
  temporaryRestorationRate: number;
  coordinationAdjustmentRate: number;
  note: string;
}

export interface EstimateBlock {
  id: string;
  projectId: string;
  drawingId: string | null;
  blockType: BlockType;
  name: string;
  secondaryProduct: string;
  distance: number;
  currentHeight: number;
  plannedHeight: number;
  laborCost: number;
  stages: number;
  machine: string;
  dumpTruck: string;
  crushedStone: string;
  crushedStoneThickness: number;
  concrete: string;
  pumpTruck: string;
  baseThickness: number;
  formworkCost: number;
  productWidth: number;
  productHeight: number;
  productLength: string;
  installLaborCost: number;
  workabilityFactor: string;
  sandCost: number;
  shippingCost: number;
  pavementWidth: number;
  surfaceThickness: number;
  binderThickness: number;
  demolitionWidth: number;
  demolitionThickness: number;
  splitPhaseCount: number;
  remobilizationCount: number;
  temporaryRestorationRate: number;
  coordinationAdjustmentRate: number;
  zones: EstimateZone[];
  requiresReviewFields: string[];
  appliedCandidateIds: string[];
}

export interface CalculationMetricRow {
  label: string;
  value: number;
  unit?: string;
  valueKind?: MetricValueKind;
}

export interface CalculationDetailSection {
  id: string;
  title: string;
  tone: string;
  metrics: CalculationMetricRow[];
}

export interface CalculationLineItem {
  key: string;
  section: string;
  itemName: string;
  specification: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  remarks: string;
}

export interface CalculationEvidence {
  lineItemKey: string;
  estimateItemName: string;
  masterType: MasterType | 'input' | 'derived';
  masterName: string;
  adoptedUnitPrice: number;
  unit: string;
  sourceName: string;
  sourceVersion: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  sourcePage: string | null;
  reason: string;
  requiresReview: boolean;
}

export interface CalculationZoneBreakdown {
  id: string;
  name: string;
  primaryQuantity: number;
  primaryUnit: string;
  quantityShare: number;
  baseAmount: number;
  remobilizationCount: number;
  remobilizationAmount: number;
  temporaryRestorationRate: number;
  temporaryRestorationQuantity: number;
  temporaryRestorationAmount: number;
  coordinationAdjustmentRate: number;
  coordinationAdjustmentAmount: number;
  totalAmount: number;
  drawingPageRefs: number[];
  notePhotoUrls: string[];
  relatedTradeNames: string[];
  note: string;
}

export interface CalculationResult {
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
  soilRemovalVolume: number;
  soilRemovalDays: number;
  dumpCapacity: number;
  dumpCount: number;
  dumpVehicleUnitPrice: number;
  regularDumpCount: number;
  regularDumpUnitPrice: number;
  soilRemovalAmount: number;
  soilRemovalUnitPerM: number;
  backfillVolume: number;
  backfillDays: number;
  backfillWorkers: number;
  backfillLaborCost: number;
  crushedStoneVolume: number;
  crushedStoneWorkers: number;
  crushedStoneDays: number;
  crushedStoneLaborCost: number;
  crushedStoneMachineCost: number;
  crushedStoneConstructionAmount: number;
  crushedStoneMaterialCost: number;
  crushedStoneTotal: number;
  crushedStoneUnitPerM: number;
  baseWidth: number;
  baseConcreteVolume: number;
  concreteUnitPrice: number;
  pouringWorkers: number;
  formworkArea: number;
  formworkMaterialCost: number;
  baseTotalAmount: number;
  baseUnitPerM: number;
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
  workType: BlockType;
  displayName: string;
  primaryQuantity: number;
  primaryUnit: string;
  totalAmount: number;
  totalAmountPerPrimaryUnit: number;
  detailSections: CalculationDetailSection[];
  lineItems: CalculationLineItem[];
  priceEvidence: CalculationEvidence[];
  zoneBreakdowns: CalculationZoneBreakdown[];
}

export interface AppState {
  projects: Project[];
  activeProjectId: string;
  activeDrawingId: string | null;
  activeBlockId: string | null;
  autoSave: boolean;
}

export interface ParseDrawingResponse {
  drawingSource: {
    fileName: string;
    fileType: DrawingFileType;
    pageCount: number;
  };
  aiCandidates: Record<string, {
    value?: string | number;
    valueText?: string;
    valueNumber?: number;
    confidence: number;
    sourceText: string;
    sourcePage: number;
    sourceBox: BoundingBox;
    reason: string;
    requiresReview: boolean;
    label?: string;
    valueType?: CandidateValueType;
  }>;
  workTypeCandidates?: Array<{
    blockType: BlockType;
    label: string;
    confidence: number;
    reason: string;
    sourceTexts: string[];
    requiresReview: boolean;
  }>;
  mediaRoute?: DrawingMediaRoute;
  titleBlock?: DrawingTitleBlockMeta;
  sheetClassification?: DrawingSheetClassification;
  resolvedUnits?: DrawingResolvedUnits;
  legendResolution?: DrawingLegendResolution;
  ocrStructured?: DrawingOcrStructured;
  cadStructured?: DrawingCadStructuredOutput;
  reviewQueue?: Array<{
    queue: string;
    severity: OcrReviewQueueSeverity;
    title: string;
    detail: string;
    sourceText?: string;
    sourcePage?: number;
    fieldName?: string;
  }>;
  ocrLines: string[];
  ocrItems: Array<{
    text: string;
    score: number;
    page: number;
    box: BoundingBox;
  }>;
  pagePreview: {
    imageUrl: string;
    width: number;
    height: number;
    page: number;
    physicalWidthMm?: number | null;
    physicalHeightMm?: number | null;
  };
  pagePreviews?: Array<{
    imageUrl: string;
    width: number;
    height: number;
    page: number;
    physicalWidthMm?: number | null;
    physicalHeightMm?: number | null;
  }>;
  debug?: Record<string, unknown>;
}

export interface ReportGenerationRequest {
  projectId?: string;
  blockId?: string;
  drawingId?: string | null;
  effectiveDate?: string;
  project?: Project;
  block?: EstimateBlock;
  drawing?: Drawing | null;
}

export interface ChangeEstimateReportHeader {
  issueDate: string;
  recipientName: string;
  constructionName: string;
  changeReason: string;
}

export interface ChangeEstimatePdfRequest extends ReportGenerationRequest {
  header: ChangeEstimateReportHeader;
}

export interface OcrLearningContext {
  planSectionLinks: OcrLearningEntry[];
}

export function createDefaultEstimateZone(name: string = 'A棟前'): EstimateZone {
  return {
    id: crypto.randomUUID(),
    name,
    primaryQuantity: 0,
    drawingPageRefs: [],
    notePhotoUrls: [],
    relatedTradeNames: [],
    remobilizationCount: 0,
    temporaryRestorationRate: 0,
    coordinationAdjustmentRate: 0,
    note: '',
  };
}

export function createDefaultBlock(projectId: string, name: string = '新規見積', drawingId: string | null = null): EstimateBlock {
  return {
    id: crypto.randomUUID(),
    projectId,
    drawingId,
    blockType: 'secondary_product',
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
    pavementWidth: 0,
    surfaceThickness: 0,
    binderThickness: 0,
    demolitionWidth: 0,
    demolitionThickness: 0,
    splitPhaseCount: 1,
    remobilizationCount: 0,
    temporaryRestorationRate: 0,
    coordinationAdjustmentRate: 0,
    zones: [],
    requiresReviewFields: [],
    appliedCandidateIds: [],
  };
}

export function createDefaultDrawing(projectId: string, name: string = '図面未登録'): Drawing {
  return {
    id: crypto.randomUUID(),
    projectId,
    name,
    drawingNo: '',
    drawingTitle: name,
    revision: 'A',
    fileName: '',
    fileType: 'pdf',
    status: 'idle',
    pageCount: 0,
    pages: [],
    ocrItems: [],
    aiCandidates: [],
    workTypeCandidates: [],
    reviewQueue: [],
    manualResolutions: [],
    manualMeasurements: [],
    uploadedAt: new Date().toISOString(),
  };
}

export function createDefaultProject(name: string = '案件 1'): Project {
  const projectId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  return {
    id: projectId,
    name,
    clientName: '',
    siteName: '',
    status: 'draft',
    drawings: [],
    blocks: [createDefaultBlock(projectId, `${name} 見積 1`)],
    createdAt,
    updatedAt: createdAt,
  };
}

export function createInitialAppState(): AppState {
  const project = createDefaultProject();
  return {
    projects: [project],
    activeProjectId: project.id,
    activeDrawingId: null,
    activeBlockId: project.blocks[0]?.id ?? null,
    autoSave: true,
  };
}
