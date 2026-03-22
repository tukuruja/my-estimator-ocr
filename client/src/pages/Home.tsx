import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FolderKanban, Plus, Workflow } from 'lucide-react';
import Header from '@/components/Header';
import EstimateList from '@/components/EstimateList';
import InputForm from '@/components/InputForm';
import CalculationResults from '@/components/CalculationResults';
import SaveBar from '@/components/SaveBar';
import OcrReviewPanel from '@/components/OcrReviewPanel';
import type { OcrReviewPanelHandle } from '@/components/OcrReviewPanel';
import DocumentPanel from '@/components/DocumentPanel';
import { calculate } from '@/lib/calculations';
import {
  fetchMasters,
  fetchOcrLearningEntries,
  generateReport,
  getAiApiUnavailableMessage,
  isAiApiAvailable,
  parseDrawing,
  runEstimationLogic,
  savePlanSectionLearning,
  type OcrParseJobState,
} from '@/lib/api';
import { canonicalizeMasterName, createSeedMasterItems } from '@/lib/masterData';
import { buildLevelConflictGroups, groupPlanSectionLinksByCallout, isLevelWatchGroup } from '@/lib/ocrInsights';
import {
  createDefaultBlock,
  createDefaultEstimateZone,
  createDefaultProject,
  createInitialAppState,
  type AICandidate,
  type AppState,
  type BlockType,
  type BoundingBox,
  type Drawing,
  type DrawingManualResolution,
  type EstimateBlock,
  type EstimateZone,
  type GeneratedReportBundle,
  type MasterType,
  type OcrLearningContext,
  type OcrLearningEntry,
  type OcrReviewQueueItem,
  type ParseDrawingResponse,
  type PriceMasterItem,
  type Project,
} from '@/lib/types';
import { loadData, saveData } from '@/lib/storage';
import { getWorkTypeLabel } from '@/lib/workTypes';
import type { EstimationLogicRunResponse } from '@shared/estimationLogic';
import { toast } from 'sonner';

const CANDIDATE_LABELS: Record<string, string> = {
  secondaryProduct: '対象名',
  distance: '施工延長',
  currentHeight: '現況高',
  plannedHeight: '計画高',
  stages: '据付段数',
  productWidth: '製品幅 / 底版幅',
  productHeight: '製品高さ / 擁壁高',
  productLength: '製品長さ',
  crushedStoneThickness: '砕石厚 / 下層路盤厚',
  baseThickness: 'ベース厚 / 路盤厚',
  pavementWidth: '舗装幅',
  surfaceThickness: '表層厚',
  binderThickness: '基層厚',
  demolitionWidth: '撤去幅',
  demolitionThickness: '撤去厚',
};

const EMPTY_REPORT_BUNDLE: GeneratedReportBundle = {
  estimateRows: [],
  unitPriceEvidenceRows: [],
  reviewIssues: [],
  summary: {
    totalAmount: 0,
    totalRows: 0,
    requiresReviewCount: 0,
  },
};

