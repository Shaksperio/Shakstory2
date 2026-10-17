// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AudioReader } from "./AudioReader";

type Utt = { text: string; lang: string; rate: number; voice: unknown; onend: null | (() => void); onerror: null | ((e: { error: string }) => void) };
let spoken: Utt[];
const synth = {
  speak: vi.fn((u: Utt) => { spoken.push(u); }), cancel: vi.fn(), pause: vi.fn(), resume: vi.fn(),
  getVoices: () => [{ voiceURI: "en", name: "Sam", lang: "en-US" }, { voiceURI: "pt1", name: "Luciana", lang: "pt-BR" }],
  addEventListener: vi.fn(), removeEventListener: vi.fn(),
};
class FakeUtterance { text: string; lang = ""; rate = 1; voice: unknown = null; onend = null; onerror = null; constructor(text: string) { this.text = text; } }

const chapters = [
  { id: "a", title: "Um", kind: "chapter", content: "Primeiro capítulo." },
  { id: "b", title: "Dois", kind: "chapter", content: "Segundo capítulo." },
];
const finish = () => act(() => { spoken[spoken.length - 1].onend?.(); });
const ui = (over: Partial<React.ComponentProps<typeof AudioReader>> = {}) => <AudioReader chapters={chapters} index={0} scope="chapter" onChapterChange={vi.fn()} btnClass="b" panelClass="p" onClose={vi.fn()} {...over} />;

beforeEach(() => { spoken = []; localStorage.clear(); vi.clearAllMocks(); vi.stubGlobal("speechSynthesis", synth); vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("AudioReader", () => {
  it("lê em português, pausa, continua e para", () => {
    render(ui());
    fireEvent.click(screen.getByRole("button", { name: "Ouvir" }));
    expect(spoken[0].text).toContain("Um.");
    expect(spoken[0].lang).toBe("pt-BR");
    fireEvent.click(screen.getByRole("button", { name: "Pausar leitura" }));
    expect(synth.pause).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continuar leitura" }));
    expect(synth.resume).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Parar leitura" }));
    expect(synth.cancel).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Ouvir" })).toBeTruthy();
  });
  it("no livro todo avança para o próximo capítulo e avisa o leitor", () => {
    const onChapterChange = vi.fn();
    render(ui({ scope: "book", onChapterChange }));
    fireEvent.click(screen.getByRole("button", { name: "Ouvir" }));
    const before = spoken.length;
    finish();
    let guard = 0;
    while (!onChapterChange.mock.calls.some(call => call[0] === 1) && guard++ < 10) finish();
    expect(onChapterChange).toHaveBeenCalledWith(1);
    finish();
    expect(spoken.some(u => u.text.includes("Segundo"))).toBe(true);
  });
  it("no capítulo atual termina ao fim do capítulo", () => {
    render(ui());
    fireEvent.click(screen.getByRole("button", { name: "Ouvir" }));
    let guard = 0;
    while (screen.queryByRole("button", { name: "Pausar leitura" }) && guard++ < 10) finish();
    expect(screen.getByRole("button", { name: "Ouvir" })).toBeTruthy();
    expect(spoken.every(u => !u.text.includes("Segundo"))).toBe(true);
  });
  it("mostra só vozes em português e guarda a velocidade", () => {
    render(ui());
    const voice = screen.getByLabelText("Voz da leitura") as HTMLSelectElement;
    expect(Array.from(voice.options).map(o => o.textContent)).toEqual(["Luciana (pt-BR)"]);
    fireEvent.change(screen.getByLabelText("Velocidade da leitura"), { target: { value: "1.5" } });
    expect(JSON.parse(localStorage.getItem("shakstory:tts-prefs") ?? "{}").rate).toBe(1.5);
    fireEvent.click(screen.getByRole("button", { name: "Ouvir" }));
    expect(spoken[0].rate).toBe(1.5);
  });
  it("para ao fechar e avisa quando o navegador não tem voz", () => {
    const onClose = vi.fn();
    const { unmount } = render(ui({ onClose }));
    fireEvent.click(screen.getByRole("button", { name: "Ouvir" }));
    fireEvent.click(screen.getByRole("button", { name: "Fechar leitor em áudio" }));
    expect(onClose).toHaveBeenCalled();
    expect(synth.cancel).toHaveBeenCalled();
    unmount();
    vi.unstubAllGlobals();
    vi.stubGlobal("SpeechSynthesisUtterance", undefined);
    delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
    render(ui());
    expect(screen.getByText(/não oferece leitura em voz alta/)).toBeTruthy();
  });
});
