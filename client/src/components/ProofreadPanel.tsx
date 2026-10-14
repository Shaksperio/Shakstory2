import React, { useMemo, useState } from "react";
import { Button } from "./ui/button";
import {
  applyIssue,
  applyIssueToHtml,
  proofread,
  type Issue,
} from "@/lib/proofread/engine";

type Prefs = { ignored: string[]; names: string[]; mode: "preserve" | "full"; style: boolean; typography: boolean };
const DEFAULTS: Prefs = { ignored: [], names: [], mode: "preserve", style: false, typography: false };
const key = (bookId?: string) => `shakstory:proofread:${bookId || "livro"}`;

function readPrefs(bookId?: string): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(key(bookId)) || "null");
    return raw && typeof raw === "object" ? { ...DEFAULTS, ...raw } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}
function savePrefs(bookId: string | undefined, prefs: Prefs) {
  try {
    localStorage.setItem(key(bookId), JSON.stringify(prefs));
  } catch {
    /* preferências são só conveniência */
  }
}

const KIND_LABEL: Record<Issue["kind"], string> = {
  spelling: "Ortografia",
  grammar: "Gramática",
  consistency: "Nome inconsistente",
  style: "Estilo",
  typography: "Tipografia",
};
const KIND_COLOR: Record<Issue["kind"], string> = {
  spelling: "border-red-500/60 bg-red-500/5",
  grammar: "border-blue-500/60 bg-blue-500/5",
  consistency: "border-purple-500/60 bg-purple-500/5",
  style: "border-yellow-500/60 bg-yellow-500/5",
  typography: "border-teal-500/60 bg-teal-500/5",
};

function excerpt(text: string, issue: Issue) {
  const from = Math.max(0, issue.start - 28);
  const to = Math.min(text.length, issue.end + 28);
  return (
    <>
      {from > 0 ? "…" : ""}
      {text.slice(from, issue.start)}
      <mark className="rounded bg-foreground/10 px-0.5">{text.slice(issue.start, issue.end) || "␣"}</mark>
      {text.slice(issue.end, to)}
      {to < text.length ? "…" : ""}
    </>
  );
}

