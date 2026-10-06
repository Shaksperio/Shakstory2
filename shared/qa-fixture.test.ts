import { describe, expect, it } from "vitest";
import { createQaLibrary, QA_BOOK_ID } from "./qa-fixture";

describe("isolated QA book fixture", () => {
  it("contains editorial data without relying on real author books", () => {
    const library = createQaLibrary();
    const reopened = JSON.parse(JSON.stringify(library));
    const book = reopened.books[0];
    expect(book.id).toBe(QA_BOOK_ID);
    expect(book.nodes).toHaveLength(4);
    expect(book.nodes.map((node: { id: string }) => node.id)).toEqual(["qa-part-1", "qa-chapter-1", "qa-chapter-2", "qa-scene-1"]);
    expect(book.publication.isbn).toBe("9780000000000");
    expect(book.publication.coverImageUrl).toContain("qa-cover");
    expect(book.planning.characters[0].name).toBe("Pessoa QA");
  });
});
