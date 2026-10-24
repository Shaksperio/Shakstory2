// Autoria e procedência: TOTP (Google Authenticator) + registro de versões com hash encadeado. Ver docs/AUTORIA.md.
export type XuriStatus = { configured?: boolean; enrolled: boolean; confirmed: boolean; unlockedUntil: string | null; recoveryLeft: number; signingKey?: { keyId: string; publicKey: string; createdAt: string } | null; error?: string };
export type XuriVersion = { seq: number; contentHash: string; entryHash: string; bytes: number; note: string | null; createdAt: string; stamped?: boolean; signed?: boolean };
export type XuriHistory = { registered: boolean; workId?: string; published?: boolean; publicName?: string | null; title?: string; chain?: { valid: boolean; brokenAt: number | null }; matchesCurrent?: boolean; versions: XuriVersion[] };

async function call<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch("/api/xuri/" + path, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!response.ok) throw Object.assign(new Error(data.message || data.error || `Falha (HTTP ${response.status})`), { code: data.error, status: response.status });
  return data as T;
}

export const xuriStatus = () => call<XuriStatus>("status");
export const xuriEnroll = () => call<{ secret: string; otpauthUrl: string }>("totp/enroll", {});
export const xuriConfirm = (code: string) => call<{ recoveryCodes: string[]; unlockedUntil: string }>("totp/confirm", { code });
export const xuriUnlock = (code: string) => call<{ unlockedUntil: string; recoveryLeft: number }>("unlock", { code });
export const xuriRevoke = (code: string) => call<{ ok: true }>("totp/revoke", { code });
export const xuriRegister = (bookId: string, note: string) => call<{ ok: true; seq: number; unchanged?: boolean; contentHash: string; message?: string }>("register", { bookId, note });
export const xuriRegisterKey = (publicKey: string) => call<{ keyId: string }>("key", { publicKey });
export const xuriRevokeKey = () => call<{ ok: true }>("key/revoke", {});
export const xuriPrepare = (bookId: string) => call<{ unchanged?: boolean; message?: string; seq: number; createdAt: string; entryPayload: string; keyId: string | null }>("prepare", { bookId });
export const xuriRegisterSigned = (bookId: string, note: string, createdAt: string, signature: string) => call<{ ok: true; seq: number; signed: boolean }>("register", { bookId, note, createdAt, signature });
export const xuriStamp = (bookId: string) => call<{ stamped: number; pending: number }>("stamp", { bookId });
export const xuriDossier = (bookId: string) => call<Record<string, unknown>>("dossier?bookId=" + encodeURIComponent(bookId));
export const xuriHistory = (bookId: string) => call<XuriHistory>("history?bookId=" + encodeURIComponent(bookId));
export const xuriPublish = (bookId: string, publish: boolean, displayName = "") => call<{ ok: true; published: boolean; publicName?: string | null }>("publish", { bookId, publish, displayName });
