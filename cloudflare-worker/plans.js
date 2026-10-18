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

/** Conta do e-mail (criada no primeiro acesso, o que inicia o teste), plano vigente e uso do Cowila hoje. */
export async function loadAccount(db, email, now = Date.now()) {
  await ensurePlanTables(db);
  await db.prepare("INSERT OR IGNORE INTO shak_users (email, created_at, plan, paid_until) VALUES (?, ?, NULL, NULL)").bind(email, new Date(now).toISOString()).run();
  const row = await db.prepare("SELECT email, created_at, plan, paid_until FROM shak_users WHERE email = ?").bind(email).first();
  const info = resolvePlan(row, now);
  const day = brDay(now);
  const used = Number((await db.prepare("SELECT cowila FROM shak_usage WHERE email = ? AND day = ?").bind(email, day).first())?.cowila || 0);
  return { info, day, used };
}

export const planBlocked = (info, feature) => planJson({ error: "plan_required", feature, plan: info.plan, label: info.label, message: info.plan === "expirado" ? "Seu teste de " + TRIAL_DAYS + " dias terminou. Ative um plano para continuar." : "Este recurso não está incluído no seu plano." }, 402);

/** Libera (e contabiliza) uma mensagem do Cowila. Devolve null se pode seguir, ou a resposta de bloqueio (402 plano, 429 limite do dia). */
export async function useCowila(db, email, account) {
  if (!account.info.features.cowila) return planBlocked(account.info, "cowila");
  if (account.used >= account.info.cowilaDaily) return planJson({ error: "quota", message: "Limite diário de mensagens do Cowila atingido. Volta amanhã ou fale com o administrador.", limit: account.info.cowilaDaily }, 429);
  await db.prepare("INSERT INTO shak_usage (email, day, cowila) VALUES (?, ?, 1) ON CONFLICT(email, day) DO UPDATE SET cowila = cowila + 1").bind(email, account.day).run();
  return null;
}

export const MAX_VERSIONS = 30;
export const MAX_DOC_BYTES = 1900000;
export const MAX_STORAGE_BYTES = 40000000;

/** Mesmo D1, mas todo caminho de documento do usuário ganha o prefixo da conta. Compartilhamentos por token (shares/) ficam globais. */
export function scopeDb(db, prefix) {
  // Qualquer caminho "*.json" (inclusive library.json, sem barra) ou padrão "x/%" é da conta; só shares/ é global.
  const fix = arg => (typeof arg === "string" && arg.indexOf("shares/") !== 0 && arg.indexOf(prefix) !== 0 && /^[A-Za-z0-9_.\/%-]+(\.json|\/%)$/.test(arg) ? prefix + arg : arg);
  return {
    prepare(sql) {
      const text = String(sql);
      const statement = db.prepare(text.replace(/'(books)\/%\.json'/g, "'" + prefix + "$1/%.json'"));
      const snapshot = /INSERT OR REPLACE INTO editorial_documents/.test(text);
      const wrap = (bound, args) => ({
        first: (...a) => bound.first(...a),
        all: (...a) => bound.all(...a),
        async run(...a) {
          const result = await bound.run(...a);
          // histórico limitado: depois de gravar o snapshot de um livro, mantém só os mais recentes
          const path = snapshot ? String(args[0] || "") : "";
          const book = path.indexOf(prefix + "versions/") === 0 ? path.slice((prefix + "versions/").length).split("/")[0] : "";
          if (book) {
            try {
              await db.prepare("DELETE FROM editorial_documents WHERE document_path LIKE ? AND document_path NOT IN (SELECT document_path FROM editorial_documents WHERE document_path LIKE ? ORDER BY version DESC LIMIT ?)").bind(prefix + "versions/" + book + "/%", prefix + "versions/" + book + "/%", MAX_VERSIONS).run();
            } catch { /* limpeza é só higiene */ }
          }
          return result;
        },
      });
      return {
        bind: (...args) => { const fixed = args.map(fix); return wrap(statement.bind(...fixed), fixed); },
        ...wrap(statement, []),
      };
    },
    batch: list => db.batch(list),
  };
}

