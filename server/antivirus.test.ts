import { describe, expect, it } from "vitest";
import { isSafeToPersist, scanWithLocalKicomAV, type AntivirusScanResult } from "./antivirus";

describe("antivirus gateway", () => {
  it("only permits clean results to reach storage", () => {
    const results: AntivirusScanResult[] = [
      { status: "clean", engine: "kicomav-local" },
      { status: "infected", malwareName: "test-threat", engine: "kicomav-local" },
      { status: "error", engine: "kicomav-local" },
      { status: "timeout", engine: "kicomav-local" },
      { status: "pending", engine: "kicomav-local" },
    ];
    expect(results.map(isSafeToPersist)).toEqual([true, false, false, false, false]);
  });

  it("rejects empty input before starting the worker", async () => {
    const result = await scanWithLocalKicomAV({ bytes: Buffer.alloc(0), filename: "empty.png", contentType: "image/png" });
    expect(result.status).toBe("error");
    expect(result.detail).toContain("vazio");
  });

  it("rejects input above the scanner limit", async () => {
    const result = await scanWithLocalKicomAV({ bytes: Buffer.alloc(8 * 1024 * 1024 + 1), filename: "large.png", contentType: "image/png" });
    expect(result.status).toBe("error");
    expect(result.detail).toContain("limite");
  });

  it.each([
    ["qa-clean.bin", "clean"],
    ["qa-infected.bin", "infected"],
    ["qa-error.bin", "error"],
    ["qa-invalid.json", "error"],
  ])("normalizes controlled worker response for %s", async (filename, expected) => {
    const previousPython = process.env.KICOMAV_PYTHON;
    const previousWorker = process.env.KICOMAV_WORKER_SCRIPT;
    try {
      process.env.KICOMAV_PYTHON = "python3";
      process.env.KICOMAV_WORKER_SCRIPT = "scripts/kicomav_test_worker.py";
      const result = await scanWithLocalKicomAV({ bytes: Buffer.from("qa"), filename, contentType: "application/octet-stream" });
      expect(result.status).toBe(expected);
    } finally {
      if (previousPython === undefined) delete process.env.KICOMAV_PYTHON; else process.env.KICOMAV_PYTHON = previousPython;
      if (previousWorker === undefined) delete process.env.KICOMAV_WORKER_SCRIPT; else process.env.KICOMAV_WORKER_SCRIPT = previousWorker;
    }
  });
});
