// Armazenamento local chave-valor sobre IndexedDB (com versão em memória para testes).
export const DB_NAME = "shakstory-editorial";
export const DB_VERSION = 2;
// "backups" existe desde a v1 (cópia da biblioteca). As demais entram na v2.
export const STORES = ["backups", "library", "bases", "outbox", "snapshots", "meta"] as const;
export type StoreName = (typeof STORES)[number];

export type KvWrite = { store: StoreName; key: string; value?: unknown; remove?: boolean };

export interface KV {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put(store: StoreName, key: string, value: unknown): Promise<void>;
  remove(store: StoreName, key: string): Promise<void>;
  keys(store: StoreName): Promise<string[]>;
  /** Várias gravações na mesma transação: ou entram todas, ou nenhuma. */
  batch(writes: KvWrite[]): Promise<void>;
  /** Compare and remove in one atomic transaction. */
  removeIfRevision(store: StoreName, key: string, revision: string): Promise<boolean>;
}

const clone = <T>(value: T): T => (value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T));

export class MemoryKV implements KV {
  private data: Record<string, Record<string, unknown>> = {};
  private bucket(store: StoreName) { return (this.data[store] ??= {}); }
  async get<T>(store: StoreName, key: string) { return clone(this.bucket(store)[key]) as T | undefined; }
  async put(store: StoreName, key: string, value: unknown) { this.bucket(store)[key] = clone(value); }
  async remove(store: StoreName, key: string) { delete this.bucket(store)[key]; }
  async keys(store: StoreName) { return Object.keys(this.bucket(store)).sort(); }
  async removeIfRevision(store: StoreName, key: string, revision: string) {
    const current = this.bucket(store)[key] as { revision?: string } | undefined;
    if (current?.revision !== revision) return false;
    delete this.bucket(store)[key];
    return true;
  }
  async batch(writes: KvWrite[]) {
    writes.forEach(write => { if (write.remove) delete this.bucket(write.store)[write.key]; else this.bucket(write.store)[write.key] = clone(write.value); });
  }
}

export function openShakstoryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("Armazenamento local indisponível")); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      STORES.forEach(name => { if (!db.objectStoreNames.contains(name)) db.createObjectStore(name); });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Banco local bloqueado por outra aba"));
  });
}

export class IdbKV implements KV {
  private opening: Promise<IDBDatabase> | null = null;
  private db(): Promise<IDBDatabase> {
    if (!this.opening) {
      this.opening = openShakstoryDb().then(db => {
        db.onversionchange = () => { db.close(); this.opening = null; };
        db.onclose = () => { this.opening = null; };
        return db;
      }, error => { this.opening = null; throw error; });
    }
    return this.opening;
  }
  private async run<T>(stores: StoreName[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => IDBRequest | void): Promise<T | undefined> {
    const db = await this.db();
    return new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      const request = work(tx);
      tx.oncomplete = () => resolve(request ? (request.result as T) : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("Transação cancelada"));
    });
  }
  get<T>(store: StoreName, key: string) { return this.run<T>([store], "readonly", tx => tx.objectStore(store).get(key)); }
  async put(store: StoreName, key: string, value: unknown) { await this.run([store], "readwrite", tx => { tx.objectStore(store).put(value, key); }); }
  async remove(store: StoreName, key: string) { await this.run([store], "readwrite", tx => { tx.objectStore(store).delete(key); }); }
  async keys(store: StoreName) { return ((await this.run<IDBValidKey[]>([store], "readonly", tx => tx.objectStore(store).getAllKeys())) ?? []).map(String); }
  async batch(writes: KvWrite[]) {
    const stores = Array.from(new Set(writes.map(write => write.store)));
    await this.run(stores, "readwrite", tx => {
      writes.forEach(write => { const store = tx.objectStore(write.store); if (write.remove) store.delete(write.key); else store.put(write.value, write.key); });
    });
  }
  async removeIfRevision(store: StoreName, key: string, revision: string): Promise<boolean> {
    const db = await this.db();
    return new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction([store], "readwrite");
      const bucket = tx.objectStore(store);
      let removed = false;
      const request = bucket.get(key);
      request.onsuccess = () => {
        const current = request.result as { revision?: string } | undefined;
        if (current?.revision === revision) { bucket.delete(key); removed = true; }
      };
      tx.oncomplete = () => resolve(removed);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("Transação cancelada"));
    });
  }

}
