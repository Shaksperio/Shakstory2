// Corretor local (offline) do Shakstory — camadas 1–2 da proposta para escritores iniciantes.
// Princípios: nunca altera o texto sozinho; cada achado traz motivo; ficção quebra regras de
// propósito, então tudo é hipótese. Não há lista completa de palavras pt-BR (decisão de licença
// em aberto): só erros formais, grafias inexistentes conhecidas e inconsistência de nomes.

export type IssueKind = "spelling" | "grammar" | "consistency" | "style";
export type IssueRisk = "low" | "medium";

export type Issue = {
  id: string;
  kind: IssueKind;
  rule: string;
  start: number;
  end: number;
  original: string;
  /** Ausente nos alertas de estilo, que são só perguntas. */
  suggestion?: string;
  reason: string;
  /** Regra em uma frase, para "Entender a regra". */
  explain?: string;
  /** "low" pode entrar em aceite em lote (com prévia e desfazer). */
  risk: IssueRisk;
};

export type ProofreadOptions = {
  /** "preserve": só ortografia e acentuação, sem gramática nem estilo. */
  mode?: "preserve" | "full";
  style?: boolean;
  /** Palavras que o autor mandou ignorar (comparação sem caixa). */
  ignored?: string[];
  /** Nomes extras do livro (personagens, lugares). */
  names?: string[];
};

const LETTER = "A-Za-zÀ-ÖØ-öø-ÿ";
const LOWER = "a-zß-öø-ÿ";
const UPPER = "A-ZÀ-ÖØ-Þ";

/** Erros comuns que nunca são palavras válidas em português. */
const KNOWN_MISSPELLINGS: Record<string, [string, string]> = {
  voce: ["você", "Falta o acento agudo."],
  voces: ["vocês", "Falta o acento agudo."],
  nao: ["não", "Falta o til."],
  entao: ["então", "Falta o til."],
  tambem: ["também", "Falta o acento agudo."],
  porem: ["porém", "Falta o acento agudo."],
  alem: ["além", "Falta o acento agudo."],
  apos: ["após", "Falta o acento agudo."],
  ninguem: ["ninguém", "Falta o acento agudo."],
  alguem: ["alguém", "Falta o acento agudo."],
  atraves: ["através", "Falta o acento agudo."],
  excessao: ["exceção", "Exceção se escreve com ç."],
  exceçao: ["exceção", "Falta o til."],
  enchergar: ["enxergar", "Enxergar se escreve com x."],
  enchergou: ["enxergou", "Enxergar se escreve com x."],
  beneficiente: ["beneficente", "A forma correta é beneficente."],
  previlégio: ["privilégio", "A forma correta é privilégio."],
  privilegio: ["privilégio", "Falta o acento agudo."],
  asterístico: ["asterisco", "A forma correta é asterisco."],
  mortandela: ["mortadela", "A forma correta é mortadela."],
  rúbrica: ["rubrica", "Rubrica não leva acento."],
  advinhar: ["adivinhar", "A forma correta é adivinhar."],
  desinteria: ["disenteria", "A forma correta é disenteria."],
  frustação: ["frustração", "Falta o r: frustração."],
  derrepente: ["de repente", "Escreve-se separado: de repente."],
  deprepente: ["de repente", "Escreve-se separado: de repente."],
  concerteza: ["com certeza", "Escreve-se separado: com certeza."],
  porisso: ["por isso", "Escreve-se separado: por isso."],
};
const ABBREVIATIONS = new Set([
  "sr", "sra", "srta", "dr", "dra", "prof", "profa", "etc", "pág", "pag", "p", "ex", "av", "cap",
  "obs", "vol", "ed", "tel", "ltda", "cia", "nº", "n", "art", "fig", "séc", "min", "seg", "h", "km", "cm", "mm",
]);

