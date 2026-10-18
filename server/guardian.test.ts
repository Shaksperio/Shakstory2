import { describe, expect, it } from "vitest";
import { fakeDb } from "./fake-d1";

const load = async () => (await import(/* @vite-ignore */ new URL("../cloudflare-worker/plans.js", import.meta.url).href)) as any;
const OWNER = "antonyopintor@gmail.com";
const enc = new TextEncoder();

/** Mesma regra do Worker: prefixo da conta = u/ + 12 primeiros bytes do SHA-256 do e-mail. */
async function prefixOf(email: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(email)));
  return "u/" + Array.from(bytes.slice(0, 12)).map(b => b.toString(16).padStart(2, "0")).join("") + "/";
}

/** Corpo de gravação cujo tamanho TOTAL em bytes UTF-8 é exatamente `total` (preenche com "x"). */
function payload(path: string, total: number) {
  const base = enc.encode(JSON.stringify({ path, data: "" })).length;
  const body = JSON.stringify({ path, data: "x".repeat(total - base) });
  expect(enc.encode(body).length).toBe(total);
  return body;
}

async function send(mod: any, db: any, email: string, path: string, method: string, body: string | undefined, extra: { env?: any; maxStorage?: number; now?: number } = {}) {
  const r = new Request("https://x" + path, { method, headers: { "Cf-Access-Jwt-Assertion": "jwt", "content-type": "application/json" }, body });
  return mod.shakGate(r, { DB: db, ...(extra.env || {}) }, new URL(r.url), { verify: async () => email, now: extra.now, maxStorage: extra.maxStorage });
}
const errorOf = async (result: any) => (result.response ? (await result.response.json()).error : null);
const level = async (mod: any, db: any, email: string, extra: any = {}) => (await (await send(mod, db, email, "/api/me", "GET", undefined, extra)).response.json()).protection;

