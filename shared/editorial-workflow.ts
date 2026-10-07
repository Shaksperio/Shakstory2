export type MatterSection = {
  id: string;
  title: string;
  content: string;
  enabled?: boolean;
};
export type CopyrightData = {
  penName?: string;
  edition?: string;
  year?: string;
  publisher?: string;
  publisherLogo?: string;
  isbns?: Partial<
    Record<"epub" | "kindle" | "paperback" | "hardcover" | "pdf", string>
  >;
  contributors?: Array<{ id: string; name: string; role: string }>;
  clauses?: {
    rights?: boolean;
    fiction?: boolean;
    moral?: boolean;
    external?: boolean;
  };
  additional?: string;
};
export type ReviewComment = {
  id: string;
  nodeId: string;
  quote: string;
  body: string;
  author: string;
  createdAt: number;
  resolved: boolean;
};
export type Revision = {
  id: string;
  nodeId: string;
  before: string;
  after: string;
  beforeHtml: string;
  afterHtml: string;
  createdAt: number;
  status: "pending" | "accepted" | "rejected";
};
export type WritingVersion = {
  id: string;
  nodeId: string;
  title: string;
  text: string;
  html: string;
  createdAt: number;
};
export type ReviewData = {
  tracking?: boolean;
  comments?: ReviewComment[];
  changes?: Revision[];
  versions?: WritingVersion[];
};
export const MATTER_TEMPLATES = {
  frontMatter: [
    "Copyright",
    "Dedicatória",
    "Epígrafe",
    "Apresentação",
    "Prefácio",
    "Agradecimentos",
  ],
  backMatter: ["Notas", "Glossário", "Sobre o autor", "Outras obras do autor"],
};
export function buildCopyrightText(
  data: CopyrightData,
  fallbackAuthor = "",
  metadata: {
    bookId?: string;
    isbn?: string;
    publicationDate?: string;
    publicationYear?: string;
  } = {}
): string {
  const author = data.penName || fallbackAuthor;
  const year =
    data.year ||
    metadata.publicationYear ||
    metadata.publicationDate?.slice(0, 4) ||
    String(new Date().getFullYear());
  const lines = [
    `© ${year} ${author || "Autor não informado"}`,
    `Ano de publicação: ${year}`,
  ];
  if (metadata.publicationDate)
    lines.push(`Data de publicação: ${metadata.publicationDate}`);
  if (metadata.bookId) lines.push(`ID do livro: ${metadata.bookId}`);
  if (metadata.isbn) lines.push(`ISBN: ${metadata.isbn}`);
  if (data.edition) lines.push(`Edição: ${data.edition}`);
  if (data.publisher) lines.push(`Editora: ${data.publisher}`);
  for (const [format, isbn] of Object.entries(data.isbns ?? {}))
    if (isbn?.trim()) lines.push(`ISBN (${format}): ${isbn.trim()}`);
  for (const person of data.contributors ?? [])
    lines.push(`${person.role}: ${person.name}`);
  if (data.clauses?.rights !== false)
    lines.push(
      "Todos os direitos reservados. A reprodução desta obra depende de autorização do titular, ressalvadas as utilizações permitidas pela legislação aplicável."
    );
  if (data.clauses?.fiction !== false)
    lines.push(
      "Esta história é uma obra de ficção. Nomes, personagens, lugares e acontecimentos são fictícios ou utilizados de forma fictícia. Qualquer semelhança com pessoas reais, vivas ou falecidas, lugares ou acontecimentos reais é mera coincidência."
    );
  if (data.clauses?.moral)
    lines.push(`${author} declara a autoria desta obra.`);
  if (data.clauses?.external)
    lines.push(
      "Links externos são referências de terceiros e seu conteúdo pode mudar."
    );
  if (data.additional?.trim()) lines.push(data.additional.trim());
  return lines.join("\n\n");
}
export function publicationSections(publication: {
  frontMatter?: MatterSection[];
  copyright?: CopyrightData;
  author?: string;
  bookId?: string;
  isbn?: string;
  publicationDate?: string;
  publicationYear?: string;
}): MatterSection[] {
  const sections = publication.frontMatter ?? [];
  const copyright = {
    id: "copyright",
    title: "Copyright",
    content: buildCopyrightText(
      publication.copyright ?? {},
      publication.author,
      publication
    ),
    enabled: true,
  };
  const existing = sections.find(section => section.id === "copyright");
  return existing
    ? sections.map(section =>
        section.id === "copyright"
          ? { ...section, content: copyright.content }
          : section
      )
    : [copyright, ...sections];
}
export function canRestoreRevision(
  currentText: string,
  currentHtml: string,
  revision: Revision
): boolean {
  return currentText === revision.after && currentHtml === revision.afterHtml;
}
export function mergeTrackedRevision(
  changes: Revision[],
  next: Revision
): Revision[] {
  const previous = changes[0];
  if (
    previous?.nodeId === next.nodeId &&
    previous.status === "pending" &&
    previous.after === next.before &&
    previous.afterHtml === next.beforeHtml &&
    next.createdAt - previous.createdAt < 30000
  ) {
    return [
      {
        ...previous,
        after: next.after,
        afterHtml: next.afterHtml,
        createdAt: next.createdAt,
      },
      ...changes.slice(1),
    ];
  }
  // Pending changes are never discarded to enforce a quota.
  return [next, ...changes];
}
