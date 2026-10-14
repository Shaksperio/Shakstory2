// Passagens de revisão e ficha de estilo gerada. Tudo roda no aparelho, sem IA: são medições e perguntas,
// nunca vereditos, e cada achado traz a evidência no texto. Nada altera o manuscrito.
import { detectBookNames, proofread } from "../proofread/engine";

export type ReviewChapter = { id: string; title: string; text: string };
export type PassId = "estrutura" | "continuidade" | "ritmo" | "texto" | "leitura";
export type Finding = { id: string; pass: PassId; chapterId: string; chapterTitle: string; message: string; evidence?: string };

export const PASSES: Array<{ id: PassId; title: string; question: string }> = [
  { id: "estrutura", title: "1. Estrutura", question: "Os capítulos têm tamanho e ordem que fazem sentido?" },
  { id: "continuidade", title: "2. Continuidade", question: "Nomes e fatos se mantêm de um capítulo ao outro?" },
  { id: "ritmo", title: "3. Ritmo", question: "A leitura flui, ou há blocos longos e frases repetidas?" },
  { id: "texto", title: "4. Ortografia e gramática", question: "O texto está correto? (o Corretor aplica as correções)" },
  { id: "leitura", title: "5. Leitura final", question: "Como o livro lê de ponta a ponta?" },
];

const words = (text: string) => (text.match(/\S+/g) ?? []).length;
const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const paragraphs = (text: string) => text.split(/\n{1,}/).map(item => item.trim()).filter(Boolean);
const sentences = (text: string) => text.split(/(?<=[.!?…])\s+/).map(item => item.trim()).filter(item => words(item) > 0);
const clip = (value: string, max = 120) => (value.length > max ? value.slice(0, max).trimEnd() + "…" : value);

function distance(a: string, b: string): number {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      prev = keep;
    }
  }
  return row[b.length];
}

export type ReviewResult = {
  findings: Finding[];
  stats: { chapters: number; words: number; pagesMin: number; pagesMax: number; readingMinutes: number };
};

