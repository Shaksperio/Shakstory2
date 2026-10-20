// Integra a API LGPD ao bundle atual do Worker sem alterar rotas editoriais.
// Uso: node scripts/patch-worker-privacy.mjs <worker-atual.js> <saida.js>
// Não publica nem altera D1. Falha se a estrutura não corresponder ao Worker inspecionado.
import { readFileSync, writeFileSync } from "node:fs";

const [input, output] = process.argv.slice(2);
if (!input || !output || input === output) {
  console.error("uso: node scripts/patch-worker-privacy.mjs <worker-atual.js> <saida.js> (arquivos distintos)");
  process.exit(2);
}
const source = readFileSync(input, "utf8");
if (source.includes("handlePrivacyRequest(")) {
  console.error("Rota LGPD já presente; nenhum arquivo modificado");
  process.exit(3);
}
const anchor = "export default{async fetch(req,env){const u=new URL(req.url);";
if (source.split(anchor).length !== 2 || !source.includes("async function verifyAccessJwt(jwt") || !source.includes("if(u.pathname.startsWith('/api/'))")) {
  console.error("Worker não corresponde ao formato validado; nenhum arquivo modificado");
  process.exit(4);
}
const helper = readFileSync(new URL("../cloudflare-worker/privacy-requests.js", import.meta.url), "utf8")
  .replace(/^export /gm, "");
const route = `if(u.pathname==="/api/privacy/requests"||u.pathname.startsWith("/api/privacy/requests/")){
  const verifiedOwnerId=await verifyAccessJwt(req.headers.get("Cf-Access-Jwt-Assertion"));
  return handlePrivacyRequest(req,env,verifiedOwnerId);
}
`;
const updated = source.replace(anchor, () => helper + "\n" + anchor + route);
if (updated === source) throw new Error("Patch não aplicado");
writeFileSync(output, updated);
console.log("Patch LGPD preparado. Revisar diff e executar testes antes de publicar.");
