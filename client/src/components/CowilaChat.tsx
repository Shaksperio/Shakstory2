import React, { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { Button } from "./ui/button";
import type { CowilaAsk } from "@/lib/trpc";
import { openPlans, usePlan } from "@/lib/plans";
import { feedbackFor, localArithmetic, verifyAnswer } from "@/lib/cowila/mcr";
import {
  SHAKSTORY_GUIDE, assessLevel, buildProjectDigest, candidateCharacters, characterPrompt, chunkParagraphs, cowilaSystemNote, parseVerification, verifyPrompt,
  alternativesPrompt, parseAlternatives, cleanSynopsis, countBookWords, detectIntent, knownBookNames, localCharacters, synopsisPrompt, parseCharacters, rewriteIsSafe, rewritePrompt, type CBook, type Level,
} from "@/lib/cowila/project";
import { buildToc, detectSection, existingSection, focusedChapters, matterSummary, parseSection, sectionPrompt, type SectionTarget } from "@/lib/cowila/sections";

type Msg = { role: "user" | "assistant"; content: string; note?: string };
type Proposal = { kind: "section"; target: SectionTarget; title: string; content: string; existing?: string } | { kind: "synopsis"; text: string } | { kind: "alternatives"; before: string; options: string[] } | { kind: "rewrite"; before: string; after: string; kept: number; total: number };
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
  onSaveSection?: (target: SectionTarget, title: string, content: string) => { replaced: boolean; undo: () => void };
};

const store = (key: string) => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const put = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* conveniência */ }
};

const WELCOME = "Oi! Eu sou a Cowila. Pergunte o que quiser — sobre o seu livro, escrita, publicação ou qualquer outro assunto. Leio seu manuscrito para entender o projeto, e posso explicar o Shakstory, preencher personagens, sugerir a sinopse e reescrever capítulos. Também escrevo capítulos, prólogo, prefácio, posfácio, epílogo e sumário: eu mostro o texto e só gravo se você aprovar.";

