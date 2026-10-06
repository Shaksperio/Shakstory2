import { describe, expect, it } from "vitest";
import { migrateLegacyNodes, semanticWordCount } from "./book-model";

describe("semantic book model", () => {
  it("migrates legacy nodes into parts, chapters, scenes and blocks", () => {
    const book = migrateLegacyNodes({ id: "book_1", title: "Livro", nodes: [
      { id: "chapter_2", title: "Dois", kind: "chapter", content: "Segundo parágrafo.\n\nOutro bloco.", sortOrder: 2 },
      { id: "part_1", title: "Parte I", kind: "part", content: "", sortOrder: 1 },
      { id: "chapter_1", title: "Um", kind: "chapter", content: "Primeiro texto.", sortOrder: 0 },
    ] });
    expect(book.schemaVersion).toBe("1.1");
    expect(book.parts).toHaveLength(2);
    expect(book.parts[0].title).toBe("Parte 1");
    expect(book.parts[0].chapters.map(chapter => chapter.title)).toEqual(["Um"]);
    expect(book.parts[1].title).toBe("Parte I");
    expect(book.parts[1].chapters.map(chapter => chapter.title)).toEqual(["Dois"]);
    expect(book.parts[1].chapters[0].scenes[0].blocks).toHaveLength(2);
    expect(semanticWordCount(book)).toBe(6);
  });

  it("keeps a default part when no explicit part exists", () => {
    const book = migrateLegacyNodes({ id: "book_2", title: "Livro", nodes: [{ id: "chapter_1", title: "Um", kind: "chapter", content: "Texto", sortOrder: 0 }] });
    expect(book.parts[0].title).toBe("Parte 1");
    expect(book.migratedFromLegacy).toBe(true);
  });
});