/** Bytes UTF-8 de um texto (acentos, emojis e CJK ocupam mais de 1 byte; contar caracteres subestima). */
export const shakUtf8Bytes = text => new TextEncoder().encode(String(text)).length;

/** Bytes já usados pela conta (dados + histórico). CAST para BLOB faz o SQLite contar bytes, não caracteres. */
async function storageUsed(db, prefix) {
  const row = await db.prepare("SELECT COALESCE(SUM(LENGTH(CAST(data_json AS BLOB))), 0) AS n FROM editorial_documents WHERE document_path LIKE ?").bind(prefix + "%").first();
  return Number(row?.n || 0);
}

/** Chave real (com prefixo da conta) de um caminho de documento, igual à regra de scopeDb. Vazio se não for um caminho da conta. */
function shakOwnKey(prefix, path) {
  if (typeof path !== "string" || path.indexOf("shares/") === 0 || !/^[A-Za-z0-9_.\/-]+\.json$/.test(path)) return "";
  return path.indexOf(prefix) === 0 ? path : prefix + path;
}

/** Bytes do documento que esta gravação vai substituir (0 se for um documento novo). */
async function shakReplacedBytes(db, prefix, path) {
  const key = shakOwnKey(prefix, path);
  if (!key) return 0;
  const row = await db.prepare("SELECT COALESCE(LENGTH(CAST(data_json AS BLOB)), 0) AS n FROM editorial_documents WHERE document_path = ?").bind(key).first();
  return Number(row?.n || 0);
}

const SHAK_MAX_READ_BYTES = 8000000;

/** Lê o corpo de uma gravação uma vez: tamanho real em bytes (o maior entre o declarado e o medido) e o caminho do documento. */
async function shakReadWrite(req) {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > SHAK_MAX_READ_BYTES) return { bytes: declared, path: "" };
  let text = "";
  try { text = await req.clone().text(); } catch { text = ""; }
  let path = "";
  try { const parsed = JSON.parse(text); if (parsed && typeof parsed.path === "string") path = parsed.path; } catch { path = ""; }
  return { bytes: Math.max(declared, shakUtf8Bytes(text)), path };
}

// ===== Guardião de consumo: contadores diários e níveis de proteção =====
// Os orçamentos são INTERNOS e conservadores (não são os limites do provedor, que não foram verificados). Ajuste por env:
//   SHAK_BUDGETS='{"writes":30000,"write_bytes":300000000,"ai":3000}'  SHAK_LEVELS='[0.7,0.85,0.95]'
// Regra de ouro: o guardião NUNCA bloqueia escrita nem leitura de manuscritos; só reduz ou recusa o que é acessório (Cowila).
export const DEFAULT_BUDGETS = { writes: 30000, write_bytes: 300000000, ai: 3000 };
export const DEFAULT_THRESHOLDS = [0.7, 0.85, 0.95];
export const PROTECTION_LEVELS = ["normal", "atencao", "protecao", "preservacao"];

function shakParseJson(text) { try { return JSON.parse(String(text)); } catch { return null; } }

export function guardianConfig(env) {
  const raw = env && env.SHAK_BUDGETS ? shakParseJson(env.SHAK_BUDGETS) : null;
  const budgets = { ...DEFAULT_BUDGETS };
  if (raw && typeof raw === "object") for (const key of Object.keys(DEFAULT_BUDGETS)) if (Number(raw[key]) > 0) budgets[key] = Number(raw[key]);
  const t = env && env.SHAK_LEVELS ? shakParseJson(env.SHAK_LEVELS) : null;
  const ok = Array.isArray(t) && t.length === 3 && t.every((v, i) => Number(v) > 0 && Number(v) <= 1 && (i === 0 || Number(v) > Number(t[i - 1])));
  return { budgets, thresholds: ok ? t.map(Number) : DEFAULT_THRESHOLDS };
}

