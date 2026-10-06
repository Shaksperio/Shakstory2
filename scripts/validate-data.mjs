import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../data/", import.meta.url);
const forbidden = /pintura|orçamento|orcamento|cliente|material|serviço|servico/i;
const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));

if (manifest.source !== "shakstory") throw new Error("data/manifest.json precisa declarar source=shakstory");
if (!/^\d+\.\d+\.\d+$/.test(manifest.schemaVersion)) throw new Error("schemaVersion inválida");
for (const [entity, count] of Object.entries(manifest.counts)) {
  if (!Number.isInteger(count) || count < 0) throw new Error(`Contador inválido para ${entity}`);
}

async function scan(directoryUrl) {
  const names = await readdir(directoryUrl, { withFileTypes: true });
  for (const entry of names) {
    const url = new URL(entry.name, directoryUrl);
    if (entry.isDirectory()) {
      await scan(new URL(`${entry.name}/`, directoryUrl));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const raw = await readFile(url, "utf8");
    JSON.parse(raw);
    if (forbidden.test(raw)) throw new Error(`Termo de domínio não permitido em ${url.pathname}`);
  }
}

await scan(root);
console.log("Dados editoriais válidos: manifesto e JSONs sem referências ao domínio de pintura.");
