import { describe, expect, it } from "vitest";
import {
  buildProjectBackup,
  parseProjectBackup,
  chapterProgress,
  recordDailyProgress,
} from "./project-backup";

const book = {
  id: "qa-backup",
  title: "Caderno QA",
  status: "draft",
  targetWordCount: 500,
  updatedAt: 1,
  nodes: [
    {
      id: "chapter-qa",
      kind: "chapter",
      title: "A abertura",
      content: "A noite chegou.",
      richContent: "<p>A <strong>noite</strong> chegou.</p>",
      updatedAt: 1,
    },
  ],
  story: {
    objectives: [],
    conflicts: [],
    relations: [],
    notes: [],
    scenes: [
      {
        id: "scene-qa",
        title: "A descoberta",
        objective: "Descobrir",
        conflict: "Segredo",
        chapterId: "chapter-qa",
        notes: "",
      },
    ],
  },
};

describe("portable project backup", () => {
  it("round-trips content, marks and stable narrative references", () => {
    expect(parseProjectBackup(buildProjectBackup(book), book.id)).toEqual(book);
  });
  it("rejects another book, duplicate IDs and malformed nested planning", () => {
    expect(() => parseProjectBackup(buildProjectBackup(book), "other")).toThrow(
      "outro livro"
    );
    expect(() =>
      parseProjectBackup(
        buildProjectBackup({ ...book, nodes: [...book.nodes, ...book.nodes] }),
        book.id
      )
    ).toThrow("IDs duplicados");
    expect(() =>
      parseProjectBackup(
        buildProjectBackup({ ...book, planning: { characters: "broken" } }),
        book.id
      )
    ).toThrow("Backup inválido");
    for (const invalid of [
      { copyright: { contributors: {} } },
      { typography: "unknown" },
      { frontMatter: [{ id: "a", title: "a", content: "a", enabled: "yes" }] },
    ]) {
      expect(() =>
        parseProjectBackup(
          buildProjectBackup({
            ...book,
            publication: {
              author: "Autor",
              genre: "Romance",
              language: "pt-BR",
              description: "",
              ...invalid,
            },
          }),
          book.id
        )
      ).toThrow("Backup inválido");
    }
  });
  it("restores the latest unsaved draft from an emergency copy and sanitizes it", () => {
    const text = JSON.stringify({
      format: "shakstory-recovery",
      version: 1,
      library: { books: [book] },
      drafts: {
        "shakstory:node:chapter-qa": "Outra noite.",
        "shakstory:node:chapter-qa:html":
          "<p>Outra <em>noite</em>.</p><script>alert(1)</script>",
      },
    });
    const recovered = parseProjectBackup(text, book.id);
    expect(recovered.nodes[0].content).toBe("Outra noite.");
    expect(recovered.nodes[0].richContent).toContain("<em>noite</em>");
    expect(recovered.nodes[0].richContent).not.toContain("<script");
  });
  it("counts additions and deletions once per persisted draft and excludes part headings", () => {
    const day = new Date(2026, 9, 7, 12);
    const first = recordDailyProgress(
      [],
      "A noite",
      "A noite chegou cedo",
      day
    );
    const edited = recordDailyProgress(
      first,
      "A noite chegou cedo",
      "A noite chegou",
      day
    );
    expect(edited).toEqual([{ date: "2026-10-07", added: 2, removed: 1 }]);
    expect(recordDailyProgress(edited, "A noite", "A noite", day)).toBe(edited);
    expect(
      chapterProgress([
        { id: "part", title: "Parte I", kind: "part", content: "Título" },
        ...book.nodes,
      ])
    ).toEqual([
      { id: "chapter-qa", title: "A abertura", words: 3, percent: 100 },
    ]);
  });
});
