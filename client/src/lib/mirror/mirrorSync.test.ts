import { describe, expect, it } from "vitest";
import { MemoryKV } from "../sync/kv";
import type { LibraryLike } from "../sync/merge";
import { syncWithMirror, type MirrorIO } from "./mirrorSync";

const node = (id: string, content: string) => ({ id, title: id, kind: "chapter", content, updatedAt: 1 });
const lib = (...contents: string[]): LibraryLike => ({ books: [{ id: "b", updatedAt: contents.length, nodes: contents.map((c, i) => node("n" + i, c)) }] });

function fakeMirror(initial: LibraryLike | null) {
  const state = { doc: initial, stamp: initial ? 100 : (null as number | null), pushes: 0, pulls: 0 };
  const io: MirrorIO = {
    async stamp() { return state.stamp; },
    async pull() { state.pulls++; return state.doc; },
    async push(doc) {
      if (state.doc && JSON.stringify(state.doc) === JSON.stringify(doc)) return null;
      state.doc = doc; state.stamp = (state.stamp ?? 100) + 1; state.pushes++; return state.stamp;
    },
  };
  return { state, io };
}

describe("sincronização nos dois sentidos com o espelho", () => {
  it("primeiro envio com espelho vazio grava a biblioteca local", async () => {
    const { state, io } = fakeMirror(null);
    const result = await syncWithMirror(new MemoryKV(), io, lib("a"));
    expect(state.doc).toEqual(lib("a"));
    expect(result.changedLocal).toBe(false);
  });

  it("aparelho novo e vazio recebe a biblioteca do espelho", async () => {
    const { io } = fakeMirror(lib("a", "b"));
    const result = await syncWithMirror(new MemoryKV(), io, { books: [] });
    expect(result.changedLocal).toBe(true);
    expect(result.doc).toEqual(lib("a", "b"));
  });

  it("não relê o espelho inteiro quando o carimbo não mudou", async () => {
    const kv = new MemoryKV();
    const { state, io } = fakeMirror(lib("a"));
    await syncWithMirror(kv, io, lib("a"));
    const pullsAfterFirst = state.pulls;
    await syncWithMirror(kv, io, lib("a"));
    expect(state.pulls).toBe(pullsAfterFirst);
  });

  it("mescla edição do outro endereço com edição local e devolve o resultado", async () => {
    const kv = new MemoryKV();
    const { state, io } = fakeMirror(lib("a", "b"));
    await syncWithMirror(kv, io, lib("a", "b"));
    state.doc = lib("a", "b REMOTO"); state.stamp = 500; // outro endereço gravou
    const result = await syncWithMirror(kv, io, lib("a LOCAL", "b"));
    expect(result.changedLocal).toBe(true);
    expect(result.doc.books[0].nodes.map(n => n.content)).toEqual(["a LOCAL", "b REMOTO"]);
    expect((state.doc as LibraryLike).books[0].nodes.map(n => n.content)).toEqual(["a LOCAL", "b REMOTO"]);
  });
});