/** Nível pelo maior risco individual (nunca soma percentuais de métricas diferentes). */
export function protectionLevel(counts, config) {
  let top = { metric: "", ratio: 0 };
  for (const key of Object.keys(config.budgets)) {
    const ratio = Number(counts?.[key] || 0) / config.budgets[key];
    if (ratio > top.ratio) top = { metric: key, ratio };
  }
  let index = 0;
  config.thresholds.forEach((limit, i) => { if (top.ratio >= limit) index = i + 1; });
  return { level: PROTECTION_LEVELS[index], metric: top.metric, percent: Math.round(top.ratio * 100) };
}

let shakMeterReady = false;
async function shakEnsureMeter(db) {
  if (shakMeterReady) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS shak_meter (day TEXT PRIMARY KEY, writes INTEGER NOT NULL DEFAULT 0, write_bytes INTEGER NOT NULL DEFAULT 0, ai INTEGER NOT NULL DEFAULT 0)").run();
  shakMeterReady = true;
}

/** Soma ao contador do dia numa única instrução (atômica no D1: sem ler-e-gravar, então não perde contagem em paralelo). Falha em silêncio. */
async function shakBumpMeter(db, now, add) {
  try {
    await shakEnsureMeter(db);
    await db.prepare("INSERT INTO shak_meter (day, writes, write_bytes, ai) VALUES (?, ?, ?, ?) ON CONFLICT(day) DO UPDATE SET writes = writes + excluded.writes, write_bytes = write_bytes + excluded.write_bytes, ai = ai + excluded.ai")
      .bind(brDay(now), add.writes || 0, add.bytes || 0, add.ai || 0).run();
  } catch { /* o guardião nunca derruba uma gravação */ }
}

/** Nível atual de proteção. Se o contador não puder ser lido, segue como "normal" (falha aberta, nunca bloqueia). */
async function shakReadProtection(db, env, now) {
  const config = guardianConfig(env);
  try {
    await shakEnsureMeter(db);
    const row = await db.prepare("SELECT writes, write_bytes, ai FROM shak_meter WHERE day = ?").bind(brDay(now)).first();
    return protectionLevel(row, config);
  } catch {
    return { level: "normal", metric: "", percent: 0 };
  }
}

/**
 * Porta de entrada do Worker. Devolve {} para seguir como sempre, { response } para responder já,
 * ou { env } com o D1 isolado da conta.
 */
async function avRoute(req, env, u, email, now) {
  let body = null;
  if (req.method === "POST") { try { body = await req.json(); } catch { body = null; } }
  const result = await antivirusApi(env.DB, email, req.method, u.pathname, body, u.origin, now);
  return planJson(result.body, result.status);
}

