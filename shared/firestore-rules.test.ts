import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Não executa as regras (isso exige o emulador do Firebase): só impede que as garantias do catálogo público sumam sem querer.
const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const catalog = rules.slice(rules.indexOf("match /publicCatalog/plans"), rules.indexOf("match /accountDeletionRequests"));

describe("regras do catálogo público (texto)", () => {
  it("leitura pública; escrita só do administrador; sem exclusão", () => {
    expect(catalog).toContain("allow read: if true;");
    expect(catalog).toMatch(/allow create, update: if autorizado\(\)/);
    expect(catalog).toContain("allow delete: if false;");
  });
  it("campos fixos, 1 a 3 ofertas e cada plano uma vez", () => {
    expect(catalog).toContain("hasOnly(['offers', 'updatedAt'])");
    expect(catalog).toContain("updatedAt == request.time");
    expect(catalog).toContain("offers.size() >= 1");
    expect(catalog).toContain("offers.size() <= 3");
    expect(catalog).toContain("offers[1].plan != request.resource.data.offers[0].plan");
    expect(catalog).toContain("offers[2].plan != request.resource.data.offers[1].plan");
  });
  it("cada oferta: campos fixos, plano conhecido, preço inteiro positivo e link Ton oficial", () => {
    const fn = rules.slice(rules.indexOf("function ofertaValida"), rules.indexOf("match /publicCatalog/plans"));
    expect(fn).toContain("hasOnly(['plan', 'priceCents', 'checkoutUrl'])");
    expect(fn).toContain("o.plan in ['economico', 'premium', 'vip']");
    expect(fn).toContain("o.priceCents is int && o.priceCents > 0");
    expect(fn).toContain("payment-link-v3");
    expect(fn).toContain("ton");
    // o link tem que ser conferido por regex ancorada e só HTTPS
    expect(fn).toMatch(/matches\('\^https:\/\/payment-link-v3/);
  });
  it("o link real da Ton cabe no formato exigido pelas regras", () => {
    const body = rules.match(/matches\('(.+?)'\)/)![1].replace(/\\\\/g, "\\");
    const re = new RegExp(body);
    expect(re.test("https://payment-link-v3.ton.com.br/pl_Qyb50EZoXMYnqbNTepS6qdxGVJjpg37P")).toBe(true);
    expect(re.test("http://payment-link-v3.ton.com.br/pl_Qyb50EZoXMYnqbNTepS6qdxGVJjpg37P")).toBe(false);
    expect(re.test("https://payment-link-v3.ton.com.br.evil.com/pl_Qyb50EZoXMYnqbNTepS6qdxGVJjpg37P")).toBe(false);
    expect(re.test("https://evil.com/payment-link-v3.ton.com.br/pl_Qyb50EZoXMYnqbNTepS6qdxGVJjpg37P")).toBe(false);
    expect(re.test("https://payment-link-v3.ton.com.br/pl_x")).toBe(false);
  });
});
