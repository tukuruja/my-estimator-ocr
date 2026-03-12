import { useRef, useEffect } from 'react';
import type { EstimateBlock } from '@/lib/types';
import { ChevronLeft, ChevronRight, Plus, Minus } from 'lucide-react';

interface EstimateListProps {
  blocks: EstimateBlock[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onDelete: () => void;
}

export default function EstimateList({
  blocks,
  activeIndex,
  onSelect,
  onAdd,
  onDelete,
}: EstimateListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const activeEl = scrollRef.current.children[activeIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeIndex]);

  const scrollLeft = () => {
    if (activeIndex > 0) {
      onSelect(activeIndex - 1);
    }
  };

  const scrollRight = () => {
    if (activeIndex < blocks.length - 1) {
      onSelect(activeIndex + 1);
    }
  };

  return (
    <div className="flex items-center gap-1 bg-white border-b border-gray-200 px-2 py-1.5">
      <div className="hidden shrink-0 pl-1 pr-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 md:block">
        見積一覧
      </div>
      <button
        onClick={scrollLeft}
        disabled={activeIndex <= 0}
        className="p-1 rounded-full bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shrink-0"
        title="前の見積を開く"
      >
        <ChevronLeft size={18} />
      </button>

      <div
        ref={scrollRef}
        className="flex gap-1 overflow-x-auto flex-1 scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {blocks.map((block, index) => (
          <button
            key={block.id}
            onClick={() => onSelect(index)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition-all shrink-0 ${
              index === activeIndex
                ? 'bg-blue-500 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            title={`見積を開く: ${block.name}`}
          >
            <span className="font-bold">{index + 1}</span>
            <span className="max-w-[120px] truncate">{block.name}</span>
          </button>
        ))}
      </div>

      <button
        onClick={onDelete}
        disabled={blocks.length <= 1}
        className="p-1 rounded-full bg-red-500 text-white hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shrink-0"
        title="選択中の見積を削除"
      >
        <Minus size={18} />
      </button>

      <button
        onClick={onAdd}
        className="p-1 rounded-full bg-green-500 text-white hover:bg-green-600 transition-colors shrink-0"
        title="新しい見積を追加"
      >
        <Plus size={18} />
      </button>

      <button
        onClick={scrollRight}
        disabled={activeIndex >= blocks.length - 1}
        className="p-1 rounded-full bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shrink-0"
        title="次の見積を開く"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
