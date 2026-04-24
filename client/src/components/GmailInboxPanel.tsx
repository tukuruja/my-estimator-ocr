/**
 * GmailInboxPanel — Gmail受信トレイを表示し、メールからプロジェクトを自動登録するパネル
 */

import { useCallback, useEffect, useState } from 'react';
import { Mail, RefreshCw, AlertCircle, CheckCircle2, FileText, Loader2 } from 'lucide-react';

// ─── 型定義 ─────────────────────────────────────────────────────────────────

interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  hasAttachment: boolean;
  labelIds: string[];
}

interface GmailStatus {
  configured: boolean;
  emailAddress?: string;
  targetAddress?: string;
  message?: string;
  error?: string;
}

interface ProcessResult {
  success: boolean;
  projectId: string | null;
  projectName: string;
  clientName: string;
  attachmentCount: number;
  message: string;
  error?: string;
}

// ─── API 呼び出し ─────────────────────────────────────────────────────────────

async function fetchGmailStatus(workspaceId: string): Promise<GmailStatus> {
  const res = await fetch('/api/gmail/status', {
    headers: { 'X-Workspace-Id': workspaceId },
  });
  const data = await res.json() as { configured: boolean; emailAddress?: string; targetAddress?: string; message?: string; error?: string };
  return data;
}

async function fetchGmailInbox(workspaceId: string): Promise<GmailMessage[]> {
  const res = await fetch('/api/gmail/inbox', {
    headers: { 'X-Workspace-Id': workspaceId },
  });
  const data = await res.json() as { success: boolean; messages?: GmailMessage[] };
  return data.messages ?? [];
}

async function processGmailMessage(
  messageId: string,
  workspaceId: string
): Promise<ProcessResult> {
  const res = await fetch(`/api/gmail/process/${messageId}`, {
    method: 'POST',
    headers: { 'X-Workspace-Id': workspaceId, 'Content-Type': 'application/json' },
  });
  return res.json() as Promise<ProcessResult>;
}

// ─── ユーティリティ ──────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr.slice(0, 16);
  }
}

// ─── コンポーネント ──────────────────────────────────────────────────────────

interface GmailInboxPanelProps {
  workspaceId: string;
  onProjectCreated?: (projectId: string, projectName: string) => void;
}

