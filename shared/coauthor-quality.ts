/** Deterministic safety net for pathological repetition in Cowila proposals.
 * It does not judge artistic quality or replace human editorial review. */
export type CoauthorQuality = {
  accepted: boolean;
  reasons: string[];
  repeatedParagraphCount: number;
  repeatedBlockCount: number;
  repetitiveOpeningRatio: number;
};
const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase("pt-BR")
  .replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

export function assessCoauthorQuality(text: string): CoauthorQuality {
  const paragraphs = text.split(/\n\s*\n/).map(normalize).filter(Boolean);
  const substantial = paragraphs.filter(p => p.split(" ").length >= 12);
  const counts = new Map<string, number>();
  for (const p of substantial) counts.set(p, (counts.get(p) ?? 0) + 1);
  const repeatedParagraphCount = [...counts.values()].reduce((n, c) => n + Math.max(0, c - 1), 0);
  const blocks = new Map<string, number>();
  for (let i = 0; i + 1 < paragraphs.length; i++) {
    if (paragraphs[i].split(" ").length < 12 || paragraphs[i + 1].split(" ").length < 12) continue;
    const key = paragraphs[i] + "\n" + paragraphs[i + 1];
    blocks.set(key, (blocks.get(key) ?? 0) + 1);
  }
  const repeatedBlockCount = [...blocks.values()].reduce((n, c) => n + Math.max(0, c - 1), 0);
  const sentences = text.split(/[.!?]+(?:\s+|$)/).map(normalize).filter(s => s.split(" ").length >= 5);
  const openings = sentences.map(s => s.split(" ").slice(0, 3).join(" "));
  const openerCounts = new Map<string, number>();
  for (const s of openings) openerCounts.set(s, (openerCounts.get(s) ?? 0) + 1);
  const repeatedOpenings = [...openerCounts.values()].reduce((n, c) => Math.max(n, c), 0);
  const repetitiveOpeningRatio = openings.length ? repeatedOpenings / openings.length : 0;
  const reasons: string[] = [];
  // Reject only obvious degeneration, not intentional rhetorical repetition.
  if (repeatedBlockCount >= 2 || (substantial.length >= 6 && repeatedParagraphCount >= 3))
    reasons.push("A continuação repete blocos inteiros de parágrafos.");
  if (sentences.length >= 12 && repetitiveOpeningRatio > 0.55)
    reasons.push("A continuação repete excessivamente o início das frases.");
  return { accepted: reasons.length === 0, reasons, repeatedParagraphCount, repeatedBlockCount, repetitiveOpeningRatio };
}
