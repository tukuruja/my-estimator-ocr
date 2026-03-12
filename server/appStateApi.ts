import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  deleteProjectById,
  getProjectById,
  listProjects,
  readPersistedState,
  upsertProject,
  writePersistedState,
} from './appStateStore';

import type { Project } from '../client/src/lib/types';

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

function getPathname(req: IncomingMessage): string {
  return new URL(req.url || '/', 'http://localhost').pathname;
}

function isProject(value: unknown): value is Project {
  return typeof value === 'object' && value !== null && typeof (value as Project).id === 'string';
}

async function handleAppState(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const pathname = getPathname(req);
  const method = req.method || 'GET';

  if (pathname === '/api/app-state') {
    if (method === 'GET') {
      const state = await readPersistedState();
      sendJson(res, 200, { success: true, data: state });
      return true;
    }

    if (method === 'PUT') {
      const body = await readJsonBody<{ projects?: Project[] }>(req);
      const state = await writePersistedState({ projects: Array.isArray(body.projects) ? body.projects : [] });
      sendJson(res, 200, { success: true, data: state });
      return true;
    }
  }

  if (pathname === '/api/projects') {
    if (method === 'GET') {
      const projects = await listProjects();
      sendJson(res, 200, { success: true, data: projects });
      return true;
    }

    if (method === 'POST') {
      const body = await readJsonBody<Project>(req);
      if (!isProject(body)) {
        sendJson(res, 422, { success: false, error: { message: '案件データが不正です。' } });
        return true;
      }
      const state = await upsertProject(body);
      sendJson(res, 200, { success: true, data: state.projects.find((project) => project.id === body.id) ?? body });
      return true;
    }
  }

  const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch) {
    const projectId = decodeURIComponent(projectMatch[1]);

    if (method === 'GET') {
      const project = await getProjectById(projectId);
      if (!project) {
        sendJson(res, 404, { success: false, error: { message: '案件が見つかりません。' } });
        return true;
      }
      sendJson(res, 200, { success: true, data: project });
      return true;
    }

    if (method === 'PUT') {
      const body = await readJsonBody<Project>(req);
      if (!isProject(body) || body.id !== projectId) {
        sendJson(res, 422, { success: false, error: { message: '案件IDが一致しません。' } });
        return true;
      }
      const state = await upsertProject(body);
      sendJson(res, 200, { success: true, data: state.projects.find((project) => project.id === projectId) ?? body });
      return true;
    }

    if (method === 'DELETE') {
      const { deleted } = await deleteProjectById(projectId);
      if (!deleted) {
        sendJson(res, 404, { success: false, error: { message: '案件が見つかりません。' } });
        return true;
      }
      sendJson(res, 200, { success: true, data: { deleted: true, projectId } });
      return true;
    }
  }

  const drawingsMatch = pathname.match(/^\/api\/projects\/([^/]+)\/drawings$/);
  if (drawingsMatch && method === 'GET') {
    const projectId = decodeURIComponent(drawingsMatch[1]);
    const project = await getProjectById(projectId);
    if (!project) {
      sendJson(res, 404, { success: false, error: { message: '案件が見つかりません。' } });
      return true;
    }
    sendJson(res, 200, { success: true, data: project.drawings });
    return true;
  }

  return false;
}

export function createAppStateApiMiddleware() {
  return (req: IncomingMessage, res: ServerResponse, next: Next) => {
    handleAppState(req, res)
      .then((handled) => {
        if (!handled) {
          next();
        }
      })
      .catch((error) => {
        sendJson(res, 500, {
          success: false,
          error: {
            message: error instanceof Error ? error.message : 'サーバ保存処理に失敗しました。',
          },
        });
      });
  };
}
