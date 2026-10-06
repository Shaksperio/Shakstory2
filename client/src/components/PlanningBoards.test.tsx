// @vitest-environment jsdom
import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlanningBoards, createPlanningBoard, type PlanningBoard } from "./PlanningBoards";

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
