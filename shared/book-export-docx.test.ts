import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildDocx, type ExportBook } from "./book-export";

const book: ExportBook = {
  title: "Livro",
  author: "Autora",
  includeToc: true,
  frontMatter: [{ id: "preface", title: "Prefácio", content: "Texto do prefácio.", enabled: true }],
  backMatter: [{ id: "afterword", title: "Posfácio", content: "Fim.", enabled: true }],
  chapters: [
    { id: "a", title: "A casa", content: "Um.\n\nDois." },
    { id: "b", title: "A noite", content: "Linha um\nLinha dois\nLinha três" },
    { id: "c", title: "O fim", content: "", richContent: "<p>Texto <em>rico</em>.</p><p>Outro.</p>" },
  ],
};

describe("exportação DOCX organizada", () => {
  it("cada capítulo começa numa nova página (seção própria) e o texto tem tamanho de livro", async () => {
    const zip = await JSZip.loadAsync(await (await buildDocx(book)).arrayBuffer());
    const xml = await zip.file("word/document.xml")!.async("string");
    // título + copyright + prefácio + sumário + 3 capítulos + posfácio = 8 seções
    expect((xml.match(/<w:sectPr/g) ?? []).length).toBe(8);
    expect((xml.match(/w:type w:val="nextPage"/g) ?? []).length).toBe(7);
    const order = ["A casa", "A noite", "O fim", "Posfácio"].map(title => xml.indexOf(title));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // parágrafos do corpo usam o estilo próprio e quebras simples viram parágrafos
    expect((xml.match(/w:pStyle w:val="BookBody"/g) ?? []).length).toBeGreaterThanOrEqual(10);
    const styles = await zip.file("word/styles.xml")!.async("string");
    const sizes = [...styles.matchAll(/<w:sz w:val="(\d+)"/g)].map(match => Number(match[1]));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(20);
    expect(styles).toContain('w:styleId="BookBody"');
    const body = styles.slice(styles.indexOf('w:styleId="BookBody"'));
    expect(body).toMatch(/w:jc w:val="both"/);
    // tamanho de corpo ≤ 13pt (26 meios-pontos), não 18pt+
    expect(Number(/<w:docDefaults>[\s\S]*?<w:sz w:val="(\d+)"/.exec(styles)?.[1])).toBeLessThanOrEqual(26);
  });
});
