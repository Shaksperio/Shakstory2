import React, { useState } from "react";
import { Link } from "wouter";

type Passport = {
  protocol?: string;
  generatedAt?: string;
  account?: string;
  work?: { id?: string; bookId?: string; title?: string };
  chain?: { valid?: boolean; brokenAt?: number | null };
  keys?: Array<{ keyId: string; algorithm?: string; publicKey?: string; publicKeySpkiBase64?: string; createdAt?: string; revokedAt?: string | null }>;
  versions?: Array<{
    seq: number; createdAt: string; note?: string | null; contentHash: string; prevHash: string; entryHash: string;
    entryPayload: string; timestamp?: unknown; signature?: { keyId?: string; alg?: string; sig?: string } | null;
  }>;
};

type Check = { seq: number; chain: boolean; payload: boolean; signature: "valid" | "invalid" | "absent" | "unsupported" };

const bytesToHex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, "0")).join("");
const decode64 = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));

async function sha256(text: string) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

async function verifyPassport(passport: Passport): Promise<Check[]> {
  if (passport.protocol !== "xuri-1" || !Array.isArray(passport.versions) || !passport.work?.id) {
    throw new Error("Este arquivo não parece um dossiê X-URI protocol xuri-1.");
  }
  const keys = new Map((passport.keys || []).map(key => [key.keyId, key]));
  const checks: Check[] = [];
  let previous = "0".repeat(64);
  for (let index = 0; index < passport.versions.length; index++) {
    const version = passport.versions[index];
    let payload = false;
    try {
      const parsed = JSON.parse(version.entryPayload);
      payload = parsed.protocol === "xuri-1"
        && parsed.work === passport.work.id
        && parsed.seq === version.seq
        && parsed.content === version.contentHash
        && parsed.prev === version.prevHash
        && parsed.at === version.createdAt
        && await sha256(version.entryPayload) === version.entryHash;
    } catch { payload = false; }
    const chain = version.seq === index + 1 && version.prevHash === previous;
    let signature: Check["signature"] = "absent";
    if (version.signature?.sig) {
      const key = keys.get(String(version.signature.keyId || ""));
      if (!key?.publicKey || version.signature.alg !== "ed25519") signature = "unsupported";
      else {
        try {
          const publicKey = await crypto.subtle.importKey("raw", decode64(key.publicKey), { name: "Ed25519" }, false, ["verify"]);
          signature = await crypto.subtle.verify("Ed25519", publicKey, decode64(version.signature.sig), new TextEncoder().encode(version.entryPayload)) ? "valid" : "invalid";
        } catch { signature = "unsupported"; }
      }
    }
    checks.push({ seq: version.seq, chain, payload, signature });
    previous = version.entryHash;
  }
  return checks;
}

