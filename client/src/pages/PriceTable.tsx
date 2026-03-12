import { useEffect, useMemo, useState } from 'react';
import Header from '@/components/Header';
import { Download, Plus, Save, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { fetchMasters, saveMasters } from '@/lib/api';
import type { MasterType, PriceMasterItem } from '@/lib/types';

interface PriceTableProps {
  title: string;
  masterTypes: MasterType[];
  description: string;
}

function csvEscape(value: string | number | null) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export default function PriceTable({ title, masterTypes, description }: PriceTableProps) {
  const [items, setItems] = useState<PriceMasterItem[]>([]);
  const [search, setSearch] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchMasters();
        if (!cancelled) {
          setItems(data);
          setLoaded(true);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : '単価マスタの読み込みに失敗しました。');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredItems = useMemo(() => items.filter((item) => {
    if (!masterTypes.includes(item.masterType)) return false;
    if (!search.trim()) return true;
    const needle = search.trim().toLowerCase();
    return [item.name, item.code, item.sourceName, ...item.aliases].join(' ').toLowerCase().includes(needle);
  }), [items, masterTypes, search]);

  const addItem = () => {
    const now = new Date().toISOString().slice(0, 10);
    const masterType = masterTypes[0] ?? 'misc';
    setItems((prev) => ([...prev, {
      id: `${masterType}:${crypto.randomUUID()}`,
      masterType,
      code: `${masterType.toUpperCase()}-${Date.now()}`,
      name: '',
      aliases: [],
      unitPrice: 0,
      unit: '式',
      effectiveFrom: now,
      effectiveTo: null,
      sourceName: '手動登録',
      sourceVersion: 'manual',
      sourcePage: null,
      vendor: '未設定',
      region: '未設定',
      notes: '',
    }]));
  };

  const updateItem = (id: string, field: keyof PriceMasterItem, value: string | number | string[] | null) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const deleteItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveMasters(items);
      setItems(saved);
      toast.success('単価マスタを保存しました。');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '単価マスタの保存に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const headers = ['masterType', 'code', 'name', 'unitPrice', 'unit', 'effectiveFrom', 'effectiveTo', 'sourceName', 'sourceVersion', 'sourcePage', 'vendor', 'region', 'notes'];
    const rows = filteredItems.map((item) => [
      item.masterType,
      item.code,
      item.name,
      item.unitPrice,
      item.unit,
      item.effectiveFrom,
      item.effectiveTo,
      item.sourceName,
      item.sourceVersion,
      item.sourcePage,
      item.vendor,
      item.region,
      item.notes,
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('単価マスタを CSV で出力しました。');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <main className="flex-1 p-4 max-w-7xl mx-auto w-full">
        <h1 className="text-2xl font-bold text-gray-800 mb-4 border-b-2 border-blue-500 pb-2">{title}</h1>

        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4">
          <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
            {description}
            <div className="mt-2 text-xs text-slate-500">
              有効日、根拠資料名、版、地域、備考まで保存します。見積書の単価根拠表はこの単価マスタを参照します。
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[260px] max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="名称・コード・根拠資料で検索"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <button onClick={addItem} className="inline-flex items-center gap-2 rounded-md bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600">
              <Plus size={14} /> 行を追加
            </button>
            <button onClick={handleExport} className="inline-flex items-center gap-2 rounded-md bg-green-500 px-3 py-2 text-sm font-medium text-white hover:bg-green-600">
              <Download size={14} /> CSV出力
            </button>
            <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-purple-500 px-3 py-2 text-sm font-medium text-white hover:bg-purple-600 disabled:bg-slate-400">
              <Save size={14} /> {saving ? '保存中...' : '単価マスタを保存'}
            </button>
          </div>

          {loaded && (
            <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
              該当マスタ {filteredItems.length} 件を表示中です。
            </div>
          )}

          <div className="overflow-auto rounded-md border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-2 py-2 text-left">コード</th>
                  <th className="px-2 py-2 text-left">名称</th>
                  <th className="px-2 py-2 text-right">単価</th>
                  <th className="px-2 py-2 text-left">単位</th>
                  <th className="px-2 py-2 text-left">有効開始</th>
                  <th className="px-2 py-2 text-left">有効終了</th>
                  <th className="px-2 py-2 text-left">根拠資料</th>
                  <th className="px-2 py-2 text-left">版</th>
                  <th className="px-2 py-2 text-left">地域</th>
                  <th className="px-2 py-2 text-left">備考</th>
                  <th className="px-2 py-2 text-center">削除</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 align-top">
                    <td className="px-2 py-2">
                      <input value={item.code} onChange={(event) => updateItem(item.id, 'code', event.target.value)} className="w-40 rounded border border-slate-300 px-2 py-1 text-sm" />
                    </td>
                    <td className="px-2 py-2">
                      <input value={item.name} onChange={(event) => updateItem(item.id, 'name', event.target.value)} className="w-64 rounded border border-slate-300 px-2 py-1 text-sm" />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" value={item.unitPrice} onChange={(event) => updateItem(item.id, 'unitPrice', Number(event.target.value) || 0)} className="w-28 rounded border border-slate-300 px-2 py-1 text-right text-sm" />
                    </td>
                    <td className="px-2 py-2">
                      <input value={item.unit} onChange={(event) => updateItem(item.id, 'unit', event.target.value)} className="w-20 rounded border border-slate-300 px-2 py-1 text-sm" />
                    </td>
                    <td className="px-2 py-2">
                      <input type="date" value={item.effectiveFrom} onChange={(event) => updateItem(item.id, 'effectiveFrom', event.target.value)} className="w-36 rounded border border-slate-300 px-2 py-1 text-sm" />
                    </td>
                    <td className="px-2 py-2">
                      <input type="date" value={item.effectiveTo ?? ''} onChange={(event) => updateItem(item.id, 'effectiveTo', event.target.value || null)} className="w-36 rounded border border-slate-300 px-2 py-1 text-sm" />
                    </td>
                    <td className="px-2 py-2">
                      <input value={item.sourceName} onChange={(event) => updateItem(item.id, 'sourceName', event.target.value)} className="w-40 rounded border border-slate-300 px-2 py-1 text-sm" />
                      <input value={item.sourcePage ?? ''} onChange={(event) => updateItem(item.id, 'sourcePage', event.target.value || null)} placeholder="ページ" className="mt-1 w-24 rounded border border-slate-300 px-2 py-1 text-sm" />
                    </td>
                    <td className="px-2 py-2">
                      <input value={item.sourceVersion} onChange={(event) => updateItem(item.id, 'sourceVersion', event.target.value)} className="w-24 rounded border border-slate-300 px-2 py-1 text-sm" />
                    </td>
                    <td className="px-2 py-2">
                      <input value={item.region} onChange={(event) => updateItem(item.id, 'region', event.target.value)} className="w-24 rounded border border-slate-300 px-2 py-1 text-sm" />
                    </td>
                    <td className="px-2 py-2">
                      <textarea value={item.notes} onChange={(event) => updateItem(item.id, 'notes', event.target.value)} className="h-16 w-48 rounded border border-slate-300 px-2 py-1 text-sm" />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button onClick={() => deleteItem(item.id)} className="text-rose-600 hover:text-rose-700">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
