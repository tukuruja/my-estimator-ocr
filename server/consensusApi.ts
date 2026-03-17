import type { IncomingMessage, ServerResponse } from 'node:http';

import { calculate } from '../client/src/lib/calculations';
import { generateReportBundle } from '../client/src/lib/reporting';
import type { Drawing, EstimateBlock, Project } from '../client/src/lib/types';
import {
  buildConstructionConsensusContext,
  buildConstructionConsensusOpenAiRequest,
  CONSTRUCTION_CONSENSUS_BLUEPRINT,
  type ConstructionConsensusPreviewInput,
  type ConstructionSiteConditions,
} from '../shared/constructionConsensus';
import { listMasterItems } from './masterStore';

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

interface PreviewRequestBody {
  project?: Project;
  block?: EstimateBlock;
  drawing?: Drawing | null;
  effectiveDate?: string;
  siteConditions?: Partial<ConstructionSiteConditions>;
}

async function buildPreviewResponse(body: PreviewRequestBody) {
  if (!body.project || !body.block) {
    throw new Error('preview-request には project と block の snapshot が必要です。');
  }

  const effectiveDate = body.effectiveDate ?? new Date().toISOString().slice(0, 10);
  const masters = await listMasterItems({ effectiveDate });
  const result = calculate(body.block, { masters, effectiveDate });
  const reportBundle = generateReportBundle({
    project: body.project,
    block: body.block,
    drawing: body.drawing ?? null,
    result,
  });

  const previewInput: ConstructionConsensusPreviewInput = {
    project: body.project,
    block: body.block,
    drawing: body.drawing ?? null,
    reportBundle,
    masters,
    effectiveDate,
    siteConditions: body.siteConditions,
  };

  return {
    blueprint: CONSTRUCTION_CONSENSUS_BLUEPRINT,
    context: buildConstructionConsensusContext(previewInput),
    openAiResponsesRequest: buildConstructionConsensusOpenAiRequest(previewInput),
  };
}

async function handleConsensusApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const pathname = getPathname(req);
  const method = req.method || 'GET';

  if (pathname === '/api/ai/consensus/blueprint' && method === 'GET') {
    sendJson(res, 200, { success: true, data: CONSTRUCTION_CONSENSUS_BLUEPRINT });
    return true;
  }

  if (pathname === '/api/ai/consensus/preview-request' && method === 'POST') {
    const body = await readJsonBody<PreviewRequestBody>(req);
    const preview = await buildPreviewResponse(body);
    sendJson(res, 200, { success: true, data: preview });
    return true;
  }

  return false;
}

export function createConsensusApiMiddleware() {
  return (req: IncomingMessage, res: ServerResponse, next: Next) => {
    handleConsensusApi(req, res)
      .then((handled) => {
        if (!handled) {
          next();
        }
      })
      .catch((error) => {
        sendJson(res, 500, {
          success: false,
          error: {
            message: error instanceof Error ? error.message : '建設現場合意エンジンの検証に失敗しました。',
          },
        });
      });
  };
}
