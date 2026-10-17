import { describe, expect, it } from "vitest";
import { buildPrintHtml, buildText, exportLabels, normalizeExportBook, pdfSupportsLanguage } from "./book-export";

const base = { title: "The House", chapters: [{ id: "a", kind: "chapter", title: "Capítulo 1 — A casa", content: "Texto." }, { id: "b", kind: "chapter", title: "Chapter 2 - Night", content: "More." }, { id: "c", kind: "chapter", title: "Prologue", content: "Pre." }] };

describe("exportação em outros idiomas", () => {
  it("usa os rótulos do idioma e não duplica o prefixo já traduzido", () => {
    const book = normalizeExportBook({ ...base, languageCode: "en" });
    expect(book.chapters.map(chapter => chapter.title)).toEqual(["Chapter 1 — A casa", "Chapter 2 — Night", "Prologue"]);
  });
  it("mantém o português por padrão e localiza o sumário", () => {
    expect(normalizeExportBook(base).chapters[0].title).toBe("Capítulo 1 — A casa");
    expect(buildText({ ...base, languageCode: "fr" })).toContain("Table des matières");
    expect(buildPrintHtml({ ...base, languageCode: "de" })).toContain("<h2>Inhaltsverzeichnis</h2>");
    expect(buildPrintHtml({ ...base, languageCode: "ar" })).toContain('dir="rtl"');
  });
  it("usa o texto de direitos autorais traduzido", () => {
    const book = normalizeExportBook({ ...base, languageCode: "en", copyrightText: "All rights reserved." });
    expect(book.frontMatter?.find(section => section.id === "copyright")?.content).toBe("All rights reserved.");
  });
  it("rótulos em japonês e PDF só para alfabetos suportados", () => {
    expect(exportLabels("ja").chapter(3)).toBe("第3章");
    expect(exportLabels("zh-CN").contents).toBe("目录");
    expect(exportLabels("xx").contents).toBe("Sumário");
    expect(pdfSupportsLanguage("en")).toBe(true);
    expect(pdfSupportsLanguage("ru")).toBe(false);
    expect(pdfSupportsLanguage("zh-CN")).toBe(false);
  });
});
