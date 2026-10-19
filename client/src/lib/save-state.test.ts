import { describe, expect, it } from "vitest";
import { resolveLocalOutcome, resolveSaveState, type SaveStateInput } from "./save-state";

const base: SaveStateInput = { localLost: false, conflict: false, pending: false, syncing: false, stalled: false, everSynced: false };
const state = (over: Partial<SaveStateInput>) => resolveSaveState({ ...base, ...over });

describe("estados de salvamento", () => {
  it("diferencia salvo neste aparelho, sincronização pendente e concluída", () => {
    expect(state({ pending: true, stalled: true }).state).toBe("local");
    expect(state({ pending: true }).state).toBe("pending");
    expect(state({ syncing: true, pending: true }).label).toBe("Sincronizando…");
    expect(state({ everSynced: true }).state).toBe("synced");
    expect(state({}).state).toBe("idle");
  });

  it("nunca afirma sincronização concluída com alteração pendente, offline ou em conflito", () => {
    for (const over of [{ pending: true }, { pending: true, stalled: true }, { syncing: true }, { conflict: true }, { localLost: true }]) {
      expect(state({ ...over, everSynced: true }).state).not.toBe("synced");
    }
  });

  it("falha de gravação local vence qualquer outro estado e não confirma nada", () => {
    const view = state({ localLost: true, everSynced: true, pending: true });
    expect(view.state).toBe("unsaved");
    expect(view.detail).toMatch(/backup JSON/);
  });

  it("os textos não citam a infraestrutura", () => {
    const all = [{ localLost: true }, { conflict: true }, { pending: true, stalled: true }, { pending: true }, { syncing: true }, { everSynced: true }, {}];
    for (const over of all) {
      const view = state(over);
      expect(`${view.label} ${view.short} ${view.detail}`).not.toMatch(/firebase|cloudflare|d1|firestore|worker/i);
    }
  });
});

describe("gravação local", () => {
  it("só é perda quando nem o armazenamento nem a cópia offline aceitaram", () => {
    expect(resolveLocalOutcome(true, true)).toBe("stored");
    expect(resolveLocalOutcome(true, false)).toBe("stored");
    expect(resolveLocalOutcome(false, true)).toBe("backup-only");
    expect(resolveLocalOutcome(false, false)).toBe("lost");
  });
});
