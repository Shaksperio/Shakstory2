import React, { useEffect, useRef, useState } from "react";
import {
  CornerDownLeft,
  Delete,
  Keyboard,
  MoveUp,
  VolumeX,
} from "lucide-react";

/** Native insertion preserves inline marks, selection and browser undo history. */
export function insertTypewriterKey(editor: HTMLDivElement, key: string) {
  const selection = window.getSelection();
  if (!selection) return;
  const savedRange =
    selection.rangeCount && editor.contains(selection.anchorNode)
      ? selection.getRangeAt(0).cloneRange()
      : undefined;
  editor.focus({ preventScroll: true });
  const target = savedRange ?? document.createRange();
  if (!savedRange) {
    target.selectNodeContents(editor);
    target.collapse(false);
  }
  selection.removeAllRanges();
  selection.addRange(target);
  const command =
    key === "Backspace"
      ? "delete"
      : key === "Enter"
        ? "insertParagraph"
        : "insertText";
  if (
    typeof document.execCommand === "function" &&
    document.execCommand(
      command,
      false,
      key === "Enter" || key === "Backspace" ? undefined : key
    )
  )
    return;
  // Fallback for engines without editing commands. Never flatten the manuscript.
  const range = selection.getRangeAt(0);
  if (key === "Backspace") {
    if (!range.collapsed) range.deleteContents();
    else if (range.startContainer.nodeType === 3 && range.startOffset > 0) {
      const text = range.startContainer as Text;
      const prefix = text.data.slice(0, range.startOffset),
        last = Array.from(prefix).at(-1) ?? "";
      const offset = range.startOffset - last.length;
      text.deleteData(offset, last.length);
      range.setStart(text, offset);
      range.collapse(true);
    }
  } else {
    range.deleteContents();
    const text = document.createTextNode(key === "Enter" ? "\n" : key);
    range.insertNode(text);
    range.setStart(text, text.length);
    range.collapse(true);
  }
  selection.removeAllRanges();
  selection.addRange(range);
  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

export function TypewriterFrame({
  active,
  editorRef,
  text,
  children,
}: {
  active: boolean;
  editorRef: React.RefObject<HTMLDivElement | null>;
  text: string;
  children: React.ReactNode;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [pressed, setPressed] = useState("");
  const [shift, setShift] = useState(false);
  const [layout, setLayout] = useState<"letters" | "numbers" | "accents">(
    "letters"
  );
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flash = (key: string) => {
    clearTimeout(timer.current);
    setPressed(key.toUpperCase());
    timer.current = setTimeout(() => setPressed(""), 130);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!active) return;
    const editor = editorRef.current;
    if (!editor) return;
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey && !event.isComposing)
        flash(event.key);
    };
    editor.addEventListener("keydown", onKey);
    return () => editor.removeEventListener("keydown", onKey);
  }, [active, editorRef]);
  useEffect(() => {
    if (!active) return;
    const panel = viewport.current,
      editor = editorRef.current,
      selection = window.getSelection();
    if (
      !panel ||
      !editor ||
      !selection?.rangeCount ||
      !editor.contains(selection.anchorNode)
    )
      return;
    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(false);
    if (typeof range.getBoundingClientRect !== "function") return;
    const caret = range.getBoundingClientRect(),
      bounds = panel.getBoundingClientRect();
    if (!caret.height) return;
    const lower = bounds.bottom - 48,
      upper = bounds.top + 40;
    if (caret.bottom > lower) panel.scrollTop += caret.bottom - lower;
    else if (caret.top < upper) panel.scrollTop -= upper - caret.top;
  }, [active, text, editorRef]);
  const press = (key: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    flash(key);
    insertTypewriterKey(
      editor,
      key.length === 1 && shift ? key.toUpperCase() : key
    );
    if (key.length === 1) setShift(false);
  };
  const rows =
    layout === "letters"
      ? ["qwertyuiop", "asdfghjklç", "zxcvbnm,."]
      : layout === "numbers"
        ? ["1234567890", "@#$%&*()-", "!?;:'\"/+="]
        : ["áéíóúàãõâê", "ôüçÁÉÍÓÚÃÕ", "—–…«»“”?!"];
  return (
    <div
      className={
        active
          ? "typewriter-frame"
          : "overflow-hidden rounded-2xl border border-border/70 bg-card p-6 shadow-sm sm:p-10"
      }
      data-typewriter={active ? "active" : "inactive"}
    >
      {active && (
        <div className="typewriter-caption">
          <span>
            <Keyboard size={15} />
            Máquina de escrever
          </span>
          <span className="typewriter-flow">
            <MoveUp size={13} />A folha acompanha sua escrita
          </span>
        </div>
      )}
      <div className={active ? "typewriter-paper-window" : ""} ref={viewport}>
        <div className={active ? "typewriter-paper" : ""}>{children}</div>
      </div>
      {active && (
        <div
          className="typewriter-machine"
          aria-label="Teclado da máquina de escrever"
        >
          <div className="typewriter-carriage" aria-hidden="true">
            <span />
            <i />
            <span />
          </div>
          <div className="typewriter-nameplate">
            SHAKSTORY <span>CLASSIC</span>
          </div>
          <div className="typewriter-keys">
            {rows.map((row, index) => (
              <div className="typewriter-key-row" key={index}>
                {index === 2 && (
                  <button
                    className={`typewriter-key typewriter-special ${shift ? "is-pressed" : ""}`}
                    aria-label="Maiúsculas"
                    aria-pressed={shift}
                    onPointerDown={e => e.preventDefault()}
                    onClick={() => setShift(!shift)}
                  >
                    ⇧
                  </button>
                )}
                {Array.from(row).map((key, i) => (
                  <button
                    key={i}
                    className={`typewriter-key ${pressed === key.toUpperCase() ? "is-pressed" : ""}`}
                    aria-label={`Digitar ${shift ? key.toUpperCase() : key}`}
                    onPointerDown={e => e.preventDefault()}
                    onClick={() => press(key)}
                  >
                    {key.toUpperCase()}
                  </button>
                ))}
                {index === 0 && (
                  <button
                    aria-label="Apagar caractere"
                    className={`typewriter-key typewriter-special ${pressed === "BACKSPACE" ? "is-pressed" : ""}`}
                    onPointerDown={e => e.preventDefault()}
                    onClick={() => press("Backspace")}
                  >
                    <Delete size={19} />
                  </button>
                )}
                {index === 1 && (
                  <button
                    aria-label="Nova linha"
                    className={`typewriter-key typewriter-special ${pressed === "ENTER" ? "is-pressed" : ""}`}
                    onPointerDown={e => e.preventDefault()}
                    onClick={() => press("Enter")}
                  >
                    <CornerDownLeft size={19} />
                  </button>
                )}
              </div>
            ))}
            <div className="typewriter-key-row">
              <button
                className="typewriter-key typewriter-special"
                aria-label={
                  layout === "numbers"
                    ? "Teclado de letras"
                    : "Números e símbolos"
                }
                onPointerDown={e => e.preventDefault()}
                onClick={() =>
                  setLayout(layout === "numbers" ? "letters" : "numbers")
                }
              >
                {layout === "numbers" ? "ABC" : "?123"}
              </button>
              <button
                className="typewriter-key typewriter-special"
                aria-label="Letras acentuadas"
                aria-pressed={layout === "accents"}
                onPointerDown={e => e.preventDefault()}
                onClick={() =>
                  setLayout(layout === "accents" ? "letters" : "accents")
                }
              >
                ÁÉ
              </button>
              <button
                className={`typewriter-key typewriter-space ${pressed === " " ? "is-pressed" : ""}`}
                aria-label="Espaço"
                onPointerDown={e => e.preventDefault()}
                onClick={() => press(" ")}
              >
                {" "}
              </button>
              <span className="typewriter-silent" title="Escrita silenciosa">
                <VolumeX size={14} />
              </span>
            </div>
          </div>
          <p className="typewriter-hint">
            Use as teclas da máquina ou seu teclado físico.
          </p>
        </div>
      )}
    </div>
  );
}
