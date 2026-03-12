import type { ParseDrawingResponse } from './types';

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

export async function parseDrawing(file: File, mode: string = 'secondary_product'): Promise<ParseDrawingResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('mode', mode);

  const response = await fetch(resolveAiApiUrl('/api/ocr/parse-drawing'), {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let message = 'OCR解析に失敗しました。';
    try {
      const payload = await response.json();
      message = payload?.error?.message || payload?.detail || message;
    } catch {
      // no-op
    }
    throw new Error(message);
  }

  return response.json() as Promise<ParseDrawingResponse>;
}
