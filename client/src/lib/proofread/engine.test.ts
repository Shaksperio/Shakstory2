import { describe, expect, it } from "vitest";
import { applyIssue, applyIssueToHtml, applyIssues, detectBookNames, proofread, styleMirror } from "./engine";

const rules = (text: string, o = {}) => proofread(text, o).map(i => i.rule);

describe("corretor local", () => {
  it("acha grafias inexistentes e preserva a caixa", () => {
    const [issue] = proofread("Voce nao sabe.", { mode: "preserve" });
    expect(issue.suggestion).toBe("Você");
    expect(proofread("Voce nao sabe.", { mode: "preserve" }).map(i => i.suggestion)).toEqual(["Você", "não"]);
  });
  it("modo preservar não aponta gramática", () => {
    expect(rules("Ele foi foi embora .", { mode: "preserve" })).toEqual([]);
  });
  it("palavra repetida, espaços e pontuação", () => {
    const r = rules("Ele foi foi embora . Disse oi,tudo bem  mesmo?");
    expect(r).toContain("repeticao");
    expect(r).toContain("espaco-antes");
    expect(r).toContain("espaco-depois");
    expect(r).toContain("espaco-duplo");
  });
  it("não confunde decimais, abreviações nem reticências", () => {
    expect(rules("Pesava 1,5 kg. O Sr. silva chegou... e foi.")).toEqual([]);
  });
  it("minúscula após ponto é risco médio; abreviação não conta", () => {
    const [i] = proofread("Ele saiu. depois voltou.");
    expect(i.rule).toBe("maiuscula");
    expect(i.risk).toBe("medium");
    expect(i.suggestion).toBe("D");
    expect(rules("Veja o cap. dois e etc. tal.")).toEqual([]);
  });
  it("travessão de diálogo", () => {
    const [i] = proofread("- Venha cá.\n-- Não.");
    expect(i.rule).toBe("travessao");
    expect(applyIssues("- Venha cá.\n-- Não.", proofread("- Venha cá.\n-- Não.")).text).toBe("— Venha cá.\n— Não.");
  });
  it("dicionário do livro impede falso positivo e detecta inconsistência de nome", () => {
    const text = "A casa de Gareth. ".repeat(1) + "Então Élia viu Élia. Lá, Élia sorriu e Elia fugiu com Gareth e Gareth.";
    expect(detectBookNames(text)).toContain("Élia");
    const nome = proofread(text, { mode: "preserve" }).filter(i => i.rule === "nome");
    expect(nome).toHaveLength(1);
    expect(nome[0].original).toBe("Elia");
    expect(nome[0].suggestion).toBe("Élia");
    expect(proofread("Nao, disse Nao. Nao Nao Nao.", { mode: "preserve", names: ["Nao"] })).toHaveLength(0);
  });
  it("'ignorar' respeita o autor", () => {
    expect(proofread("Voce chegou.", { ignored: ["voce"] })).toEqual([]);
  });
  it("aplica só se o texto na posição ainda confere", () => {
    const [i] = proofread("Voce chegou.");
    expect(applyIssue("Voce chegou.", i)).toBe("Você chegou.");
    expect(applyIssue("Tu chegou.", i)).toBeNull();
  });
  it("lote descarta sobreposição e não altera o resto", () => {
    const text = "Voce  nao veio .";
    const result = applyIssues(text, proofread(text).filter(i => i.risk === "low"));
    expect(result.text).toBe("Você não veio.");
  });
  it("espelho de estilo só pergunta, sem sugestão", () => {
    const long = Array(60).fill("palavra").join(" ") + ".";
    const found = styleMirror(long);
    expect(found.some(i => i.rule === "frase-longa")).toBe(true);
    expect(found.every(i => i.suggestion === undefined && i.kind === "style")).toBe(true);
    expect(styleMirror("A lua clara iluminava o corredor. A lua clara sumiu.").some(i => i.rule === "eco")).toBe(true);
    expect(rules("Voce chegou.", { style: false })).not.toContain("eco");
  });
  it("HTML: troca só quando o trecho é único e sem tocar na marcação", () => {
    const text = "Ela disse: Voce chegou.\nOutra linha.";
    const issue = proofread(text)[0];
    const html = "<p>Ela disse: <em>Voce</em> chegou.</p><p>Outra linha.</p>";
    expect(applyIssueToHtml(html, text, issue)).toBeNull();
    const html2 = "<p>Ela disse: Voce chegou.</p><p>Outra linha.</p>";
    expect(applyIssueToHtml(html2, text, issue)).toBe("<p>Ela disse: Você chegou.</p><p>Outra linha.</p>");
    expect(applyIssueToHtml(html2 + html2, text, issue)).toBeNull();
  });

  it("tipografia é opcional: reticências e aspas curvas viram sugestão com aceite", () => {
    const text = 'Ela disse "venha cá" e esperou... Depois "fechou a porta.';
    expect(proofread(text, { mode: "preserve" }).some(i => i.kind === "typography")).toBe(false);
    const found = proofread(text, { mode: "preserve", typography: true }).filter(i => i.kind === "typography");
    const dots = found.find(i => i.rule === "reticencias");
    expect(dots?.suggestion).toBe("…");
    expect(dots?.risk).toBe("low");
    // linha com número ímpar de aspas: não arrisca (aspas abertas)
    expect(found.some(i => i.rule === "aspas-curvas")).toBe(false);
    const paired = proofread('Ele disse "oi" e saiu.', { mode: "preserve", typography: true }).find(i => i.rule === "aspas-curvas");
    expect(paired?.suggestion).toBe("“oi”");
    expect(paired?.risk).toBe("medium");
    expect(applyIssue('Ele disse "oi" e saiu.', paired!)).toBe("Ele disse “oi” e saiu.");
    // quatro pontos não são reticências
    expect(proofread("Espera....", { typography: true }).some(i => i.rule === "reticencias")).toBe(false);
  });
});
