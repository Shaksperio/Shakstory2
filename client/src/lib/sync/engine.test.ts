import { describe, expect, it } from "vitest";
import { MemoryKV } from "./kv";
import { syncLibrary, type Transport } from "./engine";
import type { LibraryLike } from "./merge";

const node = (id: string, content: string) => ({ id, title: id, kind: "chapter", content, updatedAt: 1 });
const lib = (...contents: string[]): LibraryLike => ({ books: [{ id: "b", updatedAt: contents.length, nodes: contents.map((c, i) => node("n" + i, c)) }] });

function fakeServer(initial: LibraryLike | null) {
  const state = { doc: initial as Record<string, unknown> | null, sha: initial ? "s1" : undefined as string | undefined, writes: 0, interfere: undefined as undefined | (() => void) };
  const transport: Transport = {
    async read() { return { data: state.doc, sha: state.sha }; },
    async write({ data, expectedSha }) {
      if (state.interfere) { const run = state.interfere; state.interfere = undefined; run(); }
      if (state.sha !== expectedSha) throw Object.assign(new Error("conflito"), { data: { code: "CONFLICT" } });
      state.doc = data; state.sha = "s" + (++state.writes + 1); return { sha: state.sha };
    },
  };
  return { state, transport };
}

describe("motor de sincronização", () => {
  it("primeira sincronização grava o documento local quando o servidor está vazio", async () => {
    const { state, transport } = fakeServer(null);
    const result = await syncLibrary({ kv: new MemoryKV(), transport, local: lib("a") });
    expect(result.wrote).toBe(true);
    expect(state.doc).toEqual(lib("a"));
  });

  it("não escreve quando local e remoto já são iguais", async () => {
    const { state, transport } = fakeServer(lib("a"));
    const result = await syncLibrary({ kv: new MemoryKV(), transport, local: lib("a") });
    expect(result.wrote).toBe(false);
    expect(state.writes).toBe(0);
  });

  it("mescla edição feita offline com edição de outro aparelho e grava", async () => {
    const kv = new MemoryKV();
    const { state, transport } = fakeServer(lib("a", "b"));
    await syncLibrary({ kv, transport, local: lib("a", "b") });
    state.doc = lib("a", "b REMOTO"); state.sha = "s9";
    const result = await syncLibrary({ kv, transport, local: lib("a LOCAL", "b") });
    const contents = (state.doc as unknown as LibraryLike).books[0].nodes.map(n => n.content);
    expect(contents).toEqual(["a LOCAL", "b REMOTO"]);
    expect(result.wrote).toBe(true);
  });

  it("repete a mesclagem quando o servidor muda entre a leitura e a escrita", async () => {
    const kv = new MemoryKV();
    const { state, transport } = fakeServer(lib("a", "b"));
    await syncLibrary({ kv, transport, local: lib("a", "b") });
    state.interfere = () => { state.doc = lib("a", "b", "c REMOTO"); state.sha = "s7"; };
    const result = await syncLibrary({ kv, transport, local: lib("a LOCAL", "b") });
    const contents = (state.doc as unknown as LibraryLike).books[0].nodes.map(n => n.content);
    expect(contents).toEqual(["a LOCAL", "b", "c REMOTO"]);
    expect(result.wrote).toBe(true);
  });

  it("erros que não são conflito sobem para o chamador (ficamos offline)", async () => {
    const transport: Transport = { async read() { throw new Error("rede"); }, async write() { throw new Error("rede"); } };
    await expect(syncLibrary({ kv: new MemoryKV(), transport, local: lib("a") })).rejects.toThrow("rede");
  });
});
