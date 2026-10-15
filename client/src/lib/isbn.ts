export type IsbnInfo = {
  isbn: string;
  title: string;
  subtitle?: string;
  authors: string[];
  publisher?: string;
  publishedDate?: string;
  description?: string;
  categories: string[];
  language?: string;
  pages?: number;
  coverUrl?: string;
  source: "Google Livros" | "Open Library";
};

export function normalizeIsbn(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

export function isValidIsbn(value: string): boolean {
  const code = normalizeIsbn(value);
  if (/^\d{9}[\dX]$/.test(code)) {
    const sum = [...code].reduce((acc, ch, i) => acc + (ch === "X" ? 10 : Number(ch)) * (10 - i), 0);
    return sum % 11 === 0;
  }
  if (/^\d{13}$/.test(code)) {
    const sum = [...code].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
    return sum % 10 === 0;
  }
  return false;
}

const LANGUAGES: Record<string, string> = {
  pt: "Português", "pt-br": "Português", por: "Português", en: "Inglês", eng: "Inglês", es: "Espanhol", spa: "Espanhol",
  fr: "Francês", fre: "Francês", fra: "Francês", de: "Alemão", ger: "Alemão", deu: "Alemão", it: "Italiano", ita: "Italiano",
};
export const languageName = (code?: string) => (code ? LANGUAGES[code.toLowerCase()] ?? code : undefined);

const https = (url?: string) => url?.replace(/^http:\/\//, "https://");
const stripHtml = (text?: string) => text?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || undefined;

export function parseGoogleBooks(data: any, isbn: string): IsbnInfo | null {
  const info = data?.items?.[0]?.volumeInfo;
  if (!info?.title) return null;
  return {
    isbn,
    title: info.title,
    subtitle: info.subtitle,
    authors: Array.isArray(info.authors) ? info.authors : [],
    publisher: info.publisher,
    publishedDate: info.publishedDate,
    description: stripHtml(info.description),
    categories: Array.isArray(info.categories) ? info.categories : [],
    language: languageName(info.language),
    pages: typeof info.pageCount === "number" && info.pageCount > 0 ? info.pageCount : undefined,
    coverUrl: https(info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail),
    source: "Google Livros",
  };
}

export function parseOpenLibrary(data: any, isbn: string): IsbnInfo | null {
  const info = data?.[`ISBN:${isbn}`];
  if (!info?.title) return null;
  const desc = typeof info.notes === "string" ? info.notes : info.notes?.value;
  return {
    isbn,
    title: info.title,
    subtitle: info.subtitle,
    authors: (info.authors ?? []).map((a: any) => a?.name).filter(Boolean),
    publisher: info.publishers?.[0]?.name,
    publishedDate: info.publish_date,
    description: stripHtml(desc),
    categories: (info.subjects ?? []).slice(0, 3).map((s: any) => s?.name).filter(Boolean),
    pages: typeof info.number_of_pages === "number" ? info.number_of_pages : undefined,
    coverUrl: https(info.cover?.medium ?? info.cover?.small),
    source: "Open Library",
  };
}

/** Devolve ano (YYYY) e data ISO completa quando a fonte traz dia e mês. */
export function publicationDates(value?: string): { year?: string; date?: string } {
  if (!value) return {};
  const year = value.match(/\b(1[0-9]{3}|2[0-9]{3})\b/)?.[1];
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
  return { year, date: iso };
}

export async function lookupIsbn(raw: string, fetchFn: typeof fetch = fetch): Promise<IsbnInfo | null> {
  const isbn = normalizeIsbn(raw);
  const get = async (url: string) => {
    try {
      const res = await fetchFn(url);
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  };
  const google = parseGoogleBooks(await get(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1`), isbn);
  const open = google && google.description && google.publisher ? null
    : parseOpenLibrary(await get(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`), isbn);
  if (!google) return open;
  if (!open) return google;
  return { ...open, ...Object.fromEntries(Object.entries(google).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length))) } as IsbnInfo;
}
