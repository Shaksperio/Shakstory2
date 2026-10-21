import { describe, expect, it } from "vitest";
import { EXPECTED_WORKER_VERSION, workerStatus, type PlanInfo } from "./plans";

const base: PlanInfo = { owner: true, plan: "owner", label: "Administrador", features: { export: true, cowila: true, share: true } };

describe("versão do Worker em produção", () => {
  it("sem resposta do servidor (padrão offline) não acusa atraso", () => {
    expect(workerStatus(base)).toBe("unknown");
  });
  it("servidor antigo, sem versão, é desatualizado", () => {
    expect(workerStatus({ ...base, serverChecked: true })).toBe("outdated");
  });
  it("versão diferente é desatualizada e a esperada está em dia", () => {
    expect(workerStatus({ ...base, serverChecked: true, workerVersion: "1999-01-01.0" })).toBe("outdated");
    expect(workerStatus({ ...base, serverChecked: true, workerVersion: EXPECTED_WORKER_VERSION })).toBe("ok");
  });
});
