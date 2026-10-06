import { describe, expect, it } from "vitest";
import { stableId } from "./project-lifecycle";
import { addChapter, addPart, createInitialNode, displayNodeTitle, duplicateNode, mergeNodes, moveNode, removeNode, renameNode, splitNode, updateNodeContent } from "./project-lifecycle";

describe("project lifecycle", () => {
  it("creates, updates and reopens a stable chapter list", () => {
    const first = createInitialNode(10);
    const withSecond = addChapter([first], 20);
    const updated = updateNodeContent(withSecond, first.id, "Texto recuperável", 30);
    const reopened = JSON.parse(JSON.stringify(updated));
    expect(reopened).toHaveLength(2);
    expect(reopened[0].id).toBe(first.id);
    expect(reopened[0].content).toBe("Texto recuperável");
  });

  it("moves nodes without changing their identity", () => {
    const first = createInitialNode(1);
    const nodes = addChapter([first], 2);
    const moved = moveNode(nodes, nodes[1].id, "up");
    expect(moved.map(node => node.id)).toEqual([nodes[1].id, nodes[0].id]);
    expect(moved[0].title).toBe("Novo capítulo");
  });

  it("gives chapters stable unique identities and supports editorial operations", () => {
    const first = createInitialNode(1);
    const second = addChapter([first], 2)[1];
    expect(first.id).not.toBe(second.id);
    expect(first.id).toMatch(/^chapter-/);
    const renamed = renameNode([first, second], first.id, "O Retorno", 3);
    expect(renamed[0].title).toBe("O Retorno");
    expect(renamed[0].id).toBe(first.id);
    const duplicated = duplicateNode(renamed, first.id, 4);
    expect(duplicated).toHaveLength(3);
    expect(duplicated[1].id).not.toBe(first.id);
    expect(addPart(duplicated, 5).at(-1)?.kind).toBe("part");
  });

  it("preserves unique identities for editorial records across serialization", () => {
    const ids = ["book", "chapter", "scene", "note", "version"].map(stableId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(JSON.parse(JSON.stringify({ ids })).ids).toEqual(ids);
  });

  it("derives presentation numbers without changing stable identities", () => {
    const first = createInitialNode(1);
    const second = addChapter([first], 2)[1];
    const part = addPart([first, second], 3)[2];
    expect(displayNodeTitle([first, second, part], first)).toBe("Capítulo 1 — Novo capítulo");
    expect(displayNodeTitle([first, second, part], second)).toBe("Capítulo 2 — Novo capítulo");
    expect(displayNodeTitle([first, second, part], part)).toBe("Parte 1 — Nova parte");
    const rich = updateNodeContent([first], first.id, "Coragem", 4, "<p><strong>Coragem</strong></p>");
    const reopened = JSON.parse(JSON.stringify(rich));
    expect(reopened[0].id).toBe(first.id);
    expect(reopened[0].richContent).toContain("<strong>");
  });

  it("splits and merges adjacent editable nodes without losing text", () => {
    const nodes = [{ id: "chapter-1", title: "Capítulo 1", kind: "chapter" as const, content: "Primeira parte. Segunda parte.", updatedAt: 1 }];
    const split = splitNode(nodes, "chapter-1", 16, 2);
    expect(split).toHaveLength(2);
    expect(split[0].id).toBe("chapter-1");
    expect(split[1].id).not.toBe("chapter-1");
    const merged = mergeNodes(split, split[0].id, split[1].id, 3);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("chapter-1");
    expect(merged[0].content).toContain("Segunda parte.");
  });

  it("never removes the last remaining node", () => {
    const first = createInitialNode(1);
    expect(removeNode([first], first.id)).toEqual([first]);
    expect(removeNode([first, ...addChapter([], 2)], first.id)).toHaveLength(1);
  });
});
