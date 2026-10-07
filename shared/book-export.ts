import { sanitizeRichContent } from "./rich-text";
import JSZip from "jszip";
import {
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
} from "docx";
import { jsPDF } from "jspdf";

export type ExportChapter = {
  id: string;
  title: string;
  content: string;
  richContent?: string;
};
export type ExportSection = {
  id: string;
  title: string;
  content: string;
  enabled?: boolean;
};
export type TypographyPreset =
  | "classic"
  | "modern"
  | "minimal"
  | "fantasy"
  | "sci-fi"
  | "romance"
  | "thriller"
  | "academic"
  | "children";
export type ExportBook = {
  title: string;
  subtitle?: string;
  author?: string;
  language?: string;
  description?: string;
  category?: string;
  isbn?: string;
  publicationDate?: string;
  layout?: "classic" | "compact";
  typography?: TypographyPreset;
  trimSize?: "a5" | "6x9" | "a4";
  marginPreset?: "narrow" | "normal" | "wide";
  dropCap?: boolean;
  coverImageUrl?: string;
  headerText?: string;
  footerText?: string;
  includeToc?: boolean;
  frontMatter?: ExportSection[];
  backMatter?: ExportSection[];
  chapters: ExportChapter[];
};

type Preset = {
  label: string;
  webFont: string;
  pdfFont: "times" | "helvetica" | "courier";
  bodySize: number;
  lineHeight: number;
  titleWeight: string;
  accent: string;
  margin: number;
};
export const TYPOGRAPHY_PRESETS: Record<TypographyPreset, Preset> = {
  classic: {
    label: "Clássico editorial",
    webFont: "Georgia, serif",
    pdfFont: "times",
    bodySize: 18,
    lineHeight: 1.7,
    titleWeight: "400",
    accent: "#1d4ed8",
    margin: 72,
  },
  modern: {
    label: "Moderno",
    webFont: "Inter, Arial, sans-serif",
    pdfFont: "helvetica",
    bodySize: 16,
    lineHeight: 1.55,
    titleWeight: "600",
    accent: "#2563eb",
    margin: 54,
  },
  minimal: {
    label: "Minimal",
    webFont: "Arial, sans-serif",
    pdfFont: "helvetica",
    bodySize: 15,
    lineHeight: 1.5,
    titleWeight: "400",
    accent: "#111827",
    margin: 48,
  },
  fantasy: {
    label: "Fantasia",
    webFont: "Palatino, Georgia, serif",
    pdfFont: "times",
    bodySize: 18,
    lineHeight: 1.75,
    titleWeight: "400",
    accent: "#7c3aed",
    margin: 76,
  },
  "sci-fi": {
    label: "Ficção científica",
    webFont: "Arial, sans-serif",
    pdfFont: "helvetica",
    bodySize: 15,
    lineHeight: 1.55,
    titleWeight: "700",
    accent: "#0891b2",
    margin: 52,
  },
  romance: {
    label: "Romance",
    webFont: "Garamond, Georgia, serif",
    pdfFont: "times",
    bodySize: 18,
    lineHeight: 1.8,
    titleWeight: "400",
    accent: "#be185d",
    margin: 78,
  },
  thriller: {
    label: "Thriller",
    webFont: "Arial Narrow, Arial, sans-serif",
    pdfFont: "helvetica",
    bodySize: 15,
    lineHeight: 1.45,
    titleWeight: "700",
    accent: "#b91c1c",
    margin: 50,
  },
  academic: {
    label: "Acadêmico",
    webFont: "Arial, sans-serif",
    pdfFont: "helvetica",
    bodySize: 13,
    lineHeight: 1.4,
    titleWeight: "700",
    accent: "#334155",
    margin: 62,
  },
  children: {
    label: "Infantil",
    webFont: "Trebuchet MS, Arial, sans-serif",
    pdfFont: "helvetica",
    bodySize: 19,
    lineHeight: 1.8,
    titleWeight: "700",
    accent: "#ea580c",
    margin: 70,
  },
};

