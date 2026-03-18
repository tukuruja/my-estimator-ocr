const WORKSPACE_ID_STORAGE_KEY = 'my-estimator-workspace-id';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function createWorkspaceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getWorkspaceId(): string {
  if (!isBrowser()) {
    return 'server-render';
  }

  const existing = localStorage.getItem(WORKSPACE_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const next = createWorkspaceId();
  localStorage.setItem(WORKSPACE_ID_STORAGE_KEY, next);
  return next;
}

export function getWorkspaceHeaders(): Record<string, string> {
  return {
    'X-Workspace-Id': getWorkspaceId(),
  };
}
