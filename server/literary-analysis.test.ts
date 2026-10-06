import { beforeEach, describe, expect, it, vi } from "vitest";

const { listLLMModels, invokeLLM } = vi.hoisted(() => ({ listLLMModels: vi.fn(), invokeLLM: vi.fn() }));

vi.mock("./_core/llm", () => ({ listLLMModels, invokeLLM }));

import { analyzeLiteraryText, literaryAnalysisInputSchema } from "./literary-analysis";
import { applySuggestionAtOffsets } from "../shared/literary";

describe("literary analysis", () => {
  beforeEach(() => vi.clearAllMocks());

  it("normalizes input and rejects oversized or empty excerpts", () => {
    expect(literaryAnalysisInputSchema.parse({ text: "Um trecho." }).focus).toBe("full");
    expect(() => literaryAnalysisInputSchema.parse({ text: " " })).toThrow();
    expect(() => literaryAnalysisInputSchema.parse({ text: "x".repeat(14001) })).toThrow();
  });

  it("uses an available requested model and removes unverifiable originals", async () => {
    listLLMModels.mockResolvedValue({ data: [{ id: "literary-model" }] });
    invokeLLM.mockResolvedValue({
      model: "literary-model",
      choices: [{ message: { content: JSON.stringify({
        summary: "Há uma imagem forte no trecho.",
        strengths: ["Imagem concreta"],
        suggestions: [
          { category: "gramatica", severity: "erro_provavel", original: "Uma frase", suggestion: "A frase", explanation: "Concordância.", confidence: 0.95, start: 0, end: 9 },
          { category: "estilo", severity: "observacao", original: "Não existe", suggestion: "Outra", explanation: "Não deve passar.", confidence: 0.4, start: 0, end: 10 },
        ],
        narrativeNotes: ["O foco permanece próximo da personagem."],
      }) }, finish_reason: "stop" }],
    });

    const result = await analyzeLiteraryText({ text: "Uma frase aparece.", focus: "full", language: "pt-BR", model: "literary-model" });

    expect(invokeLLM).toHaveBeenCalledWith(expect.objectContaining({ model: "literary-model" }));
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]?.original).toBe("Uma frase");
    expect(result.availableModels).toEqual(["literary-model"]);
    expect("Uma frase aparece.").toBe("Uma frase aparece.");
  });

  it("reports HTML responses as an operational provider error", async () => {
    listLLMModels.mockResolvedValue({ data: [{ id: "literary-model" }] });
    invokeLLM.mockResolvedValue({ model: "literary-model", choices: [{ message: { content: "<!DOCTYPE html><html>login</html>" } }] });
    await expect(analyzeLiteraryText({ text: "Um trecho.", focus: "full", language: "pt-BR", model: "literary-model" })).rejects.toThrow("retornou HTML em vez de JSON");
  });

  it("propagates endpoint failures without modifying the excerpt", async () => {
    listLLMModels.mockResolvedValue({ data: [{ id: "literary-model" }] });
    invokeLLM.mockRejectedValue(new Error("upstream unavailable"));
    const excerpt = "O texto continua igual.";

    await expect(analyzeLiteraryText({ text: excerpt, focus: "full", language: "pt-BR", model: "literary-model" })).rejects.toThrow("upstream unavailable");
    expect(excerpt).toBe("O texto continua igual.");
  });

  it("propagates catalog failures without modifying the excerpt", async () => {
    const excerpt = "O manuscrito permanece intocado.";
    listLLMModels.mockRejectedValue(new Error("catalog unavailable"));

    await expect(analyzeLiteraryText({ text: excerpt, focus: "language", language: "pt-BR" })).rejects.toThrow("catalog unavailable");
    expect(excerpt).toBe("O manuscrito permanece intocado.");
    expect(invokeLLM).not.toHaveBeenCalled();
  });

  it("keeps the draft unchanged until a manual offset application", () => {
    const draft = "A noite caiu. A noite silenciou.";
    expect(draft).toBe("A noite caiu. A noite silenciou.");
    expect(applySuggestionAtOffsets(draft, 0, 7, "A noite", "A tarde")).toBe("A tarde caiu. A noite silenciou.");
    expect(applySuggestionAtOffsets(draft, 1, 8, "A noite", "A tarde")).toBe(draft);
  });
});
