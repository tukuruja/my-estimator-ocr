import { Save } from 'lucide-react';

interface SaveBarProps {
  autoSave: boolean;
  onToggleAutoSave: () => void;
  onSave: () => void;
  onSaveAs: () => void;
}

export default function SaveBar({ autoSave, onToggleAutoSave, onSave, onSaveAs }: SaveBarProps) {
  return (
    <div className="flex items-center justify-end gap-3 bg-white border-t border-gray-200 px-4 py-2 sticky bottom-0 z-40">
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <span>自動保存</span>
        <button
          onClick={onToggleAutoSave}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            autoSave ? 'bg-green-500' : 'bg-gray-300'
          }`}
          title="自動保存のオン・オフを切り替えます"
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              autoSave ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <button
        onClick={onSave}
        className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
      >
        <Save size={14} />
        この見積を保存
      </button>

      <button
        onClick={onSaveAs}
        className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-600 text-white px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
      >
        <Save size={14} />
        別名で複製保存
      </button>
    </div>
  );
}
