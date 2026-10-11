import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BookPreview } from "./BookPreview";

const book = {
  title: "Livro Teste",
  author: "Tom",
  includeToc: true,
  chapters: [
    { id: "a", title: "Prólogo", kind: "chapter", content: "Texto um." },
    { id: "b", title: "Segundo", kind: "chapter", content: "Texto dois." },
  ],
};

describe("BookPreview", () => {
  it("abre no capítulo atual e permite navegar, trocar tema e fonte", () => {
    const onClose = vi.fn();
    render(<BookPreview book={book} activeId="b" onClose={onClose} />);
    const nav = screen.getByRole("navigation", { name: "Capítulos da pré-visualização" });
    expect(nav.querySelector('[aria-current="true"]')?.textContent).toBe("Segundo");
    const doc = () => screen.getByTitle("Livro pré-visualizado").getAttribute("srcdoc") ?? "";
    expect(doc()).toContain("#chapter-2{display:block");
    fireEvent.click(screen.getByRole("button", { name: "Aumentar fonte" }));
    expect(doc()).toContain("font-size:20px");
    fireEvent.click(screen.getByRole("button", { name: "Modo noite" }));
    expect(screen.getByRole("button", { name: "Modo dia" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Livro todo" }));
    expect(doc()).not.toContain("display:block!important;min-height");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
