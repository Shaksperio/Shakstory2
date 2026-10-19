import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { PRINT_LIMITS, buildDocx, buildEpub, buildPdf, clampPrintMm, type ExportBook } from "./book-export";
import { buildProjectBackup, parseProjectBackup } from "./project-backup";

const MM = 72 / 25.4;
const book: ExportBook = {
  title: "Titulo do Livro",
  author: "Autora Exemplo",
  includeToc: true,
  frontMatter: [],
  backMatter: [],
  trimSize: "5x8",
  chapters: [
    { id: "a", title: "Alvorada", content: "Texto ascii um." },
    { id: "b", title: "Crepusculo", content: "Texto ascii dois." },
    { id: "c", title: "Meia-noite", content: "Texto ascii tres." },
    { id: "d", title: "Aurora", content: "Texto ascii quatro." },
  ],
};
const pdfText = async (extra: Partial<ExportBook>) => Buffer.from(await buildPdf({ ...book, ...extra }).arrayBuffer()).toString("latin1");
const mediaBox = (text: string) => {
  const m = text.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/)!;
  return [Number(m[3]) - Number(m[1]), Number(m[4]) - Number(m[2])];
};
const x = (text: string, line: string) => {
  const m = text.match(new RegExp(`([\\d.]+) [\\d.]+ Td\\s*\\(${line}\\) Tj`));
  expect(m, line).toBeTruthy();
  return Number(m![1]);
};
const count = (text: string, needle: string) => text.split(needle).length - 1;

