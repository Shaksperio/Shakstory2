// Monta o script do Worker de contingência (shakstory-ai): plans.js + contingency-ai.js em um único módulo.
// Uso: node scripts/build-contingency-ai.mjs <saida.js>
import { readFileSync, writeFileSync } from "node:fs";

const output = process.argv[2];
if (!output) { console.error("uso: build-contingency-ai.mjs <saida.js>"); process.exit(2); }
const read = name => readFileSync(new URL("../cloudflare-worker/" + name, import.meta.url), "utf8");
const strip = text => text.replace(/^import .*$/gm, "").replace(/^export (?!default)/gm, "");
// plans.js também traz o portão do Worker principal (shakGate), que usa verifyAccessJwt/MIRROR_EMAILS só quando chamado; aqui nunca é.
writeFileSync(output, strip(read("plans.js")) + "\n" + strip(read("contingency-ai.js")));
console.log("ok");
