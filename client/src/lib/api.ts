import type {
  GeneratedReportBundle,
  ParseDrawingResponse,
  PriceMasterItem,
  ReportGenerationRequest,
} from './types';

const FALLBACK_API_BASE_URL = 'http://127.0.0.1:8000';
const LOCAL_APP_URL = 'http://localhost:3000';

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

export function getAiApiUnavailableMessage(): string {
  return `この公開 preview には OCR API が接続されていません。ローカル版 ${LOCAL_APP_URL} と OCR API ${FALLBACK_API_BASE_URL} を起動して使うか、VITE_AI_API_BASE_URL に HTTPS の OCR API を設定してください。`;
}

export function getServerApiUnavailableMessage(): string {
  return `この公開 preview には単価・帳票 API が接続されていません。ローカル版 ${LOCAL_APP_URL} を使うか、Express API を同時に公開してください。`;
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

export async function parseDrawing(file: File, mode: string = 'secondary_product'): Promise<ParseDrawingResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('mode', mode);

  try {
    const response = await fetch(resolveAiApiUrl('/api/ocr/parse-drawing'), {
      method: 'POST',
      body: formData,
    });
    await ensureJsonApiResponse(response, getAiApiUnavailableMessage(), 'OCR解析に失敗しました。');
    return response.json() as Promise<ParseDrawingResponse>;
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

  const url = `/api/masters${params.toString() ? `?${params.toString()}` : ''}`;
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
    const response = await fetch('/api/masters', {
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
    const response = await fetch('/api/reports/generate', {
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
