// Gera o script do Worker de produção com a rota /api/mirror-token a partir do script atual.
// Uso: node scripts/patch-worker-mirror.mjs <worker-atual.js> <saida.js>
import { readFileSync, writeFileSync } from "node:fs";

const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error("uso: patch-worker-mirror.mjs <entrada> <saida>"); process.exit(2); }
let source = readFileSync(input, "utf8");
if (source.indexOf("/api/mirror-token") !== -1) { console.error("já aplicado"); process.exit(3); }
const helpers = readFileSync(new URL("../cloudflare-worker/mirror-token.js", import.meta.url), "utf8").replace(/^export /gm, "");
const entry = "export default{async fetch(req,env){";
const route = "if(u.pathname==='/api/mirror-token'&&req.method==='GET')return mirrorToken(req,env);\n";
const health = "if(u.pathname==='/health'){";
if (source.split(entry).length !== 2 || source.split(health).length !== 2) { console.error("formato inesperado do Worker; nada foi alterado"); process.exit(4); }
source = source.replace(entry, helpers + "\n" + entry).replace(health, route + health);
writeFileSync(output, source);
console.log("ok");
