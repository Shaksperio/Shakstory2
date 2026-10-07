import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { buildCowilaLiteraryContext, type LiteraryRole, type LiteraryTask } from "@shared/literary-intelligence";
import { buildContinuationPrompt, buildExpansionPrompt, clampAlternativeCount, clampContinuationWords, pickApproaches, type CoauthorAlternative } from "@shared/coauthor";
import { buildStyleDnaPrompt } from "@shared/style-dna";
import { buildContinuityPrompt } from "@shared/continuity-radar";

type QueryOptions = {
  enabled?: boolean;
  refetchInterval?: number | false;
  retry?: boolean | number;
  refetchOnWindowFocus?: boolean;
};

type ApiErrorData = { code?: string; status?: number };
export class CloudflareApiError extends Error {
  data?: ApiErrorData;
  constructor(message: string, data?: ApiErrorData) {
    super(message);
    this.name = "CloudflareApiError";
    this.data = data;
  }
}

type DocumentResult = {
  data: Record<string, unknown> | null;
  sha?: string;
  version: number;
  updatedAt?: string;
};

type RawDocumentResult = Omit<DocumentResult, "sha"> & { sha: string | null };

type SyncStatus = "idle" | "syncing" | "synced" | "conflict" | "error";
type StatusResult = {
  mode: "cloudflare-d1";
  versioned: true;
  status: SyncStatus;
  lastSyncAt: number | null;
  lastWebhookAt: number | null;
  lastWebhookEvent: string | null;
  lastConflictPath: string | null;
  lastError: string | null;
  version: string | null;
};

type PutInput = {
  path: string;
  data: Record<string, unknown>;
  expectedSha?: string;
};

type PutResult = {
  ok: boolean;
  sha: string;
  version: number;
  updatedAt: string;
};

type LiteraryInput = {
  text: string;
  focus: "language" | "grammar" | "parts_of_speech" | "lexicon" | "narrative" | "voice" | "style" | "full";
  genre?: string;
  subgenre?: string;
  audience?: string;
  role?: LiteraryRole;
  task?: LiteraryTask;
  bookId?: string;
  bookTitle?: string;
  sceneId?: string;
  sceneTitle?: string;
  planning?: unknown;
  story?: unknown;
  styleSample?: string;
};

type LiterarySuggestion = {
  category: string;
  severity: string;
  original: string;
  suggestion: string;
  explanation: string;
  confidence: number;
  start: number;
  end: number;
};

type LiteraryResult = {
  summary: string;
  strengths: string[];
  suggestions: LiterarySuggestion[];
  narrativeNotes: string[];
  model: string;
  availableModels: string[];
};

type CoauthorInput = {
  bookId: string;
  bookTitle: string;
  sceneId: string;
  sceneTitle: string;
  text: string;
  intent?: string;
  targetWords?: number;
  alternativeCount?: number;
  genre?: string;
  subgenre?: string;
  audience?: string;
  planning?: unknown;
  story?: unknown;
  styleSample?: string;
};

type CoauthorResult = {
  alternatives: CoauthorAlternative[];
  canonWarnings: string[];
  model: string;
  context: {
    canonFacts: number;
    memoryMessages: number;
    requestedWords: number;
  };
};

type CoauthorExpansionInput = {
  bookId: string;
  bookTitle: string;
  sceneId: string;
  sceneTitle: string;
  text: string;
  selectedAlternative: CoauthorAlternative;
  intent?: string;
  requestedWords?: number;
  genre?: string;
  subgenre?: string;
  audience?: string;
  planning?: unknown;
  story?: unknown;
  styleSample?: string;
};

type CoauthorExpansionResult = {
  text: string;
  canonWarnings: string[];
  model: string;
  context: {
    canonFacts: number;
    memoryMessages: number;
  };
};

