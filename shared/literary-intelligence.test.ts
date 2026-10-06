import { describe, expect, it } from "vitest";
import {
  buildCowilaEditorialPrinciples,
  buildCowilaLiteraryContext,
  buildGenreLens,
  findGenrePack,
} from "./literary-intelligence";

describe("Cowila literary intelligence", () => {
  it("recognizes romantasy aliases and returns a genre-aware lens", () => {
    const genre = findGenrePack("fantasia romântica");
    expect(genre?.id).toBe("romantasy");
    const lens = buildGenreLens("romantasy");
    expect(lens).toContain("Romantasy");
    expect(lens).toContain("tensão romântica");
  });

  it("keeps unknown genres extensible instead of rejecting them", () => {
    const lens = buildGenreLens("cli-fi");
    expect(lens).toContain("cli-fi");
    expect(lens).toContain("não imponha fórmulas");
  });

  it("builds context with role, task, genre and authorship safeguards", () => {
    const context = buildCowilaLiteraryContext({
      genre: "dark fantasy",
      subgenre: "gótico",
      audience: "adulto",
      role: "developmental_editor",
      task: "analyze",
    });
    expect(context.toLowerCase()).toContain("dark fantasy");
    expect(context).toContain("gótico");
    expect(context).toContain("adulto");
    expect(context).toContain("developmental_editor");
    expect(context).toContain("A autoria pertence ao usuário");
  });

  it("does not promise bestseller outcomes or author imitation", () => {
    const principles = buildCowilaEditorialPrinciples();
    expect(principles).toContain("garantia de best-seller");
    expect(principles).toContain("autores vivos");
  });
});
