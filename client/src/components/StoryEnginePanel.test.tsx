// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StoryEnginePanel } from "./WriterStudio";

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
