type OmniMessage = { role: "system" | "user" | "assistant"; content: string };
type OmniRequest = { model?: string; messages: OmniMessage[]; response_format?: unknown; maxTokens?: number };

type OmniResponse = {
  model?: string;
  choices?: Array<{ message?: { content?: string | Array<{ type: string; text?: string }> } }>;
};

const getBaseUrl = () => {
  const raw = (process.env.OMNIROUTE_BASE_URL ?? "").trim().replace(/\/$/, "");
  if (!raw) return "";
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error("OMNIROUTE_BASE_URL precisa ser uma URL válida."); }
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") throw new Error("OMNIROUTE_BASE_URL deve usar HTTPS em produção.");
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("OMNIROUTE_BASE_URL deve usar http ou https.");
  return raw;
};
export const isOmniRouteConfigured = () => Boolean(getBaseUrl());

const headers = () => ({
  "content-type": "application/json",
  ...(process.env.OMNIROUTE_API_KEY ? { authorization: `Bearer ${process.env.OMNIROUTE_API_KEY}` } : {}),
});

async function request(path: string, init?: RequestInit) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error("OmniRoute não está configurado.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { ...headers(), ...(init?.headers ?? {}) }, signal: controller.signal });
    if (!response.ok) throw new Error(`OmniRoute respondeu HTTP ${response.status}.`);
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("OmniRoute excedeu o tempo limite.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (typeof response.text !== "function") return response.json() as Promise<T>;
  const bodyText = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  if (bodyText.trimStart().startsWith("<") || !contentType.toLowerCase().includes("json")) throw new Error("OmniRoute retornou HTML ou uma resposta não-JSON; verifique a URL pública do gateway.");
  try { return JSON.parse(bodyText) as T; } catch { throw new Error("OmniRoute retornou JSON inválido."); }
}

export async function listOmniRouteModels() {
  const response = await request("/models");
  const body = await readJson<{ data?: Array<{ id?: string }> }>(response);
  return { data: (body.data ?? []).filter((model): model is { id: string } => typeof model.id === "string" && model.id.length > 0) };
}

export async function invokeOmniRouteLLM(input: OmniRequest): Promise<{ model: string; choices: NonNullable<OmniResponse["choices"]> }> {
  const response = await request("/chat/completions", {
    method: "POST",
    body: JSON.stringify({ model: input.model ?? "auto", messages: input.messages, response_format: input.response_format, max_tokens: input.maxTokens }),
  });
  const body = await readJson<OmniResponse>(response);
  if (!body.choices?.[0]?.message?.content) throw new Error("OmniRoute retornou uma resposta sem conteúdo.");
  return { model: body.model ?? input.model ?? "auto", choices: body.choices };
}
