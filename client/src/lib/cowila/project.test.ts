import { describe, expect, it } from "vitest";
import {
  assessLevel, buildProjectDigest, candidateCharacters, chunkParagraphs, detectIntent, localCharacters,
  mergeCharacters, parseAlternatives, parseCharacters, rewriteIsSafe, type CBook,
} from "./project";

const text =
  "A noite caiu sobre Gareth. Então Élia abriu a janela e viu Gareth no jardim.\n\nLá fora, Élia chamou Gareth baixinho. Depois Élia sorriu para Marta, e Marta respondeu em voz baixa. Ao fundo, Marta rezava.";
const book = (extra: Partial<CBook> = {}): CBook => ({
  id: "b1", title: "Livro", nodes: [{ id: "n1", title: "Capítulo 1", kind: "chapter", content: text }], ...extra,
});

describe("Cowila: projeto e personagens", () => {
  it("acha nomes recorrentes com evidência e ignora os já cadastrados", () => {
    const names = candidateCharacters(book()).map(c => c.name);
    expect(names).toEqual(expect.arrayContaining(["Élia", "Gareth", "Marta"]));
    const known = candidateCharacters(book({ planning: { characters: [{ id: "c", name: "Elia", role: "", notes: "" }] } })).map(c => c.name);
    expect(known).not.toContain("Élia");
  });
  it("só aceita da IA nomes que eram candidatos (sem invenção)", () => {
    const candidates = candidateCharacters(book());
    const raw = 'Claro! {"characters":[{"name":"élia","role":"protagonista","notes":"Abre a janela."},{"name":"Drácula","role":"vilão","notes":"inventado"}]} fim';
    const parsed = parseCharacters(raw, candidates);
    expect(parsed).toEqual([{ name: "Élia", role: "protagonista", notes: "Abre a janela." }]);
    expect(parseCharacters("sem json", candidates)).toEqual([]);
  });
  it("mescla sem sobrescrever o que o autor preencheu", () => {
    const existing = [{ id: "1", name: "Élia", role: "Minha heroína", notes: "" }];
    const result = mergeCharacters(existing, [
      { name: "Elia", role: "outra", notes: "Nota nova." },
      { name: "Marta", role: "amiga", notes: "Reza." },
    ], () => "novo");
    expect(result.characters[0]).toMatchObject({ role: "Minha heroína", notes: "Nota nova." });
    expect(result.characters).toHaveLength(2);
    expect(result).toMatchObject({ added: 1, updated: 1 });
    expect(existing[0].notes).toBe("");
  });
  it("sem IA, cadastra nome + evidência marcada para confirmar", () => {
    const [first] = localCharacters(candidateCharacters(book()));
    expect(first.notes).toContain("A confirmar");
  });
  it("nível: iniciante com pouco texto, experiente com muito texto planejado", () => {
    expect(assessLevel([book()])).toBe("iniciante");
    const big = book({ nodes: [{ id: "n", title: "c", kind: "chapter", content: "palavra ".repeat(6000) }], publication: { description: "x" } });
    expect(assessLevel([big])).toBe("experiente");
  });
  it("resumo do projeto respeita o limite e marca o capítulo aberto", () => {
    const d = buildProjectDigest([book()], book(), "n1", "trecho final aberto", 800);
    expect(d.length).toBeLessThanOrEqual(800);
    expect(d).toContain("LIVRO ATIVO");
    expect(buildProjectDigest([book()], book(), "n1", "", 11500)).toContain("[CAPÍTULO ABERTO]");
  });
  it("entende o pedido do usuário", () => {
    expect(detectIntent("Preencher personagens automaticamente")).toBe("characters");
    expect(detectIntent("como uso o Shakstory?")).toBe("guide");
    expect(detectIntent("Sugira a sinopse do livro")).toBe("synopsis");
    expect(detectIntent("Reescreva este capítulo")).toBe("rewrite");
    expect(detectIntent("Entenda e resuma meu projeto")).toBe("summary");
    expect(detectIntent("o Gareth é um bom vilão?")).toBe("chat");
  });
  it("reescrita só é segura se mantiver tamanho e nomes", () => {
    const original = "Élia abriu a janela e viu Gareth no jardim, ao anoitecer.";
    expect(rewriteIsSafe(original, "Élia abriu a janela e avistou Gareth no jardim ao anoitecer.")).toBe(true);
    expect(rewriteIsSafe(original, "Ela abriu a janela e viu o homem no jardim, ao anoitecer.")).toBe(false);
    expect(rewriteIsSafe(original, "Élia.")).toBe(false);
  });
  it("divide em blocos sem perder texto", () => {
    const long = Array(40).fill("Uma frase razoavelmente longa para o teste de blocos.").join(" ") + "\nSegundo parágrafo.";
    const chunks = chunkParagraphs(long, 500);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every(c => c.length <= 600)).toBe(true);
    expect(chunks.join("").replace(/\s+/g, "")).toBe(long.replace(/\s+/g, ""));
  });
});

