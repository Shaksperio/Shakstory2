import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { placeBalloon, type Box } from "./geometry";
import { TUTORIAL_STEPS, findTarget, stepsFor, type TutorialView } from "./script";
import { INITIAL_TUTORIAL, readTutorial, writeTutorial, type TutorialState } from "./state";

export const WELCOME_TEXT = "Olá! Eu sou o Cowila, seu guia no Shakstory. Vou mostrar como organizar seus livros, escrever suas histórias e usar as ferramentas do aplicativo. Vamos começar?";

export type CowilaTutorialProps = {
  userKey: string;
  ready: boolean;
  hasBook: boolean;
  hasBooks: boolean;
  view: string;
  go: (view: TutorialView) => boolean;
  menuOpen: boolean;
  onMenuClose: () => void;
};

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function CowilaTutorial({ userKey, ready, hasBook, hasBooks, view, go, menuOpen, onMenuClose }: CowilaTutorialProps) {
  const [state, setState] = useState<TutorialState>(INITIAL_TUTORIAL);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "invite" | "running">("idle");
  const [stepId, setStepId] = useState<string | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [rect, setRect] = useState<Box | null>(null);
  const [size, setSize] = useState({ width: 360, height: 280 });
  const [viewport, setViewport] = useState({ width: typeof window === "undefined" ? 1024 : window.innerWidth, height: typeof window === "undefined" ? 768 : window.innerHeight });
  const balloonRef = useRef<HTMLDivElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const openedDetails = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => { setState(readTutorial(userKey)); setLoadedFor(userKey); setPhase("idle"); }, [userKey]);

  const save = useCallback((next: TutorialState) => { setState(next); writeTutorial(userKey, next); }, [userKey]);

  // Convite de primeiro acesso: só depois do login e de a biblioteca carregar.
  useEffect(() => {
    if (ready && loadedFor === userKey && phase === "idle" && state.status === "not_started") setPhase("invite");
  }, [ready, loadedFor, userKey, phase, state.status]);

  const steps = useMemo(() => stepsFor({ hasBook, hasBooks }), [hasBook, hasBooks]);
  const index = useMemo(() => {
    if (!steps.length) return -1;
    const exact = steps.findIndex(item => item.id === stepId);
    if (exact >= 0) return exact;
    const order = TUTORIAL_STEPS.findIndex(item => item.id === stepId);
    if (order >= 0) { const next = steps.findIndex(item => TUTORIAL_STEPS.findIndex(all => all.id === item.id) > order); if (next >= 0) return next; }
    return 0;
  }, [steps, stepId]);
  const step = phase === "running" && index >= 0 ? steps[index] : null;

  const begin = (fromId: string | null) => {
    returnFocus.current = (document.activeElement as HTMLElement | null) ?? null;
    const first = fromId && TUTORIAL_STEPS.some(item => item.id === fromId) ? fromId : stepsFor({ hasBook, hasBooks })[0]?.id ?? null;
    setStepId(first);
    setPhase("running");
    save({ status: "in_progress", stepId: first, updatedAt: Date.now() });
  };

  const leave = useCallback((next?: Partial<TutorialState>) => {
    setPhase("idle"); setTarget(null); setRect(null);
    if (openedDetails.current) { openedDetails.current.open = false; openedDetails.current = null; }
    save({ status: "in_progress", stepId, updatedAt: Date.now(), ...next });
    window.setTimeout(() => { try { returnFocus.current?.focus?.(); } catch { /* foco opcional */ } }, 0);
  }, [save, stepId]);

  const goTo = (nextIndex: number) => {
    const next = steps[nextIndex];
    if (!next) return;
    setStepId(next.id);
    save({ status: "in_progress", stepId: next.id, updatedAt: Date.now() });
  };
  const finish = () => leave({ status: "completed", stepId: null });

  // Prepara a etapa: troca de tela (sem criar nada), abre seções só para exibir e procura o elemento.
  useEffect(() => {
    if (!step) return;
    let cancelled = false;
    if (openedDetails.current) { openedDetails.current.open = false; openedDetails.current = null; }
    setTarget(null); setRect(null);
    if (step.view && step.view !== view) go(step.view);
    let tries = 0;
    const attempt = () => {
      if (cancelled) return;
      if (step.openDetails && !openedDetails.current) {
        const summary = Array.from(document.querySelectorAll("details > summary")).find(node => node.textContent?.includes(step.openDetails!));
        const details = summary?.parentElement as HTMLDetailsElement | null | undefined;
        if (details && !details.open) { details.open = true; openedDetails.current = details; }
      }
      const found = findTarget(step.targets);
      if (found) {
        setTarget(found);
        const mobile = window.innerWidth < 640;
        found.scrollIntoView?.({ block: mobile ? "start" : "center", inline: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
        if (mobile) window.setTimeout(() => window.scrollBy?.({ top: -88, behavior: "auto" }), reducedMotion() ? 0 : 350);
        return;
      }
      if (++tries < 15) window.setTimeout(attempt, 100);
    };
    attempt();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id, view, phase]);

  // Acompanha o alvo durante rolagem e redimensionamento.
  useLayoutEffect(() => {
    if (phase !== "running") return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      if (target && target.isConnected) { const r = target.getBoundingClientRect(); setRect({ top: r.top, left: r.left, width: r.width, height: r.height }); } else setRect(null);
      const b = balloonRef.current?.getBoundingClientRect();
      if (b) setSize(old => (Math.abs(old.width - b.width) > 1 || Math.abs(old.height - b.height) > 1 ? { width: b.width, height: b.height } : old));
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    measure();
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    const timer = window.setInterval(schedule, 300);
    return () => { window.removeEventListener("scroll", schedule, true); window.removeEventListener("resize", schedule); window.clearInterval(timer); if (frame) window.cancelAnimationFrame(frame); };
  }, [phase, target, step?.id]);

  // Foco no balão ao trocar de etapa.
  useEffect(() => { if (step) balloonRef.current?.focus({ preventScroll: true }); }, [step?.id]);

  // Teclado: Esc sai, setas navegam, Tab fica dentro do balão.
  useEffect(() => {
    if (phase === "idle" && !menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation();
        if (phase === "running") leave();
        else if (phase === "invite") { setPhase("idle"); save({ status: "postponed", stepId: null, updatedAt: Date.now() }); }
        else onMenuClose();
        return;
      }
      if (phase === "running") {
        if (event.key === "ArrowRight" && index < steps.length - 1) { event.preventDefault(); goTo(index + 1); }
        if (event.key === "ArrowLeft" && index > 0) { event.preventDefault(); goTo(index - 1); }
      }
      if (event.key === "Tab") {
        const root = document.querySelector<HTMLElement>("[data-cowila-tour-dialog]");
        const items = root ? Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
        if (!root || !items.length) return;
        const active = document.activeElement as HTMLElement | null;
        if (!root.contains(active)) { event.preventDefault(); items[0].focus(); return; }
        if (event.shiftKey && (active === items[0] || active === root)) { event.preventDefault(); items[items.length - 1].focus(); }
        else if (!event.shiftKey && active === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [phase, menuOpen, index, steps.length, leave, onMenuClose, save]);

  if (typeof document === "undefined") return null;
  const motion = reducedMotion() ? "none" : "top 160ms ease, left 160ms ease, width 160ms ease, height 160ms ease";
  const portal = (node: React.ReactNode) => createPortal(node, document.body);

  if (phase === "invite") {
    return portal(
      <div className="cowila-tour-layer" data-cowila-tour-layer>
        <div className="cowila-tour-dim" />
        <div data-cowila-tour-dialog role="dialog" aria-modal="true" aria-labelledby="cowila-invite-title" aria-describedby="cowila-invite-text" tabIndex={-1} className="cowila-tour-card cowila-tour-center">
          <div className="flex items-center gap-3"><span className="cowila-tour-avatar" aria-hidden="true"><MessageCircle className="h-5 w-5" /></span><h2 id="cowila-invite-title" className="font-serif text-xl">Cowila</h2></div>
          <p id="cowila-invite-text" className="mt-3 text-sm leading-6">{WELCOME_TEXT}</p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => { setPhase("idle"); save({ status: "postponed", stepId: null, updatedAt: Date.now() }); }}>Agora não</Button>
            <Button autoFocus onClick={() => begin(null)}>Começar tutorial</Button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "running" && step) {
    const placement = placeBalloon(rect, viewport, size);
    const pad = 6;
    const last = index === steps.length - 1;
    const skipped = TUTORIAL_STEPS.length - steps.length;
    const balloonStyle: React.CSSProperties = placement.mode === "dock" ? {} : { top: placement.top, left: placement.left };
    return portal(
      <div className="cowila-tour-layer" data-cowila-tour-layer>
        <div className="cowila-tour-block" aria-hidden="true" style={rect ? undefined : { background: "rgba(8,16,24,.6)" }} />
        {rect && <div className="cowila-tour-spot" aria-hidden="true" data-testid="tour-spot" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, transition: motion }} />}
        <div ref={balloonRef} data-cowila-tour-dialog role="dialog" aria-modal="true" aria-labelledby="cowila-step-title" aria-describedby="cowila-step-body" tabIndex={-1} style={balloonStyle} className={"cowila-tour-card " + (placement.mode === "dock" ? "cowila-tour-dock" : placement.mode === "center" ? "cowila-tour-fixed" : "cowila-tour-fixed")}>
          <div className="flex items-center gap-3">
            <span className="cowila-tour-avatar" aria-hidden="true"><MessageCircle className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{step.module} · <span data-testid="tour-progress">Etapa {index + 1} de {steps.length}</span></p>
              <h2 id="cowila-step-title" className="font-serif text-lg leading-tight">{step.title}</h2>
            </div>
          </div>
          <div className="cowila-tour-bar" aria-hidden="true"><span style={{ width: `${Math.round(((index + 1) / steps.length) * 100)}%` }} /></div>
          <div id="cowila-step-body" aria-live="polite" className="cowila-tour-body mt-3 space-y-2 text-[13px] leading-5">
            <p><strong>Para que serve:</strong> {step.what}</p>
            <p><strong>Como usar:</strong> {step.how}</p>
            {step.example && <p><strong>Exemplo:</strong> {step.example}</p>}
            {!target && <p className="rounded-md bg-secondary/70 p-2 text-xs">{step.fallback ?? "Esta opção não aparece nesta tela agora, mas continua disponível no Shakstory."}</p>}
            {last && skipped > 0 && <p className="rounded-md bg-secondary/70 p-2 text-xs">Algumas telas ficaram de fora porque não há um livro aberto. Abra um livro e escolha “Continuar” ou “Reiniciar” em Tutorial com Cowila.</p>}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" disabled={index === 0} onClick={() => goTo(index - 1)}>Anterior</Button>
            {last ? <Button size="sm" onClick={finish}>Concluir tutorial</Button> : <Button size="sm" onClick={() => goTo(index + 1)}>Próximo</Button>}
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => leave()}>Parar e sair do tutorial</Button>
          </div>
        </div>
      </div>
    );
  }

  if (menuOpen) {
    const total = stepsFor({ hasBook, hasBooks }).length;
    const resumeIndex = state.stepId ? Math.max(0, stepsFor({ hasBook, hasBooks }).findIndex(item => item.id === state.stepId)) : 0;
    const canResume = state.status === "in_progress" && !!state.stepId;
    return portal(
      <div className="cowila-tour-layer" data-cowila-tour-layer>
        <div className="cowila-tour-dim" onClick={onMenuClose} />
        <div data-cowila-tour-dialog role="dialog" aria-modal="true" aria-labelledby="cowila-menu-title" tabIndex={-1} className="cowila-tour-card cowila-tour-center">
          <div className="flex items-center gap-3"><span className="cowila-tour-avatar" aria-hidden="true"><MessageCircle className="h-5 w-5" /></span><h2 id="cowila-menu-title" className="font-serif text-xl">Tutorial com Cowila</h2></div>
          <p className="mt-3 text-sm leading-6">{state.status === "completed" ? "Você já concluiu o tutorial. Quer rever do começo?" : canResume ? `Você parou na etapa ${resumeIndex + 1} de ${total}.` : "Um passeio guiado pelas telas e ferramentas do Shakstory, no seu ritmo."}</p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={onMenuClose}>Fechar</Button>
            {canResume && <Button variant="outline" onClick={() => { onMenuClose(); begin(state.stepId); }}>Continuar de onde parou</Button>}
            <Button autoFocus onClick={() => { onMenuClose(); begin(null); }}>{canResume || state.status === "completed" ? "Reiniciar" : "Começar tutorial"}</Button>
          </div>
        </div>
      </div>
    );
  }
  return null;
}
