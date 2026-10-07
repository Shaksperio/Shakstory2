export type CoauthorGenerationMode = "continuation" | "full_chapter" | "short_scene";
export type GuidelineOrigin = "source" | "derived" | "general";

export type ChapterLengthGuideline = {
  id: string;
  label: string;
  aliases: string[];
  minWords: number;
  maxWords: number;
  targetWords: number;
  origin: GuidelineOrigin;
  note: string;
};

export type WorkLengthGuideline = {
  id: string;
  label: string;
  minWords: number;
  maxWords: number;
  note: string;
};

export const CONTINUATION_MIN_WORDS = 900;
export const CONTINUATION_MAX_WORDS = 1600;
export const CONTINUATION_ABSOLUTE_FLOOR = 700;
export const CONTINUATION_DEFAULT_WORDS = 1200;
export const CONTINUATION_DEFAULT_ALTERNATIVES = 3;

export const CHAPTER_LENGTH_GUIDELINES: ChapterLengthGuideline[] = [
  {
    id: "epic_fantasy",
    label: "Fantasia épica / alta fantasia",
    aliases: ["fantasia epica", "fantasia épica", "alta fantasia", "epic fantasy"],
    minWords: 4000,
    maxWords: 8000,
    targetWords: 5500,
    origin: "source",
    note: "Fonte consolidada no documento: 5.000–8.000; estudos citados variam de 3.000–10.000.",
  },
  {
    id: "urban_fantasy",
    label: "Fantasia urbana / contemporânea",
    aliases: ["fantasia urbana", "fantasia contemporanea", "fantasia contemporânea", "urban fantasy"],
    minWords: 2500,
    maxWords: 5000,
    targetWords: 3500,
    origin: "derived",
    note: "Faixa derivada; não é norma publicada específica.",
  },
  {
    id: "dark_fantasy",
    label: "Dark fantasy",
    aliases: ["dark fantasy", "fantasia sombria"],
    minWords: 3000,
    maxWords: 6000,
    targetWords: 4000,
    origin: "derived",
    note: "Derivada de fantasia; o documento não identifica norma específica.",
  },
  {
    id: "science_fiction",
    label: "Ficção científica",
    aliases: ["ficcao cientifica", "ficção científica", "science fiction", "sci-fi", "scifi"],
    minWords: 3000,
    maxWords: 5000,
    targetWords: 3800,
    origin: "source",
    note: "Fonte consolidada no documento: cerca de 3.000; Duna é citado na faixa de 4.000–5.000.",
  },
  {
    id: "romance",
    label: "Romance",
    aliases: ["romance", "romance contemporaneo", "romance contemporâneo", "romantic fiction"],
    minWords: 2000,
    maxWords: 4000,
    targetWords: 3000,
    origin: "source",
    note: "Fonte consolidada no documento: 2.000–3.000 e cerca de 3.000.",
  },
  {
    id: "romantasy",
    label: "Romantasia",
    aliases: ["romantasia", "romantasy", "fantasia romantica", "fantasia romântica"],
    minWords: 3000,
    maxWords: 5000,
    targetWords: 4000,
    origin: "derived",
    note: "Faixa derivada do híbrido romance + fantasia.",
  },
  {
    id: "paranormal_romance",
    label: "Romance paranormal / dark paranormal romance",
    aliases: ["romance paranormal", "dark paranormal romance", "paranormal romance"],
    minWords: 2800,
    maxWords: 4500,
    targetWords: 3500,
    origin: "derived",
    note: "Faixa derivada; não é norma publicada específica.",
  },
  {
    id: "mystery_suspense",
    label: "Mistério / suspense",
    aliases: ["misterio", "mistério", "suspense", "mystery"],
    minWords: 1500,
    maxWords: 3000,
    targetWords: 2200,
    origin: "source",
    note: "As fontes citadas variam de menos de 1.000 a 3.000 conforme o autor.",
  },
  {
    id: "thriller",
    label: "Thriller",
    aliases: ["thriller"],
    minWords: 1000,
    maxWords: 2500,
    targetWords: 1800,
    origin: "source",
    note: "Capítulos curtos são tratados no documento como característica recorrente do gênero.",
  },
  {
    id: "action",
    label: "Ação",
    aliases: ["acao", "ação", "action"],
    minWords: 1200,
    maxWords: 2800,
    targetWords: 2000,
    origin: "derived",
    note: "Faixa derivada de thriller.",
  },
  {
    id: "adventure",
    label: "Aventura",
    aliases: ["aventura", "adventure"],
    minWords: 2500,
    maxWords: 4500,
    targetWords: 3200,
    origin: "derived",
    note: "Faixa derivada.",
  },
  {
    id: "horror",
    label: "Terror / horror",
    aliases: ["terror", "horror"],
    minWords: 1500,
    maxWords: 3500,
    targetWords: 2400,
    origin: "derived",
    note: "Faixa derivada.",
  },
  {
    id: "young_adult",
    label: "Young adult",
    aliases: ["young adult", "ya", "jovem adulto"],
    minWords: 2000,
    maxWords: 4500,
    targetWords: 3000,
    origin: "source",
    note: "O documento consolida fontes divergentes de 1.500–2.500 e 3.000–5.000.",
  },
  {
    id: "literary_fiction",
    label: "Ficção literária",
    aliases: ["ficcao literaria", "ficção literária", "literary fiction"],
    minWords: 3000,
    maxWords: 6000,
    targetWords: 4000,
    origin: "derived",
    note: "Faixa derivada.",
  },
  {
    id: "general",
    label: "Qualquer gênero (média geral)",
    aliases: ["geral", "general", "qualquer genero", "qualquer gênero"],
    minWords: 2000,
    maxWords: 4000,
    targetWords: 3000,
    origin: "general",
    note: "Média geral; o documento observa faixa normal de 1.500–5.000.",
  },
];

