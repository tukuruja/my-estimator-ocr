import type { OcrItem } from '@/lib/types';

interface OcrLineListProps {
  items: OcrItem[];
  activeItemId: string | null;
  onSelectItem: (itemId: string | null) => void;
}

export default function OcrLineList({ items, activeItemId, onSelectItem }: OcrLineListProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
        OCR 行はまだありません。図面を解析すると、ここに抽出テキストが並びます。
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800">
        OCR文字一覧
      </div>
      <div className="max-h-[280px] overflow-auto p-2">
        <div className="space-y-2">
          {items.map((item, index) => {
            const isActive = item.id === activeItemId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectItem(item.id)}
                className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                  isActive
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    行 {index + 1} / p.{item.pageNo}
                  </div>
                  <div className="text-[11px] text-slate-500">信頼度 {Math.round(item.score * 100)}%</div>
                </div>
                <div className="mt-1 break-all text-sm text-slate-800">{item.text}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
