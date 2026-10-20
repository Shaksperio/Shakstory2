import { verifyAccessJwt } from "./mirror-token.js";
import { findLinkedGoogleIdentity } from "./account-identity-link.js";
import { deletionPreflight } from "./deletion-preflight.js";

const respond = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

/**
 * Integration adapter for the *existing* Worker fetch handler.
 * Must be invoked before the legacy shakGate handler, but only for this exact route.
 * It is read-only. No deletion endpoint is installed.
 * Caller must set configured Firebase project ID and Turnstile credentials.
 */
export async function handleAccountDeletionPreflight(req, env, options = {}) {
  if (req.method !== "POST") return respond({ error: "method_not_allowed" }, 405);
  if (!env?.DB || !env?.FIREBASE_PROJECT_ID || !env?.TURNSTILE_SECRET_KEY || !env?.TURNSTILE_SITE_KEY) {
    return respond({ error: "not_configured" }, 503);
  }
  const origin = req.headers.get("Origin");
  if (origin && origin !== new URL(req.url).origin) return respond({ error: "invalid_origin" }, 403);
  const accessEmail = await verifyAccessJwt(req.headers.get("Cf-Access-Jwt-Assertion"), options.access || {});
  if (!accessEmail) return respond({ error: "unauthorized" }, 401);
  const bodyText = await req.text();
  if (bodyText.length > 4096) return respond({ error: "payload_too_large" }, 413);
  let body;
  try { body = JSON.parse(bodyText); } catch { return respond({ error: "invalid_json" }, 400); }
  const user = await env.DB.prepare("SELECT email FROM shak_users WHERE email = ?").bind(accessEmail).first();
  if (!user) return respond({ eligible: false, reason: "account_not_found" }, 403);
  const linked = await findLinkedGoogleIdentity(env.DB, accessEmail);
  if (!linked || linked.google_email !== accessEmail) return respond({ eligible: false, reason: "identity_unlinked" }, 403);
  // Shakstory's D1 users table currently has no display-name column.
  // Fail closed until a canonical, server-stored display name is available.
  if (!user.display_name) return respond({ eligible: false, reason: "display_name_unavailable" }, 403);
  const result = await deletionPreflight(req, env, {
    email: user.email, name: user.display_name, googleUid: linked.google_uid, accountStatus: "active",
  }, body, { ...options, firebase: { ...options.firebase, projectId: env.FIREBASE_PROJECT_ID } });
  return respond(result, result.eligible ? 200 : 403);
}
