import { describe, expect, it, vi } from "vitest";
import { browserLanguage, clearTranslationCache, parseTranslation, splitForTranslation, translateChapter, translateText } from "./translate";

const reply = (text: string) => ({ ok: true, status: 200, json: async () => [[[text, "x"]], null, "pt"] });

describe("tradução", () => {
  it("junta os trechos devolvidos pelo Google e rejeita resposta inesperada", () => {
    expect(parseTranslation([[["Hello ", "Olá "], ["world.", "mundo."]], null, "pt"])).toBe("Hello world.");
    expect(() => parseTranslation({})).toThrow();
  });
  it("divide em blocos de parágrafos inteiros dentro do limite", () => {
    const text = ["a".repeat(800), "b".repeat(800), "c".repeat(800)].join("\n\n");
    const chunks = splitForTranslation(text, 1800);
    expect(chunks.length).toBe(2);
    expect(chunks.every(chunk => chunk.length <= 1800)).toBe(true);
    expect(splitForTranslation("x".repeat(4000), 1800).every(chunk => chunk.length <= 1800)).toBe(true);
    expect(splitForTranslation("  \n\n ")).toEqual([]);
  });
  it("modo automático segue o idioma do navegador; português fica no original", () => {
    expect(browserLanguage(["pt-BR", "en"])).toBe("original");
    expect(browserLanguage(["pt-PT"])).toBe("pt-PT");
    expect(browserLanguage(["en-GB"])).toBe("en");
    expect(browserLanguage(["zh-TW"])).toBe("zh-CN");
    expect(browserLanguage(["xx"])).toBe("original");
  });
  it("traduz com POST, usa cache e tenta de novo após falha", async () => {
    clearTranslationCache();
    const fetchFn = vi.fn().mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) }).mockResolvedValue(reply("Hello"));
    expect(await translateText("Olá", "en", { fetchFn })).toBe("Hello");
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const [url, init] = fetchFn.mock.calls[1];
    expect(url).toContain("translate.googleapis.com");
    expect(init.method).toBe("POST");
    expect(String(init.body)).toContain("tl=en");
    await translateText("Olá", "en", { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it("falha de vez depois das tentativas e respeita o cancelamento", async () => {
    clearTranslationCache();
    const bad = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    await expect(translateText("Texto", "fr", { fetchFn: bad, retries: 1 })).rejects.toThrow();
    const controller = new AbortController(); controller.abort();
    await expect(translateText("Outro", "fr", { fetchFn: bad, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
  it("traduz título e texto do capítulo, usando o HTML quando não há texto simples", async () => {
    clearTranslationCache();
    const fetchFn = vi.fn(async (_u: string, init?: RequestInit) => reply("T:" + new URLSearchParams(String(init?.body)).get("q")));
    const done = await translateChapter({ id: "1", title: "Um", kind: "chapter", content: "", richContent: "<p>Oi</p>" }, "es", { fetchFn });
    expect(done.title).toBe("T:Um");
    expect(done.content).toBe("T:Oi");
    expect(done.richContent).toBeUndefined();
    const part = await translateChapter({ id: "2", title: "Parte", kind: "part", content: "ignorado" }, "es", { fetchFn });
    expect(part.content).toBe("");
  });
});

import { checkTranslation, glossaryFromPlanning, protectTerms, translateExportBook } from "./translate";

describe("fidelidade", () => {
  it("protege nomes e restaura exatamente, sem tocar em palavras parecidas", () => {
    const { text, restore } = protectTerms("Élia viu Eliane. A Casa dos Ventos ficava longe; casa é casa.", ["Élia", "Casa dos Ventos"]);
    expect(text).not.toContain("Élia");
    expect(text).not.toContain("Casa dos Ventos");
    expect(text).toContain("Eliane");
    expect(restore(text)).toBe("Élia viu Eliane. A Casa dos Ventos ficava longe; casa é casa.");
  });
  it("não envia o termo protegido ao tradutor e o devolve no resultado", async () => {
    clearTranslationCache();
    const fetchFn = vi.fn(async (_u: string, init?: RequestInit) => reply(String(new URLSearchParams(String(init?.body)).get("q")).replace("Olhou", "Looked")));
    const out = await translateText("Olhou Élia.", "en", { fetchFn, terms: ["Élia"] });
    expect(out).toBe("Looked Élia.");
    expect(String(fetchFn.mock.calls[0][1]?.body)).not.toContain("lia");
  });
  it("avisa sobre parágrafos, números e termos que sumiram", () => {
    const source = "Um.\n\nDois em 1847.\n\nTrês.\n\nQuatro com Élia.";
    expect(checkTranslation(source, "One.\n\nTwo in 1847.\n\nThree.\n\nFour with Élia.", ["Élia"])).toEqual([]);
    const issues = checkTranslation(source, "One. Two in 1900. Three. Four with Ellie.", ["Élia"]).join(" ");
    expect(issues).toContain("parágrafos");
    expect(issues).toContain("1847");
    expect(issues).toContain("Élia");
    expect(checkTranslation("Algo", "")).toEqual(["A tradução veio vazia."]);
  });
  it("sugere o glossário a partir de personagens e lugares", () => {
    expect(glossaryFromPlanning({ characters: [{ name: "Élia" }, { name: "Élia" }], locations: [{ name: "Gareth" }] })).toEqual(["Élia", "Gareth"]);
    expect(glossaryFromPlanning(undefined)).toEqual([]);
  });
  it("traduz o livro de exportação inteiro e ajusta idioma e direitos autorais", async () => {
    clearTranslationCache();
    const fetchFn = vi.fn(async (_u: string, init?: RequestInit) => reply("EN:" + new URLSearchParams(String(init?.body)).get("q")));
    const out = await translateExportBook({ title: "A casa", subtitle: "Sub", chapters: [{ id: "1", title: "Um", content: "Oi." }], frontMatter: [{ id: "copyright", title: "Copyright", content: "Todos os direitos reservados.", enabled: true }] }, "en", { fetchFn });
    expect(out.title).toBe("EN:A casa");
    expect(out.chapters[0].content).toBe("EN:Oi.");
    expect(out.languageCode).toBe("en");
    expect(out.copyrightText).toBe("EN:Todos os direitos reservados.");
    await expect(translateExportBook({ title: "x", chapters: [] }, "xx", { fetchFn })).rejects.toThrow();
  });
});

import { createCowilaRefiner, estimateRefineCalls } from "./translate";

describe("revisão pelo Cowila", () => {
  const src = "Élia abriu a porta em 1847.\n\nA casa dormia.";
  const machine = "Élia opened the door in 1847.\n\nThe house slept.";
  it("aceita a revisão que passa nas verificações", async () => {
    const ask = vi.fn(async () => "Élia opened the door in 1847.\n\nThe house lay asleep.");
    const { refine, stats } = createCowilaRefiner(ask, { targetLabel: "English", terms: ["Élia"] });
    expect(await refine(src, machine)).toContain("lay asleep");
    expect(stats.refined).toBe(1);
    expect(String((ask.mock.calls[0] as unknown[])[0] && (ask.mock.calls[0] as unknown as [{ prompt: string }])[0].prompt)).toContain("Élia");
  });
  it("mantém o Google quando a resposta tem conversa, perde número ou muda parágrafos", async () => {
    for (const bad of ["Claro! Aqui está: Élia opened the door in 1847.\n\nThe house slept.", "Élia opened the door.\n\nThe house slept.", "Élia opened the door in 1847. The house slept."]) {
      const { refine, stats } = createCowilaRefiner(async () => bad, { targetLabel: "English", terms: ["Élia"] });
      expect(await refine(src, machine)).toBe(machine);
      expect(stats.kept).toBe(1);
    }
  });
  it("para depois de duas falhas seguidas e segue só com o Google", async () => {
    const ask = vi.fn(async () => { throw new Error("limite"); });
    const { refine, stats } = createCowilaRefiner(ask, { targetLabel: "English" });
    await refine(src, machine); await refine(src, machine);
    expect(await refine(src, machine)).toBe(machine);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(stats.stopped).toBe(true);
  });
  it("estima as chamadas e aplica a revisão dentro de translateText", async () => {
    expect(estimateRefineCalls(["a".repeat(9000), ""])).toBe(3);
    clearTranslationCache();
    const fetchFn = vi.fn(async () => reply("Machine text."));
    expect(await translateText("Texto.", "en", { fetchFn, refine: async (s, m) => m + " Refined." })).toBe("Machine text. Refined.");
  });
});
