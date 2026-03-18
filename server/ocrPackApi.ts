import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  getOcrPackDictionaries,
  getOcrPackManifest,
  listOcrPackKnowledge,
  listOcrPackPrompts,
  listOcrPackSkills,
} from './ocrPackStore';

type Next = (err?: unknown) => void;

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function getUrl(req: IncomingMessage): URL {
  return new URL(req.url || '/', 'http://localhost');
}

async function handleOcrPackApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = getUrl(req);
  const pathname = url.pathname;
  const method = req.method || 'GET';

  if (pathname === '/api/ocr-pack/manifest' && method === 'GET') {
    sendJson(res, 200, { success: true, data: await getOcrPackManifest() });
    return true;
  }

  if (pathname === '/api/ocr-pack/knowledge' && method === 'GET') {
    sendJson(res, 200, {
      success: true,
      data: await listOcrPackKnowledge({
        category: url.searchParams.get('category'),
        pipelineStage: url.searchParams.get('pipelineStage'),
        priority: url.searchParams.get('priority'),
      }),
    });
    return true;
  }

  if (pathname === '/api/ocr-pack/skills' && method === 'GET') {
    sendJson(res, 200, { success: true, data: await listOcrPackSkills() });
    return true;
  }

  if (pathname === '/api/ocr-pack/prompts' && method === 'GET') {
    sendJson(res, 200, { success: true, data: await listOcrPackPrompts() });
    return true;
  }

  if (pathname === '/api/ocr-pack/dictionaries' && method === 'GET') {
    sendJson(res, 200, { success: true, data: await getOcrPackDictionaries() });
    return true;
  }

  return false;
}

export function createOcrPackApiMiddleware() {
  return (req: IncomingMessage, res: ServerResponse, next: Next) => {
    handleOcrPackApi(req, res)
      .then((handled) => {
        if (!handled) next();
      })
      .catch((error) => {
        sendJson(res, 500, {
          success: false,
          error: {
            message: error instanceof Error ? error.message : 'OCR skill pack API の処理に失敗しました。',
          },
        });
      });
  };
}
