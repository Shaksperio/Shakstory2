import { describe, expect, it } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { fakeBillingDb } from "./fake-billing-d1";

const load = async () => (await import(/* @vite-ignore */ new URL("../cloudflare-worker/plans.js", import.meta.url).href)) as any;
const OWNER = "antonyopintor@gmail.com";
const DAY = 86400000;
const URLS = { economico: "https://payment-link-v3.ton.com.br/pl_ECO", premium: "https://payment-link-v3.ton.com.br/pl_PRE", vip: "https://payment-link-v3.ton.com.br/pl_VIP" };
const PRICE = { economico: 34949, premium: 65340, vip: 100795 };

const dnsOk = async (url: string) => { const type = new URL(url).searchParams.get("type"); return new Response(JSON.stringify({ Status: 0, Answer: type === "MX" ? [{ type: 15, data: "10 mx.example.com." }] : [] })); };
const tsGranted = new Uint8Array([0x30, 0x19, 0x30, 0x03, 0x02, 0x01, 0x00, 0x30, 0x12, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02, 0xa0, 0x05, 0x30, 0x03, 0x02, 0x01, 0x00]);
const tsaOk = async () => new Response(tsGranted);
async function send(mod: any, db: any, email: string, path: string, method = "GET", body?: unknown, now = Date.now(), extra: { headers?: Record<string, string>; dnsFetch?: any; tsaFetch?: any } = {}) {
  const r = new Request("https://x" + path, { method, headers: { "Cf-Access-Jwt-Assertion": "jwt", "content-type": "application/json", ...(extra.headers || {}) }, body: body ? JSON.stringify(body) : undefined });
  const out = await mod.shakGate(r, { DB: db, XURI_KEY: "chave-de-teste-xuri-0123456789" }, new URL(r.url), { verify: async () => email, now, dnsFetch: extra.dnsFetch ?? dnsOk, tsaFetch: extra.tsaFetch ?? tsaOk });
  return { out, status: out.response?.status ?? 200, json: out.response ? await out.response.json() : null };
}
const setOffers = async (mod: any, db: any, now = Date.now()) => { for (const plan of ["economico", "premium", "vip"] as const) expect((await send(mod, db, OWNER, "/api/admin/offer", "POST", { plan, priceCents: PRICE[plan], currency: "BRL", checkoutUrl: URLS[plan] }, now)).status).toBe(200); };
const buy = async (mod: any, db: any, email: string, plan: string, now = Date.now()) => (await send(mod, db, email, "/api/billing/purchase", "POST", { plan }, now)).json;
const confirm = (mod: any, db: any, id: string, txId: string, extra: any = {}, now = Date.now()) => send(mod, db, OWNER, "/api/admin/purchase/confirm", "POST", { id, txId, amountCents: extra.amountCents, currency: extra.currency ?? "BRL", ...(extra.mode ? { mode: extra.mode } : {}) }, now);
const me = async (mod: any, db: any, email: string, now = Date.now()) => (await send(mod, db, email, "/api/me", "GET", undefined, now)).json;

describe("ofertas", () => {
  it("sem oferta configurada não há compra; só o dono configura; link precisa ser https da Ton", async () => {
    const mod = await load(); const db = fakeBillingDb();
    const offers = (await send(mod, db, "ana@example.com", "/api/billing/offers")).json;
    expect(offers.offers.every((o: any) => o.available === false)).toBe(true);
    expect((await send(mod, db, "ana@example.com", "/api/billing/purchase", "POST", { plan: "premium" })).status).toBe(409);
    const asUser = await send(mod, db, "ana@example.com", "/api/admin/offer", "POST", { plan: "premium", priceCents: 100, currency: "BRL", checkoutUrl: URLS.premium });
    expect(asUser.status).toBe(403);
    const bad = (checkoutUrl: string, extra: any = {}) => send(mod, db, OWNER, "/api/admin/offer", "POST", { plan: "premium", priceCents: 100, currency: "BRL", checkoutUrl, ...extra });
    expect((await bad("http://payment-link-v3.ton.com.br/x")).status).toBe(400);
    expect((await bad("https://evil.example.com/ton.com.br")).status).toBe(400);
    expect((await bad("https://faketon.com.br/x")).status).toBe(400);
    expect((await bad(URLS.premium, { currency: "USD" })).status).toBe(400);
    expect((await bad(URLS.premium, { priceCents: 0 })).status).toBe(400);
    expect((await bad(URLS.premium, { priceCents: 10.5 })).status).toBe(400);
    expect((await bad(URLS.premium, { plan: "owner" })).status).toBe(400);
    expect((await bad(URLS.premium)).status).toBe(200);
  });

  it("a lista do assinante não revela o link; ele só vem ao criar o pedido, escolhido pelo servidor", async () => {
    const mod = await load(); const db = fakeBillingDb();
    await setOffers(mod, db);
    const list = (await send(mod, db, "ana@example.com", "/api/billing/offers")).json;
    expect(JSON.stringify(list)).not.toContain("payment-link");
    expect(list.offers.find((o: any) => o.plan === "premium")).toMatchObject({ priceCents: 65340, currency: "BRL", available: true });
    expect(list.notice).toContain("mesmo endereço de e-mail cadastrado no Shakstory");
    const bought = await buy(mod, db, "ana@example.com", "premium");
    expect(bought.checkoutUrl).toBe(URLS.premium);
    expect(bought.checkoutUrl).not.toContain("ana@example.com"); // nada da conta na URL
    expect(bought.email).toBe("ana@example.com");
    expect((await send(mod, db, "ana@example.com", "/api/billing/purchase", "POST", { plan: "premium", checkoutUrl: "https://evil.example.com" })).json.checkoutUrl).toBe(URLS.premium);
    expect((await send(mod, db, "ana@example.com", "/api/billing/purchase", "POST", { plan: "owner" })).status).toBe(400);
  });
});

describe("pedido, 'já paguei' e isolamento", () => {
  it("pedido pendente é reaproveitado, tem limite diário e preço novo gera pedido novo", async () => {
    const mod = await load(); const db = fakeBillingDb(); const now = Date.now();
    await setOffers(mod, db, now);
    const first = await buy(mod, db, "ana@example.com", "premium", now);
    expect((await buy(mod, db, "ana@example.com", "premium", now)).purchase.id).toBe(first.purchase.id);
    await send(mod, db, OWNER, "/api/admin/offer", "POST", { plan: "premium", priceCents: 70000, currency: "BRL", checkoutUrl: URLS.premium }, now);
    const repriced = await buy(mod, db, "ana@example.com", "premium", now);
    expect(repriced.purchase.id).not.toBe(first.purchase.id);
    expect(repriced.purchase.priceCents).toBe(70000);
    for (let i = 0; i < 3; i++) { const p = await buy(mod, db, "ana@example.com", "premium", now); await send(mod, db, "ana@example.com", "/api/billing/cancel", "POST", { id: p.purchase.id }, now); }
    const blocked = await send(mod, db, "ana@example.com", "/api/billing/purchase", "POST", { plan: "vip" }, now);
    expect(blocked.status).toBe(429);
    expect((await send(mod, db, "ana@example.com", "/api/billing/purchase", "POST", { plan: "vip" }, now + 2 * DAY)).status).toBe(200);
  });

  it("'Já paguei' só pede conferência: não ativa nada e o texto continua acessível", async () => {
    const mod = await load(); const db = fakeBillingDb(); const t0 = Date.now(); const later = t0 + 10 * DAY;
    await setOffers(mod, db, t0);
    await me(mod, db, "ana@example.com", t0);
    const { purchase } = await buy(mod, db, "ana@example.com", "premium", later);
    const claimed = await send(mod, db, "ana@example.com", "/api/billing/claim", "POST", { id: purchase.id }, later);
    expect(claimed.json.purchase.status).toBe("awaiting_review");
    expect((await send(mod, db, "ana@example.com", "/api/billing/claim", "POST", { id: purchase.id }, later)).status).toBe(200); // repetir é inofensivo
    expect((await me(mod, db, "ana@example.com", later)).plan).toBe("expirado");
    expect((await send(mod, db, "ana@example.com", "/api/assist", "POST", {}, later)).status).toBe(402);
    expect((await send(mod, db, "ana@example.com", "/api/book", "POST", { path: "books/a.json", data: "x" }, later)).out.env).toBeTruthy();
    expect((await send(mod, db, "ana@example.com", "/api/billing/offers", "GET", undefined, later)).json.purchases[0].status).toBe("awaiting_review");
  });

  it("outra conta não vê, reivindica nem cancela pedido alheio; e ninguém além do dono confirma", async () => {
    const mod = await load(); const db = fakeBillingDb();
    await setOffers(mod, db);
    const { purchase } = await buy(mod, db, "ana@example.com", "premium");
    expect((await send(mod, db, "bia@example.com", "/api/billing/claim", "POST", { id: purchase.id })).status).toBe(404);
    expect((await send(mod, db, "bia@example.com", "/api/billing/cancel", "POST", { id: purchase.id })).status).toBe(404);
    expect((await send(mod, db, "bia@example.com", "/api/billing/offers")).json.purchases).toHaveLength(0);
    for (const path of ["/api/admin/purchase/confirm", "/api/admin/purchase/status", "/api/admin/offer"]) expect((await send(mod, db, "bia@example.com", path, "POST", { id: purchase.id, txId: "TX-12345", amountCents: 65340, currency: "BRL" })).status).toBe(403);
    expect((await send(mod, db, "bia@example.com", "/api/admin/billing")).status).toBe(403);
    expect((await send(mod, db, OWNER, "/api/billing/offers")).status).toBe(400);
    expect((await me(mod, db, "ana@example.com")).plan).not.toBe("premium");
  });
});

