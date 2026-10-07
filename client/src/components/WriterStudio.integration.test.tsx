// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  const analysis = {
    summary: "A imagem inicial é clara.",
    strengths: ["Imagem concreta"],
    suggestions: [{ category: "gramatica", severity: "revisar", original: "A noite", suggestion: "A tarde", explanation: "Alternativa de teste.", confidence: 0.9, start: 0, end: 7 }],
    narrativeNotes: [], model: "literary-model", availableModels: ["literary-model"],
  };
  const coauthor = {
    alternatives: [
      { id: "faithful-1", label: "Fiel à cena", approach: "Preservar a cena.", text: "Uma sombra atravessou a janela.", warnings: [] },
      { id: "tension-2", label: "Mais tensão", approach: "Aumentar a pressão.", text: "Do corredor veio o som de passos apressados.", warnings: [] },
    ],
    canonWarnings: [],
    model: "coauthor-model",
    context: { canonFacts: 2, memoryMessages: 3, requestedWords: 180 },
  };
  const continuity = {
    report: "OK — cronologia coerente.\nRISCO — confirme o que a personagem já sabe antes da próxima revelação.",
    canonWarnings: ["Revisar conhecimento da personagem focal."],
    model: "continuity-model",
    context: {
      canonFacts: 6,
      memoryMessages: 3,
      bookCanonFacts: 2,
      seriesCanonFacts: 3,
      universeCanonFacts: 1,
      planningEntities: 4,
      storyEntities: 5,
    },
  };
  let literaryOptions: { onSuccess?: (value: typeof analysis) => void } = {};
  let coauthorOptions: { onSuccess?: (value: typeof coauthor) => void } = {};
  let continuityOptions: { onSuccess?: (value: typeof continuity) => void } = {};
  const literaryMutation = { isPending: false, mutate: vi.fn(() => literaryOptions.onSuccess?.(analysis)) };
  const coauthorMutation = { isPending: false, mutate: vi.fn(() => coauthorOptions.onSuccess?.(coauthor)), error: null };
  const continuityMutation = { isPending: false, mutate: vi.fn(() => continuityOptions.onSuccess?.(continuity)), error: null };
  const library = { version: 1, books: [{ id: "book-1", title: "Caderno", status: "draft", targetWordCount: 50000, updatedAt: Date.now(), nodes: [{ id: "chapter-1", title: "Capítulo 1", kind: "chapter", content: "A noite caiu.", updatedAt: Date.now() },] }] };
  const trpc = {
    data: { get: { useQuery: vi.fn(() => ({ data: { data: harness.remoteLibrary, sha: "sha-1" }, isLoading: false, refetch: vi.fn() })) }, status: { useQuery: vi.fn(() => ({ data: { status: "synced" } })) }, put: { useMutation: vi.fn(() => ({ isPending: false, mutate: vi.fn() })) } },
    literaryAssist: { models: { useQuery: vi.fn(() => ({ data: { models: [{ id: "literary-model" }] } })) }, analyze: { useMutation: vi.fn((options: typeof literaryOptions) => { literaryOptions = options; return literaryMutation; }) }, coauthor: { useMutation: vi.fn((options: typeof coauthorOptions) => { coauthorOptions = options; return coauthorMutation; }) }, continuity: { useMutation: vi.fn((options: typeof continuityOptions) => { continuityOptions = options; return continuityMutation; }) } },
    assets: { uploadCover: { useMutation: vi.fn(() => ({ isPending: false, mutate: vi.fn(), error: null })) } },
    security: {
      antivirus: {
        sessions: { useQuery: vi.fn(() => ({ data: [], isError: false, error: null })) },
        rotate: { useMutation: vi.fn(() => ({ isPending: false, mutate: vi.fn() })) },
        revoke: { useMutation: vi.fn(() => ({ isPending: false, mutate: vi.fn() })) },
      },
    },
    useUtils: vi.fn(() => ({
      data: { status: { invalidate: vi.fn() } },
      security: { antivirus: { sessions: { invalidate: vi.fn() } } },
    })),
  };
  return { trpc, literaryMutation, coauthorMutation, continuityMutation, analysis, coauthor, continuity, library, remoteLibrary: library as typeof library | { version: 1; books: [] } };
});

vi.mock("@/lib/trpc", () => ({ trpc: harness.trpc }));
import WriterStudio from "./WriterStudio";

