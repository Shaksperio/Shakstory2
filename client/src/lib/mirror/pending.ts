import type { KV } from "../sync/kv";
import type { LibraryLike } from "../sync/merge";
import type { MirrorUser } from "./firebase";
import { mirrorRoot } from "./firebase";

export type PendingMirror = { library: LibraryLike; seq?: number; scope: string; savedAt: number };
const keyFor = (user: MirrorUser) => "mirror-pending:" + encodeURIComponent(mirrorRoot(user.email) + ":" + user.uid);

/** Store before attempting network I/O. Never read another account's pending edits. */
export async function savePendingMirror(kv: KV, user: MirrorUser, library: LibraryLike, seq?: number) {
  const scope = mirrorRoot(user.email) + ":" + user.uid;
  await kv.put("outbox", keyFor(user), { library, seq, scope, savedAt: Date.now() } satisfies PendingMirror);
}
export async function readPendingMirror(kv: KV, user: MirrorUser): Promise<PendingMirror | undefined> {
  const item = await kv.get<PendingMirror>("outbox", keyFor(user));
  return item?.scope === mirrorRoot(user.email) + ":" + user.uid ? item : undefined;
}
export async function clearPendingMirror(kv: KV, user: MirrorUser) {
  await kv.remove("outbox", keyFor(user));
}
