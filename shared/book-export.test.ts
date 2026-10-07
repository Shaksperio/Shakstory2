import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  buildDocx,
  buildEpub,
  buildPrintHtml,
  chaptersFromNodes,
  type ExportBook,
} from "./book-export";

const book: ExportBook = {
  title: "Caderno de teste",
  author: "Autora",
  language: "pt-BR",
  chapters: [
    {
      id: "c1",
      title: "Capítulo 1",
      content: "Primeiro parágrafo.\n\nSegundo parágrafo.",
    },
  ],
};

describe("book export", () => {
  it("builds a navigable EPUB without changing source content", async () => {
    const epub = await buildEpub(book);
    const zip = await JSZip.loadAsync(await epub.arrayBuffer());
    expect(await zip.file("mimetype")?.async("string")).toBe(
      "application/epub+zip"
    );
    expect(await zip.file("OEBPS/nav.xhtml")?.async("string")).toContain(
      "Capítulo 1"
    );
    expect(await zip.file("OEBPS/chapter-1.xhtml")?.async("string")).toContain(
      "Segundo parágrafo."
    );
    expect(book.chapters[0].content).toContain("Primeiro parágrafo.");
  });

  it("exports cover, toc controls and typography presets", async () => {
    const configured: ExportBook = {
      ...book,
      coverImageUrl: "https://example.com/cover.jpg",
      includeToc: true,
      typography: "fantasy",
    };
    const html = buildPrintHtml(configured);
    expect(html).toContain("https://example.com/cover.jpg");
    expect(html).toContain("Sumário");
    expect(html).toContain("Palatino");
    const withoutToc = buildPrintHtml({ ...configured, includeToc: false });
    expect(withoutToc).not.toContain('<nav class="toc"');
    const epub = await buildEpub(configured);
    const zip = await JSZip.loadAsync(await epub.arrayBuffer());
    expect(await zip.file("OEBPS/cover.xhtml")?.async("string")).toContain(
      "cover.jpg"
    );
  });

  it("preserves front matter and back matter in exported formats", async () => {
    const configured: ExportBook = {
      ...book,
      frontMatter: [
        { id: "dedication", title: "Dedicatória", content: "Para quem lê." },
      ],
      backMatter: [
        { id: "about", title: "Sobre a autora", content: "Notas finais." },
      ],
    };
    const html = buildPrintHtml(configured);
    expect(html).toContain("Dedicatória");
    expect(html).toContain("Sobre a autora");
    const docx = await buildDocx(configured);
    expect(docx.size).toBeGreaterThan(100);
    const epub = await buildEpub(configured);
    const zip = await JSZip.loadAsync(await epub.arrayBuffer());
    expect(await zip.file("OEBPS/cover.xhtml")?.async("string")).toContain(
      "Dedicatória"
    );
    expect(await zip.file("OEBPS/back-1.xhtml")?.async("string")).toContain(
      "Notas finais."
    );
    const opf = await zip.file("OEBPS/content.opf")!.async("string");
    expect(opf.indexOf('idref="back-1"')).toBeGreaterThan(
      opf.indexOf('idref="chapter-1"')
    );
    expect(await zip.file("OEBPS/nav.xhtml")!.async("string")).toContain(
      "Sobre a autora"
    );
  });

  it("applies layout settings to print HTML", () => {
    const html = buildPrintHtml({
      ...book,
      marginPreset: "wide",
      trimSize: "6x9",
      dropCap: true,
      headerText: "Cabeçalho QA",
      footerText: "Rodapé QA",
    });
    expect(html).toContain("margin:88px auto");
    expect(html).toContain("::first-letter");
    expect(html).toContain("Cabeçalho QA");
    expect(html).toContain("Rodapé QA");
    expect(html).toContain("widows:3");
  });

  it("preserves rich formatting in HTML, EPUB and DOCX with page dimensions", async () => {
    const rich = {
      ...book,
      trimSize: "a5" as const,
      chapters: [
        {
          ...book.chapters[0],
          richContent: "<p><strong>Forte</strong> e <em>suave</em></p>",
        },
      ],
    };
    expect(buildPrintHtml(rich)).toContain("<strong>Forte</strong>");
    const epub = await JSZip.loadAsync(
      await (await buildEpub(rich)).arrayBuffer()
    );
    expect(await epub.file("OEBPS/chapter-1.xhtml")!.async("string")).toContain(
      "<em>suave</em>"
    );
    const docx = await JSZip.loadAsync(
      await (await buildDocx(rich)).arrayBuffer()
    );
    const xml = await docx.file("word/document.xml")!.async("string");
    expect(xml).toContain("<w:b/>");
    expect(xml).toContain('w:w="8391"');
  });
  it("builds print HTML and DOCX bytes from nodes", async () => {
    const html = buildPrintHtml(book);
    const docx = await buildDocx(book);
    expect(html).toContain("Caderno de teste");
    expect(html).toContain("break-before:page");
    expect(docx.size).toBeGreaterThan(100);
    expect(
      chaptersFromNodes([
        { id: "p", title: "Parte", content: "", kind: "part" },
        { id: "c", title: "Capítulo", content: "texto", kind: "chapter" },
      ])
    ).toHaveLength(1);
  });
});
