import type {
  GeneratedReportBundle,
  ParseDrawingResponse,
  PriceMasterItem,
  ReportGenerationRequest,
} from './types';

const FALLBACK_API_BASE_URL = 'http://127.0.0.1:8000';

export function getAiApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_AI_API_BASE_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }
  return FALLBACK_API_BASE_URL;
}

export function resolveAiApiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  return `${getAiApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
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

export async function parseDrawing(file: File, mode: string = 'secondary_product'): Promise<ParseDrawingResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('mode', mode);

  const response = await fetch(resolveAiApiUrl('/api/ocr/parse-drawing'), {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'OCR解析に失敗しました。'));
  }

  return response.json() as Promise<ParseDrawingResponse>;
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
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, '単価マスタの取得に失敗しました。'));
  }

  const payload = await response.json() as { data?: PriceMasterItem[] };
  return Array.isArray(payload.data) ? payload.data : [];
}

export async function saveMasters(items: PriceMasterItem[]): Promise<PriceMasterItem[]> {
  const response = await fetch('/api/masters', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ items }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, '単価マスタの保存に失敗しました。'));
  }

  const payload = await response.json() as { data?: PriceMasterItem[] };
  return Array.isArray(payload.data) ? payload.data : items;
}

export async function generateReport(request: ReportGenerationRequest): Promise<GeneratedReportBundle> {
  const response = await fetch('/api/reports/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, '帳票生成に失敗しました。'));
  }

  const payload = await response.json() as { data?: GeneratedReportBundle };
  if (!payload.data) {
    throw new Error('帳票データが返却されませんでした。');
  }
  return payload.data;
}
