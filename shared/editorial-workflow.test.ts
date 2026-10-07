import { describe, it, expect } from "vitest";
import {
  publicationSections,
  mergeTrackedRevision,
  canRestoreRevision,
  type Revision,
} from "./editorial-workflow";
describe("editorial workflow", () => {
  it("generates copyright and preserves disabled section order", () => {
    const p = {
      author: "Ana",
      copyright: {
        edition: "2",
        year: "2026",
        isbns: { epub: "978-test" },
        contributors: [{ id: "a", name: "Bia", role: "Revisão" }],
      },
      frontMatter: [
        { id: "ded", title: "Dedicatória", content: "Para todos" },
        { id: "copyright", title: "Copyright", content: "old", enabled: false },
      ],
    };
    const values = publicationSections(p);
    expect(values.map(v => v.id)).toEqual(["ded", "copyright"]);
    expect(values[1].enabled).toBe(false);
    expect(values[1].content).toContain("Revisão: Bia");
    expect(values[1].content).toContain("ISBN (epub): 978-test");
    expect(p.frontMatter[1].content).toBe("old");
  });
  it("coalesces consecutive edits without losing the original or later edits", () => {
    const a: Revision = {
      id: "a",
      nodeId: "n",
      before: "original",
      after: "one",
      beforeHtml: "",
      afterHtml: "one",
      createdAt: 1000,
      status: "pending",
    };
    const b: Revision = {
      ...a,
      id: "b",
      before: "one",
      after: "two",
      beforeHtml: "one",
      afterHtml: "two",
      createdAt: 2000,
    };
    const values = mergeTrackedRevision([a], b);
    expect(values).toHaveLength(1);
    expect(values[0].before).toBe("original");
    expect(canRestoreRevision("two", "two", values[0])).toBe(true);
    expect(canRestoreRevision("later", "later", values[0])).toBe(false);
    expect(
      mergeTrackedRevision([{ ...a, status: "accepted" }], b)
    ).toHaveLength(2);
  });
});
