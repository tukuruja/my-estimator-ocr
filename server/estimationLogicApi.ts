import type { IncomingMessage, ServerResponse } from 'node:http';

import { calculate } from '../client/src/lib/calculations';
import { generateReportBundle } from '../client/src/lib/reporting';
import type { Drawing, EstimateBlock, Project } from '../client/src/lib/types';
import {
  buildEstimationLogicOpenAiRequest,
  buildEstimationLogicPreview,
  type EstimationLogicExecution,
  type EstimationLogicRunResponse,
  ESTIMATION_LOGIC_BLUEPRINT,
  type EstimationLogicPreviewInput,
} from '../shared/estimationLogic';
import { listEstimationLogicAuditLogs, writeEstimationLogicAuditLog } from './estimationLogicAuditStore';
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

function getSearchParams(req: IncomingMessage): URLSearchParams {
  return new URL(req.url || '/', 'http://localhost').searchParams;
}

interface PreviewRequestBody {
  project?: Project;
  block?: EstimateBlock;
  drawing?: Drawing | null;
  effectiveDate?: string;
}

function getWorkspaceId(req: IncomingMessage): string {
  const headerValue = req.headers['x-workspace-id'];
  const workspaceId = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof workspaceId === 'string' && workspaceId.trim()) {
    return workspaceId;
  }
  return 'anonymous';
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

  const previewInput: EstimationLogicPreviewInput = {
    project: body.project,
    block: body.block,
    drawing: body.drawing ?? null,
    reportBundle,
    effectiveDate,
  };

  return buildEstimationLogicPreview(previewInput);
}

function buildAuditBase(workspaceId: string, body: PreviewRequestBody) {
  return {
    id: crypto.randomUUID(),
    workspaceId,
    createdAt: new Date().toISOString(),
    projectId: body.project?.id ?? 'unknown',
    blockId: body.block?.id ?? 'unknown',
    drawingId: body.drawing?.id ?? null,
  };
}

function extractOutputText(payload: any): string | null {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text;
  }
  const parts = Array.isArray(payload?.output) ? payload.output : [];
  for (const part of parts) {
    const contents = Array.isArray(part?.content) ? part.content : [];
    for (const content of contents) {
      if (typeof content?.text === 'string' && content.text.trim()) {
        return content.text;
      }
      if (typeof content?.output_text === 'string' && content.output_text.trim()) {
        return content.output_text;
      }
    }
  }
  return null;
}

function extractRefusal(payload: any): string | null {
  if (typeof payload?.refusal === 'string' && payload.refusal.trim()) {
    return payload.refusal;
  }
  const parts = Array.isArray(payload?.output) ? payload.output : [];
  for (const part of parts) {
    const contents = Array.isArray(part?.content) ? part.content : [];
    for (const content of contents) {
      if (typeof content?.refusal === 'string' && content.refusal.trim()) {
        return content.refusal;
      }
    }
  }
  return null;
}

async function runOpenAiExecution(
  preview: Awaited<ReturnType<typeof buildPreviewResponse>>,
  apiKey: string,
  model: string,
): Promise<{ execution: EstimationLogicExecution; responseId: string | null; refusal: string | null; requestPayload: Record<string, unknown> }> {
  const requestPayload = {
    ...preview.openAiResponsesRequest,
    model,
  };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestPayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Responses API が失敗しました: ${response.status} ${errorText}`);
  }

  const payload = await response.json() as any;
  const refusal = extractRefusal(payload);
  const outputText = extractOutputText(payload);
  if (!outputText) {
    throw new Error('OpenAI Responses API から JSON 出力が返りませんでした。');
  }

  return {
    execution: JSON.parse(outputText) as EstimationLogicExecution,
    responseId: typeof payload?.id === 'string' ? payload.id : null,
    refusal,
    requestPayload,
  };
}

// ─── Gemini API 実行 ──────────────────────────────────────────────────────────

async function runGeminiExecution(
  preview: Awaited<ReturnType<typeof buildPreviewResponse>>,
  apiKey: string,
  model: string,
): Promise<{ execution: EstimationLogicExecution; responseId: string | null; refusal: string | null }> {
  // OpenAI Responses API 形式のリクエストから system/user テキストを抽出
  const req = preview.openAiResponsesRequest as {
    input?: Array<{ role: string; content: Array<{ type: string; text: string }> }>;
  };
  const inputs = req.input ?? [];

  const systemText = inputs
    .filter((m) => m.role === 'system')
    .flatMap((m) => m.content)
    .map((c) => c.text)
    .join('\n');

  const userText = inputs
    .filter((m) => m.role === 'user')
    .flatMap((m) => m.content)
    .map((c) => c.text)
    .join('\n');

  // Gemini generateContent リクエスト（JSON モード）
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const geminiBody = {
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.0,
    },
  };

  const response = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(geminiBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API が失敗しました: ${response.status} ${errorText}`);
  }

  const payload = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini API から JSON 出力が返りませんでした。');
  }

  return {
    execution: JSON.parse(text) as EstimationLogicExecution,
    responseId: null,
    refusal: null,
  };
}

