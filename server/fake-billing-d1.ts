import { fakeDb } from "./fake-d1";

/** D1 de mentira com as tabelas de cobrança (ofertas, pedidos, pagamentos, períodos, auditoria). O resto vem do fakeDb. */
export function fakeBillingDb() {
  const base = fakeDb();
  const offers = new Map<string, any>();
  const purchases: any[] = [];
  const payments: any[] = [];
  const periods: any[] = [];
  const audit: any[] = [];
  const db: any = { ...base, offers, purchases, payments, periods, audit };
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
