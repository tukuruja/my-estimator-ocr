import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { FolderKanban, Plus, Workflow } from 'lucide-react';
import Header from '@/components/Header';
import EstimateList from '@/components/EstimateList';
import InputForm from '@/components/InputForm';
import CalculationResults from '@/components/CalculationResults';
import SaveBar from '@/components/SaveBar';
import OcrReviewPanel from '@/components/OcrReviewPanel';
import { calculate } from '@/lib/calculations';
import { parseDrawing } from '@/lib/api';
import {
  createDefaultBlock,
  createDefaultProject,
  createInitialAppState,
  type AICandidate,
  type AppState,
  type Drawing,
  type EstimateBlock,
  type ParseDrawingResponse,
  type Project,
} from '@/lib/types';
import { loadData, saveData } from '@/lib/storage';
import { toast } from 'sonner';

const CANDIDATE_LABELS: Record<string, string> = {
  secondaryProduct: '製品名',
  distance: '施工延長',
  currentHeight: '現況高',
  plannedHeight: '計画高',
  stages: '据付段数',
  productWidth: '製品幅',
  productHeight: '製品高さ',
  productLength: '製品長さ',
  crushedStoneThickness: '砕石厚',
  baseThickness: 'ベース厚',
};

function GuideStep({ step, title, description }: { step: string; title: string; description: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{step}</div>
      <div className="mt-1 text-sm font-semibold text-slate-800">{title}</div>
      <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
    </div>
  );
}

function ProjectCard({
  project,
  isActive,
  onSelect,
}: {
  project: Project;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
        isActive
          ? 'border-indigo-300 bg-indigo-50 text-indigo-900'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      <div className="text-sm font-semibold">{project.name}</div>
      <div className="mt-1 text-[11px] text-slate-500">
        図面 {project.drawings.length} 件 / 見積 {project.blocks.length} 件
      </div>
    </button>
  );
}

function updateProjectCollection(projects: Project[], projectId: string, updater: (project: Project) => Project): Project[] {
  return projects.map((project) => (project.id === projectId ? updater(project) : project));
}

function buildDrawingFromParseResponse(projectId: string, file: File, payload: ParseDrawingResponse): Drawing {
  const previews = payload.pagePreviews && payload.pagePreviews.length > 0
    ? payload.pagePreviews
    : [payload.pagePreview];

  const aiCandidates: AICandidate[] = Object.entries(payload.aiCandidates || {}).map(([fieldName, candidate]) => {
    const valueType = candidate.valueType
      ?? (typeof candidate.valueNumber === 'number' || typeof candidate.value === 'number' ? 'number' : 'string');

    return {
      id: crypto.randomUUID(),
      fieldName,
      label: candidate.label || CANDIDATE_LABELS[fieldName] || fieldName,
      valueType,
      valueText: candidate.valueText ?? (typeof candidate.value === 'string' ? candidate.value : undefined),
      valueNumber: candidate.valueNumber ?? (typeof candidate.value === 'number' ? candidate.value : undefined),
      confidence: candidate.confidence,
      sourceText: candidate.sourceText,
      sourcePage: candidate.sourcePage,
      sourceBox: candidate.sourceBox,
      reason: candidate.reason,
      requiresReview: candidate.requiresReview,
    };
  });

  return {
    id: crypto.randomUUID(),
    projectId,
    name: file.name,
    drawingNo: '',
    drawingTitle: file.name,
    revision: 'A',
    fileName: payload.drawingSource.fileName || file.name,
    fileType: payload.drawingSource.fileType,
    status: 'ready',
    pageCount: payload.drawingSource.pageCount,
    pages: previews.map((preview) => ({
      id: crypto.randomUUID(),
      pageNo: preview.page,
      imageUrl: preview.imageUrl,
      width: preview.width,
      height: preview.height,
    })),
    ocrItems: payload.ocrItems.map((item, index) => ({
      id: crypto.randomUUID(),
      pageNo: item.page,
      text: item.text,
      score: item.score,
      box: item.box,
    })),
    aiCandidates,
    uploadedAt: new Date().toISOString(),
    lastParsedAt: new Date().toISOString(),
  };
}

function applyCandidateValue(block: EstimateBlock, candidate: AICandidate, drawingId: string | null): EstimateBlock {
  const nextBlock: EstimateBlock = {
    ...block,
    drawingId,
    appliedCandidateIds: Array.from(new Set([...block.appliedCandidateIds, candidate.id])),
    requiresReviewFields: candidate.requiresReview
      ? Array.from(new Set([...block.requiresReviewFields, candidate.fieldName]))
      : block.requiresReviewFields.filter((field) => field !== candidate.fieldName),
  };
  const mutableBlock = nextBlock as unknown as Record<string, unknown>;

  if (candidate.valueType === 'number') {
    const numericValue = candidate.valueNumber ?? Number(candidate.valueText ?? 0);
    mutableBlock[candidate.fieldName] = Number.isFinite(numericValue) ? numericValue : 0;
  } else {
    const textValue = candidate.valueText ?? String(candidate.valueNumber ?? '');
    mutableBlock[candidate.fieldName] = textValue;
    if (candidate.fieldName === 'secondaryProduct' && textValue) {
      nextBlock.name = textValue;
    }
  }

  return nextBlock;
}

