import React, { useEffect, useMemo, useRef, useState } from "react";
import { AudioReader } from "./AudioReader";
import { browserLanguage, languageByCode, TRANSLATE_LANGUAGES, translateChapter } from "@/lib/translate";
import { buildPrintHtml, TYPOGRAPHY_PRESETS, type ExportBook, type TypographyPreset } from "@shared/book-export";

type Scope = "chapter" | "book";
type Theme = "day" | "night";
type Prefs = { theme: Theme; size: number; typography: TypographyPreset | "book" };

const STORAGE_KEY = "shakstory:preview-prefs";
const MIN_SIZE = 13;
const MAX_SIZE = 30;
const DEFAULTS: Prefs = { theme: "day", size: 19, typography: "book" };

const loadPrefs = (): Prefs => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!raw || typeof raw !== "object") return DEFAULTS;
    return {
      theme: raw.theme === "night" ? "night" : "day",
      size: typeof raw.size === "number" ? Math.min(MAX_SIZE, Math.max(MIN_SIZE, raw.size)) : DEFAULTS.size,
      typography: raw.typography === "book" || raw.typography in TYPOGRAPHY_PRESETS ? raw.typography : "book",
    };
  } catch {
    return DEFAULTS;
  }
};
const savePrefs = (prefs: Prefs) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* preferências são só conveniência */
  }
};

const readerCss = (prefs: Prefs, scope: Scope, activeIndex: number) => {
  const night = prefs.theme === "night";
  const page = night ? "#1b1a17" : "#ffffff";
  const ink = night ? "#e6e1d6" : "#222222";
  const desk = night ? "#0f0e0c" : "#f2f0ec";
  const only = scope === "chapter"
    ? `.cover,.cover-placeholder,.frontmatter,.toc,.front-matter,.back-matter,.chapter{display:none!important}#chapter-${activeIndex + 1}{display:block!important;min-height:0!important}`
    : "";
  return `html body{font-size:${prefs.size}px!important;background:${desk}!important;color:${ink}!important;max-width:760px!important;margin:0 auto!important;padding:20px 12px 80px!important}` +
    `.chapter,.front-matter,.back-matter,.frontmatter,.toc{background:${page}!important;color:${ink}!important;box-shadow:none!important;padding:36px 28px!important;margin:16px 0!important;border:1px solid ${night ? "#2a2823" : "#e7e3db"}}` +
    `.toc a,h1,h2,p{color:${ink}!important}header,footer{display:none!important}${only}`;
};

const LANG_KEY = "shakstory:reader-language";
const loadLanguage = (): { mode: "auto" | "manual"; code: string } => {
  try { const raw = JSON.parse(localStorage.getItem(LANG_KEY) ?? "null"); if (raw?.mode === "manual" && typeof raw.code === "string") return { mode: "manual", code: raw.code }; } catch { /* conveniência */ }
  return { mode: "auto", code: "original" };
};

