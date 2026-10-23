import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./data-access", () => ({ getEditorialRepository: () => ({ get: vi.fn(), put: vi.fn() }), getEditorialRepositoryMode: () => "json" }));
const { appRouter } = await import("./routers");

const context = (accountStatus: string) => ({
  user: { id: 42, role: "user", accountStatus, name: "Autora", email: "autora@example.com", loginMethod: "google", createdAt: new Date("2026-01-01") },
  req: {},
  res: {},
} as TrpcContext);

describe("account status API protection", () => {
  it("shows profile data only to active authenticated users", async () => {
    const result = await appRouter.createCaller(context("active")).account.profile();
    expect(result.name).toBe("Autora");
    expect(result.email).toBe("autora@example.com");
  });
  it("rejects unsafe profile names before any database call", async () => {
    await expect(appRouter.createCaller(context("active")).account.updateProfile({ name: "" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  for (const status of ["deactivated", "deletion_pending", "deleted"]) {
    it(`rejects protected requests when account is ${status}`, async () => {
      await expect(appRouter.createCaller(context(status)).data.get({ path: "books/example.json" }))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  }
});