export default function Home() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [hoveredCandidateId, setHoveredCandidateId] = useState<string | null>(null);
  const [activeOcrItemId, setActiveOcrItemId] = useState<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const data = await loadData();
      if (cancelled) return;
      setAppState(data);
      setInitialized(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!initialized || !appState || !appState.autoSave) return;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      void saveData(appState);
    }, 1000);
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [appState, initialized]);

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

  const activeCandidateId = hoveredCandidateId ?? selectedCandidateId;

  const replaceActiveProject = useCallback((updater: (project: Project) => Project) => {
    setAppState((prev) => {
      if (!prev) return prev;
      const activeProjectId = prev.activeProjectId;
      return {
        ...prev,
        projects: updateProjectCollection(prev.projects, activeProjectId, (project) => ({
          ...updater(project),
          updatedAt: new Date().toISOString(),
        })),
      };
    });
  }, []);

  const handleProjectMetaChange = useCallback((field: 'name' | 'clientName' | 'siteName', value: string) => {
    replaceActiveProject((project) => ({ ...project, [field]: value }));
  }, [replaceActiveProject]);

  const handleFieldChange = useCallback((field: keyof EstimateBlock, value: string | number) => {
    if (!activeProject || !activeBlock) return;
    replaceActiveProject((project) => ({
      ...project,
      blocks: project.blocks.map((block) => {
        if (block.id !== activeBlock.id) return block;
        const updatedBlock = { ...block, [field]: value } as EstimateBlock;
        if (field === 'secondaryProduct' && typeof value === 'string' && value) {
          updatedBlock.name = value;
        }
        return updatedBlock;
      }),
    }));
  }, [activeProject, activeBlock, replaceActiveProject]);

  const handleAddProject = useCallback(() => {
    const defaultName = `案件 ${appState ? appState.projects.length + 1 : 1}`;
    const name = prompt('追加する案件名を入力してください。', defaultName);
    if (!name) return;
    const project = createDefaultProject(name);
    setAppState((prev) => {
      const current = prev ?? createInitialAppState();
      return {
        ...current,
        projects: [...current.projects, project],
        activeProjectId: project.id,
        activeDrawingId: null,
        activeBlockId: project.blocks[0]?.id ?? null,
      };
    });
    setSelectedCandidateId(null);
    setHoveredCandidateId(null);
    setActiveOcrItemId(null);
  }, [appState]);

  const handleSelectProject = useCallback((projectId: string) => {
    setAppState((prev) => {
      if (!prev) return prev;
      const project = prev.projects.find((item) => item.id === projectId) ?? prev.projects[0];
      return {
        ...prev,
        activeProjectId: project.id,
        activeDrawingId: project.drawings[0]?.id ?? null,
        activeBlockId: project.blocks[0]?.id ?? null,
      };
    });
    setUploadError(null);
    setSelectedCandidateId(null);
    setHoveredCandidateId(null);
    setActiveOcrItemId(null);
  }, []);

  const handleAddBlock = useCallback(() => {
    if (!activeProject) return;
    const defaultName = `${activeProject.name} 見積 ${activeProject.blocks.length + 1}`;
    const name = prompt('追加する見積の名前を入力してください。', defaultName);
    if (name === null) return;
    const newBlock = createDefaultBlock(activeProject.id, name || defaultName, activeDrawing?.id ?? null);
    replaceActiveProject((project) => ({
      ...project,
      blocks: [...project.blocks, newBlock],
    }));
    setAppState((prev) => (prev ? { ...prev, activeBlockId: newBlock.id } : prev));
  }, [activeProject, activeDrawing, replaceActiveProject]);

  const handleDeleteBlock = useCallback(() => {
    if (!activeProject || !activeBlock || activeProject.blocks.length <= 1) return;
    if (!confirm(`「${activeBlock.name}」を削除しますか？\nこの操作は元に戻せません。`)) return;

    const remainingBlocks = activeProject.blocks.filter((block) => block.id !== activeBlock.id);
    replaceActiveProject((project) => ({
      ...project,
      blocks: remainingBlocks,
    }));
    setAppState((prev) => (prev ? { ...prev, activeBlockId: remainingBlocks[0]?.id ?? null } : prev));
  }, [activeProject, activeBlock, replaceActiveProject]);

  const handleSave = useCallback(async () => {
    if (!appState) return;
    await saveData(appState);
    toast.success('案件データを保存しました。');
  }, [appState]);

  const handleSaveAs = useCallback(() => {
    if (!activeProject || !activeBlock) return;
    const suggestedName = `${activeBlock.name} のコピー`;
    const name = prompt('複製して保存する見積名を入力してください。', suggestedName);
    if (!name) return;
    const nextBlock = { ...activeBlock, id: crypto.randomUUID(), name };
    replaceActiveProject((project) => ({
      ...project,
      blocks: [...project.blocks, nextBlock],
    }));
    setAppState((prev) => (prev ? { ...prev, activeBlockId: nextBlock.id } : prev));
    toast.success(`「${name}」として複製保存しました。`);
  }, [activeProject, activeBlock, replaceActiveProject]);

  const handleToggleAutoSave = useCallback(() => {
    setAppState((prev) => (prev ? { ...prev, autoSave: !prev.autoSave } : prev));
  }, []);

  const handleSelectDrawing = useCallback((drawingId: string) => {
    setAppState((prev) => (prev ? { ...prev, activeDrawingId: drawingId } : prev));
    setUploadError(null);
    setSelectedCandidateId(null);
    setHoveredCandidateId(null);
    setActiveOcrItemId(null);
  }, []);

  const handleUploadFile = useCallback(async (file: File) => {
    if (!activeProject) return;
    setUploadError(null);
    setIsUploading(true);

    try {
      const payload = await parseDrawing(file, 'secondary_product');
      const nextDrawing = buildDrawingFromParseResponse(activeProject.id, file, payload);

      replaceActiveProject((project) => ({
        ...project,
        drawings: [...project.drawings, nextDrawing],
        blocks: project.blocks.map((block, index) => (
          index === 0 && !block.drawingId ? { ...block, drawingId: nextDrawing.id } : block
        )),
      }));

      setAppState((prev) => (prev ? {
        ...prev,
        activeDrawingId: nextDrawing.id,
        activeBlockId: prev.activeBlockId ?? activeProject.blocks[0]?.id ?? null,
      } : prev));
      setSelectedCandidateId(nextDrawing.aiCandidates[0]?.id ?? null);
      setHoveredCandidateId(null);
      setActiveOcrItemId(nextDrawing.ocrItems[0]?.id ?? null);
      toast.success(`図面を解析しました。OCR ${nextDrawing.ocrItems.length} 行、候補 ${nextDrawing.aiCandidates.length} 件です。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '図面解析に失敗しました。';
      setUploadError(message);
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  }, [activeProject, replaceActiveProject]);

  const handleApplyCandidate = useCallback((candidateId: string) => {
    if (!activeProject || !activeBlock || !activeDrawing) return;
    const candidate = activeDrawing.aiCandidates.find((item) => item.id === candidateId);
    if (!candidate) return;

    replaceActiveProject((project) => ({
      ...project,
      blocks: project.blocks.map((block) => (
        block.id === activeBlock.id ? applyCandidateValue(block, candidate, activeDrawing.id) : block
      )),
    }));

    setSelectedCandidateId(candidate.id);
    setActiveOcrItemId(null);
    toast.success(`「${candidate.label}」へ候補を反映しました。`);
  }, [activeProject, activeBlock, activeDrawing, replaceActiveProject]);

  const handleApplyAllCandidates = useCallback(() => {
    if (!activeProject || !activeBlock || !activeDrawing) return;
    const safeCandidates = activeDrawing.aiCandidates.filter((candidate) => !candidate.requiresReview);
    if (safeCandidates.length === 0) {
      toast.message('一括反映できる候補はありません。');
      return;
    }

    replaceActiveProject((project) => ({
      ...project,
      blocks: project.blocks.map((block) => {
        if (block.id !== activeBlock.id) return block;
        return safeCandidates.reduce((currentBlock, candidate) => applyCandidateValue(currentBlock, candidate, activeDrawing.id), block);
      }),
    }));

    toast.success(`${safeCandidates.length} 件の候補を一括反映しました。`);
  }, [activeProject, activeBlock, activeDrawing, replaceActiveProject]);

  const handleSelectCandidate = useCallback((candidateId: string | null) => {
    setSelectedCandidateId(candidateId);
    setActiveOcrItemId(null);
  }, []);

  const handleHoverCandidate = useCallback((candidateId: string | null) => {
    setHoveredCandidateId(candidateId);
  }, []);

  const handleSelectOcrItem = useCallback((itemId: string | null) => {
    setActiveOcrItemId(itemId);
    if (itemId) {
      setSelectedCandidateId(null);
    }
  }, []);

  if (!initialized || !appState || !activeProject || !activeBlock) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">案件データを読み込んでいます...</div>
      </div>
    );
  }

  const activeIndex = Math.max(0, activeProject.blocks.findIndex((block) => block.id === activeBlock.id));
  const result = calculate(activeBlock);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col overflow-hidden">
      <Header />

      <div className="flex items-center justify-end gap-3 bg-white border-b border-gray-200 px-4 py-1">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span>自動保存</span>
          <button
            onClick={handleToggleAutoSave}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              appState.autoSave ? 'bg-green-500' : 'bg-gray-300'
            }`}
            title="自動保存のオン・オフを切り替えます"
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                appState.autoSave ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
          <span className="hidden sm:inline">{appState.autoSave ? '入力後に自動で保存します' : '手動保存のみです'}</span>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
        >
          💾 案件データを保存
        </button>
        <button
          onClick={handleSaveAs}
          className="flex items-center gap-1 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
        >
          💾 見積を複製保存
        </button>
      </div>

      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <FolderKanban className="h-4 w-4 text-indigo-600" />
              案件ワークスペース
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              案件ごとに図面と見積をまとめて管理します。図面 OCR の根拠と試算結果を同じ画面で確認できます。
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddProject}
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            案件を追加
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {appState.projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              isActive={project.id === activeProject.id}
              onSelect={() => handleSelectProject(project.id)}
            />
          ))}
        </div>
      </div>

      <div className="px-2 pt-2">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <div className="text-sm font-semibold text-slate-800">案件情報</div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="space-y-1 text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">案件名</span>
                  <input
                    type="text"
                    value={activeProject.name}
                    onChange={(event) => handleProjectMetaChange('name', event.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
                <label className="space-y-1 text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">元請名</span>
                  <input
                    type="text"
                    value={activeProject.clientName}
                    onChange={(event) => handleProjectMetaChange('clientName', event.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    placeholder="任意入力"
                  />
                </label>
                <label className="space-y-1 text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">現場名</span>
                  <input
                    type="text"
                    value={activeProject.siteName}
                    onChange={(event) => handleProjectMetaChange('siteName', event.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    placeholder="任意入力"
                  />
                </label>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-1">
              <GuideStep
                step="STEP 1"
                title="案件を選ぶ"
                description="案件ごとに図面と見積を分けて保存します。"
              />
              <GuideStep
                step="STEP 2"
                title="図面を OCR 解析"
                description="PDF または画像をアップロードすると OCR と候補が生成されます。"
              />
              <GuideStep
                step="STEP 3"
                title="候補を確認して反映"
                description="根拠 bbox を見ながら入力フォームへ候補を反映します。"
              />
            </div>
          </div>
        </div>
      </div>

      <EstimateList
        blocks={activeProject.blocks}
        activeIndex={activeIndex}
        onSelect={(index) => setAppState((prev) => (prev ? { ...prev, activeBlockId: activeProject.blocks[index]?.id ?? null } : prev))}
        onAdd={handleAddBlock}
        onDelete={handleDeleteBlock}
      />

      <div className="flex-1 overflow-auto p-2">
        <div className="grid gap-2 2xl:grid-cols-[420px_minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="min-h-[720px] overflow-auto">
            <InputForm block={activeBlock} onChange={handleFieldChange} />
          </div>

          <OcrReviewPanel
            drawings={activeProject.drawings}
            activeDrawingId={activeDrawing?.id ?? appState.activeDrawingId}
            activeOcrItemId={activeOcrItemId}
            activeCandidateId={activeCandidateId}
            isUploading={isUploading}
            uploadError={uploadError}
            onUploadFile={handleUploadFile}
            onSelectDrawing={handleSelectDrawing}
            onSelectOcrItem={handleSelectOcrItem}
            onSelectCandidate={handleSelectCandidate}
            onHoverCandidate={handleHoverCandidate}
            onApplyCandidate={handleApplyCandidate}
            onApplyAllCandidates={handleApplyAllCandidates}
          />

          <div className="space-y-2">
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Workflow className="h-4 w-4 text-amber-600" />
                反映状況
              </div>
              <div className="mt-2 text-sm text-slate-600">
                <div>紐づく図面: <span className="font-semibold text-slate-900">{activeDrawing?.drawingTitle || '未選択'}</span></div>
                <div className="mt-1">反映済み候補: <span className="font-semibold text-slate-900">{activeBlock.appliedCandidateIds.length} 件</span></div>
              </div>
              {activeBlock.requiresReviewFields.length > 0 ? (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  要確認項目: {activeBlock.requiresReviewFields.map((field) => CANDIDATE_LABELS[field] || field).join(' / ')}
                </div>
              ) : (
                <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  現在、要確認で停止している項目はありません。
                </div>
              )}
            </div>

            <CalculationResults result={result} block={activeBlock} />
          </div>
        </div>
      </div>

      <SaveBar
        autoSave={appState.autoSave}
        onToggleAutoSave={handleToggleAutoSave}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
      />
    </div>
  );
}
