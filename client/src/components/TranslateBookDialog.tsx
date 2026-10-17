import React, { useEffect, useRef, useState } from "react";
import { checkTranslation, createCowilaRefiner, estimateRefineCalls, type RefineStats, languageByCode, parseGlossary, saveGlossary, TRANSLATE_LANGUAGES, translateChapter, translateText, type TranslatableChapter, type TranslateOptions } from "@/lib/translate";

export type TranslatedBook = {
  title: string;
  subtitle?: string;
  description?: string;
  languageLabel: string;
  languageCode: string;
  nodes: Array<{ title: string; kind: string; content: string }>;
};

type Source = { id?: string; title: string; subtitle?: string; description?: string; nodes: Array<TranslatableChapter & { kind: string }> };
type Reviewed = { id: string; kind: string; original: string; title: string; content: string; warnings: string[] };

/** Traduz capítulos escolhidos (ou o livro todo), deixa o autor revisar lado a lado e só então cria uma CÓPIA; o original nunca é alterado. */
export function TranslateBookDialog({ book, glossary = [], ask, onClose, onDone, fetchFn }: { book: Source; glossary?: string[]; ask?: Parameters<typeof createCowilaRefiner>[0]; onClose: () => void; onDone: (result: TranslatedBook) => void; fetchFn?: TranslateOptions["fetchFn"] }) {
  const [code, setCode] = useState("en");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(book.nodes.map(node => node.id)));
  const [terms, setTerms] = useState(glossary.join("\n"));
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, title: "" });
  const [error, setError] = useState("");
  const [useAi, setUseAi] = useState(false);
  const [stats, setStats] = useState<RefineStats | null>(null);
  const [review, setReview] = useState<{ meta: Omit<TranslatedBook, "nodes">; items: Reviewed[] } | null>(null);
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
    const termList = parseGlossary(terms);
    if (book.id) saveGlossary(book.id, termList);
    setRunning(true); setError(""); setStats(null); setProgress({ done: 0, total: chosen.length, title: chosen[0].title });
    try {
      const refiner = useAi && ask ? createCowilaRefiner(ask, { targetLabel: language.label, terms: termList, bookTitle: book.title, signal: controller.signal, onStats: setStats }) : null;
      const options: TranslateOptions = { signal: controller.signal, fetchFn, terms: termList, refine: refiner?.refine };
      const items: Reviewed[] = [];
      for (let i = 0; i < chosen.length; i++) {
        setProgress({ done: i, total: chosen.length, title: chosen[i].title });
        const node = chosen[i];
        const done = await translateChapter(node, language.code, options);
        const original = node.content?.trim() ? node.content : node.richContent?.replace(/<[^>]+>/g, " ") ?? "";
        items.push({ id: node.id, kind: node.kind, original, title: done.title, content: done.content, warnings: node.kind === "part" ? [] : checkTranslation(original, done.content, termList) });
      }
      const title = await translateText(book.title, language.code, options);
      const subtitle = book.subtitle ? await translateText(book.subtitle, language.code, options) : undefined;
      const description = book.description ? await translateText(book.description, language.code, options) : undefined;
      setProgress({ done: chosen.length, total: chosen.length, title: "" });
      setRunning(false);
      setReview({ meta: { title: title.replace(/\s*\n+\s*/g, " "), subtitle, description, languageLabel: language.label, languageCode: language.code }, items });
    } catch (failure) {
      if ((failure as { name?: string })?.name !== "AbortError") setError("Não foi possível traduzir agora. Nada foi criado; confira a conexão e tente de novo.");
      setRunning(false);
    }
  };
  const cancel = () => { abort.current?.abort(); setRunning(false); };
  const edit = (id: string, patch: Partial<Pick<Reviewed, "title" | "content">>) => setReview(current => current && ({ ...current, items: current.items.map(item => item.id === id ? { ...item, ...patch } : item) }));
  const flagged = review?.items.filter(item => item.warnings.length).length ?? 0;

  return (
    <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-black/40 p-5 backdrop-blur-sm">
      <div className={`my-auto w-full ${review ? "max-w-4xl" : "max-w-lg"} rounded-2xl border border-border bg-card p-6 shadow-xl`} role="dialog" aria-modal="true" aria-labelledby="translate-book-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Tradução</p>
            <h2 id="translate-book-title" className="mt-2 font-serif text-3xl">{review ? "Revisar tradução" : "Traduzir livro"}</h2>
          </div>
          <button type="button" aria-label="Fechar" disabled={running} className="rounded px-2 py-1 text-sm hover:bg-secondary disabled:opacity-40" onClick={onClose}>✕</button>
        </div>
        {review ? (
          <div>
            {stats && <p className="mt-2 text-xs text-muted-foreground">Cowila: {stats.refined} trecho(s) refinado(s), {stats.kept} mantido(s) como o Google traduziu (a resposta não passou nas verificações){stats.failed ? `, ${stats.failed} sem resposta` : ""}{stats.stopped ? " — revisão interrompida (limite ou falha); o restante é só Google." : "."}</p>}<p className="mt-3 text-sm leading-6 text-muted-foreground">{flagged ? `${flagged} capítulo(s) com avisos: confira antes de criar.` : "Nenhum aviso automático."} Compare com o original e corrija o que precisar; só depois o livro traduzido é criado.</p>
            <div className="mt-3 max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {review.items.map(item => (
                <details key={item.id} open={item.warnings.length > 0} className="rounded-lg border border-border p-3">
                  <summary className="cursor-pointer text-sm font-medium">{item.title || "Sem título"}{item.warnings.length > 0 && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900">⚠ {item.warnings.length}</span>}</summary>
                  {item.warnings.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-amber-800">{item.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
                  {item.kind !== "part" && (
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <div><p className="text-[11px] font-medium text-muted-foreground">Original</p><div className="mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md bg-secondary/40 p-2 text-xs leading-5">{item.original}</div></div>
                      <label className="block text-[11px] font-medium text-muted-foreground">Tradução (editável)<textarea aria-label={`Tradução de ${item.title}`} className="mt-1 h-56 w-full resize-y rounded-md border border-border bg-background p-2 text-xs leading-5" value={item.content} onChange={event => edit(item.id, { content: event.target.value })} /></label>
                    </div>
                  )}
                  <label className="mt-2 block text-[11px] font-medium text-muted-foreground">Título traduzido<input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm" value={item.title} onChange={event => edit(item.id, { title: event.target.value })} /></label>
                </details>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" className="rounded-md border border-border px-4 py-2 text-sm" onClick={() => setReview(null)}>Voltar</button>
              <button type="button" className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" onClick={() => onDone({ ...review.meta, nodes: review.items.map(item => ({ title: item.title, kind: item.kind, content: item.content })) })}>Criar livro traduzido</button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Cria uma cópia traduzida como novo livro, depois de você revisar. O original não é alterado.</p>
            <label htmlFor="translate-language" className="mt-4 block text-xs font-medium text-muted-foreground">Idioma de destino</label>
            <select id="translate-language" className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={code} disabled={running} onChange={event => setCode(event.target.value)}>
              {TRANSLATE_LANGUAGES.map(item => <option key={item.code} value={item.code}>{item.flag} {item.label}</option>)}
            </select>
            <label htmlFor="translate-glossary" className="mt-4 block text-xs font-medium text-muted-foreground">Termos que não devem ser traduzidos (um por linha)</label>
            <textarea id="translate-glossary" className="mt-2 h-24 w-full resize-y rounded-md border border-border bg-background p-2 text-sm" value={terms} disabled={running} onChange={event => setTerms(event.target.value)} placeholder="Nomes de personagens, lugares, palavras inventadas…" />
            <p className="mt-1 text-[11px] text-muted-foreground">Sugerido a partir dos personagens e lugares do livro. Esses termos ficam exatamente como estão.</p>
            <fieldset className="mt-4" disabled={running}>
              <legend className="text-xs font-medium text-muted-foreground">O que traduzir</legend>
              <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(book.nodes.map(node => node.id)))} /> Livro completo</label>
              <div className="mt-2 max-h-44 overflow-y-auto rounded-md border border-border p-2">
                {book.nodes.map(node => <label key={node.id} className="flex items-center gap-2 py-0.5 text-sm"><input type="checkbox" checked={picked.has(node.id)} onChange={() => toggle(node.id)} /><span className="truncate">{node.title || "Sem título"}</span></label>)}
              </div>
            </fieldset>
            {ask && <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={useAi} disabled={running} onChange={event => setUseAi(event.target.checked)} /><span>Refinar com o Cowila (IA)<span className="block text-[11px] text-muted-foreground">O Cowila compara com o original e corrige a tradução do Google. Gasta ≈ {estimateRefineCalls(chosen.map(node => node.content || node.richContent?.replace(/<[^>]+>/g, " ") || ""))} uso(s) do Cowila do seu plano; se o limite acabar, o restante fica só com o Google.</span></span></label>}
            <p className="mt-3 text-[11px] leading-4 text-muted-foreground">Tradução automática pelo Google Tradutor: o texto selecionado é enviado ao Google. Ela não entende o contexto da história como uma pessoa; revise antes de publicar. A formatação (itálico, negrito) não é mantida.</p>
            {running && <p role="status" aria-live="polite" className="mt-3 text-sm">Traduzindo {Math.min(progress.done + 1, progress.total)} de {progress.total}{progress.title ? ` · ${progress.title}` : ""}…{stats ? ` Cowila: ${stats.refined} trecho(s) refinado(s).` : ""}</p>}
            {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
            <div className="mt-5 flex gap-2">
              {running
                ? <button type="button" className="w-full rounded-md border border-border px-4 py-2 text-sm" onClick={cancel}>Cancelar tradução</button>
                : <button type="button" className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={!chosen.length} onClick={() => void start()}>Traduzir {chosen.length === book.nodes.length ? "livro completo" : `${chosen.length} item(ns)`}</button>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
