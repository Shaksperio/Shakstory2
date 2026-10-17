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
export type TranslateOptions = { source?: string; fetchFn?: FetchLike; signal?: AbortSignal; retries?: number };

const cache = new Map<string, string>();
const ENDPOINT = "https://translate.googleapis.com/translate_a/single";

async function translateChunk(text: string, target: string, options: TranslateOptions): Promise<string> {
  const key = `${options.source ?? SOURCE_LANGUAGE}>${target}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
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
      return translated;
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