const escapeXml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    char =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[char] ?? char
  );
const escapeHtml = (value: string) => escapeXml(value).replace(/\n/g, "<br />");
const presetFor = (book: ExportBook) =>
  TYPOGRAPHY_PRESETS[book.typography ?? "classic"];
const paragraphs = (content: string) =>
  content
    .split(/\n{2,}/)
    .map(text => text.trim())
    .filter(Boolean);
const coverMarkup = (book: ExportBook) =>
  book.coverImageUrl
    ? `<figure class="cover"><img src="${escapeXml(book.coverImageUrl)}" alt="Capa de ${escapeHtml(book.title)}" /></figure>`
    : `<div class="cover-placeholder"><span>Shakstory</span></div>`;
const tocMarkup = (chapters: ExportChapter[]) =>
  `<nav class="toc" aria-label="Sumário"><h2>Sumário</h2><ol>${chapters.map((chapter, index) => `<li><a href="#chapter-${index + 1}">${escapeHtml(chapter.title)}</a></li>`).join("")}</ol></nav>`;
const sectionMarkup = (sections: ExportSection[] = [], className: string) =>
  sections
    .filter(section => section.enabled !== false && section.content.trim())
    .map(
      section =>
        `<section class="${className}" id="${escapeHtml(section.id)}"><h1>${escapeHtml(section.title)}</h1>${paragraphs(
          section.content
        )
          .map(paragraph => `<p>${escapeHtml(paragraph)}</p>`)
          .join("")}</section>`
    )
    .join("");
const sectionXhtml = (sections: ExportSection[] = [], className: string) =>
  sections
    .filter(section => section.enabled !== false && section.content.trim())
    .map(
      section =>
        `<section class="${className}" id="${escapeXml(section.id)}"><h1>${escapeXml(section.title)}</h1>${paragraphs(
          section.content
        )
          .map(paragraph => `<p>${escapeXml(paragraph)}</p>`)
          .join("")}</section>`
    )
    .join("");

const richMarkup = (chapter: ExportChapter) =>
  chapter.richContent
    ? sanitizeRichContent(chapter.richContent)
        .replace(/<(br|img)([^>]*?)(?:\/?)>/gi, "<$1$2 />")
        .replace(/&nbsp;/g, "&#160;")
    : paragraphs(chapter.content)
        .map(p => `<p>${escapeHtml(p)}</p>`)
        .join("");
const enabledSections = (values: ExportSection[] = []) =>
  values.filter(s => s.enabled !== false && s.content.trim());
const decodeText = (value: string) =>
  value
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#(\d+);/g, (entity, n) =>
      n
        ? String.fromCodePoint(Number(n))
        : ({
            "&amp;": "&",
            "&lt;": "<",
            "&gt;": ">",
            "&quot;": '"',
            "&apos;": "'",
            "&nbsp;": " ",
          }[entity] ?? entity)
    );