import { cleanSynopsis } from "./project";
describe("sinopse limpa", () => {
  const body = Array(60).fill("palavra").join(" ") + ".";
  it("aceita só o texto da sinopse", () => {
    expect(cleanSynopsis(`Sinopse: "${body}"`)).toBe(body);
  });
  it("descarta resposta de conversa (saudação, pergunta, explicação)", () => {
    expect(cleanSynopsis("Olá! Sou a Cowila, assistente literária do Shakstory. " + body)).toBeNull();
    expect(cleanSynopsis(body + " O que você acha?")).toBeNull();
    expect(cleanSynopsis("Uma sinopse é uma breve descrição. " + body)).toBeNull();
    expect(cleanSynopsis("Curto demais.")).toBeNull();
  });
});

import { cowilaSystemNote, parseVerification } from "./project";
describe("modo livre e verificação", () => {
  it("modo livre não restringe a pergunta ao Shakstory nem ao livro", () => {
    const livre = cowilaSystemNote("experiente", "livre");
    expect(livre).toContain("QUALQUER pergunta");
    expect(livre).not.toContain("SOMENTE");
    expect(cowilaSystemNote("iniciante", "projeto")).toContain("SOMENTE");
  });
  it("só aceita correção explícita", () => {
    expect(parseVerification("OK")).toBeNull();
    expect(parseVerification("Parece boa.")).toBeNull();
    expect(parseVerification("CORREÇÃO: A resposta correta e completa é esta aqui.")).toBe("A resposta correta e completa é esta aqui.");
  });
});

describe("parseAlternatives", () => {
  const original = "Gareth abriu a janela e viu Marta no jardim, sob a chuva fina.";
  it("lê o JSON e descarta versões que mudam nomes ou repetem o original", () => {
    const raw = JSON.stringify({ alternativas: [
      "Gareth abriu a janela e avistou Marta no jardim, sob a chuva fina.",
      original,
      "Pedro abriu a janela e viu Ana no jardim, sob a chuva fina.",
      "Gareth escancarou a janela e viu Marta lá embaixo, no jardim, sob a chuva fina.",
    ] });
    const out = parseAlternatives(raw, original);
    expect(out).toContain("Gareth abriu a janela e avistou Marta no jardim, sob a chuva fina.");
    expect(out).not.toContain(original);
    expect(out.some(item => item.includes("Pedro"))).toBe(false);
  });
  it("aceita lista numerada como plano B e devolve vazio para lixo", () => {
    const raw = "Aqui estão:\n1. Gareth abriu a janela e avistou Marta no jardim, sob a chuva fina.\n2. Gareth abriu a janela e notou Marta no jardim, sob a chuva fina.";
    expect(parseAlternatives(raw, original)).toHaveLength(2);
    expect(parseAlternatives("não sei", original)).toEqual([]);
  });
});
