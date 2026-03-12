import type { AppState, EstimateBlock, Project } from './types';
import { createDefaultBlock, createDefaultProject, createInitialAppState } from './types';

const LEGACY_STORAGE_KEY = 'my-estimator-data';
const UI_STORAGE_KEY = 'my-estimator-ui-meta';

interface UiStateMeta {
  activeProjectId: string | null;
  activeDrawingId: string | null;
  activeBlockId: string | null;
  autoSave: boolean;
}

interface ServerStateResponse {
  success?: boolean;
  data?: {
    projects?: Project[];
    updatedAt?: string | null;
  };
  projects?: Project[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function migrateLegacyData(raw: Record<string, unknown>): AppState {
  const project = createDefaultProject('移行済み案件');
  const legacyBlocks = Array.isArray(raw.blocks) ? (raw.blocks as Partial<EstimateBlock>[]) : [];

  project.blocks = legacyBlocks.length > 0
    ? legacyBlocks.map((block, index) => ({
        ...createDefaultBlock(project.id, block.name || `見積 ${index + 1}`),
        ...block,
        id: typeof block.id === 'string' ? block.id : crypto.randomUUID(),
        projectId: project.id,
        drawingId: null,
        blockType: 'secondary_product',
        requiresReviewFields: Array.isArray(block.requiresReviewFields) ? block.requiresReviewFields : [],
        appliedCandidateIds: Array.isArray(block.appliedCandidateIds) ? block.appliedCandidateIds : [],
      }))
    : [createDefaultBlock(project.id, '新規見積')];

  project.updatedAt = new Date().toISOString();

  const activeIndex = typeof raw.activeBlockIndex === 'number' ? raw.activeBlockIndex : 0;

  return {
    projects: [project],
    activeProjectId: project.id,
    activeDrawingId: null,
    activeBlockId: project.blocks[Math.max(0, Math.min(activeIndex, project.blocks.length - 1))]?.id ?? null,
    autoSave: raw.autoSave !== undefined ? Boolean(raw.autoSave) : true,
  };
}

function normalizeState(raw: unknown): AppState {
  if (!isObject(raw)) {
    return createInitialAppState();
  }

  if (!Array.isArray(raw.projects)) {
    return migrateLegacyData(raw);
  }

  const projects = raw.projects.length > 0 ? (raw.projects as Project[]) : createInitialAppState().projects;
  const activeProjectId = typeof raw.activeProjectId === 'string' ? raw.activeProjectId : projects[0]?.id;
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0];
  const activeBlockId = typeof raw.activeBlockId === 'string'
    ? raw.activeBlockId
    : activeProject?.blocks?.[0]?.id ?? null;
  const activeDrawingId = typeof raw.activeDrawingId === 'string' ? raw.activeDrawingId : null;

  return {
    projects,
    activeProjectId: activeProject?.id ?? createInitialAppState().activeProjectId,
    activeDrawingId,
    activeBlockId,
    autoSave: raw.autoSave !== undefined ? Boolean(raw.autoSave) : true,
  };
}

function loadLegacyLocalState(): AppState | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    return normalizeState(JSON.parse(raw));
  } catch (error) {
    console.error('Failed to load local fallback data:', error);
    return null;
  }
}

function normalizeUiMeta(raw: unknown, fallback: AppState): UiStateMeta {
  if (!isObject(raw)) {
    return {
      activeProjectId: fallback.activeProjectId,
      activeDrawingId: fallback.activeDrawingId,
      activeBlockId: fallback.activeBlockId,
      autoSave: fallback.autoSave,
    };
  }

  return {
    activeProjectId: typeof raw.activeProjectId === 'string' ? raw.activeProjectId : fallback.activeProjectId,
    activeDrawingId: typeof raw.activeDrawingId === 'string' ? raw.activeDrawingId : fallback.activeDrawingId,
    activeBlockId: typeof raw.activeBlockId === 'string' ? raw.activeBlockId : fallback.activeBlockId,
    autoSave: raw.autoSave !== undefined ? Boolean(raw.autoSave) : fallback.autoSave,
  };
}

function loadUiMeta(fallback: AppState): UiStateMeta {
  try {
    const raw = localStorage.getItem(UI_STORAGE_KEY);
    if (!raw) {
      return normalizeUiMeta(null, fallback);
    }
    return normalizeUiMeta(JSON.parse(raw), fallback);
  } catch (error) {
    console.error('Failed to load UI state meta:', error);
    return normalizeUiMeta(null, fallback);
  }
}

function pickActiveIds(projects: Project[], uiMeta: UiStateMeta): Pick<AppState, 'activeProjectId' | 'activeDrawingId' | 'activeBlockId'> {
  const defaultProject = projects[0] ?? createInitialAppState().projects[0];
  const activeProject = projects.find((project) => project.id === uiMeta.activeProjectId) ?? defaultProject;
  const activeDrawingId = activeProject.drawings.find((drawing) => drawing.id === uiMeta.activeDrawingId)?.id ?? activeProject.drawings[0]?.id ?? null;
  const activeBlockId = activeProject.blocks.find((block) => block.id === uiMeta.activeBlockId)?.id ?? activeProject.blocks[0]?.id ?? null;

  return {
    activeProjectId: activeProject.id,
    activeDrawingId,
    activeBlockId,
  };
}

function mergeProjectsWithUi(projects: Project[], uiMeta: UiStateMeta): AppState {
  const normalizedProjects = projects.length > 0 ? projects : createInitialAppState().projects;
  const activeIds = pickActiveIds(normalizedProjects, uiMeta);

  return {
    projects: normalizedProjects,
    ...activeIds,
    autoSave: uiMeta.autoSave,
  };
}

function saveUiMeta(data: AppState): void {
  try {
    const payload: UiStateMeta = {
      activeProjectId: data.activeProjectId,
      activeDrawingId: data.activeDrawingId,
      activeBlockId: data.activeBlockId,
      autoSave: data.autoSave,
    };
    localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error('Failed to save UI state meta:', error);
  }
}

async function loadServerProjects(): Promise<Project[] | null> {
  try {
    const response = await fetch('/api/app-state');
    if (!response.ok) {
      return null;
    }
    const payload = await response.json() as ServerStateResponse;
    if (Array.isArray(payload.data?.projects)) {
      return payload.data.projects;
    }
    if (Array.isArray(payload.projects)) {
      return payload.projects;
    }
    return [];
  } catch (error) {
    console.error('Failed to load server project state:', error);
    return null;
  }
}

async function saveServerProjects(projects: Project[]): Promise<void> {
  const response = await fetch('/api/app-state', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ projects }),
  });

  if (!response.ok) {
    throw new Error('サーバ保存に失敗しました。');
  }
}

export async function loadData(): Promise<AppState> {
  const localFallback = loadLegacyLocalState() ?? createInitialAppState();
  const uiMeta = loadUiMeta(localFallback);
  const serverProjects = await loadServerProjects();

  if (serverProjects && serverProjects.length > 0) {
    const merged = mergeProjectsWithUi(serverProjects, uiMeta);
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(merged));
    return merged;
  }

  if (serverProjects && serverProjects.length === 0) {
    return mergeProjectsWithUi(localFallback.projects, uiMeta);
  }

  return mergeProjectsWithUi(localFallback.projects, uiMeta);
}

export async function saveData(data: AppState): Promise<void> {
  saveUiMeta(data);

  try {
    await saveServerProjects(data.projects);
  } catch (error) {
    console.error('Failed to save server project state:', error);
  }

  try {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save local fallback data:', error);
  }
}
