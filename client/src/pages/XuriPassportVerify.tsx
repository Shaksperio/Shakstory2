import React, { useState } from "react";
import { Link } from "wouter";
import { verifyPassport, type Passport, type PassportResult, type VersionCheck } from "@/lib/xuriPassport";

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
  const [passport, setPassport] = useState<Passport | null>(null);
  const [result, setResult] = useState<PassportResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  async function lookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    if (!term) { setError("Informe o UID da obra/versão ou o SHA-256."); return; }
    setBusy(true); setError(""); setPassport(null); setResult(null);
    try {
      const response = await fetch(`/api/xuri/public/lookup?q=${encodeURIComponent(term)}`, { headers: { Accept: "application/json" } });
      if (response.status === 404) throw new Error("Nenhum passaporte público encontrado para esta consulta.");
      if (response.status === 400) throw new Error("UID ou SHA-256 em formato inválido.");
      if (response.status === 429) throw new Error("Muitas consultas em sequência. Aguarde e tente novamente.");
      if (!response.ok) throw new Error("A consulta pública está indisponível no momento.");
      const data = await response.json() as Passport & { passport?: Passport };
      const parsed = data.passport || data;
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
      const parsed = JSON.parse(await file.text()) as Passport;
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
      <p className="mt-3 text-sm leading-6 text-muted-foreground">Confira localmente a integridade da cadeia e as assinaturas Ed25519 de um dossiê exportado pelo Shakstory. O arquivo é processado neste navegador e não é enviado para um servidor.</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Atenção: o dossiê exportado inclui o e-mail associado à conta. Antes de compartilhar o arquivo, confira os dados pessoais que ele contém.</p>
    </header>
    <section className="mt-6 rounded-2xl border border-border bg-card p-4 sm:p-6">\n      <form onSubmit={e => void lookup(e)} className="mb-6 rounded-xl border border-border p-4">\n        <label htmlFor="passport-query" className="block text-sm font-semibold">Consultar passaporte público</label>\n        <p className="mt-1 text-xs text-muted-foreground">Pesquise pelo UID da obra/versão ou pelo SHA-256 publicado.</p>\n        <div className="mt-3 flex flex-col gap-2 sm:flex-row">\n          <input id="passport-query" value={query} onChange={e => setQuery(e.target.value)} placeholder="book-… ou hash SHA-256" className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm" disabled={busy} />\n          <button type="submit" disabled={busy || !query.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? "Consultando…" : "Consultar"}</button>\n        </div>\n      </form>
      <details className="mb-4"><summary className="cursor-pointer text-sm font-medium">Ou verificar um dossiê JSON local</summary>\n      <label className="mt-3 block text-sm font-medium" htmlFor="passport-file">Arquivo de passaporte (.json)</label>
      <input id="passport-file" className="mt-2 block w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground" type="file" accept="application/json,.json" disabled={busy} onChange={e => void load(e.target.files?.[0])} />
      </details>\n      {busy && <p className="mt-3 text-sm" role="status">Consultando e verificando integridade e assinaturas…</p>}
      {error && <p className="mt-3 rounded-lg border border-destructive/40 p-3 text-sm" role="alert">{error}</p>}
      {passport && result && <>
        <div className="mt-5 rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Obra</p>
          <h2 className="mt-1 text-lg font-semibold break-words">{passport.work?.title || "Sem título"}</h2>
          <p className="mt-1 break-all text-xs text-muted-foreground">ID: {passport.work?.id}</p>
          <p className="mt-2 text-sm">{result.checks.length} versão(ões) · protocolo {passport.protocol}</p>
          <p className="mt-1 text-xs text-muted-foreground">Dossiê gerado em {passport.generatedAt ? new Date(passport.generatedAt).toLocaleString("pt-BR") : "data não informada"}</p>
        </div>
        <div className="mt-4 rounded-xl border border-border p-4">
          <h2 className="font-semibold">Resultado local</h2>
          <p className="mt-2 text-sm">{integrityOK ? "Integridade dos payloads, hashes e encadeamento: conferidos." : "Falha de integridade: há payload, hash ou elo da cadeia que não confere."}</p>
          <p className="mt-2 text-sm">{signatureSummary(result)}</p>
          {result.revokedKeyCount > 0 && <p className="mt-2 text-sm">Atenção: {result.revokedKeyCount} versão(ões) usam chave atualmente marcada como revogada. Isso é um estado separado da verificação matemática da assinatura.</p>}
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Este resultado não valida criptograficamente os tokens RFC 3161. Um token incluído significa apenas que há dados de carimbo no dossiê; a validação requer OpenSSL e um certificado confiável da autoridade. Uma assinatura válida demonstra que a chave privada correspondente à chave pública incluída assinou o payload; não prova, sozinha, identidade civil ou quem escreveu o texto. A cadeia não é, por si só, prova de que o histórico nunca foi reconstruído.</p>
        </div>
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
