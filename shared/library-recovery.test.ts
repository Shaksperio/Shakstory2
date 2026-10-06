import { describe, expect, it } from "vitest";
import { recoverLibraryDocument } from "./library-recovery";

describe("library recovery", () => {
  it("restores a non-empty local backup when the remote document is empty", () => {
    const local = { version: 1, books: [{ id: "book-local" }] };
    expect(recoverLibraryDocument({ version: 1, books: [] }, local)).toBe(local);
  });

  it("keeps a non-empty remote document as the source of truth", () => {
    const remote = { version: 1, books: [{ id: "book-remote" }] };
    const local = { version: 1, books: [{ id: "book-local" }] };
    expect(recoverLibraryDocument(remote, local)).toBe(remote);
  });
});
