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
export const SHAK_WORKER_VERSION = "2026-10-24.3";
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

// ── Proteção do teste grátis: um teste por pessoa ─────────────────────────────
// Roda só no primeiro acesso de um e-mail (conta nova). Sinais: e-mail normalizado (gmail sem pontos/+tag), cookie do aparelho,
// IP (guardado só como hash), rede de VPN/hospedagem/Tor (heurística pelo nome da rede, não é infalível), domínio descartável e
// domínio sem servidor de e-mail (consulta DNS). Se qualquer um acusar, a conta é criada SEM os 7 dias de teste e o administrador pode liberar.
// Falha aberta: erro técnico na checagem nunca impede alguém de entrar.
const SHAK_DISPOSABLE = ["mailinator.com", "guerrillamail.com", "guerrillamail.net", "10minutemail.com", "10minutemail.net", "tempmail.com", "temp-mail.org", "temp-mail.io", "yopmail.com", "yopmail.net", "trashmail.com", "throwawaymail.com", "getnada.com", "nada.email", "sharklasers.com", "maildrop.cc", "dispostable.com", "fakeinbox.com", "mintemail.com", "mohmal.com", "emailondeck.com", "tempail.com", "burnermail.io", "spamgourmet.com", "mytemp.email", "moakt.com", "tmpmail.org", "tmpmail.net", "mailnesia.com", "inboxkitten.com", "discard.email", "anonaddy.me", "tempinbox.com", "33mail.com", "gmailnet.com", "emltmp.com", "tmail.ws"];
const SHAK_VPN_ORG = /\b(vpn|proxy|tor)\b|m247|datacamp|choopa|vultr|digitalocean|\bovh|hetzner|linode|akamai connected|leaseweb|contabo|amazon|\baws\b|google llc|google cloud|microsoft|azure|oracle|tefincom|nordvpn|proton|mullvad|surfshark|expressvpn|private internet|cyberghost|ipvanish|packethub|quadranet|colocrossing|hostinger|datapacket|cdn77|zenlayer|servers\.com|performive|clouvider|tzulo|psychz|frantech|buyvm|ionos|scaleway|upcloud|kamatera/i;
const SHAK_TRIAL_IP_MEDIUM = 2;   // contas com teste por IP em 30 dias que já levantam suspeita (redes compartilhadas: família, escritório)
const SHAK_TRIAL_IP_STRONG = 4;   // a partir daqui só a rede já basta para negar
const SHAK_TRIAL_DEVICE_MAX = 1;  // contas com teste por aparelho (cookie) em 1 ano
// Sinais fortes negam sozinhos; sinais médios (VPN/hospedagem, rede repetida) só negam em conjunto com outro sinal.
const SHAK_STRONG = ["email_descartavel", "email_duplicado", "dominio_sem_email", "aparelho_repetido", "ip_excessivo"];

export function shakCanonicalEmail(email) {
  const [local0, domain0] = String(email || "").toLowerCase().split("@");
  if (!domain0) return String(email || "").toLowerCase();
  let domain = domain0, local = local0.split("+")[0];
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return local + "@" + domain;
}

let signupsReady = false;
async function ensureSignups(db) {
  if (signupsReady) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS shak_signups (email TEXT PRIMARY KEY, canon TEXT NOT NULL, device TEXT, ip_hash TEXT, asn TEXT, org TEXT, country TEXT, created_at TEXT NOT NULL, trial_granted INTEGER NOT NULL, reasons TEXT NOT NULL)").run();
  signupsReady = true;
}

async function shakHash(text) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes)).slice(0, 16).map(b => b.toString(16).padStart(2, "0")).join("");
}

const shakCookie = (req, name) => {
  const m = ("; " + (req.headers.get("cookie") || "")).match(new RegExp("; " + name + "=([A-Za-z0-9_-]{16,64})"));
  return m ? m[1] : null;
};
const shakNewDeviceId = () => Array.from(crypto.getRandomValues(new Uint8Array(18))).map(b => b.toString(16).padStart(2, "0")).join("");
export const shakDeviceCookie = id => "shak_dev=" + id + "; Path=/; Max-Age=31536000; Secure; HttpOnly; SameSite=Lax";

/** O domínio do e-mail tem servidor de e-mail? "ok" | "invalid" | "unknown" (falha de rede: não pune ninguém). */
async function shakMailDomain(domain, doFetch) {
  const ask = async type => {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 2500);
    try {
      const r = await doFetch("https://cloudflare-dns.com/dns-query?name=" + encodeURIComponent(domain) + "&type=" + type, { headers: { accept: "application/dns-json" }, signal: ctl.signal });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; } finally { clearTimeout(timer); }
  };
  const mx = await ask("MX");
  if (!mx) return "unknown";
  if (mx.Status === 3) return "invalid";
  const hasMx = (mx.Answer || []).some(a => a.type === 15 && String(a.data || "").trim() !== "0 .");
  if (hasMx) return "ok";
  const a = await ask("A");
  if (!a) return "unknown";
  return (a.Answer || []).some(x => x.type === 1) ? "ok" : "invalid";
}

