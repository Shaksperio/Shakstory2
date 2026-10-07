// IndexedDB keeps image-bearing manuscripts outside localStorage's small quota.
export function safeLocalSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Armazenamento local indisponível"));
      return;
    }
    const request = indexedDB.open("shakstory-editorial", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("backups");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
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
