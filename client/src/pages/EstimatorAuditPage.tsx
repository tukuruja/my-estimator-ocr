import { useEffect, useState } from 'react';
import { AlertTriangle, Clock3, FileSearch, UserRound } from 'lucide-react';

import Header from '@/components/Header';
import { fetchEstimationLogicAuditLogs } from '@/lib/api';
import type { EstimationLogicRunResponse } from '@shared/estimationLogic';

function formatTime(value: string): string {
  try {
    return new Date(value).toLocaleString('ja-JP');
  } catch {
    return value;
  }
}

function DecisionBadge({ decision }: { decision: EstimationLogicRunResponse['execution']['decision'] }) {
  const styles = decision === 'ready_for_estimate'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : decision === 'review_required'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-rose-200 bg-rose-50 text-rose-800';

  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] ${styles}`}>{decision}</span>;
}

export default function EstimatorAuditPage() {
  const [logs, setLogs] = useState<EstimationLogicRunResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const nextLogs = await fetchEstimationLogicAuditLogs(50);
        if (cancelled) return;
        setLogs(nextLogs);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : '監査ログの取得に失敗しました。');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4">
        <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
          <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
            <FileSearch className="h-4 w-4" />
            監査ログ
          </div>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">見積 Logic 実行履歴</h1>
          <p className="mt-2 max-w-4xl text-sm leading-7 text-slate-600">
            現在の設計では、誰が止まったかは認証ユーザーではなく workspace 単位で追跡しています。
            つまり「このブラウザ / この案件ワークスペース」で何が止まり、どの指示を返したかを一覧で見ます。
          </p>
        </section>

        {loading && (
          <section className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600 shadow-sm">
            監査ログを読み込んでいます。
          </section>
        )}

        {error && (
          <section className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700 shadow-sm">
            {error}
          </section>
        )}

        {!loading && !error && logs.length === 0 && (
          <section className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600 shadow-sm">
            この workspace にはまだ監査ログがありません。
          </section>
        )}

        {!loading && !error && logs.length > 0 && (
          <section className="space-y-4">
            {logs.map((log) => (
              <article key={log.audit.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <DecisionBadge decision={log.execution.decision} />
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                        {log.execution.stage}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                        {log.audit.mode}
                      </span>
                    </div>
                    <div className="mt-3 text-base font-semibold text-slate-900">{log.execution.summary}</div>
                    <div className="mt-2 text-sm leading-6 text-slate-700">{log.execution.operatorMessage}</div>
                  </div>
                  <div className="grid gap-2 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <Clock3 className="h-4 w-4 text-slate-500" />
                      {formatTime(log.audit.createdAt)}
                    </div>
                    <div className="flex items-center gap-2">
                      <UserRound className="h-4 w-4 text-slate-500" />
                      workspace: <span className="font-semibold text-slate-800">{log.audit.workspaceId}</span>
                    </div>
                    <div>project: <span className="font-semibold text-slate-800">{log.context.project.name}</span></div>
                    <div>block: <span className="font-semibold text-slate-800">{log.context.block.name}</span></div>
                    <div>audit id: <span className="font-semibold text-slate-800">{log.audit.id}</span></div>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <section className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-sm font-semibold text-slate-900">次にやること</div>
                    <div className="mt-2 space-y-2">
                      {log.execution.nextActions.map((item) => (
                        <div key={item} className="text-sm leading-6 text-slate-700">{item}</div>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      止めている理由
                    </div>
                    <div className="mt-2 space-y-2">
                      {log.execution.stopReasons.length > 0 ? log.execution.stopReasons.map((item) => (
                        <div key={item} className="text-sm leading-6 text-slate-700">{item}</div>
                      )) : (
                        <div className="text-sm leading-6 text-slate-700">停止理由はありません。</div>
                      )}
                    </div>
                  </section>
                </div>

                {log.audit.warnings.length > 0 && (
                  <section className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
                    <div className="text-sm font-semibold text-indigo-900">実行メモ</div>
                    <div className="mt-2 space-y-2">
                      {log.audit.warnings.map((item) => (
                        <div key={item} className="text-sm leading-6 text-indigo-800">{item}</div>
                      ))}
                    </div>
                  </section>
                )}
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
