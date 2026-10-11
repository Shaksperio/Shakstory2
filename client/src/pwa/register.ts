// Registro do service worker e estado de instalação/atualização do PWA.
type Listener = () => void;

export type PwaState = { updateReady: boolean; installable: boolean; installed: boolean };

let state: PwaState = { updateReady: false, installable: false, installed: false };
const listeners = new Set<Listener>();
let waiting: ServiceWorker | null = null;
let deferredPrompt: (Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | null = null;
let started = false;

const publish = (patch: Partial<PwaState>) => {
  state = { ...state, ...patch };
  listeners.forEach(listener => listener());
};

export const subscribePwa = (listener: Listener) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const getPwaState = () => state;

export function applyUpdate() {
  if (!waiting) return;
  waiting.postMessage({ type: "SKIP_WAITING" });
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  const prompt = deferredPrompt;
  deferredPrompt = null;
  publish({ installable: false });
  await prompt.prompt();
  const choice = await prompt.userChoice.catch(() => ({ outcome: "dismissed" }));
  return choice.outcome === "accepted";
}

const trackWaiting = (registration: ServiceWorkerRegistration) => {
  const markIfWaiting = () => {
    if (registration.waiting && navigator.serviceWorker.controller) {
      waiting = registration.waiting;
      publish({ updateReady: true });
    }
  };
  markIfWaiting();
  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => { if (installing.state === "installed") markIfWaiting(); });
  });
};

export function startPwa() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredPrompt = event as typeof deferredPrompt;
    publish({ installable: true });
  });
  window.addEventListener("appinstalled", () => { deferredPrompt = null; publish({ installable: false, installed: true }); });
  if (window.matchMedia?.("(display-mode: standalone)").matches) publish({ installed: true });
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading || !waiting) return;
    reloading = true;
    window.location.reload();
  });
  const register = () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then(registration => {
        trackWaiting(registration);
        document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void registration.update().catch(() => undefined); });
      })
      .catch(() => undefined);
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
