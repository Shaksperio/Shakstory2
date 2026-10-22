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

/** Versão do código de contas/planos que está no Worker. O app compara com a versão esperada e avisa se a produção ficou para trás. Mude junto com EXPECTED_WORKER_VERSION em client/src/lib/plans.ts. */
export const SHAK_WORKER_VERSION = "2026-10-21.4";
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

// ===== Catálogo de direitos (versionado) =====
// Cada direito tem uma chave estável. "source" diz de onde vem hoje a liberação:
//   always = fundamental, liberado em qualquer plano (inclusive teste encerrado): nunca depende de assinatura;
//   export / cowila / share = segue a permissão do plano (PLAN_DEFS);
//   open = hoje não é restringido por plano (comportamento atual, preservado).
// "enforce" diz QUEM consegue impor: "server" (passa por rota do Worker) ou "client" (roda no navegador: a trava é só oferta de
// interface e pode ser contornada; não é segurança). Mudar o plano de um direito = mudar a coluna de PLAN_DEFS ou o "source" daqui.
export const CATALOG_VERSION = 1;
export const ENTITLEMENT_DEFS = {
  "editor.basic": { source: "always", enforce: "client" },
  "book.structure.basic": { source: "always", enforce: "client" },
  "backup.json": { source: "always", enforce: "client" },
  "recovery": { source: "always", enforce: "client" },
  "export.json": { source: "always", enforce: "client" },
  "export.txt": { source: "export", enforce: "client" },
  "export.html": { source: "export", enforce: "client" },
  "export.epub": { source: "export", enforce: "client" },
  "export.pdf": { source: "export", enforce: "client" },
  "export.docx": { source: "export", enforce: "client" },
  "planning.advanced": { source: "open", enforce: "client" },
  "book.structure.full": { source: "open", enforce: "client" },
  "audio.read": { source: "open", enforce: "client" },
  "translate.chapter": { source: "open", enforce: "client" },
  "translate.book": { source: "open", enforce: "client" },
  "typeset.advanced": { source: "open", enforce: "client" },
  "editorial.advanced": { source: "open", enforce: "client" },
  "cowila.chat": { source: "cowila", enforce: "server" },
  "cowila.coauthor": { source: "cowila", enforce: "server" },
  "cowila.continuity": { source: "cowila", enforce: "server" },
  "sharing.public": { source: "share", enforce: "server" },
};

/** Direitos concedidos por uma definição de plano: { chave: true|false }. */
export function entitlementsFor(def) {
  const out = {};
  for (const key of Object.keys(ENTITLEMENT_DEFS)) {
    const source = ENTITLEMENT_DEFS[key].source;
    out[key] = source === "always" || source === "open" ? true : Boolean(def[source]);
  }
  return out;
}

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
    entitlements: entitlementsFor(def),
    catalogVersion: CATALOG_VERSION, workerVersion: SHAK_WORKER_VERSION,
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

export const planBlocked = (info, feature) => planJson({ error: "plan_required", feature, entitlement: { cowila: "cowila.chat", share: "sharing.public" }[feature] || feature, plan: info.plan, label: info.label, message: info.plan === "expirado" ? "Seu teste de " + TRIAL_DAYS + " dias terminou. Ative um plano para continuar." : "Este recurso não está incluído no seu plano." }, 402);

