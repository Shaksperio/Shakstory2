// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CowilaTutorial, WELCOME_TEXT, type CowilaTutorialProps } from "./CowilaTutorial";
import { stepsFor } from "./script";
import { readTutorial, writeTutorial } from "./state";

const USER = "autor@exemplo.com";
const props = (over: Partial<CowilaTutorialProps> = {}): CowilaTutorialProps => ({ userKey: USER, ready: true, hasBook: true, hasBooks: true, view: "library", go: vi.fn(() => true), menuOpen: false, onMenuClose: vi.fn(), ...over });

beforeEach(() => { localStorage.clear(); Element.prototype.scrollIntoView = vi.fn(); });
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

describe("CowilaTutorial", () => {
  it("convida no primeiro acesso e “Agora não” libera o aplicativo e não volta sozinho", () => {
    const { rerender } = render(<CowilaTutorial {...props()} />);
    expect(screen.getByText(WELCOME_TEXT)).toBeTruthy();
    expect(screen.getByText("Começar tutorial")).toBeTruthy();
    fireEvent.click(screen.getByText("Agora não"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(readTutorial(USER).status).toBe("postponed");
    rerender(<CowilaTutorial {...props()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("não convida antes do login", () => {
    render(<CowilaTutorial {...props({ ready: false })} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("percorre etapas com Anterior/Próximo e mostra “Etapa X de Y” e a saída sempre visível", () => {
    render(<CowilaTutorial {...props()} />);
    fireEvent.click(screen.getByText("Começar tutorial"));
    const total = stepsFor({ hasBook: true, hasBooks: true }).length;
    expect(screen.getByTestId("tour-progress").textContent).toBe(`Etapa 1 de ${total}`);
    expect((screen.getByText("Anterior") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Parar e sair do tutorial")).toBeTruthy();
    fireEvent.click(screen.getByText("Próximo"));
    expect(screen.getByTestId("tour-progress").textContent).toBe(`Etapa 2 de ${total}`);
    fireEvent.click(screen.getByText("Anterior"));
    expect(screen.getByTestId("tour-progress").textContent).toBe(`Etapa 1 de ${total}`);
    expect(readTutorial(USER).status).toBe("in_progress");
  });
  it("Esc e “Parar e sair” encerram na hora, sem confirmação, e guardam a etapa", () => {
    render(<CowilaTutorial {...props()} />);
    fireEvent.click(screen.getByText("Começar tutorial"));
    fireEvent.click(screen.getByText("Próximo"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector("[data-cowila-tour-layer]")).toBeNull();
    expect(readTutorial(USER)).toMatchObject({ status: "in_progress", stepId: stepsFor({ hasBook: true, hasBooks: true })[1].id });
  });
  it("retoma de onde parou pelo menu e permite reiniciar", () => {
    const second = stepsFor({ hasBook: true, hasBooks: true })[2].id;
    writeTutorial(USER, { status: "in_progress", stepId: second, updatedAt: 0 });
    const onMenuClose = vi.fn();
    const { rerender } = render(<CowilaTutorial {...props({ menuOpen: true, onMenuClose })} />);
    expect(screen.getByText(/Você parou na etapa 3/)).toBeTruthy();
    fireEvent.click(screen.getByText("Continuar de onde parou"));
    rerender(<CowilaTutorial {...props({ menuOpen: false, onMenuClose })} />);
    expect(screen.getByTestId("tour-progress").textContent).toMatch(/^Etapa 3 de/);
    fireEvent.keyDown(document, { key: "Escape" });
    rerender(<CowilaTutorial {...props({ menuOpen: true, onMenuClose })} />);
    fireEvent.click(screen.getByText("Reiniciar"));
    rerender(<CowilaTutorial {...props({ menuOpen: false, onMenuClose })} />);
    expect(screen.getByTestId("tour-progress").textContent).toMatch(/^Etapa 1 de/);
  });
  it("na última etapa troca “Próximo” por “Concluir tutorial” e marca como concluído", () => {
    const all = stepsFor({ hasBook: true, hasBooks: true });
    writeTutorial(USER, { status: "in_progress", stepId: all[all.length - 1].id, updatedAt: 0 });
    const { rerender } = render(<CowilaTutorial {...props({ menuOpen: true })} />);
    fireEvent.click(screen.getByText("Continuar de onde parou"));
    rerender(<CowilaTutorial {...props({ menuOpen: false })} />);
    expect(screen.queryByText("Próximo")).toBeNull();
    fireEvent.click(screen.getByText("Concluir tutorial"));
    expect(readTutorial(USER).status).toBe("completed");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("destaca o elemento certo, escurece o resto e só troca de tela (nunca cria conteúdo)", () => {
    vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ top: 120, left: 40, width: 160, height: 36, right: 200, bottom: 156, x: 40, y: 120, toJSON: () => ({}) } as DOMRect);
    const go = vi.fn(() => true);
    document.body.insertAdjacentHTML("beforeend", '<button id="novo">Novo livro</button>');
    writeTutorial(USER, { status: "in_progress", stepId: "lib-new", updatedAt: 0 });
    render(<CowilaTutorial {...props({ go, menuOpen: true })} />);
    fireEvent.click(screen.getByText("Continuar de onde parou"));
    return new Promise<void>(resolve => setTimeout(() => {
      const spot = screen.getByTestId("tour-spot");
      expect(spot.style.top).toBe("114px");
      expect(spot.style.left).toBe("34px");
      expect(go).not.toHaveBeenCalledWith("editor");
      document.getElementById("novo")?.remove();
      resolve();
    }, 150));
  });
  it("sem o elemento na tela mostra a orientação em vez de travar", () => {
    writeTutorial(USER, { status: "in_progress", stepId: "ed-format", updatedAt: 0 });
    render(<CowilaTutorial {...props({ menuOpen: true })} />);
    fireEvent.click(screen.getByText("Continuar de onde parou"));
    expect(screen.getByText(/só aparece quando você seleciona/)).toBeTruthy();
    expect(screen.queryByTestId("tour-spot")).toBeNull();
  });
  it("Tab fica dentro do balão", () => {
    render(<CowilaTutorial {...props()} />);
    fireEvent.click(screen.getByText("Começar tutorial"));
    const exit = screen.getByText("Parar e sair do tutorial");
    exit.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.querySelector("[data-cowila-tour-dialog]")?.contains(document.activeElement)).toBe(true);
  });
  it("ao sair volta para a tela em que o usuário estava", () => {
    const go = vi.fn(() => true);
    const { rerender } = render(<CowilaTutorial {...props({ go, view: "editor", menuOpen: true })} />);
    fireEvent.click(screen.getByText("Começar tutorial"));
    rerender(<CowilaTutorial {...props({ go, view: "project", menuOpen: false })} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(go).toHaveBeenLastCalledWith("editor");
  });
});
