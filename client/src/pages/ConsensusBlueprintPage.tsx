import { useEffect, useMemo, useState } from 'react';
import { Bot, Database, FileSearch, HardHat, ShieldCheck } from 'lucide-react';

import Header from '@/components/Header';
import { fetchConsensusBlueprint, previewConsensusRequest } from '@/lib/api';
import { loadData } from '@/lib/storage';
import { getWorkTypeLabel } from '@/lib/workTypes';
import type { AppState, EstimateBlock, Project } from '@/lib/types';
import type {
  ConstructionConsensusBlueprint,
  ConstructionConsensusPreviewResponse,
} from '@shared/constructionConsensus';

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

export default function ConsensusBlueprintPage() {
  const [blueprint, setBlueprint] = useState<ConstructionConsensusBlueprint | null>(null);
  const [preview, setPreview] = useState<ConstructionConsensusPreviewResponse | null>(null);
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
          fetchConsensusBlueprint(),
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
          const previewResponse = await previewConsensusRequest({
            project,
            block,
            drawing,
            effectiveDate: new Date().toISOString().slice(0, 10),
          });
          if (cancelled) return;
          setPreview(previewResponse);
        }
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : 'AI設計ページの読み込みに失敗しました。');
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
              <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                <HardHat className="h-4 w-4" />
                建設現場合意エンジン
              </div>
              <h1 className="mt-3 text-2xl font-bold text-slate-900">見積強化の研究結果とサイト統合検証</h1>
              <p className="mt-2 max-w-4xl text-sm leading-7 text-slate-600">
                これは「1億人の専門家を実際に集める」のではなく、積算・施工・地質・仮設・監査・AI運用の観点を synthetic consensus として固定化した設計です。
                未確認は停止し、図面根拠・単価根拠・現場条件が揃った部分だけを構造化出力します。
              </p>
            </div>
            <div className="grid min-w-[280px] grid-cols-2 gap-3">
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
          {error && (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}
        </section>

        {loading && (
          <section className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-sm text-slate-500 shadow-sm">
            AI設計情報を読み込んでいます...
          </section>
        )}

        {blueprint && (
          <>
            <section className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Bot className="h-4 w-4 text-indigo-600" />
                  expert panel
                </div>
                <div className="mt-3 text-3xl font-bold text-slate-900">{blueprint.expertPanel.length}</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">積算、施工、地質、仮設、図面、原価、監査、AI安全を分離して反証します。</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  非交渉ルール
                </div>
                <div className="mt-3 text-3xl font-bold text-slate-900">{blueprint.nonNegotiables.length}</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">推測禁止、単価有効日必須、未知条件は停止、という実務上の安全柵です。</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Database className="h-4 w-4 text-amber-600" />
                  知識パック
                </div>
                <div className="mt-3 text-3xl font-bold text-slate-900">{blueprint.knowledgePacks.length}</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">数量拾いに direct / guardrail / future scope のどれで効くかを固定しています。</p>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <HardHat className="h-4 w-4 text-indigo-600" />
                synthetic consensus panel
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {blueprint.expertPanel.map((role) => (
                  <div key={role.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-semibold text-slate-900">{role.title}</div>
                    <div className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{role.discipline}</div>
                    <p className="mt-3 text-sm leading-6 text-slate-700">{role.focus}</p>
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                      拒否条件: {role.vetoCondition}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Database className="h-4 w-4 text-amber-600" />
                quantity knowledge packs
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {blueprint.knowledgePacks.map((pack) => (
                  <div key={pack.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-900">{pack.name}</div>
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                        {pack.outputMode}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-700">{pack.purpose}</p>
                    <div className="mt-3 text-xs leading-5 text-slate-600">発火条件: {pack.activationRule}</div>
                    <div className="mt-2 text-xs leading-5 text-slate-600">数量影響: {pack.quantityImpact}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {pack.quantityTargets.map((target) => (
                        <span key={target} className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700">
                          {target}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">最終合意</div>
                <div className="mt-3 space-y-3">
                  {blueprint.finalPosition.map((item, index) => (
                    <div key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                      <span className="mr-2 font-semibold text-slate-900">{index + 1}.</span>
                      {item}
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">数量拾いプロトコル</div>
                <div className="mt-3 space-y-3">
                  {blueprint.quantityExtractionProtocol.map((item, index) => (
                    <div key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                      <span className="mr-2 font-semibold text-slate-900">{index + 1}.</span>
                      {item}
                    </div>
                  ))}
                </div>
              </section>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">サイト統合ポイント</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {blueprint.integrationPoints.map((point) => (
                  <div key={`${point.phase}-${point.target}`} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{point.phase}</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{point.target}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{point.purpose}</p>
                    <div className="mt-2 text-xs leading-5 text-slate-600">実装: {point.implementation}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <JsonPanel title="AI prompt" value={blueprint.systemPrompt} />
              <JsonPanel title="JSON schema" value={blueprint.outputSchema} />
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <JsonPanel title="default site conditions" value={blueprint.defaultSiteConditions} />
              <JsonPanel
                title="現在の案件から生成した preview request"
                value={preview ?? { message: 'active project / block が無いため preview request は未生成です。' }}
              />
            </section>

            {preview?.context?.selectedKnowledgePacks && (
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">現在案件での知識パック適用結果</div>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {preview.context.selectedKnowledgePacks.map((pack) => (
                    <div key={pack.knowledgePackId} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-900">{pack.name}</div>
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-700">
                          {pack.status}
                        </span>
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-700">{pack.reason}</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {pack.quantityTargets.map((target) => (
                          <span key={target} className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-700">
                            {target}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <FileSearch className="h-4 w-4 text-indigo-600" />
                統合検証結果
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                  1. app-api は <code>/api/ai/consensus/blueprint</code> と <code>/api/ai/consensus/preview-request</code> を公開済みです。
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                  2. このページ自体が current project / block を読み、preview request を生成しているため、統合経路はコードとして検証済みです。
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                  3. 次段では <code>preview-request</code> を実際の OpenAI Responses API 呼び出しに置き換えれば、見積補強を本番化できます。
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                  4. ただし unknown な現場条件は今も未入力なので、合意エンジンの出力は停止条件と要確認を残す設計です。
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                  5. 今回は knowledge pack selection と quantityReviewMatrix を schema に追加したので、数量ごとにどの知識が効いたかを trace できます。
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
