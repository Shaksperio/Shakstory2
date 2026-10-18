import React from "react";
import { Check } from "lucide-react";
import { TYPOGRAPHY_PRESETS, type TypographyPreset } from "@shared/book-export";

/** Fluxo guiado de publicação (inspirado no Kindle Create): só navegação visual; cada etapa leva ao que já existe. */
export type FlowStep = { id: string; label: string; done: boolean; go: () => void };

export function PublishStepper({ steps }: { steps: FlowStep[] }) {
  return (
    <nav aria-label="Etapas da publicação" className="pk-stepper mt-6">
      <ol>
        {steps.map((step, index) => (
          <li key={step.id}>
            <button type="button" onClick={step.go} className={`pk-step${step.done ? " is-done" : ""}`}>
              <span className="pk-step-dot" aria-hidden="true">{step.done ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
              <span className="pk-step-label">{step.label}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

const THEME_ORDER: TypographyPreset[] = ["reedsy", "classic", "modern", "minimal", "fantasy", "sci-fi", "romance", "thriller", "academic"];

/** Galeria de temas com miniatura de página. Escolher um tema só define o preset tipográfico que já existe no livro. */
export function ThemeGallery({ value, onChange }: { value: TypographyPreset; onChange: (preset: TypographyPreset) => void }) {
  const presets = THEME_ORDER.filter(key => TYPOGRAPHY_PRESETS[key]);
  return (
    <section id="prep-theme" className="pk-themes mt-6 rounded-2xl border border-border/70 bg-card p-5" aria-label="Temas do livro">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Tema do livro</p>
      <p className="mt-2 text-sm text-muted-foreground">Escolha o estilo de página. A tipografia vale para EPUB, PDF, DOCX e impressão; os capítulos não mudam.</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup" aria-label="Tema tipográfico">
        {presets.map(key => {
          const preset = TYPOGRAPHY_PRESETS[key];
          const selected = value === key;
          return (
            <button key={key} type="button" role="radio" aria-checked={selected} aria-label={`Tema ${preset.label}`} onClick={() => onChange(key)} className={`pk-theme${selected ? " is-selected" : ""}`}>
              <span className="pk-page" style={{ fontFamily: preset.webFont }} aria-hidden="true">
                <span className="pk-page-num">1</span>
                <span className="pk-page-title" style={{ color: preset.accent, fontWeight: preset.titleWeight as React.CSSProperties["fontWeight"] }}>Capítulo</span>
                <span className="pk-page-text"><span className="pk-dropcap" style={{ color: preset.accent }}>A</span><i /><i /><i /><i /><i /><i /><i /><i /><i /><i className="short" /></span>
              </span>
              <span className="pk-theme-name">{preset.label}</span>
              {selected && <span className="pk-theme-check" aria-hidden="true"><Check className="h-3 w-3" /></span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
