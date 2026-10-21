import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { fakeBillingDb } from "./fake-billing-d1";

const load = async () => (await import(/* @vite-ignore */ new URL("../cloudflare-worker/plans.js", import.meta.url).href)) as any;
const OWNER = "antonyopintor@gmail.com";
const DAY = 86400000;
const URLS = { economico: "https://payment-link-v3.ton.com.br/pl_ECO", premium: "https://payment-link-v3.ton.com.br/pl_PRE", vip: "https://payment-link-v3.ton.com.br/pl_VIP" };
const PRICE = { economico: 34949, premium: 65340, vip: 100795 };

async function send(mod: any, db: any, email: string, path: string, method = "GET", body?: unknown, now = Date.now()) {
  const r = new Request("https://x" + path, { method, headers: { "Cf-Access-Jwt-Assertion": "jwt", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const out = await mod.shakGate(r, { DB: db }, new URL(r.url), { verify: async () => email, now });
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

  it("cortesia do administrador no mesmo plano soma ao vencimento e não encurta o que foi pago", async () => {
    const mod = await load(); const db = fakeBillingDb(); const t0 = Date.now();
    await setOffers(mod, db, t0);
    const { purchase } = await buy(mod, db, "ana@example.com", "premium", t0);
    const paid = await confirm(mod, db, purchase.id, "TON-0001", { amountCents: 65340 }, t0);
    const courtesy = await send(mod, db, OWNER, "/api/admin/plan", "POST", { email: "ana@example.com", plan: "premium", days: 30 }, t0);
    expect(courtesy.status).toBe(200);
    expect(Date.parse(courtesy.json.user.paidUntil)).toBe(Date.parse(paid.json.endsAt) + 30 * DAY);
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
    expect(body.offers.find((o: any) => o.plan === "premium")).toEqual({ plan: "premium", priceCents: PRICE.premium, checkoutUrl: URLS.premium });
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
    expect(body.offers.find((o: any) => o.plan === "vip")).toEqual({ plan: "vip", priceCents: 100795 });
  });
});
