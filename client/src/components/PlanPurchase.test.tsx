// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PlanPurchase } from "./PlanPurchase";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const offers = {
  email: "ana@example.com", notice: "Você será redirecionado para a página de pagamento seguro da Ton. Informe na Ton o mesmo endereço de e-mail cadastrado no Shakstory.",
  current: { plan: "expirado", label: "Teste encerrado", paidUntil: null },
  offers: [
    { plan: "economico", label: "Econômico", available: true, priceCents: 34949, currency: "BRL", version: 1 },
    { plan: "premium", label: "Premium", available: true, priceCents: 65340, currency: "BRL", version: 1 },
    { plan: "vip", label: "VIP", available: false },
  ],
  purchases: [] as unknown[],
};

function stub(handler: (url: string, body: any) => unknown) {
  const calls: Array<{ url: string; body: any }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    return new Response(JSON.stringify(handler(url, body)), { status: 200 });
  }));
  return calls;
}

describe("compra de plano", () => {
  it("mostra preço em reais, desativa plano sem oferta e exige o aviso do e-mail antes de abrir o pagamento", async () => {
    const calls = stub(url => (url === "/api/billing/offers" ? offers : { purchase: { id: "p1", plan: "premium", label: "Premium", priceCents: 65340, currency: "BRL", status: "pending", createdAt: new Date().toISOString(), claimedAt: null, confirmedAt: null }, checkoutUrl: "https://payment-link-v3.ton.com.br/pl_PRE", email: "ana@example.com", notice: offers.notice }));
    const open = vi.fn(); vi.stubGlobal("open", open);
    render(<PlanPurchase />);
    await waitFor(() => expect(screen.getByText(/R\$\s?653,40/)).toBeTruthy());
    expect(screen.getByText(/R\$\s?349,49/)).toBeTruthy();
    expect((screen.getAllByText("Assinar")[2] as HTMLButtonElement).disabled).toBe(true); // VIP sem oferta
    fireEvent.click(screen.getAllByText("Assinar")[1]);
    expect(screen.getByText(/mesmo endereço de e-mail cadastrado no Shakstory/)).toBeTruthy();
    expect(screen.getByText("ana@example.com")).toBeTruthy();
    expect(open).not.toHaveBeenCalled(); // nada abre antes da confirmação
    fireEvent.click(screen.getByText("Continuar para o pagamento"));
    await waitFor(() => expect(open).toHaveBeenCalledWith("https://payment-link-v3.ton.com.br/pl_PRE", "_blank", "noopener,noreferrer"));
    const purchase = calls.find(call => call.url === "/api/billing/purchase");
    expect(purchase?.body).toEqual({ plan: "premium" }); // o cliente só diz o plano: nem URL nem valor
  });

  it("'Já paguei' só pede conferência e avisa que o plano não é ativado na hora", async () => {
    const pending = { id: "p1", plan: "premium", label: "Premium", priceCents: 65340, currency: "BRL", status: "pending", createdAt: new Date().toISOString(), claimedAt: null, confirmedAt: null };
    const calls = stub(url => (url === "/api/billing/offers" ? { ...offers, purchases: [pending] } : { purchase: { ...pending, status: "awaiting_review" } }));
    render(<PlanPurchase />);
    await waitFor(() => expect(screen.getByText("Já paguei")).toBeTruthy());
    expect(screen.getByText("Aguardando pagamento")).toBeTruthy();
    fireEvent.click(screen.getByText("Já paguei"));
    await waitFor(() => expect(screen.getByText(/Pedido enviado para conferência/)).toBeTruthy());
    expect(calls.some(call => call.url === "/api/billing/claim" && call.body.id === "p1")).toBe(true);
    expect(screen.getByText(/O plano é ativado depois que o pagamento for confirmado/)).toBeTruthy();
    expect(screen.getByText(/não ativa o plano: o administrador confere/)).toBeTruthy();
  });

  it("sem servidor de compra, orienta a usar o pedido por e-mail e não quebra", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    render(<PlanPurchase />);
    await waitFor(() => expect(screen.getByText(/compra online não está disponível/)).toBeTruthy());
  });
});
