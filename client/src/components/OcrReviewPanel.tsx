import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { FileSearch, LoaderCircle, Upload } from 'lucide-react';
import {
  describeDistanceMeasurement,
  describePolygonMeasurement,
} from '@/lib/ocrMeasurements';
import type {
  AICandidate,
  BoundingBox,
  Drawing,
  DrawingMeasurementMode,
  DrawingMeasurementPoint,
  DrawingPolygonMeasurement,
  OcrItem,
} from '@/lib/types';
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
  onAdoptLevelCandidate: (groupId: string, item: { pageNo: number; box: BoundingBox; text: string; value: string | null }) => void;
  onAdoptPlanSectionLink: (callout: string, linkId: string) => void;
  onSaveDistanceMeasurement: (pageNo: number, points: [DrawingMeasurementPoint, DrawingMeasurementPoint]) => void;
  onSavePolygonMeasurement: (pageNo: number, points: DrawingPolygonMeasurement['points']) => void;
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
  onAdoptLevelCandidate,
  onAdoptPlanSectionLink,
  onSaveDistanceMeasurement,
  onSavePolygonMeasurement,
}: OcrReviewPanelProps, ref) {
  const [selectedPageNo, setSelectedPageNo] = useState(1);
  const [zoom, setZoom] = useState(0.45);
  const [measurementMode, setMeasurementMode] = useState<DrawingMeasurementMode>('idle');
  const [draftMeasurementPoints, setDraftMeasurementPoints] = useState<DrawingMeasurementPoint[]>([]);
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
      return;
    }
      setSelectedPageNo(activeDrawing.pages[0]?.pageNo ?? 1);
      setStructuredFocusBox(null);
      setCompareOverlays([]);
      setMeasurementMode('idle');
      setDraftMeasurementPoints([]);
  }, [activeDrawing?.id]);

  const activeCandidate = activeDrawing?.aiCandidates.find((candidate) => candidate.id === activeCandidateId) ?? null;
  const activeItem = activeDrawing?.ocrItems.find((item) => item.id === activeOcrItemId) ?? null;

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
              point-to-point と polygon はページ実寸と図面縮尺が取れたときだけ m / m² へ換算します。取れない場合は px / px² で止めます。
            </div>
            <div className="mt-3 space-y-2">
              {latestMeasurements.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  このページの保存済み計測はありません。
                </div>
              ) : latestMeasurements.map((measurement) => {
                const measurementPage = activeDrawing?.pages.find((item) => item.pageNo === measurement.pageNo);
                if (!measurementPage || !activeDrawing) return null;
                const summary = measurement.measurementType === 'distance'
                  ? describeDistanceMeasurement(measurement.pixelLength, measurementPage, activeDrawing.resolvedUnits)
                  : describePolygonMeasurement(measurement.pixelArea, measurementPage, activeDrawing.resolvedUnits);
                return (
                  <div key={measurement.id} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-slate-900">{measurement.name}</div>
                      <div className="text-slate-500">{measurement.measurementType === 'distance' ? 'distance' : 'polygon'}</div>
                    </div>
                    <div className="mt-1">{summary.value}</div>
                    <div className="mt-1 text-[11px] text-slate-500">{summary.note}</div>
                  </div>
                );
              })}
            </div>
          </div>
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
    </div>
  );
});

export default OcrReviewPanel;
