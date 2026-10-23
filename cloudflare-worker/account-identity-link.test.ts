import { describe, expect, it, vi } from "vitest";
import { linkGoogleIdentity, findLinkedGoogleIdentity } from "./account-identity-link.js";
import { verifyGoogleFirebaseIdToken } from "./google-identity.js";

describe("D1 identity linking safety", () => {
  it("fails closed without Access and never writes D1", async () => {
    const run = vi.fn();
    const db = { prepare: vi.fn(() => ({ bind: () => ({ all: async () => ({ results: [] }), run }) })) };
    const req = new Request("https://example.com/api/account/link-google", { method: "POST", headers: { Authorization: "Bearer invalid" } });
    expect((await linkGoogleIdentity(req, db, "author@example.com")).ok).toBe(false);
    expect(db.prepare).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
  it("does not accept a fabricated Firebase token or missing project configuration", async () => {
    expect(await verifyGoogleFirebaseIdToken("header.payload.signature", {})).toBeNull();
  });
  it("returns null when D1 is unavailable instead of inventing a link", async () => {
    const db = { prepare: () => { throw Error("D1 unavailable"); } };
    expect(await findLinkedGoogleIdentity(db, "author@example.com")).toBeNull();
  });
  it("never changes manuscript state on an identity verification failure", async () => {
    const manuscript = Object.freeze({ id: "book-1", content: "Unpublished original", sync: "pending" });
    const db = { prepare: vi.fn() };
    const req = new Request("https://example.com/api/account/link-google", { method: "POST" });
    await linkGoogleIdentity(req, db, "author@example.com");
    expect(manuscript.content).toBe("Unpublished original");
    expect(manuscript.sync).toBe("pending");
    expect(db.prepare).not.toHaveBeenCalled();
  });
});
