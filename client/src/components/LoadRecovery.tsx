import React, { useEffect, useState } from "react";

export function downloadLocalRecovery() {
  const drafts: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (key?.startsWith("shakstory:node:"))
      drafts[key] = localStorage.getItem(key) ?? "";
  }
  const recovery = {
    format: "shakstory-recovery",
    version: 1,
    savedAt: new Date().toISOString(),
    library: JSON.parse(localStorage.getItem("shakstory:library") ?? "null"),
    drafts,
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(recovery, null, 2)], { type: "application/json" })
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "shakstory-recuperacao-local.json";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function LoadRecovery() {
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const onFailure = (event: Event) => {
      event.preventDefault();
      setFailed(true);
    };
    window.addEventListener("vite:preloadError", onFailure);
    return () => window.removeEventListener("vite:preloadError", onFailure);
  }, []);
  if (!failed) return null;
  return (
    <aside
      role="alert"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-2xl rounded-xl border border-primary/30 bg-card p-4 shadow-xl"
    >
      <h2 className="font-medium">Uma parte do aplicativo não carregou.</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Sua página permanece aberta. Salve o trabalho ou baixe a cópia local
        antes de recarregar.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
          onClick={() => {
            try {
              downloadLocalRecovery();
              setMessage("Cópia local gerada.");
            } catch {
              setMessage(
                "Não foi possível ler a cópia local. Salve o trabalho antes de recarregar."
              );
            }
          }}
        >
          Baixar cópia local
        </button>
        <button
          className="rounded-md border px-3 py-2 text-sm"
          onClick={() => window.location.reload()}
        >
          Recarregar quando estiver pronto
        </button>
        <button className="px-3 py-2 text-sm" onClick={() => setFailed(false)}>
          Continuar escrevendo
        </button>
      </div>
      {message && (
        <p className="mt-2 text-xs" role="status">
          {message}
        </p>
      )}
    </aside>
  );
}
