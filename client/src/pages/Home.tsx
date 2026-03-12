import { useState, useEffect, useCallback, useRef } from 'react';
import Header from '@/components/Header';
import EstimateList from '@/components/EstimateList';
import InputForm from '@/components/InputForm';
import CalculationResults from '@/components/CalculationResults';
import SaveBar from '@/components/SaveBar';
import { calculate } from '@/lib/calculations';
import { createDefaultBlock, type EstimateBlock } from '@/lib/types';
import { loadData, saveData } from '@/lib/storage';
import { toast } from 'sonner';

function GuideStep({ step, title, description }: { step: string; title: string; description: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{step}</div>
      <div className="mt-1 text-sm font-semibold text-slate-800">{title}</div>
      <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
    </div>
  );
}

export default function Home() {
  const [blocks, setBlocks] = useState<EstimateBlock[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [autoSave, setAutoSave] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const data = loadData();
    setBlocks(data.blocks);
    setActiveIndex(data.activeBlockIndex);
    setAutoSave(data.autoSave);
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (!initialized || !autoSave) return;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      saveData({ blocks, activeBlockIndex: activeIndex, autoSave });
    }, 1000);
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [blocks, activeIndex, autoSave, initialized]);

  const activeBlock = blocks[activeIndex];

  const handleFieldChange = useCallback((field: keyof EstimateBlock, value: string | number) => {
    setBlocks((prev) => {
      const updated = [...prev];
      updated[activeIndex] = { ...updated[activeIndex], [field]: value };
      if (field === 'secondaryProduct' && typeof value === 'string' && value) {
        updated[activeIndex].name = value;
      }
      return updated;
    });
  }, [activeIndex]);

  const handleAddBlock = useCallback(() => {
    const defaultName = `見積 ${blocks.length + 1}`;
    const name = prompt('追加する見積の名前を入力してください。', defaultName);
    if (name === null) return;
    const newBlock = createDefaultBlock(name || defaultName);
    setBlocks((prev) => [...prev, newBlock]);
    setActiveIndex(blocks.length);
  }, [blocks.length]);

  const handleDeleteBlock = useCallback(() => {
    if (blocks.length <= 1) return;
    if (!confirm(`「${blocks[activeIndex].name}」を削除しますか？\nこの操作は元に戻せません。`)) return;
    setBlocks((prev) => prev.filter((_, i) => i !== activeIndex));
    setActiveIndex((prev) => Math.max(0, prev - 1));
  }, [blocks, activeIndex]);

  const handleSave = useCallback(() => {
    saveData({ blocks, activeBlockIndex: activeIndex, autoSave });
    toast.success('現在の見積を保存しました。');
  }, [blocks, activeIndex, autoSave]);

  const handleSaveAs = useCallback(() => {
    const suggestedName = `${blocks[activeIndex].name} のコピー`;
    const name = prompt('複製して保存する見積名を入力してください。', suggestedName);
    if (!name) return;
    const newBlock = { ...blocks[activeIndex], id: crypto.randomUUID(), name };
    setBlocks((prev) => [...prev, newBlock]);
    setActiveIndex(blocks.length);
    toast.success(`「${name}」として複製保存しました。`);
  }, [blocks, activeIndex]);

  const handleToggleAutoSave = useCallback(() => {
    setAutoSave((prev) => !prev);
  }, []);

  if (!initialized || !activeBlock) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">見積データを読み込んでいます...</div>
      </div>
    );
  }

  const result = calculate(activeBlock);

  return (
    <div className="h-screen bg-gray-100 flex flex-col overflow-hidden">
      <Header />

      <div className="flex items-center justify-end gap-3 bg-white border-b border-gray-200 px-4 py-1">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span>自動保存</span>
          <button
            onClick={handleToggleAutoSave}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              autoSave ? 'bg-green-500' : 'bg-gray-300'
            }`}
            title="自動保存のオン・オフを切り替えます"
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                autoSave ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
          <span className="hidden sm:inline">{autoSave ? '入力後に自動で保存します' : '手動保存のみです'}</span>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
        >
          💾 この見積を保存
        </button>
        <button
          onClick={handleSaveAs}
          className="flex items-center gap-1 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
        >
          💾 別名で複製保存
        </button>
      </div>

      <EstimateList
        blocks={blocks}
        activeIndex={activeIndex}
        onSelect={setActiveIndex}
        onAdd={handleAddBlock}
        onDelete={handleDeleteBlock}
      />

      <div className="px-2 pt-2">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-800">
                編集中の見積: <span className="text-indigo-700">{activeBlock.name}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                左で条件を入力・選択すると、右の数量と金額が自動で更新されます。
                迷ったときは、上から順に「製品名 → 施工延長 → 各工種の条件」の順で入力してください。
              </p>
            </div>
            <div className="grid gap-2 md:grid-cols-3 lg:w-[620px]">
              <GuideStep
                step="STEP 1"
                title="左で条件を入力"
                description="製品名、施工延長、機械や材料の条件を入力します。未入力の数値は 0 として計算されます。"
              />
              <GuideStep
                step="STEP 2"
                title="右で数量と金額を確認"
                description="工種ごとの数量、人数、金額、1mあたり単価をまとめて確認できます。"
              />
              <GuideStep
                step="STEP 3"
                title="保存して比較"
                description="複製保存を使うと、条件違いの見積を複数並べて比較できます。"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex gap-2 p-2 overflow-hidden">
        <div className="w-[420px] shrink-0 overflow-y-auto">
          <InputForm block={activeBlock} onChange={handleFieldChange} />
        </div>

        <div className="flex-1 overflow-y-auto">
          <CalculationResults result={result} block={activeBlock} />
        </div>
      </div>

      <SaveBar
        autoSave={autoSave}
        onToggleAutoSave={handleToggleAutoSave}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
      />
    </div>
  );
}
