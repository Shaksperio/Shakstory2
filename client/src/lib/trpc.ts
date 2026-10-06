import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
  lastSyncAt: number;
  lastWebhookAt: number | null;
  lastWebhookEvent: string | null;
  lastConflictPath: string | null;
  lastError: string | null;
  version: string | null;
};

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

const analyzeLiterary = async (input: LiteraryInput): Promise<LiteraryResult> => {
  const result = await json<{
    proposal?: string;
    canonWarnings?: string[];
  }>("/api/assist", {
    method: "POST",
    body: JSON.stringify({
      action: "literary_review",
      prompt: literaryPrompt[input.focus],
      book: { id: "writerstudio-cloudflare", title: "Manuscrito Shakstory" },
      scene: { id: "active-excerpt", title: "Trecho ativo", text: input.text },
      canon: [],
      planning: { characters: [], locations: [], timeline: [] },
      story: { objectives: [], conflicts: [], relations: [], notes: [], scenes: [] },
      history: [],
    }),
  });
  const warnings = Array.isArray(result.canonWarnings) ? result.canonWarnings : [];
  return {
    summary: result.proposal || "Análise concluída sem observações adicionais.",
    strengths: [],
    suggestions: [],
    narrativeNotes: warnings,
    model: "@cf/zai-org/glm-4.7-flash",
    availableModels: ["@cf/zai-org/glm-4.7-flash"],
  };
};

const modelResult = {
  models: [{ id: "@cf/zai-org/glm-4.7-flash" }],
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
