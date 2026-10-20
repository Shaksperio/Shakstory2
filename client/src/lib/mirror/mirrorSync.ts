// Sincronização nos dois sentidos com o espelho: lê o que o outro endereço gravou, mescla com o que há aqui
// (três vias, sem perder texto) e grava o resultado. Funciona igual no endereço principal e no GitHub Pages.
import { stableStringify } from "../sync/hash";
import type { KV } from "../sync/kv";
import { mergeLibraries, type LibraryLike, type MergeReport } from "../sync/merge";

export type MirrorIO = {
  /** Identidade do espaço remoto; isola bases e carimbos entre contas. */
  scope?: string;
  /** Carimbo do último envio ao espelho (1 leitura barata). null se o espelho está vazio. */
  stamp(): Promise<number | null>;
  pull(): Promise<LibraryLike | null>;
  /** Grava só o que mudou. Devolve o novo carimbo, ou null se nada precisou ser gravado. */
  push(doc: LibraryLike): Promise<number | null>;
};

export type MirrorSyncResult = { doc: LibraryLike; changedLocal: boolean; report: MergeReport; pulled: boolean; stamp: number | null };

const SEEN_KEY = "mirror-seen";
const BASE_KEY = "mirror";
const ACTIVE_SCOPE_KEY = "mirror-active-scope";

export async function syncWithMirror(kv: KV, io: MirrorIO, local: LibraryLike): Promise<MirrorSyncResult> {
  // Fail closed when a different Firebase account signs in on the same browser.
  // Keep the local manuscript untouched; never upload it into the new account.
  if (io.scope) {
    const previousScope = await kv.get<string>("meta", ACTIVE_SCOPE_KEY);
    if (previousScope && previousScope !== io.scope) {
      throw new Error("SYNC_ACCOUNT_CHANGED");
    }
  }
  const seenKey = io.scope ? SEEN_KEY + ":" + encodeURIComponent(io.scope) : SEEN_KEY;
  const baseKey = io.scope ? BASE_KEY + ":" + encodeURIComponent(io.scope) : BASE_KEY;
  const seen = (await kv.get<number>("meta", seenKey)) ?? null;
  const stamp = await io.stamp();
  let doc = local;
  let report: MergeReport = { conflictCopies: 0, booksMerged: 0, booksKept: 0 };
  let pulled = false;
  if (stamp !== null && stamp !== seen) {
    const remote = await io.pull();
    if (remote) {
      pulled = true;
      const base = (await kv.get<{ doc: LibraryLike }>("bases", baseKey))?.doc;
      const merged = mergeLibraries(base, local, remote);
      doc = merged.doc;
      report = merged.report;
    }
  }
  const changedLocal = stableStringify(doc) !== stableStringify(local);
  const written = await io.push(doc);
  const finalStamp = written ?? stamp;
  await kv.batch([
    { store: "bases", key: baseKey, value: { doc } },
    { store: "meta", key: seenKey, value: finalStamp },
    ...(io.scope ? [{ store: "meta" as const, key: ACTIVE_SCOPE_KEY, value: io.scope }] : []),
  ]);
  return { doc, changedLocal, report, pulled, stamp: finalStamp };
}
