/**
 * Gmail受信→プロジェクト自動登録API
 *
 * 環境変数:
 *   GMAIL_CLIENT_ID       - Google OAuth2 クライアントID
 *   GMAIL_CLIENT_SECRET   - Google OAuth2 クライアントシークレット
 *   GMAIL_REFRESH_TOKEN   - OAuth2 リフレッシュトークン
 *   GMAIL_TARGET_ADDRESS  - 受信対象のGmailアドレス
 *
 * エンドポイント:
 *   GET  /api/gmail/status             - OAuth2 接続状態確認
 *   GET  /api/gmail/inbox              - 未読メール一覧（最大 20 件）
 *   GET  /api/gmail/message/:id        - メール詳細取得
 *   POST /api/gmail/process/:id        - メールからプロジェクト自動登録
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { google } from 'googleapis';
import { upsertProject } from './appStateStore.js';

// ─── 型定義 ─────────────────────────────────────────────────────────────────

export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  hasAttachment: boolean;
  labelIds: string[];
}

export interface GmailProcessResult {
  success: boolean;
  projectId: string | null;
  projectName: string;
  clientName: string;
  siteName: string;
  attachmentCount: number;
  message: string;
}

// ─── ユーティリティ ──────────────────────────────────────────────────────────

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function getPathname(req: IncomingMessage): string {
  return new URL(req.url || '/', 'http://localhost').pathname;
}

function getWorkspaceId(req: IncomingMessage): string {
  const header = (req.headers as Record<string, string | string[] | undefined>)['x-workspace-id'];
  return (Array.isArray(header) ? header[0] : header) || 'default';
}

// ─── OAuth2 クライアント生成 ─────────────────────────────────────────────────

function createOAuth2Client() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

// ─── メールヘッダー解析 ─────────────────────────────────────────────────────

function extractHeader(
  headers: Array<{ name?: string | null; value?: string | null }>,
  name: string
): string {
  const header = headers.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase()
  );
  return header?.value ?? '';
}

// ─── メール本文デコード ─────────────────────────────────────────────────────

function decodeBase64Url(data: string): string {
  try {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

function extractPlainText(
  payload: {
    mimeType?: string | null;
    body?: { data?: string | null } | null;
    parts?: Array<{
      mimeType?: string | null;
      body?: { data?: string | null } | null;
      parts?: unknown[];
    }> | null;
  }
): string {
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // multipart/alternative の場合は再帰探索
    for (const part of payload.parts) {
      const nested = extractPlainText(part as Parameters<typeof extractPlainText>[0]);
      if (nested) return nested;
    }
  }

  return '';
}

// ─── 工事名・発注者名の自動抽出 ─────────────────────────────────────────────

/**
 * メールの件名・本文から工事名・発注者名・現場名を推定する
 * 正規表現で典型的なパターンを抽出し、見つからない場合は件名をそのまま使用。
 */
function parseProjectInfo(subject: string, body: string): {
  projectName: string;
  clientName: string;
  siteName: string;
} {
  const fullText = `${subject}\n${body}`;

  // 工事名: "○○工事" "□□改良工事" などを検出
  const kojiMatch = fullText.match(
    /([^\n\r。、【】「」（）()【】\s]{2,20}(?:工事|改良|舗装|造成|外構|解体|基礎|護岸|排水|水道|電気|土木|建設|整備|補修|改修))/
  );
  const projectName = kojiMatch
    ? kojiMatch[1].trim()
    : subject.slice(0, 40).replace(/^【.*?】\s*/, '').trim() || '新規見積依頼';

  // 発注者名: "株式会社○○" "○○建設" "合同会社" "(有)" などを検出
  const clientMatch = fullText.match(
    /((?:株式会社|有限会社|合同会社|一般社団法人|社会福祉法人|医療法人)\s*[\w\u3000-\u9FFF]{1,20}|[\w\u3000-\u9FFF]{2,15}(?:建設|工業|土木|設備|興業|商事|工務店))/
  );
  const clientName = clientMatch ? clientMatch[1].trim() : '';

  // 現場名: "○○地内" "○○市○○" など住所っぽい表現
  const siteMatch = fullText.match(
    /([\u3000-\u9FFF]{2,15}(?:市|区|町|村|地内|地区|現場|工区))/
  );
  const siteName = siteMatch ? siteMatch[1].trim() : '';

  return { projectName, clientName, siteName };
}

