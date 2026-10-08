import { sanitizeRichContent } from "./rich-text";
import { z } from "zod";

const status = z.enum([
  "planning",
  "draft",
  "editing",
  "revision",
  "completed",
]);
const card = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    status: status.optional(),
  })
  .passthrough();
const node = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    kind: z.enum(["chapter", "scene", "part"]),
    content: z.string(),
    richContent: z.string().optional(),
    updatedAt: z.number(),
    status: status.optional(),
  })
  .passthrough();
const bookSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    subtitle: z.string().optional(),
    status,
    targetWordCount: z.number().nonnegative(),
    updatedAt: z.number(),
    nodes: z.array(node).max(5000),
    dailyGoalWords: z.number().nonnegative().optional(),
    deadline: z.string().optional(),
    nextSteps: z.array(z.string()).optional(),
    archived: z.boolean().optional(),
    startedAt: z.number().optional(),
    lastOpenedAt: z.number().optional(),
    editSeconds: z.number().optional(),
    writingProgress: z
      .array(
        z
          .object({
            date: z.string(),
            added: z.number().nonnegative(),
            removed: z.number().nonnegative(),
          })
          .passthrough()
      )
      .optional(),
    hierarchy: z
      .object({
        bookId: z.string(),
        universeId: z.string().optional(),
        universeName: z.string().optional(),
        seriesId: z.string().optional(),
        seriesName: z.string().optional(),
      })
      .passthrough()
      .optional(),
    review: z
      .object({
        tracking: z.boolean().optional(),
        comments: z
          .array(
            z
              .object({
                id: z.string(),
                nodeId: z.string(),
                quote: z.string(),
                body: z.string(),
                author: z.string(),
                createdAt: z.number(),
                resolved: z.boolean(),
              })
              .passthrough()
          )
          .optional(),
        changes: z
          .array(
            z
              .object({
                id: z.string(),
                nodeId: z.string(),
                before: z.string(),
                after: z.string(),
                beforeHtml: z.string(),
                afterHtml: z.string(),
                createdAt: z.number(),
                status: z.enum(["pending", "accepted", "rejected"]),
              })
              .passthrough()
          )
          .optional(),
        versions: z
          .array(
            z
              .object({
                id: z.string(),
                nodeId: z.string(),
                title: z.string(),
                text: z.string(),
                html: z.string(),
                createdAt: z.number(),
              })
              .passthrough()
          )
          .optional(),
      })
      .passthrough()
      .optional(),
    planning: z
      .object({
        characters: z.array(
          z
            .object({
              id: z.string(),
              name: z.string(),
              role: z.string(),
              notes: z.string(),
              tags: z.array(z.string()).optional(),
            })
            .passthrough()
        ),
        locations: z.array(
          z
            .object({
              id: z.string(),
              name: z.string(),
              atmosphere: z.string(),
              notes: z.string(),
              tags: z.array(z.string()).optional(),
            })
            .passthrough()
        ),
        timeline: z.array(
          z
            .object({
              id: z.string(),
              title: z.string(),
              date: z.string(),
              description: z.string(),
              tags: z.array(z.string()).optional(),
            })
            .passthrough()
        ),
        boards: z
          .array(
            z
              .object({
                id: z.string(),
                title: z.string(),
                columns: z.array(
                  z.object({ id: z.string(), title: z.string() }).passthrough()
                ),
                cards: z.array(
                  z
                    .object({
                      id: z.string(),
                      title: z.string(),
                      body: z.string(),
                      kind: z.enum([
                        "note",
                        "character",
                        "location",
                        "research",
                        "scene",
                        "world",
                      ]),
                      tags: z.array(z.string()),
                      columnId: z.string(),
                      createdAt: z.number(),
                      updatedAt: z.number(),
                    })
                    .passthrough()
                ),
              })
              .passthrough()
          )
          .optional(),
      })
      .passthrough()
      .optional(),
    story: z
      .object({
        objectives: z.array(card),
        conflicts: z.array(card),
        notes: z.array(z.string()),
        noteIds: z.array(z.string()).optional(),
        scenes: z.array(
          z
            .object({
              id: z.string(),
              title: z.string(),
              objective: z.string(),
              conflict: z.string(),
              notes: z.string(),
              objectiveId: z.string().optional(),
              conflictId: z.string().optional(),
              chapterId: z.string().optional(),
            })
            .passthrough()
        ),
        relations: z.array(
          z
            .object({
              id: z.string(),
              from: z.string(),
              to: z.string(),
              label: z.string(),
            })
            .passthrough()
        ),
      })
      .passthrough()
      .optional(),
    publication: z
      .object({
        author: z.string(),
        genre: z.string(),
        language: z.string(),
        description: z.string(),
        category: z.string().optional(),
        isbn: z.string().optional(),
        publicationDate: z.string().optional(),
        publicationYear: z.string().optional(),
        coverImageUrl: z.string().optional(),
        includeToc: z.boolean().optional(),
        typography: z
          .enum([
            "classic",
            "modern",
            "minimal",
            "fantasy",
            "sci-fi",
            "romance",
            "thriller",
            "academic",
            "children",
          ])
          .optional(),
        trimSize: z.enum(["a5", "6x9", "a4"]).optional(),
        marginPreset: z.enum(["narrow", "normal", "wide"]).optional(),
        dropCap: z.boolean().optional(),
        headerText: z.string().optional(),
        footerText: z.string().optional(),
        copyright: z
          .object({
            penName: z.string().optional(),
            edition: z.string().optional(),
            year: z.string().optional(),
            publisher: z.string().optional(),
            publisherLogo: z.string().optional(),
            isbns: z
              .object({
                epub: z.string().optional(),
                kindle: z.string().optional(),
                paperback: z.string().optional(),
                hardcover: z.string().optional(),
                pdf: z.string().optional(),
              })
              .passthrough()
              .optional(),
            contributors: z
              .array(
                z
                  .object({
                    id: z.string(),
                    name: z.string(),
                    role: z.string(),
                  })
                  .passthrough()
              )
              .optional(),
            clauses: z
              .object({
                rights: z.boolean().optional(),
                fiction: z.boolean().optional(),
                moral: z.boolean().optional(),
                external: z.boolean().optional(),
              })
              .passthrough()
              .optional(),
            additional: z.string().optional(),
          })
          .passthrough()
          .optional(),
        frontMatter: z
          .array(
            z
              .object({
                id: z.string(),
                title: z.string(),
                content: z.string(),
                enabled: z.boolean().optional(),
              })
              .passthrough()
          )
          .optional(),
        backMatter: z
          .array(
            z
              .object({
                id: z.string(),
                title: z.string(),
                content: z.string(),
                enabled: z.boolean().optional(),
              })
              .passthrough()
          )
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export function buildProjectBackup(book: { id: string }, now = new Date()) {
  return JSON.stringify(
    {
      format: "shakstory-project",
      version: 1,
      exportedAt: now.toISOString(),
      book,
    },
    null,
    2
  );
}

export function parseProjectBackup(text: string, expectedBookId: string) {
  if (text.length > 32 * 1024 * 1024)
    throw new Error("Backup acima do limite de 32 MiB.");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("O arquivo não contém JSON válido.");
  }
  if (
    raw &&
    typeof raw === "object" &&
    "format" in raw &&
    raw.format === "shakstory-recovery"
  ) {
    const emergency = z
      .object({
        format: z.literal("shakstory-recovery"),
        version: z.literal(1),
        library: z
          .object({
            books: z.array(z.object({ id: z.string() }).passthrough()),
          })
          .passthrough(),
        drafts: z.record(z.string(), z.string()),
      })
      .safeParse(raw);
    if (!emergency.success) throw new Error("Cópia de recuperação inválida.");
    const source = emergency.data.library.books.find(
      book => book.id === expectedBookId
    );
    if (!source)
      throw new Error("Este livro não está na cópia de recuperação.");
    raw = {
      format: "shakstory-project",
      version: 1,
      book: {
        ...source,
        nodes: Array.isArray(source.nodes)
          ? source.nodes.map(node => {
              if (
                !node ||
                typeof node !== "object" ||
                typeof node.id !== "string"
              )
                return node;
              return {
                ...node,
                content:
                  emergency.data.drafts[`shakstory:node:${node.id}`] ??
                  node.content,
                richContent:
                  emergency.data.drafts[`shakstory:node:${node.id}:html`] ??
                  node.richContent,
              };
            })
          : source.nodes,
      },
    };
  }
  const parsed = z
    .object({
      format: z.literal("shakstory-project"),
      version: z.literal(1),
      book: bookSchema,
    })
    .safeParse(raw);
  if (!parsed.success)
    throw new Error("Backup inválido ou versão incompatível.");
  const book = parsed.data.book;
  if (book.id !== expectedBookId)
    throw new Error(
      "Este backup pertence a outro livro. Abra o projeto correspondente para restaurar."
    );
  if (new Set(book.nodes.map(node => node.id)).size !== book.nodes.length)
    throw new Error("Backup contém capítulos com IDs duplicados.");
  // Semantic structure is reconciled from the validated manuscript on restore.
  // Keep well-shaped semantic metadata only; malformed caches must not crash restoration.
  if (book.semanticBook) {
    const block = z
      .object({
        id: z.string(),
        kind: z.enum(["paragraph", "quote", "scene_break", "heading"]),
        text: z.string(),
        sortOrder: z.number(),
      })
      .passthrough();
    const scene = z
      .object({
        id: z.string(),
        title: z.string(),
        blocks: z.array(block),
        characterIds: z.array(z.string()),
        locationIds: z.array(z.string()),
        sortOrder: z.number(),
        richContent: z.string().optional(),
      })
      .passthrough();
    const chapter = z
      .object({
        id: z.string(),
        title: z.string(),
        scenes: z.array(scene),
        sortOrder: z.number(),
      })
      .passthrough();
    const semantic = z
      .object({
        schemaVersion: z.literal("1.1"),
        id: z.string(),
        title: z.string(),
        migratedFromLegacy: z.boolean(),
        parts: z.array(
          z
            .object({
              id: z.string(),
              title: z.string(),
              chapters: z.array(chapter),
              sortOrder: z.number(),
            })
            .passthrough()
        ),
      })
      .passthrough()
      .safeParse(book.semanticBook);
    if (!semantic.success)
      throw new Error("Estrutura semântica inválida no backup.");
  }
  book.nodes = book.nodes.map(node => ({
    ...node,
    richContent: node.richContent
      ? sanitizeRichContent(node.richContent)
      : undefined,
  }));
  return book;
}

export function chapterProgress(
  nodes: Array<{ id: string; title: string; kind: string; content: string }>
) {
  const entries = nodes
    .filter(node => node.kind !== "part")
    .map(node => ({
      id: node.id,
      title: node.title,
      words: node.content.trim().split(/\s+/).filter(Boolean).length,
    }));
  const total = entries.reduce((sum, node) => sum + node.words, 0);
  return entries.map(node => ({
    ...node,
    percent: total ? Math.round((node.words / total) * 100) : 0,
  }));
}

export type DailyProgress = { date: string; added: number; removed: number };
export function recordDailyProgress(
  history: DailyProgress[] = [],
  before: string,
  after: string,
  now = new Date()
): DailyProgress[] {
  const words = (text: string) =>
    text.trim().split(/\s+/).filter(Boolean).length;
  const delta = words(after) - words(before);
  if (!delta) return history;
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const entry = history.find(item => item.date === date) ?? {
    date,
    added: 0,
    removed: 0,
  };
  return [
    ...history.filter(item => item.date !== date),
    {
      ...entry,
      added: entry.added + Math.max(0, delta),
      removed: entry.removed + Math.max(0, -delta),
    },
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-90);
}