type ContinuityInput = {
  bookId: string;
  bookTitle: string;
  sceneId: string;
  sceneTitle: string;
  text: string;
  genre?: string;
  subgenre?: string;
  planning?: unknown;
  story?: unknown;
};

type ContinuityResult = {
  report: string;
  canonWarnings: string[];
  model: string;
  context: {
    canonFacts: number;
    memoryMessages: number;
    bookCanonFacts: number;
    seriesCanonFacts: number;
    universeCanonFacts: number;
    planningEntities: number;
    storyEntities: number;
  };
};

type CoverInput = {
  filename: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
};

type SecuritySession = {
  id: number;
  tokenPrefix: string;
  projectBaseUrl: string;
  createdAt: string;
  status: "active" | "revoked";
  lastUsedAt?: string | null;
};

type User = {
  id: number;
  openId: string;
  name: string;
  email: string | null;
  role: "admin";
};

const json = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const code = response.status === 409 ? "CONFLICT" : String(payload.code ?? "");
    const message = String(payload.error ?? payload.message ?? `HTTP ${response.status}`);
    throw new CloudflareApiError(message, { code, status: response.status });
  }
  return payload as T;
};

const readDocument = async (path: string): Promise<DocumentResult> => {
  const result = await json<RawDocumentResult>(`/api/book?path=${encodeURIComponent(path)}`);
  return { ...result, sha: result.sha ?? undefined };
};

const writeDocument = async (input: PutInput): Promise<PutResult> =>
  json<PutResult>("/api/book", {
    method: "POST",
    body: JSON.stringify(input),
  });

const getStatus = async (): Promise<StatusResult> => {
  const health = await json<{ ok: boolean; db: boolean; version?: string }>("/health");
  const status: SyncStatus = health.ok && health.db ? "synced" : "error";
  return {
    mode: "cloudflare-d1" as const,
    versioned: true,
    status,
    lastSyncAt: Date.now(),
    lastWebhookAt: null,
    lastWebhookEvent: null,
    lastConflictPath: null,
    lastError: health.ok ? null : "Backend indisponível",
    version: health.version ?? null,
  };
};

const literaryPrompt: Record<LiteraryInput["focus"], string> = {
  language: "Revise linguagem, clareza, fluidez e escolhas de expressão.",
  grammar: "Revise gramática e concordância. Distinga erro objetivo de preferência editorial.",
  parts_of_speech: "Analise classes gramaticais e construções que merecem atenção.",
  lexicon: "Revise léxico, repetições, precisão vocabular e adequação ao tom.",
  narrative: "Analise narrativa, ritmo, tensão, continuidade e coerência.",
  voice: "Analise voz narrativa, ponto de vista e consistência da voz.",
  style: "Analise estilo, cadência, imagens e consistência estilística.",
  full: "Faça uma leitura editorial completa: linguagem, gramática, léxico, narrativa, voz, estilo e continuidade.",
};

const readOptionalDocument = async (path?: string): Promise<Record<string, unknown> | null> => {
  if (!path) return null;
  try {
    const result = await readDocument(path);
    return result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : null;
  } catch {
    return null;
  }
};

const factsFromDocument = (document: Record<string, unknown> | null): unknown[] =>
  Array.isArray(document?.facts) ? document.facts : [];

const historyFromDocument = (document: Record<string, unknown> | null): Array<{ role: "user" | "assistant"; content: string }> =>
  Array.isArray(document?.messages)
    ? document.messages
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map(item => ({
          role: item.role === "assistant" ? "assistant" as const : "user" as const,
          content: String(item.content ?? "").slice(0, 2000),
        }))
        .filter(item => item.content.trim())
        .slice(-12)
    : [];

