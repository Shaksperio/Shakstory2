// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IsbnLookup } from "./IsbnLookup";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("IsbnLookup", () => {
  it("rejeita ISBN inválido sem consultar a rede", () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    render(<IsbnLookup value="123" onChange={() => {}} onApply={() => {}} />);
    fireEvent.click(screen.getByText("Buscar dados"));
    expect(screen.getByRole("status").textContent).toContain("ISBN inválido");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("busca e aplica os dados encontrados", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ items: [{ volumeInfo: { title: "Dom Casmurro", authors: ["Machado de Assis"], publisher: "P", description: "D" } }] }) })));
    const onApply = vi.fn();
    render(<IsbnLookup value="978-85-359-0277-8" onChange={() => {}} onApply={onApply} />);
    fireEvent.click(screen.getByText("Buscar dados"));
    await waitFor(() => screen.getByTestId("isbn-result"));
    fireEvent.click(screen.getByText("Aplicar aos metadados"));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ title: "Dom Casmurro", isbn: "9788535902778" }), false);
  });
});