export function reviewBook(chapters: ReviewChapter[], extraNames: string[] = []): ReviewResult {
  const findings: Finding[] = [];
  const add = (pass: PassId, chapter: ReviewChapter, key: string, message: string, evidence?: string) =>
    findings.push({ id: `${pass}:${chapter.id}:${key}`, pass, chapterId: chapter.id, chapterTitle: chapter.title, message, evidence: evidence ? clip(evidence) : undefined });
  const counts = chapters.map(chapter => words(chapter.text));
  const total = counts.reduce((sum, n) => sum + n, 0);
  const filled = counts.filter(n => n > 0).sort((a, b) => a - b);
  const median = filled.length ? filled[Math.floor(filled.length / 2)] : 0;

  chapters.forEach((chapter, index) => {
    const n = counts[index];
    // --- Estrutura
    if (n === 0) add("estrutura", chapter, "vazio", "Capítulo sem texto.");
    else if (filled.length >= 3 && median > 0) {
      if (n < median * 0.35) add("estrutura", chapter, "curto", `Bem mais curto que a maioria (${n} palavras; o capítulo típico tem cerca de ${median}). Pode ser intencional.`);
      if (n > median * 2.5) add("estrutura", chapter, "longo", `Bem mais longo que a maioria (${n} palavras; o capítulo típico tem cerca de ${median}). Vale pensar em dividi-lo?`);
    }
    if (!chapter.title.trim()) add("estrutura", chapter, "titulo", "Capítulo sem título.");
    // --- Ritmo
    const paras = paragraphs(chapter.text);
    paras.forEach((para, i) => {
      if (words(para) > 220) add("ritmo", chapter, `bloco${i}`, `Parágrafo de ${words(para)} palavras, sem respiro.`, para);
    });
    const sents = sentences(chapter.text);
    if (sents.length >= 8) {
      const avg = sents.reduce((sum, s) => sum + words(s), 0) / sents.length;
      if (avg > 26) add("ritmo", chapter, "frases", `Frases longas em média (${Math.round(avg)} palavras). Há espaço para frases curtas que deem fôlego?`);
    }
    const starts = sents.map(s => fold(s.split(/\s+/)[0] ?? "").replace(/[^a-z]/g, ""));
    for (let i = 0; i + 3 < starts.length; i++) {
      if (starts[i] && starts[i] === starts[i + 1] && starts[i] === starts[i + 2] && starts[i] === starts[i + 3]) {
        add("ritmo", chapter, `inicio${i}`, `Quatro frases seguidas começam com "${sents[i].split(/\s+/)[0]}".`, sents[i]);
        break;
      }
    }
    // --- Ortografia e gramática (só conta; quem corrige é o Corretor)
    const doubts = proofread(chapter.text, { mode: "preserve", names: extraNames }).length;
    if (doubts > 0) add("texto", chapter, "duvidas", `${doubts} dúvida${doubts > 1 ? "s" : ""} de ortografia. Abra a aba Corretor neste capítulo.`);
    // --- Leitura final
    const quotes = chapter.text.split('"').length - 1;
    if (quotes % 2 === 1) add("leitura", chapter, "aspas", "Número ímpar de aspas retas: alguma pode ter ficado aberta.");
    const open = (chapter.text.match(/\(/g) ?? []).length;
    const close = (chapter.text.match(/\)/g) ?? []).length;
    if (open !== close) add("leitura", chapter, "parenteses", `Parênteses desbalanceados (${open} abrem, ${close} fecham).`);
    const last = paras[paras.length - 1];
    if (last && n > 400 && words(last) < 4) add("leitura", chapter, "fim", "O capítulo termina numa linha muito curta. Pode ser um efeito, ou um final inacabado.", last);
  });

  // --- Continuidade: nomes que aparecem uma única vez ou em grafias quase iguais
  const whole = chapters.map(c => c.text).join("\n\n");
  const names = detectBookNames(whole, extraNames, 1);
  const occurrences = (name: string) => {
    const pattern = new RegExp(`(?<![A-Za-zÀ-ÿ])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-zÀ-ÿ])`, "g");
    return chapters.map(c => (c.text.match(pattern) ?? []).length);
  };
  const table = names.map(name => ({ name, per: occurrences(name) })).map(item => ({ ...item, total: item.per.reduce((a, b) => a + b, 0) }));
  for (const item of table) {
    if (item.total === 1) {
      const at = chapters[item.per.findIndex(n => n > 0)];
      const pos = at.text.indexOf(item.name);
      add("continuidade", at, "uma:" + fold(item.name), `"${item.name}" aparece uma única vez no livro. Se for um personagem ou lugar, confira a grafia.`, at.text.slice(Math.max(0, pos - 40), pos + item.name.length + 40));
    }
  }
  for (let i = 0; i < table.length; i++) {
    for (let j = i + 1; j < table.length; j++) {
      const a = table[i], b = table[j];
      const fa = fold(a.name), fb = fold(b.name);
      if (fa.length >= 4 && fb.length >= 4 && distance(fa, fb) <= 1) {
        const at = chapters[(a.total <= b.total ? a : b).per.findIndex(n => n > 0)] ?? chapters[0];
        add("continuidade", at, `parecido:${fa}:${fb}`, `"${a.name}" (${a.total}x) e "${b.name}" (${b.total}x) são quase iguais. É a mesma pessoa com grafias diferentes?`);
      }
    }
  }

  return {
    findings,
    stats: { chapters: chapters.length, words: total, pagesMin: Math.ceil(total / 300), pagesMax: Math.ceil(total / 250), readingMinutes: Math.round(total / 200) },
  };
}

// ---------------- Ficha de estilo gerada ----------------
export type StyleSheet = {
  characters: Array<{ name: string; count: number; evidence: string }>;
  places: Array<{ name: string; count: number; evidence: string }>;
  dialogue: { convention: "travessão" | "aspas" | "misto" | "sem diálogo"; dashLines: number; quotePairs: number; evidence: string };
  pov: { kind: "primeira pessoa" | "terceira pessoa" | "indefinida"; first: number; third: number; evidence: string };
};

