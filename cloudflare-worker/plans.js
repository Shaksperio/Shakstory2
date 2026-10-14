// Contas, teste de 7 dias e planos do Shakstory (Worker de produção).
// Este arquivo é injetado no Worker por scripts/patch-worker-plans.mjs (as linhas "import" e as palavras "export" são removidas).
// Ele depende de verifyAccessJwt e MIRROR_EMAILS, que já vêm de mirror-token.js.
//
// Regras:
//  - Donos (MIRROR_EMAILS): sem mudança nenhuma; continuam nos caminhos de dados de sempre e com tudo liberado.
//  - Qualquer outro e-mail que passou pelo Cloudflare Access ganha uma conta própria: dados separados em "u/<id>/...",
//    7 dias de teste com tudo liberado e, depois, o plano contratado (ativado pelo dono) ou "expirado".
//  - Escrever e ler o próprio texto nunca é bloqueado. Bloqueia-se o que tem custo ou sai do app: Cowila, exportação e tornar a leitura pública (a prévia privada do próprio livro segue livre).
import { verifyAccessJwt, MIRROR_EMAILS } from "./mirror-token.js";

export const TRIAL_DAYS = 7;
const DAY_MS = 86400000;

/** O que cada plano libera. Para mudar uma regra, edite aqui (e no espelho client/src/lib/plans.ts). */
export const PLAN_DEFS = {
  owner: { label: "Administrador", export: true, cowila: true, share: true, cowilaDaily: 100000 },
  trial: { label: "Teste grátis", export: true, cowila: true, share: true, cowilaDaily: 30 },
  expirado: { label: "Teste encerrado", export: false, cowila: false, share: false, cowilaDaily: 0 },
  economico: { label: "Econômico", export: true, cowila: false, share: false, cowilaDaily: 0 },
  premium: { label: "Premium", export: true, cowila: true, share: false, cowilaDaily: 100 },
  vip: { label: "VIP", export: true, cowila: true, share: true, cowilaDaily: 400 },
};
export const PAID_PLANS = ["economico", "premium", "vip"];

/** Calcula o plano vigente de uma conta. row = { created_at, plan, paid_until } (ISO). */
export function resolvePlan(row, now = Date.now()) {
  const created = Date.parse(row?.created_at || "") || now;
  const trialEnd = created + TRIAL_DAYS * DAY_MS;
  const paidUntil = row?.paid_until ? Date.parse(row.paid_until) : null;
  let plan;
  if (PAID_PLANS.indexOf(row?.plan) !== -1 && (paidUntil === null || paidUntil > now)) plan = row.plan;
  else if (now < trialEnd) plan = "trial";
  else plan = "expirado";
  const def = PLAN_DEFS[plan];
  return {
    plan,
    label: def.label,
    trialEndsAt: new Date(trialEnd).toISOString(),
    daysLeft: plan === "trial" ? Math.max(0, Math.ceil((trialEnd - now) / DAY_MS)) : null,
    paidUntil: paidUntil !== null ? new Date(paidUntil).toISOString() : null,
    features: { export: def.export, cowila: def.cowila, share: def.share },
    cowilaDaily: def.cowilaDaily,
  };
}

const planJson = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const brDay = now => new Date(now - 3 * 3600000).toISOString().slice(0, 10);

let plansReady = false;
async function ensurePlanTables(db) {
  if (plansReady) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS shak_users (email TEXT PRIMARY KEY, created_at TEXT NOT NULL, plan TEXT, paid_until TEXT)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS shak_usage (email TEXT NOT NULL, day TEXT NOT NULL, cowila INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (email, day))").run();
  plansReady = true;
}

async function userKey(email) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email));
  return Array.from(new Uint8Array(bytes)).slice(0, 12).map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Mesmo D1, mas todo caminho de documento do usuário ganha o prefixo da conta. Compartilhamentos por token (shares/) ficam globais. */
export function scopeDb(db, prefix) {
  const fix = arg => (typeof arg === "string" && arg.indexOf("/") !== -1 && arg.indexOf("shares/") !== 0 && /^[A-Za-z0-9_.\/%-]+(\.json|\/%)$/.test(arg) ? prefix + arg : arg);
  return {
    prepare(sql) {
      const statement = db.prepare(String(sql).replace(/'(books)\/%\.json'/g, "'" + prefix + "$1/%.json'"));
      return {
        bind: (...args) => statement.bind(...args.map(fix)),
        first: (...a) => statement.first(...a),
        all: (...a) => statement.all(...a),
        run: (...a) => statement.run(...a),
      };
    },
    batch: list => db.batch(list),
  };
}

/**
 * Porta de entrada do Worker. Devolve {} para seguir como sempre, { response } para responder já,
 * ou { env } com o D1 isolado da conta.
 */
