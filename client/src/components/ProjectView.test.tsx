// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildProjectBackup } from "@shared/project-backup";
import { ProjectView } from "./WriterStudio";

afterEach(() => {cleanup(); localStorage.clear(); vi.restoreAllMocks();});

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


it("previews a portable backup and preserves the current project before explicit restore", async () => {
  const current = {id: "qa", title: "Antes", status: "draft" as const, targetWordCount: 500, updatedAt: 1, nodes: [{id: "node", kind: "chapter" as const, title: "Capítulo", content: "Texto atual", updatedAt: 1}]};
  const restored = {...current, title: "Depois", nodes: [{...current.nodes[0], content: "Texto recuperado", richContent: "<p>Texto <strong>recuperado</strong></p>"}]};
  const onUpdate = vi.fn();
  render(<ProjectView book={current} onNavigate={() => undefined} onUpdate={onUpdate} />);
  const file = {size: 100, text: async () => buildProjectBackup(restored)};
  fireEvent.change(screen.getByLabelText("Abrir backup do projeto"), {target: {files: [file]}});
  await waitFor(() => expect(screen.getByRole("button", {name: "Confirmar restauração do backup"})).toBeTruthy());
  expect(onUpdate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", {name: "Confirmar restauração do backup"}));
  expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({title: "Depois", nodes: restored.nodes, publication: undefined, story: undefined, review: undefined}));
  expect(JSON.parse(localStorage.getItem("shakstory:snapshots:qa")!)[0].book).toEqual(current);
});

it("stops restoration if the current snapshot cannot be saved", async () => {
  const current = {id: "qa", title: "Antes", status: "draft" as const, targetWordCount: 500, updatedAt: 1, nodes: []};
  const onUpdate = vi.fn();
  render(<ProjectView book={current} onNavigate={() => undefined} onUpdate={onUpdate} />);
  fireEvent.change(screen.getByLabelText("Abrir backup do projeto"), {target: {files: [{size: 100, text: async () => buildProjectBackup(current)}]}});
  await waitFor(() => expect(screen.getByRole("button", {name: "Confirmar restauração do backup"})).toBeTruthy());
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {throw new Error("quota");});
  fireEvent.click(screen.getByRole("button", {name: "Confirmar restauração do backup"}));
  expect(onUpdate).not.toHaveBeenCalled();
  expect(screen.getByText(/A restauração foi interrompida/)).toBeTruthy();
});
