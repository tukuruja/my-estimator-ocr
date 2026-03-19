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
