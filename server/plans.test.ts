import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const load = async () => (await import(/* @vite-ignore */ new URL("../cloudflare-worker/plans.js", import.meta.url).href)) as any;
import { fakeDb } from "./fake-d1";
const DAY = 86400000;

const req = (path: string, method = "GET", body?: unknown) => new Request("https://x" + path, { method, headers: { "Cf-Access-Jwt-Assertion": "jwt", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const gate = async (mod: any, db: any, email: string, path: string, method = "GET", body?: unknown, now = Date.now()) => {
  const r = req(path, method, body);
  return mod.shakGate(r, { DB: db }, new URL(r.url), { verify: async () => email, now });
};

describe("planos e teste de 7 dias", () => {
  it("resolve teste, plano pago, vencimento e teste encerrado", async () => {
    const { resolvePlan } = await load();
    const t0 = Date.parse("2026-10-01T12:00:00Z");
    expect(resolvePlan({ created_at: new Date(t0).toISOString() }, t0 + 6 * DAY).plan).toBe("trial");
    expect(resolvePlan({ created_at: new Date(t0).toISOString() }, t0 + 6 * DAY).daysLeft).toBe(1);
    const ended = resolvePlan({ created_at: new Date(t0).toISOString() }, t0 + 7 * DAY + 1);
    expect(ended.plan).toBe("expirado");
    expect(ended.features).toEqual({ export: false, cowila: false, share: false });
    const paid = { created_at: new Date(t0).toISOString(), plan: "premium", paid_until: new Date(t0 + 40 * DAY).toISOString() };
    expect(resolvePlan(paid, t0 + 30 * DAY).features).toEqual({ export: true, cowila: true, share: false });
    expect(resolvePlan(paid, t0 + 41 * DAY).plan).toBe("expirado");
    expect(resolvePlan({ ...paid, plan: "vip" }, t0 + 30 * DAY).features.share).toBe(true);
    expect(resolvePlan({ ...paid, plan: "economico" }, t0 + 30 * DAY).features).toEqual({ export: true, cowila: false, share: false });
  });

  it("dono não muda: sem prefixo e com tudo liberado", async () => {
    const mod = await load(); const db = fakeDb();
    const me = await (await gate(mod, db, "antonyopintor@gmail.com", "/api/me")).response.json();
    expect(me).toMatchObject({ owner: true, plan: "owner" });
    expect((await gate(mod, db, "antonyopintor@gmail.com", "/api/assist", "POST", {})).env).toBeUndefined();
    expect(db.users.size).toBe(0);
  });

  it("conta nova ganha teste, tem cowila liberado e os dados ficam isolados por prefixo", async () => {
    const mod = await load(); const db = fakeDb();
    const result = await gate(mod, db, "ana@example.com", "/api/book", "POST", { path: "books/a.json" });
    expect(db.users.get("ana@example.com")).toBeTruthy();
    const scoped = result.env.DB;
    await scoped.prepare("SELECT x FROM editorial_documents WHERE document_path=?").bind("books/a.json").first();
    await scoped.prepare("SELECT x FROM editorial_documents WHERE document_path LIKE 'books/%.json' ORDER BY updated_at").all();
    await scoped.prepare("SELECT x FROM editorial_documents WHERE document_path LIKE ?").bind("versions/a/%").all();
    await scoped.prepare("SELECT x FROM editorial_documents WHERE document_path=?").bind("shares/tok123456789abcdef.json").first();
    await scoped.prepare("INSERT INTO editorial_documents VALUES (?,?,?,?,?)").bind("planning/a.json", '{"x":1}', "abc", 1, "2026-10-01T00:00:00.000Z").run();
    const prefix = String(docsPrefix(db.docs[0].args[0]));
    expect(prefix).toMatch(/^u\/[0-9a-f]{24}\/$/);
    expect(db.docs[0].args[0]).toBe(prefix + "books/a.json");
    expect(db.docs[1].sql).toContain("'" + prefix + "books/%.json'");
    expect(db.docs[2].args[0]).toBe(prefix + "versions/a/%");
    expect(db.docs[3].args[0]).toBe("shares/tok123456789abcdef.json");
    expect(db.docs[4].args).toEqual([prefix + "planning/a.json", '{"x":1}', "abc", 1, "2026-10-01T00:00:00.000Z"]);
    // outra conta recebe outro prefixo
    const other = await gate(mod, db, "bia@example.com", "/api/book", "POST", { path: "books/a.json" });
    await other.env.DB.prepare("SELECT 1 FROM editorial_documents WHERE document_path=?").bind("books/a.json").first();
    expect(db.docs[5].args[0]).not.toBe(db.docs[0].args[0]);
  });

  it("depois do teste: Cowila e compartilhar dão 402, escrever continua liberado", async () => {
    const mod = await load(); const db = fakeDb();
    await gate(mod, db, "ana@example.com", "/api/me");
    const later = Date.now() + 8 * DAY;
    const assist = await gate(mod, db, "ana@example.com", "/api/assist", "POST", { prompt: "oi" }, later);
    expect(assist.response.status).toBe(402);
    expect((await assist.response.json()).feature).toBe("cowila");
    expect((await gate(mod, db, "ana@example.com", "/api/share/visibility", "POST", {}, later)).response.status).toBe(402);
    expect((await gate(mod, db, "ana@example.com", "/api/share", "POST", {}, later)).env).toBeTruthy();
    expect((await gate(mod, db, "ana@example.com", "/api/book", "POST", { path: "books/a.json" }, later)).env).toBeTruthy();
    const me = await (await gate(mod, db, "ana@example.com", "/api/me", "GET", undefined, later)).response.json();
    expect(me).toMatchObject({ plan: "expirado", owner: false });
  });

  it("cota diária do Cowila no teste e liberação pelo dono", async () => {
    const mod = await load(); const db = fakeDb();
    for (let i = 0; i < 30; i++) expect((await gate(mod, db, "ana@example.com", "/api/assist", "POST", {})).env).toBeTruthy();
    expect((await gate(mod, db, "ana@example.com", "/api/assist", "POST", {})).response.status).toBe(429);
    const later = Date.now() + 8 * DAY;
    const set = await gate(mod, db, "antonyopintor@gmail.com", "/api/admin/plan", "POST", { email: "ana@example.com", plan: "premium", days: 30 }, later);
    expect((await set.response.json()).user).toMatchObject({ plan: "premium" });
    expect((await gate(mod, db, "ana@example.com", "/api/assist", "POST", {}, later)).env).toBeTruthy();
    expect((await gate(mod, db, "ana@example.com", "/api/share/visibility", "POST", {}, later)).response.status).toBe(402);
    const list = await (await gate(mod, db, "antonyopintor@gmail.com", "/api/admin/users")).response.json();
    expect(list.users[0].email).toBe("ana@example.com");
  });

  it("só o dono administra; rotas públicas e sem credencial seguem como antes", async () => {
    const mod = await load(); const db = fakeDb();
    expect((await gate(mod, db, "ana@example.com", "/api/admin/users")).response.status).toBe(403);
    expect((await gate(mod, db, "ana@example.com", "/api/admin/plan", "POST", { email: "x@y.com", plan: "vip" })).response.status).toBe(403);
    expect((await gate(mod, db, "antonyopintor@gmail.com", "/api/admin/plan", "POST", { email: "x@y.com", plan: "ouro" })).response.status).toBe(400);
    expect(await gate(mod, db, "ana@example.com", "/api/public/share/abcdefghijklmnop")).toEqual({});
    expect(await gate(mod, db, "ana@example.com", "/health")).toEqual({});
    const anon = new Request("https://x/api/book", { method: "POST" });
    expect(await mod.shakGate(anon, { DB: db }, new URL(anon.url))).toEqual({});
    const bad = await mod.shakGate(req("/api/book", "POST"), { DB: db }, new URL("https://x/api/book"), { verify: async () => null });
    expect(bad.response.status).toBe(401);
  });
});

function docsPrefix(path: unknown) { return String(path).replace(/books\/a\.json$/, ""); }

describe("isolamento, limites e histórico", () => {
  it("library.json (sem barra) também é isolado por conta", async () => {
    const mod = await load(); const db = fakeDb();
    const result = await gate(mod, db, "ana@example.com", "/api/book", "POST", { path: "library.json" });
    await result.env.DB.prepare("SELECT 1 FROM editorial_documents WHERE document_path=?").bind("library.json").first();
    expect(String(db.docs[0].args[0])).toMatch(/^u\/[0-9a-f]{24}\/library\.json$/);
  });

  it("mantém só as últimas 30 versões de cada livro e não mexe em outros caminhos", async () => {
    const mod = await load(); const db = fakeDb();
    const result = await gate(mod, db, "ana@example.com", "/api/book", "POST", { path: "books/a.json" });
    await result.env.DB.prepare("INSERT OR REPLACE INTO editorial_documents (document_path,data_json,sha,version,updated_at) VALUES (?,?,?,?,?)").bind("versions/a/31.json", "{}", "x", 31, "t").run();
    const cleanup = db.docs.find((d: any) => /^DELETE FROM editorial_documents/.test(d.sql));
    expect(cleanup).toBeTruthy();
    expect(cleanup.args[0]).toMatch(/^u\/[0-9a-f]{24}\/versions\/a\/%$/);
    expect(cleanup.args[2]).toBe(30);
    const before = db.docs.length;
    await result.env.DB.prepare("INSERT OR REPLACE INTO editorial_documents (document_path,data_json,sha,version,updated_at) VALUES (?,?,?,?,?)").bind("planning/a.json", "{}", "x", 1, "t").run();
    expect(db.docs.slice(before).some((d: any) => /^DELETE/.test(d.sql))).toBe(false);
  });

  it("recusa documento acima de 1,9 MB (para todos) e conta sem espaço", async () => {
    const mod = await load(); const db = fakeDb();
    const big = new Request("https://x/api/book", { method: "POST", headers: { "content-length": "2000000" }, body: "{}" });
    const owner = await mod.shakGate(big, { DB: db }, new URL(big.url), { verify: async () => "antonyopintor@gmail.com" });
    expect(owner.response.status).toBe(413);
    expect((await owner.response.json()).error).toBe("too_large");
    db.stored = 39900000;
    const r = new Request("https://x/api/book", { method: "POST", headers: { "content-type": "application/json", "Cf-Access-Jwt-Assertion": "j" }, body: JSON.stringify({ path: "books/a.json", data: "x".repeat(200000) }) });
    const full = await mod.shakGate(r, { DB: db }, new URL(r.url), { verify: async () => "ana@example.com" });
    expect(full.response.status).toBe(413);
    expect((await full.response.json()).error).toBe("storage_full");
  });
});

describe("patch-worker-plans", () => {
  it("injeta o portão no Worker e o resultado continua sendo JavaScript válido", () => {
    const dir = mkdtempSync(join(tmpdir(), "plans-"));
    const input = join(dir, "in.mjs");
    const output = join(dir, "out.mjs");
    const fake = [
      "async function verifyAccessJwt(){return null}",
      "const MIRROR_EMAILS=['a@b.c'];",
      "export default{async fetch(req,env){const u=new URL(req.url);",
      "if(u.pathname==='/api/mirror-token'&&req.method==='GET')return mirrorToken(req,env);",
      "return new Response('ok')}}",
    ].join("\n");
    writeFileSync(input, fake);
    const run = spawnSync("node", [new URL("../scripts/patch-worker-plans.mjs", import.meta.url).pathname, input, output], { encoding: "utf8" });
    expect(run.status).toBe(0);
    const out = readFileSync(output, "utf8");
    expect(out).toContain("shakGate(req,env,u)");
    expect(out).not.toMatch(/^import /m);
    expect(spawnSync("node", ["--check", output]).status).toBe(0);
    expect(spawnSync("node", [new URL("../scripts/patch-worker-plans.mjs", import.meta.url).pathname, output, output], { encoding: "utf8" }).status).toBe(3);
  });

  it("--upgrade troca o código antigo pelo atual sem duplicar o portão nem mexer no resto do Worker", () => {
    const dir = mkdtempSync(join(tmpdir(), "plans-up-"));
    const script = new URL("../scripts/patch-worker-plans.mjs", import.meta.url).pathname;
    const input = join(dir, "in.mjs");
    const once = join(dir, "once.mjs");
    const old = join(dir, "old.mjs");
    const upgraded = join(dir, "up.mjs");
    writeFileSync(input, [
      "async function verifyAccessJwt(){return null}",
      "const MIRROR_EMAILS=['a@b.c'];",
      "const MARCA_DO_RESTO='nao-mexer';",
      "export default{async fetch(req,env){const u=new URL(req.url);",
      "if(u.pathname==='/api/mirror-token'&&req.method==='GET')return mirrorToken(req,env);",
      "return new Response('ok')}}",
    ].join("\n"));
    expect(spawnSync("node", [script, input, once], { encoding: "utf8" }).status).toBe(0);
    // simula uma instalação antiga: versão diferente dentro do bloco injetado
    writeFileSync(old, readFileSync(once, "utf8").replace(/SHAK_WORKER_VERSION = "[^"]+"/, 'SHAK_WORKER_VERSION = "ANTIGA"'));
    expect(readFileSync(old, "utf8")).toContain("ANTIGA");
    // sem --upgrade continua recusando; com --upgrade atualiza
    expect(spawnSync("node", [script, old, upgraded], { encoding: "utf8" }).status).toBe(3);
    const run = spawnSync("node", [script, "--upgrade", old, upgraded], { encoding: "utf8" });
    expect(run.status).toBe(0);
    const out = readFileSync(upgraded, "utf8");
    expect(out).not.toContain("ANTIGA");
    expect(out).toContain("MARCA_DO_RESTO='nao-mexer'");
    expect(out.split("shakGate(req,env,u)").length).toBe(2);
    expect(out.split("// Contas, teste de 7 dias e planos do Shakstory").length).toBe(2);
    expect(spawnSync("node", ["--check", upgraded]).status).toBe(0);
    // atualizar de novo dá o mesmo resultado (idempotente)
    const again = join(dir, "again.mjs");
    expect(spawnSync("node", [script, "--upgrade", upgraded, again], { encoding: "utf8" }).status).toBe(0);
    expect(readFileSync(again, "utf8")).toBe(out);
    // sem nada instalado, --upgrade não faz nada
    expect(spawnSync("node", [script, "--upgrade", input, join(dir, "x.mjs")], { encoding: "utf8" }).status).toBe(3);
  });

  it("o Worker informa a versão que o app espera", async () => {
    const { SHAK_WORKER_VERSION } = await load();
    const client = readFileSync(new URL("../client/src/lib/plans.ts", import.meta.url), "utf8");
    expect(client).toContain(`EXPECTED_WORKER_VERSION = "${SHAK_WORKER_VERSION}"`);
  });
});

describe("withGemini (IA opcional)", () => {
  const messages = [{ role: "system", content: "regras" }, { role: "user", content: "oi" }];
  it("sem segredo, não muda nada", async () => {
    const { withGemini } = await load();
    const env = { AI: { run: vi.fn() } };
    expect(withGemini(env)).toBe(env);
  });
  it("com segredo usa o Gemini e envia a chave só no cabeçalho", async () => {
    const { withGemini } = await load();
    const base = { run: vi.fn(async () => ({ response: "workers" })) };
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "gemini" }] } }] })));
    const env = withGemini({ AI: base, GEMINI_API_KEY: "chave" }, fetchFn as unknown as typeof fetch) as { AI: { run: (n: string, i: unknown) => Promise<{ response: string }> } };
    expect((await env.AI.run("m", { messages })).response).toBe("gemini");
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).not.toContain("chave");
    expect(init.headers["x-goog-api-key"]).toBe("chave");
    expect(base.run).not.toHaveBeenCalled();
  });
  it("repassa temperatura e top_p ao Gemini só quando pedidos", async () => {
    const { withGemini } = await load();
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "g" }] } }] })));
    const env = withGemini({ AI: { run: vi.fn() }, GEMINI_API_KEY: "chave" }, fetchFn as unknown as typeof fetch) as { AI: { run: (n: string, i: unknown) => Promise<unknown> } };
    await env.AI.run("m", { messages, temperature: 0.9, top_p: 0.92 });
    await env.AI.run("m", { messages });
    const cfg = (i: number) => JSON.parse(((fetchFn.mock.calls[i] as unknown as [string, { body: string }])[1]).body).generationConfig;
    expect(cfg(0)).toMatchObject({ temperature: 0.9, topP: 0.92 });
    expect(cfg(1).temperature).toBeUndefined();
  });
  it("se o Gemini falhar, cai no Workers AI", async () => {
    const { withGemini } = await load();
    const base = { run: vi.fn(async () => ({ response: "workers" })) };
    const fetchFn = vi.fn(async () => new Response("erro", { status: 500 }));
    const env = withGemini({ AI: base, GEMINI_API_KEY: "chave" }, fetchFn as unknown as typeof fetch) as { AI: { run: (n: string, i: unknown) => Promise<{ response: string }> } };
    expect((await env.AI.run("m", { messages })).response).toBe("workers");
  });
});

