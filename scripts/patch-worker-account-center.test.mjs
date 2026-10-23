import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const script = new URL("./patch-worker-account-center.mjs", import.meta.url).pathname;
const base = "async function verifyAccessJwt(){}\nconst originalEditor='/api/book'; const mirror='/api/mirror-token';\nexport default{async fetch(req,env){const u=new URL(req.url);return new Response('editor');}}";
function run(input) {
 const dir=mkdtempSync(join(tmpdir(),"shak-account-"));
 try {
  const src=join(dir,"worker.txt"), out=join(dir,"out.js");
  writeFileSync(src,input);
  const result=spawnSync(process.execPath,[script,src,out],{encoding:"utf8"});
  return {result, output:result.status===0?readFileSync(out,"utf8"):null};
 } finally {rmSync(dir,{recursive:true,force:true});}
}
test("preserves editor and adds Access-gated account route",()=>{
 const {result,output}=run(base);
 assert.equal(result.status,0,result.stderr);
 assert.ok(output.includes("return new Response('editor')"));
 assert.ok(output.includes("verifyAccessJwt(jwt)"));
 assert.ok(output.includes("'/account-center'"));
 assert.ok(output.includes("req.method==='HEAD'?null:ACCOUNT_CENTER_HTML"));
});
test("extracts multipart JavaScript without deploying multipart envelope",()=>{
 const boundary="--shak-boundary";
 const multipart=boundary+"\r\nContent-Disposition: form-data; name=\"worker.js\"\r\n\r\n"+base+"\r\n"+boundary+"--\r\n";
 const {result,output}=run(multipart);
 assert.equal(result.status,0,result.stderr);
 assert.ok(output.startsWith("async function verifyAccessJwt()"));
 assert.ok(!output.includes("Content-Disposition"));
});
test("refuses to patch missing editor",()=>{
 const {result}=run(base.replace("/api/book","/api/absent"));
 assert.notEqual(result.status,0);
});
test("refuses duplicate route",()=>{
 const once=run(base);
 assert.equal(once.result.status,0);
 const twice=run(once.output);
 assert.notEqual(twice.result.status,0);
});