/** Libera (e contabiliza) uma mensagem do Cowila. Devolve null se pode seguir, ou a resposta de bloqueio (402 plano, 429 limite do dia). */
export async function useCowila(db, email, account) {
  if (!account.info.entitlements["cowila.chat"]) return planBlocked(account.info, "cowila");
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
    if (path === "/api/me") return { response: planJson({ legacy: true, owner: true, plan: "owner", label: PLAN_DEFS.owner.label, features: { export: true, cowila: true, share: true }, entitlements: entitlementsFor(PLAN_DEFS.owner), catalogVersion: CATALOG_VERSION, workerVersion: SHAK_WORKER_VERSION }) };
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
    if (path.indexOf("/api/billing/") === 0) return { response: planJson({ error: "owner_has_full_access" }, 400) };
    if (path === "/api/admin/billing" || path === "/api/admin/offer" || path === "/api/admin/stripe/link" || path.indexOf("/api/admin/purchase/") === 0) return { response: await shakBillingAdmin(env.DB, email, path, req, now, env, options.fetch) };
    // Dono: nada é bloqueado. O contador só observa (falha em silêncio) para o nível de proteção refletir o consumo total.
    if (write) await shakBumpMeter(env.DB, now, { writes: 1, bytes: write.bytes });
    if (path === "/api/assist" && req.method === "POST") await shakBumpMeter(env.DB, now, { ai: 1 });
    if (path === "/api/me") return { response: planJson({ email, owner: true, plan: "owner", label: PLAN_DEFS.owner.label, features: { export: true, cowila: true, share: true }, entitlements: entitlementsFor(PLAN_DEFS.owner), catalogVersion: CATALOG_VERSION, workerVersion: SHAK_WORKER_VERSION, protection: await shakReadProtection(env.DB, env, now) }) };
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
      if (PAID_PLANS.indexOf(plan) !== -1) {
        // cortesia/ajuste do administrador: se o mesmo plano ainda está vigente, os dias somam ao vencimento atual (nunca encurtam o que já foi pago)
        const before = await env.DB.prepare("SELECT email, created_at, plan, paid_until FROM shak_users WHERE email = ?").bind(target).first();
        const current = resolvePlan(before, now);
        const base = current.plan === plan && current.paidUntil && Date.parse(current.paidUntil) > now ? Date.parse(current.paidUntil) : now;
        await env.DB.prepare("UPDATE shak_users SET plan = ?, paid_until = ? WHERE email = ?").bind(plan, new Date(base + days * DAY_MS).toISOString(), target).run();
        await shakEnsureBilling(env.DB); await shakAudit(env.DB, now, email, "plan.courtesy", { target, plan, days });
      }
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

  if (path === "/api/me") return { response: planJson({ email, owner: false, ...info, workerVersion: SHAK_WORKER_VERSION, cowilaUsedToday: account.used, protection: await shakReadProtection(db, env, now) }) };
  if (path.indexOf("/api/admin/") === 0) return { response: planJson({ error: "forbidden" }, 403) };
  if (path.indexOf("/api/billing/") === 0) return { response: await shakBilling(db, email, path, req, info, now, env, options.fetch) };

  if (path === "/api/assist" && req.method === "POST") {
    // Cowila é o único recurso acessório recusado pelo guardião; escrever e ler manuscritos nunca é.
    const protection = await shakReadProtection(db, env, now);
    if (protection.level === "preservacao") return { response: planJson({ error: "guardian_paused", level: protection.level, message: "O Cowila está em pausa para preservar o serviço. Seus textos continuam sendo salvos normalmente; tente de novo mais tarde." }, 503) };
    const view = protection.level === "protecao" ? { ...account, info: { ...info, cowilaDaily: Math.floor(info.cowilaDaily / 2) } } : account;
    const stop = await useCowila(db, email, view);
    if (stop) return { response: stop };
    await shakBumpMeter(db, now, { ai: 1 });
  }
  if (path === "/api/share/visibility" && req.method === "POST" && !info.entitlements["sharing.public"]) return { response: planBlocked(info, "share") };
  const prefix = "u/" + (await userKey(email)) + "/";
  if (write) {
    // Espaço líquido: o documento substituído sai da conta antes de somar o novo (regravar o mesmo livro não conta duas vezes).
    const net = (await storageUsed(db, prefix)) - (await shakReplacedBytes(db, prefix, write.path)) + write.bytes;
    if (net > (options.maxStorage ?? MAX_STORAGE_BYTES)) return { response: planJson({ error: "storage_full", message: "O espaço da sua conta está cheio. Exclua livros ou versões antigas, ou fale com o administrador." }, 413) };
    await shakBumpMeter(db, now, { writes: 1, bytes: write.bytes });
  }
  return { env: { ...env, DB: scopeDb(db, prefix) } };
}

// ===== Cobrança manual (Ton): ofertas, pedidos, confirmação pelo administrador, períodos e auditoria =====
// Nada aqui ativa plano por conta própria: voltar do checkout ou clicar em "Já paguei" só pede conferência. Quem ativa é o administrador,
// com o ID único da transação vista no painel da Ton. Nenhum dado de cartão, CPF ou comprovante é guardado.
export const BILLING_NOTICE = "Você será redirecionado para a página de pagamento seguro da Ton. Informe na Ton o mesmo endereço de e-mail cadastrado no Shakstory. Ele será usado para facilitar a identificação da compra. Seu plano será ativado após a conferência do pagamento recebido. O pagamento corresponde a 12 meses de acesso; a renovação será feita por novo pagamento ao final do período.";
export const BILLING_OPEN = ["pending", "awaiting_review", "needs_review"];
const BILLING_MAX_PER_DAY = 5;

