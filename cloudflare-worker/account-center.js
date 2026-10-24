// Central de Contas e pedidos de privacidade (LGPD) do Shakstory (Worker de produção).
// Reconstruída no repositório em 2026-10-23: as definições existiam só no Worker publicado e foram perdidas
// quando um upgrade trocou o trecho entre o bloco de planos e a entrada do Worker.
// Injetada por scripts/patch-worker-plans.mjs logo depois de plans.js (sem "import" e sem "export").
// Tabelas (já existem no D1): privacy_requests, privacy_request_events. cowilaTriageSafe e cowilaDeletionLifecycle ficam no Worker.

export async function cowilaPrivacy(req, env, owner) {
  const json = (x, s = 200) => new Response(JSON.stringify(x), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  if (!owner) return json({ error: "unauthorized" }, 401);
  if (!env.DB) return json({ error: "unavailable" }, 503);
  const u = new URL(req.url), base = "/api/privacy/requests";
  const KINDS = ["access", "correction", "portability", "processing_info"];
  try {
    if (u.pathname === base && req.method === "GET") {
      const rows = await env.DB.prepare("SELECT id,kind,status,created_at AS createdAt,updated_at AS updatedAt FROM privacy_requests WHERE owner_id=? ORDER BY created_at DESC LIMIT 20").bind(owner).all();
      return json({ requests: rows.results || [] });
    }
    if (u.pathname === base && req.method === "POST") {
      const b = await req.json().catch(() => null);
      if (!b || !KINDS.includes(b.kind) || typeof b.idempotencyKey !== "string" || !/^[0-9a-f-]{36}$/i.test(b.idempotencyKey)) return json({ error: "invalid_request" }, 400);
      const details = typeof b.details === "string" ? b.details.trim().slice(0, 2000) : "";
      const existing = await env.DB.prepare("SELECT id,kind,status FROM privacy_requests WHERE owner_id=? AND idempotency_key=?").bind(owner, b.idempotencyKey).first();
      if (existing) return json({ request: existing });
      const id = "PRV-" + crypto.randomUUID();
      await env.DB.prepare("INSERT INTO privacy_requests(id,owner_id,kind,details,idempotency_key) VALUES(?,?,?,?,?)").bind(id, owner, b.kind, details || null, b.idempotencyKey).run();
      await env.DB.prepare("INSERT OR IGNORE INTO privacy_request_events(id,request_id,event_type,note) VALUES(?,?,?,?)").bind(crypto.randomUUID(), id, "received", "Pedido recebido.").run();
      const status = await cowilaTriageSafe(env.DB, id, b.kind);
      return json({ request: { id, kind: b.kind, status } }, 201);
    }
    const m = u.pathname.match(/^\/api\/privacy\/requests\/([A-Za-z0-9-]{1,64})$/);
    if (m && req.method === "GET") {
      const row = await env.DB.prepare("SELECT id,kind,status,created_at AS createdAt,updated_at AS updatedAt FROM privacy_requests WHERE id=? AND owner_id=?").bind(m[1], owner).first();
      if (!row) return json({ error: "not_found" }, 404);
      const ev = await env.DB.prepare("SELECT event_type AS type,note,created_at AS createdAt FROM privacy_request_events WHERE request_id=? ORDER BY created_at ASC").bind(m[1]).all();
      return json({ request: row, events: ev.results || [] });
    }
    return json({ error: "method_not_allowed" }, 405);
  } catch { return json({ error: "service_unavailable" }, 503); }
}

export const ACCOUNT_CENTER_HTML = String.raw`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Central de Contas — Shakstory</title>
<style>
:root{color-scheme:dark;--bg:#0b1020;--panel:#121a2d;--line:#283656;--text:#edf2ff;--muted:#9fb0cf;--accent:#9b7cff;--danger:#ff7a7a;--ok:#65d6a5}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,system-ui,Arial;line-height:1.5}
main{max-width:760px;margin:0 auto;padding:24px 16px 64px}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:0 0 8px}
p{color:var(--muted);margin:0 0 12px;font-size:14px}section{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;margin-top:16px}
label{display:block;font-size:13px;margin:10px 0 4px}select,textarea,input{width:100%;background:#0b1020;color:var(--text);border:1px solid var(--line);border-radius:8px;padding:9px;font:inherit}
button{background:var(--accent);color:#fff;border:0;border-radius:8px;padding:9px 14px;font:inherit;cursor:pointer;margin:10px 8px 0 0}
button.danger{background:var(--danger);color:#240000}button.ghost{background:transparent;border:1px solid var(--line);color:var(--text)}
button:disabled{opacity:.5;cursor:default}.msg{font-size:13px;margin-top:10px;min-height:18px}.ok{color:var(--ok)}.err{color:var(--danger)}
ul{list-style:none;padding:0;margin:8px 0 0}li{border-top:1px solid var(--line);padding:8px 0;font-size:13px}a{color:var(--accent)}
</style>
</head>
<body>
<main>
<h1>Central de Contas</h1>
<p>Pedidos de privacidade e exclusão da sua conta. <a href="/">Voltar ao Shakstory</a></p>

<section aria-labelledby="priv-h">
<h2 id="priv-h">Pedido de privacidade</h2>
<p>Acesso, correção, portabilidade ou informações sobre o tratamento dos seus dados. Cada pedido passa por revisão antes de qualquer resposta ou alteração.</p>
<label for="priv-kind">Tipo de pedido</label>
<select id="priv-kind">
<option value="access">Acesso aos meus dados</option>
<option value="correction">Correção de dados</option>
<option value="portability">Portabilidade</option>
<option value="processing_info">Informações sobre o tratamento</option>
</select>
<label for="priv-details">Detalhes (opcional)</label>
<textarea id="priv-details" rows="3" maxlength="2000"></textarea>
<button id="priv-send" type="button">Enviar pedido</button>
<div class="msg" id="priv-msg" role="status"></div>
<ul id="priv-list"></ul>
</section>

<section aria-labelledby="del-h">
<h2 id="del-h">Exclusão da conta</h2>
<p>A exclusão fica agendada por 30 dias e pode ser cancelada nesse prazo. Seus manuscritos devem ter backup antes da exclusão definitiva.</p>
<div id="del-state"></div>
<div id="del-actions"></div>
<div class="msg" id="del-msg" role="status"></div>
</section>
</main>
<script>
(function(){
var KIND={access:"Acesso",correction:"Correção",portability:"Portabilidade",processing_info:"Informações sobre o tratamento"};
var STATUS={received:"Recebido",triaged:"Em triagem",review_required:"Em revisão",pending_confirmation:"Aguardando confirmação",scheduled:"Agendada",cancelled:"Cancelada",blocked:"Bloqueada",completed:"Concluída"};
function $(id){return document.getElementById(id)}
function say(id,t,ok){var e=$(id);e.textContent=t||"";e.className="msg "+(t?(ok?"ok":"err"):"")}
function uuid(){return crypto.randomUUID()}
async function api(path,opt){var r=await fetch(path,Object.assign({credentials:"same-origin",headers:{"content-type":"application/json"}},opt||{}));var d=await r.json().catch(function(){return {}});if(!r.ok)throw new Error(d.error||("http_"+r.status));return d}
function fmt(s){if(!s)return"";var d=new Date(String(s).replace(" ","T")+"Z");return isNaN(d)?String(s):d.toLocaleString("pt-BR")}
async function loadPriv(){try{var d=await api("/api/privacy/requests");var ul=$("priv-list");ul.textContent="";(d.requests||[]).forEach(function(r){var li=document.createElement("li");li.textContent=(KIND[r.kind]||r.kind)+" — "+(STATUS[r.status]||r.status)+" — "+fmt(r.createdAt)+" — "+r.id;ul.appendChild(li)})}catch(e){say("priv-msg","Não foi possível carregar seus pedidos.")}}
var privKey=uuid();
$("priv-send").onclick=async function(){var b=$("priv-send");b.disabled=true;say("priv-msg","");try{await api("/api/privacy/requests",{method:"POST",body:JSON.stringify({kind:$("priv-kind").value,details:$("priv-details").value,idempotencyKey:privKey})});privKey=uuid();$("priv-details").value="";say("priv-msg","Pedido recebido. Ele passará por revisão.",true);await loadPriv()}catch(e){say("priv-msg","Não foi possível enviar o pedido.")}finally{b.disabled=false}};
var delKey=uuid();
function btn(label,cls,fn){var b=document.createElement("button");b.type="button";b.textContent=label;b.className=cls||"";b.onclick=fn;return b}
async function loadDel(){var st=$("del-state"),ac=$("del-actions");st.textContent="";ac.textContent="";try{var d=await api("/api/account/deletion");var r=d.request;
if(!r||r.status==="cancelled"||r.status==="completed"){st.textContent="Nenhum pedido de exclusão ativo.";ac.appendChild(btn("Solicitar exclusão","danger",async function(){var t=prompt("Para solicitar, digite exatamente: SOLICITAR EXCLUSÃO");if(t!=="SOLICITAR EXCLUSÃO")return;try{await api("/api/account/deletion",{method:"POST",body:JSON.stringify({confirmation:t,idempotencyKey:delKey})});delKey=uuid();say("del-msg","Pedido registrado. Falta confirmar.",true);loadDel()}catch(e){say("del-msg","Não foi possível solicitar a exclusão.")}}));return}
st.textContent="Situação: "+(STATUS[r.status]||r.status)+(r.scheduledFor?" — prevista para "+fmt(r.scheduledFor):"");
if(r.status==="pending_confirmation")ac.appendChild(btn("Confirmar (30 dias)","danger",async function(){var t=prompt("Para confirmar, digite exatamente: CONFIRMAR 30 DIAS");if(t!=="CONFIRMAR 30 DIAS")return;try{await api("/api/account/deletion/confirm",{method:"POST",body:JSON.stringify({id:r.id,confirmation:t})});say("del-msg","Exclusão agendada. Você pode cancelar a qualquer momento nesse prazo.",true);loadDel()}catch(e){say("del-msg","Não foi possível confirmar.")}}));
if(r.status==="pending_confirmation"||r.status==="scheduled")ac.appendChild(btn("Cancelar pedido","ghost",async function(){try{await api("/api/account/deletion/cancel",{method:"POST",body:JSON.stringify({id:r.id})});say("del-msg","Pedido cancelado.",true);loadDel()}catch(e){say("del-msg","Não foi possível cancelar.")}}))
}catch(e){st.textContent="Não foi possível carregar o estado da exclusão."}}
loadPriv();loadDel();
})();
</script>
</body>
</html>`;
