import { describe, expect, it } from "vitest";
import { MemoryKV } from "../sync/kv";
import { clearPendingMirror, readPendingMirror, savePendingMirror } from "./pending";
import type { MirrorUser } from "./firebase";
import type { LibraryLike } from "../sync/merge";

const alice: MirrorUser = { uid: "firebase-alice", email: "alice@example.com" };
const bob: MirrorUser = { uid: "firebase-bob", email: "bob@example.com" };
const doc = (name: string) => ({ books: [{ id: name, title: name, nodes: [] }] }) as unknown as LibraryLike;

describe("Firebase mirror outbox isolation and atomic acknowledgement", () => {
  it("does not remove a newer edit when an older upload finishes", async () => {
    const kv = new MemoryKV();
    const older = await savePendingMirror(kv, alice, doc("older"), 1);
    const newer = await savePendingMirror(kv, alice, doc("newer"), 2);
    expect(await clearPendingMirror(kv, alice, older)).toBe(false);
    expect((await readPendingMirror(kv, alice))?.seq).toBe(2);
    expect(await clearPendingMirror(kv, alice, newer)).toBe(true);
    expect(await readPendingMirror(kv, alice)).toBeUndefined();
  });

  it("does not expose pending edits to another Firebase UID", async () => {
    const kv = new MemoryKV();
    await savePendingMirror(kv, alice, doc("private"));
    expect(await readPendingMirror(kv, bob)).toBeUndefined();
    expect(await readPendingMirror(kv, alice)).toBeDefined();
  });

  it("recovers pending data after recreating the outbox consumer", async () => {
    const kv = new MemoryKV();
    const revision = await savePendingMirror(kv, alice, doc("offline"), 7);
    const reopenedConsumer = async () => readPendingMirror(kv, alice);
    expect((await reopenedConsumer())?.revision).toBe(revision);
    expect((await reopenedConsumer())?.seq).toBe(7);
  });

  it("rejects a stale acknowledgement after the record was already removed", async () => {
    const kv = new MemoryKV();
    const revision = await savePendingMirror(kv, alice, doc("done"));
    expect(await clearPendingMirror(kv, alice, revision)).toBe(true);
    expect(await clearPendingMirror(kv, alice, revision)).toBe(false);
  });
});