let shakBillingReady = false;
async function shakEnsureBilling(db) {
  if (shakBillingReady) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS shak_offers (plan TEXT PRIMARY KEY, price_cents INTEGER NOT NULL, currency TEXT NOT NULL, checkout_url TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS shak_purchases (id TEXT PRIMARY KEY, email TEXT NOT NULL, plan TEXT NOT NULL, price_cents INTEGER NOT NULL, currency TEXT NOT NULL, offer_version INTEGER NOT NULL, provider TEXT NOT NULL DEFAULT 'ton', status TEXT NOT NULL, created_at TEXT NOT NULL, claimed_at TEXT, reviewed_at TEXT, tx_id TEXT, note TEXT)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS shak_payments (provider TEXT NOT NULL, tx_id TEXT NOT NULL, purchase_id TEXT NOT NULL, email TEXT NOT NULL, plan TEXT NOT NULL, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, confirmed_at TEXT NOT NULL, confirmed_by TEXT NOT NULL, PRIMARY KEY (provider, tx_id))").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS shak_periods (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, plan TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, purchase_id TEXT NOT NULL UNIQUE, source TEXT NOT NULL)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS shak_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT)").run();
  shakBillingReady = true;
}

/** Soma meses de calendário (31/jan + 1 mês = 28 ou 29/fev). */
export function shakAddMonths(ms, months) {
  const date = new Date(ms);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.getTime();
}

const shakAudit = (db, now, actor, action, detail) => db.prepare("INSERT INTO shak_audit (at, actor, action, detail) VALUES (?, ?, ?, ?)").bind(new Date(now).toISOString(), actor, action, JSON.stringify(detail || {})).run().catch(() => {});
async function shakBody(req) { try { const value = await req.json(); return value && typeof value === "object" ? value : null; } catch { return null; } }
const shakPurchaseView = row => ({ id: row.id, plan: row.plan, label: PLAN_DEFS[row.plan]?.label || row.plan, priceCents: row.price_cents, currency: row.currency, status: row.status, createdAt: row.created_at, claimedAt: row.claimed_at || null, confirmedAt: row.status === "confirmed" ? row.reviewed_at : null });
const shakOfferView = (row, withUrl) => ({ plan: row.plan, label: PLAN_DEFS[row.plan]?.label || row.plan, priceCents: row.price_cents, currency: row.currency, version: row.version, ...(withUrl ? { checkoutUrl: row.checkout_url, updatedAt: row.updated_at } : {}) });

/** Pedido pendente do plano (cria se preciso) com o preço da oferta vigente. Devolve { purchase, offer } ou { error } (resposta pronta). */
async function shakOpenPurchase(db, email, plan, now) {
  if (PAID_PLANS.indexOf(plan) === -1) return { error: planJson({ error: "invalid_plan" }, 400) };
  const offer = await db.prepare("SELECT * FROM shak_offers WHERE plan = ?").bind(plan).first();
  if (!offer) return { error: planJson({ error: "offer_unavailable", message: "Este plano ainda não está disponível para compra. Fale com o administrador." }, 409) };
  let purchase = await db.prepare("SELECT * FROM shak_purchases WHERE email = ? AND plan = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1").bind(email, plan).first();
  // pedido pendente com preço/versão antigos não é reaproveitado: o valor cobrado tem de ser o da oferta vigente
  if (purchase && (purchase.offer_version !== offer.version || purchase.price_cents !== offer.price_cents || purchase.currency !== offer.currency)) purchase = null;
  if (!purchase) {
    const since = new Date(now - DAY_MS).toISOString();
    const count = Number((await db.prepare("SELECT COUNT(*) AS n FROM shak_purchases WHERE email = ? AND created_at >= ?").bind(email, since).first())?.n || 0);
    if (count >= BILLING_MAX_PER_DAY) return { error: planJson({ error: "too_many", message: "Muitos pedidos hoje. Tente novamente amanhã ou fale com o administrador." }, 429) };
    const id = crypto.randomUUID();
    await db.prepare("INSERT INTO shak_purchases (id, email, plan, price_cents, currency, offer_version, provider, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'ton', 'pending', ?)").bind(id, email, plan, offer.price_cents, offer.currency, offer.version, new Date(now).toISOString()).run();
    purchase = await db.prepare("SELECT * FROM shak_purchases WHERE id = ?").bind(id).first();
    await shakAudit(db, now, email, "purchase.create", { id, plan });
  }
  return { purchase, offer };
}

