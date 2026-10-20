/** Verify Firebase ID tokens at the server boundary; never trust email from the client. */
export type FirebaseIdentity = { uid: string; email?: string; emailVerified: boolean };
type Jwk = JsonWebKey & { kid?: string };
const decode = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")), char => char.charCodeAt(0));
};
export async function verifyFirebaseIdToken(token: string, projectId: string, options: {
  fetcher?: typeof fetch; now?: number;
} = {}): Promise<FirebaseIdentity | null> {
  try {
    if (!/^[a-z0-9-]{6,100}$/i.test(projectId)) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const now = Math.floor((options.now ?? Date.now()) / 1000);
    if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) return null;
    if (claims.aud !== projectId || claims.iss !== "https://securetoken.google.com/" + projectId) return null;
    if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 128) return null;
    if (typeof claims.exp !== "number" || claims.exp <= now || typeof claims.iat !== "number" || claims.iat > now) return null;
    if (typeof claims.auth_time !== "number" || claims.auth_time > now) return null;
    const fetcher = options.fetcher ?? fetch;
    const response = await fetcher("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
    if (!response.ok) return null;
    const jwks = await response.json() as { keys?: Jwk[] };
    const jwk = jwks.keys?.find(key => key.kid === header.kid && key.kty === "RSA");
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decode(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]))) return null;
    return { uid: claims.sub, email: typeof claims.email === "string" ? claims.email : undefined, emailVerified: claims.email_verified === true };
  } catch { return null; }
}
/** Account linking requires a persisted, explicitly verified binding of immutable provider IDs. */
export function isVerifiedAccountBinding(
  firebaseUid: string, accessSubject: string,
  binding: { firebaseUid: string; accessSubject: string; verifiedAt: number; revokedAt?: number | null } | null,
): boolean {
  return !!binding && !!firebaseUid && !!accessSubject &&
    binding.firebaseUid === firebaseUid && binding.accessSubject === accessSubject &&
    Number.isFinite(binding.verifiedAt) && binding.verifiedAt > 0 && !binding.revokedAt;
}
