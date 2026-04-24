import fs from 'node:fs/promises';
import path from 'node:path';

import type { Project } from '../client/src/lib/types';

export interface PersistedProjectState {
  schemaVersion: 1;
  workspaceId: string;
  updatedAt: string | null;
  projects: Project[];
}

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data', 'workspaces');

function normalizeProjects(value: unknown): Project[] {
  return Array.isArray(value) ? (value as Project[]) : [];
}

function normalizeWorkspaceId(workspaceId: string): string {
  const trimmed = workspaceId.trim().slice(0, 80);
  const sanitized = trimmed.replace(/[^a-zA-Z0-9_-]/g, '_');
  return sanitized || 'anonymous';
}

function createDefaultState(workspaceId: string): PersistedProjectState {
  return {
    schemaVersion: 1,
    workspaceId,
    updatedAt: null,
    projects: [],
  };
}

function resolveWorkspaceDir(workspaceId: string): string {
  return path.join(DATA_DIR, normalizeWorkspaceId(workspaceId));
}

function resolveWorkspaceStateFile(workspaceId: string): string {
  return path.join(resolveWorkspaceDir(workspaceId), 'app-state.json');
}

async function ensureWorkspaceDir(workspaceId: string): Promise<void> {
  await fs.mkdir(resolveWorkspaceDir(workspaceId), { recursive: true });
}

export async function readPersistedState(workspaceId: string): Promise<PersistedProjectState> {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const stateFile = resolveWorkspaceStateFile(normalizedWorkspaceId);
  await ensureWorkspaceDir(normalizedWorkspaceId);

  try {
    const raw = await fs.readFile(stateFile, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PersistedProjectState>;
    return {
      schemaVersion: 1,
      workspaceId: normalizedWorkspaceId,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
      projects: normalizeProjects(parsed.projects),
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return createDefaultState(normalizedWorkspaceId);
    }
    throw error;
  }
}

export async function writePersistedState(workspaceId: string, input: { projects: Project[] }): Promise<PersistedProjectState> {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const stateFile = resolveWorkspaceStateFile(normalizedWorkspaceId);
  await ensureWorkspaceDir(normalizedWorkspaceId);

  const nextState: PersistedProjectState = {
    schemaVersion: 1,
    workspaceId: normalizedWorkspaceId,
    updatedAt: new Date().toISOString(),
    projects: normalizeProjects(input.projects),
  };

  const tempPath = `${stateFile}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf-8');
  await fs.rename(tempPath, stateFile);
  return nextState;
}

export async function listProjects(workspaceId: string): Promise<Project[]> {
  const state = await readPersistedState(workspaceId);
  return state.projects;
}

export async function getProjectById(workspaceId: string, projectId: string): Promise<Project | null> {
  const state = await readPersistedState(workspaceId);
  return state.projects.find((project) => project.id === projectId) ?? null;
}

export async function upsertProject(workspaceId: string, project: Project): Promise<PersistedProjectState> {
  const state = await readPersistedState(workspaceId);
  const existingIndex = state.projects.findIndex((item) => item.id === project.id);
  const projects = [...state.projects];

  if (existingIndex >= 0) {
    projects[existingIndex] = project;
  } else {
    projects.push(project);
  }

  return writePersistedState(workspaceId, { projects });
}

export async function deleteProjectById(workspaceId: string, projectId: string): Promise<{ deleted: boolean; state: PersistedProjectState }> {
  const state = await readPersistedState(workspaceId);
  const projects = state.projects.filter((project) => project.id !== projectId);
  const deleted = projects.length !== state.projects.length;
  const nextState = await writePersistedState(workspaceId, { projects });
  return { deleted, state: nextState };
}
