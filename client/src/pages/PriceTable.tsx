import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { Plus, Trash2, Search, Download, Upload, Save } from 'lucide-react';
import { toast } from 'sonner';

interface PriceItem {
  id: string;
  name: string;
  price: number;
}

interface PriceTableProps {
  title: string;
  storageKey: string;
  defaultData: { name: string; price: number }[];
}

export default function PriceTable({ title, storageKey, defaultData }: PriceTableProps) {
  const [items, setItems] = useState<PriceItem[]>([]);
  const [search, setSearch] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        setItems(JSON.parse(stored));
      } catch {
        initializeDefaults();
      }
    } else {
      initializeDefaults();
    }
    setLoaded(true);
  }, [storageKey]);

  function initializeDefaults() {
    const defaults = defaultData.map((d, i) => ({
      id: `${i}-${Date.now()}`,
      name: d.name,
      price: d.price,
    }));
    setItems(defaults);
    localStorage.setItem(storageKey, JSON.stringify(defaults));
  }

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  const addItem = () => {
    const newItem: PriceItem = {
      id: crypto.randomUUID(),
      name: '',
      price: 0,
    };
    setItems([...items, newItem]);
  };

  const deleteItem = (id: string) => {
    setItems(items.filter((item) => item.id !== id));
  };

  const updateItem = (id: string, field: 'name' | 'price', value: string | number) => {
    setItems(items.map((item) =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const saveItems = () => {
    localStorage.setItem(storageKey, JSON.stringify(items));
    toast.success('単価表を保存しました。');
  };

  const exportCSV = () => {
    const csv = items.map((item) => `"${item.name}",${item.price}`).join('\n');
    const blob = new Blob([`名称,単価\n${csv}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSVを書き出しました。');
  };

  const importCSV = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const lines = text.split('\n').filter((l) => l.trim());
        const newItems: PriceItem[] = [];
        lines.forEach((line, i) => {
          if (i === 0 && line.includes('名称')) return;
          const parts = line.split(',');
          if (parts.length >= 2) {
            newItems.push({
              id: crypto.randomUUID(),
              name: parts[0].replace(/"/g, '').trim(),
              price: parseFloat(parts[1]) || 0,
            });
          }
        });
        setItems([...items, ...newItems]);
        toast.success(`${newItems.length}件の単価を追加しました。`);
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const now = new Date();
  const dateStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <main className="flex-1 p-4 max-w-5xl mx-auto w-full">
        <h1 className="text-2xl font-bold text-gray-800 mb-4 border-b-2 border-blue-500 pb-2">
          {title}
        </h1>

        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
          <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
            この画面では見積計算に使う単価マスタを編集できます。必要な行を追加・修正したあと、
            <span className="font-semibold text-slate-800">「単価表を保存」</span> を押してください。
          </div>

          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-xs">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="名称・型式で絞り込む"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <button onClick={addItem} className="flex items-center gap-1 bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-md text-sm font-medium transition-colors" title="単価の行を追加します">
              <Plus size={14} /> 行を追加
            </button>
            <button onClick={importCSV} className="flex items-center gap-1 bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-2 rounded-md text-sm font-medium transition-colors" title="CSVファイルを読み込んで追加します">
              <Upload size={14} /> CSV取込
            </button>
            <button onClick={exportCSV} className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-md text-sm font-medium transition-colors" title="現在の単価表をCSVで保存します">
              <Download size={14} /> CSV保存
            </button>
            <button onClick={saveItems} className="flex items-center gap-1 bg-purple-500 hover:bg-purple-600 text-white px-3 py-2 rounded-md text-sm font-medium transition-colors" title="変更した単価表を保存します">
              <Save size={14} /> 単価表を保存
            </button>
          </div>

          {loaded && (
            <div className="text-sm text-blue-600 bg-blue-50 border border-blue-200 rounded-md px-3 py-2 mb-4">
              ℹ 保存済みの単価データを読み込みました。
            </div>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left px-2 py-2 w-12">#</th>
                <th className="text-left px-2 py-2">品名・型式</th>
                <th className="text-left px-2 py-2 w-32">単価 (円)</th>
                <th className="text-center px-2 py-2 w-16">削除</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item, index) => (
                <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-2 py-1.5 text-gray-500">{index + 1}</td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      placeholder="品名や型式を入力"
                      value={item.name}
                      onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        placeholder="単価を入力"
                        value={item.price || ''}
                        onChange={(e) => updateItem(item.id, 'price', parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1 border border-gray-200 rounded text-sm text-right focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                      />
                      <span className="text-xs text-gray-500">円</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="text-red-500 hover:text-red-700 transition-colors"
                      title="この行を削除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-between items-center mt-4 text-xs text-gray-500">
            <span>全 {items.length} 件中、{filteredItems.length} 件を表示中</span>
            <span>最終更新: {dateStr}</span>
          </div>
        </div>
      </main>
    </div>
  );
}