describe("armazenamento: documento substituído e bytes reais", () => {
  it("regravar o mesmo documento desconta o antigo; o limite é inclusivo", async () => {
    const mod = await load(); const db = fakeDb();
    const prefix = await prefixOf("ana@example.com");
    db.files.set(prefix + "books/a.json", "x".repeat(600));
    db.files.set(prefix + "books/b.json", "x".repeat(300)); // usado: 900 de 1000
    const opt = { maxStorage: 1000 };
    expect(await errorOf(await send(mod, db, "ana@example.com", "/api/book", "POST", payload("books/a.json", 700), opt))).toBeNull(); // 900-600+700 = 1000
    expect(await errorOf(await send(mod, db, "ana@example.com", "/api/book", "POST", payload("books/a.json", 701), opt))).toBe("storage_full"); // 1001
    // documento novo não desconta nada
    expect(await errorOf(await send(mod, db, "ana@example.com", "/api/book", "POST", payload("books/c.json", 100), opt))).toBeNull(); // 1000
    expect(await errorOf(await send(mod, db, "ana@example.com", "/api/book", "POST", payload("books/c.json", 101), opt))).toBe("storage_full");
  });

  it("encolher um documento é sempre permitido, mesmo com a conta acima do limite", async () => {
    const mod = await load(); const db = fakeDb();
    const prefix = await prefixOf("ana@example.com");
    db.files.set(prefix + "books/a.json", "x".repeat(800));
    db.files.set(prefix + "books/b.json", "x".repeat(400)); // usado 1200 > 1000
    const opt = { maxStorage: 1000 };
    expect(await errorOf(await send(mod, db, "ana@example.com", "/api/book", "POST", payload("books/a.json", 500), opt))).toBeNull(); // 1200-800+500
    expect(await errorOf(await send(mod, db, "ana@example.com", "/api/book", "POST", payload("books/c.json", 500), opt))).toBe("storage_full");
  });

  it("library.json (sem barra) e caminhos já prefixados também são descontados; shares/ não", async () => {
    const mod = await load(); const db = fakeDb();
    const prefix = await prefixOf("ana@example.com");
    db.files.set(prefix + "library.json", "x".repeat(900));
    const opt = { maxStorage: 1000 };
    expect(await errorOf(await send(mod, db, "ana@example.com", "/api/book", "POST", payload("library.json", 1000), opt))).toBeNull();
    expect(await errorOf(await send(mod, db, "ana@example.com", "/api/book", "POST", payload("library.json", 1001), opt))).toBe("storage_full");
    expect(await errorOf(await send(mod, db, "ana@example.com", "/api/book", "POST", payload(prefix + "library.json", 1000), opt))).toBeNull();
    expect(await errorOf(await send(mod, db, "ana@example.com", "/api/book", "POST", payload("shares/t.json", 101), opt))).toBe("storage_full"); // 900 + 101: nada a descontar
  });

  it("conta bytes UTF-8, não caracteres (acentos, CJK e emoji)", async () => {
    const mod = await load(); const db = fakeDb();
    const prefix = await prefixOf("ana@example.com");
    db.files.set(prefix + "books/a.json", "ç".repeat(300)); // 300 caracteres = 600 bytes
    db.files.set(prefix + "books/b.json", "😀".repeat(50)); // 50 caracteres = 200 bytes (100 unidades UTF-16)
    // usado de verdade: 800 bytes. Contando caracteres seriam 350 e a gravação abaixo passaria.
    const opt = { maxStorage: 1000 };
    expect(await errorOf(await send(mod, db, "ana@example.com", "/api/book", "POST", payload("books/c.json", 200), opt))).toBeNull(); // 1000
    expect(await errorOf(await send(mod, db, "ana@example.com", "/api/book", "POST", payload("books/c.json", 201), opt))).toBe("storage_full");
  });

  it("o corpo novo também é medido em bytes UTF-8", async () => {
    const mod = await load(); const db = fakeDb();
    const envelope = enc.encode(JSON.stringify({ path: "books/a.json", data: "" })).length;
    const opt = { maxStorage: envelope + 100 };
    const cjk = JSON.stringify({ path: "books/a.json", data: "日".repeat(50) }); // 50 caracteres, 150 bytes
    expect(cjk.length).toBeLessThan(envelope + 100);
    expect(enc.encode(cjk).length).toBeGreaterThan(envelope + 100);
    expect(await errorOf(await send(mod, db, "ana@example.com", "/api/book", "POST", cjk, opt))).toBe("storage_full");
    const ascii = JSON.stringify({ path: "books/a.json", data: "x".repeat(100) });
    expect(await errorOf(await send(mod, db, "ana@example.com", "/api/book", "POST", ascii, opt))).toBeNull();
  });

  it("limite de 1,9 MB por documento em bytes reais, inclusive para o dono", async () => {
    const mod = await load(); const db = fakeDb();
    expect(await errorOf(await send(mod, db, OWNER, "/api/book", "POST", payload("books/a.json", 1900000)))).toBeNull();
    expect(await errorOf(await send(mod, db, OWNER, "/api/book", "POST", payload("books/a.json", 1900001)))).toBe("too_large");
    // 1.000.000 de "é" são 1.000.000 de caracteres mas 2.000.000 de bytes: o limite antigo (por caracteres) deixava passar
    const unicode = JSON.stringify({ path: "books/a.json", data: "é".repeat(1000000) });
    expect(unicode.length).toBeLessThan(1900000);
    expect(await errorOf(await send(mod, db, "ana@example.com", "/api/book", "POST", unicode))).toBe("too_large");
  });
});

