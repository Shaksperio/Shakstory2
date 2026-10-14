import React, { useMemo, useState } from "react";
import { Button } from "./ui/button";
import { PASSES, reviewBook, styleSheet, type ReviewChapter } from "@/lib/review/passes";

type Note = { id: string; chapterId: string; text: string; done: boolean };
type Saved = { done: string[]; notes: Note[] };
const key = (bookId?: string) => `shakstory:review:${bookId || "livro"}`;
const proofKey = (bookId?: string) => `shakstory:proofread:${bookId || "livro"}`;

function read(bookId?: string): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(key(bookId)) || "null");
    return raw && Array.isArray(raw.done) && Array.isArray(raw.notes) ? raw : { done: [], notes: [] };
  } catch { return { done: [], notes: [] }; }
}
function write(bookId: string | undefined, value: Saved) {
  try { localStorage.setItem(key(bookId), JSON.stringify(value)); } catch { /* só conveniência */ }
}
/** Soma nomes ao dicionário do Corretor deste livro (mesma chave de ProofreadPanel). */
function addToDictionary(bookId: string | undefined, names: string[]): number {
  try {
    const raw = JSON.parse(localStorage.getItem(proofKey(bookId)) || "null");
    const prefs = raw && typeof raw === "object" ? raw : {};
    const current: string[] = Array.isArray(prefs.names) ? prefs.names : [];
    const fresh = names.filter(name => !current.some(item => item.toLowerCase() === name.toLowerCase()));
    localStorage.setItem(proofKey(bookId), JSON.stringify({ ...prefs, names: [...current, ...fresh] }));
    return fresh.length;
  } catch { return 0; }
}

