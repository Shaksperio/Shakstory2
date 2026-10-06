export type SyncStatus = "idle" | "syncing" | "synced" | "conflict" | "error";

export type SyncSnapshot = {
  status: SyncStatus;
  lastSyncAt: number | null;
  lastWebhookAt: number | null;
  lastWebhookEvent: string | null;
  lastConflictPath: string | null;
  lastError: string | null;
};

const snapshot: SyncSnapshot = {
  status: "idle",
  lastSyncAt: null,
  lastWebhookAt: null,
  lastWebhookEvent: null,
  lastConflictPath: null,
  lastError: null,
};

export function getSyncSnapshot(): SyncSnapshot {
  return { ...snapshot };
}

export function markSyncStarted() {
  snapshot.status = "syncing";
  snapshot.lastError = null;
}

export function markSyncSucceeded() {
  snapshot.status = "synced";
  snapshot.lastSyncAt = Date.now();
  snapshot.lastConflictPath = null;
  snapshot.lastError = null;
}

export function markSyncConflict(path: string) {
  snapshot.status = "conflict";
  snapshot.lastConflictPath = path;
  snapshot.lastError = "O documento mudou no GitHub antes do salvamento.";
}

export function markSyncFailed(error: unknown) {
  snapshot.status = "error";
  snapshot.lastError = error instanceof Error ? error.message : "Falha de sincronização.";
}

export function recordWebhookEvent(event: string) {
  snapshot.lastWebhookAt = Date.now();
  snapshot.lastWebhookEvent = event;
}
