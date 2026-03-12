import { useEffect, useMemo, useState } from 'react';

import Header from '@/components/Header';
import DocumentPanel from '@/components/DocumentPanel';
import { fetchMasters } from '@/lib/api';
import { calculate } from '@/lib/calculations';
import { createSeedMasterItems } from '@/lib/masterData';
import { generateReportBundle } from '@/lib/reporting';
import { loadData } from '@/lib/storage';
import type { AppState, PriceMasterItem } from '@/lib/types';

export default function EstimateReportPage() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [masters, setMasters] = useState<PriceMasterItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [data, masterItems] = await Promise.all([
        loadData(),
        fetchMasters({ effectiveDate: new Date().toISOString().slice(0, 10) }).catch(() => createSeedMasterItems()),
      ]);
      if (cancelled) return;
      setAppState(data);
      setMasters(masterItems.length > 0 ? masterItems : createSeedMasterItems());
      setLoading(false);
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
    return activeProject.blocks.find((block) => block.id === appState.activeBlockId) ?? activeProject.blocks[0] ?? null;
  }, [activeProject, appState]);

  const activeDrawing = useMemo(() => {
    if (!activeProject || !appState) return null;
    return activeProject.drawings.find((drawing) => drawing.id === appState.activeDrawingId) ?? activeProject.drawings[0] ?? null;
  }, [activeProject, appState]);

  if (loading || !activeProject || !activeBlock) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center text-gray-500">帳票データを読み込んでいます...</main>
      </div>
    );
  }

  const bundle = generateReportBundle({
    project: activeProject,
    block: activeBlock,
    drawing: activeDrawing,
    result: calculate(activeBlock),
    masters,
  });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <main className="flex-1 p-4 max-w-7xl mx-auto w-full">
        <div className="mb-4 rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-lg font-semibold text-slate-900">見積書・単価根拠表</div>
          <div className="mt-1 text-sm text-slate-600">案件: {activeProject.name} / 見積: {activeBlock.name}</div>
        </div>
        <DocumentPanel
          bundle={bundle}
          drawing={activeDrawing}
          projectName={activeProject.name}
          estimateName={activeBlock.name}
        />
      </main>
    </div>
  );
}