const analyzeLiterary = async (input: LiteraryInput): Promise<LiteraryResult> => {
  const cowilaContext = buildCowilaLiteraryContext(input);
  const styleContext = buildStyleDnaPrompt(input.styleSample ?? input.text);
  const [canonDocument, memoryDocument] = await Promise.all([
    readOptionalDocument(input.bookId ? `canon/${input.bookId}.json` : undefined),
    readOptionalDocument(input.bookId ? `assistant/${input.bookId}.json` : undefined),
  ]);
  const result = await json<{
    proposal?: string;
    canonWarnings?: string[];
  }>("/api/assist", {
    method: "POST",
    body: JSON.stringify({
      action: "literary_review",
      prompt: `${cowilaContext} ${styleContext} ${literaryPrompt[input.focus]}`,
      literaryProfile: { genre: input.genre, subgenre: input.subgenre, audience: input.audience, role: input.role, task: input.task },
      book: { id: input.bookId ?? "writerstudio-cloudflare", title: input.bookTitle ?? "Manuscrito Shakstory" },
      scene: { id: input.sceneId ?? "active-excerpt", title: input.sceneTitle ?? "Trecho ativo", text: input.text },
      canon: factsFromDocument(canonDocument),
      planning: input.planning ?? { characters: [], locations: [], timeline: [] },
      story: input.story ?? { objectives: [], conflicts: [], relations: [], notes: [], scenes: [] },
      history: historyFromDocument(memoryDocument),
    }),
  });
  const warnings = Array.isArray(result.canonWarnings) ? result.canonWarnings : [];
  return {
    summary: result.proposal || "Análise concluída sem observações adicionais.",
    strengths: [],
    suggestions: [],
    narrativeNotes: warnings,
    model: "@cf/meta/llama-3.1-8b-instruct-fast",
    availableModels: ["@cf/meta/llama-3.1-8b-instruct-fast"],
  };
};

const generateCoauthorAlternatives = async (input: CoauthorInput): Promise<CoauthorResult> => {
  const targetWords = clampContinuationWords(input.targetWords ?? 180);
  const alternativeCount = clampAlternativeCount(input.alternativeCount ?? 3);
  const literaryContext = buildCowilaLiteraryContext({
    genre: input.genre,
    subgenre: input.subgenre,
    audience: input.audience,
    role: "coauthor",
    task: "continue_scene",
  });
  const styleContext = buildStyleDnaPrompt(input.styleSample ?? input.text);
  const [canonDocument, memoryDocument] = await Promise.all([
    readOptionalDocument(`canon/${input.bookId}.json`),
    readOptionalDocument(`assistant/${input.bookId}.json`),
  ]);
  const canon = factsFromDocument(canonDocument);
  const history = historyFromDocument(memoryDocument);
  const approaches = pickApproaches(alternativeCount);

  const alternatives = await Promise.all(approaches.map(async (approach, index) => {
    const prompt = buildContinuationPrompt({
      intent: input.intent,
      targetWords,
      approach,
      literaryContext: `${literaryContext} ${styleContext}`,
    });
    const result = await json<{
      proposal?: string;
      canonWarnings?: string[];
    }>("/api/assist", {
      method: "POST",
      body: JSON.stringify({
        action: "continue_scene",
        prompt,
        literaryProfile: {
          genre: input.genre,
          subgenre: input.subgenre,
          audience: input.audience,
          role: "coauthor",
          task: "continue_scene",
        },
        book: { id: input.bookId, title: input.bookTitle },
        scene: { id: input.sceneId, title: input.sceneTitle, text: input.text },
        canon,
        planning: input.planning ?? { characters: [], locations: [], timeline: [] },
        story: input.story ?? { objectives: [], conflicts: [], relations: [], notes: [], scenes: [] },
        history,
      }),
    });
    return {
      id: `${approach.id}-${index + 1}`,
      label: approach.label,
      approach: approach.instruction,
      text: String(result.proposal ?? "").trim(),
      warnings: Array.isArray(result.canonWarnings) ? result.canonWarnings : [],
    } satisfies CoauthorAlternative;
  }));

  const usable = alternatives.filter(item => item.text);
  if (!usable.length) throw new CloudflareApiError("A Cowila não retornou nenhuma continuação utilizável.", { code: "EMPTY_COAUTHOR_RESULT", status: 502 });
  return {
    alternatives: usable,
    canonWarnings: Array.from(new Set(usable.flatMap(item => item.warnings))),
    model: "@cf/meta/llama-3.1-8b-instruct-fast",
    context: {
      canonFacts: canon.length,
      memoryMessages: history.length,
      requestedWords: targetWords,
    },
  };
};

