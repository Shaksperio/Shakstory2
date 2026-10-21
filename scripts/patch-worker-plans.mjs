// Gera o script do Worker de produção com contas por usuário, teste de 7 dias e planos (cloudflare-worker/plans.js).
// Precisa ser aplicado sobre um Worker que já tenha a rota /api/mirror-token (patch-worker-mirror.mjs).
// Uso: node scripts/patch-worker-plans.mjs [--upgrade] <worker-atual.js> <saida.js>
//   Sem --upgrade: instala o código num Worker que ainda não o tem.
//   Com --upgrade: troca o código de contas/planos já instalado pela versão atual de plans.js (o portão e o resto do Worker não mudam).
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const upgrade = args.includes("--upgrade");
const [input, output] = args.filter(arg => arg !== "--upgrade");
if (!input || !output) { console.error("uso: patch-worker-plans.mjs [--upgrade] <entrada> <saida>"); process.exit(2); }
let source = readFileSync(input, "utf8");
const installed = source.indexOf("shakGate") !== -1;
if (installed && !upgrade) { console.error("já aplicado; use --upgrade para trocar pelo código atual de plans.js"); process.exit(3); }
if (!installed && upgrade) { console.error("nada para atualizar: o Worker ainda não tem o código de contas; rode sem --upgrade"); process.exit(3); }
if (source.indexOf("async function verifyAccessJwt") === -1) { console.error("aplique antes o patch-worker-mirror.mjs"); process.exit(5); }
const helpers = readFileSync(new URL("../cloudflare-worker/plans.js", import.meta.url), "utf8")
  .replace(/^import .*$/gm, "")
  .replace(/^export /gm, "");
const entry = "export default{async fetch(req,env){const u=new URL(req.url);\n";
const anchor = "if(u.pathname==='/api/mirror-token'&&req.method==='GET')return mirrorToken(req,env);\n";
const gate = "{const g=await shakGate(req,env,u);if(g.response)return g.response;if(g.env)env=g.env;}\n";
if (upgrade) {
  // O código instalado vai do primeiro comentário de plans.js até a entrada do Worker; o portão (shakGate) já está no lugar.
  const START = "// Contas, teste de 7 dias e planos do Shakstory (Worker de produção).";
  const from = source.indexOf(START);
  const to = source.indexOf(entry);
  if (source.split(START).length !== 2 || source.split(entry).length !== 2 || from === -1 || to === -1 || from > to) { console.error("não achei o bloco instalado com segurança; nada foi alterado"); process.exit(6); }
  if (source.split("shakGate(req,env,u)").length !== 2) { console.error("o portão não está exatamente uma vez no Worker; nada foi alterado"); process.exit(7); }
  source = source.slice(0, from) + helpers + "\n" + source.slice(to);
} else {
  if (source.split(entry).length !== 2 || source.split(anchor).length !== 2) { console.error("formato inesperado do Worker; nada foi alterado"); process.exit(4); }
  source = source.replace(entry, () => helpers + "\n" + entry).replace(anchor, () => gate + anchor);
}
writeFileSync(output, source);
console.log("ok");