// ─── メイン実行関数 ───────────────────────────────────────────────────────────

async function buildRunResponse(workspaceId: string, body: PreviewRequestBody): Promise<EstimationLogicRunResponse> {
  const preview = await buildPreviewResponse(body);
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini';
  const geminiModel = process.env.GEMINI_MODEL?.trim() || 'gemini-1.5-flash';
  const warnings: string[] = [];

  let execution = preview.execution;
  let mode: 'openai' | 'fallback' = 'fallback';
  let responseId: string | null = null;
  let refusal: string | null = null;
  let openAiResponsesRequest = preview.openAiResponsesRequest;

  if (openAiKey) {
    // OpenAI 優先
    const run = await runOpenAiExecution(preview, openAiKey, model);
    execution = run.execution;
    responseId = run.responseId;
    refusal = run.refusal;
    openAiResponsesRequest = run.requestPayload;
    mode = 'openai';
    if (refusal) {
      warnings.push(`OpenAI refusal: ${refusal}`);
    }
  } else if (geminiKey) {
    // Gemini フォールバック
    try {
      const run = await runGeminiExecution(preview, geminiKey, geminiModel);
      execution = run.execution;
      responseId = run.responseId;
      refusal = run.refusal;
      mode = 'openai'; // フロントエンド互換のため 'openai' を維持
      warnings.push(`Gemini API (${geminiModel}) で見積ロジックを実行しました。`);
    } catch (err) {
      warnings.push(`Gemini API エラー: ${err instanceof Error ? err.message : String(err)} — フォールバックを使用します。`);
    }
  } else {
    warnings.push('OPENAI_API_KEY / GEMINI_API_KEY が未設定のため、deterministic fallback を返しています。');
  }

  const response: EstimationLogicRunResponse = {
    ...preview,
    execution,
    openAiResponsesRequest,
    audit: {
      ...buildAuditBase(workspaceId, body),
      mode,
      model: (openAiKey || geminiKey) ? (openAiKey ? model : geminiModel) : null,
      responseId,
      refusal,
      warnings,
    },
  };

  await writeEstimationLogicAuditLog(workspaceId, response);
  return response;
}

async function handleEstimationLogicApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const pathname = getPathname(req);
  const method = req.method || 'GET';

  if (pathname === '/api/ai/estimation-logic/blueprint' && method === 'GET') {
    sendJson(res, 200, { success: true, data: ESTIMATION_LOGIC_BLUEPRINT });
    return true;
  }

  if (pathname === '/api/ai/estimation-logic/preview-request' && method === 'POST') {
    const body = await readJsonBody<PreviewRequestBody>(req);
    const preview = await buildPreviewResponse(body);
    sendJson(res, 200, { success: true, data: preview });
    return true;
  }

  if (pathname === '/api/ai/estimation-logic/audit-logs' && method === 'GET') {
    const params = getSearchParams(req);
    const requestedLimit = Number(params.get('limit') || '20');
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : 20;
    const logs = await listEstimationLogicAuditLogs(getWorkspaceId(req), limit);
    sendJson(res, 200, { success: true, data: logs });
    return true;
  }

  if (pathname === '/api/ai/estimation-logic/run' && method === 'POST') {
    const body = await readJsonBody<PreviewRequestBody>(req);
    const run = await buildRunResponse(getWorkspaceId(req), body);
    sendJson(res, 200, { success: true, data: run });
    return true;
  }

  return false;
}

export function createEstimationLogicApiMiddleware() {
  return (req: IncomingMessage, res: ServerResponse, next: Next) => {
    handleEstimationLogicApi(req, res)
      .then((handled) => {
        if (!handled) {
          next();
        }
      })
      .catch((error) => {
        sendJson(res, 500, {
          success: false,
          error: {
            message: error instanceof Error ? error.message : '見積ロジック API の生成に失敗しました。',
          },
        });
      });
  };
}
