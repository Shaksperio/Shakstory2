import { describe, expect, it } from "vitest";
import { daysUntil, formatBRL, parseBRL } from "./billing";

describe("valores em reais", () => {
  it("converte texto digitado em centavos", () => {
    expect(parseBRL("349,49")).toBe(34949);
    expect(parseBRL("R$ 1.007,95")).toBe(100795);
    expect(parseBRL("653,4")).toBe(65340);
    expect(parseBRL("100")).toBe(10000);
  });
  it("recusa valores inválidos", () => {
    for (const text of ["", "abc", "0", "0,00", "-5", "1,234", "12,3,4"]) expect(parseBRL(text)).toBeNull();
  });
  it("formata em BRL", () => {
    expect(formatBRL(34949).replace(/\s/g, " ")).toBe("R$ 349,49");
  });
  it("conta dias até o vencimento", () => {
    const now = Date.parse("2026-10-19T12:00:00Z");
    expect(daysUntil("2026-10-20T12:00:00Z", now)).toBe(1);
    expect(daysUntil("2026-11-18T12:00:00Z", now)).toBe(30);
    expect(daysUntil(null, now)).toBeNull();
    expect(daysUntil("lixo", now)).toBeNull();
  });
});
