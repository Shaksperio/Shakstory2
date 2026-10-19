import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { CUSTOM_TRIM_LIMITS, TRIM_SIZES, buildDocx, buildEpub, buildPdf, buildPrintHtml, buildText, clampCustomTrim, trimDimensions, type ExportBook } from "./book-export";
import { buildProjectBackup, parseProjectBackup } from "./project-backup";

const book: ExportBook = {
  title: "Livro de teste",
  author: "Autora",
  includeToc: true,
  frontMatter: [],
  backMatter: [],
  chapters: [
    { id: "a", title: "A casa", content: "Um parágrafo com acentuação: ação, coração.\n\nOutro parágrafo." },
    { id: "b", title: "A noite", content: "Linha um.\n\nLinha dois." },
    { id: "c", title: "O fim", content: "Fim.", richContent: "<p>Fim <em>rico</em>.</p>" },
  ],
};

/** Lê o primeiro /MediaBox do PDF gerado: [largura, altura] em pontos. */
async function pdfPage(trim: Partial<ExportBook>): Promise<[number, number]> {
  const text = Buffer.from(await buildPdf({ ...book, ...trim }).arrayBuffer()).toString("latin1");
  const match = text.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/);
  expect(match).toBeTruthy();
  return [Number(match![3]) - Number(match![1]), Number(match![4]) - Number(match![2])];
}

describe("formatos de página", () => {
  it("A4, A5 e 6×9 mantêm exatamente as medidas de sempre", () => {
    expect(trimDimensions({ trimSize: "a4" })).toMatchObject({ widthTwips: 11906, heightTwips: 16838, css: "A4", pdfFormat: "a4" });
    expect(trimDimensions({ trimSize: "a5" })).toMatchObject({ widthTwips: 8391, heightTwips: 11906, css: "A5", pdfFormat: "a5" });
    expect(trimDimensions({ trimSize: "6x9" })).toMatchObject({ widthTwips: 8640, heightTwips: 12960, css: "6in 9in", pdfFormat: [432, 648] });
    expect(trimDimensions({}).id).toBe("a4");
    expect(trimDimensions({ trimSize: "desconhecido" }).id).toBe("a4");
  });

  it("novos formatos em polegadas", () => {
    expect(trimDimensions({ trimSize: "5x8" })).toMatchObject({ widthPt: 360, heightPt: 576, widthTwips: 7200, heightTwips: 11520, css: "5in 8in" });
    expect(trimDimensions({ trimSize: "5.25x8" })).toMatchObject({ widthPt: 378, heightPt: 576, widthTwips: 7560, heightTwips: 11520, css: "5.25in 8in" });
    expect(trimDimensions({ trimSize: "5.5x8.5" })).toMatchObject({ widthPt: 396, heightPt: 612, widthTwips: 7920, heightTwips: 12240, css: "5.5in 8.5in" });
  });

  it("formato personalizado em milímetros, limitado e com recuo seguro", () => {
    const dims = trimDimensions({ trimSize: "custom", customTrim: { widthMm: 140, heightMm: 210 } });
    expect(dims.id).toBe("custom");
    expect(dims.widthTwips).toBe(7937);
    expect(dims.heightTwips).toBe(11906);
    expect(dims.css).toBe("140mm 210mm");
    expect(Math.round(dims.widthPt * 100) / 100).toBe(396.85);
    expect(clampCustomTrim({ widthMm: 10, heightMm: 9999 })).toEqual({ widthMm: CUSTOM_TRIM_LIMITS.minWidthMm, heightMm: CUSTOM_TRIM_LIMITS.maxHeightMm });
    expect(clampCustomTrim({ widthMm: 152.46, heightMm: 229 })).toEqual({ widthMm: 152.5, heightMm: 229 });
    expect(trimDimensions({ trimSize: "custom" }).id).toBe("a4"); // sem medidas válidas: não quebra
    expect(trimDimensions({ trimSize: "custom", customTrim: { widthMm: Number.NaN, heightMm: 200 } }).id).toBe("a4");
  });

  it("o catálogo lista todos os formatos com rótulo", () => {
    expect(TRIM_SIZES.map(size => size.id)).toEqual(["a4", "a5", "6x9", "5x8", "5.25x8", "5.5x8.5", "custom"]);
    for (const size of TRIM_SIZES) expect(size.label.length).toBeGreaterThan(1);
  });
});

