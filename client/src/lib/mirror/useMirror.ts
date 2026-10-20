import { useCallback, useEffect, useRef, useState } from "react";
import type { KV } from "../sync/kv";
import type { LibraryLike } from "../sync/merge";
import { CONTINGENCY } from "../contingency";
import { MIRROR_MIN_INTERVAL_MS, currentMirrorUser, mirrorIO, pullMirror, readMirrorState, signInMirror, signInMirrorWithAccess, signOutMirror, type MirrorUser } from "./firebase";
import { syncWithMirror } from "./mirrorSync";
import { savePendingMirror, readPendingMirror, clearPendingMirror } from "./pending";
import { stableStringify } from "../sync/hash";
import type { MergeReport } from "../sync/merge";

const ENABLED_KEY = "shakstory:mirror-enabled";
const flag = (value?: "1" | "0") => {
  try {
    if (value === undefined) return localStorage.getItem(ENABLED_KEY) === "1";
    localStorage.setItem(ENABLED_KEY, value);
  } catch { /* armazenamento indisponível */ }
  return value === "1";
};
const explicitlyOff = () => { try { return localStorage.getItem(ENABLED_KEY) === "0"; } catch { return false; } };
const explain = (error: unknown) => {
  const code = String((error as { code?: string } | undefined)?.code ?? "");
  if (error instanceof Error && error.message === "SYNC_ACCOUNT_CHANGED") return "Outra conta foi conectada neste navegador. A sincronização foi bloqueada para proteger os manuscritos locais; não houve envio para a nova conta.";
  if (code.indexOf("popup-closed") !== -1 || code.indexOf("cancelled") !== -1) return "Login cancelado.";
  if (code.indexOf("unauthorized-domain") !== -1) return "Este endereço ainda não está autorizado para entrar com o Google. Avise o administrador.";
  if (code.indexOf("permission-denied") !== -1) return "A cópia na nuvem recusou a gravação. Avise o administrador.";
  if (code.indexOf("popup-blocked") !== -1) return "O navegador bloqueou a janela de login. Libere pop-ups para este site.";
  return "Não foi possível falar com a cópia na nuvem agora.";
};

export type MirrorApi = ReturnType<typeof useMirror>;

/** Na contingência o espelho é a fonte de verdade: grava com mais frequência. */
const MIN_INTERVAL = CONTINGENCY ? 15000 : MIRROR_MIN_INTERVAL_MS;

