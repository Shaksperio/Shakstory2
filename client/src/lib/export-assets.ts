import { loadPdfFonts } from "@shared/book-export";
import type { ExportBook } from "@shared/book-export";
// Materialize images before downloading so books remain readable without the site.
export async function prepareExportAssets(
  book: ExportBook
): Promise<ExportBook> {
  await loadPdfFonts();
  const cache = new Map<string, Promise<string>>();
  const load = (source: string) => {
    let existing = cache.get(source);
    if (existing) return existing;
    const pending = (async () => {
      let data = source;
      if (!/^data:image\/(png|jpeg|webp);base64,/i.test(source)) {
        if (!/^(https?:|\/)/i.test(source))
          throw new Error("Há uma imagem com endereço inválido no manuscrito.");
        const response = await fetch(source, { credentials: "same-origin" });
        if (!response.ok)
          throw new Error(
            "Não foi possível carregar uma imagem. Confira a capa e as imagens do manuscrito."
          );
        const blob = await response.blob();
        if (
          blob.size > 8 * 1024 * 1024 ||
          !/^image\/(png|jpeg|webp)(;|$)/i.test(blob.type)
        )
          throw new Error(
            "Imagem incompatível com a exportação (PNG, JPEG ou WebP até 8 MB)."
          );
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 8192)
          binary += String.fromCharCode(
            ...Array.from(bytes.slice(i, i + 8192))
          );
        data = `data:${blob.type.split(";")[0]};base64,${btoa(binary)}`;
      }
      if (data.startsWith("data:image/webp")) {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () =>
            reject(new Error("Não foi possível converter uma imagem WebP."));
          img.src = data;
        });
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context)
          throw new Error("Conversão de imagem indisponível neste navegador.");
        context.drawImage(img, 0, 0);
        data = canvas.toDataURL("image/png");
      }
      return data;
    })();
    cache.set(source, pending);
    return pending;
  };
  const chapters = await Promise.all(
    book.chapters.map(async chapter => {
      if (!chapter.richContent) return chapter;
      const doc = new DOMParser().parseFromString(
        chapter.richContent,
        "text/html"
      );
      for (const img of Array.from(doc.querySelectorAll("img"))) {
        const source = img.getAttribute("src");
        if (source) img.setAttribute("src", await load(source));
      }
      return { ...chapter, richContent: doc.body.innerHTML };
    })
  );
  return {
    ...book,
    chapters,
    coverImageUrl: book.coverImageUrl
      ? await load(book.coverImageUrl)
      : undefined,
  };
}