const STOPWORDS = new Set(
  ("que para com uma uns umas dos das nos nas pelo pela pelos pelas por não mais mas como foi era ser ter tinha sua seu suas seus " +
    "ele ela eles elas isso esse essa esses essas aquele aquela este esta estes estas quando onde porque depois ainda muito muita " +
    "tudo toda todo todas todos então já só até sem sobre entre cada outro outra outros outras mesmo mesma havia havia estava " +
    "disse fazer pode podia aqui ali lá agora também assim nem sempre nunca dentro fora ").split(" ")
);

const strip = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function lines(text: string): Array<{ start: number; text: string }> {
  const result: Array<{ start: number; text: string }> = [];
  let start = 0;
  const parts = text.split("\n");
  for (let i = 0; i < parts.length; i++) {
    result.push({ start, text: parts[i] });
    start += parts[i].length + 1;
  }
  return result;
}

function matchCase(source: string, target: string): string {
  if (source.length > 1 && source === source.toUpperCase()) return target.toUpperCase();
  if (source[0] && source[0] === source[0].toUpperCase() && source[0] !== source[0].toLowerCase())
    return target.charAt(0).toUpperCase() + target.slice(1);
  return target;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2;
  const prev: number[] = [];
  for (let j = 0; j <= b.length; j++) prev.push(j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = up;
    }
  }
  return prev[b.length];
}

