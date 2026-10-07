// @vitest-environment jsdom
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { it, expect, vi, afterEach } from "vitest";
import { ManuscriptNavigator } from "./ManuscriptNavigator";
afterEach(cleanup);
it("groups matter and chapters, preserves toggles and routes reorder to stable IDs", () => {
  const publication = {
    author: "Ana",
    frontMatter: [{ id: "ded", title: "Dedicatória", content: "Para todos" }],
  };
  const onPublication = vi.fn(),
    onSelect = vi.fn(),
    onReorder = vi.fn(),
    onPrepare = vi.fn();
  render(
    <ManuscriptNavigator
      nodes={[
        { id: "a", title: "A carta", kind: "chapter", content: "Text" },
        { id: "b", title: "A floresta", kind: "chapter", content: "Text" },
      ]}
      publication={publication}
      onPublication={onPublication}
      onSelect={onSelect}
      onMove={vi.fn()}
      onRename={vi.fn()}
      onDuplicate={vi.fn()}
      onRemove={vi.fn()}
      onPrepare={onPrepare}
      onReorder={onReorder}
    />
  );
  expect(screen.getByText("Preliminares")).toBeTruthy();
  expect(screen.getByText("Corpo do livro")).toBeTruthy();
  expect(screen.getByText("Pós-textuais")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Copyright" }));
  expect(onPrepare).toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("Incluir Dedicatória"));
  expect(onPublication.mock.calls.at(-1)![0].frontMatter[1].enabled).toBe(
    false
  );
  fireEvent.click(screen.getByRole("button", { name: /Capítulo 1 — A carta/ }));
  expect(onSelect).toHaveBeenCalledWith("a");
  const first = screen
      .getByRole("button", { name: /Capítulo 1 — A carta/ })
      .closest("[draggable]")!,
    second = screen
      .getByRole("button", { name: /Capítulo 2 — A floresta/ })
      .closest("[draggable]")!;
  fireEvent.dragStart(first);
  fireEvent.drop(second);
  expect(onReorder).toHaveBeenCalledWith("a", "b");
});
