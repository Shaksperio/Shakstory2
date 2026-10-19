import React, { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { STATUS_LABEL, cancelPurchase, claimPurchase, createPurchase, daysUntil, fetchOffers, formatBRL, type OffersResponse } from "@/lib/billing";
import { PLAN_CARDS } from "@/lib/plans";

/** Compra de plano: preço em reais, aviso do e-mail, abertura do checkout escolhido pelo servidor e acompanhamento do pedido. Nada aqui ativa o plano. */
export function PlanPurchase() {
  const [data, setData] = useState<OffersResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const load = () => fetchOffers().then(next => { setData(next); setFailed(false); }).catch(() => setFailed(true));
  useEffect(() => { void load(); }, []);

  const run = async (task: () => Promise<void>) => {
    setBusy(true); setMessage("");
    try { await task(); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível concluir."); }
    finally { setBusy(false); }
  };
  const proceed = (plan: string) => run(async () => {
    const created = await createPurchase(plan);
    setChoice(null);
    window.open(created.checkoutUrl, "_blank", "noopener,noreferrer");
    setMessage("A página de pagamento foi aberta. Depois de pagar, volte aqui e toque em “Já paguei”.");
  });

  if (failed) return <p className="mt-4 text-xs text-muted-foreground">A compra online não está disponível agora. Use o pedido por e-mail abaixo.</p>;
  if (!data) return <p className="mt-4 text-xs text-muted-foreground" role="status">Carregando planos…</p>;
  const left = daysUntil(data.current.paidUntil);
  const open = data.purchases.filter(p => ["pending", "awaiting_review", "needs_review"].includes(p.status));
  return <div className="mt-4" data-testid="plan-purchase">
    {data.current.paidUntil && left !== null && left > 0 && <p className="mb-3 rounded-md bg-primary/5 p-2 text-xs" role="status">Seu plano {data.current.label} vence em {new Date(data.current.paidUntil).toLocaleDateString("pt-BR")} ({left} dia{left === 1 ? "" : "s"}). Renovar o mesmo plano soma 12 meses ao vencimento atual.</p>}
    <div className="grid gap-3 sm:grid-cols-3">{data.offers.map(offer => {
      const card = PLAN_CARDS.find(item => item.id === offer.plan);
      return <section key={offer.plan} className="flex flex-col rounded-xl border border-border p-3 text-sm">
        <h3 className="font-semibold">{offer.label}</h3>
        <p className="text-base font-medium">{offer.available && offer.priceCents ? <>{formatBRL(offer.priceCents)} <span className="text-xs font-normal text-muted-foreground">por 12 meses</span></> : <span className="text-xs font-normal text-muted-foreground">Em breve</span>}</p>
        <ul className="mt-2 flex-1 list-disc space-y-1 pl-4 text-xs">{card?.features.map(feature => <li key={feature}>{feature}</li>)}</ul>
        <Button size="sm" className="mt-3" disabled={!offer.available || busy} onClick={() => setChoice(offer.plan)}>{data.current.plan === offer.plan ? "Renovar" : "Assinar"}</Button>
      </section>;
    })}</div>
    {choice && <div className="mt-3 rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm" role="group" aria-label="Antes de pagar">
      <p>{data.notice}</p>
      <p className="mt-2 text-sm">E-mail para informar no pagamento: <strong>{data.email}</strong></p>
      <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={() => void proceed(choice)}>Continuar para o pagamento</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => setChoice(null)}>Voltar</Button></div>
    </div>}
    {message && <p className="mt-3 text-xs" role="status">{message}</p>}
    {data.purchases.length > 0 && <div className="mt-4"><h3 className="text-sm font-semibold">Seus pedidos</h3>
      <ul className="mt-1 divide-y divide-border text-xs">{data.purchases.map(purchase => <li key={purchase.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span>{purchase.label} · {formatBRL(purchase.priceCents)} · <strong>{STATUS_LABEL[purchase.status] ?? purchase.status}</strong> · {new Date(purchase.createdAt).toLocaleDateString("pt-BR")}</span>
        {purchase.status === "pending" && <span className="flex gap-1">
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => void proceed(purchase.plan)}>Abrir pagamento</Button>
          <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={() => void run(async () => { await claimPurchase(purchase.id); setMessage("Pedido enviado para conferência. O plano é ativado depois que o pagamento for confirmado."); })}>Já paguei</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={() => void run(async () => { await cancelPurchase(purchase.id); })}>Cancelar</Button></span>}
      </li>)}</ul>
      {open.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Voltar do pagamento ou tocar em “Já paguei” não ativa o plano: o administrador confere o pagamento antes.</p>}
    </div>}
  </div>;
}