const PLACE_PREPOSITIONS = /(?:^|[\s,;(])(?:em|na|no|nas|nos|de|do|da|dos|das|para|pela|pelo|ao|à|até|sobre|entre)\s+((?:[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÿ'-]+)(?:\s+(?:de|do|da)?\s*[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÿ'-]+)?)/g;
const NOT_PLACES = new Set(["deus", "senhor", "senhora", "dona", "dom", "sr", "sra", "natal", "pascoa", "ele", "ela", "eu", "nos", "voce", "voces"]);

export function styleSheet(chapters: ReviewChapter[], extraNames: string[] = []): StyleSheet {
  const whole = chapters.map(c => c.text).join("\n\n");
  const around = (needle: string) => {
    const pos = whole.indexOf(needle);
    return pos < 0 ? "" : clip(whole.slice(Math.max(0, pos - 40), pos + needle.length + 50).replace(/\s+/g, " "), 140);
  };
  const countOf = (name: string) => (whole.match(new RegExp(`(?<![A-Za-zÀ-ÿ])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-zÀ-ÿ])`, "g")) ?? []).length;

  // lugares: nome próprio depois de preposição de lugar, repetido ou não
  const placeCounts = new Map<string, number>();
  let match: RegExpExecArray | null;
  const pattern = new RegExp(PLACE_PREPOSITIONS.source, "g");
  while ((match = pattern.exec(whole))) {
    const name = match[1].trim();
    if (NOT_PLACES.has(fold(name))) continue;
    placeCounts.set(name, (placeCounts.get(name) ?? 0) + 1);
  }
  const people = detectBookNames(whole, extraNames, 2);
  const candidates = Array.from(new Set([...people, ...Array.from(placeCounts.keys())]));
  // lugar = o nome vem depois de preposição de lugar em pelo menos metade das vezes e em pelo menos duas
  const isPlace = (name: string) => (placeCounts.get(name) ?? 0) >= 2 && (placeCounts.get(name) ?? 0) / Math.max(1, countOf(name)) >= 0.5;
  const places = candidates
    .filter(isPlace)
    .map(name => ({ name, count: countOf(name), evidence: around(name) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const characters = people
    .filter(name => !isPlace(name))
    .map(name => ({ name, count: countOf(name), evidence: around(name) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  // convenção de diálogo
  const dashLines = (whole.match(/^\s*[—–-]\s?\S/gm) ?? []).length;
  const quotePairs = (whole.match(/[“"][^”"\n]{2,300}[”"]/g) ?? []).length;
  let convention: StyleSheet["dialogue"]["convention"] = "sem diálogo";
  if (dashLines >= 3 && quotePairs >= 3) convention = "misto";
  else if (dashLines >= 3 || (dashLines > 0 && quotePairs === 0)) convention = "travessão";
  else if (quotePairs >= 3 || (quotePairs > 0 && dashLines === 0)) convention = "aspas";
  const dashEvidence = (whole.match(/^\s*[—–-]\s?\S.*$/m) ?? [""])[0].trim();
  const quoteEvidence = (whole.match(/[“"][^”"\n]{2,300}[”"]/) ?? [""])[0];
  const evidence = clip(convention === "aspas" ? quoteEvidence : dashEvidence || quoteEvidence);

  // pessoa narrativa: conta nas linhas que não são fala
  const narration = whole.split(/\n/).filter(line => !/^\s*[—–-]/.test(line)).join("\n").replace(/[“"][^”"\n]{0,300}[”"]/g, " ");
  const first = (narration.match(/\b(eu|meu|minha|meus|minhas|me|comigo|fui|estava|nós|nos|nosso|nossa)\b/gi) ?? []).length;
  const third = (narration.match(/\b(ele|ela|eles|elas|dele|dela|seu|sua|seus|suas)\b/gi) ?? []).length;
  let kind: StyleSheet["pov"]["kind"] = "indefinida";
  if (first + third >= 6) kind = first > third * 1.2 ? "primeira pessoa" : third > first * 1.2 ? "terceira pessoa" : "indefinida";
  const povRegex = kind === "primeira pessoa" ? /[^.\n]*\b(eu|meu|minha)\b[^.\n]*\./i : /[^.\n]*\b(ele|ela)\b[^.\n]*\./i;
  const povEvidence = clip((narration.match(povRegex) ?? [""])[0].trim());
  return { characters, places, dialogue: { convention, dashLines, quotePairs, evidence }, pov: { kind, first, third, evidence: povEvidence } };
}
