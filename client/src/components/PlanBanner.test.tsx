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
});