/** Avalia um e-mail novo. Devolve { createdAt, deviceId, reasons } e registra o cadastro; nunca lança erro. */
export async function shakSignupGuard(db, env, req, email, now, doFetch) {
  const result = { createdAt: new Date(now).toISOString(), deviceId: shakCookie(req, "shak_dev"), setCookie: false, reasons: [] };
  if (!result.deviceId) { result.deviceId = shakNewDeviceId(); result.setCookie = true; }
  try {
    await ensureSignups(db);
    const known = await db.prepare("SELECT email FROM shak_users WHERE email = ?").bind(email).first();
    if (known) return { ...result, skipped: true };
    const canon = shakCanonicalEmail(email);
    const domain = canon.split("@")[1] || "";
    const ip = req.headers.get("CF-Connecting-IP") || req.headers.get("x-forwarded-for") || "";
    const ipHash = ip ? await shakHash(ip + "|" + (env.TURNSTILE_SECRET_KEY || "shak-signup")) : null;
    const cf = req.cf || {};
    const org = String(cf.asOrganization || "");
    const reasons = result.reasons;
    if (SHAK_DISPOSABLE.indexOf(domain) !== -1) reasons.push("email_descartavel");
    if (SHAK_VPN_ORG.test(org) || req.headers.get("Cf-Ipcountry") === "T1") reasons.push("vpn_ou_hospedagem");
    const rows = (await db.prepare("SELECT email, canon, device, ip_hash, trial_granted, created_at FROM shak_signups WHERE created_at >= ?").bind(new Date(now - 365 * DAY_MS).toISOString()).all()).results || [];
    if (rows.some(r => r.canon === canon && r.email !== email)) reasons.push("email_duplicado");
    if (result.deviceId && !result.setCookie && rows.filter(r => r.device === result.deviceId && r.trial_granted).length >= SHAK_TRIAL_DEVICE_MAX) reasons.push("aparelho_repetido");
    const monthAgo = new Date(now - 30 * DAY_MS).toISOString();
    const sameIp = ipHash ? rows.filter(r => r.ip_hash === ipHash && r.trial_granted && r.created_at >= monthAgo).length : 0;
    if (sameIp >= SHAK_TRIAL_IP_STRONG) reasons.push("ip_excessivo");
    else if (sameIp >= SHAK_TRIAL_IP_MEDIUM) reasons.push("ip_repetido");
    if (reasons.indexOf("email_descartavel") === -1) {
      const mail = await shakMailDomain(domain, doFetch || fetch);
      if (mail === "invalid") reasons.push("dominio_sem_email");
    }
    const granted = !(reasons.some(code => SHAK_STRONG.indexOf(code) !== -1) || reasons.length >= 2);
    if (!granted) result.createdAt = new Date(now - (TRIAL_DAYS + 1) * DAY_MS).toISOString();
    await db.prepare("INSERT OR IGNORE INTO shak_users (email, created_at, plan, paid_until) VALUES (?, ?, NULL, NULL)").bind(email, result.createdAt).run();
    await db.prepare("INSERT OR IGNORE INTO shak_signups (email, canon, device, ip_hash, asn, org, country, created_at, trial_granted, reasons) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(email, canon, result.deviceId, ipHash, String(cf.asn || ""), org.slice(0, 80), String(cf.country || req.headers.get("Cf-Ipcountry") || ""), new Date(now).toISOString(), granted ? 1 : 0, reasons.join(",")).run();
    if (!granted) { await shakEnsureBilling(db); await shakAudit(db, now, "sistema", "signup.trial_denied", { email, reasons }); }
    else if (reasons.length) { await shakEnsureBilling(db); await shakAudit(db, now, "sistema", "signup.signal", { email, reasons }); }
  } catch (error) { result.error = String(error && error.message || error).slice(0, 120); result.createdAt = new Date(now).toISOString(); }
  return result;
}

const SHAK_REASON_TEXT = {
  email_descartavel: "o e-mail é de um serviço descartável",
  vpn_ou_hospedagem: "o acesso veio de VPN, proxy ou servidor de hospedagem",
  email_duplicado: "já existe uma conta com este mesmo e-mail (variações com ponto ou +)",
  aparelho_repetido: "este aparelho já usou o teste grátis",
  ip_repetido: "esta rede já criou várias contas de teste",
  ip_excessivo: "esta rede já criou contas de teste demais",
  dominio_sem_email: "o domínio do e-mail não tem servidor de e-mail",
};
async function shakTrialDenied(db, email) {
  try {
    await ensureSignups(db);
    const row = await db.prepare("SELECT trial_granted, reasons FROM shak_signups WHERE email = ?").bind(email).first();
    if (!row || row.trial_granted) return null;
    return { reasons: String(row.reasons || "").split(",").filter(Boolean).map(code => SHAK_REASON_TEXT[code] || code) };
  } catch { return null; }
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
    if (path.indexOf("/api/xuri/") === 0) return { response: await shakXuri(env.DB, env, email, true, path, req, now, options.tsaFetch) };
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
    if (path === "/api/admin/signups" && req.method === "GET") {
      await ensureSignups(env.DB);
      const rows = await env.DB.prepare("SELECT email, org, country, created_at, trial_granted, reasons FROM shak_signups ORDER BY created_at DESC LIMIT 100").all();
      return { response: planJson({ signups: (rows.results || []).map(r => ({ email: r.email, org: r.org, country: r.country, createdAt: r.created_at, trialGranted: !!r.trial_granted, reasons: String(r.reasons || "").split(",").filter(Boolean) })) }) };
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
        // cortesia/ajuste do administrador: um período pago vigente mantém SEMPRE o vencimento original (nunca encurta nem prorroga); só sem período vigente os dias valem a partir de hoje
        const before = await env.DB.prepare("SELECT email, created_at, plan, paid_until FROM shak_users WHERE email = ?").bind(target).first();
        const current = resolvePlan(before, now);
        const keep = PAID_PLANS.indexOf(current.plan) !== -1 && current.paidUntil && Date.parse(current.paidUntil) > now ? Date.parse(current.paidUntil) : 0;
        const until = keep || now + days * DAY_MS;
        await env.DB.prepare("UPDATE shak_users SET plan = ?, paid_until = ? WHERE email = ?").bind(plan, new Date(until).toISOString(), target).run();
        await shakEnsureBilling(env.DB); await shakAudit(env.DB, now, email, "plan.courtesy", { target, plan, days: keep ? 0 : days, keptOriginalExpiry: !!keep });
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
  await ensurePlanTables(db);
  const guard = await shakSignupGuard(db, env, req, email, now, options.dnsFetch);
  const account = await loadAccount(db, email, now);
  const info = account.info;

  if (path === "/api/me") {
    const response = planJson({ email, owner: false, ...info, workerVersion: SHAK_WORKER_VERSION, cowilaUsedToday: account.used, protection: await shakReadProtection(db, env, now), trialDenied: info.plan === "expirado" ? await shakTrialDenied(db, email) : null });
    if (guard.setCookie) response.headers.append("set-cookie", shakDeviceCookie(guard.deviceId));
    return { response };
  }
  if (path.indexOf("/api/admin/") === 0) return { response: planJson({ error: "forbidden" }, 403) };
  if (path.indexOf("/api/billing/") === 0) return { response: await shakBilling(db, email, path, req, info, now, env, options.fetch) };

  if (path.indexOf("/api/xuri/") === 0) return { response: await shakXuri(db, env, email, false, path, req, now, options.tsaFetch) };
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

// ===== Autoria e procedência (X-URI, marco 1) =====
// TOTP (Google Authenticator) como trava para REGISTRAR versões de uma obra; o registro grava o hash do livro como está no servidor,
// encadeado ao registro anterior (cada entrada inclui o hash da anterior). Editar e salvar nunca é bloqueado.
// Não é certidão de autoria: prova que este conteúdo foi registrado por esta conta, com o código do autenticador, nesta data (do servidor).
// As colunas `signature` e `ts_proof` ficam reservadas para a assinatura do autor e o carimbo de tempo externo (marco 2).
const XURI_UNLOCK_MS = 15 * 60 * 1000;
const XURI_MAX_FAILS = 5;
const XURI_FAIL_WINDOW_MS = 10 * 60 * 1000;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function shakBase32(bytes) {
  let bits = 0, value = 0, out = "";
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function shakBase32Decode(text) {
  let bits = 0, value = 0; const out = [];
  for (const ch of String(text).replace(/=+$/, "")) { const i = B32.indexOf(ch); if (i < 0) continue; value = (value << 5) | i; bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return new Uint8Array(out);
}
const shakHex = bytes => Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, "0")).join("");
const shakSha256Hex = async text => shakHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
/** JSON com chaves ordenadas (mesmo critério do cliente), para o hash do livro não depender da ordem das chaves. */
function shakStable(value) {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(item => shakStable(item === undefined ? null : item)).join(",") + "]";
  const keys = Object.keys(value).filter(key => value[key] !== undefined).sort();
  return "{" + keys.map(key => JSON.stringify(key) + ":" + shakStable(value[key])).join(",") + "}";
}

/** Código TOTP de 6 dígitos (RFC 6238, SHA-1, 30 s) para um passo de tempo. */
async function shakTotp(secretBytes, step) {
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new Uint8Array(8); new DataView(msg.buffer).setUint32(4, step >>> 0); new DataView(msg.buffer).setUint32(0, Math.floor(step / 4294967296));
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const o = mac[19] & 15;
  const n = ((mac[o] & 127) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3];
  return String(n % 1000000).padStart(6, "0");
}
const shakSameText = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

async function shakXuriKey(env) {
  if (!env.XURI_KEY || String(env.XURI_KEY).length < 16) return null;
  return crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", new TextEncoder().encode("shak-totp|" + env.XURI_KEY)), "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function shakSeal(env, bytes) {
  const key = await shakXuriKey(env); const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes));
  return shakHex(iv) + shakHex(ct);
}
async function shakOpen(env, text) {
  const key = await shakXuriKey(env); const raw = new Uint8Array((String(text).match(/../g) || []).map(h => parseInt(h, 16)));
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12)));
}

