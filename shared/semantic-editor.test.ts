import { describe, expect, it } from "vitest";
import { migrateLegacyNodes } from "./book-model";
import { chaptersOf, replaceSceneBlocks, sceneText, scenesOf } from "./semantic-editor";

describe("semantic editor", () => {
  it("finds scenes by stable chapter identity and replaces blocks", () => {
    const book = migrateLegacyNodes({ id: "book_scene", title: "Livro", nodes: [{ id: "chapter_1", title: "Capítulo 1", kind: "chapter", content: "Primeiro bloco.\n\nSegundo bloco.", sortOrder: 0 }] });
    const chapter = chaptersOf(book)[0];
    const scene = scenesOf(book, chapter.id)[0];
    const next = replaceSceneBlocks(book, scene.id, [{ id: "block_custom", kind: "paragraph", text: "Bloco editado.", sortOrder: 0 }], "<p><strong><em>Bloco editado.</em></strong></p>");
    expect(sceneText(scenesOf(next, chapter.id)[0])).toBe("Bloco editado.");
    expect(next.parts[0].chapters[0].id).toBe("chapter_1");
    expect(scenesOf(next, chapter.id)[0].richContent).toBe("<p><strong><em>Bloco editado.</em></strong></p>");
    expect(scenesOf(next, chapter.id)[0].richContent).toContain("<em>");
  });
});