export default function XuriPassportVerify() {
  const [passport, setPassport] = useState<Passport | null>(null);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(file?: File) {
    if (!file) return;
    setBusy(true); setError(""); setPassport(null); setChecks(null);
    try {
      const parsed = JSON.parse(await file.text()) as Passport;
      const results = await verifyPassport(parsed);
      setPassport(parsed); setChecks(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível verificar este arquivo.");
    } finally { setBusy(false); }
  }

  const integrityOK = !!checks?.length && checks.every(c => c.chain && c.payload);
  const signaturesOK = !!checks?.length && checks.every(c => c.signature === "valid" || c.signature === "absent");
  return <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
    <Link href="/" className="text-sm text-primary underline">← Voltar ao Shakstory</Link>
    <header className="mt-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">X-URI · Passaporte v1</p>
      <h1 className="mt-2 font-serif text-3xl sm:text-4xl">Verificação de procedência</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">Confira localmente a integridade da cadeia e as assinaturas Ed25519 de um dossiê exportado pelo Shakstory. O arquivo é processado neste navegador e não é enviado para um servidor.</p>
    </header>
    <section className="mt-6 rounded-2xl border border-border bg-card p-4 sm:p-6">
      <label className="block text-sm font-medium" htmlFor="passport-file">Arquivo de passaporte (.json)</label>
      <input id="passport-file" className="mt-2 block w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground" type="file" accept="application/json,.json" disabled={busy} onChange={e => void load(e.target.files?.[0])} />
      {busy && <p className="mt-3 text-sm" role="status">Verificando integridade e assinaturas…</p>}
      {error && <p className="mt-3 rounded-lg border border-destructive/40 p-3 text-sm" role="alert">{error}</p>}
      {passport && checks && <>
        <div className="mt-5 rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Obra</p>
          <h2 className="mt-1 text-lg font-semibold break-words">{passport.work?.title || "Sem título"}</h2>
          <p className="mt-1 break-all text-xs text-muted-foreground">ID: {passport.work?.id}</p>
          <p className="mt-2 text-sm">{checks.length} versão(ões) · protocolo {passport.protocol}</p>
          <p className="mt-1 text-xs text-muted-foreground">Dossiê gerado em {passport.generatedAt ? new Date(passport.generatedAt).toLocaleString("pt-BR") : "data não informada"}</p>
        </div>
        <div className="mt-4 rounded-xl border border-border p-4">
          <h2 className="font-semibold">Resultado local</h2>
          <p className="mt-2 text-sm">{integrityOK ? "Integridade dos payloads e encadeamento: conferidos." : "Falha de integridade: há payload, hash ou elo da cadeia que não confere."}</p>
          <p className="mt-1 text-sm">{signaturesOK ? "Assinaturas: nenhuma assinatura inválida detectada." : "Há assinatura inválida ou não verificável; confira os detalhes por versão."}</p>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Este resultado não valida criptograficamente os tokens RFC 3161. Para confirmar o carimbo externo, verifique o arquivo .tsr com OpenSSL e o certificado confiável da autoridade. Uma assinatura válida demonstra correspondência com a chave pública incluída no dossiê; não prova, sozinha, a identidade civil do autor. A cadeia também não prova que o texto foi escrito por quem registrou.</p>
        </div>
        <h2 className="mt-6 font-semibold">Versões</h2>
        <ol className="mt-2 space-y-3">{checks.map((check, i) => {
          const version = passport.versions![i];
          return <li key={check.seq} className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong>Versão {check.seq}</strong><span className="text-xs text-muted-foreground">{version.createdAt ? new Date(version.createdAt).toLocaleString("pt-BR") : "Data ausente"}</span></div>
            {version.note && <p className="mt-1 break-words text-sm">{version.note}</p>}
            <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              <div><dt className="text-muted-foreground">Hash do registro</dt><dd className="break-all">{version.entryHash}</dd></div>
              <div><dt className="text-muted-foreground">Hash do conteúdo</dt><dd className="break-all">{version.contentHash}</dd></div>
            </dl>
            <ul className="mt-3 space-y-1 text-sm">
              <li>{check.chain ? "✓" : "✗"} Elo da cadeia</li>
              <li>{check.payload ? "✓" : "✗"} Payload e SHA-256</li>
              <li>{check.signature === "valid" ? "✓ Assinatura Ed25519 válida" : check.signature === "absent" ? "— Sem assinatura Ed25519" : check.signature === "invalid" ? "✗ Assinatura Ed25519 inválida" : "⚠ Assinatura presente, mas não verificável neste navegador"}</li>
              <li>{version.timestamp ? "Carimbo RFC 3161 incluído (validação externa necessária)" : "Sem carimbo RFC 3161"}</li>
            </ul>
          </li>;
        })}</ol>
      </>}
    </section>
    <p className="mt-5 text-xs leading-5 text-muted-foreground">Privacidade: o arquivo é lido por este navegador. Nenhum upload automático é realizado. A verificação depende de navegador com WebCrypto e suporte a Ed25519.</p>
  </main>;
}
