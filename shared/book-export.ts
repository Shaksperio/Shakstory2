import { publicationSections, type CopyrightData } from "./editorial-workflow";
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
  PageNumber,
  TableOfContents,
  Bookmark,
  AlignmentType,
  SectionType,
} from "docx";
import { jsPDF } from "jspdf";

export type ExportChapter = {
  kind?: string;
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
  | "reedsy"
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
  bookId?: string;
  publicationYear?: string;
  copyright?: CopyrightData;
  title: string;
  subtitle?: string;
  author?: string;
  language?: string;
  /** Código do idioma do texto exportado (ex.: "en"); ausente = português. Ajusta rótulos como "Capítulo" e "Sumário". */
  languageCode?: string;
  /** Texto de direitos autorais já traduzido (substitui o gerado em português). */
  copyrightText?: string;
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


export type ExportLabels = { chapter: (n: number) => string; contents: string; contentsCont: string; cover: string; dir?: "rtl" };
const same = (word: string) => (n: number) => `${word} ${n}`;
const EXPORT_LABELS: Record<string, ExportLabels> = {
  pt: { chapter: same("Capítulo"), contents: "Sumário", contentsCont: "Sumário — continuação", cover: "Capa" },
  en: { chapter: same("Chapter"), contents: "Contents", contentsCont: "Contents — continued", cover: "Cover" },
  es: { chapter: same("Capítulo"), contents: "Índice", contentsCont: "Índice — continuación", cover: "Portada" },
  fr: { chapter: same("Chapitre"), contents: "Table des matières", contentsCont: "Table des matières — suite", cover: "Couverture" },
  de: { chapter: same("Kapitel"), contents: "Inhaltsverzeichnis", contentsCont: "Inhaltsverzeichnis — Fortsetzung", cover: "Umschlag" },
  it: { chapter: same("Capitolo"), contents: "Indice", contentsCont: "Indice — continua", cover: "Copertina" },
  "pt-pt": { chapter: same("Capítulo"), contents: "Índice", contentsCont: "Índice — continuação", cover: "Capa" },
  nl: { chapter: same("Hoofdstuk"), contents: "Inhoud", contentsCont: "Inhoud — vervolg", cover: "Omslag" },
  pl: { chapter: same("Rozdział"), contents: "Spis treści", contentsCont: "Spis treści — ciąg dalszy", cover: "Okładka" },
  ru: { chapter: same("Глава"), contents: "Содержание", contentsCont: "Содержание — продолжение", cover: "Обложка" },
  tr: { chapter: same("Bölüm"), contents: "İçindekiler", contentsCont: "İçindekiler — devam", cover: "Kapak" },
  ar: { chapter: same("الفصل"), contents: "المحتويات", contentsCont: "المحتويات — تابع", cover: "الغلاف", dir: "rtl" },
  ja: { chapter: n => `第${n}章`, contents: "目次", contentsCont: "目次 — 続き", cover: "表紙" },
  ko: { chapter: n => `${n}장`, contents: "목차", contentsCont: "목차 — 계속", cover: "표지" },
  "zh-cn": { chapter: n => `第${n}章`, contents: "目录", contentsCont: "目录 — 续", cover: "封面" },
};
/** Rótulos do livro exportado no idioma pedido (português quando não há código). */
export function exportLabels(code?: string): ExportLabels {
  const key = (code ?? "pt").replace("_", "-").toLowerCase();
  return EXPORT_LABELS[key] ?? EXPORT_LABELS[key.split("-")[0]] ?? EXPORT_LABELS.pt;
}
/** O PDF usa fontes padrão (só alfabeto latino ocidental): estes idiomas precisam de DOCX, EPUB ou HTML. */
export const PDF_UNSUPPORTED_LANGUAGES = ["pl", "ru", "tr", "ar", "ja", "ko", "zh-cn"];
export const pdfSupportsLanguage = (code?: string) => !PDF_UNSUPPORTED_LANGUAGES.includes((code ?? "pt").toLowerCase());
const CHAPTER_WORDS = "cap[ií]tulo|chapter|chapitre|kapitel|capitolo|hoofdstuk|rozdzia[łl]|глава|bölüm|الفصل";
const SPECIAL_TITLE = /^(pr[oó]logo|ep[ií]logo|introdu[cç][aã]o|posf[aá]cio|prologue|epilogue|[eé]pilogue|introduction|afterword|pr[oó]log|epilog|einleitung|nachwort|prefazione|introduzione|postfazione|prolog|epiloog)\b/i;

type Preset = {
  label: string;
  webFont: string;
  pdfFont: "times" | "helvetica" | "courier";
  bodySize: number;
  lineHeight: number;
  titleWeight: string;
  accent: string;
  margin: number;
  /** Fonte dos títulos (padrão: a do corpo). */
  headingFont?: string;
  /** Texto justificado (padrão do estilo Reedsy). */
  justify?: boolean;
  /** Sem recuo de primeira linha; os parágrafos se separam por espaço (em). */
  paragraphGap?: number;
  /** Entrelinha própria no DOCX e no PDF (o web usa lineHeight). */
  docLine?: number;
  pdfLine?: number;
};
export const TYPOGRAPHY_PRESETS: Record<TypographyPreset, Preset> = {
  reedsy: {
    label: "Reedsy · leitura confortável",
    webFont: 'Gelasio, Georgia, "Times New Roman", serif',
    headingFont: 'Lato, "Helvetica Neue", Arial, sans-serif',
    pdfFont: "times",
    bodySize: 18,
    lineHeight: 1.9,
    titleWeight: "700",
    accent: "#17a2d8",
    margin: 72,
    justify: true,
    paragraphGap: 1,
    docLine: 1.6,
    pdfLine: 1.55,
  },
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

/** One contract for quick exports, preparation and every file format. */
export function normalizeExportBook(book: ExportBook): ExportBook {
  let number = 0;
  const chapters = book.chapters.map(chapter => {
    if (
      chapter.kind === "part" ||
      chapter.kind === "front_matter" ||
      chapter.kind === "back_matter" ||
      SPECIAL_TITLE.test(chapter.title)
    )
      return { ...chapter };
    number++;
    const title = chapter.title
      .replace(new RegExp(`^(?:${CHAPTER_WORDS})(?:\\s+\\d+)?\\s*(?:[—–:.-]\\s*)?`, "i"), "")
      .trim();
    return {
      ...chapter,
      title: `${exportLabels(book.languageCode).chapter(number)}${title ? ` — ${title}` : ""}`,
    };
  });
  return {
    ...book,
    author: book.copyright?.penName || book.author,
    frontMatter: publicationSections(book).map(section =>
      section.id === "copyright" && book.copyrightText ? { ...section, content: book.copyrightText } : section
    ),
    chapters,
  };
}
export function buildText(book: ExportBook): string {
  book = normalizeExportBook(book);
  const sections = [
    ...enabledSections(book.frontMatter),
    ...book.chapters,
    ...enabledSections(book.backMatter),
  ];
  return [
    book.title,
    book.subtitle,
    book.author,
    ...(book.includeToc === false
      ? []
      : [exportLabels(book.languageCode).contents, ...sections.map(s => s.title)]),
    ...sections.map(s => `${s.title}\n\n${s.content}`),
  ]
    .filter(Boolean)
    .join("\n\n");
}

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
  TYPOGRAPHY_PRESETS[book.typography ?? "reedsy"] ?? TYPOGRAPHY_PRESETS.reedsy;
/** CSS dos parágrafos: recuo clássico ou, no estilo Reedsy, sem recuo e com espaço entre parágrafos; justificado quando o estilo pede. */
const paragraphCss = (preset: Preset, compact: boolean, print: boolean) =>
  `p{text-indent:${preset.paragraphGap || compact || preset.webFont.includes("Arial") ? "0" : "1.5em"};margin:0 0 ${preset.paragraphGap ?? 1}em;${preset.justify ? "text-align:justify;hyphens:auto;" : ""}${print ? "orphans:3;widows:3" : ""}}`;
const paragraphs = (content: string) => {
  const blocks = content
    .split(/\n{2,}/)
    .map(text => text.trim())
    .filter(Boolean);
  // Texto com quebras simples (sem linha em branco): cada linha é um parágrafo.
  return blocks.length === 1 && /\n/.test(blocks[0])
    ? blocks[0].split(/\n/).map(text => text.trim()).filter(Boolean)
    : blocks;
};
const coverMarkup = (book: ExportBook) =>
  book.coverImageUrl
    ? `<figure class="cover"><img src="${escapeXml(book.coverImageUrl)}" alt="Capa de ${escapeHtml(book.title)}" /></figure>`
    : "";
const tocMarkup = (chapters: Array<{ title: string; href?: string }>, label = "Sumário") =>
  `<nav class="toc" aria-label="${escapeHtml(label)}"><h2>${escapeHtml(label)}</h2><ol>${chapters.map((chapter, index) => `<li><a href="${chapter.href ?? `#chapter-${index + 1}`}">${escapeHtml(chapter.title)}</a></li>`).join("")}</ol></nav>`;
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
    return paragraphs(chapter.content).map(
      text => new Paragraph({ text, style: "BookBody" })
    );
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
      ...(!heading && !/^<li/i.test(block) ? { style: "BookBody" } : {}),
    });
  });
}

