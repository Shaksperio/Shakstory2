import React, { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { STATUS_LABEL, confirmPurchase, fetchAdminBilling, formatBRL, parseBRL, saveOffer, setPurchaseStatus, type AdminBilling } from "@/lib/billing";

const PAID = [["economico", "Econômico"], ["premium", "Premium"], ["vip", "VIP"]] as const;

/** Painel do administrador: preço e link de cada plano, pedidos em aberto e confirmação do pagamento visto no painel da Ton. */
export function BillingAdmin() {
  const [data, setData] = useState<AdminBilling | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [offerPlan, setOfferPlan] = useState("premium");
  const [price, setPrice] = useState("");
  const [url, setUrl] = useState("");
  const [tx, setTx] = useState<Record<string, string>>({});
  const [amount, setAmount] = useState<Record<string, string>>({});
  const [replace, setReplace] = useState<Record<string, boolean>>({});
  const load = () => fetchAdminBilling().then(result => { setData(result); setAvailable(true); setMessage(""); }).catch(error => { setAvailable(false); setMessage(error instanceof Error ? error.message : "Serviço de pagamentos indisponível."); });
  useEffect(() => { void load(); }, []);
  const run = async (task: () => Promise<string>) => { setBusy(true); try { const result = await task(); await load(); setMessage(result); } catch (error) { setMessage(error instanceof Error ? error.message : "Falha."); } finally { setBusy(false); } };
  return <section className="mt-6 rounded-2xl border border-border bg-card p-4 sm:p-5" aria-label="Pagamentos">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-serif text-2xl">Pagamentos e ofertas</h3><Button size="sm" variant="outline" disabled={busy} onClick={() => void load()}>Atualizar dados</Button></div>
    <p className="text-xs text-muted-foreground">Confira o pagamento no painel da Ton (valor, moeda, ID único da transação e e-mail, se aparecer) antes de confirmar.</p>
    {available === false && <p role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">O serviço de administração de pagamentos não respondeu. As ofertas não podem ser gravadas até que a API do servidor esteja disponível. Nenhuma alteração foi confirmada.</p>}
    {message && <p role="status" className="mt-2 text-sm">{message}</p>}
    <h4 className="mt-5 text-sm font-semibold">Configurar oferta</h4>
    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="text-xs">Plano<select className="mt-1 block h-10 w-full rounded-lg border bg-background px-3 text-sm" value={offerPlan} onChange={e => setOfferPlan(e.target.value)}>{PAID.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label className="text-xs">Preço (R$)<input className="mt-1 block h-10 w-full rounded-lg border bg-background px-3 text-sm" value={price} onChange={e => setPrice(e.target.value)} placeholder="349,49" inputMode="decimal" /></label>
      <label className="text-xs">Link de pagamento<input className="mt-1 block h-10 w-full min-w-0 rounded-lg border bg-background px-3 text-sm" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://payment-link-v3.ton.com.br/…" /></label>
      <Button size="sm" className="h-10 w-full sm:self-end" disabled={busy || available !== true || parseBRL(price) === null || !url.trim().startsWith("https://")} onClick={() => void run(async () => { await saveOffer(offerPlan, parseBRL(price)!, url.trim()); return "Oferta salva e confirmada pelo servidor."; })}>{busy ? "Salvando…" : "Salvar oferta"}</Button>
    </div>
    <h4 className="mt-5 text-sm font-semibold">Ofertas cadastradas</h4><ul className="mt-2 space-y-2 text-xs break-all">{data?.offers.map(offer => <li key={offer.plan}>{offer.label}: {formatBRL(offer.priceCents)} · versão {offer.version} · {offer.checkoutUrl}</li>)}{data && data.offers.length === 0 && <li className="text-muted-foreground">Nenhuma oferta configurada: nenhum plano pode ser comprado ainda.</li>}</ul>
    <h4 className="mt-4 text-sm font-semibold">Pedidos em aberto</h4>
    <ul className="divide-y divide-border text-sm">{data?.open.map(order => <li key={order.id} className="py-2">
      <p><strong>{order.email}</strong> · {order.label} · {formatBRL(order.priceCents)} · {STATUS_LABEL[order.status] ?? order.status}{order.note ? ` · ${order.note}` : ""}</p>
      <div className="mt-1 flex flex-wrap items-end gap-2">
        <label className="text-xs">ID da transação<input className="mt-1 block h-8 w-44 rounded border bg-background px-2 text-sm" value={tx[order.id] ?? ""} onChange={e => setTx({ ...tx, [order.id]: e.target.value })} /></label>
        <label className="text-xs">Valor recebido (R$)<input className="mt-1 block h-8 w-28 rounded border bg-background px-2 text-sm" value={amount[order.id] ?? ""} onChange={e => setAmount({ ...amount, [order.id]: e.target.value })} placeholder={(order.priceCents / 100).toFixed(2).replace(".", ",")} inputMode="decimal" /></label>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={replace[order.id] ?? false} onChange={e => setReplace({ ...replace, [order.id]: e.target.checked })} />Substituir plano vigente</label>
        <Button size="sm" disabled={!(tx[order.id] ?? "").trim() || parseBRL(amount[order.id] ?? "") === null} onClick={() => void run(async () => { const done = await confirmPurchase(order.id, tx[order.id].trim(), parseBRL(amount[order.id])!, replace[order.id] ?? false); return `Plano ativado até ${new Date(done.endsAt).toLocaleDateString("pt-BR")}.`; })}>Confirmar pagamento</Button>
        <Button size="sm" variant="outline" onClick={() => void run(async () => { await setPurchaseStatus(order.id, "needs_review", "revisão manual"); return "Pedido marcado para revisão."; })}>Revisar</Button>
        <Button size="sm" variant="ghost" onClick={() => void run(async () => { await setPurchaseStatus(order.id, "rejected"); return "Pedido recusado."; })}>Recusar</Button>
      </div></li>)}{data && data.open.length === 0 && <li className="py-2 text-xs text-muted-foreground">Nenhum pedido aguardando.</li>}</ul>
    {data && data.payments.length > 0 && <><h4 className="mt-4 text-sm font-semibold">Pagamentos confirmados</h4>
      <ul className="text-xs">{data.payments.map(payment => <li key={payment.txId}>{new Date(payment.confirmedAt).toLocaleDateString("pt-BR")} · {payment.email} · {payment.plan} · {formatBRL(payment.amountCents)} · {payment.txId}</li>)}</ul></>}
  </section>;
}
