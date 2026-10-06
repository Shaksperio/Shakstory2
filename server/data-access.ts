import { resolve } from "node:path";
import { githubRepositoryFromEnvironment } from "../backend/src/repositories/github-json-repository";
import { JsonFileRepository } from "../backend/src/repositories/json-file-repository";
import type { DocumentRepository } from "../backend/src/repositories/types";

export type EditorialDocument = Record<string, unknown>;

let repository: DocumentRepository<EditorialDocument> | null = null;

export function getEditorialRepository(): DocumentRepository<EditorialDocument> {
  if (repository) return repository;
  repository = githubRepositoryFromEnvironment<EditorialDocument>() ?? new JsonFileRepository<EditorialDocument>(resolve(process.env.SHAKSTORY_DATA_DIR ?? "data"));
  return repository;
}

export function getEditorialRepositoryMode() {
  return process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER && process.env.GITHUB_REPOSITORY ? "github" : "json";
}
