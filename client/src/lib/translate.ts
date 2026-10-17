import type { ExportBook } from "@shared/book-export";
// Tradução automática de capítulos e livros pelo Google Tradutor (mesmo motor usado no painel "Traduzir" do blog Home Star).
export type TranslateLanguage = { code: string; label: string; flag: string; speech: string };

/** Idioma de origem dos livros do Shakstory (como no blog: página em português do Brasil). */
export const SOURCE_LANGUAGE = "pt";

export const TRANSLATE_LANGUAGES: TranslateLanguage[] = [
  { code: "en", label: "English", flag: "🇺🇸", speech: "en-US" },
  { code: "es", label: "Español", flag: "🇪🇸", speech: "es-ES" },
  { code: "fr", label: "Français", flag: "🇫🇷", speech: "fr-FR" },
  { code: "de", label: "Deutsch", flag: "🇩🇪", speech: "de-DE" },
  { code: "it", label: "Italiano", flag: "🇮🇹", speech: "it-IT" },
  { code: "pt-PT", label: "Português (Portugal)", flag: "🇵🇹", speech: "pt-PT" },
  { code: "nl", label: "Nederlands", flag: "🇳🇱", speech: "nl-NL" },
  { code: "pl", label: "Polski", flag: "🇵🇱", speech: "pl-PL" },
  { code: "ru", label: "Русский", flag: "🇷🇺", speech: "ru-RU" },
  { code: "tr", label: "Türkçe", flag: "🇹🇷", speech: "tr-TR" },
  { code: "ar", label: "العربية", flag: "🇸🇦", speech: "ar-SA" },
  { code: "ja", label: "日本語", flag: "🇯🇵", speech: "ja-JP" },
  { code: "ko", label: "한국어", flag: "🇰🇷", speech: "ko-KR" },
  { code: "zh-CN", label: "中文 (简体)", flag: "🇨🇳", speech: "zh-CN" },
];

export const languageByCode = (code: string) => TRANSLATE_LANGUAGES.find(language => language.code.toLowerCase() === code.toLowerCase());

/** Idioma do navegador entre os disponíveis (modo "Automático"); português ou desconhecido = original. */
export function browserLanguage(list: readonly string[] = typeof navigator === "undefined" ? [] : navigator.languages?.length ? navigator.languages : [navigator.language ?? ""]): string {
  for (const raw of list) {
    const locale = String(raw || "").replace("_", "-").toLowerCase();
    const base = locale.split("-")[0];
    if (base === "pt") return locale.startsWith("pt-pt") ? "pt-PT" : "original";
    if (base === "zh") return "zh-CN";
    const found = TRANSLATE_LANGUAGES.find(language => language.code.toLowerCase() === base);
    if (found) return found.code;
  }
  return "original";
}