describe("o mesmo formato chega igual ao PDF, ao DOCX e à impressão", () => {
  const cases: Array<[string, Partial<ExportBook>, number, number]> = [
    ["5x8", { trimSize: "5x8" }, 360, 576],
    ["5.25x8", { trimSize: "5.25x8" }, 378, 576],
    ["5.5x8.5", { trimSize: "5.5x8.5" }, 396, 612],
    ["6x9", { trimSize: "6x9" }, 432, 648],
    ["custom 140x210", { trimSize: "custom", customTrim: { widthMm: 140, heightMm: 210 } }, 396.85, 595.28],
  ];
  for (const [name, trim, width, height] of cases) {
    it(name, async () => {
      const [pdfW, pdfH] = await pdfPage(trim);
      expect(Math.abs(pdfW - width)).toBeLessThan(0.5);
      expect(Math.abs(pdfH - height)).toBeLessThan(0.5);
      const dims = trimDimensions(trim);
      const xml = await (await JSZip.loadAsync(await (await buildDocx({ ...book, ...trim })).arrayBuffer())).file("word/document.xml")!.async("string");
      expect(xml).toContain(`w:w="${dims.widthTwips}"`);
      expect(xml).toContain(`w:h="${dims.heightTwips}"`);
      expect(buildPrintHtml({ ...book, ...trim })).toContain(`size:${dims.css};`);
      // DOCX e PDF descrevem a mesma página (twips = pontos × 20)
      expect(Math.abs(dims.widthTwips / 20 - pdfW)).toBeLessThan(1);
    });
  }

  it("qualquer formato preserva os mesmos capítulos, na mesma ordem, em todos os arquivos", async () => {
    for (const trimSize of ["a4", "a5", "6x9", "5x8", "5.25x8", "5.5x8.5", "custom"] as const) {
      const trimmed = { ...book, trimSize, customTrim: { widthMm: 150, heightMm: 220 } };
      const titles = book.chapters.map(chapter => chapter.title);
      const html = buildPrintHtml(trimmed);
      const docx = await (await JSZip.loadAsync(await (await buildDocx(trimmed)).arrayBuffer())).file("word/document.xml")!.async("string");
      const epub = await JSZip.loadAsync(await (await buildEpub(trimmed)).arrayBuffer());
      const epubText = (await Promise.all(Object.keys(epub.files).filter(name => /OEBPS\/chapter-\d+\.xhtml$/.test(name)).sort().map(name => epub.file(name)!.async("string")))).join("");
      const text = buildText(trimmed);
      for (const output of [html, docx, epubText, text]) {
        const positions = titles.map(title => output.indexOf(title));
        expect(positions.every(position => position >= 0)).toBe(true);
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
      }
      expect(html).toContain("coração");
      expect(text).toContain("coração");
    }
  });
});

describe("backup do projeto aceita os novos formatos", () => {
  const base = { id: "qa-trim", title: "Livro", status: "draft", targetWordCount: 500, updatedAt: 1, nodes: [{ id: "c1", kind: "chapter", title: "A", content: "Texto.", updatedAt: 1 }] };
  const withPublication = (extra: Record<string, unknown>) => ({ ...base, publication: { author: "A", genre: "g", language: "pt-BR", description: "d", ...extra } });
  it("preserva trimSize e customTrim e recusa valores fora dos limites", () => {
    const ok = withPublication({ trimSize: "custom", customTrim: { widthMm: 140, heightMm: 210 } });
    expect(parseProjectBackup(buildProjectBackup(ok), base.id)).toEqual(ok);
    const five = withPublication({ trimSize: "5.25x8" });
    expect(parseProjectBackup(buildProjectBackup(five), base.id)).toEqual(five);
    expect(() => parseProjectBackup(buildProjectBackup(withPublication({ trimSize: "custom", customTrim: { widthMm: 10, heightMm: 210 } })), base.id)).toThrow("Backup inválido");
    expect(() => parseProjectBackup(buildProjectBackup(withPublication({ trimSize: "7x10" })), base.id)).toThrow("Backup inválido");
  });
});
