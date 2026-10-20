async function cowilaDeletionLifecycle(req,env,owner){
const json=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
if(!owner)return json({error:"unauthorized"},401);
if(!env.DB)return json({error:"unavailable"},503);
const u=new URL(req.url),base="/api/account/deletion";
try{
if(u.pathname===base&&req.method==="GET"){
const row=await env.DB.prepare("SELECT id,status,requested_at AS requestedAt,scheduled_for AS scheduledFor FROM account_deletion_requests WHERE owner_id=? ORDER BY requested_at DESC LIMIT 1").bind(owner).first();
return json({request:row||null});}
if(u.pathname===base&&req.method==="POST"){
const b=await req.json().catch(()=>null);
if(!b||b.confirmation!=="SOLICITAR EXCLUSÃO"||typeof b.idempotencyKey!=="string"||!/^[0-9a-f-]{36}$/i.test(b.idempotencyKey))return json({error:"confirmation_required"},400);
const active=await env.DB.prepare("SELECT id,status FROM account_deletion_requests WHERE owner_id=? AND status IN ('pending_confirmation','scheduled') LIMIT 1").bind(owner).first();
if(active)return json({request:active});
const id="DEL-"+crypto.randomUUID();
await env.DB.prepare("INSERT INTO account_deletion_requests(id,owner_id,status,idempotency_key) VALUES(?,?,'pending_confirmation',?)").bind(id,owner,b.idempotencyKey).run();
return json({request:{id,status:"pending_confirmation"}},201);}
if(u.pathname===base+"/confirm"&&req.method==="POST"){
const b=await req.json().catch(()=>null);
if(!b||b.confirmation!=="CONFIRMAR 30 DIAS"||typeof b.id!=="string")return json({error:"confirmation_required"},400);
const row=await env.DB.prepare("SELECT status FROM account_deletion_requests WHERE id=? AND owner_id=?").bind(b.id,owner).first();
if(!row)return json({error:"not_found"},404);
if(row.status!=="pending_confirmation")return json({error:"invalid_state"},409);
await env.DB.prepare("UPDATE account_deletion_requests SET status='scheduled',confirmed_at=CURRENT_TIMESTAMP,scheduled_for=datetime('now','+30 days') WHERE id=? AND owner_id=? AND status='pending_confirmation'").bind(b.id,owner).run();
const next=await env.DB.prepare("SELECT id,status,scheduled_for AS scheduledFor FROM account_deletion_requests WHERE id=? AND owner_id=?").bind(b.id,owner).first();
return json({request:next,accessSuspended:false,permanentDeletionEnabled:false});}
if(u.pathname===base+"/cancel"&&req.method==="POST"){
const b=await req.json().catch(()=>null);
if(!b||typeof b.id!=="string")return json({error:"invalid_request"},400);
const row=await env.DB.prepare("SELECT status FROM account_deletion_requests WHERE id=? AND owner_id=?").bind(b.id,owner).first();
if(!row)return json({error:"not_found"},404);
if(row.status!=="scheduled"&&row.status!=="pending_confirmation")return json({error:"invalid_state"},409);
await env.DB.prepare("UPDATE account_deletion_requests SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=? AND status IN ('scheduled','pending_confirmation')").bind(b.id,owner).run();
return json({id:b.id,status:"cancelled"});}
return json({error:"method_not_allowed"},405);
}catch{return json({error:"service_unavailable"},503);}
}
