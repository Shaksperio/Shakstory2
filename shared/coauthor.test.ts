import { describe, expect, it } from "vitest";
import {
  appendContinuationHtml,
  appendContinuationText,
  buildContinuationPrompt,
  clampAlternativeCount,
  clampContinuationWords,
  pickApproaches,
} from "./coauthor";

describe("Cowila coauthor proposals", () => {
  it("limits words and number of alternatives to safe product bounds", () => {
    expect(clampContinuationWords(10)).toBe(60);
    expect(clampContinuationWords(999)).toBe(500);
    expect(clampAlternativeCount(1)).toBe(2);
    expect(clampAlternativeCount(9)).toBe(4);
    expect(pickApproaches(3)).toHaveLength(3);
  });

  it("builds a proposal-only continuation prompt that preserves canon", () => {
    const prompt = buildContinuationPrompt({
      intent: "Elia deve desconfiar da carta sem descobrir toda a verdade.",
      targetWords: 220,
      approach: pickApproaches(2)[0],
      literaryContext: "Lente de gênero: dark fantasy.",
    });
    expect(prompt).toContain("220 palavras");
    expect(prompt).toContain("Elia deve desconfiar");
    expect(prompt).toContain("não revele informação");
    expect(prompt).toContain("somente uma proposta");
    expect(prompt.toLowerCase()).toContain("dark fantasy");
  });

  it("appends accepted text without modifying the existing draft", () => {
    const base = "Primeiro parágrafo.";
    const result = appendContinuationText(base, "Segundo parágrafo.");
    expect(result).toBe("Primeiro parágrafo.\n\nSegundo parágrafo.");
    expect(base).toBe("Primeiro parágrafo.");
  });

  it("creates safe paragraph HTML for an accepted proposal", () => {
    const html = appendContinuationHtml("<p>Anterior.</p>", 'Novo <trecho> & "fala".\n\nOutro bloco.');
    expect(html).toContain("<p>Anterior.</p>");
    expect(html).toContain("&lt;trecho&gt;");
    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;fala&quot;");
    expect(html).toContain("<p>Outro bloco.</p>");
  });
});
