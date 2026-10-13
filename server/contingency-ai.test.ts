import { describe, expect, it } from "vitest";
import { generateKeyPairSync, createSign } from "node:crypto";

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
  it("só aceita ID token do Firebase válido de e-mail autorizado", async () => {
    const m = await load();
    const { token, opts } = setup();
    expect(await m.verifyFirebaseToken(token(), opts)).toBe("antonyopintor@gmail.com");
    expect(await m.verifyFirebaseToken(token({ email_verified: false }), opts)).toBeNull();
    expect(await m.verifyFirebaseToken(token({ email: "x@y.z" }), opts)).toBeNull();
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
});