async function shakGateCore(req, env, u, options = {}) {
  const path = u.pathname;
  if (path === "/health" || path === "/self-test" || path === "/api/mirror-token" || path === "/api/share/login" || path.indexOf("/api/public/") === 0) return {};
  if (path.indexOf("/api/share/") === 0 && req.method === "GET") return {};
  // Limite de uma linha do D1: avisa com clareza em vez de deixar o banco recusar sem explicação (vale para todos, inclusive donos).
  const write = path === "/api/book" && req.method === "POST" ? await shakReadWrite(req) : null;
  if (write && write.bytes > MAX_DOC_BYTES) {
    return { response: planJson({ error: "too_large", message: "Este documento passou do limite de 1,9 MB do banco. Exporte um backup e divida o conteúdo em outro livro." }, 413) };
  }
  const jwt = req.headers.get("Cf-Access-Jwt-Assertion");
  const now = options.now ?? Date.now();
  const owners = (env.MIRROR_EMAILS ? String(env.MIRROR_EMAILS).split(",") : MIRROR_EMAILS).map(item => item.trim().toLowerCase());
  if (!jwt) {
    // Sem credencial do Access: mesmo comportamento de antes (o próprio Access impede que isso chegue de fora).
    if (path === "/api/me") return { response: planJson({ legacy: true, owner: true, plan: "owner", label: PLAN_DEFS.owner.label, features: { export: true, cowila: true, share: true } }) };
    if (path.indexOf("/api/security/antivirus") === 0) return { response: await avRoute(req, env, u, "legacy-owner", now) };
    return {};
  }
  const email = await (options.verify || verifyAccessJwt)(jwt, options.jwt);
  if (!email) return { response: planJson({ error: "unauthorized" }, 401) };
  const owner = owners.indexOf(email) !== -1;

  if (path.indexOf("/api/security/antivirus") === 0) {
    if (!owner) return { response: planJson({ error: "O relatório antivírus é exclusivo do proprietário." }, 403) };
    return { response: await avRoute(req, env, u, email, now) };
  }
  if (owner) {
    // Dono: nada é bloqueado. O contador só observa (falha em silêncio) para o nível de proteção refletir o consumo total.
    if (write) await shakBumpMeter(env.DB, now, { writes: 1, bytes: write.bytes });
    if (path === "/api/assist" && req.method === "POST") await shakBumpMeter(env.DB, now, { ai: 1 });
    if (path === "/api/me") return { response: planJson({ email, owner: true, plan: "owner", label: PLAN_DEFS.owner.label, features: { export: true, cowila: true, share: true }, protection: await shakReadProtection(env.DB, env, now) }) };
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
  const account = await loadAccount(db, email, now);
  const info = account.info;

  if (path === "/api/me") return { response: planJson({ email, owner: false, ...info, cowilaUsedToday: account.used, protection: await shakReadProtection(db, env, now) }) };
  if (path.indexOf("/api/admin/") === 0) return { response: planJson({ error: "forbidden" }, 403) };

  if (path === "/api/assist" && req.method === "POST") {
    // Cowila é o único recurso acessório recusado pelo guardião; escrever e ler manuscritos nunca é.
    const protection = await shakReadProtection(db, env, now);
    if (protection.level === "preservacao") return { response: planJson({ error: "guardian_paused", level: protection.level, message: "O Cowila está em pausa para preservar o serviço. Seus textos continuam sendo salvos normalmente; tente de novo mais tarde." }, 503) };
    const view = protection.level === "protecao" ? { ...account, info: { ...info, cowilaDaily: Math.floor(info.cowilaDaily / 2) } } : account;
    const stop = await useCowila(db, email, view);
    if (stop) return { response: stop };
    await shakBumpMeter(db, now, { ai: 1 });
  }
  if (path === "/api/share/visibility" && req.method === "POST" && !info.features.share) return { response: planBlocked(info, "share") };
  const prefix = "u/" + (await userKey(email)) + "/";
  if (write) {
    // Espaço líquido: o documento substituído sai da conta antes de somar o novo (regravar o mesmo livro não conta duas vezes).
    const net = (await storageUsed(db, prefix)) - (await shakReplacedBytes(db, prefix, write.path)) + write.bytes;
    if (net > (options.maxStorage ?? MAX_STORAGE_BYTES)) return { response: planJson({ error: "storage_full", message: "O espaço da sua conta está cheio. Exclua livros ou versões antigas, ou fale com o administrador." }, 413) };
    await shakBumpMeter(db, now, { writes: 1, bytes: write.bytes });
  }
  return { env: { ...env, DB: scopeDb(db, prefix) } };
}

// ===== Segurança antivírus: credenciais efêmeras por sessão (só hash e prefixo ficam guardados) =====
const AV_TABLE = "CREATE TABLE IF NOT EXISTS shak_av_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, token_hash TEXT NOT NULL, token_prefix TEXT NOT NULL, base_url TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, last_used_at INTEGER, revoked_at INTEGER)";
const avReport = row => ({ id: row.id, tokenPrefix: row.token_prefix, projectBaseUrl: row.base_url, status: row.status, createdAt: new Date(row.created_at).toISOString(), lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null, revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null });
async function avSha(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}
function avSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function avCreate(db, email, baseUrl, now) {
  const secret = avSecret();
  await db.prepare("INSERT INTO shak_av_sessions (email, token_hash, token_prefix, base_url, status, created_at, last_used_at) VALUES (?, ?, ?, ?, 'active', ?, ?)").bind(email, await avSha(secret), secret.slice(0, 10), baseUrl, now, now).run();
}
/** Trata /api/security/antivirus (GET lista, POST rotate e POST revoke). Só chamar para o dono. Devolve {status, body}. */
export async function antivirusApi(db, email, method, path, body, baseUrl, now = Date.now()) {
  await db.prepare(AV_TABLE).run();
  const active = async () => (await db.prepare("SELECT * FROM shak_av_sessions WHERE email = ? AND status = 'active' ORDER BY created_at DESC, id DESC LIMIT 1").bind(email).all()).results || [];
  if (method === "GET" && path === "/api/security/antivirus") {
    const current = await active();
    if (current.length) await db.prepare("UPDATE shak_av_sessions SET last_used_at = ?, base_url = ? WHERE id = ?").bind(now, baseUrl, current[0].id).run();
    else await avCreate(db, email, baseUrl, now);
    const rows = (await db.prepare("SELECT * FROM shak_av_sessions WHERE email = ? ORDER BY created_at DESC, id DESC LIMIT 50").bind(email).all()).results || [];
    return { status: 200, body: rows.map(avReport) };
  }
  if (method === "POST" && path === "/api/security/antivirus/rotate") {
    await db.prepare("UPDATE shak_av_sessions SET status = 'revoked', revoked_at = ? WHERE email = ? AND status = 'active'").bind(now, email).run();
    await avCreate(db, email, baseUrl, now);
    return { status: 200, body: { rotated: true } };
  }
  if (method === "POST" && path === "/api/security/antivirus/revoke") {
    const id = Number(body && body.id);
    if (!Number.isInteger(id) || id <= 0) return { status: 400, body: { error: "Credencial inválida." } };
    const found = (await db.prepare("SELECT id FROM shak_av_sessions WHERE id = ? AND email = ? AND status = 'active'").bind(id, email).all()).results || [];
    if (!found.length) return { status: 200, body: { revoked: false } };
    await db.prepare("UPDATE shak_av_sessions SET status = 'revoked', revoked_at = ? WHERE id = ? AND email = ?").bind(now, id, email).run();
    return { status: 200, body: { revoked: true } };
  }
  return { status: 404, body: { error: "not found" } };
}

/** IA opcional: se o segredo GEMINI_API_KEY existir no Worker, usa o Gemini e cai no Workers AI se ele falhar. Sem o segredo, nada muda. */
export function withGemini(env, fetchFn) {
  if (!env || !env.GEMINI_API_KEY || !env.AI || env.AI.__gemini) return env;
  const base = env.AI;
  const doFetch = fetchFn || ((...args) => fetch(...args));
  const model = String(env.GEMINI_MODEL || "gemini-2.0-flash").replace(/[^A-Za-z0-9._-]/g, "");
  const wrapped = {
    __gemini: true,
    async run(name, input) {
      try {
        const messages = (input && input.messages) || [];
        const system = messages.filter(item => item.role === "system").map(item => item.content).join("\n\n");
        const contents = messages.filter(item => item.role !== "system").map(item => ({ role: item.role === "assistant" ? "model" : "user", parts: [{ text: String(item.content) }] }));
        const res = await doFetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": String(env.GEMINI_API_KEY) },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { maxOutputTokens: (input && input.max_tokens) || 900 } }),
        });
        if (!res.ok) throw new Error("gemini_" + res.status);
        const data = await res.json();
        const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
        const text = Array.isArray(parts) ? parts.map(part => part.text || "").join("").trim() : "";
        if (!text) throw new Error("gemini_empty");
        return { response: text };
      } catch {
        return base.run(name, input);
      }
    },
  };
  return { ...env, AI: wrapped };
}

export async function shakGate(req, env, u, options = {}) {
  const result = await shakGateCore(req, env, u, options);
  if (result.response || !env.GEMINI_API_KEY) return result;
  return { ...result, env: withGemini(result.env || env, options.fetch) };
}
