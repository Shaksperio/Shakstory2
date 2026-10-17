import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildQueue, speechSupported, voicesForPortuguese, type SpeechChapter, type SpeechChunk } from "@/lib/tts";

type Status = "idle" | "playing" | "paused";
const RATES = [0.75, 0.9, 1, 1.15, 1.3, 1.5, 2];
const KEY = "shakstory:tts-prefs";
const loadPrefs = (): { rate: number; voiceURI: string } => {
  try { const raw = JSON.parse(localStorage.getItem(KEY) ?? "null"); return { rate: RATES.includes(raw?.rate) ? raw.rate : 1, voiceURI: typeof raw?.voiceURI === "string" ? raw.voiceURI : "" }; } catch { return { rate: 1, voiceURI: "" }; }
};

export function AudioReader({ chapters, index, scope, onChapterChange, btnClass, panelClass, onClose }: {
  chapters: SpeechChapter[];
  index: number;
  scope: "chapter" | "book";
  onChapterChange: (index: number) => void;
  btnClass: string;
  panelClass: string;
  onClose: () => void;
}) {
  const supported = speechSupported();
  const [status, setStatus] = useState<Status>("idle");
  const [prefs, setPrefs] = useState(loadPrefs);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [position, setPosition] = useState({ done: 0, total: 0 });
  const queue = useRef<SpeechChunk[]>([]);
  const at = useRef(0);
  const run = useRef(0); // invalida falas antigas quando a leitura é reiniciada
  const spoken = useRef<number | null>(null);
  const onChange = useRef(onChapterChange);
  onChange.current = onChapterChange;
  const settings = useRef(prefs);
  settings.current = prefs;
  const voiceList = useMemo(() => voicesForPortuguese(voices), [voices]);

  useEffect(() => {
    if (!supported) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener?.("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", load);
  }, [supported]);

  const halt = useCallback(() => { run.current++; try { window.speechSynthesis?.cancel(); } catch { /* sem voz */ } }, []);
  useEffect(() => halt, [halt]);

  const speakAt = useCallback((i: number) => {
    const chunk = queue.current[i];
    if (!chunk) { halt(); setStatus("idle"); spoken.current = null; setPosition({ done: 0, total: 0 }); return; }
    at.current = i;
    const mine = ++run.current;
    try { window.speechSynthesis.cancel(); } catch { /* sem voz */ }
    if (spoken.current !== chunk.chapter) { spoken.current = chunk.chapter; onChange.current(chunk.chapter); }
    const utterance = new SpeechSynthesisUtterance(chunk.text);
    const voice = window.speechSynthesis.getVoices().find(item => item.voiceURI === settings.current.voiceURI) ?? voicesForPortuguese(window.speechSynthesis.getVoices())[0];
    utterance.lang = voice?.lang || "pt-BR";
    if (voice) utterance.voice = voice;
    utterance.rate = settings.current.rate;
    utterance.onend = () => { if (run.current === mine) speakAt(i + 1); };
    utterance.onerror = (event: SpeechSynthesisErrorEvent) => { if (run.current === mine && event.error !== "interrupted" && event.error !== "canceled") { halt(); setStatus("idle"); } };
    setPosition({ done: i + 1, total: queue.current.length });
    window.speechSynthesis.speak(utterance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [halt]);

  const start = (from = index) => {
    queue.current = buildQueue(chapters, from, scope);
    spoken.current = from;
    if (!queue.current.length) { setStatus("idle"); return; }
    setStatus("playing");
    speakAt(0);
  };

  // Se o leitor muda de capítulo sozinho (ou por clique), a leitura acompanha.
  useEffect(() => {
    if (status === "idle" || spoken.current === null || spoken.current === index) return;
    start(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Mudar de escopo reinicia a fila a partir do capítulo atual.
  useEffect(() => { if (status !== "idle") start(index); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [scope]);

  const toggle = () => {
    if (status === "idle") return start();
    if (status === "playing") { window.speechSynthesis.pause(); setStatus("paused"); return; }
    window.speechSynthesis.resume(); setStatus("playing");
  };
  const stop = () => { halt(); setStatus("idle"); spoken.current = null; setPosition({ done: 0, total: 0 }); };
  const skip = (delta: number) => {
    const target = Math.min(chapters.length - 1, Math.max(0, (spoken.current ?? index) + delta));
    if (target === (spoken.current ?? index)) return;
    onChapterChange(target);
    start(target);
  };
  const update = (patch: Partial<typeof prefs>) => {
    const next = { ...prefs, ...patch };
    settings.current = next; setPrefs(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* conveniência */ }
    if (status !== "idle") speakAt(at.current);
  };

  if (!supported) {
    return (
      <div role="region" aria-label="Leitor em áudio" className={`flex items-center justify-between gap-2 border-t px-3 py-2 text-sm ${panelClass}`}>
        <span>Este navegador não oferece leitura em voz alta. Tente o Chrome, Edge ou Safari atualizados.</span>
        <button type="button" className={btnClass} onClick={onClose}>Fechar</button>
      </div>
    );
  }
  const current = chapters[spoken.current ?? index];
  return (
    <div role="region" aria-label="Leitor em áudio" className={`flex flex-wrap items-center gap-2 border-t px-3 py-2 ${panelClass}`}>
      <button type="button" className={btnClass} aria-label={status === "playing" ? "Pausar leitura" : status === "paused" ? "Continuar leitura" : "Ouvir"} onClick={toggle}>{status === "playing" ? "❚❚ Pausar" : status === "paused" ? "▶ Continuar" : "▶ Ouvir"}</button>
      <button type="button" className={btnClass} aria-label="Parar leitura" disabled={status === "idle"} onClick={stop}>■ Parar</button>
      <button type="button" className={btnClass} aria-label="Capítulo anterior (áudio)" disabled={(spoken.current ?? index) <= 0} onClick={() => skip(-1)}>⏮</button>
      <button type="button" className={btnClass} aria-label="Próximo capítulo (áudio)" disabled={(spoken.current ?? index) >= chapters.length - 1} onClick={() => skip(1)}>⏭</button>
      <label className="flex items-center gap-1 text-xs">Velocidade
        <select aria-label="Velocidade da leitura" className={`${btnClass} px-1`} value={prefs.rate} onChange={event => update({ rate: Number(event.target.value) })}>{RATES.map(rate => <option key={rate} value={rate}>{rate}×</option>)}</select>
      </label>
      {voiceList.length > 0 && (
        <label className="flex items-center gap-1 text-xs">Voz
          <select aria-label="Voz da leitura" className={`${btnClass} max-w-[10rem] px-1`} value={voiceList.some(voice => voice.voiceURI === prefs.voiceURI) ? prefs.voiceURI : voiceList[0].voiceURI} onChange={event => update({ voiceURI: event.target.value })}>{voiceList.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}</select>
        </label>
      )}
      <span role="status" aria-live="polite" className="min-w-0 flex-1 truncate text-xs opacity-80">
        {status === "idle" ? (scope === "book" ? "Lê do capítulo atual até o fim do livro." : "Lê o capítulo atual.") : `${status === "paused" ? "Em pausa" : "Lendo"}: ${current?.title ?? ""} · trecho ${position.done} de ${position.total}`}
      </span>
      <button type="button" className={btnClass} aria-label="Fechar leitor em áudio" onClick={() => { stop(); onClose(); }}>✕</button>
    </div>
  );
}
