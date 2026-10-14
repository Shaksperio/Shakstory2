// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReviewPanel } from "./ReviewPanel";

afterEach(() => { cleanup(); localStorage.clear(); });
const chapters = [
  { id: "c1", title: "Um", text: "Ontem Élia entrou em Nightglen. Depois Élia saiu de Nightglen. Então Élia voltou para Nightglen. Por fim Élia riu em Nightglen." },
  { id: "c2", title: "Dois", text: "" },
];

describe("ReviewPanel", () => {
  it("mostra as passagens, marca como visto e guarda neste aparelho", () => {
    render(<ReviewPanel bookId="b1" chapters={chapters} />);
    expect(screen.getByText("1. Estrutura")).toBeTruthy();
    expect(screen.getByText(/Capítulo sem texto/)).toBeTruthy();
    fireEvent.click(screen.getByText("Marcar como visto"));
    expect(JSON.parse(localStorage.getItem("shakstory:review:b1")!).done.length).toBe(1);
    expect(screen.getByText("Reabrir")).toBeTruthy();
  });

  it("ficha de estilo confirma nomes no dicionário do Corretor sem duplicar", () => {
    render(<ReviewPanel bookId="b1" chapters={chapters} />);
    fireEvent.click(screen.getByText("Confirmar nomes no dicionário do livro"));
    const names = JSON.parse(localStorage.getItem("shakstory:proofread:b1")!).names as string[];
    expect(names).toContain("Élia");
    fireEvent.click(screen.getByText("Confirmar nomes no dicionário do livro"));
    expect(screen.getByText(/já estão no dicionário/)).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("shakstory:proofread:b1")!).names.length).toBe(names.length);
  });

  it("comentários para mim: adiciona, resolve e remove", () => {
    render(<ReviewPanel bookId="b1" chapters={chapters} />);
    fireEvent.change(screen.getByLabelText("Novo comentário"), { target: { value: "verificar a data" } });
    fireEvent.click(screen.getByText("Adicionar"));
    expect(screen.getByText(/verificar a data/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Resolvido: verificar a data"));
    expect(JSON.parse(localStorage.getItem("shakstory:review:b1")!).notes[0].done).toBe(true);
    fireEvent.click(screen.getByLabelText("Remover: verificar a data"));
    expect(screen.queryByText(/verificar a data/)).toBeNull();
  });
});
