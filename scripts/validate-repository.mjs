import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";

const root = process.cwd();
const forbidden = /\b(?:pintura|orçamento|orcamento|cliente|material|serviço|servico|paint[- ]budget)\b/i;
const ignoredDirectories = new Set([".git", "node_modules", "dist", ".manus-logs"]);
const ignoredFiles = new Set(["todo.md"]);
// Linhas permitidas: são as listas de termos que os próprios guardrails precisam conter.
const technicalAllowlist = new Map([
  ["scripts/validate-data.mjs", ["const forbidden =", "console.log(\"Dados editoriais"]],
  ["scripts/validate-repository.mjs", ["const forbidden ="]],
]);
const roots = ["README.md", "INDEPENDENCIA_DO_MANUS.md", "package.json", "client", "server", "backend", "shared", "schemas", "data", "docs", "scripts"];
const violations = [];

async function scan(path, relativePath) {
  const info = await stat(path);
  if (info.isFile()) {
    const raw = await readFile(path, "utf8");
    const allowlistedPrefixes = technicalAllowlist.get(relativePath) ?? [];
    const checkedContent = raw.split("\n").filter(line => !allowlistedPrefixes.some(prefix => line.trimStart().startsWith(prefix))).join("\n");
    if (forbidden.test(basename(relativePath)) || forbidden.test(checkedContent)) violations.push(relativePath);
    return;
  }
  if (!info.isDirectory()) return;
  const statEntries = await readdir(path, { withFileTypes: true });
  for (const entry of statEntries) {
    if (ignoredDirectories.has(entry.name)) continue;
    const child = join(path, entry.name);
    const childRelative = join(relativePath, entry.name);
    if (entry.isDirectory()) await scan(child, childRelative);
    else if (entry.isFile() && !ignoredFiles.has(entry.name)) await scan(child, childRelative);
  }
}

for (const entry of roots) await scan(join(root, entry), entry);
if (violations.length) throw new Error(`Referências não permitidas encontradas em: ${violations.join(", ")}`);
console.log("Repositório editorial válido: nenhum termo do domínio descartado em código, dados, schemas ou documentação.");
