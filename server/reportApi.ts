import type { IncomingMessage, ServerResponse } from 'node:http';

import { calculate } from '../client/src/lib/calculations';
import { generateReportBundle } from '../client/src/lib/reporting';
import type { ChangeEstimatePdfRequest, Drawing, EstimateBlock, Project, ReportGenerationRequest } from '../client/src/lib/types';
import { getProjectById } from './appStateStore';
import { generateChangeEstimatePdfDocument } from './changeEstimatePdf';
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

function getWorkspaceId(req: IncomingMessage): string {
  const headerValue = req.headers['x-workspace-id'];
  const workspaceId = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof workspaceId === 'string' && workspaceId.trim()) {
    return workspaceId;
  }
  return 'anonymous';
}

async function resolveContext(req: IncomingMessage, body: ReportGenerationRequest): Promise<{ project: Project; block: EstimateBlock; drawing: Drawing | null; effectiveDate: string }> {
  const effectiveDate = body.effectiveDate ?? new Date().toISOString().slice(0, 10);

  if (body.project && body.block) {
    return {
      project: body.project,
      block: body.block,
      drawing: body.drawing ?? null,
      effectiveDate,
    };
  }

  if (!body.projectId || !body.blockId) {
    throw new Error('帳票生成には project/block のスナップショット、または projectId/blockId が必要です。');
  }

  const project = await getProjectById(getWorkspaceId(req), body.projectId);
  if (!project) {
    throw new Error('案件が見つかりません。');
  }

  const block = project.blocks.find((item) => item.id === body.blockId);
  if (!block) {
    throw new Error('見積ブロックが見つかりません。');
  }

  const drawing = project.drawings.find((item) => item.id === (body.drawingId ?? block.drawingId ?? '')) ?? null;
  return { project, block, drawing, effectiveDate };
}

async function handleReportApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  if ((req.method || 'GET') !== 'POST' || !['/api/reports/generate', '/api/reports/change-estimate.pdf'].includes(pathname)) {
    return false;
  }

  const body = await readJsonBody<ReportGenerationRequest | ChangeEstimatePdfRequest>(req);
  const { project, block, drawing, effectiveDate } = await resolveContext(req, body);
  const masters = await listMasterItems({ effectiveDate });
  const result = calculate(block, { masters, effectiveDate });
  const outputMode = (body as ReportGenerationRequest).outputMode ?? 'confirmed';
  const bundle = generateReportBundle({ project, block, drawing, result, outputMode });

  if (pathname === '/api/reports/change-estimate.pdf') {
    const pdfRequest = body as ChangeEstimatePdfRequest;
    if (!pdfRequest.header?.issueDate || !pdfRequest.header?.recipientName || !pdfRequest.header?.constructionName || !pdfRequest.header?.changeReason) {
      throw new Error('変更見積書PDFには発行日・宛名・工事名・変更理由が必要です。');
    }

    const pdfBytes = await generateChangeEstimatePdfDocument({
      bundle,
      header: pdfRequest.header,
      projectName: project.name,
      estimateName: block.name,
    });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`${project.name}_${block.name}_変更見積書.pdf`)}`);
    res.end(Buffer.from(pdfBytes));
    return true;
  }

  sendJson(res, 200, { success: true, data: bundle });
  return true;
}

export function createReportApiMiddleware() {
  return (req: IncomingMessage, res: ServerResponse, next: Next) => {
    handleReportApi(req, res)
      .then((handled) => {
        if (!handled) {
          next();
        }
      })
      .catch((error) => {
        sendJson(res, 500, {
          success: false,
          error: {
            message: error instanceof Error ? error.message : '帳票生成に失敗しました。',
          },
        });
      });
  };
}