export function buildPrintHtml(book: ExportBook): string {
  book = normalizeExportBook(book);
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
  return `<!doctype html><html lang="${escapeXml(book.languageCode ?? book.language ?? "pt-BR")}"${exportLabels(book.languageCode).dir ? ` dir="rtl"` : ""}><head><meta charset="utf-8" /><title>${escapeHtml(book.title)}</title><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gelasio:ital,wght@0,400;0,700;1,400&family=Lato:wght@400;700;900&display=swap" /><style>body{font-family:${preset.webFont};max-width:${compact ? "860px" : "720px"};margin:${bodyMargin} auto;line-height:${preset.lineHeight};font-size:${preset.bodySize}px;color:#222}header,footer{font-size:.7em;color:#666;text-align:center;position:fixed;width:100%;left:0}header{top:12px}footer{bottom:12px}.cover{text-align:center;min-height:70vh;display:grid;place-items:center;break-after:page}.cover img{max-width:100%;max-height:70vh;object-fit:contain}.cover-placeholder{height:70vh;display:grid;place-items:center;break-after:page;background:${preset.accent};color:white;font-size:28px}.cover-placeholder span{font-family:Georgia,serif}.frontmatter{text-align:center;break-after:page}.frontmatter h1{font-size:2.2em;font-weight:${preset.titleWeight}}h1,h2{font-family:${preset.headingFont ?? preset.webFont}}h1{text-align:center;font-weight:${preset.titleWeight};margin:${compact ? "48px" : "80px"} 0 32px}.toc{break-after:page}.toc h2{text-align:center}.toc ol{list-style:none;padding:0}.toc li{margin:.75em 0;border-bottom:1px dotted #ccc;padding-bottom:.5em}.toc a{color:inherit;text-decoration:none}.front-matter p{text-indent:0;font-size:.85em;line-height:1.55}.chapter h1{font-size:1.8em;max-width:85%;margin:3em auto 2em}.chapter,.front-matter,.back-matter{break-before:page}img{max-width:100%;height:auto}${paragraphCss(preset, compact, true)}${dropCap}@page{@bottom-center{content:counter(page);font-size:9pt}size:${book.trimSize === "a5" ? "A5" : book.trimSize === "6x9" ? "6in 9in" : "A4"};margin:24mm}@media screen{body{background:#f2f0ec;padding:24px}.chapter,.front-matter,.back-matter,.frontmatter,.toc{background:white;padding:48px;margin:24px 0;box-shadow:0 4px 24px #0000000d;min-height:70vh}}@media print{body{margin:0;max-width:none}.toc a::after{content:leader(dotted) target-counter(attr(href),page)}}</style></head><body>${coverMarkup(book)}<section class="frontmatter"><h1>${escapeHtml(book.title)}</h1>${book.subtitle ? `<p>${escapeHtml(book.subtitle)}</p>` : ""}<p>${escapeHtml(book.author ?? "")}</p></section>${sectionMarkup(book.frontMatter, "front-matter")}${book.includeToc === false ? "" : tocMarkup([...enabledSections(book.frontMatter).map(s => ({ title: s.title, href: `#${s.id}` })), ...book.chapters.map((s, i) => ({ title: s.title, href: `#chapter-${i + 1}` })), ...enabledSections(book.backMatter).map(s => ({ title: s.title, href: `#${s.id}` }))], exportLabels(book.languageCode).contents)}${chapters}${sectionMarkup(book.backMatter, "back-matter")}${book.headerText ? `<header>${escapeHtml(book.headerText)}</header>` : ""}${book.footerText ? `<footer>${escapeHtml(book.footerText)}</footer>` : ""}</body></html>`;
}

