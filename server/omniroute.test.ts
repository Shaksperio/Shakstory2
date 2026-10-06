import { afterEach, describe, expect, it, vi } from "vitest";
import { invokeOmniRouteLLM, isOmniRouteConfigured, listOmniRouteModels } from "./omniroute";

describe("OmniRoute adapter", () => {
  const previousBase = process.env.OMNIROUTE_BASE_URL;
  const previousKey = process.env.OMNIROUTE_API_KEY;
  const previousNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (previousBase === undefined) delete process.env.OMNIROUTE_BASE_URL; else process.env.OMNIROUTE_BASE_URL = previousBase;
    if (previousKey === undefined) delete process.env.OMNIROUTE_API_KEY; else process.env.OMNIROUTE_API_KEY = previousKey;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    vi.unstubAllGlobals();
  });

  it("reads models and sends authenticated chat completions", async () => {
    process.env.OMNIROUTE_BASE_URL = "https://omni.example/v1/";
    process.env.OMNIROUTE_API_KEY = "test-key";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: "auto" }, { id: "writer-model" }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ model: "writer-model", choices: [{ message: { content: "{\"summary\":\"ok\"}" } }] }) });
    vi.stubGlobal("fetch", fetchMock);

    expect(isOmniRouteConfigured()).toBe(true);
    await expect(listOmniRouteModels()).resolves.toEqual({ data: [{ id: "auto" }, { id: "writer-model" }] });
    await expect(invokeOmniRouteLLM({ model: "writer-model", messages: [{ role: "user", content: "texto" }] })).resolves.toMatchObject({ model: "writer-model" });
    expect(fetchMock.mock.calls[1][0]).toBe("https://omni.example/v1/chat/completions");
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).toMatchObject({ authorization: "Bearer test-key" });
  });

  it("diagnoses an HTML response instead of leaking a JSON parse error", async () => {
    process.env.OMNIROUTE_BASE_URL = "https://omni.example/v1";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ "content-type": "text/html" }), text: async () => "<!DOCTYPE html><html>gateway</html>" }));
    await expect(listOmniRouteModels()).rejects.toThrow("HTML ou uma resposta não-JSON");
  });

  it("rejects an insecure endpoint in production", () => {
    process.env.NODE_ENV = "production";
    process.env.OMNIROUTE_BASE_URL = "http://localhost:20128/v1";
    expect(() => isOmniRouteConfigured()).toThrow("deve usar HTTPS em produção");
  });
});
