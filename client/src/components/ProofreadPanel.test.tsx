// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProofreadPanel } from "./ProofreadPanel";

describe("ProofreadPanel", () => {
  it("lista dúvidas, aceita só com clique e permite desfazer", () => {
    const onApply = vi.fn();
    render(<ProofreadPanel bookId="b1" text="Voce chegou." html="<p>Voce chegou.</p>" onApply={onApply} />);
    expect(screen.getByText("1 dúvida neste capítulo.")).toBeTruthy();
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Aceitar"));
    expect(onApply).toHaveBeenCalledWith("Você chegou.", "<p>Você chegou.</p>");
    fireEvent.click(screen.getByText("Desfazer"));
    expect(onApply).toHaveBeenLastCalledWith("Voce chegou.", "<p>Voce chegou.</p>");
  });
  it("não aplica quando há formatação ao redor", () => {
    const onApply = vi.fn();
    render(<ProofreadPanel bookId="b2" text="Voce chegou." html="<p><em>Voce</em> chegou.</p>" onApply={onApply} />);
    fireEvent.click(screen.getByText("Aceitar"));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("manualmente");
  });
  it("sempre ignorar remove o alerta", () => {
    render(<ProofreadPanel bookId="b3" text="Voce chegou." html="" onApply={() => {}} />);
    fireEvent.click(screen.getByText("Sempre ignorar neste livro"));
    expect(screen.getByText("Nenhuma dúvida neste capítulo.")).toBeTruthy();
  });
});
