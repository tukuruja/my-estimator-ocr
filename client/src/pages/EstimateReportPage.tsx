import { useEffect, useMemo, useState } from 'react';

import Header from '@/components/Header';
import DocumentPanel from '@/components/DocumentPanel';
import { generateReport } from '@/lib/api';
import { loadData } from '@/lib/storage';
import { getWorkTypeLabel } from '@/lib/workTypes';
import type { AppState, BlockType, GeneratedReportBundle } from '@/lib/types';

const EMPTY_REPORT_BUNDLE: GeneratedReportBundle = {
  estimateRows: [],
  changeEstimateRows: [],
  unitPriceEvidenceRows: [],
  reviewIssues: [],
  summary: {
    totalAmount: 0,
    totalRows: 0,
    changeEstimateRowCount: 0,
    changeEstimateTotalAmount: 0,
    requiresReviewCount: 0,
  },
};

interface EstimateReportPageProps {
  preferredBlockType?: BlockType;
}

export default function EstimateReportPage({ preferredBlockType }: EstimateReportPageProps) {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [bundle, setBundle] = useState<GeneratedReportBundle>(EMPTY_REPORT_BUNDLE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const data = await loadData();
        if (cancelled) return;
        setAppState(data);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : '帳票データの読み込みに失敗しました。');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeProject = useMemo(() => {
    if (!appState) return null;
    return appState.projects.find((project) => project.id === appState.activeProjectId) ?? appState.projects[0] ?? null;
  }, [appState]);

  const activeBlock = useMemo(() => {
    if (!activeProject || !appState) return null;
    if (preferredBlockType) {
      return activeProject.blocks.find((block) => block.blockType === preferredBlockType) ?? null;
    }
    return activeProject.blocks.find((block) => block.id === appState.activeBlockId) ?? activeProject.blocks[0] ?? null;
  }, [activeProject, appState, preferredBlockType]);

  const activeDrawing = useMemo(() => {
    if (!activeProject || !activeBlock || !appState) return null;
    return activeProject.drawings.find((drawing) => drawing.id === (activeBlock.drawingId ?? appState.activeDrawingId)) ?? activeProject.drawings[0] ?? null;
  }, [activeBlock, activeProject, appState]);

  useEffect(() => {
    if (!activeProject || !activeBlock) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void generateReport({
      project: activeProject,
      block: activeBlock,
      drawing: activeDrawing,
      effectiveDate: new Date().toISOString().slice(0, 10),
    })
      .then((nextBundle) => {
        if (cancelled) return;
        setBundle(nextBundle);
        setLoading(false);
      })
      .catch((reportError) => {
        if (cancelled) return;
        setError(reportError instanceof Error ? reportError.message : '帳票生成に失敗しました。');
        setBundle(EMPTY_REPORT_BUNDLE);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeBlock, activeDrawing, activeProject]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-gray-50">
        <Header />
        <main className="flex flex-1 items-center justify-center text-gray-500">帳票データを読み込んでいます...</main>
      </div>
    );
  }

  if (!activeProject || !activeBlock) {
    return (
      <div className="flex min-h-screen flex-col bg-gray-50">
        <Header />
        <main className="flex flex-1 items-center justify-center text-gray-500">表示できる見積がありません。</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 p-4">
        <div className="mb-4 rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-lg font-semibold text-slate-900">見積書・単価根拠表</div>
          <div className="mt-1 text-sm text-slate-600">
            案件: {activeProject.name} / 見積: {activeBlock.name} / 工種: {getWorkTypeLabel(activeBlock.blockType)}
          </div>
          {error && <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        </div>
        <DocumentPanel bundle={bundle} drawing={activeDrawing} projectName={activeProject.name} estimateName={activeBlock.name} />
      </main>
    </div>
  );
}
