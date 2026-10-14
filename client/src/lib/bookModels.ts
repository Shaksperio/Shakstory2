// Modelos de livro: atalhos que preenchem campos de publicação que já existem. Não definem margens de gráfica (KDP etc.).
export type BookModelId = "bolso" | "a5" | "ebook";
export type BookModelPatch = { trimSize: "a5" | "6x9" | "a4"; marginPreset: "narrow" | "normal" | "wide"; typography: "classic"; dropCap: boolean };
export type BookModel = { id: BookModelId; label: string; hint: string; patch: BookModelPatch };

export const BOOK_MODELS: BookModel[] = [
  { id: "bolso", label: "Livro de bolso", hint: "Formato A5 com margens estreitas, ideal para romances longos.", patch: { trimSize: "a5", marginPreset: "narrow", typography: "classic", dropCap: false } },
  { id: "a5", label: "A5 clássico", hint: "Formato A5, margens normais e capitular na abertura dos capítulos.", patch: { trimSize: "a5", marginPreset: "normal", typography: "classic", dropCap: true } },
  { id: "ebook", label: "E-book adaptável", hint: "Texto que se ajusta à tela do leitor. O tamanho de página vale só para PDF e impressão.", patch: { trimSize: "6x9", marginPreset: "normal", typography: "classic", dropCap: false } },
];

/** Estimativa simples: entre 250 e 300 palavras por página. Devolve null sem texto suficiente. */
export function pageEstimate(words: number): { min: number; max: number } | null {
  if (!Number.isFinite(words) || words < 100) return null;
  return { min: Math.max(1, Math.round(words / 300)), max: Math.max(1, Math.round(words / 250)) };
}

export function pageReport(words: number): string {
  const est = pageEstimate(words);
  if (!est) return "Escreva um pouco mais para eu estimar o número de páginas.";
  const range = est.min === est.max ? `${est.min}` : `${est.min} a ${est.max}`;
  return `Seu livro terá cerca de ${range} páginas (estimativa de 250 a 300 palavras por página, com ${words.toLocaleString("pt-BR")} palavras).`;
}
