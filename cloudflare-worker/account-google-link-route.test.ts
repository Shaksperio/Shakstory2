import { describe, expect, it, vi } from "vitest";
import { handleAccountGoogleLink } from "./account-deletion-route.js";

describe("Google linking endpoint", () => {
  const url = "https://example.com/api/account/link-google";
  it("requires a POST", async () => {
    const res = await handleAccountGoogleLink(new Request(url), {});
    expect(res.status).toBe(405);
  });
  it("requires explicit configuration", async () => {
    const res = await handleAccountGoogleLink(new Request(url, { method: "POST" }), {});
    expect(res.status).toBe(503);
  });
  it("blocks missing Origin before any D1 reads", async () => {
    const prepare = vi.fn();
    const res = await handleAccountGoogleLink(new Request(url, { method: "POST" }), { DB: { prepare }, FIREBASE_PROJECT_ID: "valid-project" });
    expect(res.status).toBe(403);
    expect(prepare).not.toHaveBeenCalled();
  });
  it("blocks forged Origin before any D1 reads", async () => {
    const prepare = vi.fn();
    const req = new Request(url, { method: "POST", headers: { Origin: "https://evil.example" } });
    const res = await handleAccountGoogleLink(req, { DB: { prepare }, FIREBASE_PROJECT_ID: "valid-project" });
    expect(res.status).toBe(403);
    expect(prepare).not.toHaveBeenCalled();
  });
  it("rejects missing Access assertion before any D1 reads", async () => {
    const prepare = vi.fn();
    const req = new Request(url, { method: "POST", headers: { Origin: "https://example.com" } });
    const res = await handleAccountGoogleLink(req, { DB: { prepare }, FIREBASE_PROJECT_ID: "valid-project" });
    expect(res.status).toBe(401);
    expect(prepare).not.toHaveBeenCalled();
  });
});
