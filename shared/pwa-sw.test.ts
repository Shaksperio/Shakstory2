import { describe, expect, it } from "vitest";
import { buildServiceWorker, precacheFromFiles, versionFor } from "./pwa-sw";

type Handler = (event: any) => void;
type FakeResponse = { ok: boolean; status: number; type: string; redirected: boolean; body: string; clone(): FakeResponse };
const response = (body: string, extra: Partial<FakeResponse> = {}): FakeResponse => ({ ok: true, status: 200, type: "basic", redirected: false, body, clone() { return this; }, ...extra });

function boot(options: { network: (url: string) => FakeResponse | Promise<FakeResponse> }) {
  const code = buildServiceWorker({ version: "v1", precache: ["", "assets/app.js", "manifest.webmanifest"] });
  const handlers: Record<string, Handler> = {};
  const stores = new Map<string, Map<string, FakeResponse>>();
  const keyOf = (input: unknown) => (typeof input === "string" ? input : (input as { url: string }).url);
  const caches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return { put: async (key: unknown, value: FakeResponse) => { store.set(keyOf(key), value); }, match: async (key: unknown) => store.get(keyOf(key)) };
    },
    match: async (key: unknown) => { let found: FakeResponse | undefined; stores.forEach(store => { if (!found && store.has(keyOf(key))) found = store.get(keyOf(key)); }); return found; },
    keys: async () => Array.from(stores.keys()),
    delete: async (name: string) => stores.delete(name),
  };
  let claimed = false;
  const self = { registration: { scope: "https://app.test/" }, addEventListener: (name: string, handler: Handler) => { handlers[name] = handler; }, clients: { claim: async () => { claimed = true; } }, skipWaiting: () => undefined };
  const fetchCalls: string[] = [];
  const fakeFetch = async (input: unknown) => { const url = keyOf(input); fetchCalls.push(url); return options.network(url); };
  new Function("self", "caches", "fetch", "URL", "setTimeout", "clearTimeout", code)(self, caches, fakeFetch, URL, setTimeout, clearTimeout);
  const run = async (name: string, event: Record<string, unknown>) => { let waiting: Promise<unknown> | undefined; await handlers[name]({ ...event, waitUntil: (value: Promise<unknown>) => { waiting = value; } }); await waiting; };
  const fetchEvent = (url: string, extra: Record<string, unknown> = {}) => { let result: Promise<FakeResponse> | undefined; const event = { request: { url, method: "GET", mode: "cors", ...extra }, respondWith: (value: Promise<FakeResponse>) => { result = value; } }; handlers.fetch(event); return result; };
  return { run, fetchEvent, stores, fetchCalls, claimed: () => claimed };
}

describe("service worker do Shakstory", () => {
  it("pré-carrega o app e remove versões antigas ao ativar", async () => {
    const sw = boot({ network: url => response("conteúdo de " + url) });
    sw.stores.set("shakstory-shell-velho", new Map());
    await sw.run("install", {});
    expect(Array.from(sw.stores.get("shakstory-shell-v1")!.keys())).toEqual(["https://app.test/", "https://app.test/assets/app.js", "https://app.test/manifest.webmanifest"]);
    await sw.run("activate", {});
    expect(sw.stores.has("shakstory-shell-velho")).toBe(false);
    expect(sw.claimed()).toBe(true);
  });

  it("não instala quando o servidor responde com redirecionamento (login do Access)", async () => {
    const sw = boot({ network: () => response("login", { type: "opaqueredirect", ok: false, status: 0 }) });
    await expect(sw.run("install", {})).rejects.toThrow();
  });

  it("nunca intercepta a API, o Access nem requisições que não são GET", async () => {
    const sw = boot({ network: url => response(url) });
    await sw.run("install", {});
    expect(sw.fetchEvent("https://app.test/api/book?path=library.json")).toBeUndefined();
    expect(sw.fetchEvent("https://app.test/cdn-cgi/access/get-identity")).toBeUndefined();
    expect(sw.fetchEvent("https://app.test/health")).toBeUndefined();
    let intercepted = false;
    const handlers = sw.fetchEvent("https://app.test/assets/app.js", { method: "POST" });
    intercepted = handlers !== undefined;
    expect(intercepted).toBe(false);
  });

  it("abre offline: navegação cai no app em cache e os assets saem do cache", async () => {
    let online = true;
    const sw = boot({ network: url => { if (!online) throw new Error("offline"); return response("rede " + url); } });
    await sw.run("install", {});
    online = false;
    const page = await sw.fetchEvent("https://app.test/ler/abc", { mode: "navigate" })!;
    expect(page.body).toBe("rede https://app.test/");
    const asset = await sw.fetchEvent("https://app.test/assets/app.js")!;
    expect(asset.body).toBe("rede https://app.test/assets/app.js");
  });

  it("serve o app em cache quando o servidor responde 5xx", async () => {
    let broken = false;
    const sw = boot({ network: url => (broken ? response("falha", { ok: false, status: 502 }) : response("rede " + url)) });
    await sw.run("install", {});
    broken = true;
    const page = await sw.fetchEvent("https://app.test/", { mode: "navigate" })!;
    expect(page.body).toBe("rede https://app.test/");
  });

  it("guarda as fontes do Google para uso offline", async () => {
    let online = true;
    const sw = boot({ network: url => { if (!online) throw new Error("offline"); return response("fonte " + url); } });
    await sw.run("install", {});
    const first = await sw.fetchEvent("https://fonts.gstatic.com/s/inter.woff2")!;
    expect(first.body).toBe("fonte https://fonts.gstatic.com/s/inter.woff2");
    online = false;
    const second = await sw.fetchEvent("https://fonts.gstatic.com/s/inter.woff2")!;
    expect(second.body).toBe("fonte https://fonts.gstatic.com/s/inter.woff2");
  });
});

describe("pré-cache do build", () => {
  it("escolhe os arquivos do app e ignora mapas, o próprio sw e o index", () => {
    const list = precacheFromFiles(["index.html", "sw.js", "assets/a-1.js", "assets/a-1.js.map", "assets/b-2.css", "manifest.webmanifest", "icons\\icon-192.png", "__manus__/x.js", "leia-me.txt"]);
    expect(list).toEqual(["", "assets/a-1.js", "assets/b-2.css", "icons/icon-192.png", "manifest.webmanifest"]);
  });
  it("a versão muda quando a lista muda", () => {
    expect(versionFor(["", "a.js"])).toBe(versionFor(["", "a.js"]));
    expect(versionFor(["", "a.js"])).not.toBe(versionFor(["", "b.js"]));
  });
});
