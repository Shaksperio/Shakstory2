// @vitest-environment jsdom
import React, { useState } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import { EditorialWorkbench } from "./EditorialWorkbench";
import type {
  ReviewData,
  MatterSection,
  CopyrightData,
} from "@shared/editorial-workflow";
afterEach(cleanup);
function Harness() {
  const [publication, setPublication] = useState<{
    author: string;
    frontMatter?: MatterSection[];
    backMatter?: MatterSection[];
    copyright?: CopyrightData;
  }>({ author: "Ana" });
  const [review, setReview] = useState<ReviewData>({});
  const [text, setText] = useState("Original");
  return (
    <>
      <EditorialWorkbench
        publication={publication}
        review={review}
        node={{ id: "n", title: "Capítulo" }}
        nodes={[{ id: "n", title: "Capítulo" }]}
        text={text}
        html=""
        onPublication={setPublication}
        onReview={setReview}
        onRestore={setText}
      />
      <button onClick={() => setText("Posterior")}>Editar teste</button>
      <output aria-label="Estado">
        {JSON.stringify({ publication, review, text })}
      </output>
    </>
  );
}
describe("editorial workbench", () => {
  it("saves a comment, resolves it and restores a version while retaining displaced text", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Manuscrito, revisão e preferências"));
    fireEvent.click(
      screen.getByRole("button", { name: "Revisão e histórico" })
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Novo comentário" }), {
      target: { value: "Conferir motivação" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Adicionar comentário" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Resolver comentário" })
    );
    expect(screen.getByLabelText("Estado").textContent).toContain(
      '"resolved":true'
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Guardar versão do capítulo" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar teste" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Restaurar esta versão" })
    );
    const state = JSON.parse(screen.getByLabelText("Estado").textContent!);
    expect(state.text).toBe("Original");
    expect(state.review.versions[0].text).toBe("Posterior");
  });
  it("adds matter and generates copyright with format-specific ISBN", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Manuscrito, revisão e preferências"));
    fireEvent.change(screen.getByLabelText("Adicionar preliminar"), {
      target: { value: "Dedicatória" },
    });
    fireEvent.change(screen.getByLabelText("Conteúdo de Dedicatória"), {
      target: { value: "Para meus leitores" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Copyright e créditos" })
    );
    fireEvent.change(screen.getByLabelText("ISBN — epub"), {
      target: { value: "978-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Estrutura do livro" }));
    expect(screen.getByText(/ISBN \(epub\): 978-1/)).toBeTruthy();
    expect(
      screen
        .getByLabelText("Conteúdo de Dedicatória")
        .getAttribute("aria-label")
    ).toBeTruthy();
  });
});
