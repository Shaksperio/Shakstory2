import React, { useState } from "react";
import { Link } from "wouter";
import { verifyPassport, type Passport, type PassportResult, type VersionCheck } from "@/lib/xuriPassport";

type PublicExportProof = {
  id?: string;
  seq?: number;
  format?: string;
  fileHash?: string;
  contentHash?: string;
  createdAt?: string;
  payload?: string;
  signature?: { keyId?: string; alg?: string; sig?: string } | null;
};
type PublicPassport = Passport & { exports?: PublicExportProof[] };
type PublicLookupMatch = { kind?: "file" | "version" | "work"; seq?: number };
type PublicLookupResponse = PublicPassport & { passport?: PublicPassport; match?: PublicLookupMatch };

function exportHash(proof: PublicExportProof): string {
  return typeof proof.fileHash === "string" && /^[a-f0-9]{64}$/i.test(proof.fileHash) ? proof.fileHash : "";
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function verifyExportSignature(proof: PublicExportProof, passport: PublicPassport): Promise<"valid" | "invalid" | "unverifiable"> {
  const signature = proof.signature;
  if (!proof.payload || !signature?.sig || !signature.keyId || String(signature.alg || "").toLowerCase() !== "ed25519") return "unverifiable";
  const key = (passport.keys || []).find(candidate => candidate.keyId === signature.keyId);
  if (!key?.publicKey) return "unverifiable";
  try {
    const rawKey = decodeBase64(key.publicKey);
    const sig = decodeBase64(signature.sig);
    if (rawKey.length !== 32 || sig.length !== 64) return "unverifiable";
    const publicKey = await crypto.subtle.importKey("raw", rawKey, { name: "Ed25519" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("Ed25519", publicKey, sig, new TextEncoder().encode(proof.payload));
    return valid ? "valid" : "invalid";
  } catch {
    return "unverifiable";
  }
}

function ExportSignatureStatus({ proof, passport }: { proof: PublicExportProof; passport: PublicPassport }) {
  const [status, setStatus] = useState<"checking" | "valid" | "invalid" | "unverifiable">("checking");
  React.useEffect(() => {
    let active = true;
    void verifyExportSignature(proof, passport).then(value => { if (active) setStatus(value); });
    return () => { active = false; };
  }, [proof, passport]);
  const label = status === "checking" ? "Verificando assinatura…" : status === "valid" ? "✓ Assinatura Ed25519 válida para o payload exibido" : status === "invalid" ? "✗ Assinatura Ed25519 inválida para o payload exibido" : "⚠ Não foi possível verificar a assinatura com os dados/chaves disponíveis";
  return <p className="mt-2 text-sm" role="status">{label}</p>;
}

function signatureSummary(result: PassportResult) {
  switch (result.signatureSummary) {
    case "unsigned": return "Nenhuma versão contém assinatura Ed25519. Este dossiê não confirma assinatura do autor.";
    case "valid": return `Assinaturas Ed25519: ${result.validSignatureCount} de ${result.checks.length} versão(ões) verificadas criptograficamente.`;
    case "partial": return `Assinatura parcial: ${result.validSignatureCount} válida(s), ${result.absentSignatureCount} versão(ões) sem assinatura.`;
    case "invalid": return "Foi detectada ao menos uma assinatura Ed25519 inválida. Não trate este dossiê como integralmente assinado.";
    case "unverifiable": return "Há assinatura(s) que não puderam ser verificadas. Confira se a chave pública e o algoritmo estão disponíveis.";
  }
}

function signatureLabel(check: VersionCheck) {
  if (check.signature === "valid") return "✓ Assinatura Ed25519 válida para a chave pública incluída";
  if (check.signature === "absent") return "— Esta versão não tem assinatura Ed25519";
  if (check.signature === "invalid") return "✗ Assinatura Ed25519 inválida";
  if (check.signature === "missing-key") return "⚠ Assinatura presente, mas a chave pública correspondente não está no dossiê";
  return "⚠ Assinatura presente, mas não verificável neste navegador ou formato";
}

function keyStatusLabel(check: VersionCheck) {
  if (check.signature === "absent") return null;
  if (check.keyStatus === "revoked") return "Chave atualmente revogada (isso não apaga a validade matemática da assinatura histórica)";
  if (check.keyStatus === "active") return "Chave listada como não revogada no dossiê";
  return "Estado da chave desconhecido";
}

export default function XuriPassportVerify() {
  const [passport, setPassport] = useState<PublicPassport | null>(null);
  const [result, setResult] = useState<PassportResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [lookupMatch, setLookupMatch] = useState<PublicLookupMatch | null>(null);

  async function lookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    if (!term) { setError("Informe o UID da obra/versão ou o SHA-256."); return; }
    setBusy(true); setError(""); setPassport(null); setResult(null); setLookupMatch(null);
    try {
      const response = await fetch(`/api/xuri/public/lookup?q=${encodeURIComponent(term)}`, { headers: { Accept: "application/json" } });
      if (response.status === 404) throw new Error("Nenhum passaporte público encontrado para esta consulta.");
      if (response.status === 400) throw new Error("UID ou SHA-256 em formato inválido.");
      if (response.status === 429) throw new Error("Muitas consultas em sequência. Aguarde e tente novamente.");
      if (!response.ok) throw new Error("A consulta pública está indisponível no momento.");
      const data = await response.json() as PublicLookupResponse;
      const parsed = data.passport || data;
      setLookupMatch(data.match || null);
      if (!parsed || parsed.protocol !== "xuri-1" || !parsed.work?.id || !Array.isArray(parsed.versions)) throw new Error("O serviço retornou um passaporte em formato inválido.");
      if (/^[a-f0-9]{64}$/i.test(term)) {
        const foundVersion = parsed.versions.some(v => v.contentHash?.toLowerCase() === term.toLowerCase() || v.entryHash?.toLowerCase() === term.toLowerCase());
        const foundExport = Array.isArray(parsed.exports) && parsed.exports.some(proof => exportHash(proof).toLowerCase() === term.toLowerCase());
        if (!foundVersion && !foundExport) throw new Error("O hash consultado não corresponde a nenhuma versão nem a um arquivo exportado publicado neste passaporte.");
      } else if (parsed.work.id !== term && !parsed.versions.some(v => (v as NonNullable<Passport["versions"]>[number] & { id?: string }).id === term)) {
        throw new Error("O UID consultado não corresponde à obra nem a uma versão deste passaporte.");
      }
      const verification = await verifyPassport(parsed);
      setPassport(parsed); setResult(verification);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível consultar este passaporte.");
    } finally { setBusy(false); }
  }

  async function load(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    setPassport(null);
    setResult(null);
    try {
      const parsed = JSON.parse(await file.text()) as PublicPassport;
      const verification = await verifyPassport(parsed);
      setPassport(parsed);
      setResult(verification);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível verificar este arquivo.");
    } finally {
      setBusy(false);
    }
  }

  const integrityOK = !!result?.integrityOK;
  return <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
    <Link href="/" className="text-sm text-primary underline">← Voltar ao Shakstory</Link>
    <header className="mt-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">X-URI · Passaporte v1</p>
      <h1 className="mt-2 font-serif text-3xl sm:text-4xl">Verificação de procedência</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">Consulte um registro público por UID ou SHA-256, ou confira localmente um dossiê JSON. A consulta envia apenas o identificador pesquisado; o dossiê escolhido manualmente é processado neste navegador.</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Atenção: o dossiê exportado inclui o e-mail associado à conta. Antes de compartilhar o arquivo, confira os dados pessoais que ele contém.</p>
    </header>
    <section className="mt-6 rounded-2xl border border-border bg-card p-4 sm:p-6">
      <form onSubmit={e => void lookup(e)} className="mb-6 rounded-xl border border-border p-4">
        <label htmlFor="passport-query" className="block text-sm font-semibold">Consultar passaporte público</label>
        <p className="mt-1 text-xs text-muted-foreground">Pesquise pelo UID da obra/versão ou pelo SHA-256 publicado.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input id="passport-query" value={query} onChange={e => setQuery(e.target.value)} placeholder="book-… ou hash SHA-256" className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm" disabled={busy} />
          <button type="submit" disabled={busy || !query.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? "Consultando…" : "Consultar"}</button>
        </div>
      </form>
      <details className="mb-4"><summary className="cursor-pointer text-sm font-medium">Ou verificar um dossiê JSON local</summary>
      <label className="mt-3 block text-sm font-medium" htmlFor="passport-file">Arquivo de passaporte (.json)</label>
      <input id="passport-file" className="mt-2 block w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground" type="file" accept="application/json,.json" disabled={busy} onChange={e => void load(e.target.files?.[0])} />
      </details>
      {busy && <p className="mt-3 text-sm" role="status">Consultando e verificando integridade e assinaturas…</p>}
      {error && <p className="mt-3 rounded-lg border border-destructive/40 p-3 text-sm" role="alert">{error}</p>}
      {passport && result && <>
        <div className="mt-5 rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Obra</p>
          <h2 className="mt-1 text-lg font-semibold break-words">{passport.work?.title || "Sem título"}</h2>
          <p className="mt-1 break-all text-xs text-muted-foreground">ID: {passport.work?.id}</p>
          <p className="mt-2 text-sm">{result.checks.length} versão(ões) · protocolo {passport.protocol}</p>
          {lookupMatch?.kind === "file" && <p className="mt-2 text-sm font-medium">Consulta identificada como hash de arquivo exportado{typeof lookupMatch.seq === "number" ? ` · versão vinculada ${lookupMatch.seq}` : ""}.</p>}
          {lookupMatch?.kind === "version" && <p className="mt-2 text-sm font-medium">Consulta identificada como hash de versão.</p>}
          <p className="mt-1 text-xs text-muted-foreground">Dossiê gerado em {passport.generatedAt ? new Date(passport.generatedAt).toLocaleString("pt-BR") : "data não informada"}</p>
        </div>
        <div className="mt-4 rounded-xl border border-border p-4">
          <h2 className="font-semibold">Resultado local</h2>
          <p className="mt-2 text-sm">{integrityOK ? "Integridade dos payloads, hashes e encadeamento: conferidos." : "Falha de integridade: há payload, hash ou elo da cadeia que não confere."}</p>
          <p className="mt-2 text-sm">{signatureSummary(result)}</p>
          {result.revokedKeyCount > 0 && <p className="mt-2 text-sm">Atenção: {result.revokedKeyCount} versão(ões) usam chave atualmente marcada como revogada. Isso é um estado separado da verificação matemática da assinatura.</p>}
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Este resultado não valida criptograficamente os tokens RFC 3161. Um token incluído significa apenas que há dados de carimbo no dossiê; a validação requer OpenSSL e um certificado confiável da autoridade. Uma assinatura válida demonstra que a chave privada correspondente à chave pública incluída assinou o payload; não prova, sozinha, identidade civil ou quem escreveu o texto. A cadeia não é, por si só, prova de que o histórico nunca foi reconstruído.</p>
        </div>
        {Array.isArray(passport.exports) && passport.exports.length > 0 && <section className="mt-6">
          <h2 className="font-semibold">Provas de arquivos exportados</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">O SHA-256 do arquivo identifica os bytes exatos exportados e é distinto do hash do conteúdo da versão. A assinatura Ed25519 abaixo é verificada no navegador contra a chave pública indicada, quando os dados necessários estão disponíveis.</p>
          <ul className="mt-3 space-y-3">{passport.exports.map((proof, index) => {
            const hash = exportHash(proof);
            const key = proof.signature?.keyId ? passport.keys?.find(candidate => candidate.keyId === proof.signature?.keyId) : undefined;
            return <li key={proof.id || hash || index} className="rounded-xl border border-border p-4">
              <p className="text-sm font-semibold">Arquivo exportado {index + 1}{typeof proof.seq === "number" ? ` · versão ${proof.seq}` : ""}</p>
              {hash && <><p className="mt-2 text-xs text-muted-foreground">SHA-256 do arquivo</p><p className="break-all font-mono text-xs">{hash}</p></>}
              {typeof proof.format === "string" && <p className="mt-2 text-sm">Formato: {proof.format}</p>}
              {typeof proof.createdAt === "string" && <p className="mt-1 text-xs text-muted-foreground">Registrado em {new Date(proof.createdAt).toLocaleString("pt-BR")}</p>}
              {typeof proof.contentHash === "string" && <><p className="mt-2 text-xs text-muted-foreground">Hash da versão vinculada (não é o hash do arquivo)</p><p className="break-all font-mono text-xs">{proof.contentHash}</p></>}
              {typeof proof.payload === "string" && <><p className="mt-3 text-xs font-semibold">Payload assinado</p><pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">{proof.payload}</pre></>}
              {proof.signature && <div className="mt-3">
                <p className="text-xs font-semibold">Assinatura Ed25519</p>
                <p className="mt-1 break-all font-mono text-xs">Key ID: {proof.signature.keyId || "não informado"}</p>
                <p className="mt-1 break-all font-mono text-xs">Algoritmo: {proof.signature.alg || "não informado"}</p>
                <p className="mt-1 break-all font-mono text-xs">Assinatura (base64): {proof.signature.sig || "ausente"}</p>
                <p className="mt-2 text-xs">{key?.publicKey ? "Chave pública correspondente incluída no passaporte." : "Chave pública correspondente não encontrada no passaporte."}</p>
              </div>}
              {proof.signature && <ExportSignatureStatus proof={proof} passport={passport} />}
            </li>;
          })}</ul>
        </section>}
        <h2 className="mt-6 font-semibold">Versões</h2>
        <ol className="mt-2 space-y-3">{result.checks.map((check, i) => {
          const version = passport.versions![i];
          return <li key={`${check.seq}-${i}`} className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong>Versão {check.seq}</strong><span className="text-xs text-muted-foreground">{version.createdAt ? new Date(version.createdAt).toLocaleString("pt-BR") : "Data ausente"}</span></div>
            {version.note && <p className="mt-1 break-words text-sm">{version.note}</p>}
            <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              <div><dt className="text-muted-foreground">Hash do registro</dt><dd className="break-all">{version.entryHash}</dd></div>
              <div><dt className="text-muted-foreground">Hash do conteúdo</dt><dd className="break-all">{version.contentHash}</dd></div>
            </dl>
            <ul className="mt-3 space-y-1 text-sm">
              <li>{check.chain ? "✓" : "✗"} Elo da cadeia e sequência</li>
              <li>{check.payload ? "✓" : "✗"} Payload, campos esperados e SHA-256</li>
              <li>{signatureLabel(check)}</li>
              {keyStatusLabel(check) && <li>{keyStatusLabel(check)}</li>}
              <li>{version.timestamp ? "Dados de carimbo RFC 3161 incluídos (não validados criptograficamente aqui)" : "Sem carimbo RFC 3161 incluído"}</li>
            </ul>
          </li>;
        })}</ol>
      </>}
    </section>
    <p className="mt-5 text-xs leading-5 text-muted-foreground">Privacidade: o arquivo é lido por este navegador. Nenhum upload automático é realizado. A verificação depende de navegador com WebCrypto e suporte a Ed25519. Para conferir o hash do conteúdo da obra, conserve o livro original e siga as instruções do dossiê; este manifesto não contém o conteúdo integral.</p>
  </main>;
}
