import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { BrainCircuit, FileSearch, LoaderCircle, Upload } from 'lucide-react';
import {
  findPageCalibration,
  describeDistanceMeasurement,
  describePolygonMeasurement,
} from '@/lib/ocrMeasurements';
import type {
  AICandidate,
  BoundingBox,
  Drawing,
  DrawingDistanceMeasurement,
  DrawingMeasurementMode,
  DrawingMeasurementPoint,
  DrawingPolygonMeasurement,
  OcrItem,
} from '@/lib/types';
import {
  analyzeDrawingWithVision,
  extractQuantitiesWithVision,
  correctOcrText,
  type OcrEnhanceAnalysisResult,
  type OcrEnhanceQuantityResult,
} from '@/lib/api';
import OcrCanvas from './OcrCanvas';
import OcrLineList from './OcrLineList';
import CandidatePanel from './CandidatePanel';
import OcrInsightPanel from './OcrInsightPanel';

interface OcrReviewPanelProps {
  drawings: Drawing[];
  activeDrawingId: string | null;
  activeOcrItemId: string | null;
  activeCandidateId: string | null;
  isUploading: boolean;
  uploadError: string | null;
  uploadDisabledReason?: string | null;
  uploadStatusMessage?: string | null;
  onUploadFile: (file: File) => void;
  onSelectDrawing: (drawingId: string) => void;
  onSelectOcrItem: (itemId: string | null) => void;
  onSelectCandidate: (candidateId: string | null) => void;
  onHoverCandidate: (candidateId: string | null) => void;
  onApplyCandidate: (candidateId: string) => void;
  onApplyAllCandidates: () => void;
  resolvedLevelKeys: string[];
  resolvedLinkKeys: string[];
  savedMeasurements: Drawing['manualMeasurements'];
  measurementCalibrations: Drawing['measurementCalibrations'];
  onAdoptLevelCandidate: (groupId: string, item: { pageNo: number; box: BoundingBox; text: string; value: string | null }) => void;
  onAdoptPlanSectionLink: (callout: string, linkId: string) => void;
  onSaveDistanceMeasurement: (pageNo: number, points: [DrawingMeasurementPoint, DrawingMeasurementPoint]) => void;
  onSavePolygonMeasurement: (pageNo: number, points: DrawingPolygonMeasurement['points']) => void;
  onSetMeasurementCalibration: (pageNo: number, measurementId: string, actualLengthMeters: number) => void;
}

export interface OcrReviewPanelHandle {
  focusAndOpenUpload: () => void;
  focusPanel: () => void;
}

function derivePageItems(items: OcrItem[], pageNo: number) {
  return items.filter((item) => item.pageNo === pageNo);
}

function derivePageCandidates(candidates: AICandidate[], pageNo: number) {
  return candidates.filter((candidate) => candidate.sourcePage === pageNo);
}

function MeasurementCalibrationModal({
  open,
  measurement,
  onClose,
  onConfirm,
}: {
  open: boolean;
  measurement: DrawingDistanceMeasurement | null;
  onClose: () => void;
  onConfirm: (actualLengthMeters: number) => void;
}) {
  const [value, setValue] = useState('');

  useEffect(() => {
    setValue('');
  }, [measurement?.id, open]);

  if (!open || !measurement) return null;

  const numericValue = Number(value);
  const isValid = Number.isFinite(numericValue) && numericValue > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-sm font-semibold text-slate-800">基準寸法を設定</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">
            選んだ距離計測に実寸を与えて、このページの換算基準にします。
          </div>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{measurement.name}</div>
            <div className="mt-1 text-sm text-slate-700">ピクセル距離: {measurement.pixelLength.toFixed(1)} px</div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-800">実寸</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="0.001"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                placeholder="例: 12.400"
              />
              <span className="text-xs text-slate-500">m</span>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={!isValid}
            onClick={() => onConfirm(numericValue)}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            基準寸法として保存
          </button>
        </div>
      </div>
    </div>
  );
}

