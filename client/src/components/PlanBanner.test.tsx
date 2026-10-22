// @vitest-environment jsdom
import React from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PlanBanner, PlansDialog } from "./PlanBanner";
import { CowilaChat } from "./CowilaChat";
import { guard, refreshPlan, setPlanForTest, type PlanInfo } from "@/lib/plans";

afterEach(() => { cleanup(); localStorage.clear(); setPlanForTest(null); vi.unstubAllGlobals(); });
const trial: PlanInfo = { email: "a@b.com", owner: false, plan: "trial", label: "Teste grátis", daysLeft: 5, features: { export: true, cowila: true, share: true } };
const expired: PlanInfo = { email: "a@b.com", owner: false, plan: "expirado", label: "Teste encerrado", features: { export: false, cowila: false, share: false } };

describe("planos no app", () => {
  it("mostra os dias restantes do teste e libera tudo durante ele", () => {
    setPlanForTest(trial);
    render(<><PlanBanner /><PlansDialog /></>);
    expect(screen.getByText(/restam 5 dias/)).toBeTruthy();
    expect(guard("export")).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("depois do teste: bloqueia exportação, abre a tela de planos e trava o Cowila", () => {
    setPlanForTest(expired);
    const props = { books: [], draft: "", online: true, ask: vi.fn(async () => ""), onAddCharacters: vi.fn(() => ({ added: 0, updated: 0 })), onSetDescription: vi.fn(), onReplaceDraft: vi.fn() };
    render(<><PlanBanner /><PlansDialog /><CowilaChat {...props} /></>);
    expect(screen.getByText(/teste de 7 dias terminou/)).toBeTruthy();
    let allowed = true;
    act(() => { allowed = guard("export"); });
    expect(allowed).toBe(false);
    expect(screen.getByRole("dialog", { name: "Planos do Shakstory" })).toBeTruthy();
    expect(screen.getByText(/Exportar o livro não está incluído/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Fechar planos"));
    fireEvent.click(screen.getByLabelText("Abrir a Cowila"));
    expect(screen.getByText(/não está incluído no seu plano atual/)).toBeTruthy();
    expect(screen.queryByLabelText("Mensagem para a Cowila")).toBeNull();
    expect(props.ask).not.toHaveBeenCalled();
  });

  it("lê /api/me e, sem servidor, mantém tudo aberto", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...expired, features: expired.features }), { status: 200 })));
    await refreshPlan();
    expect(guard("cowila")).toBe(false);
    setPlanForTest(null);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200 })));
    await refreshPlan();
    expect(guard("cowila")).toBe(true);
  });

  it("Ver planos: plano sem oferta mostra indisponível (nunca NaN) e só plano disponível oferece pagar", async () => {
    setPlanForTest(trial);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("/api/public/plans")
      ? new Response(JSON.stringify({ stripe: true, offers: [
        { plan: "economico", label: "Econômico", available: false },
        { plan: "premium", label: "Premium", available: true, priceCents: 65340, currency: "BRL" },
        { plan: "vip", label: "VIP", available: false },
      ] }), { status: 200 })
      : new Response("{}", { status: 404 })));
    render(<><PlanBanner /><PlansDialog /></>);
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /Ver planos/ })[0]); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(document.body.textContent).not.toMatch(/NaN/);
    expect(screen.getAllByText("Plano ainda não disponível").length).toBe(2);
    expect(screen.getAllByRole("button", { name: /Pagar \(cartão ou Pix\)/ }).length).toBe(1);
  });

  it("Ver planos com Stripe ligada: administrador vê o pagamento desativado e nenhum link da Ton; Stripe desligada mantém a Ton", async () => {
    const owner: PlanInfo = { email: "adm@x.com", owner: true, plan: "owner", label: "Administrador", features: { export: true, cowila: true, share: true } };
    const offers = (stripe: boolean) => ({ stripe, offers: ["economico", "premium", "vip"].map(plan => ({ plan, label: plan, available: stripe, priceCents: 10000, currency: "BRL", checkoutUrl: "https://payment-link-v3.ton.com.br/pl_ABCDEFGH" })) });
    const open = async () => { render(<><PlanBanner /><PlansDialog /></>); await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /Ver planos/ })[0]); }); await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); };
    setPlanForTest(owner);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("/api/public/plans") ? new Response(JSON.stringify(offers(true)), { status: 200 }) : new Response("{}", { status: 404 })));
    await open();
    expect(screen.queryByText("Pagar com Ton")).toBeNull();
    const buttons = screen.getAllByRole("button", { name: /Pagar \(cartão ou Pix\)/ });
    expect(buttons.length).toBe(3);
    expect(buttons.every(button => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByText(/Gerar link de pagamento/)).toBeTruthy();
    cleanup(); vi.unstubAllGlobals();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("/api/public/plans") ? new Response(JSON.stringify(offers(false)), { status: 200 }) : new Response("{}", { status: 404 })));
    await open();
    expect(screen.getAllByText("Pagar com Ton").length).toBe(3);
  });
});
