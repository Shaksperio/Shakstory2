// Credencial do espelho Firebase para quem entrou pelo Cloudflare Access (e-mail + código).
// O Worker confere a assinatura do JWT do Access, compara o e-mail com a lista autorizada e devolve um
// "custom token" do Firebase assinado com a chave de serviço (segredo FIREBASE_SERVICE_ACCOUNT).
// Este arquivo é injetado no Worker de produção por scripts/patch-worker-mirror.mjs (as palavras "export" são removidas).

export const MIRROR_TEAM = "https://shakstory.cloudflareaccess.com";
export const MIRROR_AUD = "7e4c323b7e28f351ed27f86f228fd1c7b32aef99fcb7e2d87c68611aa8efc2c6";
export const MIRROR_EMAILS = ["acpconsultorias@gmail.com", "antonyopintor@gmail.com"];
const FIREBASE_AUDIENCE = "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit";

const mirrorB64u = input => {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let text = "";
  for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const mirrorFromB64u = value => {
  const text = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4));
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
};
const mirrorJson = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

let mirrorCerts = null;
async function mirrorAccessKeys(team, fetcher, fresh) {
  if (!fresh && mirrorCerts && mirrorCerts.team === team && Date.now() - mirrorCerts.at < 3600000) return mirrorCerts.keys;
  const response = await fetcher(team + "/cdn-cgi/access/certs");
  if (!response.ok) throw new Error("certs");
  const data = await response.json();
  mirrorCerts = { team, at: Date.now(), keys: data.keys || [] };
  return mirrorCerts.keys;
}

/** Valida o JWT do Access (assinatura RS256, emissor, público e validade) e devolve o e-mail em minúsculas, ou null. */
export async function verifyAccessJwt(jwt, options = {}) {
  const team = options.team || MIRROR_TEAM;
  const aud = options.aud || MIRROR_AUD;
  const fetcher = options.fetcher || fetch;
  try {
    const parts = String(jwt || "").split(".");
    if (parts.length !== 3) return null;
    const header = JSON.parse(new TextDecoder().decode(mirrorFromB64u(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(mirrorFromB64u(parts[1])));
    if (header.alg !== "RS256") return null;
    let jwk = (await mirrorAccessKeys(team, fetcher)).find(key => key.kid === header.kid);
    if (!jwk) jwk = (await mirrorAccessKeys(team, fetcher, true)).find(key => key.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, mirrorFromB64u(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
    if (!valid) return null;
    const now = Math.floor((options.now ?? Date.now()) / 1000);
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    if (payload.iss !== team) return null;
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (audiences.indexOf(aud) === -1) return null;
    return typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

const pemToDer = pem => mirrorFromB64u(pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));

/** Cria o custom token do Firebase para o e-mail informado. A claim mirrorEmail é a que firestore.rules confere. */
export async function signFirebaseToken(account, email, now = Date.now()) {
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(account.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email));
  const hex = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
  const iat = Math.floor(now / 1000);
  const header = mirrorB64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = mirrorB64u(JSON.stringify({ iss: account.client_email, sub: account.client_email, aud: FIREBASE_AUDIENCE, iat, exp: iat + 3600, uid: "access-" + hex.slice(0, 24), claims: { mirrorEmail: email } }));
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(header + "." + body));
  return header + "." + body + "." + mirrorB64u(signature);
}

/** Rota GET /api/mirror-token (já atrás do Cloudflare Access). */
export async function mirrorToken(req, env, options = {}) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) return mirrorJson({ error: "not_configured" }, 501);
  const email = await verifyAccessJwt(req.headers.get("Cf-Access-Jwt-Assertion"), options);
  if (!email) return mirrorJson({ error: "unauthorized" }, 401);
  const allowed = (env.MIRROR_EMAILS ? String(env.MIRROR_EMAILS).split(",").map(item => item.trim().toLowerCase()) : MIRROR_EMAILS);
  if (allowed.indexOf(email) === -1) return mirrorJson({ error: "forbidden" }, 403);
  let account;
  try { account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT); } catch { return mirrorJson({ error: "bad_service_account" }, 500); }
  try { return mirrorJson({ token: await signFirebaseToken(account, email, options.now), email, expiresIn: 3600 }); }
  catch { return mirrorJson({ error: "sign_failed" }, 500); }
}