describe("guardião: contadores e níveis", () => {
  const env = (budgets: object, levels?: number[]) => ({ SHAK_BUDGETS: JSON.stringify(budgets), ...(levels ? { SHAK_LEVELS: JSON.stringify(levels) } : {}) });

  it("usa o maior risco individual e passa por normal, atenção, proteção e preservação", async () => {
    const mod = await load(); const db = fakeDb();
    const cfg = { env: env({ writes: 10, write_bytes: 1e12, ai: 1e6 }) };
    expect((await level(mod, db, "ana@example.com", cfg)).level).toBe("normal");
    const write = () => send(mod, db, "ana@example.com", "/api/book", "POST", payload("books/a.json", 200), cfg);
    for (let i = 0; i < 6; i++) await write();
    expect(await level(mod, db, "ana@example.com", cfg)).toMatchObject({ level: "normal", percent: 60 });
    await write(); // 7 de 10 = 70%
    expect(await level(mod, db, "ana@example.com", cfg)).toMatchObject({ level: "atencao", metric: "writes", percent: 70 });
    await write(); await write(); // 9 de 10 = 90%
    expect((await level(mod, db, "ana@example.com", cfg)).level).toBe("protecao");
    await write(); // 10 de 10
    expect((await level(mod, db, "ana@example.com", cfg)).level).toBe("preservacao");
  });

  it("não soma porcentagens de métricas diferentes", () => {
    return load().then(mod => {
      const config = mod.guardianConfig({ SHAK_BUDGETS: JSON.stringify({ writes: 100, write_bytes: 100, ai: 100 }) });
      expect(mod.protectionLevel({ writes: 60, write_bytes: 60, ai: 60 }, config).level).toBe("normal");
      expect(mod.protectionLevel({ writes: 60, write_bytes: 70, ai: 60 }, config)).toMatchObject({ level: "atencao", metric: "write_bytes" });
    });
  });

  it("configuração inválida cai nos padrões", async () => {
    const mod = await load();
    expect(mod.guardianConfig({ SHAK_BUDGETS: "lixo", SHAK_LEVELS: "[0.9,0.5,0.7]" })).toEqual({ budgets: mod.DEFAULT_BUDGETS, thresholds: mod.DEFAULT_THRESHOLDS });
    expect(mod.guardianConfig({ SHAK_BUDGETS: '{"writes":-5,"ai":"x"}' }).budgets).toEqual(mod.DEFAULT_BUDGETS);
    expect(mod.guardianConfig({ SHAK_LEVELS: "[0.5,0.6,0.7]" }).thresholds).toEqual([0.5, 0.6, 0.7]);
  });

  it("proteção reduz o Cowila à metade e preservação o pausa, sem tocar na escrita nem na leitura de livros", async () => {
    const mod = await load(); const db = fakeDb();
    const cfg = { env: env({ writes: 10, write_bytes: 1e12, ai: 1e6 }) };
    for (let i = 0; i < 9; i++) await send(mod, db, "bia@example.com", "/api/book", "POST", payload("books/a.json", 200), cfg); // 90% = proteção
    let ok = 0;
    for (let i = 0; i < 20; i++) if (!(await errorOf(await send(mod, db, "ana@example.com", "/api/assist", "POST", "{}", cfg)))) ok++;
    expect(ok).toBe(15); // teste grátis: 30 por dia, na metade
    expect(await errorOf(await send(mod, db, "ana@example.com", "/api/assist", "POST", "{}", cfg))).toBe("quota");
    await send(mod, db, "bia@example.com", "/api/book", "POST", payload("books/a.json", 200), cfg); // 10 de 10
    expect((await level(mod, db, "bia@example.com", cfg)).level).toBe("preservacao");
    const usageBefore = db.usage.size ? Array.from(db.usage.values()).reduce((a: number, b: number) => a + b, 0) : 0;
    const paused = await send(mod, db, "carla@example.com", "/api/assist", "POST", "{}", cfg);
    expect(paused.response.status).toBe(503);
    const body = await paused.response.json();
    expect(body).toMatchObject({ error: "guardian_paused", level: "preservacao" });
    expect(body.message).not.toMatch(/firebase|cloudflare|d1|worker/i);
    expect(Array.from(db.usage.values()).reduce((a: number, b: number) => a + b, 0)).toBe(usageBefore); // pausa não consome a cota do usuário
    // escrever e ler manuscritos continua liberado em qualquer nível
    expect((await send(mod, db, "carla@example.com", "/api/book", "POST", payload("books/a.json", 200), cfg)).env).toBeTruthy();
    expect((await send(mod, db, "carla@example.com", "/api/book?path=books/a.json", "GET", undefined, cfg)).env).toBeTruthy();
    // o dono nunca é recusado
    expect((await send(mod, db, OWNER, "/api/assist", "POST", "{}", cfg)).response).toBeUndefined();
    expect((await send(mod, db, OWNER, "/api/book", "POST", payload("books/a.json", 200), cfg)).response).toBeUndefined();
  });

  it("se o contador falhar, nada é bloqueado (falha aberta)", async () => {
    const mod = await load(); const db = fakeDb();
    db.failMeter = true;
    expect((await send(mod, db, "ana@example.com", "/api/book", "POST", payload("books/a.json", 200))).env).toBeTruthy();
    expect((await send(mod, db, "ana@example.com", "/api/assist", "POST", "{}")).env).toBeTruthy();
    expect((await send(mod, db, OWNER, "/api/book", "POST", payload("books/a.json", 200))).response).toBeUndefined();
    expect((await level(mod, db, "ana@example.com")).level).toBe("normal");
  });

  it("o nível aparece em /api/me para dono e conta comum", async () => {
    const mod = await load(); const db = fakeDb();
    expect(await level(mod, db, OWNER)).toMatchObject({ level: "normal", percent: 0 });
    expect(await level(mod, db, "ana@example.com")).toMatchObject({ level: "normal", percent: 0 });
  });
});

