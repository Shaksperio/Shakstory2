// Sincronização nos dois sentidos com o espelho: lê o que o outro endereço gravou, mescla com o que há aqui
// (três vias, sem perder texto) e grava o resultado. Funciona igual no endereço principal e no GitHub Pages.
import { stableStringify } from "../sync/hash";
import type { KV } from "../sync/kv";
import { mergeLibraries, type LibraryLike, type MergeReport } from "../sync/merge";

export type MirrorIO = {
  /** Carimbo do último envio ao espelho (1 leitura barata). null se o espelho está vazio. */
  stamp(): Promise<number | null>;
  pull(): Promise<LibraryLike | null>;
  /** Grava só o que mudou. Devolve o novo carimbo, ou null se nada precisou ser gravado. */
  push(doc: LibraryLike): Promise<number | null>;
};

export type MirrorSyncResult = { doc: LibraryLike; changedLocal: boolean; report: MergeReport; pulled: boolean; stamp: number | null };

const SEEN_KEY = "mirror-seen";
const BASE_KEY = "mirror";

export async function syncWithMirror(kv: KV, io: MirrorIO, local: LibraryLike): Promise<MirrorSyncResult> {
  const seen = (await kv.get<number>("meta", SEEN_KEY)) ?? null;
  const stamp = await io.stamp();
  let doc = local;
  let report: MergeReport = { conflictCopies: 0, booksMerged: 0, booksKept: 0 };
  let pulled = false;
  if (stamp !== null && stamp !== seen) {
    const remote = await io.pull();
    if (remote) {
      pulled = true;
      const base = (await kv.get<{ doc: LibraryLike }>("bases", BASE_KEY))?.doc;
      const merged = mergeLibraries(base, local, remote);
      doc = merged.doc;
      report = merged.report;
    }
  }
  const changedLocal = stableStringify(doc) !== stableStringify(local);
  const written = await io.push(doc);
  const finalStamp = written ?? stamp;
  await kv.batch([
    { store: "bases", key: BASE_KEY, value: { doc } },
    { store: "meta", key: SEEN_KEY, value: finalStamp },
  ]);
  return { doc, changedLocal, report, pulled, stamp: finalStamp };
}
