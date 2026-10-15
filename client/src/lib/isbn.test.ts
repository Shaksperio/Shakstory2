import { describe, expect, it } from "vitest";
import { isValidIsbn, lookupIsbn, normalizeIsbn, parseGoogleBooks, parseOpenLibrary, publicationDates } from "./isbn";

describe("isbn", () => {
  it("normaliza e valida ISBN-13 e ISBN-10", () => {
    expect(normalizeIsbn("978-85-359-0277-5")).toBe("9788535902775");
    expect(isValidIsbn("978-85-359-0277-5")).toBe(true);
    expect(isValidIsbn("0-306-40615-2")).toBe(true);
    expect(isValidIsbn("9788535902776")).toBe(false);
    expect(isValidIsbn("abc")).toBe(false);
  });
  it("lê resposta do Google Livros", () => {
    const info = parseGoogleBooks({ items: [{ volumeInfo: { title: "Dom Casmurro", authors: ["Machado de Assis"], publisher: "X", publishedDate: "2008-03-01", description: "<p>Um <b>clássico</b></p>", categories: ["Fiction"], language: "pt-BR", pageCount: 256, imageLinks: { thumbnail: "http://img/c.jpg" } } }] }, "1");
    expect(info).toMatchObject({ title: "Dom Casmurro", authors: ["Machado de Assis"], language: "Português", pages: 256, coverUrl: "https://img/c.jpg", description: "Um clássico" });
    expect(parseGoogleBooks({ totalItems: 0 }, "1")).toBeNull();
  });
  it("lê resposta da Open Library", () => {
    const info = parseOpenLibrary({ "ISBN:1": { title: "T", authors: [{ name: "A" }], publishers: [{ name: "P" }], publish_date: "May 2001", subjects: [{ name: "S" }] } }, "1");
    expect(info).toMatchObject({ title: "T", authors: ["A"], publisher: "P", categories: ["S"] });
    expect(publicationDates("May 2001")).toEqual({ year: "2001", date: undefined });
    expect(publicationDates("2008-03-01")).toEqual({ year: "2008", date: "2008-03-01" });
  });
  it("usa Open Library quando o Google não acha e devolve null se nenhum achar", async () => {
    const ol = { "ISBN:9788535902775": { title: "Só OL", authors: [{ name: "A" }] } };
    const fetchFn = (async (url: string) => ({ ok: true, json: async () => (String(url).includes("openlibrary") ? ol : { totalItems: 0 }) })) as unknown as typeof fetch;
    expect((await lookupIsbn("978-85-359-0277-5", fetchFn))?.source).toBe("Open Library");
    const none = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await lookupIsbn("9788535902775", none)).toBeNull();
  });
});
