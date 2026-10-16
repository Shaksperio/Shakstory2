// Cowila: seções da estrutura do livro (capítulos, prólogo, prefácio, posfácio, epílogo, sumário…).
// Tudo aqui é determinístico e testável; a Cowila só grava depois que o autor aprova o conteúdo mostrado.
import type { CBook, CNode, Level } from "./project";

export type SectionArea = "chapter" | "front" | "back" | "toc";
export type SectionTarget = { area: SectionArea; key: string; title: string; position?: "start" | "end" };

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const SECTIONS: Array<{ re: RegExp; target: SectionTarget }> = [
  { re: /prologo/, target: { area: "chapter", key: "prologue", title: "Prólogo", position: "start" } },
  { re: /epilogo/, target: { area: "chapter", key: "epilogue", title: "Epílogo", position: "end" } },
  { re: /prefacio/, target: { area: "front", key: "preface", title: "Prefácio" } },
  { re: /dedicatoria/, target: { area: "front", key: "dedication", title: "Dedicatória" } },
  { re: /epigrafe/, target: { area: "front", key: "epigraph", title: "Epígrafe" } },
  { re: /apresentacao/, target: { area: "front", key: "presentation", title: "Apresentação" } },
  { re: /agradecimento/, target: { area: "front", key: "acknowledgements", title: "Agradecimentos" } },
  { re: /posfacio/, target: { area: "back", key: "afterword", title: "Posfácio" } },
  { re: /sobre o autor|biografia do autor/, target: { area: "back", key: "about-author", title: "Sobre o autor" } },
  { re: /glossario/, target: { area: "back", key: "glossary", title: "Glossário" } },
  { re: /sumario|indice/, target: { area: "toc", key: "toc", title: "Sumário" } },
  { re: /capitulo/, target: { area: "chapter", key: "chapter", title: "Novo capítulo", position: "end" } },
];

const WRITE_VERB = /\b(escrev\w*|cri[ae]\w*|ger[ae]\w*|redij\w*|elabor\w*|monte|montar|fa[cz]a|faca|grav\w*|salv\w*|adicion\w*|inclu\w*|insir\w*)\b/;

/** Pedido para escrever/gravar uma seção do livro. Reescrita de capítulo existente não entra aqui. */
export function detectSection(message: string): SectionTarget | null {
  const m = fold(message);
  if (/reescrev/.test(m) || /personagen/.test(m)) return null;
  if (!WRITE_VERB.test(m)) return null;
  const found = SECTIONS.find(item => item.re.test(m));
  return found ? { ...found.target } : null;
}

/** Sumário gerado dos capítulos (partes viram títulos de grupo). */
export function buildToc(nodes: CNode[]): string {
  const lines: string[] = [];
  let chapter = 0;
  for (const node of nodes) {
    if (node.kind === "part") lines.push(node.title.toUpperCase());
    else { chapter++; lines.push(`${chapter}. ${node.title}`); }
  }
  return lines.join("\n");
}

export function sectionPrompt(target: SectionTarget, level: Level, request: string): string {
  const voice = level === "iniciante" ? "O autor é iniciante: entregue o texto pronto, sem jargão. " : "O autor é experiente: entregue só o texto, sem explicações. ";
  const what = target.key === "chapter" ? "um NOVO CAPÍTULO" : `o texto de ${target.title.toUpperCase()}`;
  return (
    `Tarefa: escreva ${what} para o livro do autor, em português do Brasil, na voz e no estilo dos capítulos já escritos. ${voice}` +
    "Use SOMENTE fatos, nomes e acontecimentos que estão no resumo do projeto e no pedido do autor; não invente dados reais sobre o autor. " +
    "Formato obrigatório: a primeira linha é `TÍTULO: <título curto>`, seguida de uma linha em branco e do texto em parágrafos. " +
    "Nada de comentários, markdown, introduções ou despedidas.\n\nPedido do autor: " + request
  );
}

const CHATTY = /^(claro|certo|com certeza|aqui est|segue|ok[,!. ]|desculp|n[aã]o consigo|como (uma )?ia)/i;

/** Extrai título e texto da resposta da IA; devolve null se vier vazio, curto ou em tom de conversa. */
export function parseSection(raw: string, target: SectionTarget): { title: string; content: string } | null {
  let text = (raw || "").replace(/\r/g, "").replace(/^```\w*\n?|```$/g, "").trim();
  if (!text || CHATTY.test(text)) return null;
  let title = target.title;
  const match = text.match(/^\s*(?:t[ií]tulo|title)\s*:\s*(.+)\n+/i);
  if (match) { title = match[1].replace(/^["“*#\s]+|["”*\s]+$/g, "").slice(0, 120) || title; text = text.slice(match[0].length).trim(); }
  text = text.replace(/\*\*|^#+\s*/gm, "").trim();
  if ((text.match(/\S+/g) ?? []).length < 20) return null;
  if (target.key !== "chapter") title = target.title;
  return { title, content: text };
}

/** Capítulos pedidos pelo nome ou número na mensagem, com texto completo (o resumo só traz o começo). */
export function focusedChapters(book: CBook | undefined, message: string, max = 6000): string {
  if (!book) return "";
  const m = fold(message);
  const body = book.nodes.filter(node => node.kind !== "part");
  const picked = body.filter((node, index) => {
    const title = fold(node.title);
    const number = m.match(/capitulo\s+(\d{1,3})\b/)?.[1];
    return (title.length >= 3 && m.includes(title)) || (number !== undefined && Number(number) === index + 1);
  }).slice(0, 2);
  return picked.map(node => `TEXTO COMPLETO DE "${node.title}":\n${node.content.slice(0, max)}`).join("\n\n");
}

/** Seções já preenchidas (prefácio, posfácio…) para a Cowila saber o que existe. */
export function matterSummary(publication?: { frontMatter?: Array<{ title: string; content: string; enabled?: boolean }>; backMatter?: Array<{ title: string; content: string; enabled?: boolean }>; includeToc?: boolean }): string {
  if (!publication) return "";
  const rows = [...(publication.frontMatter ?? []), ...(publication.backMatter ?? [])]
    .filter(section => section.content?.trim())
    .map(section => `- ${section.title} (${(section.content.match(/\S+/g) ?? []).length} palavras): ${section.content.replace(/\s+/g, " ").slice(0, 160)}`);
  return (rows.length ? "SEÇÕES DO LIVRO JÁ ESCRITAS:\n" + rows.join("\n") : "") + (publication.includeToc ? "\nSumário: ativado." : "");
}

/** Texto que já existe na parte pedida (para avisar antes de substituir). */
export function existingSection(book: CBook, target: SectionTarget): string | undefined {
  if (target.area === "chapter") {
    if (target.key === "chapter") return undefined;
    return book.nodes.find(node => node.kind !== "part" && fold(node.title).trim() === fold(target.title))?.content?.trim() || undefined;
  }
  if (target.area === "toc") return book.publication?.includeToc ? "Sumário ativado." : undefined;
  const list = target.area === "front" ? book.publication?.frontMatter : book.publication?.backMatter;
  return list?.find(section => section.id === target.key)?.content?.trim() || undefined;
}