/** Divide o texto em blocos de parágrafos inteiros (cada bloco cabe numa requisição). */
export function splitForTranslation(text: string, max = 1800): string[] {
  const chunks: string[] = [];
  let current = "";
  const push = () => { if (current.trim()) chunks.push(current.trim()); current = ""; };
  for (const paragraph of text.replace(/\r/g, "").split(/\n{2,}/)) {
    const part = paragraph.trim();
    if (!part) continue;
    if (part.length > max) {
      push();
      let piece = "";
      for (const sentence of part.match(/[^.!?…]+(?:[.!?…]+["”»')\]]*|$)\s*/g) ?? [part]) {
        if ((piece + sentence).length > max && piece) { chunks.push(piece.trim()); piece = ""; }
        piece += sentence;
        while (piece.length > max) { chunks.push(piece.slice(0, max).trim()); piece = piece.slice(max); }
      }
      if (piece.trim()) chunks.push(piece.trim());
      continue;
    }
    if (current && (current + "\n\n" + part).length > max) push();
    current = current ? current + "\n\n" + part : part;
  }
  push();
  return chunks;
}

/** Junta os trechos devolvidos pelo Google (`[[[traduzido, original, …], …], …]`). */
export function parseTranslation(data: unknown): string {
  const segments = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : null;
  if (!segments) throw new Error("translate_bad_response");
  return segments.map((segment: unknown) => (Array.isArray(segment) && typeof segment[0] === "string" ? segment[0] : "")).join("");
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, "ok" | "status" | "json">>;
export type TranslateOptions = {
  source?: string; fetchFn?: FetchLike; signal?: AbortSignal; retries?: number;
  /** Termos que NÃO devem ser traduzidos (nomes de personagens, lugares, palavras inventadas). */
  terms?: string[];
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const placeholder = (index: number) => `Xq${index.toString(36).padStart(2, "0")}x`;
const PLACEHOLDER_RE = /Xq[0-9a-z]{2}x/gi;

/** Troca os termos protegidos por marcadores neutros que o tradutor deixa intactos; `restore` devolve os originais. */
export function protectTerms(text: string, terms: readonly string[] = []): { text: string; restore: (translated: string) => string } {
  const list = Array.from(new Set(terms.map(term => term.trim()).filter(term => term.length > 1))).sort((a, b) => b.length - a.length);
  if (!list.length || !text) return { text, restore: value => value };
  const canonical = new Map(list.map((term, index) => [term.toLowerCase(), { term, index }]));
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${list.map(escapeRegex).join("|")})(?![\\p{L}\\p{N}])`, "giu");
  const protectedText = text.replace(pattern, match => placeholder(canonical.get(match.toLowerCase())?.index ?? 0));
  const byPlaceholder = new Map(list.map((term, index) => [placeholder(index).toLowerCase(), term]));
  return { text: protectedText, restore: value => value.replace(PLACEHOLDER_RE, match => byPlaceholder.get(match.toLowerCase()) ?? match) };
}

/** Confere sinais de erro da tradução automática; devolve avisos em português para a revisão. */
export function checkTranslation(source: string, output: string, terms: readonly string[] = []): string[] {
  const issues: string[] = [];
  if (!source.trim()) return issues;
  if (!output.trim()) return ["A tradução veio vazia."];
  const paragraphs = (text: string) => text.split(/\n{2,}/).filter(part => part.trim()).length;
  const a = paragraphs(source), b = paragraphs(output);
  if (a > 2 && Math.abs(a - b) / a > 0.2) issues.push(`Número de parágrafos mudou (${a} → ${b}).`);
  const ratio = output.length / source.length;
  if (source.length > 200 && (ratio < 0.4 || ratio > 2.6)) issues.push("O tamanho do texto mudou muito; pode haver trechos faltando ou repetidos.");
  const numbers = (source.match(/\d{2,}/g) ?? []).filter(number => !output.includes(number));
  if (numbers.length) issues.push(`Números que sumiram: ${Array.from(new Set(numbers)).slice(0, 5).join(", ")}.`);
  const lower = output.toLowerCase();
  const missing = terms.filter(term => term.trim().length > 1 && source.toLowerCase().includes(term.toLowerCase()) && !lower.includes(term.toLowerCase()));
  if (missing.length) issues.push(`Termos protegidos ausentes: ${missing.slice(0, 5).join(", ")}.`);
  if (/Xq[0-9a-z]{2}x/i.test(output)) issues.push("Sobrou um marcador interno; revise o trecho.");
  return issues;
}

const cache = new Map<string, string>();
const ENDPOINT = "https://translate.googleapis.com/translate_a/single";

async function translateChunk(text: string, target: string, options: TranslateOptions): Promise<string> {
  const guarded = protectTerms(text, options.terms);
  const key = `${options.source ?? SOURCE_LANGUAGE}>${target}|${guarded.text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return guarded.restore(hit);
  text = guarded.text;
  const doFetch: FetchLike = options.fetchFn ?? ((input, init) => fetch(input, init));
  let lastError: unknown = new Error("translate_failed");
  for (let attempt = 0; attempt <= (options.retries ?? 2); attempt++) {
    if (options.signal?.aborted) throw new DOMException("Tradução cancelada", "AbortError");
    try {
      const body = new URLSearchParams({ client: "gtx", sl: options.source ?? SOURCE_LANGUAGE, tl: target, dt: "t", q: text });
      const response = await doFetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: body.toString(), signal: options.signal });
      if (!response.ok) throw new Error("translate_http_" + response.status);
      const translated = parseTranslation(await response.json());
      cache.set(key, translated);
      return guarded.restore(translated);
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") throw error;
      lastError = error;
      if (attempt < (options.retries ?? 2)) await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lastError;
}

/** Traduz um texto longo preservando a divisão em parágrafos. */
export async function translateText(text: string, target: string, options: TranslateOptions = {}): Promise<string> {
  if (!text.trim()) return text;
  const out: string[] = [];
  for (const chunk of splitForTranslation(text)) out.push((await translateChunk(chunk, target, options)).trim());
  return out.join("\n\n");
}

export type TranslatableChapter = { id: string; title: string; kind?: string; content: string; richContent?: string };

/** Traduz título e texto de um capítulo; o texto formatado (HTML) é descartado porque não sobrevive à tradução. */
export async function translateChapter<T extends TranslatableChapter>(chapter: T, target: string, options: TranslateOptions = {}): Promise<T> {
  const body = chapter.kind === "part" ? "" : chapter.content?.trim() ? chapter.content : htmlToPlain(chapter.richContent ?? "");
  const title = chapter.title?.trim() ? await translateText(chapter.title, target, options) : chapter.title;
  const content = body ? await translateText(body, target, options) : "";
  return { ...chapter, title: title.replace(/\s*\n+\s*/g, " "), content, richContent: undefined };
}

export const htmlToPlain = (html: string) => html.replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, "\n\n").trim();

export const clearTranslationCache = () => cache.clear();

/** Nomes de personagens e lugares do livro, sugeridos como termos que não devem ser traduzidos. */
export const glossaryFromPlanning = (planning?: { characters?: Array<{ name: string }>; locations?: Array<{ name: string }> }): string[] =>
  Array.from(new Set([...(planning?.characters ?? []), ...(planning?.locations ?? [])].map(item => item.name?.trim()).filter((name): name is string => Boolean(name && name.length > 1))));

const glossaryKey = (bookId: string) => `shakstory:glossary:${bookId}`;
/** Lista de termos protegidos do livro: a editada pelo autor, ou a sugerida a partir de personagens e lugares. */
export function loadGlossary(bookId: string, suggested: string[]): string[] {
  try { const raw = JSON.parse(localStorage.getItem(glossaryKey(bookId)) ?? "null"); if (Array.isArray(raw)) return raw.filter((item): item is string => typeof item === "string"); } catch { /* usa a sugestão */ }
  return suggested;
}
export function saveGlossary(bookId: string, terms: string[]) { try { localStorage.setItem(glossaryKey(bookId), JSON.stringify(terms)); } catch { /* conveniência */ } }
export const parseGlossary = (text: string) => Array.from(new Set(text.split(/[\n;]+/).map(term => term.trim()).filter(Boolean)));

/** Traduz o livro de exportação inteiro (título, metadados, matéria inicial/final e capítulos) e ajusta os rótulos do idioma. */
export async function translateExportBook(book: ExportBook, code: string, options: TranslateOptions & { onProgress?: (done: number, total: number) => void } = {}): Promise<ExportBook> {
  const language = languageByCode(code);
  if (!language) throw new Error("Idioma de tradução não suportado.");
  const front = (book.frontMatter ?? []).filter(section => section.enabled !== false && section.content.trim());
  const back = (book.backMatter ?? []).filter(section => section.enabled !== false && section.content.trim());
  const total = book.chapters.length + front.length + back.length + 1;
  let done = 0;
  const tick = () => options.onProgress?.(++done, total);
  const tr = (text?: string) => (text?.trim() ? translateText(text, code, options).then(value => value.replace(/\s*\n+\s*/g, " ")) : Promise.resolve(text));
  const section = async (item: NonNullable<ExportBook["frontMatter"]>[number]) => { const out = { ...item, title: (await tr(item.title)) ?? item.title, content: await translateText(item.content, code, options) }; tick(); return out; };
  const title = (await tr(book.title)) ?? book.title;
  const subtitle = await tr(book.subtitle);
  const description = await tr(book.description);
  const headerText = await tr(book.headerText);
  const footerText = await tr(book.footerText);
  tick();
  const frontMatter: NonNullable<ExportBook["frontMatter"]> = [];
  for (const item of book.frontMatter ?? []) frontMatter.push(front.includes(item) ? await section(item) : item);
  const chapters: ExportBook["chapters"] = [];
  for (const chapter of book.chapters) { chapters.push(await translateChapter(chapter, code, options)); tick(); }
  const backMatter: NonNullable<ExportBook["backMatter"]> = [];
  for (const item of book.backMatter ?? []) backMatter.push(back.includes(item) ? await section(item) : item);
  const copyrightText = frontMatter.find(item => item.id === "copyright")?.content;
  return { ...book, title, subtitle, description, headerText, footerText, frontMatter, backMatter, chapters, copyrightText, language: language.label, languageCode: code };
}
