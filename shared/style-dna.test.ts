import { describe, expect, it } from "vitest";
import { analyzeStyleDna, buildStyleDnaPrompt } from "./style-dna";

describe("Style DNA", () => {
  it("extracts cadence, paragraph and dialogue signals from the author's own text", () => {
    const text = [
      "A noite caiu cedo. O vento correu pelas ruas. Ninguém respondeu.",
      "— Você ouviu isso? — perguntou Lia.\n— Ouvi. E não gostei.",
      "As luzes piscaram três vezes. Depois, silêncio."
    ].join("\n\n");
    const dna = analyzeStyleDna(text);
    expect(dna.wordCount).toBeGreaterThan(20);
    expect(dna.sentenceCount).toBeGreaterThan(3);
    expect(dna.paragraphCount).toBe(3);
    expect(dna.dialogueWordRatio).toBeGreaterThan(0);
    expect(["concise", "balanced", "expansive"]).toContain(dna.rhythm);
  });

  it("returns a cautious message for samples that are too short", () => {
    expect(buildStyleDnaPrompt("Poucas palavras aqui.")).toContain("curta demais");
  });

  it("describes style without turning metrics into mandatory rules", () => {
    const sample = ("A personagem abriu a porta devagar. Havia poeira no corredor. " +
      "Ela respirou fundo antes de seguir. — Tem alguém aí? — perguntou. ").repeat(8);
    const prompt = buildStyleDnaPrompt(sample);
    expect(prompt).toContain("Style DNA do próprio autor");
    expect(prompt).toContain("não regra");
    expect(prompt).toContain("Não imite mecanicamente");
  });
});
