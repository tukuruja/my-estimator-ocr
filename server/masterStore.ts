import fs from 'node:fs/promises';
import path from 'node:path';

import { createSeedMasterItems, filterMasterItems } from '../client/src/lib/masterData';
import type { PriceMasterItem } from '../client/src/lib/types';

export interface PersistedMasterState {
  schemaVersion: 1;
  updatedAt: string | null;
  items: PriceMasterItem[];
}

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const MASTER_FILE = path.join(DATA_DIR, 'master-items.json');

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function normalizeItems(value: unknown): PriceMasterItem[] {
  return Array.isArray(value) ? (value as PriceMasterItem[]) : [];
}

function defaultState(): PersistedMasterState {
  return {
    schemaVersion: 1,
    updatedAt: null,
    items: createSeedMasterItems(),
  };
}

export async function readMasterState(): Promise<PersistedMasterState> {
  await ensureDataDir();

  try {
    const raw = await fs.readFile(MASTER_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PersistedMasterState>;
    return {
      schemaVersion: 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
      items: normalizeItems(parsed.items),
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      const initial = defaultState();
      await writeMasterState({ items: initial.items });
      return initial;
    }
    throw error;
  }
}

export async function writeMasterState(input: { items: PriceMasterItem[] }): Promise<PersistedMasterState> {
  await ensureDataDir();
  const nextState: PersistedMasterState = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    items: normalizeItems(input.items),
  };

  const tempPath = `${MASTER_FILE}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf-8');
  await fs.rename(tempPath, MASTER_FILE);
  return nextState;
}

export async function listMasterItems(query?: { masterType?: string | null; keyword?: string | null; effectiveDate?: string | null }): Promise<PriceMasterItem[]> {
  const state = await readMasterState();
  return query ? filterMasterItems(state.items, query) : state.items;
}

export async function getMasterItemById(masterId: string): Promise<PriceMasterItem | null> {
  const state = await readMasterState();
  return state.items.find((item) => item.id === masterId) ?? null;
}

export async function upsertMasterItem(item: PriceMasterItem): Promise<PersistedMasterState> {
  const state = await readMasterState();
  const items = [...state.items];
  const index = items.findIndex((current) => current.id === item.id);

  if (index >= 0) {
    items[index] = item;
  } else {
    items.push(item);
  }

  return writeMasterState({ items });
}
