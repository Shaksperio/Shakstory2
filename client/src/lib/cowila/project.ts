// Cowila: leitura do projeto, ajuda para iniciantes e preenchimento de personagens.
// Tudo aqui é determinístico e testável; a IA só entra com texto já recortado do próprio livro.
import { detectBookNames } from "../proofread/engine";

export type CNode = { id: string; title: string; kind: string; content: string };
export type CCharacter = { id: string; name: string; role: string; notes: string; tags?: string[]; status?: string };
export type CBook = {
  id: string;
  title: string;
  status?: string;
  nodes: CNode[];
  planning?: { characters: CCharacter[]; locations?: Array<{ name: string }>; timeline?: unknown[] };
  publication?: { genre?: string; category?: string; description?: string; author?: string; includeToc?: boolean; frontMatter?: Array<{ id: string; title: string; content: string; enabled?: boolean }>; backMatter?: Array<{ id: string; title: string; content: string; enabled?: boolean }> };
};
export type Level = "iniciante" | "experiente";

const words = (text: string) => (text.match(/\S+/g) ?? []).length;
const bodyNodes = (book: CBook) => book.nodes.filter(node => node.kind !== "part");

export function countBookWords(book: CBook): number {
  return bodyNodes(book).reduce((sum, node) => sum + words(node.content), 0);
}

/** Iniciante: pouco texto escrito e projeto quase sem planejamento. O usuário pode forçar o nível. */
export function assessLevel(books: CBook[]): Level {
  const total = books.reduce((sum, book) => sum + countBookWords(book), 0);
  const planned = books.some(book => (book.planning?.characters.length ?? 0) >= 2 || Boolean(book.publication?.description));
  return total < 5000 || (!planned && books.length <= 1) ? "iniciante" : "experiente";
}

/** Resumo do projeto para a IA caber no limite do servidor (≈12 000 caracteres). */
export function buildProjectDigest(books: CBook[], active: CBook | undefined, activeNodeId: string | undefined, draft: string, limit = 11500, memory: string[] = []): string {
  const out: string[] = [];
  if (memory.length) out.push("MEMÓRIA APROVADA PELO AUTOR (fatos que ele pediu para lembrar):", ...memory.slice(0, 20).map(item => "- " + item.slice(0, 240)), "");
  out.push("BIBLIOTECA DO AUTOR:");
  for (const book of books.slice(0, 12)) {
    out.push(`- ${book.title} (${book.status ?? "rascunho"}, ${countBookWords(book)} palavras, ${bodyNodes(book).length} capítulos${book.id === active?.id ? ", LIVRO ATIVO" : ""})`);
  }
  if (active) {
    const pub = active.publication ?? {};
    out.push("", `LIVRO ATIVO: ${active.title}`);
    if (pub.genre || pub.category) out.push(`Gênero: ${[pub.genre, pub.category].filter(Boolean).join(" / ")}`);
    if (pub.description) out.push(`Descrição: ${pub.description.slice(0, 600)}`);
    const planning = active.planning;
    if (planning?.characters.length) out.push("Personagens cadastrados: " + planning.characters.slice(0, 30).map(c => `${c.name}${c.role ? " (" + c.role + ")" : ""}`).join("; "));
    if (planning?.locations?.length) out.push("Locais cadastrados: " + planning.locations.slice(0, 20).map(l => l.name).join("; "));
    out.push("", "CAPÍTULOS (início de cada um):");
    const chapters = bodyNodes(active);
    const room = Math.max(120, Math.floor((limit - 3500) / Math.max(1, chapters.length)));
    for (const node of chapters.slice(0, 60)) {
      const flat = node.content.replace(/\s+/g, " ").trim();
      out.push(`## ${node.title} (${words(node.content)} palavras)${node.id === activeNodeId ? " [CAPÍTULO ABERTO]" : ""}: ${flat.slice(0, Math.min(room, 700))}${flat.length > room ? "…" : ""}`);
    }
    const open = draft.replace(/\s+/g, " ").trim();
    if (open) out.push("", "TRECHO FINAL DO CAPÍTULO ABERTO: " + open.slice(-1200));
  }
  const text = out.join("\n");
  return text.length > limit ? text.slice(0, limit) : text;
}

// ---- Personagens ----
const NOT_PEOPLE = new Set(
  ("segunda terça quarta quinta sexta sábado domingo janeiro fevereiro março abril maio junho julho agosto setembro outubro novembro dezembro " +
    "deus senhor senhora dona dom capítulo parte prólogo epílogo brasil portugal").split(" ")
);
const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type Candidate = { name: string; count: number; snippets: string[] };

