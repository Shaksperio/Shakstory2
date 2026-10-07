// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mergeNodes, splitNode } from "./project-lifecycle";
import { selectionTextOffset } from "./rich-structure";

describe("formatted manuscript operations", () => {
  const node = {
    id: "a",
    title: "A",
    kind: "chapter" as const,
    content: "Alpha beta & gamma",
    richContent:
      '<p><strong>Alpha beta</strong> &amp; <a href="https://example.com">gamma</a><img src="https://example.com/a.png" /></p>',
    updatedAt: 1,
  };
  it("splits balanced marks and retains each image and link once", () => {
    const divided = splitNode([node], "a", 6, 2);
    expect(divided).toHaveLength(2);
    expect(divided[0].content).toBe("Alpha");
    expect(divided[1].content).toBe("beta & gamma");
    expect(divided[0].richContent).toContain("<strong>Alpha ");
    expect(divided[1].richContent).toContain("<strong>beta</strong>");
    expect(
      divided
        .map(n => n.richContent)
        .join("")
        .match(/<img/g)
    ).toHaveLength(1);
    const merged = mergeNodes(divided, "a", divided[1].id, 3);
    expect(merged[0].richContent).toContain("<a href=");
    expect(merged[0].richContent).toContain("<img");
  });
  it("refuses inconsistent rich text rather than discarding it", () => {
    const nodes = [{ ...node, content: "Different text" }];
    expect(splitNode(nodes, "a", 5, 2)).toBe(nodes);
  });
  it("preserves list containers and avoids splitting an emoji surrogate pair", () => {
    const nodes = [
      {
        ...node,
        content: "A😀B C",
        richContent: "<ul><li>A😀B</li><li>C</li></ul>",
      },
    ];
    const divided = splitNode(nodes, "a", 2, 2);
    expect(divided[0].content).toBe("A😀");
    expect(divided[0].richContent).toContain("<ul><li>A😀</li></ul>");
    expect(divided[1].content).toBe("B C");
  });
  it("escapes plain content when merging with a formatted chapter", () => {
    const merged = mergeNodes(
      [
        node,
        { ...node, id: "b", content: "<end> & done", richContent: undefined },
      ],
      "a",
      "b",
      2
    );
    expect(merged[0].richContent).toContain("&lt;end&gt; &amp; done");
    expect(selectionTextOffset("Alpha\n\nbeta", "Alpha beta")).toBe(11);
    expect(selectionTextOffset("Alpha", "other")).toBeUndefined();
  });
});