let xuriReady = false;
async function ensureXuri(db) {
  if (xuriReady) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS shak_authenticators (email TEXT PRIMARY KEY, secret_enc TEXT NOT NULL, confirmed INTEGER NOT NULL DEFAULT 0, last_step INTEGER NOT NULL DEFAULT 0, fails INTEGER NOT NULL DEFAULT 0, fail_start INTEGER NOT NULL DEFAULT 0, unlock_until INTEGER NOT NULL DEFAULT 0, recovery TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS shak_works (id TEXT PRIMARY KEY, email TEXT NOT NULL, book_id TEXT NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE (email, book_id))").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS shak_versions (id TEXT PRIMARY KEY, work_id TEXT NOT NULL, seq INTEGER NOT NULL, content_hash TEXT NOT NULL, bytes INTEGER NOT NULL, prev_hash TEXT NOT NULL, entry_hash TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL, signature TEXT, ts_proof TEXT, UNIQUE (work_id, seq))").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS shak_keys (key_id TEXT PRIMARY KEY, email TEXT NOT NULL, public_key TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT)").run();
  // Publicação voluntária para a consulta pública: published_at nulo = privado.
  for (const col of ["published_at TEXT", "public_name TEXT", "public_isbns TEXT"]) { try { await db.prepare("ALTER TABLE shak_works ADD COLUMN " + col).run(); } catch { /* coluna já existe */ } }
  await db.prepare("CREATE TABLE IF NOT EXISTS shak_xuri_lookups (k TEXT PRIMARY KEY, n INTEGER NOT NULL)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS shak_exports (id TEXT PRIMARY KEY, work_id TEXT NOT NULL, seq INTEGER NOT NULL, format TEXT NOT NULL, file_hash TEXT NOT NULL, content_hash TEXT NOT NULL, created_at TEXT NOT NULL, signature TEXT NOT NULL, UNIQUE (work_id, file_hash))").run();
  xuriReady = true;
}

const XURI_AUTH_SQL = "SELECT email, secret_enc, confirmed, last_step, fails, fail_start, unlock_until, recovery FROM shak_authenticators WHERE email = ?";
const XURI_SAVE_SQL = "UPDATE shak_authenticators SET confirmed = ?, last_step = ?, fails = ?, fail_start = ?, unlock_until = ?, recovery = ? WHERE email = ?";

/** Confere um código TOTP (ou de recuperação). Devolve { ok, auth, error } e já grava falhas, bloqueio e passo usado. */
async function shakXuriCheck(db, env, email, auth, code, now, allowRecovery) {
  const state = { confirmed: auth.confirmed, last_step: auth.last_step, fails: auth.fails, fail_start: auth.fail_start, unlock_until: auth.unlock_until, recovery: auth.recovery };
  const save = () => db.prepare(XURI_SAVE_SQL).bind(state.confirmed, state.last_step, state.fails, state.fail_start, state.unlock_until, state.recovery, email).run();
  if (state.fails >= XURI_MAX_FAILS && now - state.fail_start < XURI_FAIL_WINDOW_MS) return { ok: false, error: "locked", state };
  const text = String(code || "").replace(/\s+/g, "");
  let ok = false, usedRecovery = false;
  if (/^\d{6}$/.test(text)) {
    const secret = await shakOpen(env, auth.secret_enc);
    const step = Math.floor(now / 30000);
    for (const delta of [-1, 0, 1]) {
      if (step + delta <= state.last_step) continue; // um código só vale uma vez
      if (shakSameText(await shakTotp(secret, step + delta), text)) { ok = true; state.last_step = step + delta; break; }
    }
  } else if (allowRecovery && /^[0-9a-f]{4}-[0-9a-f]{4}$/i.test(text)) {
    const hash = await shakSha256Hex("recovery|" + email + "|" + text.toLowerCase());
    const list = JSON.parse(state.recovery || "[]");
    if (list.indexOf(hash) !== -1) { ok = true; usedRecovery = true; state.recovery = JSON.stringify(list.filter(item => item !== hash)); }
  }
  if (ok) { state.fails = 0; state.fail_start = 0; }
  else { if (!state.fail_start || now - state.fail_start >= XURI_FAIL_WINDOW_MS) { state.fails = 0; state.fail_start = now; } state.fails += 1; }
  await save();
  return { ok, usedRecovery, error: ok ? null : "invalid_code", state, save };
}

/** Texto exato que o autor assina para provar um arquivo exportado (PDF, DOCX, EPUB...) ligado a uma versão registrada. */
const xuriExportPayload = (workId, seq, format, fileHash, contentHash, createdAt) => shakStable({ protocol: "xuri-1-export", work: workId, seq, format, file: fileHash, content: contentHash, at: createdAt });
/** ISBN normalizado (sem hífens, X maiúsculo) e conferido pelo dígito verificador; "" se inválido. */
function xuriIsbn(value) {
  const code = String(value || "").replace(/[\s-]/g, "").toUpperCase();
  if (/^\d{9}[\dX]$/.test(code)) return code.split("").reduce((sum, ch, i) => sum + (ch === "X" ? 10 : Number(ch)) * (10 - i), 0) % 11 === 0 ? code : "";
  if (/^\d{13}$/.test(code)) return code.split("").reduce((sum, ch, i) => sum + Number(ch) * (i % 2 === 0 ? 1 : 3), 0) % 10 === 0 ? code : "";
  return "";
}
/** ISBNs que o autor declarou no livro (principal e por formato). Declarados, não verificados. */
const xuriBookIsbns = book => {
  const pub = (book && book.publication) || {};
  const all = [pub.isbn, ...Object.values((pub.copyright && pub.copyright.isbns) || {})].map(xuriIsbn).filter(Boolean);
  return [...new Set(all)].slice(0, 6);
};
const XURI_EXPORT_FORMATS = ["pdf", "docx", "epub", "txt", "html", "json"];
const xuriEntryHash = (workId, seq, contentHash, prevHash, createdAt) => shakSha256Hex(xuriPayload(workId, seq, contentHash, prevHash, createdAt));

