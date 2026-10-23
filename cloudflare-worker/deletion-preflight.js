import { verifyDeletionEligibility } from "./deletion-eligibility.js";
import { confirmDeletionIntent, verifyDeletionTurnstile } from "./deletion-confirmation.js";

/**
 * Read-only preflight. Does not change account state, mint a deletion token or erase data.
 * Account row must be fetched by a trusted Access identity and contain a pre-linked Google UID.
 * This deliberately fails closed in GitHub Pages until a secure Access-to-Google linking flow exists.
 */
export async function deletionPreflight(req, env, account, input, options = {}) {
  if (!account || !input || !confirmDeletionIntent({
    typedName: input.typedName,
    accountName: account.name,
    acknowledged: input.acknowledged,
  })) return { eligible: false, reason: "confirmation_required" };
  const identity = await verifyDeletionEligibility(req, account, options);
  if (!identity.eligible) return identity;
  const host = new URL(req.url).hostname;
  if (!env?.TURNSTILE_SECRET_KEY || !env?.TURNSTILE_SITE_KEY) return { eligible: false, reason: "captcha_not_configured" };
  const valid = await verifyDeletionTurnstile(input.turnstileToken, env.TURNSTILE_SECRET_KEY, {
    fetcher: options.fetcher || fetch,
    hostname: host,
  });
  if (!valid) return { eligible: false, reason: "captcha_failed" };
  return { eligible: true, reason: "preflight_only", deletionExecuted: false };
}
