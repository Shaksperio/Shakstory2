import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative } from "node:path";
import type { DocumentRepository, RepositoryDocument } from "./types";

function safePath(rootDirectory: string, documentPath: string) {
  if (!documentPath || isAbsolute(documentPath)) throw new Error("Caminho de documento inválido.");
  const resolvedRoot = normalize(rootDirectory);
  const resolvedDocument = normalize(join(resolvedRoot, documentPath));
  const relativeDocument = relative(resolvedRoot, resolvedDocument);
  if (relativeDocument.startsWith("..") || isAbsolute(relativeDocument)) {
    throw new Error("Caminho de documento fora da base permitida.");
  }
  return resolvedDocument;
}

export class JsonFileRepository<T> implements DocumentRepository<T> {
  constructor(private readonly rootDirectory: string) {}

  async get(documentPath: string): Promise<RepositoryDocument<T> | null> {
    const filePath = safePath(this.rootDirectory, documentPath);
    try {
      const [raw, metadata] = await Promise.all([readFile(filePath, "utf8"), readFile(`${filePath}.sha`, "utf8").catch(() => "")]);
      return { data: JSON.parse(raw) as T, sha: metadata || undefined };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async put(documentPath: string, document: T, expectedSha?: string): Promise<RepositoryDocument<T>> {
    const filePath = safePath(this.rootDirectory, documentPath);
    const current = await this.get(documentPath);
    if (expectedSha !== undefined && current?.sha !== expectedSha) {
      throw new Error("Conflito de versão no documento JSON.");
    }
    const raw = `${JSON.stringify(document, null, 2)}\n`;
    const sha = await sha256(raw);
    await mkdir(dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryPath, raw, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, filePath);
    await writeFile(`${filePath}.sha`, sha, { encoding: "utf8", mode: 0o600 });
    return { data: document, sha };
  }
}

async function sha256(value: string) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(value).digest("hex");
}
