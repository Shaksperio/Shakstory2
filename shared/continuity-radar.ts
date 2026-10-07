export type ContinuityDimension =
  | "canon"
  | "chronology"
  | "character_knowledge"
  | "relationships"
  | "locations"
  | "world_rules"
  | "objects"
  | "unresolved_threads";

export const CONTINUITY_DIMENSIONS: Record<ContinuityDimension, string> = {
  canon: "fatos canônicos e decisões já estabelecidas",
  chronology: "ordem temporal, duração, datas, idade e sequência causal",
  character_knowledge: "o que cada personagem sabe, ignora, viu ou ainda não poderia saber",
  relationships: "parentesco, alianças, rivalidades, vínculos e mudanças relacionais",
  locations: "posição, deslocamentos, geografia, acesso e presença física",
  world_rules: "regras de magia, tecnologia, instituições, poderes, limites e custos",
  objects: "posse, estado, localização e continuidade de objetos relevantes",
  unresolved_threads: "promessas, pistas, conflitos e perguntas abertas que não devem sumir por acidente",
};

export function buildContinuityPrompt(input: {
  sceneTitle?: string;
  dimensions?: ContinuityDimension[];
}): string {
  const dimensions = input.dimensions?.length
    ? input.dimensions
    : (Object.keys(CONTINUITY_DIMENSIONS) as ContinuityDimension[]);
  const checklist = dimensions.map((dimension, index) =>
    `${index + 1}. ${CONTINUITY_DIMENSIONS[dimension]}`
  ).join("\n");

  return [
    "Faça uma auditoria de continuidade da cena atual do Shakstory.",
    input.sceneTitle ? `Cena em análise: ${input.sceneTitle}.` : "",
    "Compare o texto com todo o contexto persistido recebido: cânone do livro, série e universo, planejamento, Story Engine e histórico recente.",
    "Verifique explicitamente:",
    checklist,
    "Classifique cada possível problema como: CONTRADIÇÃO, RISCO, PERGUNTA ou OK.",
    "Para CONTRADIÇÃO e RISCO, cite o trecho ou fato envolvido de forma breve e explique por que merece atenção.",
    "Não invente fatos ausentes para completar lacunas. Se o contexto não permitir concluir, use PERGUNTA.",
    "Não reescreva a cena e não aplique nenhuma alteração.",
    "Priorize conflitos objetivos de continuidade; não trate preferência estilística como erro.",
    "Feche com uma seção 'Próximas verificações' contendo no máximo três itens úteis.",
  ].filter(Boolean).join("\n");
}
