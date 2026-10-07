// @vitest-environment jsdom
import React, { useRef, useState } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { it, expect, afterEach, vi } from "vitest";
import { TypewriterFrame, insertTypewriterKey } from "./TypewriterFrame";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("Original");
  return (
    <TypewriterFrame active editorRef={ref} text={text}>
      <div
        ref={ref}
        role="textbox"
        aria-label="Papel"
        contentEditable
        suppressContentEditableWarning
        onInput={e => setText(e.currentTarget.textContent ?? "")}
      >
        <strong>Original</strong>
      </div>
    </TypewriterFrame>
  );
}
it("inserts into the selection without flattening rich text, then deletes and adds lines", () => {
  render(<Harness />);
  const editor = screen.getByRole("textbox", {
    name: "Papel",
  }) as HTMLDivElement;
  const selection = window.getSelection()!,
    range = document.createRange();
  range.setStart(editor.firstChild!.firstChild!, 8);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  insertTypewriterKey(editor, "!");
  expect(editor.innerHTML).toContain("<strong>Original!</strong>");
  insertTypewriterKey(editor, "Backspace");
  expect(editor.textContent).toBe("Original");
  insertTypewriterKey(editor, "Enter");
  insertTypewriterKey(editor, "Fim");
  expect(editor.textContent).toBe("Original\nFim");
  expect(editor.querySelector("strong")).toBeTruthy();
});
it("offers Portuguese accents, shifted letters, numbers and space on the machine keyboard", () => {
  render(<Harness />);
  const editor = screen.getByRole("textbox", { name: "Papel" });
  fireEvent.click(screen.getByRole("button", { name: "Maiúsculas" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Digitar A" })
  );
  fireEvent.click(screen.getByRole("button", { name: "Espaço" }));
  fireEvent.click(screen.getByRole("button", { name: "Letras acentuadas" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Digitar ã" })
  );
  fireEvent.click(screen.getByRole("button", { name: "Números e símbolos" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Digitar 1" })
  );
  expect(editor.textContent).toBe("OriginalA ã1");
});
it("advances the paper when the caret passes the writing baseline", () => {
  render(<Harness />);
  const editor = screen.getByRole("textbox", { name: "Papel" }),
    panel = document.querySelector(
      ".typewriter-paper-window"
    ) as HTMLDivElement;
  const selection = window.getSelection()!,
    range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ top: 310, bottom: 330, height: 20 }),
  });
  vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
    top: 0,
    bottom: 300,
    height: 300,
  } as DOMRect);
  editor.firstChild!.textContent = "Next line";
  fireEvent.input(editor);
  expect(panel.scrollTop).toBe(78);
  delete (Range.prototype as unknown as { getBoundingClientRect?: unknown })
    .getBoundingClientRect;
});
