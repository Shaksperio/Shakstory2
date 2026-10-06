// @vitest-environment jsdom
import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectView } from "./WriterStudio";

function Harness() {
  const [book, setBook] = useState<React.ComponentProps<typeof ProjectView>["book"]>({ id: "book-1", title: "Caderno", status: "planning", targetWordCount: 50000, updatedAt: 1, nodes: [], nextSteps: [] });
  return <ProjectView book={book} onNavigate={() => undefined} onUpdate={patch => setBook(current => ({ ...current, ...patch }))} />;
}

describe("ProjectView", () => {
  it("shows project status and persists next steps without editing chapters", () => {
    render(<Harness />);
    expect(screen.getByText("Planejamento")).toBeTruthy();
    expect(screen.getByText("0 / 50.000")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Adicionar um próximo passo"), { target: { value: "Definir a sinopse" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar próximo passo" }));
    expect(screen.getByText("Definir a sinopse")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Meta total de palavras"), { target: { value: "1000" } });
    fireEvent.blur(screen.getByLabelText("Meta total de palavras"));
    fireEvent.change(screen.getByLabelText("Meta diária"), { target: { value: "250" } });
    fireEvent.change(screen.getByLabelText("Prazo"), { target: { value: "2026-12-31" } });
    expect(screen.getByText(/250 por dia/)).toBeTruthy();
    expect(screen.getByText(/prazo 2026-12-31/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Criar snapshot" }));
    expect(screen.getByText("Snapshot 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restaurar" }));
  });
});