export function CowilaChat(props: CowilaChatProps) {
  const { books, active, activeNodeId, draft, online, ask } = props;
  const chatKey = `shakstory:cowila:chat:${active?.id ?? "geral"}`;
  const plan = usePlan();
  const [open, setOpen] = useState(() => store("shakstory:cowila:aberta") === "1");
  const [levelPref, setLevelPref] = useState<"auto" | Level>(() => (store("shakstory:cowila:level") as "auto" | Level) || "auto");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [verify, setVerify] = useState(() => store("shakstory:cowila:verificar") !== "0");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const selection = useRef("");
  const asideRef = useRef<HTMLElement | null>(null);
  const [undoDesc, setUndoDesc] = useState<{ previous: string } | null>(null);
  const [undo, setUndo] = useState<{ before: string; after: string } | null>(null);
  const [undoSection, setUndoSection] = useState<{ label: string; run: () => void } | null>(null);
  const readKey = `shakstory:cowila:leitura:${active?.id ?? "geral"}`;
  const [readOk, setReadOk] = useState(false);
  useEffect(() => { setReadOk(store(readKey) === "1"); }, [readKey]);
  const authorizeRead = (value: boolean) => { setReadOk(value); put(readKey, value ? "1" : "0"); };
  const memKey = `shakstory:cowila:memoria:${active?.id ?? "geral"}`;
  const [memory, setMemory] = useState<string[]>([]);
  useEffect(() => { try { setMemory(JSON.parse(store(memKey) || "[]")); } catch { setMemory([]); } }, [memKey]);
  const saveMemory = (items: string[]) => { setMemory(items); put(memKey, JSON.stringify(items)); };
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

  const say = (content: string, note?: string) => setMessages(list => [...list, { role: "assistant", content, note }]);
  const digest = (message = "") => {
    if (active && !readOk) return "AVISO: o autor ainda não autorizou a Cowila a ler o conteúdo deste livro. Não invente nada sobre o livro; diga que precisa da autorização.";
    const focus = focusedChapters(active, message);
    return [buildProjectDigest(books, active, activeNodeId, draft, 11500, memory), matterSummary(active?.publication), focus].filter(Boolean).join("\n\n");
  };
  const needRead = () => {
    if (!active || readOk) return false;
    say("Para ler e mexer no seu livro eu preciso da sua autorização. Use o botão “Autorizar leitura” no topo da conversa; você pode revogar quando quiser. Nada é gravado sem você aprovar o conteúdo antes.");
    return true;
  };
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

  useEffect(() => {
    // guarda o último trecho selecionado no editor (clicar no botão da Cowila tira o foco, mas a seleção fica guardada aqui)
    const onSelect = () => {
      const current = window.getSelection?.();
      const text = current ? current.toString().trim() : "";
      const anchor = current?.anchorNode;
      if (text.length >= 20 && text.length <= 1500 && !(anchor && asideRef.current?.contains(anchor as Node))) selection.current = text;
    };
    document.addEventListener("selectionchange", onSelect);
    return () => document.removeEventListener("selectionchange", onSelect);
  }, []);

  const runSection = async (target: SectionTarget, request: string) => {
    if (!active) return say("Abra um livro primeiro e eu escrevo essa parte nele.");
    if (!props.onSaveSection) return say("Gravar seções não está disponível nesta tela.");
    const existing = existingSection(active, target);
    if (target.area === "toc") {
      const toc = buildToc(active.nodes);
      if (!toc) return say("O livro ainda não tem capítulos para montar o sumário.");
      setProposal({ kind: "section", target, title: "Sumário", content: toc, existing });
      return say("Montei o sumário com os títulos dos capítulos. Se aprovar, ele é ativado nas exportações e atualizado sempre que você renomear capítulos.");
    }
    if (!online) return say("Para escrever essa parte preciso de internet. Seu livro continua intacto.");
    const raw = await ask({ prompt: cowilaSystemNote(level, "projeto") + "\n\n" + sectionPrompt(target, level, request), text: digest(request), long: true, bookTitle: active.title });
    const parsed = parseSection(raw, target);
    if (!parsed) return say("A IA não devolveu um texto utilizável para essa parte. Nada foi gravado. Tente descrever melhor o que quer.");
    setProposal({ kind: "section", target, title: parsed.title, content: parsed.content, existing });
    say(`Escrevi uma proposta de ${target.key === "chapter" ? "novo capítulo" : target.title}. Leia abaixo, edite se quiser e diga se aprova. Só gravo no livro depois do seu “Aprovar e gravar”.${existing ? " Atenção: já existe conteúdo nessa parte; aprovar substitui, e dá para desfazer em seguida." : ""}`);
  };

  const runAlternatives = async () => {
    const chosen = selection.current;
    if (!chosen) return say("Selecione no editor o trecho que quer reescrever (de uma frase a alguns parágrafos) e clique de novo em “Alternativas do trecho”.");
    if (!online) return say("As alternativas precisam de internet. Seu texto continua intacto.");
    const raw = await ask({ prompt: cowilaSystemNote(level, "projeto") + "\n\n" + alternativesPrompt(level), text: chosen, long: true, bookTitle: active?.title });
    const options = parseAlternatives(raw, chosen);
    if (!options.length) return say("A IA não devolveu alternativas que preservem nomes e tamanho do trecho. Nada foi alterado. Tente de novo ou selecione um trecho menor.");
    setProposal({ kind: "alternatives", before: chosen, options });
    say(`Preparei ${options.length} alternativa(s) para o trecho selecionado. Nenhuma é aplicada sozinha: escolha uma abaixo.`);
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
        const result = await ask({ prompt: cowilaSystemNote(level, "projeto") + "\n\n" + rewritePrompt(level), text: chunk, long: true, bookTitle: active.title });
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
      const section = intent === "guide" ? null : detectSection(message);
      if (section) { if (needRead()) return; return await runSection(section, message); }
      if ((intent === "characters" || intent === "synopsis" || intent === "rewrite") && needRead()) return;
      if (intent === "guide" && (!online || message === "Como uso o Shakstory?")) say(SHAKSTORY_GUIDE);
      else if (intent === "characters") await runCharacters();
      else if (/alternativas do trecho/i.test(message)) await runAlternatives();
      else if (intent === "rewrite") await runRewrite();
      else if (!online) say("Estou sem internet agora. Offline eu posso explicar o Shakstory e cadastrar nomes de personagens; pergunte “como uso o Shakstory?”. Para o resto, preciso de conexão.");
      else if (intent === "synopsis") {
        if (!active || countBookWords(active) < 300) return say("Ainda há pouco texto neste livro (menos de 300 palavras) para eu escrever uma sinopse fiel, sem inventar. Escreva mais alguns parágrafos e peça de novo.");
        let clean = cleanSynopsis(await ask({ prompt: synopsisPrompt(level), text: digest(), bookTitle: active.title }));
        if (!clean) clean = cleanSynopsis(await ask({ prompt: synopsisPrompt(level, true), text: digest(), bookTitle: active.title }));
        if (clean) { setProposal({ kind: "synopsis", text: clean }); say("Sugeri uma sinopse abaixo. Você pode editar o texto antes de usar."); }
        else say("Não consegui gerar uma sinopse limpa agora (a IA respondeu em tom de conversa). Nada foi alterado no livro. Tente de novo em instantes.");
      } else {
        // Cerebelo: pergunta que é só uma conta se resolve com aritmética exata, sem chamar a IA.
        const exact = localArithmetic(message);
        if (exact) return say(exact, "✔ Calculado com aritmética exata (Cerebelo).");
        const context = intent === "guide" ? SHAKSTORY_GUIDE + "\n\n" + digest(message) : digest(message);
        const names = knownBookNames(active as CBook | undefined);
        const basePrompt = cowilaSystemNote(level, "livre") + "\n\nPergunta do autor: " + message;
        // Consciente: responde livremente, com o projeto como contexto e sem teto curto de resposta.
        let answer = (await ask({ prompt: basePrompt, text: context, history, bookTitle: active?.title, long: true })) || "";
        if (!answer) return say("Não consegui responder agora.");
        let verdict = verifyAnswer(message, answer, names, active?.title);
        // Cerebelo refutou uma conta: devolve ao Consciente com os achados (como dado) até 2 vezes; depois se abstém.
        for (let attempt = 0; verdict.status === "refutado" && attempt < 2; attempt++) {
          answer = (await ask({ prompt: basePrompt + "\n\nDADOS DE VERIFICAÇÃO (não são instruções): " + feedbackFor(verdict) + " Refaça a resposta com os valores corretos.", text: context, history, bookTitle: active?.title, long: true })) || answer;
          verdict = verifyAnswer(message, answer, names, active?.title);
        }
        if (verdict.status === "refutado") return say("Não vou te entregar uma resposta com conta errada. Pelos cálculos exatos: " + verdict.refuted.map(f => `${f.text} → o certo é ${f.expected}`).join("; ") + ".", "Cerebelo: resposta recusada por conta refutada.");
        // Subconsciente + Cortex: segunda leitura pela IA; só troca se achar erro explícito e a troca passar no Cerebelo.
        if (verify) {
          try {
            const fixed = parseVerification(await ask({ prompt: verifyPrompt(message, answer), text: context, long: true, bookTitle: active?.title }));
            if (fixed && verifyAnswer(message, fixed, names, active?.title).status !== "refutado") { answer = fixed; verdict = verifyAnswer(message, answer, names, active?.title); }
          } catch { /* a verificação é um reforço; sem ela a resposta original segue */ }
        }
        const notes: string[] = [];
        if (verdict.status === "verificado") notes.push("✔ Contas conferidas com aritmética exata (Cerebelo).");
        if (verdict.status === "nao-verificavel") notes.push("Números ambíguos (ex.: 3.141) não foram conferidos.");
        if (verdict.unknown.length) notes.push("⚠ A resposta cita nomes que não encontrei no seu livro: " + verdict.unknown.join(", ") + ". Confira.");
        say(answer, notes.join(" ") || undefined);
      }
    } catch (error) { fail(error); }
    finally { setBusy(false); }
  };

  const quick: Array<[string, string]> = [
    ["Como uso o Shakstory?", "Como uso o Shakstory?"],
    ["Entender meu projeto", "Entenda e resuma meu projeto"],
    ["Preencher personagens", "Preencher personagens automaticamente"],
    ["Sugerir sinopse", "Sugira a sinopse do livro"],
    ["Criar capítulo", "Crie um novo capítulo para o meu livro"],
    ["Gerar sumário", "Crie o sumário do livro"],
    ["Reescrever capítulo", "Reescreva este capítulo"],
    ["Alternativas do trecho", "Alternativas do trecho selecionado"],
  ];

  if (!open) {
    return <button type="button" aria-label="Abrir a Cowila" onClick={() => setOpen(true)} className="fixed bottom-20 right-4 z-30 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg lg:bottom-6"><MessageCircle className="h-4 w-4" />Cowila</button>;
  }
  if (!plan.features.cowila) {
    return (
      <aside aria-label="Cowila, atendimento online" className="fixed inset-y-0 right-0 z-30 flex h-[100dvh] w-full max-w-full flex-col overflow-hidden border-l border-border bg-card shadow-xl sm:w-[380px]">
        <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
          <p className="text-sm font-semibold leading-tight">Cowila · atendimento online</p>
          <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" aria-label="Fechar a Cowila" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
        </header>
        <div className="space-y-3 p-4 text-sm">
          <p className="rounded-lg bg-secondary/60 p-3 text-xs leading-5">O atendimento da Cowila não está incluído no seu plano atual ({plan.label}). {plan.plan === "expirado" ? "Seu teste de 7 dias terminou." : "Ele faz parte dos planos Premium e VIP."} Você continua podendo escrever e baixar o backup.</p>
          <Button onClick={openPlans}>Ver planos</Button>
        </div>
      </aside>
    );
  }
  return (
    <aside ref={asideRef} aria-label="Cowila, atendimento online" className="fixed inset-y-0 right-0 z-30 flex h-[100dvh] w-full max-w-full flex-col overflow-hidden border-l border-border bg-card shadow-xl sm:w-[380px]">
      <header className="border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">Cowila · atendimento online</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{online ? "Online" : "Sem internet"} · {active ? active.title : "nenhum livro aberto"}</p>
          </div>
          <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" aria-label="Fechar a Cowila" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
        </div>
        <label className="mt-2 flex items-start gap-2 text-[11px] leading-4 text-muted-foreground">
          <input type="checkbox" className="mt-0.5" checked={verify} onChange={event => { setVerify(event.target.checked); put("shakstory:cowila:verificar", event.target.checked ? "1" : "0"); }} />
          <span>Modo livre com verificação: responde qualquer assunto e confere a própria resposta (Consciente → Subconsciente → Cortex) antes de mostrar. Mais lento.</span>
        </label>
        <select aria-label="Seu nível" value={levelPref} onChange={event => { const v = event.target.value as "auto" | Level; setLevelPref(v); put("shakstory:cowila:level", v); }} className="mt-2 h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-[11px]">
          <option value="auto">Nível: automático ({level})</option>
          <option value="iniciante">Sou iniciante</option>
          <option value="experiente">Sou experiente</option>
        </select>
        {active && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-secondary/60 px-2 py-1.5 text-[11px] leading-4">
            <span>{readOk ? "Leitura do livro autorizada." : "Leitura do livro ainda não autorizada."}</span>
            <Button size="sm" variant="outline" className="h-7 shrink-0 px-2 text-[11px]" onClick={() => authorizeRead(!readOk)}>{readOk ? "Revogar" : "Autorizar leitura"}</Button>
          </div>
        )}
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto p-4 text-sm" aria-live="polite">
        <p className="rounded-lg bg-secondary/60 p-3 text-xs leading-5">{WELCOME}</p>
        {messages.map((message, index) => (
          <div key={index} className={"rounded-lg p-3 text-[13px] leading-5 " + (message.role === "user" ? "ml-8 bg-primary/10" : "mr-4 border border-border")}>
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
            {message.note && <p className="mt-1.5 text-[11px] text-muted-foreground">{message.note}</p>}
            {message.role === "assistant" && message.content.length > 20 && !memory.includes(message.content.slice(0, 240)) && <button type="button" className="mt-1.5 text-[11px] underline text-muted-foreground" onClick={() => saveMemory([...memory, message.content.slice(0, 240)].slice(-30))}>Lembrar isso</button>}
          </div>
        ))}
        {busy && <p className="text-xs text-muted-foreground">A Cowila está lendo o seu projeto…</p>}
        {proposal?.kind === "section" && (
          <div className="rounded-lg border border-primary/30 p-3" aria-label="Proposta de seção">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{proposal.target.key === "chapter" ? "Novo capítulo" : proposal.target.title} · aguardando sua aprovação</p>
            {proposal.target.area === "chapter" && <input aria-label="Título da seção" value={proposal.title} onChange={event => setProposal({ ...proposal, title: event.target.value })} className="mt-2 h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-[13px]" />}
            <textarea aria-label="Conteúdo proposto" value={proposal.content} onChange={event => setProposal({ ...proposal, content: event.target.value })} rows={10} readOnly={proposal.target.area === "toc"} className="mt-2 w-full min-w-0 rounded-md border border-border bg-background p-2 text-[13px] leading-5" />
            {proposal.existing && <p className="mt-1 text-[11px] text-muted-foreground">Já existe conteúdo nesta parte ({(proposal.existing.match(/\S+/g) ?? []).length} palavras). Aprovar substitui.</p>}
            <div className="mt-2 flex gap-2">
              <Button size="sm" disabled={!proposal.content.trim() || !proposal.title.trim()} onClick={() => {
                const result = props.onSaveSection?.(proposal.target, proposal.title.trim(), proposal.content.trim());
                if (!result) return;
                setUndoSection({ label: proposal.title.trim(), run: result.undo }); setProposal(null);
                say(`Gravei “${proposal.title.trim()}” no livro${result.replaced ? " (substituindo o que havia)" : ""}. Confira em Capítulos ou Preparação. Se não gostou, use “Desfazer gravação”.`);
              }}>Aprovar e gravar</Button>
              <Button size="sm" variant="outline" onClick={() => { setProposal(null); say("Entendido, não gravei nada. Se quiser, diga o que mudar e eu escrevo de novo."); }}>Não aprovar</Button>
            </div>
          </div>
        )}
        {undoSection && !proposal && (
          <Button size="sm" variant="outline" onClick={() => { undoSection.run(); say(`Gravação de “${undoSection.label}” desfeita.`); setUndoSection(null); }}>Desfazer gravação</Button>
        )}
        {proposal?.kind === "synopsis" && (
          <div className="rounded-lg border border-primary/30 p-3">
            <textarea aria-label="Sinopse sugerida" value={proposal.text} onChange={event => setProposal({ kind: "synopsis", text: event.target.value })} rows={8} className="w-full min-w-0 rounded-md border border-border bg-background p-2 text-[13px] leading-5" />
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => {
                const previous = active?.publication?.description ?? "";
                if (previous.trim() && !window.confirm("O livro já tem uma descrição. Substituir por esta sinopse? Dá para restaurar a anterior em seguida.")) return;
                setUndoDesc({ previous }); props.onSetDescription(proposal.text); setProposal(null); say("Descrição do livro atualizada. Você pode editá-la em Preparação ou restaurar a anterior abaixo.");
              }}>Usar como descrição</Button>
              <Button size="sm" variant="outline" onClick={() => setProposal(null)}>Descartar</Button>
            </div>
          </div>
        )}
        {proposal?.kind === "alternatives" && (
          <div className="rounded-lg border border-primary/30 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Trecho original</p>
            <p className="mt-1 max-h-20 overflow-y-auto whitespace-pre-wrap text-xs">{proposal.before}</p>
            {proposal.options.map((option, index) => (
              <div key={index} className="mt-3 border-t border-border pt-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Alternativa {index + 1}</p>
                <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs">{option}</p>
                <Button size="sm" className="mt-1.5" onClick={() => {
                  const first = draft.indexOf(proposal.before);
                  if (first < 0 || draft.indexOf(proposal.before, first + 1) !== -1) { say("Não consegui localizar esse trecho com exatidão no capítulo (ele mudou ou aparece mais de uma vez). Copie a alternativa e cole no lugar." ); return; }
                  const next = draft.slice(0, first) + option + draft.slice(first + proposal.before.length);
                  props.onReplaceDraft(next); setUndo({ before: draft, after: next }); setProposal(null); selection.current = ""; say("Alternativa aplicada ao trecho. Se não gostou, use “Desfazer reescrita”.");
                }}>Usar a alternativa {index + 1}</Button>
              </div>
            ))}
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setProposal(null)}>Descartar</Button>
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
        {undoDesc && !proposal && (
          <Button size="sm" variant="outline" onClick={() => { props.onSetDescription(undoDesc.previous); setUndoDesc(null); say("Descrição anterior restaurada."); }}>Restaurar descrição anterior</Button>
        )}
        {undo && !proposal && (
          <Button size="sm" variant="outline" onClick={() => { if (draft !== undo.after && !window.confirm("Você editou o capítulo depois da reescrita. Desfazer vai voltar à versão anterior à reescrita. Continuar?")) return; props.onReplaceDraft(undo.before); setUndo(null); say("Reescrita desfeita."); }}>Desfazer reescrita</Button>
        )}
        {memory.length > 0 && (
          <details className="rounded-lg border border-border p-3 text-xs">
            <summary className="cursor-pointer font-medium">Memória da Cowila ({memory.length})</summary>
            <p className="mt-1 text-muted-foreground">Fatos que você pediu para lembrar. Entram no contexto das respostas deste livro. Guardados só neste aparelho.</p>
            <ul className="mt-2 space-y-1">{memory.map((item, i) => <li key={i} className="flex items-start justify-between gap-2"><span className="min-w-0 break-words">{item}</span><button type="button" aria-label="Esquecer" className="shrink-0 text-muted-foreground" onClick={() => saveMemory(memory.filter((_, j) => j !== i))}>×</button></li>)}</ul>
          </details>
        )}
        <div ref={end} />
      </div>
      <div className="border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {quick.map(([label, text]) => <Button key={label} size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={busy} onClick={() => void send(text)}>{label}</Button>)}
        </div>
        <form className="flex gap-2" onSubmit={event => { event.preventDefault(); void send(input); }}>
          <input aria-label="Mensagem para a Cowila" value={input} onChange={event => setInput(event.target.value)} placeholder="Pergunte ou peça algo…" className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm" />
          <Button type="submit" size="icon" className="shrink-0" aria-label="Enviar" disabled={busy || !input.trim()}><Send className="h-4 w-4" /></Button>
        </form>
      </div>
    </aside>
  );
}