export const WORK_LENGTH_GUIDELINES: WorkLengthGuideline[] = [
  { id: "microfiction", label: "Microconto / drabble", minWords: 1, maxWords: 100, note: "Drabble: exatamente 100 palavras." },
  { id: "flash_fiction", label: "Flash fiction", minWords: 101, maxWords: 1000, note: "Alguns mercados aceitam até 1.500–2.000." },
  { id: "short_story", label: "Conto", minWords: 1000, maxWords: 7500, note: "O limite superior pode variar até 10.000." },
  { id: "novelette", label: "Novelette", minWords: 7500, maxWords: 17500, note: "Algumas referências estendem a fronteira até 20.000." },
  { id: "novella", label: "Novela", minWords: 17000, maxWords: 40000, note: "Algumas fontes usam 10.000–40.000." },
  { id: "novel_general", label: "Romance, geral", minWords: 70000, maxWords: 100000, note: "" },
  { id: "paranormal_romance_novel", label: "Romance paranormal / romance", minWords: 85000, maxWords: 100000, note: "" },
  { id: "mystery_thriller_novel", label: "Mistério / thriller", minWords: 70000, maxWords: 100000, note: "" },
  { id: "sf_fantasy_novel", label: "Ficção científica e fantasia", minWords: 90000, maxWords: 120000, note: "Fantasia épica pode ultrapassar." },
  { id: "young_adult_novel", label: "Young adult", minWords: 50000, maxWords: 80000, note: "Paranormal e fantasia YA podem chegar a 100.000." },
];

export const COWILA_COAUTHOR_MASTER_PROMPT = `
Você é a Cowila, coautora e escritora do Estúdio Literário Cowila. Você escreve prosa de ficção em nível editorial profissional, em continuidade rigorosa com o contexto fornecido: personagens, voz narrativa, tempo verbal, ponto de vista, tom, cânone do mundo e fatos já estabelecidos.

FUNÇÃO
Quando o autor pedir continuação, entregue 3 opções. Cada opção é um trecho de livro de verdade, não um resumo, sinopse ou esboço. Nunca descreva o que aconteceria: escreva a cena.

EXTENSÃO
- Modo CONTINUAÇÃO: cada opção deve ficar entre 900 e 1.600 palavras; o piso absoluto é 700.
- Modo CAPÍTULO COMPLETO: use a faixa do gênero, sem ficar abaixo do piso inferior, salvo contagem explícita do autor.
- Modo CENA CURTA: use somente quando o autor pedir explicitamente curta, breve ou indicar uma contagem.
- Se o autor informar uma contagem de palavras, essa contagem prevalece.
- Se o texto ficar abaixo do piso, expanda com ação, percepção sensorial, subtexto, diálogo e consequência, nunca com repetição ou resumo.

EXPANSÃO COM CONTEÚDO
Cada opção deve conter mudança real de situação; interioridade do personagem focal; diálogo ou ação física concreta; detalhe sensorial específico; e fecho com tensão, escolha, virada ou imagem que empurre a leitura.

DIVERGÊNCIA REAL
As 3 opções devem seguir caminhos dramáticos distintos. Elas diferem em evento, não apenas em adjetivos, e todas respeitam o cânone.

RITMO E VARIAÇÃO
Varie de forma irregular e intencional a extensão de parágrafos e frases. Evite uniformidade mecânica. A pulsação da prosa deve acompanhar a cena: ação e pânico tendem a encurtar; luto, desejo, descrição e memória podem alongar.
- Dois parágrafos consecutivos não devem repetir exatamente o mesmo número de frases.
- Evite mais de dois parágrafos seguidos de peso semelhante.
- Evite três frases consecutivas começando com a mesma palavra ou estrutura.
- Alterne frases curtas, médias e longas de modo irregular.
- Diálogo deve ser intercalado com ação, gesto, percepção e pensamento quando isso servir à cena.
- Linhas de impacto devem ser raras e motivadas.
- Varie aberturas de parágrafo: ação, diálogo, percepção, tempo, lugar e pensamento.

CONTINUIDADE
Preserve nomes, grafias, idade, aparência, geografia, cronologia, objetos e promessas narrativas. Em dúvida factual, não invente: evite contradizer o cânone e sinalize a incerteza de forma breve fora do texto narrativo.

PROIBIÇÕES
Sem resumos no lugar de cena. Sem moralizar. Evite clichês de IA como “um arrepio percorreu”, “o tempo parecia parar”, “uma mistura de X e Y”, “nada seria como antes” e “ela não sabia, mas”. Não repita a mesma abertura ou o mesmo fecho nas opções. Não repita palavras-âncora em excesso. Sem comentários metalinguísticos dentro da obra.

AUTOVERIFICAÇÃO
Antes de entregar, verifique: extensão; divergência real; continuidade; variação rítmica; presença de cena concreta em vez de resumo; ausência dos clichês proibidos; e fecho que sustente a próxima entrada.

CONTROLE AUTORAL
A IA propõe; o autor decide. Nunca altere silenciosamente o manuscrito.
`.trim();

