// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfilePage, safeUrl } from "./ProfilePage";
import type { AccountBook, Profile } from "./AccountMenu";

afterEach(cleanup);

const node = (content: string) => ({ kind: "chapter", content });
const books: AccountBook[] = [
  { id: "a", title: "Noite em Forks", status: "editing", targetWordCount: 100, updatedAt: 3, startedAt: 1, nodes: [node("um dois três quatro cinco")], writingProgress: [] },
  { id: "b", title: "Livro Pronto", status: "completed", targetWordCount: 10, updatedAt: 2, nodes: [node("a b c")] },
  { id: "c", title: "Ideia Solta", status: "draft", targetWordCount: 50, updatedAt: 1, nodes: [node("")] },
  { id: "d", title: "Arquivado", status: "completed", targetWordCount: 10, updatedAt: 1, archived: true, nodes: [] },
];
const profile: Profile = { name: "Tom", photo: "", bio: "", location: "", links: ["", "", ""], store: "" };

function setup(over: Partial<React.ComponentProps<typeof ProfilePage>> = {}) {
  const props: React.ComponentProps<typeof ProfilePage> = {
    books, profile, email: "tom@example.com", online: true, displayName: "Tom", syncLabel: "sincronizado",
    statusLabel: status => String(status), onProfile: vi.fn(), onOpen: vi.fn(), onClose: vi.fn(), onSignOut: vi.fn(), ...over,
  };
  render(<ProfilePage {...props} />);
  return props;
}

describe("safeUrl", () => {
  it("aceita só http(s) e completa o endereço sem esquema", () => {
    expect(safeUrl("instagram.com/tom")).toBe("https://instagram.com/tom");
    expect(safeUrl("http://exemplo.com")).toBe("http://exemplo.com/");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("   ")).toBeNull();
    expect(safeUrl(undefined)).toBeNull();
  });
});

describe("ProfilePage", () => {
  it("mostra estatísticas sem contar livros arquivados", () => {
    setup();
    const card = (label: string) => screen.getByText(label).parentElement as HTMLElement;
    expect(card("Histórias").textContent).toContain("3");
    expect(card("Livros prontos").textContent).toContain("1");
    expect(card("Rascunhos").textContent).toContain("1");
    expect(card("Palavras escritas").textContent).toContain("8");
  });

  it("destaca o livro em andamento e abre pelo botão", () => {
    const props = setup();
    expect(screen.getByRole("region", { name: "Livro em andamento" }).textContent).toContain("Noite em Forks");
    fireEvent.click(screen.getByRole("button", { name: "Continuar escrevendo" }));
    expect((props.onOpen as ReturnType<typeof vi.fn>).mock.calls[0][0].id).toBe("a");
  });

  it("salva bio, local e links, e só linka endereços válidos", () => {
    const props = setup({ profile: { ...profile, links: ["https://instagram.com/tom", "javascript:x", ""], store: "amazon.com.br/tom" } });
    fireEvent.change(screen.getByPlaceholderText("Conte em poucas linhas quem é você como autor."), { target: { value: "Autora gótica" } });
    expect((props.onProfile as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ bio: "Autora gótica" });
    expect(screen.getAllByText("Endereço inválido.")).toHaveLength(1);
    const hrefs = screen.getAllByRole("link").map(link => link.getAttribute("href"));
    expect(hrefs).toContain("https://instagram.com/tom");
    expect(hrefs).toContain("https://amazon.com.br/tom");
    expect(hrefs.some(href => (href ?? "").startsWith("javascript"))).toBe(false);
  });

  it("oferece sair da conta", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: /Sair da conta/ }));
    expect(props.onSignOut).toHaveBeenCalled();
  });

  it("exclui e zera só depois de confirmar", () => {
    const onDeleteBook = vi.fn();
    const onResetBook = vi.fn();
    setup({ onDeleteBook, onResetBook });
    fireEvent.click(screen.getByRole("button", { name: "Excluir projeto Ideia Solta" }));
    expect(onDeleteBook).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Excluir projeto Ideia Solta" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Excluir projeto" }));
    expect(onDeleteBook).toHaveBeenCalledTimes(1);
    expect(onDeleteBook.mock.calls[0][0].id).toBe("c");
    fireEvent.click(screen.getByRole("button", { name: "Zerar manuscrito de Livro Pronto" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Zerar manuscrito" }));
    expect(onResetBook.mock.calls[0][0].id).toBe("b");
  });
});
