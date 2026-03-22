import type {
  GeneratedReportBundle,
  OcrLearningContext,
  OcrLearningEntry,
  ParseDrawingResponse,
  PriceMasterItem,
  ReportGenerationRequest,
} from './types';
import type {
  ConstructionConsensusBlueprint,
  ConstructionConsensusPreviewResponse,
  ConstructionSiteConditions,
} from '@shared/constructionConsensus';
import type {
  EstimationLogicBlueprint,
  EstimationLogicPreviewResponse,
  EstimationLogicRunResponse,
} from '@shared/estimationLogic';
import type { Drawing, EstimateBlock, Project } from './types';
import { getWorkspaceHeaders } from './workspace';

const FALLBACK_API_BASE_URL = 'http://127.0.0.1:8000';
const LOCAL_APP_URL = 'http://localhost:3000';
const OCR_JOB_POLL_INTERVAL_MS = 1500;
const OCR_JOB_TIMEOUT_MS = 5 * 60 * 1000;

export interface OcrParseJobState {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progressMessage: string;
  createdAt: string;
  updatedAt: string;
  result?: ParseDrawingResponse;
  error?: {
    message: string;
  };
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function isLocalAppOrigin(): boolean {
  if (!isBrowser()) return false;
  return ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

function isLikelyHostedPreview(): boolean {
  if (!isBrowser()) return false;
  return !isLocalAppOrigin();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function getAiApiUnavailableMessage(): string {
  return `この公開 preview には OCR API が接続されていません。ローカル版 ${LOCAL_APP_URL} と OCR API ${FALLBACK_API_BASE_URL} を起動して使うか、VITE_AI_API_BASE_URL に HTTPS の OCR API を設定してください。`;
}

export function getServerApiUnavailableMessage(): string {
  return `この公開 preview には単価・帳票 API が接続されていません。ローカル版 ${LOCAL_APP_URL} を使うか、VITE_APP_API_BASE_URL に HTTPS の Express API を設定してください。`;
}

export function getAppApiBaseUrl(): string | null {
  const envUrl = import.meta.env.VITE_APP_API_BASE_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }
  if (isLocalAppOrigin()) {
    return '';
  }
  return null;
}

export function isAppApiAvailable(): boolean {
  return getAppApiBaseUrl() !== null;
}

export function resolveAppApiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  const baseUrl = getAppApiBaseUrl();
  if (baseUrl === null) {
    throw new Error(getServerApiUnavailableMessage());
  }
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

export function getAiApiBaseUrl(): string | null {
  const envUrl = import.meta.env.VITE_AI_API_BASE_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }
  if (isLocalAppOrigin()) {
    return FALLBACK_API_BASE_URL;
  }
  return null;
}

export function isAiApiAvailable(): boolean {
  return Boolean(getAiApiBaseUrl());
}

export function resolveAiApiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  const baseUrl = getAiApiBaseUrl();
  if (!baseUrl) {
    throw new Error(getAiApiUnavailableMessage());
  }
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  let message = fallback;
  try {
    const payload = await response.json();
    message = payload?.error?.message || payload?.detail || message;
  } catch {
    // no-op
  }
  return message;
}

async function ensureJsonApiResponse(
  response: Response,
  unavailableMessage: string,
  fallbackMessage: string,
): Promise<Response> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/html')) {
    throw new Error(unavailableMessage);
  }
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, fallbackMessage));
  }
  return response;
}

async function createParseDrawingJob(file: File, mode: string, learningContext?: OcrLearningContext): Promise<OcrParseJobState> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('mode', mode);
  if (learningContext && learningContext.planSectionLinks.length > 0) {
    formData.append('learningContext', JSON.stringify(learningContext));
  }

  const response = await fetch(resolveAiApiUrl('/api/ocr/jobs'), {
    method: 'POST',
    body: formData,
  });
  await ensureJsonApiResponse(response, getAiApiUnavailableMessage(), 'OCRジョブの作成に失敗しました。');
  return response.json() as Promise<OcrParseJobState>;
}

async function fetchParseDrawingJob(jobId: string): Promise<OcrParseJobState> {
  const response = await fetch(resolveAiApiUrl(`/api/ocr/jobs/${jobId}`));
  await ensureJsonApiResponse(response, getAiApiUnavailableMessage(), 'OCRジョブの状態取得に失敗しました。');
  return response.json() as Promise<OcrParseJobState>;
}

