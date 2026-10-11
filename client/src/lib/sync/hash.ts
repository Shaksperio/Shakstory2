// Hash de conteúdo. O D1 calcula o `sha` como SHA-256 de JSON.stringify(data); o cliente usa o
// mesmo cálculo para reconhecer uma gravação que já chegou ao servidor (idempotência).
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** JSON com chaves ordenadas: dois objetos iguais geram o mesmo texto, qualquer que seja a ordem das chaves. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(item => stableStringify(item === undefined ? null : item)).join(",") + "]";
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).filter(key => record[key] !== undefined).sort();
  return "{" + keys.map(key => JSON.stringify(key) + ":" + stableStringify(record[key])).join(",") + "}";
}