describe("WriterStudio integrated literary assistance", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    localStorage.clear();
  });


  it("restores the active workspace and rich text across a real remount when remote data is empty", async () => {
    const saved = { ...harness.library, books: [{ ...harness.library.books[0], nodes: [{ ...harness.library.books[0].nodes[0], richContent: "<p><em>Texto restaurado</em></p>", content: "Texto restaurado" }] }] };
    localStorage.setItem("shakstory:library", JSON.stringify(saved));
    localStorage.setItem("shakstory:active-book", "book-1");
    localStorage.setItem("shakstory:active-node", "chapter-1");
    harness.remoteLibrary = { version: 1, books: [] };
    const first = render(<WriterStudio />);
    const firstEditor = await first.findByRole("textbox", { name: "Editar bloco 1" });
    expect(firstEditor.innerHTML).toContain("<em>Texto restaurado</em>");
    first.unmount();
    const second = render(<WriterStudio />);
    const secondEditor = await second.findByRole("textbox", { name: "Editar bloco 1" });
    expect(secondEditor.innerHTML).toContain("<em>Texto restaurado</em>");
    second.unmount();
    harness.remoteLibrary = harness.library;
  });

  it("opens every book workspace area from navigation without requiring a prior card click", async () => {
    render(<WriterStudio />);
    await screen.findByRole("button", { name: "Continuar Caderno" });

    fireEvent.click(screen.getByRole("button", { name: "Projeto" }));
    expect(await screen.findByText("Projeto do livro")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Planejar" }));
    expect(await screen.findByText("Seu projeto, antes das páginas.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Manuscrito" }));
    expect(await screen.findByRole("textbox", { name: "Editar bloco 1" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Preparar" }));
    expect(await screen.findByText("Preparação editorial")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Biblioteca" }));
    expect(await screen.findByText("Minha biblioteca")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Segurança" }));
    expect(await screen.findByText(/seguran/i)).toBeTruthy();
  });

  it("keeps the rich editor DOM stable while typing so the caret is not reset", async () => {
    render(<WriterStudio />);
    await screen.findByRole("button", { name: "Continuar Caderno" });
    fireEvent.click(screen.getByRole("button", { name: "Manuscrito" }));
    const editor = await screen.findByRole("textbox", { name: "Editar bloco 1" });
    await waitFor(() => expect(editor.textContent).toBe("A noite caiu."));

    editor.innerHTML = "<p>ABC</p>";
    const paragraph = editor.firstChild;
    fireEvent.input(editor);

    expect(editor.firstChild).toBe(paragraph);
    expect(editor.textContent).toBe("ABC");

    const textNode = editor.firstChild?.firstChild;
    expect(textNode).toBeTruthy();
    if (textNode) textNode.textContent = "ABCD";
    fireEvent.input(editor);

    expect(editor.firstChild).toBe(paragraph);
    expect(editor.textContent).toBe("ABCD");
  });

  it("sends the draft only after analysis is requested and applies the returned suggestion manually", async () => {
    render(<WriterStudio />);
    fireEvent.click(screen.getByRole("button", { name: "Continuar Caderno" }));
    expect(await screen.findByText("Projeto do livro")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Manuscrito" }));
    const editor = await screen.findByRole("textbox", { name: "Editar bloco 1" });
    await waitFor(() => expect(editor.textContent).toBe("A noite caiu."));
    expect(screen.getByRole("button", { name: "Desfazer" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refazer" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Localizar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Título H1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Título H6" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Citação" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lista numerada" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Alinhar à direita" })).toBeTruthy();
    expect(screen.getAllByText(/palavras/i).length).toBeGreaterThan(0);
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
    fireEvent.mouseDown(screen.getByRole("button", { name: "Desfazer" }));
    fireEvent.mouseDown(screen.getByRole("button", { name: "Refazer" }));
    expect(execCommand).toHaveBeenCalledWith("undo", false, undefined);
    expect(execCommand).toHaveBeenCalledWith("redo", false, undefined);

    const themeButton = screen.getByRole("button", { name: "Alternar tema" });
    expect(themeButton.textContent).toContain("Tema escuro");
    fireEvent.click(themeButton);
    expect(themeButton.textContent).toContain("Tema clássico");
    fireEvent.click(themeButton);
    fireEvent.click(screen.getByRole("button", { name: "Modo sem distração" }));
    expect(screen.getByRole("button", { name: "Sair do foco" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sair do foco" }));
    fireEvent.click(screen.getByRole("button", { name: "Localizar" }));
    expect(screen.getByRole("textbox", { name: "Localizar texto" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Localizar" }));

    fireEvent.click(screen.getByRole("button", { name: "Analisar trecho" }));
    await waitFor(() => expect(screen.getByText("A imagem inicial é clara.")).toBeTruthy());
    expect(editor.textContent).toBe("A noite caiu.");

    fireEvent.click(screen.getByRole("button", { name: "Aplicar sugestão" }));
    expect(editor.textContent).toBe("A tarde caiu.");

    editor.innerHTML = '<p><strong>A tarde caiu.</strong> A cidade acordou. <a href="https://example.com">Fonte</a><img src="https://example.com/capa.jpg" alt="Capa" /></p>';
    fireEvent.input(editor);
    await new Promise(resolve => setTimeout(resolve, 950));
    const bibliotecaButtons = screen.getAllByRole("button", { name: "Biblioteca" });
    fireEvent.click(bibliotecaButtons[bibliotecaButtons.length - 1]);
    fireEvent.click(screen.getByRole("button", { name: "Continuar Caderno" }));
    fireEvent.click(screen.getByRole("button", { name: "Manuscrito" }));
    const reopenedEditor = await screen.findByRole("textbox", { name: "Editar bloco 1" });
    expect(reopenedEditor.textContent).toBe("A tarde caiu. A cidade acordou. Fonte");
    expect(reopenedEditor.innerHTML).toContain("<strong>A tarde caiu.</strong>");
    expect(reopenedEditor.innerHTML).toContain('href="https://example.com"');
    expect(reopenedEditor.innerHTML).toContain('src="https://example.com/capa.jpg"');

    fireEvent.click(screen.getByRole("button", { name: "Projeto" }));
    expect(await screen.findByText("Projeto do livro")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Planejar" }));
    expect(await screen.findByText("Seu projeto, antes das páginas.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Manuscrito" }));
    expect(await screen.findByRole("textbox", { name: "Editar bloco 1" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Preparar" }));
    expect(await screen.findByText("Preparação editorial")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Incluir dedicatória" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Conteúdo Dedicatória" }), { target: { value: "Para quem lê." } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar metadados" }));
    fireEvent.click(screen.getByRole("button", { name: "Projeto" }));
    fireEvent.click(screen.getByRole("button", { name: "Preparar" }));
    expect((await screen.findByRole("textbox", { name: "Conteúdo Dedicatória" }) as HTMLTextAreaElement).value).toBe("Para quem lê.");
  });

  it("generates coauthor alternatives without changing the draft, then accepts and undoes one", async () => {
    render(<WriterStudio />);
    fireEvent.click(screen.getByRole("button", { name: "Continuar Caderno" }));
    fireEvent.click(await screen.findByRole("button", { name: "Manuscrito" }));
    const editor = await screen.findByRole("textbox", { name: "Editar bloco 1" });
    await waitFor(() => expect(editor.textContent).toBe("A noite caiu."));

    fireEvent.click(screen.getByRole("button", { name: "Contexto" }));
    expect(await screen.findByText("Style DNA")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Revisar" }));
    fireEvent.click(screen.getByRole("tab", { name: "Coautora" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Intenção da continuação" }), {
      target: { value: "Aumentar a tensão sem revelar o segredo." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Gerar alternativas" }));

    await waitFor(() => expect(screen.getByText("Alternativa 1 · Fiel à cena")).toBeTruthy());
    expect(editor.textContent).toBe("A noite caiu.");
    expect(harness.coauthorMutation.mutate).toHaveBeenCalledWith(expect.objectContaining({
      bookId: "book-1",
      sceneId: "chapter-1",
      text: "A noite caiu.",
      intent: "Aumentar a tensão sem revelar o segredo.",
      alternativeCount: 3,
      styleSample: "A noite caiu.",
    }));

    const useButtons = screen.getAllByRole("button", { name: "Usar esta continuação" });
    fireEvent.click(useButtons[0]);
    await waitFor(() => expect(editor.textContent).toContain("Uma sombra atravessou a janela."));
    expect(editor.textContent).toContain("A noite caiu.");

    fireEvent.click(screen.getByRole("button", { name: "Desfazer última aplicação" }));
    await waitFor(() => expect(editor.textContent).toBe("A noite caiu."));
  });

  it("runs the Continuity Radar with the real scene without modifying the manuscript", async () => {
    render(<WriterStudio />);
    fireEvent.click(screen.getByRole("button", { name: "Continuar Caderno" }));
    fireEvent.click(await screen.findByRole("button", { name: "Manuscrito" }));
    const editor = await screen.findByRole("textbox", { name: "Editar bloco 1" });
    await waitFor(() => expect(editor.textContent).toBe("A noite caiu."));

    fireEvent.click(screen.getByRole("button", { name: "Contexto" }));
    fireEvent.click(await screen.findByRole("button", { name: "Verificar continuidade" }));

    await waitFor(() => expect(screen.getByText(/cronologia coerente/)).toBeTruthy());
    expect(editor.textContent).toBe("A noite caiu.");
    expect(harness.continuityMutation.mutate).toHaveBeenCalledWith(expect.objectContaining({
      bookId: "book-1",
      bookTitle: "Caderno",
      sceneId: "chapter-1",
      sceneTitle: "Capítulo 1",
      text: "A noite caiu.",
    }));
    expect(screen.getByText(/Revisar conhecimento/)).toBeTruthy();
  });

  it("splits and merges manuscript nodes through the editor controls", async () => {
    render(<WriterStudio />);
    fireEvent.click(screen.getByRole("button", { name: "Continuar Caderno" }));
    fireEvent.click(await screen.findByRole("button", { name: "Manuscrito" }));
    await screen.findByRole("textbox", { name: "Editar bloco 1" });
    fireEvent.click(screen.getByRole("button", { name: "Dividir aqui" }));
    expect(await screen.findByText(/continuação/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Unir ao próximo" }));
    await waitFor(() => expect(screen.queryByText(/continuação/)).toBeNull());
  });

  it("exposes contextual navigation and protected library CRUD actions", async () => {
    render(<WriterStudio />);
    expect(screen.getByRole("button", { name: "Abrir menu de navegação" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Abrir menu de navegação" }));
    expect(screen.getByRole("dialog", { name: "Menu de navegação" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fechar menu" }));
    expect(screen.getByText("ISBN não informado")).toBeTruthy();
    expect(screen.getByText("páginas")).toBeTruthy();
    expect(screen.getByText("caracteres")).toBeTruthy();
    expect(screen.getByText("edição")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Editar livro" }));
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Caderno revisado" } });
    fireEvent.change(screen.getByLabelText("Autor"), { target: { value: "Autora QA" } });
    fireEvent.change(screen.getByLabelText("ISBN"), { target: { value: "978-qa" } });
    fireEvent.change(screen.getByLabelText("Universo"), { target: { value: "Universo Editado" } });
    fireEvent.change(screen.getByLabelText("Série"), { target: { value: "Série Editada" } });
    fireEvent.change(screen.getByLabelText("Status editorial"), { target: { value: "completed" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Caderno revisado")).toBeTruthy();
    expect(screen.getByText("Autora QA")).toBeTruthy();
    expect(screen.getByText("ISBN 978-qa")).toBeTruthy();
    expect(screen.getAllByText("Concluído").length).toBeGreaterThan(0);
    const editedLibrary = JSON.parse(localStorage.getItem("shakstory:library") ?? "{}") as { books?: Array<{ title?: string; hierarchy?: { universeId?: string; universeName?: string; seriesId?: string; seriesName?: string } }> };
    expect(editedLibrary.books?.find(book => book.title === "Caderno revisado")?.hierarchy).toMatchObject({
      universeId: "universe-universo-editado",
      universeName: "Universo Editado",
      seriesId: "series-serie-editada",
      seriesName: "Série Editada",
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Filtrar por status" }), { target: { value: "completed" } });
    expect(screen.getByText("Caderno revisado")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Ordenar biblioteca" }), { target: { value: "progress" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Filtrar por status" }), { target: { value: "all" } });

    fireEvent.click(screen.getByRole("button", { name: "Zerar Caderno revisado" }));
    expect(screen.getByRole("heading", { name: "Zerar história?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar zerar" }));
    expect(await screen.findByText("Projeto do livro")).toBeTruthy();
    expect(screen.getByText("Planejamento")).toBeTruthy();
  });

  it("creates a book linked to a universe and series and persists the hierarchy", async () => {
    render(<WriterStudio />);
    fireEvent.click(screen.getByRole("button", { name: "Novo livro" }));
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Livro da Série" } });
    fireEvent.change(screen.getByLabelText("Universo"), { target: { value: "Universo QA" } });
    fireEvent.change(screen.getByLabelText("Série"), { target: { value: "Série QA" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar livro" }));

    expect(await screen.findByText("Projeto do livro")).toBeTruthy();
    expect(screen.getByText("Universo: Universo QA")).toBeTruthy();
    expect(screen.getByText("Série: Série QA")).toBeTruthy();

    const persisted = JSON.parse(localStorage.getItem("shakstory:library") ?? "{}") as { books?: Array<{ title?: string; hierarchy?: { bookId?: string; universeId?: string; universeName?: string; seriesId?: string; seriesName?: string } }> };
    const created = persisted.books?.find(book => book.title === "Livro da Série");
    expect(created?.hierarchy).toMatchObject({
      bookId: expect.any(String),
      universeId: "universe-universo-qa",
      universeName: "Universo QA",
      seriesId: "series-serie-qa",
      seriesName: "Série QA",
    });
  });
});
