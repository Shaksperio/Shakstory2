import { describe, expect, it } from "vitest";
import { mergeLibraries, type BookLike, type LibraryLike, type NodeLike } from "./merge";

const node = (id: string, content: string, extra: Partial<NodeLike> = {}): NodeLike => ({ id, title: "Capítulo " + id, kind: "chapter", content, updatedAt: 1, ...extra });
const book = (id: string, nodes: NodeLike[], extra: Record<string, unknown> = {}): BookLike => ({ id, title: "Livro " + id, updatedAt: 1, nodes, ...extra });
const lib = (...books: BookLike[]): LibraryLike => ({ version: 1, books });
const opts = { now: 1000, makeId: (prefix: string) => prefix + "-copia" };

describe("mesclagem da biblioteca em três vias", () => {
  const base = lib(book("b1", [node("a", "um"), node("b", "dois"), node("c", "três")]));

  it("junta edições em capítulos diferentes sem perder nada", () => {
    const local = lib(book("b1", [node("a", "um EDITADO"), node("b", "dois"), node("c", "três")], { updatedAt: 5 }));
    const remote = lib(book("b1", [node("a", "um"), node("b", "dois"), node("c", "três EDITADO")], { updatedAt: 6 }));
    const { doc, report } = mergeLibraries(base, local, remote, opts);
    expect(doc.books[0].nodes.map(item => item.content)).toEqual(["um EDITADO", "dois", "três EDITADO"]);
    expect(report.conflictCopies).toBe(0);
    expect(doc.books[0].updatedAt).toBe(6);
  });

  it("o mesmo capítulo editado nos dois lados mantém o remoto e guarda o local como cópia marcada", () => {
    const local = lib(book("b1", [node("a", "versão local"), node("b", "dois"), node("c", "três")], { updatedAt: 5 }));
    const remote = lib(book("b1", [node("a", "versão remota"), node("b", "dois"), node("c", "três")], { updatedAt: 6 }));
    const { doc, report } = mergeLibraries(base, local, remote, opts);
    const nodes = doc.books[0].nodes;
    expect(nodes.map(item => item.content)).toEqual(["versão remota", "versão local", "dois", "três"]);
    expect(nodes[1].title).toContain("cópia local — conflito");
    expect(nodes[1].id).toBe("node-copia");
    expect(report.conflictCopies).toBe(1);
  });

  it("capítulo novo de cada lado entra na posição do vizinho anterior", () => {
    const local = lib(book("b1", [node("a", "um"), node("novo-local", "L"), node("b", "dois"), node("c", "três")], { updatedAt: 5 }));
    const remote = lib(book("b1", [node("a", "um"), node("b", "dois"), node("c", "três"), node("novo-remoto", "R")], { updatedAt: 6 }));
    const { doc } = mergeLibraries(base, local, remote, opts);
    expect(doc.books[0].nodes.map(item => item.id)).toEqual(["a", "novo-local", "b", "c", "novo-remoto"]);
  });

  it("remoção vale se o outro lado não mexeu; edição vence a remoção", () => {
    const local = lib(book("b1", [node("a", "um"), node("c", "três EDITADO")], { updatedAt: 5 }));
    const remote = lib(book("b1", [node("a", "um"), node("b", "dois")], { updatedAt: 6 }));
    const { doc } = mergeLibraries(base, local, remote, opts);
    // b: removido no local e inalterado no remoto → some. c: removido no remoto e editado no local → fica.
    expect(doc.books[0].nodes.map(item => item.id)).toEqual(["a", "c"]);
    expect(doc.books[0].nodes[1].content).toBe("três EDITADO");
  });

  it("reordenação só de um lado é respeitada", () => {
    const local = lib(book("b1", [node("c", "três"), node("a", "um"), node("b", "dois")], { updatedAt: 5 }));
    const remote = lib(book("b1", [node("a", "um"), node("b", "dois"), node("c", "três"), node("d", "quatro")], { updatedAt: 6 }));
    const { doc } = mergeLibraries(base, local, remote, opts);
    expect(doc.books[0].nodes.map(item => item.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("livros novos e removidos são tratados por livro", () => {
    const twoBooks = lib(book("b1", [node("a", "um")]), book("b2", [node("x", "x")]));
    const local = lib(book("b1", [node("a", "um")]), book("b2", [node("x", "x")]), book("b3-local", [node("y", "y")]));
    const remote = lib(book("b1", [node("a", "um")]), book("b4-remoto", [node("z", "z")]));
    const { doc } = mergeLibraries(twoBooks, local, remote, opts);
    expect(doc.books.map(item => item.id).sort()).toEqual(["b1", "b3-local", "b4-remoto"]);
  });

  it("campos do livro (planejamento etc.) usam mudança de um lado só ou o mais recente", () => {
    const baseBook = lib(book("b1", [node("a", "um")], { planning: "p0", goal: 1000 }));
    const local = lib(book("b1", [node("a", "um")], { planning: "p-local", goal: 1000, updatedAt: 5 }));
    const remote = lib(book("b1", [node("a", "um")], { planning: "p0", goal: 2000, updatedAt: 6 }));
    const { doc } = mergeLibraries(baseBook, local, remote, opts);
    expect(doc.books[0].planning).toBe("p-local");
    expect(doc.books[0].goal).toBe(2000);
  });

  it("sem base, capítulos diferentes geram cópia em vez de perder texto", () => {
    const local = lib(book("b1", [node("a", "local")], { updatedAt: 5 }));
    const remote = lib(book("b1", [node("a", "remoto")], { updatedAt: 6 }));
    const { doc, report } = mergeLibraries(undefined, local, remote, opts);
    expect(doc.books[0].nodes.map(item => item.content)).toEqual(["remoto", "local"]);
    expect(report.conflictCopies).toBe(1);
  });

  it("livros idênticos não geram mudança", () => {
    const { doc, report } = mergeLibraries(base, base, base, opts);
    expect(doc.books).toHaveLength(1);
    expect(report.conflictCopies).toBe(0);
    expect(report.booksMerged).toBe(0);
  });

  it("chama o recalculador de dados derivados do livro mesclado", () => {
    const local = lib(book("b1", [node("a", "um EDITADO"), node("b", "dois"), node("c", "três")], { updatedAt: 5 }));
    const remote = lib(book("b1", [node("a", "um"), node("b", "dois"), node("c", "três EDITADO")], { updatedAt: 6 }));
    const { doc } = mergeLibraries(base, local, remote, { ...opts, reconcileBook: item => ({ ...item, reconciled: true }) });
    expect(doc.books[0].reconciled).toBe(true);
  });
});
