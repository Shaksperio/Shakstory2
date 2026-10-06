import { z } from "zod";
import { invokeLLM, listLLMModels } from "./_core/llm";
import { invokeOmniRouteLLM, isOmniRouteConfigured, listOmniRouteModels } from "./omniroute";
import { buildCowilaLiteraryContext } from "@shared/literary-intelligence";

export const literaryFocusSchema = z.enum([
  "language",
  "grammar",
  "parts_of_speech",
  "lexicon",
  "narrative",
  "voice",
  "style",
  "full",
]);

export const literaryAnalysisInputSchema = z.object({
  text: z.string().trim().min(1, "Escreva algum texto antes de analisar.").max(14000, "Analise um trecho de até 14.000 caracteres."),
  focus: literaryFocusSchema.default("full"),
  model: z.string().trim().min(1).max(120).optional(),
  language: z.string().trim().min(2).max(40).default("pt-BR"),
  genre: z.string().trim().max(80).optional(),
  subgenre: z.string().trim().max(80).optional(),
  audience: z.string().trim().max(80).optional(),
  role: z.enum(["coauthor", "developmental_editor", "line_editor", "copy_editor", "continuity_editor", "worldbuilding_editor", "genre_editor", "publishing_editor", "typesetting_editor", "ebook_editor"]).optional(),
  task: z.enum(["analyze", "continue_scene", "brainstorm", "rewrite_options", "outline", "scene_design", "character_arc", "dialogue", "continuity_check", "worldbuilding", "synopsis", "blurb", "metadata", "typesetting", "ebook"]).optional(),
});

const suggestionSchema = {
  type: "object",
  properties: {
    category: { type: "string", enum: ["ortografia", "gramatica", "classe_gramatical", "lexico", "narrativa", "voz", "estilo"] },
    severity: { type: "string", enum: ["erro_provavel", "revisar", "observacao"] },
    original: { type: "string" },
    suggestion: { type: "string" },
    explanation: { type: "string" },
    confidence: { type: "number" },
    start: { type: "integer", minimum: 0 },
    end: { type: "integer", minimum: 0 },
  },
  required: ["category", "severity", "original", "suggestion", "explanation", "confidence", "start", "end"],
  additionalProperties: false,
};

export const literaryAnalysisResponseSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.string()).max(8),
  suggestions: z.array(z.object({
    category: z.enum(["ortografia", "gramatica", "classe_gramatical", "lexico", "narrativa", "voz", "estilo"]),
    severity: z.enum(["erro_provavel", "revisar", "observacao"]),
    original: z.string(),
    suggestion: z.string(),
    explanation: z.string(),
    confidence: z.number().min(0).max(1),
    start: z.number().int().min(0),
    end: z.number().int().min(0),
  })).max(40),
  narrativeNotes: z.array(z.string()).max(8),
  model: z.string(),
});

const focusInstructions: Record<z.infer<typeof literaryFocusSchema>, string> = {
  language: "Priorize ortografia, acentuação, pontuação e clareza sem apagar escolhas estilísticas deliberadas.",
  grammar: "Priorize concordância, regência, colocação, tempos verbais, verbos, pronomes, artigos e preposições.",
  parts_of_speech: "Identifique usos relevantes de verbos, pronomes, artigos, preposições, substantivos e adjetivos, apontando apenas casos úteis para edição.",
  lexicon: "Priorize repetições, palavras semelhantes, precisão vocabular e sinônimos que preservem sentido, registro e voz.",
  narrative: "Analise coerência, foco narrativo, ritmo, continuidade, tensão, cena e transições; não reescreva a história pelo autor.",
  voice: "Analise tom de voz, distância narrativa, perspectiva, consistência e efeito no leitor; trate preferência como observação, não erro.",
  style: "Analise estilo, cadência, imagens, densidade, registro e marcas autorais; ofereça alternativas somente quando agregarem clareza ou efeito.",
  full: "Faça uma revisão equilibrada de linguagem, gramática, classes gramaticais, léxico, narrativa, voz e estilo.",
};

const responseSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" }, maxItems: 8 },
    suggestions: { type: "array", items: suggestionSchema, maxItems: 40 },
    narrativeNotes: { type: "array", items: { type: "string" }, maxItems: 8 },
  },
  required: ["summary", "strengths", "suggestions", "narrativeNotes"],
  additionalProperties: false,
};

const extractText = (content: string | Array<{ type: string; text?: string }>) =>
  Array.isArray(content) ? content.filter(part => part.type === "text").map(part => part.text ?? "").join("\n") : content;

function parseStructuredResponse(raw: string): unknown {
  const normalized = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (!normalized) throw new Error("A IA retornou uma resposta vazia.");
  if (normalized.startsWith("<")) throw new Error("O provedor da IA retornou HTML em vez de JSON; verifique o endpoint e a autenticação.");
  try { return JSON.parse(normalized); } catch { throw new Error("A IA retornou conteúdo que não é JSON estruturado."); }
}

export async function listLiteraryModels() {
  return isOmniRouteConfigured() ? listOmniRouteModels() : listLLMModels();
}

export async function analyzeLiteraryText(input: z.infer<typeof literaryAnalysisInputSchema>) {
  const catalog = await listLiteraryModels();
  const available = new Set(catalog.data.map(model => model.id));
  const selectedModel = input.model && available.has(input.model) ? input.model : undefined;
  const cowilaContext = buildCowilaLiteraryContext({ genre: input.genre, subgenre: input.subgenre, audience: input.audience, role: input.role, task: input.task });
  const request = {
    ...(selectedModel ? { model: selectedModel } : {}),
    messages: [
      {
        role: "system",
        content: `Você é Cowila, editora literária do Shakstory, rigorosa e respeitosa à autoria. ${cowilaContext} Responda somente em JSON conforme o schema. O idioma do trecho é ${input.language}. ${focusInstructions[input.focus]} Diferencie erro verificável de preferência editorial. Nunca invente regra, não elogie de forma genérica e não proponha mudanças que alterem fatos, personagens ou intenção sem explicar o risco. O campo original deve ser uma sequência literal encontrada no trecho, exceto quando a sugestão for uma observação sem substituição; nesse caso use uma string vazia. Informe start e end como offsets UTF-16 do trecho original; para observações sem substituição, use start=0 e end=0. A confiança deve ficar entre 0 e 1.`,
      },
      { role: "user", content: `Analise o trecho abaixo. Não o reescreva integralmente e não aplique alterações.\n\n${input.text}` },
    ] as Array<{ role: "system" | "user"; content: string }>,
    response_format: { type: "json_schema" as const, json_schema: { name: "literary_analysis", strict: true, schema: responseSchema } },
    maxTokens: 5000,
  };
  const response = isOmniRouteConfigured() ? await invokeOmniRouteLLM(request) : await invokeLLM(request);

  const raw = extractText(response.choices[0]?.message?.content ?? "");
  const parsed = literaryAnalysisResponseSchema.parse({ ...parseStructuredResponse(raw) as Record<string, unknown>, model: response.model });
  const safeSuggestions = parsed.suggestions.filter(item => {
    if (!item.original) return item.start === 0 && item.end === 0;
    return item.start >= 0 && item.end > item.start && input.text.slice(item.start, item.end) === item.original;
  });
  return { ...parsed, suggestions: safeSuggestions, availableModels: catalog.data.map(model => model.id) };
}
