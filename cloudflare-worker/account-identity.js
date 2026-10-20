/** Identidade vinculada: nunca autorizar somente por e-mail enviado pelo navegador. */
export function normalizeVerifiedEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 320 || /[\s\u0000-\u001f]/.test(email) || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) return null;
  return email;
}

/**
 * Usar apenas identidades extraídas de tokens verificados no servidor:
 * - Cloudflare Access JWT (assinatura, aud, iss, exp)
 * - Firebase ID token (assinatura Google, aud, iss, exp, email_verified)
 * - e-mail canônico da conta D1, consultado pelo identificador autenticado.
 */
export function verifiedAccountEmailsMatch({ accessEmail, firebaseEmail, d1Email, firebaseEmailVerified }) {
  const access = normalizeVerifiedEmail(accessEmail);
  const firebase = normalizeVerifiedEmail(firebaseEmail);
  const d1 = normalizeVerifiedEmail(d1Email);
  return firebaseEmailVerified === true && Boolean(access && firebase && d1 && access === firebase && access === d1);
}
