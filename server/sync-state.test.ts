import { describe, expect, it } from "vitest";
import { getSyncSnapshot, markSyncConflict, markSyncStarted, markSyncSucceeded, recordWebhookEvent } from "./sync-state";

describe("sync-state", () => {
  it("registra sucesso e conflito sem armazenar conteúdo editorial", () => {
    markSyncStarted();
    expect(getSyncSnapshot().status).toBe("syncing");

    recordWebhookEvent("push");
    markSyncSucceeded();
    const synced = getSyncSnapshot();
    expect(synced.status).toBe("synced");
    expect(synced.lastWebhookEvent).toBe("push");
    expect(synced.lastSyncAt).not.toBeNull();

    markSyncConflict("authors/1/library.json");
    const conflict = getSyncSnapshot();
    expect(conflict.status).toBe("conflict");
    expect(conflict.lastConflictPath).toBe("authors/1/library.json");
    expect(conflict).not.toHaveProperty("content");
  });
});