function docxContent(chapter: ExportChapter): Paragraph[] {
  if (!chapter.richContent)
    return paragraphs(chapter.content).map(text => new Paragraph({ text }));
  const blocks = sanitizeRichContent(chapter.richContent).match(
    /<(p|h[1-6]|li|blockquote|div)\b[^>]*>[\s\S]*?<\/\1>/gi
  ) ?? [chapter.richContent];
  return blocks.map(block => {
    const tokens = block.match(/<[^>]*>|[^<]+/g) ?? [];
    let bold = false,
      italics = false,
      underline = false;
    const runs: Array<TextRun | ImageRun> = [];
    for (const token of tokens) {
      if (/^<\/?(strong|b)[ >]/i.test(token)) bold = !token.startsWith("</");
      else if (/^<\/?(em|i)[ >]/i.test(token))
        italics = !token.startsWith("</");
      else if (/^<\/?u[ >]/i.test(token)) underline = !token.startsWith("</");
      else if (/^<br/i.test(token)) runs.push(new TextRun({ break: 1 }));
      else if (/^<img/i.test(token)) {
        const match =
          /src=["']data:image\/(png|jpeg|webp);base64,([^"']+)["']/i.exec(
            token
          );
        if (match && match[1] !== "webp")
          runs.push(
            new ImageRun({
              type: match[1] === "jpeg" ? "jpg" : "png",
              data: Uint8Array.from(atob(match[2]), c => c.charCodeAt(0)),
              transformation: (() => {
                const props = new jsPDF().getImageProperties(
                  Uint8Array.from(atob(match[2]), c => c.charCodeAt(0))
                );
                const width = Math.min(400, props.width);
                return { width, height: (width * props.height) / props.width };
              })(),
            })
          );
      } else if (!token.startsWith("<"))
        runs.push(
          new TextRun({
            text: decodeText(token),
            bold,
            italics,
            underline: underline ? {} : undefined,
          })
        );
    }
    const heading = /^<h([1-6])/i.exec(block);
    return new Paragraph({
      children: runs,
      ...(heading
        ? {
            heading: [
              HeadingLevel.HEADING_1,
              HeadingLevel.HEADING_2,
              HeadingLevel.HEADING_3,
              HeadingLevel.HEADING_4,
              HeadingLevel.HEADING_5,
              HeadingLevel.HEADING_6,
            ][Number(heading[1]) - 1],
          }
        : {}),
      ...(/^<li/i.test(block) ? { bullet: { level: 0 } } : {}),
    });
  });
}

export function buildPrintHtml(book: ExportBook): string {
  const preset = presetFor(book);
  const compact = book.layout === "compact";
  const bodyMargin =
    book.marginPreset === "wide"
      ? "88px"
      : book.marginPreset === "narrow"
        ? "40px"
        : compact
          ? "36px"
          : "64px";
  const dropCap = book.dropCap
    ? ".chapter p:first-of-type::first-letter{float:left;font-size:3.4em;line-height:.85;padding:0 .08em 0 0}"
    : "";
  const chapters = book.chapters
    .map(
      (chapter, index) =>
        `<article id="chapter-${index + 1}" class="chapter"><h1>${escapeHtml(chapter.title)}</h1>${richMarkup(chapter)}</article>`
    )
    .join("");
  return `<!doctype html><html lang="${escapeXml(book.language ?? "pt-BR")}"><head><meta charset="utf-8" /><title>${escapeHtml(book.title)}</title><style>body{font-family:${preset.webFont};max-width:${compact ? "860px" : "720px"};margin:${bodyMargin} auto;line-height:${preset.lineHeight};font-size:${preset.bodySize}px;color:#222}header,footer{font-size:.7em;color:#666;text-align:center;position:fixed;width:100%;left:0}header{top:12px}footer{bottom:12px}.cover{text-align:center;min-height:70vh;display:grid;place-items:center;break-after:page}.cover img{max-width:100%;max-height:70vh;object-fit:contain}.cover-placeholder{height:70vh;display:grid;place-items:center;break-after:page;background:${preset.accent};color:white;font-size:28px}.cover-placeholder span{font-family:Georgia,serif}.frontmatter{text-align:center;break-after:page}.frontmatter h1{font-size:2.2em;font-weight:${preset.titleWeight}}h1{text-align:center;font-weight:${preset.titleWeight};margin:${compact ? "48px" : "80px"} 0 32px}.toc{break-after:page}.toc h2{text-align:center}.toc li{margin:0.5em 0}.chapter,.front-matter,.back-matter{break-before:page}img{max-width:100%;height:auto}p{text-indent:${compact || preset.webFont.includes("Arial") ? "0" : "1.5em"};margin:0 0 1em;orphans:3;widows:3}${dropCap}@page{size:${book.trimSize === "a5" ? "A5" : book.trimSize === "6x9" ? "6in 9in" : "A4"};margin:24mm}@media print{body{margin:0;max-width:none}}</style></head><body>${coverMarkup(book)}<section class="frontmatter"><h1>${escapeHtml(book.title)}</h1>${book.subtitle ? `<p>${escapeHtml(book.subtitle)}</p>` : ""}<p>${escapeHtml(book.author ?? "")}</p></section>${sectionMarkup(book.frontMatter, "front-matter")}${book.includeToc === false ? "" : tocMarkup(book.chapters)}${chapters}${sectionMarkup(book.backMatter, "back-matter")}${book.headerText ? `<header>${escapeHtml(book.headerText)}</header>` : ""}${book.footerText ? `<footer>${escapeHtml(book.footerText)}</footer>` : ""}</body></html>`;
}

