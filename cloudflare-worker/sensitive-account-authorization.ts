import { isVerifiedAccountBinding, verifyFirebaseIdToken } from "./identity-verification";

export type VerifiedAccessPrincipal = { subject: string; email?: string };
export type VerifiedBinding = {
  firebaseUid: string;
  accessSubject: string;
  verifiedAt: number;
  revokedAt?: number | null;
};
export type BindingLookup = (firebaseUid: string, accessSubject: string) => Promise<VerifiedBinding | null>;

export type SensitiveIdentityResult =
  | { authorized: true; firebaseUid: string; accessSubject: string }
  | { authorized: false; reason: "unauthenticated" | "unlinked" | "verification_unavailable" };

/**
 * Server-only authorization gate for sensitive account operations.
 * accessPrincipal MUST come from cryptographically validated Access JWT claims,
 * never request headers, query strings, email, or browser-supplied JSON.
 * BindingLookup MUST read a previously verified, non-revoked database record.
 * This function does not create links or delete accounts.
 */
export async function authorizeSensitiveAccountAction(input: {
  firebaseIdToken: string;
  accessPrincipal: VerifiedAccessPrincipal | null;
  firebaseProjectId: string;
  lookup: BindingLookup;
  fetcher?: typeof fetch;
  now?: number;
}): Promise<SensitiveIdentityResult> {
  if (!input.accessPrincipal?.subject || !input.firebaseIdToken) {
    return { authorized: false, reason: "unauthenticated" };
  }
  const firebase = await verifyFirebaseIdToken(input.firebaseIdToken, input.firebaseProjectId, {
    fetcher: input.fetcher,
    now: input.now,
  });
  if (!firebase) return { authorized: false, reason: "unauthenticated" };
  try {
    const binding = await input.lookup(firebase.uid, input.accessPrincipal.subject);
    if (!isVerifiedAccountBinding(firebase.uid, input.accessPrincipal.subject, binding)) {
      return { authorized: false, reason: "unlinked" };
    }
    return { authorized: true, firebaseUid: firebase.uid, accessSubject: input.accessPrincipal.subject };
  } catch {
    return { authorized: false, reason: "verification_unavailable" };
  }
}
