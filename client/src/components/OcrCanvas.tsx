import { useEffect, useMemo, useRef } from 'react';
import type { BoundingBox, DrawingPage, OcrItem } from '@/lib/types';

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
  zoom: number;
  onSelectItem: (itemId: string | null) => void;
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

export default function OcrCanvas({ page, items, activeItemId, focusBox, compareOverlays = [], zoom, onSelectItem }: OcrCanvasProps) {
  const activeItemRef = useRef<HTMLButtonElement | null>(null);

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

  return (
    <div className="h-full overflow-auto rounded-md border border-slate-200 bg-slate-100">
      <div className="min-h-full min-w-full p-3">
        <div className="relative mx-auto rounded-md bg-white shadow-sm" style={{ width: scaledWidth, height: scaledHeight }}>
          <img
            src={page.imageUrl}
            alt={`OCRプレビュー ${page.pageNo}ページ`}
            className="absolute inset-0 h-full w-full rounded-md object-fill"
          />

          {items.map((item) => {
            const rect = getRect(item.box);
            const isActive = item.id === activeItemId;
            return (
              <button
                key={item.id}
                ref={isActive ? activeItemRef : null}
                type="button"
                aria-label={item.text}
                onClick={() => onSelectItem(item.id)}
                className={`absolute rounded-sm border transition-all ${
                  isActive
                    ? 'border-blue-600 bg-blue-500/20 shadow-[0_0_0_2px_rgba(37,99,235,0.25)]'
                    : 'border-sky-500/70 bg-sky-400/10 hover:bg-sky-400/20'
                }`}
                style={{
                  left: rect.left * zoom,
                  top: rect.top * zoom,
                  width: rect.width * zoom,
                  height: rect.height * zoom,
                }}
              />
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
  );
}
