import { describe, expect, it } from "vitest";
import { checkArithmetic, feedbackFor, formatNumber, localArithmetic, parseNumber, unknownNames, verifyAnswer } from "./mcr";

describe("Cerebelo (aritmética exata)", () => {
  it("responde conta pura sem IA, no formato brasileiro", () => {
    expect(localArithmetic("Quanto é 17*23?")).toBe("17 × 23 = 391");
    expect(localArithmetic("1.234,50 / 3")).toBe("1.234,50 / 3 = 411,5");
    expect(localArithmetic("quanto é 5/0?")).toBe("Divisão por zero não existe.");
    expect(localArithmetic("Qual a capital da França?")).toBeNull();
  });
  it("confirma e refuta contas na resposta", () => {
    expect(checkArithmetic("17 × 23 = 391")[0].status).toBe("verified");
    const bad = checkArithmetic("17 × 23 = 392")[0];
    expect(bad).toMatchObject({ status: "refuted", expected: "391", found: "392" });
    expect(checkArithmetic("20% de 150 é 30")[0].status).toBe("verified");
    expect(checkArithmetic("20% de 150 é 31")[0].status).toBe("refuted");
  });
  it("divisão aceita o arredondamento da própria precisão", () => {
    expect(checkArithmetic("10 / 3 = 3,33")[0].status).toBe("verified");
    expect(checkArithmetic("10 / 3 = 3,34")[0].status).toBe("refuted");
  });
  it("número ambíguo (3.141) nunca é refutado", () => {
    expect(parseNumber("3.141")).toBe("ambiguous");
    expect(checkArithmetic("3.141 + 1 = 3.142")[0].status).toBe("unverifiable");
    expect(parseNumber("1.234.567")).not.toBe("ambiguous");
  });
  it("0,1 + 0,2 = 0,3 exato (sem erro de ponto flutuante)", () => {
    expect(checkArithmetic("0,1 + 0,2 = 0,3")[0].status).toBe("verified");
    expect(formatNumber({ n: 1n, d: 3n })).toBe("0,333333");
  });
  it("sem nada checável, o status é 'sem-checagem' (ausência de refutação não é confirmação)", () => {
    expect(verifyAnswer("oi", "Olá, tudo bem?", [], "").status).toBe("sem-checagem");
    expect(verifyAnswer("q", "2 + 2 = 5", [], "").status).toBe("refutado");
    expect(feedbackFor(verifyAnswer("q", "2 + 2 = 5", [], ""))).toContain("o valor exato é 4");
  });
});

describe("Cortex (fatos do livro)", () => {
  it("aponta nomes citados que não existem no livro, só quando a pergunta é sobre o livro", () => {
    expect(unknownNames("Quem é o vilão do meu livro?", "O vilão é Gareth, aliado de Drácula.", ["Gareth", "Élia"], "Livro")).toEqual(["Drácula"]);
    expect(unknownNames("Qual a capital da França?", "Paris, onde viveu Napoleão.", [], "")).toEqual([]);
  });
});