function GuideStep({ step, title, description, onActivate }: { step: string; title: string; description: string; onActivate?: () => void }) {
  const isInteractive = typeof onActivate === 'function';

  return (
    <button
      type="button"
      onClick={onActivate}
      className={`w-full rounded-md border px-3 py-2 text-left ${isInteractive ? 'border-indigo-200 bg-indigo-50 transition-colors hover:bg-indigo-100' : 'border-slate-200 bg-slate-50'}`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{step}</div>
      <div className="mt-1 text-sm font-semibold text-slate-800">{title}</div>
      <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
      {isInteractive && <div className="mt-2 text-[11px] font-semibold text-indigo-700">クリックでアップロードを開始</div>}
    </button>
  );
}

function ProjectCard({ project, isActive, onSelect }: { project: Project; isActive: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
        isActive ? 'border-indigo-300 bg-indigo-50 text-indigo-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      <div className="text-sm font-semibold">{project.name}</div>
      <div className="mt-1 text-[11px] text-slate-500">図面 {project.drawings.length} 件 / 見積 {project.blocks.length} 件</div>
    </button>
  );
}

function ReviewQueueBadge({ item }: { item: OcrReviewQueueItem }) {
  const tone = item.severity === 'critical'
    ? 'border-rose-200 bg-rose-50 text-rose-800'
    : item.severity === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <div className={`rounded-md border px-3 py-2 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-[0.16em]">{item.queue}</div>
        <div className="text-[11px] font-semibold uppercase">{item.severity}</div>
      </div>
      <div className="mt-1 text-sm font-semibold">{item.title}</div>
      <div className="mt-1 text-xs leading-5">{item.detail}</div>
      {(item.sourceText || item.sourcePage) && (
        <div className="mt-2 text-[11px] leading-5 opacity-80">
          {item.sourcePage ? `p.${item.sourcePage}` : ''}{item.sourcePage && item.sourceText ? ' / ' : ''}{item.sourceText ?? ''}
        </div>
      )}
    </div>
  );
}

function EstimationLogicCard({ run, loading, error }: { run: EstimationLogicRunResponse | null; loading: boolean; error: string | null }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Workflow className="h-4 w-4 text-emerald-600" />
        AI見積 Logic
      </div>

      {loading && (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          見積ロジックを実行しています。
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {!loading && !error && !run && (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          図面 OCR 完了後に、ここへ「次にやること」が表示されます。
        </div>
      )}

      {run && (
        <>
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">decision</div>
            <div className="mt-1 text-lg font-bold text-slate-900">{run.execution.decision}</div>
            <div className="mt-2 text-sm leading-6 text-slate-700">{run.execution.summary}</div>
            <div className="mt-2 text-xs text-slate-500">
              mode: <span className="font-semibold text-slate-700">{run.audit.mode}</span>
              {run.audit.model ? <> / model: <span className="font-semibold text-slate-700">{run.audit.model}</span></> : null}
            </div>
          </div>

          <div className="mt-3 rounded-md border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800">次にやること</div>
            <div className="space-y-2 p-3">
              {run.execution.nextActions.map((item) => (
                <div key={item} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-sm font-semibold text-slate-900">担当者メッセージ</div>
            <div className="mt-2 text-sm leading-6 text-slate-700">{run.execution.operatorMessage}</div>
          </div>

          {run.execution.stopReasons.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3">
              <div className="text-sm font-semibold text-amber-900">止めている理由</div>
              <div className="mt-2 space-y-2">
                {run.execution.stopReasons.map((item) => (
                  <div key={item} className="text-sm leading-6 text-amber-800">{item}</div>
                ))}
              </div>
            </div>
          )}

          {run.audit.warnings.length > 0 && (
            <div className="mt-3 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-3">
              <div className="text-sm font-semibold text-indigo-900">実行メモ</div>
              <div className="mt-2 space-y-2">
                {run.audit.warnings.map((item) => (
                  <div key={item} className="text-sm leading-6 text-indigo-800">{item}</div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

type LevelAdoptionTarget = 'currentHeight' | 'plannedHeight' | 'resolve_only';

function LevelAdoptionModal({
  open,
  title,
  candidateText,
  candidateValue,
  suggestedField,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  candidateText: string;
  candidateValue: string | null;
  suggestedField: keyof EstimateBlock | null;
  onClose: () => void;
  onConfirm: (target: LevelAdoptionTarget) => void;
}) {
  if (!open) return null;

  const canApplyNumeric = candidateValue !== null && candidateValue !== '' && !Number.isNaN(Number(candidateValue));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-sm font-semibold text-slate-800">高さラベル候補の採用確認</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">
            bbox 比較で選んだ候補を、review 解消だけに使うか、現況高 / 計画高へ反映するかを選びます。
          </div>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{candidateText}</div>
            <div className="mt-2 text-xs text-slate-600">
              抽出値: <span className="font-semibold text-slate-900">{candidateValue ?? '数値なし'}</span>
              {suggestedField ? (
                <span className="ml-2 text-slate-500">推奨反映先: {CANDIDATE_LABELS[suggestedField] || suggestedField}</span>
              ) : null}
            </div>
          </div>

          {!canApplyNumeric && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
              数値を確定できないため、この候補は review 解消のみ可能です。
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => onConfirm('resolve_only')}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            bbox 採用だけ記録
          </button>
          <button
            type="button"
            disabled={!canApplyNumeric}
            onClick={() => onConfirm('currentHeight')}
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            現況高へ反映
          </button>
          <button
            type="button"
            disabled={!canApplyNumeric}
            onClick={() => onConfirm('plannedHeight')}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            計画高へ反映
          </button>
        </div>
      </div>
    </div>
  );
}

function updateProjectCollection(projects: Project[], projectId: string, updater: (project: Project) => Project): Project[] {
  return projects.map((project) => (project.id === projectId ? updater(project) : project));
}

function normalizeCalloutForLearning(callout: string): string {
  const normalized = callout
    .replace(/[ー–−]/g, '-')
    .replace(/詳細図?/g, 'DETAIL')
    .replace(/\s+/g, '')
    .toUpperCase();
  if (normalized.startsWith('DETAIL') && !normalized.startsWith('DETAIL-')) {
    return normalized.replace(/^DETAIL/, 'DETAIL-');
  }
  return normalized;
}

function masterTypeForCandidate(fieldName: string, blockType: BlockType): MasterType | null {
  if (fieldName === 'secondaryProduct' && blockType === 'secondary_product') {
    return 'secondary_product';
  }
  if (fieldName === 'machine') return 'machine';
  if (fieldName === 'dumpTruck') return 'dump_truck';
  if (fieldName === 'crushedStone') return 'crushed_stone';
  if (fieldName === 'concrete') return 'concrete';
  return null;
}

function buildDrawingFromParseResponse(
  projectId: string,
  file: File,
  payload: ParseDrawingResponse,
  blockType: BlockType,
  masters: PriceMasterItem[],
  effectiveDate: string,
): Drawing {
  const previews = payload.pagePreviews && payload.pagePreviews.length > 0 ? payload.pagePreviews : [payload.pagePreview];

  const aiCandidates: AICandidate[] = Object.entries(payload.aiCandidates || {}).map(([fieldName, candidate]) => {
    const valueType = candidate.valueType ?? (typeof candidate.valueNumber === 'number' || typeof candidate.value === 'number' ? 'number' : 'string');
    const rawTextValue = candidate.valueText ?? (typeof candidate.value === 'string' ? candidate.value : undefined);
    const masterType = valueType === 'string' ? masterTypeForCandidate(fieldName, blockType) : null;
    const normalized = rawTextValue && masterType
      ? canonicalizeMasterName(masters, masterType, rawTextValue, effectiveDate)
      : null;
    const valueText = normalized?.value ?? rawTextValue;
    const matchedMaster = normalized?.matched ?? false;

    return {
      id: crypto.randomUUID(),
      fieldName,
      label: candidate.label || CANDIDATE_LABELS[fieldName] || fieldName,
      valueType,
      valueText,
      valueNumber: candidate.valueNumber ?? (typeof candidate.value === 'number' ? candidate.value : undefined),
      confidence: candidate.confidence,
      sourceText: candidate.sourceText,
      sourcePage: candidate.sourcePage,
      sourceBox: candidate.sourceBox,
      reason: matchedMaster ? `${candidate.reason} / 単価マスタ名へ正規化` : candidate.reason,
      requiresReview: candidate.requiresReview || Boolean(masterType && rawTextValue && !matchedMaster),
    };
  });

  return {
    id: crypto.randomUUID(),
    projectId,
    name: file.name,
    drawingNo: payload.titleBlock?.drawingNo ?? '',
    drawingTitle: payload.titleBlock?.drawingTitle || file.name,
    revision: payload.titleBlock?.revision ?? 'A',
    fileName: payload.drawingSource.fileName || file.name,
    fileType: payload.drawingSource.fileType,
    status: 'ready',
    pageCount: payload.drawingSource.pageCount,
    pages: previews.map((preview) => ({
      id: crypto.randomUUID(),
      pageNo: preview.page,
      imageUrl: preview.imageUrl,
      width: preview.width,
      height: preview.height,
    })),
    ocrItems: payload.ocrItems.map((item) => ({
      id: crypto.randomUUID(),
      pageNo: item.page,
      text: item.text,
      score: item.score,
      box: item.box,
    })),
    aiCandidates,
    mediaRoute: payload.mediaRoute,
    titleBlockMeta: payload.titleBlock,
    sheetClassification: payload.sheetClassification,
    resolvedUnits: payload.resolvedUnits,
    legendResolution: payload.legendResolution,
    ocrStructured: payload.ocrStructured ? {
      ...payload.ocrStructured,
      learningMatches: payload.ocrStructured.learningMatches ?? [],
    } : undefined,
    workTypeCandidates: (payload.workTypeCandidates || []).map((candidate) => ({
      id: crypto.randomUUID(),
      blockType: candidate.blockType,
      label: candidate.label,
      confidence: candidate.confidence,
      reason: candidate.reason,
      sourceTexts: candidate.sourceTexts,
      requiresReview: candidate.requiresReview,
    })),
    reviewQueue: (payload.reviewQueue || []).map((item) => ({
      id: crypto.randomUUID(),
      queue: item.queue,
      severity: item.severity,
      title: item.title,
      detail: item.detail,
      sourceText: item.sourceText,
      sourcePage: item.sourcePage,
      fieldName: item.fieldName,
    })),
    manualResolutions: [],
    uploadedAt: new Date().toISOString(),
    lastParsedAt: new Date().toISOString(),
  };
}

function upsertManualResolution(
  resolutions: DrawingManualResolution[],
  resolution: Omit<DrawingManualResolution, 'id' | 'resolvedAt'>,
): DrawingManualResolution[] {
  const nextResolution: DrawingManualResolution = {
    ...resolution,
    id: crypto.randomUUID(),
    resolvedAt: new Date().toISOString(),
  };
  return [
    ...resolutions.filter((item) => !(item.resolutionType === resolution.resolutionType && item.resolutionKey === resolution.resolutionKey)),
    nextResolution,
  ];
}

function resolveFieldForLevelGroup(groupId: string): keyof EstimateBlock | null {
  if (groupId.includes('GL') || groupId.includes('GI') || groupId.includes('G1') || groupId.includes('現況高')) {
    return 'currentHeight';
  }
  if (groupId === 'FH' || groupId.includes('計画高') || groupId.includes('計画GL')) {
    return 'plannedHeight';
  }
  return null;
}

function deriveDrawingReviewQueue(drawing: Drawing | null): OcrReviewQueueItem[] {
  if (!drawing) return [];

  const ocrStructured = drawing.ocrStructured;
  const manualResolutions = drawing.manualResolutions ?? [];
  const resolvedLevelKeys = new Set(
    manualResolutions
      .filter((item) => item.resolutionType === 'level_conflict')
      .map((item) => item.resolutionKey),
  );
  const resolvedLinkKeys = new Set(
    manualResolutions
      .filter((item) => item.resolutionType === 'plan_section_link')
      .map((item) => item.resolutionKey),
  );

  const unresolvedLevelGroups = buildLevelConflictGroups(ocrStructured).filter((group) => !resolvedLevelKeys.has(group.id));
  const unresolvedLinkGroups = groupPlanSectionLinksByCallout(ocrStructured).filter((group) => !resolvedLinkKeys.has(group.callout));
  const remainingUnresolvedTargets = (ocrStructured?.unresolvedItems ?? []).filter((item) => {
    if (item.target === '基準高ラベル') {
      return unresolvedLevelGroups.length > 0;
    }
    if (item.target === '平面図と断面図/詳細図のリンク') {
      return unresolvedLinkGroups.length > 0;
    }
    return true;
  });
  const nonLevelAmbiguousCount = (ocrStructured?.ambiguousCandidates ?? []).filter((candidate) => !isLevelWatchGroup(candidate.watchGroup)).length;

  const retainedBaseQueue = drawing.reviewQueue.filter((item) => ![
    'OCR watchlist に該当する候補あり',
    '平面図と断面図/詳細図のリンクが未解決',
    '未解決 OCR 項目があります',
  ].includes(item.title));

  const derivedItems: OcrReviewQueueItem[] = [];

  if (nonLevelAmbiguousCount > 0) {
    derivedItems.push({
      id: 'derived-watchlist',
      queue: 'ocr_router_review',
      severity: 'warning',
      title: 'OCR watchlist に該当する候補あり',
      detail: `高さラベル以外の watchlist 候補が ${nonLevelAmbiguousCount} 件あります。`,
    });
  }

  unresolvedLevelGroups.forEach((group) => {
    derivedItems.push({
      id: `level-${group.id}`,
      queue: 'ocr_router_review',
      severity: 'warning',
      title: '高さラベル候補を確認',
      detail: `${group.label} の候補が ${group.items.length} 件あります。bbox 比較から採用してください。`,
      fieldName: resolveFieldForLevelGroup(group.id) ?? undefined,
    });
  });

  unresolvedLinkGroups.forEach((group) => {
    derivedItems.push({
      id: `link-${group.callout}`,
      queue: 'sheet_classification_review',
      severity: 'info',
      title: '図面リンク候補を確認',
      detail: `${group.callout} の平面図 / 断面図 / 詳細図リンク候補が ${group.links.length} 件あります。採用して閉じてください。`,
    });
  });

  const otherUnresolvedTargets = remainingUnresolvedTargets
    .map((item) => item.target)
    .filter((target) => target !== '基準高ラベル' && target !== '平面図と断面図/詳細図のリンク');
  if (otherUnresolvedTargets.length > 0) {
    derivedItems.push({
      id: 'derived-unresolved',
      queue: 'unit_scale_review',
      severity: 'warning',
      title: '未解決 OCR 項目があります',
      detail: otherUnresolvedTargets.slice(0, 3).join(' / '),
    });
  }

  return [...retainedBaseQueue, ...derivedItems];
}

function applyCandidateValue(block: EstimateBlock, candidate: AICandidate, drawingId: string | null): EstimateBlock {
  const nextBlock: EstimateBlock = {
    ...block,
    drawingId,
    appliedCandidateIds: Array.from(new Set([...block.appliedCandidateIds, candidate.id])),
    requiresReviewFields: candidate.requiresReview
      ? Array.from(new Set([...block.requiresReviewFields, candidate.fieldName]))
      : block.requiresReviewFields.filter((field) => field !== candidate.fieldName),
  };
  const mutableBlock = nextBlock as unknown as Record<string, unknown>;

  if (candidate.valueType === 'number') {
    const numericValue = candidate.valueNumber ?? Number(candidate.valueText ?? 0);
    mutableBlock[candidate.fieldName] = Number.isFinite(numericValue) ? numericValue : 0;
  } else {
    const textValue = candidate.valueText ?? String(candidate.valueNumber ?? '');
    mutableBlock[candidate.fieldName] = textValue;
    if (candidate.fieldName === 'secondaryProduct' && textValue) {
      nextBlock.name = textValue;
    }
  }

  return nextBlock;
}

function createBlockForType(projectId: string, blockType: BlockType, baseName: string, drawingId: string | null = null): EstimateBlock {
  const block = createDefaultBlock(projectId, baseName, drawingId);
  block.blockType = blockType;
  return block;
}

interface HomeProps {
  preferredBlockType?: BlockType;
}

export default function Home({ preferredBlockType }: HomeProps) {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatusMessage, setUploadStatusMessage] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [hoveredCandidateId, setHoveredCandidateId] = useState<string | null>(null);
  const [activeOcrItemId, setActiveOcrItemId] = useState<string | null>(null);
  const [masters, setMasters] = useState<PriceMasterItem[]>([]);
  const [reportBundle, setReportBundle] = useState<GeneratedReportBundle>(EMPTY_REPORT_BUNDLE);
  const [reportError, setReportError] = useState<string | null>(null);
  const [logicRun, setLogicRun] = useState<EstimationLogicRunResponse | null>(null);
  const [logicRunError, setLogicRunError] = useState<string | null>(null);
  const [isLogicRunning, setIsLogicRunning] = useState(false);
  const [ocrLearningEntries, setOcrLearningEntries] = useState<OcrLearningEntry[]>([]);
  const [pendingLevelAdoption, setPendingLevelAdoption] = useState<{
    groupId: string;
    item: { pageNo: number; box: BoundingBox; text: string; value: string | null };
    suggestedField: keyof EstimateBlock | null;
  } | null>(null);
  const ocrReviewPanelRef = useRef<OcrReviewPanelHandle | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const data = await loadData();
      if (cancelled) return;
      setAppState(data);
      setInitialized(true);
    })();

    void (async () => {
      try {
        const items = await fetchMasters({ effectiveDate: new Date().toISOString().slice(0, 10) });
        if (cancelled) return;
        setMasters(items.length > 0 ? items : createSeedMasterItems());
      } catch {
        if (cancelled) return;
        setMasters(createSeedMasterItems());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!initialized || !appState || !appState.autoSave) return;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      void saveData(appState);
    }, 1000);
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [appState, initialized]);

  const activeProject = useMemo(() => {
    if (!appState) return null;
    return appState.projects.find((project) => project.id === appState.activeProjectId) ?? appState.projects[0] ?? null;
  }, [appState]);

  const activeBlock = useMemo(() => {
    if (!activeProject || !appState) return null;
    return activeProject.blocks.find((block) => block.id === appState.activeBlockId) ?? activeProject.blocks[0] ?? null;
  }, [activeProject, appState]);

  const activeDrawing = useMemo(() => {
    if (!activeProject || !appState) return null;
    return activeProject.drawings.find((drawing) => drawing.id === appState.activeDrawingId) ?? activeProject.drawings[0] ?? null;
  }, [activeProject, appState]);

  useEffect(() => {
    if (!appState || !activeProject || !preferredBlockType) return;
    if (activeBlock?.blockType === preferredBlockType) return;

    const existing = activeProject.blocks.find((block) => block.blockType === preferredBlockType);
    if (existing) {
      setAppState((prev) => (prev ? { ...prev, activeBlockId: existing.id } : prev));
      return;
    }

    const nextBlock = createBlockForType(activeProject.id, preferredBlockType, `${activeProject.name} ${getWorkTypeLabel(preferredBlockType)} ${activeProject.blocks.length + 1}`, activeDrawing?.id ?? null);
    setAppState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        projects: updateProjectCollection(prev.projects, activeProject.id, (project) => ({
          ...project,
          blocks: [...project.blocks, nextBlock],
          updatedAt: new Date().toISOString(),
        })),
        activeBlockId: nextBlock.id,
      };
    });
  }, [appState, activeBlock?.id, activeBlock?.blockType, activeDrawing?.id, activeProject, preferredBlockType]);

  useEffect(() => {
    setPendingLevelAdoption(null);
  }, [activeDrawing?.id, activeBlock?.id, activeProject?.id]);

  const activeCandidateId = hoveredCandidateId ?? selectedCandidateId;
  const effectiveDate = new Date().toISOString().slice(0, 10);
  const uploadDisabledReason = isAiApiAvailable() ? null : getAiApiUnavailableMessage();
  const result = useMemo(() => (activeBlock ? calculate(activeBlock, { masters, effectiveDate }) : null), [activeBlock, effectiveDate, masters]);
  const activeManualResolutions = activeDrawing?.manualResolutions ?? [];
  const resolvedLevelKeys = useMemo(
    () => activeManualResolutions.filter((item) => item.resolutionType === 'level_conflict').map((item) => item.resolutionKey),
    [activeManualResolutions],
  );
  const resolvedLinkKeys = useMemo(
    () => activeManualResolutions.filter((item) => item.resolutionType === 'plan_section_link').map((item) => item.resolutionKey),
    [activeManualResolutions],
  );
  const activeReviewQueue = useMemo(() => deriveDrawingReviewQueue(activeDrawing), [activeDrawing]);
  const ocrLearningContext = useMemo<OcrLearningContext>(() => ({
    planSectionLinks: ocrLearningEntries,
  }), [ocrLearningEntries]);

  useEffect(() => {
    let cancelled = false;
    if (!activeProject?.id) {
      setOcrLearningEntries([]);
      return;
    }

    void (async () => {
      try {
        const entries = await fetchOcrLearningEntries(activeProject.id);
        if (cancelled) return;
        setOcrLearningEntries(entries);
      } catch {
        if (cancelled) return;
        setOcrLearningEntries([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeProject?.id]);

  useEffect(() => {
    if (!activeProject || !activeBlock) {
      setReportBundle(EMPTY_REPORT_BUNDLE);
      setReportError(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void generateReport({
        project: activeProject,
        block: activeBlock,
        drawing: activeDrawing,
        effectiveDate,
      })
        .then((bundle) => {
          if (cancelled) return;
          setReportBundle(bundle);
          setReportError(null);
        })
        .catch((error) => {
          if (cancelled) return;
          setReportBundle(EMPTY_REPORT_BUNDLE);
          setReportError(error instanceof Error ? error.message : '帳票生成に失敗しました。');
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeBlock, activeDrawing, activeProject, effectiveDate]);

  useEffect(() => {
    if (!activeProject || !activeBlock) {
      setLogicRun(null);
      setLogicRunError(null);
      setIsLogicRunning(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setIsLogicRunning(true);
      void runEstimationLogic({
        project: activeProject,
        block: activeBlock,
        drawing: activeDrawing,
        effectiveDate,
      })
        .then((run) => {
          if (cancelled) return;
          setLogicRun(run);
          setLogicRunError(null);
        })
        .catch((error) => {
          if (cancelled) return;
          setLogicRun(null);
          setLogicRunError(error instanceof Error ? error.message : '見積ロジックの実行に失敗しました。');
        })
        .finally(() => {
          if (!cancelled) {
            setIsLogicRunning(false);
          }
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeBlock, activeDrawing, activeProject, effectiveDate]);

  const replaceActiveProject = useCallback((updater: (project: Project) => Project) => {
    setAppState((prev) => {
      if (!prev) return prev;
      const activeProjectId = prev.activeProjectId;
      return {
        ...prev,
        projects: updateProjectCollection(prev.projects, activeProjectId, (project) => ({
          ...updater(project),
          updatedAt: new Date().toISOString(),
        })),
      };
    });
  }, []);

  const handleOcrJobProgress = useCallback((job: OcrParseJobState) => {
    const label = job.status === 'queued'
      ? 'OCRジョブを登録しました。解析待ちです。'
      : job.status === 'processing'
        ? 'OCR解析中です。ページ変換と候補抽出を実行しています。'
        : job.status === 'completed'
          ? 'OCR解析が完了しました。'
          : job.error?.message || 'OCR解析ジョブが失敗しました。';
    setUploadStatusMessage(label);
  }, []);

  const handleProjectMetaChange = useCallback((field: 'name' | 'clientName' | 'siteName', value: string) => {
    replaceActiveProject((project) => ({ ...project, [field]: value }));
  }, [replaceActiveProject]);

  const handleFieldChange = useCallback((field: keyof EstimateBlock, value: string | number) => {
    if (!activeProject || !activeBlock) return;
    replaceActiveProject((project) => ({
      ...project,
      blocks: project.blocks.map((block) => {
        if (block.id !== activeBlock.id) return block;
        const updatedBlock = { ...block, [field]: value } as EstimateBlock;
        if (field === 'secondaryProduct' && typeof value === 'string' && value) {
          updatedBlock.name = value;
        }
        if (field === 'blockType' && typeof value === 'string') {
          updatedBlock.name = updatedBlock.secondaryProduct || `${getWorkTypeLabel(value as BlockType)} 見積`;
        }
        return updatedBlock;
      }),
    }));
  }, [activeProject, activeBlock, replaceActiveProject]);

  const handleZoneChange = useCallback((zoneId: string, field: keyof EstimateZone, value: string | number) => {
    if (!activeProject || !activeBlock) return;
    replaceActiveProject((project) => ({
      ...project,
      blocks: project.blocks.map((block) => {
        if (block.id !== activeBlock.id) return block;
        return {
          ...block,
          zones: block.zones.map((zone) => (
            zone.id === zoneId
              ? { ...zone, [field]: value }
              : zone
          )),
        };
      }),
    }));
  }, [activeProject, activeBlock, replaceActiveProject]);

  const handleAddZone = useCallback(() => {
    if (!activeProject || !activeBlock) return;
    const defaultNames = ['A棟前', '共用通路', '駐車場', 'B棟前', 'エントランス前'];
    const defaultName = defaultNames[activeBlock.zones.length] ?? `区画 ${activeBlock.zones.length + 1}`;
    const nextZone = createDefaultEstimateZone(defaultName);
    replaceActiveProject((project) => ({
      ...project,
      blocks: project.blocks.map((block) => (
        block.id === activeBlock.id
          ? { ...block, zones: [...block.zones, nextZone] }
          : block
      )),
    }));
  }, [activeBlock, activeProject, replaceActiveProject]);

  const handleRemoveZone = useCallback((zoneId: string) => {
    if (!activeProject || !activeBlock) return;
    replaceActiveProject((project) => ({
      ...project,
      blocks: project.blocks.map((block) => (
        block.id === activeBlock.id
          ? { ...block, zones: block.zones.filter((zone) => zone.id !== zoneId) }
          : block
      )),
    }));
  }, [activeBlock, activeProject, replaceActiveProject]);

  const handleAddProject = useCallback(() => {
    const defaultName = `案件 ${appState ? appState.projects.length + 1 : 1}`;
    const name = prompt('追加する案件名を入力してください。', defaultName);
    if (!name) return;
    const project = createDefaultProject(name);
    if (preferredBlockType) {
      project.blocks = [createBlockForType(project.id, preferredBlockType, `${name} ${getWorkTypeLabel(preferredBlockType)} 1`)];
    }
    setAppState((prev) => {
      const current = prev ?? createInitialAppState();
      return {
        ...current,
        projects: [...current.projects, project],
        activeProjectId: project.id,
        activeDrawingId: null,
        activeBlockId: project.blocks[0]?.id ?? null,
      };
    });
    setSelectedCandidateId(null);
    setHoveredCandidateId(null);
    setActiveOcrItemId(null);
    setUploadStatusMessage(null);
    setLogicRun(null);
    setLogicRunError(null);
  }, [appState, preferredBlockType]);

  const handleSelectProject = useCallback((projectId: string) => {
    setAppState((prev) => {
      if (!prev) return prev;
      const project = prev.projects.find((item) => item.id === projectId) ?? prev.projects[0];
      const nextBlock = preferredBlockType
        ? project.blocks.find((block) => block.blockType === preferredBlockType) ?? project.blocks[0]
        : project.blocks[0];
      return {
        ...prev,
        activeProjectId: project.id,
        activeDrawingId: project.drawings[0]?.id ?? null,
        activeBlockId: nextBlock?.id ?? null,
      };
    });
    setUploadError(null);
    setUploadStatusMessage(null);
    setSelectedCandidateId(null);
    setHoveredCandidateId(null);
    setActiveOcrItemId(null);
    setLogicRun(null);
    setLogicRunError(null);
  }, [preferredBlockType]);

  const handleAddBlock = useCallback(() => {
    if (!activeProject) return;
    const targetType = preferredBlockType ?? activeBlock?.blockType ?? 'secondary_product';
    const defaultName = `${activeProject.name} ${getWorkTypeLabel(targetType)} ${activeProject.blocks.length + 1}`;
    const name = prompt('追加する見積の名前を入力してください。', defaultName);
    if (name === null) return;
    const newBlock = createBlockForType(activeProject.id, targetType, name || defaultName, activeDrawing?.id ?? null);
    replaceActiveProject((project) => ({ ...project, blocks: [...project.blocks, newBlock] }));
    setAppState((prev) => (prev ? { ...prev, activeBlockId: newBlock.id } : prev));
  }, [activeBlock?.blockType, activeDrawing?.id, activeProject, preferredBlockType, replaceActiveProject]);

  const handleDeleteBlock = useCallback(() => {
    if (!activeProject || !activeBlock || activeProject.blocks.length <= 1) return;
    if (!confirm(`「${activeBlock.name}」を削除しますか？\nこの操作は元に戻せません。`)) return;

    const remainingBlocks = activeProject.blocks.filter((block) => block.id !== activeBlock.id);
    replaceActiveProject((project) => ({ ...project, blocks: remainingBlocks }));
    setAppState((prev) => (prev ? { ...prev, activeBlockId: remainingBlocks[0]?.id ?? null } : prev));
  }, [activeProject, activeBlock, replaceActiveProject]);

  const handleSave = useCallback(async () => {
    if (!appState) return;
    await saveData(appState);
    toast.success('案件データを保存しました。');
  }, [appState]);

  const handleSaveAs = useCallback(() => {
    if (!activeProject || !activeBlock) return;
    const suggestedName = `${activeBlock.name} のコピー`;
    const name = prompt('複製して保存する見積名を入力してください。', suggestedName);
    if (!name) return;
    const nextBlock = { ...activeBlock, id: crypto.randomUUID(), name };
    replaceActiveProject((project) => ({ ...project, blocks: [...project.blocks, nextBlock] }));
    setAppState((prev) => (prev ? { ...prev, activeBlockId: nextBlock.id } : prev));
    toast.success(`「${name}」として複製保存しました。`);
  }, [activeProject, activeBlock, replaceActiveProject]);

  const handleToggleAutoSave = useCallback(() => {
    setAppState((prev) => (prev ? { ...prev, autoSave: !prev.autoSave } : prev));
  }, []);

  const handleSelectDrawing = useCallback((drawingId: string) => {
    setAppState((prev) => (prev ? { ...prev, activeDrawingId: drawingId } : prev));
    setUploadError(null);
    setUploadStatusMessage(null);
    setSelectedCandidateId(null);
    setHoveredCandidateId(null);
    setActiveOcrItemId(null);
  }, []);

  const handleActivateStep2 = useCallback(() => {
    ocrReviewPanelRef.current?.focusPanel();
    if (uploadDisabledReason) {
      setUploadError(uploadDisabledReason);
      toast.error(uploadDisabledReason);
      return;
    }
    ocrReviewPanelRef.current?.focusAndOpenUpload();
  }, [uploadDisabledReason]);

  const handleUploadFile = useCallback(async (file: File) => {
    if (!activeProject || !activeBlock) return;
    if (!isAiApiAvailable()) {
      const message = getAiApiUnavailableMessage();
      setUploadError(message);
      setUploadStatusMessage(null);
      toast.error(message);
      return;
    }
    setUploadError(null);
    setIsUploading(true);
    setUploadStatusMessage('OCRジョブを作成中です。');

    try {
      const payload = await parseDrawing(file, activeBlock.blockType, {
        onProgress: handleOcrJobProgress,
        learningContext: ocrLearningContext,
      });
      const nextDrawing = buildDrawingFromParseResponse(
        activeProject.id,
        file,
        payload,
        activeBlock.blockType,
        masters,
        new Date().toISOString().slice(0, 10),
      );

      replaceActiveProject((project) => ({
        ...project,
        drawings: [...project.drawings, nextDrawing],
        blocks: project.blocks.map((block, index) => (
          index === 0 && !block.drawingId ? { ...block, drawingId: nextDrawing.id } : block
        )),
      }));

      setAppState((prev) => (prev ? {
        ...prev,
        activeDrawingId: nextDrawing.id,
        activeBlockId: prev.activeBlockId ?? activeProject.blocks[0]?.id ?? null,
      } : prev));
      setSelectedCandidateId(nextDrawing.aiCandidates[0]?.id ?? null);
      setHoveredCandidateId(null);
      setActiveOcrItemId(nextDrawing.ocrItems[0]?.id ?? null);
      setUploadStatusMessage(null);
      toast.success(`図面を解析しました。OCR ${nextDrawing.ocrItems.length} 行、候補 ${nextDrawing.aiCandidates.length} 件です。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '図面解析に失敗しました。';
      setUploadError(message);
      setUploadStatusMessage(null);
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  }, [activeBlock, activeProject, handleOcrJobProgress, masters, ocrLearningContext, replaceActiveProject]);

  const handleApplyCandidate = useCallback((candidateId: string) => {
    if (!activeProject || !activeBlock || !activeDrawing) return;
    const candidate = activeDrawing.aiCandidates.find((item) => item.id === candidateId);
    if (!candidate) return;

    replaceActiveProject((project) => ({
      ...project,
      blocks: project.blocks.map((block) => (
        block.id === activeBlock.id ? applyCandidateValue(block, candidate, activeDrawing.id) : block
      )),
    }));

    setSelectedCandidateId(candidate.id);
    setActiveOcrItemId(null);
    toast.success(`「${candidate.label}」へ候補を反映しました。`);
  }, [activeProject, activeBlock, activeDrawing, replaceActiveProject]);

  const handleApplyAllCandidates = useCallback(() => {
    if (!activeProject || !activeBlock || !activeDrawing) return;
    const safeCandidates = activeDrawing.aiCandidates.filter((candidate) => !candidate.requiresReview);
    if (safeCandidates.length === 0) {
      toast.message('一括反映できる候補はありません。');
      return;
    }

    replaceActiveProject((project) => ({
      ...project,
      blocks: project.blocks.map((block) => {
        if (block.id !== activeBlock.id) return block;
        return safeCandidates.reduce((currentBlock, candidate) => applyCandidateValue(currentBlock, candidate, activeDrawing.id), block);
      }),
    }));

    toast.success(`${safeCandidates.length} 件の候補を一括反映しました。`);
  }, [activeProject, activeBlock, activeDrawing, replaceActiveProject]);

  const handleSelectCandidate = useCallback((candidateId: string | null) => {
    setSelectedCandidateId(candidateId);
    setActiveOcrItemId(null);
  }, []);

  const handleHoverCandidate = useCallback((candidateId: string | null) => {
    setHoveredCandidateId(candidateId);
  }, []);

  const handleSelectOcrItem = useCallback((itemId: string | null) => {
    setActiveOcrItemId(itemId);
    if (itemId) {
      setSelectedCandidateId(null);
    }
  }, []);

  const handleRequestAdoptLevelCandidate = useCallback((
    groupId: string,
    item: { pageNo: number; box: BoundingBox; text: string; value: string | null },
  ) => {
    setPendingLevelAdoption({
      groupId,
      item,
      suggestedField: resolveFieldForLevelGroup(groupId),
    });
  }, []);

  const handleConfirmLevelAdoption = useCallback((target: LevelAdoptionTarget) => {
    if (!activeProject || !activeDrawing || !activeBlock || !pendingLevelAdoption) return;

    const { groupId, item } = pendingLevelAdoption;
    const fieldName = target === 'resolve_only' ? null : target;
    const numericValue = item.value !== null ? Number(item.value) : null;

    replaceActiveProject((project) => ({
      ...project,
      drawings: project.drawings.map((drawing) => (
        drawing.id !== activeDrawing.id
          ? drawing
          : {
              ...drawing,
              manualResolutions: upsertManualResolution(drawing.manualResolutions ?? [], {
                resolutionType: 'level_conflict',
                resolutionKey: groupId,
                title: `高さラベル採用: ${groupId}`,
                selectedText: item.text,
                selectedPageNo: item.pageNo,
                selectedBox: item.box,
                appliedFieldName: fieldName ?? undefined,
                appliedValue: Number.isFinite(numericValue) ? numericValue : item.value,
                note: fieldName ? `${CANDIDATE_LABELS[fieldName] || fieldName} へ採用` : 'レビュー解消のみ',
              }),
            }
      )),
      blocks: project.blocks.map((block) => {
        if (block.id !== activeBlock.id) return block;
        if (!fieldName || !Number.isFinite(numericValue)) return block;
        return {
          ...block,
          drawingId: activeDrawing.id,
          [fieldName]: numericValue,
          requiresReviewFields: block.requiresReviewFields.filter((field) => field !== fieldName),
        };
      }),
    }));

    setPendingLevelAdoption(null);
    toast.success(
      fieldName && Number.isFinite(numericValue)
        ? `「${item.text}」を ${CANDIDATE_LABELS[fieldName] || fieldName} へ採用しました。`
        : `「${item.text}」を採用し、review queue を閉じました。`,
    );
  }, [activeBlock, activeDrawing, activeProject, pendingLevelAdoption, replaceActiveProject]);

  const handleAdoptPlanSectionLink = useCallback((callout: string, linkId: string) => {
    if (!activeProject || !activeDrawing) return;
    const selectedLink = activeDrawing.ocrStructured?.planSectionLinks.find((item) => item.id === linkId);
    if (!selectedLink) return;

    replaceActiveProject((project) => ({
      ...project,
      drawings: project.drawings.map((drawing) => (
        drawing.id !== activeDrawing.id
          ? drawing
          : {
              ...drawing,
              manualResolutions: upsertManualResolution(drawing.manualResolutions ?? [], {
                resolutionType: 'plan_section_link',
                resolutionKey: callout,
                title: `図面リンク採用: ${callout}`,
                selectedText: `${selectedLink.sourceText} -> ${selectedLink.targetText}`,
                selectedPageNo: selectedLink.sourcePageNo,
                selectedBox: selectedLink.sourceBox,
                note: `${selectedLink.sourceRole} p.${selectedLink.sourcePageNo} と ${selectedLink.targetRole} p.${selectedLink.targetPageNo} を採用`,
              }),
            }
      )),
    }));

    void savePlanSectionLearning({
      projectId: activeProject.id,
      callout,
      normalizedCallout: normalizeCalloutForLearning(callout),
      sourceRole: selectedLink.sourceRole,
      targetRole: selectedLink.targetRole,
      sourceText: selectedLink.sourceText,
      targetText: selectedLink.targetText,
      sourcePageNo: selectedLink.sourcePageNo,
      targetPageNo: selectedLink.targetPageNo,
      drawingNo: activeDrawing.drawingNo || undefined,
      drawingTitle: activeDrawing.drawingTitle || undefined,
    })
      .then((entries) => {
        setOcrLearningEntries(entries);
      })
      .catch((error) => {
        console.error('Failed to persist OCR learning:', error);
        toast.error('OCR 学習テーブルの保存に失敗しました。');
      });

    toast.success(`「${callout}」の図面リンクを採用し、review queue を閉じました。`);
  }, [activeDrawing, activeProject, replaceActiveProject]);

  if (!initialized || !appState || !activeProject || !activeBlock || !result) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-gray-500">案件データを読み込んでいます...</div>
      </div>
    );
  }

  const activeIndex = Math.max(0, activeProject.blocks.findIndex((block) => block.id === activeBlock.id));

  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-gray-100">
      <Header />

      <div className="flex items-center justify-end gap-3 border-b border-gray-200 bg-white px-4 py-1">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span>自動保存</span>
          <button
            onClick={handleToggleAutoSave}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${appState.autoSave ? 'bg-green-500' : 'bg-gray-300'}`}
            title="自動保存のオン・オフを切り替えます"
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${appState.autoSave ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
          <span className="hidden sm:inline">{appState.autoSave ? '入力後に自動で保存します' : '手動保存のみです'}</span>
        </div>
        <button onClick={handleSave} className="flex items-center gap-1 rounded bg-green-500 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-green-600">
          💾 案件データを保存
        </button>
        <button onClick={handleSaveAs} className="flex items-center gap-1 rounded bg-blue-500 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-600">
          💾 見積を複製保存
        </button>
      </div>

      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <FolderKanban className="h-4 w-4 text-indigo-600" />
              案件ワークスペース
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              案件ごとに図面と見積をまとめて管理します。図面 OCR の根拠、工種判定、帳票生成を同じ画面で確認できます。
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddProject}
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            案件を追加
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {appState.projects.map((project) => (
            <ProjectCard key={project.id} project={project} isActive={project.id === activeProject.id} onSelect={() => handleSelectProject(project.id)} />
          ))}
        </div>
      </div>

      <div className="px-2 pt-2">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <div className="text-sm font-semibold text-slate-800">案件情報</div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="space-y-1 text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">案件名</span>
                  <input type="text" value={activeProject.name} onChange={(event) => handleProjectMetaChange('name', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900" />
                </label>
                <label className="space-y-1 text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">元請名</span>
                  <input type="text" value={activeProject.clientName} onChange={(event) => handleProjectMetaChange('clientName', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900" placeholder="任意入力" />
                </label>
                <label className="space-y-1 text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">現場名</span>
                  <input type="text" value={activeProject.siteName} onChange={(event) => handleProjectMetaChange('siteName', event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900" placeholder="任意入力" />
                </label>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-1">
              <GuideStep step="STEP 1" title="工種別見積を選ぶ" description="二次製品・擁壁・舗装・撤去のどれを見積るか選びます。" />
              <GuideStep step="STEP 2" title="図面を OCR 解析" description="クリックすると OCR 画面へ移動し、PDF または画像の選択を開きます。" onActivate={handleActivateStep2} />
              <GuideStep step="STEP 3" title="候補を確認して帳票化" description="根拠 bbox を見ながら候補を反映し、見積書・単価根拠表・要確認一覧を生成します。" />
            </div>
          </div>
        </div>
      </div>

      <EstimateList
        blocks={activeProject.blocks}
        activeIndex={activeIndex}
        onSelect={(index) => setAppState((prev) => (prev ? { ...prev, activeBlockId: activeProject.blocks[index]?.id ?? null } : prev))}
        onAdd={handleAddBlock}
        onDelete={handleDeleteBlock}
      />

      <div className="flex-1 overflow-auto p-2">
        <div className="grid gap-2 2xl:grid-cols-[420px_minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="min-h-[720px] overflow-auto">
            <InputForm
              block={activeBlock}
              onChange={handleFieldChange}
              onZoneChange={handleZoneChange}
              onAddZone={handleAddZone}
              onRemoveZone={handleRemoveZone}
            />
          </div>

          <OcrReviewPanel
            ref={ocrReviewPanelRef}
            drawings={activeProject.drawings}
            activeDrawingId={activeDrawing?.id ?? appState.activeDrawingId}
            activeOcrItemId={activeOcrItemId}
            activeCandidateId={activeCandidateId}
            isUploading={isUploading}
            uploadError={uploadError}
            uploadDisabledReason={uploadDisabledReason}
            uploadStatusMessage={uploadStatusMessage}
            onUploadFile={handleUploadFile}
            onSelectDrawing={handleSelectDrawing}
            onSelectOcrItem={handleSelectOcrItem}
            onSelectCandidate={handleSelectCandidate}
            onHoverCandidate={handleHoverCandidate}
            onApplyCandidate={handleApplyCandidate}
            onApplyAllCandidates={handleApplyAllCandidates}
            resolvedLevelKeys={resolvedLevelKeys}
            resolvedLinkKeys={resolvedLinkKeys}
            onAdoptLevelCandidate={handleRequestAdoptLevelCandidate}
            onAdoptPlanSectionLink={handleAdoptPlanSectionLink}
          />

          <div className="space-y-2">
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Workflow className="h-4 w-4 text-amber-600" />
                反映状況
              </div>
              <div className="mt-2 text-sm text-slate-600">
                <div>工種: <span className="font-semibold text-slate-900">{getWorkTypeLabel(activeBlock.blockType)}</span></div>
                <div className="mt-1">紐づく図面: <span className="font-semibold text-slate-900">{activeDrawing?.drawingTitle || '未選択'}</span></div>
                <div className="mt-1">反映済み候補: <span className="font-semibold text-slate-900">{activeBlock.appliedCandidateIds.length} 件</span></div>
                <div className="mt-1">OCR review queue: <span className="font-semibold text-slate-900">{activeReviewQueue.length} 件</span></div>
              </div>
              {activeBlock.requiresReviewFields.length > 0 ? (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  要確認項目: {activeBlock.requiresReviewFields.map((field) => CANDIDATE_LABELS[field] || field).join(' / ')}
                </div>
              ) : (
                <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  現在、要確認で停止している項目はありません。
                </div>
              )}

              {activeDrawing?.mediaRoute && (
                <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
                  <div className="font-semibold text-slate-800">OCR pack 判定</div>
                  <div className="mt-2">媒体: <span className="font-semibold text-slate-900">{activeDrawing.mediaRoute.sourceMediaType}</span></div>
                  <div className="mt-1">処理経路: <span className="font-semibold text-slate-900">{activeDrawing.mediaRoute.preferredPipeline}</span></div>
                  <div className="mt-1">シート分類: <span className="font-semibold text-slate-900">{activeDrawing.sheetClassification?.sheetTypeName ?? '未分類'}</span></div>
                  <div className="mt-1">分野: <span className="font-semibold text-slate-900">{activeDrawing.titleBlockMeta?.discipline ?? activeDrawing.sheetClassification?.discipline ?? 'unknown'}</span></div>
                  <div className="mt-1">単位: <span className="font-semibold text-slate-900">{activeDrawing.resolvedUnits?.lengthUnit ?? 'unknown'}</span></div>
                  {activeDrawing.ocrStructured && (
                    <>
                      <div className="mt-1">役割候補: <span className="font-semibold text-slate-900">{activeDrawing.ocrStructured.pageRoles.flatMap((page) => page.roles.map((role) => role.role)).slice(0, 4).join(' / ') || '未抽出'}</span></div>
                      <div className="mt-1">高さ候補: <span className="font-semibold text-slate-900">{activeDrawing.ocrStructured.levelCandidates.length}</span></div>
                      <div className="mt-1">寸法候補: <span className="font-semibold text-slate-900">{activeDrawing.ocrStructured.dimensionCandidates.length}</span></div>
                      <div className="mt-1">watchlist: <span className="font-semibold text-slate-900">{activeDrawing.ocrStructured.ambiguousCandidates.length}</span></div>
                      <div className="mt-1">図面リンク: <span className="font-semibold text-slate-900">{activeDrawing.ocrStructured.planSectionLinks.length}</span></div>
                      <div className="mt-1">再利用学習: <span className="font-semibold text-slate-900">{activeDrawing.ocrStructured.learningMatches?.length ?? 0}</span></div>
                    </>
                  )}
                </div>
              )}

              <div className="mt-3 rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800">OCR pack review queue</div>
                <div className="space-y-2 p-3">
                  {activeReviewQueue.length === 0 ? (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      OCR pack 起点での追加レビュー項目はありません。
                    </div>
                  ) : (
                    activeReviewQueue.slice(0, 6).map((item) => <ReviewQueueBadge key={item.id} item={item} />)
                  )}
                </div>
              </div>
            </div>

            <CalculationResults result={result} block={activeBlock} />
            <EstimationLogicCard run={logicRun} loading={isLogicRunning} error={logicRunError} />
            {reportError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
                {reportError}
              </div>
            )}
            <DocumentPanel bundle={reportBundle} drawing={activeDrawing} projectName={activeProject.name} estimateName={activeBlock.name} />
          </div>
        </div>
      </div>

      <LevelAdoptionModal
        open={Boolean(pendingLevelAdoption)}
        title={pendingLevelAdoption?.groupId ?? '高さラベル候補'}
        candidateText={pendingLevelAdoption?.item.text ?? ''}
        candidateValue={pendingLevelAdoption?.item.value ?? null}
        suggestedField={pendingLevelAdoption?.suggestedField ?? null}
        onClose={() => setPendingLevelAdoption(null)}
        onConfirm={handleConfirmLevelAdoption}
      />

      <SaveBar autoSave={appState.autoSave} onToggleAutoSave={handleToggleAutoSave} onSave={handleSave} onSaveAs={handleSaveAs} />
    </div>
  );
}
