import React, { useEffect, useState } from "react";
import { useRoute } from "wouter";
import type { ExportBook } from "@shared/book-export";
import { BookReader } from "@/components/BookReader";

type Visibility = "private" | "public";
type Loaded = { book: ExportBook; owner: boolean; visibility: Visibility; publicBase: string };
type State = { status: "loading" } | { status: "error"; message: string; login?: boolean } | ({ status: "ready" } & Loaded);

const asJson = async (response: Response) => {
  if (!(response.headers.get("content-type") ?? "").includes("json")) return null;
  return response.json().catch(() => null) as Promise<Record<string, unknown> | null>;
};

async function loadShare(token: string): Promise<State> {
  try {
    const own = await fetch(`/api/share/${token}`, { credentials: "same-origin" });
    const ownData = own.ok ? await asJson(own) : null;
    if (ownData?.book) return { status: "ready", book: ownData.book as ExportBook, owner: true, visibility: ownData.visibility === "public" ? "public" : "private", publicBase: String(ownData.publicBase ?? window.location.origin) };
  } catch { /* sem sessão do autor: segue como leitor */ }
  try {
    const response = await fetch(`/api/public/share/${token}`);
    const data = await asJson(response);
    if (response.ok && data?.book) return { status: "ready", book: data.book as ExportBook, owner: false, visibility: "public", publicBase: window.location.origin };
    if (data?.error === "private") return { status: "error", message: "Esta história é privada. Entre com sua conta de autor para lê-la.", login: true };
    return { status: "error", message: "Link inválido ou removido pelo autor." };
  } catch {
    return { status: "error", message: "Não foi possível carregar a história agora." };
  }
}

function SharePanel({ token, visibility, publicBase, onChange }: { token: string; visibility: Visibility; publicBase: string; onChange: (next: Visibility) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const link = `${visibility === "public" ? publicBase : window.location.origin}/ler/${token}`;
  const choose = async (next: Visibility) => {
    if (next === visibility || busy) return;
    setBusy(true); setNote(null);
    try {
      const response = await fetch("/api/share/visibility", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, visibility: next }) });
      if (!response.ok) throw new Error();
      onChange(next);
    } catch { setNote("Não foi possível alterar a visibilidade."); }
    setBusy(false);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setNote("Link copiado."); } catch { setNote("Copie o link manualmente."); }
  };
  return (
    <>
      <button type="button" className="inline-flex h-9 items-center rounded-md border border-current/30 px-2.5 text-sm" aria-expanded={open} onClick={() => setOpen(value => !value)}>Compartilhar</button>
      {open && (
        <div role="dialog" aria-label="Compartilhar história" className="fixed right-3 top-14 z-[80] w-[min(94vw,22rem)] rounded-xl border border-neutral-300 bg-white p-4 text-sm text-neutral-900 shadow-2xl">
          <div className="mb-3 flex items-center justify-between"><strong>Compartilhar história</strong><button type="button" aria-label="Fechar compartilhamento" onClick={() => setOpen(false)}>✕</button></div>
          <div role="radiogroup" aria-label="Visibilidade" className="grid gap-2">
            <label className="flex cursor-pointer gap-2 rounded-lg border p-2"><input type="radio" name="visibility" checked={visibility === "private"} disabled={busy} onChange={() => void choose("private")} /><span><b>Privado</b><br /><span className="text-xs text-neutral-600">Só quem entra com a conta do autor consegue abrir.</span></span></label>
            <label className="flex cursor-pointer gap-2 rounded-lg border p-2"><input type="radio" name="visibility" checked={visibility === "public"} disabled={busy} onChange={() => void choose("public")} /><span><b>Público</b><br /><span className="text-xs text-neutral-600">Qualquer pessoa com o link lê, sem login e sem editar.</span></span></label>
          </div>
          <div className="mt-3 flex gap-2"><input readOnly aria-label="Link da história" value={link} className="min-w-0 flex-1 rounded-md border px-2 py-1.5 text-xs" onFocus={event => event.currentTarget.select()} /><button type="button" className="rounded-md border px-3 text-xs" onClick={() => void copy()}>Copiar</button></div>
          <p className="mt-2 text-xs text-neutral-600">Para atualizar o texto, clique em Pré-visualizar no editor: o mesmo link recebe a versão atual.</p>
          {note && <p role="status" className="mt-1 text-xs">{note}</p>}
        </div>
      )}
    </>
  );
}

export default function ReaderPage() {
  const [, params] = useRoute("/ler/:token");
  const token = params?.token ?? "";
  const [state, setState] = useState<State>({ status: "loading" });
  const activeId = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("c");

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots"; meta.content = "noindex,nofollow";
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, []);
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    void loadShare(token).then(result => { if (alive) setState(result); });
    return () => { alive = false; };
  }, [token]);
  useEffect(() => { if (state.status === "ready") document.title = `${state.book.title} · Shakstory`; }, [state]);

  if (state.status === "loading") return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Carregando história…</div>;
  if (state.status === "error") {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div className="max-w-sm"><h1 className="font-serif text-2xl">Shakstory</h1><p className="mt-3 text-sm text-muted-foreground">{state.message}</p>
          {state.login && <a className="mt-4 inline-block rounded-md border px-4 py-2 text-sm" href={`/api/share/login?next=${encodeURIComponent(`/ler/${token}`)}`}>Entrar como autor</a>}
        </div>
      </div>
    );
  }
  const ready = state;
  return (
    <BookReader
      book={ready.book}
      activeId={activeId}
      extra={ready.owner ? <><a className="inline-flex h-9 items-center rounded-md border border-current/30 px-2.5 text-sm" href="/">Voltar ao editor</a><SharePanel token={token} visibility={ready.visibility} publicBase={ready.publicBase} onChange={next => setState({ ...ready, visibility: next })} /></> : null}
    />
  );
}
