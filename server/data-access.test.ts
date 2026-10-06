import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { RepositoryConflictError } from "../backend/src/repositories/types";

const fakeRepository = {
  get: vi.fn(),
  put: vi.fn(),
};

vi.mock("./data-access", () => ({
  getEditorialRepository: () => fakeRepository,
  getEditorialRepositoryMode: () => "json",
}));

const { appRouter } = await import("./routers");

const context = { user: { id: 42 }, req: {}, res: {} } as TrpcContext;

describe("data repository procedures", () => {
  beforeEach(() => vi.clearAllMocks());

  it("escopa leituras ao autor autenticado", async () => {
    fakeRepository.get.mockResolvedValue({ data: { title: "Caderno" }, sha: "sha-1" });
    const result = await appRouter.createCaller(context).data.get({ path: "books/book-1.json" });
    expect(fakeRepository.get).toHaveBeenCalledWith("authors/42/books/book-1.json");
    expect(result).toEqual({ data: { title: "Caderno" }, sha: "sha-1" });
  });

  it("grava com expectedSha e converte conflito em erro tRPC", async () => {
    fakeRepository.put.mockRejectedValue(new RepositoryConflictError("authors/42/books/book-1.json"));
    await expect(appRouter.createCaller(context).data.put({
      path: "books/book-1.json",
      data: { title: "Atualização" },
      expectedSha: "sha-old",
    })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(fakeRepository.put).toHaveBeenCalledWith("authors/42/books/book-1.json", { title: "Atualização" }, "sha-old");
  });
});
