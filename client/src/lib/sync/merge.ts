// Mesclagem em três vias da biblioteca: base (último estado sincronizado), local e remoto.
// Regra de ouro: nunca descartar texto. O que não dá para decidir sozinho vira cópia marcada.
import { stableStringify } from "./hash";

export type NodeLike = { id: string; title: string; kind: string; content: string; richContent?: string; status?: string; updatedAt: number; [key: string]: unknown };
export type BookLike = { id: string; updatedAt: number; nodes: NodeLike[]; [key: string]: unknown };
export type LibraryLike = { books: BookLike[]; versionId?: string; [key: string]: unknown };

export type MergeReport = { conflictCopies: number; booksMerged: number; booksKept: number };
export type MergeOptions = {
  now?: number;
  makeId?: (prefix: string) => string;
  /** Recalcula dados derivados (ex.: estrutura semântica) depois de mesclar os capítulos de um livro. */
  reconcileBook?: <T extends BookLike>(book: T) => T;
};

const same = (left: unknown, right: unknown) => stableStringify(left) === stableStringify(right);
const nodeKey = (node: NodeLike) => stableStringify({ t: node.title, k: node.kind, c: node.content, h: node.richContent ?? "", s: node.status ?? null });
const ids = (list: Array<{ id: string }>) => list.map(item => item.id);

