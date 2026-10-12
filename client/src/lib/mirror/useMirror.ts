import { useCallback, useEffect, useRef, useState } from "react";
import type { KV } from "../sync/kv";
import type { LibraryLike } from "../sync/merge";
import { CONTINGENCY } from "../contingency";
import { MIRROR_MIN_INTERVAL_MS, currentMirrorUser, mirrorIO, pullMirror, readMirrorState, signInMirror, signOutMirror, type MirrorUser } from "./firebase";
import { syncWithMirror } from "./mirrorSync";
import type { MergeReport } from "../sync/merge";

const ENABLED_KEY = "shakstory:mirror-enabled";
const flag = (value?: "1" | "0") => {
  try {
    if (value === undefined) return localStorage.getItem(ENABLED_KEY) === "1";
    localStorage.setItem(ENABLED_KEY, value);
  } catch { /* armazenamento indisponível */ }
  return value === "1";
};
const explain = (error: unknown) => {
  const code = String((error as { code?: string } | undefined)?.code ?? "");
  if (code.indexOf("popup-closed") !== -1 || code.indexOf("cancelled") !== -1) return "Login cancelado.";
  if (code.indexOf("unauthorized-domain") !== -1) return "Este endereço ainda não está autorizado no Firebase (Authentication → Settings → Authorized domains).";
  if (code.indexOf("permission-denied") !== -1) return "O Firestore recusou a gravação. Publique as regras do arquivo firestore.rules.";
  if (code.indexOf("popup-blocked") !== -1) return "O navegador bloqueou a janela de login. Libere pop-ups para este site.";
  return "Não foi possível falar com o Firebase agora.";
};

export type MirrorApi = ReturnType<typeof useMirror>;

/** Na contingência o espelho é a fonte de verdade: grava com mais frequência. */
const MIN_INTERVAL = CONTINGENCY ? 15000 : MIRROR_MIN_INTERVAL_MS;

export function useMirror(getKv: () => KV, onMerged?: () => ((doc: LibraryLike, report: MergeReport) => void) | undefined) {
  const [user, setUser] = useState<MirrorUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(() => !flag());
  const [sdkFailed, setSdkFailed] = useState(false);
  const [error, setError] = useState("");
  const [lastAt, setLastAt] = useState<number | undefined>();
  const userRef = useRef<MirrorUser | null>(null);
  const lastPush = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef<LibraryLike | undefined>(undefined);
  const syncing = useRef(false);
  userRef.current = user;

  useEffect(() => {
    if (!flag()) return;
    let cancelled = false;
    void currentMirrorUser().then(found => { if (!cancelled) { setUser(found); setReady(true); } }).catch(() => { if (!cancelled) { setSdkFailed(true); setReady(true); } });
    void readMirrorState(getKv()).then(state => { if (!cancelled && state) setLastAt(state.at); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  /** Lê o espelho, mescla com a biblioteca daqui e grava o resultado. Se o espelho trouxe algo novo, avisa quem chamou. */
  const sync = useCallback(async (library: LibraryLike) => {
    const who = userRef.current;
    if (!who || !navigator.onLine || syncing.current) return;
    syncing.current = true;
    setBusy(true);
    try {
      const result = await syncWithMirror(getKv(), mirrorIO(getKv(), who), library);
      lastPush.current = Date.now();
      setLastAt(lastPush.current);
      setError("");
      if (result.changedLocal) onMerged?.()?.(result.doc, result.report);
    } catch (failure) { setError(explain(failure)); }
    finally { syncing.current = false; setBusy(false); }
  }, []);

  /** Chamado depois que o D1 confirmou. Respeita o intervalo mínimo e guarda a versão mais recente para o fim da espera. */
  const requestPush = useCallback((library: LibraryLike) => {
    if (!userRef.current) return;
    latest.current = library;
    const wait = lastPush.current + MIN_INTERVAL - Date.now();
    if (wait <= 0) { void sync(library); return; }
    if (timer.current !== undefined) return;
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      if (latest.current) void sync(latest.current);
    }, wait);
  }, [sync]);

  const connect = useCallback(async (library?: LibraryLike) => {
    setBusy(true); setError("");
    try {
      const who = await signInMirror();
      flag("1"); setUser(who); userRef.current = who;
      if (library) { syncing.current = false; await sync(library); }
    } catch (failure) { setError(explain(failure)); }
    finally { setBusy(false); }
  }, [sync]);

  const disconnect = useCallback(async () => {
    flag("0");
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

  return { user, busy, ready, sdkFailed, error, lastAt, connect, disconnect, requestPush, sync, restore };
}