export function useMirror(getKv: () => KV, onMerged?: () => ((doc: LibraryLike, report: MergeReport) => void) | undefined) {
  const [user, setUser] = useState<MirrorUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(() => (CONTINGENCY ? !flag() : false));
  const [sdkFailed, setSdkFailed] = useState(false);
  const [error, setError] = useState("");
  const [lastAt, setLastAt] = useState<number | undefined>();
  /** Maior numeração de edição já enviada com sucesso (para o estado "sincronização concluída" não confirmar alterações mais novas). */
  const [syncedSeq, setSyncedSeq] = useState(0);
  const [remoteEmpty, setRemoteEmpty] = useState<boolean | null>(null);
  const userRef = useRef<MirrorUser | null>(null);
  const lastPush = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef<{ library: LibraryLike; seq?: number } | undefined>(undefined);
  const syncing = useRef(false);
  const pendingWrite = useRef<Promise<unknown>>(Promise.resolve());
  const again = useRef<{ library: LibraryLike; seq?: number } | undefined>(undefined);
  userRef.current = user;

  useEffect(() => {
    if (CONTINGENCY && !flag()) return;
    let cancelled = false;
    (async () => {
      try {
        let found = await currentMirrorUser();
        // Endereço principal: quem entrou pelo Cloudflare Access recebe a credencial do Firebase sem popup do Google.
        if (!found && !CONTINGENCY && navigator.onLine && !explicitlyOff()) found = await signInMirrorWithAccess().catch(() => null);
        if (found && !CONTINGENCY) flag("1");
        if (!cancelled) { setUser(found); setReady(true); }
      } catch { if (!cancelled) { setSdkFailed(true); setReady(true); } }
    })();
    void readMirrorState(getKv()).then(state => { if (!cancelled && state) setLastAt(state.at); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  /** Lê o espelho, mescla com a biblioteca daqui e grava o resultado. Se o espelho trouxe algo novo, avisa quem chamou. */
  const sync = useCallback(async (library: LibraryLike, seq?: number): Promise<boolean> => {
    const who = userRef.current;
    if (!who || !navigator.onLine) return false;
    if (syncing.current) { again.current = { library, seq }; return false; }
    syncing.current = true;
    setBusy(true);
    let ok = false;
    try {
      await pendingWrite.current;
      if (userRef.current?.uid !== who.uid) throw new Error("SYNC_ACCOUNT_CHANGED");
      const result = await syncWithMirror(getKv(), mirrorIO(getKv(), who), library);
      await pendingWrite.current;
      const pending = await readPendingMirror(getKv(), who);
      if (pending?.revision && stableStringify(pending.library) === stableStringify(library)) {
        await clearPendingMirror(getKv(), who, pending.revision);
        if (latest.current && stableStringify(latest.current.library) === stableStringify(library)) latest.current = undefined;
      }
      lastPush.current = Date.now();
      setLastAt(lastPush.current);
      setRemoteEmpty(result.stamp === null);
      setError("");
      if (seq !== undefined) setSyncedSeq(current => Math.max(current, seq));
      ok = true;
      if (result.changedLocal) onMerged?.()?.(result.doc, result.report);
    } catch (failure) {
      setError(explain(failure));
      // Keep the latest unsent manuscript in memory for a reconnect retry.
      // Never retry an identity conflict automatically.
      if (!(failure instanceof Error && failure.message === "SYNC_ACCOUNT_CHANGED")) latest.current = { library, seq };
    }
    finally {
      syncing.current = false; setBusy(false);
      // uma alteração chegou durante o envio: manda a versão mais nova em seguida
      const next = again.current; again.current = undefined;
      if (next && userRef.current?.uid === who.uid) void sync(next.library, next.seq);
    }
    return ok;
  }, []);

  /** Chamado depois que o D1 confirmou. Respeita o intervalo mínimo e guarda a versão mais recente para o fim da espera. */
  const requestPush = useCallback((library: LibraryLike, seq?: number) => {
    if (!userRef.current) return;
    latest.current = { library, seq };
    const who = userRef.current;
    if (who) pendingWrite.current = pendingWrite.current.catch(() => {}).then(() => savePendingMirror(getKv(), who, library, seq)).catch(() => {
      setError("Não foi possível guardar a fila de sincronização no IndexedDB.");
    });
    const wait = lastPush.current + MIN_INTERVAL - Date.now();
    if (wait <= 0) { void sync(library, seq); return; }
    if (timer.current !== undefined) return;
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      if (latest.current) void sync(latest.current.library, latest.current.seq);
    }, wait);
  }, [sync]);

  // Restore only the authenticated Firebase identity's pending edits after a reload.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void readPendingMirror(getKv(), user).then(pending => {
      if (cancelled || !pending || userRef.current?.uid !== user.uid) return;
      latest.current = { library: pending.library, seq: pending.seq };
      if (navigator.onLine) void sync(pending.library, pending.seq);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user?.uid, sync]);

  // When connectivity returns, retry only the latest pending local edit.
  // The mirror identity guard still runs before any remote write.
  useEffect(() => {
    const retryOnline = () => {
      const pending = latest.current;
      if (!pending || !userRef.current || syncing.current) return;
      void sync(pending.library, pending.seq);
    };
    window.addEventListener("online", retryOnline);
    return () => window.removeEventListener("online", retryOnline);
  }, [sync]);

  const connect = useCallback(async (library?: LibraryLike, seq?: number) => {
    setBusy(true); setError("");
    try {
      const who = await signInMirror();
      flag("1"); setUser(who); userRef.current = who;
      if (library) { syncing.current = false; await sync(library, seq); }
    } catch (failure) { setError(explain(failure)); }
    finally { setBusy(false); }
  }, [sync]);

  const disconnect = useCallback(async () => {
    flag("0");
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = undefined;
    latest.current = undefined;
    again.current = undefined;
    try { await signOutMirror(); } catch { /* já desconectado */ }
    setUser(null); userRef.current = null;
  }, []);

  const restore = useCallback(async (): Promise<LibraryLike | null> => {
    const who = userRef.current;
    if (!who) return null;
    setBusy(true); setError("");
    try { return await pullMirror(who); }
    catch (failure) { setError(explain(failure)); return null; }
    finally { setBusy(false); }
  }, []);

  return { user, busy, ready, sdkFailed, error, lastAt, syncedSeq, remoteEmpty, connect, disconnect, requestPush, sync, restore };
}
