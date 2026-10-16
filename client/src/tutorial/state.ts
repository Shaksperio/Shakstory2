// Estado do tutorial guiado da Cowila, guardado por usuário no navegador.
export type TutorialStatus = "not_started" | "postponed" | "in_progress" | "completed";
export type TutorialState = { status: TutorialStatus; stepId: string | null; updatedAt: number };

export const INITIAL_TUTORIAL: TutorialState = { status: "not_started", stepId: null, updatedAt: 0 };
export const tutorialKey = (user: string) => `shakstory:tutorial:v1:${(user || "anon").trim().toLowerCase()}`;

const STATUSES: TutorialStatus[] = ["not_started", "postponed", "in_progress", "completed"];

export function readTutorial(user: string, storage: Pick<Storage, "getItem"> | undefined = typeof localStorage === "undefined" ? undefined : localStorage): TutorialState {
  try {
    const raw = storage?.getItem(tutorialKey(user));
    if (!raw) return INITIAL_TUTORIAL;
    const value = JSON.parse(raw) as Partial<TutorialState>;
    if (!value || !STATUSES.includes(value.status as TutorialStatus)) return INITIAL_TUTORIAL;
    return { status: value.status as TutorialStatus, stepId: typeof value.stepId === "string" ? value.stepId : null, updatedAt: Number(value.updatedAt) || 0 };
  } catch {
    return INITIAL_TUTORIAL;
  }
}

export function writeTutorial(user: string, state: TutorialState, storage: Pick<Storage, "setItem"> | undefined = typeof localStorage === "undefined" ? undefined : localStorage): void {
  try {
    storage?.setItem(tutorialKey(user), JSON.stringify({ ...state, updatedAt: Date.now() }));
  } catch {
    /* sem armazenamento: o tutorial continua funcionando nesta sessão */
  }
}
