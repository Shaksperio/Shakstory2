import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

export type AntivirusStatus = "clean" | "infected" | "error" | "timeout" | "pending";

export type AntivirusScanResult = {
  status: AntivirusStatus;
  malwareName?: string;
  sha256?: string;
  detail?: string;
  engine: "kicomav-local";
};

const MAX_SCAN_BYTES = 8 * 1024 * 1024;
const SCAN_TIMEOUT_MS = 20_000;

function normalizeStatus(value: unknown): AntivirusStatus {
  if (value === "clean" || value === "infected" || value === "timeout" || value === "pending") return value;
  return "error";
}

export async function scanWithLocalKicomAV(input: {
  bytes: Buffer;
  filename: string;
  contentType: string;
}): Promise<AntivirusScanResult> {
  if (input.bytes.length === 0) {
    return { status: "error", detail: "Arquivo vazio.", engine: "kicomav-local" };
  }
  if (input.bytes.length > MAX_SCAN_BYTES) {
    return { status: "error", detail: "Arquivo acima do limite de varredura.", engine: "kicomav-local" };
  }

  const request = JSON.stringify({
    id: randomUUID(),
    filename: input.filename,
    contentType: input.contentType,
    base64: input.bytes.toString("base64"),
  });

  try {
    const stdout = await runWorker(request);
    const result = JSON.parse(stdout.trim()) as Record<string, unknown>;
    return {
      status: normalizeStatus(result.status),
      malwareName: typeof result.malwareName === "string" ? result.malwareName : undefined,
      sha256: typeof result.sha256 === "string" ? result.sha256 : undefined,
      detail: typeof result.detail === "string" ? result.detail : undefined,
      engine: "kicomav-local",
    };
  } catch (error) {
    const timedOut = typeof error === "object" && error !== null && "killed" in error && Boolean(error.killed);
    return {
      status: timedOut ? "timeout" : "error",
      detail: timedOut ? "A varredura excedeu o tempo limite." : error instanceof Error ? error.message : "Worker KicomAV indisponível.",
      engine: "kicomav-local",
    };
  }
}

export function runWorker(request: string, timeoutMs = SCAN_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    const pythonBin = process.env.KICOMAV_PYTHON ?? "python3";
    const workerScript = process.env.KICOMAV_WORKER_SCRIPT ?? "scripts/kicomav_worker.py";
    const child = spawn(pythonBin, [workerScript], {
      cwd: process.cwd(),
      env: Object.fromEntries([
        ...["PATH", "PYTHONPATH", "LANG", "LC_ALL", "TMPDIR", "SYSTEMROOT"].flatMap(key => process.env[key] ? [[key, process.env[key]!]] : []),
        ["PYTHONUNBUFFERED", "1"],
      ]),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let failure: Error | undefined;
    const stop = (error: Error) => { failure ??= error; child.kill("SIGKILL"); };
    const timer = setTimeout(() => stop(Object.assign(new Error("A varredura excedeu o tempo limite."), { killed: true })), timeoutMs);
    child.stdout.on("data", chunk => {
      stdout += String(chunk);
      if (stdout.length > 256 * 1024) stop(new Error("Resposta do worker acima do limite."));
    });
    child.stderr.on("data", chunk => {
      stderr += String(chunk);
      if (stderr.length > 32 * 1024) stop(new Error("Diagnóstico do worker acima do limite."));
    });
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.stdin.on("error", error => stop(error));
    child.once("close", code => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `Worker finalizado com código ${code ?? "desconhecido"}.`));
    });
    child.stdin.end(request);
  });
}

export function isSafeToPersist(result: AntivirusScanResult): boolean {
  return result.status === "clean";
}