describe("confirmação pelo administrador", () => {
  it("pagamento conferido ativa 12 meses de calendário e libera os direitos do plano", async () => {
    const mod = await load(); const db = fakeBillingDb(); const t0 = Date.parse("2026-10-19T12:00:00Z"); const later = t0 + 10 * DAY;
    await setOffers(mod, db, t0);
    await me(mod, db, "ana@example.com", t0);
    const { purchase } = await buy(mod, db, "ana@example.com", "premium", later);
    const done = await confirm(mod, db, purchase.id, "TON-0001", { amountCents: 65340 }, later);
    expect(done.status).toBe(200);
    expect(done.json.endsAt).toBe(new Date(mod.shakAddMonths(later, 12)).toISOString());
    const info = await me(mod, db, "ana@example.com", later);
    expect(info).toMatchObject({ plan: "premium", paidUntil: done.json.endsAt });
    expect(info.entitlements["cowila.chat"]).toBe(true);
    expect((await send(mod, db, "ana@example.com", "/api/assist", "POST", {}, later)).out.env).toBeTruthy();
    const actions = db.audit.map((a: any) => a.action);
    for (const action of ["offer.set", "purchase.create", "purchase.confirm"]) expect(actions.includes(action)).toBe(true);
  });

  it("repetir a mesma confirmação é idempotente; a mesma transação em outro pedido não libera outro usuário", async () => {
    const mod = await load(); const db = fakeBillingDb();
    await setOffers(mod, db);
    const a = (await buy(mod, db, "ana@example.com", "premium")).purchase;
    const b = (await buy(mod, db, "bia@example.com", "premium")).purchase;
    expect((await confirm(mod, db, a.id, "TON-0001", { amountCents: 65340 })).status).toBe(200);
    const again = await confirm(mod, db, a.id, "TON-0001", { amountCents: 65340 });
    expect(again.status).toBe(200); expect(again.json.idempotent).toBe(true);
    expect(db.periods).toHaveLength(1);
    const reuse = await confirm(mod, db, b.id, "TON-0001", { amountCents: 65340 });
    expect(reuse.status).toBe(409); expect(reuse.json.error).toBe("duplicate_transaction");
    expect((await me(mod, db, "bia@example.com")).plan).not.toBe("premium");
    expect(db.periods).toHaveLength(1);
    expect((await confirm(mod, db, a.id, "TON-0002", { amountCents: 65340 })).json.error).toBe("already_confirmed");
  });

  it("valor ou moeda diferentes vão para revisão e não ativam nada", async () => {
    const mod = await load(); const db = fakeBillingDb();
    await setOffers(mod, db);
    const { purchase } = await buy(mod, db, "ana@example.com", "premium");
    const wrong = await confirm(mod, db, purchase.id, "TON-0001", { amountCents: 65000 });
    expect(wrong.status).toBe(409); expect(wrong.json.error).toBe("amount_mismatch");
    expect((await confirm(mod, db, purchase.id, "TON-0002", { amountCents: 65340, currency: "USD" })).json.error).toBe("amount_mismatch");
    expect(db.purchases[0].status).toBe("needs_review");
    expect(db.payments).toHaveLength(0); expect(db.periods).toHaveLength(0);
    expect((await me(mod, db, "ana@example.com")).plan).not.toBe("premium");
    expect((await confirm(mod, db, purchase.id, "TON-0003", { amountCents: 65340 })).status).toBe(200); // depois de conferido, o administrador pode confirmar
    expect((await confirm(mod, db, purchase.id, "x", { amountCents: 65340 })).status).toBe(400);
  });

  it("renovar o mesmo plano antes do vencimento acumula; nunca reduz dias já pagos", async () => {
    const mod = await load(); const db = fakeBillingDb(); const t0 = Date.parse("2026-01-31T12:00:00Z");
    await setOffers(mod, db, t0);
    const first = (await buy(mod, db, "ana@example.com", "premium", t0)).purchase;
    const one = await confirm(mod, db, first.id, "TON-0001", { amountCents: 65340 }, t0);
    const t1 = t0 + 100 * DAY;
    const second = (await buy(mod, db, "ana@example.com", "premium", t1)).purchase;
    const two = await confirm(mod, db, second.id, "TON-0002", { amountCents: 65340 }, t1);
    expect(two.json.startsAt).toBe(one.json.endsAt);
    expect(two.json.endsAt).toBe(new Date(mod.shakAddMonths(Date.parse(one.json.endsAt), 12)).toISOString());
    expect((await me(mod, db, "ana@example.com", t1)).paidUntil).toBe(two.json.endsAt);
    // depois do vencimento, recomeça do dia do pagamento
    const t2 = Date.parse(two.json.endsAt) + 5 * DAY;
    const third = (await buy(mod, db, "ana@example.com", "premium", t2)).purchase;
    expect((await confirm(mod, db, third.id, "TON-0003", { amountCents: 65340 }, t2)).json.startsAt).toBe(new Date(t2).toISOString());
  });

  it("troca de plano com outro plano pago vigente exige revisão ou 'replace' explícito", async () => {
    const mod = await load(); const db = fakeBillingDb();
    await setOffers(mod, db);
    const eco = (await buy(mod, db, "ana@example.com", "economico")).purchase;
    await confirm(mod, db, eco.id, "TON-0001", { amountCents: 34949 });
    const vip = (await buy(mod, db, "ana@example.com", "vip")).purchase;
    const held = await confirm(mod, db, vip.id, "TON-0002", { amountCents: 100795 });
    expect(held.json.error).toBe("plan_change");
    expect((await me(mod, db, "ana@example.com")).plan).toBe("economico");
    expect((await confirm(mod, db, vip.id, "TON-0002", { amountCents: 100795, mode: "replace" })).status).toBe(200);
    expect((await me(mod, db, "ana@example.com")).plan).toBe("vip");
  });

  it("confirmações simultâneas do mesmo pedido geram um único período", async () => {
    const mod = await load(); const db = fakeBillingDb();
    await setOffers(mod, db);
    const { purchase } = await buy(mod, db, "ana@example.com", "premium");
    const results = await Promise.all([confirm(mod, db, purchase.id, "TON-0001", { amountCents: 65340 }), confirm(mod, db, purchase.id, "TON-0002", { amountCents: 65340 }), confirm(mod, db, purchase.id, "TON-0001", { amountCents: 65340 })]);
    expect(db.periods).toHaveLength(1);
    expect(db.payments).toHaveLength(1);
    expect(results.filter(r => r.status === 200).length).toBeGreaterThanOrEqual(1);
    expect(results.filter(r => r.status === 409).every(r => ["already_confirmed", "duplicate_transaction"].includes(r.json.error))).toBe(true);
  });

  it("pedido rejeitado ou cancelado não pode ser confirmado; revisão manual não ativa", async () => {
    const mod = await load(); const db = fakeBillingDb();
    await setOffers(mod, db);
    const { purchase } = await buy(mod, db, "ana@example.com", "premium");
    expect((await send(mod, db, OWNER, "/api/admin/purchase/status", "POST", { id: purchase.id, status: "needs_review", note: "e-mail diferente" })).status).toBe(200);
    expect((await me(mod, db, "ana@example.com")).plan).not.toBe("premium");
    expect((await send(mod, db, OWNER, "/api/admin/purchase/status", "POST", { id: purchase.id, status: "rejected" })).status).toBe(200);
    expect((await confirm(mod, db, purchase.id, "TON-0001", { amountCents: 65340 })).json.error).toBe("invalid_state");
    expect((await send(mod, db, OWNER, "/api/admin/purchase/status", "POST", { id: purchase.id, status: "confirmed" })).status).toBe(400);
  });

  it("painel do administrador lista pendências e ofertas com o link", async () => {
    const mod = await load(); const db = fakeBillingDb();
    await setOffers(mod, db);
    const { purchase } = await buy(mod, db, "ana@example.com", "premium");
    await send(mod, db, "ana@example.com", "/api/billing/claim", "POST", { id: purchase.id });
    const panel = (await send(mod, db, OWNER, "/api/admin/billing")).json;
    expect(panel.open[0]).toMatchObject({ id: purchase.id, email: "ana@example.com", status: "awaiting_review" });
    expect(panel.offers.find((o: any) => o.plan === "premium").checkoutUrl).toBe(URLS.premium);
  });
});

