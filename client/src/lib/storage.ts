import type { AppState, Drawing, EstimateBlock, EstimateZone, Project } from './types';
import { createDefaultBlock, createDefaultDrawing, createDefaultEstimateZone, createDefaultProject, createInitialAppState } from './types';
import { resolveAppApiUrl } from './api';
import { getWorkspaceHeaders, getWorkspaceId } from './workspace';

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
    workspaceId?: string | null;
  };
  projects?: Project[];
}

function workspaceStorageKey(baseKey: string): string {
  return `${baseKey}:${getWorkspaceId()}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeNumberList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'number') return item;
      if (typeof item === 'string' && item.trim()) {
        const next = Number(item);
        return Number.isFinite(next) ? next : null;
      }
      return null;
    })
    .filter((item): item is number => item !== null)
    .map((item) => Math.max(1, Math.round(item)));
}

function normalizeZone(raw: unknown, index: number): EstimateZone {
  const fallback = createDefaultEstimateZone(`区画 ${index + 1}`);
  if (!isObject(raw)) {
    return fallback;
  }

  return {
    ...fallback,
    ...raw,
    id: typeof raw.id === 'string' ? raw.id : fallback.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : fallback.name,
    primaryQuantity: typeof raw.primaryQuantity === 'number' ? raw.primaryQuantity : fallback.primaryQuantity,
    drawingPageRefs: normalizeNumberList(raw.drawingPageRefs),
    notePhotoUrls: normalizeStringList(raw.notePhotoUrls),
    relatedTradeNames: normalizeStringList(raw.relatedTradeNames),
    remobilizationCount: typeof raw.remobilizationCount === 'number' ? raw.remobilizationCount : fallback.remobilizationCount,
    temporaryRestorationRate: typeof raw.temporaryRestorationRate === 'number' ? raw.temporaryRestorationRate : fallback.temporaryRestorationRate,
    coordinationAdjustmentRate: typeof raw.coordinationAdjustmentRate === 'number' ? raw.coordinationAdjustmentRate : fallback.coordinationAdjustmentRate,
    note: typeof raw.note === 'string' ? raw.note : fallback.note,
  };
}

function normalizeBlock(projectId: string, raw: unknown, index: number): EstimateBlock {
  const source = isObject(raw) ? raw as Partial<EstimateBlock> : {};
  const fallback = createDefaultBlock(projectId, source.name || `見積 ${index + 1}`);
  return {
    ...fallback,
    ...source,
    id: typeof source.id === 'string' ? source.id : fallback.id,
    projectId,
    drawingId: typeof source.drawingId === 'string' ? source.drawingId : source.drawingId === null ? null : fallback.drawingId,
    requiresReviewFields: Array.isArray(source.requiresReviewFields) ? source.requiresReviewFields : [],
    appliedCandidateIds: Array.isArray(source.appliedCandidateIds) ? source.appliedCandidateIds : [],
    zones: Array.isArray(source.zones) ? source.zones.map((zone, zoneIndex) => normalizeZone(zone, zoneIndex)) : [],
  };
}

function normalizeDrawing(projectId: string, raw: unknown, index: number): Drawing {
  const source = isObject(raw) ? raw as Partial<Drawing> : {};
  const fallback = createDefaultDrawing(projectId, source.name || `図面 ${index + 1}`);
  return {
    ...fallback,
    ...source,
    id: typeof source.id === 'string' ? source.id : fallback.id,
    projectId,
    pages: Array.isArray(source.pages) ? source.pages : [],
    ocrItems: Array.isArray(source.ocrItems) ? source.ocrItems : [],
    aiCandidates: Array.isArray(source.aiCandidates) ? source.aiCandidates : [],
    workTypeCandidates: Array.isArray(source.workTypeCandidates) ? source.workTypeCandidates : [],
    reviewQueue: Array.isArray(source.reviewQueue) ? source.reviewQueue : [],
    manualResolutions: Array.isArray(source.manualResolutions) ? source.manualResolutions : [],
    manualMeasurements: Array.isArray(source.manualMeasurements) ? source.manualMeasurements : [],
    measurementCalibrations: Array.isArray(source.measurementCalibrations) ? source.measurementCalibrations : [],
  };
}

function normalizeProject(project: Project): Project {
  return {
    ...project,
    drawings: Array.isArray(project.drawings)
      ? project.drawings.map((drawing, index) => normalizeDrawing(project.id, drawing, index))
      : [],
    blocks: Array.isArray(project.blocks)
      ? project.blocks.map((block, index) => normalizeBlock(project.id, block, index))
      : [createDefaultBlock(project.id, `${project.name} 見積 1`)],
  };
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
        zones: Array.isArray(block.zones) ? block.zones.map((zone, zoneIndex) => normalizeZone(zone, zoneIndex)) : [],
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

  const projects = raw.projects.length > 0
    ? (raw.projects as Project[]).map((project) => normalizeProject(project))
    : createInitialAppState().projects;
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
  const scopedKey = workspaceStorageKey(LEGACY_STORAGE_KEY);
  try {
    const scopedRaw = localStorage.getItem(scopedKey);
    if (scopedRaw) {
      return normalizeState(JSON.parse(scopedRaw));
    }

    const globalRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!globalRaw) return null;
    const migrated = normalizeState(JSON.parse(globalRaw));
    localStorage.setItem(scopedKey, JSON.stringify(migrated));
    return migrated;
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
  const scopedKey = workspaceStorageKey(UI_STORAGE_KEY);
  try {
    const raw = localStorage.getItem(scopedKey);
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
  const scopedKey = workspaceStorageKey(UI_STORAGE_KEY);
  try {
    const payload: UiStateMeta = {
      activeProjectId: data.activeProjectId,
      activeDrawingId: data.activeDrawingId,
      activeBlockId: data.activeBlockId,
      autoSave: data.autoSave,
    };
    localStorage.setItem(scopedKey, JSON.stringify(payload));
  } catch (error) {
    console.error('Failed to save UI state meta:', error);
  }
}

async function loadServerProjects(): Promise<Project[] | null> {
  try {
    const response = await fetch(resolveAppApiUrl('/api/app-state'), {
      headers: getWorkspaceHeaders(),
    });
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
  const response = await fetch(resolveAppApiUrl('/api/app-state'), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getWorkspaceHeaders(),
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
    localStorage.setItem(workspaceStorageKey(LEGACY_STORAGE_KEY), JSON.stringify(merged));
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
    localStorage.setItem(workspaceStorageKey(LEGACY_STORAGE_KEY), JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save local fallback data:', error);
  }
}
