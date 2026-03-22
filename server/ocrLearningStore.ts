import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { OcrLearningEntry } from '../client/src/lib/types';

interface PersistedOcrLearningState {
  schemaVersion: 1;
  workspaceId: string;
  updatedAt: string | null;
  entries: OcrLearningEntry[];
}

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data', 'workspaces');

function normalizeWorkspaceId(workspaceId: string): string {
  const trimmed = workspaceId.trim().slice(0, 80);
  const sanitized = trimmed.replace(/[^a-zA-Z0-9_-]/g, '_');
  return sanitized || 'anonymous';
}

function resolveWorkspaceDir(workspaceId: string): string {
  return path.join(DATA_DIR, normalizeWorkspaceId(workspaceId));
}

function resolveLearningFile(workspaceId: string): string {
  return path.join(resolveWorkspaceDir(workspaceId), 'ocr-learning.json');
}

async function ensureWorkspaceDir(workspaceId: string): Promise<void> {
  await fs.mkdir(resolveWorkspaceDir(workspaceId), { recursive: true });
}

function createDefaultState(workspaceId: string): PersistedOcrLearningState {
  return {
    schemaVersion: 1,
    workspaceId,
    updatedAt: null,
    entries: [],
  };
}

function normalizeEntries(value: unknown): OcrLearningEntry[] {
  return Array.isArray(value) ? (value as OcrLearningEntry[]) : [];
}

export async function readOcrLearningState(workspaceId: string): Promise<PersistedOcrLearningState> {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const filePath = resolveLearningFile(normalizedWorkspaceId);
  await ensureWorkspaceDir(normalizedWorkspaceId);

  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PersistedOcrLearningState>;
    return {
      schemaVersion: 1,
      workspaceId: normalizedWorkspaceId,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
      entries: normalizeEntries(parsed.entries),
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return createDefaultState(normalizedWorkspaceId);
    }
    throw error;
  }
}

async function writeOcrLearningState(workspaceId: string, entries: OcrLearningEntry[]): Promise<PersistedOcrLearningState> {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const filePath = resolveLearningFile(normalizedWorkspaceId);
  await ensureWorkspaceDir(normalizedWorkspaceId);

  const nextState: PersistedOcrLearningState = {
    schemaVersion: 1,
    workspaceId: normalizedWorkspaceId,
    updatedAt: new Date().toISOString(),
    entries,
  };

  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf-8');
  await fs.rename(tempPath, filePath);
  return nextState;
}

export async function listOcrLearningEntries(workspaceId: string): Promise<OcrLearningEntry[]> {
  const state = await readOcrLearningState(workspaceId);
  return state.entries;
}

function createEntryKey(entry: Pick<OcrLearningEntry, 'learningType' | 'normalizedCallout' | 'sourceRole' | 'targetRole'>): string {
  return `${entry.learningType}:${entry.normalizedCallout}:${entry.sourceRole}:${entry.targetRole}`;
}

function createScopedEntryKey(entry: Pick<OcrLearningEntry, 'projectId' | 'learningType' | 'normalizedCallout' | 'sourceRole' | 'targetRole'>): string {
  return `${entry.projectId ?? '__global__'}:${createEntryKey(entry)}`;
}

export async function listProjectScopedOcrLearningEntries(workspaceId: string, projectId?: string): Promise<OcrLearningEntry[]> {
  const entries = await listOcrLearningEntries(workspaceId);
  if (!projectId) return entries;
  return entries.filter((entry) => !entry.projectId || entry.projectId === projectId);
}

export async function upsertOcrLearningEntry(
  workspaceId: string,
  input: Omit<OcrLearningEntry, 'id' | 'adoptionCount' | 'createdAt' | 'updatedAt'>,
): Promise<{ state: PersistedOcrLearningState; entry: OcrLearningEntry }> {
  const state = await readOcrLearningState(workspaceId);
  const inputKey = createScopedEntryKey(input);
  const now = new Date().toISOString();

  const existingIndex = state.entries.findIndex((entry) => createScopedEntryKey(entry) === inputKey);
  let nextEntry: OcrLearningEntry;
  const nextEntries = [...state.entries];

  if (existingIndex >= 0) {
    const existing = nextEntries[existingIndex];
    nextEntry = {
      ...existing,
      sourceText: input.sourceText,
      targetText: input.targetText,
      sourcePageNo: input.sourcePageNo,
      targetPageNo: input.targetPageNo,
      drawingNo: input.drawingNo,
      drawingTitle: input.drawingTitle,
      adoptionCount: existing.adoptionCount + 1,
      updatedAt: now,
    };
    nextEntries[existingIndex] = nextEntry;
  } else {
    nextEntry = {
      ...input,
      id: randomUUID(),
      adoptionCount: 1,
      createdAt: now,
      updatedAt: now,
    };
    nextEntries.push(nextEntry);
  }

  const nextState = await writeOcrLearningState(workspaceId, nextEntries);
  return { state: nextState, entry: nextEntry };
}
