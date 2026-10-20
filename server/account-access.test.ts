import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./data-access", () => ({ getEditorialRepository: () => ({ get: vi.fn(), put: vi.fn() }), getEditorialRepositoryMode: () => "json" }));
const { appRouter } = await import("./routers");

const context = (accountStatus: string) => ({
  user: { id: 42, role: "user", accountStatus },
  req: {},
  res: {},
} as TrpcContext);

describe("account status API protection", () => {
  for (const status of ["deactivated", "deletion_pending", "deleted"]) {
    it(`rejects protected requests when account is ${status}`, async () => {
      await expect(appRouter.createCaller(context(status)).data.get({ path: "books/example.json" }))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  }
});
