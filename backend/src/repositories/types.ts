export type RepositoryDocument<T> = {
  data: T;
  sha?: string;
};

export class RepositoryConflictError extends Error {
  constructor(public readonly documentPath: string, message = "O documento foi alterado por outra sessão.") {
    super(message);
    this.name = "RepositoryConflictError";
  }
}

export interface DocumentRepository<T> {
  get(documentPath: string): Promise<RepositoryDocument<T> | null>;
  put(documentPath: string, document: T, expectedSha?: string): Promise<RepositoryDocument<T>>;
}