export function BookReader({ book: sourceBook, activeId, onClose, closeLabel = "Fechar pré-visualização", extra }: { book: ExportBook; activeId: string | null; onClose?: () => void; closeLabel?: string; extra?: React.ReactNode }) {
  const [language, setLanguage] = useState(loadLanguage);
  const [langOpen, setLangOpen] = useState(false);
  const [translated, setTranslated] = useState<Record<string, ExportBook["chapters"][number]>>({});
  const [translateError, setTranslateError] = useState("");
  const [translating, setTranslating] = useState(false);
  // "Automático" segue o idioma do navegador (português = texto original), como no painel do blog.
  const target = language.mode === "auto" ? browserLanguage() : language.code;
  const targetInfo = target === "original" ? undefined : languageByCode(target);
  const activeTarget = targetInfo ? target : "original";
  const book = useMemo<ExportBook>(() => activeTarget === "original" ? sourceBook : { ...sourceBook, language: targetInfo?.label ?? sourceBook.language, chapters: sourceBook.chapters.map(chapter => translated[`${activeTarget}|${chapter.id}`] ?? chapter) }, [sourceBook, translated, activeTarget, targetInfo]);
  const chapters = book.chapters;
  const startIndex = Math.max(0, chapters.findIndex(chapter => chapter.id === activeId));
  const [index, setIndex] = useState(startIndex);
  const [scope, setScope] = useState<Scope>("chapter");
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [navOpen, setNavOpen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const chooseLanguage = (mode: "auto" | "manual", code: string) => {
    const next = { mode, code };
    setLanguage(next); setLangOpen(false); setTranslateError("");
    try { localStorage.setItem(LANG_KEY, JSON.stringify(next)); } catch { /* conveniência */ }
  };
  useEffect(() => {
    if (activeTarget === "original") { setTranslating(false); return; }
    const wanted = (scope === "book" ? sourceBook.chapters.map((_, i) => i).sort((a, b) => Math.abs(a - index) - Math.abs(b - index)) : [index])
      .map(i => sourceBook.chapters[i]).filter(chapter => chapter && !translated[`${activeTarget}|${chapter.id}`]);
    if (!wanted.length) { setTranslating(false); return; }
    const controller = new AbortController();
    setTranslating(true); setTranslateError("");
    (async () => {
      try {
        for (const chapter of wanted) {
          const done = await translateChapter(chapter, activeTarget, { signal: controller.signal });
          setTranslated(current => ({ ...current, [`${activeTarget}|${chapter.id}`]: done }));
        }
        setTranslating(false);
      } catch (error) {
        if ((error as { name?: string })?.name === "AbortError") return;
        setTranslating(false);
        setTranslateError("Não foi possível traduzir agora. Mostrando o texto original; tente de novo em instantes.");
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTarget, scope, index, sourceBook]);
  const update = (patch: Partial<Prefs>) => setPrefs(current => { const next = { ...current, ...patch }; savePrefs(next); return next; });

  useEffect(() => {
    if (!onClose) return;
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const html = useMemo(() => {
    const typography = prefs.typography === "book" ? book.typography : prefs.typography;
    const base = buildPrintHtml({ ...book, typography });
    return base.replace("</head>", `<style id="reader">${readerCss(prefs, scope, index)}</style></head>`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, prefs, scope, scope === "chapter" ? index : 0]);

  const scrollToChapter = (target: number) => {
    const doc = frame.current?.contentDocument;
    doc?.getElementById(`chapter-${target + 1}`)?.scrollIntoView({ block: "start" });
  };
  const scrollTop = () => { frame.current?.contentWindow?.scrollTo({ top: 0 }); };

  const onLoad = () => {
    const win = frame.current?.contentWindow;
    const doc = frame.current?.contentDocument;
    if (!win || !doc) return;
    if (scope === "book") scrollToChapter(index); else scrollTop();
    win.addEventListener("scroll", () => {
      if (scope !== "book") return;
      let current = 0;
      chapters.forEach((_, i) => {
        const el = doc.getElementById(`chapter-${i + 1}`);
        if (el && el.getBoundingClientRect().top <= 120) current = i;
      });
      setIndex(previous => (previous === current ? previous : current));
    });
  };

  const choose = (target: number) => {
    setNavOpen(false);
    if (scope === "book") { setIndex(target); scrollToChapter(target); } else setIndex(target);
  };
  const step = (delta: number) => choose(Math.min(chapters.length - 1, Math.max(0, index + delta)));

  const night = prefs.theme === "night";
  const shell = night ? "bg-[#0f0e0c] text-[#e6e1d6]" : "bg-[#f2f0ec] text-[#222]";
  const panel = night ? "bg-[#17160f] border-[#2a2823]" : "bg-white border-[#e0dcd2]";
  const btn = `inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2.5 text-sm ${night ? "border-[#34312a] hover:bg-[#24221d]" : "border-[#d8d3c8] hover:bg-[#ebe8e0]"}`;
  const active = night ? "bg-[#2c2a24]" : "bg-[#e9e5da]";

  return (
    <div role="main" aria-label="Pré-visualização do livro" className={`fixed inset-0 z-[70] flex flex-col ${shell}`}>
      <div className={`flex flex-wrap items-center gap-2 border-b px-3 py-2 ${panel}`}>
        <button type="button" className={`${btn} lg:hidden`} aria-expanded={navOpen} onClick={() => setNavOpen(open => !open)}>Capítulos</button>
        <strong className="mr-auto min-w-0 truncate text-sm">Pré-visualização · {book.title}</strong>
        <div role="group" aria-label="Escopo da leitura" className="flex gap-1">
          <button type="button" className={`${btn} ${scope === "chapter" ? active : ""}`} aria-pressed={scope === "chapter"} onClick={() => setScope("chapter")}>Capítulo atual</button>
          <button type="button" className={`${btn} ${scope === "book" ? active : ""}`} aria-pressed={scope === "book"} onClick={() => setScope("book")}>Livro todo</button>
        </div>
        <div role="group" aria-label="Tamanho da fonte" className="flex gap-1">
          <button type="button" className={btn} aria-label="Diminuir fonte" disabled={prefs.size <= MIN_SIZE} onClick={() => update({ size: Math.max(MIN_SIZE, prefs.size - 1) })}>A−</button>
          <button type="button" className={btn} aria-label="Aumentar fonte" disabled={prefs.size >= MAX_SIZE} onClick={() => update({ size: Math.min(MAX_SIZE, prefs.size + 1) })}>A+</button>
        </div>
        <select aria-label="Estilo de tipografia" className={`${btn} max-w-[9.5rem]`} value={prefs.typography} onChange={event => update({ typography: event.target.value as Prefs["typography"] })}>
          <option value="book">Estilo do livro</option>
          {(Object.keys(TYPOGRAPHY_PRESETS) as TypographyPreset[]).map(key => <option key={key} value={key}>{TYPOGRAPHY_PRESETS[key].label}</option>)}
        </select>
        <button type="button" className={btn} aria-pressed={night} onClick={() => update({ theme: night ? "day" : "night" })}>{night ? "Modo dia" : "Modo noite"}</button>
        <div className="relative">
          <button type="button" className={`${btn} ${activeTarget !== "original" ? active : ""}`} aria-haspopup="dialog" aria-expanded={langOpen} aria-label="Traduzir" onClick={() => setLangOpen(open => !open)}>🌐 {targetInfo ? targetInfo.label : "Traduzir"}</button>
          {langOpen && (
            <div role="dialog" aria-label="Tradutor" className={`fixed inset-x-3 top-[max(5rem,env(safe-area-inset-top))] z-[90] flex max-h-[min(70dvh,32rem)] w-auto min-w-0 flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-lg border p-3 shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-1 sm:w-64 ${panel}`}>
              <h3 className="mb-1 text-sm font-semibold">Traduzir</h3>
              <p className="mb-1 text-xs opacity-70">Selecione o idioma</p>
              <button type="button" aria-pressed={language.mode === "auto"} className={`${btn} justify-start ${language.mode === "auto" ? active : ""}`} onClick={() => chooseLanguage("auto", "original")}>🌐 Automático</button>
              <button type="button" aria-pressed={language.mode === "manual" && language.code === "original"} className={`${btn} justify-start ${language.mode === "manual" && language.code === "original" ? active : ""}`} onClick={() => chooseLanguage("manual", "original")}>🇧🇷 Original</button>
              {TRANSLATE_LANGUAGES.map(item => <button key={item.code} type="button" aria-pressed={language.mode === "manual" && language.code === item.code} className={`${btn} justify-start ${language.mode === "manual" && language.code === item.code ? active : ""}`} onClick={() => chooseLanguage("manual", item.code)}>{item.flag} {item.label}</button>)}
              <p className="mt-2 text-[11px] leading-4 opacity-70">Tradução automática pelo Google Tradutor: o texto lido é enviado ao Google. Pode conter imprecisões e não mantém a formatação.</p>
            </div>
          )}
        </div>
        <button type="button" className={`${btn} ${audioOpen ? active : ""}`} aria-pressed={audioOpen} onClick={() => setAudioOpen(open => !open)}>🔊 Ouvir</button>
        {extra}
        {onClose && <button type="button" className={btn} aria-label={closeLabel} onClick={onClose}>✕</button>}
      </div>
      <div className="relative flex min-h-0 flex-1">
        {navOpen && <button type="button" aria-label="Fechar capítulos" className="absolute inset-0 z-10 bg-black/45 lg:hidden" onClick={() => setNavOpen(false)} />}
        <nav aria-label="Capítulos da pré-visualização" className={`${navOpen ? "absolute inset-y-0 left-0 z-20 flex w-[min(86vw,20rem)]" : "hidden lg:flex"} w-72 shrink-0 flex-col overflow-y-auto border-r p-3 ${panel}`}>
          <p className="mb-2 px-2 text-[10px] uppercase tracking-[0.14em] opacity-60">Sumário</p>
          {chapters.length === 0 && <p className="px-2 text-sm opacity-70">Nenhum capítulo ainda.</p>}
          {chapters.map((chapter, i) => chapter.kind === "part"
            ? <p key={chapter.id} className="mt-3 px-2 text-xs font-semibold uppercase tracking-wide opacity-70">{chapter.title}</p>
            : <button key={chapter.id} type="button" aria-current={i === index ? "true" : undefined} className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${i === index ? `${active} font-medium` : "opacity-80 hover:opacity-100"}`} onClick={() => choose(i)}>{chapter.title}</button>)}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          {(translating || translateError) && <div role="status" aria-live="polite" className={`border-t px-3 py-1.5 text-xs ${panel}`}>{translateError || `Traduzindo para ${targetInfo?.label ?? ""}…`}</div>}
          {audioOpen && <AudioReader lang={targetInfo?.speech ?? "pt-BR"} chapters={chapters} index={index} scope={scope} onChapterChange={choose} btnClass={btn} panelClass={panel} onClose={() => setAudioOpen(false)} />}
          <iframe ref={frame} key={scope + prefs.typography} title="Livro pré-visualizado" sandbox="allow-same-origin" srcDoc={html} onLoad={onLoad} className="min-h-0 w-full flex-1 border-0" />
          {scope === "chapter" && chapters.length > 1 && (
            <div className={`flex items-center justify-between border-t px-3 py-2 ${panel}`}>
              <button type="button" className={btn} disabled={index <= 0} onClick={() => step(-1)}>‹ Anterior</button>
              <span className="text-xs opacity-70">{index + 1} / {chapters.length}</span>
              <button type="button" className={btn} disabled={index >= chapters.length - 1} onClick={() => step(1)}>Próximo ›</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
