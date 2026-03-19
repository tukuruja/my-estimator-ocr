import fs from 'node:fs/promises';
import path from 'node:path';

import type { EstimationLogicAuditRecord, EstimationLogicRunResponse } from '../shared/estimationLogic';

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data', 'workspaces');

function normalizeWorkspaceId(workspaceId: string): string {
  const trimmed = workspaceId.trim().slice(0, 80);
  const sanitized = trimmed.replace(/[^a-zA-Z0-9_-]/g, '_');
  return sanitized || 'anonymous';
}

function resolveAuditDir(workspaceId: string): string {
  return path.join(DATA_DIR, normalizeWorkspaceId(workspaceId), 'estimation-logic-runs');
}

export async function writeEstimationLogicAuditLog(workspaceId: string, response: EstimationLogicRunResponse): Promise<EstimationLogicAuditRecord> {
  const auditDir = resolveAuditDir(workspaceId);
  await fs.mkdir(auditDir, { recursive: true });
  const filePath = path.join(auditDir, `${response.audit.id}.json`);
  await fs.writeFile(filePath, `${JSON.stringify(response, null, 2)}\n`, 'utf-8');
  return response.audit;
}

export async function listEstimationLogicAuditLogs(
  workspaceId: string,
  limit: number = 20,
): Promise<EstimationLogicRunResponse[]> {
  const auditDir = resolveAuditDir(workspaceId);
  await fs.mkdir(auditDir, { recursive: true });

  const entries = await fs.readdir(auditDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name);

  const loaded = await Promise.all(files.map(async (fileName) => {
    const fullPath = path.join(auditDir, fileName);
    const stat = await fs.stat(fullPath);
    const raw = await fs.readFile(fullPath, 'utf-8');
    return {
      mtimeMs: stat.mtimeMs,
      data: JSON.parse(raw) as EstimationLogicRunResponse,
    };
  }));

  return loaded
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(0, limit)
    .map((entry) => entry.data);
}
