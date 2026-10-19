import { describe, expect, it } from "vitest";
import { THEME_LIMIT, applyLayout, deleteTheme, loadThemes, pickLayout, sanitizeThemes, saveTheme } from "./layout-themes";

const memory = () => { const data = new Map<string, string>(); return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }; };
const broken = { getItem: () => null, setItem: () => { throw new Error("cheio"); } };

describe("temas de diagramação salvos", () => {
  it("guarda só o visual e descarta texto do livro, autor e capa", () => {
    const picked = pickLayout({ typography: "reedsy", trimSize: "5x8", marginPreset: "wide", dropCap: true, runningHeader: true, bleedMm: 3, gutterMm: 12, author: "X", coverImageUrl: "data:...", chapters: [1], copyright: {} });
    expect(picked).toEqual({ typography: "reedsy", trimSize: "5x8", marginPreset: "wide", dropCap: true, runningHeader: true, bleedMm: 3, gutterMm: 12 });
  });
  it("valida valores: formato desconhecido, sangria absurda, medidas personalizadas", () => {
    expect(pickLayout({ trimSize: "7x10" }).trimSize).toBeUndefined();
    expect(pickLayout({ bleedMm: 999, gutterMm: -3 })).toMatchObject({ bleedMm: 10, gutterMm: 0 });
    expect(pickLayout({ trimSize: "custom", customTrim: { widthMm: 10, heightMm: 9999 } }).customTrim).toEqual({ widthMm: 90, heightMm: 400 });
    expect(pickLayout({ trimSize: "a5", customTrim: { widthMm: 140, heightMm: 210 } }).customTrim).toBeUndefined();
    expect(pickLayout(null)).toEqual({});
  });
  it("salva, relê, substitui pelo mesmo nome e exclui", () => {
    const store = memory();
    const a = saveTheme("Romance de bolso", { trimSize: "5x8", gutterMm: 10 }, store, 1);
    expect(a.ok && a.themes).toHaveLength(1);
    const b = saveTheme("romance de BOLSO", { trimSize: "a5" }, store, 2);
    expect(b.ok && b.themes).toHaveLength(1);
    expect(loadThemes(store)[0].settings.trimSize).toBe("a5");
    const c = saveTheme("Outro", {}, store, 3);
    expect(c.ok && c.themes).toHaveLength(2);
    const id = loadThemes(store)[0].id;
    const d = deleteTheme(id, store);
    expect(d.ok && d.themes.map(t => t.name)).toEqual(["Outro"]);
  });
  it("recusa nome vazio e passa do limite; nome longo é cortado", () => {
    const store = memory();
    expect(saveTheme("   ", {}, store)).toMatchObject({ ok: false, reason: "name" });
    for (let i = 0; i < THEME_LIMIT; i++) expect(saveTheme("T" + i, {}, store, i).ok).toBe(true);
    expect(saveTheme("extra", {}, store)).toMatchObject({ ok: false, reason: "limit" });
    expect(saveTheme("T0", { dropCap: true }, store).ok).toBe(true); // substituir não conta como novo
    expect(loadThemes(memory()).length).toBe(0);
    const long = saveTheme("x".repeat(100), {}, memory());
    expect(long.ok && long.themes[0].name.length).toBe(40);
  });
  it("sem armazenamento disponível não quebra e avisa que não salvou", () => {
    expect(saveTheme("A", {}, broken)).toMatchObject({ ok: false, reason: "storage" });
    expect(saveTheme("A", {}, null)).toMatchObject({ ok: false, reason: "storage" });
    expect(loadThemes(null)).toEqual([]);
  });
  it("dados corrompidos viram lista vazia; itens inválidos e duplicados são ignorados", () => {
    const store = memory();
    store.setItem("shakstory.layout-themes.v1", "{não é json");
    expect(loadThemes(store)).toEqual([]);
    expect(sanitizeThemes([{ id: "1", name: "A", settings: { trimSize: "x" } }, { id: "1", name: "B" }, { id: "", name: "C" }, null, { id: "2", name: "  " }])).toHaveLength(1);
  });
  it("aplicar um tema zera o que ele não define (sem restos do tema anterior)", () => {
    expect(applyLayout({ id: "1", name: "A", savedAt: 0, settings: { trimSize: "a5" } })).toMatchObject({ trimSize: "a5", runningHeader: false, bleedMm: 0, gutterMm: 0 });
  });
});
