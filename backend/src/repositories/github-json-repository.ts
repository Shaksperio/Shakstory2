import { RepositoryConflictError, type DocumentRepository, type RepositoryDocument } from "./types";

type GitHubContentResponse = { content?: string; sha?: string };
type GitHubRepositoryOptions = {
  token: string;
  owner: string;
  repository: string;
  branch?: string;
  apiBaseUrl?: string;
};

function encodePath(documentPath: string) {
  return documentPath.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

export class GitHubJsonRepository<T> implements DocumentRepository<T> {
  private readonly branch: string;
  private readonly apiBaseUrl: string;

  constructor(private readonly options: GitHubRepositoryOptions) {
    this.branch = options.branch ?? "main";
    this.apiBaseUrl = (options.apiBaseUrl ?? "https://api.github.com").replace(/\/$/, "");
  }

  private url(documentPath: string) {
    return `${this.apiBaseUrl}/repos/${encodeURIComponent(this.options.owner)}/${encodeURIComponent(this.options.repository)}/contents/${encodePath(documentPath)}`;
  }

  private headers() {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.options.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  async get(documentPath: string): Promise<RepositoryDocument<T> | null> {
    const response = await fetch(`${this.url(documentPath)}?ref=${encodeURIComponent(this.branch)}`, { headers: this.headers() });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub não pôde ler o documento (${response.status}).`);
    const payload = (await response.json()) as GitHubContentResponse;
    if (!payload.content || !payload.sha) throw new Error("Resposta inválida do GitHub para documento JSON.");
    const normalized = payload.content.replace(/\n/g, "");
    return { data: JSON.parse(Buffer.from(normalized, "base64").toString("utf8")) as T, sha: payload.sha };
  }

  async put(documentPath: string, document: T, expectedSha?: string): Promise<RepositoryDocument<T>> {
    const current = await this.get(documentPath);
    if (expectedSha !== undefined && current?.sha !== expectedSha) {
      throw new RepositoryConflictError(documentPath);
    }
    const raw = `${JSON.stringify(document, null, 2)}\n`;
    const response = await fetch(this.url(documentPath), {
      method: "PUT",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `chore(data): sincronizar ${documentPath}`,
        content: Buffer.from(raw, "utf8").toString("base64"),
        branch: this.branch,
        ...(current?.sha ? { sha: current.sha } : {}),
      }),
    });
    if (response.status === 409 || response.status === 422) throw new RepositoryConflictError(documentPath);
    if (!response.ok) throw new Error(`GitHub não pôde gravar o documento (${response.status}).`);
    const payload = (await response.json()) as { content?: { sha?: string } };
    return { data: document, sha: payload.content?.sha };
  }
}

export function githubRepositoryFromEnvironment<T>(): GitHubJsonRepository<T> | null {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !owner || !repository) return null;
  return new GitHubJsonRepository({ token, owner, repository, branch: process.env.GITHUB_BRANCH });
}
