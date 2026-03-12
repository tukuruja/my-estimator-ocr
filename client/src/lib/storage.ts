import type { AppState, EstimateBlock } from './types';
import { createDefaultBlock, createDefaultProject, createInitialAppState } from './types';

const STORAGE_KEY = 'my-estimator-data';

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

  const projects = raw.projects.length > 0 ? raw.projects : createInitialAppState().projects;
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
  } as AppState;
}

export function loadData(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return normalizeState(JSON.parse(raw));
    }
  } catch (error) {
    console.error('Failed to load data:', error);
  }
  return createInitialAppState();
}

export function saveData(data: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save data:', error);
  }
}
