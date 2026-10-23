// Chave de assinatura do autor (Ed25519), gerada e usada só no navegador. A chave privada fica cifrada com a frase-senha
// (PBKDF2 + AES-GCM) neste aparelho; o servidor só recebe a chave pública. Sem a frase e sem o backup, não há como recuperá-la.
const STORE = "shak:xuri-key";
const ITERATIONS = 600000;
export type StoredKey = { v: 1; publicKey: string; salt: string; iv: string; data: string; createdAt: string };

const b64 = (bytes: ArrayBuffer | Uint8Array) => { const view = new Uint8Array(bytes); let text = ""; for (let i = 0; i < view.length; i++) text += String.fromCharCode(view[i]); return btoa(text); };
// Os tipos do TypeScript ainda não cobrem Ed25519 em todas as sobrecargas do WebCrypto.
const subtle = crypto.subtle as unknown as { generateKey(algorithm: { name: string }, extractable: boolean, usages: string[]): Promise<CryptoKey | CryptoKeyPair> };
const unb64 = (text: string) => Uint8Array.from(atob(text), ch => ch.charCodeAt(0));

export async function ed25519Supported(): Promise<boolean> {
  try { await subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"]); return true; } catch { return false; }
}

async function wrapKey(passphrase: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  // Copy into an ArrayBuffer-backed view: newer TypeScript DOM types reject ArrayBufferLike/SharedArrayBuffer as BufferSource.
  const saltBuffer = new Uint8Array(salt).buffer as ArrayBuffer;
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: saltBuffer, iterations: ITERATIONS, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export function readStoredKey(): StoredKey | null {
  try { const parsed = JSON.parse(localStorage.getItem(STORE) ?? "null"); return parsed && parsed.v === 1 && parsed.publicKey ? parsed : null; } catch { return null; }
}
export function saveStoredKey(key: StoredKey) { localStorage.setItem(STORE, JSON.stringify(key)); }
export function parseBackup(text: string): StoredKey {
  const parsed = JSON.parse(text) as StoredKey;
  if (!parsed || parsed.v !== 1 || !parsed.publicKey || !parsed.salt || !parsed.iv || !parsed.data) throw new Error("Arquivo de backup inválido.");
  return parsed;
}

/** Gera o par de chaves, guarda a privada cifrada neste aparelho e devolve a chave pública (base64) e o arquivo de backup. */
export async function createSigningKey(passphrase: string): Promise<{ publicKey: string; backup: string }> {
  if (passphrase.length < 8) throw new Error("Use uma frase-senha com pelo menos 8 caracteres.");
  const pair = await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await wrapKey(passphrase, salt), await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const stored: StoredKey = { v: 1, publicKey: b64(await crypto.subtle.exportKey("raw", pair.publicKey)), salt: b64(salt), iv: b64(iv), data: b64(data), createdAt: new Date().toISOString() };
  saveStoredKey(stored);
  return { publicKey: stored.publicKey, backup: JSON.stringify(stored, null, 2) };
}

/** Assina o texto exato do registro com a chave guardada. Falha se a frase-senha estiver errada. */
export async function signText(passphrase: string, text: string): Promise<string> {
  const stored = readStoredKey();
  if (!stored) throw new Error("Esta chave não está neste aparelho. Importe o arquivo de backup.");
  let pkcs8: ArrayBuffer;
  try { pkcs8 = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(stored.iv) }, await wrapKey(passphrase, unb64(stored.salt)), unb64(stored.data)); }
  catch { throw new Error("Frase-senha incorreta."); }
  const key = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, false, ["sign"]);
  return b64(await crypto.subtle.sign("Ed25519", key, new TextEncoder().encode(text)));
}
