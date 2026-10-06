export type LiteraryRole =
  | "coauthor"
  | "developmental_editor"
  | "line_editor"
  | "copy_editor"
  | "continuity_editor"
  | "worldbuilding_editor"
  | "genre_editor"
  | "publishing_editor"
  | "typesetting_editor"
  | "ebook_editor";

export type LiteraryTask =
  | "analyze"
  | "continue_scene"
  | "brainstorm"
  | "rewrite_options"
  | "outline"
  | "scene_design"
  | "character_arc"
  | "dialogue"
  | "continuity_check"
  | "worldbuilding"
  | "synopsis"
  | "blurb"
  | "metadata"
  | "typesetting"
  | "ebook";

export type LiteraryDomain =
  | "narrative_craft"
  | "plot_structure"
  | "scene_sequel"
  | "character"
  | "dialogue"
  | "voice_style"
  | "pacing_tension"
  | "worldbuilding"
  | "continuity"
  | "genre_conventions"
  | "language_grammar"
  | "developmental_editing"
  | "line_editing"
  | "copy_editing"
  | "proofreading"
  | "nonfiction"
  | "research"
  | "series_architecture"
  | "book_design"
  | "typesetting"
  | "epub"
  | "publishing_metadata"
  | "commercial_positioning";

export type GenrePack = {
  id: string;
  label: string;
  aliases: string[];
  conventions: string[];
  risks: string[];
  craftPriorities: string[];
  readerPromise: string[];
};

const pack = (
  id: string,
  label: string,
  aliases: string[],
  conventions: string[],
  risks: string[],
  craftPriorities: string[],
  readerPromise: string[],
): GenrePack => ({ id, label, aliases, conventions, risks, craftPriorities, readerPromise });

