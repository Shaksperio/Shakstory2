// Gera o script do Worker de produção com contas por usuário, teste de 7 dias e planos (cloudflare-worker/plans.js).
// Precisa ser aplicado sobre um Worker que já tenha a rota /api/mirror-token (patch-worker-mirror.mjs).
// Uso: node scripts/patch-worker-plans.mjs <worker-atual.js> <saida.js>
import { readFileSync, writeFileSync } from "node:fs";

const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error("uso: patch-worker-plans.mjs <entrada> <saida>"); process.exit(2); }
let source = readFileSync(input, "utf8");
if (source.indexOf("shakGate") !== -1) { console.error("já aplicado"); process.exit(3); }
if (source.indexOf("async function verifyAccessJwt") === -1) { console.error("aplique antes o patch-worker-mirror.mjs"); process.exit(5); }
const helpers = readFileSync(new URL("../cloudflare-worker/plans.js", import.meta.url), "utf8")
  .replace(/^import .*$/gm, "")
  .replace(/^export /gm, "");
const entry = "export default{async fetch(req,env){const u=new URL(req.url);\n";
const anchor = "if(u.pathname==='/api/mirror-token'&&req.method==='GET')return mirrorToken(req,env);\n";
const gate = "{const g=await shakGate(req,env,u);if(g.response)return g.response;if(g.env)env=g.env;}\n";
if (source.split(entry).length !== 2 || source.split(anchor).length !== 2) { console.error("formato inesperado do Worker; nada foi alterado"); process.exit(4); }
source = source.replace(entry, () => helpers + "\n" + entry).replace(anchor, () => gate + anchor);
writeFileSync(output, source);
console.log("ok");
