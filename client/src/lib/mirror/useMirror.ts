import { useCallback, useEffect, useRef, useState } from "react";
import type { KV } from "../sync/kv";
import type { LibraryLike } from "../sync/merge";
import { MIRROR_MIN_INTERVAL_MS, currentMirrorUser, pullMirror, pushMirror, readMirrorState, signInMirror, signOutMirror, type MirrorUser } from "./firebase";

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

export function useMirror(getKv: () => KV) {
  const [user, setUser] = useState<MirrorUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastAt, setLastAt] = useState<number | undefined>();
  const userRef = useRef<MirrorUser | null>(null);
  const lastPush = useRef(0);
  const timer = useRef<number | undefined>();
  const latest = useRef<LibraryLike | undefined>();
  userRef.current = user;

  useEffect(() => {
    if (!flag() || !navigator.onLine) return;
    let cancelled = false;
    void currentMirrorUser().then(found => { if (!cancelled) setUser(found); }).catch(() => {});
    void readMirrorState(getKv()).then(state => { if (!cancelled && state) setLastAt(state.at); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const pushNow = useCallback(async (library: LibraryLike) => {
    const who = userRef.current;
    if (!who || !navigator.onLine) return;
    setBusy(true);
    try {
      await pushMirror(getKv(), library, who);
      lastPush.current = Date.now();
      setLastAt(lastPush.current);
      setError("");
    } catch (failure) { setError(explain(failure)); }
    finally { setBusy(false); }
  }, []);

  /** Chamado depois que o D1 confirmou. Respeita o intervalo mínimo e guarda a versão mais recente para o fim da espera. */
  const requestPush = useCallback((library: LibraryLike) => {
    if (!userRef.current) return;
    latest.current = library;
    const wait = lastPush.current + MIRROR_MIN_INTERVAL_MS - Date.now();
    if (wait <= 0) { void pushNow(library); return; }
    if (timer.current !== undefined) return;
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      if (latest.current) void pushNow(latest.current);
    }, wait);
  }, [pushNow]);

  const connect = useCallback(async (library?: LibraryLike) => {
    setBusy(true); setError("");
    try {
      const who = await signInMirror();
      flag("1"); setUser(who); userRef.current = who;
      if (library) { await pushMirror(getKv(), library, who); lastPush.current = Date.now(); setLastAt(lastPush.current); }
    } catch (failure) { setError(explain(failure)); }
    finally { setBusy(false); }
  }, []);

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

  return { user, busy, error, lastAt, connect, disconnect, requestPush, restore };
}
