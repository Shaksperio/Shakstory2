export type RecoverableLibrary = { version: number; books: Array<{ id: string }> };

export function recoverLibraryDocument(remote: RecoverableLibrary | null | undefined, local: RecoverableLibrary | null | undefined): RecoverableLibrary {
  if (remote && remote.books.length > 0) return remote;
  if (local && local.books.length > 0) return local;
  return remote ?? local ?? { version: 1, books: [] };
}
