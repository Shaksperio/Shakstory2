import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const analyzeLiteraryText = vi.hoisted(() => vi.fn());
const listLLMModels = vi.hoisted(() => vi.fn());

vi.mock("./literary-analysis", () => ({
  analyzeLiteraryText,
  literaryAnalysisInputSchema: require("zod").object({
    text: require("zod").string().min(1),
    focus: require("zod").enum(["language", "grammar", "parts_of_speech", "lexicon", "narrative", "voice", "style", "full"]).default("full"),
    model: require("zod").string().optional(),
    language: require("zod").string().default("pt-BR"),
  }),
}));
vi.mock("./_core/llm", () => ({ listLLMModels }));
vi.mock("./data-access", () => ({ getEditorialRepository: () => ({ get: vi.fn(), put: vi.fn() }), getEditorialRepositoryMode: () => "json" }));

const { appRouter } = await import("./routers");
const context = { user: { id: 42 }, req: {}, res: {} } as TrpcContext;

describe("literaryAssist router", () => {
  beforeEach(() => vi.clearAllMocks());

  it("converte falha do LLM em BAD_GATEWAY", async () => {
    analyzeLiteraryText.mockRejectedValue(new Error("upstream secret detail"));

    await expect(appRouter.createCaller(context).literaryAssist.analyze({ text: "Um trecho.", focus: "full", language: "pt-BR" })).rejects.toMatchObject({ code: "BAD_GATEWAY", message: "A assessoria literária não respondeu: upstream secret detail" });
  });
});