export async function parseDrawing(
  file: File,
  mode: string = 'secondary_product',
  options?: {
    onProgress?: (job: OcrParseJobState) => void;
    timeoutMs?: number;
    learningContext?: OcrLearningContext;
  },
): Promise<ParseDrawingResponse> {
  try {
    const initialJob = await createParseDrawingJob(file, mode, options?.learningContext);
    options?.onProgress?.(initialJob);

    const deadline = Date.now() + (options?.timeoutMs ?? OCR_JOB_TIMEOUT_MS);
    let currentJob = initialJob;

    while (Date.now() <= deadline) {
      if (currentJob.status === 'completed' && currentJob.result) {
        return currentJob.result;
      }
      if (currentJob.status === 'failed') {
        throw new Error(currentJob.error?.message || 'OCR解析ジョブが失敗しました。');
      }
      await sleep(OCR_JOB_POLL_INTERVAL_MS);
      currentJob = await fetchParseDrawingJob(initialJob.jobId);
      options?.onProgress?.(currentJob);
    }

    throw new Error('OCR解析がタイムアウトしました。しばらく待ってから再実行してください。');
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Failed to fetch' && isLikelyHostedPreview()) {
        throw new Error(getAiApiUnavailableMessage());
      }
      throw error;
    }
    throw new Error(getAiApiUnavailableMessage());
  }
}

export async function fetchOcrLearningEntries(): Promise<OcrLearningEntry[]> {
  const response = await fetch(resolveAppApiUrl('/api/ocr-learning'), {
    headers: getWorkspaceHeaders(),
  });
  await ensureJsonApiResponse(response, getServerApiUnavailableMessage(), 'OCR 学習データの取得に失敗しました。');
  const payload = await response.json() as { data?: { entries?: OcrLearningEntry[] } };
  return Array.isArray(payload.data?.entries) ? payload.data.entries : [];
}

export async function savePlanSectionLearning(
  entry: Omit<OcrLearningEntry, 'id' | 'learningType' | 'adoptionCount' | 'createdAt' | 'updatedAt'>,
): Promise<OcrLearningEntry[]> {
  const response = await fetch(resolveAppApiUrl('/api/ocr-learning/plan-section-link'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getWorkspaceHeaders(),
    },
    body: JSON.stringify(entry),
  });
  await ensureJsonApiResponse(response, getServerApiUnavailableMessage(), 'OCR 学習データの保存に失敗しました。');
  const payload = await response.json() as { data?: { entries?: OcrLearningEntry[] } };
  return Array.isArray(payload.data?.entries) ? payload.data.entries : [];
}

export async function fetchMasters(query: {
  masterType?: string;
  keyword?: string;
  effectiveDate?: string;
} = {}): Promise<PriceMasterItem[]> {
  const params = new URLSearchParams();
  if (query.masterType) params.set('masterType', query.masterType);
  if (query.keyword) params.set('keyword', query.keyword);
  if (query.effectiveDate) params.set('effectiveDate', query.effectiveDate);

  const url = resolveAppApiUrl(`/api/masters${params.toString() ? `?${params.toString()}` : ''}`);
  try {
    const response = await fetch(url);
    await ensureJsonApiResponse(response, getServerApiUnavailableMessage(), '単価マスタの取得に失敗しました。');
    const payload = await response.json() as { data?: PriceMasterItem[] };
    return Array.isArray(payload.data) ? payload.data : [];
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Failed to fetch' && isLikelyHostedPreview()) {
        throw new Error(getServerApiUnavailableMessage());
      }
      throw error;
    }
    throw new Error(getServerApiUnavailableMessage());
  }
}

export async function saveMasters(items: PriceMasterItem[]): Promise<PriceMasterItem[]> {
  try {
    const response = await fetch(resolveAppApiUrl('/api/masters'), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getWorkspaceHeaders(),
      },
      body: JSON.stringify({ items }),
    });
    await ensureJsonApiResponse(response, getServerApiUnavailableMessage(), '単価マスタの保存に失敗しました。');
    const payload = await response.json() as { data?: PriceMasterItem[] };
    return Array.isArray(payload.data) ? payload.data : items;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Failed to fetch' && isLikelyHostedPreview()) {
        throw new Error(getServerApiUnavailableMessage());
      }
      throw error;
    }
    throw new Error(getServerApiUnavailableMessage());
  }
}

export async function generateReport(request: ReportGenerationRequest): Promise<GeneratedReportBundle> {
  try {
    const response = await fetch(resolveAppApiUrl('/api/reports/generate'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getWorkspaceHeaders(),
      },
      body: JSON.stringify(request),
    });
    await ensureJsonApiResponse(response, getServerApiUnavailableMessage(), '帳票生成に失敗しました。');
    const payload = await response.json() as { data?: GeneratedReportBundle };
    if (!payload.data) {
      throw new Error('帳票データが返却されませんでした。');
    }
    return payload.data;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Failed to fetch' && isLikelyHostedPreview()) {
        throw new Error(getServerApiUnavailableMessage());
      }
      throw error;
    }
    throw new Error(getServerApiUnavailableMessage());
  }
}

