import type { IncomingMessage, ServerResponse } from 'node:http';

import type { PriceMasterItem } from '../client/src/lib/types';
import { getMasterItemById, listMasterItems, replaceMasterItems, upsertMasterItem } from './masterStore';

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

function getUrl(req: IncomingMessage): URL {
  return new URL(req.url || '/', 'http://localhost');
}

function isMasterItem(value: unknown): value is PriceMasterItem {
  return typeof value === 'object' && value !== null && typeof (value as PriceMasterItem).id === 'string';
}

async function handleMasterApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = getUrl(req);
  const pathname = url.pathname;
  const method = req.method || 'GET';

  if (pathname === '/api/masters') {
    if (method === 'GET') {
      const items = await listMasterItems({
        masterType: url.searchParams.get('masterType'),
        keyword: url.searchParams.get('keyword'),
        effectiveDate: url.searchParams.get('effectiveDate'),
      });
      sendJson(res, 200, { success: true, data: items });
      return true;
    }

    if (method === 'POST') {
      const body = await readJsonBody<PriceMasterItem>(req);
      if (!isMasterItem(body)) {
        sendJson(res, 422, { success: false, error: { message: '単価マスタの形式が不正です。' } });
        return true;
      }
      const item = await upsertMasterItem(body);
      sendJson(res, 200, { success: true, data: item });
      return true;
    }

    if (method === 'PUT') {
      const body = await readJsonBody<{ items?: PriceMasterItem[] }>(req);
      const items = Array.isArray(body.items) ? body.items : [];
      const saved = await replaceMasterItems(items);
      sendJson(res, 200, { success: true, data: saved });
      return true;
    }
  }

  const masterMatch = pathname.match(/^\/api\/masters\/([^/]+)$/);
  if (masterMatch) {
    const masterId = decodeURIComponent(masterMatch[1]);

    if (method === 'GET') {
      const item = await getMasterItemById(masterId);
      if (!item) {
        sendJson(res, 404, { success: false, error: { message: '単価マスタが見つかりません。' } });
        return true;
      }
      sendJson(res, 200, { success: true, data: item });
      return true;
    }

    if (method === 'PUT') {
      const body = await readJsonBody<PriceMasterItem>(req);
      if (!isMasterItem(body) || body.id !== masterId) {
        sendJson(res, 422, { success: false, error: { message: '単価マスタIDが一致しません。' } });
        return true;
      }
      const item = await upsertMasterItem(body);
      sendJson(res, 200, { success: true, data: item });
      return true;
    }
  }

  return false;
}

export function createMasterApiMiddleware() {
  return (req: IncomingMessage, res: ServerResponse, next: Next) => {
    handleMasterApi(req, res)
      .then((handled) => {
        if (!handled) {
          next();
        }
      })
      .catch((error) => {
        sendJson(res, 500, {
          success: false,
          error: {
            message: error instanceof Error ? error.message : '単価マスタ処理に失敗しました。',
          },
        });
      });
  };
}
