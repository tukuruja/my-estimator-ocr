import type { EstimateBlock } from './types';
import { createDefaultBlock } from './types';

const STORAGE_KEY = 'my-estimator-data';
const ACTIVE_INDEX_KEY = 'my-estimator-active-index';
const AUTO_SAVE_KEY = 'my-estimator-auto-save';

export interface StoredData {
  blocks: EstimateBlock[];
  activeBlockIndex: number;
  autoSave: boolean;
}

export function loadData(): StoredData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        blocks: parsed.blocks || [createDefaultBlock('新規見積')],
        activeBlockIndex: parsed.activeBlockIndex || 0,
        autoSave: parsed.autoSave !== undefined ? parsed.autoSave : true,
      };
    }
  } catch (e) {
    console.error('Failed to load data:', e);
  }
  return {
    blocks: [createDefaultBlock('新規見積')],
    activeBlockIndex: 0,
    autoSave: true,
  };
}

export function saveData(data: StoredData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save data:', e);
  }
}

export function saveBlocks(blocks: EstimateBlock[]): void {
  const data = loadData();
  data.blocks = blocks;
  saveData(data);
}

export function saveActiveIndex(index: number): void {
  const data = loadData();
  data.activeBlockIndex = index;
  saveData(data);
}

// 名前を付けて保存
export function saveAsNewBlock(blocks: EstimateBlock[], name: string): EstimateBlock[] {
  const newBlock = createDefaultBlock(name);
  const newBlocks = [...blocks, newBlock];
  saveBlocks(newBlocks);
  return newBlocks;
}