export async function shakGate(req, env, u, options = {}) {
  const path = u.pathname;
  if (path === "/health" || path === "/self-test" || path === "/api/mirror-token" || path === "/api/share/login" || path.indexOf("/api/public/") === 0) return {};
  if (path.indexOf("/api/share/") === 0 && req.method === "GET") return {};
  const jwt = req.headers.get("Cf-Access-Jwt-Assertion");
  const now = options.now ?? Date.now();
  const owners = (env.MIRROR_EMAILS ? String(env.MIRROR_EMAILS).split(",") : MIRROR_EMAILS).map(item => item.trim().toLowerCase());
  if (!jwt) {
    // Sem credencial do Access: mesmo comportamento de antes (o próprio Access impede que isso chegue de fora).
    if (path === "/api/me") return { response: planJson({ legacy: true, owner: true, plan: "owner", label: PLAN_DEFS.owner.label, features: { export: true, cowila: true, share: true } }) };
    return {};
  }
  const email = await (options.verify || verifyAccessJwt)(jwt, options.jwt);
  if (!email) return { response: planJson({ error: "unauthorized" }, 401) };
  const owner = owners.indexOf(email) !== -1;

  if (owner) {
    if (path === "/api/me") return { response: planJson({ email, owner: true, plan: "owner", label: PLAN_DEFS.owner.label, features: { export: true, cowila: true, share: true } }) };
    if (path === "/api/admin/users" && req.method === "GET") {
      await ensurePlanTables(env.DB);
      const rows = await env.DB.prepare("SELECT email, created_at, plan, paid_until FROM shak_users ORDER BY created_at DESC LIMIT 500").all();
      return { response: planJson({ users: (rows.results || []).map(row => ({ email: row.email, createdAt: row.created_at, ...resolvePlan(row, now) })) }) };
    }
    if (path === "/api/admin/plan" && req.method === "POST") {
      let body;
      try { body = await req.json(); } catch { return { response: planJson({ error: "invalid" }, 400) }; }
      const target = String(body.email || "").trim().toLowerCase();
      const plan = String(body.plan || "");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target) || target.length > 200) return { response: planJson({ error: "invalid_email" }, 400) };
      if (PAID_PLANS.concat(["trial", "expirado"]).indexOf(plan) === -1) return { response: planJson({ error: "invalid_plan" }, 400) };
      const days = Math.min(3650, Math.max(1, Math.floor(Number(body.days) || 30)));
      await ensurePlanTables(env.DB);
      const stamp = new Date(now).toISOString();
      await env.DB.prepare("INSERT OR IGNORE INTO shak_users (email, created_at, plan, paid_until) VALUES (?, ?, NULL, NULL)").bind(target, stamp).run();
      if (PAID_PLANS.indexOf(plan) !== -1) await env.DB.prepare("UPDATE shak_users SET plan = ?, paid_until = ? WHERE email = ?").bind(plan, new Date(now + days * DAY_MS).toISOString(), target).run();
      else if (plan === "trial") await env.DB.prepare("UPDATE shak_users SET plan = NULL, paid_until = NULL, created_at = ? WHERE email = ?").bind(stamp, target).run();
      else await env.DB.prepare("UPDATE shak_users SET plan = NULL, paid_until = NULL, created_at = ? WHERE email = ?").bind(new Date(now - (TRIAL_DAYS + 1) * DAY_MS).toISOString(), target).run();
      const row = await env.DB.prepare("SELECT email, created_at, plan, paid_until FROM shak_users WHERE email = ?").bind(target).first();
      return { response: planJson({ ok: true, user: { email: target, ...resolvePlan(row, now) } }) };
    }
    return {};
  }

  // Conta comum: cria no primeiro acesso e isola os dados.
  const db = env.DB;
  await ensurePlanTables(db);
  await db.prepare("INSERT OR IGNORE INTO shak_users (email, created_at, plan, paid_until) VALUES (?, ?, NULL, NULL)").bind(email, new Date(now).toISOString()).run();
  const row = await db.prepare("SELECT email, created_at, plan, paid_until FROM shak_users WHERE email = ?").bind(email).first();
  const info = resolvePlan(row, now);
  const day = brDay(now);
  const used = Number((await db.prepare("SELECT cowila FROM shak_usage WHERE email = ? AND day = ?").bind(email, day).first())?.cowila || 0);

  if (path === "/api/me") return { response: planJson({ email, owner: false, ...info, cowilaUsedToday: used }) };
  if (path.indexOf("/api/admin/") === 0) return { response: planJson({ error: "forbidden" }, 403) };

  const blocked = feature => planJson({ error: "plan_required", feature, plan: info.plan, label: info.label, message: info.plan === "expirado" ? "Seu teste de " + TRIAL_DAYS + " dias terminou. Ative um plano para continuar." : "Este recurso não está incluído no seu plano." }, 402);
  if (path === "/api/assist" && req.method === "POST") {
    if (!info.features.cowila) return { response: blocked("cowila") };
    if (used >= info.cowilaDaily) return { response: planJson({ error: "quota", message: "Limite diário de mensagens do Cowila atingido. Volta amanhã ou fale com o administrador.", limit: info.cowilaDaily }, 429) };
    await db.prepare("INSERT INTO shak_usage (email, day, cowila) VALUES (?, ?, 1) ON CONFLICT(email, day) DO UPDATE SET cowila = cowila + 1").bind(email, day).run();
  }
  if (path === "/api/share/visibility" && req.method === "POST" && !info.features.share) return { response: blocked("share") };
  if (path === "/api/book" && req.method === "POST") {
    const length = Number(req.headers.get("content-length") || 0);
    if (length > 1900000) return { response: planJson({ error: "too_large" }, 413) };
  }
  const prefix = "u/" + (await userKey(email)) + "/";
  return { env: { ...env, DB: scopeDb(db, prefix) } };
}
