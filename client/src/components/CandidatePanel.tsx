import type { AICandidate } from '@/lib/types';

interface CandidatePanelProps {
  candidates: AICandidate[];
  activeCandidateId: string | null;
  onSelectCandidate: (candidateId: string | null) => void;
  onHoverCandidate: (candidateId: string | null) => void;
  onApplyCandidate: (candidateId: string) => void;
  onApplyAllCandidates: () => void;
}

function renderCandidateValue(candidate: AICandidate) {
  if (candidate.valueType === 'number') {
    return candidate.valueNumber ?? candidate.valueText ?? '-';
  }
  return candidate.valueText ?? candidate.valueNumber ?? '-';
}

export default function CandidatePanel({
  candidates,
  activeCandidateId,
  onSelectCandidate,
  onHoverCandidate,
  onApplyCandidate,
  onApplyAllCandidates,
}: CandidatePanelProps) {
  const reviewCount = candidates.filter((candidate) => candidate.requiresReview).length;
  const safeCount = candidates.filter((candidate) => !candidate.requiresReview).length;

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2">
        <div>
          <div className="text-sm font-semibold text-slate-800">AI候補</div>
          <p className="text-[11px] leading-4 text-slate-500">
            候補を選ぶと根拠 bbox を強調します。要確認の候補は一括反映されません。
          </p>
        </div>
        <button
          type="button"
          onClick={onApplyAllCandidates}
          disabled={safeCount === 0}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          安全候補を一括反映
        </button>
      </div>

      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-[11px] text-slate-500">
        <span>候補 {candidates.length} 件</span>
        <span>自動反映可 {safeCount} 件</span>
        <span>要確認 {reviewCount} 件</span>
      </div>

      <div className="max-h-[280px] space-y-2 overflow-auto p-2">
        {candidates.length === 0 && (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            図面を解析すると、項目候補がここに表示されます。
          </div>
        )}

        {candidates.map((candidate) => {
          const isActive = candidate.id === activeCandidateId;
          return (
            <div
              key={candidate.id}
              className={`rounded-md border p-3 transition-colors ${
                isActive ? 'border-fuchsia-300 bg-fuchsia-50' : 'border-slate-200 bg-slate-50'
              }`}
              onMouseEnter={() => onHoverCandidate(candidate.id)}
              onMouseLeave={() => onHoverCandidate(null)}
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onSelectCandidate(candidate.id)}
                  className="text-left"
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {candidate.label}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{renderCandidateValue(candidate)}</div>
                </button>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-700">
                    {Math.round(candidate.confidence * 100)}%
                  </span>
                  {candidate.requiresReview && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                      要確認
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-2 text-xs text-slate-600">
                <div>根拠: {candidate.sourceText}</div>
                <div className="mt-1">判断理由: {candidate.reason}</div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-[11px] text-slate-500">ページ {candidate.sourcePage}</div>
                <button
                  type="button"
                  onClick={() => onApplyCandidate(candidate.id)}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
                >
                  この候補を反映
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
