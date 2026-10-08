// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoryEnginePanel } from "./WriterStudio";

afterEach(cleanup);

describe("StoryEnginePanel", () => {
  it("persists objectives, conflicts and notes through the project callback", () => {
    type TestStory = { objectives: Array<{ id: string; title: string; description: string }>; conflicts: Array<{ id: string; title: string; description: string }>; relations: Array<{ id: string; from: string; to: string; label: string }>; notes: string[]; scenes: Array<{ id: string; title: string; objective: string; conflict: string; notes: string }> };
    let story: TestStory = { objectives: [], conflicts: [], relations: [], notes: [], scenes: [] };
    const onUpdate = vi.fn((next: TestStory) => { story = next; });
    const { rerender } = render(<StoryEnginePanel story={story} onUpdate={onUpdate} />);

    fireEvent.change(screen.getByPlaceholderText("O que precisa acontecer?"), { target: { value: "A protagonista quer voltar para casa" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar ao projeto" }));
    expect(onUpdate).toHaveBeenCalled();
    expect(story.objectives[0].title).toBe("A protagonista quer voltar para casa");

    rerender(<StoryEnginePanel story={story} onUpdate={onUpdate} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Tipo de elemento" }), { target: { value: "conflicts" } });
    fireEvent.change(screen.getByPlaceholderText("O que está em tensão?"), { target: { value: "A cidade não permite a partida" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar ao projeto" }));
    expect(story.conflicts[0].title).toBe("A cidade não permite a partida");

    rerender(<StoryEnginePanel story={story} onUpdate={onUpdate} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Tipo de elemento" }), { target: { value: "notes" } });
    fireEvent.change(screen.getByPlaceholderText("Uma nota para manter por perto"), { target: { value: "Revisar o símbolo da ponte" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar ao projeto" }));
    expect(story.notes).toContain("Revisar o símbolo da ponte");

    rerender(<StoryEnginePanel story={story} onUpdate={onUpdate} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Tipo de elemento" }), { target: { value: "relations" } });
    fireEvent.change(screen.getByPlaceholderText("Tipo de relação"), { target: { value: "aliança" } });
    fireEvent.change(screen.getByPlaceholderText("Origem: personagem, lugar ou evento"), { target: { value: "Lia" } });
    fireEvent.change(screen.getByPlaceholderText("Destino: personagem, lugar ou evento"), { target: { value: "Ponte" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar ao projeto" }));
    expect(story.relations[0].label).toBe("aliança");
    rerender(<StoryEnginePanel story={story} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar relação aliança" }));
    fireEvent.change(screen.getByPlaceholderText("Tipo de relação"), { target: { value: "proteção" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar relação" }));
    expect(story.relations[0].label).toBe("proteção");

    rerender(<StoryEnginePanel story={story} onUpdate={onUpdate} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Tipo de elemento" }), { target: { value: "scenes" } });
    fireEvent.change(screen.getByPlaceholderText("Título da cena"), { target: { value: "A travessia" } });
    fireEvent.change(screen.getByPlaceholderText("Objetivo da cena"), { target: { value: "Chegar ao outro lado" } });
    fireEvent.change(screen.getByPlaceholderText("Conflito ou virada"), { target: { value: "A ponte cede" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar ao projeto" }));
    expect(story.scenes[0].title).toBe("A travessia");
  });
});

it("keeps scene links through serialization, rename and missing references", () => {
  const original = { objectives: [{ id: "goal", title: "Encontrar Joe", description: "" }], conflicts: [{ id: "conflict", title: "A floresta", description: "" }], scenes: [], relations: [], notes: [] };
  let story: Parameters<typeof StoryEnginePanel>[0]["story"] = original;
  const onUpdate = vi.fn(next => { story = JSON.parse(JSON.stringify(next)); });
  const chapters = [{id: "chapter", label: "O envelope"}];
  const { rerender } = render(<StoryEnginePanel story={story} chapterOptions={chapters} onUpdate={onUpdate} />);
  fireEvent.change(screen.getByRole("combobox", {name: "Tipo de elemento"}), {target: {value: "scenes"}});
  fireEvent.change(screen.getByPlaceholderText("Título da cena"), {target: {value: "A descoberta"}});
  fireEvent.change(screen.getByRole("combobox", {name: "Vincular objetivo"}), {target: {value: "goal"}});
  fireEvent.change(screen.getByRole("combobox", {name: "Vincular conflito"}), {target: {value: "conflict"}});
  fireEvent.change(screen.getByRole("combobox", {name: "Vincular capítulo"}), {target: {value: "chapter"}});
  fireEvent.click(screen.getByRole("button", {name: "Adicionar ao projeto"}));
  expect(story.scenes[0]).toMatchObject({objectiveId: "goal", conflictId: "conflict", chapterId: "chapter"});
  const sceneId = story.scenes[0].id;
  story = {...story, objectives: [{...story.objectives[0], title: "Descobrir a verdade"}]};
  rerender(<StoryEnginePanel story={story} chapterOptions={chapters} onUpdate={onUpdate} />);
  expect(screen.getByText(/Objetivo: Descobrir a verdade/)).toBeTruthy();
  expect(screen.getAllByText(/Cenas vinculadas: A descoberta/)).toHaveLength(2);
  expect(screen.getByText("Capítulo: O envelope")).toBeTruthy();
  story = {...story, objectives: []};
  rerender(<StoryEnginePanel story={story} chapterOptions={chapters} onUpdate={onUpdate} />);
  expect(screen.getByText(/Encontrar Joe \(vínculo indisponível\)/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name: "Editar A descoberta"}));
  fireEvent.click(screen.getByRole("button", {name: "Salvar alterações"}));
  expect(story.scenes[0]).toMatchObject({id: sceneId, objectiveId: "goal", objective: "Encontrar Joe"});
});