/** Nomes próprios recorrentes no livro inteiro, com trechos de evidência. */
export function candidateCharacters(book: CBook, max = 14): Candidate[] {
  const full = bodyNodes(book).map(node => node.content).join("\n\n");
  const names = detectBookNames(full, [], 2).filter(name => !NOT_PEOPLE.has(fold(name)));
  const known = new Set((book.planning?.characters ?? []).map(c => fold(c.name)));
  const result: Candidate[] = [];
  for (const name of names) {
    if (known.has(fold(name))) continue;
    const pattern = new RegExp(`(?<![A-Za-zÀ-ÿ])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-zÀ-ÿ])`, "g");
    const snippets: string[] = [];
    let count = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(full))) {
      count++;
      if (snippets.length < 3) snippets.push(full.slice(Math.max(0, match.index - 110), Math.min(full.length, match.index + name.length + 110)).replace(/\s+/g, " ").trim());
    }
    result.push({ name, count, snippets });
  }
  return result.sort((a, b) => b.count - a.count).slice(0, max);
}

export function characterPrompt(candidates: Candidate[]): string {
  return (
    "Tarefa: a partir dos trechos de um romance, diga quais destes nomes são PERSONAGENS (pessoas ou seres que agem) e descreva cada um. " +
    "Use somente o que os trechos mostram; se não der para saber, deixe role vazio e notes curto. Ignore lugares, objetos e títulos. " +
    'Responda APENAS com JSON válido, sem texto antes ou depois, no formato {"characters":[{"name":"","role":"","notes":""}]}. ' +
    "role: função na história em até 4 palavras (ex.: protagonista, mentor). notes: uma ou duas frases em português.\n\n" +
    candidates.map(c => `NOME: ${c.name} (aparece ${c.count}x)\n` + c.snippets.map(s => `- ${s}`).join("\n")).join("\n\n")
  );
}

/** Lê o JSON devolvido pela IA e só aceita nomes que realmente eram candidatos (a IA não inventa personagem). */
export function parseCharacters(raw: string, candidates: Candidate[]): Array<{ name: string; role: string; notes: string }> {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return [];
  try {
    const data = JSON.parse(raw.slice(start, end + 1));
    const list = Array.isArray(data?.characters) ? data.characters : [];
    const byKey = new Map(candidates.map(c => [fold(c.name), c.name] as [string, string]));
    const seen = new Set<string>();
    const out: Array<{ name: string; role: string; notes: string }> = [];
    for (const item of list) {
      const key = fold(String(item?.name ?? "").trim());
      const canonical = byKey.get(key);
      if (!canonical || seen.has(key)) continue;
      seen.add(key);
      out.push({ name: canonical, role: String(item?.role ?? "").trim().slice(0, 60), notes: String(item?.notes ?? "").trim().slice(0, 400) });
    }
    return out;
  } catch {
    return [];
  }
}

/** Sem IA: cadastra o nome com a primeira evidência, marcado para o autor confirmar. */
export function localCharacters(candidates: Candidate[]): Array<{ name: string; role: string; notes: string }> {
  return candidates.map(c => ({ name: c.name, role: "", notes: `A confirmar. Aparece ${c.count}x. Trecho: “${c.snippets[0] ?? ""}”`.slice(0, 400) }));
}

/** Soma ao que já existe: nunca apaga nem sobrescreve campo preenchido pelo autor. */
export function mergeCharacters(existing: CCharacter[], found: Array<{ name: string; role: string; notes: string }>, makeId: () => string): { characters: CCharacter[]; added: number; updated: number } {
  const next = existing.map(c => ({ ...c }));
  let added = 0;
  let updated = 0;
  for (const item of found) {
    const hit = next.find(c => fold(c.name) === fold(item.name));
    if (hit) {
      let changed = false;
      if (!hit.role.trim() && item.role) { hit.role = item.role; changed = true; }
      if (!hit.notes.trim() && item.notes) { hit.notes = item.notes; changed = true; }
      if (changed) updated++;
    } else {
      next.push({ id: makeId(), name: item.name, role: item.role, notes: item.notes, tags: ["cowila"], status: "draft" });
      added++;
    }
  }
  return { characters: next, added, updated };
}

// ---- Ajuda ----
export const SHAKSTORY_GUIDE =
  "Como o Shakstory se organiza:\n" +
  "• Biblioteca: todos os seus livros. Crie, abra, arquive, exporte e exclua projetos.\n" +
  "• Projeto: visão do livro aberto, com progresso, meta e próximos passos.\n" +
  "• Planejamento: Personagens, Locais, Timeline, Story Boards e Story Engine (objetivos, conflitos e cenas).\n" +
  "• Manuscrito: onde você escreve, por capítulos. As abas “Revisão e histórico”, “Corretor” e “Preferências” ficam logo acima.\n" +
  "• Preparação: capa, créditos, copyright e a exportação (PDF, EPUB, DOCX…).\n" +
  "• Segurança dos dados: cópia automática no seu aparelho e no Firebase.\n" +
  "Comece assim: crie o livro, escreva o primeiro capítulo, e peça aqui “preencher personagens”. Eu leio o que você escreveu e monto a ficha, sem apagar nada que já esteja preenchido.";

