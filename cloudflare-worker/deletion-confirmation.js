/** Independent final confirmation gate. Must run AFTER server-side identity verification. */
export function confirmDeletionIntent({ typedName, accountName, acknowledged }) {
  if (acknowledged !== true || typeof typedName !== "string" || typeof accountName !== "string") return false;
  const expected = accountName.trim().normalize("NFC");
  return expected.length > 0 && expected.length <= 120 && typedName.trim().normalize("NFC") === expected;
}

/** Verify a Cloudflare Turnstile response server-side; never trust a client-side widget alone. */
export async function verifyDeletionTurnstile(token, secret, { fetcher = fetch, remoteip, hostname } = {}) {
  if (!secret || typeof token !== "string" || token.length < 1 || token.length > 2048) return false;
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (remoteip) form.set("remoteip", remoteip);
    const res = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    if (!res.ok) return false;
    const result = await res.json();
    return result.success === true && (!hostname || result.hostname === hostname) && result.action === "delete_account";
  } catch { return false; }
}
