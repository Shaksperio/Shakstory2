import { describe, expect, it, vi } from "vitest";
import { handleAccountDeletionPreflight } from "./account-deletion-route.js";

describe("real Worker preflight adapter", () => {
  const url = "https://shakstory.antonyopintor.workers.dev/api/account/deletion/preflight";
  const env = { DB: { prepare: vi.fn() }, FIREBASE_PROJECT_ID: "example-project", TURNSTILE_SITE_KEY: "site", TURNSTILE_SECRET_KEY: "secret" };
  it("refuses all requests without Access JWT before D1 lookup", async () => {
    const req = new Request(url, { method: "POST", body: JSON.stringify({ typedName: "Author", acknowledged: true }) });
    const res = await handleAccountDeletionPreflight(req, env);
    expect(res.status).toBe(401);
    expect(env.DB.prepare).not.toHaveBeenCalled();
  });
  it("refuses cross-origin submissions", async () => {
    const req = new Request(url, { method: "POST", headers: { Origin: "https://evil.example" }, body: "{}" });
    expect((await handleAccountDeletionPreflight(req, env)).status).toBe(403);
    expect(env.DB.prepare).not.toHaveBeenCalled();
  });
  it("fails closed if secrets or project are not configured", async () => {
    const req = new Request(url, { method: "POST", body: "{}" });
    expect((await handleAccountDeletionPreflight(req, { DB: env.DB })).status).toBe(503);
  });
  it("never accepts GET for the operation", async () => {
    const req = new Request(url);
    expect((await handleAccountDeletionPreflight(req, env)).status).toBe(405);
  });
});
