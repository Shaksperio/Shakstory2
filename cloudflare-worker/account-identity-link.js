import { verifyAccessJwt } from "./mirror-token.js";
import { verifyGoogleFirebaseIdToken } from "./google-identity.js";
import { verifiedAccountEmailsMatch } from "./account-identity.js";

const failure = reason => ({ ok: false, reason });
/**
 * Link two independently verified identities. Called only behind Access and CSRF protection.
 * canonicalEmail MUST be obtained from the authenticated D1 account, not request JSON.
 * Unique constraints prevent two Access accounts from claiming one Google UID.
 * This helper does not create accounts, change manuscript records or delete data.
 */
export async function linkGoogleIdentity(req, db, canonicalEmail, options = {}) {
  if (!db || !canonicalEmail || req.method !== "POST") return failure("invalid_request");
  const accessEmail = await verifyAccessJwt(req.headers.get("Cf-Access-Jwt-Assertion"), options.access || {});
  const bearer = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(req.headers.get("Authorization") || "")?.[1];
  const google = bearer ? await verifyGoogleFirebaseIdToken(bearer, options.firebase || {}) : null;
  if (!google || !accessEmail || !verifiedAccountEmailsMatch({
    accessEmail, firebaseEmail: google.email, d1Email: canonicalEmail, firebaseEmailVerified: true,
  })) return failure("identity_mismatch");
  const now = Math.floor((options.now ?? Date.now()) / 1000);
  if (!Number.isFinite(google.authTime) || google.authTime > now || now - google.authTime > 300) return failure("reauth_required");
  try {
    const existing = await db.prepare("SELECT access_email, google_uid FROM shak_account_identity_links WHERE access_email = ? OR google_uid = ?")
      .bind(accessEmail, google.uid).all();
    if (existing.results?.some(row => row.access_email !== accessEmail || row.google_uid !== google.uid)) return failure("already_linked");
    if (existing.results?.length) return { ok: true, linked: true, existing: true };
    await db.prepare("INSERT INTO shak_account_identity_links (access_email, google_uid, google_email, linked_at, verified_at) VALUES (?, ?, ?, ?, ?)")
      .bind(accessEmail, google.uid, google.email, now, now).run();
    return { ok: true, linked: true, existing: false };
  } catch {
    // Unique constraints also protect against concurrent attempts.
    return failure("link_unavailable");
  }
}

/** Read by authenticated Access email only. Never look up an account by browser-supplied email. */
export async function findLinkedGoogleIdentity(db, accessEmail) {
  if (!db || !accessEmail) return null;
  try {
    return await db.prepare("SELECT google_uid, google_email FROM shak_account_identity_links WHERE access_email = ?")
      .bind(accessEmail).first();
  } catch { return null; }
}
