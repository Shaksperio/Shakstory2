import { describe, expect, it } from "vitest";
import {
  appendContinuationHtml,
  appendContinuationText,
  buildContinuationPrompt,
  buildExpansionPrompt,
  clampAlternativeCount,
  clampContinuationWords,
  pickApproaches,
  resolveGenreChapterRange,
} from "./coauthor";

describe("Cowila coauthor two-stage flow", () => {
  it("always creates three short samples for comparison", () => {
    expect(clampContinuationWords(10)).toBe(120);
    expect(clampContinuationWords(999)).toBe(260);
    expect(clampAlternativeCount(1)).toBe(3);
    expect(clampAlternativeCount(9)).toBe(3);
    expect(pickApproaches(1)).toHaveLength(3);
  });

  it("builds a Phase 1 sample prompt instead of a final continuation", () => {
    const prompt = buildContinuationPrompt({
      intent: "Elia deve desconfiar da carta sem descobrir toda a verdade.",
      targetWords: 180,
      approach: pickApproaches()[0],
      literaryContext: "Lente de gênero: dark fantasy.",
    });
    expect(prompt).toContain("FASE 1");
    expect(prompt).toContain("AMOSTRA");
    expect(prompt).toContain("180 palavras");
    expect(prompt).toContain("Elia deve desconfiar");
    expect(prompt.toLowerCase()).toContain("não é a continuação final");
    expect(prompt.toLowerCase()).toContain("dark fantasy");
  });

  it("uses the selected sample only in Phase 2 and applies the long-form directives", () => {
    const prompt = buildExpansionPrompt({
      selectedSample: "Elia aperta a carta e percebe um ruído atrás da porta.",
      intent: "Aumentar a tensão sem revelar Joe.",
      genre: "dark fantasy",
      literaryContext: "Style DNA: cadência equilibrada.",
    });
    expect(prompt).toContain("FASE 2");
    expect(prompt).toContain("EXPANSÃO DA OPÇÃO ESCOLHIDA");
    expect(prompt).toContain("900 e 1.600 palavras");
    expect(prompt).toContain("piso absoluto é 700");
    expect(prompt).toContain("Dark fantasy");
    expect(prompt).toContain("3.000");
    expect(prompt).toContain("6.000");
    expect(prompt).toContain("beats dramáticos");
    expect(prompt).toContain("Style DNA");
    expect(prompt).toContain("não transforme a amostra escolhida em outra direção");
  });

  it("resolves chapter ranges by genre without treating derived ranges as standards", () => {
    expect(resolveGenreChapterRange("romantasy").id).toBe("romantasy");
    expect(resolveGenreChapterRange("romantasy").origin).toBe("derived");
    expect(resolveGenreChapterRange("thriller").targetWords).toBe(1800);
    expect(resolveGenreChapterRange("gênero desconhecido").id).toBe("general");
  });

  it("lets an explicit word request override the default expansion range", () => {
    const prompt = buildExpansionPrompt({
      selectedSample: "A escolha foi feita.",
      requestedWords: 2100,
      genre: "romance",
    });
    expect(prompt).toContain("2.100 palavras");
    expect(prompt).toContain("prevalece");
  });

  it("appends only the final accepted expansion without modifying the original draft value", () => {
    const base = "Primeiro parágrafo.";
    const result = appendContinuationText(base, "Continuação expandida.");
    expect(result).toBe("Primeiro parágrafo.\n\nContinuação expandida.");
    expect(base).toBe("Primeiro parágrafo.");
  });

  it("creates safe paragraph HTML for an accepted expanded continuation", () => {
    const html = appendContinuationHtml("<p>Anterior.</p>", 'Novo <trecho> & "fala".\n\nOutro bloco.');
    expect(html).toContain("<p>Anterior.</p>");
    expect(html).toContain("&lt;trecho&gt;");
    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;fala&quot;");
    expect(html).toContain("<p>Outro bloco.</p>");
  });
});
