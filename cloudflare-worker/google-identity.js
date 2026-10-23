// Firebase ID token verification for a real Google login, never a Worker-issued custom token.
// Uses Google's Firebase Secure Token public keys, pinned project and issuer.
const CERT_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const decode = value => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - padded.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
};
const parse = value => JSON.parse(new TextDecoder().decode(decode(value)));
const validEmail = value => typeof value === "string" && value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value.toLowerCase() : null;

/** Returns verified Google identity or null. Rejects Firebase custom-token users and other providers. */
export async function verifyGoogleFirebaseIdToken(token, { projectId, fetcher = fetch, now = Date.now() } = {}) {
  try {
    if (typeof projectId !== "string" || !/^[a-z][a-z0-9-]{4,60}$/.test(projectId)) return null;
    const parts = String(token || "").split(".");
    if (parts.length !== 3 || parts.some(part => !part)) return null;
    const header = parse(parts[0]);
    const claims = parse(parts[1]);
    if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
    const seconds = Math.floor(now / 1000);
    if (claims.aud !== projectId || claims.iss !== "https://securetoken.google.com/" + projectId ||
        typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 128 ||
        typeof claims.exp !== "number" || claims.exp <= seconds ||
        typeof claims.iat !== "number" || claims.iat > seconds ||
        typeof claims.auth_time !== "number" || claims.auth_time > seconds ||
        claims.email_verified !== true || claims.firebase?.sign_in_provider !== "google.com") return null;
    const email = validEmail(claims.email);
    if (!email) return null;
    const response = await fetcher(CERT_URL);
    if (!response.ok) return null;
    const jwks = await response.json();
    const jwk = Array.isArray(jwks.keys) ? jwks.keys.find(key => key.kid === header.kid && key.kty === "RSA") : null;
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const verified = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decode(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
    return verified ? { email, uid: claims.sub, authTime: claims.auth_time, provider: "google.com" } : null;
  } catch { return null; }
}
