import { describe, expect, it, vi } from "vitest";
import { confirmDeletionIntent, verifyDeletionTurnstile } from "./deletion-confirmation.js";

describe("final deletion confirmation", () => {
  it("requires explicit acknowledgement and exact account display name", () => {
    const data = { accountName: "Autora Maria", typedName: "Autora Maria", acknowledged: true };
    expect(confirmDeletionIntent(data)).toBe(true);
    expect(confirmDeletionIntent({ ...data, typedName: "Outra Pessoa" })).toBe(false);
    expect(confirmDeletionIntent({ ...data, acknowledged: false })).toBe(false);
    expect(confirmDeletionIntent({ ...data, accountName: "" })).toBe(false);
  });
  it("rejects absent or failed captcha", async () => {
    expect(await verifyDeletionTurnstile("", "secret")).toBe(false);
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: false }) });
    expect(await verifyDeletionTurnstile("token", "secret", { fetcher })).toBe(false);
  });
  it("requires matching hostname and action when supplied", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, hostname: "shakstory.antonyopintor.workers.dev", action: "delete_account" }) });
    expect(await verifyDeletionTurnstile("token", "secret", { fetcher, hostname: "shakstory.antonyopintor.workers.dev" })).toBe(true);
    expect(await verifyDeletionTurnstile("token", "secret", { fetcher, hostname: "attacker.example" })).toBe(false);
  });
});
