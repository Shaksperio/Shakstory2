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

export type GenreChapterRange = {
  id: string;
  label: string;
  aliases: string[];
  minWords: number;
  maxWords: number;
  targetWords: number;
  origin: "source" | "derived";
};

export const COAUTHOR_APPROACHES: CoauthorApproach[] = [
  {
    id: "faithful",
    label: "Fiel à cena",
    instruction: "Preserve ao máximo o tom, o ponto de vista, a intenção da cena e o ritmo já estabelecido. Faça avançar a consequência causal mais imediata do que já está em movimento. O acontecimento central desta opção deve nascer organicamente da ação ou tensão já aberta.",
  },
  {
    id: "tension",
    label: "Mais tensão",
    instruction: "Introduza uma complicação externa concreta — obstáculo, ameaça, interrupção, chegada, perda, descoberta prática ou consequência material — que mude a situação da cena sem quebrar o cânone nem antecipar o clímax. O acontecimento central deve ser diferente do caminho mais natural.",
  },
  {
    id: "subtext",
    label: "Mais subtexto",
    instruction: "Faça a cena mudar por uma decisão, gesto, revelação parcial, recusa, aproximação, afastamento ou mudança de relação concreta. Use subtexto, silêncio, atmosfera e ação física para dramatizar essa virada. O acontecimento central deve ser relacional ou interior com consequência visível, não apenas uma versão mais descritiva das outras opções.",
  },
];

export const GENRE_CHAPTER_RANGES: GenreChapterRange[] = [
  { id: "epic_fantasy", label: "Fantasia épica / alta fantasia", aliases: ["fantasia epica", "alta fantasia", "epic fantasy"], minWords: 4000, maxWords: 8000, targetWords: 5500, origin: "source" },
  { id: "urban_fantasy", label: "Fantasia urbana / contemporânea", aliases: ["fantasia urbana", "urban fantasy", "fantasia contemporanea"], minWords: 2500, maxWords: 5000, targetWords: 3500, origin: "derived" },
  { id: "dark_fantasy", label: "Dark fantasy", aliases: ["dark fantasy", "fantasia sombria"], minWords: 3000, maxWords: 6000, targetWords: 4000, origin: "derived" },
  { id: "science_fiction", label: "Ficção científica", aliases: ["ficcao cientifica", "science fiction", "sci-fi", "scifi"], minWords: 3000, maxWords: 5000, targetWords: 3800, origin: "source" },
  { id: "romance", label: "Romance", aliases: ["romance", "romance contemporaneo"], minWords: 2000, maxWords: 4000, targetWords: 3000, origin: "source" },
  { id: "romantasy", label: "Romantasia", aliases: ["romantasia", "romantasy", "fantasia romantica"], minWords: 3000, maxWords: 5000, targetWords: 4000, origin: "derived" },
  { id: "paranormal_romance", label: "Romance paranormal / dark paranormal romance", aliases: ["romance paranormal", "dark paranormal romance"], minWords: 2800, maxWords: 4500, targetWords: 3500, origin: "derived" },
  { id: "mystery", label: "Mistério / suspense", aliases: ["misterio", "suspense", "mystery"], minWords: 1500, maxWords: 3000, targetWords: 2200, origin: "source" },
  { id: "thriller", label: "Thriller", aliases: ["thriller"], minWords: 1000, maxWords: 2500, targetWords: 1800, origin: "source" },
  { id: "action", label: "Ação", aliases: ["acao", "action"], minWords: 1200, maxWords: 2800, targetWords: 2000, origin: "derived" },
  { id: "adventure", label: "Aventura", aliases: ["aventura", "adventure"], minWords: 2500, maxWords: 4500, targetWords: 3200, origin: "derived" },
  { id: "horror", label: "Terror / horror", aliases: ["terror", "horror"], minWords: 1500, maxWords: 3500, targetWords: 2400, origin: "derived" },
  { id: "young_adult", label: "Young adult", aliases: ["young adult", "ya", "jovem adulto"], minWords: 2000, maxWords: 4500, targetWords: 3000, origin: "source" },
  { id: "literary_fiction", label: "Ficção literária", aliases: ["ficcao literaria", "literary fiction"], minWords: 3000, maxWords: 6000, targetWords: 4000, origin: "derived" },
  { id: "general", label: "Qualquer gênero", aliases: ["geral", "general"], minWords: 2000, maxWords: 4000, targetWords: 3000, origin: "source" },
];

