// @vitest-environment jsdom
import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiteraryAssistant } from "./WriterStudio";
import { applySuggestionAtOffsets } from "@shared/literary";

const analysis = {
  summary: "A imagem inicial é clara.",
  strengths: ["Imagem concreta"],
  suggestions: [{ category: "gramatica", severity: "revisar", original: "A noite", suggestion: "A tarde", explanation: "Alternativa de teste.", confidence: 0.9, start: 0, end: 7 }],
  narrativeNotes: [],
  model: "literary-model",
  availableModels: ["literary-model"],
};

function LiteraryAssistantHarness({ onDraft }: { onDraft: (value: string) => void }) {
  const [result, setResult] = useState<typeof analysis | null>(null);
  const [draft] = useState("A noite caiu. A noite silenciou.");
  const mockedAnalyzeMutation = vi.fn(() => setResult(analysis));
  return <><p data-testid="draft">{draft}</p><LiteraryAssistant focus="full" setFocus={vi.fn()} result={result} models={[{ id: "literary-model" }]} isLoading={false} error={null} onAnalyze={mockedAnalyzeMutation} onApply={(start, end, original, suggestion) => onDraft(applySuggestionAtOffsets(draft, start, end, original, suggestion))} /></>;
}

describe("WriterStudio literary assistant UI", () => {
  it("analyzes on request, preserves the draft, then applies only the confirmed suggestion", () => {
    let appliedDraft = "A noite caiu. A noite silenciou.";
    const onDraft = (value: string) => { appliedDraft = value; };
    render(<LiteraryAssistantHarness onDraft={onDraft} />);

    fireEvent.click(screen.getByRole("button", { name: "Analisar trecho" }));
    expect(screen.getByText("A imagem inicial é clara.")).toBeTruthy();
    expect(screen.getByTestId("draft").textContent).toBe("A noite caiu. A noite silenciou.");
    expect(appliedDraft).toBe("A noite caiu. A noite silenciou.");

    fireEvent.click(screen.getByRole("button", { name: "Aplicar sugestão" }));
    expect(appliedDraft).toBe("A tarde caiu. A noite silenciou.");
  });
});