export default function GmailInboxPanel({
  workspaceId,
  onProjectCreated,
}: GmailInboxPanelProps) {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processResults, setProcessResults] = useState<Map<string, ProcessResult>>(new Map());
  const [error, setError] = useState<string | null>(null);

  // Gmail 設定状態を確認
  const checkStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    setError(null);
    try {
      const s = await fetchGmailStatus(workspaceId);
      setStatus(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ステータスの取得に失敗しました。');
    } finally {
      setIsLoadingStatus(false);
    }
  }, [workspaceId]);

  // 受信トレイを取得
  const loadInbox = useCallback(async () => {
    setIsLoadingMessages(true);
    setError(null);
    try {
      const msgs = await fetchGmailInbox(workspaceId);
      setMessages(msgs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'メールの取得に失敗しました。');
    } finally {
      setIsLoadingMessages(false);
    }
  }, [workspaceId]);

  // メールからプロジェクトを登録
  const handleProcess = useCallback(
    async (messageId: string) => {
      setProcessingId(messageId);
      try {
        const result = await processGmailMessage(messageId, workspaceId);
        setProcessResults((prev) => new Map(prev).set(messageId, result));
        if (result.success && result.projectId) {
          onProjectCreated?.(result.projectId, result.projectName);
        }
      } catch (err) {
        setProcessResults((prev) =>
          new Map(prev).set(messageId, {
            success: false,
            projectId: null,
            projectName: '',
            clientName: '',
            attachmentCount: 0,
            message: '',
            error: err instanceof Error ? err.message : '登録に失敗しました。',
          })
        );
      } finally {
        setProcessingId(null);
      }
    },
    [workspaceId, onProjectCreated]
  );

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // ─── ローディング中 ────────────────────────────────────────────────────────

  if (isLoadingStatus) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Gmail接続を確認中...
      </div>
    );
  }

  // ─── 未設定の場合 ──────────────────────────────────────────────────────────

  if (status && !status.configured) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <div>
            <div className="text-sm font-semibold text-amber-800">Gmail OAuth2 が未設定です</div>
            <p className="mt-1 text-xs leading-5 text-amber-700">
              .env ファイルに以下の環境変数を設定してください。
            </p>
            <pre className="mt-2 rounded bg-amber-100 px-3 py-2 text-[11px] text-amber-800">
{`GMAIL_CLIENT_ID=your_client_id
GMAIL_CLIENT_SECRET=your_client_secret
GMAIL_REFRESH_TOKEN=your_refresh_token
GMAIL_TARGET_ADDRESS=merumaga.kensetusentai@gmail.com`}
            </pre>
            <p className="mt-2 text-xs text-amber-700">
              Google Cloud Console →「認証情報」→「OAuth 2.0 クライアント ID」から取得できます。
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── エラー表示 ────────────────────────────────────────────────────────────

  if (status?.error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-600" />
          <div>
            <div className="text-sm font-semibold text-rose-800">Gmail 接続エラー</div>
            <p className="mt-1 text-xs text-rose-700">{status.error}</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── 接続済み ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* ステータスバー */}
      <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <div>
            <span className="text-xs font-semibold text-emerald-800">Gmail接続済み</span>
            {status?.emailAddress && (
              <span className="ml-2 text-[11px] text-emerald-700">{status.emailAddress}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={loadInbox}
          disabled={isLoadingMessages}
          className="flex items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${isLoadingMessages ? 'animate-spin' : ''}`} />
          受信トレイを取得
        </button>
      </div>

      {/* エラー */}
      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* メール一覧 */}
      {messages.length === 0 && !isLoadingMessages && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 py-8 text-center text-sm text-slate-500">
          <Mail className="mx-auto mb-2 h-8 w-8 opacity-30" />
          「受信トレイを取得」をクリックして未読メールを確認します。
        </div>
      )}

      {isLoadingMessages && (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          受信トレイを取得中...
        </div>
      )}

      <div className="space-y-2">
        {messages.map((msg) => {
          const result = processResults.get(msg.id);
          const isProcessing = processingId === msg.id;
          const isDone = result?.success === true;

          return (
            <div
              key={msg.id}
              className={`rounded-lg border px-3 py-3 ${
                isDone
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {/* 件名 */}
                  <div className="flex items-center gap-1.5">
                    {msg.hasAttachment && (
                      <FileText className="h-3 w-3 flex-shrink-0 text-indigo-500" />
                    )}
                    <div className="truncate text-sm font-semibold text-slate-800">
                      {msg.subject}
                    </div>
                  </div>

                  {/* 差出人・日時 */}
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="truncate">{msg.from}</span>
                    <span className="flex-shrink-0">{formatDate(msg.date)}</span>
                  </div>

                  {/* スニペット */}
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                    {msg.snippet}
                  </p>

                  {/* 処理結果 */}
                  {result && (
                    <div
                      className={`mt-2 rounded-md px-2 py-1.5 text-xs ${
                        result.success
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {result.success ? (
                        <>
                          <span className="font-semibold">✓ 登録完了:</span>{' '}
                          {result.message}
                        </>
                      ) : (
                        <>
                          <span className="font-semibold">✗ エラー:</span>{' '}
                          {result.error}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* アクションボタン */}
                {!isDone && (
                  <button
                    type="button"
                    onClick={() => handleProcess(msg.id)}
                    disabled={isProcessing || processingId !== null}
                    className="flex-shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <span className="flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        登録中
                      </span>
                    ) : (
                      '案件登録'
                    )}
                  </button>
                )}

                {isDone && (
                  <div className="flex-shrink-0 rounded-md bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                    登録済み
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
