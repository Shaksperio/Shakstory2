import { describe, expect, it } from "vitest";
import {
  COWILA_COAUTHOR_MASTER_PROMPT,
  CONTINUATION_ABSOLUTE_FLOOR,
  CONTINUATION_DEFAULT_ALTERNATIVES,
  CONTINUATION_DEFAULT_WORDS,
  buildRuntimeCoauthorDirective,
  chapterRangeForGenre,
  findChapterLengthGuideline,
  resolveGenerationTarget,
} from "./cowila-coauthor-guidelines";

describe("Cowila coauthor guidelines", () => {
  it("encodes the standard continuation limits from the guidelines", () => {
    expect(CONTINUATION_ABSOLUTE_FLOOR).toBe(700);
    expect(CONTINUATION_DEFAULT_WORDS).toBe(1200);
    expect(CONTINUATION_DEFAULT_ALTERNATIVES).toBe(3);
    expect(COWILA_COAUTHOR_MASTER_PROMPT).toContain("900 e 1.600 palavras");
    expect(COWILA_COAUTHOR_MASTER_PROMPT).toContain("piso absoluto é 700");
  });

  it("returns chapter ranges by genre", () => {
    expect(chapterRangeForGenre("fantasia épica")).toEqual({ minWords: 4000, maxWords: 8000, targetWords: 5500 });
    expect(chapterRangeForGenre("romantasy")).toEqual({ minWords: 3000, maxWords: 5000, targetWords: 4000 });
    expect(chapterRangeForGenre("thriller")).toEqual({ minWords: 1000, maxWords: 2500, targetWords: 1800 });
  });

  it("marks derived genres without presenting them as published norms", () => {
    expect(findChapterLengthGuideline("dark fantasy").origin).toBe("derived");
    expect(findChapterLengthGuideline("fantasia urbana").origin).toBe("derived");
    expect(findChapterLengthGuideline("ficção científica").origin).toBe("source");
  });

  it("uses explicit author word counts over defaults", () => {
    expect(resolveGenerationTarget({ mode: "continuation", genre: "romance", requestedWords: 950 })).toBe(950);
    expect(resolveGenerationTarget({ mode: "full_chapter", genre: "romance" })).toBe(3000);
    expect(resolveGenerationTarget({ mode: "continuation", genre: "romance" })).toBe(1200);
  });

  it("adapts the master prompt to split runtime generation", () => {
    const prompt = buildRuntimeCoauthorDirective({
      mode: "continuation",
      genre: "dark fantasy",
      optionIndex: 2,
      totalOptions: 3,
      requestedWords: 1200,
    });
    expect(prompt).toContain("opção 2 de 3");
    expect(prompt).toContain("1200 palavras");
    expect(prompt).toContain("cada opção é gerada em uma chamada separada");
    expect(prompt).toContain("sem rótulo OPÇÃO");
  });
});