/** Nomes recorrentes: palavra capitalizada fora de início de frase, com 3+ ocorrências. */
export function detectBookNames(text: string, extra: string[] = [], min = 3): string[] {
  const counts: Record<string, number> = {};
  const pattern = new RegExp(`(?<![${LETTER}])([${UPPER}][${LETTER}'’-]{2,})`, "gu");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const before = text.slice(Math.max(0, match.index - 3), match.index);
    // início de frase, de fala (— ) ou de parágrafo não conta como evidência de nome próprio
    if (match.index === 0 || /(^|\n)\s*$|[.!?…]\s+$|[—–-]\s*$|["“«]$/.test(before)) continue;
    counts[match[1]] = (counts[match[1]] ?? 0) + 1;
  }
  const names = Object.keys(counts).filter(name => counts[name] >= min);
  extra.forEach(name => name.trim() && names.indexOf(name.trim()) === -1 && names.push(name.trim()));
  return names;
}

export function proofread(text: string, options: ProofreadOptions = {}): Issue[] {
  const mode = options.mode ?? "full";
  const ignored = new Set((options.ignored ?? []).map(value => value.toLowerCase()));
  const names = detectBookNames(text, options.names);
  const nameKeys = new Set(names.map(name => strip(name)));
  const issues: Issue[] = [];
  const push = (issue: Omit<Issue, "id">) => {
    if (ignored.has(issue.original.toLowerCase().trim()) || ignored.has(`${issue.rule}:${issue.original.toLowerCase().trim()}`)) return;
    issues.push({ ...issue, id: `${issue.rule}:${issue.start}:${issue.end}` });
  };

  const rows = lines(text);

  // --- Ortografia: grafias que não existem em português ---
  for (const row of rows) {
    const word = new RegExp(`[${LETTER}]+`, "gu");
    let match: RegExpExecArray | null;
    while ((match = word.exec(row.text))) {
      const raw = match[0];
      const key = raw.toLowerCase();
      const hit = KNOWN_MISSPELLINGS[key];
      if (!hit) continue;
      if (nameKeys.has(strip(raw)) || (names.indexOf(raw) !== -1)) continue;
      const start = row.start + match.index;
      push({
        kind: "spelling", rule: "grafia", start, end: start + raw.length, original: raw,
        suggestion: matchCase(raw, hit[0]), reason: hit[1], explain: "Palavra com grafia que não existe no português: a forma correta é " + hit[0] + ".", risk: "low",
      });
    }
  }

  // --- Consistência de nomes (Élia/Elia/Helia) ---
  const nameCounts: Record<string, number> = {};
  const namePattern = new RegExp(`[${UPPER}][${LETTER}'’-]{2,}`, "gu");
  let nm: RegExpExecArray | null;
  const occurrences: Array<{ word: string; start: number }> = [];
  while ((nm = namePattern.exec(text))) {
    occurrences.push({ word: nm[0], start: nm.index });
    nameCounts[nm[0]] = (nameCounts[nm[0]] ?? 0) + 1;
  }
  const dominant = names.filter(name => (nameCounts[name] ?? 0) >= 3);
  for (const occurrence of occurrences) {
    if (dominant.indexOf(occurrence.word) !== -1) continue;
    for (const name of dominant) {
      if (name.length < 4 || nameCounts[occurrence.word] * 3 > nameCounts[name]) continue;
      const close = strip(occurrence.word) === strip(name) || levenshtein(strip(occurrence.word), strip(name)) <= 1;
      if (!close || KNOWN_MISSPELLINGS[occurrence.word.toLowerCase()]) continue;
      push({
        kind: "consistency", rule: "nome", start: occurrence.start, end: occurrence.start + occurrence.word.length, original: occurrence.word,
        suggestion: name, reason: `"${name}" aparece ${nameCounts[name]} vezes; "${occurrence.word}" aparece ${nameCounts[occurrence.word]}. Seria o mesmo nome?`,
        explain: "Variações de grafia de um mesmo nome passam despercebidas pelo corretor comum, mas o leitor nota.", risk: "medium",
      });
      break;
    }
  }

  if (mode === "full") {
    for (const row of rows) {
      const line = row.text;
      let match: RegExpExecArray | null;

      // palavra repetida
      const repeat = new RegExp(`(?<![${LETTER}])([${LETTER}]+)(\\s+)\\1(?![${LETTER}])`, "giu");
      while ((match = repeat.exec(line))) {
        if (/^\d+$/.test(match[1])) continue;
        const start = row.start + match.index;
        push({
          kind: "grammar", rule: "repeticao", start, end: start + match[0].length, original: match[0], suggestion: match[1],
          reason: `"${match[1]}" aparece duas vezes seguidas.`, explain: "Repetição imediata costuma ser distração de digitação; se for intencional, ignore.", risk: "medium",
        });
      }

      // espaços duplicados no meio da linha
      const spaces = /(?<=\S)( {2,})(?=\S)/g;
      while ((match = spaces.exec(line))) {
        const start = row.start + match.index;
        push({ kind: "grammar", rule: "espaco-duplo", start, end: start + match[0].length, original: match[0], suggestion: " ", reason: "Espaço duplicado.", explain: "Entre palavras basta um espaço.", risk: "low" });
      }

      // espaço antes de pontuação
      const before = new RegExp(`(?<=[${LETTER}0-9])( +)([,;:!?.])(?![.…!?])`, "gu");
      while ((match = before.exec(line))) {
        const start = row.start + match.index;
        push({ kind: "grammar", rule: "espaco-antes", start, end: start + match[1].length + 1, original: match[0], suggestion: match[2], reason: "Não se deixa espaço antes de " + match[2] + ".", explain: "Em português a pontuação cola na palavra anterior e deixa espaço depois.", risk: "low" });
      }

      // falta de espaço depois de pontuação
      const after = new RegExp(`(?<=[${LOWER}])([,;:!?])(?=[${LETTER}])|(?<=[${LOWER}])(\\.)(?=[${UPPER}])`, "gu");
      while ((match = after.exec(line))) {
        const punct = match[1] ?? match[2];
        const index = match.index;
        const prevWord = (line.slice(0, index).match(new RegExp(`[${LETTER}]+$`, "u")) ?? [""])[0].toLowerCase();
        if (punct === "." && (ABBREVIATIONS.has(prevWord) || /[a-z]\.[a-z]/i.test(line.slice(Math.max(0, index - 2), index + 2)))) continue;
        if (/https?:|www\.|@/.test(line.slice(Math.max(0, index - 30), index + 12))) continue;
        const start = row.start + index;
        push({ kind: "grammar", rule: "espaco-depois", start, end: start + 1, original: punct, suggestion: punct + " ", reason: `Falta espaço depois de "${punct}".`, explain: "Depois de vírgula, ponto e vírgula, dois-pontos, ponto, exclamação e interrogação vem um espaço.", risk: "low" });
      }

      // minúscula depois de ponto final
      const sentence = new RegExp(`([${LETTER}0-9])([.!?]) +([${LOWER}])`, "gu");
      while ((match = sentence.exec(line))) {
        const prevWord = (line.slice(0, match.index + 1).match(new RegExp(`[${LETTER}]+$`, "u")) ?? [""])[0].toLowerCase();
        if (ABBREVIATIONS.has(prevWord) || /\d$/.test(match[1])) continue;
        const letterAt = row.start + match.index + match[0].length - 1;
        push({
          kind: "grammar", rule: "maiuscula", start: letterAt, end: letterAt + 1, original: match[3], suggestion: match[3].toUpperCase(),
          reason: "Nova frase começa com letra maiúscula.", explain: "Depois de ponto final, exclamação ou interrogação, a frase seguinte começa em maiúscula (salvo se for continuação de fala).", risk: "medium",
        });
      }

      // travessão de diálogo
      const dialogue = /^(\s*)(-{1,2}|–)(?= ?\S)/.exec(line);
      if (dialogue && !/^\s*-{3,}/.test(line) && !/^\s*-\s*\d/.test(line)) {
        const start = row.start + dialogue[1].length;
        const hasSpace = line.charAt(dialogue[0].length) === " ";
        push({
          kind: "grammar", rule: "travessao", start, end: start + dialogue[2].length + (hasSpace ? 1 : 0), original: line.slice(dialogue[1].length, dialogue[0].length + (hasSpace ? 1 : 0)), suggestion: "— ",
          reason: "Fala iniciada com hífen: no padrão pt-BR usa-se o travessão (—).", explain: "O diálogo em português se marca com travessão no início da fala, seguido de espaço.", risk: "low",
        });
      }
      const inline = / (--|–) /g;
      while ((match = inline.exec(line))) {
        const start = row.start + match.index + 1;
        push({ kind: "grammar", rule: "travessao-meio", start, end: start + match[1].length, original: match[1], suggestion: "—", reason: "Travessão escrito com hífens.", explain: "Use o travessão (—) para marcar incisos e falas.", risk: "low" });
      }
    }
  }

  if (mode === "full" && options.style) issues.push(...styleMirror(text, rows));

  issues.sort((a, b) => a.start - b.start || a.end - b.end);
  return issues;
}

/** Espelho do texto: perguntas, nunca vereditos. */
export function styleMirror(text: string, rows = lines(text)): Issue[] {
  const result: Issue[] = [];
  const add = (rule: string, start: number, end: number, reason: string, explain: string) =>
    result.push({ id: `${rule}:${start}:${end}`, kind: "style", rule, start, end, original: text.slice(start, end), reason, explain, risk: "medium" });

  for (const row of rows) {
    const trimmed = row.text.trim();
    if (!trimmed) continue;
    const words = (trimmed.match(/\S+/g) ?? []).length;
    if (words > 350) {
      add("paragrafo-longo", row.start, row.start + Math.min(row.text.length, 120), `Parágrafo com ${words} palavras. Ele precisa mesmo ficar inteiro?`, "Parágrafos muito longos cansam a leitura, mas em fluxo de consciência podem ser a escolha certa.");
    }
    const sentences = new RegExp(`[^.!?…\\n]+[.!?…]*`, "g");
    let match: RegExpExecArray | null;
    while ((match = sentences.exec(row.text))) {
      const count = (match[0].match(/\S+/g) ?? []).length;
      if (count > 45) {
        const start = row.start + match.index + (match[0].length - match[0].trimStart().length);
        add("frase-longa", start, start + Math.min(match[0].trim().length, 120), `Frase com ${count} palavras. É um fôlego intencional?`, "Frases longas pedem controle de ritmo; considere se um ponto ajudaria o leitor.");
      }
    }
    const adverbs = new RegExp(`[${LETTER}]{4,}mente(?![${LETTER}])`, "giu");
    const found: Array<{ index: number; length: number }> = [];
    while ((match = adverbs.exec(row.text))) found.push({ index: match.index, length: match[0].length });
    if (found.length >= 3) {
      add("adverbios", row.start + found[0].index, row.start + found[0].index + found[0].length, `${found.length} advérbios em -mente neste parágrafo. Algum verbo mais preciso resolveria?`, "Muitos advérbios em -mente enfraquecem o verbo; é uma hipótese de releitura, não um erro.");
    }
  }

  // eco de palavra: mesma palavra de conteúdo a menos de 25 palavras
  const tokens: Array<{ key: string; start: number; end: number }> = [];
  const wordPattern = new RegExp(`[${LETTER}]{5,}`, "gu");
  let match: RegExpExecArray | null;
  while ((match = wordPattern.exec(text))) {
    const key = strip(match[0]);
    if (STOPWORDS.has(match[0].toLowerCase()) || /mente$/.test(key)) continue;
    tokens.push({ key, start: match.index, end: match.index + match[0].length });
  }
  const lastSeen: Record<string, number> = {};
  const reported: Record<string, number> = {};
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const previous = lastSeen[token.key];
    if (previous !== undefined && i - previous <= 25 && (reported[token.key] === undefined || i - reported[token.key] > 25)) {
      add("eco", token.start, token.end, `"${text.slice(token.start, token.end)}" já apareceu há poucas palavras. A repetição é intencional?`, "Ecos de palavra em curta distância chamam atenção; às vezes são ritmo, às vezes descuido.");
      reported[token.key] = i;
    }
    lastSeen[token.key] = i;
  }
  return result;
}