describe("meses de calendário e cortesias", () => {
  it("soma meses sem estourar o fim do mês", async () => {
    const mod = await load();
    const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    expect(iso(mod.shakAddMonths(Date.parse("2026-01-31T00:00:00Z"), 1))).toBe("2026-02-28");
    expect(iso(mod.shakAddMonths(Date.parse("2028-02-29T00:00:00Z"), 12))).toBe("2029-02-28");
    expect(iso(mod.shakAddMonths(Date.parse("2026-10-19T00:00:00Z"), 12))).toBe("2027-10-19");
    expect(iso(mod.shakAddMonths(Date.parse("2026-11-30T00:00:00Z"), 3))).toBe("2027-02-28");
  });

  it("cortesia do administrador no mesmo plano mantém o vencimento original", async () => {
    const mod = await load(); const db = fakeBillingDb(); const t0 = Date.now();
    await setOffers(mod, db, t0);
    const { purchase } = await buy(mod, db, "ana@example.com", "premium", t0);
    const paid = await confirm(mod, db, purchase.id, "TON-0001", { amountCents: 65340 }, t0);
    const courtesy = await send(mod, db, OWNER, "/api/admin/plan", "POST", { email: "ana@example.com", plan: "premium", days: 30 }, t0);
    expect(courtesy.status).toBe(200);
    expect(Date.parse(courtesy.json.user.paidUntil)).toBe(Date.parse(paid.json.endsAt));
    expect(db.audit.some((a: any) => a.action === "plan.courtesy")).toBe(true);
  });
});

describe("catálogo público do Worker", () => {
  it("/api/public/plans devolve as ofertas salvas (preço e link Ton), mesmo sem login", async () => {
    const mod = await load(); const db = fakeBillingDb();
    await setOffers(mod, db);
    const r = new Request("https://x/api/public/plans");
    const out = await mod.shakGate(r, { DB: db }, new URL(r.url), {});
    expect(out.response.status).toBe(200);
    const body = await out.response.json();
    expect(body.offers.map((o: any) => o.plan).sort()).toEqual(["economico", "premium", "vip"]);
    expect(body.offers.find((o: any) => o.plan === "premium")).toMatchObject({ plan: "premium", priceCents: PRICE.premium, checkoutUrl: URLS.premium });
  });
});

