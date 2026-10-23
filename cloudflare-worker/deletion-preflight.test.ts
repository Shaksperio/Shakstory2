import { describe, expect, it, vi } from "vitest";
import { deletionPreflight } from "./deletion-preflight.js";

describe("deletion preflight fails closed", () => {
  const req = new Request("https://shakstory.antonyopintor.workers.dev/api/account/deletion/preflight", { method: "POST" });
  const input = { typedName: "Autora", acknowledged: true, turnstileToken: "test" };
  it("rejects missing account and wrong typed name before identity checks", async () => {
    expect(await deletionPreflight(req, {}, null, input)).toEqual({ eligible: false, reason: "confirmation_required" });
    expect(await deletionPreflight(req, {}, { name: "Outra" }, input)).toEqual({ eligible: false, reason: "confirmation_required" });
  });
  it("rejects missing verified Access/Google identity and never attempts Turnstile", async () => {
    const fetcher = vi.fn();
    const result = await deletionPreflight(req, { TURNSTILE_SECRET_KEY: "secret", TURNSTILE_SITE_KEY: "site" }, { name: "Autora", email: "author@example.com", googleUid: "uid" }, input, { fetcher });
    expect(result.eligible).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not change any account state", async () => {
    const account = Object.freeze({ name: "Autora", email: "author@example.com", googleUid: "uid", accountStatus: "active" });
    const result = await deletionPreflight(req, {}, account, input);
    expect(result.eligible).toBe(false);
    expect(account.accountStatus).toBe("active");
  });
});