const OcrReviewPanel = forwardRef<OcrReviewPanelHandle, OcrReviewPanelProps>(function OcrReviewPanel({
  drawings,
  activeDrawingId,
  activeOcrItemId,
  activeCandidateId,
  isUploading,
  uploadError,
  uploadDisabledReason,
  uploadStatusMessage,
  onUploadFile,
  onSelectDrawing,
  onSelectOcrItem,
  onSelectCandidate,
  onHoverCandidate,
  onApplyCandidate,
  onApplyAllCandidates,
  resolvedLevelKeys,
  resolvedLinkKeys,
  savedMeasurements,
  measurementCalibrations,
  onAdoptLevelCandidate,
  onAdoptPlanSectionLink,
  onSaveDistanceMeasurement,
  onSavePolygonMeasurement,
  onSetMeasurementCalibration,
}: OcrReviewPanelProps, ref) {
  const [selectedPageNo, setSelectedPageNo] = useState(1);
  const [zoom, setZoom] = useState(0.45);
  const [measurementMode, setMeasurementMode] = useState<DrawingMeasurementMode>('idle');
  const [draftMeasurementPoints, setDraftMeasurementPoints] = useState<DrawingMeasurementPoint[]>([]);
  const [pendingCalibrationMeasurement, setPendingCalibrationMeasurement] = useState<DrawingDistanceMeasurement | null>(null);
  const [structuredFocusBox, setStructuredFocusBox] = useState<BoundingBox | null>(null);
  const [compareOverlays, setCompareOverlays] = useState<Array<{
    id: string;
    pageNo: number;
    box: BoundingBox;
    label: string;
    tone?: 'amber' | 'emerald' | 'rose';
  }>>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // ─── AI図面解析 state ────────────────────────────────────────────────
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<OcrEnhanceAnalysisResult | null>(null);
  const [aiQuantityResult, setAiQuantityResult] = useState<OcrEnhanceQuantityResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    focusPanel() {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    focusAndOpenUpload() {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => {
        if (!uploadDisabledReason && !isUploading) {
          fileInputRef.current?.click();
        }
      }, 180);
    },
  }), [isUploading, uploadDisabledReason]);

  const activeDrawing = useMemo(
    () => drawings.find((drawing) => drawing.id === activeDrawingId) ?? drawings[0] ?? null,
    [activeDrawingId, drawings],
  );

  useEffect(() => {
    if (!activeDrawing) {
      setSelectedPageNo(1);
      setStructuredFocusBox(null);
      setCompareOverlays([]);
      setPendingCalibrationMeasurement(null);
      return;
    }
    setSelectedPageNo(activeDrawing.pages[0]?.pageNo ?? 1);
    setStructuredFocusBox(null);
    setCompareOverlays([]);
    setMeasurementMode('idle');
    setDraftMeasurementPoints([]);
    setPendingCalibrationMeasurement(null);
  }, [activeDrawing?.id]);

  const activeCandidate = activeDrawing?.aiCandidates.find((candidate) => candidate.id === activeCandidateId) ?? null;
  const activeItem = activeDrawing?.ocrItems.find((item) => item.id === activeOcrItemId) ?? null;

  const handleAiAnalyze = useCallback(async () => {
    if (!activeDrawing || aiAnalyzing) return;
    const page = activeDrawing.pages.find((p) => p.pageNo === selectedPageNo);
    if (!page?.imageUrl) return;

    setAiAnalyzing(true);
    setAiError(null);
    setAiAnalysisResult(null);
    setAiQuantityResult(null);

    try {
      // ページ画像をbase64に変換
      const imgResponse = await fetch(page.imageUrl);
      const blob = await imgResponse.blob();
      const mimeType = blob.type || 'image/png';
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''),
      );

      // 現在のOCRテキストを収集
      const pageOcrItems = activeDrawing.ocrItems.filter((item) => item.pageNo === selectedPageNo);
      const ocrText = pageOcrItems.map((item) => item.text).join('\n');

      // まずOCRテキスト補正を適用
      const correctedLines = ocrText ? await correctOcrText(ocrText.split('\n')) : [];
      const correctedText = correctedLines.join('\n');

      // 並列で図面解析と数量抽出を実行
      const [analysisResult, quantityResult] = await Promise.all([
        analyzeDrawingWithVision({
          imageBase64: base64,
          mimeType,
          ocrText: correctedText || undefined,
          drawingContext: activeDrawing.drawingTitle || activeDrawing.name,
        }),
        extractQuantitiesWithVision({
          imageBase64: base64,
          mimeType,
          ocrText: correctedText || undefined,
          drawingType: activeDrawing.sheetClassification?.sheetTypeName,
        }),
      ]);

      setAiAnalysisResult(analysisResult);
      setAiQuantityResult(quantityResult);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI解析に失敗しました');
    } finally {
      setAiAnalyzing(false);
    }
  }, [activeDrawing, selectedPageNo, aiAnalyzing]);

  useEffect(() => {
    if (activeCandidate) {
      setSelectedPageNo(activeCandidate.sourcePage);
    }
  }, [activeCandidate?.id]);

  useEffect(() => {
    if (activeItem) {
      setSelectedPageNo(activeItem.pageNo);
    }
  }, [activeItem?.id]);

  useEffect(() => {
    if (activeCandidate || activeItem) {
      setStructuredFocusBox(null);
      setCompareOverlays([]);
    }
  }, [activeCandidate?.id, activeItem?.id]);

  const activePage = activeDrawing?.pages.find((page) => page.pageNo === selectedPageNo) ?? null;
  const pageItems = activeDrawing ? derivePageItems(activeDrawing.ocrItems, selectedPageNo) : [];
  const pageCandidates = activeDrawing ? derivePageCandidates(activeDrawing.aiCandidates, selectedPageNo) : [];
  const pageMeasurements = savedMeasurements.filter((measurement) => measurement.pageNo === selectedPageNo);
  const latestMeasurements = [...pageMeasurements].slice(-4).reverse();
  const pageCalibration = findPageCalibration(selectedPageNo, measurementCalibrations);

  const focusBox: BoundingBox | null = structuredFocusBox ?? activeCandidate?.sourceBox ?? activeItem?.box ?? null;

  const handleCanvasPointAdd = (point: DrawingMeasurementPoint) => {
    setStructuredFocusBox(null);
    setCompareOverlays([]);
    onSelectCandidate(null);
    onSelectOcrItem(null);

    setDraftMeasurementPoints((prev) => {
      if (measurementMode === 'distance') {
        if (prev.length >= 2) {
          return [point];
        }
        return [...prev, point];
      }
      if (measurementMode === 'polygon') {
        return [...prev, point];
      }
      return prev;
    });
  };

  const handleActivateMeasurementMode = (mode: DrawingMeasurementMode) => {
    setMeasurementMode((current) => (current === mode ? 'idle' : mode));
    setDraftMeasurementPoints([]);
    setStructuredFocusBox(null);
    setCompareOverlays([]);
  };

  const handleSaveDistanceMeasurement = () => {
    if (!activePage || draftMeasurementPoints.length < 2) return;
    onSaveDistanceMeasurement(activePage.pageNo, [draftMeasurementPoints[0], draftMeasurementPoints[1]]);
    setDraftMeasurementPoints([]);
    setMeasurementMode('idle');
  };

  const handleSavePolygonMeasurement = () => {
    if (!activePage || draftMeasurementPoints.length < 3) return;
    onSavePolygonMeasurement(activePage.pageNo, draftMeasurementPoints);
    setDraftMeasurementPoints([]);
    setMeasurementMode('idle');
  };

  return (
    <div ref={panelRef} className="flex h-full min-h-[720px] flex-col rounded-lg border border-slate-200 bg-white shadow-md">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <FileSearch className="h-4 w-4 text-indigo-600" />
              OCR確認画面
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              図面をアップロードすると、ページ画像、OCR文字、AI候補、根拠 bbox を同時に確認できます。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || Boolean(uploadDisabledReason)}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              title={uploadDisabledReason ?? undefined}
            >
              {isUploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {isUploading ? (uploadStatusMessage || 'OCR解析中...') : '図面をアップロード'}
            </button>
            {activeDrawing && activeDrawing.status === 'ready' && (
              <button
                type="button"
                onClick={handleAiAnalyze}
                disabled={aiAnalyzing}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                title="Gemini Visionで図面をAI解析し、数量・材料を自動抽出します"
              >
                {aiAnalyzing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
                {aiAnalyzing ? 'AI解析中...' : 'AI図面解析'}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onUploadFile(file);
                  event.currentTarget.value = '';
                }
              }}
            />
          </div>
        </div>

        {uploadError && (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {uploadError}
          </div>
        )}

        {!uploadError && uploadDisabledReason && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {uploadDisabledReason}
          </div>
        )}

        {!uploadError && isUploading && uploadStatusMessage && (
          <div className="mt-3 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
            {uploadStatusMessage}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {drawings.length === 0 && (
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              まだ図面はありません。PDF または画像をアップロードしてください。
            </div>
          )}
          {drawings.map((drawing, index) => (
            <button
              key={drawing.id}
              type="button"
              onClick={() => onSelectDrawing(drawing.id)}
              className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                drawing.id === activeDrawing?.id
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-900'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="font-semibold">図面 {index + 1}: {drawing.drawingTitle || drawing.name}</div>
              <div className="mt-1 text-[11px] text-slate-500">
                {drawing.status === 'ready' ? `${drawing.pageCount}ページ / OCR済み` : drawing.status}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid flex-1 gap-3 p-3 xl:grid-cols-[minmax(0,1.35fr)_340px]">
        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <div>
              {activeDrawing ? (
                <>
                  <span className="font-semibold text-slate-800">{activeDrawing.fileName || activeDrawing.name}</span>
                  <span className="ml-2">{activeDrawing.pageCount}ページ</span>
                </>
              ) : '図面未選択'}
            </div>
            <div className="flex items-center gap-2">
              <span>ズーム</span>
              <input
                type="range"
                min={0.2}
                max={1.4}
                step={0.05}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
              />
              <span>{Math.round(zoom * 100)}%</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleActivateMeasurementMode('distance')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  measurementMode === 'distance'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                point-to-point 計測
              </button>
              <button
                type="button"
                onClick={() => handleActivateMeasurementMode('polygon')}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  measurementMode === 'polygon'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                polygon 面積計測
              </button>
              {measurementMode !== 'idle' && (
                <button
                  type="button"
                  onClick={() => {
                    setDraftMeasurementPoints([]);
                    setMeasurementMode('idle');
                  }}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  計測解除
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {measurementMode === 'distance' && (
                <button
                  type="button"
                  onClick={handleSaveDistanceMeasurement}
                  disabled={draftMeasurementPoints.length < 2}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  距離計測を保存
                </button>
              )}
              {measurementMode === 'polygon' && (
                <button
                  type="button"
                  onClick={handleSavePolygonMeasurement}
                  disabled={draftMeasurementPoints.length < 3}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  面積計測を保存
                </button>
              )}
            </div>
          </div>

          {measurementMode !== 'idle' && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
              {measurementMode === 'distance'
                ? '図面上の 2 点を順番にクリックしてください。既に 2 点ある状態で再クリックすると、新しい計測を開始します。'
                : '面積の外周点を順番にクリックしてください。3 点以上で保存できます。'}
            </div>
          )}

          {activeDrawing && activeDrawing.pages.length > 1 && (
            <div className="flex flex-wrap gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
              {activeDrawing.pages.map((page) => (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => {
                    setSelectedPageNo(page.pageNo);
                    onSelectOcrItem(null);
                    onSelectCandidate(null);
                    setDraftMeasurementPoints([]);
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    page.pageNo === selectedPageNo
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  ページ {page.pageNo}
                </button>
              ))}
            </div>
          )}

          <div className="min-h-0 flex-1">
            <OcrCanvas
              page={activePage}
              items={pageItems}
              activeItemId={activeOcrItemId}
              focusBox={focusBox}
              compareOverlays={compareOverlays}
              measurementMode={measurementMode}
              draftMeasurementPoints={draftMeasurementPoints}
              savedMeasurements={pageMeasurements}
              zoom={zoom}
              onSelectItem={onSelectOcrItem}
              onCanvasPointAdd={handleCanvasPointAdd}
            />
          </div>

          <div className="rounded-md border border-slate-200 bg-white px-3 py-3">
            <div className="text-sm font-semibold text-slate-800">手動計測</div>
            <div className="mt-1 text-[11px] leading-5 text-slate-500">
              point-to-point と polygon はページ実寸と図面縮尺、または基準寸法 1 本から m / m² へ換算します。取れない場合は px / px² で止めます。
            </div>
            {pageCalibration && (
              <div className="mt-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
                現在の基準寸法: {pageCalibration.measurementName} / {pageCalibration.actualLengthMeters} m
                <div className="mt-1">このページの距離・面積計測は実長換算され、数量候補へ自動反映されます。</div>
              </div>
            )}
            <div className="mt-3 space-y-2">
              {latestMeasurements.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  このページの保存済み計測はありません。
                </div>
              ) : latestMeasurements.map((measurement) => {
                const measurementPage = activeDrawing?.pages.find((item) => item.pageNo === measurement.pageNo);
                if (!measurementPage || !activeDrawing) return null;
                const summary = measurement.measurementType === 'distance'
                  ? describeDistanceMeasurement(measurement.pixelLength, measurementPage, activeDrawing.resolvedUnits, measurementCalibrations)
                  : describePolygonMeasurement(measurement.pixelArea, measurementPage, activeDrawing.resolvedUnits, measurementCalibrations);
                return (
                  <div key={measurement.id} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-slate-900">{measurement.name}</div>
                      <div className="text-slate-500">{measurement.measurementType === 'distance' ? 'distance' : 'polygon'}</div>
                    </div>
                    <div className="mt-1">{summary.value}</div>
                    <div className="mt-1 text-[11px] text-slate-500">{summary.note}</div>
                    {measurement.measurementType === 'distance' && (
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setPendingCalibrationMeasurement(measurement)}
                          className="rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          基準寸法にする
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── AI図面解析結果パネル ── */}
          {aiError && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              AI解析エラー: {aiError}
            </div>
          )}

          {aiAnalyzing && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Gemini Vision で図面を解析中...
              </div>
              <div className="mt-1 text-xs text-emerald-600">
                図面種別の判定、寸法・材料の読み取り、数量の自動抽出を実行しています。
              </div>
            </div>
          )}

          {aiAnalysisResult && (
            <div className="rounded-md border border-emerald-200 bg-white px-3 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                <BrainCircuit className="h-4 w-4" />
                AI図面解析結果
                <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  信頼度 {Math.round(aiAnalysisResult.confidence * 100)}%
                </span>
              </div>

              <div className="mt-2 space-y-2">
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                  <span className="font-semibold text-slate-800">図面種別:</span>{' '}
                  <span className="text-slate-700">{aiAnalysisResult.drawingType}</span>
                  {aiAnalysisResult.scale && (
                    <>
                      <span className="mx-2 text-slate-300">|</span>
                      <span className="font-semibold text-slate-800">縮尺:</span>{' '}
                      <span className="text-slate-700">{aiAnalysisResult.scale}</span>
                    </>
                  )}
                </div>

                {aiAnalysisResult.dimensions.length > 0 && (
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">寸法情報</div>
                    <div className="mt-1 space-y-1">
                      {aiAnalysisResult.dimensions.map((dim, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-slate-700">
                          <span className="font-semibold">{dim.label}:</span>
                          <span>{dim.value} {dim.unit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {aiAnalysisResult.materials.length > 0 && (
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">材料情報</div>
                    <div className="mt-1 space-y-1">
                      {aiAnalysisResult.materials.map((mat, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                          <span className="font-semibold">{mat.name}</span>
                          {mat.specification && <span className="text-slate-500">({mat.specification})</span>}
                          <span className="ml-auto">{mat.quantity} {mat.unit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {aiAnalysisResult.annotations.length > 0 && (
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">注記・特記事項</div>
                    <div className="mt-1 space-y-1">
                      {aiAnalysisResult.annotations.map((note, i) => (
                        <div key={i} className="text-xs text-slate-700">- {note}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {aiQuantityResult && aiQuantityResult.items.length > 0 && (
            <div className="rounded-md border border-blue-200 bg-white px-3 py-3">
              <div className="text-sm font-semibold text-blue-800">
                AI数量抽出結果
                <span className="ml-2 text-[11px] font-normal text-blue-500">
                  ({aiQuantityResult.items.length}項目)
                </span>
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-blue-100 text-left text-[11px] font-semibold text-blue-600">
                      <th className="pb-1 pr-3">名称</th>
                      <th className="pb-1 pr-3">規格</th>
                      <th className="pb-1 pr-3 text-right">数量</th>
                      <th className="pb-1 pr-3">単位</th>
                      <th className="pb-1 pr-3">根拠</th>
                      <th className="pb-1 text-right">信頼度</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiQuantityResult.items.map((item, i) => (
                      <tr key={i} className="border-b border-slate-100 text-slate-700">
                        <td className="py-1.5 pr-3 font-semibold">{item.name}</td>
                        <td className="py-1.5 pr-3 text-slate-500">{item.specification || '-'}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{item.quantity}</td>
                        <td className="py-1.5 pr-3">{item.unit}</td>
                        <td className="py-1.5 pr-3 text-slate-500">{item.source}</td>
                        <td className="py-1.5 text-right">
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                            item.confidence >= 0.8 ? 'bg-emerald-100 text-emerald-700'
                            : item.confidence >= 0.5 ? 'bg-amber-100 text-amber-700'
                            : 'bg-rose-100 text-rose-700'
                          }`}>
                            {Math.round(item.confidence * 100)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="grid min-h-0 gap-3 xl:grid-rows-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <OcrLineList
            items={pageItems}
            activeItemId={activeOcrItemId}
            onSelectItem={onSelectOcrItem}
          />
          <CandidatePanel
            candidates={pageCandidates}
            activeCandidateId={activeCandidateId}
            onSelectCandidate={onSelectCandidate}
            onHoverCandidate={onHoverCandidate}
            onApplyCandidate={onApplyCandidate}
            onApplyAllCandidates={onApplyAllCandidates}
          />
          <OcrInsightPanel
            drawing={activeDrawing}
            resolvedLevelKeys={resolvedLevelKeys}
            resolvedLinkKeys={resolvedLinkKeys}
            onFocusOverlaySet={(pageNo, box, overlays) => {
              setSelectedPageNo(pageNo);
              setStructuredFocusBox(box);
              setCompareOverlays(overlays);
              onSelectCandidate(null);
              onSelectOcrItem(null);
            }}
            onClearOverlaySet={() => {
              setStructuredFocusBox(null);
              setCompareOverlays([]);
            }}
            onAdoptLevelCandidate={onAdoptLevelCandidate}
            onAdoptPlanSectionLink={onAdoptPlanSectionLink}
          />
        </div>
      </div>

      <MeasurementCalibrationModal
        open={Boolean(pendingCalibrationMeasurement)}
        measurement={pendingCalibrationMeasurement}
        onClose={() => setPendingCalibrationMeasurement(null)}
        onConfirm={(actualLengthMeters) => {
          if (!pendingCalibrationMeasurement) return;
          onSetMeasurementCalibration(
            pendingCalibrationMeasurement.pageNo,
            pendingCalibrationMeasurement.id,
            actualLengthMeters,
          );
          setPendingCalibrationMeasurement(null);
        }}
      />
    </div>
  );
});

export default OcrReviewPanel;