export async function buildEpub(book: ExportBook): Promise<Blob> {
  book = normalizeExportBook(book);
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
  const epubStyle = `body{font-family:${preset.webFont};line-height:${preset.lineHeight};font-size:${preset.bodySize}px;margin:${epubMargin}% ${Math.min(12, epubMargin + 1)}%;color:#222}h1,h2{font-family:${preset.headingFont ?? preset.webFont}}h1{text-align:center;font-weight:${preset.titleWeight};margin:3em 0 1.5em}.cover{text-align:center;page-break-after:always}.cover img{max-width:100%;max-height:80vh}.cover-placeholder{height:80vh;background:${preset.accent};color:white;display:flex;align-items:center;justify-content:center}.frontmatter{text-align:center;page-break-after:always}.toc{page-break-after:always}.chapter,.front-matter,.back-matter{page-break-before:always}${paragraphCss(preset, book.layout === "compact", false)}`;
  const coverXhtml = book.coverImageUrl
    ? `<figure class="cover"><img src="${escapeXml(book.coverImageUrl)}" alt="Capa" /></figure>`
    : "";
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
      `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" lang="${escapeXml(book.languageCode ?? book.language ?? "pt-BR")}"><head><title>${escapeXml(chapter.title)}</title><style>${epubStyle}</style></head><body>${book.headerText ? `<header>${escapeXml(book.headerText)}</header>` : ""}<h1>${escapeXml(chapter.title)}</h1>${embedImages(richMarkup(chapter))}${book.footerText ? `<footer>${escapeXml(book.footerText)}</footer>` : ""}</body></html>`
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
    `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${escapeXml(exportLabels(book.languageCode).contents)}</title></head><body><nav epub:type="toc"><h1>${escapeXml(exportLabels(book.languageCode).contents)}</h1><ol>${navItems.map(item => `<li><a href="${item.file}">${escapeXml(item.title)}</a></li>`).join("")}</ol></nav></body></html>`
  );
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:shakstory:${escapeXml(book.bookId || book.title)}</dc:identifier><dc:title>${escapeXml(book.title)}</dc:title><dc:creator>${escapeXml(book.author ?? "")}</dc:creator><dc:language>${escapeXml(book.language ?? "pt-BR")}</dc:language>${book.category ? `<dc:subject>${escapeXml(book.category)}</dc:subject>` : ""}${book.isbn ? `<dc:identifier id="isbn">${escapeXml(book.isbn)}</dc:identifier>` : ""}${book.publicationDate || book.publicationYear || book.copyright?.year ? `<dc:date>${escapeXml(book.publicationDate || book.publicationYear || book.copyright?.year || "")}</dc:date>` : ""}<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, "Z")}</meta></metadata><manifest><item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"${book.coverImageUrl?.startsWith("http") ? ' properties="remote-resources"' : ""}/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${imageItems.map(item => `<item id="${item.id}" href="${item.file}" media-type="${item.mime}"/>`).join("")}${readingItems.map(item => `<item id="${item.id}" href="${item.file}" media-type="application/xhtml+xml"${book.chapters.some(c => /src=["']https?:/i.test(c.richContent ?? "")) ? ' properties="remote-resources"' : ""}/>`).join("")}</manifest><spine><itemref idref="cover"/>${book.includeToc === false ? "" : '<itemref idref="nav"/>'}${readingItems.map(item => `<itemref idref="${item.id}"/>`).join("")}</spine></package>`
  );
  return zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
}