describe("operações concorrentes", () => {
  it("contadores somam exatamente com gravações e chamadas de IA em paralelo", async () => {
    const mod = await load(); const db = fakeDb();
    const accounts = ["a@example.com", "b@example.com", "c@example.com", "d@example.com", "e@example.com"];
    const jobs: Promise<any>[] = [];
    let bytes = 0;
    for (let i = 0; i < 25; i++) { const size = 300 + i; bytes += size; jobs.push(send(mod, db, accounts[i % 5], "/api/book", "POST", payload("books/a.json", size))); }
    for (let i = 0; i < 10; i++) jobs.push(send(mod, db, accounts[i % 5], "/api/assist", "POST", "{}"));
    jobs.push(send(mod, db, OWNER, "/api/book", "POST", payload("books/a.json", 400)));
    bytes += 400;
    const results = await Promise.all(jobs);
    expect(results.filter(r => r.response).length).toBe(0);
    const day = Array.from(db.meter.values());
    expect(day).toHaveLength(1);
    expect(day[0]).toEqual({ writes: 26, write_bytes: bytes, ai: 10 });
  });

  it("o contador é uma única instrução atômica, sem ler antes de gravar", async () => {
    const mod = await load();
    const statements: string[] = [];
    const db: any = fakeDb(); const original = db.prepare.bind(db);
    db.prepare = (sql: string) => { statements.push(sql); return original(sql); };
    await send(mod, db, "ana@example.com", "/api/book", "POST", payload("books/a.json", 200));
    const meterSql = statements.filter(sql => /shak_meter/.test(sql) && !/^CREATE/.test(sql));
    expect(meterSql).toHaveLength(1);
    expect(meterSql[0]).toMatch(/ON CONFLICT\(day\) DO UPDATE SET writes = writes \+ excluded\.writes/);
  });

  it("cada gravação é avaliada contra o estado visto no momento: o limite não é atômico entre pedidos simultâneos (risco conhecido)", async () => {
    const mod = await load(); const db = fakeDb();
    const opt = { maxStorage: 1000 };
    const results = await Promise.all([1, 2, 3, 4, 5].map(i => send(mod, db, "ana@example.com", "/api/book", "POST", payload("books/n" + i + ".json", 300), opt)));
    // nenhum documento chegou a ser gravado no fake, então os 5 passam: o excesso possível é limitado pelo número de pedidos simultâneos
    expect(results.filter(r => r.response).length).toBe(0);
  });
});
