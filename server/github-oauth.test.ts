import { describe, expect, it, vi } from "vitest";
import { parse } from "cookie";
import { registerGitHubOAuthRoutes } from "./github-oauth";

type Handler = (request: any, response: any) => unknown;

function captureRoutes() {
  const routes = new Map<string, Handler>();
  const app = { get: (path: string, handler: Handler) => routes.set(path, handler) } as any;
  registerGitHubOAuthRoutes(app);
  return routes;
}

function responseDouble() {
  const headers: string[] = [];
  return {
    headers,
    statusCode: 200,
    append: (_name: string, value: string) => headers.push(value),
    redirect: vi.fn(),
    status(code: number) { this.statusCode = code; return this; },
    send: vi.fn(),
    json: vi.fn(),
  };
}

describe("GitHub OAuth callback", () => {
  it("valida state/PKCE, troca o code e cria sessão sem expor o token", async () => {
    const routes = captureRoutes();
    const startResponse = responseDouble();
    await routes.get("/api/github/oauth/start")?.({ query: {}, headers: {} }, startResponse);
    expect(startResponse.redirect).toHaveBeenCalledTimes(1);
    const oauthCookie = parse(startResponse.headers[0] ?? "").shakstory_github_oauth;
    expect(oauthCookie).toBeTruthy();
    const state = JSON.parse(decodeURIComponent(oauthCookie ?? "")).state as string;

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token-never-printed" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 123, login: "author-example" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const callbackResponse = responseDouble();
    await routes.get("/api/github/oauth/callback")?.({
      query: { state, code: "valid-test-code" },
      headers: { cookie: startResponse.headers[0] },
    }, callbackResponse);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(callbackResponse.redirect).toHaveBeenCalledWith("/?github=connected&login=author-example");
    expect(callbackResponse.headers.join("\n")).toContain("shakstory_github_session=");
    expect(callbackResponse.headers.join("\n")).not.toContain("token-never-printed");
    vi.unstubAllGlobals();
  });
});