describe("Stripe: checkout e webhook assinado", () => {
  const SECRET = "whsec_test_segredo";
  const sign = (raw: string, t: number, secret = SECRET) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}`;
  const env = (db: any, extra: any = {}) => ({ DB: db, STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: SECRET, ...extra });
  const checkout = async (mod: any, db: any, email: string, plan: string, fetchFn: any, now = Date.now(), e: any = env(db)) => {
    const r = new Request("https://app.example/api/billing/stripe/checkout", { method: "POST", headers: { "Cf-Access-Jwt-Assertion": "jwt", "content-type": "application/json" }, body: JSON.stringify({ plan }) });
    const out = await mod.shakGate(r, e, new URL(r.url), { verify: async () => email, now, fetch: fetchFn });
    return { status: out.response.status, json: await out.response.json() };
  };
  const hook = async (mod: any, db: any, event: any, opts: { now?: number; header?: string; secret?: string } = {}) => {
    const raw = JSON.stringify(event); const now = opts.now ?? Date.now();
    const r = new Request("https://app.example/api/public/stripe-webhook", { method: "POST", headers: { "stripe-signature": opts.header ?? sign(raw, Math.floor(now / 1000), opts.secret) }, body: raw });
    const out = await mod.shakGate(r, env(db), new URL(r.url), { now });
    return { status: out.response.status, json: await out.response.json() };
  };
  const paid = (purchaseId: string, extra: any = {}) => ({ id: "evt_" + Math.random().toString(36).slice(2), type: "checkout.session.completed", data: { object: { object: "checkout.session", id: "cs_test_1", client_reference_id: purchaseId, payment_status: "paid", payment_intent: "pi_test_123", amount_total: PRICE.premium, currency: "brl", ...extra } } });
  const setup = async () => { const mod = await load(); const db = fakeBillingDb(); await setOffers(mod, db); return { mod, db }; };

  it("cria a sessão com o preço do servidor (cartão e Pix), sem ativar nada", async () => {
    const { mod, db } = await setup();
    let sent: URLSearchParams | null = null; let headers: any = null;
    const fetchFn = async (_url: string, init: any) => { sent = new URLSearchParams(init.body); headers = init.headers; return new Response(JSON.stringify({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" }), { status: 200, headers: { "content-type": "application/json" } }); };
    const out = await checkout(mod, db, "ana@example.com", "premium", fetchFn);
    expect(out.status).toBe(200);
    expect(out.json.url).toBe("https://checkout.stripe.com/c/pay/cs_test_1");
    expect(sent!.get("line_items[0][price_data][unit_amount]")).toBe(String(PRICE.premium));
    expect(sent!.get("line_items[0][price_data][currency]")).toBe("brl");
    expect(sent!.get("payment_method_types[1]")).toBe("pix");
    expect(sent!.get("client_reference_id")).toBe(out.json.purchase.id);
    expect(sent!.get("success_url")).toBe("https://app.example/?pagamento=ok");
    expect(headers.authorization).toBe("Bearer sk_test_x");
    expect((await me(mod, db, "ana@example.com")).plan).toBe("trial");
  });

  it("sem chave da Stripe o checkout responde 503; falha da Stripe vira 502 sem vazar detalhe", async () => {
    const { mod, db } = await setup();
    expect((await checkout(mod, db, "ana@example.com", "premium", async () => new Response("{}"), Date.now(), { DB: db })).status).toBe(503);
    const bad = await checkout(mod, db, "ana@example.com", "premium", async () => new Response(JSON.stringify({ error: { code: "x", message: "segredo interno" } }), { status: 400, headers: { "content-type": "application/json" } }));
    expect(bad.status).toBe(502);
    expect(JSON.stringify(bad.json)).not.toContain("segredo interno");
  });

  it("webhook assinado e pago ativa 12 meses; repetir o evento não soma outro período", async () => {
    const { mod, db } = await setup();
    const buyer = await buy(mod, db, "ana@example.com", "premium");
    const first = await hook(mod, db, paid(buyer.purchase.id));
    expect(first.status).toBe(200);
    const plan = await me(mod, db, "ana@example.com");
    expect(plan.plan).toBe("premium");
    const until = plan.paidUntil;
    expect((await hook(mod, db, paid(buyer.purchase.id))).status).toBe(200);
    expect((await me(mod, db, "ana@example.com")).paidUntil).toBe(until);
    const admin = (await send(mod, db, OWNER, "/api/admin/billing")).json;
    expect(admin.payments.filter((p: any) => p.provider === "stripe").length).toBe(1);
  });

  it("assinatura inválida, segredo errado ou carimbo velho: 400 e nada é ativado", async () => {
    const { mod, db } = await setup();
    const buyer = await buy(mod, db, "ana@example.com", "premium");
    const ev = paid(buyer.purchase.id);
    expect((await hook(mod, db, ev, { header: "t=1,v1=abc" })).status).toBe(400);
    expect((await hook(mod, db, ev, { secret: "whsec_outro" })).status).toBe(400);
    const now = Date.now();
    expect((await hook(mod, db, ev, { now, header: sign(JSON.stringify(ev), Math.floor(now / 1000) - 3600) })).status).toBe(400);
    expect((await me(mod, db, "ana@example.com")).plan).toBe("trial");
  });

  it("não ativa quando o pagamento ainda não foi confirmado, quando o valor difere ou quando o pedido não existe", async () => {
    const { mod, db } = await setup();
    const buyer = await buy(mod, db, "ana@example.com", "premium");
    expect((await hook(mod, db, paid(buyer.purchase.id, { payment_status: "unpaid" }))).json.pending).toBe(true);
    expect((await me(mod, db, "ana@example.com")).plan).toBe("trial");
    await hook(mod, db, paid(buyer.purchase.id, { amount_total: 100 }));
    expect((await me(mod, db, "ana@example.com")).plan).toBe("trial");
    const admin = (await send(mod, db, OWNER, "/api/admin/billing")).json;
    expect(admin.open.find((p: any) => p.id === buyer.purchase.id).status).toBe("needs_review");
    expect((await hook(mod, db, paid("nao-existe"))).json.unmatched).toBe(true);
  });

  it("pagamento depois de cancelar o pedido vai para revisão, não ativa sozinho", async () => {
    const { mod, db } = await setup();
    const buyer = await buy(mod, db, "ana@example.com", "premium");
    await send(mod, db, "ana@example.com", "/api/billing/cancel", "POST", { id: buyer.purchase.id });
    expect((await hook(mod, db, paid(buyer.purchase.id))).json.review).toBe(true);
    expect((await me(mod, db, "ana@example.com")).plan).toBe("trial");
  });

  it("oferta pode ser salva só com preço (sem link da Ton) e a rota pública informa se o Stripe está ligado", async () => {
    const { mod, db } = await setup();
    expect((await send(mod, db, OWNER, "/api/admin/offer", "POST", { plan: "vip", priceCents: 100795, currency: "BRL", checkoutUrl: "" })).status).toBe(200);
    const r = new Request("https://x/api/public/plans");
    const out = await mod.shakGate(r, env(db), new URL(r.url), {});
    const body = await out.response.json();
    expect(body.stripe).toBe(true);
    expect(body.offers.find((o: any) => o.plan === "vip")).toEqual({ plan: "vip", label: "VIP", available: true, priceCents: 100795, currency: "BRL" });
  });

  it("catálogo público: lista os três planos; sem oferta fica indisponível e sem preço", async () => {
    const mod = await load(); const db = fakeBillingDb();
    await send(mod, db, OWNER, "/api/admin/offer", "POST", { plan: "premium", priceCents: PRICE.premium, currency: "BRL", checkoutUrl: "" });
    const r = new Request("https://x/api/public/plans");
    const body = await (await mod.shakGate(r, env(db), new URL(r.url), {})).response.json();
    expect(body.offers.map((o: any) => o.plan)).toEqual(["economico", "premium", "vip"]);
    expect(body.offers.find((o: any) => o.plan === "premium")).toMatchObject({ available: true, priceCents: PRICE.premium });
    const eco = body.offers.find((o: any) => o.plan === "economico");
    expect(eco.available).toBe(false);
    expect("priceCents" in eco).toBe(false);
  });

  it("catálogo público: com a Stripe desligada nada fica disponível, mas preço e link da Ton são preservados", async () => {
    const mod = await load(); const db = fakeBillingDb();
    await setOffers(mod, db);
    const r = new Request("https://x/api/public/plans");
    const body = await (await mod.shakGate(r, { DB: db }, new URL(r.url), {})).response.json();
    expect(body.stripe).toBe(false);
    expect(body.offers.every((o: any) => o.available === false)).toBe(true);
    expect(body.offers.find((o: any) => o.plan === "vip")).toMatchObject({ priceCents: PRICE.vip, checkoutUrl: URLS.vip });
  });

  it("o administrador gera o link de pagamento de uma conta; usuário comum não pode; o plano só ativa pelo webhook", async () => {
    const { mod, db } = await setup();
    let sent: URLSearchParams | null = null;
    const fetchFn = async (_u: string, init: any) => { sent = new URLSearchParams(init.body); return new Response(JSON.stringify({ id: "cs_test_9", url: "https://checkout.stripe.com/c/pay/cs_test_9" }), { status: 200, headers: { "content-type": "application/json" } }); };
    const adminLink = async (email: string, target: string, plan = "premium") => {
      const r = new Request("https://app.example/api/admin/stripe/link", { method: "POST", headers: { "Cf-Access-Jwt-Assertion": "jwt", "content-type": "application/json" }, body: JSON.stringify({ email: target, plan }) });
      const out = await mod.shakGate(r, env(db), new URL(r.url), { verify: async () => email, fetch: fetchFn });
      return { status: out.response.status, json: await out.response.json() };
    };
    const ok = await adminLink(OWNER, "Cliente@Example.com");
    expect(ok.status).toBe(200);
    expect(ok.json.url).toContain("checkout.stripe.com");
    expect(sent!.get("customer_email")).toBe("cliente@example.com");
    expect((await me(mod, db, "cliente@example.com")).plan).toBe("trial");
    expect((await adminLink("ana@example.com", "cliente@example.com")).status).toBe(403);
    expect((await adminLink(OWNER, "sem-arroba")).status).toBe(400);
  });

  it("cortesia do administrador em outro plano não encurta um período pago vigente", async () => {
    const mod = await load(); const db = fakeBillingDb(); const now = Date.now();
    await setOffers(mod, db, now);
    const buyer = await buy(mod, db, "ana@example.com", "premium", now);
    expect((await confirm(mod, db, buyer.purchase.id, "tx-cortesia-1", { amountCents: PRICE.premium }, now)).status).toBe(200);
    const paidUntil = (await me(mod, db, "ana@example.com", now)).paidUntil;
    const give = (plan: string, days = 30) => send(mod, db, OWNER, "/api/admin/plan", "POST", { email: "ana@example.com", plan, days }, now);
    expect((await give("economico")).status).toBe(200);
    const after = await me(mod, db, "ana@example.com", now);
    expect(after.plan).toBe("economico");
    expect(after.paidUntil).toBe(paidUntil);
    expect((await give("economico", 10)).status).toBe(200);
    expect((await me(mod, db, "ana@example.com", now)).paidUntil).toBe(paidUntil);
    const fresh = await send(mod, db, OWNER, "/api/admin/plan", "POST", { email: "bia@example.com", plan: "vip", days: 30 }, now);
    expect(fresh.status).toBe(200);
    expect((await me(mod, db, "bia@example.com", now)).paidUntil).toBe(new Date(now + 30 * DAY).toISOString());
  });
});

describe("proteção do teste grátis", () => {
  const T0 = Date.UTC(2026, 9, 22, 12);
  const login = (mod: any, db: any, email: string, extra: any = {}, now = T0) => send(mod, db, email, "/api/me", "GET", undefined, now, extra);
  const cookieOf = (out: any) => /shak_dev=([A-Za-z0-9_-]+)/.exec(out.out.response.headers.get("set-cookie") || "")?.[1];
  const ip = (n: string) => ({ headers: { "CF-Connecting-IP": n } });

  it("conta nova normal recebe o teste e o cookie do aparelho", async () => {
    const mod = await load(); const db = fakeBillingDb();
    const r = await login(mod, db, "ana@example.com", ip("203.0.113.1"));
    expect(r.json.plan).toBe("trial"); expect(r.json.trialDenied).toBeNull();
    expect(cookieOf(r)).toBeTruthy();
    expect(db.signups[0].ip_hash).not.toContain("203.0.113");
  });

  it("e-mail com ponto ou +tag do mesmo gmail não ganha outro teste", async () => {
    const mod = await load(); const db = fakeBillingDb();
    await login(mod, db, "ana.silva@gmail.com", ip("203.0.113.1"));
    const r = await login(mod, db, "anasilva+teste@gmail.com", ip("203.0.113.9"));
    expect(r.json.plan).toBe("expirado");
    expect(r.json.trialDenied.reasons.join(" ")).toContain("mesmo e-mail");
    expect(db.audit.some((a: any) => a.action === "signup.trial_denied")).toBe(true);
  });

  it("mesmo aparelho (cookie) ou rede repetida perdem o teste a partir da conta seguinte", async () => {
    const mod = await load(); const db = fakeBillingDb();
    const a = await login(mod, db, "um@example.com", ip("198.51.100.5"));
    const dev = cookieOf(a);
    const b = await login(mod, db, "dois@example.com", { headers: { "CF-Connecting-IP": "198.51.100.77", cookie: "shak_dev=" + dev } });
    expect(b.json.plan).toBe("expirado");
    expect(b.json.trialDenied.reasons.join(" ")).toContain("aparelho");
    // rede compartilhada: sozinha, só nega a partir da 5ª conta (4 já com teste) de teste em 30 dias
    for (const n of ["tres", "quatro", "cinco"]) expect((await login(mod, db, n + "@example.com", ip("198.51.100.5"))).json.plan).toBe("trial");
    const d = await login(mod, db, "seis@example.com", ip("198.51.100.5"));
    expect(d.json.plan).toBe("expirado");
    expect(d.json.trialDenied.reasons.join(" ")).toContain("rede");
  });

  it("VPN sozinha só é registrada; VPN somada a outro sinal tira o teste; descartável e domínio sem e-mail negam", async () => {
    const mod = await load(); const db = fakeBillingDb();
    const viaVpn = async (email: string, headers: Record<string, string> = {}) => {
      const vpn = new Request("https://x/api/me", { headers: { "Cf-Access-Jwt-Assertion": "jwt", ...headers } });
      Object.defineProperty(vpn, "cf", { value: { asOrganization: "M247 Europe SRL", asn: 9009 } });
      const out = await mod.shakGate(vpn, { DB: db }, new URL(vpn.url), { verify: async () => email, now: T0, dnsFetch: dnsOk });
      return out.response.json();
    };
    expect((await viaVpn("vpn@example.com", { "CF-Connecting-IP": "192.0.2.10" })).plan).toBe("trial");
    expect(db.signups.find((r: any) => r.email === "vpn@example.com").reasons).toBe("vpn_ou_hospedagem");
    expect(db.audit.some((a: any) => a.action === "signup.signal")).toBe(true);
    await viaVpn("vpn2@example.com", { "CF-Connecting-IP": "192.0.2.10" });
    expect((await viaVpn("vpn3@example.com", { "CF-Connecting-IP": "192.0.2.10" })).plan).toBe("expirado"); // VPN + rede repetida
    expect((await login(mod, db, "x@mailinator.com")).json.plan).toBe("expirado");
    const nx = async () => new Response(JSON.stringify({ Status: 3 }));
    const r = await login(mod, db, "y@naoexiste.example", { dnsFetch: nx });
    expect(r.json.plan).toBe("expirado"); expect(r.json.trialDenied.reasons.join(" ")).toContain("servidor de e-mail");
  });

  it("falha de rede na consulta DNS não pune: o teste é concedido", async () => {
    const mod = await load(); const db = fakeBillingDb();
    const boom = async () => { throw new Error("rede"); };
    expect((await login(mod, db, "ok@example.com", { dnsFetch: boom })).json.plan).toBe("trial");
  });

  it("o administrador vê os cadastros e libera o teste; dono e conta já existente não passam pela checagem", async () => {
    const mod = await load(); const db = fakeBillingDb();
    await login(mod, db, "a@mailinator.com");
    expect((await send(mod, db, "ana@example.com", "/api/admin/signups")).status).toBe(403);
    const list = (await send(mod, db, OWNER, "/api/admin/signups")).json;
    expect(list.signups.find((x: any) => x.email === "a@mailinator.com")).toMatchObject({ trialGranted: false });
    const rel = await send(mod, db, OWNER, "/api/admin/plan", "POST", { email: "a@mailinator.com", plan: "trial" }, T0);
    expect(rel.json.user.plan).toBe("trial");
    expect(db.signups.some((r: any) => r.email === OWNER)).toBe(false);
  });
});

describe("autoria e procedência (TOTP + histórico encadeado)", () => {
  const T0 = Date.UTC(2026, 9, 23, 12);
  const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const decode = (text: string) => { let bits = 0, value = 0; const out: number[] = []; for (const ch of text) { value = (value << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); };
  const code = (secret: string, at: number) => {
    const step = Math.floor(at / 30000); const msg = Buffer.alloc(8); msg.writeUInt32BE(Math.floor(step / 4294967296), 0); msg.writeUInt32BE(step >>> 0, 4);
    const mac = createHmac("sha1", decode(secret)).update(msg).digest(); const o = mac[19] & 15;
    return String((((mac[o] & 127) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3]) % 1000000).padStart(6, "0");
  };
  const api = (mod: any, db: any, email: string, path: string, body?: unknown, now = T0, extra: any = {}) => send(mod, db, email, "/api/xuri/" + path, body === undefined ? "GET" : "POST", body, now, extra);
  const setup = async (mod: any, db: any, email = OWNER, now = T0) => {
    const enrolled = (await api(mod, db, email, "totp/enroll", {}, now)).json;
    const confirmed = await api(mod, db, email, "totp/confirm", { code: code(enrolled.secret, now) }, now);
    return { secret: enrolled.secret as string, confirmed };
  };
  const putLibrary = (db: any, email: string, books: any[]) => {
    const prefix = email === OWNER ? "" : "u/" + createHash("sha256").update(email).digest("hex").slice(0, 24) + "/";
    db.documents.set(prefix + "library.json", JSON.stringify({ books }));
  };

  it("sem a chave do servidor a proteção avisa que não está ativa", async () => {
    const mod = await load(); const db = fakeBillingDb();
    const r = new Request("https://x/api/xuri/totp/enroll", { method: "POST", headers: { "Cf-Access-Jwt-Assertion": "jwt" }, body: "{}" });
    const out = await mod.shakGate(r, { DB: db }, new URL(r.url), { verify: async () => OWNER, now: T0, dnsFetch: dnsOk });
    expect(out.response.status).toBe(503);
  });

  it("cadastra o autenticador: código errado falha, certo confirma e entrega 8 códigos de recuperação", async () => {
    const mod = await load(); const db = fakeBillingDb();
    const enrolled = (await api(mod, db, OWNER, "totp/enroll", {})).json;
    expect(enrolled.otpauthUrl).toContain("otpauth://totp/Shakstory:");
    expect(db.auths.get(OWNER).secret_enc).not.toContain(enrolled.secret); // segredo cifrado no banco
    expect((await api(mod, db, OWNER, "totp/confirm", { code: "000000" })).status).toBe(400);
    const ok = await api(mod, db, OWNER, "totp/confirm", { code: code(enrolled.secret, T0) });
    expect(ok.status).toBe(200);
    expect(ok.json.recoveryCodes).toHaveLength(8);
    expect(JSON.stringify(db.auths.get(OWNER))).not.toContain(ok.json.recoveryCodes[0]); // só o hash é guardado
    expect((await api(mod, db, OWNER, "totp/enroll", {})).status).toBe(409);
  });

  it("um código só vale uma vez e depois de 5 erros a conta é travada por alguns minutos", async () => {
    const mod = await load(); const db = fakeBillingDb();
    const { secret } = await setup(mod, db);
    expect((await api(mod, db, OWNER, "unlock", { code: code(secret, T0) })).status).toBe(400); // mesmo passo já usado na confirmação
    expect((await api(mod, db, OWNER, "unlock", { code: code(secret, T0 + 30000) }, T0 + 30000)).status).toBe(200);
    for (let i = 0; i < 5; i++) expect((await api(mod, db, OWNER, "unlock", { code: "111111" }, T0 + 60000)).status).toBe(400);
    expect((await api(mod, db, OWNER, "unlock", { code: code(secret, T0 + 90000) }, T0 + 90000)).status).toBe(429);
    expect((await api(mod, db, OWNER, "unlock", { code: code(secret, T0 + 11 * 60000) }, T0 + 11 * 60000)).status).toBe(200);
  });

  it("código de recuperação destrava uma única vez", async () => {
    const mod = await load(); const db = fakeBillingDb();
    const { confirmed } = await setup(mod, db);
    const rec = confirmed.json.recoveryCodes[0];
    expect((await api(mod, db, OWNER, "unlock", { code: rec }, T0 + 1000)).status).toBe(200);
    expect((await api(mod, db, OWNER, "unlock", { code: rec }, T0 + 2000)).status).toBe(400);
    expect((await api(mod, db, OWNER, "status")).json.recoveryLeft).toBe(7);
  });

  it("registrar exige autenticador e janela aberta; o hash vem do servidor e a cadeia detecta adulteração", async () => {
    const mod = await load(); const db = fakeBillingDb();
    putLibrary(db, OWNER, [{ id: "b1", title: "Meu livro", nodes: [{ id: "n1", content: "Era uma vez" }], updatedAt: 1 }]);
    expect((await api(mod, db, OWNER, "register", { bookId: "b1" })).status).toBe(428);
    const { secret } = await setup(mod, db);
    expect((await api(mod, db, OWNER, "register", { bookId: "b1" }, T0 + 20 * 60000)).status).toBe(423); // janela de 15 min fechou
    expect((await api(mod, db, OWNER, "register", { bookId: "inexistente" })).status).toBe(404);
    expect((await api(mod, db, OWNER, "register", { bookId: "../x" })).status).toBe(400);
    const first = (await api(mod, db, OWNER, "register", { bookId: "b1", note: "primeira" })).json;
    expect(first).toMatchObject({ ok: true, seq: 1 });
    expect((await api(mod, db, OWNER, "register", { bookId: "b1", hash: "forjado" })).json.unchanged).toBe(true);
    putLibrary(db, OWNER, [{ id: "b1", title: "Meu livro", nodes: [{ id: "n1", content: "Era uma vez outra" }], updatedAt: 2 }]);
    let h = (await api(mod, db, OWNER, "history?bookId=b1")).json;
    expect(h.matchesCurrent).toBe(false);
    const second = (await api(mod, db, OWNER, "register", { bookId: "b1" }, T0 + 5000)).json;
    expect(second.seq).toBe(2);
    h = (await api(mod, db, OWNER, "history?bookId=b1", undefined, T0 + 5000)).json;
    expect(h.versions).toHaveLength(2); expect(h.chain.valid).toBe(true); expect(h.matchesCurrent).toBe(true);
    db.versions[0].content_hash = "f".repeat(64);
    expect((await api(mod, db, OWNER, "history?bookId=b1")).json.chain).toEqual({ valid: false, brokenAt: 1 });
    expect(secret).toBeTruthy();
  });

  it("carimbo de tempo externo (RFC 3161): pedido correto, falha não impede o registro e dá para repetir", async () => {
    const mod = await load(); const db = fakeBillingDb();
    putLibrary(db, OWNER, [{ id: "b1", title: "Livro", nodes: [{ id: "n", content: "texto" }], updatedAt: 1 }]);
    await setup(mod, db);
    let sent: Uint8Array | null = null;
    const spy = async (_url: string, init: any) => { sent = new Uint8Array(init.body); return new Response(tsGranted); };
    const ok = (await api(mod, db, OWNER, "register", { bookId: "b1" }, T0, { tsaFetch: spy })).json;
    expect(ok.stamped).toBe(true);
    const hex = Buffer.from(sent!).toString("hex");
    expect(hex.startsWith("3039020101303130" + "0d06096086480165030402010500" + "0420")).toBe(true);
    expect(hex).toContain(ok.entryHash); expect(sent!.length).toBe(59);
    // autoridade recusa (status 2) ou cai: registra mesmo assim, sem carimbo
    putLibrary(db, OWNER, [{ id: "b1", title: "Livro", nodes: [{ id: "n", content: "texto 2" }], updatedAt: 2 }]);
    const refused = async () => new Response(new Uint8Array([0x30, 0x47, 0x30, 0x03, 0x02, 0x01, 0x02, 0x30, 0x40, ...new Array(64).fill(7)]));
    const second = (await api(mod, db, OWNER, "register", { bookId: "b1" }, T0 + 1000, { tsaFetch: refused })).json;
    expect(second).toMatchObject({ ok: true, seq: 2, stamped: false });
    putLibrary(db, OWNER, [{ id: "b1", title: "Livro", nodes: [{ id: "n", content: "texto 3" }], updatedAt: 3 }]);
    const down = async () => { throw new Error("fora do ar"); };
    expect((await api(mod, db, OWNER, "register", { bookId: "b1" }, T0 + 2000, { tsaFetch: down })).json).toMatchObject({ seq: 3, stamped: false });
    const retry = (await api(mod, db, OWNER, "stamp", { bookId: "b1" }, T0 + 3000)).json;
    expect(retry).toMatchObject({ stamped: 2, pending: 0 });
    const history = (await api(mod, db, OWNER, "history?bookId=b1")).json;
    expect(history.versions.every((v: any) => v.stamped)).toBe(true);
  });

  it("dossiê: entryPayload recalcula o entryHash e traz o token do carimbo", async () => {
    const mod = await load(); const db = fakeBillingDb();
    putLibrary(db, OWNER, [{ id: "b1", title: "Livro", nodes: [], updatedAt: 1 }]);
    await setup(mod, db);
    await api(mod, db, OWNER, "register", { bookId: "b1", note: "v1" });
    const dossier = (await api(mod, db, OWNER, "dossier?bookId=b1")).json;
    expect(dossier.chain.valid).toBe(true); expect(dossier.howToVerify.length).toBeGreaterThan(2);
    const v = dossier.versions[0];
    expect(createHash("sha256").update(v.entryPayload).digest("hex")).toBe(v.entryHash);
    expect(v.timestamp).toMatchObject({ protocol: "rfc3161-sha256" }); expect(v.timestamp.token.length).toBeGreaterThan(20);
    expect((await api(mod, db, OWNER, "dossier?bookId=outro")).status).toBe(404);
  });

  it("assinatura do autor (Ed25519): cadastro exige a janela do TOTP; com chave, só vale registro assinado e verificável", async () => {
    const mod = await load(); const db = fakeBillingDb();
    putLibrary(db, OWNER, [{ id: "b1", title: "Livro", nodes: [{ id: "n", content: "um" }], updatedAt: 1 }]);
    const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
    const raw = Buffer.from(await crypto.subtle.exportKey("raw", pair.publicKey)).toString("base64");
    const sign = async (text: string, key = pair.privateKey) => Buffer.from(await crypto.subtle.sign("Ed25519", key, new TextEncoder().encode(text))).toString("base64");
    expect((await api(mod, db, OWNER, "key", { publicKey: raw })).status).toBe(428); // sem autenticador
    await setup(mod, db);
    expect((await api(mod, db, OWNER, "key", { publicKey: "curta" })).status).toBe(400);
    expect((await api(mod, db, OWNER, "key", { publicKey: raw }, T0 + 20 * 60000)).status).toBe(423); // janela fechou
    const keyId = (await api(mod, db, OWNER, "key", { publicKey: raw })).json.keyId;
    expect((await api(mod, db, OWNER, "status")).json.signingKey.keyId).toBe(keyId);
    // sem assinatura não registra
    expect((await api(mod, db, OWNER, "register", { bookId: "b1" })).status).toBe(428);
    const prep = (await api(mod, db, OWNER, "prepare", { bookId: "b1" })).json;
    expect(prep.keyId).toBe(keyId); expect(db.versions).toHaveLength(0); // preparar não grava versão
    // assinatura de outra chave ou de outro texto é recusada
    const other = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
    expect((await api(mod, db, OWNER, "register", { bookId: "b1", createdAt: prep.createdAt, signature: await sign(prep.entryPayload, other.privateKey) })).status).toBe(400);
    expect((await api(mod, db, OWNER, "register", { bookId: "b1", createdAt: prep.createdAt, signature: await sign(prep.entryPayload + " ") })).status).toBe(400);
    // data muito antiga (retroativa) também é recusada
    const old = new Date(T0 - 3600000).toISOString();
    expect((await api(mod, db, OWNER, "register", { bookId: "b1", createdAt: old, signature: await sign(prep.entryPayload) })).status).toBe(428);
    const ok = await api(mod, db, OWNER, "register", { bookId: "b1", createdAt: prep.createdAt, signature: await sign(prep.entryPayload) });
    expect(ok.status).toBe(200); expect(ok.json.signed).toBe(true);
    // se o livro mudar depois do prepare, a assinatura antiga não serve
    putLibrary(db, OWNER, [{ id: "b1", title: "Livro", nodes: [{ id: "n", content: "dois" }], updatedAt: 2 }]);
    const stale = await api(mod, db, OWNER, "register", { bookId: "b1", createdAt: prep.createdAt, signature: await sign(prep.entryPayload) }, T0 + 1000);
    expect(stale.status).toBe(400);
    // dossiê verificável fora do Shakstory
    const dossier = (await api(mod, db, OWNER, "dossier?bookId=b1")).json;
    const v = dossier.versions[0];
    expect(dossier.keys[0].publicKeySpkiBase64.startsWith("MCowBQYDK2VwAyEA")).toBe(true);
    const spki = Buffer.from(dossier.keys[0].publicKeySpkiBase64, "base64");
    const pub = await crypto.subtle.importKey("spki", spki, { name: "Ed25519" }, false, ["verify"]);
    expect(await crypto.subtle.verify("Ed25519", pub, Buffer.from(v.signature.sig, "base64"), new TextEncoder().encode(v.entryPayload))).toBe(true);
    expect((await api(mod, db, OWNER, "history?bookId=b1")).json.versions[0].signed).toBe(true);
    // revogar a chave libera o registro sem assinatura (a versão antiga continua assinada)
    expect((await api(mod, db, OWNER, "key/revoke", {})).status).toBe(200);
    expect((await api(mod, db, OWNER, "register", { bookId: "b1" }, T0 + 2000)).json).toMatchObject({ ok: true, seq: 2, signed: false });
    expect((await api(mod, db, OWNER, "dossier?bookId=b1")).json.keys[0].revokedAt).toBeTruthy();
  });

  it("consulta pública: só obras publicadas pelo autor, por UID da obra/versão ou SHA-256, sem vazar dados privados", async () => {
    const mod = await load(); const db = fakeBillingDb();
    putLibrary(db, OWNER, [{ id: "pub1", title: "Obra Pública", nodes: [{ id: "n", content: "segredo do texto" }], updatedAt: 1 }]);
    const lookup = async (q: string, now = T0, ip = "203.0.113.9") => {
      const r = new Request("https://x/api/public/xuri/lookup?q=" + encodeURIComponent(q), { headers: { "CF-Connecting-IP": ip } });
      const out = await mod.shakGate(r, { DB: db, XURI_KEY: "chave-de-teste-xuri-0123456789" }, new URL(r.url), { now });
      return { status: out.response.status, json: await out.response.json() };
    };
    await setup(mod, db);
    const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
    const raw = Buffer.from(await crypto.subtle.exportKey("raw", pair.publicKey)).toString("base64");
    await api(mod, db, OWNER, "key", { publicKey: raw });
    const prep = (await api(mod, db, OWNER, "prepare", { bookId: "pub1" })).json;
    const sig = Buffer.from(await crypto.subtle.sign("Ed25519", pair.privateKey, new TextEncoder().encode(prep.entryPayload))).toString("base64");
    expect((await api(mod, db, OWNER, "register", { bookId: "pub1", note: "nota privada", createdAt: prep.createdAt, signature: sig })).status).toBe(200);
    const version = db.versions[0]; const workId = db.works[0].id;
    // privado por padrão: nada é encontrado, nem por UID, nem por hash
    expect((await lookup(workId)).status).toBe(404);
    expect((await lookup(version.content_hash)).status).toBe(404);
    // consultas inválidas
    expect((await lookup("")).status).toBe(400);
    expect((await lookup("curto")).status).toBe(400);
    expect((await lookup("a b c d e f g h")).status).toBe(400);
    // publicar exige a janela do autenticador; despublicar não
    expect((await api(mod, db, OWNER, "publish", { bookId: "pub1", publish: true }, T0 + 20 * 60000)).status).toBe(423);
    expect((await api(mod, db, OWNER, "publish", { bookId: "naoexiste", publish: true })).status).toBe(404);
    const pub = await api(mod, db, OWNER, "publish", { bookId: "pub1", publish: true, displayName: "  Ana <b>Autora</b>  " });
    expect(pub.json).toMatchObject({ ok: true, published: true });
    expect((await api(mod, db, OWNER, "history?bookId=pub1")).json).toMatchObject({ published: true });
    // encontra pela obra, pela versão e pelos dois hashes
    for (const q of [workId, version.id, version.content_hash, version.entry_hash.toUpperCase()]) {
      const r = await lookup(q);
      expect(r.status).toBe(200);
      expect(r.json.work).toEqual({ id: workId, title: "Obra Pública", isbns: [] });
      expect(r.json.versions).toHaveLength(1);
      expect(r.json.chain.valid).toBe(true);
      expect(r.json.author.displayName).toBe("Ana bAutora/b");
    }
    const found = await lookup(version.content_hash);
    expect(found.json.match).toMatchObject({ kind: "hash", seq: 1 });
    // a assinatura e a chave públicas conferem fora do Shakstory
    const v = found.json.versions[0];
    const spki = Buffer.from(found.json.keys[0].publicKeySpkiBase64, "base64");
    const pub2 = await crypto.subtle.importKey("spki", spki, { name: "Ed25519" }, false, ["verify"]);
    expect(await crypto.subtle.verify("Ed25519", pub2, Buffer.from(v.signature.sig, "base64"), new TextEncoder().encode(v.entryPayload))).toBe(true);
    // nada privado na resposta
    const text = JSON.stringify(found.json);
    expect(text).not.toContain(OWNER); expect(text).not.toContain("nota privada"); expect(text).not.toContain("segredo do texto");
    expect(text).not.toContain("secret"); expect(text).not.toContain("recovery");
    // hash que não corresponde a nada continua 404
    expect((await lookup("e".repeat(64))).status).toBe(404);
    // despublicar volta a ser privado
    expect((await api(mod, db, OWNER, "publish", { bookId: "pub1", publish: false }, T0 + 20 * 60000)).json).toMatchObject({ ok: true, published: false });
    expect((await lookup(workId)).status).toBe(404);
  });

  it("prova de exportação: o autor assina o SHA-256 do arquivo ligado à última versão, e o arquivo é achado na consulta pública", async () => {
    const mod = await load(); const db = fakeBillingDb();
    putLibrary(db, OWNER, [{ id: "ex1", title: "Obra Exportada", nodes: [{ id: "n", content: "texto" }], updatedAt: 1 }]);
    const fileHash = createHash("sha256").update("conteudo do epub").digest("hex");
    const lookup = async (q: string, now = T0) => {
      const r = new Request("https://x/api/public/xuri/lookup?q=" + q, { headers: { "CF-Connecting-IP": "203.0.113.50" } });
      const out = await mod.shakGate(r, { DB: db, XURI_KEY: "chave-de-teste-xuri-0123456789" }, new URL(r.url), { now });
      return { status: out.response.status, json: await out.response.json() };
    };
    expect((await api(mod, db, OWNER, "export/prepare", { bookId: "ex1", format: "epub", fileHash })).status).toBe(428); // sem autenticador
    await setup(mod, db);
    expect((await api(mod, db, OWNER, "export/prepare", { bookId: "ex1", format: "epub", fileHash })).status).toBe(404); // sem versão registrada
    const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
    const sign = async (text: string) => Buffer.from(await crypto.subtle.sign("Ed25519", pair.privateKey, new TextEncoder().encode(text))).toString("base64");
    const prep0 = (await api(mod, db, OWNER, "prepare", { bookId: "ex1" })).json;
    expect((await api(mod, db, OWNER, "register", { bookId: "ex1" })).status).toBe(200); // ainda sem chave: registro sem assinatura
    expect((await api(mod, db, OWNER, "export/prepare", { bookId: "ex1", format: "epub", fileHash })).status).toBe(428); // exige chave
    await api(mod, db, OWNER, "key", { publicKey: Buffer.from(await crypto.subtle.exportKey("raw", pair.publicKey)).toString("base64") });
    expect(prep0.ok).toBe(true);
    expect((await api(mod, db, OWNER, "export/prepare", { bookId: "ex1", format: "exe", fileHash })).status).toBe(400);
    expect((await api(mod, db, OWNER, "export/prepare", { bookId: "ex1", format: "epub", fileHash: "curto" })).status).toBe(400);
    const prep = (await api(mod, db, OWNER, "export/prepare", { bookId: "ex1", format: "epub", fileHash })).json;
    expect(prep.payload).toContain("xuri-1-export"); expect(prep.seq).toBe(1);
    // assinatura de outro texto, formato trocado ou hash trocado é recusada
    expect((await api(mod, db, OWNER, "export/register", { bookId: "ex1", format: "epub", fileHash, createdAt: prep.createdAt, signature: await sign(prep.payload + " ") })).status).toBe(400);
    expect((await api(mod, db, OWNER, "export/register", { bookId: "ex1", format: "pdf", fileHash, createdAt: prep.createdAt, signature: await sign(prep.payload) })).status).toBe(400);
    const ok = await api(mod, db, OWNER, "export/register", { bookId: "ex1", format: "epub", fileHash, createdAt: prep.createdAt, signature: await sign(prep.payload) });
    expect(ok.status).toBe(200); expect(ok.json).toMatchObject({ ok: true, seq: 1, format: "epub", fileHash });
    // privado até publicar; depois o arquivo é achado pelo próprio hash
    expect((await lookup(fileHash)).status).toBe(404);
    expect((await api(mod, db, OWNER, "publish", { bookId: "ex1", publish: true })).status).toBe(200);
    const found = await lookup(fileHash);
    expect(found.status).toBe(200);
    expect(found.json.match).toMatchObject({ kind: "file", seq: 1 });
    expect(found.json.exports).toHaveLength(1);
    const exp = found.json.exports[0];
    const spki = Buffer.from(found.json.keys[0].publicKeySpkiBase64, "base64");
    const pub = await crypto.subtle.importKey("spki", spki, { name: "Ed25519" }, false, ["verify"]);
    expect(await crypto.subtle.verify("Ed25519", pub, Buffer.from(exp.signature.sig, "base64"), new TextEncoder().encode(exp.payload))).toBe(true);
    expect(exp.contentHash).toBe(found.json.versions[0].contentHash);
    // o dossiê do autor também traz a prova
    expect((await api(mod, db, OWNER, "dossier?bookId=ex1")).json.exports).toHaveLength(1);
    // se o livro mudar, é preciso registrar nova versão antes de provar outra exportação
    putLibrary(db, OWNER, [{ id: "ex1", title: "Obra Exportada", nodes: [{ id: "n", content: "texto novo" }], updatedAt: 2 }]);
    expect((await api(mod, db, OWNER, "export/prepare", { bookId: "ex1", format: "pdf", fileHash })).status).toBe(409);
  });

  it("consulta pública por ISBN (declarado pelo autor) e por UID com prefixo xuri:", async () => {
    const mod = await load(); const db = fakeBillingDb();
    const OTHER = "outra@example.com";
    const lookup = async (q: string, ip: string, now = T0) => {
      const r = new Request("https://x/api/public/xuri/lookup?q=" + encodeURIComponent(q), { headers: { "CF-Connecting-IP": ip } });
      const out = await mod.shakGate(r, { DB: db, XURI_KEY: "chave-de-teste-xuri-0123456789" }, new URL(r.url), { now });
      return { status: out.response.status, json: await out.response.json() };
    };
    const publishBook = async (email: string, bookId: string, publication: any) => {
      putLibrary(db, email, [{ id: bookId, title: "Livro " + bookId, nodes: [{ id: "n", content: "x" + bookId }], updatedAt: 1, publication }]);
      await setup(mod, db, email);
      expect((await api(mod, db, email, "register", { bookId })).status).toBe(200);
      return (await api(mod, db, email, "publish", { bookId, publish: true })).json;
    };
    // 9788535902778 e 8535902775 são o mesmo livro (13 e 10 dígitos válidos); 9788535902770 tem dígito verificador errado
    const pub = await publishBook(OWNER, "isb1", { isbn: "978-85-359-0277-8", copyright: { isbns: { epub: "9780306406157" } } });
    expect(pub.isbns).toEqual(["9788535902778", "9780306406157"]);
    const byIsbn = await lookup("978-85-359-0277-8", "203.0.113.70");
    expect(byIsbn.status).toBe(200);
    expect(byIsbn.json.work.title).toBe("Livro isb1");
    expect(byIsbn.json.work.isbns).toContain("9788535902778");
    expect(byIsbn.json.match).toEqual({ kind: "isbn" });
    expect(byIsbn.json.isbnNotice).toContain("não comprova autoria");
    expect((await lookup("9780306406157", "203.0.113.70")).status).toBe(200); // ISBN do formato
    expect((await lookup("9788535902770", "203.0.113.71")).status).toBe(404); // dígito inválido não é ISBN: cai como UID inexistente
    expect((await lookup("9781234567897", "203.0.113.71")).status).toBe(404); // ISBN válido, mas ninguém declarou
    // UID com prefixo xuri:work:
    const workId = db.works[0].id;
    expect((await lookup("xuri:work:" + workId, "203.0.113.72")).status).toBe(200);
    // mais de uma obra publicada com o mesmo ISBN: não escolhe por ninguém
    await publishBook(OTHER, "isb2", { isbn: "9788535902778" });
    const dup = await lookup("9788535902778", "203.0.113.73");
    expect(dup.status).toBe(409); expect(dup.json.error).toBe("ambiguous_isbn");
    // despublicar remove o ISBN da consulta
    expect((await api(mod, db, OTHER, "publish", { bookId: "isb2", publish: false })).status).toBe(200);
    expect((await lookup("9788535902778", "203.0.113.74")).status).toBe(200);
    expect((await api(mod, db, OWNER, "publish", { bookId: "isb1", publish: false })).status).toBe(200);
    expect((await lookup("9788535902778", "203.0.113.75")).status).toBe(404);
  });

  it("consulta pública: limite de consultas por minuto por endereço", async () => {
    const mod = await load(); const db = fakeBillingDb();
    const hit = async (now: number, ip: string) => {
      const r = new Request("https://x/api/public/xuri/lookup?q=" + "b".repeat(64), { headers: { "CF-Connecting-IP": ip } });
      return (await mod.shakGate(r, { DB: db }, new URL(r.url), { now })).response.status;
    };
    for (let i = 0; i < 30; i++) expect(await hit(T0, "198.51.100.1")).toBe(404);
    expect(await hit(T0, "198.51.100.1")).toBe(429);
    expect(await hit(T0, "198.51.100.2")).toBe(404); // outro endereço não é afetado
    expect(await hit(T0 + 61000, "198.51.100.1")).toBe(404); // nova janela
  });

  it("não aceita resposta RFC 3161 truncada nem a apresenta como carimbo recebido", async () => {
    const mod = await load(); const db = fakeBillingDb();
    putLibrary(db, OWNER, [{ id: "tsa-book", title: "Livro TSA", nodes: [{ id: "n", content: "texto" }], updatedAt: 1 }]);
    await setup(mod, db);
    const badTsa = async () => new Response(new Uint8Array([0x30, 0x47, 0x30, 0x03, 0x02, 0x01, 0x00]));
    expect((await api(mod, db, OWNER, "register", { bookId: "tsa-book" }, T0, { tsaFetch: badTsa })).status).toBe(200);
    const stamped = await api(mod, db, OWNER, "stamp", { bookId: "tsa-book" }, T0, { tsaFetch: badTsa });
    expect(stamped.json).toMatchObject({ stamped: 0, pending: 1 });
    const dossier = (await api(mod, db, OWNER, "dossier?bookId=tsa-book")).json;
    expect(dossier.versions[0].timestamp).toBeNull();
  });

  it("guarda resposta RFC 3161 estruturalmente reconhecida como não verificada criptograficamente", async () => {
    const mod = await load(); const db = fakeBillingDb();
    putLibrary(db, OWNER, [{ id: "tsa-book", title: "Livro TSA", nodes: [{ id: "n", content: "texto" }], updatedAt: 1 }]);
    await setup(mod, db);
    const badTsa = async () => new Response(new Uint8Array([0x30, 0x47, 0x30, 0x03, 0x02, 0x01, 0x00]));
    expect((await api(mod, db, OWNER, "register", { bookId: "tsa-book" }, T0, { tsaFetch: badTsa })).status).toBe(200);
    const stamped = await api(mod, db, OWNER, "stamp", { bookId: "tsa-book" }, T0, { tsaFetch: tsaOk });
    expect(stamped.json).toMatchObject({ stamped: 1, pending: 0 });
    const dossier = (await api(mod, db, OWNER, "dossier?bookId=tsa-book")).json;
    expect(dossier.versions[0].timestamp.protocol).toBe("rfc3161-sha256");
    expect(dossier.versions[0].timestamp.token).toBeTruthy();
    // A resposta mockada é só um fixture DER estrutural, não um token de carimbo criptograficamente válido.
  });

  it("conta comum registra só o próprio livro e não enxerga o de outra conta", async () => {
    const mod = await load(); const db = fakeBillingDb();
    putLibrary(db, "ana@example.com", [{ id: "b1", title: "Do Ana", nodes: [], updatedAt: 1 }]);
    putLibrary(db, "bia@example.com", [{ id: "b9", title: "Da Bia", nodes: [], updatedAt: 1 }]);
    await setup(mod, db, "ana@example.com");
    expect((await api(mod, db, "ana@example.com", "register", { bookId: "b1" })).status).toBe(200);
    expect((await api(mod, db, "ana@example.com", "register", { bookId: "b9" })).status).toBe(404);
  });
});
