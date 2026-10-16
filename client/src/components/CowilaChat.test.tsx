// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CowilaChat, type CowilaChatProps } from "./CowilaChat";

afterEach(() => { cleanup(); localStorage.clear(); });
const openChat = () => fireEvent.click(screen.getByLabelText("Abrir a Cowila"));
const text = "A noite caiu sobre Gareth. Então Élia abriu a janela e viu Gareth. Depois chamou Élia baixinho, e Élia sorriu para Gareth.";
const book = { id: "b1", title: "Livro", nodes: [{ id: "n1", title: "Cap 1", kind: "chapter", content: text }] };
const base = (over: Partial<CowilaChatProps> = {}): CowilaChatProps => (localStorage.setItem("shakstory:cowila:leitura:b1", "1"), {
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
    localStorage.clear();
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
  it("alternativas do trecho: só troca o trecho exato, com o clique, e pode desfazer", async () => {
    const onReplace = vi.fn();
    const chosen = "Então Élia abriu a janela e viu Gareth.";
    const ask = vi.fn(async () => JSON.stringify({ alternativas: ["Então Élia abriu a janela e avistou Gareth.", "Élia abriu a janela e então viu Gareth."] }));
    render(<CowilaChat {...base({ ask, onReplaceDraft: onReplace })} />);
    openChat();
    const spy = vi.spyOn(window, "getSelection").mockReturnValue({ toString: () => chosen, anchorNode: document.body } as unknown as Selection);
    document.dispatchEvent(new Event("selectionchange"));
    spy.mockRestore();
    fireEvent.click(screen.getByText("Alternativas do trecho"));
    await waitFor(() => expect(screen.getByText("Usar a alternativa 1")).toBeTruthy());
    expect(onReplace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Usar a alternativa 1"));
    expect(onReplace).toHaveBeenCalledWith(text.replace(chosen, "Então Élia abriu a janela e avistou Gareth."));
  });

  it("alternativas sem seleção pedem para selecionar e não chamam a IA", async () => {
    const ask = vi.fn(async () => "");
    render(<CowilaChat {...base({ ask })} />);
    openChat();
    fireEvent.click(screen.getByText("Alternativas do trecho"));
    await waitFor(() => expect(screen.getByText(/Selecione no editor/)).toBeTruthy());
    expect(ask).not.toHaveBeenCalled();
  });

  it("modo livre: responde assunto geral e troca a resposta só se o verificador corrigir", async () => {
    const ask = vi.fn()
      .mockResolvedValueOnce("A capital da Austrália é Sydney.")
      .mockResolvedValueOnce("CORREÇÃO: A capital da Austrália é Camberra, não Sydney.");
    render(<CowilaChat {...base({ ask })} />);
    openChat();
    fireEvent.change(screen.getByLabelText("Mensagem para a Cowila"), { target: { value: "Qual a capital da Austrália?" } });
    fireEvent.click(screen.getByLabelText("Enviar"));
    await waitFor(() => expect(screen.getByText(/Camberra/)).toBeTruthy());
    expect(ask).toHaveBeenCalledTimes(2);
    expect((ask.mock.calls[0][0] as { prompt: string }).prompt).toContain("QUALQUER pergunta");
    expect(screen.queryByText(/é Sydney\.$/)).toBeNull();
  });
  it("modo livre: com OK mantém a resposta original", async () => {
    const ask = vi.fn().mockResolvedValueOnce("Camberra é a capital.").mockResolvedValueOnce("OK");
    render(<CowilaChat {...base({ ask })} />);
    openChat();
    fireEvent.change(screen.getByLabelText("Mensagem para a Cowila"), { target: { value: "Qual a capital da Austrália?" } });
    fireEvent.click(screen.getByLabelText("Enviar"));
    await waitFor(() => expect(screen.getByText("Camberra é a capital.")).toBeTruthy());
  });
  it("Cerebelo responde conta pura sem chamar a IA", async () => {
    const ask = vi.fn();
    render(<CowilaChat {...base({ ask })} />);
    openChat();
    fireEvent.change(screen.getByLabelText("Mensagem para a Cowila"), { target: { value: "Quanto é 17*23?" } });
    fireEvent.click(screen.getByLabelText("Enviar"));
    await waitFor(() => expect(screen.getByText("17 × 23 = 391")).toBeTruthy());
    expect(ask).not.toHaveBeenCalled();
  });
  it("conta errada é devolvida com os achados e, se persistir, a resposta é recusada", async () => {
    const ask = vi.fn(async () => "Então 17 × 23 = 392, certo.");
    render(<CowilaChat {...base({ ask })} />);
    openChat();
    fireEvent.click(screen.getByLabelText("Modo livre com verificação: responde qualquer assunto e confere a própria resposta (Consciente → Subconsciente → Cortex) antes de mostrar. Mais lento.") );
    fireEvent.change(screen.getByLabelText("Mensagem para a Cowila"), { target: { value: "Explique a multiplicação de dezessete por vinte e três" } });
    fireEvent.click(screen.getByLabelText("Enviar"));
    await waitFor(() => expect(screen.getByText(/Não vou te entregar uma resposta com conta errada/)).toBeTruthy());
    expect(ask).toHaveBeenCalledTimes(3);
    expect(((ask.mock.calls as unknown as Array<[{ prompt: string }]>)[1][0]).prompt).toContain("o valor exato é 391");
  });
  it("escreve um prólogo, mostra o texto e só grava depois de aprovar; dá para desfazer", async () => {
    const proposal = "TÍTULO: Prólogo\n\n" + "A névoa descia sobre a casa de Gareth e Élia ouvia os passos no corredor, um a um, sem coragem de abrir a porta ou de chamar por ninguém naquela noite.";
    const ask = vi.fn(async () => proposal);
    const undo = vi.fn();
    const onSaveSection = vi.fn(() => ({ replaced: false, undo }));
    render(<CowilaChat {...base({ ask, onSaveSection })} />);
    openChat();
    fireEvent.change(screen.getByLabelText("Mensagem para a Cowila"), { target: { value: "Escreva o prólogo do livro" } });
    fireEvent.click(screen.getByLabelText("Enviar"));
    await waitFor(() => screen.getByLabelText("Conteúdo proposto"));
    expect(onSaveSection).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Aprovar e gravar"));
    expect(onSaveSection).toHaveBeenCalledWith(expect.objectContaining({ key: "prologue", position: "start" }), "Prólogo", expect.stringContaining("névoa"));
    fireEvent.click(screen.getByText("Desfazer gravação"));
    expect(undo).toHaveBeenCalled();
  });
  it("“Não aprovar” descarta sem gravar", async () => {
    const ask = vi.fn(async () => "TÍTULO: Prefácio\n\n" + "Este livro nasceu de uma noite longa em que Gareth contou a Élia tudo o que sabia sobre a casa, a névoa e o que se escondia no fim do corredor.");
    const onSaveSection = vi.fn(() => ({ replaced: false, undo: () => {} }));
    render(<CowilaChat {...base({ ask, onSaveSection })} />);
    openChat();
    fireEvent.change(screen.getByLabelText("Mensagem para a Cowila"), { target: { value: "Crie um prefácio" } });
    fireEvent.click(screen.getByLabelText("Enviar"));
    await waitFor(() => screen.getByText("Não aprovar"));
    fireEvent.click(screen.getByText("Não aprovar"));
    expect(onSaveSection).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Conteúdo proposto")).toBeNull();
  });
  it("sem autorização de leitura a Cowila não escreve nem consulta a IA", async () => {
    const ask = vi.fn(async () => "x");
    const onSaveSection = vi.fn(() => ({ replaced: false, undo: () => {} }));
    const props = base({ ask, onSaveSection });
    localStorage.removeItem("shakstory:cowila:leitura:b1");
    render(<CowilaChat {...props} />);
    openChat();
    fireEvent.change(screen.getByLabelText("Mensagem para a Cowila"), { target: { value: "Escreva o epílogo" } });
    fireEvent.click(screen.getByLabelText("Enviar"));
    await waitFor(() => screen.getByText(/preciso da sua autorização/));
    expect(ask).not.toHaveBeenCalled();
    expect(onSaveSection).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Autorizar leitura"));
    expect(localStorage.getItem("shakstory:cowila:leitura:b1")).toBe("1");
  });
});
