// Cobrança manual (Ton): o app só mostra preços, abre o checkout escolhido pelo servidor e pede conferência. Quem ativa o plano é o administrador.
export type Offer = { plan: string; label: string; available: boolean; priceCents?: number; currency?: string; version?: number };
export type PurchaseView = { id: string; plan: string; label: string; priceCents: number; currency: string; status: string; createdAt: string; claimedAt: string | null; confirmedAt: string | null; email?: string; note?: string | null };
export type OffersResponse = { email: string; notice: string; current: { plan: string; label: string; paidUntil: string | null }; offers: Offer[]; purchases: PurchaseView[] };
export type AdminOffer = { plan: string; label: string; priceCents: number; currency: string; version: number; checkoutUrl: string };
export type AdminBilling = { offers: AdminOffer[]; open: PurchaseView[]; recent: PurchaseView[]; payments: Array<{ provider: string; txId: string; purchaseId: string; email: string; plan: string; amountCents: number; currency: string; confirmedAt: string }> };

export const STATUS_LABEL: Record<string, string> = {
  pending: "Aguardando pagamento",
  awaiting_review: "Aguardando confirmação",
  needs_review: "Em revisão pelo administrador",
  confirmed: "Confirmado",
  rejected: "Recusado",
  canceled: "Cancelado",
};

export const formatBRL = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "349,49" ou "1.007,95" -> centavos; null se inválido. */
export function parseBRL(text: string): number | null {
  const clean = text.trim().replace(/^R\$\s*/, "").replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const cents = Math.round(Number(clean) * 100);
  return cents > 0 ? cents : null;
}

async function call<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, { method: body === undefined ? "GET" : "POST", headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!response.ok) {
    if (response.status === 404) throw new Error("Rota de pagamentos não encontrada no Worker principal (HTTP 404). A atualização do frontend não instala essa API. Nenhuma oferta foi alterada.");
    if (response.status === 401 || response.status === 403) throw new Error("Operação não autorizada: confirme a sessão de administrador no servidor.");
    throw new Error(data.message || data.error || `Não foi possível concluir a operação (HTTP ${response.status}).`);
  }
  return data as T;
}

export const fetchOffers = () => call<OffersResponse>("/api/billing/offers");
export const createPurchase = (plan: string) => call<{ purchase: PurchaseView; checkoutUrl: string; email: string; notice: string }>("/api/billing/purchase", { plan });
export const claimPurchase = (id: string) => call<{ purchase: PurchaseView }>("/api/billing/claim", { id });
export const startStripeCheckout = (plan: string) => call<{ url: string }>("/api/billing/stripe/checkout", { plan });
export const cancelPurchase = (id: string) => call<{ purchase: PurchaseView }>("/api/billing/cancel", { id });

export const fetchAdminBilling = () => call<AdminBilling>("/api/admin/billing");
export const saveOffer = (plan: string, priceCents: number, checkoutUrl: string) => call<{ ok: boolean }>("/api/admin/offer", { plan, priceCents, currency: "BRL", checkoutUrl });
export const confirmPurchase = (id: string, txId: string, amountCents: number, replace: boolean) => call<{ ok: boolean; endsAt: string }>("/api/admin/purchase/confirm", { id, txId, amountCents, currency: "BRL", ...(replace ? { mode: "replace" } : {}) });
export const setPurchaseStatus = (id: string, status: "needs_review" | "rejected", note?: string) => call<{ ok: boolean }>("/api/admin/purchase/status", { id, status, note });

/** Dias até o vencimento (arredondado para cima); null sem data. */
export function daysUntil(iso: string | null | undefined, now = Date.now()): number | null {
  const end = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(end) ? Math.ceil((end - now) / 86400000) : null;
}
