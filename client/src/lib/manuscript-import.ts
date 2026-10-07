import JSZip from "jszip";

export type ImportedChapter = {
  title: string;
  content: string;
  richContent: string;
};
export type ImportPreview = {
  chapters: ImportedChapter[];
  warnings: string[];
  imageCount: number;
};
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    char =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!
  );
const children = (element: Element) => Array.from(element.children);
const attr = (element: Element, name: string) =>
  Array.from(element.attributes).find(item => item.localName === name)?.value;
const descendants = (element: Element | Document, name: string) =>
  Array.from(element.getElementsByTagNameNS("*", name));
const xml = (text: string) => {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (
    doc.getElementsByTagName("parsererror").length ||
    /<!DOCTYPE|<!ENTITY/i.test(text)
  )
    throw new Error(
      "O documento contém XML inválido ou entidades não permitidas."
    );
  return doc;
};

export async function importManuscript(
  bytes: ArrayBuffer,
  filename: string
): Promise<ImportPreview> {
  if (!/\.(docx|odt)$/i.test(filename))
    throw new Error("Selecione um manuscrito DOCX ou ODT.");
  if (bytes.byteLength > 25 * 1024 * 1024)
    throw new Error("O limite de importação é 25 MB.");
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files).filter(entry => !entry.dir);
  let total = 0;
  for (const entry of entries) {
    const size =
      (entry as unknown as { _data?: { uncompressedSize?: number } })._data
        ?.uncompressedSize ?? 0;
    total += size;
    if (
      size > 25 * 1024 * 1024 ||
      total > 80 * 1024 * 1024 ||
      entries.length > 5000
    )
      throw new Error(
        "O manuscrito excede o limite de conteúdo descompactado."
      );
  }
  const warnings: string[] = [];
  let imageCount = 0;
  const image = async (path: string): Promise<string> => {
    const normalized = path.replace(/^\.\//, "");
    if (
      normalized.includes("..") ||
      normalized.startsWith("/") ||
      !/\.(png|jpe?g|webp)$/i.test(normalized)
    ) {
      warnings.push(
        "Uma imagem externa ou de formato não suportado não foi importada."
      );
      return "";
    }
    const file = zip.file(normalized);
    if (!file) {
      warnings.push("Uma imagem não foi encontrada no arquivo.");
      return "";
    }
    const data = await file.async("uint8array");
    if (data.length > 4 * 1024 * 1024) {
      warnings.push("Uma imagem acima de 4 MB não foi importada.");
      return "";
    }
    const isPng =
      data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71;
    const isJpeg = data[0] === 255 && data[1] === 216 && data[2] === 255;
    const isWebp =
      String.fromCharCode(...Array.from(data.slice(0, 4))) === "RIFF" &&
      String.fromCharCode(...Array.from(data.slice(8, 12))) === "WEBP";
    if (!isPng && !isJpeg && !isWebp) {
      warnings.push(
        "Uma imagem possui conteúdo incompatível com o formato declarado."
      );
      return "";
    }
    let binary = "";
    for (let index = 0; index < data.length; index += 8192)
      binary += String.fromCharCode(
        ...Array.from(data.slice(index, index + 8192))
      );
    imageCount++;
    return `<img src="data:image/${isPng ? "png" : isJpeg ? "jpeg" : "webp"};base64,${btoa(binary)}" alt="Imagem importada" />`;
  };
  const blocks: Array<{ text: string; html: string; chapter: boolean }> = [];
  if (/\.docx$/i.test(filename)) {
    const file = zip.file("word/document.xml");
    if (!file)
      throw new Error("O arquivo não contém um documento DOCX válido.");
    const doc = xml(await file.async("string"));
    const relationshipFile = zip.file("word/_rels/document.xml.rels");
    const relationships = new Map<string, string>();
    if (relationshipFile)
      for (const entry of descendants(
        xml(await relationshipFile.async("string")),
        "Relationship"
      )) {
        if (attr(entry, "TargetMode") !== "External")
          relationships.set(
            attr(entry, "Id") ?? "",
            attr(entry, "Target") ?? ""
          );
      }
    for (const paragraph of descendants(doc, "p")) {
      const style =
        attr(descendants(paragraph, "pStyle")[0] ?? paragraph, "val") ?? "";
      const outline = attr(
        descendants(paragraph, "outlineLvl")[0] ?? paragraph,
        "val"
      );
      const level = /(?:Heading|Título|Titulo)\s*([1-6])/i.exec(style)?.[1];
      const isChapter = level === "1" || outline === "0";
      let html = "";
      for (const run of descendants(paragraph, "r")) {
        let text = children(run)
          .map(node =>
            node.localName === "t"
              ? escape(node.textContent ?? "")
              : node.localName === "br"
                ? "<br/>"
                : node.localName === "tab"
                  ? "    "
                  : ""
          )
          .join("");
        const enabled = (name: string) =>
          descendants(run, name).some(
            node =>
              !["0", "false", "off", "none"].includes(attr(node, "val") ?? "1")
          );
        if (enabled("b")) text = `<strong>${text}</strong>`;
        if (enabled("i")) text = `<em>${text}</em>`;
        if (enabled("u")) text = `<u>${text}</u>`;
        html += text;
        for (const blip of descendants(run, "blip")) {
          const target = relationships.get(attr(blip, "embed") ?? "");
          if (target) html += await image(`word/${target}`);
        }
      }
      const text = descendants(paragraph, "r")
        .map(run =>
          children(run)
            .map(node =>
              node.localName === "t"
                ? (node.textContent ?? "")
                : node.localName === "br"
                  ? "\n"
                  : node.localName === "tab"
                    ? "\t"
                    : ""
            )
            .join("")
        )
        .join("");
      const tag = level ? `h${level}` : "p";
      if (html || text.trim())
        blocks.push({
          text,
          html: `<${tag}>${html}</${tag}>`,
          chapter: isChapter,
        });
    }
    if (descendants(doc, "tbl").length)
      warnings.push(
        "Tabelas foram convertidas em parágrafos; confira a organização na prévia."
      );
    if (descendants(doc, "hyperlink").length)
      warnings.push(
        "O texto dos links foi preservado; confira os destinos após importar."
      );
  } else {
    const file = zip.file("content.xml");
    if (!file) throw new Error("O arquivo não contém um documento ODT válido.");
    const doc = xml(await file.async("string"));
    const styleMap = new Map<string, { bold: boolean; italic: boolean }>();
    for (const style of descendants(doc, "style")) {
      const props = descendants(style, "text-properties")[0];
      if (props)
        styleMap.set(attr(style, "name") ?? "", {
          bold: attr(props, "font-weight") === "bold",
          italic: attr(props, "font-style") === "italic",
        });
    }
    const render = async (node: globalThis.Node): Promise<string> => {
      if (node.nodeType === 3) return escape(node.textContent ?? "");
      if (node.nodeType !== 1) return "";
      const element = node as Element;
      if (element.localName === "image")
        return image(attr(element, "href") ?? "");
      if (element.localName === "line-break") return "<br/>";
      if (element.localName === "s")
        return " ".repeat(Math.min(100, Number(attr(element, "c")) || 1));
      let html = (
        await Promise.all(Array.from(element.childNodes).map(render))
      ).join("");
      const style = styleMap.get(attr(element, "style-name") ?? "");
      if (style?.bold) html = `<strong>${html}</strong>`;
      if (style?.italic) html = `<em>${html}</em>`;
      return html;
    };
    for (const paragraph of Array.from(doc.getElementsByTagName("*")).filter(
      node => ["p", "h"].includes(node.localName)
    )) {
      const level = Math.max(
        1,
        Math.min(6, Number(attr(paragraph, "outline-level")) || 1)
      );
      const heading = paragraph.localName === "h";
      const html = await render(paragraph);
      blocks.push({
        text: paragraph.textContent ?? "",
        html: `<${heading ? `h${level}` : "p"}>${html}</${heading ? `h${level}` : "p"}>`,
        chapter: heading && level === 1,
      });
    }
  }
  const chapters: ImportedChapter[] = [];
  let current: ImportedChapter = { title: "", content: "", richContent: "" };
  for (const block of blocks) {
    if (block.chapter) {
      if (current.content.trim() || current.richContent || current.title)
        chapters.push(current);
      current = { title: block.text.trim(), content: "", richContent: "" };
    } else {
      current.content += `${current.content ? "\n\n" : ""}${block.text}`;
      current.richContent += block.html;
    }
  }
  if (current.content.trim() || current.richContent || current.title)
    chapters.push(current);
  if (!chapters.length)
    throw new Error("Não foi encontrado conteúdo para importar.");
  warnings.push(
    "Notas de rodapé, comentários e alterações rastreadas do arquivo original não são convertidos. Guarde o original."
  );
  return { chapters, warnings: Array.from(new Set(warnings)), imageCount };
}