export type Intent = "guide" | "characters" | "synopsis" | "rewrite" | "summary" | "chat";
export function detectIntent(message: string): Intent {
  const m = fold(message);
  if (/(preench|cri|extra|monte|cadastr|gere|adicion).{0,30}personagen/.test(m) || /personagen.{0,30}(automatic|sozinh|do manuscrito)/.test(m)) return "characters";
  if (/(sinopse|descricao do livro|resumo de capa|orelha)/.test(m) && /(escrev|crie|gere|sugir|preench|fa[cz]a|monte)/.test(m)) return "synopsis";
  if (/reescrev/.test(m)) return "rewrite";
  if (/(como (eu )?(uso|funciona|comeco|faco)|o que (e|faz)|me ajud|explique|tutorial|nao sei|por onde)/.test(m) && /(shakstory|aba|opcao|opcoes|recurso|funcao|programa|sistema|comec|usar|usa)/.test(m)) return "guide";
  if (/(entenda|resum|analis).{0,25}(meu )?(projeto|livro|historia|manuscrito)/.test(m)) return "summary";
  return "chat";
}

export type NoteMode = "livre" | "projeto";
/** "projeto": tarefas que mexem no livro (sinopse, personagens, reescrita) só podem usar o que está no resumo. "livre": responde qualquer pergunta. */
export function cowilaSystemNote(level: Level, mode: NoteMode = "projeto"): string {
  const voice =
    level === "iniciante"
      ? "O autor é iniciante: use palavras simples e explique termos técnicos em uma frase. "
      : "O autor é experiente: seja direta e técnica, sem explicar o básico. ";
  if (mode === "livre") {
    return (
      "Você é a Cowila, assistente literária e de conhecimento geral do Shakstory, falando em português do Brasil. " +
      "Responda a QUALQUER pergunta do autor — escrita, gramática, mercado editorial, publicação, história, ciência, tecnologia, ideias, dúvidas do dia a dia — com o seu conhecimento, de forma completa e útil; você não se limita ao Shakstory nem ao livro aberto. " +
      "Quando a pergunta for sobre o livro do autor, use o resumo do projeto como contexto e, se o detalhe não estiver nele, diga que não leu essa parte em vez de inventar. " +
      "Se não souber ou não tiver certeza de um fato, diga com honestidade; nunca invente dados, citações ou fontes. " +
      "Quando a pergunta for sobre como usar o Shakstory, indique onde clicar. " +
      voice +
      "Nunca altere o manuscrito sozinha: proponha, e o autor decide."
    );
  }
  return (
    "Você é a Cowila, assistente literária do Shakstory, falando em português do Brasil. " +
    "Nesta tarefa baseie-se SOMENTE no resumo do projeto abaixo; se algo não estiver nele, diga que não leu essa parte. Nunca invente trechos, personagens ou fatos do livro. " +
    voice +
    "Nunca altere o manuscrito sozinha: proponha, e o autor decide."
  );
}

/** Subconsciente (MCR): confere a resposta do Consciente contra a pergunta e os fatos do projeto (Cortex). */
export function verifyPrompt(question: string, answer: string): string {
  return (
    "Você é o verificador (Subconsciente) da Cowila. Confira a RESPOSTA à PERGUNTA do autor, usando o resumo do projeto como fatos conhecidos. " +
    "Se a resposta estiver correta, útil e sem contradição, responda apenas: OK\n" +
    "Se houver erro factual, contradição com o projeto, invenção ou ela não responder à pergunta, responda começando por 'CORREÇÃO:' e em seguida a resposta corrigida COMPLETA, em português, sem comentar a verificação.\n\n" +
    "PERGUNTA: " + question + "\n\nRESPOSTA:\n" + answer
  );
}
/** Só aceita correção explícita; qualquer outra coisa mantém a resposta original. */
export function parseVerification(raw: string): string | null {
  const text = raw.trim();
  const match = /^corre[cç][aã]o\s*:\s*([\s\S]+)$/i.exec(text);
  return match && match[1].trim().length > 20 ? match[1].trim() : null;
}

/** Divide um capítulo em blocos de parágrafos que cabem em uma chamada da IA. */
export function chunkParagraphs(text: string, size = 3200): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of text.split(/\n/)) {
    if (current && current.length + paragraph.length + 1 > size) { chunks.push(current); current = ""; }
    // parágrafo gigante: corta em frases
    if (paragraph.length > size) {
      for (const sentence of paragraph.match(/[^.!?…]+[.!?…]*\s*/g) ?? [paragraph]) {
        if (current && current.length + sentence.length > size) { chunks.push(current); current = ""; }
        current += sentence;
      }
      current += "\n";
    } else current += paragraph + "\n";
  }
  if (current.trim()) chunks.push(current);
  return chunks.map(chunk => chunk.replace(/\n+$/, ""));
}