/** Verifica a cadeia: cada entrada recalculada e ligada à anterior. */
async function xuriVerifyChain(workId, rows) {
  let prev = "0".repeat(64), seq = 0;
  for (const row of rows) {
    seq += 1;
    if (row.seq !== seq || row.prev_hash !== prev || row.entry_hash !== await xuriEntryHash(workId, row.seq, row.content_hash, row.prev_hash, row.created_at)) return { valid: false, brokenAt: seq };
    prev = row.entry_hash;
  }
  return { valid: true, brokenAt: null };
}

/** Pedido RFC 3161 (SHA-256) para o hash de uma entrada. */
function xuriTsQuery(hashHex) {
  const hash = new Uint8Array((hashHex.match(/../g) || []).map(h => parseInt(h, 16)));
  const head = [0x30, 0x39, 0x02, 0x01, 0x01, 0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00, 0x04, 0x20];
  return new Uint8Array([...head, ...hash, 0x01, 0x01, 0xff]);
}
/** Lê um TLV DER com limites estritos; rejeita comprimento indefinido, truncamento e bytes fora do elemento. */
function xuriDerTlv(bytes, offset, limit = bytes.length) {
  if (offset + 2 > limit) return null;
  const tag = bytes[offset++];
  let length = bytes[offset++];
  if (length & 0x80) {
    const count = length & 0x7f;
    if (count === 0 || count > 4 || offset + count > limit || bytes[offset] === 0) return null;
    length = 0;
    for (let i = 0; i < count; i++) length = length * 256 + bytes[offset++];
    if (length < 128) return null; // DER requires short form for lengths below 128.
  }
  const end = offset + length;
  if (end > limit) return null;
  return { tag, start: offset, end, next: end };
}
/** Valida a estrutura externa de TimeStampResp e exige status concedido e ContentInfo SignedData.
 * Isto é apenas validação estrutural: não verifica assinatura, cadeia de certificados nem TSTInfo.
 */
function xuriTsGranted(bytes) {
  const outer = xuriDerTlv(bytes, 0);
  if (!outer || outer.tag !== 0x30 || outer.end !== bytes.length) return false;
  const statusInfo = xuriDerTlv(bytes, outer.start, outer.end);
  if (!statusInfo || statusInfo.tag !== 0x30) return false;
  const status = xuriDerTlv(bytes, statusInfo.start, statusInfo.end);
  if (!status || status.tag !== 0x02 || status.end - status.start !== 1 || bytes[status.start] > 1) return false;
  // Optional statusString / failInfo may follow the INTEGER, but every TLV must remain inside statusInfo.
  let cursor = status.next;
  while (cursor < statusInfo.end) {
    const optional = xuriDerTlv(bytes, cursor, statusInfo.end);
    if (!optional) return false;
    cursor = optional.next;
  }
  const token = xuriDerTlv(bytes, statusInfo.next, outer.end);
  if (!token || token.tag !== 0x30 || token.end !== outer.end || bytes[status.start] > 1) return false;
  const oid = xuriDerTlv(bytes, token.start, token.end);
  if (!oid || oid.tag !== 0x06) return false;
  const signedDataOid = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02];
  if (oid.end - oid.start !== signedDataOid.length || signedDataOid.some((byte, i) => bytes[oid.start + i] !== byte)) return false;
  const content = xuriDerTlv(bytes, oid.next, token.end);
  if (!content || content.tag !== 0xa0 || content.end !== token.end) return false;
  const signedData = xuriDerTlv(bytes, content.start, content.end);
  return !!signedData && signedData.tag === 0x30 && signedData.end === content.end;
}
const xuriB64 = bytes => { let text = ""; for (const b of bytes) text += String.fromCharCode(b); return btoa(text); };
/** Carimbo de tempo externo (autoridade RFC 3161). Melhor esforço: falha não impede o registro; dá para repetir depois. */
async function xuriStamp(db, env, versionId, entryHash, doFetch) {
  const url = env.XURI_TSA_URL || "https://freetsa.org/tsr";
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await (doFetch || fetch)(url, { method: "POST", headers: { "content-type": "application/timestamp-query" }, body: xuriTsQuery(entryHash), signal: ctl.signal });
    if (!r.ok) return false;
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.length > 20000 || !xuriTsGranted(bytes)) return false;
    await db.prepare("UPDATE shak_versions SET ts_proof = ? WHERE id = ?").bind(JSON.stringify({ tsa: url, protocol: "rfc3161-sha256", token: xuriB64(bytes), at: new Date().toISOString() }), versionId).run();
    return true;
  } catch { return false; } finally { clearTimeout(timer); }
}
const xuriPayload = (workId, seq, contentHash, prevHash, createdAt) => shakStable({ protocol: "xuri-1", work: workId, seq, content: contentHash, prev: prevHash, at: createdAt });

