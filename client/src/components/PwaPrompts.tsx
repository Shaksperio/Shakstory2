import React, { useEffect, useState, useSyncExternalStore } from "react";
import { applyUpdate, getPwaState, promptInstall, startPwa, subscribePwa } from "@/pwa/register";

const DISMISS_KEY = "shakstory:install-dismissed";
const readDismissed = () => { try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; } };

// Avisos discretos: "Nova versão disponível" e "Instalar no aparelho".
export function PwaPrompts() {
  const state = useSyncExternalStore(subscribePwa, getPwaState, getPwaState);
  const [dismissed, setDismissed] = useState(readDismissed);
  useEffect(() => { startPwa(); }, []);

  if (state.updateReady) {
    return (
      <div role="status" className="fixed inset-x-3 top-3 z-[90] mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-lg">
        <span>Nova versão do Shakstory disponível.</span>
        <button type="button" className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground" onClick={applyUpdate}>Atualizar</button>
      </div>
    );
  }
  if (state.installable && !state.installed && !dismissed) {
    return (
      <div role="status" className="fixed inset-x-3 bottom-20 z-[90] mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-lg lg:bottom-4">
        <span>Instalar o Shakstory neste aparelho para escrever offline.</span>
        <span className="flex shrink-0 gap-2">
          <button type="button" className="rounded-md px-2 py-1.5 text-muted-foreground" onClick={() => { try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* opcional */ } setDismissed(true); }}>Agora não</button>
          <button type="button" className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground" onClick={() => void promptInstall()}>Instalar</button>
        </span>
      </div>
    );
  }
  return null;
}