/** Abre uma sessão de pagamento na Stripe (cartão e Pix, 12 meses). Quem ativa o plano é o webhook assinado, nunca a volta do navegador. */
async function shakStripeCheckout(db, email, plan, req, env, fetchFn, now) {
  if (!env.STRIPE_SECRET_KEY) return planJson({ error: "stripe_not_configured", message: "O pagamento online ainda não está configurado." }, 503);
  const opened = await shakOpenPurchase(db, email, plan, now);
  if (opened.error) return opened.error;
  const { purchase, offer } = opened;
  const origin = new URL(req.url).origin;
  const form = new URLSearchParams();
  const set = (key, value) => form.set(key, String(value));
  set("mode", "payment");
  set("payment_method_types[0]", "card");
  set("payment_method_types[1]", "pix");
  set("line_items[0][quantity]", 1);
  set("line_items[0][price_data][currency]", String(offer.currency).toLowerCase());
  set("line_items[0][price_data][unit_amount]", offer.price_cents);
  set("line_items[0][price_data][product_data][name]", "Shakstory " + (PLAN_DEFS[purchase.plan]?.label || purchase.plan) + " — 12 meses");
  set("client_reference_id", purchase.id);
  set("customer_email", email);
  set("metadata[purchase_id]", purchase.id);
  set("metadata[plan]", purchase.plan);
  set("locale", "pt-BR");
  set("success_url", origin + "/?pagamento=ok");
  set("cancel_url", origin + "/?pagamento=cancelado");
  let res = null; let data = null;
  try {
    res = await (fetchFn || fetch)("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { authorization: "Bearer " + env.STRIPE_SECRET_KEY, "content-type": "application/x-www-form-urlencoded", "idempotency-key": "shak-" + purchase.id + "-" + Math.floor(now / 600000) }, body: form.toString() });
    data = await res.json().catch(() => null);
  } catch { res = null; }
  if (!res || !res.ok || !data || typeof data.url !== "string") {
    await shakAudit(db, now, email, "stripe.checkout_failed", { id: purchase.id, status: res ? res.status : 0, code: data && data.error ? data.error.code || data.error.type || null : null });
    return planJson({ error: "stripe_error", message: "Não foi possível abrir o pagamento agora. Tente novamente em instantes." }, 502);
  }
  await shakAudit(db, now, email, "stripe.checkout", { id: purchase.id, session: data.id });
  return planJson({ url: data.url, purchase: shakPurchaseView(purchase) });
}

/** Rotas do assinante: /api/billing/offers, /purchase, /claim, /cancel. A URL do checkout só sai do servidor ao criar o pedido, nunca vem do cliente. */
async function shakBilling(db, email, path, req, info, now, env = {}, fetchFn = null) {
  await shakEnsureBilling(db);
  if (path === "/api/billing/offers" && req.method === "GET") {
    const offers = ((await db.prepare("SELECT * FROM shak_offers").all()).results || []).filter(row => PAID_PLANS.indexOf(row.plan) !== -1);
    const mine = ((await db.prepare("SELECT * FROM shak_purchases WHERE email = ? ORDER BY created_at DESC LIMIT 20").bind(email).all()).results || []);
    return planJson({ email, notice: BILLING_NOTICE, current: { plan: info.plan, label: info.label, paidUntil: info.paidUntil }, offers: PAID_PLANS.map(plan => { const row = offers.find(o => o.plan === plan); return row ? { ...shakOfferView(row, false), available: true } : { plan, label: PLAN_DEFS[plan].label, available: false }; }), purchases: mine.map(shakPurchaseView) });
  }
  if (req.method !== "POST") return planJson({ error: "not_found" }, 404);
  const body = await shakBody(req);
  if (!body) return planJson({ error: "invalid" }, 400);

  if (path === "/api/billing/purchase") {
    const opened = await shakOpenPurchase(db, email, String(body.plan || ""), now);
    if (opened.error) return opened.error;
    return planJson({ purchase: shakPurchaseView(opened.purchase), checkoutUrl: opened.offer.checkout_url, email, notice: BILLING_NOTICE });
  }
  if (path === "/api/billing/stripe/checkout") return await shakStripeCheckout(db, email, String(body.plan || ""), req, env, fetchFn, now);

  if (path === "/api/billing/claim" || path === "/api/billing/cancel") {
    const purchase = await db.prepare("SELECT * FROM shak_purchases WHERE id = ?").bind(String(body.id || "")).first();
    if (!purchase || purchase.email !== email) return planJson({ error: "not_found" }, 404); // pedido de outra conta é indistinguível de inexistente
    const claim = path === "/api/billing/claim";
    if (claim && purchase.status === "awaiting_review") return planJson({ purchase: shakPurchaseView(purchase) });
    if (purchase.status !== "pending") return planJson({ error: "invalid_state", status: purchase.status }, 409);
    const status = claim ? "awaiting_review" : "canceled";
    await db.prepare("UPDATE shak_purchases SET status = ?, claimed_at = COALESCE(?, claimed_at), reviewed_at = COALESCE(?, reviewed_at), tx_id = COALESCE(?, tx_id), note = COALESCE(?, note) WHERE id = ?").bind(status, claim ? new Date(now).toISOString() : null, null, null, null, purchase.id).run();
    await shakAudit(db, now, email, claim ? "purchase.claim" : "purchase.cancel", { id: purchase.id });
    return planJson({ purchase: shakPurchaseView({ ...purchase, status, claimed_at: claim ? new Date(now).toISOString() : purchase.claimed_at }) });
  }
  return planJson({ error: "not_found" }, 404);
}

/** Ativa o plano de um pedido a partir de um pagamento conferido (administrador ou webhook da Stripe). Idempotente por (provedor, transação). */
async function shakConfirmPurchase(db, admin, purchase, txId, amountCents, currency, mode, now, provider = "ton") {
    const periodOf = async () => await db.prepare("SELECT * FROM shak_periods WHERE purchase_id = ?").bind(purchase.id).first();
    const existing = await db.prepare("SELECT * FROM shak_payments WHERE provider = ? AND tx_id = ?").bind(provider, txId).first();
    if (existing) {
      // a mesma confirmação repetida é inofensiva; a mesma transação em outro pedido nunca libera um segundo período
      if (existing.purchase_id === purchase.id) { const period = await periodOf(); return planJson({ ok: true, idempotent: true, endsAt: period?.ends_at || null }); }
      return planJson({ error: "duplicate_transaction", message: "Esta transação já foi usada em outro pedido." }, 409);
    }
    if (purchase.status === "confirmed") return planJson({ error: "already_confirmed", message: "Este pedido já foi confirmado com outra transação." }, 409);
    if (["canceled", "rejected"].indexOf(purchase.status) !== -1) return planJson({ error: "invalid_state", status: purchase.status }, 409);
    const review = async (error, message) => {
      await db.prepare("UPDATE shak_purchases SET status = ?, claimed_at = COALESCE(?, claimed_at), reviewed_at = COALESCE(?, reviewed_at), tx_id = COALESCE(?, tx_id), note = COALESCE(?, note) WHERE id = ?").bind("needs_review", null, new Date(now).toISOString(), null, error, purchase.id).run();
      await shakAudit(db, now, admin, "purchase.needs_review", { id: purchase.id, reason: error });
      return planJson({ error, message, status: "needs_review" }, 409);
    };
    if (amountCents !== purchase.price_cents || currency !== purchase.currency) return await review("amount_mismatch", "Valor ou moeda diferentes do pedido: o pedido foi para revisão e nada foi ativado.");
    await ensurePlanTables(db);
    await db.prepare("INSERT OR IGNORE INTO shak_users (email, created_at, plan, paid_until) VALUES (?, ?, NULL, NULL)").bind(purchase.email, new Date(now).toISOString()).run();
    const row = await db.prepare("SELECT email, created_at, plan, paid_until FROM shak_users WHERE email = ?").bind(purchase.email).first();
    const active = resolvePlan(row, now);
    const samePlan = active.plan === purchase.plan && active.paidUntil && Date.parse(active.paidUntil) > now;
    const otherPaid = PAID_PLANS.indexOf(active.plan) !== -1 && active.plan !== purchase.plan;
    if (otherPaid && mode !== "replace") return await review("plan_change", "A conta tem outro plano pago vigente. Confirme com mode \"replace\" para começar agora, ou trate a troca manualmente.");
    // pagar o mesmo plano antes do vencimento acumula: nunca encurta dias já pagos
    const start = samePlan ? Date.parse(active.paidUntil) : now;
    const end = shakAddMonths(start, 12);
    try {
      await db.prepare("INSERT INTO shak_payments (provider, tx_id, purchase_id, email, plan, amount_cents, currency, confirmed_at, confirmed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(provider, txId, purchase.id, purchase.email, purchase.plan, purchase.price_cents, purchase.currency, new Date(now).toISOString(), admin).run();
    } catch (error) {
      if (/UNIQUE|constraint/i.test(String(error && error.message))) return planJson({ error: "duplicate_transaction", message: "Esta transação já foi usada." }, 409);
      throw error;
    }
    try {
      await db.prepare("INSERT INTO shak_periods (email, plan, starts_at, ends_at, purchase_id, source) VALUES (?, ?, ?, ?, ?, 'payment')").bind(purchase.email, purchase.plan, new Date(start).toISOString(), new Date(end).toISOString(), purchase.id).run();
    } catch (error) {
      // outro administrador confirmou o mesmo pedido ao mesmo tempo com outra transação: desfaz esta e não duplica o período
      await db.prepare("DELETE FROM shak_payments WHERE provider = ? AND tx_id = ?").bind(provider, txId).run();
      if (/UNIQUE|constraint/i.test(String(error && error.message))) return planJson({ error: "already_confirmed", message: "Este pedido já foi confirmado." }, 409);
      throw error;
    }
    await db.prepare("UPDATE shak_users SET plan = ?, paid_until = ? WHERE email = ?").bind(purchase.plan, new Date(end).toISOString(), purchase.email).run();
    await db.prepare("UPDATE shak_purchases SET status = ?, claimed_at = COALESCE(?, claimed_at), reviewed_at = COALESCE(?, reviewed_at), tx_id = COALESCE(?, tx_id), note = COALESCE(?, note) WHERE id = ?").bind("confirmed", null, new Date(now).toISOString(), txId, null, purchase.id).run();
    await shakAudit(db, now, admin, "purchase.confirm", { id: purchase.id, plan: purchase.plan, txId, endsAt: new Date(end).toISOString() });
    return planJson({ ok: true, plan: purchase.plan, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() });
}

/** Rotas do administrador (só o dono chega aqui): painel, ofertas, confirmação e revisão de pedidos. */
async function shakBillingAdmin(db, admin, path, req, now, env = {}, fetchFn = null) {
  await shakEnsureBilling(db);
  if (path === "/api/admin/billing" && req.method === "GET") {
    const offers = ((await db.prepare("SELECT * FROM shak_offers").all()).results || []).map(row => shakOfferView(row, true));
    const open = ((await db.prepare("SELECT * FROM shak_purchases WHERE status IN ('pending','awaiting_review','needs_review') ORDER BY created_at DESC LIMIT 200").all()).results || []);
    const recent = ((await db.prepare("SELECT * FROM shak_purchases ORDER BY created_at DESC LIMIT 50").all()).results || []);
    const payments = ((await db.prepare("SELECT * FROM shak_payments ORDER BY confirmed_at DESC LIMIT 50").all()).results || []);
    return planJson({ offers, open: open.map(row => ({ ...shakPurchaseView(row), email: row.email, note: row.note || null })), recent: recent.map(row => ({ ...shakPurchaseView(row), email: row.email })), payments: payments.map(row => ({ provider: row.provider, txId: row.tx_id, purchaseId: row.purchase_id, email: row.email, plan: row.plan, amountCents: row.amount_cents, currency: row.currency, confirmedAt: row.confirmed_at })) });
  }
  if (req.method !== "POST") return planJson({ error: "not_found" }, 404);
  const body = await shakBody(req);
  if (!body) return planJson({ error: "invalid" }, 400);

  if (path === "/api/admin/stripe/link") {
    // link de pagamento para uma conta (teste ou envio a um cliente): o pedido é daquele e-mail e o plano só ativa quando a Stripe confirmar
    const target = String(body.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target) || target.length > 200) return planJson({ error: "invalid_email" }, 400);
    await shakAudit(db, now, admin, "stripe.link", { target, plan: String(body.plan || "") });
    return await shakStripeCheckout(db, target, String(body.plan || ""), req, env, fetchFn, now);
  }

  if (path === "/api/admin/offer") {
    const plan = String(body.plan || "");
    const cents = Number(body.priceCents);
    const currency = String(body.currency || "BRL").toUpperCase();
    const rawUrl = String(body.checkoutUrl || "").trim();
    let url = null;
    if (rawUrl) { try { url = new URL(rawUrl); } catch { url = null; } }
    if (PAID_PLANS.indexOf(plan) === -1) return planJson({ error: "invalid_plan" }, 400);
    if (!Number.isInteger(cents) || cents <= 0 || cents > 100000000) return planJson({ error: "invalid_price" }, 400);
    if (currency !== "BRL") return planJson({ error: "invalid_currency" }, 400);
    if (rawUrl && (!url || url.protocol !== "https:" || !/(^|\.)ton\.com\.br$/.test(url.hostname))) return planJson({ error: "invalid_url", message: "O link de pagamento deve ser https e do domínio da Ton." }, 400);
    await db.prepare("INSERT INTO shak_offers (plan, price_cents, currency, checkout_url, version, updated_at) VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT(plan) DO UPDATE SET price_cents = excluded.price_cents, currency = excluded.currency, checkout_url = excluded.checkout_url, version = shak_offers.version + 1, updated_at = excluded.updated_at").bind(plan, cents, currency, url ? url.toString() : "", new Date(now).toISOString()).run();
    await shakAudit(db, now, admin, "offer.set", { plan, cents, currency });
    return planJson({ ok: true, offer: shakOfferView(await db.prepare("SELECT * FROM shak_offers WHERE plan = ?").bind(plan).first(), true) });
  }

  if (path === "/api/admin/purchase/status") {
    const status = String(body.status || "");
    if (["needs_review", "rejected"].indexOf(status) === -1) return planJson({ error: "invalid_status" }, 400);
    const purchase = await db.prepare("SELECT * FROM shak_purchases WHERE id = ?").bind(String(body.id || "")).first();
    if (!purchase) return planJson({ error: "not_found" }, 404);
    if (purchase.status === "confirmed") return planJson({ error: "already_confirmed" }, 409);
    await db.prepare("UPDATE shak_purchases SET status = ?, claimed_at = COALESCE(?, claimed_at), reviewed_at = COALESCE(?, reviewed_at), tx_id = COALESCE(?, tx_id), note = COALESCE(?, note) WHERE id = ?").bind(status, null, new Date(now).toISOString(), null, String(body.note || "").slice(0, 300) || null, purchase.id).run();
    await shakAudit(db, now, admin, "purchase." + status, { id: purchase.id });
    return planJson({ ok: true });
  }

  if (path === "/api/admin/purchase/confirm") {
    const purchase = await db.prepare("SELECT * FROM shak_purchases WHERE id = ?").bind(String(body.id || "")).first();
    if (!purchase) return planJson({ error: "not_found" }, 404);
    const txId = String(body.txId || "").trim();
    if (!/^[A-Za-z0-9._:-]{4,100}$/.test(txId)) return planJson({ error: "invalid_tx", message: "Informe o ID único da transação da Ton." }, 400);
    return await shakConfirmPurchase(db, admin, purchase, txId, Number(body.amountCents), String(body.currency || "").toUpperCase(), body.mode, now);
  }
  return planJson({ error: "not_found" }, 404);
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
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { maxOutputTokens: (input && input.max_tokens) || 900, ...(input && typeof input.temperature === "number" ? { temperature: input.temperature, topP: input.top_p } : {}) } }),
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