export async function buildEpub(book: ExportBook): Promise<Blob> {
  const zip = new JSZip();
  const preset = presetFor(book);
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
  );
  const epubMargin =
    book.marginPreset === "wide"
      ? 12
      : book.marginPreset === "narrow"
        ? 4
        : book.layout === "compact"
          ? Math.min(6, preset.margin / 12)
          : preset.margin / 6;
  const epubStyle = `body{font-family:${preset.webFont};line-height:${preset.lineHeight};font-size:${preset.bodySize}px;margin:${epubMargin}% ${Math.min(12, epubMargin + 1)}%;color:#222}h1{text-align:center;font-weight:${preset.titleWeight};margin:3em 0 1.5em}.cover{text-align:center;page-break-after:always}.cover img{max-width:100%;max-height:80vh}.cover-placeholder{height:80vh;background:${preset.accent};color:white;display:flex;align-items:center;justify-content:center}.frontmatter{text-align:center;page-break-after:always}.toc{page-break-after:always}.chapter{page-break-before:always}p{text-indent:${book.layout === "compact" || preset.webFont.includes("Arial") ? "0" : "1.5em"};margin:0 0 1em}`;
  const coverXhtml = book.coverImageUrl
    ? `<figure class="cover"><img src="${escapeXml(book.coverImageUrl)}" alt="Capa" /></figure>`
    : `<div class="cover-placeholder">Shakstory</div>`;
  const imageItems: Array<{ id: string; file: string; mime: string }> = [];
  const embedImages = (markup: string) =>
    markup.replace(
      /src=["']data:image\/(png|jpeg|webp);base64,([^"']+)["']/gi,
      (_, format, data) => {
        const id = `image-${imageItems.length + 1}`;
        const file = `images/${id}.${format === "jpeg" ? "jpg" : format}`;
        zip.file(`OEBPS/${file}`, data, { base64: true });
        imageItems.push({ id, file, mime: `image/${format}` });
        return `src="${file}"`;
      }
    );
  const chapterItems = book.chapters.map((chapter, index) => {
    const file = `chapter-${index + 1}.xhtml`;
    zip.file(
      `OEBPS/${file}`,
      `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" lang="${escapeXml(book.language ?? "pt-BR")}"><head><title>${escapeXml(chapter.title)}</title><style>${epubStyle}</style></head><body>${book.headerText ? `<header>${escapeXml(book.headerText)}</header>` : ""}<h1>${escapeXml(chapter.title)}</h1>${embedImages(richMarkup(chapter))}${book.footerText ? `<footer>${escapeXml(book.footerText)}</footer>` : ""}</body></html>`
    );
    return { id: `chapter-${index + 1}`, file, title: chapter.title };
  });
  const backItems = enabledSections(book.backMatter).map((section, index) => {
    const file = `back-${index + 1}.xhtml`;
    zip.file(
      `OEBPS/${file}`,
      `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${escapeXml(section.title)}</title><style>${epubStyle}</style></head><body>${sectionXhtml([section], "back-matter")}</body></html>`
    );
    return { id: `back-${index + 1}`, file, title: section.title };
  });
  const readingItems = [...chapterItems, ...backItems];
  const navItems = [
    ...enabledSections(book.frontMatter).map(section => ({
      file: `cover.xhtml#${section.id}`,
      title: section.title,
    })),
    ...readingItems,
  ];
  zip.file(
    "OEBPS/cover.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Capa</title><style>${epubStyle}</style></head><body>${embedImages(coverXhtml)}<section class="frontmatter"><h1>${escapeXml(book.title)}</h1>${book.subtitle ? `<p>${escapeXml(book.subtitle)}</p>` : ""}<p>${escapeXml(book.author ?? "")}</p></section>${sectionXhtml(book.frontMatter, "front-matter")}</body></html>`
  );
  zip.file(
    "OEBPS/nav.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Sumário</title></head><body><nav epub:type="toc"><h1>Sumário</h1><ol>${navItems.map(item => `<li><a href="${item.file}">${escapeXml(item.title)}</a></li>`).join("")}</ol></nav></body></html>`
  );
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:shakstory:${Date.now()}</dc:identifier><dc:title>${escapeXml(book.title)}</dc:title><dc:creator>${escapeXml(book.author ?? "")}</dc:creator><dc:language>${escapeXml(book.language ?? "pt-BR")}</dc:language>${book.category ? `<dc:subject>${escapeXml(book.category)}</dc:subject>` : ""}${book.isbn ? `<dc:identifier id="isbn">${escapeXml(book.isbn)}</dc:identifier>` : ""}<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}</meta></metadata><manifest><item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"${book.coverImageUrl?.startsWith("http") ? ' properties="remote-resources"' : ""}/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${imageItems.map(item => `<item id="${item.id}" href="${item.file}" media-type="${item.mime}"/>`).join("")}${readingItems.map(item => `<item id="${item.id}" href="${item.file}" media-type="application/xhtml+xml"${book.chapters.some(c => /src=["']https?:/i.test(c.richContent ?? "")) ? ' properties="remote-resources"' : ""}/>`).join("")}</manifest><spine><itemref idref="cover"/>${book.includeToc === false ? "" : '<itemref idref="nav"/>'}${readingItems.map(item => `<itemref idref="${item.id}"/>`).join("")}</spine></package>`
  );
  return zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
}

