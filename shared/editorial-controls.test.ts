import { describe, expect, it } from "vitest";
import {
  buildEditorialControlsPrompt,
  missingProtectedTerms,
  normalizeEditorialControls,
  normalizeProtectedTerms,
} from "./editorial-controls";
import { buildContinuationPrompt, buildExpansionPrompt, COAUTHOR_APPROACHES } from "./coauthor";

describe("controles editoriais Cowila/Coautora", () => {
  it("normaliza palavras protegidas sem duplicação e limita entradas", () => {
    expect(normalizeProtectedTerms(" Helena, helena; Vale do Norte\nArven ")).toEqual(["Helena", "Vale do Norte", "Arven"]);
    expect(normalizeProtectedTerms(Array(40).fill(0).map((_, i) => "Personagem" + i))).toHaveLength(32);
  });

  it("usa opções seguras para preferências inválidas", () => {
    expect(normalizeEditorialControls({ intensity: "infinita", protectCanon: 0 })).toEqual({
      intensity: "equilibrada", protectedTerms: [], protectCanon: true,
    });
  });

  it("não permite perder grafia exata em revisão de trecho", () => {
    const controls = { intensity: "leve" as const, protectedTerms: ["Helena", "Arven"], protectCanon: true };
    expect(missingProtectedTerms("Helena chegou a Arven.", "Helena chegou à cidade.", controls)).toEqual(["Arven"]);
    expect(missingProtectedTerms("Helena chegou a Arven.", "Helena chegou a Arven.", controls)).toEqual([]);
    expect(missingProtectedTerms("Não há termos neste trecho", "Sugestão sem termos", controls)).toEqual([]);
  });

  it("anota intensidade e termos nos prompts sem inserir texto automaticamente", () => {
    const controls = { intensity: "profunda" as const, protectedTerms: ["Vale do Norte"], protectCanon: true };
    expect(buildEditorialControlsPrompt(controls)).toContain("Vale do Norte");
    const sample = buildContinuationPrompt({ approach: COAUTHOR_APPROACHES[0], editorialControls: controls });
    const expansion = buildExpansionPrompt({ selectedSample: "A cena continua.", editorialControls: controls });
    expect(sample).toContain("Intervenção profunda");
    expect(expansion).toContain("TERMOS DE GRAFIA EXATA");
    expect(expansion).toContain("Nunca aplique mudanças ao manuscrito");
  });
});
