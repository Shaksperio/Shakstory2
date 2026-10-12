import { describe, expect, it } from "vitest";
import { assembleMirror, changedDocs, planMirror, removedPaths, splitChunks } from "./plan";
import type { LibraryLike } from "../sync/merge";

const node = (id: string, content: string) => ({ id, title: "T " + id, kind: "chapter", content, updatedAt: 1 });
const library = (content: string): LibraryLike => ({ versionId: "v1", books: [{ id: "b1", title: "Livro", updatedAt: 5, planning: { x: 1 }, nodes: [node("n1", content), node("n2", "dois")] }] });

describe("espelho do Firestore", () => {
  it("ida e volta preserva a biblioteca inteira", async () => {
    const original = library("Olá, Élia — “texto” com acentuação.");
    const docs = await planMirror("workspaces/main", original);
    const raw = docs.map(doc => ({ path: doc.path, data: doc.data }));
    expect(assembleMirror("workspaces/main", raw)).toEqual(original);
  });

  it("capítulo grande é dividido em pedaços e remontado", async () => {
    const big = "a".repeat(700000) + "ç".repeat(10);
    const original = library(big);
    const docs = await planMirror("workspaces/main", original);
    const parts = docs.filter(doc => doc.path.indexOf("/nodes/n1_") !== -1);
    expect(parts.length).toBe(3);
    parts.forEach(part => expect(String(part.data.data).length <= 300000).toBe(true));
    expect(assembleMirror("workspaces/main", docs.map(doc => ({ path: doc.path, data: doc.data })))).toEqual(original);
  });

  it("espelho incompleto não é aceito", async () => {
    const docs = await planMirror("workspaces/main", library("x"));
    const raw = docs.filter(doc => doc.path.indexOf("/nodes/n2_") === -1).map(doc => ({ path: doc.path, data: doc.data }));
    expect(assembleMirror("workspaces/main", raw)).toBeNull();
  });

  it("só envia o que mudou e detecta capítulos removidos", async () => {
    const first = await planMirror("workspaces/main", library("um"));
    const previous: Record<string, string> = {};
    first.forEach(doc => { previous[doc.path] = doc.hash; });
    const second = await planMirror("workspaces/main", { ...library("um EDITADO"), books: [{ ...library("x").books[0], nodes: [node("n1", "um EDITADO")] }] });
    const changed = changedDocs(second, previous).map(doc => doc.path);
    expect(changed.some(path => path.indexOf("/nodes/n1_0") !== -1)).toBe(true);
    expect(removedPaths(second, previous).some(path => path.indexOf("/nodes/n2_0") !== -1)).toBe(true);
  });

  it("splitChunks respeita o tamanho", () => {
    expect(splitChunks("abcdef", 4)).toEqual(["abcd", "ef"]);
  });
});
