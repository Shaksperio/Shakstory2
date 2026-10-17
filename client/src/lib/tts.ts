// Leitura em voz alta da pré-visualização, usando a voz do próprio navegador (Web Speech API).
export type SpeechChapter = { id: string; title: string; kind?: string; content: string; richContent?: string };
export type SpeechChunk = { chapter: number; text: string };

const stripHtml = (html: string) => html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** Texto limpo para leitura: sem marcações, com a quebra de cena virando uma pausa. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/^\s*([*_\-·•~=]\s*){3,}\s*$/gm, "\n\n")
    .replace(/[*_`#>]+/g, "")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Divide em trechos curtos (o Chrome interrompe falas longas), respeitando frases. */
export function splitForSpeech(text: string, max = 220): string[] {
  const out: string[] = [];
  for (const paragraph of cleanForSpeech(text).split(/\n{2,}/)) {
    const flat = paragraph.replace(/\s+/g, " ").trim();
    if (!flat) continue;
    let current = "";
    for (const sentence of flat.match(/[^.!?…]+(?:[.!?…]+["”»')\]]*|$)\s*/g) ?? [flat]) {
      if ((current + sentence).length <= max) { current += sentence; continue; }
      if (current.trim()) out.push(current.trim());
      current = "";
      if (sentence.length <= max) { current = sentence; continue; }
      let piece = "";
      for (const word of sentence.split(/\s+/)) {
        if ((piece + " " + word).trim().length > max) { if (piece.trim()) out.push(piece.trim()); piece = word; } else piece = (piece + " " + word).trim();
      }
      current = piece;
    }
    if (current.trim()) out.push(current.trim());
  }
  return out;
}

export function chapterSpeech(chapter: SpeechChapter): string {
  const body = chapter.kind === "part" ? "" : cleanForSpeech(chapter.content?.trim() ? chapter.content : stripHtml(chapter.richContent ?? ""));
  return [chapter.title?.trim() ? chapter.title.trim().replace(/[.!?…]*$/, ".") : "", body].filter(Boolean).join("\n\n");
}

/** Fila de leitura: só o capítulo atual ou do atual até o fim do livro. */
export function buildQueue(chapters: SpeechChapter[], from: number, scope: "chapter" | "book"): SpeechChunk[] {
  const last = scope === "chapter" ? Math.min(from, chapters.length - 1) : chapters.length - 1;
  const queue: SpeechChunk[] = [];
  for (let i = Math.max(0, from); i <= last; i++) for (const text of splitForSpeech(chapterSpeech(chapters[i]))) queue.push({ chapter: i, text });
  return queue;
}

export function voicesForPortuguese<T extends { lang: string; name: string }>(voices: T[]): T[] {
  const rank = (voice: T) => (/^pt[-_]br/i.test(voice.lang) ? 0 : /^pt/i.test(voice.lang) ? 1 : 2);
  const pt = voices.filter(voice => rank(voice) < 2).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  return pt.length ? pt : voices;
}

export type VoiceGender = "female" | "male";
type VoiceLike = { lang: string; name: string; localService?: boolean };

const MALE = /\b(antonio|ant[oô]nio|daniel|felipe|jorge|ricardo|luciano|humberto|donato|fabio|f[aá]bio|cristiano|leonardo|valerio|thiago|male|masculin)/i;
const FEMALE = /\b(francisca|thalita|luciana|maria|fernanda|camila|vit[oó]ria|raquel|joana|let[ií]cia|ana|giovanna|yara|female|feminin|google portugu[eê]s)/i;

/** Gênero da voz pelo nome (o navegador não informa); null quando não dá para saber. */
export function voiceGender(voice: VoiceLike): VoiceGender | null {
  if (/\bfemale\b|feminin/i.test(voice.name)) return "female";
  if (MALE.test(voice.name) && !/\bfemale\b/i.test(voice.name)) return "male";
  if (FEMALE.test(voice.name)) return "female";
  return null;
}

/** Quanto mais alto, mais natural: vozes neurais/Online (Edge), Premium/Enhanced (Apple) e Google vêm antes das locais simples. */
export function voiceQuality(voice: VoiceLike): number {
  let score = 0;
  if (/natural|neural/i.test(voice.name)) score += 60;
  if (/online/i.test(voice.name)) score += 30;
  if (/premium|enhanced|aprimorad/i.test(voice.name)) score += 40;
  if (/google/i.test(voice.name)) score += 25;
  if (/siri/i.test(voice.name)) score += 20;
  if (/espeak|compact/i.test(voice.name)) score -= 40;
  if (/^pt[-_]br/i.test(voice.lang)) score += 10;
  return score;
}

/** Melhor voz em português para o gênero escolhido; sem uma do gênero, usa a melhor disponível (e `exact` = false). */
export function pickVoice<T extends VoiceLike>(voices: T[], gender: VoiceGender): { voice: T | undefined; exact: boolean } {
  const list = voicesForPortuguese(voices);
  const best = (items: T[]) => [...items].sort((a, b) => voiceQuality(b) - voiceQuality(a) || a.name.localeCompare(b.name))[0];
  const same = list.filter(voice => voiceGender(voice) === gender);
  if (same.length) return { voice: best(same), exact: true };
  // Sem voz do gênero: prefere uma de gênero desconhecido à do gênero oposto.
  const unknown = list.filter(voice => voiceGender(voice) === null);
  return { voice: best(unknown.length ? unknown : list), exact: false };
}

export const speechSupported = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof (window as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance !== "undefined";