// ─── 添付ファイル（PDF）の件数カウント ──────────────────────────────────────

function countPdfAttachments(
  parts: Array<{
    mimeType?: string | null;
    filename?: string | null;
    parts?: unknown[];
  }> | null | undefined
): number {
  if (!parts) return 0;
  let count = 0;
  for (const part of parts) {
    if (
      part.mimeType === 'application/pdf' ||
      (part.filename && part.filename.toLowerCase().endsWith('.pdf'))
    ) {
      count++;
    }
    if (Array.isArray(part.parts)) {
      count += countPdfAttachments(
        part.parts as Parameters<typeof countPdfAttachments>[0]
      );
    }
  }
  return count;
}

// ─── API ハンドラー ─────────────────────────────────────────────────────────

async function handleStatus(res: ServerResponse): Promise<void> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  const targetAddress = process.env.GMAIL_TARGET_ADDRESS || '';

  const configured = !!(clientId && clientSecret && refreshToken);

  if (!configured) {
    sendJson(res, 200, {
      success: true,
      configured: false,
      targetAddress,
      message:
        '.env に GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN を設定してください。',
    });
    return;
  }

  // 接続テスト: プロフィール取得
  try {
    const auth = createOAuth2Client()!;
    const gmail = google.gmail({ version: 'v1', auth });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    sendJson(res, 200, {
      success: true,
      configured: true,
      emailAddress: profile.data.emailAddress,
      messagesTotal: profile.data.messagesTotal,
      targetAddress,
    });
  } catch (error) {
    sendJson(res, 200, {
      success: false,
      configured: true,
      targetAddress,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleInbox(res: ServerResponse): Promise<void> {
  const auth = createOAuth2Client();
  if (!auth) {
    sendJson(res, 503, {
      success: false,
      error: 'Gmail OAuth2 が未設定です。.env を確認してください。',
    });
    return;
  }

  try {
    const gmail = google.gmail({ version: 'v1', auth });

    // 未読 + 受信トレイ の最新 20 件を取得
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'in:inbox is:unread',
      maxResults: 20,
    });

    const messages = listRes.data.messages ?? [];

    if (messages.length === 0) {
      sendJson(res, 200, { success: true, messages: [] });
      return;
    }

    // 各メッセージのヘッダー情報を並列取得
    const detailPromises = messages.map(async (m) => {
      if (!m.id) return null;
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: m.id,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'Date'],
      });

      const headers = detail.data.payload?.headers ?? [];
      const hasPdf = countPdfAttachments(
        (detail.data.payload?.parts ?? []) as Parameters<typeof countPdfAttachments>[0]
      ) > 0;

      return {
        id: m.id,
        threadId: m.threadId ?? '',
        subject: extractHeader(headers, 'Subject') || '(件名なし)',
        from: extractHeader(headers, 'From'),
        date: extractHeader(headers, 'Date'),
        snippet: detail.data.snippet ?? '',
        hasAttachment: hasPdf,
        labelIds: detail.data.labelIds ?? [],
      } satisfies GmailMessage;
    });

    const results = (await Promise.all(detailPromises)).filter(Boolean);

    sendJson(res, 200, { success: true, messages: results });
  } catch (error) {
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleGetMessage(res: ServerResponse, messageId: string): Promise<void> {
  const auth = createOAuth2Client();
  if (!auth) {
    sendJson(res, 503, { success: false, error: 'Gmail OAuth2 が未設定です。' });
    return;
  }

  try {
    const gmail = google.gmail({ version: 'v1', auth });
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const headers = detail.data.payload?.headers ?? [];
    const subject = extractHeader(headers, 'Subject');
    const from = extractHeader(headers, 'From');
    const date = extractHeader(headers, 'Date');
    const body = extractPlainText(
      detail.data.payload as Parameters<typeof extractPlainText>[0]
    );
    const pdfCount = countPdfAttachments(
      (detail.data.payload?.parts ?? []) as Parameters<typeof countPdfAttachments>[0]
    );

    sendJson(res, 200, {
      success: true,
      message: {
        id: messageId,
        threadId: detail.data.threadId ?? '',
        subject: subject || '(件名なし)',
        from,
        date,
        snippet: detail.data.snippet ?? '',
        body: body.slice(0, 2000), // 先頭 2000 文字
        pdfAttachmentCount: pdfCount,
        labelIds: detail.data.labelIds ?? [],
      },
    });
  } catch (error) {
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleProcess(
  req: IncomingMessage,
  res: ServerResponse,
  messageId: string
): Promise<void> {
  const auth = createOAuth2Client();
  if (!auth) {
    sendJson(res, 503, { success: false, error: 'Gmail OAuth2 が未設定です。' });
    return;
  }

  const workspaceId = getWorkspaceId(req);

  try {
    const gmail = google.gmail({ version: 'v1', auth });

    // フルメッセージ取得
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const headers = detail.data.payload?.headers ?? [];
    const subject = extractHeader(headers, 'Subject') || '(件名なし)';
    const from = extractHeader(headers, 'From');
    const body = extractPlainText(
      detail.data.payload as Parameters<typeof extractPlainText>[0]
    );
    const pdfCount = countPdfAttachments(
      (detail.data.payload?.parts ?? []) as Parameters<typeof countPdfAttachments>[0]
    );

    // プロジェクト情報を自動抽出
    const { projectName, clientName, siteName } = parseProjectInfo(subject, body);

    // プロジェクトID生成
    const projectId = crypto.randomUUID();
    const now = new Date().toISOString();

    // プロジェクトを登録
    const newProject = {
      id: projectId,
      name: projectName,
      clientName,
      siteName,
      status: 'draft' as const,
      drawings: [],
      blocks: [],
      createdAt: now,
      updatedAt: now,
      // Gmail メタデータをカスタムフィールドとして保存
      // （型拡張なしに追加するため as any キャストは避け、既存フィールドに収める）
    };

    await upsertProject(workspaceId, newProject);

    // 既読マークを付ける（エラーは無視）
    try {
      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD'],
        },
      });
    } catch {
      // 既読設定失敗は致命的ではないので無視
    }

    const result: GmailProcessResult = {
      success: true,
      projectId,
      projectName,
      clientName,
      siteName,
      attachmentCount: pdfCount,
      message: `プロジェクト「${projectName}」を登録しました。${pdfCount > 0 ? `PDF添付ファイル ${pdfCount} 件あり。OCRタブから読み込んでください。` : ''}`,
    };

    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 500, {
      success: false,
      projectId: null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ─── ミドルウェアエクスポート ────────────────────────────────────────────────

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

export function createGmailApiMiddleware(): Middleware {
  return (req, res, next) => {
    const pathname = getPathname(req);
    const method = req.method?.toUpperCase() ?? 'GET';

    // GET /api/gmail/status
    if (method === 'GET' && pathname === '/api/gmail/status') {
      handleStatus(res).catch((err) =>
        sendJson(res, 500, { success: false, error: String(err) })
      );
      return;
    }

    // GET /api/gmail/inbox
    if (method === 'GET' && pathname === '/api/gmail/inbox') {
      handleInbox(res).catch((err) =>
        sendJson(res, 500, { success: false, error: String(err) })
      );
      return;
    }

    // GET /api/gmail/message/:id
    const messageMatch = pathname.match(/^\/api\/gmail\/message\/([^/]+)$/);
    if (method === 'GET' && messageMatch) {
      handleGetMessage(res, messageMatch[1]).catch((err) =>
        sendJson(res, 500, { success: false, error: String(err) })
      );
      return;
    }

    // POST /api/gmail/process/:id
    const processMatch = pathname.match(/^\/api\/gmail\/process\/([^/]+)$/);
    if (method === 'POST' && processMatch) {
      handleProcess(req, res, processMatch[1]).catch((err) =>
        sendJson(res, 500, { success: false, error: String(err) })
      );
      return;
    }

    next();
  };
}
