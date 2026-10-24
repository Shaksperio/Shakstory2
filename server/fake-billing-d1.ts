import { fakeDb } from "./fake-d1";

/** D1 de mentira com as tabelas de cobrança (ofertas, pedidos, pagamentos, períodos, auditoria). O resto vem do fakeDb. */
export function fakeBillingDb() {
  const base = fakeDb();
  const offers = new Map<string, any>();
  const purchases: any[] = [];
  const payments: any[] = [];
  const periods: any[] = [];
  const audit: any[] = [];
  const signups: any[] = [];
  const documents = new Map<string, string>();
  const auths = new Map<string, any>();
  const works: any[] = [];
  const lookups = new Map<string, number>();
  const versions: any[] = [];
  const keys: any[] = [];
  const db: any = { ...base, offers, purchases, payments, periods, audit, signups, documents, auths, works, versions, keys };
  const unique = (what: string) => { const e: any = new Error("UNIQUE constraint failed: " + what); return e; };
  const sortDesc = (rows: any[], key: string) => [...rows].sort((a, b) => String(b[key]).localeCompare(String(a[key])));
  db.prepare = (sql: string) => {
    const make = (args: any[]) => {
      const inner = base.prepare(sql).bind(...args);
      const handle = (kind: "first" | "all" | "run") => async () => {
        if (/FROM shak_offers WHERE plan/.test(sql)) return kind === "first" ? offers.get(args[0]) ?? null : { results: [] };
        if (/FROM shak_offers$/.test(sql.trim())) return { results: Array.from(offers.values()) };
        if (/^INSERT INTO shak_offers/.test(sql)) {
          const [plan, price_cents, currency, checkout_url, updated_at] = args;
          const prev = offers.get(plan);
          offers.set(plan, { plan, price_cents, currency, checkout_url, version: prev ? prev.version + 1 : 1, updated_at });
          return {};
        }
        if (/SELECT COUNT\(\*\) AS n FROM shak_purchases/.test(sql)) return { n: purchases.filter(p => p.email === args[0] && p.created_at >= args[1]).length };
        if (/FROM shak_purchases WHERE email = \? AND plan = \? AND status = 'pending'/.test(sql)) return sortDesc(purchases.filter(p => p.email === args[0] && p.plan === args[1] && p.status === "pending"), "created_at")[0] ?? null;
        if (/FROM shak_purchases WHERE id = \?/.test(sql)) return purchases.find(p => p.id === args[0]) ?? null;
        if (/FROM shak_purchases WHERE email = \? ORDER BY/.test(sql)) return { results: sortDesc(purchases.filter(p => p.email === args[0]), "created_at").slice(0, 20) };
        if (/FROM shak_purchases WHERE status IN/.test(sql)) return { results: sortDesc(purchases.filter(p => ["pending", "awaiting_review", "needs_review"].includes(p.status)), "created_at") };
        if (/FROM shak_purchases ORDER BY/.test(sql)) return { results: sortDesc(purchases, "created_at").slice(0, 50) };
        if (/^INSERT INTO shak_purchases/.test(sql)) {
          const [id, email, plan, price_cents, currency, offer_version, created_at] = args;
          purchases.push({ id, email, plan, price_cents, currency, offer_version, provider: "ton", status: "pending", created_at, claimed_at: null, reviewed_at: null, tx_id: null, note: null });
          return {};
        }
        if (/^UPDATE shak_purchases SET status/.test(sql)) {
          const [status, claimed, reviewed, tx, note, id] = args;
          const p = purchases.find(row => row.id === id)!;
          Object.assign(p, { status, claimed_at: claimed ?? p.claimed_at, reviewed_at: reviewed ?? p.reviewed_at, tx_id: tx ?? p.tx_id, note: note ?? p.note });
          return {};
        }
        if (/^SELECT.*FROM shak_payments WHERE provider = \? AND tx_id = \?/.test(sql)) return payments.find(p => p.provider === args[0] && p.tx_id === args[1]) ?? null;
        if (/FROM shak_payments ORDER BY/.test(sql)) return { results: sortDesc(payments, "confirmed_at").slice(0, 50) };
        if (/^INSERT INTO shak_payments/.test(sql)) {
          if (payments.some(p => p.provider === args[0] && p.tx_id === args[1])) throw unique("shak_payments.provider, shak_payments.tx_id");
          const [provider, tx_id, purchase_id, email, plan, amount_cents, currency, confirmed_at, confirmed_by] = args;
          payments.push({ provider, tx_id, purchase_id, email, plan, amount_cents, currency, confirmed_at, confirmed_by });
          return {};
        }
        if (/^DELETE FROM shak_payments/.test(sql)) { const i = payments.findIndex(p => p.provider === args[0] && p.tx_id === args[1]); if (i >= 0) payments.splice(i, 1); return {}; }
        if (/FROM shak_periods WHERE purchase_id/.test(sql)) return periods.find(p => p.purchase_id === args[0]) ?? null;
        if (/^INSERT INTO shak_periods/.test(sql)) {
          if (periods.some(p => p.purchase_id === args[4])) throw unique("shak_periods.purchase_id");
          const [email, plan, starts_at, ends_at, purchase_id] = args;
          periods.push({ id: periods.length + 1, email, plan, starts_at, ends_at, purchase_id, source: "payment" });
          return {};
        }
        if (/FROM editorial_documents WHERE document_path = \?$/.test(sql.trim()) && /^SELECT data_json/.test(sql)) { const t = documents.get(args[0]); return t === undefined ? null : { data_json: t }; }
        if (/FROM shak_authenticators WHERE email/.test(sql)) return auths.get(args[0]) ?? null;
        if (/^INSERT OR REPLACE INTO shak_authenticators/.test(sql)) { const [email, secret_enc, created_at] = args; auths.set(email, { email, secret_enc, confirmed: 0, last_step: 0, fails: 0, fail_start: 0, unlock_until: 0, recovery: "[]", created_at }); return {}; }
        if (/^UPDATE shak_authenticators/.test(sql)) { const [confirmed, last_step, fails, fail_start, unlock_until, recovery, email] = args; Object.assign(auths.get(email), { confirmed, last_step, fails, fail_start, unlock_until, recovery }); return {}; }
        if (/^DELETE FROM shak_authenticators/.test(sql)) { auths.delete(args[0]); return {}; }
        if (/^ALTER TABLE shak_works ADD COLUMN/.test(sql) || /^CREATE TABLE IF NOT EXISTS shak_xuri_lookups/.test(sql)) return {};
        if (/^INSERT INTO shak_xuri_lookups/.test(sql)) { lookups.set(args[0], (lookups.get(args[0]) ?? 0) + 1); return {}; }
        if (/^SELECT n FROM shak_xuri_lookups/.test(sql)) return lookups.has(args[0]) ? { n: lookups.get(args[0]) } : null;
        if (/^DELETE FROM shak_xuri_lookups/.test(sql)) { const suffix = String(args[0]).slice(1); lookups.forEach((_n, k) => { if (!k.endsWith(suffix)) lookups.delete(k); }); return {}; }
        if (/^UPDATE shak_works SET published_at/.test(sql)) { const w = works.find(x => x.id === args[args.length - 1]); if (w) { w.published_at = /= NULL/.test(sql) ? null : args[0]; w.public_name = /= NULL/.test(sql) ? null : args[1]; } return {}; }
        if (/FROM shak_versions v JOIN shak_works w/.test(sql)) {
          const hit = /v\.id = \?/.test(sql) ? versions.find(v => v.id === args[0]) : versions.find(v => v.content_hash === args[0] || v.entry_hash === args[1]);
          const w = hit && works.find(x => x.id === hit.work_id);
          return w && w.published_at != null ? { id: w.id, title: w.title, published_at: w.published_at, public_name: w.public_name ?? null } : null;
        }
        if (/FROM shak_works w WHERE w\.published_at IS NOT NULL AND w\.id = \?/.test(sql)) { const w = works.find(x => x.id === args[0]); return w && w.published_at != null ? { id: w.id, title: w.title, published_at: w.published_at, public_name: w.public_name ?? null } : null; }
        if (/FROM shak_keys WHERE key_id = \?/.test(sql)) return keys.find(k => k.key_id === args[0]) ?? null;
        if (/FROM shak_works WHERE email = \? AND book_id = \?/.test(sql)) return works.find(w => w.email === args[0] && w.book_id === args[1]) ?? null;
        if (/^INSERT OR IGNORE INTO shak_works/.test(sql)) { const [id, email, book_id, title, created_at] = args; if (!works.some(w => w.email === email && w.book_id === book_id)) works.push({ id, email, book_id, title, created_at }); return {}; }
        if (/FROM shak_versions WHERE work_id/.test(sql)) return { results: versions.filter(v => v.work_id === args[0]).sort((a, b) => a.seq - b.seq) };
        if (/^UPDATE shak_versions SET ts_proof/.test(sql)) { const v = versions.find(x => x.id === args[1]); if (v) v.ts_proof = args[0]; return {}; }
        if (/^INSERT INTO shak_versions/.test(sql)) {
          const [id, work_id, seq, content_hash, bytes, prev_hash, entry_hash, note, created_at, signature] = args;
          if (versions.some(v => v.work_id === work_id && v.seq === seq)) throw unique("shak_versions.work_id, shak_versions.seq");
          versions.push({ id, work_id, seq, content_hash, bytes, prev_hash, entry_hash, note, created_at, signature: signature ?? null }); return {};
        }
        if (/FROM shak_keys WHERE email = \? AND revoked_at IS NULL/.test(sql)) return keys.find(k => k.email === args[0] && !k.revoked_at) ?? null;
        if (/FROM shak_keys WHERE email = \? ORDER BY/.test(sql)) return { results: keys.filter(k => k.email === args[0]) };
        if (/^UPDATE shak_keys SET revoked_at/.test(sql)) { keys.filter(k => k.email === args[1] && !k.revoked_at).forEach(k => { k.revoked_at = args[0]; }); return {}; }
        if (/^INSERT INTO shak_keys/.test(sql)) { const [key_id, email, public_key, created_at] = args; keys.push({ key_id, email, public_key, created_at, revoked_at: null }); return {}; }
        if (/^INSERT OR IGNORE INTO shak_signups/.test(sql)) {
          const [email, canon, device, ip_hash, asn, org, country, created_at, trial_granted, reasons] = args;
          if (!signups.some(r => r.email === email)) signups.push({ email, canon, device, ip_hash, asn, org, country, created_at, trial_granted, reasons });
          return {};
        }
        if (/FROM shak_signups WHERE created_at >= \?/.test(sql)) return { results: signups.filter(r => r.created_at >= args[0]) };
        if (/FROM shak_signups WHERE email = \?/.test(sql)) return signups.find(r => r.email === args[0]) ?? null;
        if (/FROM shak_signups ORDER BY/.test(sql)) return { results: sortDesc(signups, "created_at").slice(0, 100) };
        if (/^INSERT INTO shak_audit/.test(sql)) { audit.push({ at: args[0], actor: args[1], action: args[2], detail: JSON.parse(args[3]) }); return {}; }
        return undefined;
      };
      const wrap = (kind: "first" | "all" | "run") => async () => {
        const out = await handle(kind)();
        return out !== undefined ? out : await (inner as any)[kind]();
      };
      return { first: wrap("first"), all: wrap("all"), run: wrap("run") };
    };
    return { ...make([]), bind: (...args: any[]) => make(args) };
  };
  return db;
}
