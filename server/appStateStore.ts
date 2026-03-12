import fs from 'node:fs/promises';
import path from 'node:path';

import type { Project } from '../client/src/lib/types';

export interface PersistedProjectState {
  schemaVersion: 1;
  updatedAt: string | null;
  projects: Project[];
}

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const STATE_FILE = path.join(DATA_DIR, 'app-state.json');

const DEFAULT_STATE: PersistedProjectState = {
  schemaVersion: 1,
  updatedAt: null,
  projects: [],
};

function normalizeProjects(value: unknown): Project[] {
  return Array.isArray(value) ? (value as Project[]) : [];
}

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readPersistedState(): Promise<PersistedProjectState> {
  await ensureDataDir();

  try {
    const raw = await fs.readFile(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PersistedProjectState>;
    return {
      schemaVersion: 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
      projects: normalizeProjects(parsed.projects),
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return DEFAULT_STATE;
    }
    throw error;
  }
}

export async function writePersistedState(input: { projects: Project[] }): Promise<PersistedProjectState> {
  await ensureDataDir();

  const nextState: PersistedProjectState = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    projects: normalizeProjects(input.projects),
  };

  const tempPath = `${STATE_FILE}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf-8');
  await fs.rename(tempPath, STATE_FILE);
  return nextState;
}

export async function listProjects(): Promise<Project[]> {
  const state = await readPersistedState();
  return state.projects;
}

export async function getProjectById(projectId: string): Promise<Project | null> {
  const state = await readPersistedState();
  return state.projects.find((project) => project.id === projectId) ?? null;
}

export async function upsertProject(project: Project): Promise<PersistedProjectState> {
  const state = await readPersistedState();
  const existingIndex = state.projects.findIndex((item) => item.id === project.id);
  const projects = [...state.projects];

  if (existingIndex >= 0) {
    projects[existingIndex] = project;
  } else {
    projects.push(project);
  }

  return writePersistedState({ projects });
}

export async function deleteProjectById(projectId: string): Promise<{ deleted: boolean; state: PersistedProjectState }> {
  const state = await readPersistedState();
  const projects = state.projects.filter((project) => project.id !== projectId);
  const deleted = projects.length !== state.projects.length;
  const nextState = await writePersistedState({ projects });
  return { deleted, state: nextState };
}
