import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSigningKey, ed25519Supported, parseBackup, readStoredKey, saveStoredKey, signText } from "@/lib/xuriKey";
import { xuriConfirm, xuriEnroll, xuriDossier, xuriHistory, xuriPrepare, xuriRegister, xuriRegisterKey, xuriRegisterSigned, xuriRevokeKey, xuriStamp, xuriStatus, xuriUnlock, type XuriHistory, type XuriStatus } from "@/lib/xuri";

const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const errorText = (error: unknown) => (error instanceof Error ? error.message : "Não foi possível concluir.");

/** Registro de versões de uma obra, protegido pelo Google Authenticator. Não é certidão de autoria. */
export function AuthorshipDialog({ bookId, title, onClose }: { bookId: string; title: string; onClose: () => void }) {
  const [status, setStatus] = useState<XuriStatus | null>(null);
  const [history, setHistory] = useState<XuriHistory | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [supported, setSupported] = useState(true);
  const [stored, setStored] = useState(readStoredKey());
  useEffect(() => { void ed25519Supported().then(setSupported); }, []);

  const reload = useCallback(async () => {
    try {
      const next = await xuriStatus(); setStatus(next);
      if (next.configured !== false) setHistory(await xuriHistory(bookId));
    } catch (error) { setMessage(errorText(error)); }
  }, [bookId]);
  useEffect(() => { void reload(); }, [reload]);

  const run = async (job: () => Promise<void>) => { setBusy(true); setMessage(""); try { await job(); } catch (error) { setMessage(errorText(error)); } finally { setBusy(false); setCode(""); } };
  const download = () => run(async () => {
    const dossier = await xuriDossier(bookId);
    const url = URL.createObjectURL(new Blob([JSON.stringify(dossier, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `dossie-autoria-${bookId}.json`; link.click(); URL.revokeObjectURL(url);
  });
  const saveBackup = (text: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "chave-autoria-shakstory.json"; link.click(); URL.revokeObjectURL(url);
  };
  const keyHere = !!(status?.signingKey && stored && stored.publicKey === status.signingKey.publicKey);
  const register = () => run(async () => {
    if (status?.signingKey) {
      if (!keyHere) throw new Error("A chave de assinatura não está neste aparelho. Importe o backup abaixo.");
      const prep = await xuriPrepare(bookId);
      if (prep.unchanged) { setMessage("Nada mudou desde a última versão registrada."); return; }
      const signature = await signText(pass, prep.entryPayload);
      const done = await xuriRegisterSigned(bookId, note, prep.createdAt, signature);
      setMessage(`Versão ${done.seq} registrada e assinada.`);
    } else {
      const done = await xuriRegister(bookId, note);
      setMessage(done.unchanged ? "Nada mudou desde a última versão registrada." : `Versão ${done.seq} registrada.`);
    }
    setNote(""); setPass(""); await reload();
  });
  const unlocked = !!status?.unlockedUntil && Date.parse(status.unlockedUntil) > Date.now();

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Autoria e procedência">
    <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-background p-5 shadow-xl">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Autoria e procedência</p><h2 className="mt-1 font-serif text-2xl">{title}</h2></div><Button size="sm" variant="ghost" aria-label="Fechar" onClick={onClose}>✕</Button></div>
      <p className="mt-2 text-xs text-muted-foreground">Cada registro guarda a impressão digital (hash) do livro como está salvo no servidor, ligada ao registro anterior e à data do servidor. Isso protege o histórico contra alterações e ajuda numa disputa, mas <strong>não é uma certidão de autoria</strong>: não prova quem escreveu o texto.</p>
      {message && <p role="alert" className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs">{message}</p>}

      {status?.configured === false || status?.error === "xuri_not_configured"
        ? <p className="mt-4 text-sm">A proteção de autoria ainda não foi ativada neste servidor.</p>
        : recovery
          ? <div className="mt-4"><h3 className="text-sm font-semibold">Guarde seus códigos de recuperação</h3><p className="mt-1 text-xs text-muted-foreground">Cada código vale uma vez e serve se você perder o celular. Eles não serão mostrados de novo.</p><ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm">{recovery.map(item => <li key={item}>{item}</li>)}</ul><Button className="mt-3" size="sm" onClick={() => { setRecovery(null); void reload(); }}>Já guardei</Button></div>
          : !status?.confirmed
            ? <div className="mt-4">
              <h3 className="text-sm font-semibold">1. Ativar o Google Authenticator</h3>
              {!setup
                ? <Button className="mt-2" size="sm" disabled={busy} onClick={() => void run(async () => setSetup(await xuriEnroll()))}>Gerar chave</Button>
                : <>
                  <p className="mt-2 text-xs">No app, toque em <strong>+</strong> → <strong>Inserir chave de configuração</strong> e digite esta chave (conta: Shakstory, tipo: baseado em tempo):</p>
                  <p className="mt-2 break-all rounded-md border bg-muted p-2 font-mono text-sm select-all">{setup.secret}</p>
                  <p className="mt-1 text-xs"><a className="underline" href={setup.otpauthUrl}>Abrir direto no autenticador (celular)</a></p>
                  <label className="mt-3 block text-xs">Código de 6 dígitos<Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} /></label>
                  <Button className="mt-2" size="sm" disabled={busy || code.length !== 6} onClick={() => void run(async () => { const done = await xuriConfirm(code); setSetup(null); setRecovery(done.recoveryCodes); })}>Confirmar</Button>
                </>}
            </div>
            : <div className="mt-4">
              {!unlocked
                ? <><h3 className="text-sm font-semibold">Digite o código do autenticador</h3>
                  <label className="mt-2 block text-xs">Código de 6 dígitos (ou de recuperação)<Input autoComplete="one-time-code" maxLength={9} value={code} onChange={e => setCode(e.target.value)} /></label>
                  <Button className="mt-2" size="sm" disabled={busy || code.length < 6} onClick={() => void run(async () => { await xuriUnlock(code); await reload(); })}>Liberar por 15 minutos</Button></>
                : <><h3 className="text-sm font-semibold">Registrar uma versão agora</h3>
                  <label className="mt-2 block text-xs">Nota (opcional)<Input maxLength={200} value={note} onChange={e => setNote(e.target.value)} placeholder="Ex.: primeira versão completa" /></label>
                  {status?.signingKey && <label className="mt-2 block text-xs">Frase-senha da sua chave de assinatura<Input type="password" autoComplete="off" value={pass} onChange={e => setPass(e.target.value)} /></label>}
                  <Button className="mt-2" size="sm" disabled={busy || (!!status?.signingKey && !pass)} onClick={() => void register()}>{status?.signingKey ? "Assinar e registrar versão" : "Registrar versão"}</Button>
                  <p className="mt-1 text-[11px] text-muted-foreground">O registro usa o que já foi sincronizado com o servidor. Espere o aviso de salvo antes de registrar.</p></>}
            </div>}

      {status?.confirmed && <section className="mt-5 border-t pt-3" aria-label="Chave de assinatura">
        <h3 className="text-sm font-semibold">Chave de assinatura (opcional, recomendada)</h3>
        {!supported ? <p className="mt-1 text-xs text-muted-foreground">Este navegador ainda não suporta assinatura Ed25519. Use um Chrome, Firefox ou Safari atualizado.</p>
          : !status.signingKey
            ? <><p className="mt-1 text-xs text-muted-foreground">Com a chave, cada registro passa a ser assinado por você, no seu navegador. O Shakstory guarda só a chave pública e não consegue assinar em seu nome. A chave privada fica neste aparelho, protegida pela frase-senha. <strong>Se perder a frase-senha e o backup, não há como recuperá-la.</strong></p>
              {unlocked ? <>
                <label className="mt-2 block text-xs">Frase-senha (mín. 8 caracteres)<Input type="password" autoComplete="new-password" value={pass} onChange={e => setPass(e.target.value)} /></label>
                <label className="mt-2 block text-xs">Repita a frase-senha<Input type="password" autoComplete="new-password" value={pass2} onChange={e => setPass2(e.target.value)} /></label>
                <Button className="mt-2" size="sm" disabled={busy || pass.length < 8 || pass !== pass2} onClick={() => void run(async () => { const made = await createSigningKey(pass); await xuriRegisterKey(made.publicKey); setStored(readStoredKey()); saveBackup(made.backup); setPass(""); setPass2(""); setMessage("Chave criada. O arquivo de backup foi baixado: guarde-o em lugar seguro, separado da frase-senha."); await reload(); })}>Criar chave e baixar backup</Button></>
                : <p className="mt-2 text-xs">Libere com o código do autenticador (acima) para criar a chave.</p>}</>
            : <>
              <p className="mt-1 text-xs">{keyHere ? "Chave ativa neste aparelho." : "Há uma chave cadastrada, mas ela não está neste aparelho."} <span className="font-mono text-[10px]">{status.signingKey.keyId}</span></p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {keyHere && stored && <Button size="sm" variant="outline" onClick={() => saveBackup(JSON.stringify(stored, null, 2))}>Baixar backup da chave</Button>}
                {!keyHere && <label className="text-xs">Importar backup<input type="file" accept="application/json" className="mt-1 block text-xs" onChange={event => { const file = event.target.files?.[0]; if (!file) return; void file.text().then(text => { const backup = parseBackup(text); if (backup.publicKey !== status.signingKey?.publicKey) throw new Error("Este backup é de outra chave."); saveStoredKey(backup); setStored(backup); setMessage("Chave importada."); }).catch(error => setMessage(errorText(error))); }} /></label>}
                {unlocked && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(async () => { await xuriRevokeKey(); await reload(); })}>Revogar chave</Button>}
              </div></>}
      </section>}

      {history?.registered && <section className="mt-5 border-t pt-3" aria-label="Histórico de registros">
        <h3 className="text-sm font-semibold">Histórico</h3>
        <p className="mt-1 text-xs">{history.chain?.valid ? "Cadeia íntegra." : `Cadeia quebrada na versão ${history.chain?.brokenAt}.`} {history.matchesCurrent ? "O livro atual é igual à última versão registrada." : "O livro mudou desde a última versão registrada."}</p>
        <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => void download()}>Baixar dossiê</Button>{history.versions.some(version => !version.stamped) && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => { const done = await xuriStamp(bookId); setMessage(done.pending ? `${done.pending} registro(s) sem carimbo: a autoridade não respondeu. Tente mais tarde.` : "Carimbos de tempo obtidos."); await reload(); })}>Carimbar pendentes</Button>}</div>
        <ol className="mt-2 space-y-1 text-xs">{[...history.versions].reverse().map(version => <li key={version.seq} className="rounded-md border p-2"><strong>Versão {version.seq}</strong> · {fmt(version.createdAt)}{version.note ? ` · ${version.note}` : ""} · {version.signed ? "assinada" : "sem assinatura"} · {version.stamped ? "carimbo de tempo externo" : "sem carimbo externo"}<br /><span className="break-all font-mono text-[10px] text-muted-foreground">{version.contentHash}</span></li>)}</ol>
      </section>}
    </div></div>;
}
