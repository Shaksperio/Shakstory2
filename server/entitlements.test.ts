import { describe, expect, it } from "vitest";
import { fakeDb } from "./fake-d1";

const load = async () => (await import(/* @vite-ignore */ new URL("../cloudflare-worker/plans.js", import.meta.url).href)) as any;
const OWNER = "antonyopintor@gmail.com";
const DAY = 86400000;
const send = async (mod: any, db: any, email: string, path: string, method = "GET", body?: unknown, now = Date.now()) => {
  const r = new Request("https://x" + path, { method, headers: { "Cf-Access-Jwt-Assertion": "jwt", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return mod.shakGate(r, { DB: db }, new URL(r.url), { verify: async () => email, now });
};
const setPlan = (mod: any, db: any, email: string, plan: string, now: number) => send(mod, db, OWNER, "/api/admin/plan", "POST", { email, plan, days: 30 }, now);
const ALWAYS = ["editor.basic", "book.structure.basic", "backup.json", "recovery", "export.json"];
const FORMATS = ["export.txt", "export.html", "export.epub", "export.pdf", "export.docx"];
const COWILA = ["cowila.chat", "cowila.coauthor", "cowila.continuity"];

describe("catálogo de direitos", () => {
  it("é versionado e cada direito declara origem e quem impõe", async () => {
    const mod = await load();
    expect(mod.CATALOG_VERSION).toBe(1);
    const keys = Object.keys(mod.ENTITLEMENT_DEFS);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(key).toMatch(/^[a-z]+(\.[a-z]+)+$|^recovery$/);
      expect(["always", "export", "cowila", "share", "open"]).toContain(mod.ENTITLEMENT_DEFS[key].source);
      expect(["server", "client"]).toContain(mod.ENTITLEMENT_DEFS[key].enforce);
    }
  });

  it("só diz que o servidor impõe o que realmente passa por uma rota do Worker", async () => {
    const mod = await load();
    const server = Object.keys(mod.ENTITLEMENT_DEFS).filter(key => mod.ENTITLEMENT_DEFS[key].enforce === "server").sort();
    expect(server).toEqual([...COWILA, "sharing.public"].sort());
    for (const key of FORMATS) expect(mod.ENTITLEMENT_DEFS[key].enforce).toBe("client"); // exportação roda no navegador
  });

  it("direitos fundamentais valem em todos os planos, inclusive teste encerrado e sem plano", async () => {
    const mod = await load();
    for (const plan of Object.keys(mod.PLAN_DEFS)) {
      const granted = mod.entitlementsFor(mod.PLAN_DEFS[plan]);
      for (const key of ALWAYS) expect(granted[key]).toBe(true);
    }
  });

  it("mantém o comportamento atual de cada plano (nada muda comercialmente)", async () => {
    const mod = await load();
    const of = (plan: string) => mod.entitlementsFor(mod.PLAN_DEFS[plan]);
    for (const plan of ["owner", "trial", "vip"]) for (const key of Object.keys(mod.ENTITLEMENT_DEFS)) expect(of(plan)[key]).toBe(true);
    for (const key of [...FORMATS, "sharing.public", ...COWILA]) expect(of("expirado")[key]).toBe(false);
    for (const key of FORMATS) expect(of("economico")[key]).toBe(true);
    for (const key of [...COWILA, "sharing.public"]) expect(of("economico")[key]).toBe(false);
    for (const key of COWILA) expect(of("premium")[key]).toBe(true);
    expect(of("premium")["sharing.public"]).toBe(false);
  });

  it("as permissões antigas (features) são derivadas do catálogo e continuam iguais", async () => {
    const mod = await load();
    const t0 = Date.parse("2026-10-01T00:00:00Z");
    for (const [row, now] of [[{ created_at: new Date(t0).toISOString() }, t0 + DAY], [{ created_at: new Date(t0).toISOString() }, t0 + 9 * DAY], [{ created_at: new Date(t0).toISOString(), plan: "premium", paid_until: new Date(t0 + 30 * DAY).toISOString() }, t0 + DAY]] as const) {
      const info = mod.resolvePlan(row, now);
      expect(info.features.export).toBe(FORMATS.every(key => info.entitlements[key]));
      expect(info.features.cowila).toBe(COWILA.every(key => info.entitlements[key]));
      expect(info.features.share).toBe(info.entitlements["sharing.public"]);
      expect(info.catalogVersion).toBe(1);
    }
  });
});

describe("imposição no servidor (chamada direta, sem passar pela interface)", () => {
  it("teste encerrado e Econômico recebem 402 no Cowila; Premium passa; direito vem em /api/me", async () => {
    const mod = await load(); const db = fakeDb();
    const t0 = Date.now(); const later = t0 + 8 * DAY;
    await send(mod, db, "ana@example.com", "/api/me", "GET", undefined, t0);
    const expired = await send(mod, db, "ana@example.com", "/api/assist", "POST", { prompt: "oi" }, later);
    expect(expired.response.status).toBe(402);
    expect(await expired.response.json()).toMatchObject({ error: "plan_required", feature: "cowila", entitlement: "cowila.chat" });
    await setPlan(mod, db, "ana@example.com", "economico", later);
    expect((await send(mod, db, "ana@example.com", "/api/assist", "POST", {}, later)).response.status).toBe(402);
    await setPlan(mod, db, "ana@example.com", "premium", later);
    expect((await send(mod, db, "ana@example.com", "/api/assist", "POST", {}, later)).env).toBeTruthy();
    const me = await (await send(mod, db, "ana@example.com", "/api/me", "GET", undefined, later)).response.json();
    expect(me.entitlements["cowila.chat"]).toBe(true);
    expect(me.entitlements["sharing.public"]).toBe(false);
    expect(me.catalogVersion).toBe(1);
  });

  it("tornar a leitura pública exige o direito; só VIP (e teste) passa", async () => {
    const mod = await load(); const db = fakeDb();
    const t0 = Date.now(); const later = t0 + 8 * DAY;
    await send(mod, db, "bia@example.com", "/api/me", "GET", undefined, t0);
    const denied = await send(mod, db, "bia@example.com", "/api/share/visibility", "POST", {}, later);
    expect(denied.response.status).toBe(402);
    expect(await denied.response.json()).toMatchObject({ entitlement: "sharing.public" });
    await setPlan(mod, db, "bia@example.com", "premium", later);
    expect((await send(mod, db, "bia@example.com", "/api/share/visibility", "POST", {}, later)).response.status).toBe(402);
    await setPlan(mod, db, "bia@example.com", "vip", later);
    expect((await send(mod, db, "bia@example.com", "/api/share/visibility", "POST", {}, later)).env).toBeTruthy();
  });

  it("direitos de uma conta não vazam para outra", async () => {
    const mod = await load(); const db = fakeDb();
    const t0 = Date.now(); const later = t0 + 8 * DAY;
    await send(mod, db, "ana@example.com", "/api/me", "GET", undefined, t0);
    await send(mod, db, "bia@example.com", "/api/me", "GET", undefined, t0);
    await setPlan(mod, db, "ana@example.com", "vip", later);
    expect((await send(mod, db, "ana@example.com", "/api/assist", "POST", {}, later)).env).toBeTruthy();
    expect((await send(mod, db, "bia@example.com", "/api/assist", "POST", {}, later)).response.status).toBe(402);
  });

  it("com o teste encerrado, escrever, ler e salvar continuam liberados (nada fundamental é bloqueado)", async () => {
    const mod = await load(); const db = fakeDb();
    const t0 = Date.now(); const later = t0 + 30 * DAY;
    await send(mod, db, "ana@example.com", "/api/me", "GET", undefined, t0);
    expect((await send(mod, db, "ana@example.com", "/api/book", "POST", { path: "books/a.json", data: "x" }, later)).env).toBeTruthy();
    expect((await send(mod, db, "ana@example.com", "/api/book?path=books/a.json", "GET", undefined, later)).env).toBeTruthy();
    const me = await (await send(mod, db, "ana@example.com", "/api/me", "GET", undefined, later)).response.json();
    for (const key of ALWAYS) expect(me.entitlements[key]).toBe(true);
  });

  it("o dono recebe todos os direitos em /api/me", async () => {
    const mod = await load(); const db = fakeDb();
    const me = await (await send(mod, db, OWNER, "/api/me")).response.json();
    expect(Object.values(me.entitlements).every(Boolean)).toBe(true);
    expect(Object.keys(me.entitlements).sort()).toEqual(Object.keys(mod.ENTITLEMENT_DEFS).sort());
  });
});