export async function fetchConsensusBlueprint(): Promise<ConstructionConsensusBlueprint> {
  try {
    const response = await fetch(resolveAppApiUrl('/api/ai/consensus/blueprint'), {
      headers: getWorkspaceHeaders(),
    });
    await ensureJsonApiResponse(response, getServerApiUnavailableMessage(), 'AI設計情報の取得に失敗しました。');
    const payload = await response.json() as { data?: ConstructionConsensusBlueprint };
    if (!payload.data) {
      throw new Error('AI設計情報が返却されませんでした。');
    }
    return payload.data;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Failed to fetch' && isLikelyHostedPreview()) {
        throw new Error(getServerApiUnavailableMessage());
      }
      throw error;
    }
    throw new Error(getServerApiUnavailableMessage());
  }
}

export async function previewConsensusRequest(input: {
  project: Project;
  block: EstimateBlock;
  drawing: Drawing | null;
  effectiveDate?: string;
  siteConditions?: Partial<ConstructionSiteConditions>;
}): Promise<ConstructionConsensusPreviewResponse> {
  try {
    const response = await fetch(resolveAppApiUrl('/api/ai/consensus/preview-request'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getWorkspaceHeaders(),
      },
      body: JSON.stringify(input),
    });
    await ensureJsonApiResponse(response, getServerApiUnavailableMessage(), 'AI設計の検証リクエスト生成に失敗しました。');
    const payload = await response.json() as { data?: ConstructionConsensusPreviewResponse };
    if (!payload.data) {
      throw new Error('AI設計の検証結果が返却されませんでした。');
    }
    return payload.data;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Failed to fetch' && isLikelyHostedPreview()) {
        throw new Error(getServerApiUnavailableMessage());
      }
      throw error;
    }
    throw new Error(getServerApiUnavailableMessage());
  }
}

export async function fetchEstimationLogicBlueprint(): Promise<EstimationLogicBlueprint> {
  try {
    const response = await fetch(resolveAppApiUrl('/api/ai/estimation-logic/blueprint'), {
      headers: getWorkspaceHeaders(),
    });
    await ensureJsonApiResponse(response, getServerApiUnavailableMessage(), '見積ロジック情報の取得に失敗しました。');
    const payload = await response.json() as { data?: EstimationLogicBlueprint };
    if (!payload.data) {
      throw new Error('見積ロジック情報が返却されませんでした。');
    }
    return payload.data;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Failed to fetch' && isLikelyHostedPreview()) {
        throw new Error(getServerApiUnavailableMessage());
      }
      throw error;
    }
    throw new Error(getServerApiUnavailableMessage());
  }
}

export async function previewEstimationLogicRequest(input: {
  project: Project;
  block: EstimateBlock;
  drawing: Drawing | null;
  effectiveDate?: string;
}): Promise<EstimationLogicPreviewResponse> {
  try {
    const response = await fetch(resolveAppApiUrl('/api/ai/estimation-logic/preview-request'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getWorkspaceHeaders(),
      },
      body: JSON.stringify(input),
    });
    await ensureJsonApiResponse(response, getServerApiUnavailableMessage(), '見積ロジックの preview 生成に失敗しました。');
    const payload = await response.json() as { data?: EstimationLogicPreviewResponse };
    if (!payload.data) {
      throw new Error('見積ロジックの preview が返却されませんでした。');
    }
    return payload.data;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Failed to fetch' && isLikelyHostedPreview()) {
        throw new Error(getServerApiUnavailableMessage());
      }
      throw error;
    }
    throw new Error(getServerApiUnavailableMessage());
  }
}

export async function runEstimationLogic(input: {
  project: Project;
  block: EstimateBlock;
  drawing: Drawing | null;
  effectiveDate?: string;
}): Promise<EstimationLogicRunResponse> {
  try {
    const response = await fetch(resolveAppApiUrl('/api/ai/estimation-logic/run'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getWorkspaceHeaders(),
      },
      body: JSON.stringify(input),
    });
    await ensureJsonApiResponse(response, getServerApiUnavailableMessage(), '見積ロジックの実行に失敗しました。');
    const payload = await response.json() as { data?: EstimationLogicRunResponse };
    if (!payload.data) {
      throw new Error('見積ロジックの実行結果が返却されませんでした。');
    }
    return payload.data;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Failed to fetch' && isLikelyHostedPreview()) {
        throw new Error(getServerApiUnavailableMessage());
      }
      throw error;
    }
    throw new Error(getServerApiUnavailableMessage());
  }
}

export async function fetchEstimationLogicAuditLogs(limit: number = 20): Promise<EstimationLogicRunResponse[]> {
  try {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    const response = await fetch(resolveAppApiUrl(`/api/ai/estimation-logic/audit-logs?${params.toString()}`), {
      headers: getWorkspaceHeaders(),
    });
    await ensureJsonApiResponse(response, getServerApiUnavailableMessage(), '見積ロジック監査ログの取得に失敗しました。');
    const payload = await response.json() as { data?: EstimationLogicRunResponse[] };
    return Array.isArray(payload.data) ? payload.data : [];
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Failed to fetch' && isLikelyHostedPreview()) {
        throw new Error(getServerApiUnavailableMessage());
      }
      throw error;
    }
    throw new Error(getServerApiUnavailableMessage());
  }
}
