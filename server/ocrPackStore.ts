import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

function resolveOcrPackDir(): string {
  const candidates = [
    process.env.OCR_PACK_DIR,
    path.resolve(process.cwd(), 'server-pack-data', 'drawing-ocr-pack'),
    path.resolve(process.cwd(), 'server', 'data', 'drawing-ocr-pack'),
    path.resolve(process.cwd(), 'dist', 'server-pack-data', 'drawing-ocr-pack'),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

const OCR_PACK_DIR = resolveOcrPackDir();

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface OcrPackManifest {
  importedAt: string;
  sourceDir: string;
  outputDir: string;
  missingOptionalFiles: string[];
  metrics: Record<string, number>;
  globalPolicy: Record<string, JsonValue>;
  generatedFiles: Record<string, string>;
  notes: string[];
}

export interface OcrPackKnowledgeRow extends Record<string, JsonValue> {
  knowledge_id: string;
  category_l1: string;
  category_l2: string;
  knowledge_name: string;
  purpose: string;
  pipeline_stage: string;
  priority: string;
}

export interface OcrPackSkillRow extends Record<string, JsonValue> {
  skill_id: string;
  skill_name: string;
  description: string;
  triggers: string[];
  prompt_refs: string[];
  knowledge_categories: string[];
  required_inputs: string[];
  outputs: string[];
  handoff_to: string[];
  enabled: boolean;
}

export interface OcrPackPromptRow extends Record<string, JsonValue> {
  prompt_id: string;
  prompt_name: string;
  objective: string;
  when_to_run: string;
  knowledge_filters: string[];
}

let cache: Map<string, JsonValue> | null = null;

async function readJsonFile<T extends JsonValue>(fileName: string): Promise<T> {
  const raw = await fs.readFile(path.join(OCR_PACK_DIR, fileName), 'utf-8');
  return JSON.parse(raw) as T;
}

async function ensureLoaded(): Promise<Map<string, JsonValue>> {
  if (cache) return cache;

  const next = new Map<string, JsonValue>();
  next.set('manifest', await readJsonFile<OcrPackManifest & JsonValue>('manifest.json'));
  next.set('knowledge_master', await readJsonFile<OcrPackKnowledgeRow[] & JsonValue>('knowledge_master.json'));
  next.set('sheet_type_master', await readJsonFile<JsonValue>('sheet_type_master.json'));
  next.set('abbreviation_master', await readJsonFile<JsonValue>('abbreviation_master.json'));
  next.set('symbol_seed_master', await readJsonFile<JsonValue>('symbol_seed_master.json'));
  next.set('field_dictionary', await readJsonFile<JsonValue>('field_dictionary.json'));
  next.set('pack_summary', await readJsonFile<JsonValue>('pack_summary.json'));
  next.set('prompt_definitions', await readJsonFile<JsonValue>('prompt_definitions.json'));
  next.set('skill_pack', await readJsonFile<JsonValue>('skill_pack.json'));
  cache = next;
  return next;
}

export async function getOcrPackManifest(): Promise<OcrPackManifest> {
  const data = await ensureLoaded();
  return data.get('manifest') as unknown as OcrPackManifest;
}

export async function listOcrPackKnowledge(query?: { category?: string | null; pipelineStage?: string | null; priority?: string | null }): Promise<OcrPackKnowledgeRow[]> {
  const data = await ensureLoaded();
  const rows = (data.get('knowledge_master') as unknown as OcrPackKnowledgeRow[]) || [];
  return rows.filter((row) => {
    if (query?.category && !(row.category_l1 === query.category || row.category_l2 === query.category)) return false;
    if (query?.pipelineStage && row.pipeline_stage !== query.pipelineStage) return false;
    if (query?.priority && row.priority !== query.priority) return false;
    return true;
  });
}

export async function listOcrPackSkills(): Promise<OcrPackSkillRow[]> {
  const data = await ensureLoaded();
  const skillPack = data.get('skill_pack') as unknown as { skills?: OcrPackSkillRow[] } | undefined;
  return Array.isArray(skillPack?.skills) ? skillPack!.skills! : [];
}

export async function listOcrPackPrompts(): Promise<OcrPackPromptRow[]> {
  const data = await ensureLoaded();
  const promptDefinitions = data.get('prompt_definitions') as unknown as { prompts?: OcrPackPromptRow[] } | undefined;
  return Array.isArray(promptDefinitions?.prompts) ? promptDefinitions!.prompts! : [];
}

export async function getOcrPackDictionaries(): Promise<Record<string, JsonValue>> {
  const data = await ensureLoaded();
  return {
    sheetTypeMaster: data.get('sheet_type_master') as JsonValue,
    abbreviationMaster: data.get('abbreviation_master') as JsonValue,
    symbolSeedMaster: data.get('symbol_seed_master') as JsonValue,
    fieldDictionary: data.get('field_dictionary') as JsonValue,
  };
}
