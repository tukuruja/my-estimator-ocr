import { useState, useRef, useEffect, useMemo, MouseEvent } from 'react';
import { calculateDistancePixels, calculatePolygonAreaPixels, polygonMeasurementToPath } from '@/lib/ocrMeasurements';
import type { BoundingBox, DrawingManualMeasurement, DrawingMeasurementMode, DrawingMeasurementPoint, DrawingPage, OcrItem, OcrStampStatus } from '@/lib/types';

interface CompareOverlay {
  id: string;
  pageNo: number;
  box: BoundingBox;
  label: string;
  tone?: 'amber' | 'emerald' | 'rose';
}

interface OcrCanvasProps {
  page: DrawingPage | null;
  items: OcrItem[];
  activeItemId: string | null;
  focusBox: BoundingBox | null;
  compareOverlays?: CompareOverlay[];
  measurementMode?: DrawingMeasurementMode;
  draftMeasurementPoints?: DrawingMeasurementPoint[];
  savedMeasurements?: DrawingManualMeasurement[];
  zoom: number;
  stampStatuses?: Record<string, OcrStampStatus>;
  onSelectItem: (itemId: string | null) => void;
  onCanvasPointAdd?: (point: DrawingMeasurementPoint) => void;
  onStampStatusChange?: (itemId: string, status: OcrStampStatus) => void;
}