export function ProofreadPanel({
  bookId,
  text,
  html,
  onApply,
}: {
  bookId?: string;
  text: string;
  html: string;
  onApply: (text: string, html: string) => void;
}) {
  const [prefs, setPrefs] = useState<Prefs>(() => readPrefs(bookId));
  const [undo, setUndo] = useState<{ text: string; html: string } | null>(null);
  const [message, setMessage] = useState("");
  const [explain, setExplain] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const update = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePrefs(bookId, next);
  };
  const issues = useMemo(
    () => proofread(text, { mode: prefs.mode, style: prefs.style, typography: prefs.typography, ignored: prefs.ignored, names: prefs.names }),
    [text, prefs]
  );
  const low = issues.filter(i => i.risk === "low" && i.suggestion !== undefined);

  const accept = (issue: Issue) => {
    const nextText = applyIssue(text, issue);
    if (nextText === null) return setMessage("O trecho mudou desde a análise; nada foi alterado.");
    // O texto simples e o HTML rico precisam andar juntos; sem correspondência segura, não aplicamos.
    let nextHtml = html;
    if (html) {
      const mapped = applyIssueToHtml(html, text, issue);
      if (mapped === null) return setMessage("Não consegui aplicar com segurança neste trecho (há formatação ao redor). Corrija manualmente no editor.");
      nextHtml = mapped;
    }
    setUndo({ text, html });
    onApply(nextText, nextHtml);
    setMessage("Correção aplicada. Você pode desfazer.");
  };
  const acceptBatch = () => {
    if (!low.length) return;
    if (!window.confirm(`Aplicar ${low.length} correções de baixo risco (acentos, espaços, travessão)? Você poderá desfazer.`)) return;
    let nextHtml = html;
    let workingText = text;
    let applied = 0;
    const ordered = low.slice().sort((a, b) => b.start - a.start);
    for (const issue of ordered) {
      const nextText = applyIssue(workingText, issue);
      if (nextText === null) continue;
      if (html) {
        const mapped = applyIssueToHtml(nextHtml, workingText, issue);
        if (mapped === null) continue;
        nextHtml = mapped;
      }
      workingText = nextText;
      applied++;
    }
    if (!applied) return setMessage("Nenhuma correção pôde ser aplicada com segurança.");
    setUndo({ text, html });
    onApply(workingText, nextHtml);
    setMessage(`${applied} correção(ões) aplicada(s). Você pode desfazer.`);
  };

  return (
    <div className="mt-4 space-y-4" data-testid="proofread-panel">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={prefs.mode === "preserve" ? "default" : "outline"} onClick={() => update({ mode: "preserve" })}>
          Preservar minhas palavras
        </Button>
        <Button size="sm" variant={prefs.mode === "full" ? "default" : "outline"} onClick={() => update({ mode: "full" })}>
          Revisão completa
        </Button>
        <label className="ml-2 text-sm">
          <input type="checkbox" disabled={prefs.mode !== "full"} checked={prefs.style} onChange={e => update({ style: e.target.checked })} /> Espelho do texto (estilo)
        </label>
        <label className="ml-2 text-sm">
          <input type="checkbox" checked={prefs.typography} onChange={e => update({ typography: e.target.checked })} /> Tipografia (aspas curvas, reticências)
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Roda no seu aparelho, sem internet e sem enviar o texto a servidor algum. Nada muda sem o seu clique. É um corretor de regras formais: não há lista completa de palavras, então ele não acha todo erro de digitação, e ficção quebra regras de propósito.
      </p>
      <p className="text-sm font-medium" aria-live="polite">
        {issues.length === 0 ? "Nenhuma dúvida neste capítulo." : `${issues.length} dúvida${issues.length > 1 ? "s" : ""} neste capítulo.`}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!low.length} onClick={acceptBatch}>
          Aceitar {low.length} de baixo risco
        </Button>
        <Button size="sm" variant="ghost" disabled={!undo} onClick={() => { if (undo) { onApply(undo.text, undo.html); setUndo(null); setMessage("Alteração desfeita."); } }}>
          Desfazer
        </Button>
      </div>
      {message && <p className="text-sm" role="status">{message}</p>}
      <ul className="space-y-2">
        {issues.slice(0, 80).map(issue => (
          <li key={issue.id} className={`rounded border-l-4 p-3 text-sm ${KIND_COLOR[issue.kind]}`}>
            <p className="text-xs font-semibold uppercase tracking-wide">{KIND_LABEL[issue.kind]}</p>
            <p className="mt-1 font-serif">{excerpt(text, issue)}</p>
            <p className="mt-1">{issue.reason}</p>
            {issue.suggestion !== undefined && (
              <p className="mt-1">Sugestão: <strong>{issue.suggestion.trim() === "" ? "(remover o espaço)" : issue.suggestion}</strong></p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {issue.suggestion !== undefined && <Button size="sm" onClick={() => accept(issue)}>Aceitar</Button>}
              <Button size="sm" variant="outline" onClick={() => update({ ignored: [...prefs.ignored, issue.original.toLowerCase().trim()] })}>Sempre ignorar neste livro</Button>
              {issue.explain && <Button size="sm" variant="ghost" onClick={() => setExplain(explain === issue.id ? null : issue.id)}>Entender a regra</Button>}
            </div>
            {explain === issue.id && <p className="mt-2 text-xs text-muted-foreground">{issue.explain}</p>}
          </li>
        ))}
      </ul>
      {issues.length > 80 && <p className="text-xs text-muted-foreground">Mostrando as 80 primeiras; corrija e a lista se atualiza.</p>}
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Dicionário do livro</summary>
        <p className="mt-2 text-xs text-muted-foreground">Nomes de personagens e lugares que o corretor não deve tocar. Nomes recorrentes também são detectados sozinhos. Guardado neste aparelho.</p>
        <div className="mt-2 flex gap-2">
          <input className="h-9 flex-1 rounded border bg-background px-2" aria-label="Novo nome do livro" value={nameDraft} onChange={e => setNameDraft(e.target.value)} placeholder="Ex.: Élia" />
          <Button size="sm" disabled={!nameDraft.trim()} onClick={() => { update({ names: [...prefs.names, nameDraft.trim()] }); setNameDraft(""); }}>Adicionar</Button>
        </div>
        <ul className="mt-2 flex flex-wrap gap-2">
          {prefs.names.map(name => (
            <li key={name} className="rounded bg-secondary px-2 py-1 text-xs">{name} <button aria-label={`Remover ${name}`} onClick={() => update({ names: prefs.names.filter(n => n !== name) })}>×</button></li>
          ))}
          {prefs.ignored.map(word => (
            <li key={`i:${word}`} className="rounded border px-2 py-1 text-xs">ignorado: {word} <button aria-label={`Voltar a apontar ${word}`} onClick={() => update({ ignored: prefs.ignored.filter(w => w !== word) })}>×</button></li>
          ))}
        </ul>
      </details>
    </div>
  );
}