export function normalizeGuidelineGenre(value?: string | null): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function findChapterLengthGuideline(value?: string | null): ChapterLengthGuideline {
  const normalized = normalizeGuidelineGenre(value);
  if (!normalized) return CHAPTER_LENGTH_GUIDELINES.find(item => item.id === "general")!;
  const exact = CHAPTER_LENGTH_GUIDELINES.find(item =>
    normalizeGuidelineGenre(item.id) === normalized ||
    normalizeGuidelineGenre(item.label) === normalized ||
    item.aliases.some(alias => normalizeGuidelineGenre(alias) === normalized)
  );
  if (exact) return exact;
  return CHAPTER_LENGTH_GUIDELINES.find(item =>
    item.aliases.some(alias => {
      const candidate = normalizeGuidelineGenre(alias);
      return normalized.includes(candidate) || candidate.includes(normalized);
    })
  ) ?? CHAPTER_LENGTH_GUIDELINES.find(item => item.id === "general")!;
}

export function chapterTargetForGenre(genre?: string | null): number {
  return findChapterLengthGuideline(genre).targetWords;
}

export function chapterRangeForGenre(genre?: string | null): { minWords: number; maxWords: number; targetWords: number } {
  const guideline = findChapterLengthGuideline(genre);
  return {
    minWords: guideline.minWords,
    maxWords: guideline.maxWords,
    targetWords: guideline.targetWords,
  };
}

export function resolveGenerationTarget(input: {
  mode: CoauthorGenerationMode;
  genre?: string | null;
  requestedWords?: number | null;
}): number {
  const requested = Number(input.requestedWords);
  if (Number.isFinite(requested) && requested > 0) return Math.round(requested);
  if (input.mode === "full_chapter") return chapterTargetForGenre(input.genre);
  if (input.mode === "short_scene") return 500;
  return CONTINUATION_DEFAULT_WORDS;
}

export function buildRuntimeCoauthorDirective(input: {
  mode: CoauthorGenerationMode;
  genre?: string | null;
  requestedWords?: number | null;
  optionIndex: number;
  totalOptions?: number;
}): string {
  const total = input.totalOptions ?? CONTINUATION_DEFAULT_ALTERNATIVES;
  const target = resolveGenerationTarget(input);
  const chapter = findChapterLengthGuideline(input.genre);

  const extension = input.mode === "full_chapter"
    ? `Modo CAPÍTULO COMPLETO. Gênero: ${chapter.label}. Faixa editorial: ${chapter.minWords}–${chapter.maxWords} palavras; alvo padrão ${chapter.targetWords}. Alvo desta execução: ${target} palavras.`
    : input.mode === "short_scene"
      ? `Modo CENA CURTA. O autor pediu explicitamente uma cena breve. Alvo desta execução: ${target} palavras.`
      : `Modo CONTINUAÇÃO. Esta é a opção ${input.optionIndex} de ${total}. Alvo: ${target} palavras; faixa padrão 900–1.600; piso absoluto 700, salvo contagem explícita do autor.`;

  return [
    COWILA_COAUTHOR_MASTER_PROMPT,
    extension,
    "IMPORTANTE PARA ESTE RUNTIME: cada opção é gerada em uma chamada separada. Escreva somente esta opção, sem rótulo OPÇÃO, sem preâmbulo e sem comentar as outras opções.",
    "Esta opção deve seguir um caminho dramático diferente das demais estratégias fornecidas pelo Shakstory.",
  ].join("\n\n");
}
