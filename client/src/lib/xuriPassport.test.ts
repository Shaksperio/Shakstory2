import { webcrypto } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { verifyPassport, type Passport, type PassportVersion } from "./xuriPassport";

beforeAll(() => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
});

const toBase64 = (bytes: ArrayBuffer | Uint8Array) => Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString("base64");
const toHex = (bytes: ArrayBuffer) => Buffer.from(bytes).toString("hex");
const sha256 = async (text: string) => toHex(await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));

async function makeDossier(options: { signed?: boolean; revoked?: boolean; badSignature?: boolean; missingKey?: boolean } = {}) {
  const createdAt = "2026-10-23T12:00:00.000Z";
  const contentHash = "a".repeat(64);
  const prevHash = "0".repeat(64);
  const payload = JSON.stringify({ protocol: "xuri-1", work: "work-1", seq: 1, content: contentHash, prev: prevHash, at: createdAt });
  const entryHash = await sha256(payload);
  let signature: PassportVersion["signature"] = null;
  let keys: NonNullable<Passport["keys"]> = [];

  if (options.signed) {
    const pair = await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
    const rawPublic = await webcrypto.subtle.exportKey("raw", pair.publicKey);
    const sig = await webcrypto.subtle.sign("Ed25519", pair.privateKey, new TextEncoder().encode(payload));
    signature = { keyId: "key-1", alg: "ed25519", sig: toBase64(sig) };
    if (options.badSignature) signature.sig = toBase64(new Uint8Array(64));
    if (!options.missingKey) keys = [{ keyId: "key-1", algorithm: "ed25519", publicKey: toBase64(rawPublic), createdAt, revokedAt: options.revoked ? "2026-10-23T13:00:00.000Z" : null }];
  }

  return {
    protocol: "xuri-1",
    generatedAt: createdAt,
    work: { id: "work-1", title: "Livro de teste" },
    keys,
    versions: [{ seq: 1, createdAt, contentHash, prevHash, entryHash, entryPayload: payload, timestamp: null, signature }],
  } satisfies Passport;
}

describe("verificador do X-URI Passaporte v1", () => {
  it("identifica dossiê sem assinatura como não assinado", async () => {
    const result = await verifyPassport(await makeDossier());
    expect(result.integrityOK).toBe(true);
    expect(result.signatureSummary).toBe("unsigned");
    expect(result.absentSignatureCount).toBe(1);
  });

  it("confirma uma assinatura Ed25519 válida", async () => {
    const result = await verifyPassport(await makeDossier({ signed: true }));
    expect(result.signatureSummary).toBe("valid");
    expect(result.checks[0].signature).toBe("valid");
  });

  it("detecta assinatura inválida", async () => {
    const result = await verifyPassport(await makeDossier({ signed: true, badSignature: true }));
    expect(result.signatureSummary).toBe("invalid");
    expect(result.checks[0].signature).toBe("invalid");
  });

  it("distingue chave pública ausente de assinatura ausente", async () => {
    const result = await verifyPassport(await makeDossier({ signed: true, missingKey: true }));
    expect(result.signatureSummary).toBe("unverifiable");
    expect(result.checks[0].signature).toBe("missing-key");
  });

  it("mostra revogação separadamente da validade criptográfica histórica", async () => {
    const result = await verifyPassport(await makeDossier({ signed: true, revoked: true }));
    expect(result.checks[0].signature).toBe("valid");
    expect(result.checks[0].keyStatus).toBe("revoked");
    expect(result.revokedKeyCount).toBe(1);
  });

  it("detecta alteração no payload e na cadeia", async () => {
    const dossier = await makeDossier();
    dossier.versions![0].entryPayload = dossier.versions![0].entryPayload.replace("work-1", "work-2");
    const result = await verifyPassport(dossier);
    expect(result.integrityOK).toBe(false);
    expect(result.checks[0].payload).toBe(false);
  });

  it("rejeita dossiê vazio", async () => {
    const dossier = await makeDossier();
    dossier.versions = [];
    await expect(verifyPassport(dossier)).rejects.toThrow("não contém versões");
  });
});
