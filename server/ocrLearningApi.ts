import type { IncomingMessage, ServerResponse } from 'node:http';

import type { OcrLearningEntry } from '../client/src/lib/types';
import { listOcrLearningEntries, upsertOcrLearningEntry } from './ocrLearningStore';

type Next = (err?: unknown) => void;

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {} as T;
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as T;
}

function getWorkspaceId(req: IncomingMessage): string {
  const headerValue = req.headers['x-workspace-id'];
  const workspaceId = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof workspaceId === 'string' && workspaceId.trim()) {
    return workspaceId;
  }
  return 'anonymous';
}

function getPathname(req: IncomingMessage): string {
  return new URL(req.url || '/', 'http://localhost').pathname;
}

async function handleOcrLearningApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const pathname = getPathname(req);
  const method = req.method || 'GET';
  const workspaceId = getWorkspaceId(req);

  if (pathname === '/api/ocr-learning' && method === 'GET') {
    const entries = await listOcrLearningEntries(workspaceId);
    sendJson(res, 200, { success: true, data: { entries } });
    return true;
  }

  if (pathname === '/api/ocr-learning/plan-section-link' && method === 'POST') {
    const body = await readJsonBody<Partial<OcrLearningEntry>>(req);
    if (!body.callout || !body.normalizedCallout || !body.sourceRole || !body.targetRole) {
      sendJson(res, 422, { success: false, error: { message: 'OCR 学習データが不足しています。' } });
      return true;
    }

    const { state, entry } = await upsertOcrLearningEntry(workspaceId, {
      learningType: 'plan_section_link',
      callout: body.callout,
      normalizedCallout: body.normalizedCallout,
      sourceRole: body.sourceRole,
      targetRole: body.targetRole,
      sourceText: body.sourceText ?? '',
      targetText: body.targetText ?? '',
      sourcePageNo: Number(body.sourcePageNo ?? 0),
      targetPageNo: Number(body.targetPageNo ?? 0),
      drawingNo: body.drawingNo,
      drawingTitle: body.drawingTitle,
    });

    sendJson(res, 200, { success: true, data: { entry, entries: state.entries } });
    return true;
  }

  return false;
}

export function createOcrLearningApiMiddleware() {
  return (req: IncomingMessage, res: ServerResponse, next: Next) => {
    handleOcrLearningApi(req, res)
      .then((handled) => {
        if (!handled) {
          next();
        }
      })
      .catch((error) => {
        sendJson(res, 500, {
          success: false,
          error: {
            message: error instanceof Error ? error.message : 'OCR 学習データの処理に失敗しました。',
          },
        });
      });
  };
}
