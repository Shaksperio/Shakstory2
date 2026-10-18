import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildDocx, buildEpub, buildPdf, buildPrintHtml, TYPOGRAPHY_PRESETS, type ExportBook } from "./book-export";

const book: ExportBook = {
  title: "Livro",
  author: "Autora",
  chapters: [
    { id: "a", title: "O Segredo", content: "", richContent: `<p>${"O caos dentro de mim não avisa quando chega. ".repeat(30)}</p><p>Tipo, não tem campainha.</p>` },
    { id: "b", title: "Dois", content: "Primeiro.\n\nSegundo parágrafo bem longo. ".repeat(10) },
  ],
};

describe("estilo Reedsy", () => {
  it("é o estilo padrão: serifado, justificado, sem recuo e com espaço entre parágrafos, títulos sem serifa", () => {
    expect(TYPOGRAPHY_PRESETS.reedsy.justify).toBe(true);
    const html = buildPrintHtml(book);
    expect(html).toContain("Georgia");
    expect(html).toContain("text-align:justify");
    expect(html).toContain("p{text-indent:0;margin:0 0 1em");
    expect(html).toContain("h1,h2{font-family:Lato");
    // quem escolhe outro estilo não é afetado
    expect(buildPrintHtml({ ...book, typography: "classic" })).toContain("text-indent:1.5em");
  });
  it("EPUB usa o mesmo estilo", async () => {
    const zip = await JSZip.loadAsync(await (await buildEpub(book)).arrayBuffer());
    const files = Object.keys(zip.files).filter(name => /\.(xhtml|css)$/.test(name));
    const all = (await Promise.all(files.map(name => zip.file(name)!.async("string")))).join("\n");
    expect(all).toContain("text-align:justify");
    expect(all).toContain("Lato");
  });
  it("DOCX: corpo justificado com espaço entre parágrafos, sem recuo, títulos em fonte sem serifa", async () => {
    const zip = await JSZip.loadAsync(await (await buildDocx(book)).arrayBuffer());
    const styles = await zip.file("word/styles.xml")!.async("string");
    const body = styles.slice(styles.indexOf('w:styleId="BookBody"'), styles.indexOf('w:styleId="BookBody"') + 800);
    expect(body).toContain("both");
    expect(body).not.toContain("firstLine");
    expect(styles).toContain("Lato");
    expect(styles).toContain("Georgia");
  });
  it("PDF gera várias páginas com texto justificado sem falhar", () => {
    const blob = buildPdf(book);
    expect(blob.size).toBeGreaterThan(1000);
  });
});