const expandSelectedCoauthorAlternative = async (input: CoauthorExpansionInput): Promise<CoauthorExpansionResult> => {
  const literaryContext = buildCowilaLiteraryContext({
    genre: input.genre,
    subgenre: input.subgenre,
    audience: input.audience,
    role: "coauthor",
    task: "continue_scene",
  });
  const styleContext = buildStyleDnaPrompt(input.styleSample ?? input.text);
  const [canonDocument, memoryDocument] = await Promise.all([
    readOptionalDocument(`canon/${input.bookId}.json`),
    readOptionalDocument(`assistant/${input.bookId}.json`),
  ]);
  const canon = factsFromDocument(canonDocument);
  const history = historyFromDocument(memoryDocument);
  const prompt = buildExpansionPrompt({
    selectedSample: input.selectedAlternative.text,
    intent: input.intent,
    genre: input.genre,
    subgenre: input.subgenre,
    literaryContext: `${literaryContext} ${styleContext}`,
    requestedWords: input.requestedWords,
  });

  const result = await json<{
    proposal?: string;
    canonWarnings?: string[];
  }>("/api/assist", {
    method: "POST",
    body: JSON.stringify({
      action: "continue_scene",
      prompt,
      literaryProfile: {
        genre: input.genre,
        subgenre: input.subgenre,
        audience: input.audience,
        role: "coauthor",
        task: "continue_scene",
        phase: "expand_selected_sample",
      },
      book: { id: input.bookId, title: input.bookTitle },
      scene: { id: input.sceneId, title: input.sceneTitle, text: input.text },
      canon,
      planning: input.planning ?? { characters: [], locations: [], timeline: [] },
      story: input.story ?? { objectives: [], conflicts: [], relations: [], notes: [], scenes: [] },
      history,
      selectedAlternative: input.selectedAlternative,
    }),
  });

  const text = String(result.proposal ?? "").trim();
  if (!text) {
    throw new CloudflareApiError("A Cowila não retornou a expansão da opção escolhida.", {
      code: "EMPTY_COAUTHOR_EXPANSION",
      status: 502,
    });
  }

  return {
    text,
    canonWarnings: Array.isArray(result.canonWarnings) ? result.canonWarnings : [],
    model: "@cf/meta/llama-3.1-8b-instruct-fast",
    context: {
      canonFacts: canon.length,
      memoryMessages: history.length,
    },
  };
};

