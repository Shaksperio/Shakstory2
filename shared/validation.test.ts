import { describe, expect, it } from "vitest";
import { migrateLegacyNodes } from "./book-model";
import { validateBook } from "./validation";

describe("Validation Engine", () => {
  it("reports required metadata and empty content without mutating input", () => {
    const nodes = [{ id: "chapter_1", title: "Capítulo 1", content: "" }];
    const issues = validateBook({ title: "Livro", nodes, author: "", language: "pt-BR" });
    expect(issues.map(issue => issue.code)).toEqual(expect.arrayContaining(["AUTHOR_MISSING", "NODE_EMPTY"]));
    expect(nodes[0].content).toBe("");
  });

  it("accepts a populated semantic book", () => {
    const semanticBook = migrateLegacyNodes({ id: "book", title: "Livro", nodes: [{ id: "chapter", title: "Capítulo", kind: "chapter", content: "Texto", sortOrder: 0 }] });
    expect(validateBook({ title: "Livro", author: "Autora", language: "pt-BR", nodes: [{ id: "chapter", title: "Capítulo", content: "Texto" }], semanticBook })).toEqual([]);
  });
});