export const GENRE_PACKS: GenrePack[] = [
  pack("fantasy", "Fantasia", ["fantasia", "fantasy"],
    ["mundo com regras próprias", "causalidade interna consistente", "maravilhamento com consequências"],
    ["exposição excessiva", "regras mágicas contraditórias", "worldbuilding sem função dramática"],
    ["coerência do mundo", "conflito entre desejo e sistema", "revelação gradual de lore"],
    ["descoberta", "imersão", "escala imaginativa"]),
  pack("epic_fantasy", "Fantasia épica", ["fantasia épica", "epic fantasy", "alta fantasia"],
    ["escala ampla", "múltiplas forças políticas ou culturais", "consequências coletivas"],
    ["elenco indistinguível", "infodump histórico", "escalada sem intimidade emocional"],
    ["arcos interligados", "mapa causal do conflito", "voz diferenciada por núcleo"],
    ["amplitude", "mitologia", "conflitos de grande escala"]),
  pack("dark_fantasy", "Dark fantasy", ["dark fantasy", "fantasia sombria"],
    ["ameaça persistente", "ambiguidade moral", "fantástico associado a custo ou corrupção"],
    ["choque gratuito", "grimdark sem contraste", "violência sem consequência narrativa"],
    ["atmosfera", "preço das escolhas", "contraste entre beleza e ameaça"],
    ["tensão", "mistério", "fantástico inquietante"]),
  pack("romantasy", "Romantasy", ["romantasy", "fantasia romântica", "romance fantástico"],
    ["arco romântico e arco fantástico com peso estrutural", "atração com impedimentos reais", "payoff emocional"],
    ["romance desconectado da trama", "química declarada sem cenas", "worldbuilding sacrificado por conveniência"],
    ["progressão relacional", "tensão romântica", "integração entre romance e conflito fantástico"],
    ["emoção", "química", "perigo e maravilhamento"]),
  pack("romance", "Romance", ["romance", "romance contemporâneo", "romantic fiction"],
    ["relação central", "progressão emocional", "conflito compatível com o vínculo"],
    ["mal-entendido artificial", "atração sem individualidade", "resolução sem transformação"],
    ["química em cena", "subtexto", "escalada de vulnerabilidade"],
    ["envolvimento emocional", "intimidade", "resolução relacional"]),
  pack("science_fiction", "Ficção científica", ["ficção científica", "ficcao cientifica", "science fiction", "sci-fi", "scifi"],
    ["novum ou hipótese especulativa", "efeitos sociais ou humanos da tecnologia/ciência", "causalidade"],
    ["jargão sem função", "tecnologia milagrosa oportunista", "explicação substituindo drama"],
    ["consequências da premissa", "verossimilhança interna", "dilemas humanos"],
    ["ideias", "especulação", "descoberta e consequência"]),
  pack("horror", "Horror", ["horror", "terror"],
    ["ameaça ou inquietação progressiva", "controle de informação", "vulnerabilidade"],
    ["susto repetitivo", "ameaça onipotente sem regra", "gore sem tensão"],
    ["antecipação", "atmosfera", "perda de segurança"],
    ["medo", "inquietação", "catarse"]),
  pack("thriller", "Thriller", ["thriller", "suspense"],
    ["urgência", "ameaça escalável", "reversões causais"],
    ["reviravolta sem preparação", "vilão conveniente", "pistas manipuladas"],
    ["pressão temporal", "objetivos claros", "complicações progressivas"],
    ["velocidade", "perigo", "surpresa justa"]),
  pack("mystery", "Mistério", ["mistério", "misterio", "mystery", "policial"],
    ["pergunta central", "pistas acessíveis", "revelação retrospectivamente coerente"],
    ["ocultar informação que o POV saberia", "solução arbitrária", "pistas sem payoff"],
    ["cadeia de pistas", "suspeitos e motivos", "fair play"],
    ["curiosidade", "investigação", "revelação satisfatória"]),
  pack("historical", "Ficção histórica", ["ficção histórica", "historical fiction", "romance histórico"],
    ["contexto histórico com efeito material", "costumes e restrições da época", "pesquisa"],
    ["anacronismo não intencional", "exposição enciclopédica", "personagens modernos com figurino histórico"],
    ["detalhe seletivo", "linguagem legível sem falso arcaísmo", "conflitos derivados do período"],
    ["imersão", "contexto", "vida humana dentro da história"]),
  pack("dystopian", "Distopia", ["distopia", "dystopian"],
    ["sistema social opressivo legível", "mecanismos de poder", "custo da resistência"],
    ["estado vilanesco genérico", "rebelião sem logística", "regra social sem impacto cotidiano"],
    ["instituições", "consequências sociais", "agência sob restrição"],
    ["pressão sistêmica", "resistência", "crítica social"]),
  pack("urban_fantasy", "Fantasia urbana", ["fantasia urbana", "urban fantasy"],
    ["fantástico em tensão com o cotidiano", "regras de coexistência", "cidade com função narrativa"],
    ["mundo oculto sem consequências", "cidade genérica", "lore episódico sem acumulação"],
    ["atrito entre mundos", "identidade urbana", "ritmo"],
    ["familiar + extraordinário", "mistério", "energia contemporânea"]),
  pack("paranormal", "Paranormal", ["paranormal", "romance paranormal"],
    ["fenômenos ou criaturas sobrenaturais", "regras e consequências", "ambiguidade quando desejada"],
    ["poder sem limite", "mitologia inconsistente", "solução sobrenatural conveniente"],
    ["regra sobrenatural", "atmosfera", "impacto emocional"],
    ["estranhamento", "perigo", "fascínio"]),
  pack("young_adult", "Young Adult", ["young adult", "ya", "jovem adulto"],
    ["proximidade emocional", "formação de identidade", "agência do protagonista"],
    ["voz infantilizada", "adultos resolvendo a trama", "temas simplificados artificialmente"],
    ["voz imediata", "decisões identitárias", "relações em transformação"],
    ["intensidade emocional", "descoberta", "pertencimento"]),
  pack("middle_grade", "Middle Grade", ["middle grade", "infantojuvenil"],
    ["aventura acessível", "agência infantil", "clareza sem simplificação vazia"],
    ["moralização explícita", "perigo sem calibragem", "voz adulta disfarçada"],
    ["curiosidade", "amizade", "resolução por ação dos protagonistas"],
    ["aventura", "humor ou maravilhamento", "segurança emocional relativa"]),
  pack("literary_fiction", "Ficção literária", ["ficção literária", "literary fiction"],
    ["linguagem com função estética", "interioridade", "ambiguidade produtiva"],
    ["opacidade sem propósito", "ausência de movimento dramático", "metáfora ornamental"],
    ["voz", "subtexto", "imagem recorrente e transformação interior"],
    ["densidade emocional", "linguagem", "interpretação"]),
  pack("adventure", "Aventura", ["aventura", "adventure"],
    ["objetivo concreto", "obstáculos crescentes", "movimento espacial ou situacional"],
    ["episódios desconectados", "perigo sem custo", "protagonista passivo"],
    ["clareza de objetivo", "set pieces", "ritmo e consequência"],
    ["movimento", "descoberta", "superação"]),
  pack("nonfiction", "Não ficção", ["não ficção", "nao ficcao", "nonfiction"],
    ["promessa clara", "estrutura argumentativa", "evidência e rastreabilidade"],
    ["afirmação sem fonte", "capítulos redundantes", "tom de autoridade sem base"],
    ["tese", "hierarquia de evidências", "clareza e exemplos"],
    ["utilidade", "clareza", "confiança"]),
  pack("memoir", "Memórias / memoir", ["memórias", "memoir", "autobiografia"],
    ["pacto de memória", "seleção temática", "cena + reflexão"],
    ["certeza inventada sobre lembranças", "cronologia sem arco", "exposição íntima sem função"],
    ["voz", "distância reflexiva", "seleção de episódios"],
    ["verdade subjetiva assumida", "intimidade", "significado"]),
  pack("biography", "Biografia", ["biografia", "biography"],
    ["fontes", "cronologia inteligível", "contexto histórico"],
    ["hagiografia", "psicologia inventada", "citações sem origem"],
    ["evidência", "contexto", "distinção entre fato e interpretação"],
    ["credibilidade", "trajetória", "contextualização"]),
  pack("self_help", "Desenvolvimento pessoal", ["autoajuda", "self-help", "desenvolvimento pessoal"],
    ["problema delimitado", "método explícito", "exemplos e limites"],
    ["promessa garantida", "anedota tratada como prova", "conselho universal"],
    ["clareza", "aplicabilidade", "limites e evidência"],
    ["utilidade prática", "progressão", "ação"]),
  pack("essay", "Ensaio", ["ensaio", "essay"],
    ["tese ou pergunta", "movimento argumentativo", "voz autoral"],
    ["digressão sem retorno", "afirmação sem sustentação", "conclusão apenas repetitiva"],
    ["raciocínio", "transições", "imagem e voz"],
    ["ideia", "perspectiva", "elegância argumentativa"]),
  pack("poetry", "Poesia", ["poesia", "poetry"],
    ["economia e escolha formal", "ritmo", "imagem e som"],
    ["paráfrase explicativa", "clichê imagético", "forma automática sem tensão"],
    ["musicalidade", "imagem", "compressão e estrutura"],
    ["experiência verbal", "imagem", "ressonância"]),
];

