export type PassportKey = {
  keyId: string;
  algorithm?: string;
  publicKey?: string;
  publicKeySpkiBase64?: string | null;
  createdAt?: string;
  revokedAt?: string | null;
};

export type PassportVersion = {
  seq: number;
  createdAt: string;
  note?: string | null;
  contentHash: string;
  prevHash: string;
  entryHash: string;
  entryPayload: string;
  timestamp?: unknown;
  signature?: { keyId?: string; alg?: string; sig?: string } | null;
};

export type Passport = {
  protocol?: string;
  generatedAt?: string;
  account?: string;
  work?: { id?: string; bookId?: string; title?: string };
  chain?: { valid?: boolean; brokenAt?: number | null };
  keys?: PassportKey[];
  versions?: PassportVersion[];
};

export type SignatureCheck = "valid" | "invalid" | "absent" | "unsupported" | "missing-key";
export type KeyStatus = "active" | "revoked" | "unknown";
export type VersionCheck = {
  seq: number;
  chain: boolean;
  payload: boolean;
  signature: SignatureCheck;
  keyStatus: KeyStatus;
  keyId: string | null;
};

export type PassportResult = {
  checks: VersionCheck[];
  integrityOK: boolean;
  signatureSummary: "unsigned" | "valid" | "partial" | "invalid" | "unverifiable";
  signedCount: number;
  validSignatureCount: number;
  absentSignatureCount: number;
  revokedKeyCount: number;
};

const bytesToHex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
const decode64 = (value: string) => {
  const raw = atob(value);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const HASH_RE = /^[a-f0-9]{64}$/i;

async function sha256(text: string) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

/**
 * Checks the dossier's internal integrity and Ed25519 signatures.
 * This deliberately does not validate RFC 3161 tokens or prove a civil identity.
 */
export async function verifyPassport(passport: Passport): Promise<PassportResult> {
  if (passport.protocol !== "xuri-1" || !Array.isArray(passport.versions) || !passport.work?.id) {
    throw new Error("Este arquivo não parece um dossiê X-URI protocol xuri-1.");
  }
  if (passport.versions.length === 0) {
    throw new Error("O dossiê não contém versões para verificar.");
  }

  const keys = new Map((passport.keys || []).map((key) => [key.keyId, key]));
  const checks: VersionCheck[] = [];
  let previous = "0".repeat(64);

  for (let index = 0; index < passport.versions.length; index++) {
    const version = passport.versions[index];
    const seq = Number.isSafeInteger(version.seq) && version.seq === index + 1;
    const hashesWellFormed = HASH_RE.test(version.contentHash) && HASH_RE.test(version.prevHash) && HASH_RE.test(version.entryHash);
    let payloadOK = false;

    try {
      if (typeof version.entryPayload !== "string" || !version.entryPayload) throw new Error("payload ausente");
      const parsed = JSON.parse(version.entryPayload);
      payloadOK = parsed.protocol === "xuri-1"
        && parsed.work === passport.work.id
        && parsed.seq === version.seq
        && parsed.content === version.contentHash
        && parsed.prev === version.prevHash
        && parsed.at === version.createdAt
        && HASH_RE.test(version.contentHash)
        && HASH_RE.test(version.prevHash)
        && HASH_RE.test(version.entryHash)
        && (await sha256(version.entryPayload)).toLowerCase() === version.entryHash.toLowerCase();
    } catch {
      payloadOK = false;
    }

    const chainOK = seq && hashesWellFormed && version.prevHash.toLowerCase() === previous.toLowerCase();
    let signature: SignatureCheck = "absent";
    let keyStatus: KeyStatus = "unknown";
    const keyId = version.signature?.keyId ? String(version.signature.keyId) : null;

    if (version.signature?.sig) {
      const key = keyId ? keys.get(keyId) : undefined;
      if (!key) {
        signature = "missing-key";
      } else {
        keyStatus = key.revokedAt ? "revoked" : key.createdAt ? "active" : "unknown";
        if (!key.publicKey || String(version.signature.alg || "").toLowerCase() !== "ed25519") {
          signature = "unsupported";
        } else {
          try {
            const rawKey = decode64(key.publicKey);
            const sig = decode64(version.signature.sig);
            if (rawKey.length !== 32 || sig.length !== 64) {
              signature = "unsupported";
            } else {
              const publicKey = await crypto.subtle.importKey("raw", rawKey, { name: "Ed25519" }, false, ["verify"]);
              signature = await crypto.subtle.verify("Ed25519", publicKey, sig, new TextEncoder().encode(version.entryPayload)) ? "valid" : "invalid";
            }
          } catch {
            signature = "unsupported";
          }
        }
      }
    }

    checks.push({ seq: version.seq, chain: chainOK, payload: payloadOK, signature, keyStatus, keyId });
    previous = version.entryHash;
  }

  const signed = checks.filter((check) => check.signature !== "absent");
  const validSignatureCount = checks.filter((check) => check.signature === "valid").length;
  const absentSignatureCount = checks.filter((check) => check.signature === "absent").length;
  const revokedKeyCount = checks.filter((check) => check.keyStatus === "revoked").length;
  const anyInvalid = checks.some((check) => check.signature === "invalid");
  const anyUnverifiable = checks.some((check) => ["unsupported", "missing-key"].includes(check.signature));

  let signatureSummary: PassportResult["signatureSummary"];
  if (signed.length === 0) signatureSummary = "unsigned";
  else if (anyInvalid) signatureSummary = "invalid";
  else if (anyUnverifiable) signatureSummary = "unverifiable";
  else if (absentSignatureCount > 0) signatureSummary = "partial";
  else signatureSummary = "valid";

  return {
    checks,
    integrityOK: checks.every((check) => check.chain && check.payload),
    signatureSummary,
    signedCount: signed.length,
    validSignatureCount,
    absentSignatureCount,
    revokedKeyCount,
  };
}
