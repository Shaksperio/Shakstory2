import { describe, expect, it } from "vitest";
import { BOOK_MODELS, pageEstimate, pageReport } from "./bookModels";

describe("bookModels", () => {
  it("modelos usam só valores aceitos pela publicação", () => {
    for (const model of BOOK_MODELS) {
      expect(["a5", "6x9", "a4"]).toContain(model.patch.trimSize);
      expect(["narrow", "normal", "wide"]).toContain(model.patch.marginPreset);
    }
    expect(new Set(BOOK_MODELS.map(m => m.id)).size).toBe(3);
  });
  it("estima páginas entre 300 e 250 palavras por página", () => {
    expect(pageEstimate(60000)).toEqual({ min: 200, max: 240 });
    expect(pageEstimate(50)).toBeNull();
    expect(pageReport(60000)).toContain("200 a 240 páginas");
    expect(pageReport(10)).toContain("Escreva um pouco mais");
  });
});
