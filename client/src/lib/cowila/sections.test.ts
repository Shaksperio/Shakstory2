import { describe, expect, it } from "vitest";
import { buildToc, detectSection, existingSection, focusedChapters, parseSection } from "./sections";

const book = { id: "b", title: "L", nodes: [
  { id: "p", title: "Parte I", kind: "part", content: "" },
  { id: "1", title: "A casa", kind: "chapter", content: "Gareth chegou à casa antes do anoitecer." },
  { id: "2", title: "A névoa", kind: "chapter", content: "A névoa subiu do rio." },
], publication: { backMatter: [{ id: "afterword", title: "Posfácio", content: "Texto antigo." }] } };

describe("sections", () => {
  it("detecta o pedido de cada seção", () => {
    expect(detectSection("Escreva o prólogo")).toMatchObject({ key: "prologue", area: "chapter", position: "start" });
    expect(detectSection("crie o epílogo")).toMatchObject({ key: "epilogue", position: "end" });
    expect(detectSection("Faça um prefácio")).toMatchObject({ area: "front", key: "preface" });
    expect(detectSection("redija o posfácio")).toMatchObject({ area: "back", key: "afterword" });
    expect(detectSection("Crie o sumário do livro")).toMatchObject({ area: "toc" });
    expect(detectSection("Crie um novo capítulo sobre a viagem")).toMatchObject({ key: "chapter", title: "Novo capítulo" });
  });
  it("não confunde com reescrita, personagens ou perguntas", () => {
    expect(detectSection("Reescreva este capítulo")).toBeNull();
    expect(detectSection("Crie os personagens do capítulo 1")).toBeNull();
    expect(detectSection("O que é um prólogo?")).toBeNull();
  });
  it("monta o sumário com partes e capítulos", () => {
    expect(buildToc(book.nodes)).toBe("PARTE I\n1. A casa\n2. A névoa");
  });
  it("interpreta a resposta da IA e rejeita conversa ou texto curto", () => {
    const t = { area: "chapter" as const, key: "chapter", title: "Novo capítulo" };
    const ok = parseSection("TÍTULO: A volta\n\n" + "palavra ".repeat(30), t);
    expect(ok?.title).toBe("A volta");
    expect(ok?.content.startsWith("palavra")).toBe(true);
    expect(parseSection("Claro! Aqui está " + "x ".repeat(40), t)).toBeNull();
    expect(parseSection("TÍTULO: X\n\ncurto", t)).toBeNull();
    expect(parseSection("TÍTULO: Outro\n\n" + "palavra ".repeat(30), { area: "front", key: "preface", title: "Prefácio" })?.title).toBe("Prefácio");
  });
  it("lê texto completo do capítulo citado e avisa de conteúdo existente", () => {
    expect(focusedChapters(book, "resuma o capítulo 2")).toContain("A névoa subiu do rio.");
    expect(focusedChapters(book, "fale da casa")).toBe("");
    expect(existingSection(book, { area: "back", key: "afterword", title: "Posfácio" })).toBe("Texto antigo.");
    expect(existingSection(book, { area: "chapter", key: "prologue", title: "Prólogo" })).toBeUndefined();
  });
});
