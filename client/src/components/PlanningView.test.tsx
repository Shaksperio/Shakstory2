// @vitest-environment jsdom
import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlanningView } from "./WriterStudio";

type EditorialStatus = "planning" | "draft" | "editing" | "revision" | "completed";
type Planning = { characters: Array<{ id: string; name: string; role: string; notes: string; status?: EditorialStatus }>; locations: Array<{ id: string; name: string; atmosphere: string; notes: string; status?: EditorialStatus }>; timeline: Array<{ id: string; title: string; date: string; description: string; status?: EditorialStatus }> };

let currentPlanning: Planning;

function Harness() {
  const [planning, setPlanning] = useState<Planning>({ characters: [], locations: [], timeline: [] });
  currentPlanning = planning;
  return <PlanningView book={{ id: "book-1", title: "Caderno", status: "planning", targetWordCount: 50000, updatedAt: 1, nodes: [], planning }} onUpdate={setPlanning} />;
}

describe("PlanningView", () => {
  it("creates characters, locations and timeline events", () => {
    const { rerender } = render(<Harness />);
    fireEvent.change(screen.getByPlaceholderText("Nome do personagem"), { target: { value: "Lia" } });
    fireEvent.change(screen.getByPlaceholderText("Função na história"), { target: { value: "Protagonista" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(screen.getByText("Lia")).toBeTruthy();
    const characterId = currentPlanning.characters[0].id;
    expect(characterId).toMatch(/^characters-/);

    fireEvent.click(screen.getByText("Locais", { exact: true }));
    fireEvent.change(screen.getByPlaceholderText("Nome do local"), { target: { value: "Casa azul" } });
    fireEvent.change(screen.getByPlaceholderText("Atmosfera"), { target: { value: "Silenciosa" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(screen.getByText("Casa azul")).toBeTruthy();
    const locationId = currentPlanning.locations[0].id;
    expect(locationId).toMatch(/^locations-/);

    fireEvent.click(screen.getByText("Timeline", { exact: true }));
    fireEvent.change(screen.getByPlaceholderText("Título do evento"), { target: { value: "A partida" } });
    fireEvent.change(screen.getByPlaceholderText("Data ou ordem"), { target: { value: "Noite 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(screen.getByText("A partida")).toBeTruthy();
    const timelineId = currentPlanning.timeline[0].id;
    expect(timelineId).toMatch(/^timeline-/);
    rerender(<Harness />);
    expect(currentPlanning.characters[0].id).toBe(characterId);
    expect(currentPlanning.locations[0].id).toBe(locationId);
    expect(currentPlanning.timeline[0].id).toBe(timelineId);

    fireEvent.click(screen.getByText("Personagens", { exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByPlaceholderText("Função na história"), { target: { value: "Protagonista revisada" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "completed" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(currentPlanning.characters[0].id).toBe(characterId);
    expect(currentPlanning.characters[0].role).toBe("Protagonista revisada");
    expect(currentPlanning.characters[0].status).toBe("completed");
    fireEvent.click(screen.getByRole("button", { name: "Excluir Lia" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusão" }));
    expect(screen.queryByText("Lia")).toBeNull();
  });
});
