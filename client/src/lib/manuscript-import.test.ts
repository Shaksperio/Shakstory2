// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { importManuscript } from "./manuscript-import";
import { sanitizeRichContent } from "@shared/rich-text";
const bytes = async (files: Record<string, string>) => {
  const zip = new JSZip();
  Object.entries(files).forEach(([path, text]) => zip.file(path, text));
  return zip.generateAsync({ type: "arraybuffer" });
};
describe("manuscript import", () => {
  it("splits DOCX headings and preserves bold and accents", async () => {
    const preview = await importManuscript(
      await bytes({
        "word/document.xml":
          '<w:document xmlns:w="urn:w"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Capítulo Á</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Texto forte</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Capítulo B</w:t></w:r></w:p><w:p><w:r><w:t>Final.</w:t></w:r></w:p></w:body></w:document>',
      }),
      "book.docx"
    );
    expect(preview.chapters.map(c => c.title)).toEqual([
      "Capítulo Á",
      "Capítulo B",
    ]);
    expect(preview.chapters[0].richContent).toContain(
      "<strong>Texto forte</strong>"
    );
    expect(preview.chapters[1].content).toBe("Final.");
  });
  it("reads ODT styles and rejects invalid or empty documents", async () => {
    const data = await bytes({
      "content.xml":
        '<office:document xmlns:office="urn:o" xmlns:text="urn:t" xmlns:style="urn:s" xmlns:fo="urn:f"><style:style style:name="bold"><style:text-properties fo:font-weight="bold"/></style:style><text:h text:outline-level="1">Início</text:h><text:p><text:span text:style-name="bold">Olá</text:span></text:p></office:document>',
    });
    const preview = await importManuscript(data, "book.odt");
    expect(preview.chapters[0].richContent).toContain("<strong>Olá</strong>");
    await expect(importManuscript(data, "book.pdf")).rejects.toThrow(
      "DOCX ou ODT"
    );
    await expect(
      importManuscript(await bytes({ "content.xml": "<broken>" }), "bad.odt")
    ).rejects.toThrow("XML inválido");
  });
  it("preserves only raster data URLs and removes event handlers", () => {
    expect(
      sanitizeRichContent(
        '<img src="data:image/png;base64,iVBORw==" onerror="alert(1)"/>'
      )
    ).toContain("data:image/png");
    expect(
      sanitizeRichContent('<img src="data:image/svg+xml;base64,AAAA"/>')
    ).not.toContain("data:image/svg");
  });
});