export function buildPdf(book: ExportBook): Blob {
  const preset = presetFor(book);
  const pdfFormat =
    book.trimSize === "a5" ? "a5" : book.trimSize === "6x9" ? [432, 648] : "a4";
  const pdf = new jsPDF({ unit: "pt", format: pdfFormat });
  const margin =
    book.marginPreset === "wide"
      ? preset.margin + 18
      : book.marginPreset === "narrow"
        ? Math.max(34, preset.margin - 18)
        : book.layout === "compact"
          ? Math.min(48, preset.margin)
          : preset.margin;
  const width = pdf.internal.pageSize.getWidth() - margin * 2;
  const height = pdf.internal.pageSize.getHeight();
  let y = margin;
  if (book.coverImageUrl?.startsWith("data:image/")) {
    const props = pdf.getImageProperties(book.coverImageUrl);
    const coverWidth = Math.min(
      width,
      ((height - 2 * margin) * props.width) / props.height
    );
    const coverHeight = (coverWidth * props.height) / props.width;
    pdf.addImage(
      book.coverImageUrl,
      "",
      (pdf.internal.pageSize.getWidth() - coverWidth) / 2,
      margin,
      coverWidth,
      coverHeight
    );
    pdf.addPage();
  }
  pdf.setFont(preset.pdfFont, "normal");
  pdf.setFontSize(28);
  const titleLines = pdf.splitTextToSize(book.title, width) as string[];
  pdf.text(titleLines, margin, y);
  y += titleLines.length * 32;
  if (book.subtitle) {
    pdf.setFontSize(14);
    const lines = pdf.splitTextToSize(book.subtitle, width) as string[];
    pdf.text(lines, margin, y);
    y += lines.length * 20;
  }
  if (book.author) {
    pdf.setFontSize(12);
    pdf.text(book.author, margin, y);
    y += 32;
  }
  const contentItems = [
    ...enabledSections(book.frontMatter),
    ...book.chapters,
    ...enabledSections(book.backMatter),
  ];
  for (let itemIndex = 0; itemIndex < contentItems.length; itemIndex++) {
    const chapter = contentItems[itemIndex];
    if (
      itemIndex === enabledSections(book.frontMatter).length &&
      book.includeToc !== false
    ) {
      pdf.addPage();
      y = margin;
      pdf.setFontSize(22);
      pdf.text("Sumário", margin, y);
      y += 32;
      pdf.setFontSize(12);
      book.chapters.forEach((chapter, index) => {
        const lines = pdf.splitTextToSize(
          `${index + 1}. ${chapter.title}`,
          width
        ) as string[];
        for (const line of lines) {
          if (y > height - margin) {
            pdf.addPage();
            y = margin;
          }
          pdf.text(line, margin, y);
          y += 20;
        }
      });
    }

    pdf.addPage();
    y = margin;
    pdf.setFont(preset.pdfFont, "bold");
    pdf.setFontSize(22);
    const titleLines = pdf.splitTextToSize(chapter.title, width) as string[];
    for (const line of titleLines) {
      if (y > height - margin) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(line, margin, y);
      y += 28;
    }
    y += 12;
    pdf.setFont(preset.pdfFont, "normal");
    pdf.setFontSize(preset.bodySize - 3);
    const rich =
      "richContent" in chapter && typeof chapter.richContent === "string"
        ? sanitizeRichContent(chapter.richContent)
        : "";
    if (!rich) {
      for (const paragraph of paragraphs(chapter.content)) {
        for (const line of pdf.splitTextToSize(paragraph, width) as string[]) {
          if (y > height - margin) {
            pdf.addPage();
            y = margin;
          }
          pdf.text(line, margin, y);
          y += preset.lineHeight * 10;
        }
        y += 8;
      }
    } else {
      let x = margin,
        bold = false,
        italic = false;
      const newline = (gap = 0) => {
        x = margin;
        y += preset.lineHeight * 10 + gap;
        if (y > height - margin) {
          pdf.addPage();
          y = margin;
        }
      };
      for (const token of rich.match(/<[^>]*>|[^<]+/g) ?? []) {
        if (/^<\/?(strong|b)[ >]/i.test(token)) bold = !token.startsWith("</");
        else if (/^<\/?(em|i)[ >]/i.test(token))
          italic = !token.startsWith("</");
        else if (/^<br|^<\/(p|div|li|h[1-6]|blockquote)>/i.test(token))
          newline(4);
        else if (/^<img/i.test(token)) {
          const src =
            /src=["'](data:image\/(png|jpeg|webp);base64,[^"']+)["']/i.exec(
              token
            );
          if (src) {
            if (x !== margin) newline();
            const props = pdf.getImageProperties(src[1]);
            const imageWidth = Math.min(width, props.width);
            const imageHeight = Math.min(
              height - 2 * margin - 20,
              (imageWidth * props.height) / props.width
            );
            if (y + imageHeight > height - margin) {
              pdf.addPage();
              y = margin;
            }
            pdf.addImage(
              src[1],
              src[2].toUpperCase(),
              margin,
              y,
              (imageHeight * props.width) / props.height,
              imageHeight
            );
            y += imageHeight;
            newline();
          }
        } else if (!token.startsWith("<")) {
          pdf.setFont(
            preset.pdfFont,
            bold && italic
              ? "bolditalic"
              : bold
                ? "bold"
                : italic
                  ? "italic"
                  : "normal"
          );
          for (const word of decodeText(token).split(/(\s+)/).filter(Boolean)) {
            const pieces =
              pdf.getTextWidth(word) > width
                ? (pdf.splitTextToSize(word, width) as string[])
                : [word];
            for (const piece of pieces) {
              const length = pdf.getTextWidth(piece);
              if (x + length > margin + width) newline();
              if (x === margin && !piece.trim()) continue;
              pdf.text(piece, x, y);
              x += length;
            }
          }
        }
      }
    }
  }
  for (let page = 1; page <= pdf.getNumberOfPages(); page += 1) {
    pdf.setPage(page);
    pdf.setFont(preset.pdfFont, "normal");
    pdf.setFontSize(8);
    if (book.headerText) pdf.text(book.headerText, margin, 18);
    if (book.footerText) pdf.text(book.footerText, margin, height - 16);
    pdf.text(
      String(page),
      pdf.internal.pageSize.getWidth() - margin,
      height - 16,
      { align: "right" }
    );
  }
  return pdf.output("blob");
}

