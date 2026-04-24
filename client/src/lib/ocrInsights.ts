import type { BoundingBox, DrawingOcrStructured } from './types';

export const LEVEL_WATCH_TOKENS = ['GL', 'GI', 'G1', 'FH', 'EL', 'FL'] as const;

export interface LevelConflictItem {
  id: string;
  pageNo: number;
  box: BoundingBox;
  text: string;
  value: string | null;
  confidence: number;
}

export interface LevelConflictGroup {
  id: string;
  label: string;
  items: LevelConflictItem[];
}

export function isLevelWatchGroup(tokens: string[]): boolean {
  return tokens.some((token) => LEVEL_WATCH_TOKENS.includes(token as (typeof LEVEL_WATCH_TOKENS)[number]));
}

export function buildLevelConflictGroups(ocrStructured: DrawingOcrStructured | undefined): LevelConflictGroup[] {
  if (!ocrStructured) return [];
  const candidateMap = new Map<string, LevelConflictGroup>();

  for (const candidate of ocrStructured.levelCandidates) {
    const key = candidate.token;
    if (!candidateMap.has(key)) {
      candidateMap.set(key, { id: key, label: key, items: [] });
    }
    candidateMap.get(key)?.items.push({
      id: `${key}-${candidate.pageNo}-${candidate.text}`,
      pageNo: candidate.pageNo,
      box: candidate.bbox,
      text: candidate.text,
      value: candidate.value,
      confidence: candidate.confidence,
    });
  }

  for (const candidate of ocrStructured.ambiguousCandidates) {
    if (!isLevelWatchGroup(candidate.watchGroup)) continue;
    const key = candidate.watchGroup.join(' / ');
    if (!candidateMap.has(key)) {
      candidateMap.set(key, { id: key, label: key, items: [] });
    }
    candidateMap.get(key)?.items.push({
      id: `${key}-${candidate.pageNo}-${candidate.text}`,
      pageNo: candidate.pageNo,
      box: candidate.bbox,
      text: candidate.text,
      value: null,
      confidence: candidate.confidence,
    });
  }

  return Array.from(candidateMap.values())
    .map((group) => ({
      ...group,
      items: group.items.sort((a, b) => b.confidence - a.confidence),
    }))
    .filter((group) => group.items.length > 0)
    .sort((a, b) => b.items.length - a.items.length);
}

export function groupPlanSectionLinksByCallout(ocrStructured: DrawingOcrStructured | undefined) {
  const grouped = new Map<string, DrawingOcrStructured['planSectionLinks']>();
  for (const link of ocrStructured?.planSectionLinks ?? []) {
    const current = grouped.get(link.callout) ?? [];
    current.push(link);
    grouped.set(link.callout, current);
  }
  return Array.from(grouped.entries()).map(([callout, links]) => ({
    callout,
    links: links.sort((a, b) => b.confidence - a.confidence),
  }));
}
