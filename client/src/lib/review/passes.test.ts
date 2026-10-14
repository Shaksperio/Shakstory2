import { describe, expect, it } from "vitest";
import { reviewBook, styleSheet, type ReviewChapter } from "./passes";

const long = (n: number) => Array.from({ length: n }, (_, i) => `palavra${i % 7}`).join(" ");
const chapters = (): ReviewChapter[] => [
  { id: "c1", title: "Um", text: `Élia caminhou pela estrada de Gareth. Então Élia parou. ${long(300)}.` },
  { id: "c2", title: "Dois", text: `Depois Elia voltou para Gareth e viu Gareth. ${long(300)}.` },
  { id: "c3", title: "Três", text: `Gareth dormiu. Ela disse "oi e saiu. ${long(280)}.` },
  { id: "c4", title: "Quatro", text: "Curto." },
  { id: "c5", title: "", text: "" },
];

describe("passagens de revisão", () => {
  const result = reviewBook(chapters());
  const kinds = (pass: string) => result.findings.filter(f => f.pass === pass);

  it("aponta estrutura: capítulo vazio, sem título e muito curto", () => {
    const messages = kinds("estrutura").map(f => f.message).join(" | ");
    expect(messages).toMatch(/sem texto/);
    expect(messages).toMatch(/sem título/);
    expect(messages).toMatch(/mais curto/);
  });

  it("aponta continuidade: grafias quase iguais (Élia/Elia)", () => {
    expect(kinds("continuidade").some(f => /Élia|Elia/.test(f.message) && /quase iguais/.test(f.message))).toBe(true);
  });

  it("aponta leitura: aspas abertas, e ritmo: parágrafo gigante", () => {
    expect(kinds("leitura").some(f => /aspas/.test(f.message) && f.chapterId === "c3")).toBe(true);
    const big = reviewBook([{ id: "x", title: "X", text: long(300) }]);
    expect(big.findings.some(f => f.pass === "ritmo" && /sem respiro/.test(f.message))).toBe(true);
  });

  it("calcula páginas e tempo de leitura sem inventar números", () => {
    expect(result.stats.chapters).toBe(5);
    expect(result.stats.pagesMin).toBe(Math.ceil(result.stats.words / 300));
    expect(result.stats.pagesMax).toBe(Math.ceil(result.stats.words / 250));
  });

  it("os achados têm identificador estável e nada altera o texto", () => {
    const again = reviewBook(chapters());
    expect(again.findings.map(f => f.id)).toEqual(result.findings.map(f => f.id));
  });
});

describe("ficha de estilo gerada", () => {
  it("infere convenção de diálogo e pessoa narrativa com evidência", () => {
    const dash = styleSheet([{ id: "a", title: "A", text: "— Venha cá.\n— Já vou.\n— Rápido.\nEle olhou para ela e ela sorriu. Ele disse que sim. Ela foi com ele. Ele quis ficar, ela quis ir. Eles saíram. Ela voltou, ele também." }]);
    expect(dash.dialogue.convention).toBe("travessão");
    expect(dash.dialogue.evidence).toMatch(/Venha/);
    expect(dash.pov.kind).toBe("terceira pessoa");
    const first = styleSheet([{ id: "a", title: "A", text: 'Eu fui até a porta. Meu coração batia e eu esperei. Minha mão tremia, eu respirei. Eu abri. Meu medo passou, eu entrei. "Olá", disse. "Oi", disse. "Entre", disse.' }]);
    expect(first.pov.kind).toBe("primeira pessoa");
    expect(first.dialogue.convention).toBe("aspas");
  });

  it("separa personagens e lugares com contagem e trecho", () => {
    const text = "Élia entrou em Nightglen. Depois Élia saiu de Nightglen. Gareth seguiu Élia até Nightglen, e Gareth sorriu. Élia voltou para Nightglen.";
    const sheet = styleSheet([{ id: "a", title: "A", text }]);
    expect(sheet.places.map(p => p.name)).toContain("Nightglen");
    expect(sheet.characters.map(c => c.name)).toContain("Élia");
    expect(sheet.characters.map(c => c.name)).not.toContain("Nightglen");
    expect(sheet.places[0].evidence).toMatch(/Nightglen/);
  });
});
