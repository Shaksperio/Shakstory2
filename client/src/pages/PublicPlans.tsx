import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/billing";

type PublicOffer = { plan: string; label: string; available: boolean; priceCents?: number; currency?: string };
const PLAN_ORDER = ["economico", "premium", "vip"];

export default function PublicPlans() {
  const [offers, setOffers] = useState<PublicOffer[]>([]);
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState("premium");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/public/plans", { headers: { accept: "application/json" } })
      .then(async r => { if (!r.ok) throw new Error("Não foi possível carregar os planos."); return r.json(); })
      .then(data => { if (active) { const list = Array.isArray(data.offers) ? data.offers as PublicOffer[] : []; setOffers(list); if (list.length && !list.some(o => o.plan === "premium" && o.available)) setSelected(list.find(o => o.available)?.plan ?? ""); } })
      .catch(() => { if (active) setMessage("Não foi possível carregar os planos agora. Tente novamente mais tarde."); });
    return () => { active = false; };
  }, []);

  const available = offers.filter(o => o.available && typeof o.priceCents === "number" && o.priceCents > 0)
    .sort((a, b) => PLAN_ORDER.indexOf(a.plan) - PLAN_ORDER.indexOf(b.plan));
  async function checkout() {
    setMessage("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 200) { setMessage("Informe um e-mail válido para associar a compra à sua conta."); return; }
    if (!available.some(o => o.plan === selected)) { setMessage("Selecione um plano disponível."); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/public/stripe/checkout", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ email: email.trim().toLowerCase(), plan: selected }) });
      const data = await response.json().catch(() => ({})) as { url?: string; checkoutUrl?: string; message?: string; error?: string };
      if (!response.ok) throw new Error(data.message || data.error || "Não foi possível iniciar o checkout.");
      const url = data.url || data.checkoutUrl;
      if (!url || !/^https:\/\/checkout\.stripe\.com\//.test(url)) throw new Error("O servidor não devolveu um endereço válido de Checkout Stripe.");
      window.location.assign(url);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Falha ao iniciar o pagamento."); setLoading(false); }
  }

  return <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-10 sm:px-6">
    <header className="mb-8"><p className="text-sm font-medium text-primary">Shakstory</p><h1 className="mt-2 font-serif text-3xl sm:text-4xl">Escolha seu plano</h1><p className="mt-3 max-w-2xl text-sm text-muted-foreground">Escolha uma oferta e informe o e-mail associado à sua conta. O plano é ativado somente após a confirmação do pagamento.</p></header>
    <section className="grid gap-3 sm:grid-cols-3">
      {available.map(offer => <button key={offer.plan} type="button" onClick={() => setSelected(offer.plan)} aria-pressed={selected === offer.plan} className={"rounded-xl border p-4 text-left transition " + (selected === offer.plan ? "border-primary ring-2 ring-primary/20" : "border-border")}>
        <span className="block font-medium">{offer.label || offer.plan}</span><span className="mt-2 block text-2xl font-semibold">{formatBRL(offer.priceCents!)}</span><span className="mt-1 block text-xs text-muted-foreground">12 meses · pagamento seguro Stripe</span>
      </button>)}
      {available.length === 0 && <p className="col-span-full rounded-xl border p-4 text-sm text-muted-foreground">Nenhum plano está disponível para compra no momento.</p>}
    </section>
    <section className="mt-6 max-w-xl rounded-xl border border-border p-4 sm:p-6">
      <label className="block text-sm font-medium" htmlFor="buyer-email">E-mail da sua conta</label>
      <input id="buyer-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={200} placeholder="voce@exemplo.com" className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" />
      <Button className="mt-4 w-full" disabled={loading || available.length === 0 || !selected} onClick={() => void checkout()}>{loading ? "Abrindo checkout…" : "Continuar para pagamento de teste"}</Button>
      {message && <p role="alert" className="mt-3 text-sm">{message}</p>}
      <p className="mt-3 text-xs text-muted-foreground">Ambiente de teste: não use para cobranças reais. Confira o e-mail antes de continuar. O retorno ao site não confirma sozinho o pagamento.</p>
      <p className="mt-4 text-xs"><Link href="/" className="underline">Voltar ao Shakstory</Link></p>
    </section>
  </main>;
}