/** Aplica uma sugestão conferindo que o texto na posição ainda é o original. */
export function applyIssue(text: string, issue: Issue): string | null {
  if (issue.suggestion === undefined) return null;
  if (text.slice(issue.start, issue.end) !== issue.original) return null;
  return text.slice(0, issue.start) + issue.suggestion + text.slice(issue.end);
}

/** Aplica várias sugestões de trás para a frente, descartando as que não conferem ou se sobrepõem. */
export function applyIssues(text: string, list: Issue[]): { text: string; applied: number } {
  const ordered = list.slice().sort((a, b) => b.start - a.start);
  let result = text;
  let applied = 0;
  let floor = Infinity;
  for (const issue of ordered) {
    if (issue.end > floor) continue;
    const next = applyIssue(result, issue);
    if (next === null) continue;
    result = next;
    floor = issue.start;
    applied++;
  }
  return { text: result, applied };
}

/**
 * Reflete a correção no HTML rico sem tocar em marcação: só troca se o trecho (com contexto da
 * mesma linha) aparecer exatamente uma vez em um único nó de texto. Caso contrário devolve null.
 */
export function applyIssueToHtml(html: string, text: string, issue: Issue): string | null {
  if (issue.suggestion === undefined || !html) return null;
  const lineStart = text.lastIndexOf("\n", issue.start - 1) + 1;
  const nextBreak = text.indexOf("\n", issue.end);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  const before = text.slice(Math.max(lineStart, issue.start - 14), issue.start);
  const after = text.slice(issue.end, Math.min(lineEnd, issue.end + 14));
  const context = before + issue.original + after;
  if (/[&<>]/.test(context) || /[&<>]/.test(issue.suggestion)) return null;
  const parts = html.split(/(<[^>]*>)/);
  let hit = -1;
  let count = 0;
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) continue;
    let from = 0;
    for (;;) {
      const at = parts[i].indexOf(context, from);
      if (at === -1) break;
      count++;
      hit = i;
      from = at + 1;
    }
  }
  if (count !== 1) return null;
  const replaced = before + issue.suggestion + after;
  parts[hit] = parts[hit].replace(context, () => replaced);
  return parts.join("");
}