let embeddedPdfFonts: Record<string, string> | undefined;
export async function loadPdfFonts(): Promise<void> {
  embeddedPdfFonts = (await import("./pdf-fonts")).PDF_FONTS;
}
export function buildPdf(book: ExportBook): Blob {
  book = normalizeExportBook(book);
  const preset = presetFor(book);
  const pdfFormat =
    book.trimSize === "a5" ? "a5" : book.trimSize === "6x9" ? [432, 648] : "a4";
  const pdf = new jsPDF({
    unit: "pt",
    format: pdfFormat,
    putOnlyUsedFonts: true,
  });
  const bodyFamily = preset.pdfFont === "times" ? "Serif" : "Sans";
  const headFamily = preset.headingFont ? "Sans" : bodyFamily;
  const pdfFont = embeddedPdfFonts ? `Shakstory${bodyFamily}` : preset.pdfFont;
  // Títulos em fonte sem serifa quando o estilo pede (Reedsy); o corpo segue a fonte do estilo.
  const headPdfFont = embeddedPdfFonts
    ? `Shakstory${headFamily}`
    : preset.headingFont
      ? "helvetica"
      : preset.pdfFont;
  if (embeddedPdfFonts) {
    for (const family of Array.from(new Set([bodyFamily, headFamily]))) {
      for (const style of ["normal", "bold", "italic", "bolditalic"]) {
        const file = `Shakstory-${family}-${style}.ttf`;
        pdf.addFileToVFS(file, embeddedPdfFonts[`${family}-${style}`]);
        pdf.addFont(file, `Shakstory${family}`, style);
      }
    }
  }
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
  const bodyFontSize = preset.bodySize * 0.75;
  let contentLineHeight = bodyFontSize * 1.3;
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
  pdf.setFont(headPdfFont, preset.headingFont ? "bold" : "normal");
  y = height * 0.3;
  pdf.setFontSize(28);
  const titleLines = pdf.splitTextToSize(book.title, width) as string[];
  pdf.text(titleLines, margin + width / 2, y, { align: "center" });
  y += titleLines.length * 32;
  if (book.subtitle) {
    pdf.setFontSize(14);
    const lines = pdf.splitTextToSize(book.subtitle, width) as string[];
    pdf.text(lines, margin + width / 2, y, { align: "center" });
    y += lines.length * 20;
  }
  if (book.author) {
    pdf.setFontSize(12);
    pdf.text(pdf.splitTextToSize(book.author, width), margin + width / 2, y, {
      align: "center",
    });
    y += 32;
  }
  pdf.setProperties({
    title: book.title,
    author: book.author ?? "",
    subject: book.description ?? "",
    keywords: [book.bookId, book.isbn].filter(Boolean).join(", "),
  });
  const front = enabledSections(book.frontMatter);
  const contentItems = [
    ...front,
    ...book.chapters,
    ...enabledSections(book.backMatter),
  ];
  const pageEntries: Array<{ title: string; page: number }> = [];
  const tocPages: number[] = [];
  const tocLayout: Array<{
    title: string;
    lines: string[];
    pageIndex: number;
    y: number;
    entryIndex: number;
  }> = [];
  if (book.includeToc !== false) {
    pdf.setFontSize(12);
    let pageIndex = 0,
      rowY = margin + 44;
    for (let entryIndex = 0; entryIndex < contentItems.length; entryIndex++) {
      const item = contentItems[entryIndex];
      const lines = pdf.splitTextToSize(item.title, width - 44) as string[];
      for (let index = 0; index < lines.length; index++) {
        if (rowY > height - margin - 20) {
          pageIndex++;
          rowY = margin + 44;
        }
        tocLayout.push({
          title: item.title,
          lines: [lines[index]],
          pageIndex,
          y: rowY,
          entryIndex,
        });
        rowY += 19;
      }
      rowY += 9;
    }
  }
  for (let itemIndex = 0; itemIndex < contentItems.length; itemIndex++) {
    const chapter = contentItems[itemIndex];
    if (itemIndex === front.length && book.includeToc !== false) {
      const pages = Math.max(1, (tocLayout.at(-1)?.pageIndex ?? 0) + 1);
      for (let i = 0; i < pages; i++) {
        pdf.addPage();
        tocPages.push(pdf.getNumberOfPages());
      }
    }
    pdf.addPage();
    y = margin + 24;
    pageEntries.push({ title: chapter.title, page: pdf.getNumberOfPages() });
    pdf.setFont(headPdfFont, "bold");
    pdf.setFontSize(22);
    const titleLines = pdf.splitTextToSize(chapter.title, width) as string[];
    for (const line of titleLines) {
      if (y > height - margin) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(line, margin + width / 2, y, { align: "center" });
      y += 28;
    }
    y += 12;
    pdf.setFont(pdfFont, "normal");
    const contentFontSize = chapter.id === "copyright" ? 10.5 : bodyFontSize;
    contentLineHeight = contentFontSize * (preset.pdfLine ?? 1.35);
    const paragraphGapPt = preset.paragraphGap ? contentFontSize * preset.paragraphGap * 0.9 : 8;
    pdf.setFontSize(contentFontSize);
    const rich =
      "richContent" in chapter && typeof chapter.richContent === "string"
        ? sanitizeRichContent(chapter.richContent)
        : "";
    if (!rich) {
      for (const paragraph of paragraphs(chapter.content)) {
        const lines = pdf.splitTextToSize(paragraph, width) as string[];
        if (lines.length > 1 && y + contentLineHeight > height - margin) {
          pdf.addPage();
          y = margin;
        }
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
          const line = lines[lineIndex];
          if (
            lines.length - lineIndex === 2 &&
            y + contentLineHeight > height - margin
          ) {
            pdf.addPage();
            y = margin;
          }
          if (y > height - margin) {
            pdf.addPage();
            y = margin;
          }
          if (preset.justify && lineIndex < lines.length - 1 && line.includes(" "))
            pdf.text(line, margin, y, { align: "justify", maxWidth: width });
          else pdf.text(line, margin, y);
          y += contentLineHeight;
        }
        y += paragraphGapPt;
      }
    } else {
      let bold = false,
        italic = false;
      type Piece = { text: string; style: string; w: number };
      let line: Piece[] = [];
      let lineW = 0;
      const drawLine = (justify: boolean) => {
        while (line.length && !line[line.length - 1].text.trim()) lineW -= line.pop()!.w;
        if (!line.length) return;
        const gaps = line.filter(piece => !piece.text.trim()).length;
        let extra = 0;
        if (justify && gaps > 0 && lineW < width) {
          extra = (width - lineW) / gaps;
          if (extra > contentFontSize * 1.5) extra = 0; // não estica demais linhas curtas
        }
        let cursor = margin;
        for (const piece of line) {
          pdf.setFont(pdfFont, piece.style);
          pdf.text(piece.text, cursor, y);
          cursor += piece.w + (piece.text.trim() ? 0 : extra);
        }
        line = [];
        lineW = 0;
      };
      const newline = (gap = 0, justify = false) => {
        drawLine(justify);
        y += contentLineHeight + gap;
        if (y > height - margin) {
          pdf.addPage();
          y = margin;
        }
      };
      const paragraphEnd = preset.paragraphGap ? paragraphGapPt : 4;
      for (const token of rich.match(/<[^>]*>|[^<]+/g) ?? []) {
        if (/^<\/?(strong|b)[ >]/i.test(token)) bold = !token.startsWith("</");
        else if (/^<\/?(em|i)[ >]/i.test(token))
          italic = !token.startsWith("</");
        else if (/^<br/i.test(token)) newline(4);
        else if (/^<\/(p|div|li|h[1-6]|blockquote)>/i.test(token))
          newline(paragraphEnd);
        else if (/^<img/i.test(token)) {
          const src =
            /src=["'](data:image\/(png|jpeg|webp);base64,[^"']+)["']/i.exec(
              token
            );
          if (src) {
            if (line.length) newline();
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
          const style =
            bold && italic
              ? "bolditalic"
              : bold
                ? "bold"
                : italic
                  ? "italic"
                  : "normal";
          pdf.setFont(pdfFont, style);
          for (const word of decodeText(token).split(/(\s+)/).filter(Boolean)) {
            const pieces =
              pdf.getTextWidth(word) > width
                ? (pdf.splitTextToSize(word, width) as string[])
                : [word];
            for (const piece of pieces) {
              const length = pdf.getTextWidth(piece);
              if (lineW + length > width) newline(0, Boolean(preset.justify));
              if (!line.length && !piece.trim()) continue;
              line.push({ text: piece, style, w: length });
              lineW += length;
            }
          }
        }
      }
      drawLine(false);
    }
  }
  // Fill reserved TOC pages after composition, using actual page destinations.
  for (let i = 0; i < tocPages.length; i++) {
    pdf.setPage(tocPages[i]);
    pdf.setFont(headPdfFont, preset.headingFont ? "bold" : "normal");
    pdf.setFontSize(22);
    pdf.text(
      i ? exportLabels(book.languageCode).contentsCont : exportLabels(book.languageCode).contents,
      margin + width / 2,
      margin,
      { align: "center" }
    );
    pdf.setFont(pdfFont, "normal");
    pdf.setFontSize(12);
    const rows = tocLayout.filter(row => row.pageIndex === i);
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index],
        entry = pageEntries[row.entryIndex];
      pdf.text(row.lines[0], margin, row.y);
      pdf.link(margin, row.y - 12, width, 18, { pageNumber: entry?.page ?? 1 });
      if (
        index === rows.length - 1 ||
        rows[index + 1].entryIndex !== row.entryIndex
      ) {
        const leaderStart = margin + pdf.getTextWidth(row.lines[0]) + 12;
        if (leaderStart < margin + width - 30) {
          pdf.setDrawColor(170);
          pdf.setLineWidth(0.4);
          pdf.setLineDashPattern([1, 2], 0);
          pdf.line(leaderStart, row.y - 3, margin + width - 25, row.y - 3);
          pdf.setLineDashPattern([], 0);
        }
        pdf.text(String(entry?.page ?? ""), margin + width, row.y, {
          align: "right",
        });
      }
    }
  }
  for (let page = 1; page <= pdf.getNumberOfPages(); page += 1) {
    pdf.setPage(page);
    pdf.setFont(pdfFont, "normal");
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
  book = normalizeExportBook(book);
  const preset = presetFor(book);
  const docMargin =
    book.marginPreset === "wide"
      ? preset.margin * 18
      : book.marginPreset === "narrow"
        ? preset.margin * 12
        : preset.margin * 15;
  // Tamanhos: a predefinição está em px da web; no Word 1px ≈ 0,75pt, e um livro impresso usa ~11–12pt.
  const bodyHalfPoints = Math.max(20, Math.min(26, Math.round(preset.bodySize * 1.4)));
  const classicBody = !(book.layout === "compact" || preset.webFont.includes("Arial") || preset.paragraphGap);
  const headingFamily = (preset.headingFont ?? preset.webFont).split(",")[0].replace(/["']/g, "").trim();
  const lineSpacing = Math.round((preset.docLine ?? Math.min(preset.lineHeight, 1.35)) * 240);
  const sectionParagraphs = (sections: ExportSection[] = [], offset = 0) =>
    sections
      .filter(section => section.enabled !== false && section.content.trim())
      .map((section, index) => [
        new Paragraph({
          children: [
            new Bookmark({
              id: `section_${offset + index}`,
              children: [new TextRun(section.title)],
            }),
          ],
          heading: HeadingLevel.HEADING_1,
        }),
        ...paragraphs(section.content).map(
          text => new Paragraph({ text, style: "BookBody" })
        ),
      ]);
  const frontCount = enabledSections(book.frontMatter).length;
  // Cada parte do livro vira uma seção do Word com quebra de página: nenhum capítulo começa no meio do anterior.
  const parts: Paragraph[][] = [
    [
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
        ? [new Paragraph({ children: [new TextRun({ text: book.subtitle, italics: true, size: bodyHalfPoints + 6 })], alignment: AlignmentType.CENTER, spacing: { after: 240 } })]
        : []),
      ...(book.author
        ? [new Paragraph({ children: [new TextRun({ text: book.author, size: bodyHalfPoints + 4 })], alignment: AlignmentType.CENTER, spacing: { before: 480 } })]
        : []),
    ],
    ...sectionParagraphs(book.frontMatter),
    ...(book.includeToc === false
      ? []
      : [
          [
            new Paragraph({
              text: exportLabels(book.languageCode).contents,
              heading: HeadingLevel.HEADING_1,
            }),
            new TableOfContents(exportLabels(book.languageCode).contents, {
              hyperlink: true,
              headingStyleRange: "1-1",
              beginDirty: true,
              cachedEntries: [
                ...enabledSections(book.frontMatter),
                ...book.chapters,
                ...enabledSections(book.backMatter),
              ].map((item, index) => ({
                title: item.title,
                level: 1,
                href: `section_${index}`,
              })),
            }) as unknown as Paragraph,
          ],
        ]),
    ...book.chapters.map((chapter, index) => [
      new Paragraph({
        children: [
          new Bookmark({
            id: `section_${frontCount + index}`,
            children: [new TextRun(chapter.title)],
          }),
        ],
        heading: HeadingLevel.HEADING_1,
      }),
      ...docxContent(chapter),
    ]),
    ...sectionParagraphs(book.backMatter, frontCount + book.chapters.length),
  ];
  const pageProperties = (first: boolean) => ({
    type: first ? undefined : SectionType.NEXT_PAGE,
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
  });
  const makeHeaders = () =>
    book.headerText
      ? {
          default: new Header({
            children: [new Paragraph({ children: [new TextRun(book.headerText)] })],
          }),
        }
      : undefined;
  const makeFooters = () => ({
    default: new Footer({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            ...(book.footerText ? [new TextRun(`${book.footerText} · `)] : []),
            new TextRun({ children: [PageNumber.CURRENT] }),
          ],
        }),
      ],
    }),
  });
  const headingFont = { bold: Number(preset.titleWeight) >= 600 || preset.titleWeight === "bold" };
  return Packer.toBlob(
    new Document({
      title: book.title,
      creator: book.author,
      description: book.description,
      features: { updateFields: true },
      styles: {
        default: {
          document: {
            run: {
              font: preset.webFont.split(",")[0].replace(/["']/g, ""),
              size: bodyHalfPoints,
            },
          },
          title: {
            run: { size: 56, font: headingFamily, ...headingFont },
            paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 3600, after: 360 } },
          },
          heading1: {
            run: { size: Math.round(bodyHalfPoints * 1.6), font: headingFamily, ...headingFont },
            paragraph: { alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 1200, after: 600 } },
          },
          heading2: {
            run: { size: Math.round(bodyHalfPoints * 1.25), font: headingFamily, ...headingFont },
            paragraph: { alignment: AlignmentType.LEFT, keepNext: true, spacing: { before: 360, after: 200 } },
          },
        },
        paragraphStyles: [
          {
            id: "BookBody",
            name: "Corpo do livro",
            basedOn: "Normal",
            quickFormat: true,
            run: { size: bodyHalfPoints },
            paragraph: {
              alignment: AlignmentType.JUSTIFIED,
              spacing: { line: lineSpacing, after: preset.paragraphGap ? Math.round(bodyHalfPoints * 10 * preset.paragraphGap) : classicBody ? 0 : 160 },
              indent: classicBody ? { firstLine: 567 } : undefined,
            },
          },
        ],
      },
      sections: parts.map((children, index) => ({
        properties: pageProperties(index === 0),
        headers: makeHeaders(),
        footers: makeFooters(),
        children,
      })),
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
  return nodes.map(node => ({
    kind: node.kind,
    id: node.id,
    title: node.title,
    content: node.content,
    richContent: node.richContent,
  }));
}