/** Ofertas vigentes para o diálogo "Ver planos": preço e, se houver, o link da Ton; "stripe" diz se o pagamento online está ligado. */
async function shakPublicPlans(db, env = {}) {
  await shakEnsureBilling(db);
  const rows = ((await db.prepare("SELECT * FROM shak_offers").all()).results || []).filter(row => PAID_PLANS.indexOf(row.plan) !== -1);
  const ton = url => /^https:\/\/payment-link-v3\.ton\.com\.br\//.test(String(url));
  const stripeAvailable = Boolean(env.STRIPE_SECRET_KEY);
  return planJson({
    stripe: stripeAvailable,
    offers: PAID_PLANS.map(plan => {
      const row = rows.find(item => item.plan === plan);
      return {
        plan,
        label: PLAN_DEFS[plan].label,
        available: Boolean(row && stripeAvailable && Number.isInteger(row.price_cents) && row.price_cents > 0 && row.currency === "BRL"),
        ...(row ? { priceCents: row.price_cents, currency: row.currency } : {}),
        ...(row && ton(row.checkout_url) ? { checkoutUrl: row.checkout_url } : {}),
      };
    }),
  });
}

const shakTimingEqual = (a, b) => { let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; };

/** Confere a assinatura do webhook da Stripe: HMAC-SHA256 de "<t>.<corpo cru>" com o segredo do endpoint, em até 5 minutos. */
async function shakStripeVerify(raw, header, secret, nowSec, tolerance = 300) {
  const parts = String(header || "").split(",").map(item => item.trim().split("="));
  const t = (parts.find(item => item[0] === "t") || [])[1];
  const sigs = parts.filter(item => item[0] === "v1").map(item => item[1] || "");
  if (!secret || !t || !/^\d+$/.test(t) || !sigs.length || Math.abs(nowSec - Number(t)) > tolerance) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(t + "." + raw)));
  const expected = Array.from(mac).map(byte => byte.toString(16).padStart(2, "0")).join("");
  return sigs.some(sig => sig.length === expected.length && shakTimingEqual(sig, expected));
}

