import type {
  GeneratedReportBundle,
  ParseDrawingResponse,
  PriceMasterItem,
  ReportGenerationRequest,
} from './types';
import type {
  ConstructionConsensusBlueprint,
  ConstructionConsensusPreviewResponse,
  ConstructionSiteConditions,
} from '@shared/constructionConsensus';
import type { Drawing, EstimateBlock, Project } from './types';

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

async function createParseDrawingJob(file: File, mode: string): Promise<OcrParseJobState> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('mode', mode);

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
  },
): Promise<ParseDrawingResponse> {
  try {
    const initialJob = await createParseDrawingJob(file, mode);
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
    const response = await fetch(resolveAppApiUrl('/api/ai/consensus/blueprint'));
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
