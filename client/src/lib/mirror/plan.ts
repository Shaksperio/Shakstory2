// Espelho no Firestore: converte a biblioteca em documentos pequenos (limite do Firestore: 1 MiB por documento)
// e remonta a biblioteca a partir deles. Lógica pura, sem rede.
import { sha256Hex, stableStringify } from "../sync/hash";
import type { BookLike, LibraryLike, NodeLike } from "../sync/merge";

/** Pedaço máximo em caracteres: no pior caso (3 bytes por caractere) fica abaixo de 1 MiB. */
export const CHUNK_CHARS = 300000;

export type MirrorDoc = { path: string; data: Record<string, unknown>; hash: string };

export function splitChunks(text: string, size = CHUNK_CHARS): string[] {
  if (text.length <= size) return [text];
  const parts: string[] = [];
  for (let at = 0; at < text.length; at += size) parts.push(text.slice(at, at + size));
  return parts;
}

const bookMeta = (book: BookLike) => {
  const meta: Record<string, unknown> = {};
  Object.keys(book).forEach(key => { if (key !== "nodes") meta[key] = book[key]; });
  return meta;
};

/** Gera todos os documentos do espelho sob a pasta `root` (ex.: "workspaces/main"). */
export async function planMirror(root: string, library: LibraryLike): Promise<MirrorDoc[]> {
  const docs: MirrorDoc[] = [];
  const libraryMeta: Record<string, unknown> = {};
  Object.keys(library).forEach(key => { if (key !== "books") libraryMeta[key] = library[key]; });
  const metaData = { kind: "library-meta", meta: JSON.stringify(libraryMeta), bookIds: library.books.map(book => book.id), mirroredAt: Date.now() };
  docs.push({ path: root + "/library/meta", data: metaData, hash: await sha256Hex(stableStringify({ meta: libraryMeta, ids: metaData.bookIds })) });
  for (const book of library.books) {
    const meta = JSON.stringify(bookMeta(book));
    const nodeIds = book.nodes.map(node => node.id);
    docs.push({ path: root + "/books/" + book.id, data: { kind: "book", meta, nodeIds, updatedAt: book.updatedAt }, hash: await sha256Hex(meta + "|" + nodeIds.join(",")) });
    for (const node of book.nodes) {
      const json = JSON.stringify(node);
      const hash = await sha256Hex(json);
      const parts = splitChunks(json);
      parts.forEach((part, index) => docs.push({
        path: root + "/books/" + book.id + "/nodes/" + node.id + "_" + index,
        data: { kind: "node", nodeId: node.id, index, total: parts.length, data: part, hash },
        hash: hash + ":" + index + "/" + parts.length,
      }));
    }
  }
  return docs;
}

export type RawDocs = Array<{ path: string; data: Record<string, unknown> }>;

/** Remonta a biblioteca a partir dos documentos lidos do espelho. Devolve null se estiver incompleto. */
export function assembleMirror(root: string, raw: RawDocs): LibraryLike | null {
  const byPath: Record<string, Record<string, unknown>> = {};
  raw.forEach(item => { byPath[item.path] = item.data; });
  const meta = byPath[root + "/library/meta"];
  if (!meta || meta.kind !== "library-meta") return null;
  const libraryMeta = JSON.parse(String(meta.meta)) as Record<string, unknown>;
  const bookIds = (meta.bookIds as string[]) ?? [];
  const books: BookLike[] = [];
  for (const bookId of bookIds) {
    const bookDoc = byPath[root + "/books/" + bookId];
    if (!bookDoc) return null;
    const nodes: NodeLike[] = [];
    for (const nodeId of (bookDoc.nodeIds as string[]) ?? []) {
      const parts: string[] = [];
      const first = byPath[root + "/books/" + bookId + "/nodes/" + nodeId + "_0"];
      if (!first) return null;
      const total = Number(first.total);
      for (let index = 0; index < total; index++) {
        const piece = byPath[root + "/books/" + bookId + "/nodes/" + nodeId + "_" + index];
        if (!piece) return null;
        parts.push(String(piece.data));
      }
      nodes.push(JSON.parse(parts.join("")) as NodeLike);
    }
    books.push({ ...(JSON.parse(String(bookDoc.meta)) as Record<string, unknown>), nodes } as BookLike);
  }
  return { ...libraryMeta, books } as LibraryLike;
}

/** Filtra só o que mudou desde a última cópia (hashes guardados no aparelho). */
export function changedDocs(docs: MirrorDoc[], previous: Record<string, string>): MirrorDoc[] {
  return docs.filter(doc => previous[doc.path] !== doc.hash);
}

/** Caminhos que existiam no espelho e não existem mais (capítulo ou livro apagado). */
export function removedPaths(docs: MirrorDoc[], previous: Record<string, string>): string[] {
  const now: Record<string, true> = {};
  docs.forEach(doc => { now[doc.path] = true; });
  return Object.keys(previous).filter(path => !now[path]);
}
