// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TranslateBookDialog } from "./TranslateBookDialog";
import { clearTranslationCache } from "@/lib/translate";

afterEach(() => { cleanup(); clearTranslationCache(); });
const book = { title: "A casa", subtitle: "Sub", description: "Desc", nodes: [
  { id: "a", title: "Um", kind: "chapter", content: "Primeiro." },
  { id: "b", title: "Dois", kind: "chapter", content: "Segundo." },
] };
const fetchFn = vi.fn(async (_u: string, init?: RequestInit) => ({ ok: true, status: 200, json: async () => [[["EN:" + new URLSearchParams(String(init?.body)).get("q"), ""]]] }));

describe("TranslateBookDialog", () => {
  it("traduz os capítulos escolhidos e entrega uma cópia sem tocar no original", async () => {
    const onDone = vi.fn();
    render(<TranslateBookDialog book={book} onClose={vi.fn()} onDone={onDone} fetchFn={fetchFn} />);
    fireEvent.click(screen.getByLabelText("Dois"));
    fireEvent.click(screen.getByRole("button", { name: /Traduzir 1 item/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const result = onDone.mock.calls[0][0];
    expect(result.languageCode).toBe("en");
    expect(result.nodes).toEqual([{ title: "EN:Um", kind: "chapter", content: "EN:Primeiro." }]);
    expect(result.title).toBe("EN:A casa");
    expect(book.nodes[0].content).toBe("Primeiro.");
  });
  it("mostra erro e não cria nada quando a tradução falha", async () => {
    const onDone = vi.fn();
    const bad = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    render(<TranslateBookDialog book={book} onClose={vi.fn()} onDone={onDone} fetchFn={bad} />);
    fireEvent.click(screen.getByRole("button", { name: /Traduzir livro completo/ }));
    await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(onDone).not.toHaveBeenCalled();
  });
});
