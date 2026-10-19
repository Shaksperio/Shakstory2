import { PRINT_LIMITS, TRIM_SIZES, clampCustomTrim, clampPrintMm, type CustomTrim, type TrimSize } from "@shared/book-export";

/** Tema de diagramação: só o visual da página; nunca texto do livro, autor, capa ou direitos. */
export type LayoutSettings = {
  typography?: string;
  trimSize?: TrimSize;
  customTrim?: CustomTrim;
  marginPreset?: "narrow" | "normal" | "wide";
  dropCap?: boolean;
  headerText?: string;
  footerText?: string;
  runningHeader?: boolean;
  bleedMm?: number;
  gutterMm?: number;
};
export type LayoutTheme = { id: string; name: string; savedAt: number; settings: LayoutSettings };

export const THEME_LIMIT = 12;
export const THEME_NAME_MAX = 40;
const KEY = "shakstory.layout-themes.v1";
const MARGINS = ["narrow", "normal", "wide"] as const;

/** Copia só os campos de diagramação, validados; qualquer outra coisa é descartada. */
export function pickLayout(source: Record<string, unknown> | null | undefined): LayoutSettings {
  const s = source ?? {};
  const out: LayoutSettings = {};
  if (typeof s.typography === "string" && s.typography.length <= 40) out.typography = s.typography;
  if (TRIM_SIZES.some(size => size.id === s.trimSize)) out.trimSize = s.trimSize as TrimSize;
  const custom = clampCustomTrim(s.customTrim as Partial<CustomTrim> | undefined);
  if (out.trimSize === "custom" && custom) out.customTrim = custom;
  if (MARGINS.includes(s.marginPreset as (typeof MARGINS)[number])) out.marginPreset = s.marginPreset as LayoutSettings["marginPreset"];
  if (typeof s.dropCap === "boolean") out.dropCap = s.dropCap;
  if (typeof s.headerText === "string") out.headerText = s.headerText.slice(0, 120);
  if (typeof s.footerText === "string") out.footerText = s.footerText.slice(0, 120);
  if (typeof s.runningHeader === "boolean") out.runningHeader = s.runningHeader;
  if (s.bleedMm !== undefined) out.bleedMm = clampPrintMm(s.bleedMm, PRINT_LIMITS.maxBleedMm);
  if (s.gutterMm !== undefined) out.gutterMm = clampPrintMm(s.gutterMm, PRINT_LIMITS.maxGutterMm);
  return out;
}

/** Ao aplicar, campos que o tema não define voltam ao padrão (senão sobrariam restos do tema anterior). */
export function applyLayout(theme: LayoutTheme): Required<Pick<LayoutSettings, "runningHeader" | "bleedMm" | "gutterMm">> & LayoutSettings {
  return { ...theme.settings, customTrim: theme.settings.customTrim, runningHeader: theme.settings.runningHeader ?? false, bleedMm: theme.settings.bleedMm ?? 0, gutterMm: theme.settings.gutterMm ?? 0 };
}

export function sanitizeThemes(raw: unknown): LayoutTheme[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const themes: LayoutTheme[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { id, name, savedAt, settings } = item as Record<string, unknown>;
    if (typeof id !== "string" || !id || seen.has(id) || typeof name !== "string") continue;
    const clean = name.trim().slice(0, THEME_NAME_MAX);
    if (!clean) continue;
    seen.add(id);
    themes.push({ id, name: clean, savedAt: Number.isFinite(savedAt) ? Number(savedAt) : 0, settings: pickLayout(settings as Record<string, unknown>) });
    if (themes.length >= THEME_LIMIT) break;
  }
  return themes;
}

type Store = Pick<Storage, "getItem" | "setItem">;
const defaultStore = (): Store | null => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };

export function loadThemes(store: Store | null = defaultStore()): LayoutTheme[] {
  try { return store ? sanitizeThemes(JSON.parse(store.getItem(KEY) ?? "[]")) : []; } catch { return []; }
}

export type SaveResult = { ok: true; themes: LayoutTheme[] } | { ok: false; reason: "name" | "limit" | "storage"; themes: LayoutTheme[] };

/** Salva (ou substitui, se o nome já existe) um tema com os ajustes atuais. */
export function saveTheme(name: string, current: Record<string, unknown>, store: Store | null = defaultStore(), now = Date.now()): SaveResult {
  const themes = loadThemes(store);
  const clean = name.trim().slice(0, THEME_NAME_MAX);
  if (!clean) return { ok: false, reason: "name", themes };
  const existing = themes.find(theme => theme.name.toLocaleLowerCase("pt-BR") === clean.toLocaleLowerCase("pt-BR"));
  if (!existing && themes.length >= THEME_LIMIT) return { ok: false, reason: "limit", themes };
  const entry: LayoutTheme = { id: existing?.id ?? `t${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: clean, savedAt: now, settings: pickLayout(current) };
  const next = existing ? themes.map(theme => (theme.id === existing.id ? entry : theme)) : [...themes, entry];
  return write(next, store);
}

export function deleteTheme(id: string, store: Store | null = defaultStore()): SaveResult {
  return write(loadThemes(store).filter(theme => theme.id !== id), store);
}

function write(themes: LayoutTheme[], store: Store | null): SaveResult {
  try {
    if (!store) throw new Error("sem armazenamento");
    store.setItem(KEY, JSON.stringify(themes));
    // confere a leitura: gravar sem poder reler não conta como salvo
    if (loadThemes(store).length !== themes.length) throw new Error("verificação falhou");
    return { ok: true, themes };
  } catch {
    return { ok: false, reason: "storage", themes: loadThemes(store) };
  }
}