/** Webhook da Stripe: só pagamento confirmado (payment_status "paid") ativa o plano, com valor e moeda iguais aos do pedido. Responde 200 para tudo que não deve ser reenviado. */
async function shakStripeWebhook(req, env, now) {
  if (!env.STRIPE_WEBHOOK_SECRET) return planJson({ error: "not_configured" }, 503);
  const raw = await req.text();
  if (!(await shakStripeVerify(raw, req.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET, Math.floor(now / 1000)))) return planJson({ error: "bad_signature" }, 400);
  let event;
  try { event = JSON.parse(raw); } catch { return planJson({ error: "invalid" }, 400); }
  const type = String(event && event.type || "");
  const session = event && event.data && event.data.object;
  if (!session || session.object !== "checkout.session") return planJson({ received: true, ignored: true });
  const db = env.DB;
  await shakEnsureBilling(db);
  const purchase = await db.prepare("SELECT * FROM shak_purchases WHERE id = ?").bind(String(session.client_reference_id || "")).first();
  if (type === "checkout.session.async_payment_failed") {
    await shakAudit(db, now, "stripe", "stripe.payment_failed", { event: event.id, id: purchase ? purchase.id : null });
    return planJson({ received: true });
  }
  if (type !== "checkout.session.completed" && type !== "checkout.session.async_payment_succeeded") return planJson({ received: true, ignored: true });
  if (session.payment_status !== "paid") return planJson({ received: true, pending: true });
  if (!purchase) {
    await shakAudit(db, now, "stripe", "stripe.unmatched", { event: event.id, session: session.id, amount: session.amount_total });
    return planJson({ received: true, unmatched: true });
  }
  if (purchase.status === "canceled" || purchase.status === "rejected") {
    // pagou depois de cancelar/recusar: não ativa sozinho; vai para a fila do administrador com o motivo
    await db.prepare("UPDATE shak_purchases SET status = ?, claimed_at = COALESCE(?, claimed_at), reviewed_at = COALESCE(?, reviewed_at), tx_id = COALESCE(?, tx_id), note = COALESCE(?, note) WHERE id = ?").bind("needs_review", null, new Date(now).toISOString(), null, "stripe_paid_after_" + purchase.status, purchase.id).run();
    await shakAudit(db, now, "stripe", "stripe.paid_after_" + purchase.status, { event: event.id, id: purchase.id });
    return planJson({ received: true, review: true });
  }
  const txId = String(session.payment_intent || session.id || "");
  const result = await shakConfirmPurchase(db, "stripe", purchase, txId, Number(session.amount_total), String(session.currency || "").toUpperCase(), undefined, now, "stripe");
  await shakAudit(db, now, "stripe", "stripe.event", { event: event.id, id: purchase.id, status: result.status });
  return planJson({ received: true, status: result.status });
}

