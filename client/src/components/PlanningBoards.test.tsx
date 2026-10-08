// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlanningBoards, createPlanningBoard, type PlanningBoard } from "./PlanningBoards";

afterEach(() => {cleanup(); localStorage.clear();});

let currentBoards: PlanningBoard[] = [];

function Harness() {
  const [boards, setBoards] = useState<PlanningBoard[]>([]);
  currentBoards = boards;
  return <PlanningBoards boards={boards} onChange={setBoards} onBack={() => undefined} />;
}

describe("PlanningBoards", () => {
  it("creates a board with editorial workflow columns", () => {
    const board = createPlanningBoard("Arco principal");
    expect(board.title).toBe("Arco principal");
    expect(board.columns.map(column => column.title)).toEqual(["Ideias", "Em desenvolvimento", "Resolvido"]);
    expect(board.cards).toEqual([]);
  });

  it("persists boards and cards through onChange", () => {
    render(<Harness />);

    fireEvent.change(screen.getByPlaceholderText("Ex.: Arco do livro 1"), { target: { value: "Arco de Elia" } });
    fireEvent.click(screen.getByRole("button", { name: /Criar board/i }));
    expect(currentBoards).toHaveLength(1);
    expect(currentBoards[0].title).toBe("Arco de Elia");

    fireEvent.click(screen.getByRole("button", { name: "Personagem" }));
    fireEvent.change(screen.getByPlaceholderText("Título do card"), { target: { value: "Elia" } });
    fireEvent.change(screen.getByPlaceholderText("Tags separadas por vírgula"), { target: { value: "protagonista, NightGlen" } });
    fireEvent.click(screen.getByRole("button", { name: /Adicionar card/i }));

    expect(currentBoards[0].cards).toHaveLength(1);
    expect(currentBoards[0].cards[0].title).toBe("Elia");
    expect(currentBoards[0].cards[0].kind).toBe("character");
    expect(currentBoards[0].cards[0].tags).toEqual(["protagonista", "NightGlen"]);
    expect(screen.getByText("Elia")).toBeTruthy();
  });
});

it("reuses a custom template in a fresh book without copying card IDs", () => {
  const first = render(<Harness />);
  fireEvent.click(screen.getByRole("button", {name: /Criar board/i}));
  fireEvent.change(screen.getByPlaceholderText("Título do card"), {target: {value: "Desejo e consequência"}});
  fireEvent.change(screen.getByPlaceholderText("Notas, pesquisa, perguntas ou estrutura..."), {target: {value: "Desejo:\nConsequência:"}});
  fireEvent.change(screen.getByLabelText("Nome do template"), {target: {value: "Arco pessoal"}});
  fireEvent.click(screen.getByRole("button", {name: "Salvar formulário como template"}));
  first.unmount();
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", {name: /Criar board/i}));
  fireEvent.click(screen.getByRole("button", {name: "Usar template Arco pessoal"}));
  expect((screen.getByPlaceholderText("Título do card") as HTMLInputElement).value).toBe("Desejo e consequência");
  expect(currentBoards[0].cards).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", {name: /Adicionar card/i}));
  expect(currentBoards[0].cards[0].body).toBe("Desejo:\nConsequência:");
});