const XURI_KEY_SQL = "SELECT key_id, public_key, created_at FROM shak_keys WHERE email = ? AND revoked_at IS NULL";
const xuriB64Decode = text => { try { const raw = atob(String(text)); return Uint8Array.from(raw, ch => ch.charCodeAt(0)); } catch { return null; } };
const XURI_SPKI_PREFIX = [0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00];
/** Confere a assinatura Ed25519 do autor sobre o texto exato do registro. */
async function xuriVerifySignature(publicKeyB64, signatureB64, payload) {
  const pub = xuriB64Decode(publicKeyB64), sig = xuriB64Decode(signatureB64);
  if (!pub || pub.length !== 32 || !sig || sig.length !== 64) return false;
  try {
    const key = await crypto.subtle.importKey("raw", pub, { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, sig, new TextEncoder().encode(payload));
  } catch { return false; }
}
async function shakXuri(db, env, email, owner, path, req, now, doFetch) {
  await ensureXuri(db);
  const json = (body, status = 200) => planJson(body, status);
  const auth = await db.prepare(XURI_AUTH_SQL).bind(email).first();
  const configured = !!(await shakXuriKey(env));
  let body = {};
  if (req.method === "POST") { try { body = await req.json(); } catch { body = {}; } }

  if (path === "/api/xuri/status" && req.method === "GET") {
    return json({ configured, enrolled: !!auth, confirmed: !!(auth && auth.confirmed), unlockedUntil: auth && auth.unlock_until > now ? new Date(auth.unlock_until).toISOString() : null, recoveryLeft: auth ? JSON.parse(auth.recovery || "[]").length : 0, signingKey: await (async () => { const k = await db.prepare(XURI_KEY_SQL).bind(email).first(); return k ? { keyId: k.key_id, publicKey: k.public_key, createdAt: k.created_at } : null; })() });
  }
  if (!configured) return json({ error: "xuri_not_configured", message: "A proteção de autoria ainda não foi ativada neste servidor." }, 503);

  if (path === "/api/xuri/totp/enroll" && req.method === "POST") {
    if (auth && auth.confirmed) return json({ error: "already_enrolled", message: "O autenticador já está ativo. Para trocá-lo, remova o atual com um código." }, 409);
    const secret = crypto.getRandomValues(new Uint8Array(20));
    await db.prepare("INSERT OR REPLACE INTO shak_authenticators (email, secret_enc, confirmed, last_step, fails, fail_start, unlock_until, recovery, created_at) VALUES (?, ?, 0, 0, 0, 0, 0, '[]', ?)").bind(email, await shakSeal(env, secret), new Date(now).toISOString()).run();
    const b32 = shakBase32(secret);
    return json({ secret: b32, otpauthUrl: "otpauth://totp/Shakstory:" + encodeURIComponent(email) + "?secret=" + b32 + "&issuer=Shakstory&algorithm=SHA1&digits=6&period=30" });
  }
  if (path === "/api/xuri/totp/confirm" && req.method === "POST") {
    if (!auth || auth.confirmed) return json({ error: "not_pending" }, 409);
    const check = await shakXuriCheck(db, env, email, auth, body.code, now, false);
    if (!check.ok) return json({ error: check.error, message: check.error === "locked" ? "Muitas tentativas. Aguarde alguns minutos." : "Código incorreto." }, check.error === "locked" ? 429 : 400);
    const codes = Array.from({ length: 8 }, () => shakHex(crypto.getRandomValues(new Uint8Array(4))).replace(/^(.{4})(.{4})$/, "$1-$2"));
    check.state.confirmed = 1; check.state.unlock_until = now + XURI_UNLOCK_MS;
    check.state.recovery = JSON.stringify(await Promise.all(codes.map(code => shakSha256Hex("recovery|" + email + "|" + code))));
    await check.save();
    await shakEnsureBilling(db); await shakAudit(db, now, email, "xuri.totp_enabled", {});
    return json({ ok: true, recoveryCodes: codes, unlockedUntil: new Date(check.state.unlock_until).toISOString() });
  }
  if (path === "/api/xuri/unlock" && req.method === "POST") {
    if (!auth || !auth.confirmed) return json({ error: "totp_required", message: "Ative o autenticador primeiro." }, 428);
    const check = await shakXuriCheck(db, env, email, auth, body.code, now, true);
    if (!check.ok) return json({ error: check.error, message: check.error === "locked" ? "Muitas tentativas. Aguarde alguns minutos." : "Código incorreto." }, check.error === "locked" ? 429 : 400);
    check.state.unlock_until = now + XURI_UNLOCK_MS; await check.save();
    return json({ ok: true, unlockedUntil: new Date(check.state.unlock_until).toISOString(), recoveryLeft: JSON.parse(check.state.recovery || "[]").length });
  }
  if (path === "/api/xuri/totp/revoke" && req.method === "POST") {
    if (!auth) return json({ error: "totp_required" }, 428);
    const check = await shakXuriCheck(db, env, email, auth, body.code, now, true);
    if (!check.ok) return json({ error: check.error, message: "Código incorreto." }, check.error === "locked" ? 429 : 400);
    await db.prepare("DELETE FROM shak_authenticators WHERE email = ?").bind(email).run();
    await shakEnsureBilling(db); await shakAudit(db, now, email, "xuri.totp_removed", {});
    return json({ ok: true });
  }

  if (path === "/api/xuri/key" && req.method === "POST") {
    if (!auth || !auth.confirmed) return json({ error: "totp_required", message: "Ative o Google Authenticator primeiro." }, 428);
    if (!(auth.unlock_until > now)) return json({ error: "locked", message: "Digite o código do autenticador para cadastrar a chave." }, 423);
    const pub = xuriB64Decode(body.publicKey);
    if (!pub || pub.length !== 32) return json({ error: "invalid_key", message: "Chave pública inválida." }, 400);
    const keyId = (await shakSha256Hex("ed25519|" + String(body.publicKey))).slice(0, 16);
    await db.prepare("UPDATE shak_keys SET revoked_at = ? WHERE email = ? AND revoked_at IS NULL").bind(new Date(now).toISOString(), email).run();
    await db.prepare("INSERT INTO shak_keys (key_id, email, public_key, created_at) VALUES (?, ?, ?, ?)").bind(keyId, email, String(body.publicKey), new Date(now).toISOString()).run();
    await shakEnsureBilling(db); await shakAudit(db, now, email, "xuri.key_registered", { keyId });
    return json({ ok: true, keyId });
  }
  if (path === "/api/xuri/key/revoke" && req.method === "POST") {
    if (!auth || !auth.confirmed) return json({ error: "totp_required" }, 428);
    if (!(auth.unlock_until > now)) return json({ error: "locked", message: "Digite o código do autenticador." }, 423);
    await db.prepare("UPDATE shak_keys SET revoked_at = ? WHERE email = ? AND revoked_at IS NULL").bind(new Date(now).toISOString(), email).run();
    await shakEnsureBilling(db); await shakAudit(db, now, email, "xuri.key_revoked", {});
    return json({ ok: true });
  }

  // Obras e versões: o hash é do livro como está salvo no servidor (library.json), nunca de um valor enviado pelo navegador.
  const bookId = String(body.bookId || new URL(req.url).searchParams.get("bookId") || "");
  if (!/^[A-Za-z0-9_.:-]{1,120}$/.test(bookId)) return json({ error: "invalid_book" }, 400);
  const prefix = owner ? "" : "u/" + (await userKey(email)) + "/";
  const loadBook = async () => {
    const row = await db.prepare("SELECT data_json FROM editorial_documents WHERE document_path = ?").bind(prefix + "library.json").first();
    if (!row) return null;
    let lib; try { lib = JSON.parse(row.data_json); } catch { return null; }
    const book = (lib && Array.isArray(lib.books) ? lib.books : []).find(item => item && item.id === bookId);
    if (!book) return null;
    const text = shakStable(book);
    return { title: String(book.title || "Sem título").slice(0, 200), hash: await shakSha256Hex(text), bytes: shakUtf8Bytes(text), isbns: xuriBookIsbns(book) };
  };
  const work = await db.prepare("SELECT id, title, created_at, published_at, public_name FROM shak_works WHERE email = ? AND book_id = ?").bind(email, bookId).first();

  if (path === "/api/xuri/history" && req.method === "GET") {
    if (!work) return json({ registered: false, versions: [] });
    const rows = (await db.prepare("SELECT id, seq, content_hash, prev_hash, entry_hash, bytes, note, created_at, ts_proof, signature FROM shak_versions WHERE work_id = ? ORDER BY seq").bind(work.id).all()).results || [];
    const current = await loadBook();
    return json({ registered: true, workId: work.id, title: work.title, published: !!work.published_at, publicName: work.public_name || null, chain: await xuriVerifyChain(work.id, rows), matchesCurrent: !!(current && rows.length && rows[rows.length - 1].content_hash === current.hash), versions: rows.map(row => ({ seq: row.seq, contentHash: row.content_hash, entryHash: row.entry_hash, bytes: row.bytes, note: row.note, createdAt: row.created_at, stamped: !!row.ts_proof, signed: !!row.signature })) });
  }
  if (path === "/api/xuri/publish" && req.method === "POST") {
    if (!work) return json({ error: "not_registered", message: "Registre ao menos uma versão antes de publicar." }, 404);
    if (body.publish === true) {
      if (!auth || !auth.confirmed || !(auth.unlock_until > now)) return json({ error: "locked", message: "Digite o código do autenticador para publicar." }, 423);
      const name = String(body.displayName || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 80);
      const book = await loadBook();
      const isbns = book ? book.isbns : [];
      await db.prepare("UPDATE shak_works SET published_at = ?, public_name = ?, public_isbns = ? WHERE id = ?").bind(new Date(now).toISOString(), name || null, isbns.length ? JSON.stringify(isbns) : null, work.id).run();
      await shakEnsureBilling(db); await shakAudit(db, now, email, "xuri.published", { work: work.id });
      return json({ ok: true, published: true, publicName: name || null, isbns });
    }
    await db.prepare("UPDATE shak_works SET published_at = NULL, public_name = NULL, public_isbns = NULL WHERE id = ?").bind(work.id).run();
    await shakEnsureBilling(db); await shakAudit(db, now, email, "xuri.unpublished", { work: work.id });
    return json({ ok: true, published: false });
  }
  if (path === "/api/xuri/stamp" && req.method === "POST") {
    if (!work) return json({ error: "not_registered" }, 404);
    const rows = (await db.prepare("SELECT id, seq, content_hash, prev_hash, entry_hash, bytes, note, created_at, ts_proof, signature FROM shak_versions WHERE work_id = ? ORDER BY seq").bind(work.id).all()).results || [];
    let done = 0, pending = 0;
    for (const row of rows) { if (row.ts_proof) continue; if (await xuriStamp(db, env, row.id, row.entry_hash, doFetch)) done += 1; else pending += 1; }
    return json({ ok: true, stamped: done, pending });
  }
  if (path === "/api/xuri/dossier" && req.method === "GET") {
    if (!work) return json({ error: "not_registered" }, 404);
    const rows = (await db.prepare("SELECT id, seq, content_hash, prev_hash, entry_hash, bytes, note, created_at, ts_proof, signature FROM shak_versions WHERE work_id = ? ORDER BY seq").bind(work.id).all()).results || [];
    const chain = await xuriVerifyChain(work.id, rows);
    const keys = ((await db.prepare("SELECT key_id, public_key, created_at, revoked_at FROM shak_keys WHERE email = ? ORDER BY created_at").bind(email).all()).results || []).map(k => { const raw = xuriB64Decode(k.public_key); return { keyId: k.key_id, algorithm: "ed25519", publicKey: k.public_key, publicKeySpkiBase64: raw ? btoa(String.fromCharCode(...XURI_SPKI_PREFIX, ...raw)) : null, createdAt: k.created_at, revokedAt: k.revoked_at }; });
    const exportRows = (await db.prepare("SELECT id, seq, format, file_hash, content_hash, created_at, signature FROM shak_exports WHERE work_id = ? ORDER BY created_at").bind(work.id).all()).results || [];
    return json({ protocol: "xuri-1", generatedAt: new Date(now).toISOString(), account: email, exports: exportRows.map(row => ({ id: row.id, seq: row.seq, format: row.format, fileHash: row.file_hash, contentHash: row.content_hash, createdAt: row.created_at, payload: xuriExportPayload(work.id, row.seq, row.format, row.file_hash, row.content_hash, row.created_at), signature: JSON.parse(row.signature) })), work: { id: work.id, bookId, title: work.title }, chain, keys, howToVerify: ["1. Para cada versão, SHA-256 do texto de entryPayload deve ser igual a entryHash e prev deve ser o entryHash da versão anterior (a primeira usa 64 zeros).", "2. contentHash é o SHA-256 do livro em JSON com chaves ordenadas, como estava salvo no servidor naquele momento.", "3. Se houver timestamp, salve o token (base64) em um arquivo .tsr e confira com: openssl ts -verify -in arquivo.tsr -digest <entryHash> -sha256 -CAfile <certificado da autoridade>.", "4. Se houver assinatura: grave entryPayload em um arquivo (sem quebra de linha final), a assinatura (base64) decodificada em outro, a chave publicKeySpkiBase64 em PEM (BEGIN PUBLIC KEY) e confira com: openssl pkeyutl -verify -rawin -pubin -inkey chave.pem -in payload.txt -sigfile assinatura.bin.", "Isto é evidência de que o conteúdo existia na data registrada; não prova quem o escreveu."], versions: rows.map(row => ({ seq: row.seq, createdAt: row.created_at, note: row.note, bytes: row.bytes, contentHash: row.content_hash, prevHash: row.prev_hash, entryHash: row.entry_hash, entryPayload: xuriPayload(work.id, row.seq, row.content_hash, row.prev_hash, row.created_at), timestamp: row.ts_proof ? JSON.parse(row.ts_proof) : null, signature: row.signature ? JSON.parse(row.signature) : null })) });
  }
  if ((path === "/api/xuri/export/prepare" || path === "/api/xuri/export/register") && req.method === "POST") {
    // Prova de exportação: o autor assina o SHA-256 do arquivo gerado, ligado à versão registrada mais recente.
    if (!auth || !auth.confirmed) return json({ error: "totp_required", message: "Ative o Google Authenticator para provar exportações." }, 428);
    if (!(auth.unlock_until > now)) return json({ error: "locked", message: "Digite o código do autenticador para provar a exportação." }, 423);
    if (!work) return json({ error: "not_registered", message: "Registre uma versão antes de provar uma exportação." }, 404);
    const fileHash = String(body.fileHash || "").toLowerCase(), format = String(body.format || "").toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(fileHash) || !XURI_EXPORT_FORMATS.includes(format)) return json({ error: "invalid_export", message: "Informe o formato (pdf, docx, epub, txt, html ou json) e o SHA-256 do arquivo." }, 400);
    const key = await db.prepare(XURI_KEY_SQL).bind(email).first();
    if (!key) return json({ error: "key_required", message: "Cadastre a chave de assinatura para provar exportações." }, 428);
    const rows = (await db.prepare("SELECT seq, content_hash, created_at FROM shak_versions WHERE work_id = ? ORDER BY seq").bind(work.id).all()).results || [];
    const last = rows[rows.length - 1];
    const current = await loadBook();
    if (!last || !current || last.content_hash !== current.hash) return json({ error: "version_outdated", message: "O livro mudou desde a última versão registrada. Registre uma nova versão antes de provar a exportação." }, 409);
    let createdAt = new Date(now).toISOString();
    if (path === "/api/xuri/export/prepare") return json({ ok: true, seq: last.seq, createdAt, payload: xuriExportPayload(work.id, last.seq, format, fileHash, last.content_hash, createdAt), keyId: key.key_id });
    const claimed = Date.parse(String(body.createdAt || ""));
    if (!body.signature || !Number.isFinite(claimed) || Math.abs(now - claimed) > 5 * 60000 || claimed < Date.parse(last.created_at)) return json({ error: "signature_required", message: "Prepare e assine de novo." }, 428);
    createdAt = new Date(claimed).toISOString();
    if (!(await xuriVerifySignature(key.public_key, body.signature, xuriExportPayload(work.id, last.seq, format, fileHash, last.content_hash, createdAt)))) return json({ error: "bad_signature", message: "A assinatura não confere com a chave cadastrada." }, 400);
    const exportId = "x_" + shakHex(crypto.getRandomValues(new Uint8Array(10)));
    await db.prepare("INSERT OR IGNORE INTO shak_exports (id, work_id, seq, format, file_hash, content_hash, created_at, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(exportId, work.id, last.seq, format, fileHash, last.content_hash, createdAt, JSON.stringify({ keyId: key.key_id, alg: "ed25519", sig: String(body.signature) })).run();
    await shakEnsureBilling(db); await shakAudit(db, now, email, "xuri.export", { bookId, seq: last.seq, format, fileHash });
    return json({ ok: true, exportId, seq: last.seq, format, fileHash, createdAt });
  }
  if ((path === "/api/xuri/register" || path === "/api/xuri/prepare") && req.method === "POST") {
    if (!auth || !auth.confirmed) return json({ error: "totp_required", message: "Ative o Google Authenticator para registrar versões." }, 428);
    if (!(auth.unlock_until > now)) return json({ error: "locked", message: "Digite o código do autenticador para registrar." }, 423);
    const current = await loadBook();
    if (!current) return json({ error: "book_not_found", message: "Este livro ainda não foi salvo no servidor. Aguarde a sincronização e tente de novo." }, 404);
    const workId = work ? work.id : "w_" + shakHex(crypto.getRandomValues(new Uint8Array(10)));
    if (!work) await db.prepare("INSERT OR IGNORE INTO shak_works (id, email, book_id, title, created_at) VALUES (?, ?, ?, ?, ?)").bind(workId, email, bookId, current.title, new Date(now).toISOString()).run();
    const real = work ? work : await db.prepare("SELECT id, title, created_at FROM shak_works WHERE email = ? AND book_id = ?").bind(email, bookId).first();
    const rows = (await db.prepare("SELECT seq, content_hash, prev_hash, entry_hash, bytes, note, created_at FROM shak_versions WHERE work_id = ? ORDER BY seq").bind(real.id).all()).results || [];
    const last = rows[rows.length - 1];
    if (last && last.content_hash === current.hash) return json({ ok: true, unchanged: true, seq: last.seq, contentHash: last.content_hash, message: "Nada mudou desde a última versão registrada." });
    const key = await db.prepare(XURI_KEY_SQL).bind(email).first();
    const seq = rows.length + 1, prev = last ? last.entry_hash : "0".repeat(64);
    let createdAt = new Date(now).toISOString();
    if (path === "/api/xuri/prepare") {
      return json({ ok: true, seq, createdAt, entryPayload: xuriPayload(real.id, seq, current.hash, prev, createdAt), keyId: key ? key.key_id : null });
    }
    let signature = null;
    if (key) {
      // com chave cadastrada, o registro só vale assinado: o autor assina o texto exato (entryPayload) que o servidor preparou
      const claimed = Date.parse(String(body.createdAt || ""));
      if (!body.signature || !Number.isFinite(claimed) || Math.abs(now - claimed) > 5 * 60000 || (last && claimed < Date.parse(last.created_at))) return json({ error: "signature_required", message: "Este livro exige a assinatura da sua chave. Prepare e assine de novo." }, 428);
      createdAt = new Date(claimed).toISOString();
      if (!(await xuriVerifySignature(key.public_key, body.signature, xuriPayload(real.id, seq, current.hash, prev, createdAt)))) return json({ error: "bad_signature", message: "A assinatura não confere com a chave cadastrada." }, 400);
      signature = JSON.stringify({ keyId: key.key_id, alg: "ed25519", sig: String(body.signature) });
    }
    const entry = await xuriEntryHash(real.id, seq, current.hash, prev, createdAt);
    const versionId = "v_" + shakHex(crypto.getRandomValues(new Uint8Array(10)));
    try {
      await db.prepare("INSERT INTO shak_versions (id, work_id, seq, content_hash, bytes, prev_hash, entry_hash, note, created_at, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(versionId, real.id, seq, current.hash, current.bytes, prev, entry, String(body.note || "").slice(0, 200) || null, createdAt, signature).run();
    } catch { return json({ error: "conflict", message: "Outro registro foi feito ao mesmo tempo. Tente de novo." }, 409); }
    await shakEnsureBilling(db); await shakAudit(db, now, email, "xuri.register", { bookId, seq, contentHash: current.hash, signed: !!signature });
    const stamped = await xuriStamp(db, env, versionId, entry, doFetch);
    return json({ ok: true, workId: real.id, seq, contentHash: current.hash, entryHash: entry, createdAt, stamped, signed: !!signature });
  }
  return json({ error: "not_found" }, 404);
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

const XURI_UID_RE = /^[A-Za-z0-9_.:-]{8,120}$/;
const XURI_LOOKUP_PER_MINUTE = 30;
/** Consulta pública (sem login): só obras que o autor publicou. Nunca devolve e-mail, nota, segredo ou texto da obra. */
async function shakXuriLookup(req, env, now) {
  const json = (body, status = 200) => planJson(body, status);
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  const db = env.DB;
  if (!db) return json({ error: "unavailable" }, 503);
  const rawQ = String(new URL(req.url).searchParams.get("q") || "").trim();
  const isbn = xuriIsbn(rawQ);
  const q = isbn || rawQ.replace(/^xuri:(?:work|version):/i, "");
  const isHash = !isbn && /^[a-f0-9]{64}$/i.test(q);
  if (!isbn && !isHash && !XURI_UID_RE.test(q)) return json({ error: "invalid_query" }, 400);
  await ensureXuri(db);
  const ip = req.headers.get("CF-Connecting-IP") || req.headers.get("x-forwarded-for") || "anon";
  const win = Math.floor(now / 60000);
  const k = (await shakHash(ip + "|xuri-lookup|" + (env.TURNSTILE_SECRET_KEY || ""))) + ":" + win;
  await db.prepare("INSERT INTO shak_xuri_lookups (k, n) VALUES (?, 1) ON CONFLICT(k) DO UPDATE SET n = n + 1").bind(k).run();
  const used = await db.prepare("SELECT n FROM shak_xuri_lookups WHERE k = ?").bind(k).first();
  if (used && used.n > XURI_LOOKUP_PER_MINUTE) return json({ error: "rate_limited" }, 429);
  await db.prepare("DELETE FROM shak_xuri_lookups WHERE k NOT LIKE ?").bind("%:" + win).run();
  const WORK_COLS = "w.id AS id, w.title AS title, w.published_at AS published_at, w.public_name AS public_name, w.public_isbns AS public_isbns";
  let work = null, kind = "work";
  if (isbn) {
    // ISBN é declarado pelo autor: serve para localizar, não prova autoria. Se mais de uma obra publicada o declara, não escolhemos por ninguém.
    const found = (await db.prepare("SELECT " + WORK_COLS + " FROM shak_works w WHERE w.published_at IS NOT NULL AND w.public_isbns LIKE ? LIMIT 3").bind('%"' + isbn + '"%').all()).results || [];
    if (found.length > 1) return json({ error: "ambiguous_isbn", message: "Mais de uma obra publicada declara este ISBN. Consulte pelo UID ou pelo SHA-256." }, 409);
    work = found[0] || null; kind = "isbn";
  } else if (isHash) {
    const hash = q.toLowerCase();
    work = await db.prepare("SELECT " + WORK_COLS + " FROM shak_versions v JOIN shak_works w ON w.id = v.work_id WHERE w.published_at IS NOT NULL AND (v.content_hash = ? OR v.entry_hash = ?) LIMIT 1").bind(hash, hash).first();
    kind = "hash";
    if (!work) { work = await db.prepare("SELECT " + WORK_COLS + " FROM shak_exports x JOIN shak_works w ON w.id = x.work_id WHERE w.published_at IS NOT NULL AND x.file_hash = ? LIMIT 1").bind(hash).first(); if (work) kind = "file"; }
  } else {
    work = await db.prepare("SELECT " + WORK_COLS + " FROM shak_works w WHERE w.published_at IS NOT NULL AND w.id = ?").bind(q).first();
    if (!work) { work = await db.prepare("SELECT " + WORK_COLS + " FROM shak_versions v JOIN shak_works w ON w.id = v.work_id WHERE w.published_at IS NOT NULL AND v.id = ?").bind(q).first(); kind = "version"; }
  }
  if (!work) return json({ error: "not_found" }, 404);
  const rows = (await db.prepare("SELECT id, seq, content_hash, prev_hash, entry_hash, bytes, created_at, ts_proof, signature FROM shak_versions WHERE work_id = ? ORDER BY seq").bind(work.id).all()).results || [];
  const chain = await xuriVerifyChain(work.id, rows);
  const exportRows = (await db.prepare("SELECT id, seq, format, file_hash, content_hash, created_at, signature FROM shak_exports WHERE work_id = ? ORDER BY created_at").bind(work.id).all()).results || [];
  const exports = exportRows.map(row => ({ id: row.id, seq: row.seq, format: row.format, fileHash: row.file_hash, contentHash: row.content_hash, createdAt: row.created_at, payload: xuriExportPayload(work.id, row.seq, row.format, row.file_hash, row.content_hash, row.created_at), signature: JSON.parse(row.signature) }));
  const sigKey = raw => { try { return raw ? JSON.parse(raw).keyId : null; } catch { return null; } };
  const keyIds = [...new Set([...rows.map(row => sigKey(row.signature)), ...exportRows.map(row => sigKey(row.signature))].filter(Boolean))].slice(0, 20);
  const keys = [];
  for (const keyId of keyIds) {
    const row = await db.prepare("SELECT key_id, public_key, created_at, revoked_at FROM shak_keys WHERE key_id = ?").bind(keyId).first();
    if (!row) continue;
    const raw = xuriB64Decode(row.public_key);
    keys.push({ keyId: row.key_id, algorithm: "ed25519", publicKey: row.public_key, publicKeySpkiBase64: raw ? btoa(String.fromCharCode(...XURI_SPKI_PREFIX, ...raw)) : null, createdAt: row.created_at, revokedAt: row.revoked_at });
  }
  const match = kind === "file" ? exportRows.find(row => row.file_hash === q.toLowerCase()) : isHash ? rows.find(row => row.content_hash === q.toLowerCase() || row.entry_hash === q.toLowerCase()) : kind === "version" ? rows.find(row => row.id === q) : null;
  return json({
    protocol: "xuri-1", generatedAt: new Date(now).toISOString(),
    work: { id: work.id, title: work.title, isbns: work.public_isbns ? JSON.parse(work.public_isbns) : [] }, author: work.public_name ? { displayName: work.public_name } : null, publishedAt: work.published_at,
    chain, keys, exports,
    versions: rows.map(row => ({ id: row.id, seq: row.seq, createdAt: row.created_at, bytes: row.bytes, contentHash: row.content_hash, prevHash: row.prev_hash, entryHash: row.entry_hash, entryPayload: xuriPayload(work.id, row.seq, row.content_hash, row.prev_hash, row.created_at), timestamp: row.ts_proof ? JSON.parse(row.ts_proof) : null, signature: row.signature ? JSON.parse(row.signature) : null })),
    ...(work.public_isbns ? { isbnNotice: "ISBN informado pelo autor; identifica a edição, não comprova autoria." } : {}),
    match: match ? { kind, seq: match.seq } : { kind },
    notice: "Evidência técnica de que o conteúdo existia na data registrada; não prova, por si só, autoria jurídica nem originalidade."
  });
}

export async function shakGate(req, env, u, options = {}) {
  if (u.pathname === "/api/public/xuri/lookup" || u.pathname === "/api/xuri/public/lookup") {
    try { return { response: await shakXuriLookup(req, env, options.now ?? Date.now()) }; } catch { return { response: planJson({ error: "unavailable" }, 503) }; }
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
