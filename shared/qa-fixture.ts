export const QA_BOOK_ID = "qa-book-shakstory-1";

export function createQaLibrary() {
  return {
    version: 1,
    books: [{
      id: QA_BOOK_ID,
      title: "ShakStory QA Test Book",
      subtitle: "Fixture isolado de validação",
      status: "draft" as const,
      targetWordCount: 1200,
      updatedAt: 1,
      nodes: [
        { id: "qa-part-1", title: "Parte I", kind: "part" as const, content: "", updatedAt: 1 },
        { id: "qa-chapter-1", title: "A abertura", kind: "chapter" as const, content: "A noite chegou cedo.", updatedAt: 1 },
        { id: "qa-chapter-2", title: "O encontro", kind: "chapter" as const, content: "A porta se abriu.", updatedAt: 1 },
        { id: "qa-scene-1", title: "Cena do encontro", kind: "scene" as const, content: "O silêncio respondeu primeiro.", updatedAt: 1 },
      ],
      publication: {
        author: "Autoria QA",
        genre: "Ficção",
        category: "Ficção de teste",
        language: "Português",
        description: "Dados isolados para validação automatizada.",
        isbn: "9780000000000",
        publicationDate: "2026-01-01",
        coverImageUrl: "https://example.invalid/shakstory-qa-cover.png",
        includeToc: true,
        typography: "classic" as const,
      },
      planning: {
        characters: [{ id: "qa-character-1", name: "Pessoa QA", role: "Protagonista", notes: "Fixture" }],
        locations: [{ id: "qa-location-1", name: "Biblioteca QA", description: "Fixture" }],
        timeline: [{ id: "qa-event-1", label: "Abertura", date: "2026-01-01", notes: "Fixture" }],
      },
    }],
  };
}
