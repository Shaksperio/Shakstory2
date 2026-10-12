import { describe, expect, it } from "vitest";
import { generateKeyPairSync, createSign, createVerify } from "node:crypto";

const load = async () => (await import(/* @vite-ignore */ new URL("../cloudflare-worker/mirror-token.js", import.meta.url).href)) as any;
const b64u = (value: Buffer | string) => Buffer.from(value).toString("base64url");

function makeAccess(email: string, over: Record<string, unknown> = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k" + Math.random() };
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: "RS256", kid: jwk.kid }));
  const body = b64u(JSON.stringify({ email, aud: ["AUD"], iss: "https://t.example", exp: now + 600, ...over }));
  const sig = createSign("RSA-SHA256").update(head + "." + body).sign(privateKey);
  const fetcher = async () => new Response(JSON.stringify({ keys: [jwk] }));
  return { jwt: head + "." + body + "." + b64u(sig), fetcher };
}

describe("rota /api/mirror-token", () => {
  it("valida o JWT do Access e rejeita assinatura, público e validade errados", async () => {
    const { verifyAccessJwt } = await load();
    const ok = makeAccess("Antonyopintor@gmail.com");
    expect(await verifyAccessJwt(ok.jwt, { team: "https://t.example", aud: "AUD", fetcher: ok.fetcher })).toBe("antonyopintor@gmail.com");
    expect(await verifyAccessJwt(ok.jwt, { team: "https://t.example", aud: "OUTRO", fetcher: ok.fetcher })).toBeNull();
    const old = makeAccess("a@b.c", { exp: 1 });
    expect(await verifyAccessJwt(old.jwt, { team: "https://t.example", aud: "AUD", fetcher: old.fetcher })).toBeNull();
    const forged = ok.jwt.split(".").slice(0, 2).join(".") + "." + b64u("falso");
    expect(await verifyAccessJwt(forged, { team: "https://t.example", aud: "AUD", fetcher: ok.fetcher })).toBeNull();
    expect(await verifyAccessJwt(undefined)).toBeNull();
  });

  it("emite custom token assinado só para e-mails autorizados", async () => {
    const { mirrorToken } = await load();
    const service = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const account = { client_email: "sa@proj.iam.gserviceaccount.com", private_key: service.privateKey.export({ type: "pkcs8", format: "pem" }) };
    const env = { FIREBASE_SERVICE_ACCOUNT: JSON.stringify(account) };
    const good = makeAccess("acpconsultorias@gmail.com");
    const opts = { team: "https://t.example", aud: "AUD", fetcher: good.fetcher };
    const response = await mirrorToken(new Request("https://x/api/mirror-token", { headers: { "Cf-Access-Jwt-Assertion": good.jwt } }), env, opts);
    expect(response.status).toBe(200);
    const { token, email } = await response.json();
    expect(email).toBe("acpconsultorias@gmail.com");
    const [h, p, s] = token.split(".");
    expect(createVerify("RSA-SHA256").update(h + "." + p).verify(service.publicKey, Buffer.from(s, "base64url"))).toBe(true);
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    expect(claims.claims.mirrorEmail).toBe("acpconsultorias@gmail.com");
    expect(claims.iss).toBe(account.client_email);

    const stranger = makeAccess("outra@pessoa.com");
    const denied = await mirrorToken(new Request("https://x/", { headers: { "Cf-Access-Jwt-Assertion": stranger.jwt } }), env, { ...opts, fetcher: stranger.fetcher });
    expect(denied.status).toBe(403);
    expect((await mirrorToken(new Request("https://x/"), env, opts)).status).toBe(401);
    expect((await mirrorToken(new Request("https://x/"), {}, opts)).status).toBe(501);
  });
});
