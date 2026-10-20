// Firebase ID token verification for a real Google login, never a Worker-issued custom token.
// Uses Google's Firebase Secure Token public keys, pinned project and issuer.
const CERT_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const decode = value => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - padded.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
};
const parse = value => JSON.parse(new TextDecoder().decode(decode(value)));
const validEmail = value => typeof value === "string" && value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value.toLowerCase() : null;

/** Returns verified Google identity or null. Rejects Firebase custom-token users and other providers. */
export async function verifyGoogleFirebaseIdToken(token, { projectId = "shakstory-93bb1", fetcher = fetch, now = Date.now() } = {}) {
  try {
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
    const certificates = await response.json();
    const pem = certificates[header.kid];
    if (typeof pem !== "string") return null;
    const base64 = pem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s/g, "");
    const der = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    // X.509 public certificates are not SPKI blobs. WebCrypto cannot import X.509 directly.
    // Fail closed until a tested X.509-to-SPKI extractor is supplied.
    void der;
    return null;
  } catch { return null; }
}