export const LITERARY_DOMAINS: Record<LiteraryDomain, string> = {
  narrative_craft: "Cena, sequência, causalidade, conflito, objetivo, virada e consequência.",
  plot_structure: "Estrutura macro, promessa, progressão, midpoint, clímax e resolução sem fórmula obrigatória.",
  scene_sequel: "Alternância entre ação dramática, reação, dilema, decisão e novo objetivo.",
  character: "Desejo, necessidade, contradição, agência, arco, relações e consistência comportamental.",
  dialogue: "Voz individual, objetivo oculto, subtexto, turnos, interrupção, ação e silêncio.",
  voice_style: "Pessoa, distância, focalização, registro, cadência, imagem, densidade e marcas autorais.",
  pacing_tension: "Velocidade percebida, compressão, expansão, suspense, curiosidade, pressão e descanso.",
  worldbuilding: "Regras, instituições, cultura, economia, geografia, magia/tecnologia e consequências sistêmicas.",
  continuity: "Fatos, cronologia, causalidade, conhecimento de personagens, objetos, locais e regras do mundo.",
  genre_conventions: "Promessa de gênero, convenções, expectativas de leitor e espaço para subversão consciente.",
  language_grammar: "Ortografia, sintaxe, concordância, regência, pontuação e legibilidade sem apagar voz.",
  developmental_editing: "Diagnóstico estrutural de história, capítulos, arcos, personagens, tema, ritmo e redundância.",
  line_editing: "Qualidade frase a frase: precisão, ritmo, clareza, repetição, imagem e consistência de voz.",
  copy_editing: "Correção linguística, consistência editorial, fatos internos, nomes, grafias e convenções.",
  proofreading: "Erros residuais de digitação, pontuação, espaços, quebras e consistência final.",
  nonfiction: "Tese, argumento, evidência, organização, exemplos, fontes, limites e responsabilidade factual.",
  research: "Separar fato, hipótese, memória, invenção e ponto que exige fonte ou verificação.",
  series_architecture: "Arcos por volume, perguntas abertas, payoff, recorrências, continuidade e escalada entre livros.",
  book_design: "Hierarquia visual, front matter, back matter, sumário, abertura de capítulos e coerência gráfica.",
  typesetting: "Mancha de texto, margens, entrelinha, hifenização, viúvas/órfãs, cabeçalhos, rodapés e paginação.",
  epub: "Estrutura semântica, navegação, CSS reflowable, imagens, metadados, acessibilidade e validação EPUB.",
  publishing_metadata: "Título, subtítulo, autoria, descrição, categorias, ISBN, idioma, direitos e metadados de distribuição.",
  commercial_positioning: "Clareza da promessa, leitor-alvo, abertura, retenção, ritmo e posicionamento sem prometer vendas.",
};

