import { useState } from 'react';
import type { OcrItem, OcrStampStatus } from '@/lib/types';

interface OcrLineListProps {
  items: OcrItem[];
  activeItemId: string | null;
  stampStatuses?: Record<string, OcrStampStatus>;
  onSelectItem: (itemId: string | null) => void;
  onStampStatusChange?: (itemId: string, status: OcrStampStatus) => void;
}

const STAMP_OPTIONS: { status: OcrStampStatus; label: string; badgeClass: string }[] = [
  { status: 'adopted', label: '採用', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { status: 'pending', label: '保留', badgeClass: 'bg-amber-100 text-amber-800 border-amber-300' },
  { status: 'excluded', label: '除外', badgeClass: 'bg-rose-100 text-rose-800 border-rose-300' },
  { status: 'none', label: '未設定', badgeClass: 'bg-slate-100 text-slate-600 border-slate-300' },
];

type FilterMode = 'all' | OcrStampStatus;

export default function OcrLineList({ items, activeItemId, stampStatuses = {}, onSelectItem, onStampStatusChange }: OcrLineListProps) {
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [searchText, setSearchText] = useState('');

  const filteredItems = items.filter((item) => {
    const status = stampStatuses[item.id] ?? 'none';
    const matchesFilter = filterMode === 'all' || status === filterMode;
    const matchesSearch = !searchText.trim() || item.text.toLowerCase().includes(searchText.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const counts = {
    all: items.length,
    adopted: items.filter((item) => stampStatuses[item.id] === 'adopted').length,
    pending: items.filter((item) => stampStatuses[item.id] === 'pending').length,
    excluded: items.filter((item) => stampStatuses[item.id] === 'excluded').length,
    none: items.filter((item) => !stampStatuses[item.id] || stampStatuses[item.id] === 'none').length,
  };

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
        OCR 行はまだありません。図面を解析すると、ここに抽出テキストが並びます。
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-800">OCR文字一覧</div>
          <div className="text-[11px] text-slate-500">{filteredItems.length} / {items.length} 行</div>
        </div>

        {/* 検索ボックス */}
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="テキストで絞り込み..."
          className="mt-2 w-full rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-800 placeholder:text-slate-400"
        />

        {/* フィルタータブ */}
        {onStampStatusChange && (
          <div className="mt-2 flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border transition-colors ${
                filterMode === 'all' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              全て {counts.all}
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('adopted')}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border transition-colors ${
                filterMode === 'adopted' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'
              }`}
            >
              採用 {counts.adopted}
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('pending')}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border transition-colors ${
                filterMode === 'pending' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'
              }`}
            >
              保留 {counts.pending}
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('excluded')}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border transition-colors ${
                filterMode === 'excluded' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-rose-700 border-rose-300 hover:bg-rose-50'
              }`}
            >
              除外 {counts.excluded}
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('none')}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border transition-colors ${
                filterMode === 'none' ? 'bg-slate-500 text-white border-slate-500' : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'
              }`}
            >
              未設定 {counts.none}
            </button>
          </div>
        )}
      </div>

      <div className="max-h-[320px] overflow-auto p-2">
        {filteredItems.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
            該当する行がありません
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredItems.map((item, index) => {
              const isActive = item.id === activeItemId;
              const stampStatus = stampStatuses[item.id] ?? 'none';
              const stampOpt = STAMP_OPTIONS.find((opt) => opt.status === stampStatus);

              return (
                <div
                  key={item.id}
                  className={`rounded-md border transition-colors ${
                    isActive
                      ? 'border-blue-300 bg-blue-50'
                      : stampStatus === 'adopted'
                        ? 'border-emerald-200 bg-emerald-50/50'
                        : stampStatus === 'pending'
                          ? 'border-amber-200 bg-amber-50/50'
                          : stampStatus === 'excluded'
                            ? 'border-rose-200 bg-rose-50/30 opacity-60'
                            : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectItem(item.id)}
                    className="w-full px-3 py-2 text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          行 {index + 1} / p.{item.pageNo}
                        </span>
                        {stampOpt && stampStatus !== 'none' && (
                          <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${stampOpt.badgeClass}`}>
                            {stampOpt.label}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        信頼度 {Math.round(item.score * 100)}%
                      </div>
                    </div>
                    <div className="mt-1 break-all text-sm text-slate-800">{item.text}</div>
                  </button>

                  {/* スタンプ変更ボタン（スタンプ機能有効時のみ） */}
                  {onStampStatusChange && (
                    <div className="flex gap-1 border-t border-slate-100 px-3 py-1.5">
                      {STAMP_OPTIONS.map((opt) => (
                        <button
                          key={opt.status}
                          type="button"
                          onClick={() => onStampStatusChange(item.id, opt.status)}
                          className={`rounded px-2 py-0.5 text-[10px] font-semibold border transition-colors ${
                            stampStatus === opt.status
                              ? opt.badgeClass
                              : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