function getRect(box: BoundingBox) {
  const xs = [box[0], box[2], box[4], box[6]];
  const ys = [box[1], box[3], box[5], box[7]];
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

/** スタンプ状態に応じたスタイルを返す */
function getStampStyle(status: OcrStampStatus, isActive: boolean) {
  if (isActive) {
    return 'border-blue-600 bg-blue-500/20 shadow-[0_0_0_2px_rgba(37,99,235,0.25)]';
  }
  switch (status) {
    case 'adopted':
      return 'border-emerald-500 bg-emerald-400/25 shadow-[0_0_0_1px_rgba(16,185,129,0.3)]';
    case 'pending':
      return 'border-amber-500 bg-amber-400/25 shadow-[0_0_0_1px_rgba(245,158,11,0.3)]';
    case 'excluded':
      return 'border-rose-500 bg-rose-400/20 opacity-50 shadow-[0_0_0_1px_rgba(239,68,68,0.3)]';
    default:
      return 'border-sky-500/70 bg-sky-400/10 hover:bg-sky-400/20';
  }
}

/** スタンプ状態ラベル */
const STAMP_LABEL: Record<OcrStampStatus, string> = {
  adopted: '採用',
  pending: '保留',
  excluded: '除外',
  none: '',
};

/** スタンプ状態ラベルの色 */
const STAMP_LABEL_COLOR: Record<OcrStampStatus, string> = {
  adopted: 'bg-emerald-600',
  pending: 'bg-amber-500',
  excluded: 'bg-rose-600',
  none: '',
};

/** 次のスタンプ状態（サイクル） */
function nextStampStatus(current: OcrStampStatus): OcrStampStatus {
  const cycle: OcrStampStatus[] = ['none', 'adopted', 'pending', 'excluded'];
  const idx = cycle.indexOf(current);
  return cycle[(idx + 1) % cycle.length];
}

/** スタンプコンテキストメニュー */
function StampContextMenu({
  x,
  y,
  itemId,
  current,
  onSelect,
  onClose,
}: {
  x: number;
  y: number;
  itemId: string;
  current: OcrStampStatus;
  onSelect: (itemId: string, status: OcrStampStatus) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const options: { status: OcrStampStatus; label: string; color: string; desc: string }[] = [
    { status: 'adopted', label: '採用', color: 'text-emerald-700', desc: '確定数量として見積に採用' },
    { status: 'pending', label: '保留', color: 'text-amber-700', desc: '要確認・概算として保留' },
    { status: 'excluded', label: '除外', color: 'text-rose-700', desc: '見積から除外（根拠不足）' },
    { status: 'none', label: 'マーク解除', color: 'text-slate-600', desc: 'スタンプをリセット' },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
      style={{ left: x, top: y }}
    >
      <div className="border-b border-slate-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        スタンプ設定
      </div>
      {options.map((opt) => (
        <button
          key={opt.status}
          type="button"
          onClick={() => {
            onSelect(itemId, opt.status);
            onClose();
          }}
          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50 ${opt.color} ${current === opt.status ? 'font-semibold' : ''}`}
        >
          <span className="flex-1">{opt.label}</span>
          <span className="text-[10px] text-slate-400">{opt.desc}</span>
          {current === opt.status && <span className="text-[10px]">✓</span>}
        </button>
      ))}
    </div>
  );
}

export default function OcrCanvas({
  page,
  items,
  activeItemId,
  focusBox,
  compareOverlays = [],
  measurementMode = 'idle',
  draftMeasurementPoints = [],
  savedMeasurements = [],
  zoom,
  stampStatuses = {},
  onSelectItem,
  onCanvasPointAdd,
  onStampStatusChange,
}: OcrCanvasProps) {
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  const imageLayerRef = useRef<HTMLDivElement | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemId: string } | null>(null);

  const activeItem = useMemo(
    () => items.find((item) => item.id === activeItemId) ?? null,
    [activeItemId, items],
  );

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }, [activeItemId, focusBox]);

  if (!page) {
    return (
      <div className="flex h-full min-h-[260px] items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        図面をアップロードすると、ここにプレビューと OCR の枠が表示されます。
      </div>
    );
  }

  const scaledWidth = page.width * zoom;
  const scaledHeight = page.height * zoom;
  const pageCompareOverlays = compareOverlays.filter((overlay) => overlay.pageNo === page.pageNo);
  const measurementEnabled = measurementMode !== 'idle';
  const pageMeasurements = savedMeasurements.filter((measurement) => measurement.pageNo === page.pageNo);
  const draftDistance = draftMeasurementPoints.length >= 2
    ? calculateDistancePixels(draftMeasurementPoints[0], draftMeasurementPoints[1])
    : null;
  const draftPolygonArea = draftMeasurementPoints.length >= 3
    ? calculatePolygonAreaPixels(draftMeasurementPoints)
    : null;

  const handleCanvasClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!measurementEnabled || !page || !onCanvasPointAdd || !imageLayerRef.current) return;
    const bounds = imageLayerRef.current.getBoundingClientRect();
    const offsetX = event.clientX - bounds.left;
    const offsetY = event.clientY - bounds.top;
    const x = Math.min(page.width, Math.max(0, offsetX / zoom));
    const y = Math.min(page.height, Math.max(0, offsetY / zoom));
    onCanvasPointAdd({ x, y });
  };

  const handleItemRightClick = (event: MouseEvent<HTMLButtonElement>, itemId: string) => {
    if (measurementEnabled) return;
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, itemId });
  };

  const handleItemDoubleClick = (event: MouseEvent<HTMLButtonElement>, itemId: string) => {
    if (measurementEnabled || !onStampStatusChange) return;
    event.stopPropagation();
    const current = stampStatuses[itemId] ?? 'none';
    onStampStatusChange(itemId, nextStampStatus(current));
  };

  // スタンプ凡例の集計
  const adoptedCount = items.filter((item) => stampStatuses[item.id] === 'adopted').length;
  const pendingCount = items.filter((item) => stampStatuses[item.id] === 'pending').length;
  const excludedCount = items.filter((item) => stampStatuses[item.id] === 'excluded').length;

  return (
    <div className="flex h-full flex-col gap-1">
      {/* スタンプ凡例 */}
      {onStampStatusChange && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px]">
          <span className="font-semibold text-slate-600">スタンプ:</span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border border-emerald-500 bg-emerald-400/30" />
            <span className="text-emerald-700">採用 {adoptedCount}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border border-amber-500 bg-amber-400/30" />
            <span className="text-amber-700">保留 {pendingCount}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border border-rose-500 bg-rose-400/20 opacity-60" />
            <span className="text-rose-700">除外 {excludedCount}</span>
          </span>
          <span className="ml-auto text-slate-400">右クリックまたはダブルクリックでスタンプ設定</span>
        </div>
      )}

      <div className="h-full overflow-auto rounded-md border border-slate-200 bg-slate-100">
        <div className="min-h-full min-w-full p-3">
          <div
            ref={imageLayerRef}
            className={`relative mx-auto rounded-md bg-white shadow-sm ${measurementEnabled ? 'cursor-crosshair' : ''}`}
            style={{ width: scaledWidth, height: scaledHeight }}
            onClick={handleCanvasClick}
          >
            <img
              src={page.imageUrl}
              alt={`OCRプレビュー ${page.pageNo}ページ`}
              className="absolute inset-0 h-full w-full rounded-md object-fill"
            />

            {items.map((item) => {
              const rect = getRect(item.box);
              const isActive = item.id === activeItemId;
              const stampStatus = stampStatuses[item.id] ?? 'none';
              const stampLabel = STAMP_LABEL[stampStatus];
              const stampLabelColor = STAMP_LABEL_COLOR[stampStatus];

              return (
                <button
                  key={item.id}
                  ref={isActive ? activeItemRef : null}
                  type="button"
                  aria-label={item.text}
                  title={`${item.text}${stampStatus !== 'none' ? ` [${stampLabel}]` : ''}\n右クリック: スタンプ設定 / ダブルクリック: 状態切替`}
                  onClick={() => onSelectItem(item.id)}
                  onDoubleClick={(e) => handleItemDoubleClick(e, item.id)}
                  onContextMenu={(e) => handleItemRightClick(e, item.id)}
                  className={`absolute rounded-sm border transition-all ${getStampStyle(stampStatus, isActive)} ${measurementEnabled ? 'pointer-events-none' : ''}`}
                  style={{
                    left: rect.left * zoom,
                    top: rect.top * zoom,
                    width: rect.width * zoom,
                    height: rect.height * zoom,
                  }}
                >
                  {/* スタンプラベル */}
                  {stampStatus !== 'none' && (
                    <div
                      className={`pointer-events-none absolute -top-4 left-0 rounded px-1 py-0.5 text-[9px] font-bold text-white ${stampLabelColor}`}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {stampLabel}
                    </div>
                  )}
                </button>
              );
            })}

            {focusBox && (
              <div
                className="pointer-events-none absolute rounded-md border-2 border-fuchsia-500 bg-fuchsia-400/15 shadow-[0_0_0_3px_rgba(217,70,239,0.18)]"
                style={{
                  left: getRect(focusBox).left * zoom,
                  top: getRect(focusBox).top * zoom,
                  width: getRect(focusBox).width * zoom,
                  height: getRect(focusBox).height * zoom,
                }}
              />
            )}

            {pageCompareOverlays.map((overlay, index) => {
              const rect = getRect(overlay.box);
              const toneClass = overlay.tone === 'emerald'
                ? 'border-emerald-500 bg-emerald-400/10'
                : overlay.tone === 'rose'
                  ? 'border-rose-500 bg-rose-400/10'
                  : 'border-amber-500 bg-amber-300/10';
              return (
                <div
                  key={overlay.id}
                  className={`pointer-events-none absolute rounded-md border-2 ${toneClass}`}
                  style={{
                    left: rect.left * zoom,
                    top: rect.top * zoom,
                    width: rect.width * zoom,
                    height: rect.height * zoom,
                  }}
                >
                  <div className="absolute -top-5 left-0 rounded bg-slate-900/85 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {index + 1}. {overlay.label}
                  </div>
                </div>
              );
            })}

            <svg
              className="pointer-events-none absolute inset-0"
              viewBox={`0 0 ${scaledWidth} ${scaledHeight}`}
              preserveAspectRatio="none"
            >
              {pageMeasurements.map((measurement) => {
                if (measurement.measurementType === 'distance') {
                  const [start, end] = measurement.points;
                  return (
                    <g key={measurement.id}>
                      <line
                        x1={start.x * zoom}
                        y1={start.y * zoom}
                        x2={end.x * zoom}
                        y2={end.y * zoom}
                        stroke="#0f766e"
                        strokeWidth={2}
                      />
                      {[start, end].map((point, index) => (
                        <circle
                          key={`${measurement.id}-${index}`}
                          cx={point.x * zoom}
                          cy={point.y * zoom}
                          r={4}
                          fill="#0f766e"
                        />
                      ))}
                    </g>
                  );
                }
                return (
                  <g key={measurement.id}>
                    <path
                      d={`${polygonMeasurementToPath(measurement.points, zoom)} Z`}
                      fill="rgba(79,70,229,0.14)"
                      stroke="#4f46e5"
                      strokeWidth={2}
                    />
                    {measurement.points.map((point, index) => (
                      <circle
                        key={`${measurement.id}-${index}`}
                        cx={point.x * zoom}
                        cy={point.y * zoom}
                        r={4}
                        fill="#4f46e5"
                      />
                    ))}
                  </g>
                );
              })}

              {draftMeasurementPoints.length >= 2 && measurementMode === 'distance' && (
                <line
                  x1={draftMeasurementPoints[0].x * zoom}
                  y1={draftMeasurementPoints[0].y * zoom}
                  x2={draftMeasurementPoints[1].x * zoom}
                  y2={draftMeasurementPoints[1].y * zoom}
                  stroke="#ea580c"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                />
              )}

              {draftMeasurementPoints.length >= 2 && measurementMode === 'polygon' && (
                <path
                  d={polygonMeasurementToPath(draftMeasurementPoints, zoom)}
                  fill={draftMeasurementPoints.length >= 3 ? 'rgba(249,115,22,0.12)' : 'none'}
                  stroke="#ea580c"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                />
              )}

              {draftMeasurementPoints.map((point, index) => (
                <circle
                  key={`draft-${index}`}
                  cx={point.x * zoom}
                  cy={point.y * zoom}
                  r={4}
                  fill="#ea580c"
                />
              ))}
            </svg>

            {measurementEnabled && (
              <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-slate-900/85 px-2.5 py-2 text-[11px] leading-5 text-white">
                {measurementMode === 'distance' ? '2点をクリックして距離を計測します。' : '頂点を順番にクリックして面積を計測します。'}
                {draftDistance !== null && measurementMode === 'distance' ? (
                  <div className="mt-1 font-semibold">仮距離: {draftDistance.toFixed(1)} px</div>
                ) : null}
                {draftPolygonArea !== null && measurementMode === 'polygon' ? (
                  <div className="mt-1 font-semibold">仮面積: {draftPolygonArea.toFixed(1)} px²</div>
                ) : null}
              </div>
            )}

            {activeItem && !focusBox && (
              <div
                className="pointer-events-none absolute rounded-md border-2 border-blue-600"
                style={{
                  left: getRect(activeItem.box).left * zoom,
                  top: getRect(activeItem.box).top * zoom,
                  width: getRect(activeItem.box).width * zoom,
                  height: getRect(activeItem.box).height * zoom,
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* コンテキストメニュー */}
      {contextMenu && (
        <StampContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          itemId={contextMenu.itemId}
          current={stampStatuses[contextMenu.itemId] ?? 'none'}
          onSelect={(itemId, status) => {
            onStampStatusChange?.(itemId, status);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
