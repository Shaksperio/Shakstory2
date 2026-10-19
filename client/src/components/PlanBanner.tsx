import React, { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { CONTINGENCY } from "@/lib/contingency";
import { daysUntil } from "@/lib/billing";
import { PlanPurchase } from "./PlanPurchase";
import { BillingAdmin } from "./BillingAdmin";
import { ADMIN_CONTACT, FEATURE_LABEL, PLAN_CARDS, PLAN_PRICES, adminSetPlan, adminUsers, closePlans, openPlans, usePlan, usePlansDialog } from "@/lib/plans";

/** Faixa no topo: dias do teste, teste encerrado e acesso ao painel do administrador. Para plano pago não mostra nada. */
export function PlanBanner() {
  const info = usePlan();
  const [admin, setAdmin] = useState(false);
  if (info.owner) {
    if (!info.email || CONTINGENCY) return null; // o painel de contas fica no endereço principal
    return <><div className="border-b border-border/50"><p className="mx-auto flex max-w-7xl items-center justify-end gap-3 px-5 py-1 text-xs text-muted-foreground">Administrador<Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setAdmin(true)}>Contas e planos</Button></p></div>{admin && <AdminPanel onClose={() => setAdmin(false)} />}</>;
  }
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
  return null;
}

export function PlansDialog() {
  const state = usePlansDialog();
  const info = usePlan();
  if (!state.open) return null;
  const subject = encodeURIComponent("Plano do Shakstory");
  const body = encodeURIComponent(`Olá! Quero ativar o plano ______ no Shakstory.\nMeu e-mail de acesso: ${info.email ?? ""}`);
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Planos do Shakstory">
    <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-background p-5 shadow-xl">
      <div className="flex items-start justify-between gap-3"><div>
        <h2 className="font-serif text-2xl">Planos do Shakstory</h2>
        <p className="mt-1 text-sm text-muted-foreground">{state.reason ? `${FEATURE_LABEL[state.reason]} não está incluído no seu plano atual (${info.label}).` : `Seu plano atual: ${info.label}.`}</p></div>
        <Button size="sm" variant="ghost" aria-label="Fechar planos" onClick={closePlans}>✕</Button></div>
      {CONTINGENCY || info.owner ? <><div className="mt-4 grid gap-3 sm:grid-cols-3">{PLAN_CARDS.map(card => <section key={card.id} className="rounded-xl border border-border p-3 text-sm"><h3 className="font-semibold">{card.label}</h3><p className="text-xs">{PLAN_PRICES[card.id] ? `${PLAN_PRICES[card.id]} / mês` : "Valor: consulte o administrador"}</p><ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">{card.features.map(f => <li key={f}>{f}</li>)}</ul></section>)}</div></> : <PlanPurchase />}
      {CONTINGENCY && <p className="mt-3 text-xs text-muted-foreground">A assinatura é feita pelo endereço principal do Shakstory.</p>}
      <p className="mt-4 text-xs text-muted-foreground">Seus textos continuam seus: você pode escrever, abrir os livros e baixar o backup mesmo sem plano. A ativação é feita pelo administrador depois da conferência do pagamento.</p>
      <a className="mt-4 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" href={`mailto:${ADMIN_CONTACT}?subject=${subject}&body=${body}`}>Pedir ativação por e-mail</a>
    </div></div>;
}

function AdminPanel({ onClose }: { onClose: () => void }) {
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
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Contas e planos">
    <div className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-background p-5 shadow-xl">
      <div className="flex items-center justify-between"><h2 className="font-serif text-2xl">Contas e planos</h2><Button size="sm" variant="ghost" aria-label="Fechar painel" onClick={onClose}>✕</Button></div>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-xs">E-mail<input className="mt-1 block h-9 w-56 rounded border bg-background px-2 text-sm" value={email} onChange={e => setEmail(e.target.value)} placeholder="pessoa@email.com" /></label>
        <label className="text-xs">Plano<select className="mt-1 block h-9 rounded border bg-background px-2 text-sm" value={plan} onChange={e => setPlan(e.target.value)}><option value="economico">Econômico</option><option value="premium">Premium</option><option value="vip">VIP</option><option value="trial">Reiniciar teste de 7 dias</option><option value="expirado">Encerrar teste</option></select></label>
        <label className="text-xs">Dias<input type="number" min={1} max={3650} className="mt-1 block h-9 w-20 rounded border bg-background px-2 text-sm" value={days} onChange={e => setDays(Number(e.target.value) || 30)} /></label>
        <Button size="sm" disabled={!email.includes("@")} onClick={() => void apply(email.trim().toLowerCase(), plan)}>Aplicar</Button>
      </div>
      {message && <p role="status" className="mt-2 text-xs">{message}</p>}
      <ul className="mt-4 divide-y divide-border text-sm">{users.map(user => <li key={user.email} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span><strong>{user.email}</strong><br /><span className="text-xs text-muted-foreground">{user.label}{user.daysLeft !== null && user.plan === "trial" ? ` · ${user.daysLeft} dia(s)` : ""}{user.paidUntil && user.plan !== "trial" && user.plan !== "expirado" ? ` · até ${new Date(user.paidUntil).toLocaleDateString("pt-BR")}` : ""} · desde {new Date(user.createdAt).toLocaleDateString("pt-BR")}</span></span>
        <span className="flex gap-1">{(["economico", "premium", "vip"] as const).map(id => <Button key={id} size="sm" variant={user.plan === id ? "default" : "outline"} className="h-7 text-xs" onClick={() => void apply(user.email, id)}>{id === "economico" ? "Econ." : id === "premium" ? "Prem." : "VIP"}</Button>)}</span></li>)}
        {users.length === 0 && <li className="py-3 text-xs text-muted-foreground">Nenhuma conta de usuário ainda.</li>}</ul>
      <BillingAdmin />
    </div></div>;
}
