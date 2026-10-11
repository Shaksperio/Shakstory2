// Worker "shakstory-leitor" (https://shakstory-leitor.antonyopintor.workers.dev), SEM Cloudflare Access.
// Serve o mesmo frontend e expõe somente leitura de histórias marcadas como públicas.
function json(x,s=200){return new Response(JSON.stringify(x),{status:s,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex, nofollow'}})}
const tokenOk=t=>typeof t==='string'&&/^[A-Za-z0-9_-]{16,64}$/.test(t);
export default{async fetch(req,env){const u=new URL(req.url);
if(req.method!=='GET'&&req.method!=='HEAD')return json({error:'method'},405);
const m=u.pathname.match(/^\/api\/public\/share\/([A-Za-z0-9_-]+)$/);
if(m){if(!tokenOk(m[1]))return json({error:'not_found'},404);const row=await env.DB.prepare('SELECT data_json FROM editorial_documents WHERE document_path=?').bind('shares/'+m[1]+'.json').first();if(!row)return json({error:'not_found'},404);let cur;try{cur=JSON.parse(row.data_json)}catch{return json({error:'not_found'},404)}if(cur.visibility!=='public')return json({error:'private'},404);return json({book:cur.book,updatedAt:cur.updatedAt})}
if(u.pathname.startsWith('/api/')||u.pathname==='/health')return json({error:'not_found'},404);
const RAW_BASE='https://raw.githubusercontent.com/Shaksperio/Shakstory2/cloudflare-dist-v2';
const immutable=u.pathname.startsWith('/assets/');
let assetPath=u.pathname==='/'?'/index.html':u.pathname;
const fetchAsset=async p=>fetch(RAW_BASE+p,{cf:{cacheEverything:true,cacheTtl:p.startsWith('/assets/')?86400:60}});
let upstream=await fetchAsset(assetPath);
if(upstream.status===404&&!immutable){assetPath='/index.html';upstream=await fetchAsset(assetPath)}
if(!upstream.ok)return new Response('Leitor do Shakstory indisponivel',{status:502});
const ext=(assetPath.split('.').pop()||'').toLowerCase();
const types={html:'text/html; charset=utf-8',js:'application/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json; charset=utf-8',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',ico:'image/x-icon',woff:'font/woff',woff2:'font/woff2'};
const h=new Headers();h.set('content-type',types[ext]||'application/octet-stream');h.set('cache-control',immutable?'public,max-age=31536000,immutable':'no-cache');h.set('x-content-type-options','nosniff');h.set('x-robots-tag','noindex, nofollow');
return new Response(upstream.body,{status:upstream.status,headers:h})}}
