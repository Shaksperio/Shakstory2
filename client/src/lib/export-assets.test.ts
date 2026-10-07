// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { prepareExportAssets } from "./export-assets";
afterEach(() => vi.unstubAllGlobals());
describe("export assets", () => {
  it("embeds each image once and reuses it for the cover and manuscript", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { "Content-Type": "image/png" },
        })
    );
    vi.stubGlobal("fetch", fetcher);
    const book = await prepareExportAssets({
      title: "Livro",
      coverImageUrl: "/image.png",
      chapters: [
        {
          id: "a",
          title: "Um",
          content: "Texto",
          richContent: '<p>Texto<img src="/image.png" alt="Imagem"/></p>',
        },
      ],
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(book.coverImageUrl).toBe("data:image/png;base64,iVBORw==");
    expect(book.chapters[0].richContent).toContain(
      "data:image/png;base64,iVBORw=="
    );
  });
  it("reports a missing image before producing an incomplete book", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("missing", { status: 404 }))
    );
    await expect(
      prepareExportAssets({
        title: "Livro",
        coverImageUrl: "/missing.png",
        chapters: [],
      })
    ).rejects.toThrow("Não foi possível carregar uma imagem");
  });
});
