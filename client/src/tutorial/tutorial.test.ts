import { describe, expect, it } from "vitest";
import { placeBalloon } from "./geometry";
import { TUTORIAL_STEPS, stepsFor } from "./script";
import { INITIAL_TUTORIAL, readTutorial, tutorialKey, writeTutorial } from "./state";

const memory = () => { const data = new Map<string, string>(); return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }; };

describe("estado do tutorial", () => {
  it("guarda por usuário e ignora lixo", () => {
    const storage = memory();
    expect(readTutorial("a@x.com", storage)).toEqual(INITIAL_TUTORIAL);
    writeTutorial("A@x.com", { status: "in_progress", stepId: "lib-card", updatedAt: 0 }, storage);
    expect(readTutorial("a@x.com", storage).stepId).toBe("lib-card");
    expect(readTutorial("b@x.com", storage)).toEqual(INITIAL_TUTORIAL);
    storage.setItem(tutorialKey("c@x.com"), "{nao json");
    expect(readTutorial("c@x.com", storage)).toEqual(INITIAL_TUTORIAL);
    storage.setItem(tutorialKey("d@x.com"), JSON.stringify({ status: "voando" }));
    expect(readTutorial("d@x.com", storage)).toEqual(INITIAL_TUTORIAL);
  });
});

describe("roteiro", () => {
  it("tem etapas únicas e completas", () => {
    const ids = TUTORIAL_STEPS.map(step => step.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const step of TUTORIAL_STEPS) { expect(step.title.length).toBeGreaterThan(2); expect(step.what.length).toBeGreaterThan(10); expect(step.how.length).toBeGreaterThan(10); }
  });
  it("não promete exportação para a pré-visualização nem recursos inexistentes", () => {
    const text = TUTORIAL_STEPS.map(step => `${step.title} ${step.what} ${step.how}`).join(" ");
    expect(text).not.toMatch(/Cânone|Cânon|canône/i);
    expect(TUTORIAL_STEPS.find(step => step.id === "prep-preview")?.title).toContain("não é exportação");
  });
  it("sem livro aberto pula as telas que dependem dele", () => {
    const none = stepsFor({ hasBook: false, hasBooks: false }).map(step => step.id);
    expect(none).not.toContain("ed-page");
    expect(none).not.toContain("lib-card");
    expect(none).toContain("open-book");
    const full = stepsFor({ hasBook: true, hasBooks: true }).map(step => step.id);
    expect(full).toContain("ed-page");
    expect(full).not.toContain("open-book");
  });
});

describe("posição do balão", () => {
  const vp = { width: 1200, height: 800 };
  const balloon = { width: 360, height: 280 };
  it("fica abaixo do alvo sem cobri-lo", () => {
    const target = { top: 100, left: 300, width: 200, height: 40 };
    const p = placeBalloon(target, vp, balloon);
    expect(p.side).toBe("below");
    expect(p.top).toBeGreaterThanOrEqual(target.top + target.height);
  });
  it("vai para cima quando falta espaço embaixo e fica dentro da tela", () => {
    const target = { top: 700, left: 1100, width: 80, height: 40 };
    const p = placeBalloon(target, vp, balloon);
    expect(p.side).toBe("above");
    expect(p.left + balloon.width).toBeLessThanOrEqual(vp.width);
    expect(p.top + balloon.height).toBeLessThanOrEqual(target.top);
  });
  it("usa lado direito para alvo alto e estreito", () => {
    const p = placeBalloon({ top: 0, left: 0, width: 240, height: 800 }, vp, balloon);
    expect(p.side).toBe("right");
  });
  it("em tela pequena vira folha na base e sem alvo fica no centro", () => {
    expect(placeBalloon({ top: 10, left: 10, width: 50, height: 50 }, { width: 390, height: 800 }, balloon).mode).toBe("dock");
    expect(placeBalloon(null, vp, balloon).mode).toBe("center");
  });
});