export async function shakGate(req, env, u, options = {}) {
  // Checkout público: o comprador informa o próprio e-mail e escolhe um plano; o webhook assinado continua sendo a única via de ativação.
  if (u.pathname === "/api/public/stripe/checkout" && req.method === "POST") {
    try {
      if (!env.STRIPE_SECRET_KEY) return { response: planJson({ error: "stripe_not_configured" }, 503) };
      const body = await shakBody(req);
      if (!body) return { response: planJson({ error: "invalid" }, 400) };
      const email = String(body.email || "").trim().toLowerCase();
      const plan = String(body.plan || "");
      if (email.length > 200 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) return { response: planJson({ error: "invalid_email" }, 400) };
      if (PAID_PLANS.indexOf(plan) === -1) return { response: planJson({ error: "invalid_plan" }, 400) };
      return { response: await shakStripeCheckout(env.DB, email, plan, req, env, options.fetch, options.now ?? Date.now()) };
    } catch { return { response: planJson({ error: "checkout_unavailable" }, 503) }; }
  }
  if (u.pathname === "/api/public/plans" && req.method === "GET") {
    try { return { response: await shakPublicPlans(env.DB, env) }; } catch { return { response: planJson({ offers: [] }) }; }
  }
  if (u.pathname === "/api/public/stripe-webhook" && req.method === "POST") {
    try { return { response: await shakStripeWebhook(req, env, options.now ?? Date.now()) }; } catch { return { response: planJson({ error: "server" }, 500) }; }
  }
  const result = await shakGateCore(req, env, u, options);
  if (result.response || !env.GEMINI_API_KEY) return result;
  return { ...result, env: withGemini(result.env || env, options.fetch) };
}