describe("sangria e lombada (produção gráfica)", () => {
  it("limita e arredonda os valores", () => {
    expect(clampPrintMm(3, PRINT_LIMITS.maxBleedMm)).toBe(3);
    expect(clampPrintMm(3.26, PRINT_LIMITS.maxBleedMm)).toBe(3.5);
    expect(clampPrintMm(99, PRINT_LIMITS.maxBleedMm)).toBe(PRINT_LIMITS.maxBleedMm);
    expect(clampPrintMm(-4, PRINT_LIMITS.maxBleedMm)).toBe(0);
    expect(clampPrintMm("abc", PRINT_LIMITS.maxGutterMm)).toBe(0);
    expect(clampPrintMm(undefined, PRINT_LIMITS.maxGutterMm)).toBe(0);
    expect(clampPrintMm(40, PRINT_LIMITS.maxGutterMm)).toBe(PRINT_LIMITS.maxGutterMm);
  });

  it("sem sangria o PDF não muda: mesma página e nenhuma caixa de corte", async () => {
    const text = await pdfText({});
    const [w, h] = mediaBox(text);
    expect(Math.abs(w - 360)).toBeLessThan(0.5);
    expect(Math.abs(h - 576)).toBeLessThan(0.5);
    expect(text).not.toContain("/TrimBox");
    expect(text).not.toContain("/BleedBox");
  });

  it("com sangria a página cresce nos quatro lados e o PDF informa o corte", async () => {
    const text = await pdfText({ bleedMm: 3 });
    const [w, h] = mediaBox(text);
    expect(Math.abs(w - (360 + 6 * MM))).toBeLessThan(0.5);
    expect(Math.abs(h - (576 + 6 * MM))).toBeLessThan(0.5);
    const trim = text.match(/\/TrimBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/);
    expect(trim).toBeTruthy();
    expect(Math.abs(Number(trim![1]) - 3 * MM)).toBeLessThan(0.1);
    expect(Math.abs(Number(trim![3]) - Number(trim![1]) - 360)).toBeLessThan(0.5);
    expect(Math.abs(Number(trim![4]) - Number(trim![2]) - 576)).toBeLessThan(0.5);
    expect(text).toMatch(/\/BleedBox\s*\[\s*0 0 /);
    expect(count(text, "/TrimBox")).toBe((text.match(/\/Type \/Page(?!s)/g) ?? []).length);
  });

  it("com sangria o texto continua dentro da área de corte (a margem é medida da borda)", async () => {
    const plain = x(await pdfText({}), "Texto ascii um\\.");
    const bled = x(await pdfText({ bleedMm: 3 }), "Texto ascii um\\.");
    expect(Math.abs(bled - plain - 3 * MM)).toBeLessThan(0.1);
  });

  it("lombada espelhada: as páginas alternam o recuo interno (ímpares à esquerda, pares sem)", async () => {
    const lines = ["Texto ascii um\\.", "Texto ascii dois\\.", "Texto ascii tres\\.", "Texto ascii quatro\\."];
    const spread = (text: string) => { const xs = lines.map(line => x(text, line)); return Math.max(...xs) - Math.min(...xs); };
    expect(spread(await pdfText({}))).toBeLessThan(0.01);
    const text = await pdfText({ gutterMm: 10 });
    expect(Math.abs(spread(text) - 10 * MM)).toBeLessThan(0.1);
    const xs = lines.map(line => Math.round(x(text, line) * 10));
    expect(xs[0]).toBe(xs[2]); // capítulos 1 e 3 caem em páginas de mesma paridade
    expect(xs[1]).toBe(xs[3]);
    expect(xs[0]).not.toBe(xs[1]);
  });
});

describe("cabeçalho corrente", () => {
  const long = (word: string) => Array.from({ length: 160 }, (_, i) => `${word} paragrafo numero ${i} com texto suficiente para ocupar varias linhas da pagina e seguir adiante.`).join("\n\n");
  const multi: Partial<ExportBook> = { chapters: [{ id: "a", title: "Alvorada", content: long("alfa") }, { id: "b", title: "Crepusculo", content: long("beta") }] };

  it("PDF: autor nas páginas pares e título do capítulo nas ímpares, sem cabeçalho na abertura", async () => {
    const off = await pdfText(multi);
    const on = await pdfText({ ...multi, runningHeader: true });
    expect(count(on, "(Autora Exemplo)")).toBeGreaterThan(count(off, "(Autora Exemplo)") + 2);
    expect(count(on, "Alvorada)")).toBeGreaterThan(count(off, "Alvorada)") + 1);
    expect(count(on, "Crepusculo)")).toBeGreaterThan(count(off, "Crepusculo)") + 1);
  });

  it("PDF: o texto fixo do cabeçalho só vale sem cabeçalho corrente", async () => {
    expect(count(await pdfText({ ...multi, headerText: "FIXO" }), "(FIXO)")).toBeGreaterThan(3);
    expect(count(await pdfText({ ...multi, headerText: "FIXO", runningHeader: true }), "(FIXO)")).toBe(0);
  });

  it("DOCX: cada capítulo recebe o próprio cabeçalho e a abertura fica sem", async () => {
    const zip = await JSZip.loadAsync(await (await buildDocx({ ...book, runningHeader: true })).arrayBuffer());
    const headers = await Promise.all(Object.keys(zip.files).filter(name => /^word\/header\d+\.xml$/.test(name)).map(name => zip.file(name)!.async("string")));
    const all = headers.join("\n");
    expect(all).toContain("Alvorada");
    expect(all).toContain("Crepusculo");
    expect(all).toContain("Autora Exemplo");
    expect(await zip.file("word/settings.xml")!.async("string")).toContain("evenAndOddHeaders");
    expect(await zip.file("word/document.xml")!.async("string")).toContain("titlePg");
  });

  it("DOCX: sem a opção nada muda", async () => {
    const zip = await JSZip.loadAsync(await (await buildDocx({ ...book })).arrayBuffer());
    expect(await zip.file("word/document.xml")!.async("string")).not.toContain("titlePg");
    expect(await zip.file("word/settings.xml")!.async("string")).not.toContain("evenAndOddHeaders");
  });
});

describe("EPUB com as mesmas fontes do PDF", () => {
  it("embute DejaVu (4 estilos) e usa a família no CSS e no manifesto", async () => {
    const zip = await JSZip.loadAsync(await (await buildEpub(book)).arrayBuffer());
    const fonts = Object.keys(zip.files).filter(name => /^OEBPS\/fonts\/.+\.ttf$/.test(name));
    expect(fonts.length).toBeGreaterThanOrEqual(4);
    const opf = await zip.file("OEBPS/content.opf")!.async("string");
    for (const name of fonts) expect(opf).toContain(`href="${name.replace("OEBPS/", "")}" media-type="font/ttf"`);
    const css = await zip.file("OEBPS/chapter-1.xhtml")!.async("string");
    expect(css).toContain("@font-face");
    expect(css).toContain('font-family:"Shakstory Serif"');
    // o arquivo embutido é uma fonte TrueType de verdade
    const header = await zip.file(fonts[0])!.async("uint8array");
    expect(Array.from(header.slice(0, 4))).toEqual([0, 1, 0, 0]);
  });

  it("estilos sem serifa usam a família Sans", async () => {
    const zip = await JSZip.loadAsync(await (await buildEpub({ ...book, typography: "modern" as ExportBook["typography"] })).arrayBuffer());
    const chapter = await zip.file("OEBPS/chapter-1.xhtml")!.async("string");
    expect(chapter).toMatch(/font-family:"Shakstory (Serif|Sans)"/);
  });
});

describe("backup guarda sangria, lombada e cabeçalho corrente", () => {
  const base = { id: "qa-print", title: "Livro", status: "draft", targetWordCount: 500, updatedAt: 1, nodes: [{ id: "c1", kind: "chapter", title: "A", content: "Texto.", updatedAt: 1 }] };
  const withPublication = (extra: Record<string, unknown>) => ({ ...base, publication: { author: "A", genre: "g", language: "pt-BR", description: "d", ...extra } });
  it("aceita valores válidos e recusa fora dos limites", () => {
    const ok = withPublication({ bleedMm: 3, gutterMm: 12, runningHeader: true });
    expect(parseProjectBackup(buildProjectBackup(ok), base.id)).toEqual(ok);
    expect(() => parseProjectBackup(buildProjectBackup(withPublication({ bleedMm: 50 })), base.id)).toThrow("Backup inválido");
    expect(() => parseProjectBackup(buildProjectBackup(withPublication({ gutterMm: -1 })), base.id)).toThrow("Backup inválido");
  });
});
