import React, { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { Button } from "./ui/button";
import type { CowilaAsk } from "@/lib/trpc";
import {
  SHAKSTORY_GUIDE, assessLevel, buildProjectDigest, candidateCharacters, characterPrompt, chunkParagraphs, cowilaSystemNote,
  detectIntent, localCharacters, parseCharacters, rewriteIsSafe, rewritePrompt, type CBook, type Level,
} from "@/lib/cowila/project";

type Msg = { role: "user" | "assistant"; content: string };
type Proposal = { kind: "synopsis"; text: string } | { kind: "rewrite"; before: string; after: string; kept: number; total: number };
type Found = Array<{ name: string; role: string; notes: string }>;

export type CowilaChatProps = {
  books: CBook[];
  active?: CBook;
  activeNodeId?: string;
  draft: string;
  online: boolean;
  ask: (input: CowilaAsk) => Promise<string>;
  onAddCharacters: (found: Found) => { added: number; updated: number };
  onSetDescription: (text: string) => void;
  onReplaceDraft: (text: string) => void;
};

const store = (key: string) => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const put = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* conveniência */ }
};

const WELCOME = "Oi! Eu sou a Cowila. Leio seu manuscrito, capítulos e livros para entender o projeto. Posso explicar o Shakstory, preencher os personagens, sugerir a sinopse e reescrever capítulos — sempre com a sua aprovação.";