export function ReviewPanel({ bookId, chapters, onSelect }: { bookId?: string; chapters: ReviewChapter[]; onSelect?: (id: string) => void }) {
  const [saved, setSaved] = useState<Saved>(() => read(bookId));
  const [open, setOpen] = useState<string | null>("estrutura");
  const [noteText, setNoteText] = useState("");
  const [noteChapter, setNoteChapter] = useState(chapters[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const result = useMemo(() => reviewBook(chapters), [chapters]);
  const sheet = useMemo(() => styleSheet(chapters), [chapters]);
  const update = (next: Saved) => { setSaved(next); write(bookId, next); };
  const toggle = (id: string) => update({ ...saved, done: saved.done.includes(id) ? saved.done.filter(item => item !== id) : [...saved.done, id] });
  const pending = result.findings.filter(item => !saved.done.includes(item.id));
  const { stats } = result;

  return (
    <div className="mt-4 space-y-5" data-testid="review-panel">
      <p className="text-xs text-muted-foreground">
        Cinco passagens de revisão, feitas no seu aparelho, sem enviar o texto a servidor algum. São perguntas com a evidência no texto, não vereditos: você decide o que muda, e nada é alterado por aqui.
      </p>
      <p className="text-sm" aria-live="polite">
        {stats.chapters} capítulo(s), {stats.words} palavras, cerca de {stats.pagesMin} a {stats.pagesMax} páginas impressas e {stats.readingMinutes} min de leitura. {pending.length === 0 ? "Nenhuma pendência." : `${pending.length} pendência(s).`}
      </p>

      <div className="space-y-2">
        {PASSES.map(pass => {
          const list = result.findings.filter(item => item.pass === pass.id);
          const left = list.filter(item => !saved.done.includes(item.id)).length;
          return (
            <section key={pass.id} className="rounded-lg border border-border">
              <button type="button" className="flex w-full items-center justify-between gap-3 p-3 text-left" aria-expanded={open === pass.id} onClick={() => setOpen(open === pass.id ? null : pass.id)}>
                <span><strong className="text-sm">{pass.title}</strong><br /><span className="text-xs text-muted-foreground">{pass.question}</span></span>
                <span className="shrink-0 text-xs">{left === 0 ? "✓ em dia" : `${left} a ver`}</span>
              </button>
              {open === pass.id && (
                <ul className="space-y-2 border-t border-border p-3">
                  {list.length === 0 && <li className="text-xs text-muted-foreground">Nada a apontar nesta passagem.</li>}
                  {list.map(item => (
                    <li key={item.id} className={"rounded border-l-4 border-primary/50 p-2 text-sm " + (saved.done.includes(item.id) ? "opacity-50" : "")}>
                      <p className="text-xs font-semibold">{item.chapterTitle || "Capítulo sem título"}</p>
                      <p>{item.message}</p>
                      {item.evidence && <p className="mt-1 font-serif text-xs text-muted-foreground">“{item.evidence}”</p>}
                      <div className="mt-1.5 flex gap-2">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => toggle(item.id)}>{saved.done.includes(item.id) ? "Reabrir" : "Marcar como visto"}</Button>
                        {onSelect && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onSelect(item.chapterId)}>Ir ao capítulo</Button>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <section className="rounded-lg border border-border p-3" aria-label="Ficha de estilo">
        <h3 className="text-sm font-semibold">Ficha de estilo gerada</h3>
        <p className="mt-1 text-xs text-muted-foreground">Proposta a partir do seu texto. Tudo aqui é inferência (marcada como tal): confirme ou ignore.</p>
        <dl className="mt-3 space-y-2 text-sm">
          <div><dt className="text-xs font-semibold">Diálogo <em className="font-normal text-muted-foreground">(inferido)</em></dt><dd>{sheet.dialogue.convention}{sheet.dialogue.evidence && <span className="block font-serif text-xs text-muted-foreground">“{sheet.dialogue.evidence}”</span>}</dd></div>
          <div><dt className="text-xs font-semibold">Pessoa narrativa <em className="font-normal text-muted-foreground">(inferida)</em></dt><dd>{sheet.pov.kind}{sheet.pov.evidence && <span className="block font-serif text-xs text-muted-foreground">“{sheet.pov.evidence}”</span>}</dd></div>
          <div><dt className="text-xs font-semibold">Personagens prováveis <em className="font-normal text-muted-foreground">(inferido)</em></dt>
            <dd>{sheet.characters.length === 0 ? "Nenhum nome recorrente ainda." : <span className="flex flex-wrap gap-1.5">{sheet.characters.map(c => <span key={c.name} title={c.evidence} className="rounded bg-secondary px-2 py-0.5 text-xs">{c.name} · {c.count}x</span>)}</span>}</dd></div>
          <div><dt className="text-xs font-semibold">Lugares prováveis <em className="font-normal text-muted-foreground">(inferido)</em></dt>
            <dd>{sheet.places.length === 0 ? "Nenhum lugar recorrente ainda." : <span className="flex flex-wrap gap-1.5">{sheet.places.map(c => <span key={c.name} title={c.evidence} className="rounded bg-secondary px-2 py-0.5 text-xs">{c.name} · {c.count}x</span>)}</span>}</dd></div>
        </dl>
        <Button size="sm" className="mt-3" disabled={sheet.characters.length + sheet.places.length === 0}
          onClick={() => { const added = addToDictionary(bookId, [...sheet.characters, ...sheet.places].map(item => item.name)); setMessage(added ? `${added} nome(s) adicionados ao dicionário do livro (o Corretor passa a respeitá-los).` : "Esses nomes já estão no dicionário do livro."); }}>
          Confirmar nomes no dicionário do livro
        </Button>
        {message && <p role="status" className="mt-2 text-xs">{message}</p>}
      </section>

      <section className="rounded-lg border border-border p-3" aria-label="Comentários para mim">
        <h3 className="text-sm font-semibold">Comentários para mim</h3>
        <p className="mt-1 text-xs text-muted-foreground">Pendências suas por capítulo (“verificar data”, “reescrever final”). Ficam só neste aparelho e não entram no livro.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <select aria-label="Capítulo do comentário" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={noteChapter} onChange={e => setNoteChapter(e.target.value)}>
            {chapters.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title || "Sem título"}</option>)}
          </select>
          <input aria-label="Novo comentário" className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm" value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Ex.: verificar a data da cena" />
          <Button size="sm" disabled={!noteText.trim() || !noteChapter} onClick={() => { update({ ...saved, notes: [...saved.notes, { id: `n${Date.now()}${saved.notes.length}`, chapterId: noteChapter, text: noteText.trim(), done: false }] }); setNoteText(""); }}>Adicionar</Button>
        </div>
        <ul className="mt-2 space-y-1">
          {saved.notes.map(note => (
            <li key={note.id} className="flex items-start gap-2 text-sm">
              <input type="checkbox" aria-label={`Resolvido: ${note.text}`} checked={note.done} onChange={() => update({ ...saved, notes: saved.notes.map(item => (item.id === note.id ? { ...item, done: !item.done } : item)) })} />
              <span className={note.done ? "line-through opacity-60" : ""}><strong className="text-xs">{chapters.find(c => c.id === note.chapterId)?.title || "Capítulo"}:</strong> {note.text}</span>
              <button type="button" className="ml-auto text-xs underline" aria-label={`Remover: ${note.text}`} onClick={() => update({ ...saved, notes: saved.notes.filter(item => item.id !== note.id) })}>remover</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
