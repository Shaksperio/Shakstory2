import { openShakstoryDb } from "@/lib/sync/kv";
// IndexedDB keeps image-bearing manuscripts outside localStorage's small quota.
export function safeLocalSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
const database = openShakstoryDb;
export async function saveLibraryBackup(value: unknown) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("backups", "readwrite");
      tx.objectStore("backups").put(value, "library");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function readLibraryBackup<T>(): Promise<T | undefined> {
  const db = await database();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const request = db
        .transaction("backups")
        .objectStore("backups")
        .get("library");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
