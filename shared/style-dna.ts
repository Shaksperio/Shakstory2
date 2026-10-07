export type StyleRhythm = "concise" | "balanced" | "expansive";
export type DialoguePresence = "low" | "medium" | "high";

export type StyleDna = {
  wordCount: number;
  sentenceCount: number;
  paragraphCount: number;
  averageSentenceWords: number;
  averageParagraphWords: number;
  dialogueWordRatio: number;
  lexicalDiversity: number;
  questionsPerThousandWords: number;
  exclamationsPerThousandWords: number;
  ellipsesPerThousandWords: number;
  rhythm: StyleRhythm;
  dialoguePresence: DialoguePresence;
};

const wordTokens = (text: string): string[] =>
  text.match(/[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*/gu) ?? [];

const normalizedWord = (word: string): string =>
  word.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

const round = (value: number, digits = 1): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export function analyzeStyleDna(text: string): StyleDna {
  const clean = String(text ?? "").trim();
  const words = wordTokens(clean);
  const wordCount = words.length;
  const sentenceChunks = clean
    ? clean.split(/(?<=[.!?…])(?:["”’)]*)\s+|\n{2,}/u).map(value => value.trim()).filter(Boolean)
    : [];
  const paragraphs = clean ? clean.split(/\n{2,}/).map(value => value.trim()).filter(Boolean) : [];
  const dialogueWords = clean
    ? clean
        .split(/\n/)
        .filter(line => /^\s*(?:[—–-]\s+|["“‘])/.test(line))
        .reduce((sum, line) => sum + wordTokens(line).length, 0)
    : 0;
  const uniqueWords = new Set(words.map(normalizedWord));
  const perThousand = (count: number) => wordCount ? (count / wordCount) * 1000 : 0;
  const averageSentenceWords = sentenceChunks.length ? wordCount / sentenceChunks.length : wordCount;
  const averageParagraphWords = paragraphs.length ? wordCount / paragraphs.length : wordCount;
  const dialogueWordRatio = wordCount ? dialogueWords / wordCount : 0;
  const lexicalDiversity = wordCount ? uniqueWords.size / wordCount : 0;
  const rhythm: StyleRhythm = averageSentenceWords < 12 ? "concise" : averageSentenceWords > 24 ? "expansive" : "balanced";
  const dialoguePresence: DialoguePresence = dialogueWordRatio < 0.12 ? "low" : dialogueWordRatio > 0.38 ? "high" : "medium";

  return {
    wordCount,
    sentenceCount: sentenceChunks.length,
    paragraphCount: paragraphs.length,
    averageSentenceWords: round(averageSentenceWords),
    averageParagraphWords: round(averageParagraphWords),
    dialogueWordRatio: round(dialogueWordRatio, 3),
    lexicalDiversity: round(lexicalDiversity, 3),
    questionsPerThousandWords: round(perThousand((clean.match(/\?/g) ?? []).length)),
    exclamationsPerThousandWords: round(perThousand((clean.match(/!/g) ?? []).length)),
    ellipsesPerThousandWords: round(perThousand((clean.match(/\.{3}|…/g) ?? []).length)),
    rhythm,
    dialoguePresence,
  };
}

const rhythmLabel: Record<StyleRhythm, string> = {
  concise: "frases predominantemente curtas",
  balanced: "cadência equilibrada entre frases curtas e médias",
  expansive: "frases predominantemente longas e expansivas",
};

const dialogueLabel: Record<DialoguePresence, string> = {
  low: "baixo uso de diálogo marcado",
  medium: "presença moderada de diálogo",
  high: "forte presença de diálogo",
};

export function buildStyleDnaPrompt(text: string): string {
  const dna = analyzeStyleDna(text);
  if (dna.wordCount < 40) {
    return "Amostra de estilo curta demais para um perfil confiável. Preserve apenas a voz observável no trecho atual e não invente padrões.";
  }
  return [
    "Style DNA do próprio autor (sinal descritivo, não regra):",
    `${rhythmLabel[dna.rhythm]}; média de ${dna.averageSentenceWords} palavras por frase;`,
    `média de ${dna.averageParagraphWords} palavras por parágrafo;`,
    `${dialogueLabel[dna.dialoguePresence]} (${Math.round(dna.dialogueWordRatio * 100)}% das palavras em linhas de diálogo);`,
    `diversidade lexical observada: ${Math.round(dna.lexicalDiversity * 100)}%.`,
    "Use essas tendências apenas para evitar que uma sugestão da IA apague a voz do autor. Não imite mecanicamente o perfil e não force métricas.",
  ].join(" ");
}
