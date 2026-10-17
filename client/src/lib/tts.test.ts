import { describe, expect, it } from "vitest";
import { buildQueue, chapterSpeech, cleanForSpeech, splitForSpeech, voicesForPortuguese } from "./tts";

describe("tts", () => {
  it("limpa marcações e transforma quebra de cena em pausa", () => {
    expect(cleanForSpeech("**Olá** _mundo_\n\n* * *\n\nOutra cena")).toBe("Olá mundo\n\nOutra cena");
  });
  it("divide em trechos curtos sem cortar no meio da frase", () => {
    const text = "Primeira frase curta. Segunda frase um pouco maior que a primeira. Terceira!";
    const parts = splitForSpeech(text, 45);
    expect(parts.every(part => part.length <= 45)).toBe(true);
    expect(parts.join(" ")).toBe(text);
    expect(splitForSpeech("palavra ".repeat(100), 60).every(part => part.length <= 60)).toBe(true);
  });
  it("fala o título e o texto; parte só fala o título; usa o HTML se não há texto", () => {
    expect(chapterSpeech({ id: "1", title: "Capítulo 1", content: "Texto." })).toBe("Capítulo 1.\n\nTexto.");
    expect(chapterSpeech({ id: "p", kind: "part", title: "Parte I", content: "ignorado" })).toBe("Parte I.");
    expect(chapterSpeech({ id: "2", title: "Dois", content: "", richContent: "<p>Olá&nbsp;<b>você</b></p>" })).toContain("Olá você");
  });
  it("monta a fila do capítulo atual ou do atual até o fim", () => {
    const chapters = [1, 2, 3].map(n => ({ id: String(n), title: `Cap ${n}`, content: `Texto ${n}.` }));
    expect(new Set(buildQueue(chapters, 1, "chapter").map(c => c.chapter))).toEqual(new Set([1]));
    expect([...new Set(buildQueue(chapters, 1, "book").map(c => c.chapter))]).toEqual([1, 2]);
  });
  it("prefere vozes em português do Brasil", () => {
    const voices = [{ lang: "en-US", name: "Sam" }, { lang: "pt-PT", name: "Joana" }, { lang: "pt-BR", name: "Luciana" }];
    expect(voicesForPortuguese(voices).map(v => v.name)).toEqual(["Luciana", "Joana"]);
    expect(voicesForPortuguese([{ lang: "en-US", name: "Sam" }]).length).toBe(1);
  });
});
