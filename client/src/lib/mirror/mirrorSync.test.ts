import { describe, expect, it, vi } from "vitest";
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
  it("bloqueia a troca de identidade antes de acessar o espelho remoto", async () => {
    const kv = new MemoryKV();
    const first = fakeMirror(null);
    first.io.scope = "mirrors/alice@example.com:uid-alice";
    await syncWithMirror(kv, first.io, lib("privado"));
    const other = fakeMirror(null);
    other.io.scope = "mirrors/bob@example.com:uid-bob";
    const remoteWrite = vi.spyOn(other.io, "push");
    await expect(syncWithMirror(kv, other.io, lib("privado"))).rejects.toThrow("SYNC_ACCOUNT_CHANGED");
    expect(other.state.pulls).toBe(0);
    expect(remoteWrite).not.toHaveBeenCalled();
  });

  it("não registra base nem confirmação após falha de rede", async () => {
    const kv = new MemoryKV();
    const mirror = fakeMirror(null);
    mirror.io.scope = "mirrors/alice@example.com:uid-alice";
    mirror.io.push = async () => { throw new Error("network unavailable"); };
    await expect(syncWithMirror(kv, mirror.io, lib("rascunho"))).rejects.toThrow("network unavailable");
    expect(await kv.keys("bases")).toEqual([]);
    expect(await kv.keys("meta")).toEqual([]);
  });

  it("registra confirmação somente depois de uma gravação remota bem-sucedida", async () => {
    const kv = new MemoryKV();
    const mirror = fakeMirror(null);
    mirror.io.scope = "mirrors/alice@example.com:uid-alice";
    const result = await syncWithMirror(kv, mirror.io, lib("ok"));
    expect(result.stamp).not.toBeNull();
    expect(await kv.get("meta", "mirror-seen:" + encodeURIComponent(mirror.io.scope))).toBe(result.stamp);
  });

  it("retoma após indisponibilidade do Firebase sem perder o manuscrito local", async () => {
    const kv = new MemoryKV();
    const mirror = fakeMirror(null);
    mirror.io.scope = "mirrors/alice@example.com:uid-alice";
    const push = mirror.io.push;
    mirror.io.push = async () => { throw new Error("offline"); };
    await expect(syncWithMirror(kv, mirror.io, lib("rascunho offline"))).rejects.toThrow("offline");
    mirror.io.push = push;
    const recovered = await syncWithMirror(kv, mirror.io, lib("rascunho offline"));
    expect(recovered.doc).toEqual(lib("rascunho offline"));
    expect(mirror.state.doc).toEqual(lib("rascunho offline"));
    expect(await kv.get("meta", "mirror-active-scope")).toBe(mirror.io.scope);
  });

  it("mantém o bloqueio de conta mesmo após falha e reconexão", async () => {
    const kv = new MemoryKV();
    const first = fakeMirror(null);
    first.io.scope = "mirrors/alice@example.com:uid-alice";
    await syncWithMirror(kv, first.io, lib("conteúdo da Alice"));
    const second = fakeMirror(null);
    second.io.scope = "mirrors/bob@example.com:uid-bob";
    await expect(syncWithMirror(kv, second.io, lib("conteúdo da Alice"))).rejects.toThrow("SYNC_ACCOUNT_CHANGED");
    expect(second.state.doc).toBeNull();
    expect(await kv.get("meta", "mirror-active-scope")).toBe(first.io.scope);
  });

});
