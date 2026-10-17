import { describe, expect, it, vi } from "vitest";
import { browserLanguage, clearTranslationCache, parseTranslation, splitForTranslation, translateChapter, translateText } from "./translate";

const reply = (text: string) => ({ ok: true, status: 200, json: async () => [[[text, "x"]], null, "pt"] });

describe("tradução", () => {
  it("junta os trechos devolvidos pelo Google e rejeita resposta inesperada", () => {
    expect(parseTranslation([[["Hello ", "Olá "], ["world.", "mundo."]], null, "pt"])).toBe("Hello world.");
    expect(() => parseTranslation({})).toThrow();
  });
  it("divide em blocos de parágrafos inteiros dentro do limite", () => {
    const text = ["a".repeat(900), "b".repeat(900), "c".repeat(900)].join("\n\n");
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