export function CowilaChat(props: CowilaChatProps) {
  const { books, active, activeNodeId, draft, online, ask } = props;
  const chatKey = `shakstory:cowila:chat:${active?.id ?? "geral"}`;
  const [open, setOpen] = useState(() => store("shakstory:cowila:aberta") === "1");
  const [levelPref, setLevelPref] = useState<"auto" | Level>(() => (store("shakstory:cowila:level") as "auto" | Level) || "auto");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [undo, setUndo] = useState<{ before: string; after: string } | null>(null);
  const end = useRef<HTMLDivElement | null>(null);
  const level: Level = levelPref === "auto" ? assessLevel(books) : levelPref;

  useEffect(() => {
    try { setMessages(JSON.parse(store(chatKey) || "[]")); } catch { setMessages([]); }
    setProposal(null);
  }, [chatKey]);
  useEffect(() => { put(chatKey, JSON.stringify(messages.slice(-30))); end.current?.scrollIntoView?.({ block: "end" }); }, [messages, chatKey]);
  useEffect(() => {
    document.body.classList.toggle("cowila-open", open);
    put("shakstory:cowila:aberta", open ? "1" : "0");
    return () => document.body.classList.remove("cowila-open");
  }, [open]);

  const say = (content: string) => setMessages(list => [...list, { role: "assistant", content }]);
  const digest = () => buildProjectDigest(books, active, activeNodeId, draft);
  const fail = (error: unknown) => say("Não consegui falar com a IA agora: " + (error instanceof Error ? error.message : "erro desconhecido") + " Você pode tentar de novo; seu texto não foi alterado.");

  const runCharacters = async () => {
    if (!active) return say("Abra um livro primeiro e eu preencho os personagens a partir do manuscrito dele.");
    const candidates = candidateCharacters(active);
    if (!candidates.length) return say("Não encontrei nomes próprios que se repitam no manuscrito. Escreva um pouco mais, ou cadastre os personagens manualmente em Planejamento → Personagens.");
    let found: Found = [];
    let viaAi = false;
    if (online) {
      try { found = parseCharacters(await ask({ prompt: characterPrompt(candidates), long: true, bookTitle: active.title }), candidates); viaAi = found.length > 0; } catch { found = []; }
    }
    if (!found.length) found = localCharacters(candidates);
    const result = props.onAddCharacters(found);
    say(
      (result.added || result.updated ? `Pronto: cadastrei ${result.added} personagem(ns) novo(s) e completei ${result.updated} ficha(s) vazia(s). ` : "Todos os nomes que achei já estavam cadastrados, então não mudei nada. ") +
        "Veja em Planejamento → Personagens. Nada do que você já preencheu foi alterado." +
        (viaAi ? "" : " Como a IA não estava disponível, cadastrei só o nome e um trecho do livro como evidência — marcado “a confirmar”.")
    );
  };

  const runRewrite = async () => {
    const text = draft.trim();
    if (!active || !text) return say("Abra um capítulo com texto e eu proponho a reescrita.");
    if (!online) return say("A reescrita precisa de internet. Seu texto continua intacto.");
    const chunks = chunkParagraphs(draft);
    if (chunks.length > 6) return say("Este capítulo é muito longo para reescrever de uma vez (mais de ~19 mil caracteres). Divida-o em dois capítulos ou peça por partes.");
    const out: string[] = [];
    let kept = 0;
    for (const chunk of chunks) {
      try {
        const result = await ask({ prompt: cowilaSystemNote(level) + "\n\n" + rewritePrompt(level), text: chunk, long: true, bookTitle: active.title });
        if (rewriteIsSafe(chunk, result)) out.push(result.trim()); else { out.push(chunk); kept++; }
      } catch (error) { out.push(chunk); kept++; if (kept === chunks.length) throw error; }
    }
    const after = out.join("\n");
    if (after === draft) return say("Não encontrei o que melhorar com segurança neste capítulo.");
    setProposal({ kind: "rewrite", before: draft, after, kept, total: chunks.length });
    say(`Preparei uma reescrita do capítulo. ${kept ? `${kept} de ${chunks.length} bloco(s) ficaram como estavam porque a versão nova mudava nomes ou o tamanho. ` : ""}Compare abaixo e decida se aplica.`);
  };

  const send = async (raw: string) => {
    const message = raw.trim();
    if (!message || busy) return;
    const history = messages.slice(-8);
    setMessages(list => [...list, { role: "user", content: message }]);
    setInput("");
    setBusy(true);
    try {
      const intent = detectIntent(message);
      if (intent === "guide") say(SHAKSTORY_GUIDE);
      else if (intent === "characters") await runCharacters();
      else if (intent === "rewrite") await runRewrite();
      else if (!online) say("Estou sem internet agora. Offline eu posso explicar o Shakstory e cadastrar nomes de personagens; pergunte “como uso o Shakstory?”.");
      else if (intent === "synopsis") {
        const text = await ask({ prompt: cowilaSystemNote(level) + "\n\nEscreva uma sinopse de 80 a 120 palavras para a quarta capa deste livro, sem spoilers do final, em português do Brasil.", text: digest(), bookTitle: active?.title });
        if (text) { setProposal({ kind: "synopsis", text }); say("Sugeri uma sinopse abaixo. Se gostar, use como descrição do livro."); } else say("Não consegui gerar a sinopse agora.");
      } else {
        const prompt = cowilaSystemNote(level) + "\n\nPergunta do autor: " + message;
        say((await ask({ prompt, text: digest(), history, bookTitle: active?.title })) || "Não consegui responder agora.");
      }
    } catch (error) { fail(error); }
    finally { setBusy(false); }
  };

  const quick: Array<[string, string]> = [
    ["Como uso o Shakstory?", "Como uso o Shakstory?"],
    ["Entender meu projeto", "Entenda e resuma meu projeto"],
    ["Preencher personagens", "Preencher personagens automaticamente"],
    ["Sugerir sinopse", "Sugira a sinopse do livro"],
    ["Reescrever capítulo", "Reescreva este capítulo"],
  ];

  if (!open) {
    return <button type="button" aria-label="Abrir a Cowila" onClick={() => setOpen(true)} className="fixed bottom-20 right-4 z-30 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg lg:bottom-6"><MessageCircle className="h-4 w-4" />Cowila</button>;
  }
  return (
    <aside aria-label="Cowila, atendimento online" className="fixed inset-y-0 right-0 z-30 flex w-full flex-col border-l border-border bg-card shadow-xl sm:w-[380px]">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Cowila · atendimento online</p>
          <p className="text-[11px] text-muted-foreground">{online ? "Online" : "Sem internet"} · {active ? active.title : "nenhum livro aberto"}</p>
        </div>
        <div className="flex items-center gap-1">
          <select aria-label="Seu nível" value={levelPref} onChange={event => { const v = event.target.value as "auto" | Level; setLevelPref(v); put("shakstory:cowila:level", v); }} className="h-8 rounded-md border border-border bg-background px-1 text-[11px]">
            <option value="auto">Nível: automático ({level})</option>
            <option value="iniciante">Sou iniciante</option>
            <option value="experiente">Sou experiente</option>
          </select>
          <Button size="icon" variant="ghost" aria-label="Fechar a Cowila" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
        </div>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm" aria-live="polite">
        <p className="rounded-lg bg-secondary/60 p-3 text-xs leading-5">{WELCOME}</p>
        {messages.map((message, index) => (
          <p key={index} className={"whitespace-pre-wrap rounded-lg p-3 text-[13px] leading-5 " + (message.role === "user" ? "ml-8 bg-primary/10" : "mr-4 border border-border")}>{message.content}</p>
        ))}
        {busy && <p className="text-xs text-muted-foreground">A Cowila está lendo o seu projeto…</p>}
        {proposal?.kind === "synopsis" && (
          <div className="rounded-lg border border-primary/30 p-3">
            <p className="whitespace-pre-wrap text-[13px] leading-5">{proposal.text}</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => { props.onSetDescription(proposal.text); setProposal(null); say("Descrição do livro atualizada. Você pode editá-la em Preparação."); }}>Usar como descrição</Button>
              <Button size="sm" variant="outline" onClick={() => setProposal(null)}>Descartar</Button>
            </div>
          </div>
        )}
        {proposal?.kind === "rewrite" && (
          <div className="rounded-lg border border-primary/30 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Como está</p>
            <p className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap text-xs">{proposal.before.slice(0, 700)}{proposal.before.length > 700 ? "…" : ""}</p>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Proposta</p>
            <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs">{proposal.after.slice(0, 1400)}{proposal.after.length > 1400 ? "…" : ""}</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => { props.onReplaceDraft(proposal.after); setUndo({ before: proposal.before, after: proposal.after }); setProposal(null); say("Reescrita aplicada. Se não gostou, use “Desfazer reescrita”."); }}>Aplicar ao capítulo</Button>
              <Button size="sm" variant="outline" onClick={() => setProposal(null)}>Descartar</Button>
            </div>
          </div>
        )}
        {undo && !proposal && (
          <Button size="sm" variant="outline" onClick={() => { if (draft !== undo.after && !window.confirm("Você editou o capítulo depois da reescrita. Desfazer vai voltar à versão anterior à reescrita. Continuar?")) return; props.onReplaceDraft(undo.before); setUndo(null); say("Reescrita desfeita."); }}>Desfazer reescrita</Button>
        )}
        <div ref={end} />
      </div>
      <div className="border-t border-border p-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {quick.map(([label, text]) => <Button key={label} size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={busy} onClick={() => void send(text)}>{label}</Button>)}
        </div>
        <form className="flex gap-2" onSubmit={event => { event.preventDefault(); void send(input); }}>
          <input aria-label="Mensagem para a Cowila" value={input} onChange={event => setInput(event.target.value)} placeholder="Pergunte ou peça algo…" className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm" />
          <Button type="submit" size="icon" aria-label="Enviar" disabled={busy || !input.trim()}><Send className="h-4 w-4" /></Button>
        </form>
      </div>
    </aside>
  );
}
