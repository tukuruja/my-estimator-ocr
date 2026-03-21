import { useMemo } from 'react';
import type { BoundingBox, Drawing, DrawingOcrStructured } from '@/lib/types';

interface FocusOverlay {
  id: string;
  pageNo: number;
  box: BoundingBox;
  label: string;
  tone?: 'amber' | 'emerald' | 'rose';
}

interface OcrInsightPanelProps {
  drawing: Drawing | null;
  onFocusOverlaySet: (pageNo: number, focusBox: BoundingBox, overlays: FocusOverlay[]) => void;
  onClearOverlaySet: () => void;
}

interface ConflictGroup {
  id: string;
  label: string;
  items: Array<{
    id: string;
    pageNo: number;
    box: BoundingBox;
    text: string;
    value: string | null;
    confidence: number;
  }>;
}

function buildLevelConflictGroups(ocrStructured: DrawingOcrStructured | undefined): ConflictGroup[] {
  if (!ocrStructured) return [];
  const candidateMap = new Map<string, ConflictGroup>();
  for (const candidate of ocrStructured.levelCandidates) {
    const key = candidate.token;
    if (!candidateMap.has(key)) {
      candidateMap.set(key, { id: key, label: key, items: [] });
    }
    candidateMap.get(key)?.items.push({
      id: `${key}-${candidate.pageNo}-${candidate.text}`,
      pageNo: candidate.pageNo,
      box: candidate.bbox,
      text: candidate.text,
      value: candidate.value,
      confidence: candidate.confidence,
    });
  }
  for (const candidate of ocrStructured.ambiguousCandidates) {
    const hasLevelWatch = candidate.watchGroup.some((token) => ['GL', 'GI', 'G1', 'FH', 'EL', 'FL'].includes(token));
    if (!hasLevelWatch) continue;
    const key = candidate.watchGroup.join(' / ');
    if (!candidateMap.has(key)) {
      candidateMap.set(key, { id: key, label: key, items: [] });
    }
    candidateMap.get(key)?.items.push({
      id: `${key}-${candidate.pageNo}-${candidate.text}`,
      pageNo: candidate.pageNo,
      box: candidate.bbox,
      text: candidate.text,
      value: null,
      confidence: candidate.confidence,
    });
  }
  return Array.from(candidateMap.values())
    .map((group) => ({
      ...group,
      items: group.items.sort((a, b) => b.confidence - a.confidence),
    }))
    .filter((group) => group.items.length > 0)
    .sort((a, b) => b.items.length - a.items.length);
}

export default function OcrInsightPanel({ drawing, onFocusOverlaySet, onClearOverlaySet }: OcrInsightPanelProps) {
  const ocrStructured = drawing?.ocrStructured;
  const levelConflictGroups = useMemo(() => buildLevelConflictGroups(ocrStructured), [ocrStructured]);
  const planSectionLinks = ocrStructured?.planSectionLinks ?? [];

  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-800">bbox 比較 / 図面リンク</div>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">
            GL/FH/EL 競合候補や平面図と断面図/詳細図のリンク候補を bbox 単位で確認します。
          </p>
        </div>
        <button
          type="button"
          onClick={onClearOverlaySet}
          className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          ハイライト解除
        </button>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">高さラベル競合</div>
        {levelConflictGroups.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            GL / FH / EL の競合候補は見つかっていません。
          </div>
        ) : (
          levelConflictGroups.slice(0, 6).map((group) => (
            <div key={group.id} className="rounded-md border border-amber-200 bg-amber-50 p-2">
              <div className="mb-2 text-xs font-semibold text-amber-900">{group.label}</div>
              <div className="space-y-2">
                {group.items.slice(0, 4).map((item, index) => {
                  const overlays = group.items.map((entry, overlayIndex) => ({
                    id: entry.id,
                    pageNo: entry.pageNo,
                    box: entry.box,
                    label: `${group.label} ${overlayIndex + 1}`,
                    tone: overlayIndex === index ? 'rose' as const : 'amber' as const,
                  }));
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onFocusOverlaySet(item.pageNo, item.box, overlays)}
                      className="w-full rounded border border-amber-300 bg-white px-2 py-2 text-left text-xs text-slate-700 hover:bg-amber-100"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">p.{item.pageNo}</span>
                        <span className="text-slate-500">{Math.round(item.confidence * 100)}%</span>
                      </div>
                      <div className="mt-1 line-clamp-2">{item.text}</div>
                      {item.value && <div className="mt-1 text-[11px] text-slate-500">値: {item.value}</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">平面図 / 断面図 / 詳細図 リンク</div>
        {planSectionLinks.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            参照記号ベースの図面リンクはまだ見つかっていません。
          </div>
        ) : (
          planSectionLinks.slice(0, 8).map((link) => (
            <div key={link.id} className="rounded-md border border-emerald-200 bg-emerald-50 p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-emerald-900">{link.callout}</div>
                <div className="text-[11px] text-emerald-800">{Math.round(link.confidence * 100)}%</div>
              </div>
              <div className="mt-1 text-[11px] text-slate-600">{link.reasons.join(' / ')}</div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => onFocusOverlaySet(link.sourcePageNo, link.sourceBox, [
                    { id: `${link.id}-source`, pageNo: link.sourcePageNo, box: link.sourceBox, label: `${link.callout} source`, tone: 'emerald' },
                    { id: `${link.id}-target`, pageNo: link.targetPageNo, box: link.targetBox, label: `${link.callout} target`, tone: 'amber' },
                  ])}
                  className="rounded border border-emerald-300 bg-white px-2 py-2 text-left text-xs hover:bg-emerald-100"
                >
                  <div className="font-semibold text-slate-900">{link.sourceRole} p.{link.sourcePageNo}</div>
                  <div className="mt-1 line-clamp-2 text-slate-700">{link.sourceText}</div>
                </button>
                <button
                  type="button"
                  onClick={() => onFocusOverlaySet(link.targetPageNo, link.targetBox, [
                    { id: `${link.id}-source`, pageNo: link.sourcePageNo, box: link.sourceBox, label: `${link.callout} source`, tone: 'emerald' },
                    { id: `${link.id}-target`, pageNo: link.targetPageNo, box: link.targetBox, label: `${link.callout} target`, tone: 'amber' },
                  ])}
                  className="rounded border border-emerald-300 bg-white px-2 py-2 text-left text-xs hover:bg-emerald-100"
                >
                  <div className="font-semibold text-slate-900">{link.targetRole} p.{link.targetPageNo}</div>
                  <div className="mt-1 line-clamp-2 text-slate-700">{link.targetText}</div>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