describe("segurança antivírus (credenciais por sessão)", () => {
  it("lista cria a primeira credencial, rotaciona, revoga e guarda só hash e prefixo", async () => {
    const { antivirusApi } = await load();
    const db = fakeDb();
    const t = 1_700_000_000_000;
    let r = await antivirusApi(db, "dono@x.com", "GET", "/api/security/antivirus", null, "https://app.example", t);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0].status).toBe("active");
    expect(r.body[0].tokenPrefix).toHaveLength(10);
    expect(JSON.stringify(db.av)).not.toContain("secret");
    expect(db.av[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    // segunda leitura não cria outra
    r = await antivirusApi(db, "dono@x.com", "GET", "/api/security/antivirus", null, "https://app.example", t + 1000);
    expect(r.body).toHaveLength(1);
    // rotação revoga a anterior e cria nova
    const rot = await antivirusApi(db, "dono@x.com", "POST", "/api/security/antivirus/rotate", null, "https://app.example", t + 2000);
    expect(rot.body).toEqual({ rotated: true });
    r = await antivirusApi(db, "dono@x.com", "GET", "/api/security/antivirus", null, "https://app.example", t + 3000);
    expect(r.body.map((x: any) => x.status)).toEqual(["active", "revoked"]);
    // revogar a ativa; id inválido e de outro dono não revogam
    const activeId = r.body[0].id;
    expect((await antivirusApi(db, "outro@x.com", "POST", "/api/security/antivirus/revoke", { id: activeId }, "u", t)).body).toEqual({ revoked: false });
    expect((await antivirusApi(db, "dono@x.com", "POST", "/api/security/antivirus/revoke", { id: "x" }, "u", t)).status).toBe(400);
    expect((await antivirusApi(db, "dono@x.com", "POST", "/api/security/antivirus/revoke", { id: activeId }, "u", t)).body).toEqual({ revoked: true });
  });

  it("o portão só libera a rota ao dono", async () => {
    const mod = await load();
    const db = fakeDb();
    const opts = { verify: async () => "comum@x.com", now: Date.now() };
    const denied = await mod.shakGate(req("/api/security/antivirus"), { DB: db, MIRROR_EMAILS: "dono@x.com" }, new URL("https://x/api/security/antivirus"), opts);
    expect(denied.response.status).toBe(403);
    const ok = await mod.shakGate(req("/api/security/antivirus"), { DB: db, MIRROR_EMAILS: "comum@x.com" }, new URL("https://x/api/security/antivirus"), opts);
    expect(ok.response.status).toBe(200);
    expect(await ok.response.json()).toHaveLength(1);
  });
});
