import { describe, expect, it } from "vitest";
import { generateKeyPairSync, createSign } from "node:crypto";
import { fakeDb } from "./fake-d1";

const load = async () => (await import(/* @vite-ignore */ new URL("../cloudflare-worker/contingency-ai.js", import.meta.url).href)) as any;
const b64u = (value: Buffer | string) => Buffer.from(value).toString("base64url");

function setup() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = "k" + Math.random();
  const jwk = { ...publicKey.export({ format: "jwk" }), kid };
  const fetcher = async () => new Response(JSON.stringify({ keys: [jwk] }));
  const now = Math.floor(Date.now() / 1000);
  const token = (over: Record<string, unknown> = {}, signer = privateKey) => {
    const head = b64u(JSON.stringify({ alg: "RS256", kid }));
    const body = b64u(JSON.stringify({ aud: "shakstory-93bb1", iss: "https://securetoken.google.com/shakstory-93bb1", sub: "u1", iat: now - 5, exp: now + 3000, email: "Antonyopintor@gmail.com", email_verified: true, ...over }));
    return head + "." + body + "." + b64u(createSign("RSA-SHA256").update(head + "." + body).sign(signer));
  };
  return { token, opts: { fetcher } };
}

describe("Worker de IA da contingência", () => {
  it("só aceita ID token do Firebase válido (e-mail verificado)", async () => {
    const m = await load();
    const { token, opts } = setup();
    expect(await m.verifyFirebaseToken(token(), opts)).toBe("antonyopintor@gmail.com");
    expect(await m.verifyFirebaseToken(token({ email_verified: false }), opts)).toBeNull();
    expect(await m.verifyFirebaseToken(token({ email: "X@y.z" }), opts)).toBe("x@y.z");
    expect(await m.verifyFirebaseToken(token({ email: "x@y.z" }), { ...opts, emails: ["a@b.c"] })).toBeNull();
    expect(await m.verifyFirebaseToken(token({ aud: "outro" }), opts)).toBeNull();
    expect(await m.verifyFirebaseToken(token({ exp: 1 }), opts)).toBeNull();
    expect(await m.verifyFirebaseToken(token({}, generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey), opts)).toBeNull();
    expect(await m.verifyFirebaseToken(token({ email: undefined, email_verified: undefined, mirrorEmail: "acpconsultorias@gmail.com" }), opts)).toBe("acpconsultorias@gmail.com");
  });

  it("aplica CORS, exige login e responde como o servidor principal", async () => {
    const m = await load();
    const { token, opts } = setup();
    const env = { AI: { run: async (_model: string, input: { messages: unknown[] }) => ({ response: "ok:" + input.messages.length }) } };
    const send = (method: string, headers: Record<string, string>, body?: string, path = "/api/assist") => m.handle(new Request("https://x" + path, { method, headers, body }), env, opts);
    const pages = "https://shaksperio.github.io";
    const pre = await send("OPTIONS", { Origin: pages });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe(pages);
    expect((await send("OPTIONS", { Origin: "https://evil.example" })).headers.get("access-control-allow-origin")).toBeNull();
    expect((await send("POST", { Origin: pages }, "{}")).status).toBe(401);
    const auth = { Origin: pages, Authorization: "Bearer " + token() };
    const ok = await send("POST", auth, JSON.stringify({ action: "literary_review", prompt: "analise", scene: { id: "s", text: "uma duas três" }, book: { title: "L" }, canon: [{}, {}] }));
    expect(ok.status).toBe(200);
    const out = await ok.json();
    expect(out.proposal).toBe("ok:2");
    expect(out.context.wordCount).toBe(3);
    expect(out.context.canonFacts).toBe(2);
    expect((await send("GET", auth)).status).toBe(405);
    expect((await send("POST", auth, "x".repeat(300001))).status).toBe(413);
    expect((await send("POST", auth, "{nao json")).status).toBe(400);
  });

  it("usuário comum: /api/me, teste de 7 dias, bloqueio e liberação do plano (mesmo D1 do Worker principal)", async () => {
    const m = await load();
    const { token, opts } = setup();
    const db = fakeDb();
    const env = { DB: db, AI: { run: async () => ({ response: "oi" }) } };
    const pages = "https://shaksperio.github.io";
    const auth = { Origin: pages, Authorization: "Bearer " + token({ email: "ana@example.com", exp: Math.floor(Date.now() / 1000) + 40 * 86400 }) };
    const call = (method: string, path: string, now?: number, body = "{}") => m.handle(new Request("https://x" + path, { method, headers: auth, body: method === "POST" ? body : undefined }), env, { ...opts, now });
    const me = await (await call("GET", "/api/me")).json();
    expect(me).toMatchObject({ email: "ana@example.com", owner: false, plan: "trial" });
    expect((await call("POST", "/api/assist")).status).toBe(200);
    const later = Date.now() + 8 * 86400000;
    const blocked = await call("POST", "/api/assist", later);
    expect(blocked.status).toBe(402);
    expect(blocked.headers.get("access-control-allow-origin")).toBe(pages);
    expect((await blocked.json()).feature).toBe("cowila");
    db.users.get("ana@example.com").plan = "premium";
    db.users.get("ana@example.com").paid_until = new Date(later + 30 * 86400000).toISOString();
    expect((await call("POST", "/api/assist", later)).status).toBe(200);
    expect((await (await call("GET", "/api/me", later)).json()).plan).toBe("premium");
    // dono não passa pelo D1
    const ownerAuth = { Origin: pages, Authorization: "Bearer " + token() };
    const owner = await m.handle(new Request("https://x/api/me", { headers: ownerAuth }), {}, opts);
    expect(await owner.json()).toMatchObject({ owner: true, plan: "owner" });
    // sem D1 configurado, não-dono não usa a IA
    const noDb = await m.handle(new Request("https://x/api/assist", { method: "POST", headers: auth, body: "{}" }), { AI: env.AI }, opts);
    expect(noDb.status).toBe(503);
  });

  it("credenciais antivírus: só o proprietário, com login do Google", async () => {
    const m = await load();
    const { token, opts } = setup();
    const db = fakeDb();
    const pages = "https://shaksperio.github.io";
    const call = (method: string, path: string, auth?: string, body?: unknown) =>
      m.handle(new Request("https://x" + path, { method, headers: { Origin: pages, ...(auth ? { Authorization: "Bearer " + auth } : {}) }, body: body ? JSON.stringify(body) : undefined }), { DB: db }, opts);
    expect((await call("GET", "/api/security/antivirus")).status).toBe(401);
    expect((await call("GET", "/api/security/antivirus", token({ email: "comum@x.com" }))).status).toBe(403);
    const list = await call("GET", "/api/security/antivirus", token());
    expect(list.status).toBe(200);
    expect(await list.json()).toHaveLength(1);
    expect(((await (await call("POST", "/api/security/antivirus/rotate", token())).json()) as { rotated: boolean }).rotated).toBe(true);
    const after = (await (await call("GET", "/api/security/antivirus", token())).json()) as Array<{ status: string }>;
    expect(after.map(item => item.status)).toEqual(["active", "revoked"]);
  });
});