const runContinuityCheck = async (input: ContinuityInput): Promise<ContinuityResult> => {
  const [canonDocument, memoryDocument] = await Promise.all([
    readOptionalDocument(`canon/${input.bookId}.json`),
    readOptionalDocument(`assistant/${input.bookId}.json`),
  ]);
  const canon = factsFromDocument(canonDocument);
  const history = historyFromDocument(memoryDocument);
  const prompt = [
    buildCowilaLiteraryContext({
      genre: input.genre,
      subgenre: input.subgenre,
      role: "continuity_editor",
      task: "continuity_check",
    }),
    buildContinuityPrompt({ sceneTitle: input.sceneTitle }),
  ].join("\n\n");

  const result = await json<{
    proposal?: string;
    canonWarnings?: string[];
    context?: {
      canonFacts?: number;
      bookCanonFacts?: number;
      seriesCanonFacts?: number;
      universeCanonFacts?: number;
      planningEntities?: number;
      storyEntities?: number;
      historyMessages?: number;
    };
  }>("/api/assist", {
    method: "POST",
    body: JSON.stringify({
      action: "continuity_check",
      prompt,
      literaryProfile: {
        genre: input.genre,
        subgenre: input.subgenre,
        role: "continuity_editor",
        task: "continuity_check",
      },
      book: { id: input.bookId, title: input.bookTitle },
      scene: { id: input.sceneId, title: input.sceneTitle, text: input.text },
      canon,
      planning: input.planning ?? { characters: [], locations: [], timeline: [] },
      story: input.story ?? { objectives: [], conflicts: [], relations: [], notes: [], scenes: [] },
      history,
    }),
  });

  const context = result.context ?? {};
  return {
    report: String(result.proposal ?? "").trim() || "Nenhum conflito de continuidade foi relatado.",
    canonWarnings: Array.isArray(result.canonWarnings) ? result.canonWarnings : [],
    model: "@cf/meta/llama-3.1-8b-instruct-fast",
    context: {
      canonFacts: Number(context.canonFacts ?? canon.length),
      memoryMessages: Number(context.historyMessages ?? history.length),
      bookCanonFacts: Number(context.bookCanonFacts ?? canon.length),
      seriesCanonFacts: Number(context.seriesCanonFacts ?? 0),
      universeCanonFacts: Number(context.universeCanonFacts ?? 0),
      planningEntities: Number(context.planningEntities ?? 0),
      storyEntities: Number(context.storyEntities ?? 0),
    },
  };
};

const modelResult = {
  models: [{ id: "@cf/meta/llama-3.1-8b-instruct-fast" }],
};