export async function buildDocx(book: ExportBook): Promise<Blob> {
  const preset = presetFor(book);
  const docMargin =
    book.marginPreset === "wide"
      ? preset.margin * 18
      : book.marginPreset === "narrow"
        ? preset.margin * 12
        : preset.margin * 15;
  const sectionParagraphs = (sections: ExportSection[] = []) =>
    sections
      .filter(section => section.enabled !== false && section.content.trim())
      .flatMap(section => [
        new Paragraph({
          text: section.title,
          heading: HeadingLevel.HEADING_1,
          pageBreakBefore: true,
        }),
        ...paragraphs(section.content).map(
          text =>
            new Paragraph({
              text,
              style: "Normal",
              spacing: {
                after: book.layout === "compact" ? 120 : 240,
                line: Math.round(preset.lineHeight * 240),
              },
            })
        ),
      ]);
  const children = [
    ...(book.coverImageUrl?.startsWith("data:image/")
      ? docxContent({
          id: "cover",
          title: "",
          content: "",
          richContent: `<p><img src="${book.coverImageUrl}" alt="Capa" /></p>`,
        })
      : []),
    new Paragraph({
      text: book.title,
      heading: HeadingLevel.TITLE,
      pageBreakBefore: Boolean(book.coverImageUrl),
    }),
    ...(book.subtitle
      ? [new Paragraph({ children: [new TextRun(book.subtitle)] })]
      : []),
    ...(book.author
      ? [new Paragraph({ children: [new TextRun(book.author)] })]
      : []),
    ...sectionParagraphs(book.frontMatter),
    ...(book.includeToc === false
      ? []
      : [
          new Paragraph({
            text: "Sumário",
            heading: HeadingLevel.HEADING_1,
            pageBreakBefore: true,
          }),
          ...book.chapters.map(
            (chapter, index) =>
              new Paragraph({ text: `${index + 1}. ${chapter.title}` })
          ),
        ]),
    ...book.chapters.flatMap(chapter => [
      new Paragraph({
        text: chapter.title,
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: true,
      }),
      ...docxContent(chapter),
    ]),
    ...sectionParagraphs(book.backMatter),
  ];
  return Packer.toBlob(
    new Document({
      styles: {
        default: {
          document: {
            run: {
              font: preset.webFont.split(",")[0],
              size: preset.bodySize * 2,
            },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              size:
                book.trimSize === "a5"
                  ? { width: 8391, height: 11906 }
                  : book.trimSize === "6x9"
                    ? { width: 8640, height: 12960 }
                    : { width: 11906, height: 16838 },
              margin: {
                top: docMargin,
                right: docMargin,
                bottom: docMargin,
                left: docMargin,
              },
            },
          },
          headers: book.headerText
            ? {
                default: new Header({
                  children: [
                    new Paragraph({ children: [new TextRun(book.headerText)] }),
                  ],
                }),
              }
            : undefined,
          footers: book.footerText
            ? {
                default: new Footer({
                  children: [
                    new Paragraph({ children: [new TextRun(book.footerText)] }),
                  ],
                }),
              }
            : undefined,
          children,
        },
      ],
    })
  );
}

export function chaptersFromNodes(
  nodes: Array<{
    id: string;
    title: string;
    content: string;
    richContent?: string;
    kind?: string;
  }>
): ExportChapter[] {
  return nodes
    .filter(node => node.kind !== "part")
    .map(node => ({
      id: node.id,
      title: node.title,
      content: node.content,
      richContent: node.richContent,
    }));
}