const normalize = (value?: string | null): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

export function resolveGenreChapterRange(genre?: string | null, subgenre?: string | null): GenreChapterRange {
  const haystack = [normalize(genre), normalize(subgenre)].filter(Boolean).join(" ");
  if (!haystack) return GENRE_CHAPTER_RANGES.find(item => item.id === "general")!;
  // Prefer the most specific matching alias (e.g. paranormal romance over romance).
  const specific = GENRE_CHAPTER_RANGES
    .filter(item => item.id !== "general")
    .map(item => ({ item, score: Math.max(0, ...[item.label, ...item.aliases]
      .map(normalize)
      .filter(alias => alias && haystack.includes(alias))
      .map(alias => alias.length)) }))
    .filter(match => match.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.item;
  return specific ?? GENRE_CHAPTER_RANGES.find(item => item.id === "general")!;
}

export function clampSampleWords(value: number): number {
  if (!Number.isFinite(value)) return 180;
  return Math.max(120, Math.min(260, Math.round(value)));
}

// Compatibilidade com chamadas anteriores: agora esta função representa somente a amostra.
export const clampContinuationWords = clampSampleWords;

export function clampAlternativeCount(_value: number): number {
  return 3;
}

export function pickApproaches(_count = 3): CoauthorApproach[] {
  return COAUTHOR_APPROACHES.slice(0, 3);
}

export function buildContinuationPrompt(input: {
  intent?: string;
  targetWords?: number;
  approach: CoauthorApproach;
  literaryContext?: string;
}): string {
  const targetWords = clampSampleWords(input.targetWords ?? 180);
  const intent = input.intent?.trim();
  return [
    "FASE 1 — AMOSTRA DE CAMINHO NARRATIVO.",
    "Você está criando UMA DAS TRÊS amostras que o autor vai comparar antes de escolher o rumo da continuação.",
    "Esta amostra NÃO é a continuação final e NÃO deve tentar cumprir a extensão completa do capítulo.",
    intent ? `Intenção do autor para a próxima passagem: ${intent}` : "Intenção do autor: continue organicamente a partir do ponto atual.",
    `Tamanho de amostra: aproximadamente ${targetWords} palavras, suficiente para mostrar evento, tom e consequência.`,
    `Caminho desta amostra: ${input.approach.label}. ${input.approach.instruction}`,
    input.literaryContext ? `Contexto editorial: ${input.literaryContext}` : "",
    "Regras da amostra:",
    "- escreva cena de verdade, não resumo, sinopse ou explicação do que aconteceria;",
    "- mostre um caminho dramático claro que possa ser expandido depois;",
    "- a diferença entre as três amostras deve estar no ACONTECIMENTO CENTRAL, não em adjetivos, tom, intensidade ou paráfrase;",
    "- esta amostra precisa representar a classe de evento definida em 'Caminho desta amostra'; não copie o mesmo evento provável das outras duas direções;",
    "- preserve pessoa, tempo verbal, foco narrativo, voz, nomes, fatos, relações e conhecimento do personagem focal;",
    "- não repita literalmente o final já escrito;",
    "- não resolva conflitos maiores nem feche o capítulo;",
    "- termine com impulso narrativo suficiente para o autor entender a direção proposta;",
    "- responda somente com o trecho narrativo da amostra, sem rótulo, prefácio ou comentário editorial;",
    "- não altere o manuscrito: esta saída serve apenas para comparação entre três caminhos.",
  ].filter(Boolean).join("\n");
}

export function buildExpansionPrompt(input: {
  selectedSample: string;
  intent?: string;
  genre?: string | null;
  subgenre?: string | null;
  literaryContext?: string;
  requestedWords?: number;
}): string {
  const range = resolveGenreChapterRange(input.genre, input.subgenre);
  const requested = input.requestedWords && Number.isFinite(input.requestedWords)
    ? Math.max(1, Math.round(input.requestedWords))
    : null;
  const targetRule = requested
    ? `O autor pediu aproximadamente ${requested.toLocaleString("pt-BR")} palavras; essa contagem prevalece.`
    : "Entregue entre 900 e 1.600 palavras. O piso absoluto é 700 palavras.";

  return [
    "FASE 2 — EXPANSÃO DA OPÇÃO ESCOLHIDA PELO AUTOR.",
    "O autor já analisou três amostras e escolheu o caminho narrativo abaixo. Agora transforme SOMENTE esse caminho em uma continuação literária completa.",
    "A amostra escolhida é uma direção dramática, não um texto que precise ser copiado palavra por palavra:",
    "--- AMOSTRA ESCOLHIDA ---",
    input.selectedSample.trim(),
    "--- FIM DA AMOSTRA ---",
    input.intent?.trim() ? `Intenção original do autor: ${input.intent.trim()}` : "",
    input.literaryContext ? `Contexto editorial: ${input.literaryContext}` : "",
    targetRule,
    `Referência de capítulo para ${range.label}: ${range.minWords.toLocaleString("pt-BR")}–${range.maxWords.toLocaleString("pt-BR")} palavras; alvo típico ${range.targetWords.toLocaleString("pt-BR")} (${range.origin === "derived" ? "faixa derivada" : "faixa consolidada de fontes"}). Use isso para calibrar o ritmo do capítulo, não para forçar o tamanho desta continuação.`,
    "EXPANSÃO SEM ENCHIMENTO:",
    "- inclua ao menos uma mudança real de situação: algo se revela, se perde, se decide, se rompe ou se complica;",
    "- inclua interioridade do personagem de ponto de vista quando o contexto permitir;",
    "- inclua diálogo ou ação física concreta;",
    "- use detalhe sensorial específico do lugar, nunca descrição genérica para preencher espaço;",
    "- cubra de 1 a 3 beats dramáticos;",
    "- termine em tensão, escolha, virada, silêncio significativo ou imagem que empurre a leitura adiante;",
    "- não encerre o capítulo salvo se o autor tiver pedido fechamento.",
    "RITMO E VARIAÇÃO:",
    "- varie parágrafos de modo irregular e intencional; combine linhas de impacto, parágrafos curtos, médios e alguns longos quando a cena pedir;",
    "- varie frases entre curtas, médias e longas; em ação ou thriller tenda a encurtar, em contemplação, romance ou atmosfera permita mais fôlego;",
    "- evite mais de dois parágrafos seguidos de peso semelhante e mais de três frases seguidas começando com a mesma palavra ou estrutura;",
    "- intercale diálogo com ação, gesto, percepção e pensamento; não crie fileiras de falas soltas;",
    "- preserve o Style DNA do próprio autor como referência suave, nunca como fórmula.",
    "CONTINUIDADE:",
    "- preserve nomes, grafias, idade, aparência, geografia, cronologia, objetos, relações, promessas narrativas, POV e tempo verbal;",
    "- não revele informação que o personagem focal ainda não poderia saber;",
    "- se um fato do cânone estiver incerto, escolha uma formulação que não o contradiga; não invente para preencher lacunas.",
    "PROIBIÇÕES:",
    "- sem resumo no lugar de cena, moralização ou metacomentário;",
    "- sem repetição para atingir contagem;",
    "- evite clichês de IA como 'um arrepio percorreu', 'o tempo parecia parar', 'uma mistura de X e Y', 'nada seria como antes' e 'ela não sabia, mas';",
    "- não transforme a amostra escolhida em outra direção dramática.",
    "AUTOVERIFICAÇÃO ANTES DE RESPONDER:",
    "- extensão dentro do alvo ou do número pedido;",
    "- continuidade preservada;",
    "- cena concreta, não resumo;",
    "- parágrafos e frases variados;",
    "- pelo menos uma mudança dramática real;",
    "- fecho que sustenta a próxima entrada.",
    "FORMATO: responda somente com a continuação expandida, sem OPÇÃO, sem prefácio, sem lista, sem explicar o que fez.",
  ].filter(Boolean).join("\n");
}

export function hasCompleteCoauthorSamples(alternatives: CoauthorAlternative[]): boolean {
  return alternatives.length === 3 && alternatives.every(item => Boolean(item.text.trim()));
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
