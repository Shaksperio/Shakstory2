// Motor de sincronização local-first: mescla o que está neste aparelho com o que está no D1,
// guarda a "base" (último estado em comum) e tenta de novo quando outro aparelho salvou antes.
import { stableStringify } from "./hash";
import type { KV } from "./kv";
import { mergeLibraries, type LibraryLike, type MergeOptions, type MergeReport } from "./merge";

export type Transport = {
  read(path: string): Promise<{ data: Record<string, unknown> | null; sha?: string }>;
  write(input: { path: string; data: Record<string, unknown>; expectedSha?: string }): Promise<{ sha: string }>;
};

export const LIBRARY_PATH = "library.json";
export const isConflict = (error: unknown) => (error as { data?: { code?: string } } | undefined)?.data?.code === "CONFLICT";

export type SyncResult = { doc: LibraryLike; sha: string | undefined; wrote: boolean; report: MergeReport };

const emptyReport = (): MergeReport => ({ conflictCopies: 0, booksMerged: 0, booksKept: 0 });

/** Guarda o estado como "base" e como cópia local íntegra. */
export async function rememberSynced(kv: KV, doc: LibraryLike, sha: string | undefined) {
  await kv.batch([
    { store: "bases", key: LIBRARY_PATH, value: { doc, sha } },
    { store: "library", key: LIBRARY_PATH, value: doc },
  ]);
}

export async function syncLibrary(args: { kv: KV; transport: Transport; local: LibraryLike; merge?: MergeOptions; attempts?: number }): Promise<SyncResult> {
  const { kv, transport, local } = args;
  const attempts = args.attempts ?? 4;
  const baseRecord = await kv.get<{ doc: LibraryLike }>("bases", LIBRARY_PATH);
  let base = baseRecord?.doc;
  const total = emptyReport();
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const remote = await transport.read(LIBRARY_PATH);
    const remoteDoc = remote.data as LibraryLike | null;
    if (!remoteDoc || !Array.isArray(remoteDoc.books)) {
      if (local.books.length === 0 && (base?.books?.length ?? 0) > 0) {
        throw new Error("Sincronização suspensa: biblioteca remota indisponível e cópia local vazia. Nenhum livro foi apagado.");
      }
      const written = await transport.write({ path: LIBRARY_PATH, data: local as unknown as Record<string, unknown> });
      await rememberSynced(kv, local, written.sha);
      return { doc: local, sha: written.sha, wrote: true, report: total };
    }
    const { doc, report } = mergeLibraries(base, local, remoteDoc, args.merge);
    total.conflictCopies += report.conflictCopies;
    total.booksMerged += report.booksMerged;
    total.booksKept += report.booksKept;
    // Fail closed: never accept an unexpected full-library deletion from a sync merge.
    // Explicit deletion must use a separately confirmed, audited operation.
    if (doc.books.length === 0 && (local.books.length > 0 || remoteDoc.books.length > 0 || (base?.books?.length ?? 0) > 0)) {
      throw new Error("Sincronização suspensa: mesclagem resultaria em biblioteca vazia. Preserve as cópias locais e remotas.");
    }
    if (stableStringify(doc) === stableStringify(remoteDoc)) {
      await rememberSynced(kv, remoteDoc, remote.sha);
      return { doc: remoteDoc, sha: remote.sha, wrote: false, report: total };
    }
    try {
      const written = await transport.write({ path: LIBRARY_PATH, data: doc as unknown as Record<string, unknown>, expectedSha: remote.sha });
      await rememberSynced(kv, doc, written.sha);
      return { doc, sha: written.sha, wrote: true, report: total };
    } catch (error) {
      if (!isConflict(error)) throw error;
      lastError = error;
      base = remoteDoc; // outro aparelho salvou entre a leitura e a escrita: reler e mesclar de novo
    }
  }
  throw lastError ?? new Error("Não foi possível sincronizar");
}
