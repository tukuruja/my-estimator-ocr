import { useMemo } from 'react';
import type { BoundingBox, Drawing } from '@/lib/types';
import {
  buildLevelConflictGroups,
  groupPlanSectionLinksByCallout,
  type LevelConflictItem,
} from '@/lib/ocrInsights';

interface FocusOverlay {
  id: string;
  pageNo: number;
  box: BoundingBox;
  label: string;
  tone?: 'amber' | 'emerald' | 'rose';
}

interface OcrInsightPanelProps {
  drawing: Drawing | null;
  resolvedLevelKeys: string[];
  resolvedLinkKeys: string[];
  onFocusOverlaySet: (pageNo: number, focusBox: BoundingBox, overlays: FocusOverlay[]) => void;
  onClearOverlaySet: () => void;
  onAdoptLevelCandidate: (groupId: string, item: LevelConflictItem) => void;
  onAdoptPlanSectionLink: (callout: string, linkId: string) => void;
}

export default function OcrInsightPanel({
  drawing,
  resolvedLevelKeys,
  resolvedLinkKeys,
  onFocusOverlaySet,
  onClearOverlaySet,
  onAdoptLevelCandidate,
  onAdoptPlanSectionLink,
}: OcrInsightPanelProps) {
  const ocrStructured = drawing?.ocrStructured;
  const levelConflictGroups = useMemo(
    () => buildLevelConflictGroups(ocrStructured).filter((group) => !resolvedLevelKeys.includes(group.id)),
    [ocrStructured, resolvedLevelKeys],
  );
  const planSectionLinkGroups = useMemo(
    () => groupPlanSectionLinksByCallout(ocrStructured).filter((group) => !resolvedLinkKeys.includes(group.callout)),
    [ocrStructured, resolvedLinkKeys],
  );

  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-800">bbox 比較 / 図面リンク</div>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">
            GL/FH/EL 競合候補や平面図と断面図/詳細図のリンク候補を bbox 単位で確認し、そのまま採用できます。
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
            GL / FH / EL の未解決候補はありません。
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
                    <div key={item.id} className="rounded border border-amber-300 bg-white px-2 py-2 text-xs text-slate-700">
                      <button
                        type="button"
                        onClick={() => onFocusOverlaySet(item.pageNo, item.box, overlays)}
                        className="w-full text-left hover:text-slate-900"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">p.{item.pageNo}</span>
                          <span className="text-slate-500">{Math.round(item.confidence * 100)}%</span>
                        </div>
                        <div className="mt-1 line-clamp-2">{item.text}</div>
                        {item.value && <div className="mt-1 text-[11px] text-slate-500">値: {item.value}</div>}
                      </button>
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => onAdoptLevelCandidate(group.id, item)}
                          className="rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-700"
                        >
                          採用内容を確認
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">平面図 / 断面図 / 詳細図 リンク</div>
        {planSectionLinkGroups.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            未解決の図面リンク候補はありません。
          </div>
        ) : (
          planSectionLinkGroups.slice(0, 8).map(({ callout, links }) => (
            <div key={callout} className="rounded-md border border-emerald-200 bg-emerald-50 p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-emerald-900">{callout}</div>
                <div className="text-[11px] text-emerald-800">{links.length} 候補</div>
              </div>
              <div className="mt-2 space-y-2">
                {links.slice(0, 4).map((link) => (
                  <div key={link.id} className="rounded border border-emerald-300 bg-white p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-emerald-900">{Math.round(link.confidence * 100)}%</div>
                      <button
                        type="button"
                        onClick={() => onAdoptPlanSectionLink(callout, link.id)}
                        className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                      >
                        このリンクを採用
                      </button>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-600">{link.reasons.join(' / ')}</div>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => onFocusOverlaySet(link.sourcePageNo, link.sourceBox, [
                          { id: `${link.id}-source`, pageNo: link.sourcePageNo, box: link.sourceBox, label: `${callout} source`, tone: 'emerald' },
                          { id: `${link.id}-target`, pageNo: link.targetPageNo, box: link.targetBox, label: `${callout} target`, tone: 'amber' },
                        ])}
                        className="rounded border border-emerald-300 bg-white px-2 py-2 text-left text-xs hover:bg-emerald-100"
                      >
                        <div className="font-semibold text-slate-900">{link.sourceRole} p.{link.sourcePageNo}</div>
                        <div className="mt-1 line-clamp-2 text-slate-700">{link.sourceText}</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onFocusOverlaySet(link.targetPageNo, link.targetBox, [
                          { id: `${link.id}-source`, pageNo: link.sourcePageNo, box: link.sourceBox, label: `${callout} source`, tone: 'emerald' },
                          { id: `${link.id}-target`, pageNo: link.targetPageNo, box: link.targetBox, label: `${callout} target`, tone: 'amber' },
                        ])}
                        className="rounded border border-emerald-300 bg-white px-2 py-2 text-left text-xs hover:bg-emerald-100"
                      >
                        <div className="font-semibold text-slate-900">{link.targetRole} p.{link.targetPageNo}</div>
                        <div className="mt-1 line-clamp-2 text-slate-700">{link.targetText}</div>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
