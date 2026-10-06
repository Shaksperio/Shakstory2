import type { SemanticBook } from "./book-model";

export type ValidationIssue = { code: string; severity: "error" | "warning"; message: string; path: string };

export function validateBook(input: { title: string; nodes: Array<{ id: string; title: string; content: string }>; semanticBook?: SemanticBook; author?: string; language?: string }): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!input.title.trim()) issues.push({ code: "BOOK_TITLE_REQUIRED", severity: "error", message: "O título do livro é obrigatório.", path: "title" });
  if (!input.author?.trim()) issues.push({ code: "AUTHOR_MISSING", severity: "warning", message: "Informe o nome do autor antes de exportar.", path: "author" });
  if (!input.language?.trim()) issues.push({ code: "LANGUAGE_MISSING", severity: "warning", message: "Informe o idioma da publicação.", path: "language" });
  if (input.nodes.length === 0) issues.push({ code: "NO_NODES", severity: "error", message: "Adicione pelo menos um capítulo ou cena.", path: "nodes" });
  input.nodes.forEach((node, index) => {
    if (!node.title.trim()) issues.push({ code: "NODE_TITLE_REQUIRED", severity: "error", message: "Todo elemento precisa de título.", path: `nodes.${index}.title` });
    if (!node.content.trim()) issues.push({ code: "NODE_EMPTY", severity: "warning", message: "Há um elemento sem texto.", path: `nodes.${index}.content` });
  });
  if (input.semanticBook && input.semanticBook.parts.flatMap(part => part.chapters).length === 0) issues.push({ code: "SEMANTIC_STRUCTURE_EMPTY", severity: "error", message: "A estrutura semântica ainda não possui capítulos.", path: "semanticBook.parts" });
  return issues;
}