/** A reescrita só entra se mantiver a extensão e todos os nomes próprios do trecho original. */
export function rewriteIsSafe(original: string, rewritten: string): boolean {
  const a = original.trim().length;
  const b = rewritten.trim().length;
  if (!a || !b || b < a * 0.5 || b > a * 1.8) return false;
  return detectBookNames(original, [], 1).every(name => rewritten.indexOf(name) !== -1);
}

export function alternativesPrompt(level: Level): string {
  return (
    "Reescreva o trecho em 'Texto atual' de TRÊS maneiras diferentes entre si, mantendo exatamente os fatos, os nomes, as falas e a voz do autor. " +
    (level === "iniciante" ? "Melhore clareza, ritmo e pontuação. " : "Varie ritmo e precisão, preservando as escolhas de estilo. ") +
    "Cada versão com extensão parecida à do original. Responda SOMENTE com JSON válido neste formato, sem comentários: {\"alternativas\":[\"versão 1\",\"versão 2\",\"versão 3\"]}"
  );
}

/** Lê as alternativas da resposta da IA (JSON, ou lista numerada como plano B) e descarta as que não passam na validação de escopo. */
export function parseAlternatives(raw: string, original: string, max = 3): string[] {
  let list: string[] = [];
  const json = /\{[\s\S]*\}/.exec(raw);
  if (json) {
    try {
      const data = JSON.parse(json[0]) as { alternativas?: unknown };
      if (Array.isArray(data.alternativas)) list = data.alternativas.filter((item): item is string => typeof item === "string");
    } catch { /* tenta a lista numerada */ }
  }
  if (!list.length) list = raw.split(/\n\s*(?:\d+[.)]|[-•])\s+/).slice(1);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const text = item.trim().replace(/^["“]|["”]$/g, "").trim();
    if (!text || text === original.trim() || seen.has(text) || !rewriteIsSafe(original, text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

export function rewritePrompt(level: Level): string {
  return (
    "Reescreva o trecho em 'Texto atual' mantendo exatamente os fatos, os nomes, as falas e a voz do autor. " +
    (level === "iniciante" ? "Melhore clareza, ritmo e pontuação, corrigindo erros. " : "Refine ritmo e precisão, preservando as escolhas de estilo. ") +
    "Mantenha extensão parecida e o mesmo número de parágrafos. Devolva SOMENTE o texto reescrito, sem comentários, aspas ou títulos."
  );
}

/** Pedido de sinopse: só o texto final, sem conversa. */
export function synopsisPrompt(level: Level, strict = false): string {
  return (
    cowilaSystemNote(level, "projeto") +
    "\n\nTAREFA: escreva a sinopse de quarta capa deste livro, em 80 a 120 palavras, sem spoilers do final, usando SOMENTE o que está no resumo do projeto. " +
    "FORMATO OBRIGATÓRIO: devolva apenas o texto da sinopse, em um ou dois parágrafos. Não cumprimente, não se apresente, não explique o que é uma sinopse, " +
    "não faça perguntas, não dê opções e não comente o resultado." +
    (strict ? " Sua resposta anterior continha conversa. Comece diretamente pela primeira frase da sinopse." : "")
  );
}

/** Aceita só se parecer uma sinopse; resposta de conversa (saudação, pergunta, explicação) é descartada. */
export function cleanSynopsis(raw: string): string | null {
  let text = raw.trim().replace(/^(sinopse|quarta capa)\s*[:\-–]\s*/i, "").replace(/^["“«]+|["”»]+$/g, "").trim();
  if (!text || /[?？]/.test(text)) return null;
  if (new RegExp("(?<![\\p{L}])(ol[áa]|sou a cowila|assistente liter[áa]ria|vamos (come[cç]ar|criar)|o que voc[êe]|quer continuar|uma sinopse [ée]|aqui est[áa])(?![\\p{L}])", "iu").test(text)) return null;
  if (text.split(/\n\s*\n/).length > 3) return null;
  const count = (text.match(/\S+/g) ?? []).length;
  return count >= 40 && count <= 170 ? text : null;
}

/** Nomes que existem no livro: fichas de personagens e locais + nomes próprios recorrentes no manuscrito. */
export function knownBookNames(book: CBook | undefined): string[] {
  if (!book) return [];
  const full = bodyNodes(book).map(node => node.content).join("\n\n");
  const names = detectBookNames(full, [], 2);
  for (const c of book.planning?.characters ?? []) names.push(c.name);
  for (const l of book.planning?.locations ?? []) names.push(l.name);
  return names.filter(name => name.trim());
}
