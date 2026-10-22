import React, { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { daysUntil, formatBRL, startStripeCheckout } from "@/lib/billing";
import { readPublicPlanOffers, type PublicPlanOffer } from "@/lib/mirror/firebase";
import { PlanPurchase } from "./PlanPurchase";
import { BillingAdmin } from "./BillingAdmin";
import { ADMIN_CONTACT, FEATURE_LABEL, PLAN_CARDS, adminSetPlan, adminUsers, closePlans, openPlans, refreshPlan, usePlan, usePlansDialog } from "@/lib/plans";

/** Faixa no topo: dias do teste, teste encerrado e acesso ao painel do administrador. Para plano pago não mostra nada. */
type ShownOffer = { plan: PublicPlanOffer["plan"]; priceCents: number; checkoutUrl?: string; available?: boolean };

/** Volta do pagamento na Stripe: o plano só muda quando o webhook confirma; aqui o app consulta o servidor por alguns instantes. */
function PaymentReturn() {
  const info = usePlan();
  const [state, setState] = useState<"" | "ok" | "cancelado">("");
  useEffect(() => {
    let query: string | null = null;
    try { query = new URLSearchParams(window.location.search).get("pagamento"); } catch { query = null; }
    if (query !== "ok" && query !== "cancelado") return;
    setState(query);
    try { const url = new URL(window.location.href); url.searchParams.delete("pagamento"); window.history.replaceState(null, "", url.toString()); } catch { /* sem histórico */ }
    if (query !== "ok") return;
    let tries = 0;
    void refreshPlan();
    const timer = window.setInterval(() => { tries += 1; void refreshPlan(); if (tries >= 12) window.clearInterval(timer); }, 4000);
    return () => window.clearInterval(timer);
  }, []);
  if (!state) return null;
  const active = ["economico", "premium", "vip"].includes(info.plan);
  const text = state === "cancelado" ? "Pagamento não concluído. Nada foi cobrado." : active ? `Pagamento confirmado. Seu plano ${info.label} está ativo.` : "Pagamento recebido: estamos confirmando com a Stripe. O plano é ativado automaticamente em instantes.";
  return <div className="border-b border-primary/20 bg-primary/5"><p role="status" className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-5 py-1.5 text-xs"><span>{text}</span><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setState("")}>Fechar</Button></p></div>;
}

export function PlanBanner() { return <><PaymentReturn /><PlanBannerBase /></>; }

function PlanBannerBase() {
  const info = usePlan();

  if (info.plan === "trial") {
    return <div className="border-b border-primary/20 bg-primary/5"><p role="status" className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-5 py-1.5 text-xs">
      <span>Teste grátis: {info.daysLeft === 1 ? "resta 1 dia" : `restam ${info.daysLeft ?? 0} dias`}. Depois, exportação e Cowila exigem um plano.</span>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={openPlans}>Ver planos</Button></p></div>;
  }
  if (info.plan === "expirado") {
    return <div className="border-b border-destructive/30 bg-destructive/10"><p role="status" className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-5 py-1.5 text-xs">
      <span>Seu teste de 7 dias terminou. Você ainda pode escrever e baixar o backup, mas exportação e Cowila estão bloqueados.</span>
      <Button size="sm" className="h-7 text-xs" onClick={openPlans}>Ativar um plano</Button></p></div>;
  }
  // Plano pago perto do fim: aviso dentro do app aos 30, 7 e 1 dia (renovação é manual).
  const left = daysUntil(info.paidUntil);
  if (!info.owner && left !== null && left > 0 && left <= 30) {
    return <div className="border-b border-primary/20 bg-primary/5"><p role="status" className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-5 py-1.5 text-xs">
      <span>Seu plano {info.label} vence em {left === 1 ? "1 dia" : `${left} dias`}. A renovação é feita por novo pagamento.</span>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={openPlans}>Renovar</Button></p></div>;
  }
  return <div className="border-b border-border/60 bg-background"><div className="mx-auto flex max-w-7xl justify-end px-5 py-1"><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={openPlans}>Ver planos</Button></div></div>;
}

export function PlansDialog() {
  const state = usePlansDialog();
  const info = usePlan();
  const [publicOffers, setPublicOffers] = useState<ShownOffer[]>([]);
  const [catalogError, setCatalogError] = useState(false);
  const [stripeOn, setStripeOn] = useState(false);
  const [paying, setPaying] = useState("");
  const [payError, setPayError] = useState("");
  useEffect(() => {
    if (!state.open) return;
    const fromServer = fetch("/api/public/plans", { headers: { accept: "application/json" } }).then(r => (r.ok ? r.json() : null)).then((d: { offers?: ShownOffer[]; stripe?: boolean } | null) => ({ list: (Array.isArray(d?.offers) ? d!.offers! : []).filter(o => typeof o.priceCents === "number" && o.priceCents > 0), stripe: d?.stripe === true })).catch(() => ({ list: [] as ShownOffer[], stripe: false }));
    const fromFirebase = readPublicPlanOffers().then(list => ({ list: list as ShownOffer[], failed: false })).catch(() => ({ list: [] as ShownOffer[], failed: true }));
    void Promise.all([fromServer, fromFirebase]).then(([server, firebase]) => {
      const merged = [...server.list, ...firebase.list.filter(item => !server.list.some(other => other.plan === item.plan))];
      setPublicOffers(merged); setStripeOn(server.stripe); setCatalogError(firebase.failed && merged.length === 0);
    });
  }, [state.open]);
  const pay = async (plan: string) => {
    setPaying(plan); setPayError("");
    try { const { url } = await startStripeCheckout(plan); window.location.assign(url); }
    catch (error) { setPayError(error instanceof Error ? error.message : "Não foi possível abrir o pagamento."); setPaying(""); }
  };
  if (!state.open) return null;
  const subject = encodeURIComponent("Plano do Shakstory");
  const body = encodeURIComponent(`Olá! Quero ativar o plano ______ no Shakstory.\nMeu e-mail de acesso: ${info.email ?? ""}`);
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Planos do Shakstory">
    <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-background p-5 shadow-xl">
      <div className="flex items-start justify-between gap-3"><div>
        <h2 className="font-serif text-2xl">Planos do Shakstory</h2>
        <p className="mt-1 text-sm text-muted-foreground">{state.reason ? `${FEATURE_LABEL[state.reason]} não está incluído no seu plano atual (${info.label}).` : `Seu plano atual: ${info.label}.`}</p></div>
        <Button size="sm" variant="ghost" aria-label="Fechar planos" onClick={closePlans}>✕</Button></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">{PLAN_CARDS.map(card => {
        const offer = publicOffers.find(item => item.plan === card.id);
        return <section key={card.id} className="flex flex-col rounded-xl border border-border bg-card p-4 text-sm">
          <h3 className="font-semibold">{card.label}</h3>
          <p className="mt-1 text-base font-medium">{offer ? formatBRL(offer.priceCents) : "Preço a confirmar"}</p>
          <ul className="mt-3 flex-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">{card.features.map(feature => <li key={feature}>{feature}</li>)}</ul>
          {offer && stripeOn && offer.available !== false && !info.owner ? <Button className="mt-4 min-h-10" disabled={paying !== ""} onClick={() => void pay(card.id)}>{paying === card.id ? "Abrindo pagamento…" : "Pagar (cartão ou Pix)"}</Button>
            : offer?.checkoutUrl ? <a className="mt-4 inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-3 text-center text-sm font-medium text-primary-foreground" href={offer.checkoutUrl} target="_blank" rel="noopener noreferrer">Pagar com Ton</a> : <span className="mt-4 rounded-md border p-2 text-center text-xs text-muted-foreground">{offer ? "Pagamento online indisponível no momento" : "Plano ainda não disponível"}</span>}
        </section>;
      })}</div>
      {payError && <p role="alert" className="mt-2 text-xs text-destructive">{payError}</p>}
      {catalogError && <p role="status" className="mt-2 text-xs text-muted-foreground">Não foi possível consultar o catálogo no Firebase. Confira sua conexão.</p>}
      <p className="mt-3 text-xs text-muted-foreground">O pagamento é feito na página segura da Stripe (cartão ou Pix) e vale 12 meses. O plano é ativado automaticamente quando a Stripe confirma o pagamento; voltar do checkout, por si só, não ativa nada.</p>
      <p className="mt-4 text-xs text-muted-foreground">Seus textos continuam seus: você pode escrever, abrir os livros e baixar o backup mesmo sem plano. A ativação é feita pelo administrador depois da conferência do pagamento.</p>
      <a className="mt-4 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" href={`mailto:${ADMIN_CONTACT}?subject=${subject}&body=${body}`}>Pedir ativação por e-mail</a>
    </div></div>;
}

