// Usage: node scripts/patch-worker-account-center.mjs worker.js output.js
// This patch preserves the existing Worker source and inserts only a dedicated route.
import { readFileSync, writeFileSync } from "node:fs";
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("input and output paths required");
let source = readFileSync(input, "utf8");
const marker = "export default{async fetch(req,env){const u=new URL(req.url);";
if (source.split(marker).length !== 2) throw new Error("Unexpected Worker entry point");
if (source.includes("'/account-center'")) throw new Error("Account Center already patched");
const route = `if(u.pathname==='/account-center'){if(req.method!=='GET'&&req.method!=='HEAD')return new Response('Method not allowed',{status:405});const jwt=req.headers.get('Cf-Access-Jwt-Assertion');if(!jwt||!(await verifyAccessJwt(jwt)))return new Response('Unauthorized',{status:401,headers:{'cache-control':'no-store'}});return new Response(ACCOUNT_CENTER_HTML,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});}`;
const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Central de Contas | Shakstory</title><style>body{background:#0b1020;color:#edf2ff;font:16px system-ui;padding:24px}main{max-width:740px;margin:auto}section{background:#121a2d;border:1px solid #283656;border-radius:12px;padding:20px;margin:20px 0}a{color:#c9b8ff}button{padding:12px;border:0;border-radius:8px}button:disabled{opacity:.6}</style><main><a href="/">← Voltar ao editor</a><h1>Central de Contas</h1><section><h2>Identidade</h2><p>Conta protegida pelo Cloudflare Access. A vinculação Google independente ainda precisa ser concluída.</p></section><section><h2>Exclusão de conta</h2><p>Por segurança, a exclusão permanente está desabilitada até a verificação da recuperação dos manuscritos.</p><button disabled>Exclusão indisponível</button></section></main></html>`;
source = source.replace(marker, "const ACCOUNT_CENTER_HTML = " + JSON.stringify(html) + ";\n" + marker.replace("const u=new URL(req.url);","const u=new URL(req.url);"+route));
writeFileSync(output,source);
console.log("Patched account center route; original Worker preserved");
