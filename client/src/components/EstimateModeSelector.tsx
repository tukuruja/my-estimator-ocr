import { CheckCircle2, AlertTriangle, ListChecks, ChevronDown, ChevronUp } from 'lucide-react';
import type { EstimateOutputMode, GeneratedReportBundle } from '@/lib/types';

interface EstimateModeSelectorProps {
  currentMode: EstimateOutputMode;
  bundle: GeneratedReportBundle;
  onChange: (mode: EstimateOutputMode) => void;
  isOpen: boolean;
  onToggle: () => void;
}

interface ModeOption {
  value: EstimateOutputMode;
  label: string;
  sublabel: string;
  description: string;
  icon: React.ReactNode;
  colorClass: string;
  borderClass: (selected: boolean) => string;
  badgeClass: string;
  recommended?: boolean;
}

export default function EstimateModeSelector({ currentMode, bundle, onChange, isOpen, onToggle }: EstimateModeSelectorProps) {
  const ms = bundle.modeSummary;

  const options: ModeOption[] = [
    {
      value: 'confirmed',
      label: '確定版',
      sublabel: '確信度 80% 以上のみ',
      description: '確実に読み取れた数量だけで見積を組みます。事故らない最小見積。根拠が薄い行は除外されます。',
      icon: <CheckCircle2 className="h-5 w-5" />,
      colorClass: 'text-emerald-700',
      borderClass: (selected) => selected
        ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-400/40'
        : 'border-slate-200 hover:border-emerald-300',
      badgeClass: 'bg-emerald-100 text-emerald-800',
      recommended: true,
    },
    {
      value: 'pending',
      label: '保留版',
      sublabel: '確信度 50% 以上を採用',
      description: '概算として使える範囲まで広げた見積。保留フラグ付きで出力されます。発注前の概算検討に適しています。',
      icon: <AlertTriangle className="h-5 w-5" />,
      colorClass: 'text-amber-700',
      borderClass: (selected) => selected
        ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-400/40'
        : 'border-slate-200 hover:border-amber-300',
      badgeClass: 'bg-amber-100 text-amber-800',
    },
    {
      value: 'full',
      label: '全出力版',
      sublabel: '読み取り結果をすべて出力',
      description: '確信度に関わらず全行を出力します。要確認フラグ付き。最大網羅版ですが未確定数量が多く含まれます。',
      icon: <ListChecks className="h-5 w-5" />,
      colorClass: 'text-violet-700',
      borderClass: (selected) => selected
        ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-400/40'
        : 'border-slate-200 hover:border-violet-300',
      badgeClass: 'bg-violet-100 text-violet-800',
    },
  ];

  const countForMode = (m: EstimateOutputMode): number => {
    if (!ms) return bundle.estimateRows.length;
    if (m === 'confirmed') return ms.confirmedCount;
    if (m === 'pending') return ms.confirmedCount + ms.pendingCount;
    return ms.fullCount;
  };

  const amountForMode = (m: EstimateOutputMode): number => {
    if (!ms) return bundle.summary.totalAmount;
    if (m === 'confirmed') return ms.confirmedAmount;
    if (m === 'pending') return ms.confirmedAmount + ms.pendingAmount;
    return ms.fullAmount;
  };

  const currentOption = options.find((opt) => opt.value === currentMode)!;

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* ヘッダー（常時表示） */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-indigo-600" />
          <div className="text-sm font-semibold text-slate-800">見積出力モード</div>
          <div className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            currentMode === 'confirmed' ? 'bg-emerald-100 text-emerald-800'
            : currentMode === 'pending' ? 'bg-amber-100 text-amber-800'
            : 'bg-violet-100 text-violet-800'
          }`}>
            {currentOption.icon}
            {currentOption.label}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>見積行 {countForMode(currentMode)} 行</span>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {/* 展開パネル */}
      {isOpen && (
        <div className="border-t border-slate-200 px-4 pb-4 pt-3">
          <p className="mb-4 text-xs leading-5 text-slate-500">
            OCR 読み取り精度に応じて3つのモードから選択できます。モードを変えると見積書の行数・金額が変わります。
          </p>

          <div className="grid gap-3 md:grid-cols-3">
            {options.map((opt) => {
              const count = countForMode(opt.value);
              const amount = amountForMode(opt.value);
              const selected = currentMode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChange(opt.value)}
                  className={`relative flex flex-col gap-2 rounded-lg border-2 p-4 text-left transition-all ${opt.borderClass(selected)}`}
                >
                  {opt.recommended && (
                    <div className="absolute -top-2.5 right-3 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                      推奨
                    </div>
                  )}
                  <div className={`flex items-center gap-2 font-semibold ${opt.colorClass}`}>
                    {opt.icon}
                    <span className="text-sm">{opt.label}</span>
                  </div>
                  <div className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${opt.badgeClass}`}>
                    {opt.sublabel}
                  </div>
                  <p className="text-[11px] leading-4 text-slate-600">{opt.description}</p>
                  <div className="mt-1 border-t border-slate-100 pt-2">
                    <div className="text-[11px] text-slate-500">
                      見積行: <span className="font-semibold text-slate-800">{count} 行</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      合計: <span className="font-semibold text-slate-800">
                        {amount > 0 ? `¥${Math.round(amount).toLocaleString('ja-JP')}` : '—'}
                      </span>
                    </div>
                  </div>
                  {selected && (
                    <div className="absolute bottom-2 right-2">
                      <CheckCircle2 className={`h-4 w-4 ${opt.colorClass}`} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600">
            <span className="font-semibold">現在のモード:</span>{' '}
            {currentMode === 'confirmed' && '確定版 — 確信度80%以上のみ採用。最も安全な見積です。'}
            {currentMode === 'pending' && '保留版 — 確信度50%以上を採用。保留フラグ付きで出力されます。'}
            {currentMode === 'full' && '全出力版 — 全読み取り結果を出力。要確認フラグ付きです。'}
          </div>
        </div>
      )}
    </div>
  );
}
