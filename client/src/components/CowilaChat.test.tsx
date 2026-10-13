// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CowilaChat, type CowilaChatProps } from "./CowilaChat";

afterEach(() => { cleanup(); localStorage.clear(); });
const openChat = () => fireEvent.click(screen.getByLabelText("Abrir a Cowila"));
const text = "A noite caiu sobre Gareth. Então Élia abriu a janela e viu Gareth. Depois chamou Élia baixinho, e Élia sorriu para Gareth.";
const book = { id: "b1", title: "Livro", nodes: [{ id: "n1", title: "Cap 1", kind: "chapter", content: text }] };
const base = (over: Partial<CowilaChatProps> = {}): CowilaChatProps => ({
  books: [book], active: book, activeNodeId: "n1", draft: text, online: true,
  ask: vi.fn(async () => ""), onAddCharacters: vi.fn(() => ({ added: 2, updated: 0 })), onSetDescription: vi.fn(), onReplaceDraft: vi.fn(), ...over,
});

describe("CowilaChat", () => {
  it("fica no lado direito e explica o Shakstory sem precisar de IA", async () => {
    const ask = vi.fn(async () => "");
    render(<CowilaChat {...base({ ask, online: false })} />);
    expect(screen.queryByLabelText("Cowila, atendimento online")).toBeNull();
    openChat();
    expect(screen.getByLabelText("Cowila, atendimento online").className).toContain("right-0");
    fireEvent.click(screen.getByText("Como uso o Shakstory?"));
    await waitFor(() => expect(screen.getByText(/Como o Shakstory se organiza/)).toBeTruthy());
    expect(ask).not.toHaveBeenCalled();
  });
  it("preenche personagens: IA só com nomes reais; cai no modo local se a IA falhar", async () => {
    const onAdd = vi.fn(() => ({ added: 2, updated: 0 }));
    const ask = vi.fn(async () => '{"characters":[{"name":"Élia","role":"protagonista","notes":"Abre a janela."},{"name":"Fantasma","role":"x","notes":"y"}]}');
    render(<CowilaChat {...base({ ask, onAddCharacters: onAdd })} />);
    openChat();
    fireEvent.click(screen.getByText("Preencher personagens"));
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    const found = (onAdd.mock.calls[0] as unknown as [Array<{ name: string }>])[0];
    expect(found.map(f => f.name)).toEqual(["Élia"]);
    cleanup();
    const onAdd2 = vi.fn(() => ({ added: 2, updated: 0 }));
    render(<CowilaChat {...base({ ask: vi.fn(async () => { throw new Error("fora do ar"); }), onAddCharacters: onAdd2 })} />);
    openChat();
    fireEvent.click(screen.getAllByText("Preencher personagens")[0]);
    await waitFor(() => expect(onAdd2).toHaveBeenCalled());
    expect((onAdd2.mock.calls[0] as unknown as [Array<{ notes: string }>])[0][0].notes).toContain("A confirmar");
  });
  it("reescrita só é aplicada com o clique e pode ser desfeita", async () => {
    const onReplace = vi.fn();
    const ask = vi.fn(async () => text.replace("viu", "avistou"));
    render(<CowilaChat {...base({ ask, onReplaceDraft: onReplace })} />);
    openChat();
    fireEvent.click(screen.getByText("Reescrever capítulo"));
    await waitFor(() => expect(screen.getByText("Aplicar ao capítulo")).toBeTruthy());
    expect(onReplace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Aplicar ao capítulo"));
    expect(onReplace).toHaveBeenCalledTimes(1);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByText("Desfazer reescrita"));
    expect(onReplace).toHaveBeenLastCalledWith(text);
  });
});
