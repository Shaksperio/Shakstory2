import React, { useEffect, useRef, useState } from "react";
import { languageByCode, TRANSLATE_LANGUAGES, translateChapter, translateText, type TranslatableChapter, type TranslateOptions } from "@/lib/translate";

export type TranslatedBook = {
  title: string;
  subtitle?: string;
  description?: string;
  languageLabel: string;
  languageCode: string;
  nodes: Array<{ title: string; kind: string; content: string }>;
};

type Source = { title: string; subtitle?: string; description?: string; nodes: Array<TranslatableChapter & { kind: string }> };

/** Traduz capítulos escolhidos (ou o livro todo) e entrega uma CÓPIA traduzida; o original nunca é alterado. */
export function TranslateBookDialog({ book, onClose, onDone, fetchFn }: { book: Source; onClose: () => void; onDone: (result: TranslatedBook) => void; fetchFn?: TranslateOptions["fetchFn"] }) {
  const [code, setCode] = useState("en");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(book.nodes.map(node => node.id)));
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, title: "" });
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape" && !running) onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [running, onClose]);

  const language = languageByCode(code) ?? TRANSLATE_LANGUAGES[0];
  const chosen = book.nodes.filter(node => picked.has(node.id));
  const allPicked = chosen.length === book.nodes.length;
  const toggle = (id: string) => setPicked(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const start = async () => {
    if (!chosen.length || running) return;
    const controller = new AbortController();
    abort.current = controller;
    setRunning(true); setError(""); setProgress({ done: 0, total: chosen.length, title: chosen[0].title });
    try {
      const options = { signal: controller.signal, fetchFn };
      const nodes: TranslatedBook["nodes"] = [];
      for (let i = 0; i < chosen.length; i++) {
        setProgress({ done: i, total: chosen.length, title: chosen[i].title });
        const done = await translateChapter(chosen[i], language.code, options);
        nodes.push({ title: done.title, kind: chosen[i].kind, content: done.content });
      }
      const title = await translateText(book.title, language.code, options);
      const subtitle = book.subtitle ? await translateText(book.subtitle, language.code, options) : undefined;
      const description = book.description ? await translateText(book.description, language.code, options) : undefined;
      setProgress({ done: chosen.length, total: chosen.length, title: "" });
      onDone({ title: title.replace(/\s*\n+\s*/g, " "), subtitle, description, languageLabel: language.label, languageCode: language.code, nodes });
    } catch (failure) {
      if ((failure as { name?: string })?.name !== "AbortError") setError("Não foi possível traduzir agora. Nada foi criado; confira a conexão e tente de novo.");
      setRunning(false);
    }
  };
  const cancel = () => { abort.current?.abort(); setRunning(false); };

  return (
    <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-black/40 p-5 backdrop-blur-sm">
      <div className="my-auto w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="translate-book-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Tradução</p>
            <h2 id="translate-book-title" className="mt-2 font-serif text-3xl">Traduzir livro</h2>
          </div>
          <button type="button" aria-label="Fechar" disabled={running} className="rounded px-2 py-1 text-sm hover:bg-secondary disabled:opacity-40" onClick={onClose}>✕</button>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Cria uma cópia traduzida como novo livro. O original não é alterado.</p>
        <label htmlFor="translate-language" className="mt-4 block text-xs font-medium text-muted-foreground">Idioma de destino</label>
        <select id="translate-language" className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={code} disabled={running} onChange={event => setCode(event.target.value)}>
          {TRANSLATE_LANGUAGES.map(item => <option key={item.code} value={item.code}>{item.flag} {item.label}</option>)}
        </select>
        <fieldset className="mt-4" disabled={running}>
          <legend className="text-xs font-medium text-muted-foreground">O que traduzir</legend>
          <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(book.nodes.map(node => node.id)))} /> Livro completo</label>
          <div className="mt-2 max-h-44 overflow-y-auto rounded-md border border-border p-2">
            {book.nodes.map(node => <label key={node.id} className="flex items-center gap-2 py-0.5 text-sm"><input type="checkbox" checked={picked.has(node.id)} onChange={() => toggle(node.id)} /><span className="truncate">{node.title || "Sem título"}</span></label>)}
          </div>
        </fieldset>
        <p className="mt-3 text-[11px] leading-4 text-muted-foreground">Tradução automática pelo Google Tradutor: o texto selecionado é enviado ao Google. Revise antes de publicar; a formatação (itálico, negrito) não é mantida.</p>
        {running && <p role="status" aria-live="polite" className="mt-3 text-sm">Traduzindo {Math.min(progress.done + 1, progress.total)} de {progress.total}{progress.title ? ` · ${progress.title}` : ""}…</p>}
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        <div className="mt-5 flex gap-2">
          {running
            ? <button type="button" className="w-full rounded-md border border-border px-4 py-2 text-sm" onClick={cancel}>Cancelar tradução</button>
            : <button type="button" className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={!chosen.length} onClick={() => void start()}>Traduzir {chosen.length === book.nodes.length ? "livro completo" : `${chosen.length} item(ns)`}</button>}
        </div>
      </div>
    </div>
  );
}
