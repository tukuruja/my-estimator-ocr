import { useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, HardHat, ListChecks, ShieldAlert } from 'lucide-react';

import Header from '@/components/Header';
import { fetchEstimationLogicBlueprint, runEstimationLogic } from '@/lib/api';
import { loadData } from '@/lib/storage';
import { getWorkTypeLabel } from '@/lib/workTypes';
import type { AppState, EstimateBlock, Project } from '@/lib/types';
import type {
  EstimationLogicBlueprint,
  EstimationLogicRunResponse,
} from '@shared/estimationLogic';

function resolveActiveProject(state: AppState | null): Project | null {
  if (!state) return null;
  return state.projects.find((project) => project.id === state.activeProjectId) ?? state.projects[0] ?? null;
}

function resolveActiveBlock(state: AppState | null, project: Project | null): EstimateBlock | null {
  if (!state || !project) return null;
  return project.blocks.find((block) => block.id === state.activeBlockId) ?? project.blocks[0] ?? null;
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">{title}</div>
      <pre className="max-h-[520px] overflow-auto px-4 py-4 text-xs leading-6 text-slate-700">{JSON.stringify(value, null, 2)}</pre>
    </section>
  );
}

export default function EstimatorLogicPage() {
  const [blueprint, setBlueprint] = useState<EstimationLogicBlueprint | null>(null);
  const [runResult, setRunResult] = useState<EstimationLogicRunResponse | null>(null);
  const [appState, setAppState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);

      try {
        const [nextBlueprint, nextState] = await Promise.all([
          fetchEstimationLogicBlueprint(),
          loadData(),
        ]);

        if (cancelled) return;
        setBlueprint(nextBlueprint);
        setAppState(nextState);

        const project = resolveActiveProject(nextState);
        const block = resolveActiveBlock(nextState, project);
        const drawing = project && block
          ? project.drawings.find((item) => item.id === (block.drawingId ?? nextState.activeDrawingId)) ?? null
          : null;

        if (project && block) {
          const previewResponse = await runEstimationLogic({
            project,
            block,
            drawing,
            effectiveDate: new Date().toISOString().slice(0, 10),
          });
          if (cancelled) return;
          setRunResult(previewResponse);
        }
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : '見積ロジックページの読み込みに失敗しました。');
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

  const activeProject = useMemo(() => resolveActiveProject(appState), [appState]);
  const activeBlock = useMemo(() => resolveActiveBlock(appState, activeProject), [appState, activeProject]);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4">
        <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <HardHat className="h-4 w-4" />
                見積ロジック
              </div>
              <h1 className="mt-3 text-2xl font-bold text-slate-900">頼りない従業員でも崩れない見積 Logic</h1>
              <p className="mt-2 max-w-4xl text-sm leading-7 text-slate-600">
                これは「1億人の専門家を実際に集める」のではなく、日本の積算、施工管理、図面読解、品質、安全、AI監査の論点を synthetic consensus に圧縮したロジックです。
                目的は、担当者の勘ではなく、停止条件付きの手順で見積を前進させることです。
              </p>
            </div>
            <div className="grid min-w-[300px] grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs text-slate-500">現在の案件</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{activeProject?.name ?? '未選択'}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs text-slate-500">現在の工種</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{activeBlock ? getWorkTypeLabel(activeBlock.blockType) : '未選択'}</div>
              </div>
            </div>
          </div>
        </section>

        {loading && (
          <section className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600 shadow-sm">
            見積ロジックを読み込んでいます。
          </section>
        )}

        {error && (
          <section className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700 shadow-sm">
            {error}
          </section>
        )}

        {!loading && !error && blueprint && (
          <>
            <section className="grid gap-4 md:grid-cols-3">
              {blueprint.promise.map((item) => (
                <div key={item} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    保証
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{item}</p>
                </div>
              ))}
            </section>

            <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ListChecks className="h-4 w-4 text-indigo-600" />
                  実務ロジック
                </div>
                <div className="mt-4 space-y-3">
                  {blueprint.phases.map((phase, index) => (
                    <div key={phase.id} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">phase {index + 1}</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">{phase.title}</div>
                      <div className="mt-2 text-sm leading-6 text-slate-700">目的: {phase.objective}</div>
                      <div className="mt-1 text-sm leading-6 text-slate-700">担当者: {phase.operatorAction}</div>
                      <div className="mt-1 text-sm leading-6 text-slate-700">AI: {phase.aiResponsibility}</div>
                      <div className="mt-1 text-xs leading-5 text-rose-700">停止条件: {phase.stopCondition}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ShieldAlert className="h-4 w-4 text-amber-600" />
                  絶対ルール
                </div>
                <div className="mt-4 space-y-3">
                  {blueprint.nonNegotiables.map((item) => (
                    <div key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                      {item}
                    </div>
                  ))}
                </div>
              </section>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Bot className="h-4 w-4 text-fuchsia-600" />
                適用する知識パック
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {blueprint.skillPacks.map((pack) => (
                  <div key={pack.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-900">{pack.name}</div>
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                        {pack.category}
                      </span>
                    </div>
                    <div className="mt-3 text-xs leading-5 text-slate-600">発火条件: {pack.activationRule}</div>
                    <div className="mt-2 text-sm leading-6 text-slate-700">{pack.contribution}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {pack.affects.map((target) => (
                        <span key={target} className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700">
                          {target}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {runResult && (
              <>
                <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                  <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="text-sm font-semibold text-slate-900">この案件に対する実行結果</div>
                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">decision</div>
                      <div className="mt-1 text-lg font-bold text-slate-900">{runResult.execution.decision}</div>
                      <div className="mt-2 text-sm leading-6 text-slate-700">{runResult.execution.summary}</div>
                      <div className="mt-2 text-xs text-slate-500">
                        mode: <span className="font-semibold text-slate-700">{runResult.audit.mode}</span>
                        {runResult.audit.model ? <> / model: <span className="font-semibold text-slate-700">{runResult.audit.model}</span></> : null}
                      </div>
                    </div>
                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">operator message</div>
                      <div className="mt-2 text-sm leading-6 text-slate-700">{runResult.execution.operatorMessage}</div>
                    </div>
                    <div className="mt-4 space-y-3">
                      {runResult.execution.stopReasons.length > 0 && (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
                          <div className="text-sm font-semibold text-rose-900">止めている理由</div>
                          <div className="mt-2 space-y-2">
                            {runResult.execution.stopReasons.map((item) => (
                              <div key={item} className="text-sm leading-6 text-rose-700">{item}</div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                          <div className="text-sm font-semibold text-slate-900">次にやること</div>
                          <div className="mt-2 space-y-2">
                          {runResult.execution.nextActions.map((item) => (
                              <div key={item} className="text-sm leading-6 text-slate-700">{item}</div>
                            ))}
                          </div>
                        </div>
                    </div>
                  </section>

                  <section className="grid gap-4">
                    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-sm font-semibold text-slate-900">担当者チェックリスト</div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {runResult.execution.coachingChecklist.map((item) => (
                          <div key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                            {item}
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-sm font-semibold text-slate-900">数量ガードレール</div>
                      <div className="mt-3 space-y-3">
                        {runResult.execution.quantityGuardrails.map((item) => (
                          <div key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                            {item}
                          </div>
                        ))}
                      </div>
                    </section>
                  </section>
                </section>

                <section className="grid gap-4 xl:grid-cols-2">
                  <JsonPanel title="AI prompt" value={blueprint.systemPrompt} />
                  <JsonPanel title="実行結果 JSON" value={runResult.execution} />
                </section>

                <section className="grid gap-4 xl:grid-cols-2">
                  <JsonPanel title="logic context" value={runResult.context} />
                  <JsonPanel title="OpenAI Responses request" value={runResult.openAiResponsesRequest} />
                </section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