export function normalizeGenre(value?: string | null): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function findGenrePack(value?: string | null): GenrePack | null {
  const normalized = normalizeGenre(value);
  if (!normalized) return null;
  return GENRE_PACKS.find(item =>
    normalizeGenre(item.id) === normalized ||
    normalizeGenre(item.label) === normalized ||
    item.aliases.some(alias => normalizeGenre(alias) === normalized)
  ) ?? GENRE_PACKS.find(item =>
    item.aliases.some(alias => normalized.includes(normalizeGenre(alias)) || normalizeGenre(alias).includes(normalized))
  ) ?? null;
}

export function buildGenreLens(value?: string | null): string {
  const genre = findGenrePack(value);
  if (!genre) {
    return value?.trim()
      ? `Gênero informado: ${value.trim()}. Identifique convenções somente quando forem pertinentes; não imponha fórmulas.`
      : "O gênero não foi informado. Não assuma convenções específicas sem evidência no texto.";
  }
  return [
    `Lente de gênero: ${genre.label}.`,
    `Convenções úteis: ${genre.conventions.join("; ")}.`,
    `Riscos a vigiar: ${genre.risks.join("; ")}.`,
    `Prioridades de craft: ${genre.craftPriorities.join("; ")}.`,
    `Promessa provável ao leitor: ${genre.readerPromise.join("; ")}.`,
    "Use essas convenções como diagnóstico, nunca como obrigação mecânica.",
  ].join(" ");
}

export function buildCowilaEditorialPrinciples(): string {
  return [
    "A autoria pertence ao usuário.",
    "Nunca aplique alteração no manuscrito sem ação explícita do autor.",
    "Separe erro verificável, risco editorial, preferência estilística e sugestão opcional.",
    "Preserve voz, intenção, ponto de vista, cânone e nível de linguagem salvo pedido contrário.",
    "Não imite a voz identificável de autores vivos nem prometa reproduzir um escritor específico.",
    "Pode explicar técnicas, estruturas e características gerais de gêneros e tradições literárias.",
    "Não trate fórmula comercial como garantia de best-seller; fale em legibilidade, promessa, retenção e posicionamento.",
    "Em não ficção, sinalize afirmações que exigem fonte e nunca invente referências.",
    "Em edição, prefira diagnóstico + opções + trade-offs em vez de reescrita total automática.",
    "Em continuidade, o cânone persistido da obra tem prioridade sobre inferências do modelo.",
  ].join(" ");
}

export function buildCowilaLiteraryContext(input: {
  genre?: string | null;
  subgenre?: string | null;
  audience?: string | null;
  role?: LiteraryRole;
  task?: LiteraryTask;
}): string {
  const role = input.role ?? "developmental_editor";
  const task = input.task ?? "analyze";
  const secondary = input.subgenre?.trim() ? ` Subgênero informado: ${input.subgenre.trim()}.` : "";
  const audience = input.audience?.trim() ? ` Público-alvo informado: ${input.audience.trim()}.` : "";
  return [
    `Papel editorial: ${role}. Tarefa: ${task}.`,
    buildGenreLens(input.genre),
    secondary,
    audience,
    buildCowilaEditorialPrinciples(),
  ].filter(Boolean).join(" ");
}