export const trpc = {
  data: {
    get: {
      useQuery(input: { path: string }, options?: QueryOptions) {
        return useQuery({
          queryKey: ["data", "get", input.path],
          queryFn: () => readDocument(input.path),
          enabled: options?.enabled ?? true,
          refetchInterval: options?.refetchInterval,
          retry: options?.retry,
          refetchOnWindowFocus: options?.refetchOnWindowFocus,
        });
      },
    },
    status: {
      useQuery(_input?: undefined, options?: QueryOptions) {
        return useQuery({
          queryKey: ["data", "status"],
          queryFn: getStatus,
          enabled: options?.enabled ?? true,
          refetchInterval: options?.refetchInterval,
          retry: options?.retry,
          refetchOnWindowFocus: options?.refetchOnWindowFocus,
        });
      },
    },
    put: {
      useMutation(options?: {
        onSuccess?: (data: PutResult) => void;
        onError?: (error: CloudflareApiError) => void;
      }) {
        return useMutation<PutResult, CloudflareApiError, PutInput>({
          mutationFn: writeDocument,
          onSuccess: options?.onSuccess,
          onError: options?.onError,
        });
      },
    },
  },
  literaryAssist: {
    models: {
      useQuery(_input?: undefined, options?: QueryOptions) {
        return useQuery({
          queryKey: ["literaryAssist", "models"],
          queryFn: async () => modelResult,
          enabled: options?.enabled ?? true,
          retry: options?.retry,
          refetchOnWindowFocus: options?.refetchOnWindowFocus,
        });
      },
    },
    analyze: {
      useMutation(options?: {
        onSuccess?: (data: LiteraryResult) => void;
        onError?: (error: CloudflareApiError) => void;
      }) {
        return useMutation<LiteraryResult, CloudflareApiError, LiteraryInput>({
          mutationFn: analyzeLiterary,
          onSuccess: options?.onSuccess,
          onError: options?.onError,
        });
      },
    },
    coauthor: {
      useMutation(options?: {
        onSuccess?: (data: CoauthorResult) => void;
        onError?: (error: CloudflareApiError) => void;
      }) {
        return useMutation<CoauthorResult, CloudflareApiError, CoauthorInput>({
          mutationFn: generateCoauthorAlternatives,
          onSuccess: options?.onSuccess,
          onError: options?.onError,
        });
      },
    },
    expandCoauthor: {
      useMutation(options?: {
        onSuccess?: (data: CoauthorExpansionResult) => void;
        onError?: (error: CloudflareApiError) => void;
      }) {
        return useMutation<CoauthorExpansionResult, CloudflareApiError, CoauthorExpansionInput>({
          mutationFn: expandSelectedCoauthorAlternative,
          onSuccess: options?.onSuccess,
          onError: options?.onError,
        });
      },
    },
    continuity: {
      useMutation(options?: {
        onSuccess?: (data: ContinuityResult) => void;
        onError?: (error: CloudflareApiError) => void;
      }) {
        return useMutation<ContinuityResult, CloudflareApiError, ContinuityInput>({
          mutationFn: runContinuityCheck,
          onSuccess: options?.onSuccess,
          onError: options?.onError,
        });
      },
    },
  },
  assets: {
    uploadCover: {
      useMutation(options?: {
        onSuccess?: (data: { url: string }) => void;
        onError?: (error: CloudflareApiError) => void;
      }) {
        return useMutation<{ url: string }, CloudflareApiError, CoverInput>({
          mutationFn: async () => {
            throw new CloudflareApiError(
              "Upload direto de capa aguarda a ativação do R2. Use uma URL HTTPS própria por enquanto.",
              { code: "R2_NOT_CONFIGURED", status: 503 },
            );
          },
          onSuccess: options?.onSuccess,
          onError: options?.onError,
        });
      },
    },
  },
  security: {
    antivirus: {
      sessions: {
        useQuery(_input?: undefined, options?: QueryOptions) {
          return useQuery<SecuritySession[]>({
            queryKey: ["security", "antivirus", "sessions"],
            queryFn: async () => [],
            enabled: options?.enabled ?? true,
          });
        },
      },
      rotate: {
        useMutation(options?: { onSuccess?: (data: { rotated: boolean }) => void }) {
          return useMutation<{ rotated: boolean }, CloudflareApiError, void>({
            mutationFn: async () => ({ rotated: false }),
            onSuccess: options?.onSuccess,
          });
        },
      },
      revoke: {
        useMutation(options?: { onSuccess?: (data: { revoked: boolean }) => void }) {
          return useMutation<{ revoked: boolean }, CloudflareApiError, { id: number }>({
            mutationFn: async () => ({ revoked: false }),
            onSuccess: options?.onSuccess,
          });
        },
      },
    },
  },
  auth: {
    me: {
      useQuery(_input?: undefined, options?: QueryOptions) {
        return useQuery<User>({
          queryKey: ["auth", "me"],
          queryFn: async () => ({
            id: 1,
            openId: "cloudflare-pilot",
            name: "Autor Shakstory",
            email: null,
            role: "admin",
          }),
          enabled: options?.enabled ?? true,
          retry: options?.retry,
          refetchOnWindowFocus: options?.refetchOnWindowFocus,
        });
      },
    },
    logout: {
      useMutation(options?: { onSuccess?: (data: { success: true }) => void }) {
        return useMutation<{ success: true }, CloudflareApiError, void>({
          mutationFn: async () => ({ success: true }),
          onSuccess: options?.onSuccess,
        });
      },
    },
  },
  useUtils() {
    const queryClient = useQueryClient();
    return {
      data: {
        status: {
          invalidate: () => queryClient.invalidateQueries({ queryKey: ["data", "status"] }),
        },
      },
      auth: {
        me: {
          setData: (_input: undefined, value: User | null) =>
            queryClient.setQueryData(["auth", "me"], value),
          invalidate: () => queryClient.invalidateQueries({ queryKey: ["auth", "me"] }),
        },
      },
      security: {
        antivirus: {
          sessions: {
            invalidate: () => queryClient.invalidateQueries({ queryKey: ["security", "antivirus", "sessions"] }),
          },
        },
      },
    };
  },
};
