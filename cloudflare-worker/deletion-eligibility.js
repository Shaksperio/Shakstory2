import { verifyAccessJwt } from "./mirror-token.js";
import { verifyGoogleFirebaseIdToken } from "./google-identity.js";
import { verifiedAccountEmailsMatch } from "./account-identity.js";

/**
 * Guard for a future D1-backed eligibility endpoint.
 * d1Account must be fetched by trusted Access identity, never by client-provided email.
 * googleUid must have been linked after a verified dual-login ceremony.
 * Does not delete data or grant permissions by itself.
 */
export async function verifyDeletionEligibility(req, d1Account, options = {}) {
  const accessEmail = await verifyAccessJwt(req.headers.get("Cf-Access-Jwt-Assertion"), options.access || {});
  const authorization = req.headers.get("Authorization") || "";
  const firebaseToken = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(authorization)?.[1];
  const google = firebaseToken ? await verifyGoogleFirebaseIdToken(firebaseToken, options.firebase || {}) : null;
  if (!accessEmail || !google || !d1Account || !d1Account.googleUid) return { eligible: false, reason: "identity_unverified" };
  if (!verifiedAccountEmailsMatch({
    accessEmail, firebaseEmail: google.email, firebaseEmailVerified: true, d1Email: d1Account.email,
  }) || d1Account.googleUid !== google.uid) return { eligible: false, reason: "identity_mismatch" };
  const now = Math.floor((options.now ?? Date.now()) / 1000);
  if (now - google.authTime > 300 || google.authTime > now) return { eligible: false, reason: "reauth_required" };
  if (d1Account.accountStatus && d1Account.accountStatus !== "active") return { eligible: false, reason: "account_inactive" };
  return { eligible: true, reason: "verified" };
}
