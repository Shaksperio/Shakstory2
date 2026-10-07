export type CoauthorApproach = {
  id: string;
  label: string;
  instruction: string;
};

export type CoauthorAlternative = {
  id: string;
  label: string;
  approach: string;
  text: string;
  warnings: string[];
};

export const COAUTHOR_APPROACHES: CoauthorApproach[] = [
  {
    id: "faithful",
    label: "Fiel à cena",
    instruction: "Continue com máxima fidelidade ao tom, ao ponto de vista, à intenção da cena e ao ritmo já estabelecido. Evite mudanças bruscas de direção.",
  },
  {
    id: "tension",
    label: "Mais tensão",
    instruction: "Continue aumentando a pressão dramática, criando uma complicação ou consequência causal sem quebrar o cânone nem acelerar artificialmente o clímax.",
  },
  {
    id: "subtext",
    label: "Mais subtexto",
    instruction: "Continue privilegiando subtexto, gesto, atmosfera e informação implícita. Evite explicar diretamente emoções que possam ser dramatizadas.",
  },
  {
    id: "bold",
    label: "Mais ousada",
    instruction: "Proponha uma continuação menos óbvia, mas plenamente compatível com o cânone, as motivações existentes e a promessa de gênero.",
  },
];

export function clampContinuationWords(value: number): number {
  if (!Number.isFinite(value)) return 180;
  return Math.max(60, Math.min(500, Math.round(value)));
}

export function clampAlternativeCount(value: number): number {
  if (!Number.isFinite(value)) return 3;
  return Math.max(2, Math.min(4, Math.round(value)));
}

export function buildContinuationPrompt(input: {
  intent?: string;
  targetWords: number;
  approach: CoauthorApproach;
  literaryContext?: string;
}): string {
  const targetWords = clampContinuationWords(input.targetWords);
  const intent = input.intent?.trim();
  return [
    "Tarefa: continuar a cena atual como proposta de coautoria.",
    intent ? `Intenção do autor para a próxima passagem: ${intent}` : "Intenção do autor: continue organicamente a partir do ponto atual.",
    `Extensão aproximada: ${targetWords} palavras.`,
    `Abordagem desta alternativa: ${input.approach.label}. ${input.approach.instruction}`,
    input.literaryContext ? `Contexto editorial: ${input.literaryContext}` : "",
    "Regras obrigatórias:",
    "- responda apenas com o novo trecho narrativo, sem prefácio, explicação, lista, rótulo ou comentário editorial;",
    "- não repita literalmente o final já escrito;",
    "- preserve pessoa, tempo verbal, foco narrativo, registro, nomes, fatos e relações conhecidos;",
    "- não revele informação que o personagem focal ainda não sabe;",
    "- não resolva conflitos maiores sem preparação;",
    "- se houver ambiguidade, escolha a continuação menos destrutiva para o cânone;",
    "- não altere o manuscrito: produza somente uma proposta que o autor poderá aceitar ou rejeitar.",
  ].filter(Boolean).join("\n");
}

export function pickApproaches(count: number): CoauthorApproach[] {
  return COAUTHOR_APPROACHES.slice(0, clampAlternativeCount(count));
}

export function appendContinuationText(base: string, continuation: string): string {
  const clean = continuation.trim();
  if (!clean) return base;
  if (!base.trim()) return clean;
  return `${base.trimEnd()}\n\n${clean}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char] ?? char));
}

export function continuationToHtml(continuation: string): string {
  return continuation
    .trim()
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function appendContinuationHtml(currentHtml: string, continuation: string): string {
  const next = continuationToHtml(continuation);
  if (!next) return currentHtml;
  return currentHtml.trim() ? `${currentHtml.trim()}${next}` : next;
}
