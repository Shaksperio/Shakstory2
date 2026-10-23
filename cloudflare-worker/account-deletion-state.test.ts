import { describe, expect, it, vi } from "vitest";
import { cancelPermanentDeletion, processPermanentDeletion, requestPermanentDeletion } from "./account-deletion-state.js";

describe("permanent deletion request safety", () => {
  it("never runs the destructive executor", async () => {
    expect(await processPermanentDeletion()).toEqual({
      ok: false, reason: "executor_disabled", deletionExecuted: false,
    });
  });
  it("rejects missing account or id without D1 writes", async () => {
    const prepare = vi.fn();
    const result = await requestPermanentDeletion({ prepare }, { accountEmail: "", requestId: "" });
    expect(result.ok).toBe(false);
    expect(prepare).not.toHaveBeenCalled();
  });
  it("fails closed when D1 is unavailable", async () => {
    const db = { prepare: () => { throw new Error("D1 outage"); } };
    expect((await requestPermanentDeletion(db, {
      accountEmail: "synthetic@example.com", requestId: "synthetic-request-0001",
    })).reason).toBe("storage_unavailable");
  });
  it("is idempotent for repeated request identifiers", async () => {
    const stored = { request_id: "synthetic-request-0001", account_email: "synthetic@example.com", status: "pending" };
    const run = vi.fn(async () => ({ meta: { changes: 0 } }));
    const first = vi.fn(async () => ({ email: stored.account_email }));
    const read = vi.fn(async () => stored);
    const db = { prepare: (sql: string) => ({
      bind: () => ({ first: sql.includes("FROM shak_users") ? first : read, run }),
    }) };
    const args = { accountEmail: stored.account_email, requestId: stored.request_id, now: 12345 };
    const a = await requestPermanentDeletion(db, args);
    const b = await requestPermanentDeletion(db, args);
    expect(a).toEqual(b);
    expect(a.deletionExecuted).toBe(false);
  });
  it("cannot cancel a request that has already started processing", async () => {
    const db = { prepare: () => ({ bind: () => ({ run: async () => ({ meta: { changes: 0 } }) }) }) };
    const result = await cancelPermanentDeletion(db, {
      accountEmail: "synthetic@example.com", requestId: "synthetic-request-0001", now: 12345,
    });
    expect(result).toEqual({ ok: false, deletionExecuted: false });
  });
});