/** Compara a ordem dos itens que existem nas duas listas. */
function sameOrder(first: string[], second: string[]) {
  const inSecond = new Set(second);
  const inFirst = new Set(first);
  const a = first.filter(id => inSecond.has(id));
  const b = second.filter(id => inFirst.has(id));
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function mergeNodes(base: NodeLike[] | undefined, local: NodeLike[], remote: NodeLike[], now: number, makeId: (prefix: string) => string, report: MergeReport): NodeLike[] {
  const baseById: Record<string, NodeLike> = {};
  (base ?? []).forEach(node => { baseById[node.id] = node; });
  const localById: Record<string, NodeLike> = {};
  local.forEach(node => { localById[node.id] = node; });
  const remoteById: Record<string, NodeLike> = {};
  remote.forEach(node => { remoteById[node.id] = node; });
  const hasBase = base !== undefined;

  const baseIds = ids(base ?? []);
  const localIds = ids(local);
  const remoteIds = ids(remote);
  const localMoved = hasBase && !sameOrder(localIds, baseIds);
  const remoteMoved = hasBase && !sameOrder(remoteIds, baseIds);
  const useLocalBackbone = localMoved && !remoteMoved;
  const backbone = (useLocalBackbone ? localIds : remoteIds).slice();
  const other = useLocalBackbone ? remoteIds : localIds;
  const present = new Set(backbone);
  other.forEach((id, index) => {
    if (present.has(id)) return;
    // Entra antes do próximo vizinho conhecido; sem vizinho depois, vai para o fim.
    let position = backbone.length;
    for (let next = index + 1; next < other.length; next++) {
      const at = backbone.indexOf(other[next]);
      if (at !== -1) { position = at; break; }
    }
    backbone.splice(position, 0, id);
    present.add(id);
  });

  const result: NodeLike[] = [];
  backbone.forEach(id => {
    const inLocal = localById[id];
    const inRemote = remoteById[id];
    const inBase = baseById[id];
    if (inLocal && inRemote) {
      const localKey = nodeKey(inLocal);
      const remoteKey = nodeKey(inRemote);
      const baseKey = inBase ? nodeKey(inBase) : undefined;
      if (localKey === remoteKey) result.push(inLocal.updatedAt >= inRemote.updatedAt ? inLocal : inRemote);
      else if (baseKey === remoteKey) result.push(inLocal);
      else if (baseKey === localKey) result.push(inRemote);
      else {
        // Os dois lados mudaram o capítulo: o remoto fica no lugar e o texto local vira cópia marcada.
        result.push(inRemote);
        result.push({ ...inLocal, id: makeId("node"), title: inLocal.title + " (cópia local — conflito)", updatedAt: now });
        report.conflictCopies++;
      }
      return;
    }
    if (inLocal) {
      // Só no local: capítulo novo, ou removido no remoto. Removido e inalterado aqui → remoção vale; editado → fica.
      if (!inBase || nodeKey(inLocal) !== nodeKey(inBase)) result.push(inLocal);
      return;
    }
    if (inRemote) {
      if (!inBase || nodeKey(inRemote) !== nodeKey(inBase)) result.push(inRemote);
    }
  });
  return result;
}

function mergeBook(base: BookLike | undefined, local: BookLike, remote: BookLike, options: Required<Pick<MergeOptions, "now" | "makeId">> & MergeOptions, report: MergeReport): BookLike {
  const preferLocal = local.updatedAt >= remote.updatedAt;
  const merged: Record<string, unknown> = {};
  const fields: Record<string, true> = {};
  [base, local, remote].forEach(book => { if (book) Object.keys(book).forEach(key => { fields[key] = true; }); });
  Object.keys(fields).forEach(key => {
    if (key === "nodes" || key === "updatedAt" || key === "semanticBook") return;
    const localValue = local[key];
    const remoteValue = remote[key];
    const baseValue = base ? base[key] : undefined;
    let chosen: unknown;
    if (same(localValue, remoteValue)) chosen = localValue;
    else if (base && same(baseValue, remoteValue)) chosen = localValue;
    else if (base && same(baseValue, localValue)) chosen = remoteValue;
    else chosen = preferLocal ? localValue : remoteValue;
    if (chosen !== undefined) merged[key] = chosen;
  });
  const nodes = mergeNodes(base?.nodes, local.nodes, remote.nodes, options.now, options.makeId, report);
  const semantic = preferLocal ? local.semanticBook : remote.semanticBook;
  const book = { ...merged, nodes, updatedAt: Math.max(local.updatedAt, remote.updatedAt), ...(semantic !== undefined ? { semanticBook: semantic } : {}) } as BookLike;
  report.booksMerged++;
  return options.reconcileBook ? options.reconcileBook(book) : book;
}

export function mergeLibraries<T extends LibraryLike>(base: T | undefined, local: T, remote: T, options: MergeOptions = {}): { doc: T; report: MergeReport } {
  const now = options.now ?? Date.now();
  let counter = 0;
  const makeId = options.makeId ?? ((prefix: string) => prefix + "-merge-" + now.toString(36) + "-" + (counter++).toString(36));
  const resolved = { ...options, now, makeId };
  const report: MergeReport = { conflictCopies: 0, booksMerged: 0, booksKept: 0 };
  const baseById: Record<string, BookLike> = {};
  (base?.books ?? []).forEach(book => { baseById[book.id] = book; });
  const localById: Record<string, BookLike> = {};
  local.books.forEach(book => { localById[book.id] = book; });
  const remoteById: Record<string, BookLike> = {};
  remote.books.forEach(book => { remoteById[book.id] = book; });

  const order = remote.books.map(book => book.id);
  local.books.forEach(book => { if (order.indexOf(book.id) === -1) order.push(book.id); });

  const books: BookLike[] = [];
  order.forEach(id => {
    const inLocal = localById[id];
    const inRemote = remoteById[id];
    const inBase = baseById[id];
    if (inLocal && inRemote) {
      const localKey = stableStringify(inLocal);
      const remoteKey = stableStringify(inRemote);
      const baseKey = inBase ? stableStringify(inBase) : undefined;
      if (localKey === remoteKey || baseKey === remoteKey) { books.push(inLocal); report.booksKept++; }
      else if (baseKey === localKey) { books.push(inRemote); report.booksKept++; }
      else books.push(mergeBook(inBase, inLocal, inRemote, resolved, report));
      return;
    }
    if (inLocal) {
      if (!inBase || stableStringify(inLocal) !== stableStringify(inBase)) { books.push(inLocal); report.booksKept++; }
      return;
    }
    if (inRemote && (!inBase || stableStringify(inRemote) !== stableStringify(inBase))) { books.push(inRemote); report.booksKept++; }
  });
  return { doc: { ...remote, ...local, books, versionId: local.versionId ?? remote.versionId } as T, report };
}