export function AdminPanel({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<Awaited<ReturnType<typeof adminUsers>>>([]);
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState("premium");
  const [days, setDays] = useState(30);
  const [message, setMessage] = useState("");
  const load = () => adminUsers().then(setUsers).catch(error => setMessage(error.message));
  useEffect(() => { void load(); }, []);
  const apply = async (target: string, nextPlan: string) => {
    try { await adminSetPlan(target, nextPlan, days); setMessage(`${target}: plano ${nextPlan} aplicado.`); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao aplicar."); }
  };
  return <section className="mx-auto w-full max-w-4xl min-w-0 py-4 sm:py-8" aria-label="Contas e planos">
    <div className="w-full min-w-0 rounded-3xl border border-border bg-background p-4 shadow-sm sm:p-7">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Administração</p><h2 className="mt-1 font-serif text-3xl">Contas e planos</h2><p className="mt-1 text-xs text-muted-foreground">Gerencie assinaturas e confira pagamentos com segurança.</p></div><Button size="sm" variant="ghost" aria-label="Fechar painel" onClick={onClose}>✕</Button></div>
      <section className="mt-5 rounded-2xl border border-border bg-card p-4 sm:p-5"><h3 className="mb-3 text-sm font-semibold">Gerenciar assinatura</h3><div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,0.75fr)_auto]">
        <label className="text-xs">E-mail<input className="mt-1 block h-10 w-full min-w-0 rounded-lg border bg-background px-3 text-sm" value={email} onChange={e => setEmail(e.target.value)} placeholder="pessoa@email.com" /></label>
        <label className="text-xs">Plano<select className="mt-1 block h-10 w-full rounded-lg border bg-background px-3 text-sm" value={plan} onChange={e => setPlan(e.target.value)}><option value="economico">Econômico</option><option value="premium">Premium</option><option value="vip">VIP</option><option value="trial">Reiniciar teste de 7 dias</option><option value="expirado">Encerrar teste</option></select></label>
        <label className="text-xs">Dias<input type="number" min={1} max={3650} className="mt-1 block h-10 w-full rounded-lg border bg-background px-3 text-sm" value={days} onChange={e => setDays(Number(e.target.value) || 30)} /></label>
        <Button size="sm" disabled={!email.includes("@")} onClick={() => void apply(email.trim().toLowerCase(), plan)}>Aplicar</Button>
      </div>
      {message && <p role="status" className="mt-2 text-xs">{message}</p>}
      </section><section className="mt-4 rounded-2xl border border-border bg-card p-4 sm:p-5"><h3 className="text-sm font-semibold">Usuários cadastrados</h3><ul className="mt-3 divide-y divide-border text-sm">{users.map(user => <li key={user.email} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span><strong>{user.email}</strong><br /><span className="text-xs text-muted-foreground">{user.label}{user.daysLeft !== null && user.plan === "trial" ? ` · ${user.daysLeft} dia(s)` : ""}{user.paidUntil && user.plan !== "trial" && user.plan !== "expirado" ? ` · até ${new Date(user.paidUntil).toLocaleDateString("pt-BR")}` : ""} · desde {new Date(user.createdAt).toLocaleDateString("pt-BR")}</span></span>
        <span className="flex gap-1">{(["economico", "premium", "vip"] as const).map(id => <Button key={id} size="sm" variant={user.plan === id ? "default" : "outline"} className="h-7 text-xs" onClick={() => void apply(user.email, id)}>{id === "economico" ? "Econ." : id === "premium" ? "Prem." : "VIP"}</Button>)}</span></li>)}
        {users.length === 0 && <li className="py-3 text-xs text-muted-foreground">Nenhuma conta de usuário encontrada neste serviço.</li>}</ul></section>
      <BillingAdmin />
    </div></section>;
}
